/**
 * İl merkezi koordinatları — kart konum haritasının koordinat kaynağı.
 *
 * NEDEN BURADA: ProfileCardDto artık koordinat TAŞIMIYOR (backend konumu
 * latitude/longitude'dan türetip yalnız `cityDisplay`/`districtDisplay`
 * gönderiyor, bkz. shared/types PotentialMatch). Harita kaba bir zoom'da
 * çizildiği için il merkezi yeterli: ilçe farkı bu ölçekte piksel altında
 * kalıyor. Backend ileride ilçe koordinatı göndermeye başlarsa kartta
 * doğrudan o kullanılabilir, bu tablo yedek kalır.
 *
 * Anahtarlar normalize edilmiş (aksansız, küçük harf) il adları — böylece
 * `cityDisplay` hem Türkçe ("İzmir", "Şanlıurfa") hem İngilizce request
 * dilinde ("Izmir", "Sanliurfa") gelse de aynı kaydı bulur.
 */

export interface CityCoordinate {
  latitude: number;
  longitude: number;
}

const CITY_COORDINATES: Record<string, CityCoordinate> = {
  adana: { latitude: 37.0, longitude: 35.3213 },
  adiyaman: { latitude: 37.7648, longitude: 38.2786 },
  afyonkarahisar: { latitude: 38.7507, longitude: 30.5567 },
  agri: { latitude: 39.7191, longitude: 43.0503 },
  aksaray: { latitude: 38.3687, longitude: 34.037 },
  amasya: { latitude: 40.6499, longitude: 35.8353 },
  ankara: { latitude: 39.9334, longitude: 32.8597 },
  antalya: { latitude: 36.8969, longitude: 30.7133 },
  ardahan: { latitude: 41.1105, longitude: 42.7022 },
  artvin: { latitude: 41.1828, longitude: 41.8183 },
  aydin: { latitude: 37.856, longitude: 27.8416 },
  balikesir: { latitude: 39.6484, longitude: 27.8826 },
  bartin: { latitude: 41.6344, longitude: 32.3375 },
  batman: { latitude: 37.8812, longitude: 41.1351 },
  bayburt: { latitude: 40.2552, longitude: 40.2249 },
  bilecik: { latitude: 40.1506, longitude: 29.9833 },
  bingol: { latitude: 38.8854, longitude: 40.498 },
  bitlis: { latitude: 38.4006, longitude: 42.1095 },
  bolu: { latitude: 40.735, longitude: 31.6061 },
  burdur: { latitude: 37.7203, longitude: 30.2908 },
  bursa: { latitude: 40.1826, longitude: 29.0665 },
  canakkale: { latitude: 40.1553, longitude: 26.4142 },
  cankiri: { latitude: 40.6013, longitude: 33.6134 },
  corum: { latitude: 40.5506, longitude: 34.9556 },
  denizli: { latitude: 37.7765, longitude: 29.0864 },
  diyarbakir: { latitude: 37.9144, longitude: 40.2306 },
  duzce: { latitude: 40.8438, longitude: 31.1565 },
  edirne: { latitude: 41.6818, longitude: 26.5623 },
  elazig: { latitude: 38.681, longitude: 39.2264 },
  erzincan: { latitude: 39.75, longitude: 39.5 },
  erzurum: { latitude: 39.9, longitude: 41.27 },
  eskisehir: { latitude: 39.7767, longitude: 30.5206 },
  gaziantep: { latitude: 37.0662, longitude: 37.3833 },
  giresun: { latitude: 40.9128, longitude: 38.3895 },
  gumushane: { latitude: 40.4386, longitude: 39.5086 },
  hakkari: { latitude: 37.5744, longitude: 43.7408 },
  hatay: { latitude: 36.4018, longitude: 36.3498 },
  igdir: { latitude: 39.888, longitude: 44.0048 },
  isparta: { latitude: 37.7648, longitude: 30.5566 },
  istanbul: { latitude: 41.0082, longitude: 28.9784 },
  izmir: { latitude: 38.4237, longitude: 27.1428 },
  kahramanmaras: { latitude: 37.5858, longitude: 36.9371 },
  karabuk: { latitude: 41.2061, longitude: 32.6204 },
  karaman: { latitude: 37.1759, longitude: 33.2287 },
  kars: { latitude: 40.6013, longitude: 43.0975 },
  kastamonu: { latitude: 41.3887, longitude: 33.7827 },
  kayseri: { latitude: 38.7312, longitude: 35.4787 },
  kilis: { latitude: 36.7184, longitude: 37.1212 },
  kirikkale: { latitude: 39.8468, longitude: 33.5153 },
  kirklareli: { latitude: 41.7333, longitude: 27.2167 },
  kirsehir: { latitude: 39.1425, longitude: 34.1709 },
  kocaeli: { latitude: 40.8533, longitude: 29.8815 },
  konya: { latitude: 37.8746, longitude: 32.4932 },
  kutahya: { latitude: 39.4242, longitude: 29.9833 },
  malatya: { latitude: 38.3552, longitude: 38.3095 },
  manisa: { latitude: 38.6191, longitude: 27.4289 },
  mardin: { latitude: 37.3212, longitude: 40.7245 },
  mersin: { latitude: 36.8121, longitude: 34.6415 },
  mugla: { latitude: 37.2153, longitude: 28.3636 },
  mus: { latitude: 38.7432, longitude: 41.5064 },
  nevsehir: { latitude: 38.6939, longitude: 34.6857 },
  nigde: { latitude: 37.9667, longitude: 34.6833 },
  ordu: { latitude: 40.9839, longitude: 37.8764 },
  osmaniye: { latitude: 37.213, longitude: 36.1763 },
  rize: { latitude: 41.0201, longitude: 40.5234 },
  sakarya: { latitude: 40.7569, longitude: 30.3783 },
  samsun: { latitude: 41.2867, longitude: 36.33 },
  sanliurfa: { latitude: 37.1591, longitude: 38.7969 },
  siirt: { latitude: 37.9333, longitude: 41.95 },
  sinop: { latitude: 42.0231, longitude: 35.1531 },
  sirnak: { latitude: 37.4187, longitude: 42.4918 },
  sivas: { latitude: 39.7477, longitude: 37.0179 },
  tekirdag: { latitude: 40.9833, longitude: 27.5167 },
  tokat: { latitude: 40.3167, longitude: 36.55 },
  trabzon: { latitude: 41.0015, longitude: 39.7178 },
  tunceli: { latitude: 39.1079, longitude: 39.5401 },
  usak: { latitude: 38.6823, longitude: 29.4082 },
  van: { latitude: 38.4891, longitude: 43.4089 },
  yalova: { latitude: 40.65, longitude: 29.2667 },
  yozgat: { latitude: 39.8181, longitude: 34.8147 },
  zonguldak: { latitude: 41.4564, longitude: 31.7987 },
};

/**
 * "İzmir" / "Izmir" / " izmir " → "izmir".
 *
 * `ı` ve `İ` ÖNCE elle eşleniyor: NFD ayrıştırması `İ`yi (I + birleşen nokta)
 * çözüyor ama noktasız `ı` tek kod noktası, ayrışmıyor ve toLowerCase() da
 * onu `i` yapmıyor — "Aydın" aksi hâlde "aydın" kalıp tabloyu ıskalardı.
 */
const normalizeCityName = (raw: string): string =>
  raw
    .replace(/ı/g, "i")
    .replace(/İ/g, "i")
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase()
    .trim();

/** Bilinmeyen/boş il adında `null` — çağıran harita yerine ikona düşer. */
export function lookupCityCoordinate(
  city: string | null | undefined,
): CityCoordinate | null {
  if (!city) return null;
  return CITY_COORDINATES[normalizeCityName(city)] ?? null;
}
