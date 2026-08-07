import Purchases, { LOG_LEVEL, PurchasesPackage } from "react-native-purchases";
import { Platform } from "react-native";
import { devLog } from "@/shared/utils/devLog";

const IOS_API_KEY = process.env.EXPO_PUBLIC_REVENUECAT_IOS_API_KEY;
const ANDROID_API_KEY = process.env.EXPO_PUBLIC_REVENUECAT_ANDROID_API_KEY;

export const ENTITLEMENT_ID =
  process.env.EXPO_PUBLIC_REVENUECAT_ENTITLEMENT_ID || "premium";

function looksLikeValidKey(key: string | undefined): boolean {
  if (!key) return false;
  const trimmed = String(key).trim();
  if (trimmed.length < 10) return false;
  if (trimmed.startsWith("YOUR_")) return false;
  if (trimmed.toLowerCase().startsWith("appl_xxxx")) return false;
  if (trimmed.toLowerCase().startsWith("goog_xxxx")) return false;
  return true;
}

let isConfigured = false;

export function isRevenueCatAvailable(): boolean {
  const key = Platform.OS === "ios" ? IOS_API_KEY : ANDROID_API_KEY;
  return looksLikeValidKey(key);
}

export function initRevenueCat(userId?: string | null): void {
  if (isConfigured) return;

  const apiKey = Platform.OS === "ios" ? IOS_API_KEY : ANDROID_API_KEY;
  if (!looksLikeValidKey(apiKey)) {
    if (__DEV__) {
      console.warn(
        "[RevenueCat] API key missing/placeholder — premium akışı devre dışı. " +
          ".env.example'dan kopyalayıp doldur."
      );
    }
    return;
  }

  Purchases.setLogLevel(__DEV__ ? LOG_LEVEL.WARN : LOG_LEVEL.ERROR);
  Purchases.configure({
    apiKey: apiKey!,
    appUserID: userId ? String(userId) : undefined,
  });
  isConfigured = true;
}

export async function loginRevenueCat(userId: string): Promise<void> {
  if (!isConfigured) return;
  try {
    await Purchases.logIn(String(userId));
  } catch (e) {
    console.error("RevenueCat login error:", e);
  }
}

export async function logoutRevenueCat(): Promise<void> {
  if (!isConfigured) return;
  try {
    await Purchases.logOut();
  } catch {
    // RC anonymous user için logout 22 (LogOutWithAnonymousUserError) atar — yutulur.
  }
}

export async function getOfferings(): Promise<any | null> {
  if (!isConfigured) return null;
  const offerings = await Purchases.getOfferings();
  return offerings.current;
}

export async function purchasePackage(pkg: PurchasesPackage): Promise<boolean> {
  if (!isConfigured) {
    throw new Error("RevenueCat henüz yapılandırılmamış (API key eksik).");
  }
  const { customerInfo } = await Purchases.purchasePackage(pkg);
  return customerInfo.entitlements.active[ENTITLEMENT_ID] !== undefined;
}

export async function restorePurchases(): Promise<boolean> {
  if (!isConfigured) {
    throw new Error("RevenueCat henüz yapılandırılmamış (API key eksik).");
  }
  const customerInfo = await Purchases.restorePurchases();
  return customerInfo.entitlements.active[ENTITLEMENT_ID] !== undefined;
}

export async function getRevenueCatPremiumStatus(): Promise<{
  isPremium: boolean;
  expiresAt: string | null;
}> {
  if (!isConfigured) return { isPremium: false, expiresAt: null };
  try {
    const info = await Purchases.getCustomerInfo();
    const entitlement = info?.entitlements?.active?.[ENTITLEMENT_ID];
    if (!entitlement) return { isPremium: false, expiresAt: null };
    return {
      isPremium: true,
      expiresAt: entitlement.expirationDate ?? null,
    };
  } catch {
    return { isPremium: false, expiresAt: null };
  }
}

export interface RevenueCatSnapshot {
  /** RC SDK'ya göre entitlement aktif mi. Client-side — AUTHORITATIVE DEĞİL,
   *  yalnızca backend ile çelişki tespiti (reconcile) için sinyaldir. */
  isPremium: boolean;
  expiresAt: string | null;
  /** Backend `/reconcile` audit payload'ı için aktif entitlement key'leri. */
  entitlements: string[];
  productId: string | null;
  originalPurchaseDate: string | null;
  latestPurchaseDate: string | null;
}

/**
 * `/api/subscription/reconcile` payload'ı + mismatch tespiti için RC snapshot'ı.
 *
 * NOT: RC `CustomerInfo` transaction id'yi doğrudan expose etmiyor (yalnızca
 * `nonSubscriptionTransactions` consumable'lar için taşıyor). Backend bu alanları
 * audit amaçlı ve opsiyonel istediği için elimizdeki purchase date'leri
 * gönderiyoruz; eşleştirmeyi backend `app_user_id` üzerinden yapıyor.
 */
export async function getRevenueCatSnapshot(): Promise<RevenueCatSnapshot | null> {
  if (!isConfigured) return null;
  try {
    const info = await Purchases.getCustomerInfo();
    const active = info?.entitlements?.active ?? {};
    const entitlement = active[ENTITLEMENT_ID];
    return {
      isPremium: !!entitlement,
      expiresAt: entitlement?.expirationDate ?? null,
      entitlements: Object.keys(active),
      productId: entitlement?.productIdentifier ?? null,
      originalPurchaseDate: (entitlement as any)?.originalPurchaseDate ?? info?.originalPurchaseDate ?? null,
      latestPurchaseDate: (entitlement as any)?.latestPurchaseDate ?? null,
    };
  } catch {
    return null;
  }
}

/**
 * RC SDK abonelik değişimlerini (yenileme, iptal, billing issue, expire) push
 * eder. Bu listener olmadan bu değişiklikleri ancak bir sonraki foreground
 * `/status` çağrısında öğreniyorduk. Callback'te backend'i canonical kabul edip
 * `/status` tazeliyoruz — RC değerini doğrudan state'e YAZMIYORUZ.
 * Dönen fonksiyon listener'ı kaldırır.
 */
export function addCustomerInfoListener(cb: () => void): () => void {
  if (!isConfigured) return () => {};
  try {
    Purchases.addCustomerInfoUpdateListener(cb);
    return () => {
      try {
        (Purchases as any).removeCustomerInfoUpdateListener?.(cb);
      } catch {
        // RC SDK sürümünde remove yoksa yut — listener app ömrü boyunca kalır.
      }
    };
  } catch {
    return () => {};
  }
}

// chat_unlock consumable'ı 2026-08-02'de kaldırıldı: sohbet kotası dolduğunda
// artık ürün satılmıyor, Premium aboneliği (PurchaseModal) açılıyor.

// ─── SuperLike paketleri (consumable) ────────────────────────────────────────
//
// Abonelikten AYRI bir RC offering'de duruyorlar: `getOfferings()` yalnızca
// `offerings.current`i (premium) döndürüyor, paketler `offerings.all[...]`
// altında. Consumable oldukları için entitlement üretmezler — satın alma
// "olmuş" sayılır sayılmaz backend'e `transactionId` ile redeem edilmeleri
// gerekir (bkz. superlikeRedeem.ts).

export const SUPERLIKE_OFFERING_ID =
  process.env.EXPO_PUBLIC_REVENUECAT_SUPERLIKE_OFFERING_ID || "superlikes";

/** ASC/RC ürün id kuralı: `superlike_5` / `_10` / `_15` / `_20`. */
const SUPERLIKE_PRODUCT_RE = /^superlike/i;

export interface SuperlikeStoreTransaction {
  transactionId: string;
  productId: string;
  purchaseDate: string | null;
}

export async function getSuperlikeOffering(): Promise<any | null> {
  if (!isConfigured) {
    devLog("[RevenueCat] superlike offering: SDK not configured (API key?)");
    return null;
  }
  const offerings = await Purchases.getOfferings();
  const found = (offerings as any)?.all?.[SUPERLIKE_OFFERING_ID] ?? null;
  if (!found || (found.availablePackages?.length ?? 0) === 0) {
    // Paket listesi boş kaldığında sheet "yüklenemedi" gösteriyor ve nedeni
    // cihazda görünmüyordu. RC'nin gerçekten döndüğü offering id'lerini yaz:
    // eksik offering (dashboard'da tanımlı değil) ile ürünlerin StoreKit'ten
    // gelmemesi (ASC'de hazır değil / RC ürün eşleşmesi yok) ayırt edilebilsin.
    devLog(
      `[RevenueCat] "${SUPERLIKE_OFFERING_ID}" offering'i boş/yok.`,
      "mevcut offering'ler:",
      Object.keys((offerings as any)?.all ?? {}),
      "paket sayısı:",
      found?.availablePackages?.length ?? 0,
    );
  }
  return found;
}

/**
 * Consumable'da satın almanın kendisi bakiyeyi ARTIRMAZ; backend'e redeem
 * edilecek `transactionId` burada çıkarılıyor.
 *
 * RC 10'da `purchasePackage` sonucu `transaction` taşıyor, ama native shim'in
 * onu boş bıraktığı sürümler görüldü — o durumda `customerInfo`daki
 * non-subscription geçmişinden aynı ürünün EN YENİ kaydına düşüyoruz.
 */
export async function purchaseSuperlikePack(
  pkg: PurchasesPackage,
): Promise<{ transactionId: string | null; productId: string | null }> {
  if (!isConfigured) {
    throw new Error("RevenueCat henüz yapılandırılmamış (API key eksik).");
  }
  const res: any = await Purchases.purchasePackage(pkg);
  const productId =
    res?.productIdentifier ?? (pkg as any)?.product?.identifier ?? null;
  const transactionId =
    res?.transaction?.transactionIdentifier ??
    latestTransactionId(res?.customerInfo, productId);
  return { transactionId, productId };
}

function transactionTime(tx: any): number {
  const ts = Date.parse(tx?.purchaseDate ?? "");
  return Number.isFinite(ts) ? ts : 0;
}

function latestTransactionId(
  customerInfo: any,
  productId: string | null,
): string | null {
  const all: any[] = customerInfo?.nonSubscriptionTransactions ?? [];
  const scoped = productId
    ? all.filter((t) => t?.productIdentifier === productId)
    : all;
  // Ürüne göre eşleşen yoksa (RC ürünü farklı adlandırmışsa) tüm geçmişe düş —
  // yanlış transaction göndermek zararsız: backend receipt'i kendi doğruluyor,
  // uyuşmazlıkta 400/402 döner, kredi uydurulmaz.
  const pool = scoped.length > 0 ? scoped : all;
  let best: any = null;
  for (const tx of pool) {
    if (!tx?.transactionIdentifier) continue;
    if (!best || transactionTime(tx) > transactionTime(best)) best = tx;
  }
  return best?.transactionIdentifier ?? null;
}

/**
 * Cihazda duran superlike satın almaları — "parayı aldık, krediyi vermedik"
 * kurtarma yolu. Uygulama satın alma ile kendi kuyruğuna yazma arasında
 * öldürülürse elimizde YALNIZCA bu kayıt kalır.
 *
 * `withinMs` penceresi bilinçli: RC bu listeyi süresiz taşıyor, pencere olmadan
 * her yeniden kurulumda tüm geçmiş tekrar redeem edilirdi (idempotent olduğu
 * için zararsız ama gereksiz onlarca istek).
 */
export async function getRecentSuperlikeTransactions(
  withinMs = 24 * 60 * 60 * 1000,
): Promise<SuperlikeStoreTransaction[]> {
  if (!isConfigured) return [];
  try {
    const info = await Purchases.getCustomerInfo();
    const now = Date.now();
    return ((info as any)?.nonSubscriptionTransactions ?? [])
      .filter(
        (tx: any) =>
          tx?.transactionIdentifier &&
          SUPERLIKE_PRODUCT_RE.test(tx?.productIdentifier ?? ""),
      )
      .filter((tx: any) => now - transactionTime(tx) <= withinMs)
      .map((tx: any) => ({
        transactionId: String(tx.transactionIdentifier),
        productId: String(tx.productIdentifier),
        purchaseDate: tx.purchaseDate ?? null,
      }));
  } catch {
    return [];
  }
}
