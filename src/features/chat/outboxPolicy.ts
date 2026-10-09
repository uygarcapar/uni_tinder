/**
 * Outbox KARARLARI — saf fonksiyonlar, yan etki YOK.
 *
 * Ayrı dosya olmasının tek sebebi test edilebilirlik: gönderim servisinin
 * (outbox.ts) store'a, ağa ve zamanlayıcıya dokunan tarafından ayrıldığında
 * geriye kalan her şey "girdi → çıktı" hâline geliyor ve jest'te gerçek
 * store/mock zinciri kurmadan doğrulanabiliyor.
 *
 * Buradaki `classifySendError` aynı zamanda bir BİRLEŞTİRME: hata sınıflandırması
 * ChatScreen'de metin ve ses dallarında iki kopya hâlinde yaşıyordu ve çoktan
 * ayrışmıştı (metin yalnız UT kodu varken toast gösteriyor, ses her zaman).
 * Tek tablo olmadan outbox üçüncü kopyayı doğurur.
 */
import { VoiceTooLargeError } from "@/features/chat/voiceSend";
import { isVoiceMessage, voiceErrorCode } from "@/features/chat/voiceMessage";
import { chatErrorCodeOf, chatErrorEffect } from "@/shared/constants/responseCodes";
import { utcTime } from "@/shared/utils/dateUtc";

/**
 * `interactive` = kullanıcı fiilen o sohbette ve bu gönderimi kendisi tetikledi
 * (composer, öneri, "tekrar dene" butonu). `silent` = outbox'ın arka plan turu.
 * Fark yalnız YAN ETKİLERDE: kanonik state ikisinde de aynı güncelleniyor,
 * kullanıcıyı rahatsız eden her şey (toast, paywall, yönlendirme) sessiz modda
 * kapalı.
 */
export type SendMode = "interactive" | "silent";

/**
 * Başarısızlığın KAYNAĞI — sessiz yeniden denemeye izin verilip verilmeyeceğini
 * bu belirliyor.
 *
 *  throw      → istek istisna fırlattı, yani sunucuya ULAŞMADIĞINI biliyoruz.
 *  ackTimeout → hub invoke'u çözüldü ama 12 saniyede ack gelmedi. Bu "mesaj
 *               gitmedi" DEĞİL, "geri dönüş gelmedi" demek: sunucu işlemiş ama
 *               `MessageSent` broadcast'i kaybolmuş olabilir.
 *
 * Ayrım artık YALNIZ TEŞHİS İÇİN. Eskiden `ackTimeout` sessiz yeniden denemeyi
 * tamamen kapatıyordu, çünkü aynı mesajı tekrar göndermek çift mesaj riskiydi.
 * Backend 2026-10-06'da sözleşmeyi dondurdu: `(SenderId, ClientMessageId)`
 * üzerinde filtreli UNIQUE index var, aynı cmid ile gelen ikinci istek yeni
 * satır YARATMIYOR — var olan mesajın DTO'sunu döndürüyor, kota bir kez
 * düşüyor, karşı tarafa bir kez event gidiyor ve garanti zaman penceresine
 * değil index'e dayanıyor. Yani tekrar denemek artık güvenli ve kısıt kalktı.
 */
export type FailOrigin = "throw" | "ackTimeout";

/** Ağ katmanına gidecek minimum bilgi — Redux mesajından türetilir. */
export type OutgoingDescriptor =
  | {
      kind: "text";
      conversationId: string;
      clientMessageId: string;
      content: string;
      replyToMessageId?: string | null;
    }
  | {
      kind: "voice";
      conversationId: string;
      clientMessageId: string;
      /** Yerel kayıt. `mediaUrl` varsa boş olabilir (dosya düşmüş olsa da gider). */
      localUri: string | null;
      /** Tamamlanmış yüklemenin kalıcı anahtarı — varsa dosya tekrar yüklenmez. */
      mediaUrl: string | null;
      durationMs: number;
      waveformPeaks?: string | null;
      replyToMessageId?: string | null;
    };

export type FailureReason =
  | "quota"
  | "conversationGone"
  | "inputInvalid"
  | "voiceInvalid"
  | "voiceFileGone"
  /**
   * Sunucu "yavaşla" diyor (429 / `RATE_LIMITED`). `transient`ten AYRI bir
   * sınıf, çünkü tek farkı mesaja değil TURA ait olması: aynı turda kalan
   * mesajları denemek aynı cevabı alır ve hepsinin deneme hakkını yakar.
   * Çağıran bu sınıfı görünce turu kesiyor (bkz. outbox.flushOutbox).
   */
  | "rateLimited"
  | "transient";

export type FailureClass = {
  /** false → otomatik yeniden deneme YOK (elle buton yine çalışır). */
  retryable: boolean;
  reason: FailureReason;
  /** UT-67xx / UT-68xx (sohbet ailesi) — yoksa null. */
  chatCode: string | null;
  /** UT-66xx (sesin kendisi) — yoksa null. */
  voiceCode: string | null;
  /** Toast metninin fallback anahtarı. */
  i18nKey: string;
  /** interactive modda toast gösterilsin mi (metin yolu yalnız kodluyken gösteriyordu). */
  toast: boolean;
  deactivateConversation: boolean;
  refetchConversations: boolean;
};

export type AttemptEntry = {
  attempts: number;
  firstSeenAt: number;
  nextEligibleAt: number;
  origin: FailOrigin;
  /** Kalıcı hata ya da tavan doldu → sessiz denemeler durur. */
  permanent: boolean;
  /** `decrementQuotaLocally` bu mesaj için atıldı mı (çift düşmeyi engeller). */
  quotaCharged: boolean;
};

/** Sessiz denemenin tavanı. Aşılınca balon `_failed` kalır, elle buton çalışır. */
export const MAX_ATTEMPTS = 5;
/**
 * Yarım saattir gitmeyen mesajı otomatik denemeyi bırak — OTURUM İÇİ ölçü:
 * sayaç mesajı ilk gördüğümüz andan (`firstSeenAt`) işliyor.
 */
export const MAX_AGE_MS = 30 * 60_000;
/**
 * DİSKTEN bulunan başarısız mesajın sessiz tura girebileceği en büyük yaş —
 * ölçü mesajın KENDİ `sentAt`'i, çünkü `firstSeenAt` yeniden başlatmadan sonra
 * "şimdi" olur ve yaş sınırı anlamını yitirirdi.
 *
 * 2 saat bir ÜRÜN kararı, teknik bir sınır değil: kullanıcının sabah yazıp
 * gitmediğini gördüğü bir mesajı akşam habersiz göndermek doğru olmaz. Elle
 * "tekrar dene" bu sınıra TABİ DEĞİL (interactive her şeyi ezer) — yani eski
 * bir mesaj hiçbir zaman gönderilemez hâle gelmiyor, yalnız kararı kullanıcı
 * veriyor.
 */
export const OUTBOX_DISK_MAX_AGE_MS = 2 * 60 * 60_000;
/**
 * Tek sessiz turda denenecek en çok mesaj. Sunucu sınırı **dakikada 30**
 * (HTTP ve hub için ayrı ayrı); altında kalmak hem o sırada kullanıcının elle
 * yazdığı mesaja yer bırakıyor hem de birikmiş bir kuyruğun ilk turda 429
 * duvarına çarpıp her mesajın deneme hakkını yakmasını önlüyor. Kalanlar bir
 * sonraki tura kalıyor (tetikler: ağ, foreground, reconnect, backoff timer'ı).
 */
export const MAX_PER_FLUSH = 20;
const BACKOFF_BASE_MS = 4_000;
const BACKOFF_MAX_MS = 60_000;

/** 4 / 8 / 16 / 32 / 60 saniye. */
export function backoffDelayMs(attempts: number): number {
  const n = Math.max(1, attempts);
  return Math.min(BACKOFF_BASE_MS * 2 ** (n - 1), BACKOFF_MAX_MS);
}

/**
 * Gövdedeki HAM kod — UT ailesine filtrelenmemiş hâli.
 *
 * `chatErrorCodeOf` yalnız `UT-67xx`/`UT-68xx` döndürüyor; hub'ın eski stil
 * string kodları (`RATE_LIMITED`, `CONVERSATION_ERROR`, …) oradan geçmiyor.
 */
function rawErrorCode(err: any): string | null {
  const data = err?.response?.data ?? err;
  for (const raw of [data?.code, data?.errorCode, data?.result?.code]) {
    if (typeof raw === "string" && raw) return raw;
  }
  return null;
}

/**
 * Hata → ne yapılacağı. KARAR SIRASI ÖNEMLİ:
 *   1. kota (402 / paywallType) — gövdede UT kodu da olsa bu dal kazanır,
 *      çünkü kullanıcıya gösterilecek şey paywall, hata metni değil.
 *   2. sohbet kodu (UT-67xx/68xx) — sunucu ne olduğunu söylüyorsa status'a
 *      BAKILMAZ: aynı hata uca göre 400/404 dönebiliyordu, sözleşme bunu
 *      düzeltti.
 *   3. ses kodu (UT-66xx) + yerel dosya hataları — yalnız ses yolunda.
 *   4. status yedeği — kodsuz gövde = eski sunucu.
 *   5. geri kalan her şey geçici (ağ hatası, 5xx, timeout).
 */
export function classifySendError(err: any, kind: "text" | "voice"): FailureClass {
  const status = err?.response?.status;
  const paywallType = err?.response?.data?.result?.paywallType;
  const chatCode = chatErrorCodeOf(err);
  const effect = chatErrorEffect(chatCode);
  const isVoice = kind === "voice";
  const base = {
    chatCode,
    voiceCode: null as string | null,
    deactivateConversation: false,
    refetchConversations: false,
  };

  // 429 ile 402 ayrı şeyler: kotayla karıştırılırsa paywall açılırdı. REST bunu
  // status ile söylüyor, hub ise ESKİ STİL string kodla (`RATE_LIMITED`) — o
  // yüzden `chatErrorCodeOf` DEĞİL `rawErrorCode`: ilki yalnız UT-67xx/68xx
  // döndürüyor ve string kodlar oradan hiç geçmiyor.
  if (status === 429 || rawErrorCode(err) === "RATE_LIMITED") {
    return {
      ...base,
      retryable: true,
      reason: "rateLimited",
      i18nKey: isVoice ? "chat.voice.sendFailed" : "chat.send.failed",
      // Kullanıcıya gösterilecek bir şey yok: mesaj birazdan kendiliğinden
      // gidiyor, "yavaşla" bizim iç meselemiz.
      toast: false,
    };
  }

  if (status === 402 || paywallType === "CHAT_QUOTA_EXHAUSTED") {
    return {
      ...base,
      retryable: false,
      reason: "quota",
      i18nKey: isVoice ? "chat.voice.sendFailed" : "chat.send.failed",
      // Kotada kullanıcıya gösterilen şey paywall; toast ikinci bir gürültü olurdu.
      toast: false,
    };
  }

  if (effect === "conversationGone") {
    return {
      ...base,
      retryable: false,
      reason: "conversationGone",
      i18nKey: isVoice ? "chat.voice.sendFailed" : "chat.send.failed",
      toast: true,
      deactivateConversation: true,
      refetchConversations: true,
    };
  }

  if (effect === "inputInvalid" || effect === "actionRejected" || effect === "clientBug") {
    return {
      ...base,
      retryable: false,
      reason: "inputInvalid",
      i18nKey: isVoice ? "chat.voice.sendFailed" : "chat.send.failed",
      toast: true,
    };
  }

  if (isVoice) {
    // Yerel dosya yoksa/boşsa (voiceSend ağa hiç çıkmadan fırlatıyor) yeniden
    // denemenin anlamı yok: dosya geri gelmeyecek.
    const message = typeof err?.message === "string" ? err.message : "";
    if (message === "voice-file-missing" || message === "voice-file-empty") {
      return {
        ...base,
        retryable: false,
        reason: "voiceFileGone",
        i18nKey: "chat.voice.sendFailed",
        toast: true,
      };
    }
    // VoiceTooLargeError ağa çıkmadan fırlıyor, sunucudaki karşılığı UT-6602.
    const voiceCode = err instanceof VoiceTooLargeError ? "UT-6602" : voiceErrorCode(err);
    if (voiceCode) {
      return {
        ...base,
        voiceCode,
        retryable: false,
        reason: "voiceInvalid",
        i18nKey:
          voiceCode === "UT-6603"
            ? "chat.voice.maxDuration"
            : voiceCode === "UT-6602"
              ? "chat.voice.tooLarge"
              : voiceCode === "UT-6601"
                ? "chat.voice.badFormat"
                : "chat.voice.sendFailed",
        toast: true,
      };
    }
  }

  // Kodsuz status yedeği. 403/404 → sohbet gitmiş; 400 tek başına altı ayrı
  // sebebi ayırt etmiyor, o yüzden yerel bayrağı çevirmeyip listeyi sunucudan
  // doğrulatıyoruz. Üçü de kalıcı: aynı isteği tekrar atmak aynı cevabı verir.
  if (!chatCode && (status === 403 || status === 404)) {
    return {
      ...base,
      retryable: false,
      reason: "conversationGone",
      i18nKey: isVoice ? "chat.voice.sendFailed" : "chat.send.failed",
      toast: isVoice,
      deactivateConversation: true,
      refetchConversations: true,
    };
  }
  if (!chatCode && status === 400) {
    return {
      ...base,
      retryable: false,
      reason: "inputInvalid",
      i18nKey: isVoice ? "chat.voice.sendFailed" : "chat.send.failed",
      toast: isVoice,
      refetchConversations: true,
    };
  }

  return {
    ...base,
    retryable: true,
    reason: "transient",
    i18nKey: isVoice ? "chat.voice.sendFailed" : "chat.send.failed",
    // Metin yolu KODSUZ hatada toast GÖSTERMİYOR (balonun kırmızıya dönmesi
    // yeterli geri bildirim), kod varsa gösteriyor; ses yolu her hâlükârda
    // gösteriyor. İkisinin de bugünkü davranışı korunuyor. Buraya kod ile
    // düşmenin tek yolu TANINMAYAN bir UT-67xx (effect tablosunda yok).
    toast: isVoice || !!chatCode,
  };
}

/**
 * Redux mesajından (ya da diskten projekte edilmiş satırdan) gönderilebilir
 * tanım. `null` → bu mesaj yeniden gönderilemez.
 *
 * Ses için `_localUri` VEYA `mediaUrl` şart:
 *  - `mediaUrl` varsa yükleme TAMAMLANMIŞ, yalnız `send` tekrarlanacak; yerel
 *    dosya hiç gerekmiyor (iOS cache'i boşaltmış olsa bile mesaj gider).
 *  - İkisi de yoksa yeniden deneme imkânsız: mesaj sessizce metin yoluna düşüp
 *    `content: ""` gönderiyordu, sunucu UT-6710 veriyordu ve balon bir daha hiç
 *    düzelmiyordu.
 */
export function messageToDescriptor(m: any): OutgoingDescriptor | null {
  const conversationId = m?.conversationId;
  const clientMessageId = m?.clientMessageId;
  if (!conversationId || !clientMessageId) return null;
  const replyToMessageId = m?.replyTo?.id ?? null;

  if (isVoiceMessage(m?.contentType)) {
    const localUri = typeof m?._localUri === "string" && m._localUri ? m._localUri : null;
    const mediaUrl = typeof m?.mediaUrl === "string" && m.mediaUrl ? m.mediaUrl : null;
    if (!localUri && !mediaUrl) return null;
    return {
      kind: "voice",
      conversationId,
      clientMessageId,
      localUri,
      mediaUrl,
      durationMs: Number(m?.durationMs) || 0,
      waveformPeaks: m?.waveformPeaks ?? undefined,
      replyToMessageId,
    };
  }

  const content = typeof m?.content === "string" ? m.content : "";
  if (!content.trim()) return null;
  return { kind: "text", conversationId, clientMessageId, content, replyToMessageId };
}

/**
 * TÜM sohbetlerdeki başarısız mesajlar, ESKİDEN YENİYE.
 *
 * Bucket'lar en yeniden eskiye dizili; tek sohbetlik eski çözüm diziyi ters
 * geziyordu. Çok sohbetli taramada doğru genelleme tek bir `sentAt` sıralaması:
 * ağ kısmı zaten global FIFO kuyruktan geçtiği için (bkz. sendQueue) sunucudaki
 * `sentAt` damgaları da bu sırayla düşüyor, yani sohbet içi sıra korunuyor.
 */
export function selectFailedOutbox(state: any): any[] {
  const byConv = state?.chat?.messagesByConv;
  if (!byConv) return [];
  const out: any[] = [];
  for (const convId of Object.keys(byConv)) {
    const messages = byConv[convId]?.messages;
    if (!Array.isArray(messages)) continue;
    for (const m of messages) {
      if (m?._failed && m?.clientMessageId) out.push(m);
    }
  }
  return out.sort((a, b) => utcTime(a.sentAt) - utcTime(b.sentAt));
}

/**
 * Redux bucket'larından ve DİSKTEN gelen başarısız mesajları tek listeye
 * indirger — `clientMessageId` ile tekilleştirip ESKİDEN YENİYE sıralar.
 *
 * Neden iki kaynak: disk tam (tüm sohbetler, yeniden başlatmadan sonra da),
 * Redux ise CANLI (bu saniyede başarısız olmuş ve henüz aynaya yazılmamış bir
 * satır ya da aynanın yutulmuş bir hatası yüzünden diskte 'failed' görünmeyen
 * bir mesaj yalnız orada). Biri diğerinin yerine geçmiyor.
 *
 * Çakışmada REDUX kazanıyor: ekrandaki nesne kullanıcının gördüğü hâl ve
 * oturum içi alanları (`_pending` geçişleri) onda taze. Projeksiyon aynı kimlik
 * haritasından geçtiği için çoğu zaman iki taraf AYNI NESNE zaten.
 */
export function mergeFailedOutbox(fromRedux: any[], fromDisk: any[]): any[] {
  const byClientId = new Map<string, any>();
  for (const m of fromRedux) {
    if (m?.clientMessageId) byClientId.set(m.clientMessageId, m);
  }
  for (const m of fromDisk) {
    const cmid = m?.clientMessageId;
    if (!cmid || byClientId.has(cmid)) continue;
    byClientId.set(cmid, m);
  }
  return Array.from(byClientId.values()).sort(
    (a, b) => utcTime(a.sentAt) - utcTime(b.sentAt),
  );
}

/** Yükleme tamamlanmamış / nesne yok. Sesin UT-66xx ailesinden. */
export const VOICE_UPLOAD_NOT_COMPLETED = "UT-6605";

/**
 * "Elimizdeki `mediaUrl` ölü mü?" — UT-6605 + daha önce tamamlanmış bir
 * yükleme anahtarıyla gönderdiysek evet: S3 nesnesi silinmiş (backend yetim
 * nesneleri 7 günde temizliyor).
 *
 * Bu, görünüşte KALICI bir hatanın (voiceInvalid) aslında kurtarılabilir
 * olduğu tek durum: anahtarı düşürüp yerel dosyadan yeniden yüklemek yeterli.
 * Yerel dosya da yoksa kurtarma yok — o zaman gerçekten kalıcı.
 */
export function needsVoiceReupload(d: OutgoingDescriptor, fc: FailureClass): boolean {
  return (
    d.kind === "voice" &&
    !!d.mediaUrl &&
    !!d.localUri &&
    fc.voiceCode === VOICE_UPLOAD_NOT_COMPLETED
  );
}

/**
 * Bu mesaj ŞİMDİ denenebilir mi?
 *
 * `interactive` her şeyi ezer: kullanıcı butona bastıysa backoff da, tavan da,
 * `permanent` de bağlayıcı değil — elle buton asla ölü olmamalı.
 */
export function isEligible(
  entry: AttemptEntry | undefined,
  now: number,
  mode: SendMode,
): boolean {
  if (mode === "interactive") return true;
  if (!entry) return true;
  if (entry.permanent) return false;
  // `origin === "ackTimeout"` KAPISI KALDIRILDI (2026-10-06): send artık
  // cmid üzerinden idempotent (gerekçe: FailOrigin). Ack'i görülmemiş gönderim
  // de sessizce denenebiliyor — "uygulamayı kapattım, mesaj kendi kendine
  // gitti" davranışının kilidi buydu.
  if (entry.attempts >= MAX_ATTEMPTS) return false;
  if (now - entry.firstSeenAt > MAX_AGE_MS) return false;
  return now >= entry.nextEligibleAt;
}
