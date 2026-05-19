/**
 * JWT util — Backend SignalR handshake'inde access_token query'sini kullanır.
 * Token expired ise WS handshake 401 ile düşer; reconnect aynı token'la sonsuz
 * loop'a girer. accessTokenFactory bu modülü kullanarak expiry'yi proaktif
 * görür ve refresh tetikler.
 *
 * Sadece `exp` claim'ini okur — imza doğrulama backend'in işi.
 */

const base64UrlDecode = (str) => {
  // base64url → base64
  let s = str.replace(/-/g, "+").replace(/_/g, "/");
  // Pad with '=' to multiple of 4
  while (s.length % 4) s += "=";
  // Hermes / modern RN'de atob mevcut. Fallback: global.atob veya Buffer.
  if (typeof atob === "function") return atob(s);
  if (typeof global !== "undefined" && typeof global.atob === "function") return global.atob(s);
  // Last resort: throw — caller try/catch'le yutar.
  throw new Error("base64 decode not available");
};

/**
 * JWT exp claim'ini ms epoch olarak döner. Decode hatasında null.
 */
export const getTokenExpiryMs = (token) => {
  if (!token || typeof token !== "string") return null;
  const parts = token.split(".");
  if (parts.length !== 3) return null;
  try {
    const payloadJson = base64UrlDecode(parts[1]);
    const payload = JSON.parse(payloadJson);
    if (typeof payload?.exp !== "number") return null;
    return payload.exp * 1000;
  } catch {
    return null;
  }
};

/**
 * Token expired veya `bufferSec` saniye içinde expire olacaksa true.
 * Decode başarısızsa false (token'ı kullan, backend 401 verirse interceptor refresh'e gider).
 */
export const isTokenExpiringSoon = (token, bufferSec = 30) => {
  const expMs = getTokenExpiryMs(token);
  if (expMs == null) return false;
  return Date.now() >= expMs - bufferSec * 1000;
};
