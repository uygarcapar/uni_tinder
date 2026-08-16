import { useLayoutEffect, useMemo } from "react";
import { Gesture, GestureDetector } from "react-native-gesture-handler";
import Animated, {
  cancelAnimation,
  runOnJS,
  useAnimatedStyle,
  useSharedValue,
  withSpring,
} from "react-native-reanimated";
import * as Haptics from "expo-haptics";
import {
  REPLY_EDGE_GUARD,
  REPLY_MAX_X,
  REPLY_RELEASE_X,
  REPLY_START_RESIST,
  REPLY_TAIL_K,
  REPLY_TRIGGER_TRAVEL,
  REPLY_TRIGGER_X,
} from "@/features/chat/components/RevealContext";

function replyHaptic() {
  Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light).catch(() => {});
}

const SPRING_BACK = { damping: 22, stiffness: 260, mass: 0.6 } as const;

/**
 * SOLDAN SAĞA çekip bırakınca yanıtla (WhatsApp) — satırın kendi jesti + kendi
 * translateX'i. Çekiş satırın TÜM genişliğinden başlatılabilir; balon parmakla
 * sağa gider, REPLY_TRIGGER_X geçilince haptic verir, bırakınca yerine yaylanır
 * ve mesaj composer'ın yanıt şeridine düşer.
 *
 * COMMIT-STORM KURALI: bu ekranda balon başına animated style YASAK'tı (hızlı
 * scroll'da reanimated attach/detach churn'ü → ShadowTree::commit SIGABRT). Bu
 * dosya kuralın etrafından şöyle dolaşır:
 *   • Stil SADECE bu satırın KENDİ `dragX`'ini okur — global bir shared value
 *     değil. Mapper yalnız o satır çekilirken çalışır; diğer satırlar jest
 *     boyunca hiç prop güncellemesi almaz (tek global değer okunsaydı her frame
 *     görünürdeki ~20 satır birden commit ederdi).
 *   • recycleItems açık olduğu için container'lar REMOUNT olmuyor: attach sayısı
 *     scroll'la değil, havuz boyutuyla sınırlı ve sabit.
 *   • Jest nesnesi ile stil, mesaj id'sine BAĞLI DEĞİL (id per-satır shared
 *     value'dan worklet içinde okunur) → recycle'da native handler yeniden
 *     kurulmaz, animated style yeniden bağlanmaz.
 *
 * Yön ayrımı: activeOffsetX(20) sadece sağ çekişi sahiplenir, failOffsetX(-15)
 * sol çekişi liste reveal'ine, failOffsetY dikey hareketi scroll'a bırakır.
 */
function ReplySwipeRow({
  messageId,
  onReply,
  children,
}: {
  // Yanıtlanamaz satırlarda (sistem / silinmiş / gönderilmemiş) "" gelir:
  // jest atıl kalır, balon kımıldamaz.
  messageId: string;
  onReply: (messageId: string) => void;
  children: any;
}) {
  const idSV = useSharedValue(messageId);
  const dragX = useSharedValue(0);
  const armed = useSharedValue(false);
  // Bu çekiş turunda jest devre dışı mı (yanıtlanamaz satır veya sol kenar bandı).
  const inert = useSharedValue(false);

  // Render sırasında shared value'ya yazmak reanimated'da uyarı üretir; layout
  // effect boyamadan önce koşar → dokunuş her zaman güncel id'yi görür.
  // recycle'da (container başka mesaja geçince) uçuşta kalan kaymayı da sıfırlar.
  useLayoutEffect(() => {
    idSV.value = messageId;
    cancelAnimation(dragX);
    dragX.value = 0;
    armed.value = false;
  }, [idSV, dragX, armed, messageId]);

  const gesture = useMemo(
    () =>
      Gesture.Pan()
        // Sadece SAĞ çekiş bu jestin.
        .activeOffsetX(20)
        .failOffsetX(-15)
        .failOffsetY([-12, 12])
        .onBegin((e) => {
          "worklet";
          inert.value = idSV.value === "" || e.x < REPLY_EDGE_GUARD;
        })
        .onUpdate((e) => {
          "worklet";
          if (inert.value) return;
          const raw = e.translationX;
          if (raw <= 0) {
            dragX.value = 0;
            return;
          }
          // Sürtünmeli takip: eşiğe kadar sabit katsayı, sonrası üstel yaklaşma
          // (katsayı giderek artar, REPLY_MAX_X tavanı asla aşılmaz → clamp yok).
          const tail = raw - REPLY_TRIGGER_X;
          dragX.value =
            tail <= 0
              ? raw * REPLY_START_RESIST
              : REPLY_TRIGGER_TRAVEL +
                (REPLY_MAX_X - REPLY_TRIGGER_TRAVEL) *
                  (1 - Math.exp(-tail / REPLY_TAIL_K));

          const next = armed.value ? raw >= REPLY_RELEASE_X : raw >= REPLY_TRIGGER_X;
          if (next !== armed.value) {
            armed.value = next;
            if (next) runOnJS(replyHaptic)();
          }
        })
        .onEnd(() => {
          "worklet";
          if (armed.value && !inert.value && idSV.value !== "") {
            runOnJS(onReply)(idSV.value);
          }
        })
        .onFinalize(() => {
          "worklet";
          armed.value = false;
          dragX.value = withSpring(0, SPRING_BACK);
        }),
    [idSV, dragX, armed, inert, onReply],
  );

  const style = useAnimatedStyle(() => ({
    transform: [{ translateX: dragX.value }],
  }));

  return (
    <GestureDetector gesture={gesture}>
      <Animated.View style={style}>{children}</Animated.View>
    </GestureDetector>
  );
}

export default ReplySwipeRow;
