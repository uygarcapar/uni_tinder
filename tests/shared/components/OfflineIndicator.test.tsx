jest.mock('@/shared/components/SFIcon', () => {
  const React = require('react');
  const { View } = require('react-native');
  return {
    __esModule: true,
    default: ({ name }: any) =>
      React.createElement(View, { testID: `sficon-${name}` }),
  };
});

import { render, act } from '@testing-library/react-native';
import type { NetworkState } from 'expo-network';
import { addNetworkStateListener, getNetworkStateAsync } from 'expo-network';
import WaveFillLogo from '@/shared/components/WaveFillLogo';

const ICON = 'sficon-wifi.slash';

/**
 * networkStatus BİLEREK tek modül-seviyesi singleton: uygulama ömrü boyunca
 * tek native listener. Testler de bu gerçeğe göre kurulu — modül grafiğini
 * resetlemeye çalışmıyoruz (resetModules + require ikinci bir React kopyası
 * yükleyip "invalid hook call"a yol açıyor). Bunun yerine listener bir kez
 * yakalanıyor ve durum hep `emit` ile sürülüyor, böylece her test kendi
 * durumunu açıkça kuruyor ve sıraya bağımlı olmuyor.
 */
let emit: ((state: NetworkState) => void) | undefined;

const setNetwork = async (state: Partial<NetworkState>) => {
  await act(async () => {
    emit?.(state as NetworkState);
  });
};

beforeAll(() => {
  (
    getNetworkStateAsync as jest.MockedFunction<typeof getNetworkStateAsync>
  ).mockResolvedValue({} as NetworkState);
  (
    addNetworkStateListener as jest.MockedFunction<typeof addNetworkStateListener>
  ).mockImplementation((listener: any) => {
    emit = listener;
    return { remove: jest.fn() } as any;
  });
});

describe('OfflineIndicator', () => {
  // Durum bilinmeden (getNetworkStateAsync henüz dönmeden) NetworkState boş bir
  // nesne. Offline sayılsaydı gösterge her cold start'ta yanıp sönerdi.
  // İLK test olmalı: abonelik ilk render'da kuruluyor, `emit` de o an yakalanıyor.
  it('durum henüz bilinmiyorken gösterge çıkmaz', async () => {
    const { queryByTestId } = render(<WaveFillLogo />);
    await act(async () => {});
    expect(queryByTestId(ICON)).toBeNull();
    expect(emit).toBeDefined();
  });

  it('bağlantı varken gösterge çıkmaz', async () => {
    await setNetwork({ isConnected: true, isInternetReachable: true });
    const { queryByTestId } = render(<WaveFillLogo />);
    expect(queryByTestId(ICON)).toBeNull();
  });

  it('bağlantı yokken logonun yanında gösterge çıkar', async () => {
    await setNetwork({ isConnected: false, isInternetReachable: false });
    const { queryByTestId } = render(<WaveFillLogo />);
    expect(queryByTestId(ICON)).toBeTruthy();
  });

  // Captive portal: wifi'ye bağlısın ama internet yok.
  it('bağlı ama internet erişilemiyorsa gösterge çıkar', async () => {
    await setNetwork({ isConnected: true, isInternetReachable: false });
    const { queryByTestId } = render(<WaveFillLogo />);
    expect(queryByTestId(ICON)).toBeTruthy();
  });

  it('mount hâlindeyken bağlantı kopunca belirir, gelince kaybolur', async () => {
    await setNetwork({ isConnected: true, isInternetReachable: true });
    const { queryByTestId } = render(<WaveFillLogo />);
    expect(queryByTestId(ICON)).toBeNull();

    await setNetwork({ isConnected: false, isInternetReachable: false });
    expect(queryByTestId(ICON)).toBeTruthy();

    await setNetwork({ isConnected: true, isInternetReachable: true });
    expect(queryByTestId(ICON)).toBeNull();
  });
});
