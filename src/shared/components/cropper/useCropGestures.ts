import { type MutableRefObject, useCallback, useMemo, useRef } from "react";
import { Gesture, type ComposedGesture } from "react-native-gesture-handler";
import {
  runOnJS,
  useAnimatedStyle,
  useSharedValue,
  withSpring,
  withTiming,
} from "react-native-reanimated";
import * as Haptics from "expo-haptics";

import { clamp, maxOffset } from "./cropGeometry";

/**
 * Kırpma kadrajının jest + dönüşüm makinesi — kırpıcı ekranı (CropperOverlay)
 * ile kameranın yerinde kırpma kipi AYNI mantığı kullansın diye ayrı.
 *
 * Bilinen tek parametre farkı `peek`: kırpıcıda kip DIŞINDA pinch bir bakış
 * (bırakınca "ev"e yaylanıyor), kamerada kip dışında hiçbir jest yok.
 */

export type CropTransform = { s: number; tx: number; ty: number };

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

const IDENTITY: CropTransform = { s: MIN_SCALE, tx: 0, ty: 0 };

export function useCropGestures(o: {
  /** Pan + çift dokunuş + KALICI kadraj. */
  cropping: boolean;
  /** Kip DIŞINDA pinch-bakış (kırpıcı true, kamera false). */
  peek: boolean;
  srcW: number;
  srcH: number;
  baseScale: number;
  maxScale: number;
  /** Öteleme sınır kutusu: yatay, dikey (bkz. çağıranın notu). */
  clampW: number;
  clampH: number;
  /** Çerçeve merkezi, JEST KOORDİNAT uzayında (GestureDetector'ın View'ı). */
  focusX: number;
  focusY: number;
}): {
  gesture: ComposedGesture;
  imageStyle: ReturnType<typeof useAnimatedStyle>;
  gridStyle: ReturnType<typeof useAnimatedStyle>;
  latest: MutableRefObject<CropTransform>;
  resetTransform: (animated: boolean, to?: CropTransform) => void;
  resetGestureFlags: () => void;
} {
  const {
    cropping, peek, srcW, srcH, baseScale, maxScale,
    clampW, clampH, focusX, focusY,
  } = o;

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
   * onu bozmamalı. Sıfırlamanın tek yolu `resetTransform` (kırpıcıda Sıfırla
   * butonu).
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
  const latest = useRef<CropTransform>({ s: 1, tx: 0, ty: 0 });
  const commit = useCallback((s: number, x: number, y: number) => {
    latest.current = { s, tx: x, ty: y };
  }, []);

  const edgeHaptic = useCallback(() => {
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light).catch(() => {});
  }, []);

  /**
   * KİP DIŞINDA YALNIZ PINCH (yalnız `peek` iken), o da KALICI DEĞİL.
   *
   * Kaydırma ve çift dokunuş `enabled(cropping)` ile kapalı: kip dışında
   * yapılmış bir kadraj değişikliği, çerçeve hiç açılmamışken sessizce çıktıya
   * geçerdi ("crop'a basmadan zoom yapıyor olmam croplamasın").
   *
   * Pinch `peek` açıkken HER ZAMAN açık ama kip kapalıyken bir BAKIŞ: parmaklar
   * kalkınca `settleBack` kadrajı "ev"e geri yaylandırıyor, yani fotoğrafa
   * yakından bakmak çıktıyı değiştirmiyor. Kalıcı kadraj yalnız kırpma kipinde.
   * `peek` kapalıysa (kamera) kip dışında pinch de yok.
   *
   * Kapı `enabled` ile kuruluyor; `ComposedGesture`da o metot YOK, bu yüzden
   * tanıyıcılara ayrı ayrı veriliyor.
   */
  const gesture = useMemo(() => {
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
      // kullanıcının en son kırptığı hâl). `cropping`/`peek` worklet'e memo
      // kurulurken DEĞERİYLE yakalanıyor ve memo bu değerlere bağımlı, yani kip
      // değişiminde zincir yeniden kuruluyor.
      if (!cropping) {
        // `peek` kapalıyken kip dışında hiçbir tanıyıcı açık değil; buraya
        // ancak kip jestin ortasında kapanırsa düşülür ve o durumda kadraj
        // OLDUĞU gibi bırakılıyor — kip dışında hiçbir şey kalıcı olmuyor.
        if (peek) {
          scale.value = withSpring(homeS.value, SPRING);
          tx.value = withSpring(homeX.value, SPRING);
          ty.value = withSpring(homeY.value, SPRING);
          runOnJS(commit)(homeS.value, homeX.value, homeY.value);
        }
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

    // Kip dışında da açık (peek): yakınlaştırılabiliyor, bırakınca geri
    // dönüyor (bkz. settleBack).
    const pinch = Gesture.Pinch()
      .enabled(cropping || peek)
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
        const fx = e.focalX - focusX;
        const fy = e.focalY - focusY;
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
        const fx = e.x - focusX;
        const fy = e.y - focusY;
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
    cropping, peek,
    baseScale, maxScale, srcW, srcH, clampW, clampH, focusX, focusY,
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
   * Kadrajı `to`ya (varsayılan taban: tam genişlik, ortalanmış) çeker — "ev"
   * dahil — ve JS aynasını yazar.
   *
   * `animated` AYRIMI ŞART: fotoğrafın KENDİSİ de değiştiğinde (kırpma uygulandı
   * ya da Sıfırla özgün dosyaya döndü) yay kullanılamaz — yeni görüntü eski
   * kadrajın altında bir an yanlış ölçekte/yerde durur, sonra yerine kayar.
   * Fotoğraf aynı kalıyorsa (kadrajı yalnız geri alma) yay doğru geri bildirim.
   *
   * Jest bayraklarına (gestureActive/atEdge/pinchPointers) DOKUNMAZ: Sıfırla
   * bir jestin ortasında basılabilir; bayrakları yalnız oturum başı
   * (`resetGestureFlags`) sıfırlıyor.
   */
  const resetTransform = useCallback((animated: boolean, to: CropTransform = IDENTITY) => {
    scale.value = animated ? withSpring(to.s, SPRING) : to.s;
    tx.value = animated ? withSpring(to.tx, SPRING) : to.tx;
    ty.value = animated ? withSpring(to.ty, SPRING) : to.ty;
    homeS.value = to.s;
    homeX.value = to.tx;
    homeY.value = to.ty;
    latest.current = { s: to.s, tx: to.tx, ty: to.ty };
  }, [scale, tx, ty, homeS, homeX, homeY]);

  /** Jest bayraklarını boşa çeker — yalnız yeni oturum başında. */
  const resetGestureFlags = useCallback(() => {
    gestureActive.value = 0;
    atEdge.value = false;
    pinchPointers.value = 0;
  }, [gestureActive, atEdge, pinchPointers]);

  return { gesture, imageStyle, gridStyle, latest, resetTransform, resetGestureFlags };
}
