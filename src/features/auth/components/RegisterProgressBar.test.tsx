jest.mock('react-native-reanimated', () => {
  const React = require('react');
  const { View } = require('react-native');
  const Animated = {
    View: React.forwardRef((props: any, ref: any) =>
      React.createElement(View, { ...props, ref })
    ),
  };
  return {
    __esModule: true,
    default: Animated,
    useSharedValue: (initial: any) => ({ value: initial }),
    useAnimatedStyle: (fn: any) => fn(),
    withTiming: (toValue: any) => toValue,
    Easing: { out: () => (x: any) => x, cubic: (x: any) => x },
  };
});

import { render } from '@testing-library/react-native';
import RegisterProgressBar from '@/features/auth/components/RegisterProgressBar';

describe('RegisterProgressBar', () => {
  it('renders without crashing for the first step', () => {
    expect(() => render(<RegisterProgressBar step={3} />)).not.toThrow();
  });

  it('renders without crashing for steps below the first step', () => {
    expect(() => render(<RegisterProgressBar step={-5} />)).not.toThrow();
  });

  it('renders without crashing for steps above the last step', () => {
    expect(() => render(<RegisterProgressBar step={99} />)).not.toThrow();
  });

  it('renders without crashing for a mid-range step', () => {
    expect(() => render(<RegisterProgressBar step={8} />)).not.toThrow();
  });
});
