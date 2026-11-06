/**
 * React Query anahtarları — `swipeQueries.ts`ten AYRI dosyada: o modül
 * react-redux/react-query hook'ları çekiyor, oysa anahtarlara ihtiyaç duyan
 * bazı tüketiciler (ör. fireRedeem) saf mantık. Sabit için tüm hook
 * zincirini import ettirmek gereksiz bağ (ve testte ESM transform derdi).
 */
export const swipeKeys = {
  /**
   * ⚠️ `matches` ANAHTARI YOK — bilerek kaldırıldı (2026-11-06).
   *
   * Deste mod başına ayrılmadan önce anahtar `["swipe","matches"]`ti. Mod
   * anahtarın içine girince (`deck(mode)`) eski ad ortada kaldı ve onu
   * invalidate eden ALTI çağıran (filtre kaydetme, mesafe anahtarı, profil
   * düzenleme, dil değişimi, satın alma, foreground) sessizce HİÇBİR sorguya
   * dokunmaz oldu: `["swipe","matches"]` ile `["swipe","deck",mode]`
   * birbirinin prefix'i DEĞİL. Hata gürültüsüz — invalidate var olmayan
   * anahtarda da başarıyla döner.
   *
   * Belirtisi: "filtreyi gevşettim, uygulamayı kapatıp açana kadar yeni
   * profil gelmedi" (deste `staleTime` 60sn + `refetchOnMount:false`,
   * boş-deste yoklaması da FiltersTooStrict'te bilerek susuyor).
   *
   * Bu yüzden ad geri EKLENMEMELİ: desteyi bayatlatmak isteyen herkes
   * `deckRoot` kullanıyor, tek deste anahtarı `deck(mode)`.
   */
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
