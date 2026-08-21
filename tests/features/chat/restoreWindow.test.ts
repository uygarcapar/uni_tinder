import {
  canRestore,
  formatRestoreWindow,
  shouldOfferRestore,
} from '@/features/chat/restoreWindow';

/**
 * Geri alma penceresi SUNUCU damgasından çözülür — pencere uzunluğu backend
 * config'inde olduğu için istemci "24 saat" varsaymaz. null damga = pencere yok
 * (rematch limiti dolmuş / engellenmiş / hiç mesajlaşılmamış).
 */

const NOW = Date.parse('2026-08-15T12:00:00Z');
const t = (key: string, opts?: Record<string, unknown>) =>
  `${key}:${JSON.stringify(opts ?? {})}`;

describe('canRestore', () => {
  it('gelecekteki damgada true', () => {
    expect(canRestore('2026-08-16T12:00:00Z', NOW)).toBe(true);
  });

  it('null / undefined damgada false (buton gösterilmez)', () => {
    expect(canRestore(null, NOW)).toBe(false);
    expect(canRestore(undefined, NOW)).toBe(false);
  });

  it('geçmiş damgada false', () => {
    expect(canRestore('2026-08-15T11:59:00Z', NOW)).toBe(false);
  });

  it('geçersiz damgada false', () => {
    expect(canRestore('bozuk', NOW)).toBe(false);
  });

  it('Z\'siz damgayı UTC sayar (backend Z eklemeyebiliyor)', () => {
    // Yerel saat sayılsaydı TR'de (UTC+3) 3 saat geri kayıp pencere kapalı görünürdü.
    expect(canRestore('2026-08-15T13:00:00', NOW)).toBe(true);
  });
});

describe('shouldOfferRestore', () => {
  it('damga hiç yoksa (bilinmiyor) butonu gizlemez', () => {
    // Sohbet listesi DTO\'su alanı taşımayabiliyor; canlı bir pencereyi cold
    // start'ta gizlemektense denemeyi sunuyoruz.
    expect(shouldOfferRestore(undefined, NOW)).toBe(true);
  });

  it('null damgada (pencere KESİN yok) gizler', () => {
    expect(shouldOfferRestore(null, NOW)).toBe(false);
  });

  it('dolu damgada pencereye bakar', () => {
    expect(shouldOfferRestore('2026-08-16T12:00:00Z', NOW)).toBe(true);
    expect(shouldOfferRestore('2026-08-15T11:00:00Z', NOW)).toBe(false);
  });
});

describe('formatRestoreWindow', () => {
  it('bir saatten uzun pencereyi saat olarak yazar', () => {
    expect(formatRestoreWindow('2026-08-16T11:30:00Z', t, NOW)).toBe(
      'chat.unmatch.windowHours:{"h":23}',
    );
  });

  it('saati AŞAĞI yuvarlar — vaat edilenden erken kapanmasın', () => {
    expect(formatRestoreWindow('2026-08-15T14:59:00Z', t, NOW)).toBe(
      'chat.unmatch.windowHours:{"h":2}',
    );
  });

  it('bir saatin altında dakikaya iner', () => {
    expect(formatRestoreWindow('2026-08-15T12:45:00Z', t, NOW)).toBe(
      'chat.unmatch.windowMinutes:{"m":45}',
    );
  });

  it('son dakikada 0 değil 1 dakika yazar', () => {
    expect(formatRestoreWindow('2026-08-15T12:00:30Z', t, NOW)).toBe(
      'chat.unmatch.windowMinutes:{"m":1}',
    );
  });

  it('pencere yoksa null döner (çağıran "kalıcı kapandı" metnine düşer)', () => {
    expect(formatRestoreWindow(null, t, NOW)).toBeNull();
    expect(formatRestoreWindow('2026-08-15T11:00:00Z', t, NOW)).toBeNull();
  });
});
