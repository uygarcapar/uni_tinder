import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import {
  ActivityIndicator,
  Platform,
  StyleSheet,
  Text,
  useWindowDimensions,
  View,
} from "react-native";
import { Image } from "expo-image";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { Gesture, GestureDetector } from "react-native-gesture-handler";
import Animated, {
  runOnJS,
  useAnimatedStyle,
  useSharedValue,
  withSpring,
  withTiming,
} from "react-native-reanimated";
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
  clamp,
  coverScale,
  frameWindow,
  maxOffset,
  maxZoom,
  toSourceRect,
} from "./cropGeometry";

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
const OUT_W = 900;
const OUT_H = 1200;
const QUALITY = 0.85;

/**
 * Ölçek TABANI — ve artık SERT bir taban.
 *
 * Eskiden 0.85'lik bir lastik bölge vardı (bırakınca 1'e yaylanıyordu). O bölge
 * taban ölçeğin tanımıyla çelişiyor: `scale = 1` "fotoğrafın eni ekranın eni"
 * demek, yani 1'in altındaki her değer fotoğrafı sağdan ve soldan ekranın
 * içine çekip iki yanda boşluk açıyor. Parmak kalkınca geri yaylanıyor olması
 * yetmiyordu — en zoom out'ta görülen kare o anda yanlış. Taban 1'de sert:
 * daha fazla uzaklaştırma denemesi hiç hareket etmiyor.
 */
const MIN_SCALE = 1;
const SPRING = { damping: 20, stiffness: 180, mass: 0.9 };

/**
 * Tek karede uygulanabilecek en büyük ölçek sıçraması.
 *
 * `scaleChange` = current.scale / previous.scale ve UIPinchGestureRecognizer
 * parmak sayısı değiştiğinde `scale`'i yeniden tabanlıyor. O karede oran
 * saçmalıyor (0.2 gibi) ve görüntü tek frame'de tabana çakılıyordu — kullanıcıya
 * "zoom'um kayboldu" olarak görünen ikinci yol.
 * 60fps'te insan parmağı bir karede %25'ten fazla açamaz.
 */
const MAX_SCALE_STEP = 1.25;

/**
 * Çift dokunuşun kabul ettiği en fazla ağırlık merkezi kayması (pt).
 *
 * VARSAYILANI BIRAKMA: RNGH'nin iOS tap tanıyıcısında `maxDistSq` NAN, yani
 * mesafe kontrolü HİÇ çalışmıyor (apple/Handlers/RNTapHandler.m:59). Üstelik
 * `_tapsSoFar` her `touchesBegan` çağrısında artıyor — pinch'in iki parmağı
 * ayrı olaylarda indiğinde TEK pinch iki dokunuş sayılıyor ve
 * `_maxNumberOfTouches >= _minPointers` de sağlandığı için çift dokunuş
 * tetikleniyordu. Ölçüt ağırlık merkezi: ikinci parmak inince merkez
 * parmakların ortasına sıçrar, bu da eşiği aşar.
 */
const TAP_SLOP = 24;

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

/**
 * Ara kırpmaların JPEG kalitesi — final kaydın QUALITY'sinden YÜKSEK.
 *
 * Kullanıcı üst üste kırpabiliyor ve her kırpma yeniden JPEG kodluyor, yani
 * nesil kaybı birikiyor. Ara adımlarda 0.95: dosya biraz büyük ama o dosya
 * yalnız bu ekranda yaşıyor, upload'a giden sürüm son adımda bir kez
 * QUALITY ile kodlanıyor. Ara adımlar ayrıca OUT_W/OUT_H'ye KÜÇÜLTÜLMÜYOR —
 * her kırpmada ölçeklemek çözünürlüğü basamak basamak düşürürdü.
 */
const STEP_QUALITY = 0.95;

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

  const scale = useSharedValue(1);
  const tx = useSharedValue(0);
  const ty = useSharedValue(0);
  const gestureActive = useSharedValue(0);
  const atEdge = useSharedValue(false);
  /**
   * Kadrajın KALICI hâli — "ev".
   *
   * Kırpma kipinde her jest bittiğinde buraya yazılıyor; kip DIŞINDAKİ pinch
   * (peek) bırakılınca buraya geri yaylanıyor. Tabana (1/0/0) geri dönmüyor:
   * kullanıcı daha önce kırptıysa fotoğrafın yeni hâli bu ve yakından bakmak
   * onu bozmamalı. Sıfırlamanın tek yolu Sıfırla butonu.
   */
  const homeS = useSharedValue(1);
  const homeX = useSharedValue(0);
  const homeY = useSharedValue(0);
  /** Aktif pinch'in son bilinen parmak sayısı (tabanlama sıçramasını yakalar). */
  const pinchPointers = useSharedValue(0);

  /**
   * Jest değerlerinin JS tarafındaki AYNASI.
   *
   * "Seç" işleyicisinde `scale.value`'yu doğrudan okumuyoruz: Fabric altında
   * UI thread'den senkron okuma bayat kalabiliyor. Her jest bittiğinde buraya
   * yazıyoruz; buton zaten ancak aktif jest yokken basılabiliyor.
   */
  const latest = useRef({ s: 1, tx: 0, ty: 0 });
  const commit = useCallback((s: number, x: number, y: number) => {
    latest.current = { s, tx: x, ty: y };
  }, []);

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

  // ------------------------------------------------------------------ köprü
  const present = useCallback((request: CropRequest, settle: (o: CropOutcome) => void) => {
    scale.value = 1;
    tx.value = 0;
    ty.value = 0;
    // "Ev" de sıfırlanıyor: kadraj oturum başına, sıradaki fotoğrafın kırpması
    // öncekinin ölçeğini devralmamalı (kayıt akışı 6 fotoğrafı arka arkaya
    // açıyor).
    homeS.value = 1;
    homeX.value = 0;
    homeY.value = 0;
    gestureActive.value = 0;
    atEdge.value = false;
    pinchPointers.value = 0;
    latest.current = { s: 1, tx: 0, ty: 0 };
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
  }, [scale, tx, ty, homeS, homeX, homeY, gestureActive, atEdge, pinchPointers]);

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

  const edgeHaptic = useCallback(() => {
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light).catch(() => {});
  }, []);

  /**
   * KİP DIŞINDA YALNIZ PINCH, o da KALICI DEĞİL.
   *
   * Kaydırma ve çift dokunuş `enabled(cropping)` ile kapalı: kip dışında
   * yapılmış bir kadraj değişikliği, çerçeve hiç açılmamışken sessizce çıktıya
   * geçerdi ("crop'a basmadan zoom yapıyor olmam croplamasın").
   *
   * Pinch ise HER ZAMAN açık ama kip kapalıyken bir BAKIŞ (peek): parmaklar
   * kalkınca `settleBack` kadrajı tabana geri yaylandırıyor, yani fotoğrafa
   * yakından bakmak çıktıyı değiştirmiyor. Kalıcı kadraj yalnız kırpma kipinde.
   *
   * Kapı `enabled` ile kuruluyor; `ComposedGesture`da o metot YOK, bu yüzden
   * tanıyıcılara ayrı ayrı veriliyor.
   */
  const gestures = useMemo(() => {
    const clampTranslate = (notify: boolean) => {
      "worklet";
      const pps = baseScale * scale.value;
      const mx = maxOffset(srcW * pps, clampW);
      const my = maxOffset(srcH * pps, clampH);
      const nx = clamp(tx.value, -mx, mx);
      const ny = clamp(ty.value, -my, my);
      const hit = nx !== tx.value || ny !== ty.value;
      tx.value = nx;
      ty.value = ny;
      // Haptik KENAR BAŞINA bir kez — her frame'de tetiklenirse titreşim
      // sürekli çalar ve jest tökezler.
      if (notify) {
        if (hit && !atEdge.value) {
          atEdge.value = true;
          runOnJS(edgeHaptic)();
        } else if (!hit && atEdge.value) {
          atEdge.value = false;
        }
      }
    };

    const settleBack = () => {
      "worklet";
      gestureActive.value = 0;
      atEdge.value = false;
      // Kip KAPALIYSA jest bir bakıştı: kadraj "ev"e geri dönüyor (taban değil,
      // kullanıcının en son kırptığı hâl). `cropping` worklet'e memo kurulurken
      // DEĞERİYLE yakalanıyor ve memo bu state'e bağımlı, yani kip değişiminde
      // zincir yeniden kuruluyor.
      if (!cropping) {
        scale.value = withSpring(homeS.value, SPRING);
        tx.value = withSpring(homeX.value, SPRING);
        ty.value = withSpring(homeY.value, SPRING);
        runOnJS(commit)(homeS.value, homeX.value, homeY.value);
        return;
      }
      if (scale.value < MIN_SCALE) {
        // Taban sert olduğu için buraya normalde HİÇ girilmiyor; yay (underdamped
        // SPRING) 1'in bir tık altına sarktığında devreye giren emniyet kemeri.
        // Hedefleri ÖNCE hesaplıyoruz: `withSpring` atandığı anda `.value`
        // animasyonun okunması güvenilmez oluyor.
        const mx = maxOffset(srcW * baseScale, clampW);
        const my = maxOffset(srcH * baseScale, clampH);
        const targetX = clamp(tx.value, -mx, mx);
        const targetY = clamp(ty.value, -my, my);
        scale.value = withSpring(MIN_SCALE, SPRING);
        tx.value = withSpring(targetX, SPRING);
        ty.value = withSpring(targetY, SPRING);
        homeS.value = MIN_SCALE;
        homeX.value = targetX;
        homeY.value = targetY;
        runOnJS(commit)(MIN_SCALE, targetX, targetY);
        return;
      }
      // Kırpma kipinde biten her jest kadrajı KALICI yapıyor: hem "ev" hem de
      // onayın okuduğu `latest` buradan yazılıyor.
      homeS.value = scale.value;
      homeX.value = tx.value;
      homeY.value = ty.value;
      runOnJS(commit)(scale.value, tx.value, ty.value);
    };

    /**
     * ARTIMLI payload şart: `Simultaneous` altında kendi snapshot'ından
     * `startTx + translationX` hesaplayan bir pan, pinch'in aynı karedeki
     * yazımlarını her frame silerdi.
     */
    const pan = Gesture.Pan()
      .enabled(cropping)
      .onStart(() => {
        "worklet";
        gestureActive.value = 1;
      })
      .onChange((e) => {
        "worklet";
        tx.value += e.changeX;
        ty.value += e.changeY;
        clampTranslate(true);
      })
      .onFinalize(settleBack);

    // `enabled` YOK: kip dışında da yakınlaştırılabiliyor, bırakınca geri
    // dönüyor (bkz. settleBack).
    const pinch = Gesture.Pinch()
      .onStart((e) => {
        "worklet";
        gestureActive.value = 1;
        pinchPointers.value = e.numberOfPointers;
      })
      .onChange((e) => {
        "worklet";
        // Parmak eklenip çıkarıldığı KAREYİ atla: hem `scaleChange` hem odak
        // noktası o karede süreksiz. Bir sonraki karede yeni tabandan devam
        // ediyoruz — kullanıcı ölçeğini kaybetmiyor.
        if (e.numberOfPointers !== pinchPointers.value) {
          pinchPointers.value = e.numberOfPointers;
          return;
        }
        if (!Number.isFinite(e.scaleChange) || e.scaleChange <= 0) return;
        const prev = scale.value;
        const step = clamp(e.scaleChange, 1 / MAX_SCALE_STEP, MAX_SCALE_STEP);
        const next = clamp(prev * step, MIN_SCALE, maxScale);
        const k = next / prev;
        // Parmakların altındaki nokta sabit kalsın: f = t + p·s, p sabit
        // tutulunca t' = f + (t − f)·(s'/s).
        const fx = e.focalX - winCX;
        const fy = e.focalY - winCY;
        scale.value = next;
        tx.value = fx + (tx.value - fx) * k;
        ty.value = fy + (ty.value - fy) * k;
        // Taban sert: ölçek 1'in altına inemediği için her karede clamp'leniyor
        // (eski lastik bölgede, geri yaylanırken görüntü kenara yapışmasın diye
        // atlanıyordu).
        clampTranslate(false);
      })
      .onFinalize(settleBack);

    const doubleTap = Gesture.Tap()
      .enabled(cropping)
      .numberOfTaps(2)
      .maxDuration(260)
      .maxDistance(TAP_SLOP)
      .onEnd((e) => {
        "worklet";
        // İkinci savunma hattı: tanıyıcı yine de iki parmakla biterse bu bir
        // pinch'tir, çift dokunuş değil.
        if (e.numberOfPointers > 1) return;
        const target = scale.value > 1.05 ? MIN_SCALE : Math.min(2.2, maxScale);
        const k = target / scale.value;
        const fx = e.x - winCX;
        const fy = e.y - winCY;
        const nextX = fx + (tx.value - fx) * k;
        const nextY = fy + (ty.value - fy) * k;
        const pps = baseScale * target;
        const mx = maxOffset(srcW * pps, clampW);
        const my = maxOffset(srcH * pps, clampH);
        const finalX = clamp(nextX, -mx, mx);
        const finalY = clamp(nextY, -my, my);
        scale.value = withSpring(target, SPRING);
        tx.value = withSpring(finalX, SPRING);
        ty.value = withSpring(finalY, SPRING);
        // Çift dokunuş yalnız kipin İÇİNDE açık → sonucu kalıcı.
        homeS.value = target;
        homeX.value = finalX;
        homeY.value = finalY;
        runOnJS(commit)(target, finalX, finalY);
      });

    return Gesture.Simultaneous(pinch, pan, doubleTap);
  }, [
    cropping,
    baseScale, maxScale, srcW, srcH, clampW, clampH, winCX, winCY,
    scale, tx, ty, homeS, homeX, homeY,
    gestureActive, atEdge, pinchPointers, commit, edgeHaptic,
  ]);

  const imageStyle = useAnimatedStyle(() => ({
    transform: [
      { translateX: tx.value },
      { translateY: ty.value },
      { scale: scale.value },
    ] as const,
  }));

  const gridStyle = useAnimatedStyle(() => ({
    opacity: withTiming(gestureActive.value ? 1 : 0.25, { duration: 160 }),
  }));

  /**
   * Çerçeve katmanının (karartma + ızgara + köşe tırnakları) iniş/kalkışı.
   *
   * Katman AĞAÇTA KALIYOR, yalnız opaklığı dönüyor: koşullu render'da karartmanın
   * dört dikdörtgeni ilk karede birden belirip göz kırpıyordu. Katmanın içinde
   * cam YOK — üstteki butonlar bu View'ın KARDEŞİ, yoksa animasyonlu opaklık
   * liquid glass'ı sessizce düşürürdü (bkz. shared/theme/glass.ts notları).
   */
  const frameStyle = useAnimatedStyle(
    () => ({ opacity: withTiming(cropping ? 1 : 0, { duration: 180 }) }),
    [cropping],
  );

  // ------------------------------------------------------------------ eylemler
  /**
   * Kadrajı tabana (tam genişlik, ortalanmış) döndürür — "ev" dahil.
   *
   * `animated` AYRIMI ŞART: fotoğrafın KENDİSİ de değiştiğinde (kırpma uygulandı
   * ya da Sıfırla özgün dosyaya döndü) yay kullanılamaz — yeni görüntü eski
   * kadrajın altında bir an yanlış ölçekte/yerde durur, sonra yerine kayar.
   * Fotoğraf aynı kalıyorsa (kadrajı yalnız geri alma) yay doğru geri bildirim.
   */
  const resetTransform = useCallback((animated: boolean) => {
    scale.value = animated ? withSpring(MIN_SCALE, SPRING) : MIN_SCALE;
    tx.value = animated ? withSpring(0, SPRING) : 0;
    ty.value = animated ? withSpring(0, SPRING) : 0;
    homeS.value = MIN_SCALE;
    homeX.value = 0;
    homeY.value = 0;
    latest.current = { s: MIN_SCALE, tx: 0, ty: 0 };
  }, [scale, tx, ty, homeS, homeX, homeY]);

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
   * (bkz. settleBack), yani "kırpma en zoom out'tan başlar" kuralı kendiliğinden
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
   * STEP_QUALITY ile kodlanıyor (bkz. o sabit).
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
    const context = ImageManipulator.manipulate(working.uri);
    let ref: Awaited<ReturnType<typeof context.renderAsync>> | null = null;
    try {
      context.crop(rect);
      ref = await context.renderAsync();
      const result = await ref.saveAsync({ compress: STEP_QUALITY, format: SaveFormat.JPEG });
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
      ref?.release?.();
      context.release?.();
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

  const scrim = scrimAt(0.72);
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

      {/* Karartma: pencerenin dört yanına dikdörtgen. Yuvarlak delik svg
          maskesi gerektirirdi; Apple Photos da keskin köşe kullanıyor.
          Tamamı KIRPMA KİPİNE bağlı — kip kapalıyken fotoğraf çıplak. */}
      <Animated.View pointerEvents="none" style={[StyleSheet.absoluteFill, frameStyle]}>
        <View style={{ position: "absolute", left: 0, right: 0, top: 0, height: winTop, backgroundColor: scrim }} />
        <View style={{ position: "absolute", left: 0, right: 0, top: winTop + layout.winH, bottom: 0, backgroundColor: scrim }} />
        <View style={{ position: "absolute", left: 0, width: winLeft, top: winTop, height: layout.winH, backgroundColor: scrim }} />
        <View style={{ position: "absolute", right: 0, width: winLeft, top: winTop, height: layout.winH, backgroundColor: scrim }} />

        <Animated.View
          style={[
            { position: "absolute", left: winLeft, top: winTop, width: layout.winW, height: layout.winH },
            gridStyle,
          ]}
        >
          {[1, 2].map((i) => (
            <View
              key={`v${i}`}
              style={{ position: "absolute", top: 0, bottom: 0, left: (layout.winW * i) / 3, width: StyleSheet.hairlineWidth, backgroundColor: onMediaAt(0.28) }}
            />
          ))}
          {[1, 2].map((i) => (
            <View
              key={`h${i}`}
              style={{ position: "absolute", left: 0, right: 0, top: (layout.winH * i) / 3, height: StyleSheet.hairlineWidth, backgroundColor: onMediaAt(0.28) }}
            />
          ))}
        </Animated.View>

        <CornerTicks left={winLeft} top={winTop} width={layout.winW} height={layout.winH} />
      </Animated.View>

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
  // Kırpma sürerken Host, aynı ölçüdeki düz bir pill + spinner ile DEĞİŞTİRİLİR:
  // native SwiftUI butonunun üstüne RN spinner bindirmek katman sırasına bağlı
  // kalırdı, ölçü aynı olduğu için alt bar zıplamıyor.
  if (busy) {
    return (
      <View
        style={{ width: CTA_W, height: CTA_H, borderRadius: 999, borderCurve: "continuous", alignItems: "center", justifyContent: "center", backgroundColor: colors.accentOrange, opacity: 0.7 }}
      >
        <ActivityIndicator size="small" color={colors.onMedia} />
      </View>
    );
  }

  if (Platform.OS === "ios") {
    return (
      <Host style={{ width: CTA_W, height: CTA_H }}>
        <SwiftUIButton
          label={label}
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
    );
  }

  return (
    <AnimatedPressable
      onPress={onPress}
      accessibilityRole="button"
      style={{ width: CTA_W, height: CTA_H, borderRadius: 999, borderCurve: "continuous", alignItems: "center", justifyContent: "center", backgroundColor: colors.accentOrange }}
    >
      <Text style={{ color: colors.onMedia, fontSize: 16, fontWeight: "700" }}>
        {label}
      </Text>
    </AnimatedPressable>
  );
}

/** Çerçevenin dört köşesindeki L biçimli tırnaklar. */
function CornerTicks({ left, top, width, height }: { left: number; top: number; width: number; height: number }) {
  const LEN = 22;
  const THICK = 2;
  const tick = onMediaAt(0.95);
  const corners = [
    { x: left, y: top, hx: 0, hy: 0, vx: 0, vy: 0 },
    { x: left + width - LEN, y: top, hx: 0, hy: 0, vx: LEN - THICK, vy: 0 },
    { x: left, y: top + height - LEN, hx: 0, hy: LEN - THICK, vx: 0, vy: 0 },
    { x: left + width - LEN, y: top + height - LEN, hx: 0, hy: LEN - THICK, vx: LEN - THICK, vy: 0 },
  ];
  return (
    <>
      {corners.map((c, i) => (
        <View key={i} style={{ position: "absolute", left: c.x, top: c.y, width: LEN, height: LEN }}>
          <View style={{ position: "absolute", left: c.hx, top: c.hy, width: LEN, height: THICK, backgroundColor: tick }} />
          <View style={{ position: "absolute", left: c.vx, top: c.vy, width: THICK, height: LEN, backgroundColor: tick }} />
        </View>
      ))}
    </>
  );
}
