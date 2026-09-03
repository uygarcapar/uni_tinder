// Kayıt adımının chrome'u (progressive blur şeridi, footer maskesi) bu suite'in
// konusu değil ve native gradyan/blur zinciri çekiyor — geçirgen kaplarla
// değiştiriliyor, içindeki buton yine render ediliyor.
jest.mock('@/features/auth/components/RegisterStickyHeader', () => {
  const React = require('react');
  const { View } = require('react-native');
  return {
    __esModule: true,
    default: ({ children }: any) => React.createElement(View, null, children),
    REGISTER_HEADER_HEIGHT: 0,
  };
});
jest.mock('@/features/auth/components/RegisterStickyFooter', () => {
  const React = require('react');
  const { View } = require('react-native');
  return {
    __esModule: true,
    default: ({ children }: any) => React.createElement(View, null, children),
  };
});
jest.mock('@/features/auth/components/RegisterProgressBar', () => ({
  __esModule: true,
  default: () => null,
}));
jest.mock('@/features/auth/components/RegisterBackButton', () => ({
  __esModule: true,
  default: () => null,
}));
jest.mock('@/shared/components/AnimatedPressable', () => {
  const React = require('react');
  const { Pressable } = require('react-native');
  return {
    __esModule: true,
    default: ({ children, ...rest }: any) =>
      React.createElement(Pressable, rest, children),
  };
});
jest.mock('@/shared/components/PromptPickerModal', () => ({
  __esModule: true,
  default: () => null,
}));
jest.mock('@/shared/queries/commonQueries', () => {
  const CATALOG = [
    {
      category: 'Test',
      prompts: [
        { enumName: 'A', display: { tr: 'Soru A' }, name: 'A' },
        { enumName: 'B', display: { tr: 'Soru B' }, name: 'B' },
        { enumName: 'C', display: { tr: 'Soru C' }, name: 'C' },
      ],
    },
  ];
  return {
    __esModule: true,
    usePrompts: () => ({ data: CATALOG }),
    findPrompt: (_groups: any, key: string) =>
      CATALOG[0].prompts.find((p) => p.enumName === key),
    resolveLocalized: (value: any, _lang: string, fallback = '') =>
      typeof value === 'string' ? value : value?.tr ?? fallback,
  };
});

const mockToast = jest.fn();
jest.mock('@/shared/services/toaster', () => ({
  showInfoToast: (...args: any[]) => mockToast(...args),
}));

// Ekran gerçek profile reducer'ı ile çalışıyor: PromptsEditor'ün yaydığı dizi
// store'a yazılıp geri okunuyor — sahadaki render döngüsünün aynısı.
jest.mock('@/shared/hooks/redux', () => {
  const { useSelector, useDispatch } = require('react-redux');
  return { useAppSelector: useSelector, useAppDispatch: useDispatch };
});

import React from 'react';
import { Provider } from 'react-redux';
import { configureStore } from '@reduxjs/toolkit';
import { render, fireEvent, act, screen } from '@testing-library/react-native';
import profileReducer, {
  updateMultipleFields,
} from '@/features/profile/profileSlice';
import RegisterStep17Screen from '@/features/auth/screens/RegisterStep17Screen';
import tr from '@/shared/i18n/translations/tr';
import type { ProfilePromptAnswer } from '@/shared/types';

const copy = tr.profile.prompts;
const navigate = jest.fn();

function renderStep17(prompts: ProfilePromptAnswer[]) {
  const store = configureStore({
    reducer: { profile: profileReducer },
    middleware: (getDefault) => getDefault({ serializableCheck: false }),
  });
  store.dispatch(updateMultipleFields({ prompts }));
  return render(
    <Provider store={store}>
      <RegisterStep17Screen
        navigation={{ navigate, goBack: jest.fn() } as any}
        route={{ key: 'k', name: 'RegisterStep17' } as any}
      />
    </Provider>,
  );
}

/** "Bitir"e dokunmak: blur ve press aynı karede düşüyor. */
function pressFinish(slot: number) {
  const input = screen.getAllByPlaceholderText(copy.answerPlaceholder)[slot];
  const finish = screen.getByText(copy.finishAnswer);
  act(() => {
    fireEvent(input, 'blur');
    fireEvent.press(finish);
  });
}

describe('RegisterStep17Screen', () => {
  beforeEach(() => {
    navigate.mockClear();
    mockToast.mockClear();
  });

  it('üç cevap da "Bitir" ile kaydedildiğinde "Devam Et" hatasız ilerler', () => {
    renderStep17([
      { promptKey: 'A', answer: 'selam' },
      { promptKey: 'B', answer: 'okeys' },
      { promptKey: 'C', answer: '' },
    ]);

    fireEvent.press(screen.getAllByText(copy.editAnswer)[2]);
    fireEvent.changeText(
      screen.getAllByPlaceholderText(copy.answerPlaceholder)[2],
      'adam',
    );
    pressFinish(2);

    fireEvent.press(screen.getByText(tr.common.continueButton));

    expect(mockToast).not.toHaveBeenCalled();
    expect(navigate).toHaveBeenCalledWith('RegisterStep14');
  });

  it('son cevap "Bitir"e basılmadan başka slota geçilse de kaydedilir', () => {
    renderStep17([
      { promptKey: 'A', answer: 'selam' },
      { promptKey: 'B', answer: 'okeys' },
      { promptKey: 'C', answer: '' },
    ]);

    fireEvent.press(screen.getAllByText(copy.editAnswer)[2]);
    fireEvent.changeText(
      screen.getAllByPlaceholderText(copy.answerPlaceholder)[2],
      'adam',
    );
    // "Bitir" yerine ilk slotun düzenlemesine geçiliyor; blur geç geliyor.
    fireEvent.press(screen.getAllByText(copy.editAnswer)[0]);
    const closedInput = screen.getAllByPlaceholderText(
      copy.answerPlaceholder,
    )[2];
    act(() => {
      closedInput.props.onBlur?.();
    });

    fireEvent.press(screen.getByText(tr.common.continueButton));

    expect(mockToast).not.toHaveBeenCalled();
    expect(navigate).toHaveBeenCalledWith('RegisterStep14');
  });

  it('gerçekten boş kalan cevabı slotun altında işaretler', () => {
    renderStep17([
      { promptKey: 'A', answer: 'selam' },
      { promptKey: 'B', answer: '' },
    ]);

    fireEvent.press(screen.getByText(tr.common.continueButton));

    expect(navigate).not.toHaveBeenCalled();
    expect(mockToast).toHaveBeenCalledTimes(1);
    // Slot bazlı işaret: kullanıcı hangi cevabın eksik olduğunu görüyor.
    expect(screen.getByText(copy.errors['UT-2204'])).toBeTruthy();
  });
});
