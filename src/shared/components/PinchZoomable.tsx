import type { ReactNode } from "react";
import type { StyleProp, ViewStyle } from "react-native";
import { Gesture, GestureDetector } from "react-native-gesture-handler";
import Animated, {
  Easing,
  measure,
  runOnJS,
  useAnimatedRef,
  useSharedValue,
  withTiming,
} from "react-native-reanimated";

import {
  photoPinchActive,
  setZoomImage,
  zoomProgress,
  zoomRadius,
  zoomRectH,
  zoomRectW,
  zoomRectX,
  zoomRectY,
  zoomScale,
  zoomTranslateX,
  zoomTranslateY,
} from "./pinchZoom";

/** Parmaklar bırakılınca kopyanın yerine dönüş süresi. */
const RELEASE_DURATION = 220;
/** Büyütme tavanı — üstünde jest "kayıyor" gibi hissettiriyor. */
const MAX_SCALE = 3.5;

/**
 * Çocuğunu iki parmakla büyütülebilir yapar (Instagram tarzı basılı-tut).
 *
 * Görselin KENDİSİ burada büyümüyor: jest başında `measure()` ile ekrandaki
 * dikdörtgen ölçülüp kök katmana (PinchZoomOverlay) yazılıyor, büyüyen kopyayı
 * o çiziyor. Sebep, kaynağın her zaman kırpan bir kutunun içinde olması (kart
 * frame'i, bölüm kutusu, ScrollView) — yerinde büyütmek görseli o kutuda
 * kesiyordu.
 *
 * Parmaklar kalkınca kopya kaynağın üstüne geri kapanıp katman sökülüyor.
 */
export default function PinchZoomable({
  uri,
  radius = 0,
  enabled = true,
  style,
  children,
}: {
  uri?: string | null;
  /** Kaynağın köşe yarıçapı — kopya aynı kesimle büyüsün. */
  radius?: number;
  enabled?: boolean;
  style?: StyleProp<ViewStyle>;
  children: ReactNode;
}) {
  const viewRef = useAnimatedRef<Animated.View>();
  // Jest başındaki odak noktası, EKRAN koordinatında. Büyütme bu noktanın
  // etrafında dönüyor: parmakların arasında kalan piksel yerinde kalsın.
  const startFocalX = useSharedValue(0);
  const startFocalY = useSharedValue(0);
  // Parmak sayısı 2'nin altına düştüğünde jest DEVAM ediyor (RNGH pinch tek
  // parmakla bitmiyor) ama `focal` artık kalan tek parmak → referans kayıyor ve
  // görsel o parmağın peşinden sürükleniyordu. Bayrak: iki parmağın altındayken
  // hiçbir güncelleme uygulanmıyor, geri dönülünce referanslar YENİDEN kuruluyor.
  const lostPointers = useSharedValue(false);
  // Ölçek referansı — refingering sonrası `e.scale` sıçramasın diye çarpan.
  const scaleOffset = useSharedValue(1);

  const pinch = Gesture.Pinch()
    .enabled(enabled && !!uri)
    .onStart((e) => {
      const m = measure(viewRef);
      if (!m) return;
      zoomRectX.value = m.pageX;
      zoomRectY.value = m.pageY;
      zoomRectW.value = m.width;
      zoomRectH.value = m.height;
      zoomRadius.value = radius;
      zoomScale.value = 1;
      zoomTranslateX.value = 0;
      zoomTranslateY.value = 0;
      zoomProgress.value = 0;
      // RNGH'ın focal'ı jest'in bağlı olduğu view'a GÖRE; ekran koordinatına
      // çevirmek için ölçülen köşe ekleniyor.
      startFocalX.value = m.pageX + e.focalX;
      startFocalY.value = m.pageY + e.focalY;
      lostPointers.value = false;
      scaleOffset.value = 1;
      photoPinchActive.value = true;
      runOnJS(setZoomImage)(uri ?? null);
    })
    .onUpdate((e) => {
      // Tek parmağa düşüldü: görsel olduğu yerde DONSUN. Kalan parmakla
      // sürüklemek pinch değil, ayrı bir jest olurdu.
      if (e.numberOfPointers < 2) {
        lostPointers.value = true;
        return;
      }
      const cxNow = zoomRectX.value + zoomRectW.value / 2;
      const cyNow = zoomRectY.value + zoomRectH.value / 2;
      if (lostPointers.value) {
        lostPointers.value = false;
        // İki parmağa dönüldü → referansları mevcut GÖRÜNÜME göre yeniden kur,
        // yoksa hem ölçek hem odak bir karede sıçrar.
        //
        // Ölçek: s = e.scale * offset denkleminden offset'i çöz.
        const raw = e.scale === 0 ? 1 : e.scale;
        scaleOffset.value = zoomScale.value / raw;
        // Odak: T = f - c - s(p - c) → p = c + (f - c - T) / s
        // (T mevcut kayma, f yeni odak, c merkez, s mevcut ölçek.)
        const s0 = zoomScale.value === 0 ? 1 : zoomScale.value;
        const fx = zoomRectX.value + e.focalX;
        const fy = zoomRectY.value + e.focalY;
        startFocalX.value =
          cxNow + (fx - cxNow - zoomTranslateX.value) / s0;
        startFocalY.value =
          cyNow + (fy - cyNow - zoomTranslateY.value) / s0;
      }
      const s = Math.max(1, Math.min(MAX_SCALE, e.scale * scaleOffset.value));
      zoomScale.value = s;
      // Karartma ilk yarıda dolar: hafif bir büyütmede ekran kararmasın ama
      // tam açıldığında arka plan tamamen çekilsin.
      zoomProgress.value = Math.min(1, (s - 1) / 1.2);

      // Ölçek MERKEZ etrafında uygulanıyor (transform-origin center); odak
      // noktasını sabit tutmak için kayma: (p - c)(1 - s). Üstüne parmakların
      // ortak kayması (dx/dy) ekleniyor → görsel parmakla gezer.
      const dx = zoomRectX.value + e.focalX - startFocalX.value;
      const dy = zoomRectY.value + e.focalY - startFocalY.value;
      zoomTranslateX.value = dx + (startFocalX.value - cxNow) * (1 - s);
      zoomTranslateY.value = dy + (startFocalY.value - cyNow) * (1 - s);
    })
    .onFinalize(() => {
      // onEnd DEĞİL: jest iptal edilirse (ör. üçüncü parmak, sistem kesintisi)
      // onEnd hiç gelmiyor ve katman ekranda asılı kalıyordu.
      const cfg = { duration: RELEASE_DURATION, easing: Easing.out(Easing.quad) };
      zoomTranslateX.value = withTiming(0, cfg);
      zoomTranslateY.value = withTiming(0, cfg);
      zoomProgress.value = withTiming(0, cfg);
      zoomScale.value = withTiming(1, cfg, (finished) => {
        if (!finished) return;
        // Bayrak kapanışın SONUNDA düşüyor: kart destesi bunu okuyup swipe
        // pan'ini es geçiyor ve pan'in `onEnd`'i parmak kalkışında ateşleniyor.
        photoPinchActive.value = false;
        runOnJS(setZoomImage)(null);
      });
    });

  return (
    <GestureDetector gesture={pinch}>
      {/* collapsable={false}: measure() gerçek bir native view istiyor, RN
          aksi halde tek çocuklu bu sarmalayıcıyı ağaçtan düşürebiliyor. */}
      <Animated.View ref={viewRef} style={style} collapsable={false}>
        {children}
      </Animated.View>
    </GestureDetector>
  );
}
