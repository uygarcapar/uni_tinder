import { createTransform } from 'redux-persist';

// Diske yazılan chat cache'inin sınırları. Cache "son durum fotoğrafı"dır,
// arşiv değil — server her zaman authoritative (açılışta reconcile fetch var).
const MAX_PERSISTED_CONVS = 15;
const MAX_MESSAGES_PER_BUCKET = 30;

/**
 * Chat slice persist transform'u.
 *
 * in (serialize, state→disk):
 *  - messagesByConv: yalnız top-N conversation'ın bucket'ları (conversations
 *    sırasına göre — en aktif sohbetler). Her bucket newest-first ilk 30 mesaja
 *    cap'lenir; optimistic artıklar (_pending/_failed/temp- id) ATILIR,
 *    _selfUserId strip edilir. Cap yapıldıysa nextCursor NULL'lanır — cap'li
 *    listeyle eski cursor sayfalama boşluğu yaratır; açılıştaki reconcile fetch
 *    taze cursor getirir (hasMore:true niyeti korur).
 *  - conversations: partnerIsOnline:false zorlanır — presence realtime veridir,
 *    restart'a taşınırsa herkes sahte "online" görünür.
 *
 * out (rehydrate, disk→state): şema-defensive defaults — eski/bozuk cache
 * güvenli bucket'a normalize edilir (version bump'ta migrate=drop zaten var).
 */
export const chatCacheTransform = createTransform(
  (subState: any, key: string | number, fullState: any) => {
    if (key === 'messagesByConv') {
      const topIds = new Set(
        (fullState?.conversations ?? [])
          .slice(0, MAX_PERSISTED_CONVS)
          .map((c: any) => c.conversationId),
      );
      const out: Record<string, any> = {};
      for (const [convId, bucket] of Object.entries<any>(subState ?? {})) {
        if (!topIds.has(convId)) continue;
        const all = bucket?.messages ?? [];
        const kept = all
          .filter(
            (m: any) =>
              !m._pending && !m._failed && !String(m.id ?? '').startsWith('temp-'),
          )
          .slice(0, MAX_MESSAGES_PER_BUCKET) // newest-first → en yeni 30
          .map(({ _pending, _failed, _selfUserId, ...m }: any) => m);
        const capped = kept.length < all.length;
        out[convId] = {
          messages: kept,
          nextCursor: capped ? null : bucket?.nextCursor ?? null,
          hasMore: capped ? true : !!bucket?.hasMore,
          loading: false,
        };
      }
      return out;
    }
    if (key === 'conversations') {
      return (subState ?? []).map((c: any) => ({ ...c, partnerIsOnline: false }));
    }
    return subState; // unreadTotal
  },
  (subState: any, key: string | number) => {
    if (key === 'messagesByConv') {
      const out: Record<string, any> = {};
      for (const [convId, b] of Object.entries<any>(subState ?? {})) {
        out[convId] = {
          messages: Array.isArray(b?.messages) ? b.messages : [],
          nextCursor: b?.nextCursor ?? null,
          hasMore: !!b?.hasMore,
          loading: false,
        };
      }
      return out;
    }
    if (key === 'conversations') {
      return Array.isArray(subState) ? subState : [];
    }
    return subState;
  },
  { whitelist: ['messagesByConv', 'conversations', 'unreadTotal'] },
);
