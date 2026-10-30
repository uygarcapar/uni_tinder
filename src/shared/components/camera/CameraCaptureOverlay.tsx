import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import {
  ActivityIndicator,
  AppState,
  Platform,
  StyleSheet,
  Text,
  View,
  useWindowDimensions,
} from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { CameraView, type CameraType } from "expo-camera";
import { Image } from "expo-image";
import * as Haptics from "expo-haptics";
import { setStatusBarStyle } from "expo-status-bar";
import { useTranslation } from "react-i18next";

import AnimatedPressable from "@/shared/components/AnimatedPressable";
import MediaChromeIconButton from "@/shared/components/MediaChromeIconButton";
import type { SFSymbol } from "@/shared/components/SFIcon";
import { RefreshCw, X, Zap } from "@/shared/icons";
import { colors, isLight, onMediaAt } from "@/shared/theme/colors";
import { devLog } from "@/shared/utils/devLog";
import { frameWindow } from "@/shared/components/cropper/cropGeometry";
import { forgetPhoto } from "@/shared/utils/photoStore";
import {
  bindCamera,
  type CameraOutcome,
  type CameraRequest,
  type CameraShot,
} from "./cameraBridge";

/**
 * Uygulama içi kamera ekranı — profil fotoğrafını UYGULAMADAN çekmek.
 *
 * ══════════════════════════════════════════════════════════════════════════
 * NEDEN VAR: SİSTEM KAMERASI İKİNCİ BİR ONAY EKRANI GETİRİYORDU.
 * ══════════════════════════════════════════════════════════════════════════
 * Eski yol `ImagePicker.launchCameraAsync` idi, yani UIImagePickerController:
 * deklanşörden sonra kendi "Tekrar Çek / Fotoğrafı Kullan" ekranını açıyor.
 * Kullanıcı orada onaylıyor, hemen ardından BİZİM kırpma ekranı açılıyor ve
 * orada bir daha onaylıyordu — tek bir fotoğraf için iki onay. Üstelik o
 * ekranın kadrajı 3:4 pencereyle ilgisizdi; "kullan" dediği kare ile kırpıcıda
 * gördüğü kare aynı şey değildi.
 *
 * Buradaki akış: deklanşör → KARE DOĞRUDAN KIRPICIYA. Tek onay, kırpıcının
 * "Kaydet"i; kırpıcıdaki ✕ ise buraya GERİ döner (yeniden çek, bkz.
 * photoPicker.captureAndCropPhoto).
 *
 * ÖNİZLEME KIRPICININ PENCERESİNDE: kadraj `frameWindow` ile kırpma ekranıyla
 * birebir aynı 3:4 kutu. Bu kutuda görünen şeyin çekilen karenin TAMAMI olması
 * bir varsayım DEĞİL, aşağıda `pictureSize`/`ratio` ile dayatılan bir ayar —
 * expo-camera'nın varsayılanı 16:9 ve o hâliyle önizleme karenin ortasını
 * yakınlaştırıp gösteriyordu (gerekçe prop'un başında). Oran sabitlendiği için
 * çekimden kırpmaya geçişte kadraj kıpırdamıyor ve kırpıcı "hiçbir şey
 * atmadan" başlıyor.
 *
 * ⚠️ AYNALAMA SELFIE EKRANININ TERSİ: `mirror={facing === "front"}`. Ön
 * kamerada canlı görüntü sistem tarafından aynalı (kullanıcı kendini aynadaki
 * gibi görüyor); dosya ham kalırsa profil fotoğrafı, çekerken gördüğü şeyin
 * TERSİ oluyor. Burada ürün kararı "gördüğünü kaydet" olduğu için dosya da
 * aynalanıyor. Selfie DOĞRULAMASI (SelfieCameraStep) bunun tam tersini yapıyor
 * — orada kare AWS'ye gidiyor ve ham gitmek zorunda; iki ekranı karıştırma.
 *
 * NEREYE MOUNT EDİLİR: CropperOverlay'in yanı, `BottomSheetModalProvider`'ın
 * DIŞI (bkz. App.tsx). Aynı gerekçe: portal host'u children'dan sonra render
 * ediliyor, içeride kalsa profil düzenleme modalının ALTINDA açılırdı.
 *
 * Boştayken `null` döner: aktif değilken ağaçta hiçbir düğüm yok, yani kamera
 * donanımı da tutulmuyor.
 */

const ASPECT_W = 3;
const ASPECT_H = 4;

/** Deklanşör çapı — iOS kamerasının dolu beyaz düğmesiyle aynı ölçek. */
const SHUTTER = 72;
const SHUTTER_RING = 3;

/** JPEG kalitesi: kırpıcı çıktıyı 900×1200'e indirip 0.85 ile yeniden
 *  kodluyor, buradaki tek iş ara dosyada nesil kaybı bırakmamak. */
const QUALITY = 0.9;

type Session = {
  settle: (outcome: CameraOutcome) => void;
  /** Oturumun isteği — yerinde onay bu bloktan okunuyor (bkz. `commit`). */
  request: CameraRequest;
};

/**
 * Flaş sırası: kapalı → otomatik → açık.
 *
 * expo-camera'nın `FlashMode`'u bir de `screen` taşıyor (ekranı flaş olarak
 * kullanan Retina Flash yolu) — BURAYA ALINMADI: ön kamera düğmesi gizli,
 * arka kamerada ise gerçek flaş varken ekranı yakmanın anlamı yok.
 */
type FlashChoice = "off" | "auto" | "on";
const FLASH_ORDER: FlashChoice[] = ["off", "auto", "on"];

const FLASH_SYMBOL: Record<FlashChoice, SFSymbol> = {
  off: "bolt.slash.fill",
  auto: "bolt.badge.automatic.fill",
  on: "bolt.fill",
};

export default function CameraCaptureOverlay() {
  const { t } = useTranslation();
  const insets = useSafeAreaInsets();
  const { width: screenW, height: screenH } = useWindowDimensions();

  const cameraRef = useRef<CameraView>(null);
  const [session, setSession] = useState<Session | null>(null);
  const [facing, setFacing] = useState<CameraType>("back");
  const [flash, setFlash] = useState<FlashChoice>("off");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  /**
   * DONMUŞ KARE — yalnız yerinde onay yolunda dolu (bkz. cameraBridge >
   * `commit`). Doluyken pencerede canlı önizleme değil BU dosya duruyor ve alt
   * bar deklanşör yerine "yeniden çek + gönder" çiftini çiziyor.
   */
  const [shot, setShot] = useState<CameraShot | null>(null);
  /** Seçilen mercek (iOS) — bkz. `pickDefaultLens`. */
  const [lens, setLens] = useState<string | undefined>(undefined);

  /**
   * ⚠️ `ready` DEKLANŞÖRÜ KİLİTLEMEZ — bir zaman aşımı bayrağından ibarettir.
   *
   * iOS'ta `onCameraReady` YALNIZCA BİR KEZ atılıyor: `CameraView.swift`in init'i
   * `initializeCaptureSessionInput()` çağırıyor, event oradan geliyor. `facing`
   * değişince native taraf sadece `updateDevice()` yapıyor, YENİ event YOK —
   * yani "kamera çevrilince hazır değil" diye bayrağı sıfırlamak düğmeyi kalıcı
   * olarak ölü bırakıyor. Hata buydu.
   *
   * Dahası `startSession`ın ilk satırı `guard hasAvailableCameraDevice`
   * (`AVCaptureDevice.default(for: .video) != nil`): SİMÜLATÖRDE kamera donanımı
   * olmadığı için fonksiyon sessizce dönüyor, `onCameraReady` DE `onMountError`
   * DE atılmıyor. Deklanşörü bu event'e bağlamak, o ortamda basılamayan bir
   * düğme demek.
   *
   * Bu yüzden: düğme HER ZAMAN basılabilir, hazır değilken çekim hatası satır
   * içinde gösterilir (kullanıcı tekrar basar), event hiç gelmezse de aşağıdaki
   * zaman aşımı oturumu `unavailable` ile kapatıp sistem kamerasına düşürür.
   */
  const readyRef = useRef(false);

  // Sonuçlandırma state updater'ının İÇİNDE yapılamaz (bkz. CropperOverlay):
  // React updater'ı iki kez çağırabiliyor ve promise iki kez çözülürdü.
  const sessionRef = useRef<Session | null>(null);
  sessionRef.current = session;

  const finish = useCallback((outcome: CameraOutcome) => {
    const current = sessionRef.current;
    sessionRef.current = null;
    readyRef.current = false;
    setSession(null);
    setBusy(false);
    setError(null);
    setShot(null);
    current?.settle(outcome);
  }, []);

  const present = useCallback(
    (request: CameraRequest, settle: (outcome: CameraOutcome) => void) => {
      // Her oturum TEMİZ başlıyor: önceki çekimin flaşı ya da çevirdiği kamera
      // kalıcı bir tercih değil, o anın kararı.
      //
      // ⚠️ BAŞLANGIÇ KAMERASI ÇAĞIRANIN (istek: kampüs anı ÖN kamerayla
      // açılsın). Varsayılan hâlâ arka: kayıt/profil akışına kıyafet ya da
      // ortam fotoğrafı da girebiliyor.
      setFacing(request.facing ?? "back");
      setFlash("off");
      setBusy(false);
      setError(null);
      setShot(null);
      setLens(undefined);
      readyRef.current = false;
      setSession({ settle, request });
    },
    [],
  );

  /**
   * ══════════════════════════════════════════════════════════════════════════
   * 1x MERCEK — "0.5x" ile açılmanın çaresi.
   * ══════════════════════════════════════════════════════════════════════════
   * expo-camera cihazı `defaultBackCamera` ile seçiyor ve bu, SANAL bir cihaz
   * (builtInDualWideCamera / builtInTripleCamera) olabiliyor. Sanal cihazlarda
   * `videoZoomFactor = 1.0` ULTRA GENİŞ açıya, yani 0.5x'e karşılık geliyor;
   * expo'nun `zoom` prop'u da 0'da tam olarak bu faktörü kuruyor
   * (`updateZoom`: `pow(maxZoom, zoom)`), yani "zoom=0" 1x DEMEK DEĞİL.
   * Kamera 0.5x açılmasının sebebi bu.
   *
   * Çözüm mercekleri isimden seçmek — `selectedLens` native tarafta
   * `localizedName` ile eşleşiyor ve sanal/ultra-geniş/telefoto adları DAİMA
   * düz mercek adının üstüne sıfat ekliyor ("Back Camera" / "Back Ultra Wide
   * Camera" / "Back Dual Wide Camera"). Bu yüzden EN KISA ad düz 1x mercek.
   * Dile bağımlı bir anahtar kelime listesi tutmaktan sağlam: adlar
   * yerelleştirilmiş geliyor (Türkçe cihazda "Arka Kamera" vs "Arka Ultra Geniş
   * Açılı Kamera") ve kısalık sıralaması orada da korunuyor.
   *
   * Liste boşsa/okunamazsa hiçbir şey YAPMIYORUZ: prop verilmezse expo kendi
   * varsayılanını kullanıyor, yani en kötü hâl bugünkü davranış.
   */
  const pickDefaultLens = useCallback(async () => {
    const camera = cameraRef.current;
    if (!camera || Platform.OS !== "ios") return;
    try {
      const lenses = await camera.getAvailableLensesAsync();
      devLog("📸 [camera] mercekler", lenses);
      if (!lenses?.length) return;
      const widest = lenses.reduce((shortest, name) =>
        name.length < shortest.length ? name : shortest,
      );
      setLens(widest);
    } catch (e) {
      devLog("📸 [camera] mercek listesi okunamadı", e);
    }
  }, []);

  useEffect(() => {
    bindCamera(present);
    return () => bindCamera(null);
  }, [present]);

  const open = session !== null;

  useEffect(() => {
    if (!open) return;
    setStatusBarStyle("light", true);
    return () => setStatusBarStyle(isLight() ? "dark" : "light", true);
  }, [open]);

  // Ön kamerada sanal cihaz/ultra geniş sorunu yok (tek gerçek mercek), orada
  // seçimi expo'ya bırakıyoruz. Arkaya her dönüşte yeniden seçiyoruz: mercek
  // adları kameraya göre değişiyor, bayat bir ad eşleşmeyip varsayılana düşer.
  useEffect(() => {
    if (!open) return;
    if (facing === "front") {
      setLens(undefined);
      return;
    }
    pickDefaultLens();
  }, [open, facing, pickDefaultLens]);

  /**
   * Arka plana düşerken oturumu KAPATIYORUZ.
   *
   * Kamera donanımı arka planda zaten askıya alınıyor; dönüşte önizleme ölü bir
   * kare olarak kalabiliyor ve `takePictureAsync` o kareyi çekiyordu. Oturumu
   * iptal etmek, çağıranı (photoPicker) sessizce null'a düşürüyor — kullanıcı
   * geri döndüğünde kamera kapalı, kendi isteğiyle yeniden açıyor.
   */
  useEffect(() => {
    if (!open) return;
    const sub = AppState.addEventListener("change", (state) => {
      if (state === "active") return;
      /**
       * ⚠️ ELDE KARE VARSA ATILMIYOR (yerinde onay yolu).
       *
       * Kuralın gerekçesi CANLI AKIŞ: arka plandan dönen önizleme ölü bir kare
       * olarak kalıyor ve deklanşör o kareyi çekiyordu. Kare zaten çekilmişse o
       * risk yok — oturumu kapatmak kullanıcının elindeki fotoğrafı bir
       * bildirim çekmek yüzünden çöpe atmak olurdu. `busy` de aynı daldan:
       * gönderim ortasında kapatmak "oldu mu olmadı mı" bırakır.
       */
      if (shot || busy) return;
      finish({ status: "cancelled" });
    });
    return () => sub.remove();
  }, [open, finish, shot, busy]);

  /**
   * KAMERA HİÇ AÇILMAZSA kaçış yolu.
   *
   * `startSession` kamera donanımı yokken (simülatör) ne `onCameraReady` ne
   * `onMountError` atıyor — sessizce dönüyor. Böyle bir ortamda ekran siyah bir
   * kutu olarak kalıyordu. Zaman aşımında oturumu `unavailable` ile kapatıyoruz:
   * photoPicker sistem kamerası yoluna düşüyor, yani kullanıcı en azından bir
   * yere varıyor.
   *
   * ⚠️ SÜRE CÖMERT (3.5sn): gerçek cihazda ilk açılışta oturum kurulumu soğuk
   * başlangıçta bir saniyeyi geçebiliyor ve erken bir zaman aşımı, ÇALIŞAN
   * kamerayı sistem kamerasına çevirirdi.
   */
  useEffect(() => {
    if (!open) return;
    const timer = setTimeout(() => {
      if (readyRef.current || !sessionRef.current) return;
      devLog("📸 [camera] oturum açılmadı (donanım yok?), sistem kamerasına düşülüyor");
      finish({ status: "unavailable" });
    }, 3500);
    return () => clearTimeout(timer);
  }, [open, finish]);

  const layout = useMemo(() => {
    const headerH = insets.top + 56;
    // 16 (üst pad) + deklanşör + 16 (alt pad).
    const footerH = insets.bottom + 32 + SHUTTER;
    const { winW, winH } = frameWindow({
      screenW,
      screenH,
      headerH,
      footerH,
      aspectW: ASPECT_W,
      aspectH: ASPECT_H,
    });
    return {
      headerH,
      winW,
      winH,
      // Pencere ekranın tam ortasında — kırpıcıdaki winCX/winCY ile aynı.
      left: (screenW - winW) / 2,
      top: (screenH - winH) / 2,
    };
  }, [insets.top, insets.bottom, screenW, screenH]);

  const handleCapture = useCallback(async () => {
    const camera = cameraRef.current;
    // Hazırlık bayrağı KAPI DEĞİL (bkz. readyRef): burada yalnız mükerrer
    // basışa ve oturumsuz çağrıya karşı koruma var.
    if (!camera || busy || !sessionRef.current) return;

    setBusy(true);
    setError(null);
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium).catch(() => {});
    /**
     * ══════════════════════════════════════════════════════════════════════
     * 🔴 ÖNİZLEME DEKLANŞÖRLE BİRLİKTE DONUYOR — ÇEKİMİ BEKLEMEDEN.
     * ══════════════════════════════════════════════════════════════════════
     * Şikâyet birebir şuydu: "fotoyu çektikten sonra loader geliyor, hâlâ
     * kamera çalışırken, çok uzun sürüyor". İkisi aynı sebebin iki yüzü:
     * `takePictureAsync` tam sensör karesini (`pictureSize="Photo"`, 12MP'e
     * kadar) yazıyor ve bu yüz milisaniyeleri alıyor; o sürede canlı akış
     * akmaya devam ettiği için ekranda "çekildi" diyen hiçbir şey yok —
     * yalnız dönen bir gösterge.
     *
     * `pausePreview` akışı SON KAREDE dondurup bırakıyor, yani çekilen kareye
     * çok yakın bir görüntü ANINDA ekranda kalıyor: bekleme hissi kayboluyor
     * çünkü kullanıcı artık "kameranın önünde" değil "fotoğrafın karşısında".
     * Gerçek dosya geldiğinde üstüne o biniyor.
     *
     * ⚠️ HER İKİ YOLDA DA duruyor (yerinde onay olsun olmasın): kırpıcıya
     * giden yolda da ekran bir an açık kalıyor ve orada da canlı akışın
     * sürmesinin bir anlamı yok.
     *
     * ⚠️🔴 YALNIZ iOS — ANDROID'DE ÇEKİMİ KIRIYOR. İki natif uygulama aynı adı
     * taşıyor ama aynı şeyi yapmıyor:
     *   • iOS (`CameraView.swift`): `previewLayer.connection?.isEnabled =
     *     false` — yalnız önizleme katmanının bağlantısı kesiliyor, yakalama
     *     oturumu KOŞMAYA DEVAM ediyor. Tam istenen şey: ekran son karede
     *     donuyor, `takePictureAsync` normal çalışıyor.
     *   • Android (`ExpoCameraView.kt`): `cameraProvider?.unbindAll()` — TÜM
     *     use-case'leri söküyor, `ImageCapture` dahil. Çekimden önce
     *     çağrılırsa fotoğraf hiç çekilemez.
     * Android'de davranış bu yüzden ESKİSİ GİBİ kalıyor (deklanşörde gösterge);
     * kare geldiğinde donmuş görüntü orada da ekrana biniyor.
     *
     * ⚠️ HATA DALINDA `resumePreview` ŞART (aşağıda): donmuş akışla bırakılan
     * ekran, deklanşör yine basılabilir olduğu hâlde ölü görünüyor.
     * ⚠️ Çağrı `catch`siz BIRAKILMAZ: oturum kurulmadan çağrılınca reddediliyor
     * ve işlenmemiş bir promise hatası çekimi hiç başlatmıyordu.
     */
    if (Platform.OS === "ios") camera.pausePreview?.().catch(() => {});
    try {
      // Çekim adımları AÇIKÇA loglanıyor: native bir istisna süreci öldürürse
      // (uncaught NSException JS'e hata olarak GELMİYOR) son görülen satır
      // ölümün hangi adımda olduğunu söylüyor.
      devLog("📸 [camera] çekim başlıyor", { facing, flash, lens });
      // ⚠️ `picture` adı BİLEREK: `shot` artık DONMUŞ KARENİN state'i ve aynı
      // adı burada gölgelemek, hangisinin okunduğunu gözle ayırt edilemez
      // yapıyordu.
      const picture = await camera.takePictureAsync({
        quality: QUALITY,
        // Base64/EXIF gerekmiyor — ikisi de yalnızca bellek ve süre.
        base64: false,
        exif: false,
        // `skipProcessing` KULLANILMIYOR: Android'de kareyi ham sensör
        // oryantasyonunda bırakıyor (EXIF'e uyulmuyor) ve fotoğraf yatık
        // kaydediliyordu (bkz. captureSelfieFrame'deki aynı not).
      });
      if (!picture?.uri) throw new Error("empty picture");
      devLog("📸 [camera] kare alındı", {
        width: picture.width,
        height: picture.height,
      });
      const taken: CameraShot = {
        uri: picture.uri,
        width: picture.width ?? 0,
        height: picture.height ?? 0,
      };
      /**
       * YERİNDE ONAY: ekran KAPANMIYOR, kare pencerede duruyor (bkz.
       * cameraBridge > `commit`). Donmuş natif akışın üstüne gerçek dosya
       * biniyor, yani kullanıcının onayladığı şey tam olarak gönderilecek kare.
       */
      if (sessionRef.current?.request.commit) {
        setShot(taken);
        setBusy(false);
        return;
      }
      finish({ status: "captured", shot: taken });
    } catch (e) {
      // EKRAN KAPANMIYOR: en sık hata "Camera is not ready yet" ve o geçici bir
      // durum — oturumu kapatmak kullanıcıyı sebepsiz yere akıştan atardı.
      // Hata satır içinde, deklanşör yine basılabilir.
      devLog("📸 [camera] kare çekilemedi", e);
      // Donmuş akış geri açılıyor — gerekçe `pausePreview` çağrısının yanında.
      // ⚠️ iOS KAPISI: duraklatma da yalnız orada yapılıyor (gerekçe
      // `pausePreview` çağrısının yanında). Android'de `resumePreview`
      // kamerayı yeniden KURUYOR (`createCamera()`), yani duraklatılmamış bir
      // önizlemede sebepsiz bir yeniden bağlanma ve göz kırpması olurdu.
      if (Platform.OS === "ios") camera.resumePreview?.().catch(() => {});
      setError(t("common.camera.failed"));
      setBusy(false);
    }
  }, [busy, facing, flash, lens, finish, t]);

  /**
   * ATILAN KARENİN DOSYASINI SİL.
   *
   * ⚠️ TEMİZLİK BU EKRANIN İŞİ, ÇAĞIRANIN DEĞİL — ve yalnız YERİNDE ONAY
   * yolunda: dosyayı kamera üretti, kullanıcı burada reddetti (yeniden çek /
   * ✕) ve çağıran onun var olduğunu hiç görmedi. Eskiden bu işi onay sheet'i
   * kapanırken yapıyordu (`closeComposer`); sheet kalkınca kare sahipsiz
   * kalıyordu ve her reddedilen çekim diskte 12MP'lik bir dosya bırakıyordu.
   *
   * ⚠️ GÖNDERİLEN kare BURADA SİLİNMEZ: onun sahibi `commit` (kampüs yolunda
   * `shareShot`, yüklemeden SONRA siliyor). İki yerden silmek, yüklemenin
   * ortasında dosyayı çekmek demek.
   */
  const discard = useCallback((uri: string | undefined) => {
    if (uri) forgetPhoto(uri);
  }, []);

  /** Yeniden çek — donmuş kare atılıyor, canlı akış geri açılıyor. */
  const handleRetake = useCallback(() => {
    if (busy) return;
    discard(shot?.uri);
    setShot(null);
    setError(null);
    // iOS kapısı — gerekçe çekim hatasındaki ikizinde.
    if (Platform.OS === "ios") {
      cameraRef.current?.resumePreview?.().catch(() => {});
    }
  }, [busy, discard, shot?.uri]);

  /**
   * GÖNDER — iş ÇAĞIRANIN, ekran onun bitmesini bekliyor.
   *
   * Hata metni satır içinde kalıyor ve kare DE kalıyor: kullanıcı aynı kareyle
   * tekrar deneyebilir ya da yeniden çekebilir. Kaldırılan onay sheet'inin
   * kuralı birebir buydu (bkz. CampusMomentComposer'ın "hata burada kalıyor"
   * notu) — tek fark yüzeyin kendisi.
   */
  const handleCommit = useCallback(async () => {
    const commit = sessionRef.current?.request.commit;
    if (!commit || !shot || busy) return;
    setBusy(true);
    setError(null);
    try {
      const failure = await commit(shot);
      // ⚠️ OTURUM HÂLÂ AYNI MI: `commit` saniyeler sürüyor ve arada ekran
      // kapanmış olabilir (✕, arka plan). Kapanmışsa burada hiçbir state'e
      // dokunulmamalı — kapanmış bir ekranı "hata var" diye geri açardı.
      if (!sessionRef.current) return;
      if (failure) {
        setError(failure);
        setBusy(false);
        return;
      }
      finish({ status: "committed" });
    } catch (e) {
      devLog("📸 [camera] gönderim başarısız", e);
      if (!sessionRef.current) return;
      setError(t("common.camera.failed"));
      setBusy(false);
    }
  }, [busy, finish, shot, t]);

  if (!session) return null;

  return (
    <View style={[StyleSheet.absoluteFill, { backgroundColor: "#000" }]}>
      {/* Önizleme PENCERENİN İÇİNDE, tam ekran değil: kutu 3:4 ve kamera da
          3:4 ürettiği için burada görünen şey çekilecek karenin tamamı.
          Tam ekran bir önizleme, telefon ekranı 3:4'ten çok daha uzun olduğu
          için kareyi iki yandan kırpıp gösterirdi — kullanıcı kadrajın
          dışında kalan şeyi göremezdi. */}
      <View
        style={{
          position: "absolute",
          left: layout.left,
          top: layout.top,
          width: layout.winW,
          height: layout.winH,
          overflow: "hidden",
          backgroundColor: "#000",
        }}
      >
        <CameraView
          ref={cameraRef}
          style={StyleSheet.absoluteFill}
          facing={facing}
          flash={flash}
          mode="picture"
          /**
           * ══════════════════════════════════════════════════════════════════
           * 🔴 KARE ORANI BURADA SABİTLENİYOR — KALDIRMA.
           * ══════════════════════════════════════════════════════════════════
           * expo-camera'nın iOS varsayılanı `pictureSize = .high`, yani
           * `AVCaptureSession.Preset.high` = 1920×1080, 16:9 (portrede 9:16).
           * Sonuç iki kat bozuktu:
           *
           *   • Önizleme: `AVCaptureVideoPreviewLayer`ın videoGravity'si
           *     `resizeAspectFill`. 9:16 bir akışı 3:4 kutuya doldurmak,
           *     karenin altını üstünü kesip ORTASINI yakınlaştırmış gibi
           *     gösteriyordu — "fotonun saçma sapan bir alanı" buydu.
           *   • Dosya: çekilen kare de 9:16 geliyordu, yani kırpıcı 3:4
           *     pencereyi o uzun karenin içinden alıyor ve önizlemede görülen
           *     bölgeyle AYRIŞIYORDU.
           *
           * `Photo` preseti sensörün kendi 4:3'ü (portrede 3:4) ve tam
           * çözünürlük: önizleme akışı da dosya da 3:4 olduğu için kutu
           * birebir doluyor, kırpıcı da aynı kadrajla açılıyor.
           *
           * Android'de `pictureSize` "GENİŞLİKxYÜKSEKLİK" bekliyor ("Photo"
           * parse edilemez, sessizce en yüksek çözünürlüğe düşer); oranı veren
           * prop orada `ratio` ve yalnız Android'de geçerli.
           *
           * ══════════════════════════════════════════════════════════════════
           * 🔴 BU PROP `patches/expo-camera+56.0.8.patch`E BAĞLI.
           * ══════════════════════════════════════════════════════════════════
           * `Photo` preseti kareyi 2MP'den (1920×1080) SENSÖRÜN TAMAMINA
           * çıkarıyor — 48MP'lik iPhone'larda 8064×6048. expo-camera o kareyi
           * işlerken iki kat şişiriyordu ve uygulama deklanşörde loader
           * dönerken ÖLÜYORDU (jetsam; natif istisna JS'e hata olarak gelmiyor,
           * o yüzden `catch` bloğu hiç çalışmıyor):
           *   • `maxPhotoDimensions` daima formatın EN BÜYÜĞÜNE çekiliyordu,
           *   • `normalizeOrientation` ekran ölçeğiyle render ettiği için
           *     bitmap PİKSELDE 9 KAT doğuyordu (48MP → ~1.76 GB).
           * Patch ikisini de düzeltiyor (tavan 12MP + birebir ölçek).
           *
           * ⚠️ PATCH TEK BAŞINA YETMİYOR — `package.json`da
           * `expo.autolinking.ios.buildFromSource: ["expo-camera"]` ŞART.
           * SDK 56 modülleri varsayılan olarak Expo'nun CDN'inden HAZIR İKİLİ
           * geliyor (`ios/Pods/ExpoCamera/ExpoCamera.xcframework`), yani
           * node_modules'daki Swift hiç derlenmiyor: ilk denemede patch
           * uygulandı, `pod install` + rebuild yapıldı ve crash aynen devam
           * etti — cihaz log'unda yine `JetsamEvent … reason: "highwater"`
           * (uygulama 3.4 GB'a çıkıp kill edilmiş). O anahtar YALNIZ bu modülü
           * kaynağa çeviriyor; `EXPO_USE_PRECOMPILED_MODULES=false` hepsini
           * çevirip her temiz build'i dakikalarca uzatırdı.
           *
           * Doğrulama (pod install sonrası, build'den önce):
           *   grep -c ExpoCamera.xcframework ios/Pods/Pods.xcodeproj/project.pbxproj  → 0
           *   grep -c CameraPhotoCapture.swift ios/Pods/Pods.xcodeproj/project.pbxproj → >0
           *
           * ⚠️ `npm i` sonrası `postinstall` koşmazsa ya da expo-camera
           * yükseltilirse patch düşer ve crash SESSİZCE geri gelir. Sürüm
           * değişirse patch yeniden üretilmeli.
           */
          pictureSize={Platform.OS === "ios" ? "Photo" : undefined}
          ratio={Platform.OS === "android" ? "4:3" : undefined}
          // 1x mercek — bkz. pickDefaultLens. Verilmezse expo'nun seçtiği sanal
          // cihaz 0.5x (ultra geniş) açıyla açılıyor.
          selectedLens={lens}
          // 🔴 Bkz. dosya başı: ön kamerada DOSYA da aynalanıyor (selfie
          // doğrulamasının tersi) — profil fotoğrafı, çekerken görülen kare.
          mirror={facing === "front"}
          // Sistemin beyaz deklanşör animasyonu kapalı: kendi kırpma ekranımıza
          // geçiş zaten bir sahne değişimi, iki efekt üst üste biniyordu.
          animateShutter={false}
          // Yalnız zaman aşımı ağını susturuyor (bkz. readyRef) — deklanşörü
          // bu event'e BAĞLAMA, iOS'ta kamera çevrilince bir daha atılmıyor.
          onCameraReady={() => {
            readyRef.current = true;
            // Mercek listesi ancak oturum kurulduktan sonra dolu geliyor;
            // yukarıdaki effect mount sırasında boş liste görebiliyor.
            pickDefaultLens();
          }}
          // Oturum hiç kurulamadıysa (izin iptali, donanım meşgul) ekranda
          // siyah bir kutuyla bekletmek yerine sistem kamerasına düşüyoruz.
          onMountError={(e) => {
            devLog("📸 [camera] önizleme kurulamadı", e);
            finish({ status: "unavailable" });
          }}
        />

        {/* ÇEKİLEN KARE — pencerenin İÇİNDE, canlı akışın üstünde.
            Kutu kameranın oranıyla (3:4) birebir aynı ve kare de o orandan
            geliyor, yani `cover` tek piksel kırpmıyor: kullanıcı deklanşöre
            basarken gördüğü kadrajı görüyor.
            ⚠️ `transition` YOK: bu bir sahne değişimi değil, aynı görüntünün
            donmuş hâlinin yerine keskin hâlinin geçmesi — sönümlenerek gelen
            bir kopya iki görüntüyü üst üste bindirip titreme gibi okunuyor. */}
        {shot ? (
          <Image
            source={{ uri: shot.uri }}
            style={StyleSheet.absoluteFill}
            contentFit="cover"
            cachePolicy="memory"
          />
        ) : null}
      </View>

      <CornerTicks
        left={layout.left}
        top={layout.top}
        width={layout.winW}
        height={layout.winH}
      />

      {/* ------------------------------------------------------------ başlık */}
      <View
        pointerEvents="box-none"
        style={{
          position: "absolute",
          left: 0,
          right: 0,
          top: 0,
          height: layout.headerH,
          paddingTop: insets.top,
          paddingHorizontal: 16,
          flexDirection: "row",
          alignItems: "center",
          justifyContent: "space-between",
        }}
      >
        <MediaChromeIconButton
          systemImage="xmark"
          fallbackIcon={X}
          label={t("common.cancel")}
          // ⚠️ Elde duran kare de atılıyor (gerekçe `discard`da): ✕ burada
          // "vazgeçtim" demek, yani o dosyanın tek sahibi kalmıyor.
          onPress={() => {
            discard(shot?.uri);
            finish({ status: "cancelled" });
          }}
          disabled={busy}
        />

        {/* Kırpma ekranının düzeniyle aynı: solda vazgeçme yolu, sağda kareyi
            değiştiren eylemler.
            ⚠️ KARE DONMUŞKEN İKİSİ DE GİZLİ: flaş ve kamera çevirme canlı
            akışın ayarları, donmuş bir karede ikisi de ölü düğme. */}
        <View style={{ flexDirection: "row", alignItems: "center", gap: 10 }}>
          {/* Flaş ön kamerada GİZLİ: donanım flaşı yok, `on` orada sessizce
              hiçbir şey yapmıyor ve "çalışmayan buton" olarak okunuyor. */}
          {!shot && facing === "back" && (
            <MediaChromeIconButton
              systemImage={FLASH_SYMBOL[flash]}
              fallbackIcon={Zap}
              label={t(`common.camera.flash.${flash}`)}
              onPress={() =>
                setFlash(
                  (current) =>
                    FLASH_ORDER[
                      (FLASH_ORDER.indexOf(current) + 1) % FLASH_ORDER.length
                    ],
                )
              }
              disabled={busy}
              active={flash !== "off"}
            />
          )}

          {!shot && (
            <MediaChromeIconButton
              systemImage="arrow.triangle.2.circlepath.camera"
              fallbackIcon={RefreshCw}
              label={t("common.camera.flip")}
              // ⚠️ Burada hazır bayrağını SIFIRLAMA: iOS `facing` değişiminde
              // yalnız `updateDevice()` çağırıyor, `onCameraReady` BİR DAHA
              // ATILMIYOR — sıfırlanan bayrak bir daha dolmuyor.
              onPress={() =>
                setFacing((current) => (current === "back" ? "front" : "back"))
              }
              disabled={busy}
            />
          )}
        </View>
      </View>

      {/* ------------------------------------------------------------- alt bar
          TEK EYLEM, ORTADA: deklanşör. Kırpıcının alt barı sağa hizalı ama
          orada eylem bir onay; burada parmağın gittiği yer ekranın ortası
          (sistem kamerasının da deklanşörü orada). */}
      <View
        pointerEvents="box-none"
        style={{
          position: "absolute",
          left: 0,
          right: 0,
          bottom: 0,
          paddingBottom: insets.bottom + 16,
          paddingTop: 16,
          alignItems: "center",
          gap: 10,
        }}
      >
        {/* Hata SATIR İÇİNDE, toast ile DEĞİL: bu katman NotifierWrapper'ın
            üstünde çiziliyor, toast buranın ALTINDA kalır ve görünmezdi. */}
        {error && (
          <Text
            style={{
              color: colors.errorLight,
              fontSize: 13,
              textAlign: "center",
              paddingHorizontal: 28,
            }}
          >
            {error}
          </Text>
        )}

        {shot ? (
          /**
           * ── KARE DONMUŞ: KARAR SATIRI ────────────────────────────────────
           * Solda "yeniden çek", sağda gönder. Deklanşör çizilmiyor — donmuş
           * bir karede basılacak bir deklanşör yok ve üçüncü bir düğme kararı
           * zayıflatıyor.
           *
           * ⚠️ GÖNDER SAĞDA ve DOLU: ekranın onay yüzeyi olduğu tek işaret bu.
           * Kırpıcının alt barı da aynı dili konuşuyor (solda vazgeç, sağda
           * dolu onay) — iki ekran aynı akışın iki adımıydı, biri kaldırıldı
           * ama dil kaldı.
           */
          <View
            style={{
              alignSelf: "stretch",
              flexDirection: "row",
              alignItems: "center",
              justifyContent: "space-between",
              paddingHorizontal: 24,
            }}
          >
            <MediaChromeIconButton
              systemImage="arrow.counterclockwise"
              fallbackIcon={RefreshCw}
              label={t("common.camera.retake")}
              onPress={handleRetake}
              disabled={busy}
            />

            <AnimatedPressable
              onPress={handleCommit}
              disabled={busy}
              accessibilityRole="button"
              accessibilityLabel={
                session.request.commitLabel ?? t("common.save")
              }
              pressScale={0.96}
              style={{
                minWidth: 132,
                paddingVertical: 14,
                paddingHorizontal: 24,
                borderRadius: 999,
                borderCurve: "continuous",
                alignItems: "center",
                justifyContent: "center",
                // Donuk hâl dolgu alfasıyla — opaklıkla DEĞİL (gerekçe
                // deklanşörün yanında yazılı).
                backgroundColor: busy ? onMediaAt(0.4) : colors.onMedia,
              }}
            >
              {busy ? (
                <ActivityIndicator size="small" color={colors.onMediaInverse} />
              ) : (
                <Text
                  style={{
                    color: colors.onMediaInverse,
                    fontSize: 16,
                    fontWeight: "700",
                  }}
                >
                  {session.request.commitLabel ?? t("common.save")}
                </Text>
              )}
            </AnimatedPressable>
          </View>
        ) : (
          <AnimatedPressable
            onPress={handleCapture}
            // ⚠️ `ready`YE BAĞLI DEĞİL (bkz. readyRef): hazırlık event'i iOS'ta
            // kamera çevrildikten sonra bir daha gelmiyor, simülatörde ise hiç
            // gelmiyor — düğme o yüzden basılamıyordu.
            disabled={busy}
            accessibilityRole="button"
            accessibilityLabel={t("common.camera.capture")}
            pressScale={0.92}
            style={{
              width: SHUTTER,
              height: SHUTTER,
              borderRadius: 999,
              alignItems: "center",
              justifyContent: "center",
              // Cam YOK: deklanşör, kamera arayüzünün öğrenilmiş dolu beyaz
              // düğmesi. Donuk hâl OPAKLIKLA DEĞİL dolgu alfasıyla veriliyor
              // (ata zincirindeki opacity, chrome'daki cam butonları düşürüyor).
              backgroundColor: busy ? onMediaAt(0.4) : colors.onMedia,
              borderWidth: SHUTTER_RING,
              borderColor: onMediaAt(busy ? 0.25 : 0.55),
            }}
          >
            {busy ? (
              <ActivityIndicator size="small" color={colors.onMediaInverse} />
            ) : null}
          </AnimatedPressable>
        )}
      </View>
    </View>
  );
}

/**
 * Kadrajın dört köşesindeki L tırnaklar — kırpma ekranındakilerin aynısı.
 *
 * Kutunun KENARLIĞI yerine tırnak: tam çerçeve, önizlemenin kenarına
 * oturduğunda fotoğrafın içindeymiş gibi okunuyordu.
 */
function CornerTicks({
  left,
  top,
  width,
  height,
}: {
  left: number;
  top: number;
  width: number;
  height: number;
}) {
  const LEN = 22;
  const THICK = 2;
  const tick = onMediaAt(0.95);
  const corners = [
    { x: left, y: top, hx: 0, hy: 0, vx: 0, vy: 0 },
    { x: left + width - LEN, y: top, hx: 0, hy: 0, vx: LEN - THICK, vy: 0 },
    { x: left, y: top + height - LEN, hx: 0, hy: LEN - THICK, vx: 0, vy: 0 },
    {
      x: left + width - LEN,
      y: top + height - LEN,
      hx: 0,
      hy: LEN - THICK,
      vx: LEN - THICK,
      vy: 0,
    },
  ];
  return (
    <View pointerEvents="none" style={StyleSheet.absoluteFill}>
      {corners.map((c, i) => (
        <View
          key={i}
          style={{ position: "absolute", left: c.x, top: c.y, width: LEN, height: LEN }}
        >
          <View
            style={{
              position: "absolute",
              left: c.hx,
              top: c.hy,
              width: LEN,
              height: THICK,
              backgroundColor: tick,
            }}
          />
          <View
            style={{
              position: "absolute",
              left: c.vx,
              top: c.vy,
              width: THICK,
              height: LEN,
              backgroundColor: tick,
            }}
          />
        </View>
      ))}
    </View>
  );
}
