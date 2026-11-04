/**
 * Friends havuz sorusunun KAYIT SONRASI kapısı.
 *
 * Arkadaş modunda eşleşme kuralı aynı cinsiyet. İkili kategorilerde değeri
 * sunucu kendi cinsiyetinden türetip kilitliyor; yalnız Non-Binary kullanıcıya
 * "arkadaş modunda kimleri görmek istersin" diye soruyoruz
 * (bkz. backend_friends_same_gender_2026-11.md §7).
 *
 * ⚠️ İSTEMCİ BURADA KATEGORİ TÜRETMEZ. Profilde yalnız alt cinsiyetin
 * `enumName`i saklanıyor ve `Transgender` hem Erkek hem Kadın kategorisinde
 * görünüyor — türetme sıraya bağlı bir tahmin olurdu. Karar sunucunun:
 * `friendsInterestedInLocked`. (Kayıt akışı ayrı: orada profil henüz sunucuda
 * olmadığı için `isNonBinaryOnlyGender` kullanılıyor.)
 */

type FriendsPoolProfile = {
  modes?: { friends?: boolean } | null;
  friendsInterestedIn?: unknown;
  friendsInterestedInLocked?: unknown;
} | null | undefined;

/**
 * Bu kullanıcıya havuz sorusu açılmalı mı?
 *
 * @param profile `GET /api/profile` yanıtı.
 * @param alreadyAsked Bu OTURUMDA soru bir kez açıldı mı. Kalıcı değil:
 *   kullanıcı sheet'i kapatıp modu kullanmaya devam edebilmeli, ama soru
 *   cevaplanmadıkça bir sonraki açılışta tekrar sorulmalı.
 */
export function shouldAskFriendsPool(
  profile: FriendsPoolProfile,
  { alreadyAsked = false }: { alreadyAsked?: boolean } = {},
): boolean {
  if (alreadyAsked) return false;
  if (!profile || typeof profile !== "object") return false;
  // Friends profili açık değilse soru kurulum sheet'inin kendi akışına ait.
  if (profile.modes?.friends !== true) return false;
  // KESİN karşılaştırma: alan hiç gelmezse (eski sunucu) `!locked` bunu "sor"
  // diye okur ve sahadaki herkese olmayan bir soru açardı.
  if (profile.friendsInterestedInLocked !== false) return false;
  const pool = profile.friendsInterestedIn;
  return !Array.isArray(pool) || pool.length === 0;
}
