/**
 * 24 SAATLİK ÖMÜR — geri sayım metni ve "hâlâ yayında mı" kararı.
 *
 * İkisi AYNI kaynaktan türüyor ve bu bilinçli: rozetin "süre bitti" dediği an
 * kart listeden de düşmeli. Ayrı hesaplasalardı kart "birazdan" yazıp ekranda
 * kalırdı.
 *
 * `now` parametre olduğu için saat enjekte edilebiliyor — `Date.now()`
 * içeride okunsaydı bu dosya yazılamazdı.
 */

import {
  campusCountdownText,
  isMomentLive,
} from '@/features/campus/campusCountdown';

/** i18n yerine ham anahtar + sayı döndüren sahte çevirici. */
const t = (key: string, options?: Record<string, unknown>) =>
  options && 'count' in options ? `${key}:${options.count}` : key;

const NOW = Date.parse('2026-10-21T12:00:00Z');
const inMinutes = (m: number) =>
  new Date(NOW + m * 60_000).toISOString();

describe('campusCountdownText', () => {
  it('saat cinsinden yazıyor', () => {
    expect(campusCountdownText(inMinutes(18 * 60), NOW, t)).toBe(
      'campus.expiresInHours:18',
    );
  });

  it('1 saatin altında DAKİKA — "0 sa" demiyor', () => {
    expect(campusCountdownText(inMinutes(41), NOW, t)).toBe(
      'campus.expiresInMinutes:41',
    );
  });

  it('1 dakikanın altında "birazdan"', () => {
    expect(campusCountdownText(inMinutes(0.5), NOW, t)).toBe(
      'campus.expiresSoon',
    );
  });

  it('süresi dolmuşsa rozet HİÇ çizilmiyor', () => {
    expect(campusCountdownText(inMinutes(-1), NOW, t)).toBeNull();
  });

  it('çözülemeyen tarihte rozet yok — uydurma süre yazılmıyor', () => {
    expect(campusCountdownText('bozuk', NOW, t)).toBeNull();
    expect(campusCountdownText(null, NOW, t)).toBeNull();
  });

  it('tam sınırda (expiresAt === now) rozet yok', () => {
    expect(campusCountdownText(new Date(NOW).toISOString(), NOW, t)).toBeNull();
  });
});

describe('isMomentLive', () => {
  it('gelecekteki bitiş yayında', () => {
    expect(isMomentLive(inMinutes(1), NOW)).toBe(true);
  });

  it('geçmişteki bitiş düşüyor', () => {
    expect(isMomentLive(inMinutes(-1), NOW)).toBe(false);
  });

  it('tam sınır düşüyor — rozetle aynı taraf', () => {
    expect(isMomentLive(new Date(NOW).toISOString(), NOW)).toBe(false);
    expect(campusCountdownText(new Date(NOW).toISOString(), NOW, t)).toBeNull();
  });

  it('çözülemeyen tarih YAYINDA sayılıyor', () => {
    // Sunucu zaten süresi dolanı döndürmüyor; bozuk bir tarih yüzünden sağlam
    // bir anı gizlemek, fazladan bir an göstermekten kötü.
    expect(isMomentLive('bozuk', NOW)).toBe(true);
    expect(isMomentLive(undefined, NOW)).toBe(true);
  });
});

