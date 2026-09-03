import {
  memo,
  useCallback,
  useEffect,
  useLayoutEffect,
  useMemo,
  useRef,
  useState,
  type ReactNode,
} from "react";
import {
  View,
  Text,
  TextInput,
  TouchableOpacity,
  Pressable,
  Keyboard,
  StyleSheet,
  PanResponder,
} from "react-native";
import type {
  GestureResponderHandlers,
  LayoutChangeEvent,
  NativeSyntheticEvent,
  TextInputSelectionChangeEventData,
} from "react-native";
import Animated, {
  useAnimatedStyle,
  useSharedValue,
  withTiming,
  type SharedValue,
} from "react-native-reanimated";
import { useGenericKeyboardHandler } from "react-native-keyboard-controller";
import { BlurView } from "expo-blur";
import { GlassView } from "expo-glass-effect";
import MaskedView from "@react-native-masked-view/masked-view";
import { LinearGradient } from "expo-linear-gradient";
import { easeGradient } from "react-native-easing-gradient";
import { Lock, ArrowUp, Mic } from "@/shared/icons";
import SFIcon from "@/shared/components/SFIcon";
import * as Haptics from "expo-haptics";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { useTranslation } from "react-i18next";
import ReplyPreview from "@/features/chat/components/ReplyPreview";
import EmojiPanel from "@/features/chat/components/EmojiPanel";
import { pushRecentEmoji } from "@/features/chat/components/emojiCatalog";
import { graphemeStartBefore } from "@/features/chat/components/textGraphemes";
import { appPrefs } from "@/shared/utils/appPrefs";
import {
  COMPOSER_ACTION_W,
  composerBarBg,
  composerBarBorderOverlay,
  COMPOSER_BAR_GAP,
  COMPOSER_BAR_PAD_H,
  COMPOSER_BAR_PAD_V,
  COMPOSER_BLUR_INTENSITY,
  composerBlurTint,
  composerGlassTint,
  COMPOSER_GAP,
  COMPOSER_INSET_H,
} from "@/features/chat/components/composerStyle";
import { glassColorScheme, hasLiquidGlassSurface } from "@/shared/theme/glass";
import { newClientMessageId } from "@/features/chat/clientMessageId";
import {
  discardVoiceTake,
  useVoiceRecorder,
  type VoiceTake,
} from "@/features/chat/useVoiceRecorder";
import {
  VOICE_MIN_MS,
  formatVoiceDuration,
} from "@/features/chat/voiceMessage";
import {
  LOCK_DY,
  UNLOCK_DY,
  LOCK_PILL_W,
  TRASH_HIT_PAD,
  VoiceLockPill,
  VoiceLockedActions,
  VoiceRecordingRow,
} from "@/features/chat/components/VoiceRecordingUI";
import { showInfoToast } from "@/shared/services/toaster";
import { colors, scrimAt, veil } from "../../../shared/theme/colors";
import { chromeBlurTint } from "@/shared/theme/blur";

const TYPING_DEBOUNCE_MS = 1500;

// Taslak diske bu kadar sessizlikten sonra yazılır. Her tuşta yazmak MMKV için
// ucuz ama abone ekranları (MessagesScreen'in "Taslak: …" satırı) her karakterde
// rerender ederdi — yazarken render churn'ü bu ekranda özellikle pahalı.
// Unmount ve gönderim anında zaten anında flush ediliyor.
const DRAFT_SAVE_DEBOUNCE_MS = 600;

// Opak gövdenin ÜSTÜNDEKİ fade bandının yüksekliği — overlay'in nerede bittiği
// (üst kenarı) bu sabitle belirlenir. Liste inset'i bandı SAYMIYOR, yani son
// balon bandın altına kayıyor; bandı büyütmek balonu örter, küçültmek overlay'i
// aşağı çeker. Balonun konumunu DEĞİŞTİRMEZ — onu değiştirmek için ChatScreen'in
// inset'ine dokunmak gerekir ki bu da altta fazladan boşluk bırakır.
const COMPOSER_FADE_BAND = 14;

/**
 * Kapsülün taban yüksekliği ve köşesi — yarıçap yüksekliğin yarısı, yani TAM
 * kapsül. Kayıt sırasında DEĞİŞMEZ: canlı dalga bu kutuya sığacak boyda
 * çiziliyor (bkz. VoiceRecordingUI > BAR_MAX_H). Büyüterek balon boyunda dalga
 * denendi ve geri alındı, panel iri duruyordu.
 */
const BAR_H = 44;
/**
 * "rounded-full": yüksekliğin yarısı DEĞİL, kocaman bir yarıçap.
 *
 * Cam yolunda köşeyi RN'in kendi katmanı değil `GlassView` çiziyor
 * (`glassEffectView.cornerConfiguration = .corners(UICornerRadius(...))`,
 * node_modules/expo-glass-effect/ios/GlassView.swift). Oraya SABİT bir sayı
 * gidiyor: kapsülün yüksekliği değiştiğinde (kayıtta 44 → 38) yarıçap onunla
 * birlikte güncellenmezse uçlar tam yarım daire olmuyor, `borderCurve` de bu
 * yolda hiçbir şey değiştirmiyor (yalnız cornerCurve'ü kopyalıyor). Taşkın
 * yarıçap iki tarafta da kapsüle kırpılıyor: RN katmanı yüksekliğin yarısına,
 * UIKit de kapsül biçimine.
 */
const BAR_RADIUS = 9999;

/**
 * KAYIT sırasındaki kapsül ölçüsü — yazma hâlinden kısa, iki yolda da (cam ve
 * blur).
 *
 * Kısalan tek şey dikey NEFES PAYI (8 → 5), DALGA BOYU AYNI (30pt): yazma
 * hâlindeki pay metnin nefesi, kayıtta metin yok. İçerik kutusu 28pt (aksiyon
 * kutuları: 32pt buton, ∓2 negatif margin) → 28 + 2×5 = 38.
 *
 * Ölçü aralığı cihazda denendi: 32 (pay 2) fazla bastık, 44 (yazma çubuğuyla
 * aynı) kayıt panelini gereğinden iri gösteriyordu.
 */
const VOICE_BAR_PAD_V = 5;
const VOICE_BAR_H = 38;

/**
 * Kayıt zemininin KUTUSU — cam ve düz dolgu yolları bunu paylaşıyor, ayrışırsa
 * iki cihazda iki farklı çubuk çıkar. Inset'lerin gerekçesi (yatay 0, dikey
 * negatif) kullanıldığı yerde, uzun uzun yazılı.
 *
 * Yarıçap ZEMİNİN KENDİSİNDE: cam yolunda kapsül kırpmıyor (bkz.
 * ComposerSurface), turuncu zemin köşeleri keskin bir dikdörtgen olarak
 * taşardı. Kapsülle AYNI taşkın değer — ikisi de kendi yüksekliğinin yarısına
 * kırpılıyor, yani kapsül 44 ↔ 38 arasında gidip gelirken ayrışamazlar.
 * `GlassView`de bu sayıyı native `cornerConfiguration` okuyor ve kapsül
 * biçimine kırpıyor.
 */
const recordingFillShape = {
  position: "absolute",
  left: 0,
  right: 0,
  top: -VOICE_BAR_PAD_V,
  bottom: -VOICE_BAR_PAD_V,
  borderRadius: BAR_RADIUS,
} as const;

/**
 * Yazma kapsülünün YÜZEYİ — iki yol, ölçüleri birebir aynı:
 *
 *   • Cihazda liquid glass varsa (`hasLiquidGlassSurface()`) → native
 *     `GlassView`. Arkasındaki sohbeti (ve composer'ın kendi fade bandını)
 *     kırıyor, kenar parıltısını ve köşesini kendi çiziyor.
 *   • Diğer her yerde → şimdiye kadarki `BlurView` + `composerBarBg()` dolgusu.
 *
 * CAM YOLUNDA DOLGU, KENARLIK ve `overflow: hidden` YOK — üçü de kırılmayı
 * öldürüp kapsülü düz bir dikdörtgene çeviriyor; köşeyi native
 * `cornerConfiguration` zaten çiziyor. Kontrast sorununu dolgu ekleyerek değil
 * `composerGlassTint()`i oynatarak çöz (aynı sözleşme: ToastShell,
 * MessageActionSheet > PanelSurface, VoiceRecordingUI > VoiceLockPill).
 *
 * Kırpma kalkınca kapsülün İÇİNE serilen katmanların kendi köşesini taşıması
 * gerekiyor: kayıt dolgusu bu yüzden `borderRadius: BAR_RADIUS` alıyor
 * (aşağıda), yoksa cam yolunda köşeleri keskin bir kırmızı dikdörtgen olarak
 * taşardı.
 *
 * Yol MOUNT'ta belirlenir ve uygulama boyunca değişmez (native sabit) — iki
 * dalın arasında geçiş olmadığı için children unmount olmuyor.
 */
function ComposerSurface({
  glass,
  recording,
  children,
}: {
  glass: boolean;
  /** Kayıt sürüyor — kapsül kısa ölçüsüne geçer (bkz. VOICE_BAR_*). */
  recording: boolean;
  children: ReactNode;
}) {
  const shape = {
    minHeight: recording ? VOICE_BAR_H : BAR_H,
    // Güvenlik tavanı — gerçek sınır inputHeight (3 satır × ölçülen lineH).
    maxHeight: 82,
    // Tek yarıçap yeter: taşkın değer her iki yükseklikte de kapsüle kırpılıyor.
    // `borderCurve` YOK — varsayılan dairesel eğri; `continuous` (squircle)
    // uçları hafifçe düzleştiriyordu.
    borderRadius: BAR_RADIUS,

    paddingLeft: COMPOSER_BAR_PAD_H,
    paddingRight: COMPOSER_BAR_PAD_H,
    paddingVertical: recording ? VOICE_BAR_PAD_V : COMPOSER_BAR_PAD_V,
    flexDirection: "row",
    alignItems: "center",
    gap: COMPOSER_BAR_GAP,
  } as const;

  if (glass) {
    return (
      <GlassView
        glassEffectStyle="regular"
        tintColor={composerGlassTint()}
        colorScheme={glassColorScheme()}
        // Basınca `UIGlassEffect` kendi tepkisini veriyor. Kapsülün içindeki
        // alanlar (TextInput, aksiyon butonları) kendi dokunuşlarını almaya
        // devam ediyor — onlar camın contentView'ında, yani üstte.
        //
        // KAYITTA KAPALI: o hâlde kapsülün üstünü baştan başa opak balon rengi
        // dolgu + dalga satırı kaplıyor (aşağıda, `isRecording` blokları).
        // Zemin zaten cam DEĞİL, dolu bir renk — altta kalan camın dokunuşa
        // tepki vermesinin görsel karşılığı yok, üstelik kayıt jesti (basılı
        // tut / yukarı kaydırıp kilitle) sürerken camın kendi basılma tepkisi
        // jestin üstüne biniyor.
        //
        // ⚠️ Bu prop DEĞİŞTİĞİNDE kütüphane efekti söküp yeniden kuruyor
        // (bkz. `setInteractive`, node_modules/expo-glass-effect/ios/
        // GlassView.swift). Burada bedeli ödenebilir: bu view geri
        // dönüştürülmüyor (listede değil, tek ve kalıcı), geçiş anında cam
        // zaten dolgunun ALTINDA görünmüyor ve aynı anda kapsülün yüksekliği
        // de değiştiği için (44 ↔ 38) garanti bir layout turu geliyor —
        // yamalı `layoutSubviews` efekt kurulamadıysa orada yeniden kuruyor.
        isInteractive={!recording}
        style={shape}
      >
        {children}
      </GlassView>
    );
  }

  return (
    <BlurView
      intensity={COMPOSER_BLUR_INTENSITY}
      tint={composerBlurTint()}
      style={{
        ...shape,
        // BlurView'da köşe yuvarlatma ancak overflow hidden ile çalışır.
        overflow: "hidden",
        backgroundColor: composerBarBg(),
      }}
    >
      {children}
    </BlurView>
  );
}

/**
 * Mikrofona "dokunma" ile "basılı tutma" arasındaki sınır.
 *
 * Bu sürenin altında bırakılan dokunuş KİLİTLİ kayda geçiyor (Telegram gibi):
 * kayıt sürer, gönderimi alt sıradaki buton yapar. Eskiden yarım kalmış kayıt
 * atılıp "basılı tut" ipucu gösteriliyordu — yani hızlı dokunan kullanıcı hiçbir
 * şey elde edemiyordu. Aynı sabit kilit kapsülünün açılmasını da geciktiriyor,
 * böylece tek dokunuşta kapsül hiç görünmüyor.
 */
const TAP_LOCK_MS = 250;

/**
 * Metnin kapsül kenarından payı. Emoji anahtarı kaldırılınca input çubuğun
 * 8pt'lik dolgusuna yapışıyordu; bu pay onun üstüne biniyor (toplam 16).
 * Kota kilidi açıkken UYGULANMAZ — orada boşluğu butonun kendisi veriyor.
 */
const INPUT_LEAD = 8;

/**
 * Mikrofon düğmesi — basılı tut + sürükle jesti RN'in RESPONDER sisteminde,
 * gesture-handler'da DEĞİL. Bu bilinçli ve pahalıya öğrenildi:
 *
 * RNGH'de `GestureDetector` her render'da native tarafa `updateGestureHandler`
 * yolluyor; o da `configure:` içinde `resetConfig` yapıp `recognizer.enabled`ı
 * yeniden yazıyor (react-native-gesture-handler/apple/RNGestureHandler.mm).
 * Composer kayıt sırasında süre sayacı yüzünden saniyede ~10 kez render oluyor
 * ve bu, SÜREN basılı-tut jestinin ortasında tanıyıcıyı bozuyordu: basıp hemen
 * hızlıca yukarı çekince kilit çalışıyor, bir tık bekleyince hiçbir hareket
 * algılanmıyordu. Bileşeni `memo`lamak, jest nesnesini sabitlemek ve
 * `onUpdate` yerine `onTouchesMove` kullanmak yetmedi.
 *
 * Responder sisteminde dokunuş bir kez "grant" edildikten sonra bırakılana
 * kadar bu düğümde kalır — araya giren render, yeniden yapılandırma ya da
 * düzen değişikliği onu koparamaz. `onPanResponderTerminationRequest: false`
 * ile de başka bir bileşen (liste, kaydırma) dokunuşu çalamaz.
 *
 * Props'ların hepsi kayıt boyunca sabit (handler'lar tek sefer kuruluyor,
 * simge shared value ile sönüyor) → ağaç render olmuyor.
 */
const MicButton = memo(function MicButton({
  handlers,
  opacity,
  interactive,
  label,
  hidden,
}: {
  handlers: GestureResponderHandlers;
  opacity: number;
  interactive: boolean;
  label: string;
  /** 1 = kayıt sürüyor, simge görünmesin. Prop DEĞİL shared value — render yok. */
  hidden: SharedValue<number>;
}) {
  const iconStyle = useAnimatedStyle(() => ({ opacity: 1 - hidden.value }));
  return (
    <View
      accessibilityRole="button"
      accessibilityLabel={label}
      {...handlers}
      style={{
        position: "absolute",
        left: 0,
        right: 0,
        top: 0,
        bottom: 0,
        alignItems: "center",
        justifyContent: "center",
        opacity,
      }}
      pointerEvents={interactive ? "auto" : "none"}
    >
      <Animated.View style={iconStyle}>
        <SFIcon
          name="mic"
          fallback={Mic}
          size={24}
          strokeWidth={2}
          weight="semibold"
          // Placeholder ile AYNI ton: mikrofon boş çubukta "yazabilirsin"
          // ipucunun bir parçası, ondan daha baskın durmamalı.
          color={colors.textMuted}
        />
      </Animated.View>
    </View>
  );
});

// Mesaj uzunluğu tavanı (TextInput maxLength ile aynı) — emoji ekleme de bu
// sınıra uyar, yoksa native kırpma imleci bozardı.
const MAX_LENGTH = 2000;

// Emoji paneli klavyenin TAM yerini kaplar; yükseklik son ölçülen klavyeden
// gelir ve cihaz başına saklanır (ilk açılışta klavye hiç görülmemiş olabilir).
const KB_HEIGHT_KEY = "chat.keyboardHeight";
const DEFAULT_KB_HEIGHT = 336;
const MIN_KB_HEIGHT = 240;
const MAX_KB_HEIGHT = 440;

const clampKbHeight = (h: number) =>
  Math.min(MAX_KB_HEIGHT, Math.max(MIN_KB_HEIGHT, Math.round(h)));

// Klavye açılış/kapanış animasyonuna ayrılan pay (iOS ~250ms, Android ~300ms).
const KB_ANIM_MS = 360;

const styles = StyleSheet.create({
  // Ayna Text'ler: TextInput ile aynı doğal font metriği, görünmez, dokunmaz.
  mirror: {
    position: "absolute",
    left: 0,
    right: 0,
    opacity: 0,
    fontSize: 17,
  },
});

type Props = {
  // Opak composer gövdesinin ölçümü (LegendList composer inset hook'una gider).
  // ÖNEMLİ: fade bandı ölçüme DAHİL DEĞİL — inset yalnız opak kısmı rezerve
  // eder; mesajlar fade'in altına doğal kayar (eski build görünümü), ve
  // mount'ta inset zıplaması olmaz.
  composerRef?: any;
  // TextInput'un kendisi — ChatScreen uzun-bas menüsü kapanınca klavyeyi geri
  // açmak için odağı buraya verir.
  inputRef?: React.RefObject<TextInput | null>;
  onComposerLayout?: (e: LayoutChangeEvent) => void;
  replyTo?: any;
  onCancelReply?: () => void;
  onSend: (payload: {
    content: string;
    replyToMessageId?: string;
    clientMessageId: string;
  }) => void;
  onTypingChange?: (isTyping: boolean) => void;
  // Gönderilmemiş taslak. `initialText` yalnız MOUNT'ta okunur (TextInput
  // uncontrolled — defaultValue); ekran sohbet başına bir kez mount olduğu için
  // yeterli. `onDraftChange` debounce'lu + unmount/gönderim anında flush'lı.
  initialText?: string;
  onDraftChange?: (text: string) => void;
  disabled?: boolean;
  quotaLocked?: boolean;
  onLockedPress?: () => void;
  // Mikrofon bırakıldığında kayıt buradan çıkar (yükleme + gönderme ChatScreen'in
  // işi). Verilmezse mikrofon hiç kayda başlamaz — buton görünür ama ölüdür.
  onSendVoice?: (
    take: VoiceTake & { clientMessageId: string; replyToMessageId?: string },
  ) => void;
};

/**
 * Mesaj yazma çubuğu — RN TextInput + BlurView (SwiftUI YOK, media YOK).
 *
 * TextInput UNCONTROLLED: `value` geri basılmaz (New Arch'ta her tuşta
 * JS→native round-trip yazma akıcılığını bozuyor). State yalnız showSend/typing
 * için tutulur; temizleme ref.clear() ile.
 */
function MessageComposer({
  composerRef,
  inputRef: externalInputRef,
  onComposerLayout,
  replyTo,
  onCancelReply,
  onSend,
  onTypingChange,
  initialText,
  onDraftChange,
  disabled,
  quotaLocked,
  onLockedPress,
  onSendVoice,
}: Props) {
  const insets = useSafeAreaInsets();
  const { t } = useTranslation();
  // Taslak varsa metin ilk render'da dolu başlar: gönder butonu aktif, ayna
  // Text'ler doğru yüksekliği ölçer (çok satırlı taslak input'u büyütür).
  const [text, setText] = useState(initialText ?? "");
  // New Arch'ta multiline auto-grow / onContentSizeChange güvenilmez; yükseklik
  // görünmez ayna Text'lerden ölçülür. Satır yüksekliği de ölçülür (lineH) —
  // sabit lineHeight vermek olmuyor, iOS TextInput lineHeight stilini Text gibi
  // uygulamıyor ve satır ortadan kesiliyordu.
  const [lineH, setLineH] = useState(0);
  const [contentH, setContentH] = useState(0);
  // Metnin ref ikizi: emoji ekleme/silme callback'leri her tuşta kimlik
  // değiştirmesin diye state yerine buradan okunur (panel memo'lu).
  const textRef = useRef(initialText ?? "");
  const selectionRef = useRef({
    start: (initialText ?? "").length,
    end: (initialText ?? "").length,
  });
  // TEK ATIMLIK kontrollü yazma: uncontrolled input'a dışarıdan metin basmanın
  // desteklenen tek yolu `value` vermek. Bir render boyunca dolu kalır (RN o
  // sırada native setTextAndSelection çağırır), hemen ardından temizlenir ki
  // yazma akıcılığı için kurulmuş uncontrolled düzen bozulmasın.
  const [forced, setForced] = useState<{
    text: string;
    selection: { start: number; end: number };
  } | null>(null);
  useEffect(() => {
    if (forced) setForced(null);
  }, [forced]);
  const inputRef = useRef<TextInput>(null);
  // Dışarıdan ref verildiyse aynı node'a bağla. useCallback şart: her render'da
  // yeni callback ref, native tarafta detach/attach (null→node) demek.
  const setInputRef = useCallback(
    (node: TextInput | null) => {
      inputRef.current = node;
      if (externalInputRef) externalInputRef.current = node;
    },
    [externalInputRef],
  );
  const isTypingRef = useRef(false);
  const typingTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  // Taslak: son metin + bekleyen yazım. Callback'i ref'te tutuyoruz ki unmount
  // cleanup'ı ([] bağımlılıklı) bayat closure'a takılmasın.
  const draftRef = useRef(initialText ?? "");
  const draftTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const onDraftChangeRef = useRef(onDraftChange);
  useEffect(() => {
    onDraftChangeRef.current = onDraftChange;
  }, [onDraftChange]);

  const flushDraft = useCallback(() => {
    if (draftTimer.current) {
      clearTimeout(draftTimer.current);
      draftTimer.current = null;
    }
    onDraftChangeRef.current?.(draftRef.current);
  }, []);

  // Ekrandan çıkarken (unmount) bekleyen taslağı diske indir — kullanıcı yazıp
  // hemen geri bastığında debounce penceresi henüz dolmamış olur.
  useEffect(() => flushDraft, [flushDraft]);

  // Alt-fade progressive blur (ChatHeader blur'unun ters yönü).
  const { colors: maskColors, locations: maskLocations } = useMemo(
    () =>
      easeGradient({
        colorStops: {
          0: { color: "transparent" },
          0.5: { color: "black" },
          1: { color: "rgba(0,0,0,0.99)" },
        },
      }),
    [],
  );

  const emitTyping = useCallback(
    (value: string) => {
      if (!onTypingChange) return;
      if (value.length > 0 && !isTypingRef.current) {
        isTypingRef.current = true;
        onTypingChange(true);
      }
      if (typingTimer.current) clearTimeout(typingTimer.current);
      typingTimer.current = setTimeout(() => {
        if (isTypingRef.current) {
          isTypingRef.current = false;
          onTypingChange(false);
        }
      }, TYPING_DEBOUNCE_MS);
    },
    [onTypingChange],
  );

  const scheduleDraftSave = useCallback((value: string) => {
    draftRef.current = value;
    if (draftTimer.current) clearTimeout(draftTimer.current);
    draftTimer.current = setTimeout(() => {
      draftTimer.current = null;
      onDraftChangeRef.current?.(draftRef.current);
    }, DRAFT_SAVE_DEBOUNCE_MS);
  }, []);

  const handleChangeText = useCallback(
    (value: string) => {
      textRef.current = value;
      setText(value);
      emitTyping(value);
      scheduleDraftSave(value);
    },
    [emitTyping, scheduleDraftSave],
  );

  const handleSelectionChange = useCallback(
    (e: NativeSyntheticEvent<TextInputSelectionChangeEventData>) => {
      selectionRef.current = e.nativeEvent.selection;
    },
    [],
  );

  // Emoji panelinden gelen yazma: metni ref'ten okur, imleç konumuna yazar ve
  // tek atımlık `value` ile native'e bastırır.
  const applyText = useCallback(
    (next: string, caret: number) => {
      textRef.current = next;
      selectionRef.current = { start: caret, end: caret };
      setText(next);
      setForced({ text: next, selection: { start: caret, end: caret } });
      emitTyping(next);
      scheduleDraftSave(next);
    },
    [emitTyping, scheduleDraftSave],
  );

  const handleEmojiSelect = useCallback(
    (emoji: string) => {
      const cur = textRef.current;
      const start = Math.max(
        0,
        Math.min(selectionRef.current.start, cur.length),
      );
      const end = Math.max(
        start,
        Math.min(selectionRef.current.end, cur.length),
      );
      const next = cur.slice(0, start) + emoji + cur.slice(end);
      if (next.length > MAX_LENGTH) return;
      pushRecentEmoji(emoji);
      applyText(next, start + emoji.length);
    },
    [applyText],
  );

  const handleEmojiBackspace = useCallback(() => {
    const cur = textRef.current;
    const start = Math.max(0, Math.min(selectionRef.current.start, cur.length));
    const end = Math.max(start, Math.min(selectionRef.current.end, cur.length));
    // Seçim varsa seçimi sil, yoksa imleçten önceki grafem kümesini.
    const from = end > start ? start : graphemeStartBefore(cur, start);
    if (from === end) return;
    applyText(cur.slice(0, from) + cur.slice(end), from);
  }, [applyText]);

  const handleSend = useCallback(() => {
    const trimmed = text.trim();
    if (!trimmed || disabled || quotaLocked) return;
    if (isTypingRef.current && onTypingChange) {
      isTypingRef.current = false;
      onTypingChange(false);
    }
    if (typingTimer.current) clearTimeout(typingTimer.current);
    Haptics.selectionAsync().catch(() => {});
    onSend({
      content: trimmed,
      replyToMessageId: replyTo?.id,
      clientMessageId: newClientMessageId(),
    });
    inputRef.current?.clear();
    setText("");
    textRef.current = "";
    selectionRef.current = { start: 0, end: 0 };
    setContentH(0);
    // Taslak gönderildi — bekleyen debounce'u iptal edip kaydı ANINDA sil,
    // yoksa liste "Taslak: …" göstermeye devam ederdi.
    draftRef.current = "";
    flushDraft();
  }, [
    text,
    disabled,
    quotaLocked,
    onTypingChange,
    onSend,
    replyTo?.id,
    flushDraft,
  ]);

  // ── Emoji paneli ────────────────────────────────────────────────────────
  //
  // İşletim sistemi "klavyenin emoji sekmesini aç" diye bir API VERMİYOR (iOS'ta
  // UIKeyboardType'ta emoji yok, Android'de IME'nin sekmesi tetiklenemez). Bu
  // yüzden buton sistem klavyesini kapatıp yerine BİREBİR aynı yüksekliğe oturan
  // kendi panelimizi açıyor — kullanıcı açısından klavyenin emoji moduna geçmesi
  // ile aynı hareket.
  const [kbHeight, setKbHeight] = useState(
    () => appPrefs.getNumber(KB_HEIGHT_KEY) ?? DEFAULT_KB_HEIGHT,
  );
  const [emojiOpen, setEmojiOpen] = useState(false);
  // Kapanış ARA fazı: panel kapandığı anda hedefi sıfırlamak, klavye daha
  // yükselirken çubuğu dibe düşürüp geri kaldırırdı. Kapanışta hedef klavye
  // yüksekliğinde KALIR — aşağıdaki formül yükselen klavyeyle birlikte paneli
  // zaten 0'a indiriyor. Süre sonunda (klavye gelmediyse de) hedef sıfırlanır.
  const [emojiCollapsing, setEmojiCollapsing] = useState(false);
  const collapseTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  useEffect(
    () => () => {
      if (collapseTimer.current) clearTimeout(collapseTimer.current);
    },
    [],
  );
  // Panel bir kez açıldıktan sonra mount'ta KALIR (yükseklik 0'a inip
  // gizlenir): ~300 glifi her açılışta yeniden mount etmek gözle görülür
  // gecikme yaratıyordu.
  // Panel bir kez açıldıysa monte kalır. Şu an AÇAN yol yok (emoji anahtarı
  // kaldırıldı) → daima false; makineyi silmedim, buton geri gelirse yeter.
  const [emojiMounted] = useState(false);

  useEffect(() => {
    const sub = Keyboard.addListener("keyboardDidShow", (e) => {
      const h = clampKbHeight(e.endCoordinates.height);
      setKbHeight((prev) => {
        if (prev === h) return prev;
        appPrefs.set(KB_HEIGHT_KEY, h);
        return h;
      });
    });
    return () => sub.remove();
  }, []);

  // Panel yüksekliği klavyenin ANLIK yüksekliğinden düşülerek çiziliyor: klavye
  // inerken panel tam onun bıraktığı boşluğu doldurur, composer çubuğu ekranda
  // MİLİMETRE oynamaz. Yoksa panel anında açılıp çubuğu yukarı fırlatır, klavye
  // animasyonu bitince geri indirirdi (zıplama).
  const kbNow = useSharedValue(0);
  useGenericKeyboardHandler(
    {
      onMove: (e) => {
        "worklet";
        kbNow.value = e.height;
      },
      onEnd: (e) => {
        "worklet";
        kbNow.value = e.height;
      },
    },
    [],
  );
  const panelTarget = useSharedValue(0);
  // useLayoutEffect: hedef, panelin çizileceği KARE'den önce yazılmalı — normal
  // effect'te klavyesiz açılışta bir kare boyunca 0 yükseklik görünürdü.
  useLayoutEffect(() => {
    panelTarget.value = emojiOpen || emojiCollapsing ? kbHeight : 0;
  }, [emojiOpen, emojiCollapsing, kbHeight, panelTarget]);

  const panelStyle = useAnimatedStyle(() => ({
    height: Math.max(
      0,
      panelTarget.value - Math.max(insets.bottom, kbNow.value),
    ),
  }));
  // Alt-fade perdesi panelin ÜSTÜNDE bitmeli: absoluteFill bırakılırsa gradient
  // panel boyunca uzayıp çubuğun arkasındaki opak kısmı şeffaflaştırırdı.
  const fadeStyle = useAnimatedStyle(() => ({
    bottom: Math.max(
      0,
      panelTarget.value - Math.max(insets.bottom, kbNow.value),
    ),
  }));

  const closeEmoji = useCallback(() => {
    setEmojiOpen(false);
    setEmojiCollapsing(true);
    if (collapseTimer.current) clearTimeout(collapseTimer.current);
    collapseTimer.current = setTimeout(() => {
      collapseTimer.current = null;
      setEmojiCollapsing(false);
    }, KB_ANIM_MS);
  }, []);

  // NOT: emoji panelini AÇAN yol kalmadı (çubuğun solundaki anahtar kaldırıldı),
  // paneli kapatan/ölçen makine ise yerinde duruyor — geri gelirse tek bir
  // buton yetiyor.

  // Input'a dokunulunca klavye geri gelir — panel de kapanmalı.
  const handleFocus = useCallback(() => {
    if (emojiOpen) closeEmoji();
  }, [emojiOpen, closeEmoji]);

  const placeholder = !disabled
    ? quotaLocked
      ? t("chat.input.quotaReached")
      : t("chat.input.placeholder")
    : t("chat.input.closed");

  const hasText = !!text.trim();
  const canSend = hasText && !disabled && !quotaLocked;

  // ── Sesli mesaj: basılı tut → çöpe sürükle sil, yukarı kaydır kilitle ──
  //
  // Kayıt parmak DEĞDİĞİ anda başlar (uzun basış eşiği beklemeden) — WhatsApp
  // hissi bu; yanlışlıkla dokunuşlar VOICE_MIN_MS altında kalıp atılıyor.
  // Üç çıkış var: bırak → gönder, çöp kutusunun üstünde bırak → sil, yukarı
  // LOCK_DY → kilit (parmak kalkar, kayıt sürer, alt sıradan gönderilir).
  // Parmak kalkmadan 60 saniye dolarsa kaydı biz kesip gönderiyoruz: sunucudan
  // UT-6603 yemek, kullanıcının konuşmaya devam edip her şeyi kaybetmesi demek.
  const finishingRef = useRef(false);
  // Kaydı bitiren fonksiyon recorder'a İHTİYAÇ duyuyor, recorder da limit
  // callback'ine — döngüyü ref kırıyor (hook callback'i zaten ref'te tutuyor).
  const finishRef = useRef<(reason: "release" | "limit") => void>(() => {});
  const handleLimitReached = useCallback(() => finishRef.current("limit"), []);
  const {
    isPaused,
    durationMs: recordingMs,
    waveform,
    tickMs: waveTickMs,
    start: startVoice,
    stop: stopVoice,
    cancel: cancelVoice,
  } = useVoiceRecorder({ onLimitReached: handleLimitReached });

  // "idle" dışındaki her şey kayıt: holding = parmak ekranda, locked = parmak
  // kalktı ama kayıt sürüyor. Jest bu state'i DEĞİL, aşağıdaki shared value'ları
  // okur — worklet'ten React state'i görmek mümkün değil.
  const [voiceMode, setVoiceMode] = useState<"idle" | "holding" | "locked">(
    "idle",
  );
  const isRecording = voiceMode !== "idle";
  const isLocked = voiceMode === "locked";
  // Metin yokken butonun yerini mikrofon alır. Kayıt sürerken de mikrofon
  // KALIR: klavye açıkken ikinci parmakla yazılsa bile buton süren jestin
  // altından gönder okuna dönmesin (input'u kilitlemek klavyeyi kapatıyordu).
  const showMic = !hasText || isRecording;
  // Kilit kapsülünün doluluğu buradan besleniyor; değeri JS'ten yazılıyor
  // (responder olayları JS'te akıyor), okunması UI thread'inde.
  const dragY = useSharedValue(0);
  // ── Çöp kutusu sürükleme hedefi ──────────────────────────────────────────
  // Kayıt paneli basılı tutar tutmaz açıldığı için çöp kutusu ekranda: iptal
  // artık "sola şu kadar kaydır" eşiği değil, parmağı ONUN ÜSTÜNDE bırakmak.
  const trashRectRef = useRef<{
    x: number;
    y: number;
    width: number;
    height: number;
  } | null>(null);
  const [trashHot, setTrashHot] = useState(false);
  /**
   * Parmak HÂLÂ ekranda mı. `voiceMode` bunu söylemiyor: eşik geçilince mod
   * "locked"a dönüyor ama jest sürüyor. Kilit kapsülünün görünürlüğü buna bağlı
   * — kilitlendi diye bir anda kaybolmasın, parmak kalkınca kapansın.
   */
  const [holdActive, setHoldActive] = useState(false);
  const handleTrashRect = useCallback(
    (rect: { x: number; y: number; width: number; height: number }) => {
      trashRectRef.current = rect;
    },
    [],
  );

  const finishRecording = useCallback(
    async (reason: "release" | "limit") => {
      // Limit ve parmak kalkması aynı ana denk gelebilir — tek gönderim.
      if (finishingRef.current) return;
      finishingRef.current = true;
      try {
        const take = await stopVoice();
        setVoiceMode("idle");
        if (!take) return;
        if (take.durationMs < VOICE_MIN_MS) {
          discardVoiceTake(take.uri);
          showInfoToast({ message: t("chat.voice.holdHint") });
          return;
        }
        if (reason === "limit") {
          showInfoToast({ message: t("chat.voice.maxDuration") });
        }
        Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light).catch(() => {});
        // Yanıt şeridi açıkken kayıt da o mesaja yanıttır — metin gönderimiyle
        // aynı sözleşme (şeridi temizlemek çağıranın işi).
        onSendVoice?.({
          ...take,
          clientMessageId: newClientMessageId(),
          replyToMessageId: replyTo?.id,
        });
      } finally {
        finishingRef.current = false;
      }
    },
    [onSendVoice, replyTo?.id, stopVoice, t],
  );
  useEffect(() => {
    finishRef.current = finishRecording;
  }, [finishRecording]);

  const beginHold = useCallback(() => {
    // Önceki kayıt hâlâ kapanıyorsa (bas-bırak-bas) yenisini BAŞLATMA: native
    // recorder aynı anda hem stop hem prepare çağrısını kaldırmıyor.
    if (!onSendVoice || finishingRef.current) return;
    setVoiceMode("holding");
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium).catch(() => {});
    startVoice().then((result) => {
      if (result === "started") return;
      setVoiceMode("idle");
      if (result === "denied") {
        showInfoToast({
          title: t("chat.voice.permissionTitle"),
          message: t("chat.voice.permissionBody"),
          variant: "error",
        });
      } else if (result === "error") {
        showInfoToast({ message: t("chat.voice.failed"), variant: "error" });
      }
    });
  }, [onSendVoice, startVoice, t]);

  const cancelHold = useCallback(() => {
    setVoiceMode("idle");
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Rigid).catch(() => {});
    cancelVoice();
  }, [cancelVoice]);

  /**
   * TEK haptik mikrofona dokunuşta (beginHold). Kilitlenme/açılma titreşimleri
   * BİLEREK yok: iOS kayıt sürerken haptikleri sistem düzeyinde susturduğu için
   * (bkz. patches/expo-audio) titreşim ancak kaydın gerçekten başlamadığı ilk
   * birkaç yüz ms'de geliyordu — yani "bazen var bazen yok" bir geri bildirim.
   * Kilidin karşılığını ikonun kendisi taşıyor.
   */
  const lockHold = useCallback(() => setVoiceMode("locked"), []);

  /**
   * Kilidi geri açar — parmak ekrandayken aşağı inilirse. Jest tümüyle basılı-tut
   * hâline döner: bırakış artık gönderir, çöp kutusu yeniden sürükleme hedefidir.
   * Kayda dokunulmuyor, yalnız "parmak kalkınca ne olacak" değişiyor.
   */
  const unlockHold = useCallback(() => setVoiceMode("holding"), []);

  const releaseHold = useCallback(() => {
    finishRecording("release");
  }, [finishRecording]);

  const micEnabled = showMic && !!onSendVoice && !disabled && !quotaLocked;

  // Responder TEK SEFER kurulur (aşağıdaki useMemo boş bağımlılıkla) — bu yüzden
  // hem callback'ler hem "mikrofon açık mı" bilgisi ref'ten okunur. Doğrudan
  // bağlansalardı her render'da yeni bir responder kurulur, MicButton yeniden
  // render olur ve süren dokunuş kopardı.
  const holdHandlers = useRef({
    beginHold,
    cancelHold,
    lockHold,
    unlockHold,
    releaseHold,
  });
  holdHandlers.current = {
    beginHold,
    cancelHold,
    lockHold,
    unlockHold,
    releaseHold,
  };
  const micEnabledRef = useRef(micEnabled);
  micEnabledRef.current = micEnabled;
  /**
   * Süren bir kayıt varken mikrofon YENİ dokunuş kabul etmiyor. Kilitli kayıtta
   * mikrofon ekranda kalmaya devam ediyor (yazma çubuğunun düğmesi o) ve tek
   * dokunuşla kilitlenebildiği için ikinci bir dokunuş, kayıt sürerken ikinci
   * bir `startVoice()` başlatırdı — native recorder aynı anda iki kayıt
   * kaldırmıyor. Süren jest etkilenmez: bu kapı yalnız yeni dokunuşa bakıyor.
   */
  const recordingRef = useRef(isRecording);
  recordingRef.current = isRecording;
  /** Süren dokunuşun defteri. 0 = henüz karar yok, 1 = kilitlendi, -1 = bitti. */
  const holdRef = useRef({
    startY: 0,
    outcome: 0,
    overTrash: false,
    /** Dokunuşun başladığı an — kısa dokunuş mu basılı tutma mı, ondan. */
    startedAt: 0,
  });
  /**
   * Kilit kapsülünü GECİKTİREN sayaç. Kapsül dokunur dokunmaz değil, dokunuş
   * "kısa dokunuş" olmaktan çıkınca (TAP_LOCK_MS) açılıyor — tek dokunuşta
   * ekranda bir an parlayıp kaybolmasın.
   */
  const holdPillTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const clearHoldPillTimer = useCallback(() => {
    if (holdPillTimer.current) {
      clearTimeout(holdPillTimer.current);
      holdPillTimer.current = null;
    }
  }, []);
  useEffect(() => clearHoldPillTimer, [clearHoldPillTimer]);

  /**
   * Dokunuşun bitişi — bırakış da sistem tarafından koparılma da buraya düşer.
   * Kilitlendiyse kayıt sürer (parmak kalktı, panelden yönetilecek); çöp
   * kutusunun üstünde bırakıldıysa silinir; diğer her durumda gönderilir.
   */
  const finishHold = useCallback(() => {
    const s = holdRef.current;
    dragY.value = withTiming(0, { duration: 160 });
    const droppedOnTrash = s.overTrash;
    s.overTrash = false;
    setTrashHot(false);
    // Parmak kalktı: kilit kapsülü artık kapanır (kilitlenmiş olsa bile).
    clearHoldPillTimer();
    setHoldActive(false);
    if (s.outcome !== 0) return;
    // TEK DOKUNUŞ = kilitli kayıt. Basılı tutmadan mikrofona dokunmak eskiden
    // yarım kalmış bir kayıt üretiyor ve "basılı tut" ipucuyla atılıyordu;
    // artık kayıt sürüyor, gönderimi alt sıradaki buton yapıyor. Kilit
    // kapsülü bu yolda hiç açılmıyor (yukarıdaki sayaç daha dolmadı).
    // `recordingRef`: kayıt gerçekten açıldıysa kilitle. Açılmadıysa (izin
    // reddi, önceki kayıt hâlâ kapanıyor) kilitli bir panel açmak, arkasında
    // kaydı olmayan bir UI bırakırdı.
    if (
      !droppedOnTrash &&
      recordingRef.current &&
      Date.now() - s.startedAt < TAP_LOCK_MS
    ) {
      s.outcome = 1;
      holdHandlers.current.lockHold();
      return;
    }
    s.outcome = -1;
    if (droppedOnTrash) holdHandlers.current.cancelHold();
    else holdHandlers.current.releaseHold();
  }, [clearHoldPillTimer, dragY]);

  /**
   * Basılı tut + sürükle. Üç çıkış: yukarı LOCK_DY → kilit, çöp kutusunun
   * üstünde bırak → sil, diğer her bırakış → gönder.
   *
   * Kilit GERİ ALINABİLİR: parmak ekrandayken UNLOCK_DY'nin altına inilirse
   * kilit açılır ve jest yeniden basılı-tut olur. Yani `outcome === 1` artık
   * kalıcı bir taahhüt değil, parmak kalkana kadar oynayabilen bir hâl.
   *
   * Ölçüm `pageX/pageY` (EKRAN koordinatı) üzerinden: kayıt başlar başlamaz
   * panel açıldığı için düğüm parmağın altından ~60pt yukarı kayıyor, düğüme
   * göreli bir ölçüm o kadar hatalı olurdu.
   */
  const micResponder = useMemo(
    () =>
      PanResponder.create({
        onStartShouldSetPanResponder: () =>
          micEnabledRef.current && !recordingRef.current,
        // Dokunuş bizde kalsın: liste/kaydırma araya girip çalamasın.
        onPanResponderTerminationRequest: () => false,
        onShouldBlockNativeResponder: () => true,
        onPanResponderGrant: (e) => {
          const s = holdRef.current;
          s.startY = e.nativeEvent.pageY;
          s.outcome = 0;
          s.overTrash = false;
          s.startedAt = Date.now();
          dragY.value = 0;
          setTrashHot(false);
          // Kapsül HEMEN değil, dokunuş kısa dokunuş olmaktan çıkınca:
          // tek dokunuşta bir kare parlayıp kaybolması jesti gürültülü
          // gösteriyordu (üstelik o yol artık doğrudan kilide gidiyor).
          setHoldActive(false);
          clearHoldPillTimer();
          holdPillTimer.current = setTimeout(
            () => setHoldActive(true),
            TAP_LOCK_MS,
          );
          holdHandlers.current.beginHold();
        },
        onPanResponderMove: (e) => {
          const s = holdRef.current;
          if (s.outcome === -1) return;
          const { pageX, pageY } = e.nativeEvent;
          dragY.value = Math.min(0, pageY - s.startY);
          // Kilitlendikten SONRA da parmağı izlemeye devam: kapsül yükselmeyi
          // sürdürsün. Eskiden burada dragY sıfıra çekilip hareket kesiliyordu,
          // kapsül de aynı anda kayboluyordu — jestin geri kalanı ölü kalıyordu.
          if (s.outcome === 1) {
            // Parmak geri indi → kilit AÇILIR, jest basılı-tut hâline döner.
            // Eşik kilitlemeninkinden düşük (UNLOCK_DY): sınırda titreyen bir
            // parmak kilidi açıp kapatıp durmasın.
            if (dragY.value > -UNLOCK_DY) {
              s.outcome = 0;
              holdHandlers.current.unlockHold();
            }
            return;
          }
          if (dragY.value <= -LOCK_DY) {
            s.outcome = 1;
            if (s.overTrash) {
              s.overTrash = false;
              setTrashHot(false);
            }
            holdHandlers.current.lockHold();
            return;
          }
          // Parmak çöp kutusunun üstünde mi? Silme BURADA DEĞİL bırakışta olur:
          // üstünden geçip vazgeçebilmeli. Vurgu yalnız durum DEĞİŞİNCE state'e
          // yazılıyor — her harekette setState render fırtınası olurdu.
          const rect = trashRectRef.current;
          const hot =
            !!rect &&
            pageX >= rect.x - TRASH_HIT_PAD &&
            pageX <= rect.x + rect.width + TRASH_HIT_PAD &&
            pageY >= rect.y - TRASH_HIT_PAD &&
            pageY <= rect.y + rect.height + TRASH_HIT_PAD;
          if (hot !== s.overTrash) {
            s.overTrash = hot;
            setTrashHot(hot);
          }
        },
        onPanResponderRelease: () => finishHold(),
        // Sistem dokunuşu elimizden alırsa (çağrı geldi, uygulama arkaya düştü)
        // kayıt havada kalmasın.
        onPanResponderTerminate: () => finishHold(),
      }),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [],
  );

  const micOpacity = showMic ? (micEnabled ? 1 : 0.35) : 0;
  // Kayıtta yalnız SİMGE sönüyor; jestin düğümü saydam kalmamalı (bkz.
  // MicButton). Shared value: MicButton yeniden render olmadan değişsin.
  const micHidden = useSharedValue(0);
  useEffect(() => {
    micHidden.value = isRecording ? 1 : 0;
  }, [isRecording, micHidden]);

  // Yükseklik = satır sayısı × ölçülen gerçek satır yüksekliği — hep tam satıra
  // oturur, satır ortadan kesilmez. 3 satır tavanı, sonrası input içinde kayar.
  const lineCount =
    lineH > 0 ? Math.max(1, Math.min(3, Math.round(contentH / lineH))) : 1;
  const inputHeight = lineH > 0 ? lineCount * lineH : 22;

  // Kapsülün cam mı blur mu olacağı: native sabit + Info.plist bayrağı, yani
  // oturum boyunca sabit. Render anında sorulması bir maliyet değil, modül
  // seviyesinde sabitlemek de bir kazanç sağlamaz (aynı kullanım:
  // MessageActionSheet, ToastShell).
  const glass = hasLiquidGlassSurface();

  return (
    // box-none: fade bandı SADECE görsel — RN'de dokunuşlar altındaki kardeş
    // görünüme "düşmez", en derin hit-test edilen View'de kalır; band auto
    // kalırsa son balonun altına gelen kısmı basılı-tutmayı yutuyordu (inset
    // yalnız opak gövdeyi rezerve ettiği için balon bandın altına doğal kayıyor).
    <View pointerEvents="box-none" style={{ paddingTop: COMPOSER_FADE_BAND }}>
      <Animated.View
        style={[StyleSheet.absoluteFill, fadeStyle]}
        pointerEvents="none"
      >
        <MaskedView
          maskElement={
            <LinearGradient
              locations={maskLocations as any}
              colors={maskColors as any}
              style={StyleSheet.absoluteFill}
            />
          }
          style={StyleSheet.absoluteFill}
        >
          {/* Derinlik perdesi — koyuda karartır, açıkta beyazlatır (veil).
              Üstteki maske siyah/şeffaf kalır: o alfa maskesi, renk değil. */}
          <LinearGradient
            colors={[veil(0.2), veil(1)]}
            style={StyleSheet.absoluteFill}
          />
          <BlurView
            intensity={15}
            tint={chromeBlurTint()}
            style={StyleSheet.absoluteFill}
          />
        </MaskedView>
      </Animated.View>

      {/* Opak gövde — inset ölçümü BU düğümde (fade bandı hariç). */}
      <View
        ref={composerRef}
        onLayout={onComposerLayout}
        style={{ paddingBottom: insets.bottom }}
      >
        {/* Yanıt önizlemesi input ile AYNI sarmalayıcının içinde: yatay inset'i
            (px) ondan alır, arasındaki boşluk kendi marginBottom'ı = COMPOSER_GAP
            — yani sarmalayıcının py'si kadar, ki bu da klavye açıkken input ile
            klavye arasında kalan boşluğun ta kendisi. */}
        <View
          style={{
            paddingHorizontal: COMPOSER_INSET_H,
            paddingVertical: COMPOSER_GAP,
          }}
        >
          {replyTo && (
            <ReplyPreview
              reply={replyTo}
              mode="composing"
              onCancel={onCancelReply}
            />
          )}
          {/* Kapsül + KIRPILMAYAN çerçeve katmanı. Sarmalayıcı kırpmıyor:
              çerçeve blur'un maskesinin dışında kalsın (bkz.
              composerBarBorderOverlay). */}
          <View>
            <ComposerSurface glass={glass} recording={isRecording}>
              {/* Kota kilidi — emoji anahtarı KALDIRILDI, bu yuva yalnız kota
                bitince açılıyor. Dokununca premium paywall'ı açar; input'un
                kendisi de aynı işi yapıyor (onPressIn) ama görünür bir "kilitli"
                işareti olmadan çubuk hiçbir şey söylemiyordu.
                Kayıt sürerken görünmez ve dokunulamaz. */}
              {quotaLocked && (
                <TouchableOpacity
                  onPress={onLockedPress}
                  disabled={isRecording}
                  activeOpacity={0.7}
                  accessibilityRole="button"
                  accessibilityElementsHidden={isRecording}
                  accessibilityLabel={t("chat.input.quotaReached")}
                  style={{
                    width: COMPOSER_ACTION_W,
                    height: 32,
                    marginVertical: -2,
                    alignSelf: "flex-end",
                    alignItems: "center",
                    justifyContent: "center",
                    opacity: isRecording ? 0 : 1,
                  }}
                >
                  <SFIcon
                    name="lock.fill"
                    fallback={Lock}
                    size={22}
                    strokeWidth={2}
                    weight="semibold"
                    color={colors.text}
                  />
                </TouchableOpacity>
              )}

              <View
                style={{ flex: 1, paddingLeft: quotaLocked ? 0 : INPUT_LEAD }}
              >
                {/* Görünmez aynalar: TextInput ile aynı font, lineHeight stili YOK
                  (iOS TextInput ona uymuyor — doğal metrik ikisinde de aynı).
                  İlki tek satır yüksekliğini, ikincisi içerik yüksekliğini ölçer.
                  ZWSP, sondaki \n'in de satır sayması için. */}
                <Text
                  style={styles.mirror}
                  onLayout={(e) => setLineH(e.nativeEvent.layout.height)}
                >
                  {" "}
                </Text>
                <Text
                  style={styles.mirror}
                  onLayout={(e) => setContentH(e.nativeEvent.layout.height)}
                >
                  {(text || " ") + "​"}
                </Text>
                <TextInput
                  ref={setInputRef}
                  nativeID="chat-input"
                  // Uncontrolled: taslak yalnız mount'ta basılır (bkz. Props).
                  // `value`/`selection` YALNIZ emoji ekleme/silme anında bir
                  // render boyunca dolu gelir (bkz. `forced`).
                  defaultValue={initialText}
                  value={forced?.text}
                  selection={forced?.selection}
                  onChangeText={handleChangeText}
                  onSelectionChange={handleSelectionChange}
                  onFocus={handleFocus}
                  // DİKKAT: kayıt sırasında `editable` KAPATILMAZ. iOS'ta odaklı
                  // bir TextInput düzenlenemez olunca first responder'ı bırakıyor
                  // → mikrofona basıldığı anda klavye kapanıyordu. Kayıt sürerken
                  // metin girilse bile butonun mikrofon kalması `showMic` ile
                  // çözülüyor (aşağıya bak), input'a dokunmadan.
                  editable={!disabled && !quotaLocked}
                  placeholder={placeholder}
                  placeholderTextColor={colors.textMuted}
                  multiline
                  maxLength={2000}
                  onPressIn={quotaLocked ? onLockedPress : undefined}
                  style={{
                    color: colors.text,
                    fontSize: 17,
                    padding: 0,
                    height: inputHeight,
                    // Kayıt sırasında input GİZLENİR ama UNMOUNT EDİLMEZ: yükseklik
                    // ölçümü (ve varsa klavye odağı) yerinde kalsın, çubuk oynamasın.
                    opacity: isRecording ? 0 : 1,
                  }}
                />
              </View>
              {/* Aksiyon kutusu: gönder (Pressable) ve mikrofon (Pan jesti) ÜST
                ÜSTE duran iki ayrı düğüm — biri görünür, diğeri dokunulmaz.
                Neden ayrı: mikrofon basış+sürükleme+bırakış tek Pan jestiyle
                sürülüyor, gönder ise sade bir dokunuş; tek düğümde birleştirmek
                metin yazıldıkça jest ağacını değiştirmek demekti. Kutunun ölçüsü
                sabit → her tuşta layout zıplaması yok (eski koşullu mount notu).
                32pt buton 28pt'lik içerik alanına negatif margin ile sığar. */}
              <View
                style={{
                  width: COMPOSER_ACTION_W,
                  height: 32,
                  marginVertical: -2,
                  alignSelf: "flex-end",
                  // KAYITTA `opacity: 0` YAPMA. iOS alfası ≤ 0.01 olan view'ı
                  // hit-test etmiyor ve mikrofon jesti bu kutunun içinde: basış
                  // çalışıyor (o an kutu görünür) ama sonraki parmak hareketleri
                  // hiç ulaşmıyor, yani kilit de çöpe sürükleme de ölüyor.
                  // Kayıtta gizlenen tek şey mikrofon SİMGESİ (bkz. MicButton) —
                  // gönder butonu zaten showMic ile sönük.
                  opacity: 1,
                }}
                // Parmak ekrandayken DOKUNULABİLİR kalmalı: süren Pan jesti bu
                // düğüme bağlı, "none"a çekmek iOS'ta dokunuşu iptal ettirip
                // bırakışı (yani göndermeyi) yutar. Kilitlendiğinde parmak zaten
                // kalkmıştır, orada kapatmak yeni bir kaydın başlamasını önler.
                pointerEvents={isLocked ? "none" : "auto"}
              >
                {/* Basışta opacity DÜŞÜRMÜYORUZ — açık modda solmak butonu açıyor.
                  Yerine siyah scrim bindiriyoruz, iki modda da koyulaşıyor. */}
                <Pressable
                  onPress={handleSend}
                  disabled={showMic || !canSend}
                  accessibilityRole="button"
                  accessibilityLabel={t("chat.input.send")}
                  style={{
                    position: "absolute",
                    left: 0,
                    right: 0,
                    top: 0,
                    bottom: 0,
                    borderRadius: 16,
                    alignItems: "center",
                    justifyContent: "center",
                    backgroundColor: colors.messageOwn,
                    opacity: showMic ? 0 : canSend ? 1 : 0.35,
                    overflow: "hidden",
                  }}
                >
                  {({ pressed }) => (
                    <>
                      {pressed && (
                        <View
                          style={[
                            StyleSheet.absoluteFill,
                            { backgroundColor: scrimAt(0.18) },
                          ]}
                        />
                      )}
                      {/* Dolgulu kırmızı buton medya yüzeyi sayılır — ok iki modda da beyaz kalıyor. */}
                      <SFIcon
                        name="arrow.up"
                        fallback={ArrowUp}
                        size={20}
                        strokeWidth={2}
                        weight="semibold"
                        color={colors.onMedia}
                      />
                    </>
                  )}
                </Pressable>

                <MicButton
                  handlers={micResponder.panHandlers}
                  opacity={micOpacity}
                  interactive={showMic}
                  label={t("chat.input.voice")}
                  hidden={micHidden}
                />
              </View>
            </ComposerSurface>

            {/* ── KAYIT KATMANLARI ────────────────────────────────────────
                Zemin ve dalga, kapsülün ÇOCUĞU DEĞİL KARDEŞİ — ikisi de onun
                üstüne serilir.

                KAPSÜLÜN İÇİNDE OLAMAZLAR: cam yolunda `ComposerSurface` bir
                `UIVisualEffectView` ve çocukları `glassEffectView.contentView`e
                giriyor (expo-glass-effect/ios/GlassView.swift >
                mountChildComponentView). Efekt view'ın contentView'ı efektin
                ÜSTÜNDE bileşiyor, yani oraya konan ikinci bir efekt view'ın
                örnekleyecek zemini kalmıyor: iç içe cam HİÇ ÇİZİLMİYOR
                (denendi — turuncu berrak cam görünmedi bile). Kardeş olarak
                kapsülün üstünde duruyor ve zemini pencerede arkasında kalan her
                şey: kapsülün kendi camı + sohbet.

                Sarmalayıcı kutusu = KAPSÜLÜN kutusu (tek akış içi çocuğu o,
                genişlik stretch) → inset'ler taşınırken hiçbir sayı
                değişmedi. */}

            {/* Kayıt zemini — kapsülü baştan başa kaplar.

                İKİ YOL, ölçüleri birebir aynı (bkz. `recordingFillShape`) ama
                MALZEMESİ ve MÜREKKEBİ farklı:
                  • iOS 26+ (cam varsa) → RENKSİZ berrak cam. `tintColor` YOK:
                    kayıt hâli artık renkle değil MALZEMEYLE anlatılıyor — çubuk
                    berraklaşıp arkasındaki sohbeti kırıyor, üstüne dalga
                    biniyor. `backgroundColor` da VERİLMEZ, cam yolunda dolgu
                    efekti öldürüp kutuyu düz bir dikdörtgene çeviriyor (aynı
                    sözleşme: ComposerSurface, VoiceLockPill, ToastShell).
                    `clear` bilerek `regular` değil: altında kapsülün kendi
                    `regular` camı duruyor, ikinci bir buzlu katman ikisini
                    çamurlaştırırdı — berrak olan yalnızca derinlik katıyor.
                  • Diğer her yerde → düz `messageOwn` dolgusu (turuncu). 26
                    altında cam yok, kayıt hâlini ayıran tek şey renk. Bu yolda
                    renk kapsülün `backgroundColor`ı olarak VERİLEMEZ: RN onu
                    host view'ın katmanına yazıyor, blur ise üstünde durup rengi
                    örnekliyor ve kendi malzemesiyle açıyordu — kırmızı soluk,
                    "opaklığı düşürülmüş" gibi çıkıyordu.

                Zemin değişince MÜREKKEP de değişmek zorunda: dalga/nabız düz
                turuncunun üstünde `onMedia` (iki modda da beyaz), renksiz camın
                üstünde `text` — beyaz çubuklar açık modda camın içinde
                kayboluyordu (bkz. aşağıdaki `ink`).

                INSET KURALI — iki eksen AYRI, ikisi de bilerek:

                Önce mekanik: inset VERİLDİĞİNDE Yoga mutlak çocuğun hem
                konumunu hem ölçüsünü ebeveynin KENAR kutusundan hesaplıyor,
                padding'i hiç saymıyor (yoga/algorithm/AbsoluteLayout.cpp >
                positionAbsoluteChild + layoutAbsoluteChild; errata'sız koşulsuz
                yol — padding'i atlayan errata SADECE inset'siz duruma bakıyor).
                Yani inset 0 = sarmalayıcının dış kenarı, negatif inset = TAŞMA.

                • YATAY 0: zeminin uçları kapsülün kenar kutusuna, yani ekranın
                  12pt'sine oturur = mesaj balonlarının hizası (MessageBubble
                  satır dolgusu 12 / 12+REVEAL_MAX). Eskiden -COMPOSER_BAR_PAD_H
                  idi ve iki yandan 8'er pt taşıp 4pt'ye dayanıyordu; balonlarla
                  hizasızlık buydu.
                • DİKEY -VOICE_BAR_PAD_V: taşma İSTENİYOR. Çubuk KAPSÜLDEN
                  YÜKSEK görünsün diye (38 değil 48) — cihazda tutturulan ölçü
                  bu, sıfırlanınca kayıt çubuğu gözle görülür biçimde bastık
                  kalıyor. Artık kapsülün DIŞINDA olduğu için taşan pay iki
                  yolda da görünür (blur yolunda BlurView'ın maskesi kesiyordu);
                  iki yolu da 38'e indirmek istersen kol VOICE_BAR_H/PAD_V. */}
            {isRecording &&
              (glass ? (
                <GlassView
                  glassEffectStyle="clear"
                  // `tintColor` BİLEREK YOK — kayıt zemini renksiz. Verilirse
                  // (balon rengi denendi) çubuk turuncu bir cama dönüyor;
                  // istenen, malzemenin kendisinin değişmesi.
                  //
                  // Camın açık/koyu tarafı SİSTEMDEN değil uygulamanın kendi
                  // temasından (bkz. shared/theme/glass.ts).
                  colorScheme={glassColorScheme()}
                  // Basış tepkisi YOK: üstündeki jest kaydın kendisi
                  // (basılı-tut/sürükle), cam kendi morph'unu bindirmesin.
                  isInteractive={false}
                  pointerEvents="none"
                  style={recordingFillShape}
                />
              ) : (
                <View
                  pointerEvents="none"
                  style={[
                    recordingFillShape,
                    { backgroundColor: colors.messageOwn },
                  ]}
                />
              ))}

            {/* Kayıt satırı kapsülün TAMAMINI kaplar (emoji + input gizli).
                Mikrofon/gönder kutusu kayıt boyunca görünmez olduğu için satır
                parmak ekrandayken de kenara dayanır — basılı tutmak ile kilitli
                hal arasında görünüm farkı YOK. ZEMİNDEN SONRA: ikisi de kardeş,
                sıra boyama sırası. */}
            {isRecording && (
              <View
                pointerEvents="none"
                style={{
                  // Yatay inset AÇIKÇA kapsülün dolgusu kadar: inset verilen
                  // mutlak çocuk KENAR kutusundan konumlanıyor (bkz. üstteki
                  // zemin notu), yani 0 kapsülün iç boşluğunu değil dış kenarını
                  // gösterirdi — dalga şeridi kapsülün yuvarlak ucuna yapışır,
                  // nabız da gizlenen emoji butonunun 8pt solunda kalırdı.
                  position: "absolute",
                  left: COMPOSER_BAR_PAD_H,
                  right: COMPOSER_BAR_PAD_H,
                  top: 0,
                  bottom: 0,
                  justifyContent: "center",
                }}
              >
                <VoiceRecordingRow
                  wave={waveform}
                  tickMs={waveTickMs}
                  paused={isPaused}
                  // Mürekkep ZEMİNDEN geliyor: düz turuncu bir MEDYA yüzeyi
                  // (mürekkep iki modda da beyaz), renksiz cam ise değil —
                  // orada tema mürekkebi okunuyor, beyaz açık modda siliniyor.
                  ink={glass ? colors.text : colors.onMedia}
                />
              </View>
            )}
            {/* İnce gri kenar: kapsül zeminden yalnız perdeyle ayrılıyordu,
                açık modda özellikle silik kalıyordu. Kayıtta YOK — orada zemin
                zaten dolu balon rengi. CAM YOLUNDA DA YOK: cam kendi kenar
                parıltısını çiziyor, üstüne çizgi eklemek kırılmayı öldürüyor. */}
            {!glass && !isRecording && (
              <View
                pointerEvents="none"
                style={composerBarBorderOverlay(BAR_RADIUS)}
              />
            )}
          </View>

          {/* Kilit tutamağı kapsülün DIŞINDA: içeride olsaydı overflow:hidden
              kırpardı. Panelin (çubuk + aksiyon sırası) üstünde, mikrofon
              sütununa hizalı yüzer — yani parmağın üstünde, yukarı kaydırma
              yönünü gösterir.

              Görünürlük kaydın KİLİTLİ olup olmamasına değil PARMAĞA bağlı:
              eşik geçilince ikon kapalı kilide dönüyor ama kapsül duruyor,
              parmak kalkınca kapanıyor. Eşikte bir anda yok olması jestin
              karşılığını görünmez kılıyordu. */}
          {isRecording && holdActive && (
            <VoiceLockPill
              dragY={dragY}
              locked={isLocked}
              // Mikrofon sütununun EKRAN kenarına uzaklığı: sarmalayıcının yatay
              // inset'i + kapsülün dolgusu + kutunun yarısı. COMPOSER_INSET_H
              // ŞART — inset verilen mutlak çocuk ebeveynin KENAR kutusundan
              // konumlanıyor, padding sayılmıyor (bkz. kayıt dolgusu notu);
              // onsuz kapsül mikrofondan 12pt sağda, ucu ekran dışında kalıyordu.
              right={
                COMPOSER_INSET_H +
                COMPOSER_BAR_PAD_H +
                COMPOSER_ACTION_W / 2 -
                LOCK_PILL_W / 2
              }
            />
          )}

          {/* Sil / süre / gönder sırası kayıt BAŞLAR BAŞLAMAZ açılır —
              basılı tutarken de aynı panel duruyor, kilit yalnız parmağın
              kalkıp kalkmadığını belirliyor.
              Parmak ekrandayken DOKUNULAMAZ: o an bir başka parmakla çöpe
              basmak, süren jestin bırakışıyla (gönder) çakışırdı.
              Ölçülen composer düğümünün İÇİNDE olduğu için liste inset'i
              kendiliğinden bu sıra kadar büyür (son balon altında kalmaz). */}
          {isRecording && (
            <View pointerEvents={isLocked ? "auto" : "none"}>
              <VoiceLockedActions
                durationText={formatVoiceDuration(recordingMs)}
                onCancel={cancelHold}
                onSend={releaseHold}
                cancelLabel={t("chat.voice.cancel")}
                sendLabel={t("chat.input.send")}
                onTrashRect={handleTrashRect}
                trashActive={trashHot}
              />
            </View>
          )}
        </View>

        {/* Klavyenin yerine geçen panel. Ölçülen composer düğümünün İÇİNDE:
            liste inset'i (useKeyboardChatComposerInset) böylece panel kadar
            büyür ve son balon panelin altında kalmaz. */}
        <Animated.View style={[{ overflow: "hidden" }, panelStyle]}>
          {emojiMounted && (
            <EmojiPanel
              height={Math.max(0, kbHeight - insets.bottom)}
              onSelect={handleEmojiSelect}
              onBackspace={handleEmojiBackspace}
            />
          )}
        </Animated.View>
      </View>
    </View>
  );
}

export default memo(MessageComposer);
