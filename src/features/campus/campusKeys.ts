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
  /**
   * Yüzeyin durumu: kota + kapılar + bugünün anı — MOD BAŞINA.
   *
   * ⚠️ İÇİNDEKİ İKİ ALAN FARKLI ÖLÇEKTE ve ayrımı bilmeden tazeleyen kod
   * yanlış yapıyor:
   *   • `postedToday` / `myMomentId` MOD BAŞINA — Dating'de paylaşmak
   *     Friends'in hakkını yakmıyor, iki modun izleyicisi ayrık.
   *     ⚠️ SUNUCUDA BİR SÜRE BÖYLE DEĞİLDİ (ölçüldü 2026-10-30: `?mode=` ne
   *     olursa olsun aynı `postedToday` geliyordu, tek modda paylaşan kullanıcı
   *     öbür modda "+" butonunu göremiyordu). Backend uyguladı, talep ve
   *     cevabı: `backend_campus_mode_quota_2026-10-30.md`.
   *     `?mode=` VERİLMEZSE sunucu `Dating`e düşüyor — modsuz çekmek "küresel"
   *     DEĞİL, sessizce Dating demek.
   *   • `quota` KÜRESEL — `?mode=` ne olursa olsun aynı `decisionsRemaining`
   *     geliyor (ana akıştaki tek `DailySwipeCount` emsali).
   * Sonucu: paylaşım/silme TEK modu, beğeni KÖKÜ düşürüyor — gerekçe
   * `invalidateCampusMe`ta.
   */
  meRoot: ["campus", "me"] as const,
  me: (mode: string) => ["campus", "me", mode] as const,
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
