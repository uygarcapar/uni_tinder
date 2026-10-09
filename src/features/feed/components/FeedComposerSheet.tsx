import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import {
  ActivityIndicator,
  Dimensions,
  Pressable,
  StyleSheet,
  Switch,
  Text,
  TouchableOpacity,
  View,
} from "react-native";
import { BottomSheetTextInput } from "@gorhom/bottom-sheet";
import { useTranslation } from "react-i18next";
import { useController, useForm, useFormState, type Control } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import AppModal from "@/shared/components/AppModal";
import { useKeyboardAwareField } from "@/shared/hooks/useKeyboardAwareField";
import SFIcon from "@/shared/components/SFIcon";
import { Lock } from "@/shared/icons";
import { colors } from "@/shared/theme/colors";
import { feedPostSchema } from "@/shared/schemas/formSchemas";
import {
  FEED_COUNTER_WARN_REMAINING,
  clampFeedText,
  feedTextLength,
} from "../feedText";
import type { AnonymousGate } from "../feedPolicy";

/**
 * Akış gönderi composer'ı.
 *
 * İskelet `NoteComposerModal`den kopya ve kopya olması ZORUNLU — oradaki her
 * kural somut bir kazanın ilacı:
 *  • Üç MODÜL SEVİYESİ alt bileşen (alan / anonim anahtarı / gönder): render'da
 *    tanımlansalardı her tuşta input remount olur ve klavye düşerdi.
 *  • `BottomSheetTextInput` şart: düz TextInput'ta gorhom klavye target'ını set
 *    etmiyor ve sheet klavye davranışını tamamen atlıyor.
 *  • Yükseklik iki görünmez AYNA Text'ten ölçülüyor: New Arch'ta
 *    `onContentSizeChange` auto-grow'u güvenilmez.
 *  • Kırpma `onChangeText`te, `maxLength`te DEĞİL: o prop UTF-16 birimi sayıyor
 *    ve emojili bir gönderiyi sunucunun kabul edeceği yerin yarısında keserdi.
 *
 * NOT COMPOSER'INDAN FARKLAR:
 *  1. KARAKTER SAYACI VAR. Notta 150 vardı ve kullanıcı sınıra nadiren
 *     dayanıyordu; 400 karakterlik bir gönderide sayaçsız yazmak körlemesine.
 *  2. ANONİM ANAHTARI var (kapısı `/api/feed/me`den, premium tier'dan DEĞİL).
 *  3. ⚠️ MODERASYON İPUCU YOK. 2026-09-30'da telefon/sosyal medya/küfür
 *     serbest bırakıldı; "numaranı paylaşma" gibi bir metin hem yanlış hem bir
 *     hafta içinde bayat. UT-7306'da sunucunun `message`'ı aynen gösteriliyor.
 */

const INPUT_FONT_SIZE = 18;
const INPUT_FONT_WEIGHT = "500" as const;
const INPUT_MAX_LINES = 9;

type FeedPostForm = { body: string };

const styles = StyleSheet.create({
  // Ayna Text'ler: TextInput ile AYNI font metriği, görünmez, dokunmaz.
  // ⚠️ lineHeight VERİLMİYOR — iOS TextInput onu Text gibi uygulamıyor, ölçüm kayar.
  mirror: {
    position: "absolute",
    left: 0,
    right: 0,
    opacity: 0,
    fontSize: INPUT_FONT_SIZE,
    fontWeight: INPUT_FONT_WEIGHT,
  },
});

export interface FeedComposerSheetProps {
  visible: boolean;
  onClose: () => void;
  onSend: (body: string, isAnonymous: boolean) => void;
  /** `/api/feed/me`den; gelmemişse istemci tavanına düşülür. */
  maxLength?: number | null;
  anonymousGate: AnonymousGate;
  onAnonymousPaywall: () => void;
  /** Kullanıcının kendi üniversite adı — "şu akışta görünecek" satırı için. */
  universityLabel?: string | null;
  sending?: boolean;
  /** Doluyken sheet AÇIK KALIR ve metin korunur (UT-7306/7303/7316). */
  errorText?: string | null;
}

export default function FeedComposerSheet({
  visible,
  onClose,
  onSend,
  maxLength,
  anonymousGate,
  onAnonymousPaywall,
  universityLabel,
  sending = false,
  errorText = null,
}: FeedComposerSheetProps) {
  const { t } = useTranslation();
  const windowHeight = Dimensions.get("window").height;

  const limit = useMemo(() => resolveLimit(maxLength), [maxLength]);
  // Şema FABRİKA: tavan sunucudan geliyor, sabit bir şema onu yakalayamaz.
  const resolver = useMemo(() => zodResolver(feedPostSchema(limit)), [limit]);
  const { control, handleSubmit, reset } = useForm<FeedPostForm>({
    resolver,
    defaultValues: { body: "" },
    // `isValid` gönder butonunu sürdüğü için onChange şart.
    mode: "onChange",
  });

  const [isAnonymous, setIsAnonymous] = useState(false);

  useEffect(() => {
    if (visible) {
      reset({ body: "" });
      setIsAnonymous(false);
    }
  }, [visible, reset]);

  const { anchorRef, onFocus, onBlur } = useKeyboardAwareField();

  const submit = handleSubmit(({ body }) => {
    if (sending) return;
    onSend(body.trim(), isAnonymous);
  });

  // Kapanış animasyonu boyunca içerik boşalmasın diye son değerler ref'te
  // aynalanıyor (NoteComposerModal'daki aynı sorun: sheet inerken satırlar
  // kayboluyor ve yükseklik zıplıyor).
  const lastUniversity = useRef(universityLabel);
  if (visible && universityLabel) lastUniversity.current = universityLabel;
  const shownUniversity = universityLabel ?? lastUniversity.current;

  const anonLocked =
    anonymousGate.kind === "paywall" || anonymousGate.kind === "restricted";

  const handleAnonymousToggle = useCallback(
    (next: boolean) => {
      if (anonymousGate.kind === "paywall") {
        onAnonymousPaywall();
        return;
      }
      if (anonymousGate.kind !== "allowed") return;
      setIsAnonymous(next);
    },
    [anonymousGate, onAnonymousPaywall],
  );

  return (
    <AppModal
      visible={visible}
      onClose={onClose}
      title={t("feed.composer.title")}
      dynamicSizing
      maxDynamicContentSize={windowHeight * 0.82}
      // "extend" gönder butonunu klavyenin altına gömüyordu.
      keyboardBehavior="interactive"
      // X yok: swipe-down ve backdrop zaten kapatıyor.
      closeButton={false}
      contentContainerStyle={{ paddingTop: 20, paddingBottom: 28 }}
    >
      <View ref={anchorRef as any} collapsable={false}>
        <PostField
          control={control}
          limit={limit}
          editable={!sending}
          onFocus={onFocus}
          onBlur={onBlur}
        />

        {/* Hata: sheet AÇIK kalıyor, metin korunuyor. Sunucunun mesajı aynen —
            kategoriye özel istemci metni YOK (kurallar değişiyor). */}
        {errorText ? (
          <Text
            style={{
              marginTop: 12,
              fontSize: 13.5,
              lineHeight: 18,
              color: colors.errorStrong,
            }}
          >
            {errorText}
          </Text>
        ) : null}

        {/* ── Anonim anahtarı ── */}
        <View
          style={{
            flexDirection: "row",
            alignItems: "center",
            marginTop: 20,
            opacity: anonymousGate.kind === "unknown" ? 1 : 1,
          }}
        >
          <View style={{ flex: 1 }}>
            <View style={{ flexDirection: "row", alignItems: "center" }}>
              <Text style={{ fontSize: 15.5, fontWeight: "600", color: colors.text }}>
                {t("feed.composer.anonymousLabel")}
              </Text>
              {/* Kilit YALNIZ paywall/restricted dalında. "unknown" (/me henüz
                  gelmedi) iken kilit çizmek olmayan bir kısıt uydururdu. */}
              {anonLocked ? (
                <View style={{ marginLeft: 6 }}>
                  <SFIcon
                    name="lock.fill"
                    fallback={Lock}
                    size={12}
                    color={colors.textMuted}
                    strokeWidth={2}
                  />
                </View>
              ) : null}
            </View>
            <Text
              style={{ fontSize: 12.5, color: colors.textSecondary, marginTop: 2 }}
            >
              {anonymousGate.kind === "paywall"
                ? t("feed.composer.anonymousLocked")
                : anonymousGate.kind === "restricted"
                  ? t("feed.composer.anonymousRestricted")
                  : t("feed.composer.anonymousHint")}
            </Text>
          </View>

          {/* Paywall dalında anahtar YERİNE dokunulabilir bir sarmalayıcı:
              Switch'in kendisi tepkisiz (yanlışlıkla açılıp UT-7305 yenmesin),
              dokunuş paywall'a gidiyor (PremiumGate deseni). */}
          {anonymousGate.kind === "paywall" ? (
            <TouchableOpacity activeOpacity={0.7} onPress={onAnonymousPaywall}>
              <View style={{ opacity: 0.4 }} pointerEvents="none">
                <Switch value={false} />
              </View>
            </TouchableOpacity>
          ) : (
            <Switch
              value={isAnonymous}
              onValueChange={handleAnonymousToggle}
              disabled={anonymousGate.kind !== "allowed"}
            />
          )}
        </View>

        {/* Normal modda hangi akışta görüneceği — anonim modda anlamsız
            (kampüs yine aynı ama satır "kimliğin görünür" izlenimi veriyordu). */}
        {!isAnonymous && shownUniversity ? (
          <Text
            style={{ fontSize: 12.5, color: colors.textMuted, marginTop: 14 }}
          >
            {t("feed.composer.universityHint", { university: shownUniversity })}
          </Text>
        ) : null}

        <SendButton control={control} sending={sending} onPress={submit} />
      </View>
    </AppModal>
  );
}

/** Sunucu tavanı + istemci tavanı → yürürlükteki sınır (feedText ile aynı kural). */
function resolveLimit(serverValue?: number | null): number {
  const CEILING = 400;
  return typeof serverValue === "number" && serverValue > 0
    ? Math.min(serverValue, CEILING)
    : CEILING;
}

/**
 * Metin alanı + ayna ölçerler + KARAKTER SAYACI.
 *
 * Modül seviyesinde ve `useController`a abone: her tuşta yalnız BU alt ağaç
 * yeniden çiziliyor — anonim anahtarı, üniversite satırı ve başlık dokunulmuyor.
 */
function PostField({
  control,
  limit,
  editable,
  onFocus,
  onBlur,
}: {
  control: Control<FeedPostForm>;
  limit: number;
  editable: boolean;
  onFocus: () => void;
  onBlur: () => void;
}) {
  const { t } = useTranslation();
  const { field } = useController({ control, name: "body" });
  const [lineH, setLineH] = useState(0);
  const [contentH, setContentH] = useState(0);

  // Yükseklik = satır sayısı × ölçülen satır boyu → kutu hep TAM satıra oturur,
  // son satır ortadan kesilmez.
  const lineCount =
    lineH > 0
      ? Math.max(1, Math.min(INPUT_MAX_LINES, Math.round(contentH / lineH)))
      : 1;
  const inputHeight = lineH > 0 ? lineCount * lineH : INPUT_FONT_SIZE * 1.3;

  // ⚠️ Kırpma code point üzerinden; `maxLength` UTF-16 sayar ve emojiyi yarardı.
  const onChangeText = useCallback(
    (next: string) => field.onChange(clampFeedText(next, limit)),
    [field, limit],
  );

  const used = feedTextLength(field.value ?? "");
  const remaining = limit - used;
  // Sayaç BAŞTAN değil, sona yaklaşınca görünür: 400 karakterlik bir alanda
  // "3/400" sürekli durursa gereksiz baskı yaratıyor.
  const showCounter = remaining <= FEED_COUNTER_WARN_REMAINING || used > 0;

  return (
    // Aynalar ve input AYNI sarmalayıcıda, sarmalayıcının padding'i YOK —
    // absolute aynalar input'la birebir aynı genişlikte ölçsün.
    <View>
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
        {/* ZWSP: sondaki \n'in de satır sayması için. */}
        {(field.value || " ") + "​"}
      </Text>
      <BottomSheetTextInput
        value={field.value}
        onChangeText={onChangeText}
        onFocus={onFocus}
        onBlur={() => {
          field.onBlur();
          onBlur();
        }}
        placeholder={t("feed.composer.placeholder")}
        placeholderTextColor={colors.textMuted}
        multiline
        autoFocus
        editable={editable}
        style={{
          color: colors.text,
          fontSize: INPUT_FONT_SIZE,
          fontWeight: INPUT_FONT_WEIGHT,
          padding: 0,
          textAlignVertical: "top",
          height: inputHeight,
        }}
      />
      {showCounter ? (
        <Text
          style={{
            alignSelf: "flex-end",
            marginTop: 8,
            fontSize: 12.5,
            fontVariant: ["tabular-nums"],
            color:
              remaining <= FEED_COUNTER_WARN_REMAINING
                ? colors.errorStrong
                : colors.textMuted,
          }}
        >
          {used}/{limit}
        </Text>
      ) : null}
    </View>
  );
}

/**
 * Gönder butonu ayrı: `isValid`e abone olduğu için boş↔dolu geçişinde YALNIZ
 * kendisi yeniden çiziliyor, her tuşta değil.
 */
function SendButton({
  control,
  sending,
  onPress,
}: {
  control: Control<FeedPostForm>;
  sending: boolean;
  onPress: () => void;
}) {
  const { t } = useTranslation();
  const { isValid } = useFormState({ control });
  const disabled = !isValid || sending;

  return (
    <Pressable
      onPress={onPress}
      disabled={disabled}
      style={{
        marginTop: 20,
        paddingVertical: 14,
        borderRadius: 999,
        borderCurve: "continuous",
        alignItems: "center",
        justifyContent: "center",
        backgroundColor: colors.inverseSurface,
        opacity: disabled ? 0.45 : 1,
      }}
    >
      {/* Etiket yerinde kalıyor (opacity 0) ve spinner üstüne biniyor —
          genişlik zıplamasın (EmptyState'in buttonBusy deseni). */}
      <Text
        style={{
          fontSize: 15.5,
          fontWeight: "600",
          color: colors.onInverseSurface,
          opacity: sending ? 0 : 1,
        }}
      >
        {t("feed.composer.send")}
      </Text>
      {sending ? (
        <View style={StyleSheet.absoluteFill as any}>
          <View style={{ flex: 1, alignItems: "center", justifyContent: "center" }}>
            <ActivityIndicator size="small" color={colors.onInverseSurface} />
          </View>
        </View>
      ) : null}
    </Pressable>
  );
}
