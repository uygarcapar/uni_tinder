jest.mock('react-native-reanimated', () =>
  require('react-native-reanimated/src/mock')
);
import 'react-native-gesture-handler/jestSetup';
import '@testing-library/jest-native/extend-expect';
jest.mock('expo-blur', () => ({ BlurView: 'BlurView' }));
jest.mock('expo-linear-gradient', () => ({ LinearGradient: 'LinearGradient' }));
jest.mock('expo-image', () => {
  const RN = require('react-native');
  return { Image: RN.Image };
});
(globalThis as any).fetch = jest.fn();
