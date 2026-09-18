import { normalizeUtcFields } from '@/shared/utils/dateUtc';
import { contentTypeToNumber } from '@/features/chat/contentType';
import type { MessageDto } from '@/shared/types';

/**
 * Mesajın TEK yazım kapısı. Bir MessageDto'nun store'a, SQLite'a ya da ekrana
 * girdiği her yol buradan geçer: REST sonuçları, SignalR payload'ları ve
 * ChatScreen'in optimistic balonları.
 *
 * Bugün iki iş yapıyor:
 *  1. normalizeUtcFields — Z'siz damgalar (bkz. shared/utils/dateUtc.ts)
 *  2. contentType → SAYI (bkz. ./contentType.ts)
 *
 * ── REFERANS KORUMA (bu dosyanın en önemli özelliği) ────────────────────────
 * Hiçbir şey değişmediyse GİRDİ REFERANSI aynen döner. Bu şart değil, ZORUNLU:
 * bu fonksiyon her hub event'inde ve her reconcile'da her mesaj için çalışıyor.
 * Her çağrıda yeni nesne üretseydi messageContentEqual'ın `a === b` kısa devresi
 * ölür, LegendList her satırı yapısal değişim sayar ve ChatMessageList'teki
 * commit-storm riski geri gelirdi. normalizeUtcFields aynı sözleşmeyi taşıyor;
 * buradaki kopyalama da yalnız gerçekten değişen alanlar için yapılıyor.
 *
 * reactions/replyTo KASTEN dokunulmadan geçiyor: runtime'da zaten doğru şekilde
 * geliyorlar (gruplu reaction, gömülü replyTo bloğu) ve hiç görülmemiş bir şekli
 * "düzeltmeye" çalışmak varsayıma dayalı kod olurdu. Şekilleri tipte
 * belgelendi (MessageReactionDto / ReplyPreviewDto).
 */
export function normalizeMessage<T extends Partial<MessageDto>>(
  raw: T,
  conversationId?: string,
): T {
  const utc = normalizeUtcFields(raw);

  const contentType = contentTypeToNumber(utc.contentType);
  const contentTypeChanged = utc.contentType !== contentType;

  // Hub payload'larının bazıları conversationId'yi mesajın DIŞINDA taşıyor
  // (event argümanı olarak). Bucket'a yazılacak nesnede içeride olmak zorunda.
  const needsConversationId = !utc.conversationId && !!conversationId;

  if (!contentTypeChanged && !needsConversationId) return utc;

  const out: T = { ...utc };
  if (contentTypeChanged) out.contentType = contentType;
  if (needsConversationId) out.conversationId = conversationId;
  return out;
}

/** Liste hâli — hiçbir eleman değişmediyse GİRDİ DİZİSİ aynen döner. */
export function normalizeMessages<T extends Partial<MessageDto>>(
  raws: T[],
  conversationId?: string,
): T[] {
  let changed = false;
  const out = raws.map((raw) => {
    const next = normalizeMessage(raw, conversationId);
    if (next !== raw) changed = true;
    return next;
  });
  return changed ? out : raws;
}
