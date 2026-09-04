/**
 * Keşif ekranının üst şeridinin ölçüleri. Ayrı dosyada çünkü İKİ taraf da aynı
 * sayıyı okumak ZORUNDA:
 *   - DiscoverScreen — şeridi çizen ve kart kabını onun altına koyan taraf,
 *   - SwipeWrapper   — açık kartı ekranın en tepesine kaldıran taraf
 *                      (HEADER_COVER = insets.top + bu ikisinin toplamı).
 * Ayrıştıkları an kart ya header'ı tam örtmez ya da tepeyi aşar. (Doğrudan
 * DiscoverScreen'den import edilemez: ekran zaten SwipeWrapper'ı import ediyor,
 * döngü olurdu.)
 */

/**
 * İkon/logo satırının yüksekliği.
 *
 * 50 → 40: satır logo KUTUSUNUN boyundaydı (LOGO_H), oysa kutunun alt ~%24'ü
 * boş alfa (bkz. logoMetrics) — şerit görünenden yüksek duruyor, hem logo hem
 * ikonlar safe-area'nın epey altında kalıyordu. 40'ta kutu satırı 5px taşıyor
 * ama TAŞAN KISIM BOŞ: görünür logonun tepesi (kutu içinde 6.5) satırın
 * 1.5px'ine, dibi (38) 33'üne geliyor — yani ink hâlâ satırın içinde, sadece
 * ölü pay kırpılmış oluyor. Daha da kısaltma: 36'nın altında ink alt kenarı
 * satırı aşar ve altındaki kart kabı (sonraki kardeş, üstte çizilir) logoyu
 * keser.
 *
 * İkonlar 24pt ve satırda dikey ortalı → üstte/altta 8px pay; rozetler ikonun
 * 4px altına taştığı için (bottom:-4) taban payı hâlâ yeterli.
 */
export const DISCOVER_HEADER_HEIGHT = 40;

/**
 * Şerit ile kart kabının arasındaki ayrım payı.
 *
 * 1 → 5: satır boyu logo kutusundan kısa (bkz. yukarısı) olduğu için kartın üst
 * kenarı görünür logonun dibine değecek kadar yaklaşıyordu. Yalnız kapalı kartı
 * ilgilendiriyor: HEADER_COVER bu sayıyı da içerdiğinden expand edilen kart yine
 * ekranın 0'ına oturuyor.
 */
export const DISCOVER_CARD_TOP_GAP = 5;

/**
 * Kart açılırken arkada kalan her şeyin üstüne inen KARARTMANIN tam açıktaki
 * opaklığı. Perde `cardExpandAnim` ile çarpılıyor, yani çekişle geliyor.
 *
 * İKİ AYRI KATMAN AYNI SAYIYI OKUMAK ZORUNDA, o yüzden burada:
 *   - DiscoverScreen > headerScrimStyle  — üst şeridin (durum çubuğu dâhil)
 *     üstündeki perde,
 *   - SwipeCard      > cardGapScrimStyle — kapak fotoğrafı ile panelin
 *     arasındaki boşluğa inen perde.
 * Ayrıştıkları an kartın üstü ile altındaki bant farklı tonda kararıyor ve kart
 * iki parçaya bölünmüş gibi okunuyor.
 *
 * TARİHÇE: 0.92 (açık kartta üst şerit simsiyahtı) → 0.3 (bu kez fazla açıktı,
 * arkadaki sayfanın "geri çekilmesi" okunmuyordu) → 0.45.
 */
export const EXPAND_SCRIM_ALPHA = 0.45;

// Yüzen tab bar'ın geometrisi — TabNavigator ile tutarlı:
// FLOATING_BAR_HEIGHT (64) + FLOATING_BAR_BOTTOM_GAP (-10) + insets.bottom.
const TAB_BAR_HEIGHT = 64;
const TAB_BAR_BOTTOM_GAP = -10;

/**
 * Tab bar'a değmemesi gereken içeriğin bırakacağı nefes payı. 12 → 4: bir tık
 * daha yaklaşsın istendi; 0 yapılmıyor, kartın yuvarlak köşesi bar'a değmiş
 * gibi durmasın.
 */
const CARD_BOTTOM_GAP = 4;

/**
 * Ekranın dibinde yüzen tab bar'ın kapladığı yükseklik.
 *
 * İKİ taraf da okumak zorunda, o yüzden burada:
 *   - DiscoverScreen — deste YOKKEN (iskelet / boş kart) kabın alt dolgusu,
 *   - SwipeCard      — kapak fotoğrafının ALT BANDINDAKİ katmanların (isim +
 *                      pill bloğu, "yukarı kaydır" ipucu, kapak not kutusu)
 *                      tabandan yüksekliği.
 *
 * İkincisi şart, çünkü kapak artık ekranın dibine kadar iniyor: bu pay
 * verilmezse o katmanlar tab bar'ın ARKASINA düşüyor. Kartın kendisi bilerek
 * bar'ın altına giriyor — kaçan yalnız üstündeki yazı.
 */
export function discoverTabBarInset(bottomSafeInset: number): number {
  return bottomSafeInset + TAB_BAR_HEIGHT + TAB_BAR_BOTTOM_GAP + CARD_BOTTOM_GAP;
}
