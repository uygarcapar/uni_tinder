/**
 * Ürün adının MODA GÖRE metne girmesi — "Fire" (Flört) / "Spark" (Arkadaş).
 *
 * NEDEN TEST: Beğeniler ekranındaki altı metin tek bir ad kaynağını
 * (`discover.mode.fireName.<mode>`) `{{fire}}` ile enterpole ediyor. Biri
 * düz metne geri dönerse hata SESSİZ: Arkadaş modunda yeşil bir kartın
 * üstünde "Sana Fire gönderdi" yazar, kimse derlemede göremez.
 *
 * TR'de çoğul eki metnin İÇİNDE (`{{fire}}'lar`) — iki ad için de aynı yazım,
 * yani ikinci bir anahtar çiftine gerek yok. Bu testin ikinci işi o yazımın
 * korunduğunu doğrulamak.
 */

import tr from '@/shared/i18n/translations/tr';
import en from '@/shared/i18n/translations/en';
import { modeFireNameKey } from '@/features/discover/modeTheme';

/** "a.b.c" yolunu sözlükte çöz. */
const at = (dict: unknown, path: string): string =>
  path.split('.').reduce<any>((acc, k) => acc?.[k], dict);

// `{{fire}}` taşıyan ve ekranın mod-farkındalı çizdiği anahtarlar.
const INTERPOLATED = [
  'likes.tabFire',
  'likes.headerFire',
  'likes.descFire',
  'likes.firePill',
  'likes.emptyFire',
  'likes.emptyFireSubtitle',
  'likes.infoDescription',
  // Canlı beğeni toast'ı — adı OLAYIN modundan alıyor (IncomingLike.mode).
  'likeToast.fire',
  'likeToast.fireNoName',
];

describe('mod-farkındalı ürün adı', () => {
  it('ad anahtarı iki dilde de Fire/Spark veriyor', () => {
    for (const dict of [tr, en]) {
      expect(at(dict, modeFireNameKey('Dating'))).toBe('Fire');
      expect(at(dict, modeFireNameKey('Friends'))).toBe('Spark');
    }
  });

  it('mod-farkındalı metinler adı GÖMMÜYOR, {{fire}} ile alıyor', () => {
    for (const [lang, dict] of [['tr', tr], ['en', en]] as const) {
      for (const key of INTERPOLATED) {
        const value = at(dict, key);
        expect(typeof value).toBe('string');
        expect(`${lang} ${key}: ${value}`).toContain('{{fire}}');
        // Gömülü ad kalıntısı: "Fire" sözcüğü artık bu cümlelerde geçmemeli.
        expect(value).not.toMatch(/\bFire\b/);
      }
    }
  });

  it('TR çoğul eki metnin içinde — ad değişince yazım bozulmuyor', () => {
    expect(at(tr, 'likes.tabFire')).toBe("{{fire}}'lar");
    expect(at(tr, 'likes.headerFire')).toBe("{{fire}}'lar");
    expect(at(en, 'likes.tabFire')).toBe('{{fire}}s');
  });

  it('satın alma metinleri BİLEREK dating-markalı kalıyor', () => {
    // Plan kararı: paketler global, modal dating-markalı. Buraya {{fire}}
    // eklenirse "Spark Satın Al" gibi sunucuda karşılığı olmayan bir ürün adı
    // çıkar (wire adı superlike).
    expect(at(tr, 'firePurchase.title')).not.toContain('{{fire}}');
    expect(at(en, 'firePurchase.title')).not.toContain('{{fire}}');
  });
});
