/**
 * send-verification / resend yanıtlarındaki `retryAfterSeconds` alanını okur.
 *
 * Backend bu alanı CODE_PENDING (ve CODE_SENT) durumlarında döndürür: yeni bir
 * kod istenebilmesi için kaç saniye beklenmesi gerektiğini söyler. Alan gelmezse
 * `undefined` döner ve çağıran taraf kendi varsayılanına düşer — yani alanı hiç
 * göndermeyen bir backend ile de akış bozulmaz.
 */
export function parseRetryAfterSeconds(payload: any): number | undefined {
  const raw = payload?.result?.retryAfterSeconds ?? payload?.retryAfterSeconds;
  const seconds = typeof raw === "string" ? Number(raw) : raw;
  if (typeof seconds !== "number" || !Number.isFinite(seconds) || seconds <= 0) {
    return undefined;
  }
  return Math.ceil(seconds);
}
