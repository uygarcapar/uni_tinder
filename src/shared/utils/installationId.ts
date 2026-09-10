import { Platform } from "react-native";
import * as Application from "expo-application";
import { appPrefs } from "@/shared/utils/appPrefs";
import { devLog } from "@/shared/utils/devLog";

/**
 * Cihaz KURULUM kimliği — davet programının kötüye kullanım freni.
 *
 * Backend `register-and-complete`te bunun SHA-256'sını saklıyor: aynı cihazdan
 * ikinci bir davetli kaydı ödül SAYILMIYOR (plan §0). Kimliği kayıt anında
 * gönderiyoruz, başka hiçbir yerde kullanmıyoruz.
 *
 * ⚠️ Kalıcı bir cihaz parmak izi DEĞİL, olması da istenmiyor: iOS'ta
 * `identifierForVendor` uygulama silinince değişir, Android'de `getAndroidId()`
 * fabrika ayarlarında sıfırlanır. İkisi de yoksa (emülatör, izin verilmemiş
 * ortam) yerel bir UUID üretilip MMKV'de saklanır — o da yalnız bu kurulum
 * boyunca yaşar. `appPrefs` logout'ta temizlenmiyor, yani aynı cihazda hesap
 * değiştiren kullanıcı aynı kimlikle gelir: frenin çalışması tam da buna bağlı.
 *
 * `expo-application` zaten bağımlılık (sürüm kapısı kullanıyor), native rebuild
 * gerekmiyor.
 */
const INSTALLATION_ID_KEY = "referral.installationId";

/** `clientMessageId.ts`teki gerekçe: crypto.randomUUID RN'de güvenilir değil. */
function randomUuid(): string {
  return "xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx".replace(/[xy]/g, (c) => {
    const r = (Math.random() * 16) | 0;
    const v = c === "x" ? r : (r & 0x3) | 0x8;
    return v.toString(16);
  });
}

export async function getInstallationId(): Promise<string> {
  const cached = appPrefs.getString(INSTALLATION_ID_KEY);
  if (cached) return cached;

  let id: string | null = null;
  try {
    if (Platform.OS === "android") {
      id = Application.getAndroidId?.() ?? null;
    } else if (Platform.OS === "ios") {
      id = (await Application.getIosIdForVendorAsync?.()) ?? null;
    }
  } catch (error) {
    devLog("⚠️ [installationId] platform kimliği okunamadı:", error);
  }

  // Boş string de "yok" sayılıyor: Android bazı cihazlarda "" döndürüyor ve
  // onu kimlik diye yazmak TÜM kurulumları tek kimliğe bağlardı.
  const resolved = id && id.length > 0 ? id : randomUuid();
  appPrefs.set(INSTALLATION_ID_KEY, resolved);
  return resolved;
}

/** Test kancası — MMKV suite'ler arasında sızmasın. */
export function resetInstallationIdCache(): void {
  appPrefs.remove(INSTALLATION_ID_KEY);
}
