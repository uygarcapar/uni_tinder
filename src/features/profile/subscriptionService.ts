import Purchases, { LOG_LEVEL, PurchasesPackage } from "react-native-purchases";
import { Platform } from "react-native";

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

export const CHAT_UNLOCK_PRODUCT_ID = "chat_unlock";

export async function getChatUnlockPackage(): Promise<PurchasesPackage | null> {
  const offerings = await Purchases.getOfferings();
  const dedicated = (offerings.all as any)?.chat_unlock?.availablePackages?.[0];
  if (dedicated) return dedicated;
  const current = offerings.current;
  const pkg = current?.availablePackages?.find(
    (p: PurchasesPackage) => p?.product?.identifier === CHAT_UNLOCK_PRODUCT_ID
  );
  return pkg ?? null;
}

export async function purchaseChatUnlock(pkg: PurchasesPackage): Promise<{ transactionId: string | null; productId: string }> {
  const { customerInfo, productIdentifier } = await Purchases.purchasePackage(pkg);
  const transactions = customerInfo?.nonSubscriptionTransactions ?? [];
  const latest = transactions[transactions.length - 1];
  const transactionId = (latest as any)?.transactionIdentifier ?? (latest as any)?.transactionId ?? null;
  return { transactionId, productId: productIdentifier ?? CHAT_UNLOCK_PRODUCT_ID };
}
