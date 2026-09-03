/**
 * Sesli mesaj sözleşmesi — TEK KAYNAK (backend rehberi, 2026-08-31).
 *
 * Kayıt (useVoiceRecorder), gönderim (voiceSend), balon (VoiceBubble) ve
 * oynatma (voicePlayback) buradaki sabitlerden beslenir; sunucu sınırları
 * birden fazla yerde tekrarlanırsa ayrışıp UT-66xx hatalarına dönüşür.
 */

/** Sunucu tavanı. 60.000 ms'yi AŞAN kayıt reddedilir (UT-6603). */
export const VOICE_MAX_MS = 60_000;

/**
 * İstemci tarafı taban: basılı tutmayı yeni öğrenen kullanıcının yanlışlıkla
 * dokunuşu (< yarım saniye) mesaj değil kazadır — sunucuya gitmeden atılır.
 * Sunucunun kendi sınırı 1 ms, yani bu tamamen bizim UX kararımız.
 */
export const VOICE_MIN_MS = 700;

/** Sunucu tavanı — aşılırsa UT-6602. */
export const VOICE_MAX_BYTES = 5 * 1024 * 1024;

/**
 * Yükleme MIME'ı. Rehberdeki desteklenen liste: audio/mp4 (m4a), audio/aac,
 * audio/mpeg, audio/ogg, audio/webm. Kayıt her iki platformda da .m4a üretiyor
 * → kabın standart MIME'ı audio/mp4. DİKKAT: adım 1'de bildirilen değer ile
 * S3'e PUT ederken gönderilen `Content-Type` BİREBİR aynı olmak zorunda
 * (imzaya dahil), o yüzden ikisi de bu sabitten okunur.
 */
export const VOICE_MIME = "audio/mp4";

/** MessageContentType.Voice — DTO'da sayı da gelebiliyor (bkz. isVoiceMessage). */
export const VOICE_CONTENT_TYPE = 2;

/**
 * Kayıt sırasında toplanan seviye örneklerinin dalga formuna indirgeneceği
 * nokta sayısı. Sunucu 64'ten fazlasını kırpıyor; 48 hem balona sığan hem de
 * kırpılmayan bir değer.
 */
export const VOICE_PEAK_COUNT = 48;

/**
 * Seviye örnekleme periyodu — dalga formu çözünürlüğü ve süre sayacı buradan.
 *
 * 20 örnek/sn (eskiden 10): canlı dalga saniyede 10 kez sıçradığında çubuklar
 * arası geçiş animasyonlu olsa bile kaynak veri seyrek kaldığı için hareket
 * basamaklı okunuyordu. Ticker JS thread'inde dönüyor ama tek iş yapıyor
 * (getStatus + dizi kaydırma), render ise yalnız SANİYE değişince tetikleniyor
 * (bkz. useVoiceRecorder) — iki katına çıkan tek şey örnek sayısı.
 * `encodeWaveformPeaks` örnekleri zaten VOICE_PEAK_COUNT kovaya indirgediği
 * için sunucuya giden dalga formunun boyu DEĞİŞMEZ.
 */
export const VOICE_TICK_MS = 50;

/**
 * Ölçülen örnekleme periyodunun sayılacağı TAVAN. Ticker JS thread'inde dönüyor;
 * liste kaydırılırken 50ms'lik tur 150-200ms'ye kadar uzayabiliyor ve canlı
 * dalganın kayma animasyonu bu ölçüye uyum sağlıyor (bkz. useVoiceRecorder >
 * tickMs). Tavan olmasa tek bir uzun donma (uygulama arkaya düşüp dönmek gibi)
 * kaymayı saniyelerce sürecek bir sürüklenmeye çevirirdi.
 */
export const VOICE_TICK_MAX_MS = 400;

const clampPeak = (n: number) => Math.max(0, Math.min(100, Math.round(n)));

/**
 * Backend enum'u DTO'da sayı (2) ya da isim ("Voice") olarak gelebiliyor —
 * ReplyPreview'daki mediaLabel ile aynı tolerans (bkz. api wire sözleşmesi).
 */
export function isVoiceMessage(contentType: any): boolean {
  if (contentType === VOICE_CONTENT_TYPE) return true;
  if (typeof contentType === "string") {
    return contentType === "2" || contentType.toLowerCase() === "voice";
  }
  return false;
}

/** 7500 → "0:07". Saat gösterimi yok, tavan zaten 60 saniye. */
export function formatVoiceDuration(ms: number): string {
  const total = Math.max(0, Math.round(ms / 1000));
  const m = Math.floor(total / 60);
  const s = total % 60;
  return `${m}:${String(s).padStart(2, "0")}`;
}

/**
 * dBFS metering değerini 0-100 aralığına taşır. iOS/Android -160..0 dB
 * bildiriyor; konuşma pratikte -40..-5 dB arasında geziyor, o yüzden taban
 * -50 dB (altı sessizlik sayılır) — -160'ı tabana almak tüm konuşmayı
 * çubukların en üstüne sıkıştırırdı.
 */
export function meteringToLevel(db?: number | null): number {
  if (db == null || !Number.isFinite(db)) return 0;
  const FLOOR = -50;
  if (db <= FLOOR) return 0;
  if (db >= 0) return 100;
  return clampPeak(((db - FLOOR) / -FLOOR) * 100);
}

/**
 * Örnek dizisini sunucunun beklediği "0,12,47,…" biçimine indirger: VOICE_PEAK_COUNT
 * kovaya bölüp her kovanın ortalamasını alır. Örnek sayısı hedeften azsa
 * (çok kısa kayıt) değerler tekrarlanır — çubuklar yine tüm genişliğe yayılır.
 *
 * Boş dizide `undefined` döner: alan hiç gönderilmez, sunucu null kaydeder ve
 * balon düz çubuk çizer (bozuk veri göndermek de aynı sonucu verirdi ama
 * sessizce; niyeti açık bırakıyoruz).
 */
export function encodeWaveformPeaks(
  levels: number[],
  count = VOICE_PEAK_COUNT,
): string | undefined {
  if (!levels.length) return undefined;
  const out: number[] = [];
  const bucket = levels.length / count;
  for (let i = 0; i < count; i++) {
    const from = Math.floor(i * bucket);
    const to = Math.max(from + 1, Math.floor((i + 1) * bucket));
    let sum = 0;
    let n = 0;
    for (let j = from; j < to && j < levels.length; j++) {
      sum += levels[j];
      n++;
    }
    out.push(n ? clampPeak(sum / n) : 0);
  }
  return out.join(",");
}

/**
 * "0,12,47,…" → [0,12,47,…]. Alan null/bozuk gelebilir (sunucu bozuk veriyi
 * hata vermeden null'a çeviriyor) → boş dizi, çağıran düz çubuk çizer.
 */
export function parseWaveformPeaks(raw?: string | null): number[] {
  if (!raw || typeof raw !== "string") return [];
  const out: number[] = [];
  for (const part of raw.split(",")) {
    const n = Number(part);
    if (Number.isFinite(n)) out.push(clampPeak(n));
  }
  return out;
}

/**
 * UT-66xx hata kodunu API hatasından çıkarır. Switch DAİMA kod üzerinden
 * yapılmalı (rehber): HTTP durumu 400'de altı farklı sebebi ayırt etmiyor.
 */
export function voiceErrorCode(err: any): string | null {
  const data = err?.response?.data;
  const code = data?.code ?? data?.errorCode ?? data?.result?.code ?? null;
  return typeof code === "string" && code.startsWith("UT-66") ? code : null;
}
