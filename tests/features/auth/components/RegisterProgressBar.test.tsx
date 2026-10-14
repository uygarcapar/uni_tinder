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
import { Provider } from 'react-redux';
import { configureStore } from '@reduxjs/toolkit';
import authReducer from '@/features/auth/authSlice';
import RegisterProgressBar from '@/features/auth/components/RegisterProgressBar';

/**
 * Bar artık STORE'A BAĞLI: paydası seçilen moda göre kısalıyor (Arkadaş modunda
 * flörte özel adım akıştan çıkıyor, bkz. registrationFlow > stepsForMode). Bu
 * yüzden smoke testleri de Provider istiyor — bağımlılık gerçek, mock'lanacak
 * bir şey değil.
 */
const renderWithMode = (step: number, mode?: string) => {
  const store = configureStore({
    reducer: { auth: authReducer },
    // Mod kayıt formunda; reducer'ı doğrudan besliyoruz ki test adım
    // numarasına değil PAYDAYA baksın.
    preloadedState: mode
      ? ({ auth: { registrationForm: { mode } } } as any)
      : undefined,
  });
  return render(
    <Provider store={store}>
      <RegisterProgressBar step={step} />
    </Provider>,
  );
};

describe('RegisterProgressBar', () => {
  it('renders without crashing for the first step', () => {
    expect(() => renderWithMode(3)).not.toThrow();
  });

  it('renders without crashing for steps below the first step', () => {
    expect(() => renderWithMode(-5)).not.toThrow();
  });

  it('renders without crashing for steps above the last step', () => {
    expect(() => renderWithMode(99)).not.toThrow();
  });

  it('renders without crashing for a mid-range step', () => {
    expect(() => renderWithMode(8)).not.toThrow();
  });

  it('mod seçiliyken de çiziliyor — Arkadaş modunda payda kısa', () => {
    expect(() => renderWithMode(13, 'Friends')).not.toThrow();
    expect(() => renderWithMode(18, 'Friends')).not.toThrow();
  });

  it('Arkadaş modunda flörte özel adım numarası gelse bile patlamıyor', () => {
    // Elenen adımın numarası (10) listede YOK → progressIndex fallback dalına
    // düşüyor. Bar boş kalabilir ama çizim kırılmamalı.
    expect(() => renderWithMode(10, 'Friends')).not.toThrow();
  });
});
