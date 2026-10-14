/**
 * React Query anahtarları — `swipeQueries.ts`ten AYRI dosyada: o modül
 * react-redux/react-query hook'ları çekiyor, oysa anahtarlara ihtiyaç duyan
 * bazı tüketiciler (ör. fireRedeem) saf mantık. Sabit için tüm hook
 * zincirini import ettirmek gereksiz bağ (ve testte ESM transform derdi).
 */
export const swipeKeys = {
  matches: ["swipe", "matches"] as const,
  filters: ["swipe", "filters"] as const,
  stats: ["swipe", "stats"] as const,
  /**
   * Deste ve beğeni sorguları MOD BAŞINA ayrı cache'te.
   *
   * Mod anahtarın İÇİNDE: aksi hâlde Arkadaş destesi Flört destesinin
   * cache'ine yazılır ve mod değişiminde bir kare yabancı kart görünürdü.
   * Anahtarın parçası olması ayrıca elle reset gerektirmiyor — mod değişimi
   * yepyeni bir sorgu doğuruyor (akış filtresinin aynı deseni).
   *
   * `deck`/`whoLikedMe` köküyle (`["swipe","deck"]`) toptan invalidate de
   * mümkün: mod bilmeden tüm desteleri bayatlatmak isteyen çağıranlar
   * (ör. filtre değişimi) kökü kullanıyor.
   */
  deckRoot: ["swipe", "deck"] as const,
  deck: (mode: string) => ["swipe", "deck", mode] as const,
  whoLikedMeRoot: ["swipe", "whoLikedMe"] as const,
  whoLikedMe: (mode: string) => ["swipe", "whoLikedMe", mode] as const,
};
