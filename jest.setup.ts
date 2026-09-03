jest.mock('react-native-reanimated', () =>
  require('react-native-reanimated/src/mock')
);
import 'react-native-gesture-handler/jestSetup';
// i18n'i gerçek sözlükle başlat (lng: 'tr') — bileşenler t() ile Türkçe
// render eder, testler kullanıcı-görünür metni assert eder.
import '@/shared/i18n';
import '@testing-library/jest-native/extend-expect';
jest.mock('@react-native-async-storage/async-storage', () =>
  require('@react-native-async-storage/async-storage/jest/async-storage-mock')
);
// expo-notifications ESM olarak geliyor (transform allowlist dışı) ve native
// modül gerektiriyor — pushService'in kullandığı yüzey no-op mock'lanır.
jest.mock('expo-notifications', () => ({
  setNotificationHandler: jest.fn(),
  setNotificationChannelAsync: jest.fn(async () => {}),
  getPermissionsAsync: jest.fn(async () => ({ status: 'denied' })),
  requestPermissionsAsync: jest.fn(async () => ({ status: 'denied' })),
  scheduleNotificationAsync: jest.fn(async () => 'id'),
  dismissAllNotificationsAsync: jest.fn(async () => {}),
  setBadgeCountAsync: jest.fn(async () => true),
  addNotificationResponseReceivedListener: jest.fn(() => ({ remove: jest.fn() })),
  AndroidImportance: { HIGH: 4 },
}));
// FCM native modül gerektirir — pushService'in kullandığı modular API mock'lanır.
jest.mock('@react-native-firebase/messaging', () => ({
  getMessaging: jest.fn(() => ({})),
  getToken: jest.fn(async () => 'fcm-token'),
  onTokenRefresh: jest.fn(() => jest.fn()),
  onMessage: jest.fn(() => jest.fn()),
  onNotificationOpenedApp: jest.fn(() => jest.fn()),
  getInitialNotification: jest.fn(async () => null),
}));
// expo-device import anında native EventEmitter istiyor — sabit değerlerle mock.
jest.mock('expo-device', () => ({
  isDevice: false,
  brand: 'jest',
  modelName: 'jest',
  osName: 'iOS',
}));
// RC SDK'sı jest transform'undan geçmeyen ESM bağımlılığı çekiyor; native
// modül de test ortamında yok — API yüzeyi no-op mock'lanır.
jest.mock('react-native-purchases', () => ({
  __esModule: true,
  default: {
    setLogLevel: jest.fn(),
    configure: jest.fn(),
    logIn: jest.fn(async () => ({})),
    logOut: jest.fn(async () => ({})),
    getOfferings: jest.fn(async () => ({ current: null, all: {} })),
    purchasePackage: jest.fn(async () => ({ customerInfo: {} })),
    restorePurchases: jest.fn(async () => ({})),
    getCustomerInfo: jest.fn(async () => ({ entitlements: { active: {} } })),
    addCustomerInfoUpdateListener: jest.fn(),
  },
  LOG_LEVEL: { VERBOSE: 'VERBOSE', WARN: 'WARN', ERROR: 'ERROR' },
}));
// Ağ durumu göstergesinin kaynağı; native modül jest'te yok. Varsayılan
// "bağlı" — offline'a özel testler bu mock'u kendi dosyasında ezer.
jest.mock('expo-network', () => ({
  getNetworkStateAsync: jest.fn(async () => ({
    isConnected: true,
    isInternetReachable: true,
  })),
  addNetworkStateListener: jest.fn(() => ({ remove: jest.fn() })),
}));
// Lucide ikon barrel'ı (src/shared/icons.ts). Bileşenler ikonları ARTIK oradan
// alıyor, doğrudan "lucide-react-native"tan değil — suite'lerin tek tek koyduğu
// lucide mock'ları bu yüzden artık hedefi ıskalıyor ve ikon `undefined` gelip
// "Element type is invalid" ile düşüyorlar. Proxy: hangi ikon istenirse istensin
// çizmeyen bir bileşen döner, listeye ikon eklendikçe güncellemek gerekmez.
jest.mock('@/shared/icons', () =>
  new Proxy(
    {},
    {
      get: (_target, prop) => (prop === '__esModule' ? true : () => null),
    },
  ),
);
jest.mock('expo-blur', () => ({ BlurView: 'BlurView' }));
// Cam yüzeyler. `isLiquidGlassAvailable` FALSE döner: testlerde bileşenler
// blur/fallback yolunu çizsin — cam yolu native `UIGlassEffect`e dayanıyor,
// jest'te doğrulanabilir bir karşılığı yok.
// SwiftUI modifier fabrikaları (glassFallback bunlardan zincir kuruyor).
// Paket native; içe aktarılması expo-modules-core'u uyandırıp jest'i düşürüyor.
// Modifier'lar burada opak nesneler — testler zincirin İÇERİĞİNİ değil, onu
// kuran bileşenin render'ını doğruluyor.
jest.mock('@expo/ui/swift-ui/modifiers', () => {
  const modifier = (...args: unknown[]) => ({ __modifier: true, args });
  return {
    __esModule: true,
    background: modifier,
    frame: modifier,
    padding: modifier,
    strokeBorder: modifier,
    shapes: {
      circle: modifier,
      capsule: modifier,
      roundedRectangle: modifier,
    },
  };
});
jest.mock('expo-glass-effect', () => ({
  GlassView: 'GlassView',
  GlassContainer: 'GlassContainer',
  isLiquidGlassAvailable: jest.fn(() => false),
  isGlassEffectAPIAvailable: jest.fn(() => false),
}));
// WelcomeScreen arka plan videosu — native player jest'te yok, hook sahte bir
// player döndürüp VideoView host component olarak render edilir.
jest.mock('expo-video', () => ({
  VideoView: 'VideoView',
  useVideoPlayer: jest.fn(() => ({
    play: jest.fn(),
    pause: jest.fn(),
    replay: jest.fn(),
    release: jest.fn(),
    loop: false,
    muted: false,
    audioMixingMode: 'auto',
  })),
}));
// Sesli mesaj: oynatıcı da kaydedici de native. Mock olmadan expo-audio'yu
// içe aktarmak expo-modules-core'u yüklüyor ve jest'te "Cannot read properties
// of undefined (reading 'EventEmitter')" ile düşüyor — sesli balonu (ve onun
// klonunu render eden uzun-bas menüsünü) içeren HER suite'i vurur.
jest.mock('expo-audio', () => ({
  createAudioPlayer: jest.fn(() => ({
    play: jest.fn(),
    pause: jest.fn(),
    remove: jest.fn(),
    seekTo: jest.fn(() => Promise.resolve()),
    addListener: jest.fn(() => ({ remove: jest.fn() })),
    setPlaybackRate: jest.fn(),
    shouldCorrectPitch: true,
    playbackRate: 1,
    duration: 0,
    isLoaded: false,
  })),
  setAudioModeAsync: jest.fn(() => Promise.resolve()),
  getRecordingPermissionsAsync: jest.fn(() => Promise.resolve({ granted: true })),
  requestRecordingPermissionsAsync: jest.fn(() =>
    Promise.resolve({ granted: true }),
  ),
  useAudioRecorder: jest.fn(() => ({
    record: jest.fn(),
    stop: jest.fn(() => Promise.resolve()),
    pause: jest.fn(),
    prepareToRecordAsync: jest.fn(() => Promise.resolve()),
    getStatus: jest.fn(() => ({ metering: -60, isRecording: false })),
    uri: null,
  })),
  RecordingPresets: { HIGH_QUALITY: {} },
}));
// Dokunsal geri bildirim — native. Tek tek suite'lerde mock'lanıyordu; sesli
// balon gibi ortak bileşenler de kullandığı için burada tek yerden.
// Yerel jest.mock'lar bunu ezer, çağrı sayısına bakan testler etkilenmez.
jest.mock('expo-haptics', () => ({
  impactAsync: jest.fn(() => Promise.resolve()),
  selectionAsync: jest.fn(() => Promise.resolve()),
  notificationAsync: jest.fn(() => Promise.resolve()),
  ImpactFeedbackStyle: { Light: 'light', Medium: 'medium', Heavy: 'heavy', Rigid: 'rigid', Soft: 'soft' },
  NotificationFeedbackType: { Success: 'success', Warning: 'warning', Error: 'error' },
}));
jest.mock('expo-symbols', () => ({ SymbolView: 'SymbolView' }));
jest.mock('expo-linear-gradient', () => ({ LinearGradient: 'LinearGradient' }));
// transform allowlist dışında; host component olarak mock'lanınca maskeli
// gradient kullanan bileşenler (SwipeCard kalbi) render edilebilir.
jest.mock('@react-native-masked-view/masked-view', () => ({
  __esModule: true,
  default: 'MaskedView',
}));
jest.mock('expo-image', () => {
  const RN = require('react-native');
  return { Image: RN.Image };
});
// Foto seçimi/kırpması native modül gerektiriyor. Varsayılan "iptal edildi":
// bir suite gerçekten seçim akışını test ediyorsa mock'u kendi başında ezer.
jest.mock('expo-image-picker', () => ({
  launchImageLibraryAsync: jest.fn(async () => ({ canceled: true, assets: null })),
  launchCameraAsync: jest.fn(async () => ({ canceled: true, assets: null })),
  getCameraPermissionsAsync: jest.fn(async () => ({ granted: true, canAskAgain: true, status: 'granted' })),
  requestCameraPermissionsAsync: jest.fn(async () => ({ granted: true, canAskAgain: true, status: 'granted' })),
}));
jest.mock('expo-image-manipulator', () => ({
  ImageManipulator: {
    manipulate: jest.fn(() => ({
      crop: jest.fn().mockReturnThis(),
      resize: jest.fn().mockReturnThis(),
      renderAsync: jest.fn(async () => ({
        saveAsync: jest.fn(async () => ({ uri: 'file:///cropped.jpg', width: 900, height: 1200 })),
        release: jest.fn(),
      })),
      release: jest.fn(),
    })),
  },
  SaveFormat: { JPEG: 'jpeg', PNG: 'png', WEBP: 'webp' },
}));
jest.mock('expo-file-system', () => {
  class MockFile {
    // Varsayılan: indirme başarılı ve hedef dosyanın kendisini döner (gerçek
    // API de indirilen File'ı döndürüyor). Hata yolunu test eden suite'ler
    // `File.downloadFileAsync.mockRejectedValueOnce` ile eziyor.
    static downloadFileAsync = jest.fn(async (_url: string, destination: any) => destination);
    uri: string;
    exists = true;
    constructor(...parts: any[]) {
      this.uri = parts.map((p) => (typeof p === 'string' ? p : p?.uri ?? '')).join('/');
    }
    move = jest.fn(async () => {});
    delete = jest.fn();
  }
  class MockDirectory {
    uri: string;
    exists = true;
    constructor(...parts: any[]) {
      this.uri = parts.map((p) => (typeof p === 'string' ? p : p?.uri ?? '')).join('/');
    }
    create = jest.fn();
    list = jest.fn(() => []);
  }
  return {
    File: MockFile,
    Directory: MockDirectory,
    Paths: { document: { uri: 'file:///documents' }, cache: { uri: 'file:///caches' } },
  };
});
jest.mock('expo-secure-store', () => ({
  getItem: jest.fn(() => null),
  setItem: jest.fn(),
  getItemAsync: jest.fn(async () => null),
  setItemAsync: jest.fn(async () => {}),
  AFTER_FIRST_UNLOCK: 0,
}));
jest.mock('expo-crypto', () => ({
  getRandomBytes: jest.fn((n: number) => new Uint8Array(n)),
}));
jest.mock('expo-store-review', () => ({
  isAvailableAsync: jest.fn(async () => false),
  requestReview: jest.fn(async () => {}),
}));
// Sürüm kapısının okuduğu native alanlar — testte native modül yok.
jest.mock('expo-application', () => ({
  nativeApplicationVersion: '1.0.0',
  nativeBuildVersion: '1',
}));
jest.mock('expo-constants', () => ({
  __esModule: true,
  default: { expoConfig: { version: '1.0.0' } },
}));
// expo-modules-core'un native EventEmitter'ı jest'te yok — gerçek modül import
// edilir edilmez patlıyor (SettingsModal teşhis raporu, MessageActionSheet kopyala).
jest.mock('expo-clipboard', () => ({
  setStringAsync: jest.fn(async () => true),
  getStringAsync: jest.fn(async () => ''),
}));
jest.mock('posthog-react-native', () => ({
  __esModule: true,
  default: jest.fn().mockImplementation(() => ({
    screen: jest.fn(),
    capture: jest.fn(),
    identify: jest.fn(),
    reset: jest.fn(),
  })),
}));
jest.mock('react-native-fast-confetti', () => {
  const CannonConfetti: any = () => null;
  CannonConfetti.Origin = () => null;
  return { CannonConfetti, Confetti: () => null };
});
jest.mock('@sentry/react-native', () => ({
  init: jest.fn(),
  wrap: (c: any) => c,
  captureException: jest.fn(),
  setUser: jest.fn(),
  addBreadcrumb: jest.fn(),
  withProfiler: (c: any) => c,
  TimeToFullDisplay: () => null,
  reactNavigationIntegration: jest.fn(() => ({ registerNavigationContainer: jest.fn() })),
  ErrorBoundary: ({ children }: any) => children,
}));
(globalThis as any).fetch = jest.fn();
