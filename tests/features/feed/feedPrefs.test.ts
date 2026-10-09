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

  it('university rozete SAYILMAZ — kendi pill\'inde zaten görünüyor', () => {
    expect(activeFilterCount(params({ university: 'itu.edu.tr' }))).toBe(0);
  });
});
