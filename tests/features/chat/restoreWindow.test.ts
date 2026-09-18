import {
  canRestore,
  formatRestoreWindow,
  resolveClosedByMe,
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
  it('sohbeti KARŞI taraf kapattıysa damgaya bakmadan gizler', () => {
    // Ürün kuralı: geri alma yalnız eşleşmeyi kaldırana açık. Karşı taraf
    // sohbete girip 3 noktaya bastığında "Geri Al" HİÇ çıkmaz.
    expect(shouldOfferRestore(undefined, false, NOW)).toBe(false);
    expect(shouldOfferRestore('2026-08-16T12:00:00Z', false, NOW)).toBe(false);
  });

  it('kapatan bizsek damga hiç yoksa (bilinmiyor) butonu gizlemez', () => {
    // Sohbet listesi DTO\'su alanı taşımayabiliyor; canlı bir pencereyi cold
    // start'ta gizlemektense denemeyi sunuyoruz.
    expect(shouldOfferRestore(undefined, true, NOW)).toBe(true);
  });

  it('kapatan bizsek null damgada (pencere KESİN yok) gizler', () => {
    expect(shouldOfferRestore(null, true, NOW)).toBe(false);
  });

  it('kapatan bizsek dolu damgada pencereye bakar', () => {
    expect(shouldOfferRestore('2026-08-16T12:00:00Z', true, NOW)).toBe(true);
    expect(shouldOfferRestore('2026-08-15T11:00:00Z', true, NOW)).toBe(false);
  });

  it('kapatan bilinmiyorsa yalnız CANLI damga varsa gösterir', () => {
    // Bayraktan önce yazılmış cache / unmatch başka cihazdan. Dolu damga ancak
    // kendi unmatch yanıtımızdan gelebildiği için "biz kapattık"ın delilidir;
    // damga yoksa buton karşı tarafa sızacağı için gösterilmez.
    expect(shouldOfferRestore('2026-08-16T12:00:00Z', undefined, NOW)).toBe(true);
    expect(shouldOfferRestore(undefined, undefined, NOW)).toBe(false);
    expect(shouldOfferRestore(null, undefined, NOW)).toBe(false);
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

/**
 * "Kapatan biz miyiz" bilgisinin SUNUCUYA devri.
 *
 * Devir kademeli olmak zorunda: uç her ortamda yayında değil ve gate'i doğrudan
 * `closedByMe`ye bağlamak, sunucu susarken "Geri Al"ı herkesten gizlerdi.
 */
describe('resolveClosedByMe — kademeli devir', () => {
  it('sunucu söylüyorsa SUNUCU kazanır', () => {
    expect(resolveClosedByMe({ closedByMe: true, deactivatedByMe: false })).toBe(true);
    expect(resolveClosedByMe({ closedByMe: false, deactivatedByMe: true })).toBe(false);
  });

  it('sunucu SUSUYORSA eski yerel tahmine düşer', () => {
    expect(resolveClosedByMe({ deactivatedByMe: true })).toBe(true);
    expect(resolveClosedByMe({ deactivatedByMe: false })).toBe(false);
  });

  it('closedByMe:false yerel tahmine DÜŞMEZ — anlamlı bir cevap', () => {
    // `||` kullansaydık false burada yerel true'ya düşer ve karşı tarafın
    // kapattığı bir sohbette "Geri Al" görünürdü.
    expect(resolveClosedByMe({ closedByMe: false, deactivatedByMe: true })).toBe(false);
  });

  it('ikisi de yoksa BİLİNMİYOR kalır — false DEĞİL', () => {
    // undefined'i false'a çevirmek canlı bir pencereyi gizlerdi.
    expect(resolveClosedByMe({})).toBeUndefined();
    expect(resolveClosedByMe(undefined)).toBeUndefined();
    expect(resolveClosedByMe(null)).toBeUndefined();
  });
});

describe('devir sonrası kapı davranışı', () => {
  const NOW_ = Date.parse('2026-08-16T12:00:00Z');
  const LIVE = '2026-08-17T12:00:00Z';

  it('sunucu "karşı taraf kapattı" derse buton YOK — canlı pencere olsa bile', () => {
    const conv = { closedByMe: false, deactivatedByMe: true, restorableUntil: LIVE };
    expect(shouldOfferRestore(conv.restorableUntil, resolveClosedByMe(conv), NOW_)).toBe(false);
  });

  it('sunucu "biz kapattık" derse canlı pencerede buton VAR', () => {
    const conv = { closedByMe: true, restorableUntil: LIVE };
    expect(shouldOfferRestore(conv.restorableUntil, resolveClosedByMe(conv), NOW_)).toBe(true);
  });

  it('sunucu susuyorsa ESKİ davranış birebir korunuyor', () => {
    const legacy = { deactivatedByMe: true, restorableUntil: LIVE };
    expect(shouldOfferRestore(legacy.restorableUntil, resolveClosedByMe(legacy), NOW_)).toBe(
      shouldOfferRestore(LIVE, true, NOW_),
    );
  });
});
