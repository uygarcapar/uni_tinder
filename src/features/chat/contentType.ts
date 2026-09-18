import type { MessageDto } from '@/shared/types';

/**
 * MessageContentType: 0 Text, 1 Image, 2 Voice, 3 Video, 99 System.
 *
 * Backend enum'u sayı ya da isim ("Voice") olarak yollayabiliyor. Tek biçime
 * (SAYI) burada iniyor ve TEK yazım kapısından (normalizeMessage) geçiyor.
 *
 * ── Neden bu bir referans-kararlılık meselesi ───────────────────────────────
 * messageEquality.messageContentEqual `a.contentType === b.contentType` diyor.
 * Optimistic sesli balon sayıyla (2) doğuyor, sunucunun echo'su "Voice" ile
 * geliyor → her reconcile'da eşitsiz çıkıp balonun kimliğini çeviriyor, yani
 * LegendList o satırı yapısal değişim sayıyor. Yazımda normalize edilince
 * kaybolan bir maliyet.
 */
export const ContentType = {
  Text: 0,
  Image: 1,
  Voice: 2,
  Video: 3,
  System: 99,
} as const;

const CONTENT_TYPE_BY_NAME: Record<string, number> = {
  text: ContentType.Text,
  image: ContentType.Image,
  voice: ContentType.Voice,
  video: ContentType.Video,
  system: ContentType.System,
};

export function contentTypeToNumber(contentType: MessageDto['contentType']): number {
  if (typeof contentType === 'number') return contentType;
  if (typeof contentType === 'string') {
    const asNumber = Number(contentType);
    if (Number.isFinite(asNumber)) return asNumber;
    return CONTENT_TYPE_BY_NAME[contentType.toLowerCase()] ?? ContentType.Text;
  }
  return ContentType.Text;
}
