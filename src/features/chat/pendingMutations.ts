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
 * `deletePendingMutationIfPayload` çalışmadan ÖNCE süreç ölürse (ya da bookkeeping'in
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
 * `base`in geri konması KOŞULLU: emir iki çağrılıysa (`base !== desired`) ve
 * `removeReaction(base)` BAŞARMIŞ, ardından `addReaction(desired)` KALICI
 * reddedilmişse `base` sunucuda ARTIK YOK — onu geri koymak yerel duruma
 * sunucunun bilmediği bir reaksiyonu yazardı. O yüzden tur hangi çağrının
 * geçtiğini izliyor (`sendRow`'un `progress.baseRemoved`'ı) ve bu hâlde
 * `base`i boş geçerek yalnız BENİM payımı siliyor.
 *
 * Aynı defterin (`SendProgress`) ikinci işi BAŞARI tarafında: emir uygulanıp
 * satır bekleme penceresinde yeni bir niyetle değiştiyse hayatta kalan
 * satırın `base`i sunucunun yeni hâline çekilir (`rebaseSupersededReactionBase`)
 * — yoksa sıradaki tur "kaldır"ı atlar ve eskisi hâlâ sunucudayken yenisini
 * ekler.
 *
 * O defter TUR KAPSAMLI ve bu, üstünden geçilmiş YARIM BAŞARIDA bir boşluk
 * bırakıyor (KAPSAM DIŞI): `removeReaction(base)` geçip `addReaction(desired)`
 * ağ hatasına düşerse sonuç 'retry' (ya da kalıcı ret) olur ve o dallar
 * `rebaseSupersededReactionBase`'i ÇAĞIRMAZ — satır tam o pencerede yeni bir
 * niyetle değişmişse hayatta kalan satırın `base`i sunucuda ARTIK OLMAYAN bir
 * emojiyi gösterir. Sıradaki tur o yüzden zaten silinmiş bir reaksiyon için
 * `removeReaction` atar; backend reaksiyon/silme uçlarını bu faz için
 * idempotent DONDURDUĞU için bu bir no-op, bedeli paylaşımlı kovadan BİR
 * boşa istek (hata kataloğunda "reaksiyon bulunamadı" diye bir kod da yok —
 * bkz. responseCodes.ts'teki UT-673x ailesi, yalnız BAD_EMOJI ve ON_SYSTEM).
 * Bilerek KAPATILMADI: kapatmak "sunucu benim adıma ne tutuyor"u TURLAR ARASI
 * kalıcı tutmak demek ve o, bu fazın kapsamından büyük bir tasarım (aynı
 * gerekçeyle `baseRemoved`'ın turlar arası hâli de kapsam dışı bırakıldı).
 * Sessiz bir NİYET KAYBI DEĞİL: o istek bir gün kalıcı olarak reddedilse bile
 * kullanıcı geri almayı ve sebebini söyleyen toast'ı görür.
 *
 * ── Bekleme penceresinde sunucu listesi mükerrer yazabilir (KAPSAM DIŞI) ────
 * Bir satır backoff'ta beklerken (en çok 5 dk) hub/delta yolu AYNI mesaj için
 * sunucunun kanonik reaksiyon listesini KOŞULSUZ dispatch ediyor
 * (AppNavigator'daki `ReactionsChanged` işleyicisi) ve ayna onu diske
 * yazıyor — yani başka bir kullanıcının aynı mesaja tepkisi, benim henüz
 * uygulanmamış optimistik emojimi ekrandan ve diskten SİLİYOR; bir sonraki
 * deneme başarınca geri geliyor. Sonuç NİHAYETİNDE TUTARLI, veri kaybı yok;
 * düzeltmesi sunucu listesini yerel niyetle harmanlamak demek ve o, bu fazın
 * kapsamından büyük bir tasarım. Bilinçli olarak AÇIK BIRAKILDI — yeniden
 * "bug" olarak keşfedilmesin diye burada yazıyor.
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
  deletePendingMutationIfPayload,
  markPendingMutationAttempt,
  pruneOrphanPendingMutations,
  readMessageSendState,
  readPendingMutations,
  updatePendingMutationPayload,
  upsertPendingMutation,
} from "@/features/chat/chatRepository";
import type { MutationKind, PendingMutationRow } from "@/features/chat/db/rows";
import {
  classifyMutationError,
  coalesceDelete,
  coalesceEdit,
  coalesceReaction,
  isMutationExpired,
  nextEligibleAt,
  rebaseReactionBase,
  shouldStopFlush,
  type DeletePayload,
  type EditPayload,
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
 * Kuyruğa, UÇUŞTAKİ bir tur BİTTİKTEN SONRA da bakılması gerektiğini söyleyen
 * bayrak. `enqueue*` kaldırır, `flushPendingMutations` her turun BAŞINDA
 * indirir ve tur bitince hâlâ kalkmışsa bir tur DAHA koşar.
 *
 * Olmadığında kaybolan şey: tur `msg-1`i ağa verip beklerken kullanıcı aynı
 * mesaja ikinci bir emoji seçiyor; `enqueue*` satırı diske yazıyor ama
 * eşzamanlı `flushPendingMutations` uçuştaki tura KATILIYOR (`inFlight`
 * döndürülüyor), yani yeni niyet için hiçbir tur kalmıyordu — ilgisiz bir
 * tetik (foreground/online/reconnect) gelene kadar diskte bekliyordu.
 */
let dirty = false;

/**
 * Yeni bir reaksiyon niyetini kuyruğa yazar. `attempts`/`next_eligible_at_ms`
 * SIFIRLANIR (yeni niyet eski backoff'u miras almaz), `first_seen_at_ms`
 * mevcut satırdan korunur — yoksa kullanıcı art arda emoji değiştirdikçe
 * emir hep "yeni" sayılır ve yaş tavanı (`isMutationExpired`, emrin ilk
 * verildiği andan ölçüyor) sonsuza dek ertelenebilirdi.
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
  dirty = true;
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
  dirty = true;
}

/**
 * Aynı kuraldan: yeni düzenleme niyeti backoff'u miras almaz, yaşı korur.
 * `base` (emrin ilk verildiği andaki sunucu içeriği) `coalesceEdit` ile
 * eskisinden korunuyor — kullanıcı art arda metni değiştirse bile `base`
 * ARA METNE kaymıyor (bkz. pendingMutationPolicy.ts'teki aynı gerekçe).
 */
export function enqueueEdit(args: {
  messageId: string;
  conversationId: string;
  content: string;
  serverBase: string;
}): void {
  const existingRow = findExistingRow(args.messageId, "edit");
  const existing: EditPayload | null = existingRow ? JSON.parse(existingRow.payload_json) : null;
  const payload = coalesceEdit(existing, args.content, args.serverBase);
  upsertPendingMutation({
    message_id: args.messageId,
    kind: "edit",
    conversation_id: args.conversationId,
    payload_json: JSON.stringify(payload),
    attempts: 0,
    first_seen_at_ms: existingRow ? existingRow.first_seen_at_ms : Date.now(),
    next_eligible_at_ms: 0,
    last_error: null,
  });
  dirty = true;
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

/**
 * Kalıcı ret sonrası düzenlemeyi geri alır: içerik `base`e (emrin ilk
 * verildiği andaki sunucu değeri) döner. Silmedeki `revertDelete` ile AYNI
 * kalıp: `current`i olduğu gibi spread edip yalnız `content` eziyoruz —
 * eksik alanlarla `messageEdited`i (mirror'da `saveMessage`, TÜM kolon
 * upsert'i) çağırmak satırı bozardı.
 *
 * Mesaj Redux'ta YÜKLÜ DEĞİLSE dispatch ETMEZ — aynı kapı, aynı gerekçe
 * (bkz. dosya başı not, `revertReaction`/`revertDelete`).
 */
function revertEdit(row: PendingMutationRow, payload: EditPayload): void {
  const current = findMessage(row.conversation_id, row.message_id);
  if (!current) return;
  dispatch(
    messageEdited({
      ...current,
      content: payload.base,
    } as MessageDto),
  );
}

/**
 * Bu turda sunucuda BENİM adıma FİİLEN ne yapıldı — iki bayrak, tek defter.
 * İkisi de "sunucu şu an benim için ne tutuyor" sorusunun parçası, o yüzden
 * ayrı ayrı değil birlikte okunuyor (`serverHeldForMe`).
 *
 *  - `baseRemoved`: `removeReaction(base)` GEÇTİ. Kalıcı ret sonrası geri
 *    alma `base`i geri koymamalı (sunucuda artık yok — bkz. dosya başı not).
 *  - `addedDesired`: `addReaction(desired)` GEÇTİ. Satır bekleme penceresinde
 *    yeni bir niyetle değiştiyse, hayatta kalan satırın `base`i bu emojiye
 *    çekilmek zorunda; yoksa sıradaki tur "kaldır"ı atlayıp ikinci bir chip
 *    açar (bkz. `rebaseSupersededReactionBase`).
 *
 * İkisi de false ise bu tur sunucuya hiç dokunmadı ve sunucunun hâli
 * hakkında YENİ bilgi yok.
 */
interface SendProgress {
  baseRemoved: boolean;
  addedDesired: boolean;
}

/**
 * Turun bittiği anda sunucunun benim adıma tuttuğu emoji; `undefined` =
 * BİLİNMİYOR (bu tur hiç çağrı yapmadı, bkz. SendProgress).
 */
function serverHeldForMe(
  sent: ReactionPayload,
  progress: SendProgress,
): string | null | undefined {
  if (progress.addedDesired) return sent.desired;
  if (progress.baseRemoved) return null;
  return undefined;
}

/**
 * Üstünden geçilmiş BAŞARI: emir uygulandı ama satır bekleme penceresinde
 * yeni bir niyetle değişti, o yüzden silinmedi. Hayatta kalan satırın `base`i
 * artık sunucudaki gerçeği göstermiyor — tazeliyoruz.
 *
 * Yazma, OKUNAN yüke koşullu (`updatePendingMutationPayload`): hesap ondan
 * türedi. `desired`e dokunulmuyor — kullanıcının en son niyeti o.
 */
function rebaseSupersededReactionBase(
  row: PendingMutationRow,
  sent: ReactionPayload | null,
  progress: SendProgress,
): void {
  if (!sent) return;
  const serverEmoji = serverHeldForMe(sent, progress);
  if (serverEmoji === undefined) return;

  const surviving = findExistingRow(row.message_id, "reaction");
  if (!surviving) return;
  let parsed: ReactionPayload;
  try {
    parsed = JSON.parse(surviving.payload_json);
  } catch {
    // Bozuk yükü burada ONARMIYORUZ: sıradaki tur onu parse hatasıyla alıp
    // kalıcı ret dalına koyuyor (zehir hap koruması).
    return;
  }
  if (parsed.base === serverEmoji) return;
  updatePendingMutationPayload(
    row.message_id,
    "reaction",
    surviving.payload_json,
    JSON.stringify(rebaseReactionBase(parsed, serverEmoji)),
  );
}

/** Tek satırı ağa taşır. `done` dışındaki dönüşler YALNIZ throw ile gelir. */
async function sendRow(
  row: PendingMutationRow,
  payload: ReactionPayload | DeletePayload | EditPayload,
  progress: SendProgress,
): Promise<void> {
  if (row.kind === "edit") {
    const p = payload as EditPayload;
    // Sunucu MessageDto döner — reaksiyonun tam liste dönüşüyle AYNI kalıp:
    // kanonikleştirme burada, başarı bookkeeping'inden ÖNCE olur. Backend'in
    // 2026-10-30 idempotent kısa devresi (içerik değişmemişse `EditedAt`e
    // dokunmadan 200+DTO) bu çağrıyı ASLA reddetmiyor — ayrı bir dal YOK,
    // "aynı içerikle retry" burada zaten normal `done` yoludur.
    const dto = await chatService.editMessage(row.message_id, p.content);
    dispatch(messageEdited(dto));
    return;
  }
  if (row.kind === "reaction") {
    const p = payload as ReactionPayload;
    let serverReactions: MessageReactionDto[] | undefined;
    // Sıra önemli: `base` hâlâ sunucuda dururken `desired` eklenirse backend
    // kullanıcı başına tek reaksiyon kuralını delmiş olur (bkz. ChatScreen'in
    // aynı sırayı koruyan `handlePickReaction`'ı).
    if (p.base && p.base !== p.desired) {
      serverReactions = await chatService.removeReaction(row.message_id, p.base);
      progress.baseRemoved = true;
    }
    if (p.desired) {
      serverReactions = await chatService.addReaction(row.message_id, p.desired);
      progress.addedDesired = true;
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
  /**
   * Sonucu YAZILAMAYAN satır sayısı: tur ağı beklerken kullanıcı aynı mesaja
   * yeni bir emir verdi, yani diskteki yük artık gönderilen yük DEĞİL. O satır
   * yerinde bırakılıyor (ne silinir ne backoff'a sokulur) ve `dirty` aynı
   * flush içinde bir tur DAHA ister.
   *
   * O tur GARANTİ DEĞİL: zincir `MAX_ROUNDS_PER_FLUSH`e dayanmış olabilir ya
   * da sıradaki tur bütçe rezervinde (`shouldStopFlush`) kısılabilir. İkisinde
   * de satır diskte kalır ve ekran eski niyeti göstermeye devam eder — toast
   * YOK, düzelmesi bir sonraki tetiğe (ya da kullanıcının yeni bir
   * etkileşimine) kalır.
   */
  superseded: number;
}

const emptyResult = (ran: boolean): FlushResult => ({
  ran,
  done: 0,
  retried: 0,
  rejected: 0,
  superseded: 0,
});

/**
 * Geri almanın (ve dolayısıyla "sebebi söyleyen" toast'ın) ÖN KOŞULU: mesaj
 * Redux'ta yüklü mü. `revertReaction`/`revertDelete` aynı kapıyı kendi
 * içlerinde taşıyor; toast da bu kapının ARDINDA kalmalı — yoksa kullanıcı
 * Keşif'teyken gelen bir 'foreground' turu "sistem mesajına tepki
 * verilemez" diyor, ama hiçbir yerde hiçbir şey değişmiyor (ne ekran ne
 * disk): göndereni olmayan bir hata mesajı.
 *
 * Dikkat — bu kapı "kullanıcı O ANDA bu sohbete bakıyor" DEĞİL, "bu sohbetin
 * bucket'ı bu oturumda yüklendi" demek. Daha dar bir kapı (odakta olan ekran)
 * bu modülün bilmediği navigation state'i gerektirirdi; toast metni de o
 * yüzden kendi kendini anlatacak kadar açık olmalı.
 */
function isMessageLoaded(row: PendingMutationRow): boolean {
  return findMessage(row.conversation_id, row.message_id) !== null;
}

async function run(): Promise<FlushResult> {
  const result: FlushResult = emptyResult(true);

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
    // durumu gate'i yok).
    //
    // GARANTİ TAM DEĞİL, sınırı tam olarak şu: satır temp id ile diskte
    // YAZILMIŞSA ack geldiğinde `upsertMessage` onu REKEY eder (bkz.
    // chatRepository.ts) ve satır `sent` id'siyle tekrar görünür. Ama satır
    // ack'TEN SONRA temp id ile yazılırsa (uzun basış menüsü açıkken ack
    // gelir, kullanıcı emojiyi sonra seçer) rekey edilecek bir satır yoktu:
    // o id artık `messages`'ta olmadığı için satır YETİM olur ve bir sonraki
    // turun `pruneOrphanPendingMutations`'ı onu siler. Bu yüzden ÇAĞRI NOKTASI
    // canlı kaydı `clientMessageId` üzerinden de çözüyor (bkz. ChatScreen'in
    // `handlePickReaction`/`handleDelete`'i) — kuyruğa hiç temp id yazılmaması
    // o kapının işi, burada telafisi YOK.
    if (readMessageSendState(row.message_id) !== "sent") continue;
    // 2) backoff dolmadı.
    if (row.next_eligible_at_ms > Date.now()) continue;

    opsDone += 1;

    let payload: ReactionPayload | DeletePayload | EditPayload | null = null;
    let parseError: unknown = null;
    try {
      payload = JSON.parse(row.payload_json);
    } catch (e) {
      parseError = e;
    }

    // Gönderilen yük, satırın diskteki hâliyle BİREBİR: sonucu yazarken
    // (sil/deneme işle) bu string karşılaştırılıyor. Beklerken kullanıcı yeni
    // bir emir verdiyse diskteki yük değişmiş olur ve sonuç o satıra İŞLENMEZ.
    const sentPayloadJson = row.payload_json;
    const progress: SendProgress = { baseRemoved: false, addedDesired: false };

    let outcome: MutationOutcome;
    let err: unknown = null;
    if (isMutationExpired(row.attempts, row.first_seen_at_ms, Date.now())) {
      // Deneme hakkı ya da yaş doldu (bkz. pendingMutationPolicy'deki
      // MUTATION_MAX_ATTEMPTS/MUTATION_MAX_AGE_MS gerekçesi). DİKKAT: bu
      // kontrol yukarıdaki `send_state === 'sent'` kapısının ARDINDA —
      // gönderilmemiş bir mesajın arkasındaki satır bu satıra hiç gelmez,
      // yani yaş tavanından MUAFTIR (kasıtlı: mesaj hâlâ tekrar denenebilir,
      // emri yaşından ötürü düşürmek yanlış varsayılan olurdu). Emir KALICI ret
      // gibi bitirilir — silinir, geri alınır, sebebi söylenir. `err` null
      // kalıyor; `chatErrorText` kodsuz/gövdesiz hatada fallback anahtarına
      // düşüyor, yani kullanıcı jenerik "olmadı" metnini görür.
      outcome = "rejected";
    } else if (parseError) {
      // Bozuk payload KALICI bir hata: `classifyMutationError` kodsuz bir
      // hatada 'retry' döner, yani bu satır her turda AYNI parse hatasıyla
      // sonsuza dek denenirdi (zehir hap). Pratikte yalnız bu modülün kendi
      // `JSON.stringify` çıktısı buraya yazılır, yani ulaşılması GÜÇ — ama
      // ulaşırsa 'retry' yanlış kaderdir.
      err = parseError;
      outcome = "rejected";
    } else {
      try {
        await sendRow(row, payload as ReactionPayload | DeletePayload | EditPayload, progress);
        outcome = "done";
      } catch (e) {
        err = e;
        outcome = classifyMutationError(e, row.kind);
      }
    }

    // ── Sonucun yazımı: HER DAL "yük değişmiş olabilir"i hesaba katar ───────
    // `row` ağ beklemesinden ÖNCE okunmuş bir ANLIK GÖRÜNTÜ. Bu pencerede
    // `enqueue*` aynı anahtara (PK = message_id + kind) yeni bir niyet
    // yazabiliyor; anahtarla koşulsuz silmek/tam upsert etmek o niyeti yok
    // ederdi (silmede satır kaybolur, retry'de eski yük geri yazılıp üstüne
    // backoff biner). O yüzden iki yazma da `payload_json` KAPSAMLI.
    try {
      if (outcome === "done") {
        if (deletePendingMutationIfPayload(row.message_id, row.kind, sentPayloadJson)) {
          result.done += 1;
        } else {
          // Emir UYGULANDI (sunucu değişti) ama satır bekleme penceresinde
          // yeni bir niyetle değişti. Hayatta kalan satırın `base`i sunucudaki
          // yeni gerçeğe çekilmezse sıradaki tur "kaldır"ı atlar ve ikincisini
          // EKLER — kullanıcı başına tek reaksiyon kuralı istemcide kırılırdı.
          result.superseded += 1;
          if (row.kind === "reaction") {
            rebaseSupersededReactionBase(row, payload as ReactionPayload | null, progress);
          }
        }
      } else if (outcome === "retry") {
        const attempts = row.attempts + 1;
        const applied = markPendingMutationAttempt({
          messageId: row.message_id,
          kind: row.kind,
          expectedPayloadJson: sentPayloadJson,
          attempts,
          nextEligibleAtMs: nextEligibleAt(attempts, Date.now()),
          lastError: err instanceof Error ? err.message : String(err),
        });
        if (applied) result.retried += 1;
        else result.superseded += 1;
      } else {
        // rejected: satır AYNI ANDA silinir (kalıcı ret burada "tekrar dene"
        // hâli DEĞİL) + geri alma + toast. Yük değiştiyse HİÇBİRİ yapılmaz:
        // geri alma ekranı kullanıcının EN SON niyetinin tersine çevirirdi,
        // oysa o niyet henüz denenmedi bile.
        if (!deletePendingMutationIfPayload(row.message_id, row.kind, sentPayloadJson)) {
          result.superseded += 1;
        } else {
          // Geri alma + toast yalnız mesaj Redux'ta yüklüyken (bkz.
          // isMessageLoaded): yüklü değilse `revert*` tasarımla no-op, toast
          // da o yüzden bastırılıyor — referansı olmayan hata metni kalmaz.
          const loaded = isMessageLoaded(row);
          if (row.kind === "reaction" && payload) {
            const p = payload as ReactionPayload;
            // `base` sunucuda ARTIK YOKSA (remove geçti, add kalıcı reddedildi)
            // geri koymuyoruz — bkz. dosya başı not.
            revertReaction(row, progress.baseRemoved ? { ...p, base: null } : p);
          } else if (row.kind === "delete") {
            revertDelete(row);
          } else if (row.kind === "edit" && payload) {
            // UT-6723 (pencere kapandı) dahil HER kalıcı ret burada biter:
            // ekrandaki/diskteki içerik `base`e (sunucunun emrin verildiği
            // andaki bilinen değeri) döner — sessiz bir niyet kaybı DEĞİL,
            // toast aşağıda sebebi söylüyor.
            revertEdit(row, payload as EditPayload);
          }
          if (loaded) {
            showInfoToast({
              message: chatErrorText(
                err,
                (k: string) => i18n.t(k) as string,
                row.kind === "reaction"
                  ? "errors.generic"
                  : row.kind === "delete"
                    ? "chat.deleteMessage.error"
                    : "chat.editMessage.error",
              ),
              variant: "error",
            });
          }
          result.rejected += 1;
        }
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
 * Bir `flushPendingMutations` çağrısında koşulacak EN ÇOK tur sayısı.
 *
 * Zincirin sebebi `dirty` (bkz. yukarısı): tur uçarken gelen yeni niyet için
 * bir tur daha gerekiyor. Tavan, zincirin kendi kendini beslemesine karşı:
 * kullanıcı sürekli emoji değiştirirse her tur `dirty`yi yine kalkmış bulur ve
 * zincir hiç bitmezdi (paylaşımlı rate-limit kovasına sınırsız istek). Tavana
 * varınca satır diskte kalır — ekran optimistik, emir kaybolmuyor, yalnız bir
 * sonraki tetiği (ya da bir sonraki etkileşimi) bekler.
 */
const MAX_ROUNDS_PER_FLUSH = 3;

/** Zinciri koşturur: `dirty` kalkmış kaldıkça bir tur DAHA. */
async function runChain(): Promise<FlushResult> {
  const total = emptyResult(true);
  for (let round = 0; round < MAX_ROUNDS_PER_FLUSH; round++) {
    // SIRA önemli: bayrak tur BAŞLAMADAN indirilir. Tur bittikten sonra
    // indirilseydi, tam o tur sırasında gelen niyetin işareti silinirdi —
    // bayrağın var olma sebebi olan pencere.
    dirty = false;
    const r = await run();
    total.done += r.done;
    total.retried += r.retried;
    total.rejected += r.rejected;
    total.superseded += r.superseded;
    if (!dirty) break;
  }
  return total;
}

/**
 * Mutasyon kuyruğu turunu koşturur. Tek-uçuş: aynı anda iki tur koşmaz —
 * `chatBackfill.runBackfillRound`'ın `inFlight` kalıbının aynısı. Uçuştaki
 * tura KATILAN çağıran da `dirty` zinciri sayesinde kendi niyetinin
 * gönderildiği bir tur görür.
 */
export async function flushPendingMutations(trigger: string): Promise<FlushResult> {
  // Kill-switch. AppNavigator.tsx'teki dört tetik (boot/online/reconnect/
  // foreground) bu fonksiyonu KOŞULSUZ çağırır — bayrağa onlar bakmıyor. Bugün ağ
  // tarafını kapalı tutan şey bu satır DEĞİL, ChatScreen'in çağrı noktası
  // kapısı (Task 4): bayrak kapalıyken kuyruğa hiç satır YAZILMIYOR, yani
  // dört tetik her tetiklendiğinde boş bir kuyruğu tur'a sokuyor — atılacak
  // istek zaten yok. Bu satır o yüzden TEKRARLI: bugünkü boşluğu DEĞİL,
  // ileride ChatScreen'in kapısından geçmeyen bir enqueue yolu (ya da
  // bayrağa bakmayı unutan başka bir çağıran) eklenirse diye buradaki ağ
  // tarafını kapalı tutar (bkz. chatBackfill.ts'teki `runBackfillRound`
  // kapısı, aynı gerekçe). Satır KORUNUR — kapatmak veri kaybettirmez, ama
  // diskte satır VARSA onları MAHSUR BIRAKIR: bu return draining'den önce
  // geliyor, yani o emirler ne uygulanır ne geri alınır (budama yalnız yetim
  // satırları alır) ve bayrak haftalar sonra açılırsa beklenmedik anda
  // gönderilirler — bkz. chatFlags.ts'teki aynı not.
  if (!CHAT_MUTATION_QUEUE_ENABLED) {
    return emptyResult(false);
  }
  if (isOfflineNow()) {
    return emptyResult(false);
  }
  if (inFlight) return inFlight;
  inFlight = runChain().finally(() => {
    inFlight = null;
  });
  const result = await inFlight;
  if (result.done || result.retried || result.rejected || result.superseded) {
    devLog(
      `🔁 [pendingMutations] ${trigger}: done=${result.done} retried=${result.retried} rejected=${result.rejected} superseded=${result.superseded}`,
    );
  }
  return result;
}

/** Yalnız test içindir. */
export function __resetPendingMutationsForTests(): void {
  inFlight = null;
  dirty = false;
}
