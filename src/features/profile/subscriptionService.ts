import Purchases, { LOG_LEVEL, PurchasesPackage } from "react-native-purchases";
import { Platform } from "react-native";
import { iapLog, setIapFacts } from "@/features/profile/purchaseDiagnostics";

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
  if (isConfigured) {
    // Sessiz erken dönüş, "configure edilmiş kimlik" sorusunu cevapsız
    // bırakıyordu: ilk configure userId'siz olduysa (anonim) ve bu ikinci çağrı
    // userId ile geldiyse fark yalnız burada görülebilir.
    iapLog("rc-configure-skip", { neden: "zaten configure", istenen: userId ?? null });
    return;
  }

  const apiKey = Platform.OS === "ios" ? IOS_API_KEY : ANDROID_API_KEY;
  if (!looksLikeValidKey(apiKey)) {
    // Release'de de görünür: key'i olmayan bir TestFlight build'inde satın alma
    // akışının tamamı sessizce ölüyordu ("paketler yüklenemedi"den başka iz yok).
    iapLog("rc-configure-yok", {
      platform: Platform.OS,
      key: apiKey ? `geçersiz/placeholder (${String(apiKey).slice(0, 6)}…)` : "tanımsız",
      ipucu: "EXPO_PUBLIC_REVENUECAT_*_API_KEY build anında gömülür — yeni build şart",
    });
    setIapFacts({ rcConfigured: false, rcKey: apiKey ? "geçersiz" : "yok" });
    return;
  }

  Purchases.setLogLevel(__DEV__ ? LOG_LEVEL.WARN : LOG_LEVEL.ERROR);
  Purchases.configure({
    apiKey: apiKey!,
    appUserID: userId ? String(userId) : undefined,
  });
  isConfigured = true;
  iapLog("rc-configure", {
    platform: Platform.OS,
    key: `${String(apiKey).slice(0, 9)}…`,
    appUserID: userId ?? "(anonim — logIn bekleniyor)",
    entitlement: ENTITLEMENT_ID,
    offering: SUPERLIKE_OFFERING_ID,
  });
  setIapFacts({
    rcConfigured: true,
    rcKey: `${String(apiKey).slice(0, 9)}…`,
    entitlement: ENTITLEMENT_ID,
    slOffering: SUPERLIKE_OFFERING_ID,
  });
}

export async function loginRevenueCat(userId: string): Promise<void> {
  if (!isConfigured) {
    iapLog("rc-login-atlandı", { neden: "SDK configure değil", userId });
    return;
  }
  try {
    const { created } = await Purchases.logIn(String(userId));
    iapLog("rc-login", { userId, yeniKullanıcı: created });
  } catch (e: any) {
    // console.error → iapLog: bu satır rapora da girsin. logIn patlarsa satın
    // alma anonim kimliğe yazılır ve webhook hiçbir profile eşleşmez.
    iapLog("rc-login-hata", { userId, hata: e?.message ?? String(e) });
  }
}

/**
 * RC'nin o an kullandığı `appUserID`. Webhook'taki `app_user_id` doğrudan
 * `UserProfiles.UserId` olarak yazıldığı için bunun backend userId'si ile
 * BİREBİR aynı olması şart; değilse satın alma kimseye uygulanmaz (anonim
 * satın almada `$RCAnonymousID:...` gelir). Teşhis içindir.
 */
export async function getRevenueCatAppUserId(): Promise<string | null> {
  if (!isConfigured) return null;
  try {
    return await Purchases.getAppUserID();
  } catch {
    return null;
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

/**
 * Satın alma BAŞARILIYSA resolve eder; iptal/hata `purchasePackage`'ın kendi
 * exception'ı ile gelir (`userCancelled` bayrağıyla ayırt ediliyor).
 *
 * Dönen `hasEntitlement` bir BAŞARI KOŞULU DEĞİL, yalnız teşhis sinyali: RC
 * `customerInfo`'yu satın almanın hemen ardından güncellemeyebiliyor (sandbox'ta
 * olağan) ve RC dashboard'ındaki entitlement id `ENTITLEMENT_ID` ile eşleşmiyorsa
 * da `false` gelir. Eskiden bu boolean "satın alma oldu mu" diye okunuyordu:
 * para çekilmiş olmasına rağmen ne sync ne uyarı ne kuyruk çalışıyordu, akış
 * sessizce ölüyordu. Doğruluk kaynağı her hâlükârda backend `/sync`.
 */
export async function purchasePackage(
  pkg: PurchasesPackage,
): Promise<{ hasEntitlement: boolean }> {
  if (!isConfigured) {
    throw new Error("RevenueCat henüz yapılandırılmamış (API key eksik).");
  }
  const productId = (pkg as any)?.product?.identifier ?? null;
  iapLog("premium-satın-alma-başladı", { productId });
  try {
    const { customerInfo } = await Purchases.purchasePackage(pkg);
    await logCustomerInfo("premium-satın-alma-bitti", customerInfo, { productId });
    return {
      hasEntitlement: customerInfo.entitlements.active[ENTITLEMENT_ID] !== undefined,
    };
  } catch (e: any) {
    iapLog("premium-satın-alma-hata", {
      productId,
      iptal: e?.userCancelled === true,
      code: e?.code ?? null,
      hata: e?.message ?? String(e),
    });
    throw e;
  }
}

export async function restorePurchases(): Promise<boolean> {
  if (!isConfigured) {
    throw new Error("RevenueCat henüz yapılandırılmamış (API key eksik).");
  }
  const customerInfo = await Purchases.restorePurchases();
  await logCustomerInfo("restore", customerInfo);
  return customerInfo.entitlements.active[ENTITLEMENT_ID] !== undefined;
}

/**
 * `CustomerInfo`nun teşhise yarayan tüm alanlarını tek satıra indirir.
 *
 * En kritik alan `sandbox`: TestFlight ve dev-client satın almaları DAİMA
 * StoreKit sandbox'ıdır ve backend prod ortamında sandbox webhook'larını
 * reddediyorsa (`RevenueCat:AllowSandboxEvents` kapalı) premium hiçbir zaman
 * açılmaz — RC tarafında her şey doğru görünürken. Bu tek boolean, "FE mi
 * backend mi" tartışmasını bitiriyor.
 *
 * KİMLİK İKİ AYRI ALAN — karıştırılırsa teşhis tamamen yanlış tarafa gider:
 *
 *   `aktifId`   = `Purchases.getAppUserID()` — ŞU ANKİ app_user_id. Webhook'un
 *                 `app_user_id` alanına giden ve backend'in `UserProfiles.UserId`
 *                 ile eşleştirdiği değer budur. Backend userId'si ile birebir
 *                 aynı olmak ZORUNDA.
 *   `ilkId`     = `customerInfo.originalAppUserId` — kullanıcının RC'de gördüğü
 *                 İLK kimlik. Uygulama login'den önce bir kez anonim configure
 *                 edildiyse burada ömür boyu `$RCAnonymousID:…` kalır; `logIn`
 *                 doğru çalışsa bile değişmez. Yani bu alanın anonim olması TEK
 *                 BAŞINA bir arıza değildir.
 *
 * Bir önceki sürümde `originalAppUserId` "appUserID" diye yazılıyordu; anonim
 * görünen bu değer, kimlik eşleşmesi sağlamken bile bozukmuş gibi okunuyordu.
 */
async function logCustomerInfo(
  step: string,
  info: any,
  extra?: Record<string, unknown>,
): Promise<void> {
  const active = info?.entitlements?.active ?? {};
  const entitlement = active[ENTITLEMENT_ID];
  const subs = info?.subscriptionsByProductIdentifier ?? {};
  const anySub: any = Object.values(subs)[0];
  const aktifId = await Purchases.getAppUserID().catch(() => null);
  const ilkId = info?.originalAppUserId ?? null;
  iapLog(step, {
    ...extra,
    aktifId,
    ilkId,
    anonim: typeof aktifId === "string" && aktifId.startsWith("$RCAnonymousID"),
    aktifEntitlement: Object.keys(active),
    aranan: ENTITLEMENT_ID,
    eşleşti: entitlement !== undefined,
    ürün: entitlement?.productIdentifier ?? anySub?.productIdentifier ?? null,
    store: entitlement?.store ?? anySub?.store ?? null,
    // `?? null` bilinçli: alan hiç gelmediyse "sandbox değil" diye okunmasın.
    sandbox: entitlement?.isSandbox ?? anySub?.isSandbox ?? null,
    bitiş: entitlement?.expirationDate ?? anySub?.expiresDate ?? null,
    consumableAdet: (info?.nonSubscriptionTransactions ?? []).length,
  });
  setIapFacts({
    rcAktifId: aktifId,
    rcIlkId: ilkId,
    rcEntitlements: JSON.stringify(Object.keys(active)),
    rcSandbox: entitlement?.isSandbox ?? anySub?.isSandbox ?? null,
    rcÜrün: entitlement?.productIdentifier ?? anySub?.productIdentifier ?? null,
  });
}

/**
 * Açılışta çağrılır: RC'nin o anki kimlik + entitlement görüntüsünü rapora
 * yazar. Eskiden bu dökümün tamamı `__DEV__` içindeydi, yani sorunun tekrar
 * üretildiği TestFlight build'inde hiç yazılmıyordu.
 */
export async function logRevenueCatIdentity(backendUserId: string | null): Promise<void> {
  setIapFacts({ backendUserId });
  if (!isConfigured) {
    iapLog("kimlik", { backendUserId, rc: "configure değil" });
    return;
  }
  try {
    const info = await Purchases.getCustomerInfo();
    const aktifId = await Purchases.getAppUserID().catch(() => null);
    // Karşılaştırma AKTİF id ile: webhook'un taşıdığı ve backend'in aradığı
    // değer bu. `ilkId` anonim kalmış olabilir, tek başına arıza değil.
    await logCustomerInfo("kimlik", info, {
      backendUserId,
      kimlikEşleşti: aktifId === backendUserId,
    });
  } catch (e: any) {
    iapLog("kimlik-hata", { backendUserId, hata: e?.message ?? String(e) });
  }
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
    iapLog("sl-offering", { hata: "SDK configure değil (API key?)" });
    return null;
  }
  const offerings = await Purchases.getOfferings();
  const found = (offerings as any)?.all?.[SUPERLIKE_OFFERING_ID] ?? null;
  if (!found || (found.availablePackages?.length ?? 0) === 0) {
    // Paket listesi boş kaldığında sheet "yüklenemedi" gösteriyor ve nedeni
    // cihazda görünmüyordu. RC'nin gerçekten döndüğü offering id'lerini yaz:
    // eksik offering (dashboard'da tanımlı değil) ile ürünlerin StoreKit'ten
    // gelmemesi (ASC'de hazır değil / RC ürün eşleşmesi yok) ayırt edilebilsin.
    iapLog("sl-offering-boş", {
      aranan: SUPERLIKE_OFFERING_ID,
      mevcutOfferinglar: Object.keys((offerings as any)?.all ?? {}),
      paketSayısı: found?.availablePackages?.length ?? 0,
    });
  } else {
    iapLog("sl-offering", {
      aranan: SUPERLIKE_OFFERING_ID,
      ürünler: (found.availablePackages ?? []).map(
        (p: any) => p?.product?.identifier ?? "?",
      ),
    });
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
  const wantedProductId = (pkg as any)?.product?.identifier ?? null;
  iapLog("sl-satın-alma-başladı", { productId: wantedProductId });
  let res: any;
  try {
    res = await Purchases.purchasePackage(pkg);
  } catch (e: any) {
    iapLog("sl-satın-alma-hata", {
      productId: wantedProductId,
      iptal: e?.userCancelled === true,
      code: e?.code ?? null,
      hata: e?.message ?? String(e),
    });
    throw e;
  }
  const productId = res?.productIdentifier ?? wantedProductId;
  const fromResult = res?.transaction?.transactionIdentifier ?? null;
  const transactionId = fromResult ?? latestTransactionId(res?.customerInfo, productId);
  // `kaynak` teşhis için belirleyici: `customerInfo` fallback'i YANLIŞ bir
  // transaction seçmiş olabilir (ürün eşleşmesi tutmazsa tüm geçmişe düşüyor)
  // ve backend'in 400/402'si o zaman ürün/webhook değil bizim seçimimizdir.
  iapLog("sl-satın-alma-bitti", {
    productId,
    transactionId,
    kaynak: fromResult ? "purchase-result" : transactionId ? "customerInfo-fallback" : "YOK",
    geçmiş: (res?.customerInfo?.nonSubscriptionTransactions ?? []).map(
      (t: any) => `${t?.productIdentifier}#${t?.transactionIdentifier}`,
    ),
  });
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
    const all = (info as any)?.nonSubscriptionTransactions ?? [];
    const found = all
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
    // Sadece eşleşenleri değil TOPLAMI da yaz: ürün adı `superlike` ile
    // başlamıyorsa (ASC'de farklı adlandırılmışsa) kurtarma taraması sessizce
    // boş dönüyordu ve "RC'de hiç satın alma yok" ile ayırt edilemiyordu.
    if (all.length || found.length) {
      iapLog("sl-cihaz-geçmişi", {
        toplam: all.length,
        eşleşen: found.length,
        pencereSaat: Math.round(withinMs / 3_600_000),
        ürünler: all.map((t: any) => t?.productIdentifier ?? "?"),
      });
    }
    return found;
  } catch (e: any) {
    iapLog("sl-cihaz-geçmişi-hata", { hata: e?.message ?? String(e) });
    return [];
  }
}
