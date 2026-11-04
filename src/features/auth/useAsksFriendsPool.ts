import { useGenders } from "@/shared/queries/commonQueries";
import { useAppSelector } from "@/shared/hooks/redux";
import { isNonBinaryOnlyGender } from "@/features/profile/genderCategory";

/**
 * KAYIT SIRASINDA: bu kullanıcıya "arkadaş modunda kimleri görmek istersin"
 * sorulmalı mı?
 *
 * Arkadaş modunda eşleşme kuralı aynı cinsiyet. İkili kategorilerde değeri
 * sunucu kendi cinsiyetinden türetip kilitliyor, yani soru anlamsız; yalnız
 * Non-Binary kullanıcıya havuzunu soruyoruz (bkz.
 * backend_friends_same_gender_2026-11.md §7).
 *
 * ⚠️ YALNIZ KAYIT akışı için. Kayıttan sonra istemci kategori TÜRETMEZ:
 * sunucunun `friendsInterestedInLocked` bayrağını okur. Burada türetmek
 * zorundayız çünkü profil henüz sunucuda yok.
 *
 * Katalog yüklenmemişken `false` döner — o hâlde adım gösterilmez ve
 * sunucunun türetmesi geçerli kalır. Yanlış tarafa düşüp kullanıcıya ona ait
 * olmayan bir soruyu sormaktansa soruyu hiç sormamak doğru taraf.
 */
export function useAsksFriendsPool(): boolean {
  const { data: categories } = useGenders();
  const form = useAppSelector((s: any) => s.auth?.registrationForm);
  if (form?.mode !== "Friends") return false;
  return isNonBinaryOnlyGender(categories, form?.gender);
}
