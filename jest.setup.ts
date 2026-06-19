jest.mock('react-native-reanimated', () =>
  require('react-native-reanimated/src/mock')
);
import 'react-native-gesture-handler/jestSetup';
import '@testing-library/jest-native/extend-expect';
jest.mock('expo-blur', () => ({ BlurView: 'BlurView' }));
(globalThis as any).fetch = jest.fn();
