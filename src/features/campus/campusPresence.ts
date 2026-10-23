import * as Location from "expo-location";
import { devLog } from "@/shared/utils/devLog";
import {
  isConfidentlyInsideCampus,
  isInsideCampus,
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
    return {
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
  }

  const perm = await Location.getForegroundPermissionsAsync().catch(() => null);
  if (perm && perm.status !== "granted") {
    return { ...EMPTY, permissionDenied: true };
  }

  const fix = await readCampusFix({ force: args?.force });
  if (!fix) return EMPTY;

  return {
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
}

/** Logout / kampüs değişimi — bir sonraki okuma taze olsun. */
export function clearCampusFixCache(): void {
  cachedFix = null;
  cachedAt = 0;
}
