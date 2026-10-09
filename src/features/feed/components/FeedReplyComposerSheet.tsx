import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import {
  ActivityIndicator,
  Dimensions,
  Pressable,
  StyleSheet,
  Text,
  View,
} from "react-native";
import { BottomSheetTextInput } from "@gorhom/bottom-sheet";
import { useTranslation } from "react-i18next";
import { useController, useForm, useFormState, type Control } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import AppModal from "@/shared/components/AppModal";
import { useKeyboardAwareField } from "@/shared/hooks/useKeyboardAwareField";
import { colors } from "@/shared/theme/colors";
import { feedReplySchema } from "@/shared/schemas/formSchemas";
import {
  FEED_COUNTER_WARN_REMAINING,
  clampFeedText,
  feedTextLength,
} from "../feedText";

/**
 * Akış yanıt composer'ı.
 *
 * `FeedComposerSheet`in kardeşi; aynı iskelet, üç fark:
 *  • tavan 150 (gönderi 400),
 *  • üstte ALINTILANAN gönderi duruyor — kullanıcı neye yanıt verdiğini görmeli,
 *  • anonim anahtarı YOK: yanıt her zaman kimlikli gider (gönderi sahibi
 *    yanıtlayanı görüyor, sözleşme §7.2) ve bunu bir seçenekmiş gibi sunmak
 *    yanlış beklenti yaratırdı.
 *
 * İskeletin "neden" gerekçeleri FeedComposerSheet başlığında; burada
 * tekrarlanmıyor ama kurallar AYNI (üç modül seviyesi alt bileşen,
 * BottomSheetTextInput, ayna ölçüm, code-point kırpma).
 */

const INPUT_FONT_SIZE = 18;
const INPUT_FONT_WEIGHT = "500" as const;
const INPUT_MAX_LINES = 5;
const REPLY_CEILING = 150;

type FeedReplyForm = { comment: string };

const styles = StyleSheet.create({
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

export interface FeedReplyComposerSheetProps {
  visible: boolean;
  onClose: () => void;
  onSend: (comment: string) => void;
  /** Yanıt verilen gönderinin gövdesi — alıntı için. */
  postExcerpt?: string | null;
  /** Anonim gönderiye yanıt veriliyorsa alıntı başlığı değişiyor. */
  postIsAnonymous?: boolean;
  maxLength?: number | null;
  /** Kalan yanıt hakkı. `null` = backend henüz söylemedi → satır çizilmez. */
  remaining?: number | null;
  sending?: boolean;
  /** Doluyken sheet AÇIK KALIR ve metin korunur. */
  errorText?: string | null;
}

export default function FeedReplyComposerSheet({
  visible,
  onClose,
  onSend,
  postExcerpt,
  postIsAnonymous = false,
  maxLength,
  remaining = null,
  sending = false,
  errorText = null,
}: FeedReplyComposerSheetProps) {
  const { t } = useTranslation();
  const windowHeight = Dimensions.get("window").height;

  const limit = useMemo(() => {
    return typeof maxLength === "number" && maxLength > 0
      ? Math.min(maxLength, REPLY_CEILING)
      : REPLY_CEILING;
  }, [maxLength]);

  const resolver = useMemo(() => zodResolver(feedReplySchema(limit)), [limit]);
  const { control, handleSubmit, reset } = useForm<FeedReplyForm>({
    resolver,
    defaultValues: { comment: "" },
    mode: "onChange",
  });

  useEffect(() => {
    if (visible) reset({ comment: "" });
  }, [visible, reset]);

  const { anchorRef, onFocus, onBlur } = useKeyboardAwareField();

  const submit = handleSubmit(({ comment }) => {
    if (sending) return;
    onSend(comment.trim());
  });

  // Kapanış animasyonu boyunca alıntı boşalmasın (sheet inerken yükseklik
  // zıplıyordu — NoteComposerModal'daki aynı dert).
  const lastExcerpt = useRef(postExcerpt);
  if (visible && postExcerpt) lastExcerpt.current = postExcerpt;
  const shownExcerpt = postExcerpt ?? lastExcerpt.current;

  return (
    <AppModal
      visible={visible}
      onClose={onClose}
      title={t("feed.reply.title")}
      dynamicSizing
      maxDynamicContentSize={windowHeight * 0.82}
      keyboardBehavior="interactive"
      closeButton={false}
      contentContainerStyle={{ paddingTop: 16, paddingBottom: 28 }}
    >
      {/* Alıntı: neye yanıt verdiğin. En fazla 3 satır — daha uzunu composer'ı
          ikinci plana atıyordu. */}
      {shownExcerpt ? (
        <View
          style={{
            backgroundColor: colors.surface,
            borderRadius: 14,
            borderCurve: "continuous",
            padding: 12,
            marginBottom: 16,
          }}
        >
          <Text style={{ fontSize: 11.5, color: colors.textMuted }}>
            {postIsAnonymous
              ? t("feed.received.onYourAnonymousPost")
              : t("feed.reply.quoteLabel")}
          </Text>
          <Text
            numberOfLines={3}
            style={{
              fontSize: 13.5,
              lineHeight: 18,
              color: colors.textSecondary,
              marginTop: 3,
            }}
          >
            {shownExcerpt}
          </Text>
        </View>
      ) : null}

      <View ref={anchorRef as any} collapsable={false}>
        <ReplyField
          control={control}
          limit={limit}
          editable={!sending}
          onFocus={onFocus}
          onBlur={onBlur}
        />

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

        {/* Kalan hak — `null` ise satır HİÇ çizilmiyor ("0" yazmaktansa
            susmak; backend alanı göndermemiş olabilir). */}
        {typeof remaining === "number" ? (
          <Text
            style={{ fontSize: 12.5, color: colors.textMuted, marginTop: 14 }}
          >
            {t("feed.reply.remaining", { count: remaining })}
          </Text>
        ) : null}

        <SendButton control={control} sending={sending} onPress={submit} />
      </View>
    </AppModal>
  );
}

function ReplyField({
  control,
  limit,
  editable,
  onFocus,
  onBlur,
}: {
  control: Control<FeedReplyForm>;
  limit: number;
  editable: boolean;
  onFocus: () => void;
  onBlur: () => void;
}) {
  const { t } = useTranslation();
  const { field } = useController({ control, name: "comment" });
  const [lineH, setLineH] = useState(0);
  const [contentH, setContentH] = useState(0);

  const lineCount =
    lineH > 0
      ? Math.max(1, Math.min(INPUT_MAX_LINES, Math.round(contentH / lineH)))
      : 1;
  const inputHeight = lineH > 0 ? lineCount * lineH : INPUT_FONT_SIZE * 1.3;

  const onChangeText = useCallback(
    (next: string) => field.onChange(clampFeedText(next, limit)),
    [field, limit],
  );

  const used = feedTextLength(field.value ?? "");
  const remaining = limit - used;

  return (
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
        placeholder={t("feed.reply.placeholder")}
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
      {used > 0 ? (
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

function SendButton({
  control,
  sending,
  onPress,
}: {
  control: Control<FeedReplyForm>;
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
        marginTop: 18,
        paddingVertical: 14,
        borderRadius: 999,
        borderCurve: "continuous",
        alignItems: "center",
        justifyContent: "center",
        backgroundColor: colors.inverseSurface,
        opacity: disabled ? 0.45 : 1,
      }}
    >
      <Text
        style={{
          fontSize: 15.5,
          fontWeight: "600",
          color: colors.onInverseSurface,
          opacity: sending ? 0 : 1,
        }}
      >
        {t("feed.reply.send")}
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
