import { colors } from "@/shared/theme/colors";

/**
 * Akış satırının kabuğu — gönderi kartı ve iskelet satırı AYNI nesneyi
 * kullanıyor.
 *
 * BALONCUK (istek): satır tam genişlikte çizgiler arasında duran bir şerit
 * DEĞİL, kendi zemini olan yuvarlak bir kutu. Zemin `colors.surface` —
 * ProfileScreen'in bölümlerinden (CompletionAccordion,
 * profile/components/SelfieVerificationRow) birebir. Burada kendi grini
 * üretme: iki sayfa yan yana görülüyor, farklı bir gri ikisini iki ayrı ürün
 * gibi gösteriyor.
 *
 * ⚠️ ÇERÇEVE YOK, BALONCUĞU AYIRAN ŞEY GENİŞLİK + RENK (istek). Üç tur döndü ve
 * son hâli bu, o yüzden tarihçe duruyor: (1) ProfileScreen'le aynı 0.5 /
 * `colors.hairline` çerçeve vardı; (2) zemin yazarın bulanık fotoğrafına
 * çevrilince kalktı — fotoğrafın kenarındaki saç teli çizgi baloncuğu ayrı bir
 * levha gibi gösteriyordu; (3) fotoğraf geri alınınca kısa süre geri geldi;
 * (4) çerçeve yerine baloncuk GENİŞLETİLDİ (bkz. ROW_H_INSET) ve çerçeve
 * tümden kalktı. Geri konacaksa değer o iki dosyadan alınmalı (`hairline`,
 * `border` DEĞİL — bu bir kutu kenarı, sayfa zemini üstündeki ayraç değil),
 * ama önce şunu sor: baloncuğu gerçekten çizgi mi ayırıyor, yoksa `surface` ↔
 * `bg` farkı mı?
 *
 * ⚠️ `overflow: hidden` YOK, bilerek. Fotoğraflı zemin döneminde vardı ve
 * ZORUNLUYDU (mutlak zemin yuvarlak köşelerin dışına taşıyordu); o katman
 * gidince gerekçesi de gitti. Geri koyan biri olursa bilsin: satırın dışına
 * taşmak isteyen her şeyi (gölge, taşan bir rozet) sessizce kırpar.
 *
 * ⚠️ FONKSİYON, SABİT DEĞİL — modül düzeyinde kurulamaz. `colors` mutable bir
 * palet ve `applyPalette` içeriğini YERİNDE değiştiriyor; modül gövdesi ise
 * oturumda bir kez (ilk import'ta) çalışıyor. Kök remount ağacı yeniden
 * MOUNT ediyor ama modülü yeniden DEĞERLENDİRMİYOR, yani bir sabit ilk
 * import'un modunda donup kalır. Fiilen yaşanan sonucu: açıkta doğan satır
 * koyuya geçildiğinde siyah çizgisini koruyup görünmez oluyordu (bkz.
 * theme/colors.ts > mutasyon sözleşmesi, kural 1).
 */

/**
 * Akış listesinin yatay payı — Mesajlar ekranındaki sohbet satırının `px-4`ü
 * ile AYNI sayı (Beğeniler de 16'da).
 *
 * ⚠️ BU ARTIK BALONCUĞUN PAYI DEĞİL, SAYFANIN PAYI. Büyük başlık, açıklama ve
 * filtre pill'leri bu hatta oturuyor (FeedScreen > TITLE_LEFT_INSET ve
 * FilterPills'in `bleed`/`inset` ikilisi ikisi de bu sayıyı okuyor).
 * Baloncuk ondan DAHA GENİŞ — bkz. ROW_H_INSET. Baloncuğu genişletmek için bu
 * sayıyı küçültme: başlık ve pill satırı da birlikte kayar, oysa istenen yalnız
 * gönderilerin genişlemesiydi.
 *
 * TANIM BURADA, `FeedListPage`te değil: ters yön (`feedRowShell` →
 * `FeedListPage`) döngü yapardı — FeedListPage, iskeleti import ediyor, iskelet
 * de bu kabuğu.
 */
export const LIST_H_PADDING = 16;

/**
 * Baloncuğun EKRAN KENARINA olan payı (istek: "postların genel px'ini azalt,
 * ekranın sağına soluna — ama sadece postların olduğu kısım").
 *
 * 10, keyfi değil: Beğeniler'in foto kartı da ekranın 10'unda duruyor (bkz.
 * discover/components/LikeCard > LIST_H_PADDING) ve akışın Yanıtlar sayfası
 * zaten o kartı çiziyor, yani aynı pager'ın iki sayfası arasında tek bir kenar
 * hattı oluyor. Yeni bir sayı üretmek üç ekranı üç ayrı hatta bırakırdı.
 *
 * ⚠️ UYGULANMA BİÇİMİ NEGATİF MARJ, liste payını küçültmek DEĞİL: satır
 * `LIST_H_PADDING` dolgulu bir kabın içinde duruyor ve farkı geri alıyor.
 * Böylece baloncuk 10'a inerken başlık/pill hattı 16'da kalıyor. `FilterPills`in
 * `bleed`/`inset` ikilisiyle aynı numara, yalnız orada hedef tam ekran (0), ve
 * ESKİ hâlinde bu kabuk da aynı şeyi 0 için yapıyordu (satır çizgiye inmişken
 * kenarlıklar ekranın iki ucuna dayanıyordu).
 */
const ROW_H_INSET = 10;
const ROW_BLEED = ROW_H_INSET - LIST_H_PADDING;

/**
 * Baloncuğun İÇ dolgusu (istek: "bi tık azalt, az ama" — 18/16 → 16/14).
 *
 * ProfileScreen'in bölümleri 20'de duruyor ve bu kutu bilerek onlardan dar: o
 * kutular tek satırlık şeritler, bu kutu ise çok satırlı bir metin bloğu
 * taşıyor. Gövde 16.5 punto olduğundan iki yandaki pay doğrudan satır başına
 * düşen karakter sayısına çarpıyor; dar ekranda 20+20 gövdeyi gereksiz
 * sıkıştırıyordu.
 *
 * ⚠️ Yatay pay AYNI ZAMANDA köşe eğrisinin güvenlik payı — `ROW_RADIUS`ın
 * altındaki nota bak. Buradan daha aşağı inilecekse o hesap yeniden yapılmalı.
 */
const ROW_PAD_H = 16;
const ROW_PAD_V = 14;

/**
 * Baloncuklar arası boşluk — ProfileScreen'in bölümleri arasındaki 8'den bir
 * tık geniş: orada kutular tek bir blok gibi okunuyor, akışta ise her baloncuk
 * ayrı bir gönderi.
 */
const ROW_GAP = 10;

/**
 * Köşe yarıçapı (istek: "28 az, 34 yap").
 *
 * ProfileScreen'de iki sayı var — bölüm accordion'ı 40, doğrulama/davet
 * satırları 28 — ve ikisi de o kutuların YÜKSEKLİĞİNE göre seçilmiş: 40'lık
 * köşe ~54pt'lik tek satırlık şeridi neredeyse kapsüle çeviriyor. Akış
 * baloncuğu çok daha yüksek (başlık + çok satırlı gövde + aksiyon satırı), o
 * yüzden aynı kapsül etkisi için büyük sayıya ihtiyacı yok; 34 ikisinin arası.
 *
 * ⚠️ DOLGUYLA BİRLİKTE OKUNUR: yarıçap büyüdükçe köşenin yediği alan büyüyor
 * ve üst-sol köşedeki avatar eğrinin içine girebilir. Ölçüt eğrinin tek bir
 * noktası değil İKİ DAİRENİN İÇ İÇELİĞİ — avatar da yuvarlak, en kritik yer
 * köşegen. Bugünkü sayılarla (dolgu 16/14, avatar 34): avatarın merkezi
 * (33, 31) ve yarıçapı 17; köşe dairesinin merkezi (34, 34) ve yarıçapı 34.
 * Merkezler arası 3.2, yani 3.2 + 17 = 20.2 ≤ 34 → avatar eğrinin rahatça
 * içinde. Yarıçap büyür ya da dolgu küçülürse bu toplam yeniden kontrol
 * edilmeli; eşiğe yaklaşınca avatarın sol-üst yuvarlağı kırpılır.
 */
/**
 * ⚠️ DIŞA AÇIK, çünkü ikinci bir tüketicisi var: boş durumun paneli
 * (FeedListPage > FeedEmptyWrap) üst köşelerinde AYNI yarıçapı kullanıyor —
 * iki yerde elle yazılsaydı boş sayfa ile dolu sayfa arasında geçerken köşe
 * eğrisi oynardı.
 */
export const ROW_RADIUS = 34;

export const feedRowShell = () => ({
  backgroundColor: colors.surface,
  borderRadius: ROW_RADIUS,
  borderCurve: "continuous" as const,
  marginBottom: ROW_GAP,
  // Listenin payını kısmen geri alan negatif marj — baloncuk ekranın
  // `ROW_H_INSET`inde, başlık/pill hattı `LIST_H_PADDING`te. İçeriğe geri
  // EKLENMİYOR (eski tam-genişlik hâlinin aksine): kutu gerçekten genişliyor,
  // yalnız kenarı dışarı taşmıyor.
  marginHorizontal: ROW_BLEED,
  paddingVertical: ROW_PAD_V,
  paddingHorizontal: ROW_PAD_H,
});
