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
  // Kota toast'ları + çekme ipuçları (Discover/Feed, FirePullHint).
  'discover.swipe.fireCooldownTitle',
  'discover.swipe.firePullHint',
  'discover.swipe.fireReleaseHint',
  'discover.swipe.fireExhaustedTitle',
  'discover.swipe.fireExhaustedMessage',
  // Paywall karşılaştırma tablosu + info sheet'i.
  'discover.premium.benefits.fire',
  'discover.premium.benefitDetails.fire',
  // Davet ödülü ve profil mağaza kartı.
  'referral.reward.fire',
  'profile.fireCard.title',
  // Paket sheet'inin metinleri (FirePurchaseModal i18nParams ile geçiriyor).
  'firePurchase.title',
  'firePurchase.description',
  'firePurchase.packLabel',
  'firePurchase.successTitle',
  'firePurchase.successMessage',
  'firePurchase.pendingMessage',
  'firePurchase.disclaimer',
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

  it('satın alma metinleri de moda göre ad alıyor (2026-11-04 kararı)', () => {
    // ESKİ karar tersine döndü: modal artık MOD-MARKALI — Arkadaş modunda
    // "Spark Satın Al". Consumable wire'da hâlâ TEK (superlike); moda dönen
    // yalnız GÖRÜNEN ad (FirePurchaseModal i18nParams ile geçiriyor).
    expect(at(tr, 'firePurchase.title')).toContain('{{fire}}');
    expect(at(en, 'firePurchase.title')).toContain('{{fire}}');
  });

});
