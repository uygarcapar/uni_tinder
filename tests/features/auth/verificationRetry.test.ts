/**
 * `retryAfterSeconds` sözleşmesinin FE tarafı: alan geldiğinde geri sayım ondan
 * başlar, gelmediğinde `undefined` dönüp çağıran kendi varsayılanına düşer —
 * yani alanı göndermeyen bir backend ile de kayıt akışı bozulmaz.
 */

import { parseRetryAfterSeconds } from '@/features/auth/verificationRetry';

describe('parseRetryAfterSeconds', () => {
  it('result içindeki değeri okur', () => {
    expect(parseRetryAfterSeconds({ result: { status: 'CODE_PENDING', retryAfterSeconds: 42 } })).toBe(42);
  });

  it('kök seviyedeki değeri de okur', () => {
    expect(parseRetryAfterSeconds({ retryAfterSeconds: 30 })).toBe(30);
  });

  it('string gelen değeri sayıya çevirir', () => {
    expect(parseRetryAfterSeconds({ result: { retryAfterSeconds: '45' } })).toBe(45);
  });

  it('ondalık değeri yukarı yuvarlar — buton erken açılmasın', () => {
    expect(parseRetryAfterSeconds({ result: { retryAfterSeconds: 12.3 } })).toBe(13);
  });

  it('alan yoksa undefined döner', () => {
    expect(parseRetryAfterSeconds({ result: { status: 'CODE_SENT' } })).toBeUndefined();
    expect(parseRetryAfterSeconds({})).toBeUndefined();
    expect(parseRetryAfterSeconds(null)).toBeUndefined();
  });

  it('anlamsız değerleri yok sayar', () => {
    expect(parseRetryAfterSeconds({ retryAfterSeconds: 0 })).toBeUndefined();
    expect(parseRetryAfterSeconds({ retryAfterSeconds: -5 })).toBeUndefined();
    expect(parseRetryAfterSeconds({ retryAfterSeconds: 'soon' })).toBeUndefined();
    expect(parseRetryAfterSeconds({ retryAfterSeconds: null })).toBeUndefined();
  });
});
