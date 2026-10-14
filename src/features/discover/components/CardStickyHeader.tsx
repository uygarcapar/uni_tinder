import { useMemo } from "react";
import { useTranslation } from "react-i18next";
import { StyleSheet, Text, View } from "react-native";
import Animated, { useAnimatedStyle } from "react-native-reanimated";
import type { SharedValue } from "react-native-reanimated";
import MaskedView from "@react-native-masked-view/masked-view";
import { easeGradient } from "react-native-easing-gradient";
import { BlurView } from "expo-blur";
import { LinearGradient } from "expo-linear-gradient";
import PremiumBadge from "@/shared/components/PremiumBadge";
import SelfieVerifiedBadge, {
  selfieBadgeSize,
} from "@/features/profile/components/SelfieVerifiedBadge";
// `veil` + `chromeBlurTint` KALDIRILDI: bandın önizleme dalı uygulamanın chrome
// reçetesini çiziyordu, artık iki bağlam da kapağın rampasını okuyor (gerekçe
// bandın çizildiği yerde).
import { colors as theme, scrimAt } from "@/shared/theme/colors";
import { resolveCardAge } from "../cardPrivacy";
import {
  FIRE_GLASS_INSET,
  FIRE_GLASS_SIZE,
} from "./FireGlassButton";
import CardMenuGlassButton, {
  CARD_MENU_GLASS_SIZE,
} from "./CardMenuGlassButton";
import { DISCOVER_GLASS_BUTTON_SIZE } from "./discoverHeaderMetrics";
import CardCloseGlassButton from "./CardCloseGlassButton";
import CardEditGlassButton from "./CardEditGlassButton";
import CardScrollTopGlassButton from "./CardScrollTopGlassButton";

/**
 * Açık kartın üstünde asılı duran başlık şeridi — profil kartının içindeki isim
 * başlığın altından kayıp gidince aynı isim burada belirir (iOS'un large-title
 * devri). Şeritteki isim panelinkinden (text-3xl = 30) belirgin küçük (23) ama
 * eski 20'den büyük: şerit önizlemelerde (`alwaysOpen`) kartın tek başlığı
 * olduğu için orada bir dipnot değil, başlık gibi okunmalı.
 *
 * Zemin PROGRESSIVE BLUR: MaskedView + easeGradient alfa maskesi → üstte tam
 * cam, aşağı doğru şeffafa çözülür. Maskenin kurulumu üçlü ScreenHeader /
 * SearchableListSheet ile birebir aynı.
 *
 * MALZEMESİ ise onlardan AYRI ve İKİ BAĞLAMDA TEK: kapağın dibindeki rampanın
 * aynısı — sabit siyah perde (scrimAt) + "dark" tint'li blur. Uygulamanın chrome
 * reçetesi (veil + `chromeBlurTint()`) burada YANLIŞ olurdu; şerit iki bağlamda
 * da bir FOTOĞRAFIN üstünde duruyor ve moda dönen tint açık temada fotoğrafı
 * yıkıyor. Sayılar bandın çizildiği yerde, gerekçesiyle.
 *
 * İKİ FARKLI YERDEN çiziliyor ve iki farklı iş yapıyor:
 *
 *   Keşif — kart sabit, scroll kartın İÇİNDE (BounceScrollView). Şerit kartın
 *           çerçevesine göre mutlak konumlu ve SwipeCard çiziyor. Orada kartın
 *           kendi BÜYÜK ismi var, şerit onu scroll'la DEVRALIYOR.
 *
 *   Sheet — Likes / Chat / Profil önizlemesi. Scroll kartın DIŞINDA
 *           (CardSheetScrollView) ve kartın kendisi kayıyor: şerit kartın
 *           içinde olsaydı içerikle birlikte yukarı kaçardı, bu yüzden
 *           sheet'ler onu scroll'un KARDEŞİ olarak çiziyor. Orada kartın kendi
 *           ismi HİÇ çizilmiyor — isim yalnız burada, yani devir de yok:
 *           `alwaysOpen` ile açık doğuyor, kartın sabit başlığı oluyor.
 */

// Şeridin ölçüleri asılı Fire butonundan türüyor: başlık satırı o
// butonla AYNI merkezde durur, yoksa kartın üst şeridinde iki farklı hizada iki
// öğe olurdu. (Sheet'te buton çizilmiyor ama şerit iki bağlamda da aynı
// görünsün diye ölçü ortak.)
const TITLE_TOP = FIRE_GLASS_INSET;
const TITLE_HEIGHT = FIRE_GLASS_SIZE;

// Şeritteki isim satırının puntosu — İKİ dal da (önizleme şeridi ve keşifteki
// kayan şerit) aynı sayıyı kullanıyor, premium işareti de ondan türüyor
// (bkz. PremiumBadge). Ölçü satır KUTUSUNDAN (TITLE_HEIGHT) bağımsız: 21/27
// oraya rahat sığıyor, dikey merkezleme kapsayıcının `alignItems`ında.
//
// 23 → 21: şerit ortalanınca isim iki cam butonun arasında bir başlık gibi
// değil, bir etiket gibi okunmalı. Panelin büyük ismiyle (30) arasındaki fark
// da böylece netleşiyor.
const TITLE_FONT = 21;
const TITLE_LINE = 27;

/**
 * KEŞİF bandında başlık satırının dibi. Önizlemenin ikizi aşağıda
 * (PREVIEW_HEADER_TITLE_BOTTOM) — ayrışmalarının gerekçesi orada.
 */
export const CARD_HEADER_TITLE_BOTTOM = TITLE_TOP + TITLE_HEIGHT;

/**
 * Bandın toplam yüksekliği. Başlık satırının altında kalan pay progressive
 * blur'un sönme kuyruğu: bant satırla bitseydi cam yazının hemen altında
 * keskin bir çizgiyle kesilirdi.
 */
export const CARD_HEADER_HEIGHT = CARD_HEADER_TITLE_BOTTOM + 16;

// FADE_RANGE (40) KALDIRILDI: cam zemin bir dönem isim eşiğe YAKLAŞIRKEN bu
// mesafe boyunca açılıyordu. Eşik diye bir şey kalmadı — şerit kartın açıklık
// oranıyla geliyor (bkz. revealStyle).

// SHEET BAĞLAMINDA (Beğeniler / Sohbet / Profil) ŞERİT HİÇ SÖNMÜYOR (istek:
// "kapatırken header yok olmasın"). Bir dönem kartı kapatmak için aşağı çekmeye
// başlandığı an sönüyordu; oranı `useCardSheetHeaderReveal` üretip `progress`
// prop'una veriyordu. Sheet'ler prop'u artık hiç geçmiyor (→ opaklık sabit 1) ve
// hook'un dosyası silindi. `progress` prop'u DURUYOR: Keşif onu kartın krom
// kanalıyla sürüyor.

/**
 * Cam buton ile ismin arasındaki boşluk. Buton ortak cam ikon ölçüsüne (40)
 * inince isim otomatik olarak sola kaydı — 6pt orada yeterliyken artık isim
 * butona yapışık duruyordu. Yan paya eklenen bu değer o farkı kapatıyor.
 */
const TITLE_GAP_AFTER_BUTTON = 14;

/*
 * `TITLE_LEFT_INSET` (= FIRE_GLASS_INSET ≈ 33.5) KALDIRILDI: Keşif şeridinde
 * başlık satırının sol payıydı ve kapaktaki cam Fire butonunun köşe boşluğundan
 * türüyordu — "iki öğe kartın üst şeridinde simetrik köşe boşluğunda durur".
 *
 * O buton kapağın köşesinden gitti (artık sağ alt aksiyon kolonunda) ve şeridin
 * hizalanacağı şey değişti: bant devirden önce ekranın üstündeki yüzen cam
 * butonları (geri al / filtre) taşıyor, devirde onların yerini isim + Fire
 * alıyor. Üçü de tek kenar payını okuyor — CHROME_EDGE_INSET.
 */

export const CHROME_EDGE_INSET = 16;

/**
 * Başlık satırının ALTINDA kalan pay — progressive blur'un sönme kuyruğu. Bant
 * satırla bitseydi cam, yazının hemen altında keskin bir çizgiyle kesilirdi.
 */
const CHROME_BAND_TAIL = 16;

/**
 * KEŞİF şeridinde başlık satırının İKİ YANDAKİ payı — kenar boşluğu + köşe
 * butonunun çapı + nefes.
 *
 * İKİ YANDA AYNI SAYI, çünkü satır ortalı (istek) ve iki uçta da bir cam buton
 * var: solda yukarı ok, sağda Fire. Tek yana verilse isim optik olarak kayardı.
 *
 * Çap `CARD_MENU_GLASS_SIZE` (ortak cam ikon ölçüsü, 48) — Fire kabuğu ondan
 * kısa (44) ama GÖRÜNEN kenar payı ikisinde de aynı, çünkü Fire dikeyde
 * ortalanıp yatayda aynı kenara yaslanıyor (bkz. SwipeCard).
 *
 * Uzun isim butonların altına girmek yerine "…"ya düşüyor (numberOfLines={1}).
 */
const TITLE_SIDE_INSET =
  CHROME_EDGE_INSET + DISCOVER_GLASS_BUTTON_SIZE + TITLE_GAP_AFTER_BUTTON;

/**
 * ÖNİZLEME şeridinin (`alwaysOpen`) kenar payı — soldaki "kapat", sağdaki üç
 * nokta ve satırın ÜSTTEN payı, üçü de bu tek sayı.
 *
 * KARTIN İÇERİĞİYLE AYNI ÇİZGİ: panelin yan dolgusu `px-4`, yani bölüm
 * kutuları ve fotoğraflar kartın kenarından 16'da başlıyor. Şerit de onların
 * hizasında duruyor — önizlemede kartın tek başlığı o, altındaki içerikten
 * içeride durunca köşeye asılı kalıyordu. Üst pay da aynı sayı: kenar boşluğu
 * dört yönde tek değer.
 *
 * KEŞİF'İNKİNDEN AYRI (TITLE_LEFT_INSET = FIRE_GLASS_INSET ≈ 33.5) ve bu fark
 * KASITLI: orada şerit, kapağın üstünde duran cam Fire butonuyla aynı köşe
 * boşluğunu paylaşmak ZORUNDA — ikisi tek satır gibi okunuyor ve butonun yeri
 * kendi ölçüsünden türüyor. Önizlemede o buton yok.
 *
 * TARİHÇE: bir dönem 16'ydı (aynı gerekçe), sonra iki bağlam eşitlensin diye
 * FIRE_GLASS_INSET'e bağlandı; içerik hizası istendiği için 16'ya döndü.
 */

/**
 * Önizleme şeridinde başlık satırının ÜST payı — yan payın aynısı (bkz.
 * PREVIEW_SIDE_INSET). Keşif'te bu TITLE_TOP, yani Fire butonunun köşe boşluğu.
 */
const PREVIEW_TITLE_TOP = CHROME_EDGE_INSET;

/**
 * Önizleme bandının ölçüleri — Keşif'inkilerin (CARD_HEADER_TITLE_BOTTOM /
 * CARD_HEADER_HEIGHT) küçük üst paylı ikizi. Ayrı tutuluyorlar çünkü satır
 * yukarı çıkınca bandın hem dibi hem toplam boyu onunla birlikte çıkmalı:
 * bant eskisi kadar uzun kalsaydı blur kuyruğu başlığın çok altında biterdi.
 *
 * İçeriğin şeridin ALTINDAN başlaması için gereken payı SwipeCard bundan
 * hesaplıyor (bkz. PREVIEW_HEADER_SPACE).
 */
export const PREVIEW_HEADER_TITLE_BOTTOM = PREVIEW_TITLE_TOP + TITLE_HEIGHT;
export const PREVIEW_CARD_HEADER_HEIGHT = PREVIEW_HEADER_TITLE_BOTTOM + 16;

/**
 * Önizleme şeridinde başlık satırının YAN payı — İKİ YANDA DA AYNI.
 *
 * Köşelerde cam buton VARSA pay onlardan türüyor (kenar boşluğu + çap + nefes):
 * uzun isim butonun altına girmek yerine "…"ya düşüyor. Sayı Keşif'inkinden
 * (TITLE_SIDE_INSET) birkaç puan büyük, çünkü köşe butonlarının kabuğu Fire
 * kabuğundan geniş (48 / 44) — GÖRÜNEN kenar payı, yani butonun kartın kenarına
 * uzaklığı ikisinde de aynı.
 *
 * SİMETRİK, tek buton varken de: isim şeridin ORTASINDA durmalı (bkz. başlık
 * satırının `justifyContent`'i). Sol köşede kapat (çarpı), sağda üç nokta var;
 * biri çizilmese bile pay iki yandan aynı iniyor, yoksa isim boş kalan köşeye
 * doğru kayıp ortalanmış görünmekten çıkıyordu.
 *
 * Hiç buton yoksa (şu an böyle bir çağıran yok — `onClose` da `onMenu` da
 * verilmeyen önizleme) pay sade kenar boşluğuna düşüyor.
 */
const PREVIEW_TITLE_INSET_WITH_CHROME =
  CHROME_EDGE_INSET + CARD_MENU_GLASS_SIZE + TITLE_GAP_AFTER_BUTTON;
const PREVIEW_TITLE_INSET_PLAIN = CHROME_EDGE_INSET;

/**
 * Köşe butonu kabuğunun (48) başlık satırından (44) yarım farkı — DİKEYDE.
 * Kutular değil merkezler çakışsın. Yatayda uygulanmıyor: orada hizalanan şey
 * merkez değil, kabuğun kenarı — kutu içeriğin çizgisine otursun
 * (PREVIEW_SIDE_INSET). İki köşe butonu aynı çapta olduğu için tek sabit.
 */
const CHROME_CENTER_FIX = (CARD_MENU_GLASS_SIZE - FIRE_GLASS_SIZE) / 2;

/**
 * Önizleme şeridindeki cam köşe butonlarının (solda "kapat", sağda üç nokta /
 * kalem) kartı taşıyan YÜZEYİN TEPESİNE uzaklığı — aşağıdaki `top: rowTop -
 * CHROME_CENTER_FIX + topInset` ifadesinin `topInset`siz hâli.
 *
 * DIŞARIYA AÇIK, çünkü kart TAŞIMAYAN sheet'ler de aynı çizgiye hizalanmak
 * zorunda: AppModal'ın başlık satırı bunu `headerButtonTop` ile okuyor (davet ve
 * görünürlük sheet'leri geçiyor — istek: "butonların modalın tepesine uzaklığı
 * profilden açılan karttaki kadar olsun"). Oraya elle bir sayı yazılsaydı
 * kullanıcı kart ile sheet arasında gezerken aynı cam buton 6pt zıplıyordu;
 * burada kalınca satırın payı (PREVIEW_TITLE_TOP) oynadığında ikisi birlikte
 * gidiyor.
 */
export const CARD_CHROME_BUTTON_TOP = PREVIEW_TITLE_TOP - CHROME_CENTER_FIX;

// ACTIVITY_SPACING (12) KALDIRILDI: "bugün aktif"in isimden toplam boşluğunu
// (satırın gap'i + işaretin marginLeft'i) yalnız ortalama kaymasını hesaplayan
// formül okuyordu. Satır sola yaslandı, kayma da formül de gitti.

/*
 * ── AKTİFLİK İŞARETİNİN SCROLL FADE'İ KALDIRILDI ─────────────────────────────
 *
 * Burada `ACTIVITY_FADE_TRIGGER` (40px eşik) + `ACTIVITY_FADE_DURATION` (450ms)
 * vardı: açık kartta bir süre kaydırılınca satır sadeleşip yalnız isme düşsün
 * diye işaret OPAKLIKLA sönüyordu — layout'tan çıkmadan, yani genişliği
 * kalıyordu (ortalanmış satır işaret gidince kaymasın diye bilerek böyleydi).
 *
 * Sonuç tersine döndü: Keşif'te şerit ancak kart açıkken görünüyor ve o an
 * scroll çoktan eşiğin üstünde oluyor, yani işaret GÖRÜNMEZ ama yerini tutuyor
 * — isim satırın ortasında değil, görünmez bir bloğun soluna yaslı duruyordu.
 *
 * Çözüm fade'i düzeltmek değil, işareti Keşif şeridinden tamamen çıkarmak oldu:
 * aktiflik artık kapağın isim bloğunda duruyor (SwipeCard), şerit isim + yaş +
 * rozetlerle sınırlı ve ortalı. Önizlemede işaret bir süre durdu (orada scroll
 * prop'u hiç verilmediği için fade zaten hiç çalışmıyordu), sonra oradan da
 * kaldırıldı — gerekçe aşağıda, bayrağın silindiği yerde.
 */

/**
 * Kart kabuğunun köşe yarıçapı. ÜÇ yer aynı sayıyı kullanmak ZORUNDA: kartın
 * kökü (SwipeCard), bu şeridin kendi kırpması ve kartı taşıyan sheet'in clip'i
 * (AppBottomSheet `cornerRadius`). Ayrıştıkları an köşelerde ya hilal kalıyor
 * ya da iki farklı eğri üst üste biniyor.
 *
 * KEŞİF'İN KARTI ARTIK BUNU OKUMUYOR — o CARD_FACE_CORNER_RADIUS'a geçti
 * (aşağıya bak). Burada kalan okuyucular sheet bağlamı: şeridin varsayılan
 * `radius`ı, önizleme scroll'unun kuyruk payı ve sheet'in kendi clip'i.
 */
export const CARD_CORNER_RADIUS = 50;

/**
 * KEŞİF KARTININ YÜZÜ — kabuk + kapak fotoğrafı, tek sayı. Kart KAPALIYKEN DE
 * AÇIKKEN DE bu köşede: açılma boyunca hiç değişmiyor (bkz. SwipeCard >
 * openCornerRadius; bir dönem 26'ya iniyordu, gerekçesi orada).
 *
 * DÖRT KÖŞE DE AYNI: bir dönem alt köşeler açılma oranıyla 0'A kadar iniyordu
 * (açık kartta panel kapağın DEVAMI sayılıyordu), panel ondan ayrı bir yüzeye
 * dönünce kapağın dibi de gerçek bir kenar oldu — 0'a inen kenar fotoğrafı
 * panelin üstünde köşesiz bir blok gibi gösteriyordu.
 *
 * 32 → 44: kapağın köşesi daha yumuşak istendi.
 *
 * AYNI SAYIYI OKUYAN YERLER (ayrışırsa köşede hilal / çift eğri): kabuk, kapak
 * fotoğrafı, kapağın skeleton'ı, panelin üst köşeleri (PANEL_TOP_RADIUS) ve
 * sürükleme karartması (SwipeWrapper). Son ikisi SABİT: panelin tepesi kartın
 * kenarı değil kendi yüzeyi, karartma da yalnız yatay sürüklemede (kart hep
 * kapalı) görünüyor.
 */
export const CARD_FACE_CORNER_RADIUS = 44;

/**
 * KEŞİF KARTININ ÜST İKİ KÖŞESİ — yüzün geri kalanından BİR TIK daha kare.
 *
 * Cihazda üst köşelerde ince bir beyazlık görünüyordu: köşede üç eş eğri üst
 * üste biniyor (kabuk → boyama kutusu → kapak fotoğrafı; ilk ikisi açık modda
 * BEYAZ zemin taşıyor) ve 44'lük `continuous` eğri bu yığında tam oturmuyordu —
 * en üstteki kapağın kenar yumuşatması altındaki beyazı sızdırıyordu. Yarıçap
 * büyüdükçe o köşe bandı da büyüdüğü için sızıntı 44'te gözle görülür hale
 * geliyor.
 *
 * İKİ TARAFLI ÇÖZÜMÜN YARISI: üst köşeler burada 38'e indi (sızıntının olduğu
 * bant küçüldü), DİĞER YARISI kapağın üst köşesini kabuktan 2pt daha kare
 * çizmek — bkz. SwipeCard > COVER_TOP_RADIUS_OVERFILL.
 *
 * YALNIZ ALT İKİSİ 44'TE KALDI (CARD_FACE_CORNER_RADIUS): kapağın dibi panelin
 * üstünde gerçek bir kenar olarak duruyor, orada altına sızacak bir yüzey yok
 * ve istek üst köşelerdi.
 *
 * ÖNİZLEME BUNU OKUMUYOR: sheet'teki kartın üst köşesi sheet'in clip'iyle
 * zincirli (CARD_EXPANDED_CORNER_RADIUS); ayrışırsa köşede hilal kalıyor.
 */
export const CARD_FACE_TOP_CORNER_RADIUS = 38;

/**
 * SHEET'TEKİ açık kartın köşe yarıçapı — Beğeniler / Sohbet / Profil
 * önizlemesi, sheet'in en üst detent'i.
 *
 * KEŞİF KARTININ YÜZÜYLE AYNI SAYI (istek: "önizleme kartlarının sol/sağ üst
 * köşesi Keşif'teki ana kartla aynı olsun"). Türetilmiş, kopyalanmış DEĞİL:
 * `CARD_FACE_CORNER_RADIUS` oynatılınca önizleme de onunla gidiyor — aynı kart,
 * hangi ekrandan açılırsa açılsın aynı köşede.
 *
 * TARİHÇE — 50 → 35 → 44: kabuk bir dönem 50'ydi ve açık kart telefonun köşe
 * maskesinden DAHA YUVARLAK kalıyordu; dört köşede kartla ekran kenarı arasında
 * sayfa zemininden ince bir hilal görünüyordu (açık modda beyaz). Çözüm kabuğu
 * telefonunkine eşitlemek değildi — o sayı cihazdan cihaza değişiyor (39…62pt) ve
 * RN'e açık değil — ondan DAHA KARE yapmaktı: 35, çentikli iPhone'ların en
 * küçüğünün (39) de altında.
 *
 * O HİLAL ARTIK ÜRETİLEMİYOR, bu yüzden 44'e çıkmak güvenli: kart ekranın 0'ına
 * değil safe-area çizgisine dayanıyor (iki sheet de `topInset={insets.top}`
 * veriyor), yani üst köşeler donanım maskesinden uzak; alt köşeler ise ekranın
 * dibinin altına taşıyor. Keşif'in kendi açık kartı tam aynı gerekçeyle 44'te
 * kaldı (bkz. SwipeCard > openCornerRadius'un tarihçesi).
 *
 * BU SAYI SHEET'İN CLIP'İYLE ZİNCİRLİ (AppBottomSheet `cornerRadius`).
 *
 * Aynı sayıyı okuyan yerler: kart kabuğu (SwipeCard > cardFrameRadiusStyle),
 * kapak fotoğrafı (photoBorderStyle), kapağın pinch kopyası, bu şeridin kendi
 * kırpması ve kartı taşıyan sheet'in clip'i. Ayrıştıkları an köşede ya hilal
 * kalıyor ya iki farklı eğri üst üste biniyor (bkz. CARD_CORNER_RADIUS'un
 * notu). HEPSİ `continuous` eğri çizmek zorunda: aynı yarıçapta bile circular
 * ile continuous kenar boyunca birbirini kesiyor ve şeffaf zeminli sheet'te
 * aradan ince hilaller sızıyor.
 */
export const CARD_EXPANDED_CORNER_RADIUS = CARD_FACE_CORNER_RADIUS;

/*
 * ── KEŞİF'İN AYRI "AÇIK KÖŞE" SABİTİ KALDIRILDI ──────────────────────────────
 *
 * Burada `CARD_OPEN_CORNER_RADIUS = 26` vardı: Keşif'te kabuk ve kapak
 * fotoğrafı açılırken 44'ten oraya iniyor, açık kart belirgin şekilde
 * kareleşiyordu. Gerekçesi "açık kart ekranın kenarına dayanıyor, 44 telefonun
 * köşe maskesinden (39…62pt) yuvarlak kalıp kenarda sayfa zemininden ince bir
 * hilal bırakıyor"du.
 *
 * İSTEK ÜZERİNE KALDIRILDI — köşe açılma boyunca hiç değişmesin, kart aynı
 * yuvarlaklıkta büyüsün. Hilal de artık üretilemiyor: kart ekranın 0'ına değil
 * safe-area çizgisine dayanıyor (üst köşeler donanım maskesinden uzak), alt
 * köşeler ise zaten ekranın dibinin altına taşıyor.
 *
 * Yerine Keşif de kapalı kartın sayısını (CARD_FACE_CORNER_RADIUS) varış olarak
 * okuyor; geri istenirse tek satır — bkz. SwipeCard > openCornerRadius.
 */

/**
 * Açık karttaki ÜST CHROME'un (köşe cam butonları + şeridin başlık satırı)
 * köşe diyagonalinden aşağı kayma payı.
 *
 * ŞİMDİ SIFIR — ve sabit, pay yeniden gerekirse tek yerden dönsün diye duruyor.
 * Kartı taşıyan HER YÜZEY (Keşif'te expand edilen kart, PreviewModal,
 * LikerSwipeModal) artık ekranın 0'ına değil safe-area çizgisine dayanıyor,
 * yani durum çubuğu kartın üstünde değil ARKASINDA kalmıyor: chrome'un
 * kaçacağı bir glif yok. Köşeden uzaklığı zaten FIRE_GLASS_INSET (33.5)
 * veriyor.
 *
 * TARİHÇE (kart tepeye dayanırken): pay olmadan chrome durum çubuğu
 * gliflerinin (~y17-40) üstüne biniyordu; tam safe-area payı (insets.top ≈
 * 59-62) ise butonları köşeden kopartıp ortada asılı bırakıyordu. 14 →
 * 22'ydi: 14'te chrome'un üst kenarı y≈47.5, Dynamic Island'ın dibine (~y48)
 * yapışıyordu; 22'de y≈55.5 ile adanın ~7pt altına iniyordu.
 *
 * Açılma oranıyla ANİME DEĞİL: buton bir kez yerine oturduktan sonra hiçbir
 * jestte kıpırdamamalı (gerekçesi SwipeCard > cornerDrop).
 */
export const CARD_CHROME_TOP_DROP = 0;

type Props = {
  profile: any;
  /*
   * `scrollY` PROP'U KALDIRILDI: tek işi "bugün aktif"in sönme eşiğini
   * beslemekti (Keşif kartın İÇİNDEKİ, sheet kartın DIŞINDAKİ scroll'u
   * veriyordu) ve fiilen yalnız Keşif geçiyordu. İşaret şeritten çıkınca
   * (önce Keşif'ten, sonra önizlemeden de — bkz. aşağıdaki kaldırma notu)
   * şeridin scroll'la hiçbir işi kalmadı; görünürlüğünü baştan beri kartın
   * açıklık oranı sürüyor (bkz. `progress`). İki sheet de artık shared
   * value'yu hiç kurmuyor.
   */
  /**
   * Şeridin ÖNİZLEME dizilişi (Likes / Chat / Profil): sağ köşede Fire
   * butonu değil, varsa "üç nokta" duruyor. Bandın BÜTÜN ölçüleri bu bayrakla
   * seçiliyor — kenar payı, üst pay ve toplam boy (bkz. PREVIEW_SIDE_INSET):
   * önizlemede şerit kartın içerik çizgisine hizalı, Keşif'te kapaktaki cam
   * Fire butonunun köşe boşluğuna.
   *
   * ŞERİDİN GÖRÜNÜRLÜĞÜNÜ BELİRLEMİYOR: iki bağlamda da şerit kartın açıklık
   * oranıyla (`progress`) beliriyor.
   */
  alwaysOpen?: boolean;
  /**
   * ŞERİDİN GÖRÜNÜRLÜĞÜNÜ SÜREN ORAN. Verilmezse 1 sayılır.
   *
   * Keşif KROM kanalını veriyor (cardChromeAnim, cardExpandAnim DEĞİL): şerit
   * kapaktaki büyük ismin yerini alıyor ve o isim krom kanalından çekiliyor —
   * gerekçe SwipeCard'daki prop'un yanında.
   *
   * SHEET'TE (`alwaysOpen`) HİÇ VERİLMİYOR → sabit 1, yani şerit kart kapanırken
   * sonuna kadar duruyor ve onunla birlikte aşağı kayıyor (istek: "kapatırken
   * header yok olmasın").
   *
   * TARİHÇE: bir dönem sheet'in kendi konumundan türeyen bir oran (kaldırılan
   * `useCardSheetHeaderReveal`) veriliyordu — kart açık doğduğu için 1
   * başlıyor, kullanıcı kapatmak için aşağı çekmeye BAŞLADIĞI AN kendi süresiyle
   * 0'a iniyor, çekiş kapanışa yetmezse geri dönüyordu. Ondan öncesi de yine
   * sabit 1'di; yani bu davranış oraya geri döndü.
   */
  progress?: SharedValue<number>;
  /** Bandın kendi kırpması — varsayılanı kart kabuğuyla aynı. */
  radius?: number;
  /**
   * YALNIZ BANDI ÇİZ — başlık satırı ve köşe cam butonları hiç mount edilmez.
   *
   * Keşif'te DESTENİN ALTINDAKİ kart bunu alıyor. Gerekçesi görsel: bandın
   * malzemesi (scrim + blur) kartın ÜST GÖLGESİ ve kapalı kartta da hep açık
   * (bkz. bandRevealStyle). Kart üste geçtiği anda mount edilirse gölge
   * fotoğrafın üstüne SONRADAN düşüyor — swipe biter, bir an sonra kartın
   * tepesi kararır. Bant alt karttayken de duruyorsa kart üste geçtiğinde
   * gölge ÇOKTAN yerinde.
   *
   * CAM BUTONLAR BANDLA GELMİYOR, bilerek: alt kartta krom oranı 0, yani
   * kabukları opaklık 0'da doğardı — SwiftUI cam yüzeyi ilk layout turunu
   * alfa 1'in altında geçirirse efektini hiç kurmuyor (bkz. chromeRevealStyle'ın
   * uyarısı). Onlar kart üste geçerken mount ediliyor, tıpkı bugün olduğu gibi.
   */
  bandOnly?: boolean;
  /**
   * KEŞİF şeridinin SOL ucundaki cam "yukarı ok" — içeriği başa sarar.
   *
   * Şerit isim satırını devraldığı an kullanıcı bir ekran boyu aşağıda oluyor ve
   * kapağa dönmenin tek yolu elle geri kaydırmaktı. Ok o yolu tek dokunuşa
   * indiriyor; isim de onun sağına değil ORTAYA geçiyor (istek), yani satır iki
   * cam butonun arasında dengeli duruyor.
   *
   * Verilmezse buton çizilmez ve satır sola yaslı kalır — önizleme bu prop'u
   * hiç vermiyor, oranın sol köşesi "kapat"ın (bkz. `onClose`).
   *
   * TARİHÇE: bir dönem burada cam bir "başa dön" butonu vardı ve kaldırılmıştı;
   * isim o zaman köşeye taşınmıştı. Geri geldi.
   */
  onScrollTop?: () => void;
  /**
   * Verilirse şeridin SAĞ ucuna cam bir "üç nokta" konur (bkz.
   * CardMenuGlassButton) ve isim iki butonun arasında ortalanır.
   *
   * Yalnız ÖNİZLEME şeritleri veriyor (`alwaysOpen`): sohbetten açılan profil
   * kartı, ekranın başlığındaki menü butonunu şeride taşıyor — kart tam ekranı
   * kapladığı için altındaki başlık artık erişilebilir değil. Keşif'te YOK:
   * orada sağ köşe Fire butonunun.
   *
   * Buton `revealStyle`ı taşıyan katmanların ÇOCUĞU DEĞİL (ikisi de kardeş,
   * yerleşimleri ayrı) ama görünürlüğü onlarla aynı orandan geliyor — kendi
   * style'ıyla; cam yolundaki opaklık uyarısı için bkz. menuRevealStyle.
   */
  onMenu?: () => void;
  /**
   * Verilirse şeridin SAĞ ucuna cam bir "düzenle" (kalem) konur (bkz.
   * CardEditGlassButton) — üç noktanın yerine, onunla AYNI köşede.
   *
   * Yalnız KENDİ PROFİLİNİN önizlemesi veriyor (ProfileScreen > PreviewModal):
   * orada şikayet/engelle gibi bir menü yok, olması gereken tek aksiyon
   * düzenlemeye geçmek. Karşı tarafın kartında ise tersi — menü var, düzenlenecek
   * bir şey yok.
   *
   * `onMenu` ÖNCELİKLİ: ikisi birden verilirse üç nokta çizilir. Şu an böyle bir
   * çağıran yok ve olmamalı — iki aksiyon aynı köşeye sığmaz, biri ötekinin
   * menüsüne girmeli.
   */
  onEdit?: () => void;
  /**
   * Verilirse şeridin SOL ucuna cam bir "kapat" (çarpı) konur (bkz.
   * CardCloseGlassButton) — sağdaki üç noktanın simetriği.
   *
   * Yalnız ÖNİZLEME şeritleri veriyor (`alwaysOpen`): kart tam ekranı kapladığı
   * için altındaki ekranın kendi kapat/geri kontrolü erişilemez oluyor ve kartı
   * kapatmanın tek yolu aşağı çekme jesti kalıyor. Bu buton o jestin GÖRÜNÜR
   * karşılığı; jest aynen duruyor. Keşif'te YOK: orada sol köşe kapaktaki
   * "başa dön" butonunun (bkz. CardCollapseGlassButton).
   *
   * Sağdaki kardeşiyle aynı kurallar — `revealStyle`ı taşıyan katmanların
   * ÇOCUĞU DEĞİL (kardeş, yerleşimleri ayrı) ama görünürlüğü onlarla aynı
   * orandan geliyor; cam yolundaki opaklık uyarısı için bkz. menuRevealStyle.
   */
  onClose?: () => void;
  /**
   * Şeridin İÇERİĞİNİ (başlık satırı + cam buton) bu kadar aşağı iter; bandın
   * kendisi kartın tepesinde kalır, yalnız o kadar uzar.
   *
   * Yalnız Keşif veriyor: açık kart ekranın en tepesine biniyor, yani bandın
   * tepesi = ekranın 0'ı. Pay, sağ üstteki Fire butonununkiyle AYNI
   * olmak zorunda (bkz. SwipeCard > EXPANDED_CORNER_DROP) — iki köşe butonu
   * simetrik durmalı. Şeridin başlık satırı da butonla aynı merkezi paylaştığı
   * için onunla birlikte iniyor.
   *
   * Sheet'lerde (`alwaysOpen`) 0: orada kart lift almıyor.
   */
  topInset?: number;
  /**
   * KEŞİF'TE başlık satırının bandın tepesinden uzaklığı (px) — doğrudan `top`.
   *
   * ÇAĞIRAN VERİYOR, çünkü satır ekranın üstündeki yüzen cam butonlarla (geri al
   * / filtre) AYNI çizgide durmak zorunda ve o çizgi safe-area'dan geliyor:
   * bant kartın tepesinden (ekranın 0'ı) başlıyor, butonlar `insets.top`ta.
   * Devir olunca butonların yerini isim + Fire alıyor (istek) — ikisi aynı
   * satırda değilse devirde yazı yukarı/aşağı zıplıyor.
   *
   * `topInset` ile karıştırma: o, bandın İÇERİĞİNİ topluca aşağı iten bir pay
   * (bant yerinde kalır, yalnız uzar). Bu ise satırın kendi `top`u.
   *
   * Verilmezse Keşif TITLE_TOP'a düşüyor (kapaktaki cam Fire butonunun eski
   * köşe boşluğu); önizleme bu prop'u hiç okumuyor, oranın kendi payı var.
   */
  titleTop?: number;
};

export default function CardStickyHeader({
  profile,
  alwaysOpen = false,
  progress,
  radius = CARD_CORNER_RADIUS,
  bandOnly = false,
  onMenu,
  onEdit,
  onClose,
  topInset = 0,
  titleTop,
  onScrollTop,
}: Props) {
  const { t } = useTranslation();

  // Şeridin SAĞ köşesinde ne duruyor — önizlemede üç nokta ya da kalem, ikisi
  // birden DEĞİL (gerekçe `onEdit`in notunda). Tek yerden hesaplanıyor: butonun
  // çizimi de başlık satırının yan payı da bunu okuyor, ayrışırsa isim boş bir
  // köşeye doğru kayıp ortalanmış görünmekten çıkıyor.
  const rightAction = alwaysOpen ? (onMenu ? "menu" : onEdit ? "edit" : null) : null;
  // Satırın simetrik pay alması için köşelerde EN AZ BİR buton olması yeterli:
  // pay iki yandan birden iniyor (bkz. PREVIEW_TITLE_INSET_WITH_CHROME).
  const hasPreviewChrome = alwaysOpen && (!!onClose || rightAction != null);
  // İsmin yanındaki ", 23" eki — SwipeCard'daki başlıkla aynı kural:
  // `showAge` kapalıyken backend null yerine 0 gönderiyor (bkz. cardPrivacy).
  const ageSuffix = useMemo(() => {
    const age = resolveCardAge({
      age: profile?.age,
      showAge: profile?.showAge,
    });
    return age != null ? `, ${age}` : "";
  }, [profile?.age, profile?.showAge]);

  // ── Bandın ölçüleri bağlama göre ────────────────────────────────────────
  // ── BANDIN ÖLÇÜLERİ ────────────────────────────────────────────────────
  // Kenar payı İKİ BAĞLAMDA DA 16 (bkz. CHROME_EDGE_INSET): önizlemede kartın
  // içerik çizgisi, Keşif'te ekranın üstündeki yüzen cam butonların
  // (geri al / filtre) yatay payı. Aynı sayı olmak ZORUNDA, çünkü Keşif'te bant
  // o butonların ALTINDA duruyor ve devir olunca içerik onların yerini alıyor:
  // solda isim, sağda Fire. Ayrışırlarsa devirde yazı yana zıplıyor.
  //
  // Üst pay Keşif'te ÇAĞIRANDAN geliyor (`titleTop` — safe-area'yı yalnız o
  // biliyor), önizlemede kenar payının aynısı.
  const edgeInset = CHROME_EDGE_INSET;
  const rowTop = alwaysOpen ? PREVIEW_TITLE_TOP : (titleTop ?? TITLE_TOP);
  /**
   * Chrome satırının YÜKSEKLİĞİ — Keşif'te cam butonun çapı, önizlemede başlık
   * satırının kendi boyu.
   *
   * KEŞİF'TE BUTON ÇAPI OLMAK ZORUNDA: satır ile köşe butonları aynı `top`tan
   * başlıyor ve isim o kutuya dikey ORTALANIYOR. Eskiden buton, satıra
   * ortalansın diye yarım fark kadar yukarı çekiliyordu (`-(çap − satır)/2`) —
   * ama o buton, ekranın üstündeki yüzen geri al/filtre ile de hizalı olmak
   * zorunda ve onlar `insets.top`ta duruyor. Yarım fark kadarlık kayma, devirde
   * okun rewind'in yerine geçerken 2px zıplaması olarak görünüyordu.
   */
  const rowHeight = alwaysOpen ? TITLE_HEIGHT : DISCOVER_GLASS_BUTTON_SIZE;
  const bandHeight = alwaysOpen
    ? PREVIEW_CARD_HEADER_HEIGHT
    : rowTop + rowHeight + CHROME_BAND_TAIL;

  /*
   * ── AKTİFLİK İŞARETİ ŞERİTTEN TAMAMEN KALKTI ────────────────────────────
   *
   * Burada `showActivity = alwaysOpen && profile?.isOnlineToday === true`
   * vardı: Keşif şeridinde çizilmiyordu (isim ortada kalsın diye, gerekçe
   * yukarıda), önizleme şeritlerinde — Beğeniler / Mesajlar / Akış / kendi
   * profil önizlemesi — ismin sağında "24 saat içerisinde aktif" olarak
   * duruyordu.
   *
   * İSTEK ÜZERİNE KALDIRILDI: önizlemeden açılan kartın başlığında bu yazı
   * olmasın. Şerit artık İKİ BAĞLAMDA DA isim + yaş + rozetlerle sınırlı, yani
   * kart hangi ekrandan açılırsa açılsın başlığı aynı.
   *
   * Bayrağın kaynağı duruyor ve Keşif kartının KAPAĞINDA aynen çiziliyor (bkz.
   * SwipeCard > showActivity); önizlemede kapağın isim bloğu hiç çizilmediği
   * için (kart açık doğuyor → chrome kanalı 1) satır oralarda hiç görünmüyor.
   * Geri istenirse dönecek yer burası.
   */

  // "Burada yeni" rozeti burada YOK ve eklenmeyecek: şerit isim + yaş + premium
  // ile sınırlı. Rozet kapalı Keşif kartına ait (bkz. SwipeCard
  // > NewMemberBadge) — swipe kararına giren bir sinyal, kart açıkken ya da
  // karşındaki kişiyi zaten beğenmişken / yazışırken taşıdığı bir bilgi yok.

  /**
   * ŞERİDİN GÖRÜNÜRLÜĞÜ TEK ŞEYE BAĞLI: kartın açıklık oranı. Zemin de başlık
   * satırı da bunu okuyor — ikisi tek katman gibi gelip gidiyor.
   *
   * ESKİDEN İKİ AYRI SÜRÜCÜ VARDI: zemin eşiğe yaklaşırken açılıyordu
   * (interpolate + FADE_RANGE), başlık ise eşik geçilince 450ms'lik kendi
   * devriyle beliriyordu (iOS'un large-title devri) — çünkü aynı isim bir de
   * kartın panelinde büyük puntoyla duruyordu ve şerit onu DEVRALIYORDU. O blok
   * kaldırıldı (bkz. SwipeCard > "BAŞLIK BLOĞU BURADA YOK"): devredilecek bir
   * başlık yok, dolayısıyla eşik (`triggerY`), eşiğin ölçümü ve iki ayrı fade
   * de yok.
   *
   * Köşelerdeki cam butonlar bu style'ı TAŞIMIYOR (kardeş, çocuk değil) ama
   * aynı oranı okuyor — bkz. chromeRevealStyle.
   */
  const revealStyle = useAnimatedStyle(() => ({
    opacity: progress ? Math.max(0, Math.min(1, progress.value)) : 1,
  }));

  /**
   * BANDIN ZEMİNİ — İKİ BAĞLAMDA DA HEP AÇIK.
   *
   * Keşif'te bant kartın üst chrome'unun tek yüzeyi: devirden ÖNCE de orada,
   * çünkü yüzen cam butonlar (geri al / filtre) onun üstünde duruyor ve çıplak
   * bir fotoğrafın üstünde okunmaları gerekiyor. Devirde değişen şey bandın
   * kendisi değil İÇERİĞİ — butonlar gidiyor, isim + Fire geliyor (istek).
   *
   * Kapağın tepesindeki fotoğrafa yapışık rampa tam bu yüzden kaldırıldı (bkz.
   * SwipeCard): üstteki blur'u iki katman birden taşıyordu.
   *
   * ÖNİZLEMEDE de sabit: `alwaysOpen` dalı bir dönem `progress`e bağlıydı ve
   * kartı aşağı çekip kapatmaya başlayınca sönüyordu — kaldırıldı (bkz.
   * `progress` prop'unun notu). Sheet'ler prop'u hiç vermediği için bu ifade
   * fiilen 1'e sabit; `alwaysOpen && progress` kapısı yine de DURUYOR, çünkü
   * sönme geri istenirse tek yerden dönmesi gereken şey o.
   */
  const bandRevealStyle = useAnimatedStyle(() => ({
    opacity:
      alwaysOpen && progress ? Math.max(0, Math.min(1, progress.value)) : 1,
  }));

  /**
   * KÖŞE BUTONLARININ (sol "kapat", sağ "üç nokta") çıkışı. Şeridin geri
   * kalanıyla AYNI oran ama ayrı bir style: butonlar `revealStyle`ı taşıyan
   * katmanların hiçbirinin çocuğu değil (yerleşim gerekçesi aşağıda,
   * çizildikleri yerde). İkisi TEK style'ı paylaşıyor — ayrı kanal, aynı jestte
   * iki farklı anda sönen iki daire demek olurdu.
   *
   * ⚠️ OPAKLIK CAM YOLUNDA RİSKLİ, bilerek kabul edildi: SwiftUI cam yüzeyi
   * ata zincirinde opacity<1 görürse sistem alt ağacı offscreen birleştiriyor
   * ve efekt o karelerde render EDİLMEYEBİLİYOR. Buton bir dönem bu yüzden
   * opaklık yerine bandın kırpmasının dışına ötelenerek gidiyordu; istenen
   * görüntü o değil — şeridin tamamı tek parça sönmeli.
   *
   * Riski sınırlayan iki şey: (a) kurulum ANI temiz — buton sheet açılırken,
   * oran 1 iken doğuyor, yani cam opaklığı bozulmamış bir zincirde kuruluyor;
   * (b) uç değerler tam 0 ve tam 1, yani camın gerçekten çizilmesi gereken tek
   * durum (şerit açık) hep opaklığı 1 olan durum. Bozulursa geçiş sırasındaki
   * birkaç karede cam halka erken kaybolur — kalıcı ölü cam değil.
   */
  const chromeRevealStyle = useAnimatedStyle(() => ({
    opacity: progress ? Math.max(0, Math.min(1, progress.value)) : 1,
  }));

  /*
   * ── İŞARETİN KENDİ FADE KANALI DA KALDIRILDI ────────────────────────────
   *
   * `activityAnim` + `activityReveal` buradaydı: scroll eşiği geçilince işaret
   * 1 → 0 gidiyor, kart kapanıp scroll 0'a dönünce geri geliyordu. Kanalın tek
   * müşterisi Keşif'ti (önizleme `scrollY` vermiyor → sabit 1) ve işaret o
   * şeritten çıktı; gerekçesi dosyanın başında, eşiğin kaldırıldığı yerde.
   *
   * Satırın KAYMASI daha önce kaldırılmıştı (activityShift + previewTitleShift):
   * ortalanmış satırda işaret giderken ismi tek başına ortalamak içindi —
   * işaretin ya hep görünür ya hiç çizilmediği bu düzende böyle bir telafi
   * gerekmiyor.
   */

  // Maske — üstte opak, aşağı doğru şeffafa çözülür. Düz iki duraklı gradient
  // uçta görünür bir kesim bırakıyor; easeGradient çok duraklı bezier rampayla
  // eritiyor (bkz. ScreenHeader'daki aynı blok).
  const { colors: maskColors, locations: maskLocations } = useMemo(
    () =>
      easeGradient({
        colorStops: {
          0: { color: "rgba(0,0,0,0.99)" },
          0.5: { color: "black" },
          1: { color: "transparent" },
        },
      }),
    [],
  );

  return (
    // Şerit dekoratif: altındaki içerik (ve Keşif'te üstündeki cam Fire
    // butonu) dokunmayı almaya devam etmeli. `box-none` bu yüzden — kabuk kendi
    // dokunmayı yakalamıyor ama İÇİNDEKİ tek gerçek kontrol (önizlemedeki cam
    // "üç nokta") yakalayabiliyor. Kalan katmanlar tek tek `none`: aksi halde
    // tam ekran blur katmanı ya da isim satırı, kartın üst şeridindeki jestleri
    // (bölüm fotoğraflarında pinch, scroll) yutardı.
    <View
      pointerEvents="box-none"
      style={{
        position: "absolute",
        top: 0,
        left: 0,
        right: 0,
        height: bandHeight + topInset,
        // Kendi kırpması var: sheet'te bant kartın DIŞINDA çiziliyor, kartın
        // yuvarlak köşesini oradan devralmazsa üst köşelerde backdrop'un
        // üstüne taşar.
        overflow: "hidden",
        borderTopLeftRadius: radius,
        borderTopRightRadius: radius,
        // `continuous` ŞART, yarıçapı devralmak yetmiyor: RN'in varsayılanı
        // `circular` ve kartın kabuğu squircle çiziyor (bkz. SwipeCard). Aynı
        // sayıda bile iki eğri kenar boyunca birbirini kesiyor, bandın camı
        // köşede kabuğun dışına taşıp ince bir dilim bırakıyor.
        borderCurve: "continuous",
      }}
    >
      <Animated.View
        pointerEvents="none"
        style={[StyleSheet.absoluteFill, bandRevealStyle]}
      >
        <MaskedView
          style={StyleSheet.absoluteFill}
          maskElement={
            <LinearGradient
              colors={maskColors as any}
              locations={maskLocations as any}
              style={StyleSheet.absoluteFill}
            />
          }
        >
          {/* ── BANDIN MALZEMESİ — TEK REÇETE, İKİ BAĞLAM ───────────────────
              KAPAĞIN DİBİNDEKİ RAMPANIN AYNISI: perde 0.42 → 0.10, blur 22 ve
              "dark". Sayılar SwipeCard'daki dip bandıyla birebir; ayrışırlarsa
              kartın iki ucu farklı yoğunlukta bulanıklaşıyor.

              ÖNİZLEME (Beğeniler / Sohbet / Profil) DE BUNU OKUYOR (istek —
              "header'daki progressive kısım Keşif'teki header'la aynı olsun").
              Orada bir dönem uygulamanın CHROME reçetesi vardı (veil perdesi +
              `chromeBlurTint()` + blur 15) ve gerekçesi "bant panelin (surface3)
              üstünde, yani chrome'un parçası"ydı. Pratikte doğru değildi: kartın
              tepesinde kapak fotoğrafı ve onun bulanık zemini (CardGlassBackdrop)
              duruyor, yani bant iki bağlamda da bir FOTOĞRAFIN üstünde. Ayrı
              reçete, aynı kartı iki ekrandan açınca farklı yoğunlukta bir şerit
              demekti — açık temada veil yolu belirgin şekilde daha açık ve daha
              az bulanıktı.

              BANDIN BOYU YİNE AYRI ve öyle kalmalı: Keşif'te bant ekranın 0'ından
              başlıyor (durum çubuğunun arkasını da o örtüyor, satır `titleTop` =
              safe-area'da), önizlemede kart zaten safe-area'nın altında doğuyor
              ve satır bandın 16'sında. Maske bandın kendi yüksekliğine göre
              normalize olduğu için rampa iki yerde aynı ORANDA ama farklı
              uzunlukta iniyor — eşitlenecek şey malzeme, kapsam değil. */}
          <LinearGradient
            colors={[scrimAt(0.42), scrimAt(0.1)]}
            style={StyleSheet.absoluteFill}
          />
          <BlurView intensity={22} tint="dark" style={StyleSheet.absoluteFill} />
        </MaskedView>
      </Animated.View>

      {/* BANDIN ÜSTÜNDEKİ HER ŞEY TEK KAPIDA (bkz. `bandOnly`): destenin
          altındaki kart yalnız gölgeyi taşıyor, satırı ve cam butonları
          taşımıyor. Bant yukarıda KOŞULSUZ çiziliyor — kapı buranın içine
          konsaydı bayrak dönerken bandın host view'ı da yeniden kurulur ve
          gölge yine sonradan düşerdi. */}
      {!bandOnly && (
        <>
      {/* KEŞİF'İN SOL UCU: cam "yukarı ok" — içeriği başa sarar (bkz.
          `onScrollTop`). Önizlemenin "kapat"ıyla (aşağıda) aynı kurallar:
          başlık satırının DIŞINDA, kendi style'ıyla sönüyor, dikeyde kabuk
          satırdan yüksek olduğu için MERKEZLER çakışıyor. */}
      {!alwaysOpen && onScrollTop && (
        <Animated.View
          style={[
            {
              position: "absolute",
              // TELAFİ YOK: satır zaten butonun çapında (bkz. rowHeight) ve
              // ikisi aynı `top`tan başlıyor. Buton bu sayede ekranın üstündeki
              // yüzen geri al/filtre ile de tam aynı yerde — devirde yer
              // değiştirmiyor, yalnız içerik değişiyor.
              top: rowTop + topInset,
              left: CHROME_EDGE_INSET,
              width: DISCOVER_GLASS_BUTTON_SIZE,
              height: DISCOVER_GLASS_BUTTON_SIZE,
            },
            chromeRevealStyle,
          ]}
        >
          <CardScrollTopGlassButton
            onPress={onScrollTop}
            label={t("profile.card.scrollTop")}
            size={DISCOVER_GLASS_BUTTON_SIZE}
          />
        </Animated.View>
      )}

      {/* Cam "kapat" (çarpı) — şeridin SOL ucunda, sağdaki üç noktanın
          simetriği. Başlık satırının DIŞINDA: satır kendi payıyla konumlanıyor,
          buton kabuğun köşesiyle. Görünürlüğü satırla AYNI orandan ama kendi
          style'ıyla geliyor (chromeRevealStyle). */}
      {alwaysOpen && onClose && (
        <Animated.View
          style={[
            {
              position: "absolute",
              // Kabuk başlık satırından 4pt yüksek: kutular değil MERKEZLER
              // çakışsın.
              top: rowTop - CHROME_CENTER_FIX + topInset,
              // Yatayda merkez değil KENAR hizalanıyor: kabuğun sol kenarı
              // kartın içerik çizgisinde (bkz. PREVIEW_SIDE_INSET).
              left: edgeInset,
              width: CARD_MENU_GLASS_SIZE,
              height: CARD_MENU_GLASS_SIZE,
            },
            chromeRevealStyle,
          ]}
        >
          {/* `onMedia`: glif iki temada da BEYAZ — gerekçe aşağıda, sağ
              köşenin yanında (iki uç ayrışamaz). */}
          <CardCloseGlassButton
            onPress={onClose}
            label={t("common.close")}
            onMedia
          />
        </Animated.View>
      )}

      {/* ŞERİDİN SAĞ UCU — üç nokta YA DA kalem, aynı köşe ve aynı kabuk
          (bkz. `rightAction`). Kurallar soldaki "kapat"la birebir aynı: başlık
          satırının DIŞINDA, kendi style'ıyla sönüyor, dikeyde MERKEZLER
          çakışıyor. */}
      {rightAction && (
        <Animated.View
          style={[
            {
              position: "absolute",
              top: rowTop - CHROME_CENTER_FIX + topInset,
              right: edgeInset,
              width: CARD_MENU_GLASS_SIZE,
              height: CARD_MENU_GLASS_SIZE,
            },
            chromeRevealStyle,
          ]}
        >
          {/* ── GLİF İKİ TEMADA DA BEYAZ (`onMedia`) ──────────────────────
              Şeridin BAŞLIK YAZISIYLA aynı kural (bkz. satırın `theme.onMedia`
              notu): bandın malzemesi iki temada da kapağın KOYU rampası (scrim
              0.42→0.10 + `tint="dark"` blur) ve altında kapak fotoğrafı var,
              yani buradaki mürekkep modla dönmemeli. Eskiden `theme.text`ti ve
              açık modda aynı bandın üstünde isim beyaz, iki köşedeki glif
              SİYAH çiziliyordu.

              Sol köşedeki "kapat" da aynı bayrağı alıyor — şeridin iki ucu
              ayrışamaz.

              iOS 26 ALTINDA KENDİLİĞİNDEN SİYAHA DÜŞÜYOR ve düşmesi doğru:
              `glassOnMediaInk()` orada `theme.text` veriyor, çünkü fallback
              zemini butonun KENDİ açık tonlu blur'u (GlassFallbackSurface >
              chromeBlurTint) — beyaz glif o dairenin içinde kaybolurdu. */}
          {rightAction === "menu" ? (
            <CardMenuGlassButton
              onPress={onMenu!}
              label={t("common.menu")}
              onMedia
            />
          ) : (
            // Etiket profil ekranındaki butonun metniyle AYNI ("Profili
            // Düzenle"): buton onun kısayolu, VoiceOver'da başka bir ad okumak
            // iki ayrı aksiyon gibi duyulur.
            <CardEditGlassButton
              onPress={onEdit!}
              label={t("profile.edit.button")}
              onMedia
            />
          )}
        </Animated.View>
      )}

      {/* ── ŞERİDİN BAŞLIK SATIRI — TEK DAL, İKİ BAĞLAM ────────────────────
          İsim + yaş ve premium/foto rozetleri; başka hiçbir şey. Aktiflik
          işareti bir dönem önizlemede buraya katılıyordu, kaldırıldı (gerekçe
          yukarıda).

          Önizlemede iki köşede de aynı çapta cam bir daire var: solda "kapat",
          sağda üç nokta ya da kalem (bkz. `rightAction`). Satır simetrik payla
          ortalanınca isim iki dairenin tam ortasında bir başlık gibi okunuyor.

          SATIRIN GENİŞLİĞİ İSMİN KENDİSİ — İKİ BAĞLAMDA DA: aktiflik işareti
          hiçbir yerde çizilmediği için isim gerçekten iki cam butonun ortasında
          duruyor. İşaret Keşif şeridindeyken — hatta scroll'la SÖNMÜŞKEN bile, çünkü opaklık layout'tan
          çıkarmıyor — isim onun genişliği kadar sola kayıyordu (istek: "yine
          ortalansın"). Aynı sorun bir dönem elle düzeltiliyordu (activityShift);
          telafi de, telafiyi gerektiren işaret de artık yok.

          YAN PAYLAR BAĞLAMA GÖRE: Keşif'te sol `edgeInset` (Fire butonunun köşe
          boşluğu) + sağ TITLE_SIDE_INSET; önizlemede iki yanda da tek sayı
          (PREVIEW_TITLE_INSET_WITH_CHROME) — gerekçesi orada.

          RENK `theme.onMedia` — İKİ BAĞLAMDA DA, yani Keşif'te ne ise
          önizlemede o. Eskiden `theme.text`ti ve açık modda SİYAH çiziliyordu;
          bandın malzemesi ise iki yerde de kapağın KOYU rampası (yukarıdaki
          scrim 0.42→0.10 + `tint="dark"` blur), yani yazı modla dönmemeli.
          Kapaktaki isim satırı (SwipeCard) başından beri `onMedia` — şerit devri
          olunca aynı yazı aynı yerde renk değiştiriyordu, artık değiştirmiyor.
          Satırın diğer üyeleri (premium işareti, foto doğrulama) zaten modla
          dönmeyen marka/semantik tonlarında. */}
      <Animated.View
        pointerEvents="none"
        style={[
          {
            position: "absolute",
            top: rowTop + topInset,
            // İKİ BAĞLAMDA DA İKİ YANDA AYNI PAY → satır gerçekten ortalı
            // kalıyor. Keşif'te sol uçta yukarı ok, sağ uçta Fire var; pay
            // ikisinin de kabuk çapı + nefes kadar (TITLE_SIDE_INSET).
            // Önizlemede aynı iş PREVIEW_TITLE_INSET_WITH_CHROME'da.
            left: alwaysOpen
              ? hasPreviewChrome
                ? PREVIEW_TITLE_INSET_WITH_CHROME
                : PREVIEW_TITLE_INSET_PLAIN
              : TITLE_SIDE_INSET,
            right: alwaysOpen
              ? hasPreviewChrome
                ? PREVIEW_TITLE_INSET_WITH_CHROME
                : PREVIEW_TITLE_INSET_PLAIN
              : TITLE_SIDE_INSET,
            height: rowHeight,
            flexDirection: "row",
            alignItems: "center",
            // ORTALI, İKİ BAĞLAMDA DA (istek: "isim, yaş ortada"). Keşif'te bir
            // dönem sola yaslıydı — o zaman sol köşede buton yoktu ve isim
            // köşeye taşınmıştı.
            justifyContent: "center",
            gap: 6,
          },
          revealStyle,
        ]}
      >
        {/* Punto/satır TITLE_FONT + TITLE_LINE'dan; gerekçesi orada.

            `numberOfLines={1}`: uzun isim sağdaki cam butonun altına girmek
            yerine "…" ile kırpılır (bkz. TITLE_SIDE_INSET). */}
        <Text
          numberOfLines={1}
          style={{
            flexShrink: 1,
            color: theme.onMedia,
            fontSize: TITLE_FONT,
            lineHeight: TITLE_LINE,
            fontWeight: "700",
          }}
        >
          {profile?.displayName}
          {ageSuffix}
        </Text>
        {/* İşaret isimle ORANLI kalmak zorunda — oranı elle tutmuyoruz,
            `PremiumBadge` puntodan çıkarıyor. */}
        {profile?.isPremium && <PremiumBadge fontSize={TITLE_FONT} />}
        {/* Foto doğrulama rozeti — premium'dan AYRI işaret, `isVerified`e
            katılmıyor. Alan gelmezse hiçbir şey çizilmiyor. */}
        <SelfieVerifiedBadge
          verified={profile?.isSelfieVerified}
          size={selfieBadgeSize(TITLE_FONT)}
        />
        {/* AKTİFLİK İŞARETİ BURADAN KALKTI (istek) — gerekçe yukarıda,
            bayrağın kaldırıldığı yerde. */}
      </Animated.View>
        </>
      )}
    </View>
  );
}
