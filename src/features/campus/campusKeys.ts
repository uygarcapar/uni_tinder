/**
 * Kampüs Anları sorgu anahtarları.
 *
 * Hook zincirinden AYRI bir modül (feedKeys/swipeKeys ile aynı sebep): anahtara
 * ihtiyacı olan servis/yardımcı dosyalar React Query hook'larını import etmek
 * zorunda kalmasın.
 *
 * ⚠️ MOD ANAHTARIN İÇİNDE. `swipeKeys.deck(mode)` kuralının aynısı: Friends
 * listesi Dating'in cache'ine yazarsa mod değişiminde bir kare yabancı kart
 * görünür. Mod anahtarın parçası olduğunda mod değişimi yepyeni bir sorgu
 * doğuruyor ve elle reset gerekmiyor.
 *
 * `momentsRoot` toptan işlem için duruyor (optimistic yama, toplu invalidate):
 * hangi modda olduğunu bilmeden yazabilmek gerekiyor.
 */
export const campusKeys = {
  all: ["campus"] as const,
  /** Yüzeyin durumu: kota + kapılar + bugünün anı. */
  me: ["campus", "me"] as const,
  /** Kampüs sınırı — domain başına, uzun ömürlü. */
  boundary: (domain: string) => ["campus", "boundary", domain] as const,
  momentsRoot: ["campus", "moments"] as const,
  moments: (mode: string) => ["campus", "moments", mode] as const,
  /**
   * An sahibinin profil kartı — karta dokununca açılan yüzeyin verisi.
   *
   * ⚠️ `momentsRoot`UN ALTINDA DEĞİL ve olmaması şart: listeyi toptan
   * invalidate eden yollar (`useRefreshCampus`, paylaşım sonrası) profil
   * kartını da düşürürdü — kart AÇIKKEN altından veri çekmek demek.
   * Anahtar kullanıcı + mod: aynı kişinin iki moddaki kartı farklı
   * (prompt seti, niyet alanı).
   */
  momentProfile: (userId: string, mode: string) =>
    ["campus", "momentProfile", userId, mode] as const,
};
