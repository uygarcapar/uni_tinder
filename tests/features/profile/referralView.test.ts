/**
 * Davet kartı ile sheet'inin ORTAK sunum mantığı. İki yüzey de aynı gün
 * sayısını ve aynı ödül adını yazmak zorunda — hesap tek yerde.
 */

import {
  grantDaysRemaining,
  rewardLabel,
  rewardLabelKey,
} from '@/features/profile/referralView';

const iso = (offsetMs: number) => new Date(Date.now() + offsetMs).toISOString();
const DAY = 86_400_000;

describe('grantDaysRemaining', () => {
  it('kalan günü YUKARI yuvarlar', () => {
    // 6 saat kalmışken "0 gün" demek, hakkın bugün hâlâ yürürlükte olduğunu
    // gizlerdi.
    expect(grantDaysRemaining(iso(6 * 3600 * 1000))).toBe(1);
    expect(grantDaysRemaining(iso(DAY + 1000))).toBe(2);
    expect(grantDaysRemaining(iso(29.2 * DAY))).toBe(30);
  });

  it('offset TAŞIMAYAN damgayı UTC sayar (backendDate sözleşmesi)', () => {
    const raw = new Date(Date.now() + 10 * DAY).toISOString().replace('Z', '');
    expect(grantDaysRemaining(raw)).toBe(10);
  });

  it('geçmiş / boş damgada null — satır hiç çizilmesin', () => {
    expect(grantDaysRemaining(iso(-DAY))).toBeNull();
    expect(grantDaysRemaining(null)).toBeNull();
    expect(grantDaysRemaining(undefined)).toBeNull();
    expect(grantDaysRemaining('lorem')).toBeNull();
  });
});

describe('rewardLabelKey', () => {
  it('üç ödül türünü eşler', () => {
    expect(rewardLabelKey('VisibilityFilter')).toBe('referral.reward.visibilityFilter');
    expect(rewardLabelKey('SuperLike')).toBe('referral.reward.superLike');
    expect(rewardLabelKey('Note')).toBe('referral.reward.note');
  });

  it('bilinmeyen türde null — ham enum adı ekrana basılmaz', () => {
    // Backend kademe 4+ ile yeni bir tür eklerse istemci onu çizmiyor.
    expect(rewardLabelKey('MysteryBox')).toBeNull();
  });
});

describe('rewardLabel', () => {
  // i18next yerine anahtar + argümanları geri veren sahte bir `t`.
  const t = (key: string, opts?: Record<string, unknown>) =>
    `${key}:${JSON.stringify(opts)}`;

  it('miktarı `amount` olarak geçiriyor — `count` çoğul çözümlemesini tetiklerdi', () => {
    expect(rewardLabel(t, 'VisibilityFilter', 30)).toBe(
      'referral.reward.visibilityFilter:{"amount":30}',
    );
  });

  it('bilinmeyen türde null', () => {
    expect(rewardLabel(t, 'MysteryBox', 1)).toBeNull();
  });
});
