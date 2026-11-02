/**
 * KONUM-DURUMU DEĞİŞİM OTOBÜSÜ — "kampüste olma" durumu az önce değişmiş
 * olabilir; dinleyen yüzey tazelesin.
 *
 * Yayıncılar: DEV konum simülasyonu aç/kapat (campusDevLocation) ve geofence
 * task'ının Enter/Exit'i (campusGeofenceTask — yalnız uygulama önplandayken
 * dinleyen olur; headless'ta küme boş ve emit no-op). Abone: useCampusSurface
 * ("+" kapısı ve akıştaki ipucu kartı).
 *
 * 🔴 NEDEN uiBus DEĞİL: uiBus `react-native-reanimated` import ediyor ve
 * geofence task'ının grafiği ÇIPLAK kalmak zorunda — o grafikte modül yan
 * etkisiyle yüklenen reanimated, headless başlatmada SIGABRT üretti
 * (tarihçe campusGeofenceTask'ın başında). Bu modül o yüzden SIFIR import
 * taşıyor ve testte kaynak kuralı olarak çivili.
 */

type CampusPresenceListener = () => void;

const listeners = new Set<CampusPresenceListener>();

/** Dinlemeye başla; dönen fonksiyon aboneliği bırakır. */
export function onCampusPresenceDirty(
  listener: CampusPresenceListener,
): () => void {
  listeners.add(listener);
  return () => {
    listeners.delete(listener);
  };
}

/**
 * "Kampüste olma durumu değişmiş olabilir" — dinleyici yoksa no-op.
 * Fırlatan dinleyici diğerlerini düşürmez (uiBus'ın emit sözleşmesi).
 */
export function emitCampusPresenceDirty(): void {
  listeners.forEach((listener) => {
    try {
      listener();
    } catch {
      /* no-op — bir dinleyicinin hatası yayını kesmemeli. */
    }
  });
}
