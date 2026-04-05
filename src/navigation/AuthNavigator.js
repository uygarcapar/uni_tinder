import { createNativeStackNavigator } from "@react-navigation/native-stack";
import { useSelector } from "react-redux";
import WelcomeScreen from "../screens/WelcomeScreen";
import LoginScreen from "../screens/LoginScreen";
import RegisterStep1Screen from "../screens/RegisterStep1Screen";
import RegisterStep2Screen from "../screens/RegisterStep2Screen";
import RegisterStep3Screen from "../screens/RegisterStep3Screen";
import RegisterStep4Screen from "../screens/RegisterStep4Screen";
import RegisterStep5Screen from "../screens/RegisterStep5Screen";
import EmailVerificationScreen from "../screens/EmailVerificationScreen";

const Stack = createNativeStackNavigator();

export default function AuthNavigator() {
  const { user, isAuthenticated } = useSelector((state) => state.auth);

  // If user is authenticated but email not verified (logged in with unverified email)
  // Show EmailVerification instead of normal auth flow
  if (isAuthenticated && user && !user.isMailVerified) {
    console.log('🔍 AuthNavigator: Showing EmailVerification navigator for unverified login');
    return (
      <Stack.Navigator
        key="auth-email-verification"
        initialRouteName="EmailVerification"
        screenOptions={{
          headerShown: false,
          animation: "slide_from_right",
        }}
      >
        <Stack.Screen name="EmailVerification" component={EmailVerificationScreen} />
        <Stack.Screen name="Login" component={LoginScreen} />
      </Stack.Navigator>
    );
  }

  // Normal auth flow (register, login, etc)
  // Don't use needsVerification for initialRouteName because it causes issues
  // when navigating back from EmailVerification to RegisterStep5
  console.log('🔍 AuthNavigator: Showing normal auth navigator');
  return (
    <Stack.Navigator
      key="auth-normal"
      initialRouteName="Welcome"
      screenOptions={{
        headerShown: false,
        animation: "slide_from_right",
      }}
    >
      <Stack.Screen name="Welcome" component={WelcomeScreen} />
      <Stack.Screen name="Login" component={LoginScreen} />
      <Stack.Screen name="RegisterStep1" component={RegisterStep1Screen} />
      <Stack.Screen name="RegisterStep2" component={RegisterStep2Screen} />
      <Stack.Screen name="RegisterStep3" component={RegisterStep3Screen} />
      <Stack.Screen name="RegisterStep4" component={RegisterStep4Screen} />
      <Stack.Screen name="RegisterStep5" component={RegisterStep5Screen} />
      <Stack.Screen name="EmailVerification" component={EmailVerificationScreen} />
    </Stack.Navigator>
  );
}
