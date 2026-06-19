/**
 * JWT util — Backend SignalR handshake'inde access_token query'sini kullanır.
 * Token expired ise WS handshake 401 ile düşer; reconnect aynı token'la sonsuz
 * loop'a girer. accessTokenFactory bu modülü kullanarak expiry'yi proaktif
 * görür ve refresh tetikler.
 *
 * Sadece `exp` claim'ini okur — imza doğrulama backend'in işi.
 */

const base64UrlDecode = (str: string): string => {
  let s = str.replace(/-/g, "+").replace(/_/g, "/");
  while (s.length % 4) s += "=";
  if (typeof atob === "function") return atob(s);
  if (typeof globalThis !== "undefined" && typeof (globalThis as any).atob === "function") return (globalThis as any).atob(s);
  throw new Error("base64 decode not available");
};

export const getTokenExpiryMs = (token: string | null | undefined): number | null => {
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

export const isTokenExpiringSoon = (token: string | null | undefined, bufferSec = 30): boolean => {
  const expMs = getTokenExpiryMs(token);
  if (expMs == null) return false;
  return Date.now() >= expMs - bufferSec * 1000;
};
