import tr from '@/shared/i18n/translations/tr';
import en from '@/shared/i18n/translations/en';
import { CAMPUS_CODES, campusCodeI18nKey } from '@/features/campus/campusCodes';

/**
 * KAMPÜS METİNLERİ DOĞRU NAMESPACE'TE Mİ.
 *
 * Bu dosya bir kazadan doğdu: `campus` bloğu `tr.ts`e eklenirken yanlışlıkla
 * **`feed` namespace'inin içine** düştü (anahtar `university: { title: 'Kampüs
 * seç' }` satırına çapalanmıştı ve o, feed'in alt anahtarı). Gerçek yol
 * `feed.campus.stripTitle` oldu; bileşenler `campus.stripTitle` çağırıyordu.
 *
 * i18next bulamadığı anahtarda FIRLATMIYOR, anahtarın kendisini basıyor —
 * yani ekranda "campus.empty.title", "campus.quotaRemaining" yazıyordu.
 * tsc de jest de yeşildi; hatayı yalnız cihazda gören oldu.
 *
 * Buradaki testler o sınıfı kapatıyor: her anahtar KÖK seviyede, iki dilde ve
 * kodun gerçekten çağırdığı yolla aranıyor.
 */

/** `t()` gibi nokta yolunu çözer — bulunamazsa `undefined`. */
function resolve(dict: any, path: string): unknown {
  return path.split('.').reduce((node, key) => node?.[key], dict);
}

/** Bileşenlerin ÇAĞIRDIĞI yolların tamamı (elle, çağrı yerleriyle eş). */
const USED_KEYS = [
  'campus.title',
  'campus.headerTitleOne',
  'campus.headerTitleOther',
  'campus.momentCountOne',
  'campus.momentCountOther',
  'campus.openHint',
  'campus.shareHint',
  'campus.like',
  'campus.pass',
  'campus.remove',
  'campus.mine',
  'campus.underReview',
  'campus.expiresInHours',
  'campus.expiresInMinutes',
  'campus.expiresSoon',
  'campus.empty.title',
  'campus.empty.bodyInside',
  'campus.empty.bodyOutside',
  'campus.empty.cta',
  'campus.composer.title',
  'campus.composer.hint',
  'campus.composer.share',
  'campus.permission.title',
  'campus.permission.body',
  'campus.permission.allow',
  'campus.permission.later',
  'campus.permission.openSettings',
  'campus.permission.deniedBody',
  'campus.codes.generic',
  'settings.campusAlerts.title',
  'settings.campusAlerts.subtitle',
  'feed.map.expandHint',
];

describe('kampüs i18n yolları', () => {
  it.each(USED_KEYS)('%s — iki dilde de ÇÖZÜLÜYOR', (key) => {
    const trValue = resolve(tr, key);
    const enValue = resolve(en, key);
    expect(typeof trValue).toBe('string');
    expect(typeof enValue).toBe('string');
    expect(trValue).not.toBe('');
    expect(enValue).not.toBe('');
  });

  it('campus bloğu KÖK seviyede — feed içinde DEĞİL', () => {
    expect((tr as any).campus).toBeTruthy();
    expect((en as any).campus).toBeTruthy();
    // Kazanın ta kendisi: feed.campus diye bir şey OLMAMALI.
    expect((tr as any).feed?.campus).toBeUndefined();
    expect((en as any).feed?.campus).toBeUndefined();
  });

  it('her UT-74xx kodunun metni var', () => {
    for (const code of Object.values(CAMPUS_CODES)) {
      const key = campusCodeI18nKey(code);
      expect(key).toBeTruthy();
      expect(typeof resolve(tr, key as string)).toBe('string');
      expect(typeof resolve(en, key as string)).toBe('string');
    }
  });
});
