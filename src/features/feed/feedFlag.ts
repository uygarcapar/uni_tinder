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
 * ── Çözüm: diskte latch, oturum boyunca DONDURULMUŞ ─────────────────────────
 * Değer MMKV'de (`app-prefs`, logout'u aşıyor), boot'ta bir kez okunup modül
 * seviyesinde kilitleniyor. `TabNavigator` onu bir `useState` initializer'ında
 * okuyor → sekme listesi render arasında ŞEKİL DEĞİŞTİRMİYOR.
 *
 * ── Geçiş kuralı: her iki yönde de cold start ──────────────────────────────
 * Akış sekmesi tab bar'ın ORTASINDA (Beğeniler'den sonra). Araya sekme eklemek
 * mevcut route index'lerini kaydırdığı için canlı ekleme kullanıcının seçili
 * sekmesini oynatabilir; canlı kaldırma ise üstünde durduğu sekmeyi altından
 * çeker. O yüzden `recordFeedFlag` HER İKİ yönde de `false` döner: disk güncel
 * tutulur, oturum değeri DOKUNULMAZ. Bayrak açıldığı gün kullanıcı bir kez
 * uygulamayı yeniden başlatmak zorunda — bilinçli kabul edilen maliyet.
 * (Sekme en sona alınsaydı ekleme yönü canlı yapılabilirdi; plan §4.1d.)
 *
 * ── Kapanma yönü probe GEREKTİRMİYOR ───────────────────────────────────────
 * Herhangi bir feed çağrısının UT-7301'i zaten söylüyor → `markFeedDisabled`.
 * Probe YALNIZ açılma yönü için var ve `runForegroundSync`'e biniyor; sekme
 * zaten görünürse `useFeedMe` `/me`'nin sahibi olduğu için probe hiç atılmaz →
 * kararlı durumda SIFIR ek istek.
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
  const flag = readFeedFlag(userId);
  sessionUserId = userId ?? null;
  // 🔴 Dev kancası: yalnız __DEV__'de ve yalnız latch "açık değil" derken
  // sekmeyi zorla açar. Gerçek bir "on"u maskelemiyor (zaten true olurdu).
  // Silinecekse: feedDevFlag.ts + bu satır. Ayrıntı o dosyanın başlığında.
  sessionEnabled = flag === "on" || devForceFeedEnabled();
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
 * Dönüş: "bu değişim ŞİMDİ uygulanabilir mi". Ortada duran sekme için HER İKİ
 * yönde de `false` (yukarıdaki geçiş kuralı). İmza ve dönüş tipi bilinçli böyle
 * duruyor: sekme en sona taşınırsa burada tek satır değişip ekleme yönü canlı
 * hale gelebilsin, çağıranlar bozulmasın.
 */
export function recordFeedFlag(
  userId: string | null | undefined,
  enabled: boolean,
): boolean {
  const owner = userId ?? sessionUserId;
  if (!owner) return false;
  writeFeedFlag(owner, enabled);
  return false;
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
