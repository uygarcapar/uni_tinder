import { createNativeStackNavigator } from "@react-navigation/native-stack";
import { useAppSelector } from "@/shared/hooks/redux";
import WelcomeScreen from "@/features/auth/screens/WelcomeScreen";
import LoginScreen from "@/features/auth/screens/LoginScreen";
import RegisterStep1Screen from "@/features/auth/screens/RegisterStep1Screen";
import RegisterStep2Screen from "@/features/auth/screens/RegisterStep2Screen";
import RegisterStep3Screen from "@/features/auth/screens/RegisterStep3Screen";
import RegisterStep4Screen from "@/features/auth/screens/RegisterStep4Screen";
import RegisterStep5Screen from "@/features/auth/screens/RegisterStep5Screen";
import RegisterStep6Screen from "@/features/auth/screens/RegisterStep6Screen";
import RegisterStep7Screen from "@/features/auth/screens/RegisterStep7Screen";
import RegisterStep8Screen from "@/features/auth/screens/RegisterStep8Screen";
import RegisterStep9Screen from "@/features/auth/screens/RegisterStep9Screen";
import RegisterStep10Screen from "@/features/auth/screens/RegisterStep10Screen";
import RegisterStep12Screen from "@/features/auth/screens/RegisterStep12Screen";
import RegisterStep13Screen from "@/features/auth/screens/RegisterStep13Screen";
import RegisterStep14Screen from "@/features/auth/screens/RegisterStep14Screen";
import RegisterStep15Screen from "@/features/auth/screens/RegisterStep15Screen";
import type { AuthStackParamList } from "@/shared/types/navigation";

const Stack = createNativeStackNavigator<AuthStackParamList>();

const SCREEN_OPTIONS = {
  headerShown: false,
  animation: "slide_from_right",
  fullScreenGestureEnabled: false,
  gestureEnabled: true,
} as const;

interface AuthNavigatorProps {
  initialRoute?: keyof AuthStackParamList;
}

export default function AuthNavigator({ initialRoute = "Welcome" }: AuthNavigatorProps) {
  const { user, isAuthenticated } = useAppSelector((state) => (state as any).auth);

  // Login flow: authenticated but email not yet verified (and no completed profile)
  if (isAuthenticated && user && !user.isMailVerified && !user.isProfileCreated) {
    return (
      <Stack.Navigator
        id="AuthStack"
        key="auth-email-verification"
        initialRouteName="RegisterStep2"
        screenOptions={SCREEN_OPTIONS}
      >
        <Stack.Screen name="RegisterStep2" component={RegisterStep2Screen} />
        <Stack.Screen name="Login" component={LoginScreen} />
      </Stack.Navigator>
    );
  }

  return (
    <Stack.Navigator
      id="AuthStack"
      key="auth-normal"
      initialRouteName={initialRoute}
      screenOptions={SCREEN_OPTIONS}
    >
      {/* Auth entry */}
      <Stack.Screen name="Welcome" component={WelcomeScreen} />
      <Stack.Screen name="Login" component={LoginScreen} />

      {/* Account security: 1.email → 2.verify → 3.password → 4.phone */}
      <Stack.Screen name="RegisterStep1" component={RegisterStep1Screen} />
      <Stack.Screen name="RegisterStep2" component={RegisterStep2Screen} />
      <Stack.Screen name="RegisterStep6" component={RegisterStep6Screen} />
      <Stack.Screen name="RegisterStep7" component={RegisterStep7Screen} />

      {/* Identity: 5.name → 6.dob → 7.gender → 8.education → 9.location */}
      <Stack.Screen name="RegisterStep3" component={RegisterStep3Screen} />
      <Stack.Screen name="RegisterStep5" component={RegisterStep5Screen} />
      <Stack.Screen name="RegisterStep4" component={RegisterStep4Screen} />
      <Stack.Screen name="RegisterStep8" component={RegisterStep8Screen} />
      <Stack.Screen name="RegisterStep9" component={RegisterStep9Screen} />

      {/* Matching prefs & profile */}
      <Stack.Screen name="RegisterStep12" component={RegisterStep12Screen} />
      <Stack.Screen name="RegisterStep10" component={RegisterStep10Screen} />
      <Stack.Screen name="RegisterStep13" component={RegisterStep13Screen} />
      <Stack.Screen name="RegisterStep14" component={RegisterStep14Screen} />
      <Stack.Screen name="RegisterStep15" component={RegisterStep15Screen} />
    </Stack.Navigator>
  );
}
