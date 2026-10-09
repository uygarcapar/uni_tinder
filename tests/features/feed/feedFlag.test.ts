/**
 * Akış bayrağı latch'i (UT-7301).
 *
 * Test edilen asıl şey: oturum değerinin DONDURULMUŞ kalması. Sekme tab bar'ın
 * ortasında (Beğeniler'den sonra) ve araya sekme eklemek/çıkarmak mevcut route
 * index'lerini kaydırıyor — bayrak oturum ortasında uygulanırsa kullanıcının
 * seçili sekmesi altından kayar. O yüzden `recordFeedFlag` diski güncelleyip
 * HER İKİ yönde de `false` dönüyor ve `feedEnabledForSession()` değişmiyor.
 *
 * İkinci kritik nokta UT-7315 ayrımı: o da 403 ama "özellik kapalı" DEMİYOR.
 * Status'a bakan bir kapı, profili yarım bir kullanıcı yüzünden sekmeyi herkese
 * kapatırdı — bu yüzden latch'e yalnız UT-7301 yazılır.
 */

// Dev kancası (feedDevFlag) KAPALI: jest'te `__DEV__` true olduğu için kanca
// açık kalsaydı her oturum "açık" doğar ve buradaki üretim davranışının
// tamamı sınanamazdı. Kancanın kendi etkisi en altta ayrıca test ediliyor.
jest.mock('@/features/feed/feedDevFlag', () => ({
  devForceFeedEnabled: jest.fn(() => false),
}));

// MMKV mock'u (root __mocks__/react-native-mmkv.ts) zaten devrede; store'u
// testler arası sıfırlamak için instance'ı doğrudan okuyoruz.
import { appPrefs } from '@/shared/utils/appPrefs';
import { devForceFeedEnabled } from '@/features/feed/feedDevFlag';
import { FEED_CODES } from '@/shared/constants/responseCodes';
import {
  FEED_FLAG_PROBE_INTERVAL_MS,
  feedEnabledForSession,
  initFeedFlag,
  markFeedDisabled,
  markFeedFlagProbed,
  readFeedFlag,
  recordFeedFlag,
  resetFeedFlagSession,
  shouldProbeFeedFlag,
} from '@/features/feed/feedFlag';

const USER = 'user-1';

beforeEach(() => {
  appPrefs.clearAll?.();
  resetFeedFlagSession();
});

describe('readFeedFlag — diskten okuma', () => {
  it('hiç yazılmamışsa unknown', () => {
    expect(readFeedFlag(USER)).toBe('unknown');
  });

  it('userId yoksa unknown (anahtar kullanıcıya scope\'lu)', () => {
    expect(readFeedFlag(null)).toBe('unknown');
    expect(readFeedFlag(undefined)).toBe('unknown');
  });

  it('yazılan değeri geri okur', () => {
    recordFeedFlag(USER, true);
    expect(readFeedFlag(USER)).toBe('on');
    recordFeedFlag(USER, false);
    expect(readFeedFlag(USER)).toBe('off');
  });

  it('bozuk JSON → unknown (patlamaz)', () => {
    appPrefs.set(`feedFlag:${USER}`, 'bu json değil');
    expect(readFeedFlag(USER)).toBe('unknown');
  });

  it('eski şema sürümü → unknown (yorumlamaya çalışıp yanlış "kapalı" üretmez)', () => {
    appPrefs.set(`feedFlag:${USER}`, JSON.stringify({ v: 0, enabled: true, at: 1 }));
    expect(readFeedFlag(USER)).toBe('unknown');
  });

  it('bayrak kullanıcı başına ayrı tutulur', () => {
    recordFeedFlag(USER, true);
    expect(readFeedFlag('user-2')).toBe('unknown');
  });
});

describe('initFeedFlag + feedEnabledForSession — oturum kilidi', () => {
  it('init çağrılmadan kapalı sayılır', () => {
    expect(feedEnabledForSession()).toBe(false);
  });

  it('unknown KAPALI sayılır (bilmediğimizde sekme çizilmez)', () => {
    expect(initFeedFlag(USER)).toBe('unknown');
    expect(feedEnabledForSession()).toBe(false);
  });

  it('diskte on ise oturum açık', () => {
    recordFeedFlag(USER, true);
    expect(initFeedFlag(USER)).toBe('on');
    expect(feedEnabledForSession()).toBe(true);
  });

  it('diskte off ise oturum kapalı', () => {
    recordFeedFlag(USER, false);
    expect(initFeedFlag(USER)).toBe('off');
    expect(feedEnabledForSession()).toBe(false);
  });
});

describe('recordFeedFlag — geçiş kuralı (ortadaki sekme)', () => {
  it('off → on: diske yazar ama ŞİMDİ uygulanmaz (false döner)', () => {
    initFeedFlag(USER); // unknown → oturum kapalı
    expect(recordFeedFlag(USER, true)).toBe(false);
    expect(readFeedFlag(USER)).toBe('on'); // disk güncel
    expect(feedEnabledForSession()).toBe(false); // oturum DOKUNULMADI
  });

  it('on → off: diske yazar, oturum değeri DEĞİŞMEZ (sekme altından çekilmez)', () => {
    recordFeedFlag(USER, true);
    initFeedFlag(USER);
    expect(feedEnabledForSession()).toBe(true);

    expect(recordFeedFlag(USER, false)).toBe(false);
    expect(readFeedFlag(USER)).toBe('off');
    expect(feedEnabledForSession()).toBe(true); // oturum boyunca açık kalır
  });

  it('bir sonraki cold start\'ta yeni değer geçerli olur', () => {
    recordFeedFlag(USER, true);
    initFeedFlag(USER);
    recordFeedFlag(USER, false);

    // Cold start simülasyonu
    resetFeedFlagSession();
    expect(initFeedFlag(USER)).toBe('off');
    expect(feedEnabledForSession()).toBe(false);
  });

  it('userId hiç yoksa yazmaz', () => {
    expect(recordFeedFlag(null, true)).toBe(false);
    expect(readFeedFlag(USER)).toBe('unknown');
  });

  it('init edilmiş oturumda userId geçilmezse sahibine yazar', () => {
    initFeedFlag(USER);
    recordFeedFlag(undefined, true);
    expect(readFeedFlag(USER)).toBe('on');
  });
});

describe('markFeedDisabled', () => {
  it('UT-7301 yolunda diske off yazar', () => {
    initFeedFlag(USER);
    markFeedDisabled(USER);
    expect(readFeedFlag(USER)).toBe('off');
  });

  it('UT-7315 bu yoldan GEÇMEMELİ — kodlar farklı sabitler', () => {
    // Sözleşme tuzağı: ikisi de 403. Servis `code` ile ayırıyor; burada
    // ayrımın kaybolmadığını sabitleyen bir regresyon kilidi var.
    expect(FEED_CODES.DISABLED).toBe('UT-7301');
    expect(FEED_CODES.PROFILE_INCOMPLETE).toBe('UT-7315');
    expect(FEED_CODES.DISABLED).not.toBe(FEED_CODES.PROFILE_INCOMPLETE);
  });
});

describe('dev kancası (feedDevFlag)', () => {
  afterEach(() => {
    (devForceFeedEnabled as jest.Mock).mockReturnValue(false);
  });

  it('latch kapalıyken sekmeyi AÇAR — ekranı bayrak beklemeden görebilmek için', () => {
    (devForceFeedEnabled as jest.Mock).mockReturnValue(true);
    expect(initFeedFlag(USER)).toBe('unknown'); // diskteki gerçek DEĞİŞMEZ
    expect(feedEnabledForSession()).toBe(true); // ama oturum açık
  });

  it('diskteki "off"u da geçersiz kılar (dev\'de ekran hep erişilebilir)', () => {
    recordFeedFlag(USER, false);
    (devForceFeedEnabled as jest.Mock).mockReturnValue(true);
    expect(initFeedFlag(USER)).toBe('off');
    expect(feedEnabledForSession()).toBe(true);
  });

  it('gerçek "on" cevabını MASKELEMİYOR — kanca kapalıyken de açık', () => {
    recordFeedFlag(USER, true);
    (devForceFeedEnabled as jest.Mock).mockReturnValue(false);
    initFeedFlag(USER);
    expect(feedEnabledForSession()).toBe(true);
  });
});

describe('shouldProbeFeedFlag — throttle', () => {
  const T0 = 1_700_000_000_000;

  it('sekme zaten açıksa probe atılmaz (useFeedMe /me\'nin sahibi)', () => {
    recordFeedFlag(USER, true);
    initFeedFlag(USER);
    expect(shouldProbeFeedFlag(T0)).toBe(false);
  });

  it('kapalıyken ve hiç probe edilmemişken true', () => {
    initFeedFlag(USER);
    expect(shouldProbeFeedFlag(T0)).toBe(true);
  });

  it('aralık dolmadan tekrar true dönmez', () => {
    initFeedFlag(USER);
    markFeedFlagProbed(T0);
    expect(shouldProbeFeedFlag(T0 + 60_000)).toBe(false);
    expect(shouldProbeFeedFlag(T0 + FEED_FLAG_PROBE_INTERVAL_MS - 1)).toBe(false);
  });

  it('aralık dolunca yeniden true', () => {
    initFeedFlag(USER);
    markFeedFlagProbed(T0);
    expect(shouldProbeFeedFlag(T0 + FEED_FLAG_PROBE_INTERVAL_MS)).toBe(true);
  });
});
