import { memo, useEffect, useRef, useState } from "react";
import { View, Text, TouchableOpacity, Pressable, Dimensions } from "react-native";
import { useTranslation } from "react-i18next";
import { Check, CheckCheck, Clock, AlertCircle } from "lucide-react-native";
import SFIcon from "@/shared/components/SFIcon";
import ReplyPreview from "@/features/chat/components/ReplyPreview";
import { REVEAL_MAX } from "@/features/chat/components/RevealContext";
import { messageContentEqual } from "@/features/chat/messageEquality";
import { colors } from "../../../shared/theme/colors";

// Uzun basınca açılan MessageActionSheet balon klonunun köşe yarıçapı.
const HIGHLIGHT_RADIUS = 24;
const STATUS_GRAY = "#9ca3af";
// Satırlar liste genişliğinde (ekran + REVEAL_MAX) — balon max genişliği EKRANA
// göre hesaplanır, yoksa %78 reveal şeridini de sayıp fazla geniş olurdu.
const BUBBLE_MAX_WIDTH = Math.round(Dimensions.get("window").width * 0.78);

/**
 * Tek mesaj baloncuğu — TEXT-ONLY ve TAMAMEN STATİK (reanimated YOK).
 *
 * NEDEN reanimated yok: per-balon useAnimatedStyle (press-scale + reveal
 * translateX) hızlı scroll'da yüzlerce mount/unmount'ta reanimated attach/detach
 * churn'ü yaratıp Fabric commit-storm'una (ShadowTree::commit SIGABRT) ve blank
 * balonlara yol açıyordu — teşhis anahtarıyla (CHAT_DIAG_MINIMAL_BUBBLES) kanıtlı.
 *
 * Reveal artık BURADA DEĞİL: ChatMessageList tüm listeyi TEK animated transform
 * ile kaydırır (görsel aynı — eski tasarımda da tüm satırlar aynı revealX ile
 * kayıyordu). Satır, ekran genişliğinden REVEAL_MAX kadar geniştir; saat/okundu
 * kolonu satırın SAĞ İÇİNDE (right:0, ekran dışında park), liste sola kayınca
 * ekrana girer. Out-of-bounds absolute hack'i de böylece kalktı.
 *
 * Press feedback: Pressable'ın pressed style'ı (anlık scale) — animasyon lib'i yok.
 */
function MessageBubble({
  message,
  isOwn,
  onLongPress,
  onReplyTap,
  onRetryTap,
  i18nResolver,
}: any) {
  const { t } = useTranslation();
  const bubbleRef = useRef<any>(null);
  // Press feedback: state ile anlık shrink. Fonksiyon-style KULLANMA —
  // css-interop (className) + fonksiyon-style kombinasyonu style'ı düşürüyor
  // (balon arka planı kayboluyordu). Düz obje style şart.
  const [pressed, setPressed] = useState(false);
  // Uzun basma menüsü açıkken gerçek balon gizlenir — görünen, MessageActionSheet
  // içindeki klondur (yoksa balon "kopyalanmış" gibi ikili görünür).
  const [hiddenForMenu, setHiddenForMenu] = useState(false);
  // recycleItems açık: container başka mesaja geçince component REMOUNT EDİLMEZ,
  // in-place reconcile edilir → pressed/hidden state'i sızmasın diye id değişiminde sıfırla.
  useEffect(() => {
    setPressed(false);
    setHiddenForMenu(false);
  }, [message.id]);

  const handleLongPress = () => {
    if (!onLongPress) return;
    // Scale feedback SADECE uzun basışta — normal dokunuşta değil.
    setPressed(true);
    if (!bubbleRef.current?.measureInWindow) {
      onLongPress(null);
      return;
    }
    bubbleRef.current.measureInWindow((x: number, y: number, width: number, height: number) => {
      // setHidden: MessageActionSheet açılırken orijinali gizler, kapanış
      // animasyonu bitince geri gösterir.
      onLongPress({
        x,
        y,
        width,
        height,
        radius: HIGHLIGHT_RADIUS,
        setHidden: setHiddenForMenu,
        // remeasure: kapanışta klonun döneceği konum taze ölçülür — menü
        // açılırken klavye kapandığından liste kayıyor, basış anındaki y bayat.
        remeasure: (
          cb: (
            rect: { x: number; y: number; width: number; height: number } | null,
          ) => void,
        ) => {
          if (!bubbleRef.current?.measureInWindow) {
            cb(null);
            return;
          }
          bubbleRef.current.measureInWindow(
            (fx: number, fy: number, fw: number, fh: number) =>
              cb({ x: fx, y: fy, width: fw, height: fh }),
          );
        },
      });
    });
  };

  // System mesajı — ortada gri kapsül (ekran alanında ortala: reveal şeridini sayma)
  if (message.isSystemMessage) {
    const text =
      (i18nResolver && message.localizationKey
        ? i18nResolver(message.localizationKey, message.content)
        : message.content) || "";
    return (
      <View
        className="items-center my-2 px-4"
        style={{ marginRight: REVEAL_MAX }}
      >
        <View
          className="px-3 py-2 bg-surface-5 border border-surface-3"
          style={{ borderRadius: 24, borderCurve: "continuous" }}
        >
          <Text className="text-[15px]" style={{ color: colors.textPlaceholder }}>
            {text}
          </Text>
        </View>
      </View>
    );
  }

  const isPending = message._pending;
  const isFailed = message._failed;
  const isDeletedForEveryone = message.deletedAt && message.deletedForEveryone;
  const isDeletedSelf = message.deletedAt && !message.deletedForEveryone;

  if (isDeletedSelf) return null;
  if (isDeletedForEveryone) return renderDeletedBubble(isOwn, t);

  const bubbleBg = isOwn ? colors.messageOwn : colors.surface2;
  const textColorClass = isOwn ? "text-white" : "text-gray-100";
  const hasReactions = message.reactions?.length > 0;

  return (
    <View style={{ marginTop: 1, marginBottom: hasReactions ? 20 : 1 }}>
      <View
        style={{
          flexDirection: "row",
          justifyContent: isOwn ? "flex-end" : "flex-start",
          paddingLeft: 12,
          // Balonlar EKRAN alanında kalsın; sağdaki REVEAL_MAX şeridi saat kolonuna ait.
          paddingRight: 12 + REVEAL_MAX,
        }}
      >
        <View
          ref={bubbleRef}
          style={{
            maxWidth: BUBBLE_MAX_WIDTH,
            position: "relative",
            opacity: hiddenForMenu ? 0 : 1,
          }}
        >
          <Pressable
            onLongPress={handleLongPress}
            onPress={isFailed ? () => onRetryTap?.(message) : undefined}
            onPressOut={() => setPressed(false)}
            delayLongPress={300}
            className=" py-3"
            style={{
              backgroundColor: bubbleBg,
              borderRadius: 24,
              paddingHorizontal: 14,
              minWidth: 48,
              alignItems: "center",
              opacity: isFailed ? 0.7 : 1,
              position: "relative",
              // Uzun basış feedback'i: anlık hafif shrink (animasyonsuz).
              // onPressIn'de DEĞİL — normal dokunuşta scale istenmiyor.
              transform: [{ scale: pressed ? 0.97 : 1 }],
            }}
          >
            {message.replyTo && (
              <TouchableOpacity
                activeOpacity={0.7}
                onPress={() => onReplyTap?.(message.replyTo)}
                style={{ alignSelf: "stretch" }}
              >
                <ReplyPreview reply={message.replyTo} mode="bubble" isOwn={isOwn} />
              </TouchableOpacity>
            )}

            {!!message.content && (
              <Text className={textColorClass} style={{ fontSize: 17 }}>
                {message.content}
                {message.editedAt && (
                  <Text
                    className={`${isOwn ? "text-white/70" : "text-gray-400"} text-xs`}
                  >
                    {"  "}
                    {t("chat.bubble.edited")}
                  </Text>
                )}
              </Text>
            )}

            {isFailed && (
              <Text className="text-red-300 text-[10px] mt-1">
                {t("chat.bubble.tapToRetry")}
              </Text>
            )}
          </Pressable>

          {hasReactions && (
            <View
              className="flex-row"
              style={{
                position: "absolute",
                bottom: -15,
                right: 6,
                flexWrap: "wrap",
                gap: 4,
              }}
            >
              {message.reactions.map((r: any) => (
                <View
                  key={r.emoji}
                  className="px-2 py-1 flex-row items-center rounded-full"
                  style={{ backgroundColor: colors.surface2, borderColor: colors.bgDeep }}
                >
                  <Text style={{ fontSize: 14 }}>{r.emoji}</Text>
                  {r.count > 1 && (
                    <Text className="text-gray-300 text-[10px] ml-1">{r.count}</Text>
                  )}
                </View>
              ))}
            </View>
          )}
        </View>
      </View>

      {/* Saat/okundu kolonu: satırın SAĞ İÇİNDE, ekranın hemen dışında park eder
          (satır genişliği = ekran + REVEAL_MAX). ChatMessageList tüm listeyi sola
          kaydırınca ekrana girer. Statik — animasyon yok. */}
      <View
        pointerEvents="none"
        style={{
          position: "absolute",
          right: 0,
          top: 0,
          bottom: 0,
          width: REVEAL_MAX,
          paddingLeft: 8,
          flexDirection: "row",
          justifyContent: "flex-start",
          alignItems: "center",
        }}
      >
        <Text className="text-gray-400 text-[13px] font-normal">
          {formatTime(message.sentAt)}
        </Text>
        {isOwn && (
          <View style={{ marginLeft: 4 }}>
            {renderStatus(message, isPending, isFailed)}
          </View>
        )}
      </View>
    </View>
  );
}

function renderDeletedBubble(isOwn: boolean, t: (key: string) => string) {
  return (
    <View
      style={{
        flexDirection: "row",
        justifyContent: isOwn ? "flex-end" : "flex-start",
        marginVertical: 2,
        paddingLeft: 12,
        paddingRight: 12 + REVEAL_MAX,
      }}
    >
      <View
        className="bg-surface-5 rounded-full px-3 py-3.5"
        style={{ maxWidth: BUBBLE_MAX_WIDTH }}
      >
        <Text className="text-gray-500 italic text-[14px]">
          {t("chat.bubble.deleted")}
        </Text>
      </View>
    </View>
  );
}

function renderStatus(message: any, isPending: boolean, isFailed: boolean) {
  if (isFailed) return <SFIcon name="exclamationmark.circle.fill" fallback={AlertCircle} size={12} color={colors.errorLight} />;
  if (isPending) return <SFIcon name="clock.fill" fallback={Clock} size={12} color={STATUS_GRAY} />;
  if (message.readAt) return <CheckCheck size={14} color={STATUS_GRAY} />;
  if (message.deliveredAt) return <CheckCheck size={14} color={STATUS_GRAY} />;
  return <SFIcon name="checkmark" fallback={Check} size={14} color={STATUS_GRAY} />;
}

function formatTime(iso: string) {
  if (!iso) return "";
  try {
    return new Date(iso).toLocaleTimeString("tr-TR", { hour: "2-digit", minute: "2-digit" });
  } catch {
    return "";
  }
}

// Alan seti messageEquality.ts'te — ChatMessageList itemsAreEqual ve chatSlice
// reconcile merge'i AYNI fonksiyonu kullanır; drift bug üretir.
export default memo(
  MessageBubble,
  (prev, next) =>
    messageContentEqual(prev.message, next.message) && prev.isOwn === next.isOwn,
);
