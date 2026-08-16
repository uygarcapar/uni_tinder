import * as Application from "expo-application";
import Constants from "expo-constants";
import { Platform } from "react-native";
import api from "@/shared/services/api";
import { API_ENDPOINTS } from "@/shared/constants/api";
import { appPrefs } from "@/shared/utils/appPrefs";
import { devLog } from "@/shared/utils/devLog";

/**
 * Zorunlu / önerilen güncelleme kontrolü.
 *
 * Backend KENDİ sürümünü değil, bizim sürümümüz hakkındaki KARARI döner
 * (`ok | soft | force | maintenance`). İstemcide semver karşılaştırması
 * YOKTUR — eşikler admin ucundan değiştiğinde yeni build atmadan yayılsın diye.
 *
 * ⚠️ FAIL-OPEN: bu istek patlarsa / timeout olursa / gövde bozuksa uygulama
 * AÇILIR. Sürüm kontrolü yüzünden kilitlenmek, engellemek istediğimiz durumdan
 * çok daha kötü: backend'in 5 dakikalık kesintisi tüm kullanıcı tabanının
 * uygulamayı hiç açamaması demek olurdu. Her hata dalı `OK` döner.
 */

export type VersionAction = "ok" | "soft" | "force" | "maintenance";

export interface VersionCheckResult {
  action: VersionAction;
  /** `force` | `maintenance` — kullanıcı uygulamayı kullanamaz. */
  isBlocking: boolean;
  latestVersion: string;
  minSupportedVersion: string;
  /** Store linki backend'den gelir; istemciye GÖMÜLMEZ (App Store id'si değişebilir). */
  storeUrl?: string | null;
  message?: string | null;
}

const OK: VersionCheckResult = {
  action: "ok",
  isBlocking: false,
  latestVersion: "",
  minSupportedVersion: "",
};

/**
 * Açılışı geciktirmemek için kısa timeout — api.ts'in 30sn genel limiti bu
 * istek için fazla: kullanıcı sürüm kontrolünü beklemiyor.
 */
const VERSION_CHECK_TIMEOUT_MS = 8000;

/**
 * Store'daki GERÇEK sürüm. OTA update sonrası `app.json` ile native sürüm
 * ayrışabildiği için önce `nativeApplicationVersion` denenir; Expo Go /
 * test ortamında o null gelir, `expoConfig.version`'a düşeriz.
 */
export function getAppVersion(): string {
  return (
    Application.nativeApplicationVersion ??
    Constants.expoConfig?.version ??
    "0.0.0"
  );
}

/** Sadece teşhis log'u için — karara girmiyor. */
function getBuildNumber(): string | undefined {
  return Application.nativeBuildVersion ?? undefined;
}

export async function checkAppVersion(): Promise<VersionCheckResult> {
  try {
    const platform = Platform.OS === "ios" ? "ios" : "android";
    const res = await api.get<any>(API_ENDPOINTS.APP_VERSION_CHECK, {
      params: { platform, version: getAppVersion(), build: getBuildNumber() },
      timeout: VERSION_CHECK_TIMEOUT_MS,
    });

    // api.ts response interceptor'ı `response.data`yı unwrap ediyor → elimizdeki
    // zaten ResponseDto gövdesi.
    const result = res?.result;
    if (!result?.action) return OK;

    const action = result.action as VersionAction;
    if (action === "ok") return OK;

    return {
      action,
      // `isBlocking`i sunucudan körlemesine almıyoruz: alan hiç gelmezse
      // (eski/deploy edilmemiş backend) `undefined` → falsy → force bile
      // kapatılabilir olurdu. Karar action'dan türetiliyor.
      isBlocking: action === "force" || action === "maintenance",
      latestVersion: String(result.latestVersion ?? ""),
      minSupportedVersion: String(result.minSupportedVersion ?? ""),
      storeUrl: result.storeUrl ?? null,
      message: result.message ?? null,
    };
  } catch (e) {
    // FAIL-OPEN: ağ hatası / timeout / 5xx → kullanıcıyı İÇERİ AL.
    devLog("[version] check failed, fail-open", e);
    return OK;
  }
}

// ────────────────────────────── soft dismiss ──────────────────────────────
// Kullanıcı "Sonra" dediyse aynı sürüm için 24 saat tekrar sorma. Kalıcı olmalı
// (uygulama her açılışta kontrol ediyor), bu yüzden MMKV `app-prefs` — proje
// genelinde AsyncStorage değil bu instance kullanılıyor ve senkron okunuyor.
//
// `force` ve `maintenance` ASLA bastırılmaz; bu kayıt yalnız `soft` için yazılır
// ve yalnız `soft` için okunur.

const SOFT_DISMISS_KEY = "versionSoftDismissed";
const SOFT_DISMISS_TTL_MS = 24 * 60 * 60 * 1000;

export function markSoftUpdateDismissed(latestVersion: string): void {
  try {
    appPrefs.set(
      SOFT_DISMISS_KEY,
      JSON.stringify({ version: latestVersion, at: Date.now() }),
    );
  } catch {
    // MMKV yazamazsa (disk dolu) pop-up bir sonraki açılışta tekrar görünür —
    // rahatsız edici ama zararsız.
  }
}

export function isSoftUpdateDismissed(latestVersion: string): boolean {
  try {
    const raw = appPrefs.getString(SOFT_DISMISS_KEY);
    if (!raw) return false;
    const parsed = JSON.parse(raw);
    if (parsed?.version !== latestVersion) return false;
    if (typeof parsed?.at !== "number") return false;
    return Date.now() - parsed.at < SOFT_DISMISS_TTL_MS;
  } catch {
    return false;
  }
}
