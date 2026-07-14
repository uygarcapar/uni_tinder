import { memo, useMemo, useRef } from "react";
import {
  View,
  Text,
  Image,
  TouchableOpacity,
  Pressable,
  Platform,
} from "react-native";
import Animated, {
  useSharedValue,
  useAnimatedStyle,
  withTiming,
  Easing,
} from "react-native-reanimated";
import { ContextMenuView } from "react-native-ios-context-menu";

const IS_IOS = Platform.OS === "ios";
const QUICK_EMOJIS = ["❤️", "😂", "😮", "😢", "🔥", "👍"];
import { Check, CheckCheck, Clock, AlertCircle } from "lucide-react-native";
import ReplyPreview from "@/features/chat/components/ReplyPreview";
import VoicePlayer from "@/features/chat/components/VoicePlayer";
import { colors } from "../../../shared/theme/colors";

/**
 * Tek mesaj baloncuğu. Tüm content type'ları render eder:
 *   text, image, voice (audio), video, system
 *
 * Props:
 *   message: MessageDto
 *   isOwn: boolean (sender == self)
 *   onLongPress: () => void  — reaction picker / context menu açar
 *   onReplyTap: (replyMsg) => void  — reply preview'e basınca orijinale scroll
 *   onMediaTap: (url, contentType) => void
 *
 * Layout:
 *   - System: ortada gri kapsül
 *   - Own: sağa hizalı, accent renk (colors.primary)
 *   - Other: sola hizalı, koyu gri
 */
function MessageBubble({
  message,
  isOwn,
  onLongPress,
  onReplyTap,
  onMediaTap,
  onRetryTap,
  onReply,
  onEdit,
  onDelete,
  onCopy,
  onPickReaction,
  i18nResolver,
}: any) {
  const bubbleRef = useRef(null);
  const reactionsRef = useRef(null);
  const pressScale = useSharedValue(1);

  const pressAnimStyle = useAnimatedStyle(() => ({
    transform: [{ scale: pressScale.value }],
  }));


  const handlePressIn = () => {
    // Long-press threshold süresince hafifçe shrink — basılı tutma feedback'i.
    pressScale.value = withTiming(0.96, {
      duration: 300,
      easing: Easing.out(Easing.cubic),
    });
  };
  const handlePressOut = () => {
    pressScale.value = withTiming(1, { duration: 150 });
  };
  const handleLongPress = () => {
    // Threshold geldi: bubble back to 1, parent'a rect ile haber ver.
    pressScale.value = withTiming(1, { duration: 120 });
    if (!onLongPress) return;
    if (!bubbleRef.current?.measureInWindow) {
      onLongPress(null);
      return;
    }
    bubbleRef.current.measureInWindow((x, y, width, height) => {
      const pillRect = { x, y, width, height, radius: height / 2 };
      // İliştirilmiş reactions pill'i de ayrıca ölç → modal cutout'unda
      // ikinci subpath olarak delik aç. Ölçü yoksa (reactions yok) tek pill.
      if (reactionsRef.current?.measureInWindow) {
        reactionsRef.current.measureInWindow((rx, ry, rw, rh) => {
          onLongPress({
            ...pillRect,
            reactions: { x: rx, y: ry, width: rw, height: rh, radius: rh / 2 },
          });
        });
      } else {
        onLongPress(pillRect);
      }
    });
  };
  // System mesajı
  if (message.isSystemMessage) {
    const text =
      (i18nResolver && message.localizationKey
        ? i18nResolver(message.localizationKey, message.content)
        : message.content) || "";
    return (
      <View className="items-center my-2 px-4">
        <View
          className="px-3 py-2 rounded-full bg-surface-5 border border-surface-3"
          style={{ borderCurve: "continuous" }}
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

  // "Sadece benden sil" — mesaj kendi tarafında tamamen gizlenir (WhatsApp gibi).
  // Karşı taraf hâlâ mesajı görür (sunucu sadece bu kullanıcıya gizliyor).
  if (isDeletedSelf && isOwn) {
    return null;
  }
  // Karşı tarafın self-delete ettiği mesaj — sunucu zaten göndermemeli, ama
  // gelirse hiçbir şey gösterme.
  if (isDeletedSelf && !isOwn) {
    return null;
  }

  // Diğer taraftaysa "DeletedForEveryone": "Bu mesaj silindi" göster.
  if (isDeletedForEveryone) {
    return renderDeletedBubble(isOwn);
  }

  const bubbleBg = isOwn ? colors.messageOwn : colors.surface2;
  const textColorClass = isOwn ? "text-white" : "text-gray-100";
  const hasReactions = message.reactions?.length > 0;
  const canEdit =
    isOwn &&
    !message.deletedAt &&
    message.contentType === 0 &&
    isWithinEditWindow(message.sentAt);
  const canDelete = isOwn && !message.deletedAt;

  const PressScaleWrapper = IS_IOS ? View : Animated.View;
  const pressableNode = (
    <PressScaleWrapper style={IS_IOS ? undefined : pressAnimStyle}>
      <Pressable
        onPressIn={IS_IOS ? undefined : handlePressIn}
        onPressOut={IS_IOS ? undefined : handlePressOut}
        onLongPress={IS_IOS ? undefined : handleLongPress}
        onPress={isFailed ? () => onRetryTap?.(message) : undefined}
        delayLongPress={300}
        className="rounded-full px-4 py-3"
        style={{
          backgroundColor: bubbleBg,
          opacity: isFailed ? 0.7 : 1,
          position: "relative",
        }}
      >
        {/* Reply preview kapsülü */}
        {message.replyTo && (
          <TouchableOpacity
            activeOpacity={0.7}
            onPress={() => onReplyTap?.(message.replyTo)}
          >
            <ReplyPreview reply={message.replyTo} mode="bubble" isOwn={isOwn} />
          </TouchableOpacity>
        )}

        {/* Media (image/video preview/voice placeholder) */}
        {message.mediaUrl && message.contentType === 1 && (
          <TouchableOpacity
            activeOpacity={0.9}
            onPress={() => onMediaTap?.(message.mediaUrl, 1)}
            className="rounded-xl overflow-hidden mb-1"
          >
            <Image
              source={{ uri: message.mediaUrl }}
              style={{ width: 220, height: 220, borderRadius: 12 }}
              resizeMode="cover"
            />
          </TouchableOpacity>
        )}
        {message.mediaUrl && message.contentType === 2 && (
          <VoicePlayer uri={message.mediaUrl} isOwn={isOwn} />
        )}
        {message.mediaUrl && message.contentType === 3 && (
          <TouchableOpacity
            activeOpacity={0.9}
            onPress={() => onMediaTap?.(message.mediaUrl, 3)}
            className="rounded-xl overflow-hidden mb-1"
            style={{ width: 220, height: 220, backgroundColor: "#00000080" }}
          >
            <View
              style={{
                flex: 1,
                alignItems: "center",
                justifyContent: "center",
              }}
            >
              <Text style={{ fontSize: 40 }}>▶️</Text>
              <Text className="text-white text-xs mt-1">Video</Text>
            </View>
          </TouchableOpacity>
        )}

        {/* Text content — son satıra inline görünmez spacer ekleniyor ki
              absolute footer son satırla aynı hizada otursun, kısa mesajlarda
              dahi içeriği örtmesin (WhatsApp tarzı). */}
        {!!message.content && (
          <Text className={`${textColorClass} text-[16px]`}>
            {message.content}
            {message.editedAt && (
              <Text
                className={`${isOwn ? "text-white/70" : "text-gray-400"} text-xs`}
              >
                {"  "}(düzenlendi)
              </Text>
            )}
            <Text style={{ opacity: 0 }}>
              {"  " + formatTime(message.sentAt) + (isOwn ? " " : " ")}
            </Text>
          </Text>
        )}

        {/* Media-only mesajlarda footer'a yer açmak için alt boşluk */}
        {!message.content && message.mediaUrl && (
          <View style={{ height: 14 }} />
        )}

        {/* Footer: time + status — absolute sağ-alt */}
        <View
          style={{
            position: "absolute",
            right: 10,
            bottom: 6,
            flexDirection: "row",
            alignItems: "center",
          }}
        >
          {isFailed && (
            <Text className="text-red-300 text-[10px] mr-2">
              Tekrar göndermek için dokun
            </Text>
          )}
          <Text
            className={`${isOwn ? "text-white/70" : "text-gray-400"} text-[11px]  mr-1`}
          >
            {formatTime(message.sentAt)}
          </Text>
          {isOwn && renderStatus(message, isPending, isFailed)}
        </View>
      </Pressable>
    </PressScaleWrapper>
  );

  const reactionsNode = message.reactions?.length > 0 && (
    <View
      ref={reactionsRef}
      className="flex-row"
      style={{
        position: "absolute",
        bottom: -15,
        right: 6,
        flexWrap: "wrap",
        gap: 4,
      }}
    >
      {message.reactions.map((r) => (
        <View
          key={r.emoji}
          className="px-2 py-1 flex-row items-center rounded-full"
          style={{
            backgroundColor: colors.surface2,
            borderColor: colors.bgDeep,
          }}
        >
          <Text style={{ fontSize: 14 }}>{r.emoji}</Text>
          {r.count > 1 && (
            <Text className="text-gray-300 text-[10px] ml-1">{r.count}</Text>
          )}
        </View>
      ))}
    </View>
  );

  // iOS native UIContextMenuInteraction — long-press, blur, scale, dismiss
  // sistem tarafından. Android'de custom Pressable longPress → sheet.
  const menuConfig = IS_IOS
    ? {
        menuTitle: "",
        menuItems: [
          {
            type: "menu",
            menuTitle: "Tepki ekle",
            menuOptions: ["displayInline"],
            menuItems: QUICK_EMOJIS.map((emoji) => ({
              actionKey: `reaction:${emoji}`,
              actionTitle: emoji,
            })),
          },
          {
            actionKey: "reply",
            actionTitle: "Yanıtla",
            icon: {
              type: "IMAGE_SYSTEM",
              imageValue: { systemName: "arrowshape.turn.up.left" },
            },
          },
          ...(message.content
            ? [
                {
                  actionKey: "copy",
                  actionTitle: "Kopyala",
                  icon: {
                    type: "IMAGE_SYSTEM",
                    imageValue: { systemName: "doc.on.doc" },
                  },
                },
              ]
            : []),
          ...(canEdit
            ? [
                {
                  actionKey: "edit",
                  actionTitle: "Düzenle",
                  icon: {
                    type: "IMAGE_SYSTEM",
                    imageValue: { systemName: "pencil" },
                  },
                },
              ]
            : []),
          ...(canDelete
            ? [
                {
                  type: "menu",
                  menuTitle: "",
                  menuOptions: ["displayInline"],
                  menuItems: [
                    {
                      actionKey: "delete-me",
                      actionTitle: "Sadece benden sil",
                      menuAttributes: ["destructive"],
                      icon: {
                        type: "IMAGE_SYSTEM",
                        imageValue: { systemName: "trash" },
                      },
                    },
                    {
                      actionKey: "delete-all",
                      actionTitle: "Herkes için sil",
                      menuAttributes: ["destructive"],
                      icon: {
                        type: "IMAGE_SYSTEM",
                        imageValue: { systemName: "trash.fill" },
                      },
                    },
                  ],
                },
              ]
            : []),
        ],
      }
    : null;

  const handleMenuAction = ({ nativeEvent }) => {
    const key = nativeEvent.actionKey;
    if (key?.startsWith("reaction:")) {
      onPickReaction?.(message, key.slice("reaction:".length));
      return;
    }
    switch (key) {
      case "reply":
        onReply?.(message);
        break;
      case "copy":
        onCopy?.(message);
        break;
      case "edit":
        onEdit?.(message);
        break;
      case "delete-me":
        onDelete?.(message, false);
        break;
      case "delete-all":
        onDelete?.(message, true);
        break;
    }
  };

  const triggerNode = IS_IOS ? (
    <ContextMenuView menuConfig={menuConfig} onPressMenuItem={handleMenuAction}>
      {pressableNode}
    </ContextMenuView>
  ) : (
    pressableNode
  );

  return (
    <View
      style={{
        flexDirection: "row",
        justifyContent: isOwn ? "flex-end" : "flex-start",
        marginTop: 2,
        marginBottom: hasReactions ? 20 : 2,
        paddingHorizontal: 12,
      }}
    >
      <View ref={bubbleRef} style={{ maxWidth: "78%", position: "relative" }}>
        {triggerNode}
        {reactionsNode}
      </View>
    </View>
  );
}

function isWithinEditWindow(sentAtIso) {
  if (!sentAtIso) return false;
  const sent = new Date(sentAtIso).getTime();
  if (isNaN(sent)) return false;
  return Date.now() - sent < 15 * 60 * 1000;
}

function renderDeletedBubble(isOwn) {
  return (
    <View
      style={{
        flexDirection: "row",
        justifyContent: isOwn ? "flex-end" : "flex-start",
        marginVertical: 2,
        paddingHorizontal: 12,
      }}
    >
      <View
        className="bg-surface-5 rounded-full px-3 py-3.5"
        style={{ maxWidth: "78%" }}
      >
        <Text className="text-gray-500 italic text-[14px]">
          Bu mesaj silindi.
        </Text>
      </View>
    </View>
  );
}

function renderStatus(message, isPending, isFailed) {
  if (isFailed) return <AlertCircle size={12} color={colors.errorLight} />;
  if (isPending) return <Clock size={12} color="rgba(255,255,255,0.7)" />;
  if (message.readAt) return <CheckCheck size={14} color={colors.success} />;
  if (message.deliveredAt)
    return <CheckCheck size={14} color="rgba(255,255,255,0.85)" />;
  return <Check size={14} color="rgba(255,255,255,0.7)" />;
}

function formatTime(iso) {
  if (!iso) return "";
  try {
    const d = new Date(iso);
    return d.toLocaleTimeString("tr-TR", {
      hour: "2-digit",
      minute: "2-digit",
    });
  } catch {
    return "";
  }
}

function reactionsEqual(a: any, b: any) {
  if (a === b) return true;
  const la = a?.length || 0;
  const lb = b?.length || 0;
  if (la !== lb) return false;
  for (let i = 0; i < la; i++) {
    if (a[i].emoji !== b[i].emoji || (a[i].count || 0) !== (b[i].count || 0)) {
      return false;
    }
  }
  return true;
}

export default memo(MessageBubble, (prev, next) => {
  // Sadece kritik alanlar değişince yeniden render — long list perf.
  const a = prev.message,
    b = next.message;
  return (
    a.id === b.id &&
    a.content === b.content &&
    a.readAt === b.readAt &&
    a.deliveredAt === b.deliveredAt &&
    a.editedAt === b.editedAt &&
    a.deletedAt === b.deletedAt &&
    a._pending === b._pending &&
    a._failed === b._failed &&
    reactionsEqual(a.reactions, b.reactions) &&
    prev.isOwn === next.isOwn
  );
});
