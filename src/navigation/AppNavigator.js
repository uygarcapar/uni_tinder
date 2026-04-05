import { NavigationContainer } from '@react-navigation/native';
import { createNativeStackNavigator } from '@react-navigation/native-stack';
import { useSelector } from 'react-redux';
import AuthNavigator from './AuthNavigator';
import TabNavigator from './TabNavigator';
import CompleteProfileStep1Screen from '../screens/CompleteProfileStep1Screen';
import CompleteProfileStep2Screen from '../screens/CompleteProfileStep2Screen';
import CompleteProfileStep3Screen from '../screens/CompleteProfileStep3Screen';
import CompleteProfileStep4Screen from '../screens/CompleteProfileStep4Screen';
import CompleteProfileStep5Screen from '../screens/CompleteProfileStep5Screen';
import CompleteProfileStep6Screen from '../screens/CompleteProfileStep6Screen';
import CompleteProfileStep7Screen from '../screens/CompleteProfileStep7Screen';
import CompleteProfileStep8Screen from '../screens/CompleteProfileStep8Screen';

const Stack = createNativeStackNavigator();

function MainNavigator() {
  const { user } = useSelector((state) => state.auth);

  // Determine initial route based on user status
  const getInitialRoute = () => {
    console.log('🔍 getInitialRoute - user:', JSON.stringify(user, null, 2));
    console.log('🔍 isMailVerified:', user?.isMailVerified);
    console.log('🔍 isProfileCreated:', user?.isProfileCreated);

    if (!user?.isProfileCreated) {
      console.log('➡️ Routing to: CompleteProfileStep1');
      return 'CompleteProfileStep1';
    }
    console.log('➡️ Routing to: HomeTabs');
    return 'HomeTabs';
  };

  return (
    <Stack.Navigator
      screenOptions={{
        headerShown: false,
        animation: 'slide_from_right',
      }}
      initialRouteName={getInitialRoute()}
    >
      <Stack.Screen name="HomeTabs" component={TabNavigator} />
      <Stack.Screen
        name="CompleteProfileStep1"
        component={CompleteProfileStep1Screen}
      />
      <Stack.Screen
        name="CompleteProfileStep2"
        component={CompleteProfileStep2Screen}
      />
      <Stack.Screen
        name="CompleteProfileStep3"
        component={CompleteProfileStep3Screen}
      />
      <Stack.Screen
        name="CompleteProfileStep4"
        component={CompleteProfileStep4Screen}
      />
      <Stack.Screen
        name="CompleteProfileStep5"
        component={CompleteProfileStep5Screen}
      />
      <Stack.Screen
        name="CompleteProfileStep6"
        component={CompleteProfileStep6Screen}
      />
      <Stack.Screen
        name="CompleteProfileStep7"
        component={CompleteProfileStep7Screen}
      />
      <Stack.Screen
        name="CompleteProfileStep8"
        component={CompleteProfileStep8Screen}
      />
    </Stack.Navigator>
  );
}

export default function AppNavigator() {
  const { isAuthenticated, user } = useSelector((state) => state.auth);

  // Determine which navigator to show
  const showMainNavigator = isAuthenticated && user?.isMailVerified;

  // Create a unique key for NavigationContainer to force remount when auth state changes
  const navigationKey = `nav-${isAuthenticated ? 'auth' : 'guest'}-${user?.isMailVerified ? 'verified' : 'unverified'}`;

  // If user is authenticated but email is not verified, force logout
  // This happens when user logs in with an unverified email
  if (isAuthenticated && user && !user.isMailVerified) {
    console.log('⚠️ User authenticated but email not verified - showing AuthNavigator with EmailVerification');
  }

  return (
    <NavigationContainer key={navigationKey}>
      {showMainNavigator ? (
        <MainNavigator />
      ) : (
        <AuthNavigator />
      )}
    </NavigationContainer>
  );
}
