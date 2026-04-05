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
import { useDispatch, useSelector } from 'react-redux';
import { authService } from '../services/authService';
import { setUser, clearVerification, logout } from '../store/slices/authSlice';

export default function EmailVerificationScreen({ route, navigation }) {
  const { user, isAuthenticated } = useSelector((state) => state.auth);
  const email = route?.params?.email || user?.email;
  const [code, setCode] = useState(['', '', '', '', '', '']);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const [resendLoading, setResendLoading] = useState(false);
  const [resendSuccess, setResendSuccess] = useState(false);
  const [countdown, setCountdown] = useState(0);
  const [isLoggingOut, setIsLoggingOut] = useState(false);

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
        // Update user state with verified email and mark as authenticated
        // This will trigger AppNavigator to switch from AuthNavigator to MainNavigator
        // which will then route to CompleteProfileStep1 based on isProfileCreated: false
        dispatch(setUser({
          isVerified: true,
          isMailVerified: true
        }));
        dispatch(clearVerification());

        // No need to navigate manually - AppNavigator will handle routing based on user state
        // The user will automatically be routed to CompleteProfileStep1 because:
        // 1. isAuthenticated becomes true (from register)
        // 2. isMailVerified is now true
        // 3. isProfileCreated is false
      } else {
        setError(response.message || 'Doğrulama başarısız');
      }
    } catch (err) {
      console.error('❌ Verification error:', err);
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
      console.error('❌ Resend error:', err.response?.data?.message || err.message);
      setError(err.response?.data?.message || 'Kod gönderilemedi');
    } finally {
      setResendLoading(false);
    }
  };

  const handleGoBack = () => {
    // Prevent multiple clicks while logging out
    if (isLoggingOut) return;

    // Check if user is authenticated (logged in) or not (just registered)
    // After login: isAuthenticated = true -> logout and return to login
    // After registration: isAuthenticated = false -> go back to RegisterStep5
    console.log('📧 EmailVerification: isAuthenticated =', isAuthenticated);

    if (isAuthenticated) {
      // User came from login flow - logout and return to login screen
      console.log('📧 EmailVerification: Going back from login flow - logging out');
      setIsLoggingOut(true);
      dispatch(logout());
      // AppNavigator will automatically switch to AuthNavigator after logout
    } else {
      // User came from registration flow - go back to RegisterStep5
      console.log('📧 EmailVerification: Going back from registration flow');
      dispatch(clearVerification());
      // Use goBack instead of navigate to return to the previous RegisterStep5 in the stack
      navigation.goBack();
    }
  };

  return (
    <KeyboardAvoidingView
      behavior={Platform.OS === 'ios' ? 'padding' : 'height'}
      className="flex-1 bg-gradient-to-br from-purple-600 to-pink-500"
    >
      {/* Back Button */}
      <View className="pt-16 px-6">
        <TouchableOpacity
          activeOpacity={0.7}
          onPress={handleGoBack}
          disabled={isLoggingOut}
          className="flex-row items-center"
        >
          <Text className="text-4xl text-white" style={{ opacity: isLoggingOut ? 0.5 : 1 }}>
            ←
          </Text>
        </TouchableOpacity>
      </View>

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
