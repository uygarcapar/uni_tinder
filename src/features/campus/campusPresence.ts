import * as Location from "expo-location";
import { devLog } from "@/shared/utils/devLog";
import {
  distanceToCampusEdgeMeters,
  isConfidentlyInsideCampus,
  isInsideCampus,
  isLikelyInsideCampus,
  readCachedBoundary,
} from "./campusBoundary";
import { simulatedCampusFix } from "./campusDevLocation";
import type { CampusBoundaryDto } from "./campusTypes";

/**
 * "ŞU AN KAMPÜSTE MİYİM?" — konum okuma katmanı.
 *
 * ── Neden `locationHeartbeat.readCurrentPosition` KULLANILMIYOR ─────────────
 * O fonksiyon `Accuracy.Balanced` (~100 m) okuyor ve işi şehir/ilçe türetmek;
 * 100 m belirsizlik bir ŞEHİR için gürültü bile değil ama bir KAMPÜS SINIRI
 * için kararın kendisi kadar büyük. Burada `Accuracy.High` isteniyor.
 *
 * ⚠️ İkisi ayrı kalmalı: heartbeat'i High'a çekmek her uygulama açılışında
 * GPS'i uyandırır ve hiçbir şey kazandırmaz (şehir zaten biliniyor).
 *
 * ── Hiçbir şey fırlatmıyor ─────────────────────────────────────────────────
 * İzin yok, GPS fix yok, zaman aşımı — hepsi `inside: false`. Bu yüzeyde
 * "bilmiyorum" ile "değilim" aynı sonucu doğuruyor: "+" butonu çizilmiyor.
 * Kullanıcıya hata göstermenin anlamı yok, yapabileceği bir şey yok.
 *
 * ⚠️ Bu dosya da React/Redux IMPORT ETMİYOR — geofence task'ından (uygulama
 * öldürülmüşken açılan JS context) çağrılabilmesi gerekiyor.
 */

/** Okuma penceresi: bu kadar taze bir okuma yeniden kullanılıyor. */
const FIX_TTL_MS = 60_000;

/**
 * Tek atımlık okumanın tavanı.
 *
 * `getCurrentPositionAsync` kapalı alanda dakikalarca asılı kalabiliyor ve
 * kullanıcı o sırada "+" butonunun çıkmasını bekliyor. Süre dolunca "kampüste
 * değil" sayıyoruz — yanlış tarafa hata yapmak buysa doğrusu bu.
 */
const FIX_TIMEOUT_MS = 12_000;

export interface CampusFix {
  latitude: number;
  longitude: number;
  accuracyMeters: number | null;
  /** Android veriyor, iOS VERMİYOR → tek başına güvence değil. */
  isMocked: boolean;
  /** Okuma anı, ISO+Z. Sunucu bayatlığı buradan görüyor (UT-7413). */
  capturedAt: string;
}

export interface CampusPresence {
  /** Paylaşım kapısı — belirsizlik kontrolünden de geçmiş hâli. */
  inside: boolean;
  /** Ham poligon cevabı; belirsizlik hesaba katılmadan. Teşhis için. */
  insideRaw: boolean;
  fix: CampusFix | null;
  /** İzin yok mu — çağıran "Ayarlar'a git" diyebilsin diye ayrı. */
  permissionDenied: boolean;
}

const EMPTY: CampusPresence = {
  inside: false,
  insideRaw: false,
  fix: null,
  permissionDenied: false,
};

/**
 * TEŞHİS (geçici): "kampüsteyim ama atamıyorum" için tek satırlık karar dökümü.
 * Hangi kuralın düşürdüğünü ayırır: izin / fix yok / poligon dışı / güven payı.
 */
function logPresenceDecision(
  source: string,
  presence: CampusPresence,
  boundary: CampusBoundaryDto | null,
  note?: string,
): void {
  const edge = presence.fix
    ? distanceToCampusEdgeMeters(
        presence.fix.latitude,
        presence.fix.longitude,
        boundary,
      )
    : null;
  devLog(
    `[campus] presence(${source})`,
    JSON.stringify({
      inside: presence.inside,
      insideRaw: presence.insideRaw,
      permissionDenied: presence.permissionDenied,
      accuracyM: presence.fix?.accuracyMeters ?? null,
      edgeM: edge === null ? null : Math.round(edge * 10) / 10,
      lat: presence.fix?.latitude ?? null,
      lon: presence.fix?.longitude ?? null,
      capturedAt: presence.fix?.capturedAt ?? null,
      boundary: boundary
        ? {
            domain: boundary.domain,
            isApproximate: boundary.isApproximate,
            hasPolygon: !!boundary.polygon,
          }
        : null,
      note: note ?? null,
    }),
  );
}

let cachedFix: CampusFix | null = null;
let cachedAt = 0;
/** Aynı anda iki okuma başlamasın (heartbeat'teki `inFlight` kalıbı). */
let inFlight: Promise<CampusFix | null> | null = null;

function withTimeout<T>(p: Promise<T>, ms: number): Promise<T | null> {
  return new Promise((resolve) => {
    let settled = false;
    const timer = setTimeout(() => {
      if (!settled) {
        settled = true;
        resolve(null);
      }
    }, ms);
    p.then(
      (v) => {
        if (!settled) {
          settled = true;
          clearTimeout(timer);
          resolve(v);
        }
      },
      () => {
        if (!settled) {
          settled = true;
          clearTimeout(timer);
          resolve(null);
        }
      },
    );
  });
}

/** Önbellekteki okuma hâlâ taze mi. */
const freshFix = (now: number): CampusFix | null =>
  cachedFix && now - cachedAt < FIX_TTL_MS ? cachedFix : null;

/**
 * YÜKSEK doğruluklu tek atımlık okuma. İzin ZORUNLU değil — istenmiyor da:
 * foreground izni uygulamanın kendi kapısında (LocationAccessGate) zaten
 * alınıyor, burada dialog açmak kullanıcıyı şaşırtırdı.
 */
export async function readCampusFix(options?: {
  force?: boolean;
}): Promise<CampusFix | null> {
  /**
   * DEV: kampüste olma simülasyonu — gerçek GPS'in ÖNÜNDE.
   *
   * Release'de bu fonksiyon sabit `null` dönüyor, yani dal ölü. Burada
   * olmasının sebebi önbellek: aşağıdaki TTL simüle edilmiş bir okumayı da
   * dondurur ve anahtar kapatıldıktan sonra bir dakika boyunca "kampüsteyim"
   * demeye devam ederdi.
   *
   * ⚠️ Okumanın KENDİSİ değiştiriliyor, yalnız bir bayrak değil: gövdeye
   * yazılan koordinat da buradan geliyor ve sunucu onu poligonla
   * karşılaştırıyor (gerekçe campusDevLocation).
   */
  const simulated = simulatedCampusFix();
  if (simulated) return simulated;

  const now = Date.now();
  if (!options?.force) {
    const fresh = freshFix(now);
    if (fresh) return fresh;
  }
  if (inFlight) return inFlight;

  inFlight = (async () => {
    try {
      const perm = await Location.getForegroundPermissionsAsync();
      if (perm.status !== "granted") return null;

      const position = await withTimeout(
        Location.getCurrentPositionAsync({
          accuracy: Location.Accuracy.High,
        }),
        FIX_TIMEOUT_MS,
      );
      if (!position) return null;

      const fix: CampusFix = {
        latitude: position.coords.latitude,
        longitude: position.coords.longitude,
        accuracyMeters: position.coords.accuracy ?? null,
        isMocked: (position as any).mocked === true,
        capturedAt: new Date(position.timestamp || Date.now()).toISOString(),
      };
      cachedFix = fix;
      cachedAt = Date.now();
      return fix;
    } catch (err) {
      devLog("[campus] fix failed:", err);
      return null;
    } finally {
      inFlight = null;
    }
  })();

  return inFlight;
}

/**
 * Kampüs kapısının tamamı: oku → poligonla karşılaştır → belirsizliği uygula.
 *
 * `boundary` verilmezse diskteki kopya kullanılıyor; o da yoksa cevap `false`
 * (sınırı bilmeden "kampüstesin" demek mümkün değil).
 *
 * ⚠️ PAYLAŞIM ANINDA `force: true` ile çağır. Önbellekteki 59 saniyelik bir
 * okuma kampüsten çıkmış bir kullanıcıyı hâlâ içeride gösterir ve sunucu
 * UT-7413 (bayat okuma) ile reddeder — kullanıcı da sebebini anlamaz.
 */
export async function resolveCampusPresence(args?: {
  domain?: string | null;
  boundary?: CampusBoundaryDto | null;
  force?: boolean;
}): Promise<CampusPresence> {
  const boundary =
    args?.boundary ??
    (args?.domain ? readCachedBoundary(args.domain) : null) ??
    null;

  /**
   * ⚠️ DEV simülasyonu İZİN KAPISININ DA ÖNÜNDE: anahtar açıkken konum izni
   * hiç verilmemiş bir cihazda da yüzey denenebilmeli, yoksa simülasyonun
   * yarısı (izin dialogu) yine elle yapılmak zorunda kalırdı.
   */
  const simulated = simulatedCampusFix();
  if (simulated) {
    const presence: CampusPresence = {
      inside: isConfidentlyInsideCampus(
        simulated.latitude,
        simulated.longitude,
        simulated.accuracyMeters,
        boundary,
      ),
      insideRaw: isInsideCampus(
        simulated.latitude,
        simulated.longitude,
        boundary,
      ),
      fix: simulated,
      permissionDenied: false,
    };
    logPresenceDecision("simulated", presence, boundary);
    return presence;
  }

  const perm = await Location.getForegroundPermissionsAsync().catch(() => null);
  if (perm && perm.status !== "granted") {
    const presence = { ...EMPTY, permissionDenied: true };
    logPresenceDecision("real", presence, boundary, `perm=${perm.status}`);
    return presence;
  }

  const fix = await readCampusFix({ force: args?.force });
  if (!fix) {
    logPresenceDecision("real", EMPTY, boundary, "fix alınamadı (timeout/GPS)");
    return EMPTY;
  }

  const presence: CampusPresence = {
    inside: isConfidentlyInsideCampus(
      fix.latitude,
      fix.longitude,
      fix.accuracyMeters,
      boundary,
    ),
    insideRaw: isInsideCampus(fix.latitude, fix.longitude, boundary),
    fix,
    permissionDenied: false,
  };
  logPresenceDecision("real", presence, boundary);
  return presence;
}

/**
 * ── UCUZ CEVAP: "BÜYÜK İHTİMALLE KAMPÜSTE Mİ" ──────────────────────────────
 *
 * GPS'i UYANDIRMIYOR. İşletim sisteminin elindeki SON BİLİNEN konumu okuyor
 * (`getLastKnownPositionAsync`), yani pil maliyeti sıfır ve cevap anında.
 *
 * ── Neden ayrı bir yol var ─────────────────────────────────────────────────
 * Akışın bandında kampüsteyken "paylaşabilirsin" diyen küçük bir kart duruyor
 * (bkz. FeedBandMoments) ve o kart akış her açıldığında karar vermek zorunda.
 * `resolveCampusPresence` orada KULLANILAMAZ: yüksek doğruluklu tek atımlık
 * okuma (12sn tavan) ve bu dosyanın kendi uyarısı "her akış mount'unda
 * tetiklemek pili yakar" diyor — `useCampusSurface` konumu tam bu yüzden
 * ısıtmıyor.
 *
 * ⚠️ BU BİR KAPI DEĞİL, İPUCU. Paylaşımın gerçek kapısı değişmedi: "+"
 * basıldığında ve gövde kurulurken yine `force: true` ile TAZE okuma yapılıyor
 * (bkz. `share`). Son bilinen konum dakikalarca eski olabilir; yanlış tarafa
 * hata yaparsa kullanıcı kampüs dışındayken bir ipucu kartı görür ve dokununca
 * gerçek kapı onu zaten durdurur.
 *
 * ⚠️ `isLikelyInsideCampus`ten geçiyor, sıkı kuraldan DEĞİL: son bilinen konum
 * çoğu zaman düşük doğruluklu (Wi-Fi ~40-65 m) ve sıkı kural (sınıra uzaklık
 * >= accuracy) sınıra yakın GERÇEK kampüs kullanıcısını da düşürüyordu —
 * canlıda yaşandı: accuracy 40 m, sınıra 25 m → kart hiç çıkmadı. İpucu yanlış
 * tarafa hata yapacaksa gösterme yönünde yapmalı; tavan yalnız çöp okumayı
 * (Tam Konum kapalı, ~2 km) eliyor.
 */
export async function resolveCampusPresenceHint(args?: {
  domain?: string | null;
  boundary?: CampusBoundaryDto | null;
}): Promise<boolean> {
  const boundary =
    args?.boundary ??
    (args?.domain ? readCachedBoundary(args.domain) : null) ??
    null;
  if (!boundary) {
    logPresenceDecision("hint", EMPTY, null, "sınır poligonu cache'te yok");
    return false;
  }

  // DEV simülasyonu burada da en önde — gerçek yolun aynısı.
  const simulated = simulatedCampusFix();
  const fix = simulated ?? freshFix(Date.now()) ?? (await lastKnownFix());
  if (!fix) {
    logPresenceDecision("hint", EMPTY, boundary, "son bilinen konum yok");
    return false;
  }

  const inside = isLikelyInsideCampus(
    fix.latitude,
    fix.longitude,
    fix.accuracyMeters,
    boundary,
  );
  logPresenceDecision(
    "hint",
    {
      inside,
      insideRaw: isInsideCampus(fix.latitude, fix.longitude, boundary),
      fix,
      permissionDenied: false,
    },
    boundary,
  );
  return inside;
}

/** İşletim sisteminin önbelleğindeki konum — izin yoksa/kayıt yoksa `null`. */
async function lastKnownFix(): Promise<CampusFix | null> {
  try {
    const perm = await Location.getForegroundPermissionsAsync();
    if (perm.status !== "granted") return null;
    const position = await Location.getLastKnownPositionAsync({
      // Bundan eski bir kayıt kampüs kararı için anlamsız; kullanıcı o süre
      // içinde şehir değiştirmiş olabilir.
      maxAge: 15 * 60_000,
    });
    if (!position) return null;
    return {
      latitude: position.coords.latitude,
      longitude: position.coords.longitude,
      accuracyMeters: position.coords.accuracy ?? null,
      isMocked: (position as any).mocked === true,
      capturedAt: new Date(position.timestamp || Date.now()).toISOString(),
    };
  } catch (err) {
    devLog("[campus] last known fix failed:", err);
    return null;
  }
}

/** Logout / kampüs değişimi — bir sonraki okuma taze olsun. */
export function clearCampusFixCache(): void {
  cachedFix = null;
  cachedAt = 0;
}
