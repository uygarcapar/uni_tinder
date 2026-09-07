/**
 * Ön kayıt (waitlist) premium hediyesi kullanıcıya YALNIZCA token claim'inden
 * duyurulabiliyor: register cevabının `UserDto`sunda premium alanı yok ve
 * realtime event bilerek bastırılmış. Bu dosya claim okumanın iki tuzağını
 * kilitliyor — ikisi de sessizce YANLIŞ premium kararı üretiyordu.
 */
import { readPremiumClaims, getTokenExpiryMs } from '@/shared/utils/jwt';

// İmza doğrulanmıyor (backend'in işi) → üçüncü parça sabit dolgu olabilir.
const tokenWith = (payload: Record<string, unknown>): string => {
  const b64 = Buffer.from(JSON.stringify(payload), 'utf8')
    .toString('base64')
    .replace(/\+/g, '-')
    .replace(/\//g, '_')
    .replace(/=+$/, '');
  return `header.${b64}.signature`;
};

describe('readPremiumClaims', () => {
  it('reads the premium grant that register-and-complete just applied', () => {
    expect(
      readPremiumClaims(
        tokenWith({ IsPremium: 'True', PremiumExpiresAt: '2026-10-07T09:15:00.0000000Z' }),
      ),
    ).toEqual({ isPremium: true, expiresAt: '2026-10-07T09:15:00.0000000Z' });
  });

  it('treats the string "False" as false — .NET bool.ToString(), not a boolean', () => {
    // Ham `Boolean(payload.IsPremium)` burada TRUE döner: boş olmayan string.
    // Hediyesi olmayan her yeni kullanıcıya premium alert'i gösterirdi.
    expect(readPremiumClaims(tokenWith({ IsPremium: 'False' })).isPremium).toBe(false);
  });

  it('maps the empty PremiumExpiresAt claim to null', () => {
    // Backend tarih yoksa BOŞ STRING basıyor; `new Date("")` → Invalid Date.
    expect(
      readPremiumClaims(tokenWith({ IsPremium: 'True', PremiumExpiresAt: '' })),
    ).toEqual({ isPremium: true, expiresAt: null });
  });

  it('stays quiet on a missing or malformed token', () => {
    const none = { isPremium: false, expiresAt: null };
    expect(readPremiumClaims(null)).toEqual(none);
    expect(readPremiumClaims('not-a-jwt')).toEqual(none);
    expect(readPremiumClaims('header.@@not-base64@@.signature')).toEqual(none);
    expect(readPremiumClaims(tokenWith({}))).toEqual(none);
  });
});

describe('getTokenExpiryMs', () => {
  it('converts the numeric exp claim to milliseconds', () => {
    expect(getTokenExpiryMs(tokenWith({ exp: 1790000000 }))).toBe(1790000000000);
  });

  it('returns null when exp is absent or not a number', () => {
    expect(getTokenExpiryMs(tokenWith({ exp: '1790000000' }))).toBeNull();
    expect(getTokenExpiryMs(tokenWith({}))).toBeNull();
    expect(getTokenExpiryMs(undefined)).toBeNull();
  });
});
