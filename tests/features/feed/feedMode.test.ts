/**
 * Akış ARKADAŞ modunun yüzeyi — Flört'te hiç yok (2026-11-05 ürün kararı).
 *
 * ⚠️ MOD KAPISI, LATCH'İN KARDEŞİ AMA AYRISI. İkisi farklı soruları
 * cevaplıyor:
 *   • latch (feedFlag, UT-7301) → "backend'de bu özellik açık mı"
 *   • mod kapısı (bu dosya)      → "bu modda bu özellik var mı"
 * Mod seçimini latch'e yazmak cazip ama YANLIŞ olurdu: `recordFeedFlag(_, false)`
 * diske yazıyor ve kapanma cold start'a kadar yapışıyor — Flört'te geçirilen bir
 * oturum, Arkadaş'a dönüldüğünde de özelliği kapalı bırakırdı.
 *
 * ⚠️ OTURUM AYNASI neden var: `openFeed` bir bildirim dokunuşundan çağrılıyor,
 * yani hook yok ve kullanıcı kimliği elde değil — mod tercihi ise MMKV'de
 * kullanıcı bazlı anahtarda. Ayna açılışta bir kez tohumlanıyor (AppNavigator,
 * `initFeedFlag`in yanında) ve sonra `APP_MODE_EVENT` ile güncel kalıyor.
 * Tohumlama atlanırsa varsayılan Flört — yani "bilmiyorsak kapalı", bayrak
 * latch'inin "unknown → kapalı" kuralının aynısı.
 */

// Dev kancası jest'te (__DEV__ true) bayrağı HER ZAMAN açıyor — kapalıyken de
// kapatan latch'i test edebilmek için üretim davranışı mock'lanıyor
// (TabNavigator.test'teki aynı gerekçe).
jest.mock('@/features/feed/feedDevFlag', () => ({
  devForceFeedEnabled: jest.fn(() => false),
}));

jest.mock('@/shared/services/navigationRef', () => ({
  navigationRef: {
    isReady: () => true,
    navigate: (...args: unknown[]) => mockNavigate(...args),
  },
}));

const mockNavigate = jest.fn();

import uiBus from '@/shared/services/uiBus';
import { appPrefs } from '@/shared/utils/appPrefs';
import { saveAppMode } from '@/features/discover/modePrefs';
import { APP_MODE_EVENT } from '@/features/discover/useAppMode';
import {
  FEED_MODE,
  feedAllowedForSession,
  feedAllowedInMode,
  initFeedMode,
  resetFeedModeSession,
} from '@/features/feed/feedMode';
import {
  initFeedFlag,
  recordFeedFlag,
  resetFeedFlagSession,
} from '@/features/feed/feedFlag';
import { consumeFeedRequest, openFeed } from '@/features/feed/feedEntry';

const USER = 'user-1';

/** Akış açılabilsin diye latch'i "on"a al — bu dosyanın konusu MOD kapısı. */
const enableFeedFlag = () => {
  recordFeedFlag(USER, true);
  initFeedFlag(USER);
};

beforeEach(() => {
  appPrefs.clearAll?.();
  resetFeedFlagSession();
  resetFeedModeSession();
  mockNavigate.mockReset();
  consumeFeedRequest();
});

describe('feedAllowedInMode — saf kapı', () => {
  it('Arkadaş açık, Flört kapalı', () => {
    expect(feedAllowedInMode('Friends')).toBe(true);
    expect(feedAllowedInMode('Dating')).toBe(false);
  });

  it('bilinmeyen/boş değer KAPALI tarafta (beyaz liste)', () => {
    // Bayat disk, kurcalanmış payload, alanı hiç göndermeyen sunucu: üçü de
    // "göster" tarafına düşmemeli.
    expect(feedAllowedInMode(undefined)).toBe(false);
    expect(feedAllowedInMode(null)).toBe(false);
    expect(feedAllowedInMode('friends')).toBe(false);
    expect(feedAllowedInMode('Something')).toBe(false);
  });

  it('akışın modu Arkadaş', () => {
    expect(FEED_MODE).toBe('Friends');
  });
});

describe('oturum aynası', () => {
  it('tohumlanmadan ÖNCE kapalı (bilmiyorsak gösterme)', () => {
    expect(feedAllowedForSession()).toBe(false);
  });

  it('diskteki Arkadaş tercihi tohumlanınca açılıyor', () => {
    saveAppMode(USER, 'Friends');
    initFeedMode(USER);
    expect(feedAllowedForSession()).toBe(true);
  });

  it('diskteki Flört tercihi tohumlanınca kapalı', () => {
    saveAppMode(USER, 'Dating');
    initFeedMode(USER);
    expect(feedAllowedForSession()).toBe(false);
  });

  it('oturum ortasında mod değişimini CANLI izliyor', () => {
    saveAppMode(USER, 'Dating');
    initFeedMode(USER);
    expect(feedAllowedForSession()).toBe(false);

    uiBus.emit(APP_MODE_EVENT, { mode: 'Friends' });
    expect(feedAllowedForSession()).toBe(true);

    uiBus.emit(APP_MODE_EVENT, { mode: 'Dating' });
    expect(feedAllowedForSession()).toBe(false);
  });

  it('bilinmeyen moddaki olay aynayı BOZMUYOR', () => {
    saveAppMode(USER, 'Friends');
    initFeedMode(USER);
    uiBus.emit(APP_MODE_EVENT, { mode: 'Nonsense' });
    expect(feedAllowedForSession()).toBe(true);
  });

  it('çıkışta sıfırlanıyor — sonraki kullanıcının modu sızmasın', () => {
    saveAppMode(USER, 'Friends');
    initFeedMode(USER);
    resetFeedModeSession();
    expect(feedAllowedForSession()).toBe(false);
  });
});

/**
 * `openFeed`in `false` dönmesi çağıran için "Bildirimler'e düş" demek
 * (routeFromNotification). Kapı olmasaydı Flört modunda akış push'u
 * `navigate("Feed")` çağırırdı — o route kayıtlı DEĞİL, yani dokunuş hiçbir şey
 * yapmazdı. Sekmesi olmayan bir özelliğin push'u ölü tap üretmemeli: bayrak
 * kapısının var oluş gerekçesinin aynısı.
 */
describe('openFeed mod kapısı', () => {
  it('Arkadaş modunda açıyor', () => {
    enableFeedFlag();
    saveAppMode(USER, 'Friends');
    initFeedMode(USER);

    expect(openFeed('feed')).toBe(true);
    expect(mockNavigate).toHaveBeenCalled();
  });

  it('Flört modunda açmıyor ve NAVIGATE ETMİYOR', () => {
    enableFeedFlag();
    saveAppMode(USER, 'Dating');
    initFeedMode(USER);

    expect(openFeed('feed')).toBe(false);
    expect(mockNavigate).not.toHaveBeenCalled();
  });

  it('Flört modunda BEKLEYEN İSTEK de bırakmıyor', () => {
    // Yoksa kullanıcı Arkadaş'a geçip akışa girdiğinde günler önceki bir
    // bildirim isteği sayfayı çeviriyordu (feedEntry > pendingPage kalıcı).
    enableFeedFlag();
    saveAppMode(USER, 'Dating');
    initFeedMode(USER);

    openFeed('mine');
    expect(consumeFeedRequest()).toBeNull();
  });

  it('latch kapalıyken mod Arkadaş olsa da açmıyor (iki kapı AYRI)', () => {
    initFeedFlag(USER); // "unknown" → kapalı
    saveAppMode(USER, 'Friends');
    initFeedMode(USER);

    expect(openFeed('feed')).toBe(false);
  });
});
