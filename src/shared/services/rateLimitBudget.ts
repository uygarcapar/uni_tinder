/**
 * `MessagesController`'ın tek kovalı rate limit bütçesi için TEK kaynak.
 *
 * NEDEN bu modül var: backend `[RateLimit("messaging_default")]`'ı sınıf
 * seviyesinde uyguluyor — mesaj geçmişi, `/changes`, reveal-history, silme ve
 * reaksiyon uçları aynı 200 istek/60 sn kovasını paylaşıyor. Sunucu kalanı
 * `X-RateLimit-Remaining` header'ında bildiriyor ama `api.ts`'in başarı
 * interceptor'ı `(response) => response.data` olduğu için istemci bugüne
 * kadar bu header'ı göremiyordu. Dönüş şeklini değiştirmek onlarca çağrı
 * yerini kırar; bunun yerine interceptor header'ları buraya YAZAR, kendisi
 * yine `response.data` döndürmeye devam eder (bkz. api.ts response
 * interceptor'ındaki tek satır).
 *
 * Defteri YALNIZ `/api/messages/` istekleri besliyor (interceptor'daki
 * `isMessagingBucketRequest` kapısı): `X-RateLimit-Remaining` kova başına bir
 * sayı, bu defter ise tek sayı — başka bir controller'ın kalanını buraya
 * yazmak "bol kota var" yanılgısı üretirdi.
 *
 * `networkStatus.ts`'teki modül-içi tek-kaynak kalıbının aynısı — ama React
 * aboneliği YOK: kimse bu değeri render etmiyor, yalnız `chatBackfill.ts`'in
 * turu imperatif olarak okuyor.
 */

let remaining: number | null = null;

/**
 * Yanıt başlıklarından kalan kotayı okuyup saklar.
 *
 * `headers` axios'ta genelde lowercase gelir ama bu fonksiyonu çağıran her
 * yer axios garantisine güvenmek zorunda değil (mock'lar, ileride başka bir
 * istemci) — bu yüzden anahtar aranırken case-insensitive bakılıyor.
 *
 * Header hiç yoksa, ilgili alan eksikse ya da sayıya çevrilemiyorsa bütçe
 * BİLİNMİYOR sayılır ve `null`a döner — önceki bilinen değer bile tutulmaz,
 * çünkü "iki istek önce 150 kalmıştı" artık doğru olmayabilir (başka bir
 * istek araya girip kovayı tüketmiş olabilir).
 */
export function recordRateLimitHeaders(headers: Record<string, unknown> | undefined): void {
  if (!headers) {
    remaining = null;
    return;
  }

  const key = Object.keys(headers).find((k) => k.toLowerCase() === 'x-ratelimit-remaining');
  const raw = key ? headers[key] : undefined;
  // Boş/boşluk string'i Number() sessizce 0'a çevirir — "değer yok" ile
  // "kota tükendi"yi karıştırmamak için önce elenir.
  const hasValue = typeof raw === 'number' || (typeof raw === 'string' && raw.trim() !== '');
  const parsed = hasValue ? Number(raw) : NaN;

  remaining = Number.isFinite(parsed) ? parsed : null;
}

/**
 * Kalan kota. `null` = bilinmiyor — henüz hiç yanıt gelmedi ya da son yanıt
 * header'ı taşımıyordu. Çağıran taraf bunu "bol kota var" diye OKUMAMALI;
 * tasarım kararı tam olarak bu ayrımı canlı tutmak (bkz. backfill'in
 * `null` iken en fazla bir prob sayfası çekme kuralı).
 */
export function remainingNow(): number | null {
  return remaining;
}

/** Testler arası sızıntıyı önlemek için — yalnız test dosyalarından çağrılır. */
export function __resetRateLimitBudgetForTests(): void {
  remaining = null;
}
