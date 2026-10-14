import {
  lookupCityCoordinate,
  type CityCoordinate,
} from "@/shared/constants/cityCoordinates";
import type { UniversityOption } from "@/shared/queries/commonQueries";

/**
 * Üniversitenin haritadaki konumu.
 *
 * ── Üç kaynak, bu sırayla ───────────────────────────────────────────────────
 * 1. SUNUCU: `/api/common/universities` yanıtındaki `lat`/`lon`. Kanonik
 *    kaynak — kampüsün gerçek koordinatı ve yeni üniversite eklendiğinde
 *    uygulama sürümü çıkmadan haritada görünür.
 * 2. Sunucunun `city` alanı → il merkezi (`cityCoordinates`). Sunucu şehri
 *    biliyor ama koordinatı vermiyorsa bu yeter: bu zoom'da il merkezi ile
 *    kampüs arasındaki fark birkaç piksel.
 * 3. İSTEMCİ YEDEĞİ: aşağıdaki domain→şehir tablosu. En büyük kampüsler
 *    elle, gerisi yok — tablo KASITLI OLARAK EKSİK.
 *
 * ⚠️ YEDEK TABLO KAPSAMLI OLMAYA ÇALIŞMIYOR ve çalışmamalı: 200+ üniversiteyi
 * istemciye gömmek hem ölü yük hem bakım borcu (üniversite açılıyor/kapanıyor,
 * ad değişiyor). Sunucu geo alanını gönderdiği an bu tablonun tamamı ölü koda
 * dönüyor — silinmesi tek satırlık iş. Tabloda olmayan üniversite için harita
 * ÇİZİLMİYOR (yanlış yere pin koymaktansa hiç koymamak doğru taraf).
 */

/** Domain → il adı. `cityCoordinates`in normalize ettiği hâliyle yazılıyor. */
const FALLBACK_UNIVERSITY_CITY: Record<string, string> = {
  // İstanbul
  "itu.edu.tr": "istanbul",
  "boun.edu.tr": "istanbul",
  "bogazici.edu.tr": "istanbul",
  "yildiz.edu.tr": "istanbul",
  "marmara.edu.tr": "istanbul",
  "istanbul.edu.tr": "istanbul",
  "sabanciuniv.edu": "istanbul",
  "ku.edu.tr": "istanbul",
  "bilgi.edu.tr": "istanbul",
  "bahcesehir.edu.tr": "istanbul",
  "bau.edu.tr": "istanbul",
  "mef.edu.tr": "istanbul",
  "ozyegin.edu.tr": "istanbul",
  // Ankara
  "metu.edu.tr": "ankara",
  "odtu.edu.tr": "ankara",
  "bilkent.edu.tr": "ankara",
  "hacettepe.edu.tr": "ankara",
  "ankara.edu.tr": "ankara",
  "gazi.edu.tr": "ankara",
  "tobb.edu.tr": "ankara",
  // İzmir
  "deu.edu.tr": "izmir",
  "ege.edu.tr": "izmir",
  "iyte.edu.tr": "izmir",
  "yasar.edu.tr": "izmir",
  // Diğer büyükler
  "uludag.edu.tr": "bursa",
  "akdeniz.edu.tr": "antalya",
  "cu.edu.tr": "adana",
  "erciyes.edu.tr": "kayseri",
  "atauni.edu.tr": "erzurum",
  "omu.edu.tr": "samsun",
  "gantep.edu.tr": "gaziantep",
  "selcuk.edu.tr": "konya",
  "pau.edu.tr": "denizli",
  "trabzon.edu.tr": "trabzon",
  "ktu.edu.tr": "trabzon",
  "eskisehir.edu.tr": "eskisehir",
  "anadolu.edu.tr": "eskisehir",
};

/** Domain karşılaştırması — sunucunun normalize ettiği kuralla aynı. */
const normalize = (raw: unknown): string =>
  typeof raw === "string" ? raw.trim().toLowerCase() : "";

/**
 * Üniversitenin koordinatı; bulunamazsa `null` → harita çizilmiyor.
 *
 * `option` sunucudan gelen kayıt (geo alanları varsa onlar kullanılıyor);
 * yoksa yalnız domain ile yedek tabloya bakılıyor.
 */
export function resolveUniversityCoordinate(
  domain: string | null | undefined,
  option?: UniversityOption | null,
): CityCoordinate | null {
  // 1) Sunucunun koordinatı — kanonik.
  const lat = (option as any)?.lat ?? (option as any)?.latitude;
  const lon = (option as any)?.lon ?? (option as any)?.longitude;
  if (typeof lat === "number" && typeof lon === "number") {
    return { latitude: lat, longitude: lon };
  }

  // 2) Sunucunun şehri → il merkezi.
  const serverCity = (option as any)?.city;
  if (typeof serverCity === "string" && serverCity) {
    const fromServerCity = lookupCityCoordinate(serverCity);
    if (fromServerCity) return fromServerCity;
  }

  // 3) İstemci yedeği — eksik olmasına izin verilen tablo.
  const key = normalize(domain);
  const city = key ? FALLBACK_UNIVERSITY_CITY[key] : undefined;
  return city ? lookupCityCoordinate(city) : null;
}
