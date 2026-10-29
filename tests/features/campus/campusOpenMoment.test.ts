import { resolveOpenMoment } from '@/features/campus/campusQueries';
import type { CampusMomentDto } from '@/features/campus/campusTypes';

/**
 * BÜYÜK KARTIN KAPANMASI — ayrı bir effect DEĞİL, türetmenin sonucu.
 *
 * Ekran yalnız açık anın KİMLİĞİNİ tutuyor; gösterilen an her render canlı
 * listeden çözülüyor. An düşerse (süresi doldu / UT-7424 ile silindi) çözüm
 * `null` oluyor ve yüzey kapanıyor. "Kapanmayı unutmak" diye bir dal yok.
 */

const m = (id: string): CampusMomentDto =>
  ({ id, userId: 'u', displayName: 'Ada', age: 21, photoUrl: 'x',
     createdAt: '', expiresAt: '', mode: 'Dating', isMine: false }) as CampusMomentDto;

it('açık kimlik listede varsa o anı veriyor', () => {
  expect(resolveOpenMoment([m('1'), m('2')], '2')?.id).toBe('2');
});

it('an listeden DÜŞERSE null — yüzey kendiliğinden kapanıyor', () => {
  expect(resolveOpenMoment([m('2')], '1')).toBeNull();
});

it('açık kimlik yoksa null', () => {
  expect(resolveOpenMoment([m('1')], null)).toBeNull();
});
