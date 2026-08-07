/**
 * Sunucu HTML hata sayfası döndürdüğünde (IIS / ASP.NET Core 500.x, nginx 502,
 * Cloudflare) hata mesajı tüm sayfa kaynağını taşır — konsola ~80 satır CSS
 * dökülür ve gerçek log'lar kaybolur. Bu yardımcı böyle mesajları tek satıra
 * indirir: hata başlığı + status kodu.
 *
 * HTML olmayan mesajlar aynen döner.
 */
const HTML_RE = /<!doctype html|<html[\s>]/i;

export const shortNetError = (err: unknown): string => {
  const raw =
    typeof err === 'string' ? err : ((err as any)?.message ?? String(err ?? ''));
  if (!HTML_RE.test(raw)) return raw;

  // HTML'den önceki kısım genelde SignalR'ın "Failed to complete negotiation
  // with the server: Error:" gibi anlamlı ön ekidir — korunur.
  const prefix = raw.split(HTML_RE)[0].trim().replace(/[:\s]+$/, '');
  const title =
    raw.match(/<title>\s*([^<]+?)\s*<\/title>/i)?.[1] ??
    raw.match(/<h1>\s*([^<]+?)\s*<\/h1>/i)?.[1];
  const status =
    raw.match(/Status code '(\d{3})'/i)?.[1] ??
    raw.match(/HTTP Error (\d{3}(?:\.\d+)?)/i)?.[1];

  return [
    prefix || 'Sunucu HTML hata sayfası döndürdü',
    title && `→ ${title}`,
    status && `(status ${status})`,
  ]
    .filter(Boolean)
    .join(' ');
};
