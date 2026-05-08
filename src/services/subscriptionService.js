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
