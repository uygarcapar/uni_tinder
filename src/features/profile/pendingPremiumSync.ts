import { appPrefs } from "@/shared/utils/appPrefs";

/**
 * "Parayı aldık, premium vermedik" kaydı — KALICI.
 *
 * Redux `subscription` slice'ı persist EDİLMİYOR (bilinçli: diskten rehydrate
 * edilen `isPremium` hesap değişiminde sızar ve backend'in reddedeceği kilitleri
 * client'ta açmış oluruz). Bu yüzden satın alma ile backend'in premium'u
 * görmesi arasındaki pencere reload'u atlatamıyordu: optimistic bayrak RAM'de
 * kalıyor, uygulama yeniden açıldığında kullanıcı hiç satın almamış gibi
 * görünüyordu.
 *
 * Burada persist edilen şey premium'un KENDİSİ değil, "bu kullanıcı ödedi ama
 * backend henüz doğrulamadı" olgusu. Kayıt varken uygulama her açılışta ve her
 * foreground'da `/sync` denemeye devam eder (bkz. `resolvePendingPremiumSync`)
 * ve ProfileScreen "aktivasyon sürüyor" kartını gösterir. Premium onaylandığı
 * an kayıt silinir.
 *
 * SuperLike redeem kuyruğunun (`superlikeRedeem.ts`) abonelik tarafındaki
 * karşılığı; anahtar aynı şekilde hesap bazlı, MMKV `app-prefs` instance'ında.
 */

const key = (userId: string) => `pendingPremiumSync:${userId}`;

/**
 * Bu yaştan sonra kayıt düşürülür. Abonelik webhook'u normalde saniyeler,
 * en kötü dakikalar içinde iniyor; bir hafta boyunca inmediyse (prod'da sandbox
 * satın alması, RC webhook konfigürasyonu bozuk vb.) sorun retry ile çözülmez.
 * Kaydı süresiz tutmak her açılışa bir istek ekler ve kullanıcıya sonsuza kadar
 * "aktivasyon sürüyor" göstermek anlamına gelirdi.
 */
const MAX_AGE_MS = 7 * 24 * 60 * 60 * 1000;

export interface PendingPremiumSync {
  /** Satın almanın alındığı an (epoch ms). */
  at: number;
  productId: string | null;
  /** Kaç kez `/sync` denendi — telemetri ve destek için. */
  attempts: number;
}

/** Backend bazı yanıtlarda `userId`, bazılarında `id` döndürüyor. */
export function premiumSyncUserKey(user: any): string | null {
  const uid = user?.userId ?? user?.id;
  return uid ? String(uid) : null;
}

export function readPendingPremiumSync(
  userId: string | null | undefined,
): PendingPremiumSync | null {
  if (!userId) return null;
  try {
    const raw = appPrefs.getString(key(String(userId)));
    if (!raw) return null;
    const parsed = JSON.parse(raw);
    if (typeof parsed?.at !== "number") return null;
    if (Date.now() - parsed.at > MAX_AGE_MS) {
      clearPendingPremiumSync(userId);
      return null;
    }
    return {
      at: parsed.at,
      productId: parsed.productId ?? null,
      attempts: typeof parsed.attempts === "number" ? parsed.attempts : 0,
    };
  } catch {
    return null;
  }
}

export function hasPendingPremiumSync(
  userId: string | null | undefined,
): boolean {
  return readPendingPremiumSync(userId) !== null;
}

/**
 * Satın alma/restore başarılı olduğu anda çağrılır. Mevcut kaydın `at`'i
 * KORUNUR — yaş guard'ı ilk ödemeden itibaren işlesin, her denemede sıfırlanıp
 * kayıt ölümsüzleşmesin.
 */
export function markPendingPremiumSync(
  userId: string | null | undefined,
  meta?: { productId?: string | null },
): void {
  if (!userId) return;
  const uid = String(userId);
  const existing = readPendingPremiumSync(uid);
  const next: PendingPremiumSync = {
    at: existing?.at ?? Date.now(),
    productId: meta?.productId ?? existing?.productId ?? null,
    attempts: existing?.attempts ?? 0,
  };
  try {
    appPrefs.set(key(uid), JSON.stringify(next));
  } catch {
    // MMKV yazamazsa (disk dolu) kurtarma yalnız bu oturumla sınırlı kalır.
  }
}

/** `/sync` denendi ama premium hâlâ görünmüyor. */
export function bumpPendingPremiumSyncAttempt(
  userId: string | null | undefined,
): void {
  if (!userId) return;
  const uid = String(userId);
  const existing = readPendingPremiumSync(uid);
  if (!existing) return;
  try {
    appPrefs.set(
      key(uid),
      JSON.stringify({ ...existing, attempts: existing.attempts + 1 }),
    );
  } catch {
    // yut — sayaç yalnız telemetri için.
  }
}

export function clearPendingPremiumSync(
  userId: string | null | undefined,
): void {
  if (!userId) return;
  try {
    // MMKV v4 API'si `remove` (`delete` YOK) — yanlış ad sessizce TypeError
    // fırlatır ve kayıt asla silinmezdi.
    appPrefs.remove(key(String(userId)));
  } catch {
    // yut
  }
}
