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
