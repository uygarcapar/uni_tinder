import {
  Modal,
  View,
  Text,
  TextInput,
  TouchableOpacity,
  ActivityIndicator,
  Alert,
  Pressable,
  ScrollView,
} from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { X, Flag } from 'lucide-react-native';
import moderationService, { REPORT_REASON_LABELS_TR } from '@/shared/services/moderationService';
import { useForm, Controller } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { reportSchema, ReportForm } from '@/shared/schemas/formSchemas';
import { colors } from '../theme/colors';

export default function ReportModal({
  visible,
  onClose,
  reportedUserId,
  conversationId,
  messageId,
  onSuccess,
}: any) {
  const insets = useSafeAreaInsets();

  const { control, handleSubmit, reset, watch, formState: { isSubmitting } } = useForm<ReportForm>({
    resolver: zodResolver(reportSchema),
    defaultValues: { reason: '', description: '' },
  });

  const reason = watch('reason');
  const description = watch('description') || '';

  const handleClose = () => {
    if (isSubmitting) return;
    reset();
    onClose?.();
  };

  const handleSubmitForm = handleSubmit(async ({ reason: r, description: d }) => {
    try {
      await moderationService.reportUser({
        reportedUserId,
        reason: r as any,
        description: d?.trim() || undefined,
        conversationId,
        messageId,
      });
      Alert.alert(
        'Şikayet alındı',
        'Ekibimiz en kısa sürede inceleyecek. Güvende kalman önemli.',
        [{ text: 'Tamam', onPress: () => { reset(); onClose?.(); onSuccess?.(); } }],
      );
    } catch (err: any) {
      const status = err?.response?.status;
      if (status === 409) {
        Alert.alert('Bilgi', 'Bu kullanıcıyı son 24 saatte zaten şikayet ettin.');
      } else {
        Alert.alert('Hata', err?.response?.data?.message || 'Şikayet gönderilemedi.');
      }
    }
  });

  if (!visible) return null;

  return (
    <Modal visible animationType="slide" onRequestClose={handleClose}>
      <View style={{ flex: 1, backgroundColor: colors.bgDeep, paddingTop: insets.top }}>
        {/* Header */}
        <View className="flex-row items-center px-4 py-3 border-b border-surface-5">
          <TouchableOpacity onPress={handleClose} hitSlop={10} className="p-2">
            <X size={24} color={colors.text} />
          </TouchableOpacity>
          <Text className="text-white text-base font-semibold flex-1 ml-2">
            Kullanıcıyı Şikayet Et
          </Text>
        </View>

        <ScrollView contentContainerStyle={{ padding: 20 }}>
          <View className="flex-row items-center mb-4">
            <Flag size={20} color={colors.primary} />
            <Text className="text-white text-base font-semibold ml-2">Şikayet sebebi</Text>
          </View>

          <Controller
            control={control}
            name="reason"
            render={({ field: { onChange, value } }) => (
              <>
                {Object.entries(REPORT_REASON_LABELS_TR).map(([key, label]) => (
                  <Pressable
                    key={key}
                    onPress={() => onChange(key)}
                    className={`flex-row items-center justify-between px-4 py-4 mb-2 rounded-2xl border ${
                      value === key
                        ? 'border-primary bg-primary/10'
                        : 'border-surface-3 bg-surface-5'
                    }`}
                  >
                    <Text className={`text-base ${value === key ? 'text-white font-semibold' : 'text-gray-200'}`}>
                      {label as string}
                    </Text>
                    <View
                      style={{
                        width: 20, height: 20, borderRadius: 10, borderWidth: 2,
                        borderColor: value === key ? colors.primary : colors.border,
                        alignItems: 'center', justifyContent: 'center',
                      }}
                    >
                      {value === key && (
                        <View style={{ width: 10, height: 10, borderRadius: 5, backgroundColor: colors.primary }} />
                      )}
                    </View>
                  </Pressable>
                ))}
              </>
            )}
          />

          <Text className="text-white text-base font-semibold mt-6 mb-2">
            Detay (opsiyonel)
          </Text>
          <Controller
            control={control}
            name="description"
            render={({ field: { onChange, value } }) => (
              <TextInput
                value={value}
                onChangeText={onChange}
                placeholder="Olayı kısaca anlat…"
                placeholderTextColor={colors.textMuted}
                multiline
                maxLength={1000}
                className="text-white text-base bg-surface-5 rounded-2xl p-4"
                style={{ minHeight: 100, textAlignVertical: 'top', borderWidth: 1, borderColor: colors.surface3 }}
              />
            )}
          />
          <Text className="text-gray-500 text-xs mt-2 text-right">
            {description.length}/1000
          </Text>

          <Text className="text-gray-500 text-xs mt-6 leading-5">
            Şikayetler ekibimiz tarafından incelenir. Kasıtlı yanlış şikayetler hesabının
            kısıtlanmasına neden olabilir.
          </Text>
        </ScrollView>

        {/* Bottom action */}
        <View
          className="px-4 pt-3 border-t border-surface-5"
          style={{ paddingBottom: Math.max(insets.bottom, 16) }}
        >
          <TouchableOpacity
            onPress={handleSubmitForm}
            disabled={!reason || isSubmitting}
            className="rounded-full py-3.5 items-center justify-center"
            style={{ backgroundColor: reason ? colors.error : colors.border }}
          >
            {isSubmitting
              ? <ActivityIndicator size="small" color={colors.text} />
              : <Text className="text-white font-bold text-base">Şikayet Et</Text>
            }
          </TouchableOpacity>
        </View>
      </View>
    </Modal>
  );
}
