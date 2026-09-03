import { appPrefs } from "@/shared/utils/appPrefs";

/**
 * Kaldırılmış kurtarma paketi (consumable) kuyruğunun temizliği.
 *
 * 2026-08-31'de `recovery_1/_3/_10` ürünleri ve `POST /api/swipe/Recovery/Redeem`
 * ucu tamamen kaldırıldı — kurtarma premium ayrıcalığı oldu. Kuyruk MMKV'de
 * KALICI: güncelleyen kullanıcının cihazında bekleyen bir kayıt varsa, kod
 * silinmiş olsa da satır orada durmaya devam eder.
 *
 * Bırakılamaz, çünkü UT-62xx ailesi backend'de emekliye ayrıldı ve numaralar
 * ileride başka bir aileye verilmeyecek olsa da uç artık 404 dönüyor: kayıt
 * hiçbir zaman çözülmeyecek ölü veri. Üstelik kuyruk anahtarları kullanıcı
 * bazlı (`...:${userId}`), yani hesap değiştikçe birikirler.
 *
 * Sahada TEK BİR satın alma yok (paketler ASC/RevenueCat'te hiç açılmadı), yani
 * silinen bir kayıt kimsenin parasını yakmıyor — onurlandırılacak kredi yok.
 *
 * Tek seferlik: bayrak yazıldıktan sonra her açılışta `getAllKeys()` taranmıyor.
 */

const PURGE_FLAG = "recoveryRedeemQueuePurged.v1";
const LEGACY_PREFIXES = ["recoveryPendingRedeems:", "recoveryHandledTx:"];

export function purgeLegacyRecoveryRedeemQueue(): void {
  try {
    if (appPrefs.getBoolean(PURGE_FLAG)) return;
    for (const key of appPrefs.getAllKeys()) {
      if (LEGACY_PREFIXES.some((prefix) => key.startsWith(prefix))) {
        appPrefs.remove(key);
      }
    }
    appPrefs.set(PURGE_FLAG, true);
  } catch {
    // Depo okunamadıysa (nadiren: şifreli instance açılamamış) bir sonraki
    // açılışta yeniden denenir — bayrak yazılmadığı için tekrar girilir.
  }
}
