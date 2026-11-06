import type { AppMode } from "@/features/discover/modeTheme";

/**
 * Editörün düzenleyeceği mod — segment kalktı (2026-11-06), form aktif
 * uygulama modunu düzenliyor.
 *
 * ⚠️ "Aktif mod her zaman açık" varsayımı GÜVENLİ DEĞİL: mod tercihi diskte
 * ve uzlaştırma (`reconcileMode`) yalnız lazy-mount edilen Keşif'te koşuyor —
 * yalnız Friends açarak kayıt olan kullanıcı Keşif'e hiç uğramadan Profil'e
 * girerse `useAppMode` varsayılan (kapalı) Dating döner. O hâlde sessizce
 * AÇIK olan moda düşüyoruz: kullanıcı var olmayan bir profili düzenlemesin,
 * kapalı-mod ekranı da geri gelmesin.
 *
 * İkisi de kapalı görünüyorsa veri bozuk/yarım demektir → aktif mod. Çağıran
 * `modes` alanı hiç gelmediğinde zaten ikisini de açık sayıyor
 * (EditProfileForm'daki `!== false` okuması) — olmayan bir kısıt uydurup
 * kullanıcıyı kendi profilinden kilitlemek yanlış taraf.
 */
export function resolveEditMode(
  active: AppMode,
  datingOpen: boolean,
  friendsOpen: boolean,
): AppMode {
  const activeOpen = active === "Friends" ? friendsOpen : datingOpen;
  if (activeOpen) return active;
  const other: AppMode = active === "Friends" ? "Dating" : "Friends";
  const otherOpen = other === "Friends" ? friendsOpen : datingOpen;
  return otherOpen ? other : active;
}
