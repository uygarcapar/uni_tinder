import { memo, useCallback, useEffect, useMemo, useRef, useState } from "react";
import {
  View,
  Text,
  TextInput,
  TouchableOpacity,
  Pressable,
  StyleSheet,
} from "react-native";
import type { LayoutChangeEvent } from "react-native";
import { BlurView } from "expo-blur";
import MaskedView from "@react-native-masked-view/masked-view";
import { LinearGradient } from "expo-linear-gradient";
import { easeGradient } from "react-native-easing-gradient";
import { Lock, ArrowUp, CirclePlus } from "lucide-react-native";
import SFIcon from "@/shared/components/SFIcon";
import * as Haptics from "expo-haptics";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { useTranslation } from "react-i18next";
import ReplyPreview from "@/features/chat/components/ReplyPreview";
import {
  COMPOSER_ACTION_W,
  composerBarBg,
  COMPOSER_BAR_GAP,
  COMPOSER_BAR_PAD_H,
  COMPOSER_BAR_PAD_V,
  COMPOSER_BLUR_INTENSITY,
  composerBlurTint,
  COMPOSER_GAP,
  COMPOSER_INSET_H,
} from "@/features/chat/components/composerStyle";
import { newClientMessageId } from "@/features/chat/clientMessageId";
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

  const handleChangeText = useCallback(
    (value: string) => {
      setText(value);
      emitTyping(value);
      draftRef.current = value;
      if (draftTimer.current) clearTimeout(draftTimer.current);
      draftTimer.current = setTimeout(() => {
        draftTimer.current = null;
        onDraftChangeRef.current?.(draftRef.current);
      }, DRAFT_SAVE_DEBOUNCE_MS);
    },
    [emitTyping],
  );

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
    setContentH(0);
    // Taslak gönderildi — bekleyen debounce'u iptal edip kaydı ANINDA sil,
    // yoksa liste "Taslak: …" göstermeye devam ederdi.
    draftRef.current = "";
    flushDraft();
  }, [text, disabled, quotaLocked, onTypingChange, onSend, replyTo?.id, flushDraft]);

  const placeholder = !disabled
    ? quotaLocked
      ? t("chat.input.quotaReached")
      : t("chat.input.placeholder")
    : t("chat.input.closed");

  const canSend = !!text.trim() && !disabled && !quotaLocked;

  // Yükseklik = satır sayısı × ölçülen gerçek satır yüksekliği — hep tam satıra
  // oturur, satır ortadan kesilmez. 3 satır tavanı, sonrası input içinde kayar.
  const lineCount =
    lineH > 0 ? Math.max(1, Math.min(3, Math.round(contentH / lineH))) : 1;
  const inputHeight = lineH > 0 ? lineCount * lineH : 22;

  return (
    // box-none: fade bandı SADECE görsel — RN'de dokunuşlar altındaki kardeş
    // görünüme "düşmez", en derin hit-test edilen View'de kalır; band auto
    // kalırsa son balonun altına gelen kısmı basılı-tutmayı yutuyordu (inset
    // yalnız opak gövdeyi rezerve ettiği için balon bandın altına doğal kayıyor).
    <View pointerEvents="box-none" style={{ paddingTop: COMPOSER_FADE_BAND }}>
      <View style={StyleSheet.absoluteFill} pointerEvents="none">
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
      </View>

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
            <ReplyPreview reply={replyTo} mode="composing" onCancel={onCancelReply} />
          )}
          <BlurView
            intensity={COMPOSER_BLUR_INTENSITY}
            tint={composerBlurTint()}
            style={{
              minHeight: 44,
              // Güvenlik tavanı — gerçek sınır inputHeight (3 satır × ölçülen lineH).
              maxHeight: 82,
              borderRadius: 22,
              // BlurView'da köşe yuvarlatma ancak overflow hidden ile çalışır.
              overflow: "hidden",
              paddingLeft: COMPOSER_BAR_PAD_H,
              paddingRight: COMPOSER_BAR_PAD_H,
              paddingVertical: COMPOSER_BAR_PAD_V,
              backgroundColor: composerBarBg(),
              flexDirection: "row",
              alignItems: "center",
              gap: COMPOSER_BAR_GAP,
            }}
          >
            {/* Şimdilik işlevsiz — gönder butonuyla aynı yeri kaplar (medya eki için rezerve).
                Kota bitmişse + yerine kilit; dokununca premium paywall açılır. */}
            <TouchableOpacity
              onPress={quotaLocked ? onLockedPress : undefined}
              disabled={!quotaLocked}
              activeOpacity={0.7}
              style={{
                width: COMPOSER_ACTION_W,
                height: 32,
                marginVertical: -2,
                alignSelf: "flex-end",
                alignItems: "center",
                justifyContent: "center",
              }}
            >
              {quotaLocked ? (
                <SFIcon name="lock.fill" fallback={Lock} size={22} strokeWidth={2} weight="semibold" color={colors.text} />
              ) : (
                <SFIcon name="plus.circle" fallback={CirclePlus} size={28} strokeWidth={2} weight="semibold" color={colors.text} />
              )}
            </TouchableOpacity>

            <View style={{ flex: 1 }}>
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
                defaultValue={initialText}
                onChangeText={handleChangeText}
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
                }}
              />
            </View>
            {/* Sabit mount: koşullu mount/unmount her tuşta layout zıplatıyordu. */}
            {/* Basışta opacity DÜŞÜRMÜYORUZ — açık modda solmak butonu açıyor.
                Yerine siyah scrim bindiriyoruz, iki modda da koyulaşıyor. */}
            <Pressable
              onPress={handleSend}
              disabled={!canSend}
              style={{
                width: COMPOSER_ACTION_W,
                height: 32,
                borderRadius: 16,
                // 32pt buton, 28pt'lik içerik alanına negatif margin ile sığar —
                // kutu 44pt'te kalır, input büyümez.
                marginVertical: -2,
                alignSelf: "flex-end",
                alignItems: "center",
                justifyContent: "center",
                backgroundColor: colors.messageOwn,
                opacity: canSend ? 1 : 0.35,
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
                  <SFIcon name="arrow.up" fallback={ArrowUp} size={20} strokeWidth={2} weight="semibold" color={colors.onMedia} />
                </>
              )}
            </Pressable>
          </BlurView>
        </View>
      </View>
    </View>
  );
}

export default memo(MessageComposer);
