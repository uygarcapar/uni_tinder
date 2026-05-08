import { useState } from 'react';
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
import moderationService, { REPORT_REASON_LABELS_TR, ReportReason } from '../services/moderationService';

/**
 * Kullanıcı şikayet modal'ı.
 * Props: visible, onClose, reportedUserId, conversationId?, messageId?, onSuccess?
 */
export default function ReportModal({
  visible,
  onClose,
  reportedUserId,
  conversationId,
  messageId,
  onSuccess,
}) {
  const insets = useSafeAreaInsets();
  const [reason, setReason] = useState(null);
  const [description, setDescription] = useState('');
  const [submitting, setSubmitting] = useState(false);

  const reset = () => {
    setReason(null);
    setDescription('');
    setSubmitting(false);
  };

  const handleClose = () => {
    if (submitting) return;
    reset();
    onClose?.();
  };

  const handleSubmit = async () => {
    if (!reason) return;
    setSubmitting(true);
    try {
      await moderationService.reportUser({
        reportedUserId,
        reason,
        description: description.trim() || undefined,
        conversationId,
        messageId,
      });
      Alert.alert(
        'Şikayet alındı',
        'Ekibimiz en kısa sürede inceleyecek. Güvende kalman önemli.',
        [{ text: 'Tamam', onPress: () => { reset(); onClose?.(); onSuccess?.(); } }],
      );
    } catch (err) {
      const status = err?.response?.status;
      if (status === 409) {
        Alert.alert('Bilgi', 'Bu kullanıcıyı son 24 saatte zaten şikayet ettin.');
      } else {
        Alert.alert('Hata', err?.response?.data?.message || 'Şikayet gönderilemedi.');
      }
    } finally {
      setSubmitting(false);
    }
  };

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

          {Object.entries(REPORT_REASON_LABELS_TR).map(([key, label]) => (
            <Pressable
              key={key}
              onPress={() => setReason(key)}
              className={`flex-row items-center justify-between px-4 py-4 mb-2 rounded-2xl border ${
                reason === key
                  ? 'border-[#f57656] bg-[#f57656]/10'
                  : 'border-[#262626] bg-[#1a1a1a]'
              }`}
            >
              <Text className={`text-base ${reason === key ? 'text-white font-semibold' : 'text-gray-200'}`}>
                {label}
              </Text>
              <View
                style={{
                  width: 20,
                  height: 20,
                  borderRadius: 10,
                  borderWidth: 2,
                  borderColor: reason === key ? '#f57656' : '#3a3a3a',
                  alignItems: 'center',
                  justifyContent: 'center',
                }}
              >
                {reason === key && (
                  <View
                    style={{
                      width: 10,
                      height: 10,
                      borderRadius: 5,
                      backgroundColor: '#f57656',
                    }}
                  />
                )}
              </View>
            </Pressable>
          ))}

          <Text className="text-white text-base font-semibold mt-6 mb-2">
            Detay (opsiyonel)
          </Text>
          <TextInput
            value={description}
            onChangeText={setDescription}
            placeholder="Olayı kısaca anlat…"
            placeholderTextColor="#6b7280"
            multiline
            maxLength={1000}
            className="text-white text-base bg-[#1a1a1a] rounded-2xl p-4"
            style={{ minHeight: 100, textAlignVertical: 'top', borderWidth: 1, borderColor: '#262626' }}
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
            onPress={handleSubmit}
            disabled={!reason || submitting}
            className="rounded-full py-3.5 items-center justify-center"
            style={{ backgroundColor: reason ? '#ef4444' : '#3a3a3a' }}
          >
            {submitting
              ? <ActivityIndicator size="small" color="#fff" />
              : <Text className="text-white font-bold text-base">Şikayet Et</Text>
            }
          </TouchableOpacity>
        </View>
      </View>
    </Modal>
  );
}
