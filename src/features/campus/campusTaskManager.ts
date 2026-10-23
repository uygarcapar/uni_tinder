import { devLog } from "@/shared/utils/devLog";

/**
 * `expo-task-manager`e GÜVENLİ erişim.
 *
 * 🔴 NEDEN STATİK IMPORT YASAK — bir kez uygulamayı çökertti.
 *
 * `expo-task-manager/build/ExpoTaskManager.js` modül kapsamında
 * `requireNativeModule('ExpoTaskManager')` çağırıyor. Native modül binary'de
 * yoksa (paket package.json'a eklendi ama dev-client/TestFlight build'i hâlâ
 * eski) bu çağrı **import anında** fırlıyor — `defineTask` çevresine konan bir
 * try/catch onu YAKALAYAMAZ, çünkü hata daha `import` satırında oluşuyor.
 *
 * Zincir şöyleydi ve teşhisi zor:
 *   index.js → campusGeofenceTask → expo-task-manager → THROW
 *   → bundle değerlendirmesi patlıyor → RN yeniden yüklüyor
 *   → reanimated `installTurboModule` surface presenter hazır değilken koşuyor
 *   → `react_native_assert(scheduler != nil)` → SIGABRT
 *
 * Yani belirti "Reanimated çöküyor" gibi görünüyor ama suçlu reanimated değil;
 * ReanimatedModule.mm'in kendi yorumu da bunu "double reload race" diye
 * anlatıyor.
 *
 * ⚠️ Bu modül `require`ı TEMBEL ve TRY/CATCH içinde çağırıyor. Native modül
 * yoksa `null` dönüyor; çağıranlar geofence'i sessizce atlıyor ve özellik
 * Kademe B (uygulama açıkken konum okuma) ile çalışmaya devam ediyor.
 *
 * ⚠️ Rebuild alındığında hiçbir şey değişmiyor — `require` başarılı oluyor ve
 * geofence kendiliğinden devreye giriyor.
 */

type TaskManagerModule = typeof import("expo-task-manager");

/** `undefined` = henüz denenmedi, `null` = native modül yok. */
let cached: TaskManagerModule | null | undefined;

export function getTaskManager(): TaskManagerModule | null {
  if (cached !== undefined) return cached;
  try {
    // eslint-disable-next-line @typescript-eslint/no-require-imports
    cached = require("expo-task-manager") as TaskManagerModule;
  } catch (err) {
    devLog("[campus] expo-task-manager yok (build bekliyor):", err);
    cached = null;
  }
  return cached;
}

/** Native modül bu binary'de var mı — çağıranların tek kapısı. */
export function hasTaskManager(): boolean {
  return getTaskManager() !== null;
}
