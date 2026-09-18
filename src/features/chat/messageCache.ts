import { rowToMessage, type MessageRow } from '@/features/chat/db/rows';
import {
  messageContentEqual,
  messageIdentityEqual,
  reactionsEqual,
} from '@/features/chat/messageEquality';
import type { MessageDto, ReplyPreviewDto } from '@/shared/types';

/**
 * SQLite satırları → LegendList'in güvenebileceği KARARLI JS nesneleri.
 *
 * Bu dosya bu göçün 1 numaralı riski. ChatMessageList `recycleItems` +
 * `itemsAreEqual` ile çalışıyor ve oradaki yorumlar geçmişte yaşanmış bir Fabric
 * `ShadowTree::commit` SIGABRT'sini (commit storm) anlatıyor. Satırları her
 * okumada yeni nesnelere çevirirsek reconcile'ın en yaygın sonucu — "hiçbir şey
 * değişmedi" — tüm listeyi yapısal değişim gibi gösterir.
 *
 * Çözüm klasik identity map: id → daha önce üretilmiş nesne, artı satırın
 * `row_version`'ı. Sürüm aynıysa nesne aynen döner; TEK bir alan bile
 * karşılaştırılmaz.
 *
 * ── Sürüm neden AYRI map'te ─────────────────────────────────────────────────
 * Nesnenin üstünde gizli bir alan olarak taşımak cazip ama yanlış: projekte
 * değer saf POJO kalmalı. Üstüne iliştirilen her şey messageContentEqual'a,
 * JSON.stringify'a, Redux'ın serializableCheck'ine ve LegendList'in
 * comparator'ına sızar.
 */

type ConvCache = {
  objects: Map<string, MessageDto>;
  versions: Map<string, number>;
  window: MessageDto[] | null;
};

const caches = new Map<string, ConvCache>();

function cacheFor(conversationId: string): ConvCache {
  let cache = caches.get(conversationId);
  if (!cache) {
    cache = { objects: new Map(), versions: new Map(), window: null };
    caches.set(conversationId, cache);
  }
  return cache;
}

function replyPreviewEqual(
  a: ReplyPreviewDto | null | undefined,
  b: ReplyPreviewDto | null | undefined,
) {
  if (a === b) return true;
  if (!a || !b) return false;
  return (
    a.id === b.id &&
    a.senderId === b.senderId &&
    a.senderDisplayName === b.senderDisplayName &&
    a.contentPreview === b.contentPreview &&
    a.contentType === b.contentType &&
    (a.durationMs ?? null) === (b.durationMs ?? null) &&
    !!a.isDeleted === !!b.isDeleted
  );
}

/** __DEV__ tripwire sayaçları — bkz. projectWindow. */
let churnCount = 0;

export function projectRow(conversationId: string, row: MessageRow): MessageDto {
  const { objects, versions } = cacheFor(conversationId);
  const prev = objects.get(row.id);

  // HIZLI YOL: sürüm değişmemiş → nesne birebir aynı. Bu tasarımdaki en değerli
  // satır; hiçbir şeyi değiştirmeyen bir reconcile'ı N map lookup'a ve SIFIR
  // allocation'a indiriyor. Karşılığında TEK bir kural var: her
  // `UPDATE messages` `row_version = row_version + 1` yazmak ZORUNDA.
  if (prev !== undefined && versions.get(row.id) === row.row_version) return prev;

  const next = rowToMessage(row);

  if (prev) {
    // İç referansları geri tak: comparator'lar (ve MessageBubble'ın memo'su)
    // bunlarda `===` kısa devresi yapabilsin. Yeni diziler eşit İÇERİKLE de
    // olsa reaction çipi satırını yeniden çizdirirdi.
    if (reactionsEqual(prev.reactions, next.reactions)) next.reactions = prev.reactions;
    if (replyPreviewEqual(prev.replyTo, next.replyTo)) next.replyTo = prev.replyTo;

    // SAVUNMACI: sürüm artmış ama gözlenebilir hiçbir şey değişmemiş olabilir
    // (ör. yalnız bir receipt kolonu dokunulmuş ve o alan zaten eşit). Nesneyi
    // yenilemenin bir faydası yok, zararı var.
    if (messageContentEqual(prev, next) && messageIdentityEqual(prev, next)) {
      versions.set(row.id, row.row_version);
      return prev;
    }
    churnCount++;
  }

  objects.set(row.id, next);
  versions.set(row.id, row.row_version);
  return next;
}

/**
 * Satırları projekte eder ama PENCERE dizisi kimliğine DOKUNMAZ.
 *
 * Yukarı kaydırmada gelen eski sayfa için bu gerekiyor: satır nesneleri aynı
 * sohbetin identity map'ini paylaşmalı (yoksa aynı mesaj iki ayrı nesne olur),
 * ama o sayfa "son döndürülen pencere" değil — projectWindow'un dizi
 * önbelleğini onunla ezmek, bir sonraki gerçek hydrate'i sahte bir değişiklik
 * gibi gösterirdi.
 */
export function projectRows(conversationId: string, rows: MessageRow[]): MessageDto[] {
  return rows.map((row) => projectRow(conversationId, row));
}

/**
 * Satır penceresi → mesaj dizisi. Hiçbir eleman değişmediyse ÖNCEKİ DİZİ
 * referansı döner.
 *
 * Dizi kimliği eleman kimliği kadar önemli: ChatScreen'in
 * `messagesWithSeparators` useMemo'su `messages` referansına bağlı. Dizi
 * tazelenirse useMemo yeniden çalışır, gün ayraçları yeniden yaratılır ve
 * LegendList — elemanlar aynı olsa bile — uyanır. (chatSlice.ts:749-751 aynı
 * korumayı Redux tarafında yapıyor.)
 */
export function projectWindow(conversationId: string, rows: MessageRow[]): MessageDto[] {
  const cache = cacheFor(conversationId);
  const before = churnCount;

  const next = projectRows(conversationId, rows);

  const prev = cache.window;
  if (prev && prev.length === next.length && next.every((m, i) => m === prev[i])) {
    return prev;
  }

  if (__DEV__ && prev) {
    const churned = churnCount - before;
    // "İçerik değişmedi" diyen bir reconcile bir avuçtan fazla referans
    // çeviriyorsa referans kararlılığı sızdırıyor demektir — commit storm'un
    // habercisi. Jest'te ulaşılamayan tek şey bu, en ucuz erken uyarı burası.
    if (churned > 5 && next.length === prev.length) {
      console.warn(
        `[messageCache] ${conversationId}: ${churned}/${next.length} mesaj kimlik değiştirdi ` +
          '— bir UPDATE gereksiz row_version bump\'ı yapıyor olabilir.',
      );
    }
  }

  cache.window = next;
  return next;
}

/**
 * Optimistic satırın id'si server ack'iyle `temp-<cmid>` → server id'ye dönüyor.
 * Identity map o nesneyi ESKİ anahtarla tutuyor; taşınmazsa aynı mantıksal mesaj
 * için iki ayrı nesne oluşur ve temp kaydı sızar.
 *
 * Liste anahtarı etkilenmiyor: keyExtractor `clientMessageId || id` diyor
 * (ChatScreen.tsx:214), yani cmid taşıyan bir satırda anahtar zaten sabit.
 */
export function rekey(conversationId: string, oldId: string, newId: string): void {
  const { objects, versions } = cacheFor(conversationId);
  const object = objects.get(oldId);
  objects.delete(oldId);
  versions.delete(oldId);
  if (object === undefined) return;
  // Nesne TAŞINIR ama sürümü TAŞINMAZ. Nesnenin içindeki `id` hâlâ eski
  // (`temp-…`) ve hızlı yol onu olduğu gibi döndürürdü — ekranda ölü bir id.
  // Sürümü düşürünce sonraki projeksiyon mecburen yeniden kuruyor; `prev` yine
  // bulunabildiği için reactions/replyTo referans geri-takması kaybolmuyor.
  objects.set(newId, object);
}

/** Sohbet sıcak pencereden düşerken — JS heap'i sınırlı tutar. */
export function clearConversation(conversationId: string): void {
  caches.delete(conversationId);
}

/**
 * Logout. `chatRepository.destroy()` ile BİRLİKTE çağrılmak zorunda: DB dosyası
 * silinse bile projekte nesneler burada durur ve bir sonraki kullanıcının
 * ekranına önceki kullanıcının mesajlarını verebilir.
 */
export function clear(): void {
  caches.clear();
  churnCount = 0;
}
