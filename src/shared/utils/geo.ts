/**
 * Küresel geometri — iki tüketicisi olan hesaplar.
 *
 * Buraya taşınmasının sebebi `haversineKm`: bir tur `locationHeartbeat.ts`in içinde
 * yerel bir yardımcıydı ve tek işi "son gönderimden 1 km uzaklaştım mı" sorusuna
 * cevap vermekti. Kampüs sınırı kontrolü (bkz. features/campus/campusBoundary.ts)
 * ikinci tüketici oldu; kopyalamak yerine ortak modüle alındı.
 *
 * ⚠️ MESAFE FİLTRESİYLE KARIŞTIRMA. Eşleşme mesafesi her zaman SUNUCUDA, kullanıcının
 * kendi koordinatından hesaplanıyor (bkz. swipeService > appliedRadiusKm). Buradaki
 * fonksiyonlar yalnız istemcinin kendi kararları için: "isteği atmaya değer mi",
 * "kampüs dairesinin içinde miyim".
 */

/** Dünya yarıçapı (km) — ortalama küresel yarıçap. */
const EARTH_RADIUS_KM = 6371;

const toRad = (deg: number) => (deg * Math.PI) / 180;

/**
 * İki koordinat arasındaki büyük çember mesafesi, KİLOMETRE.
 *
 * Haversine: küreyi varsayıyor, elipsoidi değil. Türkiye ölçeğinde hata binde birin
 * altında — kampüs yarıçapı (yüzlerce metre) ve heartbeat eşiği (1 km) için fazlasıyla
 * yeterli, Vincenty'ye gerek yok.
 */
export function haversineKm(
  lat1: number,
  lon1: number,
  lat2: number,
  lon2: number,
): number {
  const dLat = toRad(lat2 - lat1);
  const dLon = toRad(lon2 - lon1);
  const a =
    Math.sin(dLat / 2) ** 2 +
    Math.cos(toRad(lat1)) * Math.cos(toRad(lat2)) * Math.sin(dLon / 2) ** 2;
  return 2 * EARTH_RADIUS_KM * Math.asin(Math.sqrt(a));
}

/** Aynı hesap METRE cinsinden — kampüs yarıçapları metre konuşuyor. */
export function haversineMeters(
  lat1: number,
  lon1: number,
  lat2: number,
  lon2: number,
): number {
  return haversineKm(lat1, lon1, lat2, lon2) * 1000;
}
