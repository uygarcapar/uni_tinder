import { useEffect, useState } from "react";
import { View } from "react-native";
import Animated, {
  Easing,
  runOnJS,
  useAnimatedStyle,
  useSharedValue,
  withTiming,
} from "react-native-reanimated";
import { useAppSelector } from "@/shared/hooks/redux";
import TypingIndicator, {
  TYPING_BUBBLE_HEIGHT,
} from "@/features/chat/components/TypingIndicator";

type Props = {
  conversationId: string;
  myUserId?: string;
};

// Satırın SABİT yüksekliği (balon + composer fade bandına nefes payı). Giriş
// animasyonu sırasında bu yükseklik DEĞİŞMEZ: yükseklik de animasyonlansaydı
// her frame yeni bir footer layout olayı doğar, maintainScrollAtEnd(footerLayout)
// frame başına bir scrollToEnd tetiklerdi. Yükseklik bir kerede açılır, balon
// onun içinde aşağıdan yukarı kayar.
const TYPING_GAP = 6;
export const TYPING_ROW_HEIGHT = TYPING_BUBBLE_HEIGHT + TYPING_GAP;

const ENTER_MS = 260;
const EXIT_MS = 150;

/**
 * Typing göstergesi satırı — listenin FOOTER'ı. Selector'ı ChatScreen'de değil
 * BURADA tutuyoruz: karşı taraf yazmaya başlayıp bıraktıkça sadece bu küçük
 * satır re-render olur, ChatScreen + liste değil.
 *
 * Gösterge liste İÇERİĞİ olarak duruyor (composer'ın üstüne overlay DEĞİL):
 * böylece son balonu örtmez ve klavye açıkken de composer'ın üstünde kalır —
 * satır belirince footer boyu değişir, ChatMessageList'in
 * maintainScrollAtEnd.on.footerLayout tetikleyicisi listeyi (dipteysek) yumuşakça
 * o kadar kaydırır. Eskiden bu tetikleyici kapalı olduğu için satır klavye/
 * composer inset'inin altında kalabiliyordu.
 */
export function ChatTypingRow({ conversationId, myUserId }: Props) {
  const partnerTyping = useAppSelector((s: any) => {
    const map = s.chat.typingByConv[conversationId];
    if (!map) return false;
    for (const uid in map) if (uid !== myUserId) return true;
    return false;
  });

  // Çıkış animasyonu bitene kadar mount'ta kalır (unmount'ı animasyon bitirir).
  const [mounted, setMounted] = useState(false);
  const progress = useSharedValue(0);

  useEffect(() => {
    if (!partnerTyping) return;
    progress.value = 0; // her yeni girişte aşağıdan başla
    setMounted(true);
  }, [partnerTyping, progress]);

  useEffect(() => {
    if (!mounted) return;
    if (partnerTyping) {
      progress.value = withTiming(1, {
        duration: ENTER_MS,
        easing: Easing.out(Easing.cubic),
      });
      return;
    }
    progress.value = withTiming(
      0,
      { duration: EXIT_MS, easing: Easing.in(Easing.quad) },
      (finished) => {
        if (finished) runOnJS(setMounted)(false);
      },
    );
  }, [mounted, partnerTyping, progress]);

  const bubbleStyle = useAnimatedStyle(() => ({
    opacity: progress.value,
    transform: [{ translateY: (1 - progress.value) * TYPING_ROW_HEIGHT }],
  }));

  if (!mounted) return null;

  return (
    <View
      style={{
        height: TYPING_ROW_HEIGHT,
        paddingHorizontal: 12,
        paddingBottom: TYPING_GAP,
        justifyContent: "flex-end",
        // Balon satırın altından yükselirken alttaki mesaja taşmasın.
        overflow: "hidden",
      }}
    >
      <Animated.View style={bubbleStyle}>
        <TypingIndicator />
      </Animated.View>
    </View>
  );
}
