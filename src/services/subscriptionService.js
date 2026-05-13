import Purchases, { LOG_LEVEL } from "react-native-purchases";
import { Platform } from "react-native";

// RevenueCat API anahtarlarını buraya ekle
const IOS_API_KEY = "YOUR_REVENUECAT_IOS_API_KEY";
const ANDROID_API_KEY = "YOUR_REVENUECAT_ANDROID_API_KEY";

export const ENTITLEMENT_ID = "premium";

export function initRevenueCat(userId) {
  Purchases.setLogLevel(LOG_LEVEL.ERROR);
  const apiKey = Platform.OS === "ios" ? IOS_API_KEY : ANDROID_API_KEY;
  Purchases.configure({
    apiKey,
    appUserID: userId ? String(userId) : undefined,
  });
}

export async function loginRevenueCat(userId) {
  try {
    await Purchases.logIn(String(userId));
  } catch (e) {
    console.error("RevenueCat login error:", e);
  }
}

export async function getOfferings() {
  const offerings = await Purchases.getOfferings();
  return offerings.current;
}

export async function purchasePackage(pkg) {
  const { customerInfo } = await Purchases.purchasePackage(pkg);
  return customerInfo.entitlements.active[ENTITLEMENT_ID] !== undefined;
}

export async function restorePurchases() {
  const customerInfo = await Purchases.restorePurchases();
  return customerInfo.entitlements.active[ENTITLEMENT_ID] !== undefined;
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
