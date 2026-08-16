jest.mock('react-native-reanimated', () =>
  require('react-native-reanimated/src/mock')
);
import 'react-native-gesture-handler/jestSetup';
// i18n'i gerçek sözlükle başlat (lng: 'tr') — bileşenler t() ile Türkçe
// render eder, testler kullanıcı-görünür metni assert eder.
import '@/shared/i18n';
import '@testing-library/jest-native/extend-expect';
jest.mock('@react-native-async-storage/async-storage', () =>
  require('@react-native-async-storage/async-storage/jest/async-storage-mock')
);
// expo-notifications ESM olarak geliyor (transform allowlist dışı) ve native
// modül gerektiriyor — pushService'in kullandığı yüzey no-op mock'lanır.
jest.mock('expo-notifications', () => ({
  setNotificationHandler: jest.fn(),
  setNotificationChannelAsync: jest.fn(async () => {}),
  getPermissionsAsync: jest.fn(async () => ({ status: 'denied' })),
  requestPermissionsAsync: jest.fn(async () => ({ status: 'denied' })),
  scheduleNotificationAsync: jest.fn(async () => 'id'),
  addNotificationResponseReceivedListener: jest.fn(() => ({ remove: jest.fn() })),
  AndroidImportance: { HIGH: 4 },
}));
// FCM native modül gerektirir — pushService'in kullandığı modular API mock'lanır.
jest.mock('@react-native-firebase/messaging', () => ({
  getMessaging: jest.fn(() => ({})),
  getToken: jest.fn(async () => 'fcm-token'),
  onTokenRefresh: jest.fn(() => jest.fn()),
  onMessage: jest.fn(() => jest.fn()),
  onNotificationOpenedApp: jest.fn(() => jest.fn()),
  getInitialNotification: jest.fn(async () => null),
}));
// expo-device import anında native EventEmitter istiyor — sabit değerlerle mock.
jest.mock('expo-device', () => ({
  isDevice: false,
  brand: 'jest',
  modelName: 'jest',
  osName: 'iOS',
}));
// RC SDK'sı jest transform'undan geçmeyen ESM bağımlılığı çekiyor; native
// modül de test ortamında yok — API yüzeyi no-op mock'lanır.
jest.mock('react-native-purchases', () => ({
  __esModule: true,
  default: {
    setLogLevel: jest.fn(),
    configure: jest.fn(),
    logIn: jest.fn(async () => ({})),
    logOut: jest.fn(async () => ({})),
    getOfferings: jest.fn(async () => ({ current: null, all: {} })),
    purchasePackage: jest.fn(async () => ({ customerInfo: {} })),
    restorePurchases: jest.fn(async () => ({})),
    getCustomerInfo: jest.fn(async () => ({ entitlements: { active: {} } })),
    addCustomerInfoUpdateListener: jest.fn(),
  },
  LOG_LEVEL: { VERBOSE: 'VERBOSE', WARN: 'WARN', ERROR: 'ERROR' },
}));
// Ağ durumu göstergesinin kaynağı; native modül jest'te yok. Varsayılan
// "bağlı" — offline'a özel testler bu mock'u kendi dosyasında ezer.
jest.mock('expo-network', () => ({
  getNetworkStateAsync: jest.fn(async () => ({
    isConnected: true,
    isInternetReachable: true,
  })),
  addNetworkStateListener: jest.fn(() => ({ remove: jest.fn() })),
}));
jest.mock('expo-blur', () => ({ BlurView: 'BlurView' }));
jest.mock('expo-symbols', () => ({ SymbolView: 'SymbolView' }));
jest.mock('expo-linear-gradient', () => ({ LinearGradient: 'LinearGradient' }));
jest.mock('expo-image', () => {
  const RN = require('react-native');
  return { Image: RN.Image };
});
jest.mock('expo-secure-store', () => ({
  getItem: jest.fn(() => null),
  setItem: jest.fn(),
  getItemAsync: jest.fn(async () => null),
  setItemAsync: jest.fn(async () => {}),
  AFTER_FIRST_UNLOCK: 0,
}));
jest.mock('expo-crypto', () => ({
  getRandomBytes: jest.fn((n: number) => new Uint8Array(n)),
}));
jest.mock('expo-store-review', () => ({
  isAvailableAsync: jest.fn(async () => false),
  requestReview: jest.fn(async () => {}),
}));
jest.mock('posthog-react-native', () => ({
  __esModule: true,
  default: jest.fn().mockImplementation(() => ({
    screen: jest.fn(),
    capture: jest.fn(),
    identify: jest.fn(),
    reset: jest.fn(),
  })),
}));
jest.mock('react-native-fast-confetti', () => {
  const CannonConfetti: any = () => null;
  CannonConfetti.Origin = () => null;
  return { CannonConfetti, Confetti: () => null };
});
jest.mock('@sentry/react-native', () => ({
  init: jest.fn(),
  wrap: (c: any) => c,
  captureException: jest.fn(),
  setUser: jest.fn(),
  addBreadcrumb: jest.fn(),
  withProfiler: (c: any) => c,
  TimeToFullDisplay: () => null,
  reactNavigationIntegration: jest.fn(() => ({ registerNavigationContainer: jest.fn() })),
  ErrorBoundary: ({ children }: any) => children,
}));
(globalThis as any).fetch = jest.fn();
