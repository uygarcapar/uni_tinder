import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import {
  type LayoutChangeEvent,
  Platform,
  StyleSheet,
  Text,
  useWindowDimensions,
  View,
} from "react-native";
import { Image } from "expo-image";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { GestureDetector } from "react-native-gesture-handler";
import Animated from "react-native-reanimated";
import * as Haptics from "expo-haptics";
import { ImageManipulator, SaveFormat } from "expo-image-manipulator";
import { setStatusBarStyle } from "expo-status-bar";
import { useTranslation } from "react-i18next";
import { Host, Button as SwiftUIButton } from "@expo/ui/swift-ui";
import {
  buttonStyle,
  controlSize,
  font,
  frame,
  tint,
} from "@expo/ui/swift-ui/modifiers";
import { Crop, RotateCcw, X } from "@/shared/icons";

import AnimatedPressable from "@/shared/components/AnimatedPressable";
import MediaChromeIconButton from "@/shared/components/MediaChromeIconButton";
import SkeletonBox from "@/shared/components/SkeletonBox";
import { colors, isLight, onMediaAt, scrimAt } from "@/shared/theme/colors";
import { glassFallback, HAS_LIQUID_GLASS } from "@/shared/theme/glass";
import { showInfoToast } from "@/shared/services/toaster";
import { forgetPhoto, persistPickedPhoto } from "@/shared/utils/photoStore";
import { devLog } from "@/shared/utils/devLog";
import {
  bindCropper,
  type CropOutcome,
  type CropRequest,
} from "./cropperBridge";
import {
  coverScale,
  frameWindow,
  maxZoom,
  toSourceRect,
  OUTPUT_H,
  OUTPUT_QUALITY,
  OUTPUT_W,
} from "./cropGeometry";
import { applyCrop } from "./applyCrop";
import { CropFrame } from "./CropFrame";
import { useCropGestures } from "./useCropGestures";

/**
 * Uygulama içi 3:4 kırpma ekranı (Apple Photos düzeni).
 *
 * NEREYE MOUNT EDİLİR — DİKKAT: `@gorhom/portal` host'unu `children`'dan SONRA
 * render ediyor, yani her bottom sheet `children` içindeki her şeyin üstüne
 * boyanıyor. Profil düzenleme akışı (EditProfileForm → AppModal →
 * BottomSheetModal) bunun içinde olduğu için, bu overlay
 * `BottomSheetModalProvider`'ın İÇİNE konursa modalın ALTINDA açılır ve
 * "cropper açılmıyor" gibi görünür. Doğru yer: provider'ın hemen DIŞI
 * (bkz. App.tsx). `key={mode}` remount'unun da dışında — tema değişimi kırpma
 * ortasında promise'i düşürmemeli.
 *
 * Boştayken `null` döner: aktif değilken ağaçta hiçbir düğüm yok.
 */

const ASPECT_W = 3;
const ASPECT_H = 4;
/**
 * ⚠️ ÇIKTI SAYILARI ARTIK ORTAK MODÜLDE (`cropGeometry > OUTPUT_*`): kırpıcısız
 * yol da (kamera karesi doğrudan yükleniyor — kampüs anları) aynı ölçüyü ve
 * kaliteyi kullanmak zorunda. Burada yerel sabit olarak dursalardı iki yol
 * sessizce ayrışırdı.
 */
const OUT_W = OUTPUT_W;
const OUT_H = OUTPUT_H;
const QUALITY = OUTPUT_QUALITY;

/**
 * Chrome ölçüleri SABİT — Host'lara `matchContents` VERİLMİYOR.
 *
 * SwiftUI intrinsic ölçüsü ikinci Fabric commit'inde geliyor; ilk karede host
 * 0×0 kalıyor ve buton o sıfır ölçülü kutunun origin'ine ORTALANARAK çiziliyor
 * (bkz. ChatScreen header notu). Tam ekran bir overlay'de bu "butonlar köşeden
 * yerine sıçradı" olarak görünürdü.
 */
const CTA_W = 132;
const CTA_H = 52;

type Session = { request: CropRequest; settle: (outcome: CropOutcome) => void };

/**
 * Ekranda ÜZERİNDE ÇALIŞILAN fotoğraf.
 *
 * Oturum boyunca değişiyor: "Kırp"a her basış, seçilen kareyi gerçekten kesip
 * sonucu buraya koyuyor — fotoğrafın yeni hâli o. Kullanıcı sonra onun üstüne
 * tekrar kırpabiliyor (baştan yeni bir foto eklemiş gibi), Sıfırla ise
 * oturumun ilk fotoğrafına (`session.request`) döndürüyor.
 */
type Working = { uri: string; w: number; h: number };

export default function CropperOverlay() {
  const { t } = useTranslation();
  const insets = useSafeAreaInsets();
  const { width: screenW, height: screenH } = useWindowDimensions();

  const [session, setSession] = useState<Session | null>(null);
  const [busy, setBusy] = useState(false);
  /**
   * Kırpma çerçevesi AÇIK MI — ekran artık kırpma kipinde BAŞLAMIYOR.
   *
   * Açılışta görülen şey fotoğrafın kendisi: tam ekran, karartmasız, ızgarasız.
   * Çerçeve ancak başlıktaki "Kırp" butonuna basılınca iniyor. Gerekçe: kullanıcı
   * seçtiği kareyi önce BÜTÜN olarak görmek istiyor; kırpma isteğe bağlı bir
   * düzenleme adımı, akışın zorunlu durağı değil (çerçeveye hiç dokunulmazsa
   * `CropOutcome.adjusted` de false kalıyor).
   */
  const [cropping, setCropping] = useState(false);
  const [working, setWorking] = useState<Working | null>(null);
  /**
   * Fotoğraf bu oturumda DEĞİŞTİ Mİ — `CropOutcome.adjusted` için.
   *
   * Kadrajın kimlik olmaması tek başına yetmiyor: "Kırp" uygulandıktan sonra
   * kadraj kimliğe dönüyor (yeni foto çerçevenin tamamı) ama fotoğraf artık
   * kullanıcının kestiği kare. Bayrak olmasa o durum "hiç dokunmadı" sayılırdı.
   */
  const [edited, setEdited] = useState(false);

  // ---------------------------------------------------------------- yerleşim
  const layout = useMemo(() => {
    const headerH = insets.top + 56;
    // 16 (üst pad) + CTA + 16 (alt pad).
    const footerH = insets.bottom + 32 + CTA_H;
    /**
     * Pencere TAM GENİŞLİK, EKRANIN tam ortasında ve dikey payı iki chrome'un
     * BÜYÜĞÜNDEN hesaplanıyor (merkez için bkz. winCY).
     *
     * Eskiden iki yanda 16pt pay vardı ve seçili alan fotoğrafın eninden dar
     * kalıyordu: taban ölçek eni ekrana oturttuğu için kullanıcı, kendi
     * fotoğrafının eninin bir kısmı çerçevenin DIŞINDA kalmış hâlde başlıyordu.
     * Tam genişlikte 3:4 bir kaynakta çerçeve fotoğrafa BİREBİR oturuyor
     * (baseScale'in iki kolu eşitleniyor), yani kırpma "hiçbir şeyi atmadan"
     * başlıyor.
     *
     * Dikey pay chrome'un KENDİ yüksekliği (eski +12'lik ek pay kalktı, aksi
     * halde kısa telefonlarda tam genişliğe yer kalmıyordu): 3:4 pencere
     * ekrana sığmıyorsa — küçük cihazlarda — genişlik o paya göre küçülüyor.
     *
     * Formül kamera ekranıyla PAYLAŞILIYOR (frameWindow): çekilen kare doğrudan
     * buraya geliyor, iki kadrajın aynı olması gerekiyor.
     */
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
      winCX: screenW / 2,
      /**
       * Merkez EKRANIN merkezi.
       *
       * Eskiden `headerH + 12 + availH/2` idi — iki chrome bandının farkı kadar
       * (tipik telefonda ~1.5pt) yukarıda kalıyordu. Fotoğraf pencere merkezine
       * göre konumlandığı için o fark doğrudan üst/alt boşluklara geçiyor ve
       * eşit olması gereken iki şerit farklı çıkıyor; asimetri de "altta siyah
       * bir alan kalmış" diye okunuyor. Ekran merkezi iki şeridi eşitliyor ve
       * öteleme sınırlarını simetrik tutuyor.
       */
      winCY: screenH / 2,
    };
  }, [insets.top, insets.bottom, screenW, screenH]);

  // Geometrinin girdisi oturumun İLK fotoğrafı değil, ÜZERİNDE ÇALIŞILAN
  // fotoğraf: her uygulanan kırpmadan sonra kaynak boyutları değişiyor.
  const srcW = working?.w ?? 1;
  const srcH = working?.h ?? 1;
  /**
   * Taban ölçek GENİŞLİĞE oturuyor: `scale = 1`'de fotoğrafın eni ekranın eni.
   *
   * Ekranı KAPLATMAK (coverScale(screen)) denendi ve geri alındı: telefon
   * ekranı 3:4'ten çok daha uzun olduğu için kaplama bağlayıcı ekseni YÜKSEKLİK
   * yapıyor ve 3:4 bir fotoğrafın eninin ~%40'ı ekranın dışında kalıyordu —
   * kullanıcı kendi fotoğrafını hiç bütün göremiyordu. Genişliğe oturtunca
   * kare enden ene dolu; artan dikey alan üstte ve altta SİMETRİK boşluk olarak
   * kalıyor (pencere ekranın tam ortasında, bkz. layout) — asimetrik olduğu
   * sürece hata gibi okunan şey buydu, simetrik hâli kasıtlı bir çerçeve.
   *
   * `max()` ile pencere kaplaması ZORUNLU TUTULUYOR: kırpma penceresi 3:4, yani
   * eninden uzun. Yatay/kare bir kaynakta yalnız genişliğe oturan ölçek
   * pencerenin altını üstünü boş bırakırdı ve kullanıcının gördüğü kare ile
   * `toSourceRect`in döndürdüğü kare AYRIŞIRDI (o fonksiyon oranı kaynağın
   * içinde zorla düzeltiyor). Böyle kaynaklarda bir miktar yan kırpma
   * kaçınılmaz: 3:4 bir pencere kareden en alır.
   */
  const baseScale = useMemo(
    () =>
      Math.max(
        screenW / Math.max(1, srcW),
        coverScale(srcW, srcH, layout.winW, layout.winH),
      ),
    [srcW, srcH, screenW, layout.winW, layout.winH],
  );
  const maxScale = useMemo(
    () => maxZoom(baseScale, layout.winW, OUT_W),
    [baseScale, layout.winW],
  );

  // ------------------------------------------------------------------ jestler
  const { winCX, winCY } = layout;

  /**
   * Öteleme sınırı EKSENE GÖRE farklı kutudan — ikisinin gerekçesi de ayrı.
   *
   *   YATAY → EKRAN. Taban ölçek eni ekrana oturttuğu için `scale = 1`'de pay
   *     tam olarak SIFIR: fotoğraf en zoom out'ta yana hiç kaymıyor, iki kenar
   *     da ekranın kenarında. Pencere sınırı burada da pay bırakıyordu ve
   *     kaydırınca bir yanda siyah şerit açılıyordu.
   *
   *   DİKEY → PENCERE. Fotoğraf pencereden uzun olduğunda (ekran 3:4'ten uzun,
   *     yani 9:16 bir kaynakta çerçevenin altında ve üstünde fotoğraf kalıyor)
   *     kullanıcı o bandı seçebilmek ZORUNDA — ekran sınırı burada payı
   *     sıfırlayıp fotoğrafın en üstünü ve en altını kırpılamaz yapıyordu.
   *     Bedeli, fotoğrafı kaydırınca telefonun üst/alt kenarıyla çerçeve
   *     arasında kalan alanın boşalması: orası SİYAH (kökün zemini scrimAt(1)),
   *     kasıtlı bir çerçeve boşluğu.
   *
   * Tam genişlikte 3:4 bir kaynakta dikey pay yine SIFIR: çerçeve fotoğrafa
   * birebir oturuyor, kaydıracak bir şey yok (bkz. layout). Yani "en zoom
   * out'ta kıpırdamıyor" kuralı o kaynaklarda kendiliğinden tutuyor.
   *
   * Eksen başına kural SABİT — ölçeğe göre kutu değiştirmek olmaz: fotoğraf
   * ekranı kaplamaya başladığı karede sınır pencereden ekrana atlar ve görüntü
   * ortaya SIÇRAR.
   */
  const clampW = screenW;
  const clampH = layout.winH;

  // Jest + dönüşüm makinesi ortak hook'ta (kamera önizlemesinin yerinde
  // kırpma kipi de onu kullanıyor). `peek: true`: kip DIŞINDA pinch bir bakış,
  // bırakınca "ev"e geri yaylanıyor (bkz. useCropGestures > settleBack).
  // `focusX/Y` pencere merkezi — GestureDetector'ın View'ı tam ekran, yani
  // jest koordinatları ekran koordinatı.
  const {
    gesture: gestures,
    imageStyle,
    gridStyle,
    latest,
    resetTransform,
    resetGestureFlags,
  } = useCropGestures({
    cropping,
    peek: true,
    srcW,
    srcH,
    baseScale,
    maxScale,
    clampW,
    clampH,
    focusX: winCX,
    focusY: winCY,
  });

  // ------------------------------------------------------------------ köprü
  const present = useCallback((request: CropRequest, settle: (o: CropOutcome) => void) => {
    // Kadraj, "ev" ve JS aynası tabana (1/0/0): kadraj oturum başına,
    // sıradaki fotoğrafın kırpması öncekinin ölçeğini devralmamalı (kayıt
    // akışı 6 fotoğrafı arka arkaya açıyor). Jest bayrakları da boşa.
    resetTransform(false);
    resetGestureFlags();
    setBusy(false);
    setCropping(false);
    setEdited(false);
    setWorking({
      uri: request.uri,
      // `?? 1` korunuyor: sistem boyut vermediyse alan 0 gelebiliyor ve
      // cropGeometry sıfırı kendi içinde karşılıyor (bkz. coverScale).
      w: request.srcWidth ?? 1,
      h: request.srcHeight ?? 1,
    });
    setSession({ request, settle });
  }, [resetTransform, resetGestureFlags]);

  useEffect(() => {
    bindCropper(present);
    return () => bindCropper(null);
  }, [present]);

  const open = session !== null;
  useEffect(() => {
    if (!open) return;
    setStatusBarStyle("light", true);
    return () => setStatusBarStyle(isLight() ? "dark" : "light", true);
  }, [open]);

  // Sonuçlandırma state updater'ının İÇİNDE yapılamaz: React updater'ı iki kez
  // çağırabiliyor (StrictMode) ve promise iki kez çözülürdü.
  const sessionRef = useRef<Session | null>(null);
  sessionRef.current = session;

  const finish = useCallback((outcome: CropOutcome) => {
    const current = sessionRef.current;
    sessionRef.current = null;
    setSession(null);
    current?.settle(outcome);
  }, []);

  // ------------------------------------------------------------------ eylemler
  /**
   * Ara dosyayı (uygulanmış bir kırpmanın çıktısı) siler.
   *
   * Oturumun ÖZGÜN dosyasına asla dokunmuyor: onun sahibi picker ve Sıfırla
   * ona dönüyor. Ara dosyalar manipülatörün cache'inde birikiyordu — üst üste
   * kırpma artık mümkün olduğu için sayıları da kullanıcıya bağlı.
   */
  const dropStale = (candidate: string, originalUri: string) => {
    if (candidate !== originalUri) forgetPhoto(candidate);
  };

  /**
   * Kırpma kipini açar/kapatır — kadraja DOKUNMAZ.
   *
   * Kipten çıkmak bir VAZGEÇME değil: seçilen kare fotoğrafın yeni hâli, kip
   * kapanınca da öyle kalıyor (bir dönem iki yönde de sıfırlıyordu ve
   * kullanıcının yaptığı kırpma kip kapatılınca siliniyordu). Geri alma yolu
   * ayrı bir buton — Sıfırla.
   *
   * Kipe İLK girişte kadraj zaten tabanda: kip dışındaki pinch kalıcı değil
   * (bkz. useCropGestures > settleBack), yani "kırpma en zoom out'tan başlar" kuralı kendiliğinden
   * tutuyor; ikinci girişte ise kullanıcı bıraktığı yerden devam ediyor.
   */
  const handleToggleCrop = () => {
    if (busy) return;
    Haptics.selectionAsync().catch(() => {});
    setCropping((on) => !on);
  };

  /**
   * Sıfırla — kadrajı DA fotoğrafı DA oturumun başına döndürür.
   *
   * "Kırp" artık gerçekten kesiyor, yani geri alınacak şey yalnız ölçek/öteleme
   * değil; uygulanan kırpmaların tamamı. İlk fotoğrafa dönmek yeterli: ara
   * dosyalar zaten `session.request.uri`den türüyor, o dosya oturum boyunca
   * duruyor.
   */
  const handleReset = () => {
    if (busy || !session || !working) return;
    Haptics.selectionAsync().catch(() => {});
    const original = session.request.uri;
    const photoChanges = working.uri !== original;
    resetTransform(!photoChanges);
    setEdited(false);
    if (photoChanges) {
      dropStale(working.uri, original);
      setWorking({
        uri: original,
        w: session.request.srcWidth ?? 1,
        h: session.request.srcHeight ?? 1,
      });
    }
  };

  const handleCancel = () => {
    if (busy) return;
    // Vazgeçildi: uygulanmış kırpmaların çıktısı artık çöp.
    if (session && working) dropStale(working.uri, session.request.uri);
    finish({ status: "skipped" });
  };

  /** Pencerenin o anki kadrajına karşılık gelen KAYNAK dikdörtgeni. */
  const currentRect = () =>
    toSourceRect({
      srcW, srcH,
      winW: layout.winW,
      winH: layout.winH,
      baseScale,
      scale: latest.current.s,
      tx: latest.current.tx,
      ty: latest.current.ty,
      aspectW: ASPECT_W,
      aspectH: ASPECT_H,
    });

  /**
   * "Kırp" — seçilen kareyi GERÇEKTEN keser ve üzerinde çalışılan fotoğrafı
   * onunla değiştirir.
   *
   * Sonrası baştan fotoğraf eklemiş gibi: yeni foto çerçevenin tamamı olduğu
   * için kadraj kimliğe dönüyor, kip kapanıyor ve kullanıcı istiyorsa onun
   * ÜSTÜNE tekrar kırpabiliyor. Ara adım OUT_W/OUT_H'ye küçültülmüyor ve
   * STEP_QUALITY ile kodlanıyor (bkz. applyCrop.ts).
   *
   * Kadraj kimlikse hiç kodlama YAPILMIYOR: kare fotoğrafın tamamı demek, tek
   * etkisi bir nesil JPEG kaybı olurdu.
   */
  const handleApplyCrop = async () => {
    if (!session || !working || busy) return;
    const rect = currentRect();
    const whole =
      rect.originX === 0 &&
      rect.originY === 0 &&
      rect.width >= srcW &&
      rect.height >= srcH;
    if (whole) {
      setCropping(false);
      return;
    }

    setBusy(true);
    try {
      // Kesme + kodlama + release ortak yardımcıda (kamera önizlemesi de
      // kullanıyor); hata orada FIRLATILIYOR, toast burada.
      const result = await applyCrop(working.uri, rect);
      resetTransform(false);
      dropStale(working.uri, session.request.uri);
      setWorking({
        uri: result.uri,
        // Dönen ölçü KAYNAKTAN okunuyor (rect değil): manipülatör taşan
        // dikdörtgeni sessizce küçültebiliyor ve geometri bayat boyutla
        // çalışırsa kadraj fotoğraftan kayıyor.
        w: result.width,
        h: result.height,
      });
      setEdited(true);
      setCropping(false);
    } catch (error) {
      // Oturum KAPATILMIYOR: elindeki foto hâlâ geçerli, kullanıcı yeniden
      // deneyebilir ya da olduğu gibi kaydedebilir.
      devLog("✂️ [cropper] kırpma uygulanamadı", error);
      showInfoToast({ message: t("common.cropper.failed"), variant: "error" });
    } finally {
      setBusy(false);
    }
  };

  const handleConfirm = async () => {
    if (!session || !working || busy) return;
    setBusy(true);

    // Kimlik dönüşümü + hiç uygulanmış kırpma yok = kullanıcı çerçeveye hiç
    // dokunmadı. Yeniden kırpma akışının bunu bilmesi gerekiyor (bkz.
    // CropOutcome.adjusted).
    const { s, tx: dx, ty: dy } = latest.current;
    const adjusted = edited || s !== 1 || dx !== 0 || dy !== 0;

    const rect = currentRect();

    // EXIF yönü ELLE işlenmiyor: manipulate() her zaman başa bir
    // fix-orientation dönüşümü ekliyor ve picker görsel olarak DİK boyut
    // raporluyor — yani asset.width/height ile crop() aynı piksel uzayında.
    const context = ImageManipulator.manipulate(working.uri);
    let ref: Awaited<ReturnType<typeof context.renderAsync>> | null = null;
    try {
      context.crop(rect).resize({ width: OUT_W, height: OUT_H });
      ref = await context.renderAsync();
      const result = await ref.saveAsync({ compress: QUALITY, format: SaveFormat.JPEG });
      const fileName = `photo_${Date.now()}.jpg`;
      const uri = await persistPickedPhoto(result.uri, fileName);
      // Ara dosya tüketildi: kalıcı dizine taşınan RENDER çıktısı, bu değil.
      dropStale(working.uri, session.request.uri);
      finish({ status: "done", photo: { uri, mime: "image/jpeg", fileName }, adjusted });
    } catch (error) {
      devLog("✂️ [cropper] kırpma başarısız", error);
      finish({ status: "failed", error });
    } finally {
      // release() İHMAL EDİLEMEZ: 48MP bir kaynakta sızdırılan tek bir ImageRef
      // ~190 MB. Kayıt akışı arka arkaya 6 fotoğraf kırpabiliyor.
      ref?.release?.();
      context.release?.();
      setBusy(false);
    }
  };

  if (!session || !working) return null;

  // Çizilen fotoğraf `session.request` DEĞİL, üzerinde çalışılan kopya:
  // uygulanan her kırpma bunu değiştiriyor. (`request.index` / `request.total`
  // bilerek okunmuyor — köprü onları hâlâ taşıyor, çoklu seçimde sırayı kuran
  // kod oradan besleniyor, ama chrome'da artık sayaç yok.)
  const { uri } = working;
  const dispW = srcW * baseScale;
  const dispH = srcH * baseScale;

  const winLeft = layout.winCX - layout.winW / 2;
  const winTop = layout.winCY - layout.winH / 2;

  return (
    <View style={[StyleSheet.absoluteFill, { backgroundColor: scrimAt(1) }]}>
      <GestureDetector gesture={gestures}>
        <Animated.View style={StyleSheet.absoluteFill} collapsable={false}>
          {/* Kutu zaten kaynağın TAM oranında boyutlanıyor; contentFit="cover"
              burada sessizce ikinci bir kırpma yapardı. */}
          <Animated.View
            style={[
              {
                position: "absolute",
                left: layout.winCX,
                top: layout.winCY,
                width: dispW,
                height: dispH,
                marginLeft: -dispW / 2,
                marginTop: -dispH / 2,
              },
              imageStyle,
            ]}
          >
            <Image
              source={{ uri }}
              style={{ width: "100%", height: "100%" }}
              contentFit="fill"
              cachePolicy="memory-disk"
              recyclingKey={uri}
              allowDownscaling
            />
          </Animated.View>
        </Animated.View>
      </GestureDetector>

      {/* Karartma + ızgara + köşe tırnakları. Tamamı KIRPMA KİPİNE bağlı —
          kip kapalıyken fotoğraf çıplak. Katman başlıktaki cam butonların
          KARDEŞİ (ATASI DEĞİL): kendi opaklığı animasyonlu ve ata zincirinde
          animasyonlu opaklık liquid glass'ı sessizce düşürürdü (bkz.
          shared/theme/glass.ts notları). */}
      <CropFrame
        visible={cropping}
        frame={{ left: winLeft, top: winTop, width: layout.winW, height: layout.winH }}
        area={{ width: screenW, height: screenH }}
        gridStyle={gridStyle}
      />

      {/* ------------------------------------------------------------ başlık */}
      <View
        pointerEvents="box-none"
        style={{ position: "absolute", left: 0, right: 0, top: 0, height: layout.headerH, paddingTop: insets.top, paddingHorizontal: 16, flexDirection: "row", alignItems: "center", justifyContent: "space-between" }}
      >
        <MediaChromeIconButton
          systemImage="xmark"
          fallbackIcon={X}
          label={t("common.cancel")}
          onPress={handleCancel}
          disabled={busy}
        />

        {/* Düzenleme ikilisi SAĞDA, yan yana: Kırp + Sıfırla. Başlığın ortası
            boş — ortada duran buton, iki köşedeki butonla eşit ağırlıkta
            okunuyor ve hangisinin kadrajı değiştirdiği belirsiz kalıyordu.
            Solda yalnız vazgeçme yolu (✕), sağda karede oynayan iki eylem. */}
        <View style={{ flexDirection: "row", alignItems: "center", gap: 10 }}>
          {/* Başlık YAZISININ yerini alan buton: metin hiçbir şey yapmıyordu,
              oysa ekranın tek öğrenilmesi gereken eylemi bu. Açık hâlde glif
              turuncuya dönüyor — çerçevenin açık olduğunu rozetle değil butonun
              kendisiyle söylüyor. */}
          <MediaChromeIconButton
            systemImage="crop"
            fallbackIcon={Crop}
            label={t("common.cropper.crop")}
            onPress={handleToggleCrop}
            disabled={busy}
            active={cropping}
          />

          {/* Sıfırla kip DIŞINDA da canlı: kırpma kipten çıkınca KALICI, yani
              geri alınacak bir kadraj orada da var — kadrajı geri almanın tek
              yolu bu buton (bkz. handleToggleCrop). */}
          <MediaChromeIconButton
            systemImage="arrow.counterclockwise"
            fallbackIcon={RotateCcw}
            label={t("common.cropper.reset")}
            onPress={handleReset}
            disabled={busy}
          />
        </View>
      </View>

      {/* -------------------------------------------------------------- alt bar
          ZEMİNSİZ ve `box-none`: eskiden opak bir şerit (scrimAt(0.9)) vardı ve
          dokunuşları bilerek yutuyordu, ama fotoğrafın alt kenarını da kesiyordu
          — kullanıcıya "Kaydet'in arkası siyah" olarak görünen şey buydu. Şerit
          kalkınca o bölge yüksek bir kaynakta doğrudan fotoğraf, kısa bir
          kaynakta çerçevenin kendi boşluğu; butonun DIŞINA düşen dokunuş da
          artık GestureDetector'a gidiyor, yani orada da kaydırıp
          yakınlaştırılıyor.

          İÇİNDE TEK ÖĞE + `flex-end`: sağ padding başlıktakiyle (16) aynı, yani
          Kaydet'in sağ kenarı üstteki "Sıfırla"nın sağ kenarıyla aynı dikey
          hatta oturuyor. Sayaç çipi ("2 / 6") KALDIRILDI — kaç fotoğraftan
          kaçıncısında olduğunu kayıt akışının kendi ilerleme göstergesi zaten
          söylüyordu, burada ikinci bir sayaç yalnız kareyi kalabalıklaştırıyor
          (`space-between` düzeni de onunla birlikte gitti). */}
      <View
        pointerEvents="box-none"
        style={{ position: "absolute", left: 0, right: 0, bottom: 0, paddingBottom: insets.bottom + 16, paddingTop: 16, paddingHorizontal: 16, alignItems: "flex-end" }}
      >
        {/* TEK BUTON, İKİ İŞ — kipe göre: çerçeve açıkken "Kırp" (seçilen kareyi
            uygular, foto onun yerine geçer), kapalıyken "Kaydet" (elindeki
            fotoğrafı akışa verir). İkinci bir buton eklenmedi: aynı yerde iki
            birincil eylem, hangisinin kadrajı bitirdiği belirsiz kalıyordu. */}
        <ChromeConfirmButton
          label={cropping ? t("common.cropper.crop") : t("common.cropper.save")}
          onPress={cropping ? handleApplyCrop : handleConfirm}
          busy={busy}
        />
      </View>
    </View>
  );
}

/** Alt barın sağındaki tek birincil eylem ("Kaydet"). */
function ChromeConfirmButton({
  label,
  onPress,
  busy,
}: {
  label: string;
  onPress: () => void;
  busy: boolean;
}) {
  /**
   * ══════════════════════════════════════════════════════════════════════════
   * BEKLEME GÖSTERGESİ = ETİKETİN ÜSTÜNDE İSKELET — SPINNER DEĞİL, BUTON DA
   * DEĞİŞMİYOR.
   * ══════════════════════════════════════════════════════════════════════════
   * Eski hâlde buton, aynı ölçüdeki DÜZ bir pill + `ActivityIndicator` ile
   * komple DEĞİŞTİRİLİYORDU: cam kapsül bir kare için kayboluyor, yerine mat
   * turuncu bir kutu geliyordu — "Kaydet"e basmanın bedeli butonun kendisinin
   * bozulmasıydı. Artık buton olduğu gibi duruyor; yalnız ETİKET boşalıyor ve
   * yerinde tam onun boyunda bir shimmer pill dönüyor.
   *
   * Kalıp Plus sayfasındaki `SelectedBadge` ile birebir aynı (PurchaseSections)
   * ve aynı iki kuralı taşıyor:
   *   • İskelet etiketin YERİNİ ALMIYOR, ÜSTÜNE biniyor (absolute) — metni
   *     düzenden düşürmek iOS'ta kapsülün içeriğini kaydırırdı.
   *   • Mürekkep `onMedia` ailesi: buton turuncu/cam bir MEDYA yüzeyi ve
   *     `SkeletonBox`un varsayılan `surface`/`shimmer`ı modla döner — açık
   *     modda turuncunun üstünde koyu bir kutuya dönerdi.
   *
   * ÖLÇÜ GİZLİ BİR `Text`TEN: iOS'ta etiket SwiftUI'ın içinde, `onLayout`u yok.
   * Aynı tipografiyle (16/600) görünmez bir RN `Text` ölçülüyor; SwiftUI'ın
   * metriğinden birkaç puan sapabilir ama bu bir iskelet — boyu önemli,
   * pikseli değil. Ölçüm gelmeden iskelet çizilmiyor (ilk karede boy yok).
   *
   * ⚠️ BUTON `busy` sırasında CANLI kalıyor (SwiftUI tarafında `disabled` yok,
   * eskiden Host komple sökülerek basılamaz hâle geliyordu). Mükerrer basışı
   * `handleConfirm`/`handleApplyCrop`in ilk satırındaki `busy` kapısı yutuyor.
   */
  const [textBox, setTextBox] = useState<{ width: number; height: number } | null>(null);

  // Aynı sayı tekrar gelirse state'e YAZMIYORUZ: her layout turu alt barı
  // yeniden çizerdi (SelectedBadge'deki ölçüm kuralının aynısı).
  const measureLabel = useCallback((e: LayoutChangeEvent) => {
    const { width, height } = e.nativeEvent.layout;
    setTextBox((prev) =>
      prev && Math.abs(prev.width - width) < 0.5 && Math.abs(prev.height - height) < 0.5
        ? prev
        : { width, height },
    );
  }, []);

  const showSkeleton = busy && textBox !== null;

  // Ölçüm kaynağı — HER ZAMAN ağaçta ve görünmez. Yalnız `busy` iken ölçseydi
  // iskelet ilk karede çizilemezdi.
  // Tek satır: kap CTA_W kadar dar, sarılan uzun bir çeviri iki satırlık bir
  // yükseklik ölçtürür ve iskelet etiketin iki katı boyunda çıkardı.
  const ruler = (
    <Text
      onLayout={measureLabel}
      pointerEvents="none"
      numberOfLines={1}
      style={{ position: "absolute", opacity: 0, fontSize: 16, fontWeight: "600" }}
    >
      {label}
    </Text>
  );

  // Etiketin iskeleti — butonun tam ortasında, dokunuşa kapalı.
  // ⚠️ `zIndex`: SwiftUI Host'un ÜSTÜNDE kalmak zorunda; altında kalırsa opak
  // kapsülün arkasında görünmez olur ve bekleme hiç okunmaz.
  const skeleton = showSkeleton ? (
    <View
      pointerEvents="none"
      style={{ position: "absolute", left: 0, right: 0, top: 0, bottom: 0, alignItems: "center", justifyContent: "center", zIndex: 1 }}
    >
      <SkeletonBox
        width={Math.max(24, textBox!.width)}
        height={Math.max(10, textBox!.height - 4)}
        borderRadius={999}
        color={onMediaAt(0.3)}
        shimmerColor={onMediaAt(0.6)}
      />
    </View>
  ) : null;

  if (Platform.OS === "ios") {
    return (
      // ⚠️ `collapsable={false}`: yalnız düzen taşıyan bir kap native ağaçta
      // doğmuyor ve iskeletin Host'un üstünde kalması bu kabın varlığına bağlı.
      <View collapsable={false} style={{ width: CTA_W, height: CTA_H }}>
        {ruler}
        <Host style={{ width: CTA_W, height: CTA_H }}>
        <SwiftUIButton
          // ⚠️ BOŞ ETİKET: kapsül, cam ve ölçü `frame` ile sabit olduğu için
          // buton olduğu gibi duruyor; değişen tek şey yazının yerini iskeletin
          // alması.
          label={showSkeleton ? "" : label}
          onPress={onPress}
          modifiers={[
            // glassProminent = dolgulu (tint'li) cam. iOS 26 altında sessizce
            // .automatic'e düşeceği için orada "glass" + fallback dolgusu
            // kullanılıyor; iki yolda da sonuç turuncu bir kapsül.
            buttonStyle(HAS_LIQUID_GLASS ? "glassProminent" : "glass"),
            controlSize("large"),
            tint(HAS_LIQUID_GLASS ? colors.accentOrange : colors.onMedia),
            font({ size: 16, weight: "semibold" }),
            frame({ width: CTA_W, height: CTA_H }),
            ...glassFallback({
              shape: "capsule",
              backgroundColor: colors.accentOrange,
              borderColor: colors.accentOrange,
            }),
          ]}
        />
        </Host>
        {skeleton}
      </View>
    );
  }

  return (
    <AnimatedPressable
      onPress={onPress}
      accessibilityRole="button"
      style={{ width: CTA_W, height: CTA_H, borderRadius: 999, borderCurve: "continuous", alignItems: "center", justifyContent: "center", backgroundColor: colors.accentOrange }}
    >
      {ruler}
      {/* Gizleme OPAKLIKLA — iOS'taki boş etiketin karşılığı: metni düzenden
          düşürmek butonun içeriğini kaydırırdı. */}
      <Text style={{ color: colors.onMedia, fontSize: 16, fontWeight: "700", opacity: showSkeleton ? 0 : 1 }}>
        {label}
      </Text>
      {skeleton}
    </AnimatedPressable>
  );
}
