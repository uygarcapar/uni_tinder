/**
 * `visible` prop'u ile gorhom'un state machine'i arasındaki köprünün
 * sözleşmesi. Buradaki asıl kilit **kalıcı "açılmayan modal" bug'ı**:
 *
 * gorhom sheet'i bildirimsiz kapatabiliyor (stack minimize, DISMISSING
 * zehirlenmesi). Wrapper bunu fark etmezse `visible` true'da kilitleniyor;
 * effect yalnız boolean'ın kenarında çalıştığı için bir daha present()
 * atılmıyor ve modal ekran ömrü boyunca AÇILMIYOR. Aşağıdaki testler o
 * kilidin iki çıkış kapısını (watchdog + kapanış bildirimi) tutuyor.
 */

// `mock` öneki jest.mock factory'sinin hoisting kuralı için zorunlu.
const mockModalInstances: any[] = [];
const mockPresent = jest.fn();
const mockDismiss = jest.fn();

jest.mock('@gorhom/bottom-sheet', () => {
  const React = require('react');
  const { View } = require('react-native');
  return {
    __esModule: true,
    BottomSheetModal: React.forwardRef((props: any, ref: any) => {
      // Her render'da güncel prop'ları yakala; test onChange/onDismiss'i
      // gorhom'un yerine kendisi tetikliyor. Slot mount'ta bir kez alınıyor,
      // yani remount (key değişimi) yeni bir kayıt açar.
      const slot = React.useMemo(() => mockModalInstances.push(null) - 1, []);
      mockModalInstances[slot] = { props };
      React.useImperativeHandle(ref, () => ({
        present: mockPresent,
        dismiss: mockDismiss,
      }));
      return React.createElement(View, null, props.children);
    }),
    BottomSheetBackdrop: () => null,
    BottomSheetFooter: ({ children }: any) => children ?? null,
  };
});

import React from 'react';
import { Text } from 'react-native';
import { act, render } from '@testing-library/react-native';
import AppBottomSheet from '@/shared/components/AppBottomSheet';

const PRESENT_DELAY = 100;
const WATCHDOG = 1500;

const latest = () => mockModalInstances[mockModalInstances.length - 1];

/** gorhom'un "sheet bir detent'e oturdu" bildirimi. */
const reportPresented = () => act(() => latest().props.onChange(0));
/** gorhom'un "sheet kapalı konuma indi" bildirimi. */
const reportClosed = () => act(() => latest().props.onChange(-1));
/** gorhom'un unmount sonrası attığı bildirim. */
const reportDismissed = () => act(() => latest().props.onDismiss());

const renderSheet = (visible: boolean) => {
  const onClose = jest.fn();
  const view = render(
    <AppBottomSheet visible={visible} onClose={onClose}>
      <Text>içerik</Text>
    </AppBottomSheet>,
  );
  const setVisible = (next: boolean) =>
    view.rerender(
      <AppBottomSheet visible={next} onClose={onClose}>
        <Text>içerik</Text>
      </AppBottomSheet>,
    );
  return { onClose, setVisible };
};

beforeEach(() => {
  jest.useFakeTimers();
  mockModalInstances.length = 0;
  mockPresent.mockClear();
  mockDismiss.mockClear();
});

afterEach(() => {
  jest.useRealTimers();
});

describe('açılış', () => {
  it('visible=false ile mount edilince dismiss ETMEZ', () => {
    // İlk mount'ta dismiss() gorhom status'unu DISMISSING'e zehirliyor ve
    // sonraki present()'i kalıcı block ediyor.
    renderSheet(false);
    act(() => jest.advanceTimersByTime(WATCHDOG * 2));
    expect(mockDismiss).not.toHaveBeenCalled();
    expect(mockPresent).not.toHaveBeenCalled();
  });

  it('visible=true olunca present eder', () => {
    renderSheet(true);
    act(() => jest.advanceTimersByTime(PRESENT_DELAY));
    expect(mockPresent).toHaveBeenCalledTimes(1);
  });
});

describe('kapanış bildirimi', () => {
  it('onChange(-1) parent’a haber verir; ardından gelen onDismiss tekrarlamaz', () => {
    const { onClose } = renderSheet(true);
    act(() => jest.advanceTimersByTime(PRESENT_DELAY));
    reportPresented();

    reportClosed();
    expect(onClose).toHaveBeenCalledTimes(1);

    // gorhom aynı kapanış için arkadan onDismiss da atıyor — onClose'un iki
    // kez çağrılması, kapanışta yan etkisi olan ekranlarda (form reset,
    // analytics) çift tetikleme demek.
    reportDismissed();
    expect(onClose).toHaveBeenCalledTimes(1);
  });

  it('kullanıcı kapattıktan sonra wrapper ayrıca dismiss GÖNDERMEZ', () => {
    const { setVisible } = renderSheet(true);
    act(() => jest.advanceTimersByTime(PRESENT_DELAY));
    reportPresented();
    reportClosed();

    // Parent onClose'a karşılık visible'ı false'a çekiyor. gorhom zaten
    // kendini kapatıyor; buradan gelecek ikinci dismiss state machine'i bozar.
    setVisible(false);
    expect(mockDismiss).not.toHaveBeenCalled();
  });

  it('parent programatik kapatınca dismiss eder', () => {
    const { setVisible } = renderSheet(true);
    act(() => jest.advanceTimersByTime(PRESENT_DELAY));
    reportPresented();

    setVisible(false);
    expect(mockDismiss).toHaveBeenCalledTimes(1);
  });
});

describe('watchdog', () => {
  it('present sonrası sheet açılmazsa örneği tazeler ve parent’ı çözer', () => {
    const { onClose } = renderSheet(true);
    act(() => jest.advanceTimersByTime(PRESENT_DELAY));
    expect(mockPresent).toHaveBeenCalledTimes(1);

    const instanceCount = mockModalInstances.length;
    // gorhom hiçbir şey bildirmiyor — sheet ekranda yok, `visible` true.
    act(() => jest.advanceTimersByTime(WATCHDOG));

    expect(onClose).toHaveBeenCalledTimes(1);
    expect(mockModalInstances.length).toBeGreaterThan(instanceCount);
  });

  it('sheet açıldıysa tetiklenmez', () => {
    const { onClose } = renderSheet(true);
    act(() => jest.advanceTimersByTime(PRESENT_DELAY));
    reportPresented();

    act(() => jest.advanceTimersByTime(WATCHDOG * 2));
    expect(onClose).not.toHaveBeenCalled();
  });

  it('kilit çözüldükten sonra bir sonraki açılış yeniden present eder', () => {
    // Bug'ın kullanıcıya dokunan hâli: kilitlenmiş modal, aynı satıra tekrar
    // basıldığında da açılmıyordu.
    const { setVisible } = renderSheet(true);
    act(() => jest.advanceTimersByTime(PRESENT_DELAY));
    act(() => jest.advanceTimersByTime(WATCHDOG));

    setVisible(false);
    mockPresent.mockClear();

    setVisible(true);
    act(() => jest.advanceTimersByTime(PRESENT_DELAY));
    expect(mockPresent).toHaveBeenCalledTimes(1);
  });
});
