/**
 * Mutasyon kuyruğu TURU — reaksiyon/silme emirlerinin AĞA bir kez taşınması.
 *
 * Bugüne kadar bu emirler (ChatScreen'in `handlePickReaction`/`handleDelete`
 * yolları) yalnız optimistik uygulanıyordu: ağ çağrısı başarısız olunca
 * GERİ ALINIYORDU — uçakta verilen bir tepki inince kayboluyordu. Task 1
 * (`pending_mutations` tablosu) ve Task 2 (`pendingMutationPolicy.ts`, saf
 * birleştirme/sınıflandırma) bu ayrımın iki yarısı; burası üçüncü yarı: diskten
 * okuyup isteği atan, sonucu diske/REDUX'a yazan taraf.
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
 * snapshot tutmak bu sorunu ÇÖZMEZ, yalnız gizler. Silmede de aynı sınır
 * geçerli: geri alma yalnız `deletedAt`/`deletedForEveryone` bayraklarını
 * geri çeker, orijinal `content`'i GERİ GETİRMEZ (bu satırda hiç saklanmadı).
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
import { remainingNow } from "@/shared/services/rateLimitBudget";
import { showInfoToast } from "@/shared/services/toaster";
import { store } from "@/shared/store";
import { devLog } from "@/shared/utils/devLog";

const dispatch = (action: any) => (store.dispatch as any)(action);

function myUserId(): string | undefined {
  const auth: any = (store.getState() as any)?.auth;
  return auth?.user?.userId || auth?.user?.id;
}

function findMessage(conversationId: string, messageId: string): any | null {
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
 * `base` varsa yerine geri konur. Bkz. dosya başı not — DİĞER kullanıcıların
 * sayıları burada tazelenmiyor, bu TAM bir geri alma değil.
 */
function revertReaction(row: PendingMutationRow, payload: ReactionPayload): void {
  const uid = myUserId();
  const current = findMessage(row.conversation_id, row.message_id);
  const prev: any[] = Array.isArray(current?.reactions) ? current.reactions : [];

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
 * orijinal `content` bu satırda hiç saklanmadığı için GERİ GETİRİLEMEZ (bkz.
 * dosya başı not).
 */
function revertDelete(row: PendingMutationRow): void {
  dispatch(
    messageEdited({
      id: row.message_id,
      conversationId: row.conversation_id,
      deletedAt: null,
      deletedForEveryone: false,
    } as any),
  );
}

/** Tek satırı ağa taşır. `done` dışındaki dönüşler YALNIZ throw ile gelir. */
async function sendRow(row: PendingMutationRow): Promise<void> {
  if (row.kind === "reaction") {
    const payload: ReactionPayload = JSON.parse(row.payload_json);
    let serverReactions: any;
    // Sıra önemli: `base` hâlâ sunucuda dururken `desired` eklenirse backend
    // kullanıcı başına tek reaksiyon kuralını delmiş olur (bkz. ChatScreen'in
    // aynı sırayı koruyan `handlePickReaction`'ı).
    if (payload.base && payload.base !== payload.desired) {
      serverReactions = await chatService.removeReaction(row.message_id, payload.base);
    }
    if (payload.desired) {
      serverReactions = await chatService.addReaction(row.message_id, payload.desired);
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
    const payload: DeletePayload = JSON.parse(row.payload_json);
    await chatService.deleteMessage(row.message_id, payload.forEveryone);
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
  } catch {
    // SQL hatası turu kilitlemez — satırlar bir sonraki turda temizlenir.
  }

  let opsDone = 0;
  for (const row of readPendingMutations()) {
    // ÖNCE bütçe kontrolü, SONRA satıra bakılır (bkz. chatBackfill.ts'teki
    // aynı sıra gerekçesi): kota zaten rezervin altındaysa bu turun hiçbir
    // isteği atılmamalı, kalan satırlar diskte kalıp bir sonraki turu bekler.
    if (shouldStopFlush(remainingNow(), opsDone)) break;

    // 1) optimistik kimlik sunucuda yok — satır KALIR, mesaj gönderilince
    // sıradaki tur onu alır.
    if (readMessageSendState(row.message_id) !== "sent") continue;
    // 2) backoff dolmadı.
    if (row.next_eligible_at_ms > Date.now()) continue;

    opsDone += 1;
    let outcome: MutationOutcome;
    let err: unknown = null;
    try {
      await sendRow(row);
      outcome = "done";
    } catch (e) {
      err = e;
      outcome = classifyMutationError(e, row.kind);
    }

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
      // hâli DEĞİL) + geri alma + toast.
      deletePendingMutation(row.message_id, row.kind);
      if (row.kind === "reaction") {
        revertReaction(row, JSON.parse(row.payload_json));
      } else {
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
  }

  return result;
}

let inFlight: Promise<FlushResult> | null = null;

/**
 * Mutasyon kuyruğu turunu koşturur. Tek-uçuş: aynı anda iki tur koşmaz —
 * `chatBackfill.runBackfillRound`'ın `inFlight` kalıbının aynısı.
 */
export async function flushPendingMutations(trigger: string): Promise<FlushResult> {
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
