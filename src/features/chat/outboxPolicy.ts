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
 *               `MessageSent` broadcast'i kaybolmuş olabilir. Sessizce yeniden
 *               göndermek mesajı İKİ KEZ yollama riski taşıyor, o yüzden bu
 *               kaynak yalnız kullanıcı elle bastığında denenir (bugünkü
 *               davranışın aynısı). Backend'in `clientMessageId` üzerinden
 *               idempotent olduğu doğrulanırsa kısıt kaldırılabilir.
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
      localUri: string;
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
 * Yarım saattir gitmeyen mesajı otomatik denemeyi bırak. `consumableRedeem`'in
 * 7 günlük yaş sınırının oturum ölçekli karşılığı — kuyruk kalıcı olmadığı için
 * (uygulama kapanınca zaten kayboluyor) gün ölçeğinde bir sınırın anlamı yok.
 */
export const MAX_AGE_MS = 30 * 60_000;
const BACKOFF_BASE_MS = 4_000;
const BACKOFF_MAX_MS = 60_000;

/** 4 / 8 / 16 / 32 / 60 saniye. */
export function backoffDelayMs(attempts: number): number {
  const n = Math.max(1, attempts);
  return Math.min(BACKOFF_BASE_MS * 2 ** (n - 1), BACKOFF_MAX_MS);
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
 * Redux mesajından gönderilebilir tanım. `null` → bu mesaj yeniden gönderilemez.
 *
 * Ses için `_localUri` ŞART: dosya düşmüşse (uygulama yeniden başlamış, cache
 * temizlenmiş) mesaj sessizce metin yoluna düşüp `content: ""` gönderiyordu —
 * sunucu UT-6710 veriyor ve balon bir daha hiç düzelmiyordu.
 */
export function messageToDescriptor(m: any): OutgoingDescriptor | null {
  const conversationId = m?.conversationId;
  const clientMessageId = m?.clientMessageId;
  if (!conversationId || !clientMessageId) return null;
  const replyToMessageId = m?.replyTo?.id ?? null;

  if (isVoiceMessage(m?.contentType)) {
    const localUri = m?._localUri;
    if (typeof localUri !== "string" || !localUri) return null;
    return {
      kind: "voice",
      conversationId,
      clientMessageId,
      localUri,
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
  if (entry.origin === "ackTimeout") return false;
  if (entry.attempts >= MAX_ATTEMPTS) return false;
  if (now - entry.firstSeenAt > MAX_AGE_MS) return false;
  return now >= entry.nextEligibleAt;
}
