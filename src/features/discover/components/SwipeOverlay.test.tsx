jest.mock('react-native-reanimated', () => {
  const React = require('react');
  const { View } = require('react-native');
  return {
    __esModule: true,
    default: {
      View: ({ children, style }: any) =>
        React.createElement(View, { style }, children),
    },
    useAnimatedStyle: (fn: any) => fn(),
    interpolate: (v: any, _input: any, output: any) => output[0],
    Extrapolate: { CLAMP: 'clamp' },
  };
});

jest.mock('lucide-react-native', () =>
  new Proxy({}, { get: () => () => null })
);
jest.mock('expo-linear-gradient', () => ({ LinearGradient: 'LinearGradient' }));
jest.mock('@react-native-masked-view/masked-view', () => {
  const React = require('react');
  const { View } = require('react-native');
  return {
    __esModule: true,
    default: ({ children }: any) => React.createElement(View, null, children),
  };
});

import { render } from '@testing-library/react-native';
import SwipeOverlay from '@/features/discover/components/SwipeOverlay';

describe('SwipeOverlay', () => {
  it('renders both like and nope overlays without crashing', () => {
    expect(() =>
      render(<SwipeOverlay dragX={{ value: 0 }} opacity={{ value: 1 }} />)
    ).not.toThrow();
  });

  it('mounts with positive drag (like direction)', () => {
    expect(() =>
      render(<SwipeOverlay dragX={{ value: 200 }} opacity={{ value: 1 }} />)
    ).not.toThrow();
  });

  it('mounts with negative drag (nope direction)', () => {
    expect(() =>
      render(<SwipeOverlay dragX={{ value: -200 }} opacity={{ value: 1 }} />)
    ).not.toThrow();
  });

  it('mounts when opacity is 0', () => {
    expect(() =>
      render(<SwipeOverlay dragX={{ value: 0 }} opacity={{ value: 0 }} />)
    ).not.toThrow();
  });
});
