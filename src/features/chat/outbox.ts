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
 * Balon kalıcılığı YOK (bilinçli): `chatPersistTransform` `_pending`/`_failed`
 * mesajları zaten diske yazmıyor, uygulama kapanınca kayboluyorlar. Deneme
 * MUHASEBESİ (sayaç/backoff/permanent/quota_charged) artık FARKLI: `attempts`
 * Map'i hâlâ var (gerekçe: `MessageDto`'ya alan eklemek bubble'ı yapısal
 * değişiklik sayardı — commit-storm riski) ama şimdi `send_attempts` (v7)
 * tablosunun ÖNBELLEĞİ — process ölse de disk hayatta kalıyor. Asıl kazanç
 * `quotaCharged`: eskiden restart sonrası sıfırlanıp ack'i kaybolmuş mesajın
 * başarılı tekrarı kotayı ikinci kez düşürebiliyordu.
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
import { pullBeforeSend } from "@/features/chat/chatDeltaSync";
import { readFailedOutboxFromLocal } from "@/features/chat/chatHydrate";
import {
  clearVoiceMediaUrl,
  deleteSendAttempts,
  readSendAttempt,
  readSendAttempts,
  setVoiceMediaUrl,
  upsertSendAttempt,
} from "@/features/chat/chatRepository";
import {
  attemptEntryFromRow,
  attemptRowFromEntry,
  backoffDelayMs,
  classifySendError,
  isEligible,
  isLateDelivery,
  mergeFailedOutbox,
  messageToDescriptor,
  needsVoiceReupload,
  selectFailedOutbox,
  MAX_ATTEMPTS,
  MAX_PER_FLUSH,
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
import { utcTime } from "@/shared/utils/dateUtc";
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
/** Turda 429 / `RATE_LIMITED` görüldü — kalan mesajlar bir sonraki tura. */
let roundRateLimited = false;
/**
 * Sessiz turda "bekleyen mesajın gönderildi" bildirimi tur başına EN FAZLA
 * bir kez gösterilsin — yirmi mesajlık birikmiş bir kuyruk yirmi toast açmasın
 * (bkz. isLateDelivery, sendOutgoing'in başarı dalı).
 */
let roundLateNoticeShown = false;
/**
 * `loadAttemptsFromDisk` tur başına BİR kez gerçek okuma yapsın diye. Process
 * ömrü boyunca ikinci çağrı no-op — `attempts` Map'i artık diskten daha taze.
 * `resetOutbox` bu bayrağı da sıfırlar: testlerde process ölümünü taklit eden
 * fonksiyon bu, bayrak hayatta kalırsa "restart sonrası disk okunuyor mu"
 * iddiasını sınayan hiçbir test gerçek bir disk okuması GÖRMEZ.
 */
let loadedFromDisk = false;

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
 * Turun başında/her gönderimde BİR kez: `send_attempts` tablosundaki satırları
 * Map'e açar.
 *
 * Fresh process'te Map boş başlıyor — restart öncesi `quotaCharged`/backoff
 * bilgisi olmadan outbox eski hâline (process ölürse muhasebe kaybolur) geri
 * dönerdi. VAR OLAN bir Map girdisinin üzerine YAZILMAZ (`has` koruması):
 * fresh process'te İLK round'dan önce bir gönderim zaten başarısız olup Map'e
 * taze bir kayıt açmış olabilir (bkz. sendOutgoing'in kendi çağrısı) — disk
 * okuması o CANLI kaydı eski hâliyle ezmemeli.
 *
 * Okuma PATLARSA bayrak `true` YAPILMAZ: `getChatDb()` tembel açılıyor, bozuk
 * bir DB/migration burada atabilir. Bayrak erken `true` olsaydı süreç ömrü
 * boyunca disk bir daha hiç okunmaz, Map kalıcı olarak boş kalır ve tam bu
 * task'ın önlediği çift düşme (kota/çift gönderim) geri gelirdi — yazım
 * taraflarındaki aynı asimetriyi (bkz. `rememberAttempt`, `pruneAttempts`)
 * burada da koruyoruz: bir sonraki çağrı (sonraki `sendOutgoing`/`flushOutbox`
 * turu) yeniden dener.
 */
export function loadAttemptsFromDisk(): void {
  if (loadedFromDisk) return;
  try {
    for (const row of readSendAttempts()) {
      if (!attempts.has(row.client_message_id)) {
        attempts.set(row.client_message_id, attemptEntryFromRow(row));
      }
    }
    loadedFromDisk = true;
  } catch {
    // Bayrak false kaldı — bir sonraki çağrı yeniden okumayı dener.
  }
}

/**
 * Map yazımının normal kapısı: deneme muhasebesini MUTASYONDAN SONRA diske
 * yazan her yer (`chargeQuotaOnce`, `noteFailure`, `markPermanent`,
 * `armAckWatchdog`, `retryFailedMessage`) bunu çağırır — yoksa iki yazım
 * ayrışır (biri Map'i güncelleyip diski unutabilir) ve disk Map'ten geriye
 * düşer, restart'ta geriye düşmüş veriye güvenmiş oluruz.
 *
 * İKİ İSTİSNA bilerek bunu ATLAR: `touchEntry`'nin BOŞ `newEntry` için attığı
 * `attempts.set` (çağıran zaten hemen ardından mutasyon yapıp bu fonksiyonu
 * kendisi çağırıyor — burada persist etmek sadece anlamsız bir "boş satır"
 * yazardı) ve `loadAttemptsFromDisk`'in disk→Map yazımı (veri ZATEN diskten
 * geliyor, geri yazmanın bir anlamı yok).
 */
export function rememberAttempt(clientMessageId: string, entry: AttemptEntry): void {
  attempts.set(clientMessageId, entry);
  try {
    upsertSendAttempt(attemptRowFromEntry(clientMessageId, entry));
  } catch {
    // Disk yazımı patlarsa bu turun davranışı değişmez (Map zaten güncel);
    // kaybedilen tek şey bir restart'ın bu adımı görmesi.
  }
}

export function peekAttempt(clientMessageId: string): AttemptEntry | undefined {
  return attempts.get(clientMessageId);
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
 *
 * Map MISS'te TEK SATIR disk okuması (controller ruling — YALNIZ BURADA):
 * `touchEntry`'nin `MAX_TRACKED` tahliyesi bu kaydı Map'ten düşürmüş olabilir
 * (disk hâlâ tutuyor, bkz. touchEntry/pruneAttempts yorumları). Burada
 * yokluğun maliyeti GERÇEK — kota ikinci kez düşer. `isEligible`/backoff'ta
 * aynı read-through YOK: oradaki yokluk ucuz (en kötü ihtimal bir backoff
 * sıfırlanır) ve read-through'u her Map-miss'e yaymak Map'in amacını (hızlı,
 * disk'e dokunmayan process-içi erişim) baltalardı.
 */
function chargeQuotaOnce(conversationId: string, clientMessageId: string) {
  let entry = attempts.get(clientMessageId);
  if (!entry) {
    try {
      const row = readSendAttempt(clientMessageId);
      if (row) entry = attemptEntryFromRow(row);
    } catch {
      // Okuma patlarsa entry `undefined` kalır — aşağıdaki "kayıt yok" dalına
      // düşer, davranış bu düzeltmeden ÖNCEki hâle geri döner (yeni bir
      // regresyon değil, status quo).
    }
  }
  if (entry?.quotaCharged) return;
  if (entry) {
    entry.quotaCharged = true;
    rememberAttempt(clientMessageId, entry);
  }
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
  rememberAttempt(clientMessageId, entry);
  return entry;
}

function markPermanent(clientMessageId: string) {
  const entry = touchEntry(clientMessageId);
  entry.permanent = true;
  rememberAttempt(clientMessageId, entry);
}

/**
 * Ack gelmiş/mesaj gitmiş kayıtları at — harita yalnız bekleyenleri taşısın.
 *
 * Diskten de silinir: yoksa `send_attempts` tabloda sonsuza dek birikir (Map
 * eviction'ı — MAX_TRACKED — KASITLI olarak diski silmiyor, ama bu doğal
 * "işim bitti" yolu silmeli, yoksa `pruneOrphanSendAttempts`e kadar her gönderilmiş
 * mesajın muhasebesi diskte gezer).
 */
export function pruneAttempts(failedNow: any[]) {
  if (!attempts.size) return;
  const alive = new Set(failedNow.map((m) => m.clientMessageId));
  const gone: string[] = [];
  for (const key of [...attempts.keys()]) {
    if (!alive.has(key)) {
      attempts.delete(key);
      gone.push(key);
    }
  }
  if (gone.length) {
    try {
      deleteSendAttempts(gone);
    } catch {
      // Silinmezse pruneOrphanSendAttempts bir sonraki fırsatta temizler;
      // Map zaten doğru, kullanıcıya görünen davranış değişmez.
    }
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
    // `origin === "ackTimeout"` ELENMİYOR (2026-10-06): send idempotent olduğu
    // için o kayıtlar da sessizce denenebiliyor (bkz. outboxPolicy.FailOrigin).
    // Elenmeye devam etseydi ack'i kaybolmuş mesaj backoff zamanlayıcısıyla hiç
    // denenmez, yalnız bir sonraki foreground/reconnect'i beklerdi.
    if (entry.permanent) continue;
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
    // noteFailure zaten bir rememberAttempt yaptı ama o çağrı anında
    // quotaCharged hâlâ false'tu — bu satırdaki değişikliği de diske yaz,
    // yoksa tam da bu task'ın önlemeye çalıştığı çift düşme burada YAŞAR.
    rememberAttempt(clientMessageId, entry);
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

  // Sunucu "yavaşla" dedi: bu mesaja değil TURA ait bir cevap. Kalan mesajları
  // denemek aynı 429'u alıp hepsinin deneme hakkını yakardı (sunucu sınırı:
  // dakikada 30 mesaj, HTTP ve hub için ayrı ayrı).
  if (fc.reason === "rateLimited") roundRateLimited = true;

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
  // BURADA — flushOutbox'ın turunun başı YETMEZ: `ChatScreen`'in composer
  // gönderim yolu (`appendOutgoing`'den sonra) `sendOutgoing`'i DOĞRUDAN
  // çağırıyor, `retryFailedMessage`'dan HİÇ geçmiyor — kendi `loadAttemptsFromDisk`
  // çağrısı (round 1) bu yolu kapsamıyor. Cold start'ta hiçbir round koşmadıysa
  // (`online`/`foreground`/`reconnect` hepsi geçiş-tetiklemeli, `scheduleWake`
  // de önceki bir round'u gerektirir) Map boş kalır ve `chargeQuotaOnce`
  // diskteki `quotaCharged`'ı GÖRMEDEN kotayı ikinci kez düşürür. Bayrak
  // korumalı olduğu için ikinci ve sonraki çağrılarda no-op.
  loadAttemptsFromDisk();
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
          // Yükleme daha önce tamamlanmışsa dosya TEKRAR YÜKLENMEZ: her
          // upload-url yeni bir S3 anahtarı üretiyor ve yetim nesne bırakıyor
          // (backend'in açık ricası).
          mediaUrl: d.mediaUrl,
          durationMs: d.durationMs,
          waveformPeaks: d.waveformPeaks ?? undefined,
          clientMessageId,
          replyToMessageId: replyToMessageId ?? undefined,
          // Yükleme bittiği ANDA diske yaz — `send` patlarsa ya da uygulama
          // tam o anda kapanırsa bilgi uçmasın, yoksa tekrar denemede dosya
          // ikinci kez yüklenirdi. Redux'a yazmıyoruz: balon sesi zaten yerel
          // dosyadan çalıyor, mediaUrl'e ihtiyacı yok.
          onUploaded: (mediaUrl) => {
            try {
              setVoiceMediaUrl(clientMessageId, mediaUrl);
            } catch {
              // Arşiv yazımı kozmetik: en kötü ihtimalle tekrar denemede
              // yeniden yükleriz.
            }
          },
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
    // Yaş sınırı kalktığı için (bkz. outboxPolicy.LATE_SEND_NOTICE_MS) eski bir
    // mesaj da sessizce gidebiliyor — "habersiz" kalmasın diye burada söylüyoruz.
    // Yalnız `silent`: interactive'te kullanıcı zaten ekranda, "tekrar dene"nin
    // sonucunu görüyor, ikinci bir toast gürültü olur. Tur başına BİR kez:
    // birikmiş yirmi mesajlık bir kuyruk yirmi toast açmasın.
    if (
      opts.mode === "silent" &&
      !roundLateNoticeShown &&
      d.sentAt &&
      isLateDelivery(utcTime(d.sentAt), Date.now())
    ) {
      roundLateNoticeShown = true;
      showInfoToast({ message: i18n.t("chat.send.lateDelivered") as string, variant: "info" });
    }
  } catch (err: any) {
    let fc = classifySendError(err, d.kind);
    // Tamamlanmış sandığımız yükleme ölmüş (UT-6605: S3 nesnesi 7 günlük yetim
    // temizliğine gitmiş). Anahtarı düşür → bir sonraki deneme 1. adımdan
    // başlar ve yerel dosyadan yeniden yükler. Yani görünüşte kalıcı olan hata
    // aslında geçici.
    if (needsVoiceReupload(d, fc)) {
      try {
        clearVoiceMediaUrl(d.clientMessageId);
      } catch {
        // Yazamadıysak tekrar deneme yine ölü anahtarla gider ve aynı koda
        // düşer — davranış eski hâline döner, kayıp yok.
      }
      fc = { ...fc, retryable: true, reason: "transient", toast: false };
      devLog("📮 [outbox] ses yüklemesi ölmüş, yeniden yüklenecek", d.clientMessageId);
    }
    handleFailure(d, fc, opts.mode, err);
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
  // `sendOutgoing`'in KENDİ çağrısı GEÇ KALIR: aşağıdaki `attempts.get` ondan
  // ÖNCE çalışıyor. Cold start'ta (hiçbir flush turu koşmadı → Map boş/
  // yüklenmemiş) bu satır olmadan `prev` HEP `undefined` bulunur, interactive'in
  // "backoff'u/permanent'i EZ" sözleşmesi tamamen atlanır ve disk'teki eski
  // `permanent`/yüksek `attempts` satırı AYNEN kalır — bir sonraki başarısız
  // denemede `touchEntry` o eski (ezilmemiş) kaydı büyütüp kalıcıya çevirebilir.
  // Kullanıcı açıkça "tekrar dene" dedi; bu satır olmadan İLK dokunuş sessizce
  // kaybolur (ikinci manuel dokunuş kurtarır, bu yüzden Critical değil Important).
  // Ayrıca: "cold start kotayı ikinci kez düşürmüyor" testinin dayandığı Map
  // doluşu da BU satırdan geliyor (o test `sendOutgoing`'in kendi çağrısını
  // AYIRT EDEMEZ, ikisi de burada aynı sonucu üretir — bkz. outboxPersistence.test.ts).
  loadAttemptsFromDisk();
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
    // olmamalı. `quotaCharged` korunuyor (çift düşme guard'ı — kullanıcının
    // "tekrar dene" demesi daha önce düşmüş kotayı GERİ VERMEZ).
    const prev = attempts.get(d.clientMessageId);
    if (prev) {
      prev.attempts = 0;
      prev.firstSeenAt = Date.now();
      prev.nextEligibleAt = 0;
      prev.origin = "throw";
      prev.permanent = false;
      // DİSKE DE yaz: yazmazsak diskte eski `permanent: 1`/yüksek `attempts`
      // satırı kalır. Gönderim TAM BU SIRADA kesilip uygulama kapanırsa
      // restart sonrası `failStalePendingSends` satırı `failed`e çevirir,
      // sessiz tur diskten okunan eski (ezilmemiş) muhasebeyle karşılaşır ve
      // `isEligible` `permanent`i görüp mesajı SONSUZA DEK atlar — kullanıcı
      // açıkça "tekrar dene" dediği mesajın bir daha hiç gönderilmemesi,
      // persistence öncesi (kayıt hiç yokken isEligible(undefined) true
      // dönerdi) durumdan daha kötü bir sonuç olurdu.
      rememberAttempt(d.clientMessageId, prev);
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

  // ⚠️ GUARD'LAR await'ten ÖNCE KAPANIR. Aşağıda yakalama turunu bekliyoruz;
  // `flushing` o await'ten sonra set edilse iki tetik (reconnect + foreground)
  // aynı tick'te kapıdan geçip İKİ tur başlatırdı.
  flushing = true;
  lastFlushAt = startedAt;
  roundNeedsConversationRefetch = false;
  roundRateLimited = false;
  roundLateNoticeShown = false;
  let sent = 0;
  let items: any[] = [];
  try {
    // Turun başında BİR kez: process yeni başladıysa `attempts` Map'i diskten
    // dolar (bayrak sonraki turlarda no-op yapıyor — bkz. loadAttemptsFromDisk).
    loadAttemptsFromDisk();

    // Yakalama turu varsa ÖNCE onu bekle; yoksa VE tabandan beri 10sn geçtiyse
    // `pullBeforeSend` yeni bir tur AÇAR (backend'in açık ricası). Sebep: delta
    // turu bizim mesajımızı geri getirdiğinde satır kendiliğinden `sent`e
    // dönüyor — ack'i kaybolmuş ama aslında gitmiş mesaj kuyruktan kendiliğinden
    // düşüyor. Önce yakalamak gereksiz bir `send` isteğini önlüyor: istek
    // idempotent ama dakikada 30'luk sayaç isteği reddetmeden ÖNCE artıyor,
    // yani mükerrer gönderim bir hak harcıyor.
    try {
      await pullBeforeSend();
    } catch {
      // Yakalama turu patladıysa gönderim turu yine de koşsun.
    }

    const state: any = store.getState();
    // Oturum yoksa denemenin anlamı yok; 401'e yanıp deneme hakkı yakardı.
    if (!state?.auth?.isAuthenticated) return;

    // İki kaynak: ekrandaki bucket'lar (canlı) + ARŞİV (tam). Disk şart, çünkü
    // bucket yalnız açılmış sohbetler için var — yeniden başlatmadan sonra
    // kullanıcı o sohbete girmedikçe oradaki başarısız mesaj hiçbir tura
    // görünmüyordu. Diskten gelenlerde YAŞ SINIRI YOK (2026-10-29'da kalktı,
    // bkz. outboxPolicy.LATE_SEND_NOTICE_MS yorumu): backend aynı
    // `clientMessageId`'yi mesaj satırı yaşadığı sürece (730 gün) idempotent
    // kabul ediyor, yani "çok eski" diye bir mesajı arşivden hiç çıkarmamak
    // için teknik bir sebep kalmadı. Eski sınırın ürün argümanı (habersiz
    // göndermemek) burada DEĞİL `sendOutgoing`'in başarı dalında çözülüyor.
    // Liste YAKALAMA TURUNDAN SONRA kuruluyor: delta'nın `sent`e çevirdiği
    // satırlar artık hiç görünmüyor.
    items = mergeFailedOutbox(selectFailedOutbox(state), readFailedOutboxFromLocal());
    pruneAttempts(items);
    if (!items.length) return;

    for (const m of items) {
      // Tur ortasında bağlantı giderse kalan mesajları boşuna yakma.
      if (isOfflineNow()) break;
      // Sunucu bu turda "yavaşla" dedi; gerisi bir sonraki tura kalsın.
      if (roundRateLimited) break;
      // Tur başına tavan. Sunucu sınırı dakikada 30; altında kalmak hem
      // kullanıcının o sırada elle yazdığı mesaja yer bırakıyor hem de
      // 40 mesajlık bir kuyruğun ilk turda 429 duvarına çarpmasını önlüyor.
      if (sent >= MAX_PER_FLUSH) break;
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

/**
 * Oturum kapanışı ve testler — bekleyen her şeyi bırak. DİSKE DOKUNMAZ: logout
 * temizliği `clearAllChatData`'nın işi (bkz. chatRepository). Testlerde bu
 * fonksiyon process ölümünü taklit etmek için kullanılıyor, bu yüzden
 * `loadedFromDisk` bayrağı da sıfırlanıyor — yoksa `loadAttemptsFromDisk`
 * ikinci kez hiçbir şey yapmaz ve "restart sonrası disk okunuyor" testi
 * aslında restart'tan ÖNCEki Map'i göreceği için hiçbir şey kanıtlamaz.
 */
export function resetOutbox(): void {
  for (const timer of ackTimers.values()) clearTimeout(timer);
  ackTimers.clear();
  attempts.clear();
  loadedFromDisk = false;
  if (wakeTimer) {
    clearTimeout(wakeTimer);
    wakeTimer = null;
  }
  flushing = false;
  lastFlushAt = 0;
  roundNeedsConversationRefetch = false;
  roundLateNoticeShown = false;
}
