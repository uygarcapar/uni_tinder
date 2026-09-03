jest.mock('lucide-react-native', () =>
  new Proxy({}, { get: () => () => null })
);
// Ayarlar artık AppModal kullanmıyor (ekran oldu) ama içindeki
// BlockedUsersModal hâlâ kullanıyor — mock kalmalı, yoksa gerçek sheet ağacı
// (gorhom + @expo/ui) suite'e giriyor.
jest.mock('@/shared/components/AppModal');

const mockGoBack = jest.fn();
const mockNavigate = jest.fn();
jest.mock('@react-navigation/native', () => ({
  useNavigation: () => ({
    goBack: mockGoBack,
    navigate: mockNavigate,
    setOptions: jest.fn(),
  }),
}));

// ── Ekran kabuğunun bağımlılıkları (ScreenHeader + cam geri butonu) ──────────
jest.mock('react-native-safe-area-context', () => ({
  useSafeAreaInsets: () => ({ top: 20, bottom: 0, left: 0, right: 0 }),
}));
jest.mock('react-native-easing-gradient', () => ({
  easeGradient: () => ({ colors: ['#000', '#fff'], locations: [0, 1] }),
}));
jest.mock('expo-glass-effect', () => ({
  isLiquidGlassAvailable: () => false,
  GlassView: 'GlassView',
}));
// SwiftUI butonu jest'te basılabilir olsun: etiketinden testID türetiyoruz.
// Etiket İKİ yerden gelebiliyor: `label` prop'u (metin butonları) ya da
// `accessibilityLabel()` modifier'ı. İkon butonları ikincisini kullanmak
// ZORUNDA — `label` verildiği anda native taraf children'ı tamamen yok sayıyor
// (bkz. @expo/ui/ios/Button/Button.swift), yani özel ölçülü glif çizilemiyor.
jest.mock('@expo/ui/swift-ui', () => {
  const React = require('react');
  const { TouchableOpacity } = require('react-native');
  const a11yFrom = (modifiers: any[] | undefined) =>
    modifiers?.find((m) => m?.$type === 'accessibilityLabel')?.args?.[0];
  return {
    Host: ({ children }: any) => children,
    Image: () => null,
    Button: ({ label, onPress, modifiers }: any) =>
      React.createElement(TouchableOpacity, {
        onPress,
        testID: `swiftui-${label ?? a11yFrom(modifiers)}`,
      }),
  };
});
// Modifier'lar opak nesneler ama TİPİNİ taşıyorlar: yukarıdaki Button mock'u
// erişilebilir adı bunun içinden okuyor.
jest.mock('@expo/ui/swift-ui/modifiers', () =>
  new Proxy(
    { shapes: new Proxy({}, { get: () => () => ({}) }) },
    {
      get: (target: any, key: string) =>
        target[key] ?? ((...args: unknown[]) => ({ $type: key, args })),
    },
  ),
);
// Paywall artık bir sheet değil, Profil'in "plus" sayfası: ayarlar ekranı
// yalnız kapıyı çalıyor (openLitPlus). Burada test edilen de o — sayfanın
// içeriği değil (bkz. PlusPage.test.tsx).
const mockOpenLitPlus = jest.fn();
jest.mock('@/features/profile/litPlusEntry', () => ({
  openLitPlus: () => mockOpenLitPlus(),
}));

const mockApi = { get: jest.fn(), post: jest.fn() };
jest.mock('@/shared/services/api', () => ({
  __esModule: true,
  default: { get: (...a: any[]) => mockApi.get(...a), post: (...a: any[]) => mockApi.post(...a) },
}));
jest.mock('@/shared/constants/api', () => ({
  API_ENDPOINTS: {
    PRIVACY_MY_DATA: '/privacy/my-data',
    PRIVACY_MY_DATA_STATUS: (id: string) => `/privacy/my-data/${id}`,
    PRIVACY_DELETE_ACCOUNT: '/privacy/delete',
    MODERATION_BLOCKED_USERS: '/moderation/blocked-users',
    MODERATION_BLOCK: (id: string) => `/moderation/block/${id}`,
  },
}));

// react-redux/@reduxjs/toolkit ESM-only build ile geliyor ve transformIgnorePatterns
// dışında kaldığı için import edilirse suite hiç koşmuyor. Ayarlar store'dan
// dil tercihini ve premium tier'ını okuyor — o kadarını burada sahtele.
const mockDispatch = jest.fn();
let mockReduxState: any = { settings: { language: 'tr' } };
jest.mock('react-redux', () => ({
  useDispatch: () => mockDispatch,
  useSelector: (fn: any) => fn(mockReduxState),
}));

/** `subscription` dilimini kur — `statusResolvedAt` dolu = backend konuştu. */
const setPremiumState = (isPremium: boolean, resolved = true) => {
  mockReduxState = {
    ...mockReduxState,
    subscription: {
      isPremium,
      expiresAt: null,
      statusResolvedAt: resolved ? 1_700_000_000_000 : null,
    },
  };
};
jest.mock('@/shared/store/settingsSlice', () => ({
  setLanguage: (lang: string) => ({ type: 'settings/setLanguage', payload: lang }),
}));

const mockGetNotificationPreferences = jest.fn();
const mockUpdateNotificationPreferences = jest.fn();
jest.mock('@/features/chat/chatService', () => ({
  __esModule: true,
  default: {
    getNotificationPreferences: (...a: any[]) =>
      mockGetNotificationPreferences(...a),
    updateNotificationPreferences: (...a: any[]) =>
      mockUpdateNotificationPreferences(...a),
  },
}));

import { Alert, Linking, Switch } from 'react-native';
import { act, fireEvent, render, waitFor } from '@testing-library/react-native';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import SettingsScreen from '@/features/profile/screens/SettingsScreen';

// Ayarlar dil değişiminde desteyi invalidate ediyor (useQueryClient) —
// provider olmadan hook fırlatıyor ve suite'in tamamı render'da düşüyordu.
const setup = () => {
  const client = new QueryClient({
    defaultOptions: { queries: { retry: false } },
  });
  return render(
    <QueryClientProvider client={client}>
      <SettingsScreen />
    </QueryClientProvider>,
  );
};

/** Header'ın cam geri butonu — kategori içindeyken bir kademe, kökte pop. */
const pressBack = async (tree: any) => {
  await act(async () => {
    fireEvent.press(tree.getByTestId('swiftui-Geri'));
  });
};

/**
 * Ayarlar iki kademeli: kök listede kategoriler, satırlar kategoriye girince
 * çiziliyor. Satırla ilgilenen her test önce kategorisini açmalı.
 */
const openSection = async (tree: any, category: string) => {
  await act(async () => {});
  fireEvent.press(tree.getByText(category));
  await act(async () => {});
};

beforeEach(() => {
  mockOpenLitPlus.mockClear();
  mockGoBack.mockClear();
  mockNavigate.mockClear();
  mockReduxState = { settings: { language: 'tr' } };
  setPremiumState(true);
  mockApi.get.mockReset();
  mockApi.post.mockReset();
  mockGetNotificationPreferences.mockReset();
  mockUpdateNotificationPreferences.mockReset();
  mockGetNotificationPreferences.mockResolvedValue({
    showReadReceipts: true,
    skipPushWhenOnline: false,
  });
  jest.spyOn(Alert, 'alert').mockImplementation(() => {});
  jest.spyOn(Linking, 'openURL').mockImplementation(() => Promise.resolve(true));
});
afterEach(() => {
  (Alert.alert as jest.Mock).mockRestore();
  (Linking.openURL as jest.Mock).mockRestore();
  jest.useRealTimers();
});

describe('SettingsScreen — render', () => {
  it('lists the five categories at the root and no rows', async () => {
    const tree = setup();
    await act(async () => {});
    // Sayfa adını yazan TEK yer header: içerikte başlık/açıklama yok, o yüzden
    // "Ayarlar" ekranda bir kez geçiyor.
    expect(tree.getAllByText('Ayarlar')).toHaveLength(1);
    ['Mesajlaşma', 'Gizlilik', 'Tema', 'Dil', 'Hesap'].forEach((category) =>
      expect(tree.getByText(category)).toBeTruthy(),
    );
    // Satırlar kategorinin içinde: kökte çizilmiyorlar.
    expect(tree.queryByText('Verilerimi İndir')).toBeNull();
    expect(tree.queryByText('Hesabı Sil')).toBeNull();
  });

  it('drills into a category and returns with the back button', async () => {
    const tree = setup();
    await openSection(tree, 'Gizlilik');

    expect(tree.getByText('Verilerimi İndir')).toBeTruthy();
    expect(tree.getByText('Engellenenler')).toBeTruthy();
    // Kök liste kategori içinde de MOUNT'LU kalıyor (altta, parallax'la sola
    // kaymış halde) — geçiş sırasında görünmesinin tek yolu bu. Ekranda
    // olmadığının ölçüsü artık "yok" değil, "etkileşime kapalı".
    expect(tree.getByText('Mesajlaşma')).toBeTruthy();
    expect(tree.getByTestId('settings-root-pane').props.pointerEvents).toBe('none');

    await pressBack(tree);

    expect(tree.getByTestId('settings-root-pane').props.pointerEvents).toBe('auto');
    expect(tree.queryByText('Verilerimi İndir')).toBeNull();
    // Bir kademe yukarı çıkıldı, ekran POP'LANMADI.
    expect(mockGoBack).not.toHaveBeenCalled();
  });

  // Aynı buton kökte ekranın kendisinden çıkarıyor — kademe kalmadığında geri
  // gitmek stack'te geri gitmek demek.
  it('pops the screen when back is pressed at the root', async () => {
    const tree = setup();
    await act(async () => {});

    await pressBack(tree);

    expect(mockGoBack).toHaveBeenCalledTimes(1);
  });
});

describe('SettingsScreen — notification preferences', () => {
  it('disables switches until preferences are loaded', async () => {
    mockGetNotificationPreferences.mockReturnValue(new Promise(() => {}));
    const tree = setup();
    await openSection(tree, 'Mesajlaşma');
    const switches = tree.UNSAFE_getAllByType(Switch);
    expect(switches.length).toBeGreaterThan(0);
    switches.forEach((s) => {
      expect(s.props.disabled).toBe(true);
    });
  });

  it('reflects fetched preferences in the switches', async () => {
    mockGetNotificationPreferences.mockResolvedValue({
      showReadReceipts: false,
      skipPushWhenOnline: true,
    });
    const tree = setup();
    await openSection(tree, 'Mesajlaşma');
    await waitFor(() => {
      const [readReceipts, skipPush] = tree.UNSAFE_getAllByType(Switch);
      expect(readReceipts.props.value).toBe(false);
      expect(skipPush.props.value).toBe(true);
    });
  });

  it('optimistically flips the switch and persists the new prefs', async () => {
    mockUpdateNotificationPreferences.mockResolvedValue({});
    const tree = setup();
    await openSection(tree, 'Mesajlaşma');
    const [readReceipts] = await waitFor(() => tree.UNSAFE_getAllByType(Switch));

    await act(async () => {
      readReceipts.props.onValueChange();
    });

    expect(mockUpdateNotificationPreferences).toHaveBeenCalledWith({
      showReadReceipts: false,
      skipPushWhenOnline: false,
    });
  });

  it('rolls back the switch and Alerts when persistence fails', async () => {
    mockUpdateNotificationPreferences.mockRejectedValue(new Error('boom'));
    const tree = setup();
    await openSection(tree, 'Mesajlaşma');
    const [readReceipts] = await waitFor(() => tree.UNSAFE_getAllByType(Switch));

    await act(async () => {
      readReceipts.props.onValueChange();
    });

    await waitFor(() => expect(Alert.alert).toHaveBeenCalled());
    expect((Alert.alert as jest.Mock).mock.calls[0][0]).toBe('Hata');

    const [readReceiptsAfter] = tree.UNSAFE_getAllByType(Switch);
    expect(readReceiptsAfter.props.value).toBe(true);
  });
});

// Bildirimde mesaj önizlemesi — premium + anahtar birlikte. Satır free'de
// switch DEĞİL kilit çiziyor; kilit yalnız backend premium hakkında konuştuysa
// (statusResolvedAt dolu) görünür.
describe('SettingsScreen — message preview', () => {
  const PREVIEW_LABEL = 'Bildirimde Mesajı Göster';

  // Satır free'de diğer ayarlarla aynı görünür: rozet/kilit yok, yalnız switch
  // soluk ve etkisiz — dokunuş paywall'a gider.
  it('renders an inert switch instead of a lock badge for free users', async () => {
    setPremiumState(false);
    const tree = setup();
    await openSection(tree, 'Mesajlaşma');
    await waitFor(() => tree.getByText(PREVIEW_LABEL));

    expect(tree.queryByText('Premium')).toBeNull();
    const preview = tree.UNSAFE_getAllByType(Switch)[2];
    expect(preview.props.value).toBe(false);
    expect(preview.props.onValueChange).toBeUndefined();
  });

  // Paywall Profil'in "plus" sayfası: openLitPlus HomeTabs'e navigate ediyor,
  // Ayarlar stack'te onun ÜSTÜNDE olduğu için kendiliğinden pop'lanıyor —
  // ekranın ayrıca kapanma çağrısı yapmasına gerek yok.
  it('opens lit plus when the locked row is pressed', async () => {
    setPremiumState(false);
    const tree = setup();
    await openSection(tree, 'Mesajlaşma');
    await waitFor(() => tree.getByText(PREVIEW_LABEL));
    expect(mockOpenLitPlus).not.toHaveBeenCalled();

    fireEvent.press(tree.getByText(PREVIEW_LABEL));

    expect(mockOpenLitPlus).toHaveBeenCalledTimes(1);
  });

  // Slice persist edilmiyor: reload'da premium kullanıcı da bir an
  // isPremium:false doğuyor. O pencerede kilit çizmek = ödeme yapmış
  // kullanıcıya paywall göstermek.
  it('does not lock the row while premium is still unresolved', async () => {
    setPremiumState(false, false);
    const tree = setup();
    await openSection(tree, 'Mesajlaşma');
    await waitFor(() => tree.getByText(PREVIEW_LABEL));

    // Kilitli satırın switch'i etkisiz olurdu; burada gerçek anahtar çiziliyor.
    const preview = tree.UNSAFE_getAllByType(Switch)[2];
    expect(preview.props.onValueChange).toBeDefined();
    expect(mockOpenLitPlus).not.toHaveBeenCalled();
  });

  // PUT full-replace: kısmi obje göndermek kullanıcının diğer ayarlarını
  // sıfırlar. GET'ten gelen obje olduğu gibi taşınmalı.
  it('persists the whole prefs object when the preview is toggled off', async () => {
    mockGetNotificationPreferences.mockResolvedValue({
      showReadReceipts: true,
      skipPushWhenOnline: false,
      messageAlerts: true,
      showMessagePreview: true,
    });
    mockUpdateNotificationPreferences.mockResolvedValue({});
    const tree = setup();
    await openSection(tree, 'Mesajlaşma');
    await waitFor(() =>
      expect(tree.UNSAFE_getAllByType(Switch)[2].props.disabled).toBe(false),
    );

    await act(async () => {
      tree.UNSAFE_getAllByType(Switch)[2].props.onValueChange();
    });

    expect(mockUpdateNotificationPreferences).toHaveBeenCalledWith({
      showReadReceipts: true,
      skipPushWhenOnline: false,
      messageAlerts: true,
      showMessagePreview: false,
    });
  });

  it('disables the preview switch when message alerts are off', async () => {
    mockGetNotificationPreferences.mockResolvedValue({
      showReadReceipts: true,
      skipPushWhenOnline: false,
      messageAlerts: false,
      showMessagePreview: true,
    });
    const tree = setup();
    await openSection(tree, 'Mesajlaşma');

    await waitFor(() => {
      const [readReceipts, , preview] = tree.UNSAFE_getAllByType(Switch);
      expect(readReceipts.props.disabled).toBe(false);
      expect(preview.props.disabled).toBe(true);
    });
  });
});

describe('SettingsScreen — data download', () => {
  it('Alerts and skips polling when initial request returns isSuccess=false', async () => {
    mockApi.post.mockResolvedValue({ isSuccess: false, message: 'Yetki yok' });
    const tree = setup();
    await openSection(tree, 'Gizlilik');
    await waitFor(() => tree.getByText('Verilerimi İndir'));

    await act(async () => {
      fireEvent.press(tree.getByText('Verilerimi İndir'));
    });

    expect(Alert.alert).toHaveBeenCalledWith('Hata', 'Yetki yok');
    expect(mockApi.get).not.toHaveBeenCalled();
  });

  // Backend status'ü PascalCase döner ("Completed"/"Failed") — karşılaştırma
  // case-insensitive olmalı, aksi halde hazır export hiç yakalanmıyor.
  it('opens the file URL when polling reports "Completed"', async () => {
    jest.useFakeTimers();
    mockApi.post.mockResolvedValue({ isSuccess: true, result: { requestId: 'req-1' } });
    mockApi.get.mockResolvedValue({
      result: { status: 'Completed', fileUrl: 'https://x/file.zip' },
    });

    const tree = setup();
    await openSection(tree, 'Gizlilik');
    await waitFor(() => tree.getByText('Verilerimi İndir'));

    await act(async () => {
      fireEvent.press(tree.getByText('Verilerimi İndir'));
    });

    await act(async () => {
      jest.advanceTimersByTime(5000);
    });
    // Flush the polling promise chain.
    await act(async () => {});

    expect(mockApi.get).toHaveBeenCalledWith('/privacy/my-data/req-1');
    expect(Linking.openURL).toHaveBeenCalledWith('https://x/file.zip');
  });

  it('Alerts when polling reports "Failed"', async () => {
    jest.useFakeTimers();
    mockApi.post.mockResolvedValue({ isSuccess: true, result: { requestId: 'req-1' } });
    mockApi.get.mockResolvedValue({ result: { status: 'Failed' } });

    const tree = setup();
    await openSection(tree, 'Gizlilik');
    await waitFor(() => tree.getByText('Verilerimi İndir'));

    await act(async () => {
      fireEvent.press(tree.getByText('Verilerimi İndir'));
    });
    await act(async () => {
      jest.advanceTimersByTime(5000);
    });
    await act(async () => {});

    expect(Alert.alert).toHaveBeenCalledWith(
      'Hata',
      'Veri hazırlanamadı, tekrar dene.'
    );
  });

  // Asıl saha hatası: dosya hazır (bildirim merkezine düşüyor) ama gövde
  // beklenenden farklı isimlendiği için hiçbir tur "tamamlandı" saymıyor,
  // spinner 5 dakika dönüp "veri hazırlanamadı" ile bitiyordu.
  it.each([
    ['PascalCase alan adları', { Result: { Status: 'Completed', FileUrl: 'https://x/a.zip' } }],
    ['downloadUrl ismi', { result: { status: 'Ready', downloadUrl: 'https://x/a.zip' } }],
    ['sarmalayıcısız düz gövde', { status: 'completed', fileUrl: 'https://x/a.zip' }],
    ['tanınmayan status, bağlantı dolu', { result: { status: 'Hazir', fileUrl: 'https://x/a.zip' } }],
  ])('opens the file URL despite %s', async (_label, statusBody) => {
    jest.useFakeTimers();
    mockApi.post.mockResolvedValue({ isSuccess: true, result: { requestId: 7 } });
    mockApi.get.mockResolvedValue(statusBody);

    const tree = setup();
    await openSection(tree, 'Gizlilik');
    await waitFor(() => tree.getByText('Verilerimi İndir'));

    await act(async () => {
      fireEvent.press(tree.getByText('Verilerimi İndir'));
    });
    await act(async () => {
      jest.advanceTimersByTime(0);
    });
    await act(async () => {});

    expect(Linking.openURL).toHaveBeenCalledWith('https://x/a.zip');
  });

  // İlk tur hemen atılıyor: hazır bir export için 5 saniye boşuna beklenmiyordu.
  it('polls immediately instead of waiting a full interval', async () => {
    jest.useFakeTimers();
    mockApi.post.mockResolvedValue({ isSuccess: true, result: { requestId: 7 } });
    mockApi.get.mockResolvedValue({ result: { status: 'Pending' } });

    const tree = setup();
    await openSection(tree, 'Gizlilik');
    await waitFor(() => tree.getByText('Verilerimi İndir'));

    await act(async () => {
      fireEvent.press(tree.getByText('Verilerimi İndir'));
    });
    await act(async () => {
      jest.advanceTimersByTime(0);
    });

    expect(mockApi.get).toHaveBeenCalledWith('/privacy/my-data/7');
  });

  // Tek bir 404/ağ hıçkırığı turu bitirmemeli — eskiden ilk hata poll'u sessizce
  // öldürüyor, kullanıcı hiçbir geri bildirim almadan kalıyordu.
  it('survives a transient status error and keeps polling', async () => {
    jest.useFakeTimers();
    mockApi.post.mockResolvedValue({ isSuccess: true, result: { requestId: 7 } });
    mockApi.get
      .mockRejectedValueOnce(new Error('network'))
      .mockResolvedValue({ result: { status: 'Completed', fileUrl: 'https://x/a.zip' } });

    const tree = setup();
    await openSection(tree, 'Gizlilik');
    await waitFor(() => tree.getByText('Verilerimi İndir'));

    await act(async () => {
      fireEvent.press(tree.getByText('Verilerimi İndir'));
    });
    await act(async () => {
      jest.advanceTimersByTime(0);
    });
    await act(async () => {
      jest.advanceTimersByTime(5000);
    });
    await act(async () => {});

    expect(mockApi.get).toHaveBeenCalledTimes(2);
    expect(Linking.openURL).toHaveBeenCalledWith('https://x/a.zip');
  });

  // Status "tamamlandı" ama bağlantı yok: beklemekle düzelmez, spinner'ı
  // sonsuza kilitlemek yerine kullanıcıyı bildirim merkezine yolla.
  it('stops with a notification hint when completed without a file URL', async () => {
    jest.useFakeTimers();
    mockApi.post.mockResolvedValue({ isSuccess: true, result: { requestId: 7 } });
    mockApi.get.mockResolvedValue({ result: { status: 'Completed' } });

    const tree = setup();
    await openSection(tree, 'Gizlilik');
    await waitFor(() => tree.getByText('Verilerimi İndir'));

    await act(async () => {
      fireEvent.press(tree.getByText('Verilerimi İndir'));
    });
    await act(async () => {
      jest.advanceTimersByTime(0);
    });
    await act(async () => {});

    expect(Alert.alert).toHaveBeenCalledWith(
      'Bilgi',
      'Verilerin hazır ama indirme bağlantısı gelmedi. Bildirimlerinden tekrar dene.',
    );
    expect(Linking.openURL).not.toHaveBeenCalled();
  });

  // Ekrandan çıkılınca poll bırakılır — timer arkada dönmeye devam ediyordu.
  it('stops polling when the screen is unmounted', async () => {
    jest.useFakeTimers();
    mockApi.post.mockResolvedValue({ isSuccess: true, result: { requestId: 7 } });
    mockApi.get.mockResolvedValue({ result: { status: 'Pending' } });

    const tree = setup();
    await openSection(tree, 'Gizlilik');
    await waitFor(() => tree.getByText('Verilerimi İndir'));

    await act(async () => {
      fireEvent.press(tree.getByText('Verilerimi İndir'));
    });
    await act(async () => {
      jest.advanceTimersByTime(0);
    });
    const callsWhileOpen = mockApi.get.mock.calls.length;

    tree.unmount();
    await act(async () => {
      jest.advanceTimersByTime(60000);
    });

    expect(mockApi.get).toHaveBeenCalledTimes(callsWhileOpen);
  });

  // Axios hatasında ham "Request failed with status code 400" yerine backend'in
  // kendi mesajı gösterilmeli.
  it('surfaces the backend message from a rejected request', async () => {
    const err: any = new Error('Request failed with status code 429');
    err.response = { data: { message: 'Günde bir kez talep edebilirsin.' } };
    mockApi.post.mockRejectedValue(err);

    const tree = setup();
    await openSection(tree, 'Gizlilik');
    await waitFor(() => tree.getByText('Verilerimi İndir'));

    await act(async () => {
      fireEvent.press(tree.getByText('Verilerimi İndir'));
    });

    expect(Alert.alert).toHaveBeenCalledWith('Hata', 'Günde bir kez talep edebilirsin.');
  });
});

describe('SettingsScreen — account deletion', () => {
  it('opens a destructive confirmation Alert before deleting', async () => {
    const tree = setup();
    await openSection(tree, 'Hesap');
    await waitFor(() => tree.getByText('Hesabı Sil'));

    fireEvent.press(tree.getByText('Hesabı Sil'));
    expect(Alert.alert).toHaveBeenCalledTimes(1);
    const buttons = (Alert.alert as jest.Mock).mock.calls[0][2];
    expect(buttons.map((b: any) => b.text)).toEqual(['İptal', 'Devam Et']);
    expect(buttons[1].style).toBe('destructive');
  });

  it('calls the delete endpoint after destructive confirmation', async () => {
    mockApi.post.mockResolvedValue({ isSuccess: true });
    const tree = setup();
    await openSection(tree, 'Hesap');
    await waitFor(() => tree.getByText('Hesabı Sil'));

    fireEvent.press(tree.getByText('Hesabı Sil'));
    const destructive = (Alert.alert as jest.Mock).mock.calls[0][2][1];

    await act(async () => {
      await destructive.onPress();
    });

    expect(mockApi.post).toHaveBeenCalledWith('/privacy/delete', {});
    expect(
      (Alert.alert as jest.Mock).mock.calls.some(
        (c) => c[0] === 'Hesap Silme Başlatıldı'
      )
    ).toBe(true);
  });

  it('leaves the screen when user taps OK on the success Alert', async () => {
    mockApi.post.mockResolvedValue({ isSuccess: true });
    const tree = setup();
    await openSection(tree, 'Hesap');
    await waitFor(() => tree.getByText('Hesabı Sil'));

    fireEvent.press(tree.getByText('Hesabı Sil'));
    const destructive = (Alert.alert as jest.Mock).mock.calls[0][2][1];
    await act(async () => {
      await destructive.onPress();
    });

    const successCall = (Alert.alert as jest.Mock).mock.calls.find(
      (c) => c[0] === 'Hesap Silme Başlatıldı'
    );
    successCall[2][0].onPress();
    expect(mockGoBack).toHaveBeenCalledTimes(1);
  });

  it('shows the server message when delete fails', async () => {
    mockApi.post.mockResolvedValue({ isSuccess: false, message: 'Yapamazsın' });
    const tree = setup();
    await openSection(tree, 'Hesap');
    await waitFor(() => tree.getByText('Hesabı Sil'));

    fireEvent.press(tree.getByText('Hesabı Sil'));
    const destructive = (Alert.alert as jest.Mock).mock.calls[0][2][1];
    await act(async () => {
      await destructive.onPress();
    });

    expect(
      (Alert.alert as jest.Mock).mock.calls.some(
        (c) => c[0] === 'Hata' && c[1] === 'Yapamazsın'
      )
    ).toBe(true);
  });
});
