jest.mock('react-native-reanimated', () =>
  require('react-native-reanimated/src/mock')
);
import 'react-native-gesture-handler/jestSetup';
import '@testing-library/jest-native/extend-expect';
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
