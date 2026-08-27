import {
  View,
  Text,
  TouchableOpacity,
  ActivityIndicator,
  Alert,
  Switch,
} from "react-native";
import { BottomSheetTextInput } from "@gorhom/bottom-sheet";
import { useTranslation } from "react-i18next";
import { useState } from "react";
import { Check, InfoIcon } from "lucide-react-native";
import SFIcon from "./SFIcon";
import AppModal from "./AppModal";
import { useKeyboardAwareField } from "@/shared/hooks/useKeyboardAwareField";
import moderationService, {
  ReportReason,
  ReportReasonType,
} from "@/shared/services/moderationService";
import { useForm, Controller } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { reportSchema, ReportForm } from "@/shared/schemas/formSchemas";
import { colors } from "../theme/colors";

// Sebepler enum sırasında sabit: "Diğer" en sonda kalsın, listenin sırası
// sunucu enum'undan bağımsız olmasın. Etiketler i18n'den (bkz. moderation.report.reasons).
const REASON_ORDER: ReportReasonType[] = [
  ReportReason.Spam,
  ReportReason.Harassment,
  ReportReason.InappropriateContent,
  ReportReason.FakeProfile,
  ReportReason.Underage,
  ReportReason.Scam,
  ReportReason.Other,
];

// ConversationOptionsSheet ile birebir aynı başlık deseni: 20/600 başlık,
// altında info ikonu + açıklama. Şikayet akışı o sheet'ten açılıyor, iki ekran
// aynı görünmeli.
function Section({
  title,
  description,
  marginTop = 28,
}: {
  title: string;
  description?: string;
  marginTop?: number;
}) {
  return (
    <View
      style={{
        flexDirection: "column",
        alignItems: "flex-start",
        marginTop,
        marginBottom: 10,
      }}
    >
      <Text
        style={{
          color: colors.text,
          fontSize: 20,
          fontWeight: "600",
          marginBottom: description ? 9 : 0,
        }}
      >
        {title}
      </Text>
      {description ? (
        <View
          style={{
            flexDirection: "row",
            alignItems: "center",
            gap: 8,
            paddingRight: 16,
            marginBottom: 4,
          }}
        >
          <SFIcon
            name="info.circle"
            fallback={InfoIcon}
            size={16}
            color={colors.textSecondary}
            strokeWidth={2}
            weight="semibold"
          />
          <Text
            style={{
              color: colors.textSecondary,
              fontSize: 14,
              fontWeight: "400",
              flex: 1,
            }}
          >
            {description}
          </Text>
        </View>
      ) : null}
    </View>
  );
}

// Anchor'ı KENDİ bileşenine sarmak zorunlu: useKeyboardAwareField, modal scroll
// view'ını AppModalScrollContext'ten okuyor ve o provider AppModal'ın İÇİNDE.
// Hook ReportModal'ın gövdesinde çağrılınca context ağaçta daha aşağıda kalıyor,
// `ctx` null geliyor ve reveal() scroller bulamayıp sessizce çıkıyordu — detay
// alanı klavyenin altında kalmasının sebebi buydu. Bu bileşen AppModal'ın
// children'ı olarak render edildiği için provider'ın altında.
function KeyboardAwareAnchor({
  children,
}: {
  children: (handlers: {
    onFocus: () => void;
    onBlur: () => void;
  }) => React.ReactNode;
}) {
  const { anchorRef, onFocus, onBlur } = useKeyboardAwareField();
  return (
    <View ref={anchorRef} collapsable={false}>
      {children({ onFocus, onBlur })}
    </View>
  );
}

// Sebep satırı — SettingsModal/ConversationOptionsSheet pill'i (radius 36,
// 0.5 border). Seçili hali FilterModal'ın seçim pill'iyle aynı: dolu
// inverseSurface + onInverseSurface metin/ikon.
function ReasonRow({
  label,
  selected,
  onPress,
}: {
  label: string;
  selected: boolean;
  onPress: () => void;
}) {
  return (
    <TouchableOpacity
      onPress={onPress}
      activeOpacity={1}
      accessibilityRole="radio"
      accessibilityState={{ selected }}
      style={{
        borderRadius: 36,
        borderCurve: "continuous",
        overflow: "hidden",
        borderWidth: 0.5,
        borderColor: selected ? colors.inverseSurface : colors.hairline,
        backgroundColor: selected ? colors.inverseSurface : undefined,
        flexDirection: "row",
        alignItems: "center",
        justifyContent: "space-between",
        padding: 16,
        paddingHorizontal: 20,
        marginBottom: 8,
      }}
    >
      <Text
        style={{
          color: selected ? colors.onInverseSurface : colors.text,
          fontSize: 15,
          fontWeight: "500",
          flex: 1,
        }}
      >
        {label}
      </Text>
      {selected ? (
        <SFIcon
          name="checkmark"
          fallback={Check}
          size={18}
          color={colors.onInverseSurface}
          strokeWidth={2}
          weight="semibold"
          style={{ pointerEvents: "none" }}
        />
      ) : null}
    </TouchableOpacity>
  );
}

export default function ReportModal({
  visible,
  onClose,
  reportedUserId,
  conversationId,
  messageId,
  noteId,
  onSuccess,
}: any) {
  const { t } = useTranslation();
  // "Bildirmek istiyorum ama iletişimi kesmek istemiyorum" senaryosu için
  // kaldırılabilir; varsayılan İŞARETLİ. Alan sunucuya HER ZAMAN açıkça gider —
  // varsayılanı uca göre değişiyor (bkz. moderationService.ReportArgs).
  const [alsoBlock, setAlsoBlock] = useState(true);

  const { control, handleSubmit, reset, watch, formState: { isSubmitting } } = useForm<ReportForm>({
    resolver: zodResolver(reportSchema),
    defaultValues: { reason: '', description: '' },
  });

  const reason = watch('reason');
  const description = watch('description') || '';

  // X butonu YOK: sheet swipe-down/backdrop ile kapanıyor ve o noktada gorhom
  // dismiss'i zaten yapmış oluyor. Gönderim sürerken erken çıkıp parent'ın
  // `visible`ını true bırakırsak sheet bir daha present edilemez — bu yüzden
  // kapanış her koşulda parent'a iletilir.
  const handleClose = () => {
    reset();
    setAlsoBlock(true);
    onClose?.();
  };

  const handleSubmitForm = handleSubmit(async ({ reason: r, description: d }) => {
    try {
      const result = await moderationService.reportUser({
        reportedUserId,
        reason: r as any,
        description: d?.trim() || undefined,
        conversationId,
        messageId,
        // Not şikayeti: moderatör panelinde yorumun metni de görünsün diye.
        // Notu olmayan kartlarda undefined → gövdeye hiç yazılmaz.
        noteId,
        alsoBlock,
      });
      const finish = () => {
        reset();
        setAlsoBlock(true);
        onClose?.();
        onSuccess?.(result);
      };
      // Şikayet kaydedildiği halde engelleme düşmüş olabilir. "Engellendi" deyip
      // engellememek en kötü hata — kullanıcıya tekrar deneme imkânı sunuyoruz.
      if (alsoBlock && result && !result.blocked) {
        Alert.alert(
          t('moderation.report.successTitle'),
          t('moderation.report.blockFailed'),
          [
            { text: t('common.ok'), onPress: finish },
            {
              text: t('moderation.report.blockRetry'),
              onPress: async () => {
                try {
                  await moderationService.blockUser(reportedUserId);
                  onSuccess?.({ ...result, blocked: true });
                } catch {
                  Alert.alert(t('common.error'), t('moderation.report.blockRetryFailed'));
                  onSuccess?.(result);
                }
                reset();
                setAlsoBlock(true);
                onClose?.();
              },
            },
          ],
        );
        return;
      }
      Alert.alert(
        t('moderation.report.successTitle'),
        alsoBlock
          ? t('moderation.report.successBlockedMessage')
          : t('moderation.report.successMessage'),
        [{ text: t('common.ok'), onPress: finish }],
      );
    } catch (err: any) {
      const status = err?.response?.status;
      if (status === 409) {
        Alert.alert(t('common.info'), t('moderation.report.alreadyReported'));
      } else {
        Alert.alert(t('common.error'), err?.response?.data?.message || t('moderation.report.error'));
      }
    }
  });

  const canSubmit = !!reason && !isSubmitting;
  const submitFg = reason ? colors.onInverseSurface : colors.textSecondary;

  return (
    <AppModal
      visible={visible}
      onClose={handleClose}
      title={t('moderation.report.title')}
      // Header'da X yok — sheet swipe-down/backdrop ile kapanır, başlık scroll
      // ile belirir. İlk ekranda büyük başlığı ilk Section üstleniyor.
      closeButton={false}
      contentContainerStyle={{ paddingTop: 36 }}
    >
      <Section
        title={t('moderation.report.reasonLabel')}
        description={t('moderation.report.reasonDescription')}
        marginTop={4}
      />
      <Controller
        control={control}
        name="reason"
        render={({ field: { onChange, value } }) => (
          <>
            {REASON_ORDER.map((key) => (
              <ReasonRow
                key={key}
                label={t(`moderation.report.reasons.${key}`)}
                selected={value === key}
                onPress={() => onChange(key)}
              />
            ))}
          </>
        )}
      />

      <Section
        title={t('moderation.report.detailLabel')}
        description={t('moderation.report.detailDescription')}
      />
      {/* Detay alanı içeriğin sonuna yakın; klavye açılınca altında kalıyordu.
          Anchor View ölçülüp modal scroll'u klavyenin üstüne taşınıyor. */}
      <KeyboardAwareAnchor>
        {({ onFocus, onBlur }) => (
          <Controller
            control={control}
            name="description"
            render={({ field: { onChange, value } }) => (
              // BottomSheetTextInput şart: düz TextInput'ta gorhom klavye
              // target'ını set etmiyor ve sheet klavye davranışını atlıyor.
              <BottomSheetTextInput
                value={value}
                onChangeText={onChange}
                onFocus={onFocus}
                onBlur={onBlur}
                placeholder={t('moderation.report.detailPlaceholder')}
                placeholderTextColor={colors.textSecondary}
                multiline
                maxLength={1000}
                style={{
                  borderRadius: 30,
                  borderCurve: "continuous",
                  overflow: "hidden",
                  borderWidth: 0.5,
                  borderColor: colors.hairline,
                  color: colors.text,
                  fontSize: 15,
                  lineHeight: 22,
                  minHeight: 110,
                  textAlignVertical: "top",
                  padding: 12,
                  paddingLeft: 16,
                }}
              />
            )}
          />
        )}
      </KeyboardAwareAnchor>
      <Text
        style={{
          color: colors.textSecondary,
          fontSize: 12,
          marginTop: 8,
          paddingHorizontal: 4,
          textAlign: "right",
        }}
      >
        {t('moderation.report.characterCount', { count: description.length })}
      </Text>

      {/* Şikayet ARTIK zorunlu engelleme yapmıyor (v1.5): işaretli gelir,
          kullanıcı kaldırabilir. Engelleme KALICIDIR — ne "engeli kaldır"
          ne de geri alma penceresi eşleşmeyi geri getirir. */}
      <Section
        title={t('moderation.report.blockSectionTitle')}
        description={t('moderation.report.alsoBlockHint')}
      />
      <TouchableOpacity
        onPress={() => setAlsoBlock((v) => !v)}
        activeOpacity={1}
        accessibilityRole="switch"
        accessibilityState={{ checked: alsoBlock }}
        style={{
          borderRadius: 36,
          borderCurve: "continuous",
          overflow: "hidden",
          borderWidth: 0.5,
          borderColor: colors.hairline,
          flexDirection: "row",
          alignItems: "center",
          justifyContent: "space-between",
          padding: 16,
          paddingHorizontal: 20,
        }}
      >
        <Text
          style={{
            color: colors.text,
            fontSize: 15,
            fontWeight: "500",
            flex: 1,
            marginRight: 12,
          }}
        >
          {t('moderation.report.alsoBlock')}
        </Text>
        {/* Dokunuş her zaman satıra gitsin — Switch salt gösterge. */}
        <View pointerEvents="none">
          <Switch
            value={alsoBlock}
            trackColor={{ false: colors.hairlineStrong, true: colors.errorStrong }}
            thumbColor={colors.text}
            ios_backgroundColor={colors.border}
          />
        </View>
      </TouchableOpacity>

      <View
        style={{
          flexDirection: "row",
          alignItems: "flex-start",
          gap: 8,
          marginTop: 24,
          paddingHorizontal: 4,
        }}
      >
        <SFIcon
          name="info.circle"
          fallback={InfoIcon}
          size={16}
          color={colors.textSecondary}
          strokeWidth={2}
          weight="semibold"
          style={{ marginTop: 2 }}
        />
        <Text
          style={{
            color: colors.textSecondary,
            fontSize: 13,
            lineHeight: 19,
            flex: 1,
          }}
        >
          {t('moderation.report.disclaimer')}
        </Text>
      </View>

      {/* Ana aksiyon içeriğin EN SONUNDA (sticky footer yok): kullanıcı sebebi,
          detayı, engelleme kararını ve uyarıyı görüp en altta onaylıyor. */}
      <TouchableOpacity
        testID="report-submit"
        onPress={handleSubmitForm}
        disabled={!canSubmit}
        activeOpacity={1}
        style={{
          borderRadius: 36,
          borderCurve: "continuous",
          overflow: "hidden",
          borderWidth: 0.5,
          borderColor: reason ? colors.errorStrong : colors.hairline,
          backgroundColor: reason ? colors.errorStrong : undefined,
          flexDirection: "row",
          alignItems: "center",
          justifyContent: "center",
          padding: 16,
          paddingHorizontal: 20,
          marginTop: 28,
        }}
      >
        <Text
          style={{
            color: submitFg,
            fontSize: 15,
            fontWeight: "500",
            textAlign: "center",
          }}
        >
          {t('moderation.report.submit')}
        </Text>
        {/* Spinner absolute: akışa girseydi gönderim başlayınca etiketi
            merkezden kaydırırdı. */}
        {isSubmitting && (
          <ActivityIndicator
            size="small"
            color={submitFg}
            style={{ position: "absolute", right: 20, width: 18, height: 18 }}
          />
        )}
      </TouchableOpacity>
    </AppModal>
  );
}
