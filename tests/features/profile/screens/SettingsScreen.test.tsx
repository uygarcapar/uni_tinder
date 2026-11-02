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
  // Ekran, açılacak kategoriyi route param'ından okuyabiliyor (bkz.
  // RootStackParamList.Settings). Param'sız açılış = kök liste.
  useRoute: () => ({ params: undefined }),
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

const mockApi = { get: jest.fn(), post: jest.fn(), delete: jest.fn() };
jest.mock('@/shared/services/api', () => ({
  __esModule: true,
  default: {
    get: (...a: any[]) => mockApi.get(...a),
    post: (...a: any[]) => mockApi.post(...a),
    delete: (...a: any[]) => mockApi.delete(...a),
  },
}));
jest.mock('@/shared/constants/api', () => ({
  API_ENDPOINTS: {
    PRIVACY_MY_DATA: '/privacy/my-data',
    PRIVACY_MY_DATA_STATUS: (id: string) => `/privacy/my-data/${id}`,
    PRIVACY_DELETE_PERMANENT: '/privacy/account',
    PRIVACY_DEACTIVATE: '/privacy/deactivate',
    MODERATION_BLOCKED_USERS: '/moderation/blocked-users',
    MODERATION_BLOCK: (id: string) => `/moderation/block/${id}`,
    // Kampüs simülasyonunun otomatik Enter'ı campusService üzerinden geçiyor.
    CAMPUS_PRESENCE: '/campus/presence',
    CAMPUS_ME: '/campus/me',
  },
}));

// reportSimulatedEntry tembel require ile campusPresence'ı çekiyor ve o
// expo-location import ediyor — native modül jest'te yok, import patlamasın.
// Fonksiyonlar ÇAĞRILMIYOR bile: simüle edilmiş okuma izin kapısının önünde.
jest.mock('expo-location', () => ({
  Accuracy: { High: 4 },
  getForegroundPermissionsAsync: jest.fn(async () => ({ status: 'granted' })),
  getCurrentPositionAsync: jest.fn(),
  getLastKnownPositionAsync: jest.fn(async () => null),
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
import { feedKeys } from '@/features/feed/feedKeys';
import { writeCachedBoundary } from '@/features/campus/campusBoundary';
import { isCampusLocationSimulated } from '@/features/campus/campusDevLocation';
import { appPrefs } from '@/shared/utils/appPrefs';

// Ayarlar dil değişiminde desteyi invalidate ediyor (useQueryClient) —
// provider olmadan hook fırlatıyor ve suite'in tamamı render'da düşüyordu.
const setup = (seedClient?: (client: QueryClient) => void) => {
  const client = new QueryClient({
    defaultOptions: { queries: { retry: false } },
  });
  seedClient?.(client);
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
    // Ekran açılışta rıza durumunu da çekiyor (Gizlilik'teki doğrulama
    // anahtarları) — "get hiç çağrılmadı" artık doğru soru değil. Sorulan şey
    // POLL'un başlamaması: talep açılamadıysa durum ucuna gidilmemeli.
    expect(mockApi.get).not.toHaveBeenCalledWith(
      expect.stringContaining('/privacy/my-data/'),
    );
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

describe('SettingsScreen — hesabı dondur', () => {
  it('dondurmadan önce yıkıcı bir onay Alert\'i açar', async () => {
    const tree = setup();
    await openSection(tree, 'Hesap');
    await waitFor(() => tree.getByText('Hesabı Dondur'));

    fireEvent.press(tree.getByText('Hesabı Dondur'));
    expect(Alert.alert).toHaveBeenCalledTimes(1);
    const buttons = (Alert.alert as jest.Mock).mock.calls[0][2];
    expect(buttons.map((b: any) => b.text)).toEqual(['Vazgeç', 'Dondur']);
    expect(buttons[1].style).toBe('destructive');
  });

  it('onaydan sonra deactivate ucunu çağırır ve çıkış yaptırır', async () => {
    mockApi.post.mockResolvedValue({ isSuccess: true });
    const tree = setup();
    await openSection(tree, 'Hesap');
    await waitFor(() => tree.getByText('Hesabı Dondur'));

    fireEvent.press(tree.getByText('Hesabı Dondur'));
    const destructive = (Alert.alert as jest.Mock).mock.calls[0][2][1];
    await act(async () => {
      await destructive.onPress();
    });

    expect(mockApi.post).toHaveBeenCalledWith('/privacy/deactivate', {});
    const success = (Alert.alert as jest.Mock).mock.calls.find(
      (c) => c[0] === 'Hesabın donduruldu'
    );
    expect(success).toBeTruthy();

    // Dondurma sonrası oturum kapanmalı — hesap artık gizli.
    mockDispatch.mockClear();
    success[2][0].onPress();
    expect(mockDispatch).toHaveBeenCalled();
  });
});

describe('SettingsScreen — hesabı sil', () => {
  /** Silme satırına basıp şifre modalını açar. */
  const openDeleteModal = async (tree: any) => {
    await openSection(tree, 'Hesap');
    await waitFor(() => tree.getByText('Hesabı Sil'));
    await act(async () => {
      fireEvent.press(tree.getByText('Hesabı Sil'));
    });
  };

  it('Alert değil, şifre soran modalı açar', async () => {
    const tree = setup();
    await openDeleteModal(tree);

    // Eski akış burada bir Alert açıyordu; artık şifre teyidi şart.
    expect(Alert.alert).not.toHaveBeenCalled();
    expect(tree.getByText('Hesabını kalıcı olarak sil')).toBeTruthy();
    expect(tree.getByPlaceholderText('Şifreni gir')).toBeTruthy();
  });

  it('şifre boşken uç çağrılmaz', async () => {
    const tree = setup();
    await openDeleteModal(tree);

    await act(async () => {
      fireEvent.press(tree.getByText('Kalıcı Olarak Sil'));
    });

    expect(mockApi.delete).not.toHaveBeenCalled();
    expect(tree.getByText('Şifreni gir.')).toBeTruthy();
  });

  it('şifreyi gövdede DELETE ile yollar ve çıkış yaptırır', async () => {
    mockApi.delete.mockResolvedValue('');
    const tree = setup();
    await openDeleteModal(tree);

    fireEvent.changeText(tree.getByPlaceholderText('Şifreni gir'), 'hunter2');
    await act(async () => {
      fireEvent.press(tree.getByText('Kalıcı Olarak Sil'));
    });

    // DELETE gövdesi axios'ta config.data ile gider.
    expect(mockApi.delete).toHaveBeenCalledWith('/privacy/account', {
      data: { password: 'hunter2' },
    });

    const success = (Alert.alert as jest.Mock).mock.calls.find(
      (c) => c[0] === 'Hesabın silindi'
    );
    expect(success).toBeTruthy();

    // Hesap gitti; goBack() ölü ekranda bırakırdı, oturum kapanmalı.
    mockDispatch.mockClear();
    success[2][0].onPress();
    expect(mockDispatch).toHaveBeenCalled();
    expect(mockGoBack).not.toHaveBeenCalled();
  });

  it('yanlış şifrede modal açık kalır, hata içeride gösterilir', async () => {
    mockApi.delete.mockRejectedValue({
      response: { data: { code: 'INVALID_PASSWORD', message: 'Şifre hatalı.' } },
    });
    const tree = setup();
    await openDeleteModal(tree);

    fireEvent.changeText(tree.getByPlaceholderText('Şifreni gir'), 'yanlis');
    await act(async () => {
      fireEvent.press(tree.getByText('Kalıcı Olarak Sil'));
    });

    // Alert DEĞİL: kullanıcı modalı kapatmadan tekrar denesin.
    expect(Alert.alert).not.toHaveBeenCalled();
    expect(tree.getByText('Şifre hatalı.')).toBeTruthy();
    expect(tree.getByPlaceholderText('Şifreni gir')).toBeTruthy();
  });

  it('diğer hatalarda sunucu mesajını Alert ile gösterir', async () => {
    mockApi.delete.mockRejectedValue({
      response: { data: { message: 'Yapamazsın' } },
    });
    const tree = setup();
    await openDeleteModal(tree);

    fireEvent.changeText(tree.getByPlaceholderText('Şifreni gir'), 'hunter2');
    await act(async () => {
      fireEvent.press(tree.getByText('Kalıcı Olarak Sil'));
    });

    expect(
      (Alert.alert as jest.Mock).mock.calls.some(
        (c) => c[0] === 'Hata' && c[1] === 'Yapamazsın'
      )
    ).toBe(true);
  });
});

describe('SettingsScreen — kampüs simülasyonu (DEV)', () => {
  // Yaşanan bug: kullanıcı akışta BAŞKA üniversiteyi seçip haritasını açınca
  // sınır o kampüs için cache'leniyor; menü domain'siz çağırınca araç
  // "diskteki herhangi bir sınır"a düşüp kullanıcıyı YANLIŞ kampüsün içine
  // sabitliyordu (Bilgi'li kullanıcı Acıbadem'de "kampüsteyim" oldu). Menü
  // artık kullanıcının KENDİ domain'ini (feed/me query cache'i) geçmek
  // zorunda — kendi sınırı diskte yoksa cevap "kurulamadı", başka kampüs değil.
  const OTHER_DOMAIN = 'acibadem.edu.tr';
  const OTHER_KEY = `campusBoundary:${OTHER_DOMAIN}`;
  const FIX_KEY = 'campus.devFix';

  afterEach(() => {
    appPrefs.remove(OTHER_KEY);
    appPrefs.remove(FIX_KEY);
  });

  /** Uzun basış → teşhis menüsü → "Kampüs simülasyonu" → "Kampüste say". */
  const pressTurnOn = async (tree: any) => {
    await act(async () => {});
    fireEvent(tree.getByTestId('settings-env-row'), 'longPress');
    const diag = (Alert.alert as jest.Mock).mock.calls.find(
      (c) => c[0] === 'Teşhis raporu',
    );
    diag[2].find((b: any) => b.text === 'Kampüs simülasyonu').onPress();
    const menu = (Alert.alert as jest.Mock).mock.calls.find(
      (c) => c[0] === 'Kampüs simülasyonu',
    );
    menu[2].find((b: any) => b.text === 'Kampüste say').onPress();
  };

  it('diskte yalnız BAŞKA kampüsün sınırı varken oraya sabitlemiyor', async () => {
    // Diskte yalnız Acıbadem'in sınırı var…
    writeCachedBoundary(OTHER_DOMAIN, {
      domain: OTHER_DOMAIN,
      isApproximate: false,
      circle: { lat: 41.08448, lon: 29.05359, radiusMeters: 600 },
      polygon: {
        type: 'Polygon',
        coordinates: [
          [
            [29.045, 41.08],
            [29.062, 41.08],
            [29.062, 41.089],
            [29.045, 41.089],
            [29.045, 41.08],
          ],
        ],
      },
      version: 'v1',
      enabled: true,
    });

    // …ama kullanıcı Bilgi'li (feed/me cache'i öyle diyor).
    const tree = setup((client) => {
      client.setQueryData(feedKeys.me, { universityDomain: 'bilgiedu.net' });
    });
    await pressTurnOn(tree);

    // Acıbadem'e sabitlenmek YOK: simülasyon kapalı kaldı ve araç sebebini
    // söyledi (kendi sınırın diskte yok → haritanı aç).
    expect(isCampusLocationSimulated()).toBe(false);
    const result = (Alert.alert as jest.Mock).mock.calls.find(
      (c) => c[0] === 'Simülasyon kurulamadı',
    );
    expect(result).toBeTruthy();
    expect(result[1]).toContain('KENDİ kampüsün');
  });

  it('feed/me cache boşsa AÇILMIYOR — başka kampüse düşmek yerine sebep söyleniyor', async () => {
    // Eski "son çare" (diskteki herhangi bir sınır) Acıbadem bug'ının ikinci
    // yoluydu: akış hiç yüklenmemişken bile yanlış kampüse sabitliyordu.
    writeCachedBoundary(OTHER_DOMAIN, {
      domain: OTHER_DOMAIN,
      isApproximate: false,
      circle: { lat: 41.08448, lon: 29.05359, radiusMeters: 600 },
      polygon: {
        type: 'Polygon',
        coordinates: [
          [
            [29.045, 41.08],
            [29.062, 41.08],
            [29.062, 41.089],
            [29.045, 41.089],
            [29.045, 41.08],
          ],
        ],
      },
      version: 'v1',
      enabled: true,
    });

    const tree = setup();
    await pressTurnOn(tree);

    expect(isCampusLocationSimulated()).toBe(false);
    const result = (Alert.alert as jest.Mock).mock.calls.find(
      (c) => c[0] === 'Simülasyon kurulamadı',
    );
    expect(result).toBeTruthy();
  });

  it('"Kampüste say" başarılıysa presence Enter OTOMATİK gidiyor', async () => {
    // Tasarım kararı: eski ikinci menü adımı ("Kampüse girdim") kendiliğinden
    // koşuyor — push yolunu tetiklemek için ayrıca basmak gerekmiyor.
    writeCachedBoundary('bilgiedu.net', {
      domain: 'bilgiedu.net',
      isApproximate: false,
      circle: { lat: 41.08448, lon: 29.05359, radiusMeters: 600 },
      polygon: {
        type: 'Polygon',
        coordinates: [
          [
            [29.045, 41.08],
            [29.062, 41.08],
            [29.062, 41.089],
            [29.045, 41.089],
            [29.045, 41.08],
          ],
        ],
      },
      version: 'v1',
      enabled: true,
    });
    mockApi.post.mockResolvedValue({
      isSuccess: true,
      result: { inCampus: true, momentCountToday: 0 },
    });
    mockApi.get.mockResolvedValue({
      isSuccess: true,
      result: { postedToday: false },
    });

    try {
      const tree = setup((client) => {
        client.setQueryData(feedKeys.me, { universityDomain: 'bilgiedu.net' });
      });
      await pressTurnOn(tree);

      expect(isCampusLocationSimulated()).toBe(true);
      await waitFor(() =>
        expect(mockApi.post).toHaveBeenCalledWith(
          '/campus/presence',
          expect.objectContaining({ state: 'Enter' }),
        ),
      );
    } finally {
      appPrefs.remove('campusBoundary:bilgiedu.net');
    }
  });

  it('simülasyon KURULAMADIYSA Enter atılmıyor', async () => {
    // Sınır diskte yok → noBoundary; yanlış koordinatla Enter atmak sunucuyu
    // UT-7410'a sürüklerdi.
    const tree = setup((client) => {
      client.setQueryData(feedKeys.me, { universityDomain: 'bilgiedu.net' });
    });
    await pressTurnOn(tree);

    expect(isCampusLocationSimulated()).toBe(false);
    await act(async () => {});
    expect(mockApi.post).not.toHaveBeenCalled();
  });

  it('Enter ağda patlarsa sim AÇIK kalıyor ve hata raporu görünüyor', async () => {
    writeCachedBoundary('bilgiedu.net', {
      domain: 'bilgiedu.net',
      isApproximate: false,
      circle: { lat: 41.08448, lon: 29.05359, radiusMeters: 600 },
      polygon: {
        type: 'Polygon',
        coordinates: [
          [
            [29.045, 41.08],
            [29.062, 41.08],
            [29.062, 41.089],
            [29.045, 41.089],
            [29.045, 41.08],
          ],
        ],
      },
      version: 'v1',
      enabled: true,
    });
    mockApi.post.mockRejectedValue(new Error('network down'));
    mockApi.get.mockRejectedValue(new Error('network down'));

    try {
      const tree = setup((client) => {
        client.setQueryData(feedKeys.me, { universityDomain: 'bilgiedu.net' });
      });
      await pressTurnOn(tree);

      await waitFor(() =>
        expect(
          (Alert.alert as jest.Mock).mock.calls.some(
            (c) => c[0] === 'Kampüse giriş bildirilemedi',
          ),
        ).toBe(true),
      );
      // Giriş bildirilemedi diye simülasyon GERİ ALINMIYOR: konum sabitleme
      // yerel bir araç, Enter yalnız push yolunu tetikliyor.
      expect(isCampusLocationSimulated()).toBe(true);
    } finally {
      appPrefs.remove('campusBoundary:bilgiedu.net');
    }
  });

  it('AÇIK ama YANLIŞ kampüsteyse menü "kendi kampüsüne taşı" sunuyor', async () => {
    // Yaşanan durumun ikinci yarısı: eski bug'dan kalma Acıbadem kaydı diskte
    // duruyor ve menü onu gösterip duruyor. Kullanıcıdan kapat/aç ritüeli
    // beklemek yerine menü bozukluğu kendisi görüp tek dokunuşla onarmalı.
    const rect = {
      isApproximate: false,
      circle: { lat: 41.08448, lon: 29.05359, radiusMeters: 600 },
      polygon: {
        type: 'Polygon' as const,
        coordinates: [
          [
            [29.045, 41.08],
            [29.062, 41.08],
            [29.062, 41.089],
            [29.045, 41.089],
            [29.045, 41.08],
          ] as [number, number][],
        ],
      },
      version: 'v1',
      enabled: true,
    };
    const MY_DOMAIN = 'bilgiedu.net';
    const MY_KEY = `campusBoundary:${MY_DOMAIN}`;
    writeCachedBoundary(OTHER_DOMAIN, { domain: OTHER_DOMAIN, ...rect });
    writeCachedBoundary(MY_DOMAIN, { domain: MY_DOMAIN, ...rect });
    // Eski bug'ın bıraktığı kayıt: Acıbadem'e sabitlenmiş simülasyon.
    appPrefs.set(
      FIX_KEY,
      JSON.stringify({
        latitude: 41.08448,
        longitude: 29.05359,
        domain: OTHER_DOMAIN,
      }),
    );

    try {
      const tree = setup((client) => {
        client.setQueryData(feedKeys.me, { universityDomain: MY_DOMAIN });
      });
      await act(async () => {});
      fireEvent(tree.getByTestId('settings-env-row'), 'longPress');
      const diag = (Alert.alert as jest.Mock).mock.calls.find(
        (c) => c[0] === 'Teşhis raporu',
      );
      diag[2].find((b: any) => b.text === 'Kampüs simülasyonu').onPress();
      const menu = (Alert.alert as jest.Mock).mock.calls.find(
        (c) => c[0] === 'Kampüs simülasyonu',
      );
      // Durum satırı yanlışlığı söylüyor…
      expect(menu[1]).toContain(OTHER_DOMAIN);
      expect(menu[1].toLowerCase()).toContain('senin kampüsün değil');
      // …ve onarım düğmesi tek dokunuşla kendi kampüsüne taşıyor.
      menu[2]
        .find((b: any) => b.text === 'Kendi kampüsüne taşı')
        .onPress();
      const moved = JSON.parse(appPrefs.getString(FIX_KEY)!);
      expect(moved.domain).toBe(MY_DOMAIN);
    } finally {
      appPrefs.remove(MY_KEY);
    }
  });
});
