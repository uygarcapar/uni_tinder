// jest.setup.ts'teki global reanimated mock'u ('react-native-reanimated/src/mock')
// gerçek index'i yükleyip worklets'in native tarafını istiyor → jest'te patlar.
// Diğer suite'lerdeki gibi (bkz. SwipeOverlay.test) kullanılan yüzeyi lokal
// mock'luyoruz: PreviewModal zoom sinyali için shared value üretiyor,
// CardSheetScrollView de animasyon yardımcılarını kullanıyor.
jest.mock('react-native-reanimated', () => {
  const React = require('react');
  const { View, ScrollView } = require('react-native');
  const passthrough = (Comp: any) => ({ children, ...rest }: any) =>
    React.createElement(Comp, rest, children);
  return {
    __esModule: true,
    default: {
      View: passthrough(View),
      ScrollView: passthrough(ScrollView),
      createAnimatedComponent: (C: any) => C,
    },
    useSharedValue: (initial: number) => ({ value: initial }),
    // Stil hook'ları jest'te worklet çalıştırmıyor; düz nesne dönüyorlar —
    // suite görünürlüğü değil AĞACIN KURULDUĞUNU doğruluyor.
    useAnimatedStyle: (fn: any) => {
      try {
        return fn();
      } catch {
        return {};
      }
    },
    useAnimatedScrollHandler: () => () => {},
    useAnimatedReaction: () => {},
    runOnJS: (fn: any) => fn,
    runOnUI: (fn: any) => fn,
    cancelAnimation: () => {},
    useDerivedValue: (fn: any) => ({ value: fn() }),
    withTiming: (v: number) => v,
    withSpring: (v: number) => v,
    withSequence: (...values: number[]) => values[values.length - 1],
    interpolate: (v: number) => v,
    Extrapolation: { CLAMP: 'clamp' },
    Easing: { out: () => () => 0, quad: () => 0, ease: () => 0 },
  };
});
jest.mock('react-native-safe-area-context', () => ({
  useSafeAreaInsets: () => ({ top: 0, bottom: 0, left: 0, right: 0 }),
  SafeAreaProvider: ({ children }: any) => children,
}));
jest.mock('@gorhom/bottom-sheet', () => {
  const React = require('react');
  const { View } = require('react-native');
  return {
    BottomSheetScrollView: ({ children }: any) =>
      React.createElement(View, null, children),
    BottomSheetBackdrop: () => React.createElement(View),
  };
});
// SheetBlurBackdrop → expo-blur → expo-modules-core zinciri, import anında
// expo'nun "winter" fetch global'ini kuruyor ve jest ortamında patlıyor
// ("Cannot read properties of undefined (reading 'EventEmitter')").
// Perde saf görsel; bu suite'in konusu kartın içeriği.
jest.mock('@/shared/components/SheetBlurBackdrop', () => {
  const React = require('react');
  const { View } = require('react-native');
  return {
    __esModule: true,
    default: (props: any) => React.createElement(View, { testID: 'sheet-backdrop', ...props }),
  };
});

jest.mock('@/shared/components/AppBottomSheet', () => {
  const React = require('react');
  const { View } = require('react-native');
  return {
    __esModule: true,
    default: ({ visible, children }: any) =>
      visible ? React.createElement(View, { testID: 'app-modal' }, children) : null,
  };
});
jest.mock('@/features/discover/components/SwipeCard', () => {
  const React = require('react');
  const { Text } = require('react-native');
  return {
    __esModule: true,
    default: ({ profile }: any) =>
      React.createElement(Text, { testID: 'swipe-card' }, profile?.id),
  };
});

import { ActivityIndicator } from 'react-native';
import { render } from '@testing-library/react-native';
import PreviewModal from '@/features/profile/components/PreviewModal';

describe('PreviewModal', () => {
  it('renders nothing when visible=false', () => {
    const { queryByTestId } = render(
      <PreviewModal visible={false} onClose={jest.fn()} profile={{ id: '1' }} />
    );
    expect(queryByTestId('app-modal')).toBeNull();
  });

  it('renders the AppModal wrapper when visible', () => {
    const { getByTestId } = render(
      <PreviewModal visible onClose={jest.fn()} profile={{ id: '1' }} />
    );
    expect(getByTestId('app-modal')).toBeTruthy();
  });

  it('renders the SwipeCard preview when a profile is provided', () => {
    const { getByTestId, getByText } = render(
      <PreviewModal visible onClose={jest.fn()} profile={{ id: '42' }} />
    );
    expect(getByTestId('swipe-card')).toBeTruthy();
    expect(getByText('42')).toBeTruthy();
  });

  it('renders an ActivityIndicator when profile is missing', () => {
    const tree = render(
      <PreviewModal visible onClose={jest.fn()} profile={null} />
    );
    expect(tree.UNSAFE_getByType(ActivityIndicator)).toBeTruthy();
    expect(tree.queryByTestId('swipe-card')).toBeNull();
  });
});
