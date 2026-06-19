import { useEffect } from "react";
import {
  Modal,
  View,
  Text,
  TouchableOpacity,
  Pressable,
  Dimensions,
  Platform,
  StyleSheet,
} from "react-native";
import Animated, {
  useSharedValue,
  useAnimatedStyle,
  withTiming,
  Easing,
} from "react-native-reanimated";
import { BlurView } from "expo-blur";
import MaskedView from "@react-native-masked-view/masked-view";
import Svg, { Path } from "react-native-svg";
import { Reply, Pencil, Trash2, Copy } from "lucide-react-native";
import * as Haptics from "expo-haptics";
import * as Clipboard from "expo-clipboard";

const QUICK_EMOJIS = ["❤️", "😂", "😮", "😢", "🔥", "👍"];
const { width: SCREEN_WIDTH, height: SCREEN_HEIGHT } = Dimensions.get("window");
const REACTIONS_HEIGHT = 56;
const GAP = 10;
const SAFE_TOP = 60;
const SAFE_BOTTOM = 40;
const ACTIONS_ESTIMATED_H = 220;

/**
 * WhatsApp-style mesaj uzun-bas context menu.
 * - 4 BlurView stripi (üst/alt/sol/sağ) ile pill'in rect'ini cut-out yapar →
 *   gerçek bubble olduğu gibi açıkta kalır (clone yok).
 * - Reactions pill'in üstünde, actions altında — bubble'ın kendi tarafına hizalı.
 * - Tap dışarı (Pressable absoluteFill alttaki katman) → kapatır.
 */
export default function MessageActionSheet({
  message,
  isOwn,
  visible,
  layout,
  onClose,
  onPickReaction,
  onReply,
  onEdit,
  onDelete,
}) {
  const progress = useSharedValue(0);

  useEffect(() => {
    if (visible) {
      progress.value = withTiming(1, {
        duration: 220,
        easing: Easing.out(Easing.cubic),
      });
    } else {
      progress.value = withTiming(0, { duration: 150 });
    }
  }, [visible, progress]);

  const overlayStyle = useAnimatedStyle(() => ({ opacity: progress.value }));

  const reactionsAnimStyle = useAnimatedStyle(() => ({
    opacity: progress.value,
    transform: [
      { translateY: (1 - progress.value) * 12 },
      { scale: 0.85 + progress.value * 0.15 },
    ],
  }));

  const actionsAnimStyle = useAnimatedStyle(() => ({
    opacity: progress.value,
    transform: [
      { translateY: (1 - progress.value) * -8 },
      { scale: 0.95 + progress.value * 0.05 },
    ],
  }));

  if (!message) return null;

  const canEdit =
    isOwn &&
    !message.isSystemMessage &&
    !message.deletedAt &&
    message.contentType === 0 &&
    isWithinEditWindow(message.sentAt);
  const canDelete = isOwn && !message.isSystemMessage && !message.deletedAt;

  // Fallback (layout null): ekran ortası
  const pill = layout || {
    x: SCREEN_WIDTH * 0.1,
    y: SCREEN_HEIGHT / 2 - 40,
    width: SCREEN_WIDTH * 0.8,
    height: 80,
  };
  const pillRight = pill.x + pill.width;
  // pillBottom = en aşağıdaki shape'in alt kenarı (reactions varsa onun altı)
  const pillBottom = Math.max(
    pill.y + pill.height,
    pill.reactions ? pill.reactions.y + pill.reactions.height : 0,
  );

  // Cutout SVG path için yalnızca geçerli rect'leri kullan — NaN/0 değerler
  // native SVG renderer'ı crash ettirebilir.
  const validShapes = [];
  if (isValidRect(pill)) validShapes.push(pill);
  if (pill.reactions && isValidRect(pill.reactions))
    validShapes.push(pill.reactions);

  // Reactions konumu: pill'in üst-üstüne, side-aligned
  const reactionsY = Math.max(SAFE_TOP, pill.y - REACTIONS_HEIGHT - GAP);
  const actionsY = Math.min(
    SCREEN_HEIGHT - ACTIONS_ESTIMATED_H - SAFE_BOTTOM,
    pillBottom + GAP,
  );

  const blurTint = Platform.OS === "ios" ? "systemThinMaterialDark" : "dark";

  const handleCopy = async () => {
    try {
      if (message.content) await Clipboard.setStringAsync(message.content);
      Haptics.selectionAsync().catch(() => {});
    } catch {}
    onClose();
  };

  return (
    <Modal
      visible={visible}
      transparent
      animationType="none"
      statusBarTranslucent
      onRequestClose={onClose}
    >
      {/* Dismiss layer — full screen şeffaf */}
      <Pressable onPress={onClose} style={StyleSheet.absoluteFill} />

      {/* Pill-shaped cutout: SVG mask path = ekran rect MINUS rounded pill (evenodd).
          BlurView pill dışında her yeri sarar, pill'in rounded şekli net görünür. */}
      <Animated.View
        pointerEvents="none"
        style={[StyleSheet.absoluteFill, overlayStyle]}
      >
        <MaskedView
          style={StyleSheet.absoluteFill}
          maskElement={
            <Svg
              width={SCREEN_WIDTH}
              height={SCREEN_HEIGHT}
              style={{ backgroundColor: "transparent" }}
            >
              <Path
                d={buildCutoutPath(SCREEN_WIDTH, SCREEN_HEIGHT, validShapes)}
                fill="white"
                fillRule="evenodd"
              />
            </Svg>
          }
        >
          <BlurView
            intensity={50}
            tint={blurTint}
            style={StyleSheet.absoluteFill}
          />
          <View
            style={[
              StyleSheet.absoluteFill,
              { backgroundColor: "rgba(0,0,0,0.25)" },
            ]}
          />
        </MaskedView>
      </Animated.View>

      {/* Reactions row — pill'in üstünde */}
      <Animated.View
        style={[
          {
            position: "absolute",
            top: reactionsY,
            left: isOwn ? undefined : Math.max(16, pill.x),
            right: isOwn ? Math.max(16, SCREEN_WIDTH - pillRight) : undefined,
            maxWidth: SCREEN_WIDTH - 32,
          },
          reactionsAnimStyle,
        ]}
      >
        <View
          style={{
            flexDirection: "row",
            alignItems: "center",
            paddingHorizontal: 8,
            paddingVertical: 8,
            borderRadius: 999,
            borderCurve: "continuous",
            backgroundColor: "#1f1f1f",
            shadowColor: "#000",
            shadowOpacity: 0.35,
            shadowRadius: 14,
            shadowOffset: { width: 0, height: 6 },
            elevation: 10,
          }}
        >
          {QUICK_EMOJIS.map((emoji) => (
            <TouchableOpacity
              key={emoji}
              onPress={() => {
                Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light).catch(
                  () => {},
                );
                onPickReaction?.(emoji);
                onClose();
              }}
              hitSlop={6}
              style={{ paddingHorizontal: 6, paddingVertical: 2 }}
            >
              <Text style={{ fontSize: 26 }}>{emoji}</Text>
            </TouchableOpacity>
          ))}
        </View>
      </Animated.View>

      {/* Actions list — pill'in altında, kendi tarafına hizalı */}
      <Animated.View
        style={[
          {
            position: "absolute",
            top: actionsY,
            left: isOwn ? undefined : Math.max(16, pill.x),
            right: isOwn ? Math.max(16, SCREEN_WIDTH - pillRight) : undefined,
            minWidth: 200,
            maxWidth: SCREEN_WIDTH - 32,
          },
          actionsAnimStyle,
        ]}
      >
        <View
          style={{
            borderRadius: 16,
            borderCurve: "continuous",
            backgroundColor: "#1f1f1f",
            overflow: "hidden",
            shadowColor: "#000",
            shadowOpacity: 0.35,
            shadowRadius: 14,
            shadowOffset: { width: 0, height: 6 },
            elevation: 10,
          }}
        >
          <ActionRow
            icon={<Reply size={20} color="#fff" />}
            label="Yanıtla"
            onPress={() => {
              onReply?.();
              onClose();
            }}
          />
          {!!message.content && (
            <ActionRow
              icon={<Copy size={20} color="#fff" />}
              label="Kopyala"
              onPress={handleCopy}
            />
          )}
          {canEdit && (
            <ActionRow
              icon={<Pencil size={20} color="#fff" />}
              label="Düzenle"
              onPress={() => {
                onEdit?.();
                onClose();
              }}
            />
          )}
          {canDelete && (
            <>
              <ActionRow
                icon={<Trash2 size={20} color="#fca5a5" />}
                label="Sadece benden sil"
                destructive
                onPress={() => {
                  onDelete?.(false);
                  onClose();
                }}
              />
              <ActionRow
                icon={<Trash2 size={20} color="#ef4444" />}
                label="Herkes için sil"
                destructive
                last
                onPress={() => {
                  onDelete?.(true);
                  onClose();
                }}
              />
            </>
          )}
        </View>
      </Animated.View>
    </Modal>
  );
}

function ActionRow({ icon, label, destructive, last, onPress }) {
  return (
    <TouchableOpacity
      onPress={onPress}
      activeOpacity={0.65}
      style={{
        flexDirection: "row",
        alignItems: "center",
        paddingHorizontal: 16,
        paddingVertical: 13,
        borderBottomWidth: last ? 0 : StyleSheet.hairlineWidth,
        borderBottomColor: "#262626",
      }}
    >
      <View style={{ width: 28, alignItems: "center" }}>{icon}</View>
      <Text
        style={{
          fontSize: 16,
          marginLeft: 12,
          color: destructive ? "#fca5a5" : "#fff",
        }}
      >
        {label}
      </Text>
    </TouchableOpacity>
  );
}

function isWithinEditWindow(sentAtIso) {
  if (!sentAtIso) return false;
  const sent = new Date(sentAtIso).getTime();
  if (isNaN(sent)) return false;
  return Date.now() - sent < 15 * 60 * 1000;
}

function isValidRect(r) {
  return (
    !!r &&
    Number.isFinite(r.x) &&
    Number.isFinite(r.y) &&
    Number.isFinite(r.width) &&
    Number.isFinite(r.height) &&
    r.width > 0 &&
    r.height > 0
  );
}

function buildCutoutPath(screenW, screenH, shapes) {
  const outer = `M0 0 H${screenW} V${screenH} H0 Z`;
  const holes = shapes
    .map((s) =>
      buildRoundedRectSubpath(s.x, s.y, s.width, s.height, s.radius),
    )
    .join(" ");
  return `${outer} ${holes}`;
}

function buildRoundedRectSubpath(x, y, w, h, customRadius) {
  const maxR = Math.min(h / 2, w / 2);
  const r = Number.isFinite(customRadius)
    ? Math.max(0, Math.min(customRadius, maxR))
    : maxR;
  const right = x + w;
  const bottom = y + h;
  return (
    `M${x + r} ${y} ` +
    `H${right - r} ` +
    `A${r} ${r} 0 0 1 ${right} ${y + r} ` +
    `V${bottom - r} ` +
    `A${r} ${r} 0 0 1 ${right - r} ${bottom} ` +
    `H${x + r} ` +
    `A${r} ${r} 0 0 1 ${x} ${bottom - r} ` +
    `V${y + r} ` +
    `A${r} ${r} 0 0 1 ${x + r} ${y} Z`
  );
}

