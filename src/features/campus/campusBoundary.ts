import { appPrefs } from "@/shared/utils/appPrefs";
import type {
  CampusBoundaryDto,
  CampusCircle,
  CampusGeometry,
  GeoRing,
} from "./campusTypes";

/**
 * "KAMPÜSTE MİYİM?" — saf karar katmanı.
 *
 * ── Üç katmanlı tasarım: DAİRE UYANDIRIR, POLİGON KARAR VERİR, SUNUCU DOĞRULAR
 * 1. **Daire** işletim sisteminin kabul ettiği tek şekil (iOS `CLCircularRegion`,
 *    Android `setCircularRegion`). Poligon geofence diye bir şey YOK. Dairenin
 *    tek işi bizi uyandırmak; kullanıcıya görünen hiçbir karar onun sonucu değil.
 *    Boğaziçi Güney Kampüs'ü çevreleyen daire Bebek'in yarısını içine alıyor.
 * 2. **Poligon** gerçek cevabı veriyor — bu dosya.
 * 3. **Sunucu** son sözü söylüyor. Buradaki kontrol YALNIZ ARAYÜZ KARARI:
 *    "+" butonunu çizip çizmemek. Bir istemci kontrolü jailbreak'li cihazda,
 *    konum sahteciliği uygulamasıyla ya da isteği elle kurarak atlatılır;
 *    paylaşımın geçerliliğine `POST /api/campus/moments` karar veriyor
 *    (sözleşme §5). Bu dosyadaki hiçbir şey güvenlik kontrolü DEĞİL.
 *
 * ── Neden React/Redux/React Query import ETMİYOR ────────────────────────────
 * Geofence olayı uygulama ÖLDÜRÜLMÜŞKEN de geliyor ve o anda açılan JS
 * context'te React ağacı, store, i18n — hiçbiri yok. Bu modül oradan da
 * çağrılabilsin diye çıplak: yalnız MMKV ve saf matematik.
 *
 * ── `isApproximate` ANA KAPI ────────────────────────────────────────────────
 * Sunucudaki 207 üniversitenin 4'ünde koordinat hâlâ İL MERKEZİ. O kayıtlarda
 * poligon "il sınırı" olursa paylaşım kapısı bütün şehre açılır. Kural sert:
 * `isApproximate` ya da poligon yok → `isInsideCampus` HER ZAMAN `false`.
 * Haritadaki `isApproximate → şehir ölçeği` kapısıyla aynı felsefe:
 * yanlış yere pin koymak, hiç göstermemekten kötü.
 */

// ── Disk önbelleği ─────────────────────────────────────────────────────────
// Poligon haftalarca değişmiyor; her açılışta çekmek anlamsız. `version`
// bayatlığı söylüyor. `appPrefs` seçildi (şifreli redux deposu değil):
// gizli veri değil ve logout'ta silinmesi gerekmiyor — aynı kampüse dönen
// kullanıcı aynı poligonu kullanıyor.
const KEY_PREFIX = "campusBoundary:";
const SCHEMA_VERSION = 1;

interface StoredBoundary {
  v: number;
  dto: CampusBoundaryDto;
}

const keyFor = (domain: string) => `${KEY_PREFIX}${domain}`;

/** Yarıçap sınırları — sunucu da kırpıyor, istemci ona GÜVENMİYOR. */
const MIN_RADIUS_M = 150;
const MAX_RADIUS_M = 5000;

/**
 * Mutlak hassasiyet tavanı — bunun üstü KOŞULSUZ red.
 *
 * Sunucu da aynı tavanı uyguluyor (`UT-7411`, sözleşme yanıtı §B). İstemci
 * kapısının onunla AYNI olması şart: daha gevşek olsaydı "+" çıkar, kullanıcı
 * fotoğrafı seçer, kırpar ve ancak gönderirken reddedilirdi.
 *
 * 100 m: kampüs ölçeğinde bundan büyük bir belirsizlik "hangi mahalledeyim"
 * sorusunu bile cevaplamıyor.
 */
const MAX_ACCURACY_M = 100;

// ── Normalizasyon ──────────────────────────────────────────────────────────

const isFiniteNumber = (v: unknown): v is number =>
  typeof v === "number" && Number.isFinite(v);

const isPosition = (v: unknown): boolean =>
  Array.isArray(v) && isFiniteNumber(v[0]) && isFiniteNumber(v[1]);

const isRing = (v: unknown): v is GeoRing =>
  // 4 nokta = kapalı üçgenin minimumu ([a,b,c,a]). Daha azı alan tanımlamıyor.
  Array.isArray(v) && v.length >= 4 && v.every(isPosition);

/**
 * Gelen geometriyi DOĞRULAYARAK alıyor.
 *
 * ⚠️ Bozuk/eksik geometride `null` dönüyor ve çağıran özelliği kapatıyor —
 * "yarım poligonla elimden geleni yapayım" yolu, kullanıcıyı kampüste
 * olmadığı hâlde kampüste sayma riskini taşıyor.
 */
function normalizeGeometry(raw: unknown): CampusGeometry | null {
  if (!raw || typeof raw !== "object") return null;
  const geo = raw as { type?: unknown; coordinates?: unknown };

  if (geo.type === "Polygon") {
    const rings = Array.isArray(geo.coordinates)
      ? geo.coordinates.filter(isRing)
      : [];
    if (!rings.length) return null;
    return { type: "Polygon", coordinates: rings };
  }

  if (geo.type === "MultiPolygon") {
    const polygons = Array.isArray(geo.coordinates)
      ? geo.coordinates
          .map((p) => (Array.isArray(p) ? p.filter(isRing) : []))
          .filter((rings) => rings.length > 0)
      : [];
    if (!polygons.length) return null;
    return { type: "MultiPolygon", coordinates: polygons };
  }

  return null;
}

function normalizeCircle(raw: unknown): CampusCircle | null {
  if (!raw || typeof raw !== "object") return null;
  const c = raw as Record<string, unknown>;
  if (!isFiniteNumber(c.lat) || !isFiniteNumber(c.lon)) return null;
  const radius = isFiniteNumber(c.radiusMeters) ? c.radiusMeters : NaN;
  if (!Number.isFinite(radius) || radius <= 0) return null;
  return {
    lat: c.lat,
    lon: c.lon,
    radiusMeters: Math.min(Math.max(radius, MIN_RADIUS_M), MAX_RADIUS_M),
  };
}

/** Sunucu yanıtı → güvenli iç temsil. Şekil bozuksa `null`. */
export function normalizeCampusBoundary(raw: unknown): CampusBoundaryDto | null {
  if (!raw || typeof raw !== "object") return null;
  const b = raw as Record<string, unknown>;
  const domain = typeof b.domain === "string" ? b.domain : null;
  if (!domain) return null;
  return {
    domain,
    // ⚠️ Alan yoksa YAKLAŞIK sayılıyor, kesin değil: bilinmeyen bir
    // koordinata kampüs muamelesi yapmak yanlış tarafa hata yapmaktır.
    isApproximate: b.isApproximate !== false,
    circle: normalizeCircle(b.circle),
    polygon: normalizeGeometry(b.polygon),
    version: typeof b.version === "string" ? b.version : null,
    // Alan yoksa `null` = "bilinmiyor" — `false` DEĞİL. Yüzeyin kapısı zaten
    // `/campus/me`de; burada yanlışlıkla kapatmak eski sunucuda özelliği
    // tamamen öldürürdü.
    enabled: typeof b.enabled === "boolean" ? b.enabled : null,
  };
}

// ── Geometri ───────────────────────────────────────────────────────────────

/**
 * Işın atma (ray casting) — nokta halkanın içinde mi.
 *
 * Yatay bir ışın atıp kesişim sayısını sayıyor: tek = içeride. Metrik değil
 * topolojik bir test, o yüzden doğrudan derece cinsinden çalışıyor (yerel
 * metreye projeksiyon GEREKMİYOR).
 *
 * ⚠️ GeoJSON sırası [boylam, enlem].
 */
function pointInRing(lon: number, lat: number, ring: GeoRing): boolean {
  let inside = false;
  for (let i = 0, j = ring.length - 1; i < ring.length; j = i++) {
    const [xi, yi] = ring[i];
    const [xj, yj] = ring[j];
    // Kenar ışının iki yakasında mı + kesişim noktası soldaysa say.
    const straddles = yi > lat !== yj > lat;
    if (!straddles) continue;
    const xCross = ((xj - xi) * (lat - yi)) / (yj - yi) + xi;
    if (lon < xCross) inside = !inside;
  }
  return inside;
}

/** Dış halka içinde VE hiçbir deliğin içinde değil. */
function pointInPolygonRings(
  lon: number,
  lat: number,
  rings: GeoRing[],
): boolean {
  if (!rings.length) return false;
  if (!pointInRing(lon, lat, rings[0])) return false;
  for (let i = 1; i < rings.length; i++) {
    if (pointInRing(lon, lat, rings[i])) return false;
  }
  return true;
}

function pointInGeometry(
  lon: number,
  lat: number,
  geometry: CampusGeometry,
): boolean {
  if (geometry.type === "Polygon") {
    return pointInPolygonRings(lon, lat, geometry.coordinates);
  }
  return geometry.coordinates.some((rings) =>
    pointInPolygonRings(lon, lat, rings),
  );
}

/**
 * ÖZELLİĞİN ANA KAPISI — koordinat bu kampüste paylaşım yapmaya yetiyor mu.
 *
 * `isApproximate` ya da poligon yoksa HER ZAMAN `false` (dosya başındaki
 * gerekçe). Çağıranlar bu fonksiyonun dışında ayrıca `isApproximate`
 * KONTROL ETMEK ZORUNDA DEĞİL.
 */
export function isInsideCampus(
  latitude: number,
  longitude: number,
  boundary: CampusBoundaryDto | null | undefined,
): boolean {
  if (!boundary || boundary.isApproximate || !boundary.polygon) return false;
  if (!isFiniteNumber(latitude) || !isFiniteNumber(longitude)) return false;
  return pointInGeometry(longitude, latitude, boundary.polygon);
}

// ── Belirsizlik ────────────────────────────────────────────────────────────

/** Kampüs ölçeğinde yeterli: enlem/boylam → yerel metre. */
const METERS_PER_DEG_LAT = 110574;
const metersPerDegLon = (lat: number) =>
  111320 * Math.cos((lat * Math.PI) / 180);

/** Noktadan doğru parçasına en kısa mesafe (yerel düzlemde, metre). */
function pointToSegmentMeters(
  px: number,
  py: number,
  ax: number,
  ay: number,
  bx: number,
  by: number,
): number {
  const dx = bx - ax;
  const dy = by - ay;
  const lenSq = dx * dx + dy * dy;
  // Dejenere kenar (aynı nokta iki kez) → nokta-nokta mesafesi.
  const t = lenSq === 0 ? 0 : ((px - ax) * dx + (py - ay) * dy) / lenSq;
  const clamped = Math.min(Math.max(t, 0), 1);
  const cx = ax + clamped * dx;
  const cy = ay + clamped * dy;
  return Math.hypot(px - cx, py - cy);
}

/**
 * Noktanın kampüs SINIRINA uzaklığı (metre). Sınır yoksa `null`.
 *
 * İçeride/dışarıda ayrımı YAPMIYOR — yalnız mesafe. Çağıran `isInsideCampus`
 * ile birleştiriyor.
 */
export function distanceToCampusEdgeMeters(
  latitude: number,
  longitude: number,
  boundary: CampusBoundaryDto | null | undefined,
): number | null {
  if (!boundary?.polygon) return null;
  const mLat = METERS_PER_DEG_LAT;
  const mLon = metersPerDegLon(latitude);
  // Projeksiyonun orijini SORGU NOKTASI: kampüs ölçeğinde (birkaç km) bu
  // yaklaşım metre altı hata veriyor.
  const px = 0;
  const py = 0;
  const toX = (lon: number) => (lon - longitude) * mLon;
  const toY = (lat: number) => (lat - latitude) * mLat;

  let best = Infinity;
  const rings: GeoRing[] =
    boundary.polygon.type === "Polygon"
      ? boundary.polygon.coordinates
      : boundary.polygon.coordinates.flat();

  for (const ring of rings) {
    for (let i = 0, j = ring.length - 1; i < ring.length; j = i++) {
      const d = pointToSegmentMeters(
        px,
        py,
        toX(ring[j][0]),
        toY(ring[j][1]),
        toX(ring[i][0]),
        toY(ring[i][1]),
      );
      if (d < best) best = d;
    }
  }
  return Number.isFinite(best) ? best : null;
}

/**
 * "Kampüsteyim" demeye YETECEK KADAR emin miyiz?
 *
 * İçeride olmak yetmiyor: GPS'in kendi belirsizliği sınırdan büyükse nokta
 * sınırın dışında da olabilir. Kural — belirsizlik dairesi kampüsün İÇİNE
 * SIĞMALI: `sınıra uzaklık >= accuracyMeters`.
 *
 * Bu, "iç yarıçap" hesabından hem daha basit hem daha doğru: kampüsün
 * ortasında 100 m belirsizlik sorun değil, kapısında 100 m belirsizlik sorun.
 *
 * İki kural birden (ikisi de sunucuda aynen var — UT-7411):
 *   1. `accuracyMeters <= MAX_ACCURACY_M` (mutlak tavan),
 *   2. `accuracyMeters <= sınıra uzaklık` (göreli).
 *
 * ⚠️ `accuracyMeters` bilinmiyorsa (null) belirsizlik kontrolü YAPILMIYOR;
 * sunucu aynı kontrolü tekrarlıyor ve son söz onda.
 */
export function isConfidentlyInsideCampus(
  latitude: number,
  longitude: number,
  accuracyMeters: number | null | undefined,
  boundary: CampusBoundaryDto | null | undefined,
): boolean {
  if (!isInsideCampus(latitude, longitude, boundary)) return false;
  if (!isFiniteNumber(accuracyMeters) || accuracyMeters <= 0) return true;
  if (accuracyMeters > MAX_ACCURACY_M) return false;
  const edge = distanceToCampusEdgeMeters(latitude, longitude, boundary);
  if (edge === null) return false;
  return edge >= accuracyMeters;
}

// ── Geofence bölgesi ───────────────────────────────────────────────────────

/**
 * İşletim sistemine verilecek DAİRE. Özellik kapalıysa `null` — bölge hiç
 * kaydedilmiyor (boşuna uyanma yok).
 *
 * ⚠️ iOS aynı anda EN FAZLA 20 bölge izliyor ve bu uygulama TAM OLARAK 1
 * kullanıyor (kullanıcının kendi kampüsü). "207 üniversiteyi kaydedelim" fikri
 * doğarsa o sınıra çarpar — bölge listesi her sync'te DEĞİŞTİRİLİYOR,
 * eklenmiyor.
 */
export function campusGeofenceRegion(
  boundary: CampusBoundaryDto | null | undefined,
): { latitude: number; longitude: number; radius: number } | null {
  if (!boundary || boundary.isApproximate || !boundary.polygon) return null;
  if (!boundary.circle) return null;
  return {
    latitude: boundary.circle.lat,
    longitude: boundary.circle.lon,
    radius: boundary.circle.radiusMeters,
  };
}

// ── Disk ───────────────────────────────────────────────────────────────────

/**
 * Diskteki kopya; yoksa/bozuksa/şema eskiyse `null`.
 *
 * ⚠️ ANAHTAR, İSTENEN DOMAIN — yanıttaki `domain` DEĞİL. Sunucu her zaman
 * KANONİK yazımı döndürüyor (`bogazici.edu.tr` isteyene `boun.edu.tr` gelir).
 * Anahtar yanıttan alınsaydı alias domain'li kullanıcı yazdığını bir daha
 * bulamaz, önbellek her açılışta ıskalardı.
 */
export function readCachedBoundary(
  requestedDomain: string,
): CampusBoundaryDto | null {
  if (!requestedDomain) return null;
  try {
    const raw = appPrefs.getString(keyFor(requestedDomain));
    if (!raw) return null;
    const parsed = JSON.parse(raw) as StoredBoundary;
    if (parsed?.v !== SCHEMA_VERSION) return null;
    // Diskten geleni de normalize ediyoruz: elle kurcalanmış ya da eski
    // sürümden kalmış bir kayıt geometri doğrulamasından geçmeli.
    return normalizeCampusBoundary(parsed.dto);
  } catch {
    return null;
  }
}

/**
 * DİSKTEKİ HERHANGİ BİR SINIR — domain bilinmeden.
 *
 * ⚠️ ÜRÜN YOLLARINDA KULLANILMAZ ve kullanılmamalı: kullanıcının birden fazla
 * kampüsün sınırını görmüş olması mümkün (akışta başka üniversiteyi seçmek) ve
 * o durumda "herhangi biri" yanlış kampüs demek. Tek tüketicisi DEV konum
 * simülasyonu (bkz. campusDevLocation): orada Ayarlar ekranının elinde
 * kullanıcının domain'i yok ve onu oraya taşımak yalnız bu araç için üç
 * katmanlık prop/sorgu eklemek olurdu.
 *
 * Birden fazla kayıt varsa ilki dönüyor — hangisi olduğu `domain` alanından
 * görülüyor ve araç onu kullanıcıya gösteriyor.
 */
export function readAnyCachedBoundary(): CampusBoundaryDto | null {
  try {
    const keys = appPrefs
      .getAllKeys()
      .filter((k: string) => k.startsWith(KEY_PREFIX));
    for (const key of keys) {
      const raw = appPrefs.getString(key);
      if (!raw) continue;
      const parsed = JSON.parse(raw) as StoredBoundary;
      if (parsed?.v !== SCHEMA_VERSION) continue;
      const dto = normalizeCampusBoundary(parsed.dto);
      if (dto) return dto;
    }
    return null;
  } catch {
    return null;
  }
}

/** `requestedDomain` = isteği atarken kullandığın domain (bkz. okuma uyarısı). */
export function writeCachedBoundary(
  requestedDomain: string,
  boundary: CampusBoundaryDto,
): void {
  if (!requestedDomain) return;
  try {
    const payload: StoredBoundary = { v: SCHEMA_VERSION, dto: boundary };
    appPrefs.set(keyFor(requestedDomain), JSON.stringify(payload));
  } catch {
    /* no-op — önbellek yazılamazsa bir sonraki açılışta ağdan gelir. */
  }
}

/** Sürüm değiştiyse diskteki kopya bayat. `null` sürüm = "bilmiyoruz" → bayat say. */
export function isBoundaryStale(
  cached: CampusBoundaryDto | null,
  serverVersion: string | null | undefined,
): boolean {
  if (!cached) return true;
  if (!serverVersion || !cached.version) return true;
  return cached.version !== serverVersion;
}
