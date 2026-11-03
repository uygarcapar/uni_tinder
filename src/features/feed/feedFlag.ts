import { appPrefs } from "@/shared/utils/appPrefs";
import { devForceFeedEnabled } from "./feedDevFlag";

/**
 * Akış bayrağı latch'i (UT-7301).
 *
 * ── Problem ────────────────────────────────────────────────────────────────
 * Backend `feed.enabled` kapalıyken her `/api/feed/*` ucu 403 + UT-7301
 * dönüyor. Sekme çizilmemeli, ama sekme listesi `TabNavigator`'da STATİK ve
 * açılışta bir `/feed/me` fetch'i atmak bu kod tabanının bilinçli olarak
 * inceltmiş olduğu cold-boot istek seline eklenirdi (bkz. TabNavigator'daki
 * `lazy: true` yorumu ve AppNavigator'ın uyanma fırtınası notu).
 *
 * ── Çözüm: diskte latch, oturumda TEK YÖNLÜ canlı değer ─────────────────────
 * Değer MMKV'de (`app-prefs`, logout'u aşıyor), boot'ta okunup modül
 * seviyesinde tutuluyor. `TabNavigator` onu `useSyncExternalStore` ile
 * (`subscribeFeedFlag`) okuyor; oturum içinde yalnız kapalı → açık yönünde
 * değişebildiği için sekme listesi asla küçülmez.
 *
 * ── Geçiş kuralı: ekleme CANLI, çıkarma cold start ─────────────────────────
 * EKLEME yönü canlı: `recordFeedFlag(…, true)` oturum değerini hemen açar,
 * `true` döner ve aboneleri (`subscribeFeedFlag` → TabNavigator) haberdar
 * eder. Sekme ortada dursa da bu güvenli — TabRouter route listesi değişince
 * odaklı sekmeyi İSMİYLE yeniden çözüyor, native tab bar da seçimi route
 * KEY'iyle taşıyor (gerekçe TabNavigator'daki Feed yorumunda). ÇIKARMA yönü
 * dondurulmuş kalır — canlı kaldırma kullanıcının üstünde durduğu sekmeyi
 * altından çekebilir — yani `false` yazımı diski günceller, oturuma DOKUNMAZ
 * ve bir sonraki cold start'ta yürürlüğe girer.
 *
 * ── Kapanma yönü probe GEREKTİRMİYOR ───────────────────────────────────────
 * Herhangi bir feed çağrısının UT-7301'i zaten söylüyor → `markFeedDisabled`.
 * Probe YALNIZ açılma yönü için var (feedProbe.ts): boot'ta ve
 * `runForegroundSync`'te deneniyor; sekme zaten görünürse `useFeedMe` `/me`'nin
 * sahibi olduğu için probe hiç atılmaz → kararlı durumda SIFIR ek istek.
 */

const KEY_PREFIX = "feedFlag:";
const PROBE_KEY = "feedFlagProbedAt";
const SCHEMA_VERSION = 1;

/** Probe aralığı — bayrak günler içinde açılan bir şey, dakikalar içinde değil. */
export const FEED_FLAG_PROBE_INTERVAL_MS = 6 * 60 * 60 * 1000;

export type FeedFlag = "on" | "off" | "unknown";

interface StoredFlag {
  v: number;
  enabled: boolean;
  at: number;
}

const keyFor = (userId: string) => `${KEY_PREFIX}${userId}`;

/**
 * Oturumun dondurulmuş değeri. `null` = `initFeedFlag` henüz çağrılmadı.
 * ⚠️ Doğrudan okunmaz; `feedEnabledForSession()` üzerinden gidilir.
 */
let sessionEnabled: boolean | null = null;
/** Latch'in sahibi olan kullanıcı — hesap değişiminde yeniden okunsun. */
let sessionUserId: string | null = null;

/**
 * Oturum değerinin aboneleri — TabNavigator `useSyncExternalStore` ile buraya
 * bağlı. Yalnız `feedEnabledForSession()`ın SONUCU değiştiğinde haber verilir;
 * mid-session değişim tek yönlü (kapalı → açık) olduğu için abonenin sekme
 * listesi asla küçülmez.
 */
const listeners = new Set<() => void>();

function notifyIfChanged(before: boolean): void {
  if (feedEnabledForSession() === before) return;
  listeners.forEach((listener) => {
    try {
      listener();
    } catch {
      // Bir abonenin patlaması diğerlerini (ve yazma yolunu) düşürmesin.
    }
  });
}

export function subscribeFeedFlag(listener: () => void): () => void {
  listeners.add(listener);
  return () => {
    listeners.delete(listener);
  };
}

/** Diskteki değeri okur; yazılmamışsa "unknown". Oturum değerine DOKUNMAZ. */
export function readFeedFlag(userId?: string | null): FeedFlag {
  if (!userId) return "unknown";
  const raw = appPrefs.getString(keyFor(userId));
  if (!raw) return "unknown";
  try {
    const parsed = JSON.parse(raw) as StoredFlag;
    // Şema sürümü uyuşmuyorsa "bilmiyorum" — eski şekli yorumlamaya çalışmak
    // yanlış bir "kapalı" üretip sekmeyi gizleyebilir.
    if (!parsed || parsed.v !== SCHEMA_VERSION) return "unknown";
    return parsed.enabled ? "on" : "off";
  } catch {
    return "unknown";
  }
}

function writeFeedFlag(userId: string, enabled: boolean): void {
  const payload: StoredFlag = { v: SCHEMA_VERSION, enabled, at: Date.now() };
  try {
    appPrefs.set(keyFor(userId), JSON.stringify(payload));
  } catch {
    // MMKV yazımı başarısız → bir sonraki açılışta "unknown"a düşer, sekme
    // gizli kalır. Kozmetik; boot'u bloklamaz.
  }
}

/**
 * Boot'ta BİR KEZ (auth çözüldükten hemen sonra) çağrılır: diski okur ve
 * oturum değerini kilitler.
 *
 * "unknown" → KAPALI sayılır. Bilmediğimiz durumda sekmeyi çizmemek doğru
 * taraf: çizip her uçtan 403 almak kullanıcıya bozuk bir özellik gösterir.
 */
export function initFeedFlag(userId?: string | null): FeedFlag {
  const before = feedEnabledForSession();
  const flag = readFeedFlag(userId);
  sessionUserId = userId ?? null;
  // 🔴 Dev kancası: yalnız __DEV__'de ve yalnız latch "açık değil" derken
  // sekmeyi zorla açar. Gerçek bir "on"u maskelemiyor (zaten true olurdu).
  // Silinecekse: feedDevFlag.ts + bu satır. Ayrıntı o dosyanın başlığında.
  sessionEnabled = flag === "on" || devForceFeedEnabled();
  // TabNavigator bu init'ten ÖNCE mount olmuş olabilir (efekt sırası) —
  // abonelik sayesinde donmuş bir "kapalı" snapshot'ında takılı kalmaz.
  notifyIfChanged(before);
  return flag;
}

/** Hesap değişiminde latch'i serbest bırak — sonraki init yeniden okusun. */
export function resetFeedFlagSession(): void {
  sessionEnabled = null;
  sessionUserId = null;
}

/** `TabNavigator` ve `openFeed` bunu okur. init çağrılmadıysa kapalı. */
export function feedEnabledForSession(): boolean {
  return sessionEnabled === true;
}

/**
 * Sunucudan taze cevap geldi → diske yaz.
 *
 * Dönüş: "bu değişim ŞİMDİ uygulandı mı". EKLEME yönü canlı: oturum değeri
 * hemen açılır, aboneler haberdar edilir, `true` döner. ÇIKARMA yönü (ve
 * sahibi oturumla eşleşmeyen yazımlar) yalnız diski günceller, `false` döner
 * — yukarıdaki geçiş kuralı.
 */
export function recordFeedFlag(
  userId: string | null | undefined,
  enabled: boolean,
): boolean {
  const owner = userId ?? sessionUserId;
  if (!owner) return false;
  writeFeedFlag(owner, enabled);
  if (!enabled) return false; // kapanma: bir sonraki cold start'ta
  // Sahibi doğrulanamayan "on" oturuma uygulanmaz: init henüz koşmadıysa
  // (sessionUserId null) ya da cevap başka hesaba aitse sekme açılmaz —
  // disk günceldir, doğru oturum kendi init'inde okur.
  if (owner !== sessionUserId) return false;
  const before = feedEnabledForSession();
  sessionEnabled = true;
  notifyIfChanged(before);
  return true;
}

/**
 * Bir feed çağrısı UT-7301 verdi → diske OFF yaz.
 *
 * ⚠️ YALNIZ UT-7301 için çağrılır. UT-7315 (profil tamamlanmamış) de 403 ama
 * "özellik kapalı" DEMİYOR — onu buraya sokmak profili yarım bir kullanıcı
 * yüzünden sekmeyi herkese kapatırdı.
 */
export function markFeedDisabled(userId?: string | null): void {
  recordFeedFlag(userId, false);
}

/** Probe gerekli mi: sekme zaten görünüyorsa HAYIR (useFeedMe /me'nin sahibi). */
export function shouldProbeFeedFlag(now: number = Date.now()): boolean {
  if (feedEnabledForSession()) return false;
  const last = appPrefs.getNumber(PROBE_KEY) ?? 0;
  return now - last >= FEED_FLAG_PROBE_INTERVAL_MS;
}

export function markFeedFlagProbed(now: number = Date.now()): void {
  try {
    appPrefs.set(PROBE_KEY, now);
  } catch {
    // Yazılamadıysa bir sonraki foreground'da tekrar denenir; 6 saatlik
    // throttle'ın kaçırılması tek fazladan istek demek.
  }
}
