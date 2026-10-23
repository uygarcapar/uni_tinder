import { appPrefs } from "@/shared/utils/appPrefs";
import { devLog } from "@/shared/utils/devLog";
import {
  distanceToCampusEdgeMeters,
  isInsideCampus,
  readAnyCachedBoundary,
  readCachedBoundary,
} from "./campusBoundary";
import type { CampusBoundaryDto, GeoRing } from "./campusTypes";
import type { CampusFix } from "./campusPresence";

/**
 * KAMPÜSTE OLMA SİMÜLASYONU — yalnız DEV.
 *
 * Kampüs anları yüzeyinin tamamı "şu an kampüste misin" sorusuna bağlı ve bu
 * soru geliştirici masasında HER ZAMAN "hayır" diyor. Yüzeyi gerçekten
 * denemek için okula gitmek gerekiyordu; "+" butonu çizilmiyor, paylaşım akışı
 * hiç açılmıyor, bildirim yolu hiç tetiklenmiyor.
 *
 * ── Simülatörün kendi konum ayarı neden yetmiyor ───────────────────────────
 * Yetiyor ve tercih edilen yol o (Features → Location → Custom). Ama:
 *   • Gerçek cihazda Xcode'a bağlı bir GPX rotası gerekiyor, yani masaüstü.
 *   • Kampüsün koordinatını elle bulup yazmak gerekiyor; burada sunucunun
 *     KENDİ merkez koordinatı kullanılıyor, yani poligonun içinde olduğu
 *     garanti.
 * Bu anahtar ikisini de atlatıyor.
 *
 * ── 🔴 SUNUCU DA DOĞRULUYOR — bu anahtar tek başına YETMEZ ────────────────
 * `POST /api/campus/moments` gövdedeki koordinatı sunucuda poligonla
 * karşılaştırıyor (UT-7410 OUT_OF_CAMPUS) ve heartbeat geçmişiyle makullük
 * kontrolü yapıyor (UT-7415 IMPLAUSIBLE_MOVEMENT). Yani istemcide "içerideyim"
 * demek yetmiyor, GÖNDERİLEN KOORDİNATIN da kampüste olması gerekiyor.
 *
 * O yüzden bu modül bir bayrak değil, SAHTE BİR KONUM OKUMASI üretiyor:
 * `readCampusFix` bunu döndürünce hem istemci kapısı açılıyor hem gövdeye
 * kampüsün koordinatı yazılıyor. Sadece bayrak olsa "+" çıkar, paylaşım
 * sunucuda reddedilir ve sebebi anlaşılmazdı.
 *
 * ⚠️ MAKULLÜK KONTROLÜ YİNE REDDEDEBİLİR: sunucu son heartbeat'ini senin
 * gerçek şehrinden görmüşse "400 km'yi 30 saniyede geçmiş" diyebilir. O
 * durumda UT-7415 geliyor ve bu anahtarın yapabileceği bir şey yok.
 *
 * Sunucu bunun için ortam bazlı bir muafiyet listesi açtı
 * (`Campus__TestUserIds__0=<userId>`): listedeki hesaplarda UT-7415 atlanıyor ve
 * özellik bayrağı açık sayılıyor. Muafiyet YALNIZ makullük kontrolüne —
 * UT-7410 (kampüs dışı), UT-7411 (hassasiyet), UT-7412 (sahte konum) ve
 * UT-7413 (bayat okuma) test hesabında da uygulanıyor; gövdeyi bu modül
 * kurduğu için onları zaten geçiyor. Sınır verisi kapısı da aşılmıyor: test
 * hesabı POLİGONU OLAN bir kampüse ait olmak zorunda (205 kaydın 162'si).
 *
 * ── Prod'da KOD OLARAK YOK ────────────────────────────────────────────────
 * Her giriş `__DEV__` ile kapılı ve release'de sabit `null`/`false` dönüyor.
 * MMKV'de kalmış bayat bir kayıt da release'de OKUNMUYOR — cihazında anahtar
 * açıkken release build alsan bile etkisi olmaz.
 */

/**
 * ⚠️ Koordinat SAKLANIYOR, her okumada sınırdan türetilmiyor.
 *
 * Sebep headless bağlam: geofence görevi `readCampusFix`i çağırıyor ve orada
 * elinde hangi kampüsün sınırı olduğu bilgisi YOK (domain olay kimliğinden
 * geliyor, okuma ondan önce). Anahtar açılırken koordinat bir kez çözülüp
 * yazılıyor; okuma tarafı yalnız okuyor.
 */
const KEY = "campus.devFix";

interface DevFix {
  latitude: number;
  longitude: number;
  /** Hangi kampüs — raporda gösteriliyor. */
  domain: string;
  /**
   * Nokta dairenin merkezinden DEĞİL poligondan türetildi mi (bkz.
   * `insidePoint`). Yalnız rapor metni için; kapıların hiçbiri buna bakmıyor.
   */
  derived?: boolean;
}

function readStored(): DevFix | null {
  try {
    const raw = appPrefs.getString(KEY);
    if (!raw) return null;
    const parsed = JSON.parse(raw);
    if (
      typeof parsed?.latitude !== "number" ||
      typeof parsed?.longitude !== "number"
    ) {
      return null;
    }
    return {
      latitude: parsed.latitude,
      longitude: parsed.longitude,
      domain: typeof parsed.domain === "string" ? parsed.domain : "?",
      derived: parsed.derived === true,
    };
  } catch {
    return null;
  }
}

/** Simülasyon açık mı. Release'de HER ZAMAN false. */
export function isCampusLocationSimulated(): boolean {
  if (!__DEV__) return false;
  return readStored() !== null;
}

/** Açıkken simüle edilen konum — rapor/teşhis için. */
export function campusSimulatedPoint(): DevFix | null {
  if (!__DEV__) return null;
  return readStored();
}

/**
 * Simüle edilen okumanın doğruluk yarıçapı (metre) ve noktanın sınırdan
 * istenen en küçük uzaklığı.
 *
 * `isConfidentlyInsideCampus` "sınıra uzaklık >= accuracyMeters" istiyor ve
 * sunucu aynı kuralı tekrarlıyor (UT-7411), yani sınıra 8 metre kalan bir nokta
 * teknik olarak içeride ama kapıdan geçmiyor. Pay bırakmak için tavan iki katı.
 */
const SIM_ACCURACY_M = 8;
const SIM_MIN_EDGE_M = SIM_ACCURACY_M * 2;

/**
 * Yatay tarama hattıyla poligonun içinden nokta adayları üret.
 *
 * Halkanın enlem aralığında bir hat çekip kenarlarla kesişimleri sıralıyor;
 * sıralı kesişimlerin ÇİFT İNDEKSLİ aralıkları halkanın içi, orta noktaları da
 * aday. Birden fazla yükseklik deneniyor: tek bir hat bir deliğin ya da dar bir
 * boğazın içine düşebiliyor.
 *
 * ⚠️ Adaylar DOĞRULANMAMIŞ — delikleri ve çok parçalılığı hesaba katmıyor.
 * Doğrulamayı `insidePoint` kanonik `isInsideCampus` ile yapıyor.
 */
function scanlineCandidates(
  rings: GeoRing[],
): Array<{ latitude: number; longitude: number }> {
  const outer = rings[0];
  if (!outer?.length) return [];

  let minLat = Infinity;
  let maxLat = -Infinity;
  for (const [, lat] of outer) {
    if (lat < minLat) minLat = lat;
    if (lat > maxLat) maxLat = lat;
  }
  if (!Number.isFinite(minLat) || maxLat <= minLat) return [];

  const out: Array<{ latitude: number; longitude: number }> = [];
  for (const fraction of [0.5, 0.35, 0.65, 0.2, 0.8]) {
    const lat = minLat + (maxLat - minLat) * fraction;
    const xs: number[] = [];
    for (let i = 0, j = outer.length - 1; i < outer.length; j = i++) {
      const [xi, yi] = outer[i];
      const [xj, yj] = outer[j];
      if (yi > lat === yj > lat) continue;
      xs.push(((xj - xi) * (lat - yi)) / (yj - yi) + xi);
    }
    xs.sort((a, b) => a - b);
    for (let k = 0; k + 1 < xs.length; k += 2) {
      out.push({ latitude: lat, longitude: (xs[k] + xs[k + 1]) / 2 });
    }
  }
  return out;
}

/**
 * Sınırın İÇİNDE olduğu DOĞRULANMIŞ bir nokta.
 *
 * ── 🔴 Dairenin merkezi her kampüste içeride DEĞİL ─────────────────────────
 * Buradaki eski varsayım "merkezi sunucu poligondan hesaplıyor, yani içeride"
 * idi ve yanlıştı: merkez poligonun ORTALAMASI, o yüzden C şeklinde ya da çok
 * parçalı bir kampüste parçaların arasına düşebiliyor. Sunucu bunu ölçtü —
 * özelliğin açık olduğu 162 kampüsün 6'sında merkez sınırın 60–407 m DIŞINDA
 * (`idu`, `nisantasi`, `giresun`, `beykoz`, `ticaret`, `ankaramedipol`).
 *
 * O kampüslerde merkezi yazmak aracı sessizce bozuyordu: "+" butonu çizilmiyor
 * (istemci kapısı), elle gönderilse sunucu UT-7410 veriyor ve ikisinin de
 * sebebi görünmüyor.
 *
 * Bu yüzden nokta ARTIK DOĞRULANIYOR: merkez kapıdan geçmezse poligonun
 * kendisinden bir iç nokta türetiliyor ve adaylar arasından SINIRA EN UZAK
 * olan seçiliyor (dar bir boğazın ortası teknik olarak içeride ama
 * belirsizlik kapısından geçmiyor).
 */
function insidePoint(
  boundary: CampusBoundaryDto,
): { latitude: number; longitude: number; derived: boolean } | null {
  const edgeOf = (p: { latitude: number; longitude: number }): number =>
    isInsideCampus(p.latitude, p.longitude, boundary)
      ? (distanceToCampusEdgeMeters(p.latitude, p.longitude, boundary) ?? 0)
      : 0;

  const circle = boundary.circle;
  if (circle) {
    const center = { latitude: circle.lat, longitude: circle.lon };
    // Merkez yeterliyse O kullanılıyor: sunucunun kendi koordinatı, raporda
    // tanıdık ve kampüsün gerçek ortası.
    if (edgeOf(center) >= SIM_MIN_EDGE_M) return { ...center, derived: false };
  }

  const polygon = boundary.polygon;
  const parts: GeoRing[][] = !polygon
    ? []
    : polygon.type === "Polygon"
      ? [polygon.coordinates]
      : polygon.coordinates;

  let best: { latitude: number; longitude: number } | null = null;
  let bestEdge = 0;
  for (const rings of parts) {
    for (const candidate of scanlineCandidates(rings)) {
      const edge = edgeOf(candidate);
      if (edge > bestEdge) {
        bestEdge = edge;
        best = candidate;
      }
    }
  }
  if (!best || bestEdge < SIM_MIN_EDGE_M) return null;
  return { ...best, derived: true };
}

export type SimulateFailure =
  /** Sınır diskte yok — harita bir kez açılmalı (sınır orada çekiliyor). */
  | "noBoundary"
  /** Koordinat il merkezi → yüzey o kampüste kapalı, simüle etmek anlamsız. */
  | "approximate"
  /**
   * İçeride olduğu DOĞRULANMIŞ nokta üretilemedi.
   *
   * Pratikte tek sebebi poligonun hiç gelmemiş olması (205 kaydın 25'i) — o
   * kampüslerde yüzey zaten kapalı. Poligon varken bu dal görülürse geometri
   * bozuk demektir ve `normalizeCampusBoundary` onu düşürmemiş olur.
   */
  | "noInsidePoint";

/**
 * ⚠️ `{ ok: true } | { ok: false }` ayrık birleşimi DEĞİL, bilerek.
 *
 * O şekli denedim ve bu projenin tsconfig'i altında `if (res.ok)` sonrası
 * `res.reason` DARALTILMIYOR — "böyle bir alan yok" hatası veriyor. Proje
 * içine koyduğum altı satırlık minimal örnek de aynı hatayı verdi, yani
 * çağıran dosyayla ya da fonksiyonun yerleşimiyle ilgili değil; `--ignoreConfig`
 * ile aynı kod sorunsuz derleniyor. Hangi derleyici ayarının sebep olduğunu
 * kovalamadım.
 *
 * İki alanlı düz bir kayıt daraltmaya hiç ihtiyaç duymuyor: `point` dolu ise
 * başarı, `failure` dolu ise sebep. İkisi aynı anda dolu olmuyor.
 */
export interface SimulateResult {
  point: DevFix | null;
  failure: SimulateFailure | null;
}

/**
 * Simülasyonu AÇ — kampüsün içinden doğrulanmış bir noktayı kalıcı yaz.
 *
 * Sınır ÖNBELLEKTEN okunuyor, ağ isteği atılmıyor: anahtar uçak modunda da
 * çalışıyor. Ama sınırın BİR KEZ çekilmiş olması şart ve o yalnız tam ekran
 * harita açıldığında oluyor — "noBoundary" cevabının anlamı bu, ve araç
 * kullanıcıya bunu söylüyor.
 *
 * `domain` verilmezse diskteki herhangi bir sınır kullanılıyor: aracı çağıran
 * Ayarlar ekranının elinde kullanıcının domain'i yok (gerekçe
 * `readAnyCachedBoundary`).
 */
export function simulateCampusLocation(
  domain?: string | null,
): SimulateResult {
  const fail = (failure: SimulateFailure): SimulateResult => ({
    point: null,
    failure,
  });
  if (!__DEV__) return fail("noBoundary");

  const boundary =
    (domain ? readCachedBoundary(domain) : null) ?? readAnyCachedBoundary();
  if (!boundary) return fail("noBoundary");
  // Yüzeyin ANA KAPISI: il merkezi koordinatında sınır kontrolü hiç yapılmıyor.
  if (boundary.isApproximate) return fail("approximate");

  const inside = insidePoint(boundary);
  if (!inside) return fail("noInsidePoint");

  const fix: DevFix = {
    latitude: inside.latitude,
    longitude: inside.longitude,
    domain: boundary.domain,
    derived: inside.derived,
  };
  appPrefs.set(KEY, JSON.stringify(fix));
  devLog("[campus][dev] konum simülasyonu AÇIK:", fix);
  return { point: fix, failure: null };
}

/** Simülasyonu KAPAT — gerçek GPS'e dön. */
export function clearSimulatedCampusLocation(): void {
  appPrefs.remove(KEY);
  devLog("[campus][dev] konum simülasyonu kapalı");
}

/**
 * Simüle edilmiş okuma — `readCampusFix`in yerine geçiyor.
 *
 * `accuracyMeters` küçük: belirsizlik kontrolü (`isConfidentlyInsideCampus`)
 * doğruluk yarıçapını sınıra olan mesafeyle karşılaştırıyor ve büyük bir değer
 * merkezde bile "emin değilim" dedirtir.
 *
 * ⚠️ `isMocked: false` — ve bu bir yalan DEĞİL: alan Android'in işletim
 * sistemi bayrağını taşıyor, biz onu taklit etmiyoruz. `true` yazmak sunucuda
 * UT-7412 (MOCKED_LOCATION) ile anında reddedilmek demekti, yani anahtar hiç
 * çalışmazdı. iOS zaten bu bayrağı hiç vermiyor (sözleşme notu).
 */
export function simulatedCampusFix(): CampusFix | null {
  if (!__DEV__) return null;
  const stored = readStored();
  if (!stored) return null;
  return {
    latitude: stored.latitude,
    longitude: stored.longitude,
    accuracyMeters: SIM_ACCURACY_M,
    isMocked: false,
    capturedAt: new Date().toISOString(),
  };
}

/**
 * Sonucun kullanıcıya gösterilecek hâli.
 *
 * ⚠️ METİN BURADA, çağıran ekranda DEĞİL: sebep kodlarının ne anlama geldiğini
 * bu modül biliyor. "noBoundary"in çaresi "haritayı bir kez aç" ve bu bilgi
 * sınır önbelleğinin kuralından geliyor — Ayarlar ekranının bilmesi gereken
 * bir şey değil.
 *
 * Metinler Türkçe ve çevrilmiyor: araç yalnız DEV'de var.
 */
export function describeSimulateResult(res: SimulateResult): {
  title: string;
  message: string;
} {
  const point = res.point;
  if (point) {
    return {
      title: "Kampüste sayılıyorsun",
      message:
        `${point.domain}\n${point.latitude.toFixed(5)}, ${point.longitude.toFixed(5)}\n` +
        (point.derived
          ? "(daire merkezi poligonun DIŞINDA kaldı → nokta poligondan türetildi)\n"
          : "") +
        '\nAkışı yenile ve haritayı aç — "+" butonu çıkmalı.',
    };
  }
  const message =
    res.failure === "noBoundary"
      ? "Kampüs sınırı diskte yok. Önce akışta haritaya bir kez bas (sınır orada çekiliyor), sonra tekrar dene."
      : res.failure === "approximate"
        ? "Bu kampüsün koordinatı il merkezi (isApproximate) — yüzey o kampüste KAPALI, simüle etmenin etkisi olmaz."
        : "Bu kampüsün poligonu yok (ya da bozuk) — yüzey orada kapalı, içeride olduğu doğrulanmış bir nokta üretilemiyor.";
  return { title: "Simülasyon kurulamadı", message };
}

/**
 * KAMPÜSE GİRİŞ BİLDİRİMİ — bildirim yolunun tamamını tetikliyor.
 *
 * Geofence'in yaptığı şeyin elle yapılmış hâli: `POST /api/campus/presence`
 * gövdesinde "Enter" + o anki konum. Bildirimi SUNUCU gönderiyor — karar onun
 * (kaç an var, günde kaç kez, kullanıcının `campusAlerts` tercihi) ve cihazda
 * yerel bildirim kurmuyoruz (sözleşme kararı).
 *
 * ⚠️ `momentCountToday` TEK BAŞINA push kararını SÖYLEMİYOR (2026-10-22'de
 * değişti). Sayı 0 iken de bildirim gidiyor — "ilk anı sen paylaş" gerekçesi —
 * ve o dal `postedToday`a bakıyor. O yüzden rapor `/campus/me`yi de çekiyor;
 * yoksa araç "bildirim atılmayacak" diye yanlış bilgi verirdi.
 *
 * 🔴 `campusPresence` ve `campusService` TEMBEL `require` İLE alınıyor,
 * statik import ile DEĞİL. İki ayrı sebep, ikisi de bu projede yaşandı:
 *   • `campusPresence` → `expo-location`, `campusService` → `api.ts` → expo
 *     winter `fetch`. İkisi de bu modülün grafiğine girince `SettingsScreen`
 *     test süiti "Cannot read properties of undefined (reading
 *     'EventEmitter')" ile AÇILMIYOR bile.
 *   • Daha önemlisi: `campusPresence` BU modülü import ediyor (simüle edilmiş
 *     okuma için) ve o da headless geofence görevinin grafiğinde. Statik
 *     import `api.ts`i o çıplak bağlama taşırdı — dosyanın başındaki 🔴 kuralı
 *     tam olarak bunu yasaklıyor.
 */
export async function reportSimulatedEntry(): Promise<{
  title: string;
  message: string;
}> {
  // eslint-disable-next-line @typescript-eslint/no-require-imports
  const { readCampusFix } = require("./campusPresence") as {
    readCampusFix: (o?: { force?: boolean }) => Promise<CampusFix | null>;
  };
  // ⚠️ `force: true`: önbellekteki okuma anahtar açılmadan ÖNCE alınmış
  // olabilir ve o zaman gerçek konum gönderilir.
  const fix = await readCampusFix({ force: true });
  if (!fix) {
    return {
      title: "Kampüs",
      message: "Konum okunamadı (izin yok, GPS yok ya da zaman aşımı).",
    };
  }

  // eslint-disable-next-line @typescript-eslint/no-require-imports
  const { campusService } = require("./campusService") as {
    campusService: {
      reportPresence: (b: {
        state: "Enter" | "Exit";
        latitude: number;
        longitude: number;
        accuracyMeters: number | null;
        isMocked: boolean;
        capturedAt: string;
      }) => Promise<{ inCampus: boolean; momentCountToday: number }>;
      getMe: () => Promise<{ postedToday: boolean }>;
    };
  };

  try {
    const res = await campusService.reportPresence({
      state: "Enter",
      latitude: fix.latitude,
      longitude: fix.longitude,
      accuracyMeters: fix.accuracyMeters,
      isMocked: fix.isMocked,
      capturedAt: fix.capturedAt,
    });

    // Bugün paylaşıldı mı — boş yüzeydeki gerekçe seçimi buna bakıyor.
    // Çekilemezse (kapalı yüzey, ağ) kararı "bilinmiyor" diye söylüyoruz;
    // uydurmak aracın tek işini bozardı.
    const postedToday = await campusService
      .getMe()
      .then((me) => me.postedToday)
      .catch(() => null);

    const expectation =
      res.momentCountToday > 0
        ? 'Push bekleniyor: "bugün N an paylaşıldı" (Nearby).'
        : postedToday === false
          ? 'Push bekleniyor: "ilki senden gelsin" (Prompt) — yüzey boş ve bugün paylaşmamışsın.'
          : postedToday === true
            ? "Push BEKLENMİYOR: yüzey boş ve bugün zaten paylaşmışsın. (Günlük hak yanmadı — an paylaşılırsa Nearby gelebilir.)"
            : "Push kararı belirsiz: /campus/me çekilemedi, postedToday bilinmiyor.";

    return {
      title: "Kampüse giriş bildirildi",
      message:
        `Sunucu: kampüste=${res.inCampus ? "evet" : "HAYIR"}\n` +
        `bugünkü an sayısı=${res.momentCountToday}\n` +
        `bugün paylaştın=${postedToday === null ? "?" : postedToday ? "evet" : "hayır"}\n\n` +
        expectation +
        "\n\n⚠️ Günlük hak İKİ GEREKÇE ARASINDA PAYLAŞILIYOR: aynı gün ikinci bir kampüs bildirimi gelmiyor.",
    };
  } catch (err) {
    return {
      title: "Kampüse giriş bildirilemedi",
      message: String((err as any)?.message ?? err),
    };
  }
}
