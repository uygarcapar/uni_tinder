/**
 * Medya önbelleği tahliye KARARLARI — saf fonksiyonlar, yan etki YOK.
 *
 * Ayrı dosya olmasının tek sebebi test edilebilirlik: indirme, diske yazma ve
 * `MediaCacheRow`'u okuyan turdan (Task 3'ün işi) ayrıldığında geriye kalan
 * her şey "girdi → çıktı" hâline geliyor ve jest'te gerçek dosya sistemi/DB
 * kurmadan doğrulanabiliyor (bkz. backfillPolicy.ts / pendingMutationPolicy.ts
 * — aynı ayrımın bu modüldeki ikizleri).
 *
 * Bu dosya store, ağ, timer, dosya sistemi ve SQL'e DOKUNMUYOR; parametre
 * tipleri dışında `src/features/chat/` içinden hiçbir şey içe almıyor.
 * Task 1'in kurduğu garanti (`chatRepository.readCacheEntriesOldestFirst`
 * bizim bekleyen kaydımızı hiç DÖNDÜRMÜYOR — `media_cached_at_ms` yalnız
 * indirme tamamlandığında yazılıyor) buraya devralınıyor, burada YENİDEN
 * UYGULANMIYOR: bu modül kendisine verilen listeye güveniyor, listenin
 * bekleyen kaydı içermediğini KENDİSİ garanti etmiyor.
 */

/**
 * Önbelleğin en çok kaç bayt tutacağı.
 *
 * 200 MB: ortalama bir sesli mesajın birkaç yüz KB olduğu varsayımıyla
 * (kısa konuşma kaydı, düşük bit hızı) binlerce mesajlık bir pencereye denk
 * geliyor — yani normal kullanımda tahliye NADİREN tetiklenir, cihazı
 * doldurmaz. Bu sayı CİHAZDA ÖLÇÜLMEDİ: gerçek dosya boyutları, kullanıcı
 * başına ortalama sesli mesaj sayısı ya da disk baskısı altında App Store/
 * Play Store'un ne kadar toleranslı olduğu bu fazda hiç test edilmedi.
 * Tavan yanlış çıkarsa burası tek değişecek satır.
 */
export const MEDIA_CACHE_MAX_BYTES = 200 * 1024 * 1024;

/** Toplam bayt — çağıran tavanla kıyaslıyor. */
export function totalBytes(entries: { size_bytes: number }[]): number {
  return entries.reduce((sum, e) => sum + e.size_bytes, 0);
}

/**
 * Tavanı aşan baytı kurtarmak için silinecekler — en eski erişim önce.
 *
 * `entries` çağıranın zaten "en eski erişim önce" sıraladığı varsayılıyor
 * (bkz. `chatRepository.readCacheEntriesOldestFirst`), ama bu fonksiyon o
 * varsayıma KÖRÜ KÖRÜNE güvenmiyor: kendi sıralamasını kendisi kuruyor —
 * önce `media_cached_at_ms` artan, eşitlikte `message_id` artan (aşağıdaki
 * tie-break notuna bakın). Böylece çağıranın sırası bozuk gelse bile sonuç
 * değişmiyor.
 *
 * Durma noktası: toplam, tavanın ALTINA inince durur — bir fazla, bir eksik
 * değil. Tek bir büyük dosya tavanı tek başına aşıyorsa (brief'in üçüncü
 * sorusu) o dosya da silinir: döngü "toplam hâlâ tavanın üstünde mi" diye
 * sorar, "kalan girdi var mı" diye sormaz, yani listenin sonuna gelmeden de
 * durabilir ama son girdide de sonsuza girmez — ya tavanın altına iner ya da
 * girdi tükenir. Alternatif (o dosyayı hiç silmemek) önbelleği sonsuza dek
 * tavanın üstünde tutardı: tek bir büyük indirme tüm tahliye mekanizmasını
 * devre dışı bırakırdı.
 *
 * Eşit `media_cached_at_ms` olduğunda sıralama `message_id`ye düşüyor —
 * rastgele bir tiebreak (ör. girdi listesindeki orijinal sıra) iki ayrı
 * çalıştırmanın aynı veri üzerinde FARKLI dosyaları silmesine izin verirdi:
 * aynı anda inen iki sesli mesaj gibi gerçek bir senaryoda bu, "neden dün bu
 * dosya gitti, bugün öbürü gitti" türünden tekrarlanamaz bir bug raporuna yol
 * açar. `message_id` keyfi ama STABİL: aynı girdi kümesi her zaman aynı
 * sonucu üretir.
 */
export function selectEvictions(
  entries: { message_id: string; media_cached_at_ms: number; size_bytes: number }[],
  maxBytes: number,
): string[] {
  const sorted = [...entries].sort((a, b) => {
    if (a.media_cached_at_ms !== b.media_cached_at_ms) {
      return a.media_cached_at_ms - b.media_cached_at_ms;
    }
    return a.message_id < b.message_id ? -1 : a.message_id > b.message_id ? 1 : 0;
  });

  let remaining = totalBytes(sorted);
  const evicted: string[] = [];
  for (const entry of sorted) {
    if (remaining <= maxBytes) break;
    evicted.push(entry.message_id);
    remaining -= entry.size_bytes;
  }
  return evicted;
}
