import { useEffect, useState } from 'react';
import { NavigationContainer } from '@react-navigation/native';
import { createNativeStackNavigator } from '@react-navigation/native-stack';
import { useSelector, useDispatch } from 'react-redux';
import { View, ActivityIndicator } from 'react-native';
import { setCurrentAccessToken, setOnTokenRefreshed } from '../services/api';
import { setUserAndToken, clearRegistrationForm } from '../store/slices/authSlice';
import { saveRefreshToken } from '../utils/tokenStorage';
import { fetchSubscriptionStatus } from '../store/slices/subscriptionSlice';
import { initRevenueCat, loginRevenueCat } from '../services/subscriptionService';
import AuthNavigator from './AuthNavigator';
import TabNavigator from './TabNavigator';
import KVKKConsentScreen, { CURRENT_KVKK_VERSION } from '../screens/KVKKConsentScreen';
import DeletionBanner from '../components/DeletionBanner';
import { API_BASE_URL, API_ENDPOINTS } from '../constants/api';

const Stack = createNativeStackNavigator();

function MainNavigator() {
  return (
    <Stack.Navigator
      screenOptions={{ headerShown: false, animation: 'slide_from_right' }}
      initialRouteName="HomeTabs"
    >
      <Stack.Screen name="HomeTabs" component={TabNavigator} />
    </Stack.Navigator>
  );
}

export default function AppNavigator() {
  const { isAuthenticated, user, token, refreshToken, kvkkVersion, emailVerifiedToken, registrationEmail } = useSelector(
    (state) => state.auth,
  );
  const dispatch = useDispatch();
  const [tokenInitialized, setTokenInitialized] = useState(false);
  const [resumeRoute, setResumeRoute] = useState(null); // null = checking

  // Sync axios token with Redux/persisted state
  useEffect(() => {
    setCurrentAccessToken(token ?? null);
    if (refreshToken) saveRefreshToken(refreshToken);
    if (!tokenInitialized) setTokenInitialized(true);
  }, [token, refreshToken, tokenInitialized]);

  // Keep Redux token in sync after background refresh
  useEffect(() => {
    setOnTokenRefreshed((newToken, newRefreshToken) => {
      dispatch(setUserAndToken({ user, token: newToken, refreshToken: newRefreshToken }));
    });
  }, [user, dispatch]);

  // RevenueCat init + subscription status when authenticated
  useEffect(() => {
    if (!isAuthenticated || !user) return;
    initRevenueCat(user.userId);
    if (user.userId) loginRevenueCat(user.userId).catch(() => {});
    dispatch(fetchSubscriptionStatus());
  }, [isAuthenticated, user?.userId]);

  // Resume flow: check if user has a valid in-progress registration
  useEffect(() => {
    if (!tokenInitialized) return;

    if (isAuthenticated) {
      setResumeRoute('Welcome');
      return;
    }

    if (!emailVerifiedToken || !registrationEmail) {
      setResumeRoute('Welcome');
      return;
    }

    // Token exists — validate it before resuming
    fetch(`${API_BASE_URL}${API_ENDPOINTS.CHECK_REGISTRATION_TOKEN}`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ email: registrationEmail, emailVerifiedToken }),
    })
      .then((r) => r.json())
      .then((data) => {
        if (data.isSuccess) {
          setResumeRoute('RegisterStep3');
        } else {
          dispatch(clearRegistrationForm());
          setResumeRoute('Welcome');
        }
      })
      .catch(() => {
        setResumeRoute('Welcome');
      });
  }, [tokenInitialized, isAuthenticated]);

  if (!tokenInitialized || resumeRoute === null) {
    return (
      <View style={{ flex: 1, justifyContent: 'center', alignItems: 'center', backgroundColor: '#000' }}>
        <ActivityIndicator size="large" color="#f57656" />
      </View>
    );
  }

  const isVerifiedUser = user?.isMailVerified || user?.isProfileCreated;
  const showMainNavigator = isAuthenticated && isVerifiedUser;
  const needsKvkkConsent = showMainNavigator && kvkkVersion !== CURRENT_KVKK_VERSION;
  const navigationKey = `nav-${isAuthenticated ? 'auth' : 'guest'}-${isVerifiedUser ? 'verified' : 'unverified'}`;

  return (
    <>
      <NavigationContainer key={navigationKey}>
        {showMainNavigator ? <MainNavigator /> : <AuthNavigator initialRoute={resumeRoute} />}
      </NavigationContainer>

      {/* Global KVKK consent overlay — appears on top of everything */}
      <KVKKConsentScreen visible={needsKvkkConsent} />

      {/* Soft-delete banner — floats above tab content when account is scheduled for deletion */}
      {showMainNavigator && <DeletionBanner />}
    </>
  );
}
