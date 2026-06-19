jest.mock('react-native-reanimated', () => {
  const React = require('react');
  const { View } = require('react-native');
  return {
    __esModule: true,
    default: {
      View: ({ children, style }: any) =>
        React.createElement(View, { style }, children),
      createAnimatedComponent: (Comp: any) => Comp,
    },
    useSharedValue: (initial: any) => ({ value: initial }),
    useAnimatedStyle: (fn: any) => fn(),
    useAnimatedProps: (fn: any) => fn(),
    useAnimatedReaction: () => {},
    withTiming: (v: any) => v,
    interpolate: () => 0,
    Extrapolation: { CLAMP: 'clamp' },
    Easing: { out: () => (x: any) => x, cubic: (x: any) => x },
  };
});

jest.mock('react-native-safe-area-context', () => ({
  useSafeAreaInsets: () => ({ top: 20, bottom: 0, left: 0, right: 0 }),
}));

jest.mock('expo-linear-gradient', () => ({ LinearGradient: 'LinearGradient' }));

jest.mock('@react-native-masked-view/masked-view', () => {
  const React = require('react');
  const { View } = require('react-native');
  return {
    __esModule: true,
    default: ({ children }: any) => React.createElement(View, null, children),
  };
});

jest.mock('react-native-easing-gradient', () => ({
  easeGradient: () => ({ colors: ['#000', '#fff'], locations: [0, 1] }),
}));

jest.mock('@/shared/components/WaveFillLogo', () => {
  const React = require('react');
  const { View } = require('react-native');
  return {
    __esModule: true,
    default: () => React.createElement(View, { testID: 'wave-fill-logo' }),
  };
});

import { Text, View } from 'react-native';
import { render } from '@testing-library/react-native';
import ScreenHeader from '@/shared/components/ScreenHeader';

const scrollY = { value: 0 };

describe('ScreenHeader', () => {
  it('renders the wave logo by default', () => {
    const { getByTestId } = render(<ScreenHeader scrollY={scrollY} />);
    expect(getByTestId('wave-fill-logo')).toBeTruthy();
  });

  it('renders the title when provided', () => {
    const { getByText } = render(
      <ScreenHeader scrollY={scrollY} title="Keşfet" />
    );
    expect(getByText('Keşfet')).toBeTruthy();
  });

  it('does not render a title when none is provided', () => {
    const { queryByText } = render(<ScreenHeader scrollY={scrollY} />);
    expect(queryByText('Keşfet')).toBeNull();
  });

  it('renders the rightButton node when provided', () => {
    const { getByTestId } = render(
      <ScreenHeader
        scrollY={scrollY}
        rightButton={<View testID="right-btn" />}
      />
    );
    expect(getByTestId('right-btn')).toBeTruthy();
  });

  it('does not render a right slot when no rightButton is given', () => {
    const { queryByTestId } = render(<ScreenHeader scrollY={scrollY} />);
    expect(queryByTestId('right-btn')).toBeNull();
  });

  it('renders both title and right button together', () => {
    const { getByText, getByTestId } = render(
      <ScreenHeader
        scrollY={scrollY}
        title="Profilim"
        rightButton={<Text testID="cog">⚙</Text>}
      />
    );
    expect(getByText('Profilim')).toBeTruthy();
    expect(getByTestId('cog')).toBeTruthy();
  });
});
