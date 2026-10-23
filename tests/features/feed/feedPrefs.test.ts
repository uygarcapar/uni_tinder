/**
 * Akış filtre tercihleri — kalıcılık ve YETKİYLE SÜZME.
 *
 * Test edilen asıl şey PLUS'TAN DÜŞME senaryosu. `university` ve `kind` Plus
 * gerektiriyor; kullanıcı aboneliğini bıraktığında diskte kalmış bir "başka
 * kampüs" tercihi her açılışta UT-7310 üretir ve akış bomboş görünür —
 * kullanıcı da neden boş olduğunu anlamaz. Bu yüzden okuma süzülüyor.
 *
 * İkinci kritik nokta: süzme DİSKE YAZMIYOR. Yazsaydı bir günlük abonelik
 * boşluğu kullanıcının kampüs tercihini kalıcı olarak silerdi.
 *
 * Üçüncüsü: `/me` henüz GELMEDİYSE süzme YAPILMIYOR. O anda "hakkı yok"
 * varsaymak Plus'lı kullanıcının tercihini her açılışta bir kare sıfırlardı
 * (premiumTier.resolved kuralının aynısı).
 */

import { appPrefs } from '@/shared/utils/appPrefs';
import {
  DEFAULT_FEED_PARAMS,
  activeFilterCount,
  loadFeedParams,
  sanitizeFeedParams,
  saveFeedParams,
} from '@/features/feed/feedPrefs';
import type { FeedListParams } from '@/features/feed/feedTypes';

const USER = 'user-1';

const params = (over: Partial<FeedListParams> = {}): FeedListParams => ({
  ...DEFAULT_FEED_PARAMS,
  ...over,
});

const CAPS_PLUS = { canPickUniversity: true, canUseKindFilter: true };
const CAPS_FREE = { canPickUniversity: false, canUseKindFilter: false };

beforeEach(() => {
  appPrefs.clearAll?.();
});

describe('kalıcılık', () => {
  it('yazılmamışsa varsayılanlar', () => {
    expect(loadFeedParams(USER)).toEqual(DEFAULT_FEED_PARAMS);
  });

  it('userId yoksa varsayılanlar (anahtar kullanıcıya scope\'lu)', () => {
    expect(loadFeedParams(null)).toEqual(DEFAULT_FEED_PARAMS);
    saveFeedParams(null, params({ sort: 'top' }));
    expect(loadFeedParams(USER)).toEqual(DEFAULT_FEED_PARAMS);
  });

  it('yazılan tercih geri okunur', () => {
    const p = params({ university: 'itu.edu.tr', sort: 'popular', kind: 'anonymous' });
    saveFeedParams(USER, p);
    expect(loadFeedParams(USER)).toEqual(p);
  });

  it('tercih kullanıcı başına ayrı', () => {
    saveFeedParams(USER, params({ sort: 'top' }));
    expect(loadFeedParams('user-2')).toEqual(DEFAULT_FEED_PARAMS);
  });

  it('bozuk JSON → varsayılanlar (patlamaz)', () => {
    appPrefs.set(`feedFilters:${USER}`, 'bu json değil');
    expect(loadFeedParams(USER)).toEqual(DEFAULT_FEED_PARAMS);
  });

  it('eski şema sürümü → varsayılanlar', () => {
    appPrefs.set(`feedFilters:${USER}`, JSON.stringify({ v: 0, sort: 'top' }));
    expect(loadFeedParams(USER)).toEqual(DEFAULT_FEED_PARAMS);
  });

  it('BİLİNMEYEN enum değeri varsayılana düşer — sorgu 400 almasın', () => {
    appPrefs.set(
      `feedFilters:${USER}`,
      JSON.stringify({ v: 1, university: null, sort: 'hottest', interest: 'x', kind: 'y' }),
    );
    expect(loadFeedParams(USER)).toEqual(DEFAULT_FEED_PARAMS);
  });

  it('boş string university null\'a çevrilir (UT-7313 üretmesin)', () => {
    appPrefs.set(
      `feedFilters:${USER}`,
      JSON.stringify({ v: 1, university: '', sort: 'new', interest: 'all', kind: 'all' }),
    );
    expect(loadFeedParams(USER).university).toBeNull();
  });
});

describe('sanitizeFeedParams — Plus\'tan düşme', () => {
  it('Plus varken tercih OLDUĞU GİBİ geçer', () => {
    const p = params({ university: 'itu.edu.tr', kind: 'anonymous', sort: 'top' });
    expect(sanitizeFeedParams(p, CAPS_PLUS)).toEqual(p);
  });

  it('Plus yokken university ve kind VARSAYILANA döner', () => {
    const p = params({ university: 'itu.edu.tr', kind: 'anonymous', sort: 'top' });
    expect(sanitizeFeedParams(p, CAPS_FREE)).toEqual(
      params({ university: null, kind: 'all', sort: 'top' }),
    );
  });

  it('sort ve interest Plus gerektirmiyor — süzülmez', () => {
    const p = params({ sort: 'popular', interest: 'mine' });
    const out = sanitizeFeedParams(p, CAPS_FREE);
    expect(out.sort).toBe('popular');
    expect(out.interest).toBe('mine');
  });

  it('iki yetki AYRI süzülür', () => {
    const p = params({ university: 'itu.edu.tr', kind: 'anonymous' });
    const out = sanitizeFeedParams(p, {
      canPickUniversity: true,
      canUseKindFilter: false,
    });
    expect(out.university).toBe('itu.edu.tr');
    expect(out.kind).toBe('all');
  });

  it('⚠️ süzme DİSKE YAZMIYOR — abonelik dönünce tercih geri gelir', () => {
    const p = params({ university: 'itu.edu.tr', kind: 'anonymous' });
    saveFeedParams(USER, p);
    sanitizeFeedParams(loadFeedParams(USER), CAPS_FREE);
    // Disk hâlâ orijinal tercihi taşıyor.
    expect(loadFeedParams(USER)).toEqual(p);
    // Ve Plus geri geldiğinde tercih yine yürürlükte.
    expect(sanitizeFeedParams(loadFeedParams(USER), CAPS_PLUS)).toEqual(p);
  });

  it('⚠️ /me henüz GELMEDİYSE süzme YAPILMIYOR', () => {
    // "Bilinmiyor" ile "hakkı yok" aynı şey değil: o anda sıfırlamak Plus'lı
    // kullanıcının tercihini her açılışta bir kare bozardı.
    const p = params({ university: 'itu.edu.tr', kind: 'anonymous' });
    expect(sanitizeFeedParams(p, undefined)).toEqual(p);
    expect(sanitizeFeedParams(p, null)).toEqual(p);
  });
});

/**
 * ŞEMA GÖÇÜ v1 → v2 (`topic` eklendi) → v3 (`topic` → `topics`, çoklu).
 *
 * Sürüm atlamada VARSAYILANA DÜŞMEK yerine GÖÇÜRÜYORUZ ve test edilen şey bu:
 * kullanıcının kampüs/sıralama tercihi onun kurduğu bir şey, konu alanının
 * şekli değişti diye sıfırlanması kazanılmış bir ayarı kaybettirirdi.
 */
describe('şema göçü — v1/v2 kaydı okunabilir', () => {
  it('v1 kaydının tercihleri KORUNUYOR, topics boş diziye tamamlanıyor', () => {
    appPrefs.set(
      `feedFilters:${USER}`,
      JSON.stringify({
        v: 1,
        university: 'boun.edu.tr',
        sort: 'popular',
        interest: 'mine',
        kind: 'anonymous',
      }),
    );
    expect(loadFeedParams(USER)).toEqual({
      university: 'boun.edu.tr',
      sort: 'popular',
      interest: 'mine',
      kind: 'anonymous',
      topics: [],
    });
  });

  it('bilinmeyen/gelecek sürüm varsayılana düşüyor', () => {
    // O şekli yorumlamaya çalışmak yanlış bir filtre üretip akışı boş
    // gösterebilir — bilmediğimizde varsayılan doğru taraf.
    appPrefs.set(
      `feedFilters:${USER}`,
      JSON.stringify({ v: 99, university: 'x.edu.tr', sort: 'top' }),
    );
    expect(loadFeedParams(USER)).toEqual(DEFAULT_FEED_PARAMS);
  });

  it('v2 → v3: TEK `topic` tek elemanlı diziye göçüyor', () => {
    appPrefs.set(
      `feedFilters:${USER}`,
      JSON.stringify({ ...params(), v: 2, topic: 'Roommate' }),
    );
    expect(loadFeedParams(USER).topics).toEqual(['Roommate']);
  });

  it('v2 → v3: `topic: "all"` BOŞ DİZİ (filtrenin yokluğu)', () => {
    // "all" bir konu değil; diziye konsaydı sunucuya konu parametresi olarak
    // giderdi ve enum çözümlemesi patlardı.
    appPrefs.set(
      `feedFilters:${USER}`,
      JSON.stringify({ ...params(), v: 2, topic: 'all' }),
    );
    expect(loadFeedParams(USER).topics).toEqual([]);
  });

  it('v3 gidiş-dönüş — çoklu seçim korunuyor', () => {
    saveFeedParams(USER, params({ topics: ['Advice', 'Event'] }));
    expect(loadFeedParams(USER).topics).toEqual(['Advice', 'Event']);
  });

  it('TANIMADIĞI konu anahtarını da koruyor', () => {
    // Sunucu yeni bir konu eklediğinde (uygulama sürümü çıkmadan) diskteki
    // tercih geçersiz sayılıp sıfırlanmamalı — istemci konu kümesini
    // DOĞRULAMIYOR, yalnız tipe bakıyor.
    appPrefs.set(
      `feedFilters:${USER}`,
      JSON.stringify({ ...params(), v: 3, topics: ['BrandNewTopic'] }),
    );
    expect(loadFeedParams(USER).topics).toEqual(['BrandNewTopic']);
  });

  it('string olmayan / mükerrer değerler ayıklanıyor, sıra kanonik', () => {
    // Kanoniklik query key'in şartı: ["Event","Advice"] ile tersi aynı listeyi
    // iki kez çekerdi (bkz. feedKeys.posts).
    appPrefs.set(
      `feedFilters:${USER}`,
      JSON.stringify({
        ...params(),
        v: 3,
        topics: ['Event', 42, 'Advice', 'Event', '', 'all'],
      }),
    );
    expect(loadFeedParams(USER).topics).toEqual(['Advice', 'Event']);
  });
});

describe('activeFilterCount — "Filtre" pill rozeti', () => {
  it('varsayılanlarda 0 (pill sayı çizmez)', () => {
    expect(activeFilterCount(DEFAULT_FEED_PARAMS)).toBe(0);
  });

  it('sapan her alan bir sayılır', () => {
    expect(activeFilterCount(params({ sort: 'top' }))).toBe(1);
    expect(activeFilterCount(params({ sort: 'top', interest: 'mine' }))).toBe(2);
    expect(
      activeFilterCount(params({ sort: 'top', interest: 'mine', kind: 'anonymous' })),
    ).toBe(3);
  });

  it('KAÇ konu seçili olursa olsun konu 1 sayılır', () => {
    // Rozet "kaç FİLTRE varsayılandan sapmış" diyor, "kaç konu seçili"
    // demiyor — üç konuda 3 artsaydı yanındaki filtrelerle aynı ölçekte
    // konuşmazdı. Hangi konular seçili bilgisini konu pill'i veriyor.
    expect(activeFilterCount(params({ topics: ['Event'] }))).toBe(1);
    expect(activeFilterCount(params({ topics: ['Event', 'Advice', 'Social'] }))).toBe(1);
  });

  it('university rozete SAYILMAZ — kendi pill\'inde zaten görünüyor', () => {
    expect(activeFilterCount(params({ university: 'itu.edu.tr' }))).toBe(0);
  });
});
