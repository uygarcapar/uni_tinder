import { useState, useRef, useEffect } from 'react';
import {
  View,
  Text,
  TextInput,
  TouchableOpacity,
  ActivityIndicator,
  KeyboardAvoidingView,
  Platform,
} from 'react-native';
import { useDispatch } from 'react-redux';
import { authService } from '../services/authService';
import { setUser, clearVerification } from '../store/slices/authSlice';

export default function EmailVerificationScreen({ route, navigation }) {
  const { email } = route.params;
  const [code, setCode] = useState(['', '', '', '', '', '']);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const [resendLoading, setResendLoading] = useState(false);
  const [resendSuccess, setResendSuccess] = useState(false);
  const [countdown, setCountdown] = useState(0);

  const inputRefs = useRef([]);
  const dispatch = useDispatch();

  // Countdown timer for resend
  useEffect(() => {
    if (countdown > 0) {
      const timer = setTimeout(() => setCountdown(countdown - 1), 1000);
      return () => clearTimeout(timer);
    }
  }, [countdown]);

  const handleCodeChange = (text, index) => {
    // Only allow numbers
    if (text && !/^\d+$/.test(text)) return;

    const newCode = [...code];
    newCode[index] = text;
    setCode(newCode);
    setError('');

    // Auto focus next input
    if (text && index < 5) {
      inputRefs.current[index + 1]?.focus();
    }

    // Auto verify when all 6 digits are entered
    if (text && index === 5 && newCode.every((digit) => digit !== '')) {
      handleVerify(newCode.join(''));
    }
  };

  const handleKeyPress = (e, index) => {
    if (e.nativeEvent.key === 'Backspace' && !code[index] && index > 0) {
      inputRefs.current[index - 1]?.focus();
    }
  };

  const handleVerify = async (verificationCode = null) => {
    const finalCode = verificationCode || code.join('');

    if (finalCode.length !== 6) {
      setError('Lütfen 6 haneli kodu girin');
      return;
    }

    setLoading(true);
    setError('');

    try {
      const response = await authService.verifyEmailCode(email, finalCode);

      if (response.isSuccess) {
        // Update user verification status and authenticate
        dispatch(setUser({
          ...response.user,
          isVerified: true,
        }));
        dispatch(clearVerification());
        // AppNavigator will automatically switch to HomeScreen when isAuthenticated becomes true
      } else {
        setError(response.message || 'Doğrulama başarısız');
      }
    } catch (err) {
      setError(err.response?.data?.message || 'Kod doğrulanamadı');
    } finally {
      setLoading(false);
    }
  };

  const handleResend = async () => {
    if (countdown > 0) return;

    setResendLoading(true);
    setResendSuccess(false);
    setError('');

    try {
      const response = await authService.resendVerification(email);

      if (response.isSuccess) {
        setResendSuccess(true);
        setCountdown(60);
        setTimeout(() => setResendSuccess(false), 3000);
      } else {
        setError(response.message || 'Kod gönderilemedi');
      }
    } catch (err) {
      setError(err.response?.data?.message || 'Kod gönderilemedi');
    } finally {
      setResendLoading(false);
    }
  };

  return (
    <KeyboardAvoidingView
      behavior={Platform.OS === 'ios' ? 'padding' : 'height'}
      className="flex-1 bg-gradient-to-br from-purple-600 to-pink-500"
    >
      <View className="flex-1 justify-center px-6 py-12">
        {/* Header */}
        <View className="items-center mb-12">
          <View className="bg-white/20 w-24 h-24 rounded-full items-center justify-center mb-6 backdrop-blur-lg">
            <Text className="text-6xl">📧</Text>
          </View>
          <Text className="text-4xl font-bold text-white mb-2 text-center">
            Email Doğrulama
          </Text>
          <Text className="text-white/80 text-lg text-center px-4">
            {email} adresine gönderilen 6 haneli kodu girin
          </Text>
        </View>

        {/* Verification Form */}
        <View className="bg-white rounded-3xl p-8 shadow-2xl">
          {/* Error Message */}
          {error && (
            <View className="bg-red-100 border border-red-400 rounded-2xl p-4 mb-6">
              <Text className="text-red-700 text-sm text-center">{error}</Text>
            </View>
          )}

          {/* Success Message */}
          {resendSuccess && (
            <View className="bg-green-100 border border-green-400 rounded-2xl p-4 mb-6">
              <Text className="text-green-700 text-sm text-center">
                ✅ Kod başarıyla gönderildi!
              </Text>
            </View>
          )}

          {/* Code Input */}
          <View className="flex-row justify-between mb-8">
            {code.map((digit, index) => (
              <TextInput
                key={index}
                ref={(ref) => (inputRefs.current[index] = ref)}
                className={`w-12 h-16 bg-gray-100 rounded-2xl text-center text-2xl font-bold ${
                  digit ? 'bg-purple-100 border-2 border-purple-600' : 'border-2 border-gray-300'
                }`}
                value={digit}
                onChangeText={(text) => handleCodeChange(text, index)}
                onKeyPress={(e) => handleKeyPress(e, index)}
                keyboardType="number-pad"
                maxLength={1}
                editable={!loading}
                selectTextOnFocus
              />
            ))}
          </View>

          {/* Verify Button */}
          <TouchableOpacity
            onPress={() => handleVerify()}
            disabled={loading || code.some((digit) => digit === '')}
            className={`${
              loading || code.some((digit) => digit === '')
                ? 'bg-purple-400'
                : 'bg-purple-600'
            } rounded-2xl py-4 items-center shadow-lg mb-4`}
          >
            {loading ? (
              <ActivityIndicator color="#fff" />
            ) : (
              <Text className="text-white font-bold text-lg">Doğrula</Text>
            )}
          </TouchableOpacity>

          {/* Resend Code */}
          <View className="flex-row justify-center items-center">
            <Text className="text-gray-600 mr-2">Kod gelmedi mi?</Text>
            <TouchableOpacity
              onPress={handleResend}
              disabled={resendLoading || countdown > 0}
            >
              {resendLoading ? (
                <ActivityIndicator size="small" color="#9333EA" />
              ) : countdown > 0 ? (
                <Text className="text-gray-400 font-semibold">
                  Tekrar gönder ({countdown}s)
                </Text>
              ) : (
                <Text className="text-purple-600 font-bold underline">
                  Tekrar Gönder
                </Text>
              )}
            </TouchableOpacity>
          </View>
        </View>

        {/* Back to Login */}
        <View className="flex-row justify-center mt-8">
          <Text className="text-white">Yanlış email mi? </Text>
          <TouchableOpacity onPress={() => navigation.navigate('Login')}>
            <Text className="text-white font-bold underline">
              Geri Dön
            </Text>
          </TouchableOpacity>
        </View>
      </View>
    </KeyboardAvoidingView>
  );
}
