import { useCallback, useRef, useState } from "react";
import type {
  NativeScrollEvent,
  NativeSyntheticEvent,
  StyleProp,
  ViewStyle,
} from "react-native";
import { BottomSheetScrollView } from "@gorhom/bottom-sheet";
import type { SharedValue } from "react-native-reanimated";
import {
  TOP_HIT_EPS,
  impactIntensity,
  isNearBottom,
  zoomImpactAnimation,
} from "./cardScrollTuning";

/**
 * Sheet içindeki SwipeCard'ın scroller'ı (PreviewModal, LikerSwipeModal).
 *
 * Kart sheet'in içindeyken scroll'u kartın kendi BounceScrollView'ı DEĞİL bu
 * BottomSheetScrollView yapar: gorhom sheet↔scroll koordinasyonu (içerik
 * top'tayken aşağı çekince sheet sürüklenip kapanır) sadece kendi scrollable'ı
 * ile çalışır, kartın içindeki kayıtsız native scroll ile çalışmaz. Bu yüzden
 * kart `expanded={false}` ile gelir.
 *
 * Davranış Discover'daki kartla birebir aynı — sabitler/yardımcılar
 * cardScrollTuning'den:
 *   - alt uçta bounce açık,
 *   - top'ta bounce KAPALI (pull-down = sheet'i kapatma jesti),
 *   - momentum top'a çarpınca çarpma şiddetiyle orantılı foto zoom'u.
 *
 * Fark sadece threading: gorhom `onScroll`'u runOnJS ile forward ettiği için
 * mantık JS thread'inde çalışır (kartta worklet). zoomImpact shared value'su
 * JS'ten sürülür, animasyon yine UI thread'de koşar.
 *
 * State burada tutulur ve kart `children` olarak geçer → bounces toggle'ında
 * ağır kart ağacı yeniden render edilmez.
 */
export default function CardSheetScrollView({
  zoomImpact,
  scrollEnabled = true,
  style,
  contentContainerStyle,
  children,
}: {
  /** SwipeCard'a da verilen zoom sinyali (0-1). */
  zoomImpact: SharedValue<number>;
  scrollEnabled?: boolean;
  style?: StyleProp<ViewStyle>;
  contentContainerStyle?: StyleProp<ViewStyle>;
  children: React.ReactNode;
}) {
  const [bounces, setBounces] = useState(false);

  // Parmak ekranda mı — momentum = parmak kalktıktan sonraki serbest kayış.
  // gorhom momentum event'lerini forward etmiyor (kendi handler'ında tüketiyor),
  // begin/end drag ise forward ediliyor; momentum'u oradan türetiyoruz.
  const draggingRef = useRef(false);
  // Top'a çarpma tespiti için önceki frame'in pozisyonu ve hızı (px/event).
  const prevY = useRef(0);
  const prevSpeed = useRef(0);
  // Tek momentum döngüsünde zoom bir kez tetiklensin.
  const justHitRef = useRef(false);

  const handleScrollBeginDrag = useCallback(() => {
    draggingRef.current = true;
    justHitRef.current = false;
  }, []);

  const handleScrollEndDrag = useCallback(() => {
    draggingRef.current = false;
    justHitRef.current = false;
  }, []);

  const handleScroll = useCallback(
    (e: NativeSyntheticEvent<NativeScrollEvent>) => {
      const { contentOffset, contentSize, layoutMeasurement } = e.nativeEvent;
      const y = contentOffset.y;

      const nearBottom = isNearBottom(
        y,
        contentSize.height,
        layoutMeasurement.height,
      );
      setBounces((prev) => (prev === nearBottom ? prev : nearBottom));

      // Bu event'te 0'a indik, öncekinde inmemiştik ve parmak ekranda değildi.
      // Şiddet = son iki frame'in en hızlısı; clamp event'i hızı kırpabildiği
      // için önceki frame de dikkate alınır.
      const speed = prevY.current - y;
      if (
        !draggingRef.current &&
        y <= TOP_HIT_EPS &&
        prevY.current > TOP_HIT_EPS &&
        !justHitRef.current
      ) {
        const intensity = impactIntensity(Math.max(speed, prevSpeed.current));
        if (intensity > 0) {
          justHitRef.current = true;
          zoomImpact.value = zoomImpactAnimation(intensity);
        }
      }
      prevSpeed.current = speed;
      prevY.current = y;
    },
    [zoomImpact],
  );

  return (
    <BottomSheetScrollView
      style={style}
      contentContainerStyle={contentContainerStyle}
      showsVerticalScrollIndicator={false}
      bounces={bounces}
      alwaysBounceVertical={false}
      scrollEnabled={scrollEnabled}
      nestedScrollEnabled
      onScroll={handleScroll}
      onScrollBeginDrag={handleScrollBeginDrag}
      onScrollEndDrag={handleScrollEndDrag}
    >
      {children}
    </BottomSheetScrollView>
  );
}
