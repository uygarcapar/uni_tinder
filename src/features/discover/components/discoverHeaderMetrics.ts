/**
 * Keşif ekranının üst chrome'unun ölçüleri. Ayrı dosyada çünkü birden çok taraf
 * aynı sayıyı okumak ZORUNDA (DiscoverScreen, SwipeWrapper, SwipeCard,
 * FirePullHint) ve DiscoverScreen'den doğrudan import edilemez: ekran zaten
 * SwipeWrapper'ı import ediyor, döngü olurdu.
 *
 * ⚠️ BURASI ARTIK BİR "ŞERİT" DEĞİL. Kart tüm ekranı kaplıyor; üstteki iki cam
 * buton (geri al / filtre) kartın ÜSTÜNDE yüzüyor, kendi zemini olan bir bant
 * yok. Aşağıdaki iki sayı o yüzen satırın ölçüleri.
 */

/**
 * Yüzen ikon satırının yüksekliği — cam butonların dikey ortalandığı kutu.
 *
 * 50 → 40: satır bir dönem ortadaki logo KUTUSUNUN boyundaydı (LOGO_H), oysa
 * kutunun alt ~%24'ü boş alfaydı. Logo kaldırıldı (istek); sayı yine de 40:
 * cam butonlar (GLASS_ICON_CLEAR_SIZE) bu kutuya dikey ortalanıyor ve
 * FirePullHint ile kart kabının padding'li dalları hâlâ buradan besleniyor.
 */
export const DISCOVER_HEADER_HEIGHT = 40;

/**
 * Yüzen satır ile altındaki içeriğin ayrım payı.
 *
 * Kartın KENDİSİNİ artık ilgilendirmiyor (kart satırın ARKASINDAN geçip ekranın
 * tepesine dayanıyor). Okuyanlar: destesi olmayan hâller — iskelet ve boş kart
 * — ve FirePullHint'in üst taşma payı.
 */
export const DISCOVER_CARD_TOP_GAP = 5;

/**
 * Kartın AÇILIRKEN yukarı kalktığı mesafe.
 *
 * SIFIR: kart KAPALIYKEN DE tüm ekranı kaplıyor (üstte durum çubuğunun,
 * altta yüzen tab bar'ın ardına giriyor — bkz. DiscoverScreen'deki kart kabı),
 * yani açılışta örtülecek bir üst şerit kalmadı. Üst chrome artık kartın kendi
 * zemininde değil, fotoğrafın ÜSTÜNDE yüzen iki cam buton (geri al / filtre).
 *
 * İKİ TARAF DA BURAYI OKUMAK ZORUNDA:
 *   - SwipeWrapper > HEADER_COVER — kabuğu kaldıran taraf,
 *   - SwipeCard    > expandedLift — fotoğrafın penceresini büyüten taraf.
 * Ayrıştıkları an fotoğraf açılış boyunca ekranda kaymaya başlar.
 *
 * ⚠️ JESTİN YOLU BU SAYI DEĞİL. Bir dönem parmağın kat etmesi gereken mesafe
 * de buradan türüyordu (`HEADER_COVER × EXPAND_DRAG_SCALE`); lift sıfırlanınca
 * o bölen çöküyordu. İkisi ayrıldı — bkz. SwipeWrapper > EXPAND_TRAVEL_BASE.
 *
 * TARİHÇE: `insets.top + şerit + gap` (kart ekranın 0'ına dayanıyor, şerit +
 * durum çubuğu açılışta örtülüyordu) → `şerit + gap` (kart safe-area'da
 * duruyordu) → 0.
 */
export const DISCOVER_CARD_EXPAND_LIFT = 0;

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

/**
 * Keşif'in BÜTÜN yuvarlak cam butonlarının çapı — tek sayı (istek).
 *
 * Okuyanlar: ekranın üstündeki geri al / filtre, şeridin sol ucundaki yukarı ok,
 * şeridin sağ ucundaki Fire ve kapağın sağ alt kolonundaki üçlü (Fire · not ·
 * üç nokta). Hepsi aynı çapta olmak zorunda: ikisi diğerinin yerini alıyor
 * (devirde üst chrome değişiyor) ve bir tanesi bile ayrışırsa devir sırasında
 * daireler birbirinin üstünde büyüyüp küçülüyor.
 *
 * AYRI BİR SABİT, uygulamanın ortak cam ikon ölçüsünün (GLASS_ICON_CLEAR_SIZE)
 * takma adı DEĞİL — o sayı profildeki çan/ayarlar, sohbetteki geri/menü,
 * Bildirimler'deki geri gibi BAŞLIK butonlarını besliyor. İkisi bugün aynı
 * değerde ama farklı sorulara cevap veriyor; Keşif'in çapını oynatmak
 * istendiğinde ortak sayıya dokunmak bütün ekranların başlığını değiştirirdi.
 *
 * 52 → 48 (istek). 52 kapağın aksiyon kolonunun yerleşmiş ölçüsüydü ve diğerleri
 * ona eşitlenmişti; sonra hepsi ortak başlık ölçüsüne indi.
 */
export const DISCOVER_GLASS_BUTTON_SIZE = 48;
