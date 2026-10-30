/**
 * Mutasyon kuyruğu TURU — reaksiyon/silme emirlerinin AĞA taşınması.
 *
 * Bugüne kadar bu emirler (ChatScreen'in `handlePickReaction`/`handleDelete`
 * yolları) yalnız optimistik uygulanıyordu: ağ çağrısı başarısız olunca
 * GERİ ALINIYORDU — uçakta verilen bir tepki inince kayboluyordu. Task 1
 * (`pending_mutations` tablosu) ve Task 2 (`pendingMutationPolicy.ts`, saf
 * birleştirme/sınıflandırma) bu ayrımın iki yarısı; burası üçüncü yarı: diskten
 * okuyup isteği atan, sonucu diske/REDUX'a yazan taraf.
 *
 * ── "Bir kez" DEĞİL, EN AZ BİR KEZ ───────────────────────────────────────────
 * Eşzamanlı tur koşmaz (`inFlight`), ama bir satırın ağ çağrısı dönüp
 * `deletePendingMutation` çalışmadan ÖNCE süreç ölürse (ya da bookkeeping'in
 * kendisi patlarsa, aşağıdaki per-satır try/catch'e bak) emir bir SONRAKİ
 * turda tekrar gönderilir. Bu TASARIMLA tolere ediliyor: backend reaksiyon/
 * silme uçlarını bunun için idempotent dondurdu (silmede UT-6720 = "zaten
 * silinmiş" = `done`; reaksiyonda sunucu tam listeyi döndüğü için ikinci bir
 * `addReaction` aynı emojiyi tekrar eklemiyor, sadece aynı sonucu bir daha
 * veriyor). Yani kayıp YOK ama mükerrer istek OLABİLİR — kullanıcıya görünen
 * fark yok.
 *
 * ── Satır başına HİÇBİR İÇ BELLEK (no cache) ────────────────────────────────
 * `outbox.ts`'teki `attempts` Map'inin tarihçesi iki ayrı bug üretti: soğuk
 * açılışta disk okunmadan kota ikinci kez düşmesi, sonra `attempts`'in diske
 * inince OTURUM bütçesinin ÖMÜRLÜK bütçeye dönüşmesi (bkz. o dosyanın başındaki
 * not). Bu modül bilerek state TUTMUYOR — her tur `readPendingMutations()` ile
 * baştan okur, `inFlight` dışında hiçbir modül-içi Map/değişken yok. Bu sınıf
 * hatayı TASARIMLA eler, ayrıca önlem almaya gerek yok.
 *
 * ── Geri alma TAM DEĞİL, dosyanın en önemli dürüst notu ─────────────────────
 * Kalıcı ret (`rejected`) sonrası reaksiyonda listeden BENİM emojim çıkarılır,
 * `base` (emrin ilk verildiği andaki sunucu değeri) varsa geri konur. DİĞER
 * kullanıcıların sayıları bu geri almada TAZELENMİYOR — bir sonraki hub
 * event'i ya da geçmiş sayfası düzeltir. Kuyruk bir anlık görüntü (snapshot)
 * tutsaydı o görüntü de aynı sebepten bayat olurdu (başka kullanıcının
 * reaksiyonu emrin verildiği an ile şimdi arasında değişmiş olabilir) —
 * snapshot tutmak bu sorunu ÇÖZMEZ, yalnız gizler.
 *
 * Mesaj Redux'ta YÜKLÜ DEĞİLSE (sohbet kapalı, bucket hiç kurulmamış) geri
 * alma HİÇ dispatch ETMİYOR: `reactionsChanged`'i mirror (`chatMirrorMiddleware`)
 * KOŞULSUZ işliyor (`repo.applyReactions`), yani boş bir listeden türetilen
 * "yeni" liste diskteki TÜM reaksiyonları (başka kullanıcılarınkini de) silerdi
 * — bu, "tazelenmiyor"dan çok daha kötü bir sonuç ("siliniyor"). Aynı sınır
 * silmede de geçerli: geri alma yalnız `deletedAt`/`deletedForEveryone`
 * bayraklarını geri çeker ve bunu da YALNIZ mesaj Redux'ta yüklüyken yapar
 * (eksik alanlarla `saveMessage`'ı — `messageEdited`'in mirror karşılığı —
 * çağırmak `NOT NULL` kolonları boş geçip satırı bozardı).
 *
 * ── Rate limit paylaşımlı ────────────────────────────────────────────────────
 * Reaksiyon/silme uçları `messaging_default` kovasını (`MessagesController`
 * genelinde 200 istek/60 sn, kullanıcı başına) geçmiş sayfalama, `/changes` ve
 * backfill ile PAYLAŞIR. `remainingNow()`/`shouldStopFlush` bunu hesaba katıyor
 * (bkz. pendingMutationPolicy.ts) — burada tekrar türetilmiyor.
 */
import {
  deletePendingMutation,
  pruneOrphanPendingMutations,
  readMessageSendState,
  readPendingMutations,
  upsertPendingMutation,
} from "@/features/chat/chatRepository";
import type { MutationKind, PendingMutationRow } from "@/features/chat/db/rows";
import {
  classifyMutationError,
  coalesceDelete,
  coalesceReaction,
  nextEligibleAt,
  shouldStopFlush,
  type DeletePayload,
  type MutationOutcome,
  type ReactionPayload,
} from "@/features/chat/pendingMutationPolicy";
import chatService from "@/features/chat/chatService";
import { messageEdited, reactionsChanged } from "@/features/chat/chatSlice";
import { chatErrorText } from "@/shared/constants/responseCodes";
import i18n from "@/shared/i18n";
import { isOfflineNow } from "@/shared/services/networkStatus";
import { CHAT_MUTATION_QUEUE_ENABLED } from "@/shared/store/chatFlags";
import { remainingNow } from "@/shared/services/rateLimitBudget";
import { showInfoToast } from "@/shared/services/toaster";
import { store } from "@/shared/store";
import { devLog } from "@/shared/utils/devLog";
import type { MessageDto, MessageReactionDto } from "@/shared/types";

const dispatch = (action: any) => (store.dispatch as any)(action);

function myUserId(): string | undefined {
  const auth: any = (store.getState() as any)?.auth;
  return auth?.user?.userId || auth?.user?.id;
}

function findMessage(conversationId: string, messageId: string): MessageDto | null {
  const messages = (store.getState() as any)?.chat?.messagesByConv?.[conversationId]?.messages;
  if (!Array.isArray(messages)) return null;
  return messages.find((m: any) => m?.id === messageId) ?? null;
}

function findExistingRow(messageId: string, kind: MutationKind): PendingMutationRow | null {
  return (
    readPendingMutations().find((r) => r.message_id === messageId && r.kind === kind) ?? null
  );
}

/**
 * Yeni bir reaksiyon niyetini kuyruğa yazar. `attempts`/`next_eligible_at_ms`
 * SIFIRLANIR (yeni niyet eski backoff'u miras almaz), `first_seen_at_ms`
 * mevcut satırdan korunur — yoksa kullanıcı art arda emoji değiştirdikçe
 * emir hep "yeni" sayılır ve asla yaşlanmaz.
 */
export function enqueueReaction(args: {
  messageId: string;
  conversationId: string;
  desired: string | null;
  serverBase: string | null;
}): void {
  const existingRow = findExistingRow(args.messageId, "reaction");
  const existing: ReactionPayload | null = existingRow
    ? JSON.parse(existingRow.payload_json)
    : null;
  const payload = coalesceReaction(existing, args.desired, args.serverBase);
  upsertPendingMutation({
    message_id: args.messageId,
    kind: "reaction",
    conversation_id: args.conversationId,
    payload_json: JSON.stringify(payload),
    attempts: 0,
    first_seen_at_ms: existingRow ? existingRow.first_seen_at_ms : Date.now(),
    next_eligible_at_ms: 0,
    last_error: null,
  });
}

/** Aynı kuraldan: yeni silme niyeti backoff'u miras almaz, yaşı korur. */
export function enqueueDelete(args: {
  messageId: string;
  conversationId: string;
  forEveryone: boolean;
}): void {
  const existingRow = findExistingRow(args.messageId, "delete");
  const existing: DeletePayload | null = existingRow
    ? JSON.parse(existingRow.payload_json)
    : null;
  const payload = coalesceDelete(existing, args.forEveryone);
  upsertPendingMutation({
    message_id: args.messageId,
    kind: "delete",
    conversation_id: args.conversationId,
    payload_json: JSON.stringify(payload),
    attempts: 0,
    first_seen_at_ms: existingRow ? existingRow.first_seen_at_ms : Date.now(),
    next_eligible_at_ms: 0,
    last_error: null,
  });
}

/**
 * Kalıcı ret sonrası reaksiyonu geri alır: listeden BENİM emojim çıkarılır,
 * `base` varsa yerine geri konur.
 *
 * Mesaj Redux'ta YÜKLÜ DEĞİLSE (`findMessage` null) HİÇBİR ŞEY dispatch
 * ETMEZ — bkz. dosya başı not. Boş bir `prev`den türetilmiş bir liste
 * mirror'da `repo.applyReactions` ile KOŞULSUZ yazılır ve diskteki TÜM
 * reaksiyonları (başkalarınınkini de) silerdi.
 */
function revertReaction(row: PendingMutationRow, payload: ReactionPayload): void {
  const current = findMessage(row.conversation_id, row.message_id);
  if (!current) return;

  const uid = myUserId();
  const prev: MessageReactionDto[] = Array.isArray(current.reactions) ? current.reactions : [];

  const stripped = prev
    .map((r) =>
      uid && Array.isArray(r.userIds) && r.userIds.includes(uid)
        ? {
            ...r,
            count: Math.max(0, (r.count || 1) - 1),
            userIds: r.userIds.filter((id: string) => id !== uid),
          }
        : r,
    )
    .filter((r) => (r.count || 0) > 0);

  let next = stripped;
  if (payload.base) {
    const existing = stripped.find((r) => r.emoji === payload.base);
    next = existing
      ? stripped.map((r) =>
          r.emoji === payload.base
            ? { ...r, count: (r.count || 0) + 1, userIds: [...(r.userIds || []), ...(uid ? [uid] : [])] }
            : r,
        )
      : [...stripped, { emoji: payload.base, count: 1, userIds: uid ? [uid] : [] }];
  }

  dispatch(
    reactionsChanged({
      messageId: row.message_id,
      conversationId: row.conversation_id,
      reactions: next,
    }),
  );
}

/**
 * Kalıcı ret sonrası silmeyi geri alır. Yalnız bayraklar geri çekilir —
 * orijinal `content` bu satırda hiç saklanmadığı için GERİ GETİRİLEMEZ.
 *
 * Mesaj Redux'ta YÜKLÜ DEĞİLSE dispatch ETMEZ: mirror `chat/messageEdited`'i
 * `repo.saveMessage` (TÜM kolonların upsert'i) ile işliyor — eksik alanlarla
 * (örn. `sentAt` NOT NULL) çağırmak satırı bozardı. `current` DOLUYSA onu
 * olduğu gibi spread edip yalnız iki bayrağı eziyoruz — eksik alan yok.
 */
function revertDelete(row: PendingMutationRow): void {
  const current = findMessage(row.conversation_id, row.message_id);
  if (!current) return;
  dispatch(
    messageEdited({
      ...current,
      deletedAt: null,
      deletedForEveryone: false,
    } as MessageDto),
  );
}

/** Tek satırı ağa taşır. `done` dışındaki dönüşler YALNIZ throw ile gelir. */
async function sendRow(row: PendingMutationRow, payload: ReactionPayload | DeletePayload): Promise<void> {
  if (row.kind === "reaction") {
    const p = payload as ReactionPayload;
    let serverReactions: MessageReactionDto[] | undefined;
    // Sıra önemli: `base` hâlâ sunucuda dururken `desired` eklenirse backend
    // kullanıcı başına tek reaksiyon kuralını delmiş olur (bkz. ChatScreen'in
    // aynı sırayı koruyan `handlePickReaction`'ı).
    if (p.base && p.base !== p.desired) {
      serverReactions = await chatService.removeReaction(row.message_id, p.base);
    }
    if (p.desired) {
      serverReactions = await chatService.addReaction(row.message_id, p.desired);
    }
    // Sunucu tam listeyi dönüyor → kanonikleştir. Hiç çağrı yapılmadıysa
    // (desired ve base ikisi de null — enqueue'nin normalde üretmediği, ama
    // savunmacı) bu dal atlanır, satır aşağıda yine `done` sayılır.
    if (Array.isArray(serverReactions)) {
      dispatch(
        reactionsChanged({
          messageId: row.message_id,
          conversationId: row.conversation_id,
          reactions: serverReactions,
        }),
      );
    }
  } else {
    const p = payload as DeletePayload;
    await chatService.deleteMessage(row.message_id, p.forEveryone);
  }
}

export interface FlushResult {
  ran: boolean;
  done: number;
  retried: number;
  rejected: number;
}

async function run(): Promise<FlushResult> {
  const result: FlushResult = { ran: true, done: 0, retried: 0, rejected: 0 };

  // Tur başında BİR kez: mesajı artık var olmayan satırlar (örn. retention
  // tarafından budanmış arşiv) sonsuza dek "gönderilmemiş" sayılıp diskte
  // yığılmasın.
  try {
    pruneOrphanPendingMutations();
  } catch (e) {
    // SQL hatası turu kilitlemez — satırlar bir sonraki turda temizlenir.
    // Diğer swallow'larla aynı davranış (bkz. chatMirrorMiddleware.ts), ama
    // ARTIK SESSİZ DEĞİL: kalıcı bir SQL arızası burada iz bırakmalı.
    devLog("⚠️ [pendingMutations] yetim satır budaması başarısız", e);
  }

  let opsDone = 0;
  for (const row of readPendingMutations()) {
    // ÖNCE bütçe kontrolü, SONRA satıra bakılır (bkz. chatBackfill.ts'teki
    // aynı sıra gerekçesi): kota zaten rezervin altındaysa bu turun hiçbir
    // isteği atılmamalı, kalan satırlar diskte kalıp bir sonraki turu bekler.
    if (shouldStopFlush(remainingNow(), opsDone)) break;

    // 1) optimistik kimlik sunucuda yok — satır KALIR, mesaj gönderilince
    // sıradaki tur onu alır. Bu artık SAVUNMACI değil: mesaj hâlâ `pending`ken
    // (temp id) reaksiyon/silme verilebiliyor (MessageActionSheet'te gönderim
    // durumu gate'i yok) — ack geldiğinde `upsertMessage` bu satırı REKEY eder
    // (bkz. chatRepository.ts), yani bu satır eninde sonunda `sent` id'siyle
    // tekrar görünür.
    if (readMessageSendState(row.message_id) !== "sent") continue;
    // 2) backoff dolmadı.
    if (row.next_eligible_at_ms > Date.now()) continue;

    opsDone += 1;

    let payload: ReactionPayload | DeletePayload | null = null;
    let parseError: unknown = null;
    try {
      payload = JSON.parse(row.payload_json);
    } catch (e) {
      parseError = e;
    }

    let outcome: MutationOutcome;
    let err: unknown = null;
    if (parseError) {
      // Bozuk payload KALICI bir hata: `classifyMutationError` kodsuz bir
      // hatada 'retry' döner, yani bu satır her turda AYNI parse hatasıyla
      // sonsuza dek denenirdi (zehir hap). Pratikte yalnız bu modülün kendi
      // `JSON.stringify` çıktısı buraya yazılır, yani ulaşılması GÜÇ — ama
      // ulaşırsa 'retry' yanlış kaderdir.
      err = parseError;
      outcome = "rejected";
    } else {
      try {
        await sendRow(row, payload as ReactionPayload | DeletePayload);
        outcome = "done";
      } catch (e) {
        err = e;
        outcome = classifyMutationError(e, row.kind);
      }
    }

    try {
      if (outcome === "done") {
        deletePendingMutation(row.message_id, row.kind);
        result.done += 1;
      } else if (outcome === "retry") {
        const attempts = row.attempts + 1;
        upsertPendingMutation({
          ...row,
          attempts,
          next_eligible_at_ms: nextEligibleAt(attempts, Date.now()),
          last_error: err instanceof Error ? err.message : String(err),
        });
        result.retried += 1;
      } else {
        // rejected: satır AYNI ANDA silinir (kalıcı ret burada "tekrar dene"
        // hâli DEĞİL) + geri alma + toast. Geri alma yalnız payload
        // başarıyla parse edildiyse VE (reaksiyonda) mesaj yüklüyse çalışır —
        // bkz. revertReaction/revertDelete'in kendi no-op kapıları.
        deletePendingMutation(row.message_id, row.kind);
        if (row.kind === "reaction" && payload) {
          revertReaction(row, payload as ReactionPayload);
        } else if (row.kind === "delete") {
          revertDelete(row);
        }
        showInfoToast({
          message: chatErrorText(
            err,
            (k: string) => i18n.t(k) as string,
            row.kind === "reaction" ? "errors.generic" : "chat.deleteMessage.error",
          ),
          variant: "error",
        });
        result.rejected += 1;
      }
    } catch (bookkeepingErr) {
      // Bu satırın disk/redux muhasebesi patladı ama ağ isteği çoğu zaman
      // ZATEN gitmişti (idempotent uçlar — bkz. dosya başı "en az bir kez"
      // notu). TUR burada çökmez: sıradaki satıra geçilir, bu satır bir
      // sonraki turda (durumuna göre) yeniden ele alınır.
      devLog(
        "⚠️ [pendingMutations] satır sonucu yazılamadı",
        row.message_id,
        row.kind,
        bookkeepingErr,
      );
    }
  }

  return result;
}

let inFlight: Promise<FlushResult> | null = null;

/**
 * Mutasyon kuyruğu turunu koşturur. Tek-uçuş: aynı anda iki tur koşmaz —
 * `chatBackfill.runBackfillRound`'ın `inFlight` kalıbının aynısı.
 */
export async function flushPendingMutations(trigger: string): Promise<FlushResult> {
  // Kill-switch. AppNavigator.tsx'teki üç tetik (online/reconnect/foreground)
  // bu fonksiyonu KOŞULSUZ çağırır — bayrağa onlar bakmıyor. Bugün ağ
  // tarafını kapalı tutan şey bu satır DEĞİL, ChatScreen'in çağrı noktası
  // kapısı (Task 4): bayrak kapalıyken kuyruğa hiç satır YAZILMIYOR, yani
  // üç tetik her tetiklendiğinde boş bir kuyruğu tur'a sokuyor — atılacak
  // istek zaten yok. Bu satır o yüzden TEKRARLI: bugünkü boşluğu DEĞİL,
  // ileride ChatScreen'in kapısından geçmeyen bir enqueue yolu (ya da
  // bayrağa bakmayı unutan başka bir çağıran) eklenirse diye buradaki ağ
  // tarafını kapalı tutar (bkz. chatBackfill.ts'teki `runBackfillRound`
  // kapısı, aynı gerekçe). Satır KORUNUR — kapatmak veri kaybettirmez.
  if (!CHAT_MUTATION_QUEUE_ENABLED) {
    return { ran: false, done: 0, retried: 0, rejected: 0 };
  }
  if (isOfflineNow()) {
    return { ran: false, done: 0, retried: 0, rejected: 0 };
  }
  if (inFlight) return inFlight;
  inFlight = run().finally(() => {
    inFlight = null;
  });
  const result = await inFlight;
  if (result.done || result.retried || result.rejected) {
    devLog(
      `🔁 [pendingMutations] ${trigger}: done=${result.done} retried=${result.retried} rejected=${result.rejected}`,
    );
  }
  return result;
}

/** Yalnız test içindir. */
export function __resetPendingMutationsForTests(): void {
  inFlight = null;
}
