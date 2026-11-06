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
import { Gesture, GestureDetector } from "react-native-gesture-handler";
import Animated, {
  Easing,
  runOnJS,
  useAnimatedStyle,
  useSharedValue,
  withTiming,
} from "react-native-reanimated";
import { CameraView, type CameraType } from "expo-camera";
import { Image } from "expo-image";
import * as Haptics from "expo-haptics";
import { setStatusBarStyle } from "expo-status-bar";
import { useTranslation } from "react-i18next";

import AnimatedPressable from "@/shared/components/AnimatedPressable";
import MediaChromeIconButton from "@/shared/components/MediaChromeIconButton";
import SFIcon, { type SFSymbol } from "@/shared/components/SFIcon";
import { ArrowRight, Crop, RefreshCw, X, Zap } from "@/shared/icons";
import { useAppMode } from "@/features/discover/useAppMode";
import { modeAccent } from "@/features/discover/modeTheme";
import { colors, isLight, onMediaAt, withAlpha } from "@/shared/theme/colors";
import { GLASS_ICON_CLEAR_SIZE } from "@/shared/theme/glass";
import { devLog } from "@/shared/utils/devLog";
import { forgetPhoto } from "@/shared/utils/photoStore";
import {
  bindCamera,
  type CameraOutcome,
  type CameraRequest,
  type CameraShot,
} from "./cameraBridge";
import { cameraChrome, previewWindow } from "./cameraLayout";

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
 * ÇEKİLEN KARE 3:4 — bu bir varsayım DEĞİL, aşağıda `pictureSize`/`ratio` ile
 * dayatılan bir ayar; expo-camera'nın varsayılanı 16:9 ve o hâliyle kare
 * kırpıcının penceresiyle ayrışıyordu (gerekçe prop'un başında). Oran
 * sabitlendiği için kırpıcı "hiçbir şey atmadan" başlıyor.
 *
 * ÖNİZLEME PENCERESİ ise artık 3:4 DEĞİL, tepeden deklanşöre kadar uzanan
 * ekran oranında bir kutu — 3:4 akış yanlarından kırpılarak dolduruluyor.
 * Gerekçesi ve sonucu `layout`ta yazılı (görülen ⊆ çekilen).
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

/**
 * Deklanşör — iOS kamerasının HALKALI düğmesi: dış beyaz halka, siyah bir
 * boşluk, içinde açık gri dolu daire.
 *
 * Eskiden tek parçaydı (dolu beyaz daire + soluk kenarlık) ve kamera
 * arayüzünün öğrenilmiş deklanşöründen farklı okunuyordu — boşluk, düğmeye
 * basıldığında halkanın içindeki dairenin küçüldüğü o bilindik hareketin de
 * yeri. Üç ölçü birbirine bağlı: `SHUTTER_CORE` çapı kalan boşluktan türüyor.
 */
const SHUTTER = 72;
/** Dış beyaz halkanın kalınlığı. */
const SHUTTER_RING = 4;
/** Halka ile iç daire arasındaki boşluk — zemin (siyah) buradan görünüyor. */
const SHUTTER_GAP = 3;
const SHUTTER_CORE = SHUTTER - 2 * (SHUTTER_RING + SHUTTER_GAP);
/**
 * İç dairenin grisi — MEDYA rengi, tema token'ı DEĞİL: zemin her temada kamera
 * görüntüsü/siyah, yani düğme de her temada aynı çiziliyor.
 */
const SHUTTER_CORE_FILL = "#CBCBCB";

/** JPEG kalitesi: kırpıcı çıktıyı 900×1200'e indirip 0.85 ile yeniden
 *  kodluyor, buradaki tek iş ara dosyada nesil kaybı bırakmamak. */
const QUALITY = 0.9;

/**
 * Önizleme kutusunun köşeleri — DÖRT KÖŞE DE AYNI.
 *
 * Eskiden üst 55pt'ydi: kutu y=0'a yaslıydı, yani üst kenarı ekranın kendi
 * maskesine değiyordu ve küçük bir yarıçap o maskenin altında kaybolurdu.
 * Kutu artık güvenli alanın ALTINDAN başlıyor (bkz. `layout`), yani üst kenar
 * da siyah zeminin içinde duruyor — orada ekran köşesini taklit eden büyük bir
 * yarıçapın hizalanacağı bir şey yok.
 */
const RADIUS = 28;

/**
 * Başlık butonlarının pencere kenarına uzaklığı — ÜSTTE VE YANDA AYNI.
 *
 * Tek sayı olması şart: butonlar pencerenin üst köşelerine oturuyor ve iki
 * eksende farklı bir boşluk, yuvarlak köşeye göre hizasız okunuyordu. Üstteki
 * ölçü pencerenin tepesinden (yani `insets.top`'tan) sayılıyor, ekranın
 * fiziksel tepesinden değil — güvenli alan artık kutunun dışında.
 */
const CHROME_GAP = 16;

/**
 * Gönder düğmesinin çapı — başlıktaki cam ikon butonlarıyla BİREBİR AYNI.
 *
 * Ekrandaki bütün yuvarlak ikon düğmeleri (✕, flaş, çevir, yeniden çek) tek
 * ölçüde; gönder de onlardan biri gibi okunmalı. Ayrı bir çap, aynı aileden
 * olmayan bir düğme izlenimi veriyordu. Deklanşör BU AİLENİN DIŞINDA kalıyor
 * (kendi ölçüsü SHUTTER) — o bir ikon düğmesi değil, kameranın ana eylemi.
 */
const SEND = GLASS_ICON_CLEAR_SIZE;

type Session = {
  settle: (outcome: CameraOutcome) => void;
  /** Oturumun isteği — yerinde onay bu bloktan okunuyor (bkz. `commit`). */
  request: CameraRequest;
};

/**
 * Flaş: AÇIK ya da KAPALI — ara hâl yok.
 *
 * ⚠️ `auto` KALDIRILDI (istek). Gerekçesi kararın kendisi: otomatik flaşta
 * kullanıcı deklanşöre basarken ışığın patlayıp patlamayacağını bilmiyor, yani
 * düğme bir durum göstermiyor. İki hâlde düğmenin görüntüsü ile sonucu birebir.
 * i18n'deki `common.camera.flash.auto` anahtarı duruyor ama okunmuyor.
 */
type FlashChoice = "off" | "on";
const FLASH_ORDER: FlashChoice[] = ["off", "on"];

const FLASH_SYMBOL: Record<FlashChoice, SFSymbol> = {
  off: "bolt.slash.fill",
  on: "bolt.fill",
};

/**
 * ÖN KAMERADA FLAŞ = EKRAN FLAŞI.
 *
 * Ön kamerada donanım flaşı yok; ışığı ekranın kendisi veriyor (Retina Flash).
 * expo-camera bunu ayrı bir mod olarak taşıyor ve iki platformda iki ayrı
 * yoldan uyguluyor:
 *   • iOS: `screen` → `.on`a eşleniyor (`CameraEnums.swift`) ve AVFoundation
 *     ön kamerada o modu zaten ekran flaşı olarak çalıştırıyor.
 *   • Android: CameraX'in kendi `SCREEN_FLASH` yolu — orada `on` ön kamerada
 *     HİÇBİR ŞEY yapmıyor, yani bu eşleme olmadan düğme ölü olurdu.
 * Tek kural iki platformu da doğru yere götürüyor.
 */
const flashModeFor = (choice: FlashChoice, facing: CameraType) =>
  choice === "on" && facing === "front" ? "screen" : choice;

export default function CameraCaptureOverlay() {
  const { t } = useTranslation();
  const insets = useSafeAreaInsets();
  /**
   * Gönder düğmesinin dolgusu SEÇİLİ MODUN vurgusu — Flört'te litPlus
   * kırmızısı, Arkadaş'ta friendsAccent yeşili (Beğeniler ekranındaki dolgulu
   * CTA'larla tek aile, `modeAccent` tek kaynak).
   *
   * ⚠️ DÜĞME YALNIZ YERİNDE ONAY YOLUNDA ÇİZİLİYOR (kampüs anı) — kırpıcıya
   * giden profil yolunda onay bu ekranda değil kırpıcıda. Yani moda bağlı
   * renk, modun gerçekten anlamlı olduğu tek akışta görünüyor.
   */
  const { mode } = useAppMode();
  const accent = modeAccent(mode);
  const { width: screenW, height: screenH } = useWindowDimensions();

  const cameraRef = useRef<CameraView>(null);
  const [session, setSession] = useState<Session | null>(null);
  /**
   * ══════════════════════════════════════════════════════════════════════════
   * KAMERASIZ ÖNİZLEME — galeriden gelen kare bu ekranda onaylanıyor.
   * ══════════════════════════════════════════════════════════════════════════
   * `source` doluysa kamera HİÇ AÇILMIYOR: `CameraView` mount edilmiyor, ekran
   * doğrudan o kareyle donmuş başlıyor (gerekçe cameraBridge > `source`).
   *
   * Canlı akışa dokunan her şey bu modda ÖLÜ olmak zorunda — mercek seçimi,
   * duraklat/sürdür, deklanşör, çevirme, çift dokunuş ve 3.5sn'lik zaman
   * aşımı. Sonuncusu en tehlikelisi: hiç açılmayacak bir kameranın "hazır"
   * event'ini bekler ve oturumu `unavailable` ile kapatırdı — yani galeri
   * fotoğrafı 3.5sn sonra kendiliğinden çöpe giderdi.
   */
  const previewOnly = !!session?.request.source;
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
  /**
   * ══════════════════════════════════════════════════════════════════════════
   * ÇEKİLEN DOSYA DONMUŞ KARENİN ÜSTÜNE BİNSİN Mİ — iOS'ta VARSAYILAN HAYIR.
   * ══════════════════════════════════════════════════════════════════════════
   * Şikâyet birebir: "fotoyu çekiyorum, sonra biraz bekleyip fotoda değişiklik
   * yapıyor; basar basmaz çektiğiyle kalsın."
   *
   * Sebebi: deklanşörde ekran `pausePreview` ile SON CANLI KAREDE donuyor, bir
   * süre sonra `takePictureAsync`in dosyası gelip onun üstüne biniyordu. İki
   * görüntü aynı kadrajda (native taraf kareyi önizleme katmanının oranına
   * kırpıyor — `CameraPhotoCapture.processImageData`) ama AYNI GÖRÜNTÜ DEĞİL:
   * dosya HDR/Deep Fusion işleminden geçiyor, yani pozlama ve tonu canlı
   * akıştan farklı. Kullanıcının gördüğü şey "foto kendi kendine değişti".
   *
   * Çözüm: iOS'ta dosya PENCEREYE HİÇ ÇİZİLMİYOR. Ekranda kalan şey basıldığı
   * anda donan karenin ta kendisi; gönderilen dosya yine gerçek çekim.
   *
   * BEŞ DURUMDA yine de çiziliyor (yoksa ekran boş/canlı kalırdı):
   *   • Android — orada `pausePreview` çekimi kırdığı için akış donmuyor,
   *     donmuş kareyi ancak dosya sağlıyor (gerekçe `handleCapture`da).
   *   • `pausePreview` reddedilirse — donma hiç olmadı.
   *   • Arka plandan dönüşte — askıya alınan oturumun önizleme katmanı ölü bir
   *     kare (çoğu zaman siyah) olarak geliyor, dosya tek güvenilir görüntü.
   *   • Kamerasız mod (galeri `source`'u) — `present()` bunu `true`ya çekiyor;
   *     canlı katman hiç yok, dondurulacak kare de yok, pencerede görünebilecek
   *     tek şey dosya.
   *   • Başarılı kırpmadan sonra (`handleCrop`) — yeni dosya artık çizilmek
   *     ZORUNDA: ekrandaki donmuş kare kırpılmamış hâlinde kalırdı.
   */
  const [showStill, setShowStill] = useState(Platform.OS !== "ios");
  /**
   * DEKLANŞÖRE BASILDI, DOSYA HENÜZ GELMEDİ.
   *
   * Ekranın şekli bu bayrakla değişiyor: karar satırı (açıklama + ok) ve
   * "yeniden çek" çekimin BİTMESİNİ beklemiyor, basıldığı anda çiziliyor.
   * Gerekçe `handleCapture`ın başında.
   */
  const [capturing, setCapturing] = useState(false);
  /**
   * Çekim KUŞAĞI — uçuştaki bir çekimin sonucunun hâlâ istenip istenmediği.
   * "Yeniden çek"/✕ artık dosya yazılırken de basılabildiği için gerekli:
   * sayaç ilerlemişse gelen kare sessizce siliniyor.
   */
  const captureGenRef = useRef(0);
  /** Dosya gelmeden "gönder"e basıldı — kare gelir gelmez gönderilecek. */
  const pendingCommitRef = useRef(false);
  /** Seçilen mercek (iOS) — bkz. `pickDefaultLens`. */
  const [lens, setLens] = useState<string | undefined>(undefined);
  /**
   * KAPANIŞ ANİMASYONU UÇUŞTA — oturum bitti ama ekran hâlâ ağaçta.
   *
   * Tek işi dokunuşları yutmak: kayarken basılan bir düğme, kapanmış bir
   * oturumun state'ine yazmaya çalışırdı.
   */
  const [closing, setClosing] = useState(false);

  /**
   * ══════════════════════════════════════════════════════════════════════════
   * EKRAN ALTTAN GELİP ALTA GİDİYOR — ve bunu `top` İLE YAPIYOR, transform'la
   * DEĞİL.
   * ══════════════════════════════════════════════════════════════════════════
   * Kampüsteki "+" bir sheet açıyormuş gibi okunuyor; ekranın birden belirip
   * birden kaybolması o akışın tek sert geçişiydi.
   *
   * 🔴 `translateY` KULLANILAMAZ: başlıktaki butonlar liquid glass (SwiftUI
   * Host) ve ATA ZİNCİRİNDEKİ bir transform efekti sessizce düşürüyor — cam
   * hiç çizilmiyor, buton boş bir daire olarak kalıyor. Kaydırma bu yüzden
   * yerleşim özelliğiyle (`top`) yapılıyor; aynı tuzağın kuralı uygulamanın
   * her cam yüzeyinde geçerli.
   *
   * 1 = ekran tamamen aşağıda, 0 = yerinde. Giriş `present`te, çıkış
   * `finish`te; ikisinin arasındaki yarış `epochRef` ile çözülüyor.
   */
  const slide = useSharedValue(1);
  const sheetStyle = useAnimatedStyle(() => ({ top: slide.value * screenH }));

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
  /**
   * ⚠️🔴 `closing` KAPISI ŞART — yoksa SONUÇLANMIŞ OTURUM GERİ CANLANIYOR.
   *
   * Atama her render'da koşuyor. `finish` ref'i null'ladıktan sonra `closing`
   * bir re-render tetikliyor ve `session` state'i kapanış animasyonu boyunca
   * HÂLÂ DOLU (bilerek: ekran görünür kalmalı). Kapı olmasaydı bu satır eski
   * oturumu ref'e geri yazardı; ardından gelen bir `finish` (arka plan, ✕)
   * aynı promise'i İKİNCİ kez settle ederdi.
   */
  sessionRef.current = closing ? null : session;

  /**
   * OTURUM SAYACI — kapanış animasyonunun "hâlâ benim oturumum mu" kapısı.
   *
   * ⚠️ GEREKÇESİ KUYRUK: `settle` çağrıldığı anda `cameraBridge > drain`
   * sıradaki isteği SENKRON olarak açıyor (kırpıcıdaki ✕ → kameraya dönüş bu
   * yoldan geliyor). Yani kapanış animasyonu biterken ekranda ÇOKTAN yeni bir
   * oturum olabilir; sayacı karşılaştırmadan temizlemek o yeni oturumu
   * öldürürdü.
   */
  const epochRef = useRef(0);

  /** Animasyon bitti — ekranı GERÇEKTEN söken tek yer. */
  const dismiss = useCallback((epoch: number) => {
    if (epochRef.current !== epoch) return;
    setSession(null);
    setBusy(false);
    setError(null);
    setShot(null);
    setCapturing(false);
    setClosing(false);
  }, []);

  const finish = useCallback(
    (outcome: CameraOutcome) => {
      const current = sessionRef.current;
      // ZATEN KAPANIYOR: ikinci bir çağrı (ör. kapanış sırasında arka plana
      // düşmek) animasyonu baştan başlatırdı.
      if (!current) return;
      sessionRef.current = null;
      readyRef.current = false;

      /**
       * ⚠️ STATE BURADA TEMİZLENMİYOR (eskiden hepsi bu satırdaydı): ekran
       * kapanış animasyonu boyunca GÖRÜNÜR kalıyor ve `shot`/`error`/`busy`
       * silinirse kullanıcı kayarken içeriğin şekil değiştirdiğini görür
       * (donmuş kare kaybolur, gösterge oka döner). Temizlik `dismiss`te.
       */
      setClosing(true);
      const epoch = epochRef.current;
      slide.value = withTiming(
        1,
        { duration: 220, easing: Easing.in(Easing.cubic) },
        (finished) => {
          if (finished) runOnJS(dismiss)(epoch);
        },
      );

      // ⚠️ EN SON: kuyruğu boşaltıyor ve sıradaki istek SENKRON açılabiliyor
      // (gerekçe `epochRef`te). Önce animasyonu kurup sonra settle etmek,
      // yeni oturumun girişinin bu çıkışı iptal etmesini sağlıyor.
      current?.settle(outcome);
    },
    [dismiss, slide],
  );

  const present = useCallback(
    (request: CameraRequest, settle: (outcome: CameraOutcome) => void) => {
      // Uçuştaki bir kapanış varsa BURADA iptal oluyor: sayaç ilerleyince
      // bekleyen `dismiss` çağrısı kendini geçersiz sayıyor.
      epochRef.current += 1;
      setClosing(false);
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
      // Kamerasız modda kare BAŞTAN elde: `frozen` bununla doğru oluyor ve
      // dosya ÇİZİLMEK zorunda — `showStill`in iOS'taki `false`u yalnız canlı
      // akıştan donan kare için geçerli, burada donan bir canlı katman yok.
      setShot(request.source ?? null);
      setShowStill(!!request.source || Platform.OS !== "ios");
      setCapturing(false);
      captureGenRef.current += 1;
      pendingCommitRef.current = false;
      setLens(undefined);
      readyRef.current = false;
      setSession({ settle, request });

      // GİRİŞ: aşağıdan yukarı. Değer ÖNCE 1'e çekiliyor — uçuştaki bir
      // kapanış yarıda kalmışsa ekran o ara konumdan değil, hep aynı yerden
      // başlamalı.
      slide.value = 1;
      slide.value = withTiming(0, {
        duration: 280,
        easing: Easing.out(Easing.cubic),
      });
    },
    [slide],
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
  // Kamerasız modda mercek listesi soracak bir kamera yok (bkz. `previewOnly`).
  useEffect(() => {
    if (!open || previewOnly) return;
    if (facing === "front") {
      setLens(undefined);
      return;
    }
    pickDefaultLens();
  }, [open, previewOnly, facing, pickDefaultLens]);

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
      if (shot || busy) {
        // Elde kare varken ekran açık kalıyor ama DONMUŞ ÖNİZLEME ARTIK
        // GÜVENİLMEZ: askıya alınmış oturumun katmanı dönüşte ölü/siyah bir
        // kare olabiliyor. Dosyayı o yüzden burada devreye alıyoruz
        // (gerekçe `showStill`de).
        setShowStill(true);
        return;
      }
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
    // ⚠️ KAMERASIZ MODDA KURULMAZ: `onCameraReady` hiç gelmeyecek ve zaman
    // aşımı, kullanıcının seçtiği galeri karesini ekranıyla birlikte kapatırdı.
    if (!open || previewOnly) return;
    const timer = setTimeout(() => {
      if (readyRef.current || !sessionRef.current) return;
      devLog(
        "📸 [camera] oturum açılmadı (donanım yok?), sistem kamerasına düşülüyor",
      );
      finish({ status: "unavailable" });
    }, 3500);
    return () => clearTimeout(timer);
  }, [open, previewOnly, finish]);

  // Pencere şekli OTURUMUN: kampüs vermiyor ('fill'), kayıt 'photo' istiyor.
  const frame = session?.request.frame;
  const layout = useMemo(() => {
    // Butonlar pencerenin üst köşelerinden CHROME_GAP kadar içeride: satır
    // tam buton boyunda, üstündeki pay da güvenli alan + aynı boşluk.
    const headerH = insets.top + CHROME_GAP + GLASS_ICON_CLEAR_SIZE;
    /**
     * DEKLANŞÖR ALT ŞERİDİN TAM ORTASINDA: altındaki boşluk (ekranın alt
     * kenarına) ile üstündeki boşluk (pencerenin alt kenarına) EŞİT.
     *
     * Eskiden ikisi ayrı sayılardan geliyordu — altta `insets.bottom + 16`
     * (çentikli cihazda 50), üstte `16 + 12` (28) — ve düğme şeridin içinde
     * aşağı kaçmış duruyordu. Tek ölçüye bağlanınca pencere de aşağı indi:
     * eski toplam 150pt'lik şerit, çentikli cihazda 140'a düşüyor.
     *
     * ⚠️ TABAN 20: güvenli alanı olmayan cihazda (insets.bottom = 0) düğme
     * ekranın kenarına yapışırdı. Çentiklide ölçü `insets.bottom`un kendisi,
     * yani ev göstergesinin şeridi kadar — düğme onun üstünde kalıyor.
     */
    const footerGap = Math.max(insets.bottom, 20);
    const footerH = 2 * footerGap + SHUTTER;
    /**
     * ══════════════════════════════════════════════════════════════════════
     * PENCERE GÜVENLİ ALANIN ALTINDAN DEKLANŞÖRE KADAR — 3:4 DEĞİL.
     * ══════════════════════════════════════════════════════════════════════
     * Kutunun tepesi `insets.top` (çentiğin/durum çubuğunun hemen altı), altı
     * deklanşörün hemen üstü; başlık düğmeleri onun ÜSTÜNE biniyor.
     *
     * ⚠️ GÜVENLİ ALAN KUTUNUN DIŞINDA: kutu daha önce y=0'daydı ve önizleme
     * çentiğin ardına kadar uzanıyordu. Artık orası siyah zemin, yani dört
     * köşe de görünüyor (bkz. RADIUS).
     *
     * Eski hâlde kutu ekranın ortasında, 3:4 ve `frameWindow` ile
     * kırpıcınınkiyle birebir aynıydı — `frameWindow` ortalı yerleşimi
     * varsaydığı için (chrome'u İKİ kat sayıyor) burada kullanılmıyor.
     *
     * ⚠️🔴 WYSIWYG ARTIK TAM DEĞİL — ÖNİZLEME KAREDEN DAR.
     * Kutunun oranı ekranınki (≈9:16), kamera ise hâlâ 3:4 üretiyor
     * (`pictureSize="Photo"`, aşağıdaki gerekçe geçerli). iOS önizleme
     * katmanı `resizeAspectFill` olduğu için 3:4 akış kutuyu doldururken
     * YANLARINDAN kırpılıyor. Yani hata yönü GÜVENLİ TARAFTA: çekilen kare
     * ekranda görülenin ÜSTÜNE bir şey ekliyor, görülen hiçbir şeyi
     * kaybetmiyor.
     *   • Kırpıcıya giden yolda (profil) bunun pratik bir sonucu yok —
     *     kullanıcı kadrajı orada zaten seçiyor.
     *   • Yerinde onay yolunda (kampüs anı) yüklenen kare, önizlemede
     *     görülenden iki yanda biraz GENİŞ oluyor (`fitPhotoForUpload` 3:4'ün
     *     tamamını alıyor).
     * Kadrajın birebir olması gerekirse yapılacak şey kutuyu 3:4'e geri
     * döndürmek, kamera oranını değiştirmek DEĞİL (gerekçe `pictureSize`in
     * başında).
     */
    /**
     * PENCERENİN KENDİSİ `previewWindow`da — yukarıdaki sözleşme onun `fill`
     * dalı (birebir aynı hesap) ve kayıt fotoğraf adımı da ARTIK onu
     * kullanıyor — yukarıdaki "görülen ⊆ çekilen" toleransı orada da bilerek
     * kabul edildi. `photo` dalı (3:4, önizleme = yüklenen kare) şu an
     * çağıransız; gerekçe `cameraLayout`ın başında.
     *
     * İKİSİ DE AYNI TEPEDEN (`insets.top`) başlıyor — `photo` ekranın ortasına
     * OTURMUYOR (istek: "kampüsteki gibi üst tarafa dayalı gelsin"). Fark yalnız
     * alt kenar: `fill`de şeridin üstü, `photo`da 3:4'ün bittiği yer; arada
     * kalan şerit siyah zemin.
     *
     * ⚠️ Ölçüler BU EKRANIN chrome'u: başlık satırı ve deklanşör şeridi.
     * `fill`de pencerenin altı = şeridin üstü; araya ek pay KONMUYOR,
     * `footerGap` zaten o boşluk (eskiden bir de 12 ekleniyordu ve eşitliği
     * bozan oydu).
     */
    const win = previewWindow({
      frame: frame ?? "fill",
      screenW,
      screenH,
      insetTop: insets.top,
      headerH,
      footerH,
    });
    return { headerH, footerGap, ...win };
  }, [frame, insets.top, insets.bottom, screenH, screenW]);

  const handleCapture = useCallback(async () => {
    const camera = cameraRef.current;
    // Hazırlık bayrağı KAPI DEĞİL (bkz. readyRef): burada yalnız mükerrer
    // basışa ve oturumsuz çağrıya karşı koruma var.
    // Kamerasız modda `CameraView` mount değil, ref zaten boş; kapı yine de
    // açıkça yazılı — deklanşör o modda hiç çizilmiyor ama sözleşme bu.
    if (previewOnly || !camera || busy || capturing || !sessionRef.current) {
      return;
    }

    /**
     * ⚠️ `busy` DEĞİL `capturing` — ARADAKİ FARK EKRANIN ŞEKLİ.
     *
     * `busy` "bir iş sürüyor, düğmeler ölü" demek ve gönder düğmesini dönen
     * göstergeye çeviriyor. Dosyanın yazılması ise kullanıcının BEKLEMESİ
     * gereken bir iş değil: karar satırı (açıklama + ok) deklanşöre basıldığı
     * anda, dosya daha gelmeden çiziliyor ve basılabilir duruyor. Dosya hazır
     * olmadan "gönder"e basılırsa istek `pendingCommitRef`te bekliyor.
     */
    const generation = ++captureGenRef.current;
    setCapturing(true);
    setError(null);
    /**
     * ══════════════════════════════════════════════════════════════════════
     * 🔴 FLAŞLI ÇEKİMDE DONMUŞ KARE YANLIŞ — DOSYA BEKLENİYOR.
     * ══════════════════════════════════════════════════════════════════════
     * Şikâyet birebir: "flaşlı çekerken preview'de fotonun flaşsız hâli
     * geliyor, daha patlamadığı için."
     *
     * Doğru teşhis de bu: `pausePreview` akışı deklanşöre BASILDIĞI AN
     * donduruyor, flaş ise çekimin kendisiyle birlikte patlıyor. Yani donmuş
     * kare ışıktan ÖNCEKİ kare — gerçek fotoğrafla aynı sahne ama bambaşka bir
     * pozlama.
     *
     * Flaş kapalıyken kural tersi (donmuş kare kalır, dosya hiç çizilmez,
     * gerekçe `showStill`de): orada iki görüntü arasındaki tek fark HDR işlemi
     * ve kullanıcı onu "foto değişti" diye okuyor. Flaşta ise değişim
     * ASIL İSTENEN ŞEY — ışığı görmeden fotoğrafı onaylamanın anlamı yok.
     */
    if (flash === "on") setShowStill(true);
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
    // ⚠️ REDDEDİLİRSE DOSYAYA DÜŞÜLÜYOR: donma hiç olmadıysa ekranda canlı
    // akış kalır ve çekilen kare hiç görünmezdi (gerekçe `showStill`de).
    if (Platform.OS === "ios") {
      camera.pausePreview?.().catch(() => setShowStill(true));
    }
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
       * ⚠️ KARE ARTIK İSTENMİYOR OLABİLİR: dosya yazılırken kullanıcı "yeniden
       * çek"e ya da ✕'e basmış olabiliyor (ikisi de artık o saniyede
       * basılabilir). Sahipsiz kalan dosya DİSKTE kalırdı — her vazgeçilen
       * çekim 12MP'lik bir çöp demek.
       */
      if (captureGenRef.current !== generation || !sessionRef.current) {
        forgetPhoto(taken.uri);
        return;
      }
      /**
       * YERİNDE ONAY: ekran KAPANMIYOR, kare pencerede duruyor (bkz.
       * cameraBridge > `commit`). Karar satırı zaten çiziliydi; buradaki tek
       * iş gönderilecek dosyayı elde etmek.
       */
      if (sessionRef.current.request.commit) {
        setShot(taken);
        setCapturing(false);
        // Kullanıcı dosyayı beklemeden "gönder"e bastıysa iş TAM BURADA
        // başlıyor (gösterge o basıştan beri dönüyor).
        if (pendingCommitRef.current) {
          pendingCommitRef.current = false;
          commitShotRef.current?.(taken);
        }
        return;
      }
      finish({ status: "captured", shot: taken });
    } catch (e) {
      // EKRAN KAPANMIYOR: en sık hata "Camera is not ready yet" ve o geçici bir
      // durum — oturumu kapatmak kullanıcıyı sebepsiz yere akıştan atardı.
      // Hata satır içinde, deklanşör yine basılabilir.
      devLog("📸 [camera] kare çekilemedi", e);
      // Vazgeçilmiş çekimin hatası ekrana basılmaz (bkz. yukarıdaki aynı kapı).
      if (captureGenRef.current !== generation || !sessionRef.current) return;
      // Karar satırı geri alınıyor: deklanşöre dönülüyor ve bekleyen gönderim
      // isteği düşüyor — gönderilecek bir kare yok.
      setCapturing(false);
      pendingCommitRef.current = false;
      setBusy(false);
      // Donmuş akış geri açılıyor — gerekçe `pausePreview` çağrısının yanında.
      // ⚠️ iOS KAPISI: duraklatma da yalnız orada yapılıyor (gerekçe
      // `pausePreview` çağrısının yanında). Android'de `resumePreview`
      // kamerayı yeniden KURUYOR (`createCamera()`), yani duraklatılmamış bir
      // önizlemede sebepsiz bir yeniden bağlanma ve göz kırpması olurdu.
      if (Platform.OS === "ios") camera.resumePreview?.().catch(() => {});
      setError(t("common.camera.failed"));
    }
  }, [previewOnly, busy, capturing, facing, flash, lens, finish, t]);

  /**
   * KAMERAYI ÇEVİR — başlıktaki düğme ve önizlemeye ÇİFT DOKUNUŞ aynı yere
   * bağlı (sistem kamerasının öğrenilmiş jesti; kampüs anı ön kamerayla
   * açıldığı için parmak zaten ekranın ortasında).
   *
   * ⚠️ Burada hazır bayrağını SIFIRLAMA: iOS `facing` değişiminde yalnız
   * `updateDevice()` çağırıyor, `onCameraReady` BİR DAHA ATILMIYOR —
   * sıfırlanan bayrak bir daha dolmuyor (bkz. readyRef).
   */
  const handleFlip = useCallback(() => {
    // Kamerasız modda çevrilecek bir kamera yok (bkz. `previewOnly`).
    if (busy || previewOnly) return;
    // Çift dokunuşun TEK geri bildirimi bu: kamera çevrilirken önizleme bir an
    // siyah kalıyor ve dokunuşun sayılıp sayılmadığı görüntüden okunmuyor.
    Haptics.selectionAsync().catch(() => {});
    setFacing((current) => (current === "back" ? "front" : "back"));
  }, [busy, previewOnly]);

  /**
   * ══════════════════════════════════════════════════════════════════════════
   * EKRANIN ŞEKLİNİ BELİRLEYEN TEK DEĞER: "kare donmuş mu".
   * ══════════════════════════════════════════════════════════════════════════
   * ⚠️ `shot`TAN DEĞİL, DEKLANŞÖR BASIŞINDAN itibaren doğru. Dosyanın gelmesi
   * yüz milisaniyeleri alıyor ve alt barı ona bağlamak, basıldıktan sonra bir
   * süre daha deklanşörün durması demekti — şikâyet birebir buydu. Önizleme o
   * anda zaten donuyor (`pausePreview`), yani ekran "fotoğrafın karşısında";
   * chrome'un da o an değişmesi gerekiyor.
   *
   * `commit` KAPISI ŞART: kırpıcıya giden yolda (profil) ekran çekimden hemen
   * sonra kapanıyor, orada bir karar satırı hiç çizilmemeli.
   */
  const frozen = shot !== null || (capturing && !!session?.request.commit);

  /**
   * HANGİ DÜĞME ÇİZİLİYOR — karar `cameraChrome`da, burada yalnız okunuyor.
   *
   * Kampüs yolunda (kamerasız değil, kırpma yok) sonuç bugünkü `frozen`
   * ikilisiyle birebir: canlıyken deklanşör/flaş/çevir, donmuşken yeniden
   * çek + onay.
   */
  const chrome = cameraChrome({
    previewOnly,
    frozen,
    allowCrop: !!session?.request.crop,
  });

  /**
   * ÇİFT DOKUNUŞ = ÇEVİR. Tek dokunuşa HİÇBİR ŞEY bağlı değil, o yüzden
   * bekleme/çakışma yok.
   *
   * Kare donmuşken kapalı: başlıktaki çevirme düğmesi de orada gizli (donmuş
   * bir karede canlı akışın ayarı ölü düğme).
   */
  const flipTap = useMemo(
    () =>
      Gesture.Tap()
        // Kamerasız modda `frozen` zaten doğru; `previewOnly` kapısı yine de
        // açık — jestin ömrü kareye değil kameranın varlığına bağlı.
        .enabled(!previewOnly && !frozen && !busy)
        .numberOfTaps(2)
        .maxDuration(260)
        .maxDistance(24)
        .onEnd((e) => {
          "worklet";
          // İki parmakla biten bir dokunuş çift dokunuş değil (kırpıcıdaki
          // ikiziyle aynı savunma).
          if (e.numberOfPointers > 1) return;
          runOnJS(handleFlip)();
        }),
    [previewOnly, frozen, busy, handleFlip],
  );

  /**
   * ATILAN KARENİN DOSYASINI SİL.
   *
   * ⚠️ TEMİZLİK BU EKRANIN İŞİ, ÇAĞIRANIN DEĞİL: ✕ / yeniden çekte ekran o
   * anki `shot`ı unutuyor. O dosya üç türden biri olabilir — kameranın ham
   * karesi, kamerasız modda galeri `source` kopyası ya da çağıranın son kırpma
   * çıktısı — ve hangisi olursa olsun çağıran (`photoPicker`) `cancelled`
   * dönüşünde hiçbir şey unutmuyor. Eskiden bu işi onay sheet'i kapanırken
   * yapıyordu (`closeComposer`); sheet kalkınca kare sahipsiz kalıyordu ve her
   * reddedilen çekim diskte 12MP'lik bir dosya bırakıyordu.
   *
   * ⚠️ GÖNDERİLEN kare BURADA SİLİNMEZ: onun sahibi `commit` (kampüs yolunda
   * `shareShot`, yüklemeden SONRA siliyor). İki yerden silmek, yüklemenin
   * ortasında dosyayı çekmek demek.
   */
  const discard = useCallback((uri: string | undefined) => {
    if (uri) forgetPhoto(uri);
  }, []);

  /**
   * Yeniden çek — donmuş kare atılıyor, canlı akış geri açılıyor.
   *
   * ⚠️ DOSYA GELMEDEN DE BASILABİLİR (düğme çekimle birlikte çıkıyor): o
   * durumda atılacak bir `shot` yok, uçuştaki çekimin sonucu kuşak sayacıyla
   * düşürülüyor ve dosyası orada siliniyor.
   */
  const handleRetake = useCallback(() => {
    if (busy) return;
    discard(shot?.uri);
    captureGenRef.current += 1;
    pendingCommitRef.current = false;
    setCapturing(false);
    setShot(null);
    setError(null);
    // Bir sonraki çekim yine donmuş kareyle kalacak (gerekçe `showStill`de);
    // arka plandan dönüş gibi bir sebeple açılmışsa burada kapanıyor.
    setShowStill(Platform.OS !== "ios");
    // iOS kapısı — gerekçe çekim hatasındaki ikizinde.
    // Kamerasız modda sürdürülecek bir akış yok (düğme orada çizilmiyor da).
    if (Platform.OS === "ios" && !previewOnly) {
      cameraRef.current?.resumePreview?.().catch(() => {});
    }
  }, [busy, discard, previewOnly, shot?.uri]);

  /**
   * KIRP — kırpıcıyı ÇAĞIRAN açıyor (gerekçe cameraBridge > `crop`), ekran
   * yalnız dönen kareyi pencereye koyuyor. `null` = vazgeçildi, kare aynı.
   *
   * ⚠️ `busy` BİLEREK: kırpıcı açıkken bu ekranın düğmeleri ölü olmalı. Yan
   * etkisi onay okunun kırpıcının ARKASINDA göstergeye dönmesi — görünmüyor,
   * kabul.
   *
   * ⚠️🔴 KANCA REDDEDERSE `busy` YİNE BIRAKILIYOR: `await` fırlatsaydı bayrak
   * sonsuza dek açık kalırdı ve ✕ dahil bütün ekran ölürdü — kullanıcının tek
   * çıkışı uygulamayı öldürmek olurdu. Hata yalnız loglanıyor, kare aynı
   * kalıyor (kırpmadan önceki dosya hâlâ geçerli bir seçim).
   *
   * ⚠️ OTURUM KİMLİĞİYLE KAPI: kırpma sürerken ekran kapanmışsa (host
   * söküldü) hiçbir state'e dokunulmuyor — `commitShot`taki kapının ikizi.
   *
   * ⚠️ `setShowStill(true)`: kırpılmış dosya artık pencerede ÇİZİLMEK zorunda;
   * iOS'taki `false` varsayılanı yalnız canlı akıştan donan kare içindi ve o
   * kare artık kırpılmış dosya DEĞİL.
   *
   * ⚠️ `forgetPhoto` BURADA YOK: kırpmadan önceki dosyanın sahibi kanca
   * (çağıran). Burada silmek, onun hâlâ tuttuğu dosyayı altından çekmek olurdu.
   */
  const handleCrop = useCallback(async () => {
    const owner = sessionRef.current;
    const crop = owner?.request.crop;
    if (!crop || !shot || busy) return;
    setBusy(true);
    setError(null);
    let next: CameraShot | null = null;
    try {
      next = await crop(shot);
    } catch (e) {
      devLog("📸 [camera] kırpma başarısız", e);
      next = null;
    } finally {
      // Oturum aynıysa `busy` burada bırakılıyor. Değiştiyse (ekran kırpma
      // sürerken kapandı ya da yerine başkası geldi) dokunulmuyor: `busy`yi
      // kapanış animasyonundan SONRA `dismiss`, yoksa sıradaki `present()`
      // sıfırlıyor; host söküldüyse sıfırlanacak state de kalmadı.
      if (sessionRef.current === owner) setBusy(false);
    }
    if (sessionRef.current !== owner) return;
    if (next) {
      setShot(next);
      setShowStill(true);
    }
  }, [busy, shot]);

  /**
   * GÖNDER — iş ÇAĞIRANIN, ekran onun bitmesini bekliyor.
   *
   * Hata metni satır içinde kalıyor ve kare DE kalıyor: kullanıcı aynı kareyle
   * tekrar deneyebilir ya da yeniden çekebilir. Kaldırılan onay sheet'inin
   * kuralı birebir buydu (bkz. CampusMomentComposer'ın "hata burada kalıyor"
   * notu) — tek fark yüzeyin kendisi.
   */
  const commitShot = useCallback(
    async (target: CameraShot) => {
      const commit = sessionRef.current?.request.commit;
      if (!commit) return;
      setBusy(true);
      setError(null);
      try {
        const failure = await commit(target);
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
    },
    [finish, t],
  );

  /**
   * `handleCapture` GÖNDERİMİ REF'TEN ÇAĞIRIYOR — ikisi birbirine bağımlı
   * (çekim bekleyen gönderimi tetikliyor, gönderim çekilen kareyi alıyor) ve
   * doğrudan bağlamak useCallback zincirinde bir döngü kurardı.
   */
  const commitShotRef = useRef(commitShot);
  commitShotRef.current = commitShot;

  /**
   * Gönder düğmesi.
   *
   * ⚠️ DOSYA HENÜZ GELMEMİŞ OLABİLİR: düğme çekimle birlikte çiziliyor
   * (gerekçe `handleCapture`ın başında). O durumda istek işaretleniyor,
   * gösterge dönmeye başlıyor ve kare gelir gelmez gönderim orada başlıyor —
   * basış yutulmuyor, kullanıcı ikinci kez basmak zorunda kalmıyor.
   */
  const handleCommit = useCallback(() => {
    if (busy || !sessionRef.current?.request.commit) return;
    if (!shot) {
      if (!capturing) return;
      pendingCommitRef.current = true;
      setBusy(true);
      return;
    }
    commitShot(shot);
  }, [busy, capturing, commitShot, shot]);

  if (!session) return null;

  return (
    /* ⚠️ `absoluteFill` DEĞİL, ÖLÇÜ AÇIKÇA VERİLİYOR: `bottom: 0` dururken
       `top`u animasyonla büyütmek ekranı kaydırmaz, KISALTIRDI (kutu iki
       kenara birden bağlı kalır ve içerik ezilir). Kaydırmanın gerekçesi
       `slide`de. */
    <Animated.View
      // Kapanırken dokunuş YUTULUYOR: kayan ekranda basılan bir düğme, çoktan
      // sonuçlanmış bir oturumun state'ine yazmaya çalışırdı.
      pointerEvents={closing ? "none" : "auto"}
      style={[
        {
          position: "absolute",
          left: 0,
          width: screenW,
          height: screenH,
          backgroundColor: "#000",
        },
        sheetStyle,
      ]}
    >
      {/* Önizleme kutusu: kampüste güvenli alanın hemen altından deklanşörün
          hemen üstüne kadar tam genişlik, kayıtta ortalı 3:4; dört köşesi
          yuvarlak. Oran/kırpma sözleşmesi `layout`ta. */}
      <View
        style={{
          position: "absolute",
          left: layout.left,
          top: layout.top,
          width: layout.winW,
          height: layout.winH,
          // Dört köşe de aynı — gerekçe RADIUS'un yanında.
          borderRadius: RADIUS,
          borderCurve: "continuous",
          overflow: "hidden",
          backgroundColor: "#000",
        }}
      >
        {/* KAMERASIZ MODDA MOUNT EDİLMİYOR: donanım hiç tutulmuyor ve
            `onMountError`/`onCameraReady` gibi oturumu kapatabilen event'ler
            hiç doğmuyor (gerekçe `previewOnly`de). */}
        {!previewOnly && (
          <CameraView
            ref={cameraRef}
            style={StyleSheet.absoluteFill}
            facing={facing}
            // Ön kamerada ekran flaşına çevriliyor — gerekçe `flashModeFor`da.
            flash={flashModeFor(flash, facing)}
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
        )}

        {/* ÇEKİLEN KARE — pencerenin İÇİNDE, canlı akışın üstünde.
            ⚠️🔴 iOS'ta NORMALDE ÇİZİLMİYOR: ekranda kalan şey deklanşöre
            basıldığı anda donan karedir, dosya değil. Hangi üç durumda
            devreye girdiği ve NEDEN, `showStill`de yazılı.

            `cover` ŞART ve natif önizlemenin `resizeAspectFill`iyle aynı işi
            yapıyor: kare, kutuyu doldururken iki yandan aynı şekilde
            kırpılıyor — başka bir `contentFit`, dosyanın devreye girdiği
            durumlarda bir zıplama olarak okunurdu.
            ⚠️ `transition` YOK: sönümlenerek gelen bir kopya iki görüntüyü üst
            üste bindirip titreme gibi okunuyor. */}
        {shot && showStill ? (
          <Image
            source={{ uri: shot.uri }}
            style={StyleSheet.absoluteFill}
            contentFit="cover"
            cachePolicy="memory"
          />
        ) : null}

        {/* ÇİFT DOKUNUŞ KATMANI — pencerenin tamamı, EN ÜSTTE.
            Başlık ve alt bar bu kutunun DIŞINDA ve ağaçta ondan SONRA
            çiziliyor, yani ✕ / flaş / çevir / deklanşör dokunuşları buraya
            düşmüyor. Jestin kendisi `flipTap`te. */}
        <GestureDetector gesture={flipTap}>
          <View style={StyleSheet.absoluteFill} />
        </GestureDetector>
      </View>

      {/* Kadrajın dört köşesindeki beyaz L tırnaklar KALDIRILDI: kutu artık
          ekranın tepesine yaslı ve köşeleri yuvarlak — tırnaklar o yuvarlak
          kenarın dışında, siyah zeminde asılı kalıyordu. Kadrajın sınırını
          zaten kutunun kendisi çiziyor. */}

      {/* ------------------------------------------------------------ başlık */}
      <View
        pointerEvents="box-none"
        style={{
          position: "absolute",
          left: 0,
          right: 0,
          top: 0,
          height: layout.headerH,
          paddingTop: insets.top + CHROME_GAP,
          paddingHorizontal: CHROME_GAP,
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
            değiştiren eylem.
            ⚠️ ÇEVİRME ARTIK BURADA DEĞİL: deklanşörün sağına indi (aşağıda),
            çünkü canlı akışın iki ana eylemi (çek / çevir) aynı elin menzilinde
            olmalı. Flaş ise üst ORTADA, kendi katmanında. */}
        <View style={{ flexDirection: "row", alignItems: "center", gap: 10 }}>
          {/* YENİDEN ÇEK — kare donmuşken SAĞ ÜSTTE, alt barda değil.
              Alt bar böylece tek bir eyleme, onaya kalıyor. */}
          {/* KIRP — "yeniden çek"in SOLUNDA, yalnız çağıranın kancası varsa.
              ⚠️ `!shot` KAPISI: kamera yolunda kare deklanşörle birlikte
              donuyor ama dosya yüz milisaniyeler sonra geliyor; o arada
              düğme çizili ve basış sessizce yutulurdu (`handleCrop` dosyasız
              dönüyor). Donuk görünmesi "henüz değil" demenin dürüst yolu. */}
          {chrome.crop && (
            <MediaChromeIconButton
              systemImage="crop"
              fallbackIcon={Crop}
              label={t("common.cropper.crop")}
              onPress={handleCrop}
              disabled={busy || !shot}
            />
          )}
          {chrome.retake && (
            <MediaChromeIconButton
              systemImage="arrow.counterclockwise"
              fallbackIcon={RefreshCw}
              label={t("common.camera.retake")}
              onPress={handleRetake}
              disabled={busy}
            />
          )}
        </View>
      </View>

      {/* ------------------------------------------------------- flaş (orta)
          BAŞLIK SATIRININ DEĞİL, KENDİ KATMANININ ÇOCUĞU.
          Satırın içinde olsaydı ortalanması komşularının genişliğine bağlı
          kalırdı: solda ✕ hep var, sağdaki "yeniden çek" ise yalnız kare
          donmuşken çiziliyor — düğme o anda yer değiştirirdi. Ayrı bir
          katmanda ekranın ORTASI sabit.

          ⚠️ `top` elle veriliyor: mutlak inset verilen bir kutuda Yoga
          padding'i saymıyor, yani başlığın `paddingTop`una güvenilemez.

          ÖN KAMERADA DA VAR (istek): ışığı ekran veriyor, gerekçe
          `flashModeFor`da. Kare donmuşken gizli — canlı akışın ayarı. */}
      {chrome.flash && (
        <View
          pointerEvents="box-none"
          style={{
            position: "absolute",
            left: 0,
            right: 0,
            top: insets.top + CHROME_GAP,
            alignItems: "center",
          }}
        >
          <MediaChromeIconButton
            systemImage={FLASH_SYMBOL[flash]}
            fallbackIcon={Zap}
            label={t(`common.camera.flash.${flash}`)}
            // İki hâl: açık ↔ kapalı (gerekçe FLASH_ORDER'ın başında).
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
        </View>
      )}

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
          // İKİ PAY DA AYNI SAYI — deklanşörün üstü pencerenin altına,
          // altı ekranın altına eşit uzaklıkta (gerekçe `footerGap`ta).
          paddingBottom: layout.footerGap,
          paddingTop: layout.footerGap,
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

        {chrome.confirm ? (
          /**
           * ── KARE DONMUŞ: ONAY SATIRI ─────────────────────────────────────
           * TEK EYLEM, SAĞDA: gönder. Deklanşör çizilmiyor — donmuş bir karede
           * basılacak bir deklanşör yok. "Yeniden çek" de burada DEĞİL, sağ üst
           * köşede (gerekçe başlıkta): alt bar tek bir karara kalınca o karar
           * zayıflamıyor.
           *
           * ⚠️ KOŞUL `shot` DEĞİL `frozen`: satır dosyayı beklemiyor, deklanşör
           * basışıyla geliyor (gerekçe `frozen`da).
           *
           * ⚠️ GÖNDER SAĞDA ve DOLU: ekranın onay yüzeyi olduğu tek işaret bu.
           * Kırpıcının alt barı da aynı dili konuşuyor (sağda dolu onay) — iki
           * ekran aynı akışın iki adımıydı, biri kaldırıldı ama dil kaldı.
           *
           * SOLDA GRİ AÇIKLAMA (`commitHint`): düğme yazısız bir ok, yani
           * hedefi söyleyen tek yer bu satır. Çağıran vermezse hiç çizilmiyor
           * ve ok yine sağda kalıyor (`space-between` + esneyen metin).
           */
          <View
            style={{
              alignSelf: "stretch",
              flexDirection: "row",
              alignItems: "center",
              justifyContent: "space-between",
              gap: 16,
              paddingHorizontal: 24,
            }}
          >
            {/* Metin SOLDA ve esniyor: uzun okul adları okun üstüne binmek
                yerine satır atlıyor (düğme sabit genişlikte). */}
            <Text
              numberOfLines={2}
              style={{
                flex: 1,
                color: onMediaAt(0.65),
                fontSize: 14,
                fontWeight: "500",
              }}
            >
              {session.request.commitHint ?? ""}
            </Text>

            <AnimatedPressable
              onPress={handleCommit}
              disabled={busy}
              accessibilityRole="button"
              accessibilityLabel={
                session.request.commitLabel ?? t("common.save")
              }
              pressScale={0.96}
              style={{
                /**
                 * YUVARLAK VE YAZISIZ: eylemi ok taşıyor.
                 *
                 * Etiket (`commitLabel`) kalkmadı, ERİŞİLEBİLİR ADA taşındı —
                 * VoiceOver kullanıcısı "Paylaş"ı duymaya devam ediyor, ekranda
                 * görünen tek şey yön.
                 */
                width: SEND,
                height: SEND,
                borderRadius: 999,
                borderCurve: "continuous",
                alignItems: "center",
                justifyContent: "center",
                // Dolgu MODUN vurgusu (gerekçe `accent`in yanında). Donuk hâl
                // dolgu alfasıyla — opaklıkla DEĞİL (gerekçe deklanşörün
                // yanında yazılı).
                backgroundColor: busy ? withAlpha(accent, 0.45) : accent,
              }}
            >
              {busy ? (
                <ActivityIndicator size="small" color={colors.onMedia} />
              ) : (
                // Mürekkep `onMedia`: zemin kırmızı/yeşil dolgu, yani tema ne
                // olursa olsun beyaz (chrome butonlarıyla aynı kural).
                <View pointerEvents="none">
                  <SFIcon
                    name="arrow.right"
                    fallback={ArrowRight}
                    size={20}
                    strokeWidth={2.5}
                    color={colors.onMedia}
                    weight="semibold"
                  />
                </View>
              )}
            </AnimatedPressable>
          </View>
        ) : chrome.shutter ? (
          /**
           * ── CANLI AKIŞ: DEKLANŞÖR + ÇEVİRME ──────────────────────────────
           * Deklanşör ekranın ORTASINDA kalıyor (sistem kamerasının öğrenilmiş
           * yeri); çevirme onun SAĞINDA ve aynı dikey hizada.
           *
           * ⚠️ ÇEVİRME MUTLAK KONUMDA, satırın ikinci çocuğu DEĞİL: akışta
           * dursaydı deklanşörü sola iterdi ve orta hizayı kaybederdik.
           * `top: 0, bottom: 0` + dikey ortalama, iki düğmenin merkezlerini
           * farklı çaplarına rağmen aynı çizgiye getiriyor.
           */
          <View
            style={{
              alignSelf: "stretch",
              alignItems: "center",
              justifyContent: "center",
            }}
          >
            <AnimatedPressable
              onPress={handleCapture}
              // ⚠️ `ready`YE BAĞLI DEĞİL (bkz. readyRef): hazırlık event'i iOS'ta
              // kamera çevrildikten sonra bir daha gelmiyor, simülatörde ise hiç
              // gelmiyor — düğme o yüzden basılamıyordu.
              //
              // ⚠️🔴 İÇİNDE GÖSTERGE YOK, DONUK HÂL DE YOK — BİLEREK.
              // Geri bildirimi veren şey DONAN ÖNİZLEME: basıldığı an
              // `pausePreview` akışı son karede donduruyor (gerekçe
              // `handleCapture`da), yani "çekildi" gösterge dönerken değil
              // GÖRÜNTÜDE okunuyor. Üstüne dönen bir gösterge koymak bitmiş bir
              // işi sürüyormuş gibi gösteriyordu — şikâyet birebir buydu.
              // `disabled` duruyor (mükerrer basış yutulmalı) ama bu artık
              // görsel bir donukluğa çevrilmiyor.
              // ⚠️ `capturing` DE KAPI: çekim sürerken deklanşör artık `busy`
              // kurmuyor (gerekçe `handleCapture`ın başında), mükerrer basışı
              // yutan tek şey bu.
              disabled={busy || capturing}
              accessibilityRole="button"
              accessibilityLabel={t("common.camera.capture")}
              pressScale={0.92}
              style={{
                width: SHUTTER,
                height: SHUTTER,
                borderRadius: 999,
                alignItems: "center",
                justifyContent: "center",
                // Cam YOK: deklanşör, kamera arayüzünün öğrenilmiş halkalı
                // düğmesi (dış beyaz halka → boşluk → gri daire, bkz. SHUTTER).
                // Dış katman SADECE halka: dolgu yok, boşluktan zemin görünüyor.
                backgroundColor: "transparent",
                borderWidth: SHUTTER_RING,
                // ⚠️ YALNIZ ANDROID'DE SÖNÜYOR — orada önizleme donmuyor.
                // `pausePreview` Android'de çekimi kırdığı için (gerekçe
                // `handleCapture`da) akış basıldıktan sonra da akmaya devam
                // ediyor; hiçbir işaret vermezsek basış yutulmuş gibi okunur.
                // iOS'ta donan kare zaten işareti veriyor, orada sönük bir
                // deklanşör gereksiz bir "bekleniyor" sinyali olurdu.
                // Donukluk OPAKLIKLA DEĞİL renk alfasıyla (ata zincirindeki
                // opacity, chrome'daki cam butonları düşürüyor).
                borderColor: onMediaAt(
                  (busy || capturing) && Platform.OS === "android" ? 0.4 : 1,
                ),
              }}
            >
              {/* İÇ DAİRE — halkanın içinde, arada SHUTTER_GAP kadar siyah
                boşlukla. Ölçüsü sabitlerden türüyor, elle verilmiyor. */}
              <View
                pointerEvents="none"
                style={{
                  width: SHUTTER_CORE,
                  height: SHUTTER_CORE,
                  borderRadius: 999,
                  backgroundColor:
                    (busy || capturing) && Platform.OS === "android"
                      ? onMediaAt(0.35)
                      : SHUTTER_CORE_FILL,
                }}
              />
            </AnimatedPressable>

            {chrome.flip && (
              <View
                style={{
                  position: "absolute",
                  right: 24,
                  top: 0,
                  bottom: 0,
                  justifyContent: "center",
                }}
              >
                <MediaChromeIconButton
                  systemImage="arrow.triangle.2.circlepath.camera"
                  fallbackIcon={RefreshCw}
                  label={t("common.camera.flip")}
                  // Önizlemeye çift dokunuşla AYNI yol (bkz. handleFlip).
                  onPress={handleFlip}
                  disabled={busy}
                />
              </View>
            )}
          </View>
        ) : null}
      </View>
    </Animated.View>
  );
}
