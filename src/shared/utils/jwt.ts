/**
 * JWT util — Backend SignalR handshake'inde access_token query'sini kullanır.
 * Token expired ise WS handshake 401 ile düşer; reconnect aynı token'la sonsuz
 * loop'a girer. accessTokenFactory bu modülü kullanarak expiry'yi proaktif
 * görür ve refresh tetikler.
 *
 * İmza DOĞRULANMIYOR — o backend'in işi. Buradan okunan claim'ler yalnızca
 * "sunucu bize ne söyledi"yi UI'a taşımak için; yetki kararı vermek için değil.
 */

const base64UrlDecode = (str: string): string => {
  let s = str.replace(/-/g, "+").replace(/_/g, "/");
  while (s.length % 4) s += "=";
  if (typeof atob === "function") return atob(s);
  if (typeof globalThis !== "undefined" && typeof (globalThis as any).atob === "function") return (globalThis as any).atob(s);
  throw new Error("base64 decode not available");
};

/** Payload objesi; token bozuk/eksikse `null`. Ayrıştırma hatası YUTULUR. */
const readPayload = (token: string | null | undefined): Record<string, any> | null => {
  if (!token || typeof token !== "string") return null;
  const parts = token.split(".");
  if (parts.length !== 3) return null;
  try {
    return JSON.parse(base64UrlDecode(parts[1]));
  } catch {
    return null;
  }
};

export const getTokenExpiryMs = (token: string | null | undefined): number | null => {
  const payload = readPayload(token);
  if (typeof payload?.exp !== "number") return null;
  return payload.exp * 1000;
};

export type TokenPremiumClaims = {
  isPremium: boolean;
  /** Ham ISO damgası; claim boşsa `null` (biçimlendirme çağıranda). */
  expiresAt: string | null;
};

/**
 * Token'daki premium claim'leri.
 *
 * NEDEN VAR: ön kayıt (waitlist) premium sözü register isteğinin İÇİNDE
 * uygulanıyor, ama kullanıcının o anda bunu öğrenebileceği başka yer yok —
 * cevabın `UserDto`sunda premium alanı hiç yok ve realtime event BİLEREK
 * bastırılmış (kullanıcı kayıt akışında, hub'a henüz bağlanmadı). Token ise
 * grant'ten SONRA üretiliyor, yani claim'ler taze.
 *
 * İKİ TUZAK — ikisi de backend'in claim yazma biçiminden:
 *   • `IsPremium` bir STRING ("True"/"False", .NET `bool.ToString()`).
 *     Doğrudan boolean'a çevrilirse "False" da truthy olur.
 *   • `PremiumExpiresAt` tarih yoksa BOŞ STRING; `new Date("")` → Invalid Date.
 * (bkz. backend JwtTokenGenerator.BuildIdentityClaims)
 */
export const readPremiumClaims = (
  token: string | null | undefined,
): TokenPremiumClaims => {
  const payload = readPayload(token);
  const raw = payload?.IsPremium;
  const isPremium =
    raw === true || (typeof raw === "string" && raw.toLowerCase() === "true");
  const expiresAt =
    typeof payload?.PremiumExpiresAt === "string" && payload.PremiumExpiresAt
      ? payload.PremiumExpiresAt
      : null;
  return { isPremium, expiresAt };
};

export const isTokenExpiringSoon = (token: string | null | undefined, bufferSec = 30): boolean => {
  const expMs = getTokenExpiryMs(token);
  if (expMs == null) return false;
  return Date.now() >= expMs - bufferSec * 1000;
};
