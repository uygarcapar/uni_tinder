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
  Extrapolation,
  runOnJS,
  Easing,
} from "react-native-reanimated";
import { BlurView } from "expo-blur";
import { GlassView } from "expo-glass-effect";
import { glassColorScheme, hasLiquidGlassSurface } from "@/shared/theme/glass";
import { Reply, Trash2, Copy } from "@/shared/icons";
import SFIcon from "@/shared/components/SFIcon";
import { useTranslation } from "react-i18next";
import * as Haptics from "expo-haptics";
import * as Clipboard from "expo-clipboard";
import ReplyPreview, {
  REPLY_CARD_GAP,
} from "@/features/chat/components/ReplyPreview";
import VoiceBubble from "@/features/chat/components/VoiceBubble";
import { isVoiceMessage } from "@/features/chat/voiceMessage";
import {
  reactionChipBorder,
  BUBBLE_PAD_H,
  BUBBLE_PAD_V,
  bubbleCorners,
} from "@/features/chat/components/bubbleStyle";
import { colors, withAlpha, scrimAt } from "../../../shared/theme/colors";
import { thinBlurTint } from "@/shared/theme/blur";

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
// Balonun altındaki reaction chip'leri balon dışına bu kadar taşar (MessageBubble bottom:-15).
const REACTION_CHIP_OVERHANG = 15;
// Panel (emoji satırı + aksiyon menüsü) arkaplanı — BLUR YOLU (cam yoksa):
// iOS'ta BlurView üstüne yarı saydam surface2 (native UIVisualEffectView —
// maliyeti ihmal edilebilir); Android'de expo-blur deneysel/pahalı olduğundan
// solid kalır. iOS 26+'da yerini native liquid glass alır (bkz. PanelSurface).
const PANEL_USE_BLUR = Platform.OS === "ios";
// Fonksiyon: modul seviyesinde sabitlenirse tema degisince bayat kalir.
const panelBg = () =>
  PANEL_USE_BLUR ? withAlpha(colors.surface2, 0.55) : colors.surface2;
// Panellerin (emoji satırı + aksiyon menüsü) gölgesi — kasten HAFİF: arkadaki
// tam ekran blur + scrim panelleri zaten zeminden ayırıyor, gölge yalnızca
// ince bir kalkıklık ipucu versin. Cam yolunda daha da hafif: cam kendi kenar
// parıltısını çiziyor, kalın gölge altında kirli bir hale bırakıyor (aynı
// gerekçe: shared/components/toaster/ToastShell.tsx).
// Fonksiyon: colors.shadow modül seviyesinde okunursa tema değişince bayat kalır.
const panelShadow = (glass = false) => ({
  shadowColor: colors.shadow,
  shadowOpacity: glass ? 0.08 : 0.12,
  shadowRadius: glass ? 12 : 8,
  shadowOffset: { width: 0, height: 2 },
  elevation: 3,
});

// ── Panellerin balondan çıkma animasyonu ───────────────────────────────────
// Paneller ana `progress`in kendisine değil, ondan TÜREYEN bir "bloom"a bağlı:
// progress bu eşiği geçene kadar panel balona yapışık ve görünmez, sonrasında
// balonun kenarından açılır. Böylece giriş "balon uçuyor → menü balondan
// çıkıyor", çıkış da tersi ("menü balona geri emiliyor → balon yerine dönüyor")
// okunur. Eşik küçük: giriş easing'i out-cubic olduğu için progress 0.32'ye
// ~30ms'de varıyor, kalan ~230ms panelin.
const PANEL_BLOOM_START = 0.32;
// Panelin kapalıyken ölçeği — 0 değil: sıfırdan açılınca panel "patlıyor",
// balonun kenarından çıkan küçük bir dilim daha inandırıcı.
const PANEL_MIN_SCALE = 0.4;
// ── CAM YOLUNDA ALFA YOK ───────────────────────────────────────────────────
// `UIVisualEffectView` (dolayısıyla `GlassView`) alfası 1'den küçük bir ağacın
// içindeyken sistem view'ı alt ağacıyla birlikte OFFSCREEN bir geçişte
// birleştiriyor; efekt arkasındaki içerikle birleşemediği için ya yanlış ya da
// hiç çizilmiyor (Apple'ın kendi uyarısı: "avoid alpha values that are less
// than 1"). Bizde panel `opacity: 0`dan açılıyordu ve cam tam o sırada, ilk
// `layoutSubviews`ta kuruluyor (node_modules/expo-glass-effect/ios/
// GlassView.swift) — hangisinin önce olduğu yarışa kaldığı için cam bazı
// açılışlarda geliyor bazılarında gelmiyordu.
//
// Çözüm: cam yolunda opaklık HİÇ animasyonlanmaz (sabit 1), panel kapalıyken
// yalnızca ÖLÇEKLE gizlenir. Bloom öncesi ~2 karelik minik dilim balonun
// kenarına yapışık olduğu için göze batmıyor; bu yüzden cam yolunda alt sınır
// daha küçük. Buraya opacity/alfa geri EKLEME — cam yine kırpışır.
const PANEL_MIN_SCALE_GLASS = 0.18;
// KAPANIŞTA alt sınır ayrı: panel balonun kenarında küçüle küçüle TAMAMEN yok
// olur. Giriş sınırıyla (0.4 / 0.18) kapatılınca son karede balonun dibinde
// küçülmüş bir panel kalıyor ve modal kapanınca bir anda siliniyordu — bilhassa
// cam yolunda göze batıyor, orada opaklık animasyonu yok. Sıfır DEĞİL: RN
// tersi alınamayan dönüşüm matrisinden şikâyet ediyor, gözle farkı yok.
const PANEL_EXIT_SCALE = 0.01;

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
  // Kapanış YÖNÜ — panellerin ölçek alt sınırını değiştirir (bkz.
  // PANEL_EXIT_SCALE). Shared value: karar UI thread'inde, çıkış animasyonunun
  // BAŞLADIĞI karede geçerli olmalı.
  const closing = useSharedValue(0);
  // Klonun GERÇEK render yüksekliği (onLayout). Ölçülen rect ile klonun sardığı
  // satır sayısı birebir tutmayabiliyor; menü konumu tahmine değil bu ölçüme
  // dayansın ki büyüyen balon aksiyon menüsünün üstüne binmesin.
  const [cloneH, setCloneH] = useState(0);

  useEffect(() => {
    if (visible) {
      closingRef.current = false;
      exitX.value = -1;
      exitY.value = -1;
      closing.value = 0;
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
  }, [visible, layout, progress, exitX, exitY, closing]);

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
    // Ölçek formülü bloom=1'de her alt sınırda 1 verdiği için (min + 1×(1−min)),
    // bayrağı burada çevirmek görünür bir sıçrama yaratmaz; yalnız küçülme
    // eğrisinin nereye ineceğini değiştirir.
    closing.value = 1;
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
  const actionRows = 1 + (message.content ? 1 : 0) + (canDelete ? 2 : 0);
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

  const blurTint = thinBlurTint();
  const bubbleBg = isOwn ? colors.messageOwn : colors.surface2;
  // Cam yolu render anında sorulur: native sabit + Info.plist bayrağı, tema gibi
  // değişmez ama modül seviyesinde sabitlemek de bir kazanç sağlamaz.
  const glass = hasLiquidGlassSurface();
  // Emoji pill'i cam yolunda 999 yarıçapla ÇİZİLMEZ: GlassView yarıçapı
  // UICornerRadius'a birebir geçiriyor (node_modules/expo-glass-effect/ios/
  // GlassView.swift), kutudan büyük değer kapsül değil bozuk köşe üretiyor.
  // Ölçülen yüksekliğin yarısı hem cam hem blur yolunda kapsül verir.
  const reactionsRadius = Math.round(reactionsH / 2);

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
            { backgroundColor: scrimAt(0.25) },
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
          balonla arasındaki boşluk menü boşluğuyla (GAP) birebir eşitlenir.
          anchor="bottom": panel balonun ÜST kenarından çıkar (alt kenarı sabit,
          yukarı doğru açılır); emergeGap kapalıyken o kenara yapıştırır. */}
      <FloatingPanel
        progress={progress}
        top={reactionsY}
        isOwn={isOwn}
        anchor="bottom"
        emergeGap={GAP}
        glass={glass}
        pill={pill}
        exitX={exitX}
        exitY={exitY}
        closing={closing}
        targetX={targetX}
        targetY={targetY}
      >
        <View
          onLayout={(e: any) => {
            const h = Math.round(e.nativeEvent.layout.height);
            if (h > 0 && h !== reactionsH) setReactionsH(h);
          }}
          style={{
            borderRadius: reactionsRadius,
            borderCurve: "continuous",
            ...panelShadow(glass),
          }}
        >
          <PanelSurface radius={reactionsRadius} blurTint={blurTint} glass={glass}>
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

      {/* Actions list — hedef konumun altında, kendi tarafına hizalı.
          anchor="top": panel balonun ALT kenarından çıkar (üst kenarı sabit,
          aşağı doğru açılır). */}
      <FloatingPanel
        progress={progress}
        top={actionsY}
        isOwn={isOwn}
        anchor="top"
        emergeGap={-GAP}
        glass={glass}
        pill={pill}
        exitX={exitX}
        exitY={exitY}
        closing={closing}
        targetX={targetX}
        targetY={targetY}
        minWidth={200}
      >
        <View
          style={{
            borderRadius: ACTIONS_RADIUS,
            borderCurve: "continuous",
            ...panelShadow(glass),
          }}
        >
          {/* paddingVertical: ilk/son satır panel kenarına yapışmasın — köşe
              yarıçapı büyüdükçe yapışıklık daha çok göze batıyor. */}
          <PanelSurface
            radius={ACTIONS_RADIUS}
            blurTint={blurTint}
            glass={glass}
            paddingVertical={ACTIONS_PAD_V}
          >
          <ActionRow
            icon={<SFIcon name="arrowshape.turn.up.left.fill" fallback={Reply} size={20} color={colors.text} />}
            label={t("chat.actions.reply")}
            separator={rowSeparator(glass)}
            onPress={() => runAction(onReply)}
          />
          {!!message.content && (
            <ActionRow
              icon={<SFIcon name="doc.on.doc" fallback={Copy} size={20} color={colors.text} />}
              label={t("chat.actions.copy")}
              separator={rowSeparator(glass)}
              onPress={handleCopy}
            />
          )}
          {canDelete && (
            <>
              <ActionRow
                icon={<SFIcon name="trash.fill" fallback={Trash2} size={20} color={colors.errorStrong} />}
                label={t("chat.actions.deleteForMe")}
                destructive
                separator={rowSeparator(glass)}
                onPress={() => runAction(() => onDelete?.(false))}
              />
              <ActionRow
                icon={<SFIcon name="trash.fill" fallback={Trash2} size={20} color={colors.errorStrong} />}
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
 * Panel arkaplanı — iki yol:
 *
 *   • iOS 26+ → native liquid glass (`GlassView`). Arkasındaki tam ekran blur'u
 *     ve altındaki sohbeti kırıyor, kendi kenar parıltısını çiziyor.
 *   • Diğer her yerde → BlurView (iOS) / solid (Android) + yarı saydam surface2.
 *
 * CAM YOLUNDA DOLGU/KENARLIK YOK, bilerek: opak katman ya da hairline çerçeve
 * camın kırılmasını öldürüp paneli düz bir dikdörtgene çeviriyor. Kontrast
 * sorununu dolgu ekleyerek değil `panelGlassTint()`i oynatarak çöz (aynı
 * sözleşme: shared/components/toaster/ToastShell.tsx).
 *
 * Köşe: cam yolunda `cornerConfiguration` native çiziliyor, kırpma gerekmiyor;
 * blur yolunda overflow:hidden şart. Gölge her iki yolda da DIŞ sarmalayıcıda
 * kalır (overflow:hidden onu da kırpardı).
 */
function PanelSurface({
  radius,
  blurTint,
  glass,
  paddingVertical = 0,
  children,
}: any) {
  if (glass) {
    return (
      <GlassView
        glassEffectStyle="regular"
        tintColor={panelGlassTint()}
        colorScheme={glassColorScheme()}
        style={{
          borderRadius: radius,
          borderCurve: "continuous",
          paddingVertical,
        }}
      >
        {children}
      </GlassView>
    );
  }

  return (
    <View
      style={{
        borderRadius: radius,
        borderCurve: "continuous",
        overflow: "hidden",
        backgroundColor: panelBg(),
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
 * Native camın tint'i — dolgu DEĞİL, camın kendi rengine verilen hafif eğim.
 * Sıfır tint'te panel altındaki renkli balonların üstünde yıkanıyor; yüksek
 * alfada cam opak bir karta dönüp efekti siliyor. Ayarlanabilir tek knob bu.
 */
function panelGlassTint() {
  return withAlpha(colors.surface2, 0.18);
}

/** Aksiyon satırlarının ayracı — cam yolunda opak çizgi camı kirletir. */
function rowSeparator(glass: boolean) {
  return glass ? colors.hairline : colors.surface3;
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
  const isVoice = isVoiceMessage(message.contentType);
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
      {/* Yığın: yanıt kartı (varsa) + balon — MessageBubble'daki sütunun birebir
          kopyası. Ölçülen rect kartı da kapsadığı için genişlik yığının
          genişliğidir; balon ona GERİLMEZ (maxWidth), yoksa kart balondan
          genişken balon menüde şişerdi. */}
      <View
        onLayout={(e: any) => {
          const h = Math.round(e.nativeEvent.layout.height);
          if (h > 0) onMeasured?.(h);
        }}
        style={{
          width: cloneWidth,
          minHeight: pill.height,
          alignItems: isOwn ? "flex-end" : "flex-start",
        }}
      >
        {message.replyTo && (
          // MessageBubble'daki sarmalayıcının birebir kopyası (aynı boşluk
          // sabiti); ayrışırsa menü açılışında kart zıplar.
          <View
            style={{
              marginBottom: REPLY_CARD_GAP,
              maxWidth: cloneWidth,
              // Klon da menüdeki panellerle AYNI hafif gölgeyi kullanır; ayrışırsa
              // menüde balon panellerden daha "kalkık" görünür.
              ...panelShadow(),
            }}
          >
            <ReplyPreview reply={message.replyTo} mode="bubble" isOwn={isOwn} />
          </View>
        )}

        <View style={{ position: "relative", maxWidth: cloneWidth }}>
          <View
            style={{
              backgroundColor: bubbleBg,
              // Köşeler MessageBubble ile TEK kaynaktan: gönderen tarafın üst köşesi
              // dar. Ayrışırsa uzun basışta balonun köşesi zıplar.
              ...bubbleCorners(isOwn),
              borderCurve: "continuous",
              paddingHorizontal: BUBBLE_PAD_H,
              paddingVertical: BUBBLE_PAD_V,
              minWidth: 48,
              // MessageBubble ile AYNI: kısa metin (örn. "?") minWidth artığının
              // ortasında durur. Yanıt kartı balonun dışında olduğu için burada
              // da yanıta özel bir durum YOK.
              alignItems: "center",
              ...panelShadow(),
            }}
          >
            {/* Sesli mesaj: klon da oynatıcıyı çizmeli, yoksa menüde boş bir
                balon kalıyordu (metin yok, içerik yalnız dalga formunda).
                Oynatma global ve menü açılınca DURMUYOR — klon aynı mesaja
                abone olduğu için çalan dalga menüde de akmayı sürdürür.
                Dokunulamaz: klonun sarmalayıcısı pointerEvents="none". */}
            {isVoice && (
              <VoiceBubble
                messageId={message.id}
                isOwn={isOwn}
                durationMs={message.durationMs}
                waveformPeaks={message.waveformPeaks}
                localUri={message._localUri}
                pending={message._pending}
                failed={message._failed}
              />
            )}

            {!!message.content && (
              <Text
                style={{
                  fontSize: 17,
                  color: isOwn ? colors.onMedia : colors.text,
                  // MessageBubble ile aynı: sesli mesaja yazılan altyazı
                  // oynatıcının altında durur.
                  marginTop: isVoice ? 6 : 0,
                }}
              >
                {message.content}
                {message.editedAt && (
                  <Text
                    style={{
                      fontSize: 12,
                      color: isOwn ? colors.onMediaMuted : colors.textSecondary,
                    }}
                  >
                    {"  "}
                    {t("chat.bubble.edited")}
                  </Text>
                )}
              </Text>
            )}
          </View>

          {/* TEK kapsül — MessageBubble'daki reaction kapsülünün birebir kopyası;
              klon ile gerçek balon ayrışırsa menü açılışında chip'ler zıplar. */}
          {message.reactions?.length > 0 && (
            <View
              style={{
                position: "absolute",
                bottom: -REACTION_CHIP_OVERHANG,
                right: 6,
                flexDirection: "row",
                alignItems: "center",
                paddingHorizontal: 8,
                paddingVertical: 4,
                borderRadius: 999,
                backgroundColor: colors.surface2,
                ...reactionChipBorder(),
                gap: 6,
              }}
            >
              {message.reactions.map((r: any) => (
                <View
                  key={r.emoji}
                  style={{ flexDirection: "row", alignItems: "center" }}
                >
                  <Text style={{ fontSize: 14 }}>{r.emoji}</Text>
                  {r.count > 1 && (
                    <Text
                      style={{ fontSize: 10, marginLeft: 4, color: colors.neutral200 }}
                    >
                      {r.count}
                    </Text>
                  )}
                </View>
              ))}
            </View>
          )}
        </View>
      </View>
    </Animated.View>
  );
}

/**
 * Sabit hedefe hizalı panel (emoji satırı / aksiyon menüsü) — BALONDAN ÇIKAR.
 *
 * İki parça:
 *  1. Panel açılmadan önce balona YAPIŞIK durur: klonun o anki konumu (aynı
 *     interpolasyon formülü) ile hedef konumu arasındaki fark kadar ötelenir,
 *     üstüne `emergeGap` ile balonun tam kenarına oturur. Balon uçarken panel
 *     onunla birlikte taşınır; açıldıkça (bloom → 1) bu öteleme sıfırlanıp
 *     panel `top`taki yerine yerleşir.
 *  2. Ölçek, balona bakan KÖŞEDEN büyür (`transformOrigin`): emoji satırı alt
 *     kenarından yukarı, aksiyon menüsü üst kenarından aşağı açılır. Yatayda
 *     çıpa mesajın tarafı — panel kenarı balonun kenarıyla zaten hizalı
 *     (ikisi de SIDE_MARGIN), böylece köşe köşeye çıkıyor görünür.
 *
 * `transformOrigin` STATİK stilde: yalnız isOwn/anchor'a bağlı, animasyonla
 * değişmiyor. Reanimated yalnız `transform`ı güncellediği için origin prop'u
 * view'da kalır; desteklenmediği bir ortamda animasyon merkezden ölçeğe düşer
 * (bozulmaz, sadece çıpasız kalır).
 */
function FloatingPanel({
  progress,
  top,
  isOwn,
  anchor,
  emergeGap,
  glass,
  pill,
  exitX,
  exitY,
  closing,
  targetX,
  targetY,
  minWidth,
  children,
}: any) {
  const enterScale = glass ? PANEL_MIN_SCALE_GLASS : PANEL_MIN_SCALE;
  const animStyle = useAnimatedStyle(() => {
    const p = progress.value;
    const bloom = interpolate(
      p,
      [PANEL_BLOOM_START, 1],
      [0, 1],
      Extrapolation.CLAMP,
    );
    // 1 = balona yapışık, 0 = hedefteki yerinde.
    const grip = 1 - bloom;
    const minScale = closing.value === 1 ? PANEL_EXIT_SCALE : enterScale;
    // Klonun kullandığı kaynak nokta ile BİREBİR aynı olmalı: kapanışta taze
    // ölçüm (exit*) varsa panel de balonun döndüğü yolu takip etsin.
    const fromX = exitX.value >= 0 ? exitX.value : pill.x;
    const fromY = exitY.value >= 0 ? exitY.value : pill.y;
    const bubbleDX = interpolate(p, [0, 1], [fromX, targetX]) - targetX;
    const bubbleDY = interpolate(p, [0, 1], [fromY, targetY]) - targetY;
    return {
      // Blur yolunda kapalıyken görünmez, açılışın ilk yarısında dolar — geç
      // görünürlük paneli balondan "çıkıyor" gibi okutur. CAM YOLUNDA SABİT 1:
      // alfa camı kırıyor (bkz. PANEL_MIN_SCALE_GLASS başlığı), orada gizleme
      // işini tek başına ölçek yapar.
      opacity: glass
        ? 1
        : interpolate(bloom, [0, 0.45], [0, 1], Extrapolation.CLAMP),
      transform: [
        { translateX: bubbleDX * grip },
        { translateY: (bubbleDY + emergeGap) * grip },
        // Alt sınır yöne göre: açılırken balonun kenarından çıkan bir dilim,
        // kapanırken hiçliğe kadar küçülme.
        { scale: minScale + bloom * (1 - minScale) },
      ] as any,
    };
  });

  return (
    <Animated.View
      style={[
        {
          position: "absolute",
          top,
          left: isOwn ? undefined : SIDE_MARGIN,
          right: isOwn ? SIDE_MARGIN : undefined,
          minWidth,
          maxWidth: SCREEN_WIDTH - 32,
          transformOrigin: [
            isOwn ? "100%" : "0%",
            anchor === "bottom" ? "100%" : "0%",
            0,
          ],
        },
        animStyle,
      ]}
    >
      {children}
    </Animated.View>
  );
}

function ActionRow({ icon, label, destructive, last, separator, onPress }: any) {
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
        borderBottomColor: separator ?? colors.surface3,
      }}
    >
      <View style={{ width: 28, alignItems: "center" }}>{icon}</View>
      <Text
        style={{
          fontSize: 16,
          marginLeft: 12,
          // Yıkıcı satırın kırmızısı ConversationOptionsSheet'in (üç nokta
          // modalı) kırmızısıyla AYNI token: iki menü aynı sohbette yan yana
          // açılıyor, ayrı tonlar iki farklı "sil" gibi okunuyordu.
          color: destructive ? colors.errorStrong : colors.text,
        }}
      >
        {label}
      </Text>
    </TouchableOpacity>
  );
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
