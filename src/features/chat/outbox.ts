/**
 * Chat OUTBOX — gönderimin ağ tarafı ve başarısız mesajların yeniden denenmesi.
 *
 * NEDEN EKRAN DIŞINDA: gönderim mantığı ChatScreen'in içindeyken yeniden deneme
 * de o ekranın ömrüne bağlıydı — başka bir sohbetteyken ya da sohbetten çıkmışken
 * ağ geri gelse bile mesaj öylece kalıyordu. Ayrıca hub ack watchdog'u unmount'ta
 * iptal ediliyordu: ack hiç gelmezse balon sonsuza dek `_pending` kalıyor,
 * `_failed` olmadığı için "tekrar dene" butonu bile çıkmıyordu.
 *
 * SINIR: outbox SATIR YARATMAZ. Optimistic balonu listeye ekleyen tek yer hâlâ
 * ChatScreen (`appendOutgoing`) — çünkü o iş liste ölçümü + scroll pinleme +
 * giriş animasyonu ile aynı sıraya bağlı ve o sıra ekrana ait. Outbox yalnız
 * "zaten listede olan bir satırı ağa taşımak" ile ilgileniyor; bu yüzden
 * `appendOptimisticMessage` ve `markMessageEntering` burada İMPORT EDİLMEZ.
 *
 * Kalıcılık YOK (bilinçli): `chatPersistTransform` `_pending`/`_failed` mesajları
 * zaten diske yazmıyor, uygulama kapanınca kayboluyorlar. Buradaki deneme
 * sayaçları da process ile ölüyor — iki ömür birebir örtüşüyor.
 */
import {
  conversationDeactivated,
  decrementQuotaLocally,
  failOptimisticMessage,
  fetchChatQuota,
  fetchConversations,
  messageSent,
  removeOptimisticMessage,
  retryOptimisticMessage,
} from "@/features/chat/chatSlice";
import chatService from "@/features/chat/chatService";
import { openQuotaPaywall } from "@/features/chat/quotaPaywall";
import realtimeService from "@/features/chat/realtimeService";
import { enqueueSend } from "@/features/chat/sendQueue";
import { sendVoiceMessage } from "@/features/chat/voiceSend";
import {
  backoffDelayMs,
  classifySendError,
  isEligible,
  messageToDescriptor,
  selectFailedOutbox,
  MAX_ATTEMPTS,
  type AttemptEntry,
  type FailOrigin,
  type FailureClass,
  type OutgoingDescriptor,
  type SendMode,
} from "@/features/chat/outboxPolicy";
import i18n from "@/shared/i18n";
import { chatErrorText } from "@/shared/constants/responseCodes";
import { analytics } from "@/shared/services/analytics";
import { isOfflineNow } from "@/shared/services/networkStatus";
import { showInfoToast } from "@/shared/services/toaster";
import { store } from "@/shared/store";
import { devLog } from "@/shared/utils/devLog";
import type { MessageDto } from "@/shared/types";

/**
 * KILL-SWITCH. false → arka plan turu hiç çalışmaz, yalnız kullanıcı tetikli
 * gönderim/yeniden deneme kalır. Uzaktan yapılandırma altyapısı yok; özellik
 * zaten oturum içi olduğu için OTA ile çevrilebilir.
 */
const OUTBOX_AUTO_RETRY_ENABLED = true;

/**
 * Hub `SendMessage` hatada invoke'u REDDETMİYOR — ayrı bir `Error` event'i
 * yayınlıyor (kontrat §17). O event kaçarsa balon sonsuza dek "gönderiliyor"da
 * asılı kalıyordu; bu pencere dolunca başarısıza çeviriyoruz.
 */
const SEND_ACK_TIMEOUT_MS = 12_000;
/** Peş peşe gelen tetikleri (online + reconnect + foreground) tek tura indirir. */
const MIN_FLUSH_INTERVAL_MS = 3_000;
/** Sayaç haritasının sert tavanı — sızıntıya karşı son savunma. */
const MAX_TRACKED = 200;

const attempts = new Map<string, AttemptEntry>();
const ackTimers = new Map<string, ReturnType<typeof setTimeout>>();
let flushing = false;
let lastFlushAt = 0;
let wakeTimer: ReturnType<typeof setTimeout> | null = null;
/** Sessiz turda biriken "sohbet listesini doğrulat" isteği — tur başına BİR kez. */
let roundNeedsConversationRefetch = false;

const dispatch = (action: any) => (store.dispatch as any)(action);

function findMessage(conversationId: string, clientMessageId: string): any | null {
  const messages = (store.getState() as any)?.chat?.messagesByConv?.[conversationId]
    ?.messages;
  if (!Array.isArray(messages)) return null;
  return messages.find((m: any) => m?.clientMessageId === clientMessageId) ?? null;
}

function newEntry(now: number): AttemptEntry {
  return {
    attempts: 0,
    firstSeenAt: now,
    nextEligibleAt: 0,
    origin: "throw",
    permanent: false,
    quotaCharged: false,
  };
}

/**
 * Kaydı VAR OLANI GÜNCELLEYEREK alır — yenisiyle değiştirmez. `quotaCharged`
 * gibi bayraklar başarısızlık/başarı yollarının arasında hayatta kalmak zorunda:
 * hub dalında kota ack'ten ÖNCE düşüyor, ack timeout'u balonu başarısız yapıyor
 * ve sonraki başarılı deneme kotayı İKİNCİ kez düşürürdü.
 */
function touchEntry(clientMessageId: string): AttemptEntry {
  const now = Date.now();
  let entry = attempts.get(clientMessageId);
  if (!entry) {
    entry = newEntry(now);
    attempts.set(clientMessageId, entry);
    if (attempts.size > MAX_TRACKED) {
      let oldestKey: string | null = null;
      let oldestAt = Infinity;
      for (const [k, v] of attempts) {
        if (v.firstSeenAt < oldestAt) {
          oldestAt = v.firstSeenAt;
          oldestKey = k;
        }
      }
      if (oldestKey && oldestKey !== clientMessageId) attempts.delete(oldestKey);
    }
  }
  return entry;
}

/**
 * Kota bir `clientMessageId` için ömründe EN FAZLA bir kez düşer.
 *
 * Kaydı OLMAYAN mesaj için kayıt AÇMAZ: başarılı her gönderim haritaya bir
 * satır yazsaydı harita sohbet boyunca şişer, tavana dayanınca da gerçek
 * bekleyen kayıtları tahliye ederdi. Çift düşme riskinin tek yolu zaten önce
 * başarısız olmaktan geçiyor ve o yolda kayıt hazır (bkz. armAckWatchdog).
 */
function chargeQuotaOnce(conversationId: string, clientMessageId: string) {
  const entry = attempts.get(clientMessageId);
  if (entry?.quotaCharged) return;
  if (entry) entry.quotaCharged = true;
  dispatch(decrementQuotaLocally({ conversationId }));
}

function noteFailure(
  clientMessageId: string,
  retryable: boolean,
  origin: FailOrigin,
): AttemptEntry {
  const entry = touchEntry(clientMessageId);
  entry.attempts += 1;
  entry.origin = origin;
  entry.permanent = !retryable || entry.attempts >= MAX_ATTEMPTS;
  entry.nextEligibleAt = Date.now() + backoffDelayMs(entry.attempts);
  return entry;
}

function markPermanent(clientMessageId: string) {
  const entry = touchEntry(clientMessageId);
  entry.permanent = true;
}

/** Ack gelmiş/mesaj gitmiş kayıtları at — harita yalnız bekleyenleri taşısın. */
function pruneAttempts(failedNow: any[]) {
  if (!attempts.size) return;
  const alive = new Set(failedNow.map((m) => m.clientMessageId));
  for (const key of [...attempts.keys()]) {
    if (!alive.has(key)) attempts.delete(key);
  }
}

/**
 * Backoff'ta bekleyen kayıt kaldıysa en yakın uygunluk anına TEK zamanlayıcı.
 *
 * Olmasaydı outbox tamamen olay-güdümlü kalırdı: sinyalin bir türlü `offline`'a
 * düşmediği ama isteklerin patladığı bağlantıda (tünel, zayıf hücre) backoff'a
 * giren mesaj bir sonraki foreground'a kadar hiç denenmezdi.
 */
function scheduleWake() {
  if (wakeTimer) {
    clearTimeout(wakeTimer);
    wakeTimer = null;
  }
  const now = Date.now();
  let soonest = Infinity;
  for (const entry of attempts.values()) {
    if (entry.permanent || entry.origin === "ackTimeout") continue;
    if (entry.attempts >= MAX_ATTEMPTS) continue;
    if (entry.nextEligibleAt > now && entry.nextEligibleAt < soonest) {
      soonest = entry.nextEligibleAt;
    }
  }
  if (soonest === Infinity) return;
  wakeTimer = setTimeout(
    () => {
      wakeTimer = null;
      void flushOutbox("timer");
    },
    Math.max(250, soonest - now),
  );
}

/**
 * Hub yolunun ack bekçisi. Timer İPTAL EDİLMEZ: ateşlediğinde store'a bakıp
 * mesaj hâlâ bekliyorsa başarısız işaretler, ack geldiyse hiçbir şey yapmaz.
 */
function armAckWatchdog(d: OutgoingDescriptor) {
  const { conversationId, clientMessageId } = d;
  const prev = ackTimers.get(clientMessageId);
  if (prev) clearTimeout(prev);
  const timer = setTimeout(() => {
    ackTimers.delete(clientMessageId);
    const msg = findMessage(conversationId, clientMessageId);
    if (!msg?._pending || msg?._failed) return;
    devLog("📮 [outbox] ack gelmedi, başarısız işaretleniyor", clientMessageId);
    dispatch(failOptimisticMessage({ conversationId, clientMessageId }));
    // origin ackTimeout: mesaj sunucuya ULAŞMIŞ olabilir → sessiz yeniden
    // deneme KAPALI, yalnız kullanıcı elle basarsa gider (bkz. FailOrigin).
    const entry = noteFailure(clientMessageId, true, "ackTimeout");
    // Buraya YALNIZ hub dalından gelinir ve orada kota invoke çözülür çözülmez
    // düşmüştü. İşaretlemezsek elle yapılan başarılı deneme kotayı İKİNCİ kez
    // düşürürdü — bugünkü kodda ulaşılması zor, otomatik kuyrukla kolay.
    entry.quotaCharged = true;
  }, SEND_ACK_TIMEOUT_MS);
  ackTimers.set(clientMessageId, timer);
}

function handleFailure(
  d: OutgoingDescriptor,
  fc: FailureClass,
  mode: SendMode,
  err: any,
) {
  const { conversationId, clientMessageId } = d;
  const loud = mode === "interactive";

  if (fc.reason === "quota") {
    analytics.capture("chat_quota_exhausted", {
      conversationId,
      ...(loud ? {} : { silent: true }),
    });
    dispatch(fetchChatQuota({ conversationId, force: true }));
    if (loud) {
      // Kullanıcı oradayken balonu kaldırıyoruz; söylenecek şeyi paywall söylüyor.
      dispatch(removeOptimisticMessage({ conversationId, clientMessageId }));
      openQuotaPaywall(conversationId, d.kind === "voice" ? "voice_402" : "send_402");
      return;
    }
    // SESSİZ: paywall açmak kullanıcıyı ilgisiz bir ekranda Profil'e atardı ve
    // "görüntülendi" hunisini şişirirdi. Balon da SİLİNMEZ — bakılmayan bir
    // sohbette kullanıcının yazdığı metni habersiz yok etmek olurdu.
    dispatch(failOptimisticMessage({ conversationId, clientMessageId }));
    markPermanent(clientMessageId);
    return;
  }

  // Balon LİSTEDEN ÇIKARILMAZ (kod ne olursa olsun): yazdığı metin kullanıcının
  // elinde kalsın. Sözleşme "taslağı input'a geri koy" diyor; bizde aynı işi
  // başarısız balon + "tekrar dene" görüyor — üstelik içerik gözden kaybolmadan.
  dispatch(failOptimisticMessage({ conversationId, clientMessageId }));
  noteFailure(clientMessageId, fc.retryable, "throw");

  if (loud && fc.toast) {
    showInfoToast({
      message: fc.chatCode
        ? chatErrorText(err, (k: string) => i18n.t(k) as string, fc.i18nKey)
        : (i18n.t(fc.i18nKey) as string),
      variant: "error",
    });
  }
  devLog(
    `📮 [outbox] ${d.kind} gönderilemedi (${mode})`,
    fc.reason,
    fc.chatCode || fc.voiceCode || err?.response?.status || err?.message || err,
  );

  // Sohbet kapanmış (karşı taraf unmatch etti / engelledi): kapatan taraf biz
  // değiliz → geri alma penceresi yok.
  if (fc.deactivateConversation) {
    dispatch(conversationDeactivated({ conversationId, restorableUntil: null }));
  }
  if (fc.refetchConversations) {
    // Sessiz turda biriktirilir: üç ölü sohbetteki on mesaj on istek olurdu.
    if (loud) dispatch(fetchConversations({ force: true }));
    else roundNeedsConversationRefetch = true;
  }
}

/**
 * Balon ZATEN listede (ekran `appendOutgoing` yaptı ya da çağıran
 * `retryOptimisticMessage` ile `_pending`e çekti) — burası sadece ağ + sonrası.
 * ASLA throw etmez: sessiz tur bir mesajda takılıp kalmasın.
 */
export async function sendOutgoing(
  d: OutgoingDescriptor,
  opts: { mode: SendMode },
): Promise<void> {
  const { conversationId, clientMessageId, replyToMessageId } = d;
  try {
    let result: MessageDto | null = null;
    if (d.kind === "voice") {
      // ÜÇ ADIMIN TAMAMI kuyrukta: sıra sunucudaki `sentAt` damgasına göre
      // belirlendiği için metin, sesin POST'u dönmeden gönderilemez — yoksa
      // yükleme sürerken yazılan metin sesten ERKEN damgalanıp kanonik sırada
      // (karşı taraf, sohbet önizlemesi, her reconcile) üste çıkıyor.
      result = await enqueueSend(() =>
        sendVoiceMessage({
          conversationId,
          uri: d.localUri,
          durationMs: d.durationMs,
          waveformPeaks: d.waveformPeaks ?? undefined,
          clientMessageId,
          replyToMessageId: replyToMessageId ?? undefined,
        }),
      );
    } else {
      // Hub yalnız düz metin taşıyor; yanıtlı mesaj da REST'ten gider.
      const useHub = realtimeService.isConnected() && !replyToMessageId;
      if (useHub) {
        await enqueueSend(() =>
          realtimeService.sendMessage(conversationId, d.content, clientMessageId),
        );
        // invoke resolve olsa bile mesajın gittiği garanti değil (hata ayrı
        // `Error` event'iyle gelir, sohbet kapandıysa ack hiç gelmez).
        armAckWatchdog(d);
      } else {
        result = await enqueueSend(() =>
          chatService.sendMessage({
            conversationId,
            content: d.content,
            clientMessageId,
            replyToMessageId,
          } as any),
        );
      }
    }
    // Server kopyası yerel alanları EZMEZ (messageSent merge ediyor) — sesli
    // balon aynı dosyadan çalmaya devam eder.
    if (result) dispatch(messageSent(result));
    chargeQuotaOnce(conversationId, clientMessageId);
  } catch (err: any) {
    handleFailure(d, classifySendError(err, d.kind), opts.mode, err);
  }
}

/**
 * Başarısız bir balonu yeniden gönderir. Satır listeden ÇIKARILMAZ, yerinde
 * "tekrar bekliyor"a döner (remount olmadığı için kayma animasyonu akıcı kalır).
 */
export async function retryFailedMessage(
  message: any,
  opts: { mode: SendMode },
): Promise<void> {
  if (!message?._failed) return;
  const d = messageToDescriptor(message);
  if (!d) {
    // Neredeyse tek sebebi: sesli mesajın yerel dosyası düşmüş. Eskiden bu
    // mesaj sessizce metin yoluna düşüp `content: ""` gönderiyor ve sunucudan
    // UT-6710 alıyordu — balon bir daha asla düzelmiyordu.
    if (message?.clientMessageId) markPermanent(message.clientMessageId);
    if (opts.mode === "interactive") {
      showInfoToast({
        message: i18n.t("chat.voice.sendFailed") as string,
        variant: "error",
      });
    }
    return;
  }
  if (opts.mode === "interactive") {
    // Kullanıcı niyeti backoff'u ve `permanent`i EZER — elle buton asla ölü
    // olmamalı. `quotaCharged` korunuyor (çift düşme guard'ı).
    const prev = attempts.get(d.clientMessageId);
    if (prev) {
      prev.attempts = 0;
      prev.firstSeenAt = Date.now();
      prev.nextEligibleAt = 0;
      prev.origin = "throw";
      prev.permanent = false;
    }
  }
  dispatch(
    retryOptimisticMessage({
      conversationId: d.conversationId,
      clientMessageId: d.clientMessageId,
    }),
  );
  await sendOutgoing(d, opts);
}

/**
 * TÜM sohbetlerdeki başarısız mesajları sessizce dener. Tetikler: ağ geri
 * gelmesi, foreground, hub reconnect ve kendi backoff zamanlayıcısı.
 */
export async function flushOutbox(
  reason: "online" | "foreground" | "reconnect" | "timer",
): Promise<void> {
  if (!OUTBOX_AUTO_RETRY_ENABLED) return;
  if (flushing) return;
  const startedAt = Date.now();
  // Aynı saniyede gelen üç tetik (online + reconnect + foreground) tek tur olur.
  if (startedAt - lastFlushAt < MIN_FLUSH_INTERVAL_MS) return;
  if (isOfflineNow()) return;
  const state: any = store.getState();
  // Oturum yoksa denemenin anlamı yok; 401'e yanıp deneme hakkı yakardı.
  if (!state?.auth?.isAuthenticated) return;

  const items = selectFailedOutbox(state);
  pruneAttempts(items);
  if (!items.length) return;

  flushing = true;
  lastFlushAt = startedAt;
  roundNeedsConversationRefetch = false;
  let sent = 0;
  try {
    for (const m of items) {
      // Tur ortasında bağlantı giderse kalan mesajları boşuna yakma.
      if (isOfflineNow()) break;
      const clientMessageId = m.clientMessageId;
      if (!isEligible(attempts.get(clientMessageId), Date.now(), "silent")) continue;
      sent += 1;
      await retryFailedMessage(m, { mode: "silent" });
    }
  } finally {
    flushing = false;
    if (roundNeedsConversationRefetch) {
      roundNeedsConversationRefetch = false;
      dispatch(fetchConversations({ force: true }));
    }
    if (sent) devLog(`📮 [outbox] ${reason}: ${sent}/${items.length} mesaj denendi`);
    scheduleWake();
  }
}

/** Oturum kapanışı ve testler — bekleyen her şeyi bırak. */
export function resetOutbox(): void {
  for (const timer of ackTimers.values()) clearTimeout(timer);
  ackTimers.clear();
  attempts.clear();
  if (wakeTimer) {
    clearTimeout(wakeTimer);
    wakeTimer = null;
  }
  flushing = false;
  lastFlushAt = 0;
  roundNeedsConversationRefetch = false;
}
