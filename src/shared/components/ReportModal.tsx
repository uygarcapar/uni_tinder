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
        reason: r,
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
      <View style={{ flex: 1, backgroundColor: '#0a0a0a', paddingTop: insets.top }}>
        {/* Header */}
        <View className="flex-row items-center px-4 py-3 border-b border-[#1a1a1a]">
          <TouchableOpacity onPress={handleClose} hitSlop={10} className="p-2">
            <X size={24} color="#fff" />
          </TouchableOpacity>
          <Text className="text-white text-base font-semibold flex-1 ml-2">
            Kullanıcıyı Şikayet Et
          </Text>
        </View>

        <ScrollView contentContainerStyle={{ padding: 20 }}>
          <View className="flex-row items-center mb-4">
            <Flag size={20} color="#f57656" />
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
                        ? 'border-[#f57656] bg-[#f57656]/10'
                        : 'border-[#262626] bg-[#1a1a1a]'
                    }`}
                  >
                    <Text className={`text-base ${value === key ? 'text-white font-semibold' : 'text-gray-200'}`}>
                      {label as string}
                    </Text>
                    <View
                      style={{
                        width: 20, height: 20, borderRadius: 10, borderWidth: 2,
                        borderColor: value === key ? '#f57656' : '#3a3a3a',
                        alignItems: 'center', justifyContent: 'center',
                      }}
                    >
                      {value === key && (
                        <View style={{ width: 10, height: 10, borderRadius: 5, backgroundColor: '#f57656' }} />
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
                placeholderTextColor="#6b7280"
                multiline
                maxLength={1000}
                className="text-white text-base bg-[#1a1a1a] rounded-2xl p-4"
                style={{ minHeight: 100, textAlignVertical: 'top', borderWidth: 1, borderColor: '#262626' }}
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
          className="px-4 pt-3 border-t border-[#1a1a1a]"
          style={{ paddingBottom: Math.max(insets.bottom, 16) }}
        >
          <TouchableOpacity
            onPress={handleSubmitForm}
            disabled={!reason || isSubmitting}
            className="rounded-full py-3.5 items-center justify-center"
            style={{ backgroundColor: reason ? '#ef4444' : '#3a3a3a' }}
          >
            {isSubmitting
              ? <ActivityIndicator size="small" color="#fff" />
              : <Text className="text-white font-bold text-base">Şikayet Et</Text>
            }
          </TouchableOpacity>
        </View>
      </View>
    </Modal>
  );
}
