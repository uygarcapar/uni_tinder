import { appPrefs } from "@/shared/utils/appPrefs";
import { parseBackendDate } from "@/shared/utils/backendDate";
import { premiumSyncUserKey } from "@/features/profile/pendingPremiumSync";
import type { SubscriptionStatusSnapshot } from "@/shared/types";

/**
 * Son BİLİNEN premium durumunun kalıcı kopyası — internetsiz açılış için.
 *
 * Redux `subscription` slice'ı persist EDİLMİYOR (bilinçli, bkz.
 * `pendingPremiumSync`): diskten rehydrate edilen bir `isPremium` hesap
 * değişiminde sızar. Bedeli şuydu: uygulama kapatılıp internetsiz açıldığında
 * ödeme yapmış kullanıcı `isPremium:false, resolved:false` doğuyordu. Tek
 * kurtarıcı `/status` hatasındaki RC SDK cache'i ([subscriptionSlice] catch
 * dalı) ve o yol TEK PLATFORM: Android'de RC anahtarı yapılandırılmadığı için
 * `isConfigured` false, fallback anında `false` dönüyor. `resolved:false`
 * penceresindeki ekran yedeklerinin (`getMyProfile`, `/swipe/stats`) hepsi de
 * ağa bağlı, react-query diske yazmıyor — yani offline'da hiçbiri konuşmuyor.
 *
 * Burada saklanan şey bir HAK DEĞİL, son kanonik cevabın kopyası. Üç sınırı
 * var ve üçü de bunu "offline ipucu" seviyesinde tutuyor:
 *   • hesap bazlı anahtar   → başka kullanıcıya sızamaz,
 *   • `expiresAt` geçmişse  → okunmaz (abonelik zaten bitmiş),
 *   • MAX_AGE               → süresiz `expiresAt` (RC fallback/lifetime) bile
 *                             sonsuza kadar premium göstermez.
 * İlk başarılı `/status` üzerine yazar, backend `false` derse kayıt SİLİNİR.
 * Gerçek zorlama sunucuda: offline'da premium özelliklerin tamamı zaten
 * çalışmıyor, burada yanılmanın maliyeti yalnızca rozet/kilit görünümü —
 * ters yönde yanılmanın maliyeti ise ödemiş kullanıcıya upsell göstermek.
 *
 * NOT: `appPrefs` ŞİFRESİZ instance (redux-app değil). Bilinçli — bu bir sır
 * değil ve şifreli deponun anahtarsız kalma tuzağına (bkz. tokenStorage) bir
 * de premium ipucunu bağlamanın anlamı yok.
 */

const key = (userId: string) => `premiumSnapshot:${userId}`;

/**
 * `expiresAt` bilinmiyorken (RC REST fallback'i tarih vermeyebiliyor) kaydın
 * üst ömrü. Bu olmadan tek bir tarihsiz `true`, cihaz bir daha hiç ağa
 * çıkmasa bile premium'u kalıcı gösterirdi.
 */
const MAX_AGE_MS = 7 * 24 * 60 * 60 * 1000;

export interface PremiumSnapshot extends SubscriptionStatusSnapshot {
  /** Kaydın yazıldığı an (epoch ms) — MAX_AGE guard'ı için. */
  savedAt: number;
}

export function readPremiumSnapshot(
  userId: string | null | undefined,
): PremiumSnapshot | null {
  if (!userId) return null;
  const uid = String(userId);
  try {
    const raw = appPrefs.getString(key(uid));
    if (!raw) return null;
    const p = JSON.parse(raw);
    // Yalnız premium kaydediliyor; `false` bir kayıt bulunursa bozuk sayılır.
    if (p?.isPremium !== true) return null;
    if (typeof p.savedAt !== "number" || Date.now() - p.savedAt > MAX_AGE_MS) {
      clearPremiumSnapshot(uid);
      return null;
    }
    // Tarih VARSA bağlayıcı: geçmişteyse abonelik bitmiş, ipucu da bitmiştir.
    // `selectIsPremium` ile aynı kural — iki yüzey aynı tarihe farklı hüküm
    // vermesin.
    const expiry = parseBackendDate(p.expiresAt);
    if (expiry && expiry.getTime() <= Date.now()) {
      clearPremiumSnapshot(uid);
      return null;
    }
    return {
      isPremium: true,
      expiresAt: p.expiresAt ?? null,
      status: p.status ?? null,
      productId: p.productId ?? null,
      autoRenewEnabled: p.autoRenewEnabled === true,
      isTrial: p.isTrial === true,
      trialEndsAt: p.trialEndsAt ?? null,
      gracePeriodEndsAt: p.gracePeriodEndsAt ?? null,
      cancelledAt: p.cancelledAt ?? null,
      provider: p.provider ?? null,
      savedAt: p.savedAt,
    };
  } catch {
    return null;
  }
}

export function writePremiumSnapshot(
  userId: string | null | undefined,
  s: SubscriptionStatusSnapshot,
): void {
  if (!userId || !s.isPremium) return;
  try {
    appPrefs.set(
      key(String(userId)),
      JSON.stringify({
        isPremium: true,
        expiresAt: s.expiresAt ?? null,
        status: s.status ?? null,
        productId: s.productId ?? null,
        autoRenewEnabled: s.autoRenewEnabled === true,
        isTrial: s.isTrial === true,
        trialEndsAt: s.trialEndsAt ?? null,
        gracePeriodEndsAt: s.gracePeriodEndsAt ?? null,
        cancelledAt: s.cancelledAt ?? null,
        provider: s.provider ?? null,
        savedAt: Date.now(),
      }),
    );
  } catch {
    // MMKV yazamazsa (disk dolu) ipucu yalnız bu oturumla sınırlı kalır.
  }
}

export function clearPremiumSnapshot(userId: string | null | undefined): void {
  if (!userId) return;
  try {
    // MMKV v4 API'si `remove` (`delete` YOK) — yanlış ad sessizce TypeError
    // fırlatır ve kayıt asla silinmezdi (bkz. clearPendingPremiumSync).
    appPrefs.remove(key(String(userId)));
  } catch {
    // yut
  }
}

/** Diske en son aynalanan içeriğin imzası — bkz. `signatureOf`. */
let lastMirrored: string | null = null;

/**
 * Diske yazılan İÇERİĞİN imzası. `statusResolvedAt` bilerek DIŞARIDA: her
 * kanonik yazımda `Date.now()` oluyor, imzaya girse aynı cevap her `/status`
 * turunda yeniden yazılırdı. `subscription/` altındaki action'ların çoğu
 * (`fetchStatus/pending`, `rejected`, `syncing`) premium'un kendisini hiç
 * değiştirmiyor — imza olmadan hepsi bir MMKV yazımı ve, daha kötüsü, bir
 * `savedAt` tazelemesi demekti: MAX_AGE guard'ı uygulama açık kaldıkça
 * sonsuza kadar ötelenirdi.
 */
const signatureOf = (uid: string, sub: any): string =>
  [
    uid,
    sub.isPremium,
    sub.expiresAt,
    sub.status,
    sub.productId,
    sub.autoRenewEnabled,
    sub.isTrial,
    sub.trialEndsAt,
    sub.gracePeriodEndsAt,
    sub.cancelledAt,
    sub.provider,
  ].join("|");

/**
 * Kanonik her premium yazımını diske aynalar.
 *
 * Neden middleware: `applyStatus`'a yazan DÖRT yol var (`/status`, hub event'i,
 * `/sync`, `/reconcile`) ve reducer'lar saf kalmalı. Dördünü tek tek çağırmak
 * yerine sonucu tek noktadan dinlemek, ileride eklenecek beşinci yolun da
 * otomatik kapsanması demek.
 *
 * Üç şeye YAZMIYOR:
 *   • `subscription/` dışındaki action'lar — sohbet trafiğinde her action için
 *     state okumanın anlamı yok (gate `action.type` üzerinde).
 *   • `resolvedFromCache` — diskten okuduğumuzu diske geri yazmak `savedAt`'i
 *     tazeler ve MAX_AGE guard'ını ölümsüzleştirirdi.
 *   • optimistic premium — satın alma anındaki yerel `true` backend teyidi
 *     DEĞİL. Aktive olmayan bir satın alma (sandbox filtresi, düşmeyen webhook)
 *     aksi halde 7 gün boyunca offline premium ipucu bırakırdı.
 */
export const premiumSnapshotMiddleware =
  (store: any) => (next: any) => (action: any) => {
    const result = next(action);
    const type = action?.type;
    if (typeof type !== "string" || !type.startsWith("subscription/")) {
      return result;
    }
    const state = store.getState();
    const sub = state?.subscription;
    // `statusResolvedAt == null` → henüz kanonik cevap yok (logout'un
    // `setPremium(false)`'ı da bu daldan geçer: kayıt hesap bazlı, silmiyoruz).
    if (!sub || sub.resolvedFromCache || sub.statusResolvedAt == null) {
      return result;
    }
    if (sub.optimisticPremiumAt != null) return result;
    const uid = premiumSyncUserKey(state?.auth?.user);
    if (!uid) return result;
    const signature = signatureOf(uid, sub);
    if (signature === lastMirrored) return result;
    lastMirrored = signature;
    // Backend "premium değil" dediyse kaydı SİLMEK şart: `admin_revoke` veya
    // iade sonrası `expiresAt` hâlâ gelecekte olabiliyor, tarih guard'ı o
    // kaydı tek başına düşüremezdi.
    if (sub.isPremium) writePremiumSnapshot(uid, sub);
    else clearPremiumSnapshot(uid);
    return result;
  };
