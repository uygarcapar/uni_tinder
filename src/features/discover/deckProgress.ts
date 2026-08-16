/**
 * Deste ilerlemesinin cold start'a taşınması (MMKV).
 *
 * Backend 2026-08 itibarıyla deste sırasını deterministik üretiyor: sıra
 * `userId + gün kovası + filtre imzası` tohumundan türüyor, uygulama kapanıp
 * açılınca AYNI kalıyor. Frontend hiçbir şey persist etmediği için kullanıcı
 * yine de "stabil sıranın başına" dönüyordu.
 *
 * ── Neden index DEĞİL de demir (anchor) ────────────────────────────────────
 * Entegrasyon rehberi `currentIndex`i saklamayı öneriyor, ama backend swipe
 * edilenleri havuzdan ELİYOR: cold start'ta gelen 1. sayfanın ilk kartı zaten
 * kullanıcının kaldığı kart. Sayısal index'i geri yüklemek bu yüzden ikinci
 * kez atlatırdı (20 swipe → 20 kart daha atlanır). Onun yerine üstte duran
 * kullanıcının ID'sini saklıyoruz:
 *
 *   - kart destede bulunursa index oraya hizalanır (kaldığı yerden devam),
 *   - bulunmazsa (backend düşürmüş: son swipe POST'u inmiş, hesap kapanmış,
 *     filtreden çıkmış) index 0'da kalır — ki doğrusu da o.
 *
 * Hizalamayı DiscoverScreen'deki mevcut `anchorUserIdRef` mekanizması yapıyor;
 * burası sadece o demiri oturumlar arasına taşır.
 *
 * ── Gün damgası ────────────────────────────────────────────────────────────
 * Deste günde bir tazeleniyor. Dünkü demiri/swipe kümesini bugünkü desteye
 * uygulamak yanlış karta atlatır ve backend'in yeniden sunmaya karar verdiği
 * profilleri sessizce gizler, o yüzden gün dönünce kayıt tamamen düşürülür.
 * (Backend'in kovası kullanıcıya özel saatte döner; istemci bunu bilemez —
 * cihaz yerel günü yeterince iyi bir yaklaşım, hata payı en fazla bir tazeleme
 * turudur.)
 */
import { appPrefs } from "@/shared/utils/appPrefs";

const KEY_PREFIX = "discoverDeck:";

// Kümenin sınırsız büyümesini engelle: yalnız EN SON swipe'lananlar tutulur.
const MAX_SWIPED_IDS = 500;

/**
 * Eleme penceresi. Küme yalnızca ŞU yarışı kapatmak için var: swipe POST'u
 * havada iken gelen refetch, backend'in ZREM'i fire-and-forget olduğu için az
 * önce kaydırılan profili hâlâ döndürebiliyor. Bu yarış saniyeler sürer.
 *
 * Eskiden koruma günlüktü (kayıt gün damgalıydı, ID'ler süresizdi) ve tek bir
 * uyuşmazlık desteyi gece yarısına kadar öldürüyordu: backend profili bilerek
 * yeniden sunsa bile istemci "ben bunu kaydırmıştım" deyip eliyor, aday
 * kalmayınca radar ekranı kilitleniyordu. Artık BAYAT ID ELEMİYOR — backend bir
 * profili bu pencereden sonra yeniden sunuyorsa bunu bilerek yapıyordur ve
 * doğru davranış onu göstermektir.
 */
export const SWIPE_GUARD_MS = 15_000;

/** [userId, epoch ms] — kompakt JSON için tuple. */
export type SwipeEntry = [string, number];

export interface DeckProgress {
  /** Kapanış anında üstte duran kartın userId'si. */
  anchorUserId: string | null;
  /** Son swipe'lar + zaman damgaları. Eleme YALNIZ taze olanlara uygulanır. */
  swipes: SwipeEntry[];
}

const EMPTY: DeckProgress = { anchorUserId: null, swipes: [] };

const isFreshEntry = (e: unknown, now: number): e is SwipeEntry =>
  Array.isArray(e) &&
  typeof e[0] === "string" &&
  typeof e[1] === "number" &&
  now - e[1] < SWIPE_GUARD_MS;

/** Cihaz yerel saatiyle YYYY-MM-DD. UTC değil: gün dönümü kullanıcının günü. */
export function dayStamp(now: Date = new Date()): string {
  const p = (n: number) => String(n).padStart(2, "0");
  return `${now.getFullYear()}-${p(now.getMonth() + 1)}-${p(now.getDate())}`;
}

const keyFor = (userId: string) => `${KEY_PREFIX}${userId}`;

export function loadDeckProgress(userId?: string | null): DeckProgress {
  if (!userId) return EMPTY;
  const raw = appPrefs.getString(keyFor(userId));
  if (!raw) return EMPTY;
  try {
    const parsed = JSON.parse(raw);
    // Gün döndü → dünkü ilerleme geçersiz. Kaydı da temizliyoruz ki bir daha
    // parse edilmesin.
    if (parsed?.day !== dayStamp()) {
      appPrefs.remove(keyFor(userId));
      return EMPTY;
    }
    // Bayat kayıtlar YÜKLENİRKEN düşürülüyor. Cold start'ta uygulama en az
    // birkaç saniye kapalı kaldığı için pratikte küme boş döner — kaldığı yeri
    // `anchorUserId` taşır, eleme kümesi değil. Eski şema (düz string dizisi)
    // da bu süzgeçten geçemez; sessizce boşa düşer, doğrusu da o.
    const now = Date.now();
    return {
      anchorUserId:
        typeof parsed.anchorUserId === "string" && parsed.anchorUserId
          ? parsed.anchorUserId
          : null,
      swipes: Array.isArray(parsed.swipes)
        ? (parsed.swipes.filter((e: unknown) => isFreshEntry(e, now)) as SwipeEntry[])
        : [],
    };
  } catch {
    // Bozuk kayıt — sessizce sıfırdan başla.
    appPrefs.remove(keyFor(userId));
    return EMPTY;
  }
}

export function saveDeckProgress(
  userId: string | null | undefined,
  progress: DeckProgress,
): void {
  if (!userId) return;
  appPrefs.set(
    keyFor(userId),
    JSON.stringify({
      day: dayStamp(),
      anchorUserId: progress.anchorUserId,
      swipes: progress.swipes.slice(-MAX_SWIPED_IDS),
    }),
  );
}

export function clearDeckProgress(userId?: string | null): void {
  if (!userId) return;
  appPrefs.remove(keyFor(userId));
}
