import { useEffect, useRef, useState } from "react";
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
  interpolate,
  runOnJS,
  Easing,
} from "react-native-reanimated";
import { BlurView } from "expo-blur";
import { Reply, Pencil, Trash2, Copy } from "lucide-react-native";
import SFIcon from "@/shared/components/SFIcon";
import { useTranslation } from "react-i18next";
import * as Haptics from "expo-haptics";
import * as Clipboard from "expo-clipboard";
import ReplyPreview from "@/features/chat/components/ReplyPreview";
import { colors } from "../../../shared/theme/colors";

const QUICK_EMOJIS = ["❤️", "😂", "😮", "😢", "🔥", "👍"];
const { width: SCREEN_WIDTH, height: SCREEN_HEIGHT } = Dimensions.get("window");
// Emoji satırının yükseklik TAHMİNİ (onLayout gelene kadar). EMOJI_SIZE ile
// birlikte güncellenmeli, yoksa ilk frame'de panel konumu zıplar.
// Kaba hesap: EMOJI_SIZE × 1.2 (glyph) + 4 (satır padding) + 16 (pill padding).
const REACTIONS_HEIGHT = 64;
// Referans ekran görüntüsünden ölçüldü: pill 357pt genişlik / 7 slot ≈ 51pt slot
// adımı, ≈58pt pill yüksekliği. Apple Color Emoji'nin genişliği ≈ 1.2 × fontSize
// olduğundan slot ≈ 1.2 × EMOJI_SIZE + 2 × EMOJI_PAD_H.
// PAD_H'yi 6'dan 5'e çektim: 36pt emoji ile satır 375pt'lik SE ekranına da sığsın
// (6 emoji × 53.2 + 16 pill padding + 24 kenar boşluğu ≈ 359pt).
const EMOJI_SIZE = 36;
const EMOJI_PAD_H = 5;
const GAP = 10;
const SAFE_TOP = 60;
const SAFE_BOTTOM = 40;
const SIDE_MARGIN = 12;
const ACTION_ROW_H = 47;
// Aksiyon menüsünün köşe yarıçapı ve ilk/son satırın panel kenarına olan boşluğu.
// Menü yüksekliği ölçülmüyor, satır sayısından HESAPLANIYOR (bkz. actionsH) —
// bu yüzden padding'i buradaki sabitten beslemek zorunlu.
const ACTIONS_RADIUS = 22;
const ACTIONS_PAD_V = 6;
const BUBBLE_RADIUS = 24;
// Balonun altındaki reaction chip'leri balon dışına bu kadar taşar (MessageBubble bottom:-15).
const REACTION_CHIP_OVERHANG = 15;
// Panel (emoji satırı + aksiyon menüsü) arkaplanı: iOS'ta BlurView üstüne yarı
// saydam surface2 (native UIVisualEffectView — maliyeti ihmal edilebilir);
// Android'de expo-blur deneysel/pahalı olduğundan solid kalır.
const PANEL_USE_BLUR = Platform.OS === "ios";
const PANEL_BG = PANEL_USE_BLUR ? "rgba(31,31,31,0.55)" : colors.surface2;

/**
 * WhatsApp-style mesaj uzun-bas context menu.
 * - Gerçek balon yerinde blur altında kalır; modal içinde birebir KLON render edilir.
 * - Klon, basıldığı konumdan ekranda SABİT bir hedefe animasyonla taşınır —
 *   emoji satırı ve aksiyon menüsü her zaman bu hedefin üstünde/altında açılır,
 *   balon ekranın neresinde olursa olsun menü asla boşluğa düşmez.
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
}: any) {
  const { t } = useTranslation();
  const progress = useSharedValue(0);
  const closingRef = useRef(false);
  // Emoji pill'inin GERÇEK yüksekliği (onLayout) — tahmin yerine ölçüm, yoksa
  // balonla arasındaki boşluk menü boşluğuyla birebir aynı olmuyor.
  const [reactionsH, setReactionsH] = useState(REACTIONS_HEIGHT);
  // Kapanışta klonun döneceği TAZE konum: sohbet menü açıkken kayabilir (yeni
  // mesaj, klavye telafisi) — basış anındaki rect bayatlayabilir. React state
  // DEĞİL shared value: state güncellemesi asenkron, çıkış animasyonu ise aynı
  // tick'te başlıyor; ikisi yarışınca klon ilk kareleri bayat hedefe doğru
  // uçup sonra sıçrıyordu. Shared value UI thread'de anında geçerli olur.
  // -1 = "taze ölçüm yok, basış rect'ini kullan".
  const exitX = useSharedValue(-1);
  const exitY = useSharedValue(-1);
  // Klonun GERÇEK render yüksekliği (onLayout). Ölçülen rect ile klonun sardığı
  // satır sayısı birebir tutmayabiliyor; menü konumu tahmine değil bu ölçüme
  // dayansın ki büyüyen balon aksiyon menüsünün üstüne binmesin.
  const [cloneH, setCloneH] = useState(0);

  useEffect(() => {
    if (visible) {
      closingRef.current = false;
      exitX.value = -1;
      exitY.value = -1;
      setCloneH(0);
      // Gerçek balonu gizle — görünen artık aşağıdaki klon. Kapanışta
      // (visible=false) klon yerine oturduğu anda geri gösterilir.
      layout?.setHidden?.(true);
      progress.value = withTiming(1, {
        duration: 260,
        easing: Easing.out(Easing.cubic),
      });
    } else {
      layout?.setHidden?.(false);
    }
  }, [visible, layout, progress, exitX, exitY]);

  // Kapanış: önce klon geldiği yoldan geriye kayar (progress → 0), blur ve
  // paneller söner; animasyon BİTİNCE parent state'i temizlenir. onClose'u
  // direkt çağırmak modal'ı anında yok edip animasyonu yutar.
  const finalizeClose = () => {
    closingRef.current = false;
    onClose();
  };
  const handleClose = () => {
    if (closingRef.current) return;
    closingRef.current = true;
    const startExit = () => {
      progress.value = withTiming(
        0,
        { duration: 220, easing: Easing.in(Easing.cubic) },
        (finished) => {
          if (finished) runOnJS(finalizeClose)();
        },
      );
    };
    // Gerçek balon menü açıkken kaymış olabilir (klavye kapanışı listeyi
    // kaydırır, yeni mesaj gelebilir) — klon bayat konuma değil, balonun
    // ŞU ANKİ konumuna dönsün diye kapanıştan önce taze ölçüm alınır.
    if (layout?.remeasure) {
      layout.remeasure((rect: any) => {
        if (isValidRect(rect)) {
          exitX.value = rect.x;
          exitY.value = rect.y;
        }
        startExit();
      });
    } else {
      startExit();
    }
  };
  // Kapanış animasyonu oynarken paneller hâlâ tıklanabilir — aksiyonların çift
  // tetiklenmemesi için tümü bu guard'dan geçer.
  const runAction = (fn?: () => void) => {
    if (closingRef.current) return;
    fn?.();
    handleClose();
  };

  const overlayStyle = useAnimatedStyle(() => ({ opacity: progress.value }));

  if (!message) return null;

  const canEdit =
    isOwn &&
    !message.isSystemMessage &&
    !message.deletedAt &&
    message.contentType === 0 &&
    isWithinEditWindow(message.sentAt);
  const canDelete = isOwn && !message.isSystemMessage && !message.deletedAt;

  // Fallback (layout null): ekran ortası
  const pill = isValidRect(layout)
    ? layout
    : {
        x: SCREEN_WIDTH * 0.1,
        y: SCREEN_HEIGHT / 2 - 40,
        width: SCREEN_WIDTH * 0.8,
        height: 80,
      };

  const hasReactionChips = message.reactions?.length > 0;
  const chipOverhang = hasReactionChips ? REACTION_CHIP_OVERHANG : 0;

  // Aksiyon menüsü yüksekliği satır sayısından hesaplanır (measure beklemeden
  // hedef konumu bilmemiz gerekiyor).
  const actionRows =
    1 + (message.content ? 1 : 0) + (canEdit ? 1 : 0) + (canDelete ? 2 : 0);
  const actionsH = actionRows * ACTION_ROW_H + ACTIONS_PAD_V * 2;

  // ── Sabit hedef konum: tüm stack (emoji + balon + menü) güvenli alanda dikey
  // ortalanır. Balon her uzun basışta ekranın AYNI bölgesine gelir.
  // Klon ölçülene kadar rect yüksekliği; ölçüldüyse gerçek (>= rect) yükseklik.
  const bubbleH = Math.max(pill.height, cloneH);
  const stackH = reactionsH + GAP + bubbleH + chipOverhang + GAP + actionsH;
  const available = SCREEN_HEIGHT - SAFE_TOP - SAFE_BOTTOM;
  const targetY =
    SAFE_TOP +
    reactionsH +
    GAP +
    Math.max(0, (available - stackH) / 2);
  const targetX = isOwn
    ? SCREEN_WIDTH - SIDE_MARGIN - pill.width
    : SIDE_MARGIN;

  const reactionsY = targetY - GAP - reactionsH;
  const actionsY = targetY + bubbleH + chipOverhang + GAP;

  const blurTint = Platform.OS === "ios" ? "systemThinMaterialDark" : "dark";
  const bubbleBg = isOwn ? colors.messageOwn : colors.surface2;

  const handleCopy = () => {
    runAction(() => {
      Clipboard.setStringAsync(message.content ?? "").catch(() => {});
      Haptics.selectionAsync().catch(() => {});
    });
  };

  return (
    <Modal
      visible={visible}
      transparent
      animationType="none"
      statusBarTranslucent
      onRequestClose={handleClose}
    >
      {/* Dismiss layer — full screen şeffaf */}
      <Pressable onPress={handleClose} style={StyleSheet.absoluteFill} />

      {/* Arka plan: tam ekran blur + dim. Gerçek balon bunun altında kalır;
          görünür olan aşağıdaki klondur. */}
      <Animated.View
        pointerEvents="none"
        style={[StyleSheet.absoluteFill, overlayStyle]}
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
      </Animated.View>

      {/* Balon klonu — basıldığı konumdan sabit hedefe kayar */}
      <BubbleClone
        message={message}
        isOwn={isOwn}
        pill={pill}
        exitX={exitX}
        exitY={exitY}
        targetX={targetX}
        targetY={targetY}
        bubbleBg={bubbleBg}
        progress={progress}
        onMeasured={setCloneH}
        t={t}
      />

      {/* Reactions row — hedef konumun üstünde, gerçek yüksekliği ölçülerek
          balonla arasındaki boşluk menü boşluğuyla (GAP) birebir eşitlenir */}
      <FloatingPanel
        progress={progress}
        top={reactionsY}
        isOwn={isOwn}
        enterOffset={12}
        enterScale={0.85}
      >
        <View
          onLayout={(e: any) => {
            const h = Math.round(e.nativeEvent.layout.height);
            if (h > 0 && h !== reactionsH) setReactionsH(h);
          }}
          style={{
            borderRadius: 999,
            borderCurve: "continuous",
            shadowColor: "#000",
            shadowOpacity: 0.35,
            shadowRadius: 14,
            shadowOffset: { width: 0, height: 6 },
            elevation: 10,
          }}
        >
          <PanelSurface radius={999} blurTint={blurTint}>
            <View
              style={{
                flexDirection: "row",
                alignItems: "center",
                paddingHorizontal: 8,
                paddingVertical: 8,
              }}
            >
              {QUICK_EMOJIS.map((emoji) => (
            <TouchableOpacity
              key={emoji}
              onPress={() =>
                runAction(() => {
                  Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light).catch(
                    () => {},
                  );
                  onPickReaction?.(emoji);
                })
              }
              hitSlop={6}
              style={{ paddingHorizontal: EMOJI_PAD_H, paddingVertical: 2 }}
            >
              <Text style={{ fontSize: EMOJI_SIZE }}>{emoji}</Text>
            </TouchableOpacity>
          ))}
            </View>
          </PanelSurface>
        </View>
      </FloatingPanel>

      {/* Actions list — hedef konumun altında, kendi tarafına hizalı */}
      <FloatingPanel
        progress={progress}
        top={actionsY}
        isOwn={isOwn}
        enterOffset={-8}
        enterScale={0.95}
        minWidth={200}
      >
        <View
          style={{
            borderRadius: ACTIONS_RADIUS,
            borderCurve: "continuous",
            shadowColor: "#000",
            shadowOpacity: 0.35,
            shadowRadius: 14,
            shadowOffset: { width: 0, height: 6 },
            elevation: 10,
          }}
        >
          {/* paddingVertical: ilk/son satır panel kenarına yapışmasın — köşe
              yarıçapı büyüdükçe yapışıklık daha çok göze batıyor. */}
          <PanelSurface
            radius={ACTIONS_RADIUS}
            blurTint={blurTint}
            paddingVertical={ACTIONS_PAD_V}
          >
          <ActionRow
            icon={<SFIcon name="arrowshape.turn.up.left.fill" fallback={Reply} size={20} color={colors.text} />}
            label={t("chat.actions.reply")}
            onPress={() => runAction(onReply)}
          />
          {!!message.content && (
            <ActionRow
              icon={<SFIcon name="doc.on.doc" fallback={Copy} size={20} color={colors.text} />}
              label={t("chat.actions.copy")}
              onPress={handleCopy}
            />
          )}
          {canEdit && (
            <ActionRow
              icon={<SFIcon name="pencil" fallback={Pencil} size={20} color={colors.text} />}
              label={t("chat.actions.edit")}
              onPress={() => runAction(onEdit)}
            />
          )}
          {canDelete && (
            <>
              <ActionRow
                icon={<SFIcon name="trash.fill" fallback={Trash2} size={20} color={colors.destructive} />}
                label={t("chat.actions.deleteForMe")}
                destructive
                onPress={() => runAction(() => onDelete?.(false))}
              />
              <ActionRow
                icon={<SFIcon name="trash.fill" fallback={Trash2} size={20} color={colors.destructive} />}
                label={t("chat.actions.deleteForEveryone")}
                destructive
                last
                onPress={() => runAction(() => onDelete?.(true))}
              />
            </>
          )}
          </PanelSurface>
        </View>
      </FloatingPanel>
    </Modal>
  );
}

/**
 * Panel arkaplanı: iOS'ta BlurView + yarı saydam surface2 (arkadaki tam ekran
 * blur'un üstünde ikinci bir native effect view — maliyeti ihmal edilebilir);
 * Android'de solid surface2 (expo-blur Android'de deneysel/pahalı).
 * Gölge, overflow:hidden ile kırpılmasın diye DIŞ sarmalayıcıda kalır.
 */
function PanelSurface({ radius, blurTint, paddingVertical = 0, children }: any) {
  return (
    <View
      style={{
        borderRadius: radius,
        borderCurve: "continuous",
        overflow: "hidden",
        backgroundColor: PANEL_BG,
        paddingVertical,
      }}
    >
      {PANEL_USE_BLUR && (
        <BlurView
          intensity={40}
          tint={blurTint}
          style={StyleSheet.absoluteFill}
        />
      )}
      {children}
    </View>
  );
}

/**
 * Gerçek balonun modal içi klonu. Ölçülen rect boyutunda render edilir ve
 * progress ile (pill.x, pill.y) → (targetX, targetY) arası kayar.
 * Stil MessageBubble ile birebir aynı tutulmalı (bg, radius, padding, font).
 */
function BubbleClone({
  message,
  isOwn,
  pill,
  exitX,
  exitY,
  targetX,
  targetY,
  bubbleBg,
  progress,
  onMeasured,
  t,
}: any) {
  // measureInWindow kesirli genişlik döndürüyor (ör. 289.67); klona AYNI kesirli
  // değeri verince metin gerçek balondan bir satır fazla sarabiliyor ve sabit
  // height'ı taşıp alttan kesik görünüyordu. Genişliği yukarı yuvarla (fazla
  // sarma yok) + height yerine minHeight kullan (taşarsa balon büyüsün, kesmesin).
  const cloneWidth = Math.ceil(pill.width);
  // Klon basış anındaki rect'ten çıkar; kapanışta taze ölçüm (exitX/exitY ≥ 0)
  // varsa oraya döner. Değerler shared value olduğu için çıkış animasyonu
  // başladığı KAREDE geçerli — React state'in bir tick gecikmesi yok.
  const moveStyle = useAnimatedStyle(() => {
    const fromX = exitX.value >= 0 ? exitX.value : pill.x;
    const fromY = exitY.value >= 0 ? exitY.value : pill.y;
    return {
      transform: [
        {
          translateX: interpolate(progress.value, [0, 1], [fromX, targetX]),
        },
        {
          translateY: interpolate(progress.value, [0, 1], [fromY, targetY]),
        },
      ] as any,
    };
  });

  return (
    <Animated.View
      pointerEvents="none"
      style={[
        {
          position: "absolute",
          top: 0,
          left: 0,
          width: cloneWidth,
        },
        moveStyle,
      ]}
    >
      <View
        onLayout={(e: any) => {
          const h = Math.round(e.nativeEvent.layout.height);
          if (h > 0) onMeasured?.(h);
        }}
        style={{
          width: cloneWidth,
          minHeight: pill.height,
          backgroundColor: bubbleBg,
          borderRadius: BUBBLE_RADIUS,
          borderCurve: "continuous",
          paddingHorizontal: 14,
          paddingVertical: 12,
          minWidth: 48,
          alignItems: "center",
          justifyContent: "center",
          shadowColor: "#000",
          shadowOpacity: 0.3,
          shadowRadius: 12,
          shadowOffset: { width: 0, height: 4 },
          elevation: 8,
        }}
      >
        {message.replyTo && (
          <View style={{ alignSelf: "stretch" }}>
            <ReplyPreview reply={message.replyTo} mode="bubble" isOwn={isOwn} />
          </View>
        )}
        {!!message.content && (
          <Text
            style={{
              fontSize: 17,
              color: isOwn ? "#fff" : "#f3f4f6",
            }}
          >
            {message.content}
            {message.editedAt && (
              <Text
                style={{
                  fontSize: 12,
                  color: isOwn ? "rgba(255,255,255,0.7)" : "#9ca3af",
                }}
              >
                {"  "}
                {t("chat.bubble.edited")}
              </Text>
            )}
          </Text>
        )}
      </View>

      {message.reactions?.length > 0 && (
        <View
          style={{
            position: "absolute",
            bottom: -REACTION_CHIP_OVERHANG,
            right: 6,
            flexDirection: "row",
            flexWrap: "wrap",
            gap: 4,
          }}
        >
          {message.reactions.map((r: any) => (
            <View
              key={r.emoji}
              style={{
                paddingHorizontal: 8,
                paddingVertical: 4,
                flexDirection: "row",
                alignItems: "center",
                borderRadius: 999,
                backgroundColor: colors.surface2,
              }}
            >
              <Text style={{ fontSize: 14 }}>{r.emoji}</Text>
              {r.count > 1 && (
                <Text
                  style={{ fontSize: 10, marginLeft: 4, color: "#d1d5db" }}
                >
                  {r.count}
                </Text>
              )}
            </View>
          ))}
        </View>
      )}
    </Animated.View>
  );
}

/** Sabit hedefe hizalı, giriş animasyonlu panel (emoji satırı / aksiyon menüsü). */
function FloatingPanel({
  progress,
  top,
  bottom,
  isOwn,
  enterOffset,
  enterScale,
  minWidth,
  children,
}: any) {
  const animStyle = useAnimatedStyle(() => ({
    opacity: progress.value,
    transform: [
      { translateY: (1 - progress.value) * enterOffset },
      { scale: enterScale + progress.value * (1 - enterScale) },
    ] as any,
  }));

  return (
    <Animated.View
      style={[
        {
          position: "absolute",
          top,
          bottom,
          left: isOwn ? undefined : SIDE_MARGIN,
          right: isOwn ? SIDE_MARGIN : undefined,
          minWidth,
          maxWidth: SCREEN_WIDTH - 32,
        },
        animStyle,
      ]}
    >
      {children}
    </Animated.View>
  );
}

function ActionRow({ icon, label, destructive, last, onPress }: any) {
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
        borderBottomColor: colors.surface3,
      }}
    >
      <View style={{ width: 28, alignItems: "center" }}>{icon}</View>
      <Text
        style={{
          fontSize: 16,
          marginLeft: 12,
          color: destructive ? colors.destructive : colors.text,
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
