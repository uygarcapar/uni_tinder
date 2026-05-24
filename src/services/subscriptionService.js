import Purchases, { LOG_LEVEL } from "react-native-purchases";
import { Platform } from "react-native";

// EXPO_PUBLIC_* env değişkenleri Expo SDK 49+ tarafından build zamanında inline edilir.
// .env dosyasını .env.example'dan kopyalayıp doldurun.
const IOS_API_KEY = process.env.EXPO_PUBLIC_REVENUECAT_IOS_API_KEY;
const ANDROID_API_KEY = process.env.EXPO_PUBLIC_REVENUECAT_ANDROID_API_KEY;

export const ENTITLEMENT_ID =
  process.env.EXPO_PUBLIC_REVENUECAT_ENTITLEMENT_ID || "premium";

// Bir anahtarın gerçekten doldurulmuş gibi görünüp görünmediğini kontrol et.
// Placeholder ya da boş anahtarlarla configure() çağırmak RC'de loglara hata düşürür.
function looksLikeValidKey(key) {
  if (!key) return false;
  const trimmed = String(key).trim();
  if (trimmed.length < 10) return false;
  if (trimmed.startsWith("YOUR_")) return false;
  if (trimmed.toLowerCase().startsWith("appl_xxxx")) return false;
  if (trimmed.toLowerCase().startsWith("goog_xxxx")) return false;
  return true;
}

// Configure işlemi runtime'da bir kez gerçekleştirilir; ikinci çağrılar no-op.
let isConfigured = false;

export function isRevenueCatAvailable() {
  const key = Platform.OS === "ios" ? IOS_API_KEY : ANDROID_API_KEY;
  return looksLikeValidKey(key);
}

export function initRevenueCat(userId) {
  if (isConfigured) return;

  const apiKey = Platform.OS === "ios" ? IOS_API_KEY : ANDROID_API_KEY;
  if (!looksLikeValidKey(apiKey)) {
    // Sessiz dur — keys henüz doldurulmamış. RC olmadan da app çalışsın.
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
    apiKey,
    appUserID: userId ? String(userId) : undefined,
  });
  isConfigured = true;
}

export async function loginRevenueCat(userId) {
  if (!isConfigured) return;
  try {
    await Purchases.logIn(String(userId));
  } catch (e) {
    console.error("RevenueCat login error:", e);
  }
}

export async function logoutRevenueCat() {
  if (!isConfigured) return;
  try {
    await Purchases.logOut();
  } catch (e) {
    // RC anonymous user için logout 22 (LogOutWithAnonymousUserError) atar — yutulur.
  }
}

export async function getOfferings() {
  if (!isConfigured) return null;
  const offerings = await Purchases.getOfferings();
  return offerings.current;
}

export async function purchasePackage(pkg) {
  if (!isConfigured) {
    throw new Error("RevenueCat henüz yapılandırılmamış (API key eksik).");
  }
  const { customerInfo } = await Purchases.purchasePackage(pkg);
  return customerInfo.entitlements.active[ENTITLEMENT_ID] !== undefined;
}

export async function restorePurchases() {
  if (!isConfigured) {
    throw new Error("RevenueCat henüz yapılandırılmamış (API key eksik).");
  }
  const customerInfo = await Purchases.restorePurchases();
  return customerInfo.entitlements.active[ENTITLEMENT_ID] !== undefined;
}

// RC'nin local cache'i + son customer info'sundan premium aktif mi diye sorar.
// Backend webhook gecikmeli ise app reload'da kullanıcı yanlışlıkla non-premium
// görünmesin diye fetchSubscriptionStatus bu değeri de OR'lar.
export async function getRevenueCatPremiumStatus() {
  if (!isConfigured) return false;
  try {
    const info = await Purchases.getCustomerInfo();
    return info?.entitlements?.active?.[ENTITLEMENT_ID] !== undefined;
  } catch {
    return false;
  }
}

// ============ FAZ 6: Chat Unlock consumable ============
// RC dashboard convention: tek bir consumable product `chat_unlock` (NON_RENEWING).
// Frontend bu product ID'yi offering.availablePackages içinden bulup satın alır.
// purchasePackage callback'i bize transactionId verir; biz onu backend'e gönderip
// /api/messages/conversations/{id}/unlock'ı tetikleriz.
export const CHAT_UNLOCK_PRODUCT_ID = "chat_unlock";

export async function getChatUnlockPackage() {
  const offerings = await Purchases.getOfferings();
  // Önce dedicated "chat_unlock" offering varsa onu kullan
  const dedicated = offerings.all?.chat_unlock?.availablePackages?.[0];
  if (dedicated) return dedicated;
  // Yoksa current offering içinde productId match'i ara
  const current = offerings.current;
  const pkg = current?.availablePackages?.find(
    (p) => p?.product?.identifier === CHAT_UNLOCK_PRODUCT_ID
  );
  return pkg ?? null;
}

// Returns: { transactionId, productId } — backend redeem endpoint'i için transactionId şart.
export async function purchaseChatUnlock(pkg) {
  const { customerInfo, productIdentifier } = await Purchases.purchasePackage(pkg);
  // RC consumable purchase'da nonSubscriptionTransactions listesinin en sonu yeni transactionId.
  const latest = customerInfo?.nonSubscriptionTransactions?.[
    (customerInfo?.nonSubscriptionTransactions?.length ?? 0) - 1
  ];
  const transactionId = latest?.transactionIdentifier ?? latest?.transactionId ?? null;
  return { transactionId, productId: productIdentifier ?? CHAT_UNLOCK_PRODUCT_ID };
}
