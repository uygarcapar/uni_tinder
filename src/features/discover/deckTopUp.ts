/**
 * Deste BİTMEDEN takviye (top-up) kararı.
 *
 * ── Sorun ──────────────────────────────────────────────────────────────────
 * Sayfa boyu 10. Kullanıcı 10 kartı bitirince EmptyDiscoverCard (radar)
 * açılıyor, yeni profiller ancak boş-deste yoklaması (5sn'lik interval) ilk
 * tick'ini atınca geliyordu. Yani "deste bitti" ile "yeni kartlar" arasında en
 * az 5sn + istek süresi kadar boşluk vardı ve kullanıcı bu boşlukta hiç
 * olmayan bir "kimse kalmadı" ekranı görüyordu.
 *
 * Eski takviye yalnız `fetchNextPage` biliyordu; `hasNextPage` false dönen
 * (backend havuzu tek sayfa sunduğunda ya da 2. sayfa boş geldiğinde) durumda
 * hiçbir şey yapmıyordu — asıl yaşanan senaryo da buydu.
 *
 * ── Karar ──────────────────────────────────────────────────────────────────
 * Kuyrukta TOP_UP_THRESHOLD veya daha az kart kaldıysa:
 *   - sonraki sayfa varsa   → "next-page" (ucuz, sayfayı sona ekler),
 *   - yoksa                 → "refetch" (1. sayfa yeniden çekilir).
 *
 * Refetch neden yeni profil getirir: backend swipe edilenleri havuzdan (Redis
 * ZSET) ZREM ile ELİYOR ama havuzu invalidate ETMİYOR (sıra bozulmasın diye).
 * k kart swipe edildikten sonra 1. sayfa = havuzun k'ıncı elemanından itibaren
 * → k tanesi bizde olmayan yeni profil. Boş deste yoklaması da tam olarak bunu
 * yapıyor; buradaki fark, deste sıfırlanmadan ÖNCE yapması.
 *
 * Sınırı da bilerek yazıyoruz: havuz tükenmeden yeni aday ÜRETİLMİYOR. Taze
 * havuz ancak cache-miss'te doğuyor — havuz tamamen boşalınca, 15dk TTL
 * dolunca ya da invalidate eden bir olayda (filtre/profil/konum/premium
 * değişimi, match, unmatch, report, undo). Yani kuyruk >0 iken atılan refetch
 * sadece "havuzda kalan var mı" sorusudur; kuyruk 0 iken atılan ise havuzu
 * yeniden ÜRETTİREN istektir. İkincisi bu yüzden cooldown'a takılmıyor:
 * 5 kartı 4 saniyeden kısa sürede bitirmek çok olağan ve tam da işe yarayan
 * istek geciktirilirse radar ekranı geri gelir.
 *
 * ── Sonsuz döngü koruması ──────────────────────────────────────────────────
 * Bu karar kendi sonucunu tetikleyebilir (fetch → data değişir → tekrar karar).
 * Guard, denemenin yapıldığı andaki KUYRUK İMZASI: gösterilmemiş kartların
 * id'leri + hasNextPage. Deneme sonrası imza aynıysa backend'in verecek yeni
 * profili yok demektir, tekrar istemiyoruz. İmza uzunluk yerine kimlik
 * üzerinden çünkü refetch sayfayı EKLEMİYOR, DEĞİŞTİRİYOR: yeni profil gelse
 * de dizi uzunluğu aynı kalabilir, kuyruk aynı kalırsa da index kayabilir.
 *
 * Cooldown ise imzanın yakalayamadığı patolojik durum için: backend kuyruğu
 * her istekte farklı sıralarsa (deste tohumu değişirse) imza her seferinde
 * değişir ve istek fırtınası başlardı. Bir de render churn'ü bedava değil
 * (bkz. commit-storm notları), o yüzden refetch yolu saniyede birden fazla
 * çalışmıyor.
 */

/** Kuyrukta bu kadar veya daha az kart kalınca takviye başlar. */
export const TOP_UP_THRESHOLD = 5;

/**
 * Refetch yolunun en sık çalışabileceği aralık. Kuyruk 0 iken UYGULANMAZ
 * (yukarıdaki gerekçe). `api/swipe/*` kullanıcı başına 120 istek/60sn ortak
 * kova kullanıyor — Like/Pass ile aynı kovayı paylaşıyoruz, o yüzden bu
 * frenin tamamen kalkması doğru değil: 4sn dakikada en fazla 15 ek istek.
 */
export const TOP_UP_COOLDOWN_MS = 4000;

export type TopUpAction =
  /** Kuyruk yeterli — deneme kaydı sıfırlansın (bir sonraki iniş yeniden denesin). */
  | "reset"
  /** Şu an yapılacak bir şey yok. */
  | "none"
  /** Sıradaki sayfayı ekle. */
  | "next-page"
  /** 1. sayfayı yeniden çek (havuz kaydığı için yeni profil getirir). */
  | "refetch";

export interface TopUpInput {
  /** Henüz gösterilmemiş kartların id'leri (currentIndex'ten sonu). */
  tailIds: string[];
  /** Herhangi bir deste isteği uçuyor mu (polling refetch dahil). */
  isFetching: boolean;
  hasNextPage: boolean;
  /**
   * Backend boş dönüşün YAPISAL sebebini bildirdi mi (FiltersTooStrict,
   * ProfileIncomplete, NoCandidatesInRadius...). Boş-deste yoklamasıyla aynı
   * gerekçe: sebep kendiliğinden geçmiyorsa yeniden istemek kotayı ve pili
   * yemekten başka işe yaramaz. GEÇİCİ sebepler (PoolWarming — match sonrası
   * havuz yeniden üretilirken distributed lock alınamadığında dönüyor) bu
   * bayrağı KALDIRMAZ; sözlükteki `autoRetry` onları ayırıyor.
   */
  refetchBlocked: boolean;
  /** Son denemenin imzası (yoksa null). */
  lastSignature: string | null;
  /** Son refetch'in üzerinden geçen süre. */
  msSinceLastRefetch: number;
}

export interface TopUpDecision {
  action: TopUpAction;
  /** Denemeyi işaretlemek için imza — yalnız fetch kararlarında dolu. */
  signature: string | null;
}

export function deckTailSignature(
  tailIds: string[],
  hasNextPage: boolean,
): string {
  return `${tailIds.join(",")}|${hasNextPage ? "1" : "0"}`;
}

export function decideTopUp(input: TopUpInput): TopUpDecision {
  const {
    tailIds,
    isFetching,
    hasNextPage,
    refetchBlocked,
    lastSignature,
    msSinceLastRefetch,
  } = input;

  if (tailIds.length > TOP_UP_THRESHOLD) return { action: "reset", signature: null };
  // Uçan istek varken araya girme: polling refetch ile fetchNextPage
  // çakışınca sayfalar birbirinin üstüne biniyor.
  if (isFetching) return { action: "none", signature: null };

  const signature = deckTailSignature(tailIds, hasNextPage);
  // Aynı kuyrukla bir kez denedik, kuyruk büyümedi → backend'de yeni profil yok.
  if (signature === lastSignature) return { action: "none", signature: null };

  if (hasNextPage) return { action: "next-page", signature };

  // Aşağıdaki iki ret imzayı KAYDETTİRMİYOR (signature: null): engel kalkınca
  // (sebep çözülünce / cooldown dolunca) aynı kuyruk için tekrar denenebilsin.
  if (refetchBlocked) return { action: "none", signature: null };
  // Kuyruk 0: havuzu yeniden ürettiren tek istek bu, frene takılmasın.
  if (tailIds.length > 0 && msSinceLastRefetch < TOP_UP_COOLDOWN_MS) {
    return { action: "none", signature: null };
  }

  return { action: "refetch", signature };
}
