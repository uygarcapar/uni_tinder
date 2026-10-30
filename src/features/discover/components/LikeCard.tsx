/**
 * Beğeni/not kartı — fotoğraf kartı, kimlik bloğu ve NOT KUTUSU.
 *
 * 2026-10-10'da LikesScreen'den BURAYA taşındı; tek sebebi ikinci bir çağıran:
 * İKİNCİ ÇAĞIRAN İÇİN ÇIKARILMIŞTI (akışın gelen yanıtları, FeedReplyCard) ve
 * o çağıran 2026-10-15'te üründen çıktı — kart yine LikesScreen'in tek
 * kullanıcısına döndü. Dosya YERİNDE BIRAKILDI: ekranın kendi işleri (iskelet,
 * tazeleme, liste layout'u) ile kartın çizimi ayrı kalınca ikisi de okunur,
 * geri taşımak 2000 satırlık ekranı yeniden şişirmek olurdu.
 *
 * TAŞIMA SIRASINDA DAVRANIŞ DEĞİŞMEDİ: kod olduğu gibi geldi, LikesScreen'de
 * kalan tek şey ekranın kendi işleri (iskelet listesi, tazeleme süreleri,
 * liste layout geçişi). Kartın ölçüleri (CARD_WIDTH/CARD_HEIGHT/CARD_ROW_GAP)
 * ve `isUnlockedLike` dışa açıldı; ekran onları buradan okuyor.
 *
 * ⚠️ Buraya EKRANA ait hiçbir şey eklenmesin (sorgu, mutasyon, navigasyon):
 * kart prop alıyor, karar vermiyor. `onX` prop'larının hepsi KARTI parametre
 * alıyor — gerekçesi LikeCard'ın başındaki notta.
 */
import { memo, useCallback, useEffect, useRef, useState } from "react";
import { useTranslation } from "react-i18next";
import {
  Dimensions,
  Platform,
  ScrollView,
  StyleSheet,
  Text,
  TouchableOpacity,
  View,
} from "react-native";
import { Image } from "expo-image";
import { LinearGradient } from "expo-linear-gradient";
import { BlurView } from "expo-blur";
import MaskedView from "@react-native-masked-view/masked-view";
import { DEFAULT_APP_MODE, modeAccent, modeFireTint } from "../modeTheme";
import { easeGradient } from "react-native-easing-gradient";
import Animated, {
  Easing,
  useAnimatedStyle,
  useSharedValue,
  withTiming,
} from "react-native-reanimated";
import { GlassView } from "expo-glass-effect";
import {
  Check,
  ChevronDown,
  GraduationCap,
  MessageCircle,
  Search,
  X,
} from "@/shared/icons";
import SFIcon from "@/shared/components/SFIcon";
import FireGlyph from "@/shared/components/FireGlyph";
import AnimatedPressable from "@/shared/components/AnimatedPressable";
import SkeletonBox from "@/shared/components/SkeletonBox";
import PremiumBadge from "@/shared/components/PremiumBadge";
import SelfieVerifiedBadge, {
  selfieBadgeSize,
} from "@/features/profile/components/SelfieVerifiedBadge";
import RecoverGlassButton, {
  RECOVER_GLASS_GLYPH_SIZE,
  RECOVER_GLASS_SIZE,
} from "@/features/discover/components/RecoverGlassButton";
import CardActionGlassButton from "@/features/discover/components/CardActionGlassButton";
import { CARD_CHROME_FALLBACK_ICON_SIZE } from "@/features/discover/components/CardChromeGlassButton";
import {
  colors,
  darkColors,
  ink,
  isLight,
  onMediaAt,
  scrimAt,
  veilSurface,
} from "@/shared/theme/colors";
import { chromeBlurTint } from "@/shared/theme/blur";
import {
  glassColorScheme,
  hasLiquidGlassSurface,
  GLASS_ICON_BUTTON,
  HAS_LIQUID_GLASS,
} from "@/shared/theme/glass";

const { width } = Dimensions.get("window");
// Tek sütun: kart listenin TAM genişliğini kaplar. Aksiyon kolonu kartın
// ALTINDA duruyor ve kart sağdan sola çekilince ortaya çıkıyor (bkz.
// LikeCard'daki reveal jesti) — sürekli görünür bir kolon kartın genişliğini
// yiyordu ve dört glif kartla yarışıyordu.
// Kartlar ekranın kenarına yakın duruyor: aksiyon kolonu kartın ALTINDA
// olduğundan yan pay artık hiçbir şeye yer ayırmıyor, sadece kabuk payı.
// Daha geniş bir pay kartı ekranın ortasına doğru çekip fotoğrafı küçültüyordu.
export const LIST_H_PADDING = 10;
// Kartlar arası nefes — kartın kendi yüksekliği arttıkça büyük bir aralık
// listeyi seyreltiyor, kaydırırken bir sonraki kartın ucu geç görünüyordu.
export const CARD_ROW_GAP = 10;
export const CARD_WIDTH = width - LIST_H_PADDING * 2;
// Yükseklik SABİT ORANLA genişlikten türetilmiyor. Düz oranda geniş cihazda
// kart hem enine hem boyuna büyüyor, dar cihazda ikisi birden küçülüyordu:
// aynı kart Pro Max'te devasa, SE'de bodur okunuyordu. Genişliğin yüksekliğe
// etkisi WIDTH_INFLUENCE kadar SÖNÜMLENİYOR — kart hâlâ cihaza göre nefes
// alıyor ama piksel farkını birebir yutmuyor.
const CARD_BASE_WIDTH = 390 - LIST_H_PADDING * 2; // referans gövde (iPhone 14/15)
const WIDTH_INFLUENCE = 0.45;
const CARD_METRIC_WIDTH =
  CARD_BASE_WIDTH + (CARD_WIDTH - CARD_BASE_WIDTH) * WIDTH_INFLUENCE;
// Oran bir tık daha uzadı — kart yayvanlaşmasın, fotoğraf portre okunsun.
export const CARD_HEIGHT = Math.round(CARD_METRIC_WIDTH * 1.24); // Aspect ratio

// Kilitli kartın kimlik perdesi — İKİ katman, ikisi de tek başına yetmiyor.
// Gerekçesi bildirimlerdeki kilitli avatarla AYNI (NotificationsScreen'de uzun
// hâli var), burada kartın ölçeği yüzünden daha da kritik:
// - BlurView ekrana ÇİZİLEN piksellere uygulanıyor, yani kaynak çözünürlüğünden
//   bağımsız — ama iOS'ta tek bir UIVisualEffectView'ın yarıçapı sınırlı ve
//   Android'de `blurMethod` varsayılanı 'none' olduğu için orada zaten sadece
//   yarı saydam bir katman.
// - expo-image'in `blurRadius`'ü iOS'ta TAM çözünürlükteki fotoğrafa (downscale
//   ÖNCESİ) uygulanıyor, o yüzden sayı kartta göründüğünden büyük olmalı;
//   Android'de ise Glide blur'u view boyutunda çalıştığı için gerçek blur'u
//   TEK BAŞINA bu taşıyor.
// Kart 58pt'lik avatarın aksine neredeyse ekran genişliğinde: yüz hatları,
// saç/ten rengi ve arka plan bu ölçekte tek katmanla okunuyordu, yani free
// kullanıcı paywall'a hiç girmeden kimin beğendiğini çıkarabiliyordu.
//
// ⚠️ İki düğme AYNI ŞEYİ yapmıyor, karıştırılırsa ayar hep yanlış yerden
// çevrilir:
// - `blurRadius` SADECE bulanıklaştırır, kartı karartmaz. Kimliği gizleme işini
//   asıl bu yapıyor, o yüzden yüksek.
// - `intensity` hem bulanıklaştırır hem malzemenin tint'ini (burada KOYU)
//   bastırır — yani yükselttikçe kart KARARIR. Tavanda: kilitli kart bilerek
//   koyu bir pul, altındaki fotoğraf sadece bir doku olarak seziliyor.
// Daha bulanık isteniyorsa: RADIUS (ya da LAYERS). Daha koyu isteniyorsa:
// INTENSITY. Ters yönde çevirmek her seferinde diğerini bozar.
const LOCKED_CARD_PHOTO_BLUR_RADIUS = 90;
const LOCKED_CARD_BLUR_INTENSITY = 100;
// Katmanlar KARDEŞ (iç içe DEĞİL — UIVisualEffectView'ı bir başkasının içine
// koymak desteklenmiyor): her katman altında çizilmiş olan her şeyi, yani bir
// öncekinin ÇIKTISINI da bulanıklaştırıyor. Böylece yarıçap tek bir
// UIVisualEffectView'ın tavanının ötesine geçiyor — üstelik intensity'yi
// yükseltmeden, yani kartı KARARTMADAN. Sayı büyüdükçe kart başına o kadar
// native efekt görünümü çizilir (liste boyunca), o yüzden 2.
const LOCKED_CARD_BLUR_LAYERS = 2;
// ⚠️ AÇIK MOD aynı ayarla kurulamıyor — sistem malzemelerinin ağırlığı simetrik
// DEĞİL: koyu chrome ~%75 siyah, açık chrome ~%97 beyaz (expo-blur'un tint
// tablosu). Tek katmanda fark küçük; İKİ katman üst üste binince koyu tarafta
// fotoğrafın rengi hâlâ sızıyor (kalan ~%6, kart "bulanık fotoğraf" gibi
// okunuyor), açık tarafta hiçbir şey kalmıyordu — kart bulanık bir fotoğraf
// değil, boş beyaz bir kâğıt gibi görünüyordu.
// Çözüm intensity'yi kısmak DEĞİL, MALZEMEYİ inceltmek: açık modda bir kademe
// ince cam (systemThinMaterial*, ~%78) → iki modun perde ağırlığı eşitleniyor
// (%78'e %75).
// Intensity ise PLATFORMA göre ayrılıyor ve bu ayrım keyfi değil:
// - iOS'ta 100 KALIYOR. Malzemeler tint'in ağırlığında ayrışıyor, blur
//   yarıçapında değil; yani perde inceliyor ama kimliği gizleyen bulanıklık
//   aynı. Burada intensity düşürmek malzemeyi değil EFEKTİ zayıflatırdı —
//   beyazlıkla birlikte bulanıklığı da alır, kimlik açığa çıkardı.
// - Android'de BlurView zaten bulanıklaştırmıyor (blurMethod 'none'), yalnızca
//   yarı saydam bir pul; orada inceltmenin TEK yolu intensity. Bulanıklığı
//   `blurRadius` (Glide) taşıdığı için kimlik riski yok.
const LOCKED_CARD_BLUR_INTENSITY_LIGHT = Platform.OS === "ios" ? 100 : 60;
/**
 * Kilitli kartın perde malzemesi. Koyu mod `chromeBlurTint()` ile AYNI kalıyor
 * (kartın not kutusu da oradan besleniyor, tek kartta iki cam olmasın); açık
 * modda bir kademe incesine düşüyor.
 * ⚠️ `isLight()` RENDER SIRASINDA okunmalı — modül seviyesinde sabitlenirse
 * tema değişince bayat kalır (bkz. theme/colors.ts).
 */
// AÇIK MODDA EN İNCE malzeme (2026-09-12): bir kademe ince (thin, ~%78 beyaz)
// de yetmedi — iki katman üst üste ~%95 beyaz tül oluyor, fotoğrafın rengi
// gidiyor, üstüne binen siyah perde de o sütlü beyazı DÜZ GRİYE çeviriyordu.
// Kart "bulanık fotoğraf" değil "gri levha" okunuyordu. Ultra-thin tülü en aza
// indiriyor, fotoğrafın kendi tonları geçiyor; bulanıklık yarıçapı malzemeden
// bağımsız olduğu için (bkz. theme/blur.ts) kimlik perdesi aynı kalıyor —
// gizleme işi zaten `blurRadius`ta.
const lockedVeilTint = () =>
  isLight() ? ("systemUltraThinMaterialLight" as const) : chromeBlurTint();
// Açık modun KARARTMA düğmesi — malzemede böyle bir düğme YOK: koyu modda
// intensity kartı karartıyor (malzeme siyah), açık modda ise BEYAZLATIYOR
// (malzeme beyaz). Yani "biraz daha koyu olsun" isteği açık tarafta camın
// ayarlarından çıkmıyor; camın ÜSTÜNE ince bir siyah perde gerekiyor.
// Blur'un ÜSTÜNDE duruyor, altında değil: altta kalsaydı iki katman onu da
// bulanıklaştırıp yutardı, perde ancak katmanlar bittikten sonra iş görüyor.
// Kimliği gizlemeye katkısı YOK (o hâlâ blurRadius'ün işi) — bu sayı sadece
// kartın ne kadar koyu okunduğunu ayarlıyor.
// ⚠️ Yükseltirken placeholder kutuları unutulmamalı: açık modda kutular AÇIK
// (yüzey grisi, bkz. barFill) — perde koyulaştıkça bu sefer kutular fotoğraftan
// AYRIŞIYOR ama kart genel olarak kirleniyor; kutuların okunurluğu artık
// perdeye bağlı değil, zeminleri opak.
// 0.2 → 0.1 (2026-09-12): malzeme ultra-thin'e inince fotoğrafın rengi geri
// geldi; 0.2 o rengi yine griye boğuyordu.
const LOCKED_CARD_VEIL_SCRIM_LIGHT = 0.1;

// ── Kilitli kartın İPUCU satırı (bkz. likerCardTeaser) ──────────────────────
// Bumble'ın "Liked You" kartı: bulanık fotoğraf + isim yerinde gri bar + foto
// doğrulama rozeti + üniversite pili + "ne arıyor" pili. Kimlik hâlâ perdenin
// altında, ama kart artık "yükleniyor" değil "kapalı ve içinde biri var"
// okunuyor — paywall'a giden merak buradan geliyor.
//
// Piller açık kartın hobi pillerinden (SwipeCard) bir kademe küçük: kart
// listede yarım boy, tam boy pil perdeyi kaplıyordu.
// Dolgu MODA GÖRE İKİ AYRI AİLEDEN (bkz. teaserFill): koyu modda `boxInk`
// (beyaz alfa, perdenin tersi), açık modda sayfanın yüzey grisi
// (`colors.surface`). Açık tarafta "perdenin tersi" kuralı zemin yerine YAZI
// rengiyle sağlanıyor — koyu alfa zemin barı ve pilleri kartın en ağır öğesi
// yapıyordu.
const LOCKED_TEASER_PILL_HEIGHT = 30;
const LOCKED_TEASER_PILL_PAD_H = 10;
const LOCKED_TEASER_PILL_GAP = 8;
const LOCKED_TEASER_ICON_SIZE = 13;
const LOCKED_TEASER_TEXT_SIZE = 13;
// İsim barı ile pil satırı arası.
const LOCKED_TEASER_ROW_GAP = 12;
const LOCKED_TEASER_FILL_ALPHA = 0.16;
// Açık modda pil yazısı: bar gibi tam siyah değil, bir tık yumuşak.
const LOCKED_TEASER_INK_ALPHA_LIGHT = 0.85;

/**
 * Kart fotoğrafının ALT BANDINDAKİ okunabilirlik perdesi — isim/üniversite
 * satırı ve not kutusu bunun üstünde duruyor. İki durak: tepede neredeyse yok,
 * dipte `mediaScrimSoft` (rgba(0,0,0,0.45)) ile aynı değer.
 *
 * AÇIK MODDA bir tık daha koyu (`*_LIGHT_BOOST`). Perde foto üstü olduğu için
 * modla DÖNMÜYOR (bkz. theme/blur.ts kuralı) — burada dönen şey polarite değil,
 * yalnızca kalınlık: açık temada ekranın geri kalanı beyaz olduğu için göz
 * fotoğrafı daha parlak okuyor ve aynı perde altındaki yazıyı taşımıyordu.
 *
 * KOYU MODDA DEĞER DEĞİŞMEDİ: boost 0, yani iki durak eskisiyle birebir aynı.
 */
const CARD_PHOTO_SCRIM_TOP = 0.1;
const CARD_PHOTO_SCRIM_BOTTOM = 0.45;
const CARD_PHOTO_SCRIM_LIGHT_BOOST = 0.08;

/** ⚠️ RENDER SIRASINDA çağır — `isLight()` modül seviyesinde sabitlenemez. */
const cardPhotoScrim = (alpha: number): string =>
  scrimAt(alpha + (isLight() ? CARD_PHOTO_SCRIM_LIGHT_BOOST : 0));

// ── Sekme geçişi ────────────────────────────────────────────────────────────
// Geçiş artık ELLE YAZILMIYOR: sekmeler bir PagerView ve kayma native olarak
// oluyor. Önce tek bir liste vardı ve geçiş "eski içeriği ötele → veriyi takas
// et → yeniyi ötele" diye üç adımda taklit ediliyordu; iki içerik aynı anda
// çizilemediği için arada eski sekmenin ekranda kaldığı bir pencere vardı ve
// boş bir sekmeden çıkarken bu "yeni sekme boş geldi" gibi okunuyordu.

// Sağ üst köşedeki cam butonun kart kenarına payı. Köşede BAŞKA HİÇBİR ŞEY yok:
// not balonu / fire kalbi rozetleri buradan kaldırıldı (gerekçe LikeCard'da).
//
// 12 → 6 (istek: "daha çok sağ üstte olsun"). Tavan kartın köşe yarıçapından
// (40) geliyor: daire kabuk diyagonalde kavisin içine girmeye başladığı yerde
// kesilmiş görünür, o eşik ~1pt — yani 6 hem belirgin biçimde köşeye yakın hem
// kavisten uzak. Sıfıra indirmek kabuğu kartın kenarına yapıştırır.
const CARD_TOP_RIGHT_INSET = 6;
// Köşedeki cam butonun ÇAPI — kurtar ve beğen TEK ölçüden besleniyor: ikisi
// aynı köşenin sekmeye göre değişen iki hâli, ayrı sayılara bağlansalardı sekme
// değiştirince köşe büyüyüp küçülüyormuş gibi okunurdu.
// ⚠️ Sayı SABİT DEĞİL: camsız yolda (iOS 26 altı + Android) bir kademe
// küçülüyor, çünkü orada kabuk düz ve opak bir disk. Gerekçe
// RECOVER_GLASS_SIZE'ın yanında — buradaki sabitler oradan türer, elle sayı
// yazma.
const CARD_CORNER_GLASS_SIZE = RECOVER_GLASS_SIZE;
// Köşedeki tik/X'in ÇİZİLEN puntosu (istek, 2026-10-27: Keşif'teki tik/X ile
// aynı irilik, o da kaydırınca şeritte beliren tikin puntosunda). Kaynağı
// Keşif'in kart chrome'u: camlı yolda ortak cam ikon butonunun sayısı
// (GLASS_ICON_BUTTON.icon = 17), camsız yolda onun fallback puntosu — elle sayı
// yazmak aynı işareti iki ekranda sessizce ayrıştırıyor.
//
// Eskiden kurtarma butonunun glifiyle (RECOVER_GLASS_GLYPH_SIZE, 28/21) aynıydı
// ve köşe ikilisi Keşif'tekinden belirgin iriydi.
const CARD_CORNER_GLYPH_SIZE = HAS_LIQUID_GLASS
  ? GLASS_ICON_BUTTON.icon
  : CARD_CHROME_FALLBACK_ICON_SIZE;
// ⚠️ KUTU, ÇİZİLEN İŞARET DEĞİL (bkz. CardActionGlassButton > `glyphBoxSize`):
// camlı yolda çemberin ÇAPINI `frame` değil glifin kutusu belirliyor, yani bu
// sayı küçülürse köşedeki DAİRE de küçülür. Bu yüzden işaret küçülürken kutu
// kurtarma butonunun glifinde kalıyor (istek: "iconunu küçült butonu değil") —
// kurtar/beğen aynı köşenin sekmeye göre değişen iki hâli, çapları ayrışamaz.
//
// `max`: camsız yolda kutu (21) ortak fallback puntosundan (22) küçük kalıyor
// ve işaret kutudan taşardı. Orada kabuk zaten RN kutusundan (48) doğuyor, yani
// kutuyu büyütmek daireye dokunmuyor.
const CARD_CORNER_GLYPH_BOX = Math.max(
  RECOVER_GLASS_GLYPH_SIZE,
  CARD_CORNER_GLYPH_SIZE,
);
// Köşedeki kolonda birden fazla buton varken (akış yanıtında üç: tik, X, üç
// nokta — bkz. `onSkip`/`onMenu`) aralarındaki pay. Kabuk ölçüsünden türüyor:
// butonlar küçüldüğünde boşluk da küçülsün.
//
// 0.12 → 0 → NEGATİF (istek sırası: "alt alta olsun" → "daha yakın" → "hâlâ
// boşluk var" → "butonları büyütme, boşluğu azalt"). Yan yana dizilirken 0.12
// (camlı yolda 9pt) doğru payda: iki buton kartın üst kenarı boyunca
// yayılıyordu. Kolonda aynı sayı butonları birbirinden kopardı.
//
// SIFIRDA DA BOŞLUK KALMASININ SEBEBİ pay değil, KABUĞUN `frame`DEN KÜÇÜK
// ÇİZİLMESİ: cam çember butonun LABEL'ı (glif kutusu) + kontrol payı kadar
// doğuyor, `frame` onu yalnız içine ortalıyor — yani 72'lik Host'ta çemberin
// iki yanında ölü pay var ve komşu butonlarda bu pay TOPLANIYOR. Negatif pay
// tam olarak o ölü payı yiyor: çemberler yaklaşıyor, görünen cam yüzeyler üst
// üste binmiyor.
//
// ⚠️ ÇÖZÜM KABUĞU BÜYÜTMEK DEĞİL. Denendi (`controlSize("extraLarge")`,
// 2026-10-10) ve geri alındı: boşluğu kapatıyor ama butonları görünür şekilde
// büyütüyor, istenen bu değil. Kabuk çapı eski hâlinde.
// ⚠️ YALNIZ CAMLI YOLDA. Fallback düz, opak bir disk ve Host'u TAM dolduruyor
// (RN `TouchableOpacity`, width/height = size): orada ölü pay YOK, negatif pay
// diskleri gerçekten üst üste bindirip kesik bir "8" gibi gösterir.
// ⚠️ Büyütme sınırı: Host'lar bu kadar örtüşürken sonraki buton öncekinin
// çemberinin ALT KENARINDAN birkaç pt'yi kapatıp orada dokunuşu yutabiliyor.
// Daha da yakınlaştırmak gerekirse doğru kol bu sayı değil, kabuk ölçüsünü
// (RECOVER_GLASS_SIZE) çemberin gerçek çapına indirmek — o zaman ölü pay hiç
// doğmaz.
const CARD_CORNER_PAIR_GAP = HAS_LIQUID_GLASS
  ? -Math.round(CARD_CORNER_GLASS_SIZE * 0.28)
  : 0;
// ⚠️ ÜÇ NOKTANIN ÖLÇÜ SABİTLERİ SİLİNDİ, buton kalktığı için (bkz. köşe
// kolonundaki nottaki gerekçe). Geri gelirse kabuk ölçüsü
// CARD_CORNER_GLASS_SIZE (kolondaki diğer ikisiyle aynı daire), glif ise
// Keşif'in üç noktasıyla aynı kaynaktan olmalı — camlı yolda
// `GLASS_ICON_BUTTON.icon`, fallback'te `CARD_CHROME_FALLBACK_ICON_SIZE`;
// elle sayı yazmak iki ekrandaki aynı işareti sessizce ayrıştırıyor.
// Kart başlığı — isim/yaş TEK yerden ölçülüyor: satırın kendisi, blurlu kartın
// yerine geçen kutu ve not kutusunun yükseklik bütçesi (NOTE_IDENTITY_BLOCK)
// hep buna bakar. Premium işaretinin puntosu da buradan türüyor, ayrı sabiti YOK
// (eskiden LIKE_CARD_FLAME_SIZE vardı; bkz. PremiumBadge > premiumBadgeFontSize).
const LIKE_CARD_NAME_SIZE = 22;
const LIKE_CARD_NAME_LINE = 26;
// Üniversite — kimlik bloğunun ikinci satırı. İsimden bir kademe küçük ama
// okunur; aralarındaki boşluk iki satırı ayrı iki bilgi gibi okutuyor (bitişik
// olduklarında tek bir sarkan cümle gibi görünüyorlardı). Yükseklik bütçeleri
// (NOTE_CARD_BLUR_FLOOR / NOTE_IDENTITY_BLOCK) bu üçüne bakıyor.
const LIKE_CARD_UNI_SIZE = 15;
const LIKE_CARD_UNI_LINE = 20;
const LIKE_CARD_UNI_GAP = 5;
// İsim satırının ÜSTÜNDEKİ ürün pill'i (bkz. LikeCard'daki gerekçe). Yazı isim
// ve üniversiteden KÜÇÜK: pill kartın konusu değil, kartın nereden geldiğini
// söyleyen etiket.
// Yazı bir tık büyüdü (12/16 → 13/18): rozet geldikten sonra pill'in kendisi
// bir işaret gibi okunuyor, o ölçüde yazı ufak kalıyordu. Rozet ve kapsül
// yarıçapı buradan türüyor — ikisini elle güncelleme.
const LIKE_CARD_PILL_TEXT_SIZE = 13;
const LIKE_CARD_PILL_TEXT_LINE = 18;
// Dolgu bir tık açıldı (5/10 → 7/14): yazı kapsülün kenarlarına yapışıyordu,
// cam yüzeyde bu daha da belli oluyor. Yükseklik 26 → 32; yarıçap AŞAĞIDA
// türetildiği için elle güncellenmiyor, kapsül kapsül kalıyor.
const LIKE_CARD_PILL_PAD_V = 7;
const LIKE_CARD_PILL_PAD_H = 14;
const LIKE_CARD_PILL_GAP = 8;
/**
 * Kapsül yarıçapı ÖLÇÜDEN türüyor: pill'in yüksekliği sabit olduğu için
 * hesaplanabiliyor, ölçmeye gerek yok. (999 yasağı camlı hâlden kalma bir
 * alışkanlık değil — pill artık düz dolgu, ama sayıyı yükseklikle bağlı tutmak
 * yazı/rozet büyüdüğünde kapsülü kendiliğinden koruyor.)
 */
const LIKE_CARD_PILL_RADIUS =
  (LIKE_CARD_PILL_TEXT_LINE + 2 * LIKE_CARD_PILL_PAD_V) / 2;
// Pill'in solundaki Fire kalbi (FireGlyph) ve yazıya olan payı.
// ⚠️ Kalp yazı satırından BÜYÜK OLAMAZ: pill'in yüksekliğini o an kalp
// belirlerdi ve yukarıdaki yarıçap ölçüden küçük kalırdı (kapsül olmaktan
// çıkardı). Büyütmek gerekirse LIKE_CARD_PILL_TEXT_LINE'ı da büyüt.
const LIKE_CARD_PILL_ICON_SIZE = LIKE_CARD_PILL_TEXT_LINE;
const LIKE_CARD_PILL_ICON_GAP = 6;

// ── Not kutusu ───────────────────────────────────────────────────────────────
// Notun metni + NEYE yazıldığı, kartın alt bloğunda isim/üniversitenin altında.
//
// Hedef fotoğrafı kutunun İÇİNDE, sol sütunda: "not bıraktı" satırının ve
// notun solunda, o İKİSİYLE dikeyde ortalı (chevron satırı ortalamaya girmez,
// yoksa fotoğraf onun boyu kadar yukarı kayıyordu).
const NOTE_THUMB_SIZE = 56;
const NOTE_THUMB_GAP = 12;
const NOTE_BOX_PAD_TOP = 22;
// Alt pay üstten GENİŞ — ama YALNIZ CHEVRON ÇİZİLİRKEN (bkz. LikeNoteBox'taki
// `padBottom`). Kutunun altında yazının yanı sıra chevron da duruyor (mutlak,
// bkz. NOTE_CHEVRON_BOTTOM); eşit paylarda ok yazının dibine yapışıyor ve
// kutunun alt kenarı sıkışık okunuyordu.
// ⚠️ Bu sayı chevron'un ÜSTÜNDEKİ boşluğu da belirliyor: ok akışta olmadığı için
// yazının son satırıyla arasındaki tek şey bu payın chevron'dan artan kısmı
// (pay − CHEVRON_BOTTOM − CHEVRON_SIZE). 30'ken o fark 2px'ti ve ok yazıya
// değiyor gibi duruyordu.
// ⚠️ SIĞAN NOTTA (ok yok) KULLANILMAZ: ok akıştan çıktığı için onun payını
// dolduran başka hiçbir şey yok, kutu 22 üst / 38 alt ile görünür biçimde alta
// ağır basıyordu. Sığan notta alt pay üstle EŞİT.
const NOTE_BOX_PAD_BOTTOM = 38;
const NOTE_BOX_PAD_H = 20;
// Kutu bloğun İKİ yanına da eşit oturur: kuyruk artık solda değil, üst kenarın
// ORTASINDA. Eskiden sol üstte iki daire vardı ve kutu onlara yer açmak için
// soldan 16px içeriden başlıyordu; bu, aynı kartta kutuyu fotoğrafın solundaki
// paydan dar gösteriyordu.
const NOTE_BOX_RADIUS = 26;
// ⚠️ Kutunun üst kenarının ortasında KUYRUK (balon üçgeni) YOK — kaldırıldı.
// Cam yüzeyde kendi başına duran bir çıkıntıydı; kutu artık düz bir kapsül.
// Kutunun zemini CAM: blur + üstünde ince bir perde. Perde tek başına opak bir
// pul, blur tek başına da yazıyı taşıyamayacak kadar zayıf; ikisi birlikte
// fotoğrafı sızdırırken yazıyı okunur tutuyor.
const NOTE_BOX_BLUR_INTENSITY = 80;
const NOTE_BOX_TINT_ALPHA = 0.45;
/**
 * Cam yolundaki (iOS 26+ `GlassView`) kontrast knob'u — perdenin karşılığı.
 *
 * Cam yolunda AYRI bir perde katmanı YOK, bilerek: opak bir dolgu camın
 * kırılmasını öldürüyor (bkz. CardSectionBox'taki "cam yolunda dolgu/kenarlık
 * yok" kuralı). Aynı işi `tintColor` yapıyor — camın kendi rengine eğim.
 *
 * Blur yolundaki 0.45'ten DÜŞÜK: expo-blur'un tint'i malzemenin kendisi kadar
 * ışık geçirmiyor, orada perde olmadan yazı taşınmıyordu; native cam zaten
 * arkayı yumuşatıp parlaklığı dengeliyor, üstüne 0.45 gelirse kutu düz bir pula
 * dönüyor.
 */
const NOTE_GLASS_TINT_ALPHA = 0.28;
const NOTE_TEXT_SIZE = 19;
const NOTE_TEXT_LINE = 24;
/**
 * Notun metin AĞIRLIĞI. Alıntı bloğu (hedef prompt'un sorusu + cevabı) da
 * bundan besleniyor — üçü tek yerden, biri değişince öbürü geride kalmasın.
 */
const NOTE_TEXT_WEIGHT = "500" as const;
// "Bu fotoğrafına not bıraktı" — yazının üstünde, nottan açık gri tarafta ve
// belirgin biçimde küçük. Hedef ilişkisini kuran
// TEK şey bu satır: foto artık kutunun dışında, satır olmasa yanındaki kare
// notun hedefi mi gönderenin başka bir fotoğrafı mı ayrılmazdı. "Devamını gör"
// de aynı ölçüde/ağırlıkta: ikisi de notun kendisi değil, onun etiketleri.
const NOTE_TARGET_LABEL_SIZE = 12;
const NOTE_TARGET_LABEL_LINE = 16;
const NOTE_TARGET_LABEL_GAP = 2;
// Kapalıyken 2 satır. Üçüncüye taşan not sağ altta "devamını gör" ile açılıp
// kapanıyor (bkz. LikeNoteBox).
const NOTE_COLLAPSED_LINES = 2;
// Aç/kapa chevron'u kutunun alt ortasında, MUTLAK konumlu: akıştan çıktığı için
// kutuya kendi satır yüksekliğini eklemiyor (yazı tavanından da düşülmesi
// gerekmiyor, bkz. textMaxHeight).
// Oturduğu yer kutunun alt payı: 12 + 16 = 28 < NOTE_BOX_PAD_BOTTOM (38), yani
// yazının son satırıyla arasında 10'luk, altında da 12'lik nefes kalıyor —
// okun iki yanı artık birbirine yakın, ok yazıya asılı durmuyor. Yatayda
// ortalayan şey KUTUNUN kendi genişliği — soldaki fotoğraf sütunu hesaba
// katılmıyor: ok kutunun simetri ekseninde, üstteki kuyrukla aynı hizada durur.
const NOTE_CHEVRON_SIZE = 16;
const NOTE_CHEVRON_BOTTOM = 12;
// Prompt hedefinin alıntısı: yalnız CEVAP (tek satır, başında tırnak).
// Fotoğrafın yerini tutuyor ama sütuna sığmaz — kutunun İÇİNDE, yazının üstünde
// tam genişlikte durur. Burası hedefi hatırlatan etiket, cevabın okunduğu yer
// değil; satır kırpılıyor.
//
// ⚠️ PROMPT BAŞLIĞI (sorunun kendisi) ÇİZİLMİYOR. Blok iki satırdı (üstte soru,
// altında cevap) ve kutuda üç ayrı metin birikiyordu: gri "not bıraktı" satırı,
// soru, cevap — notun kendisi okunmadan önce. Hedefi hatırlatmaya cevap yetiyor,
// hangi soruya ait olduğu profil açılınca zaten görünüyor. Geri eklenecekse
// NOTE_CHIP_HEIGHT ve alt perdenin bütçesi (textMaxHeight) birlikte güncellenmeli.
//
// Blok KONTURSUZ. Eskiden etrafında 1px çerçeve + 14 yarıçap vardı ve cam
// kutunun içinde ikinci bir kutu gibi duruyordu; alıntıyı nottan ayıran şey
// artık BAŞINDAKİ dikey çizgi — sohbette yanıtlanan mesajın işaretiyle
// (chat/components/ReplyPreview) aynı dil.
const NOTE_CHIP_LINE_W = 4;
// Çizgi ile yazının arası. Çizgi MUTLAK konumlu (bloğun sol kenarına çivili),
// yazı sütunu W + GAP kadar içeriden başlar.
const NOTE_CHIP_LINE_GAP = 10;
// Çizgi bloğun tam boyu değil: iki ucundan bu kadar kısalır (dikey ortalı).
const NOTE_CHIP_LINE_INSET_V = 2;
/**
 * Alıntının MÜREKKEBİ — çizgi, tırnak ve cevap ÜÇÜ DE bu renkte (bkz. chipInk).
 * MODLA DÖNER (`ink`): açıkta siyah, koyuda beyaz.
 *
 * ⚠️ Eskiden `scrimAt` ile SABİT siyahtı ve koyu modda yanlıştı: kutunun zemini
 * `veilSurface`, yani koyuda KOYU (rgba(32,32,34,α)) — siyah mürekkep o zeminde
 * kayboluyordu. Kutunun kendi yazısı zaten modla dönüyor (`colors.text`),
 * alıntının da aynı polariteyi izlemesi gerekiyor.
 *
 * `colors.border` denendi ve iki modda da silik kaldı: kutu CAM, arkasındaki
 * fotoğrafı sızdırıyor: koyuda #3A3A3A camın kendi tonuyla neredeyse aynı yere
 * düşüyor, açıkta #DCDCE0 beyaz camda kayboluyor. Şeffaf mürekkep ikisinde de
 * aynı işi görüyor — arkada ne varsa ondan uzaklaşıyor, yani çizgi kontrastını
 * fotoğraftan bağımsız koruyor.
 *
 * İki alfa AYRI: beyaz mürekkep koyu zeminde aynı sayıda daha silik okunuyor.
 * Başlangıç noktası `textMuted`in iki moddaki grisiydi (açık #8E8E93 ≈ 0.44
 * siyah, koyu #878787 ≈ 0.53 beyaz); koyu değer cihazda o hesabın bir tık
 * üstüne çekildi — kutu CAM olduğu için arkasındaki fotoğraf mürekkebi
 * yiyor, muted'ın tam karşılığı orada olması gerekenden sönük duruyordu.
 * Yine de `colors.text`in altında: alıntı notun kendi metniyle yarışmamalı.
 */
const NOTE_CHIP_INK_ALPHA_LIGHT = 0.45;
const NOTE_CHIP_INK_ALPHA_DARK = 0.66;
// Dolgu artık konturun içini beslemiyor, yalnız çizginin uçlarına nefes
// bırakıyor — bu yüzden eski 8 değil.
const NOTE_CHIP_PAD_V = 2;
/**
 * CEVABIN satır adımı notun metniyle AYNI (`NOTE_TEXT_LINE`): puntosu ve
 * ağırlığı da ondan geliyor, satır adımının ayrışması yazıyı sıkışık gösterirdi.
 *
 * ⚠️ Cevabı nottan ayıran şey PUNTO DEĞİL, mürekkep (`chipInk` — bkz.
 * NOTE_CHIP_INK_ALPHA_*) ve baştaki dikey çizgi. Fazla öne çıkıyorsa
 * oynatılacak yer o alfa.
 *
 * ⚠️ `NOTE_CHIP_ICON_SIZE` bunu GEÇMEMELİ: tırnağın dikey hizası
 * (satır − ikon) / 2 ile kuruluyor, büyük ikon payı eksiye çevirir.
 */
const NOTE_CHIP_ANSWER_LINE = NOTE_TEXT_LINE;
// Tırnak işareti CEVAP PUNTOSUNDAN büyük (19 → 21), bilerek: glyph kendi em
// kutusunun içinde küçük çiziliyor, yazıyla aynı boyda verildiğinde yanındaki
// harflerden küçük görünüyordu.
// ⚠️ ANSWER_LINE'ı geçmesin: dikey ortalama (satır − ikon) / 2 ile yapılıyor,
// büyük ikon o payı eksiye çevirip tırnağı satırın dışına taşırır.
const NOTE_CHIP_ICON_SIZE = 21;
const NOTE_CHIP_MARGIN = 10;
// ⚠️ Konturun payı (+2) YOK: kenarlık kalktı. Soru satırı da yok (bkz. bloğun
// başındaki not), blok artık yalnız dolgu + TEK satır.
const NOTE_CHIP_HEIGHT = 2 * NOTE_CHIP_PAD_V + NOTE_CHIP_ANSWER_LINE;

// Kartın alt bloğunun (isim + üniversite + not kutusu) kart tabanına uzaklığı.
// Notlu kartta blok daha AŞAĞIDA duruyor: kutu fotoğrafın ortasına doğru
// tırmanmasın, alt kenara yakın otursun. Blok `bottom`a çivili olduğu için bu
// tek sayı hem kutunun oturduğu yeri hem de yukarı doğru açılabileceği payı
// belirliyor.
// Alt bloğun yan payları — SİMETRİK. Sol pay eskiden 4px daha genişti (16/12);
// blok yalnız yazı taşıdığı sürece fark edilmiyordu ama not kutusu bloğun sağ
// kenarına kadar uzadığı için kutunun sağındaki boşluk fotoğrafın solundakinden
// dar görünüyordu.
// Notsuz ("sadece beğeni") kartta blokta yalnız isim + üniversite var: kutu
// olmadığı için iki satır kartın sol-alt köşesine yapışık duruyordu. Bu yüzden
// notsuz kart kendi payını kullanıyor — biraz daha içeride ve yukarıda.
// ⚠️ Simetri notu YALNIZ notlu kart için geçerli (kutu sağ kenara uzanıyor);
// notsuz blok sadece yazı taşıdığı için sol payı büyütmek sağ tarafı bozmuyor.
// ⚠️ Bu paylar listenin yan payıyla (LIST_H_PADDING) BİRLİKTE okunur: isim
// satırının ekran kenarına uzaklığı ikisinin toplamı. Liste payı daraldığında
// (kart kenara yaklaştı) bu paylar aynı kaldığı sürece yazı ekranın kenarına
// yapışıyordu — fark buraya eklendi, kimlik bloğu kart içinde eskisi kadar
// içeride duruyor.
const CARD_SIDE_INSET = 18;
const CARD_SIDE_INSET_PLAIN = 24;
const CARD_BOTTOM_INSET = 32;
const CARD_BOTTOM_INSET_NOTE = 14;

// Alt perdenin içeriğin TEPESİNDEN yukarı taşan payı. Perde en üstte şeffaf
// başlayıp aşağı doğru koyulaştığı için (maske) bu pay olmadan geçiş tam isim
// satırının üstünde başlar ve isim keskin bir kenarın dibinde kalır.
const BOTTOM_BLUR_LEAD = 36;

/**
 * NOTLU kartta alt perdenin ÖLÇÜMDEN ÖNCEKİ tabanı.
 *
 * Perdenin boyu alt bloğun `onLayout` ölçümünden geliyor; o gelene kadar
 * (mount'ta bir kare) taban devrede. Notsuz kartta taban kartın %33'ü ve blok
 * ondan kısa olduğu için ilk kare ile son kare arasında fark yok. Notlu kartta
 * ise blok %33'ten ÇOK uzun: taban da %33 olduğunda perde ilk karede kısa
 * çizilip ölçümle birlikte sıçrıyordu — "sekmeye girince perde flash ediyor".
 *
 * Buradaki toplam KAPALI notlu bloğun ölçüleri: kimlik iki satırı + kutu marjı +
 * kutu payları + hedef başlığı + iki satır yazı + kartın alt payı +
 * perdenin nefes payı. Gerçek blok bundan yalnız birkaç piksel sapar (yazının
 * gerçek satır adımı), o fark da perdede görünmez.
 *
 * ⚠️ TAHMİN, kırpma ölçüsü DEĞİL: yanılırsa perde birkaç piksel oynar, hepsi o.
 * Kutunun kendi kırpması ASLA tahminle yapılmıyor (bkz. measureText).
 */
const NOTE_CARD_BLUR_FLOOR =
  LIKE_CARD_NAME_LINE +
  (LIKE_CARD_UNI_LINE + LIKE_CARD_UNI_GAP) + // üniversite satırı + üst boşluğu
  8 + // not kutusunun üst marjı
  NOTE_BOX_PAD_TOP +
  NOTE_TARGET_LABEL_LINE +
  NOTE_TARGET_LABEL_GAP +
  NOTE_COLLAPSED_LINES * NOTE_TEXT_LINE +
  NOTE_BOX_PAD_BOTTOM +
  CARD_BOTTOM_INSET_NOTE +
  BOTTOM_BLUR_LEAD;

// Açık haldeki tavan KARTIN KENDİ YÜKSEKLİĞİNDEN çıkıyor: açılan not yukarı,
// fotoğrafın üstüne doğru büyür ve kartı uzatmaz — sınırsız bıraksak uzun bir
// not kimlik bloğunu (isim/yaş + üniversite) kartın dışına iter, `overflow:
// hidden` da onu keserdi. Pay: isim satırı + üniversite satırı + kutunun üst
// marjı + kart tepesinde nefes.
const NOTE_IDENTITY_BLOCK =
  LIKE_CARD_NAME_LINE + (LIKE_CARD_UNI_LINE + LIKE_CARD_UNI_GAP) + 8;
const NOTE_BOX_MAX_HEIGHT =
  CARD_HEIGHT - CARD_BOTTOM_INSET_NOTE - NOTE_IDENTITY_BLOCK - 12;
/**
 * Açık kutuda YAZIYA kalan yükseklik. `chrome` = yazı dışındaki her şey (kutu
 * payları, başlık, "devamını gör" satırı, varsa prompt kartı ve fotoğrafın
 * kutunun üstünde bıraktığı pay).
 *
 * Kırpma yerine TAVAN + iç kaydırma: kullanıcı "hepsini göster" dediğinde bir
 * kısmını saklamak istemiyoruz, ama 19px yazıyla 240 karakterlik bir not bu
 * genişlikte ~10 satır ve kart yüksekliği SABİT. Sığmayan uçta yazı kendi
 * içinde kayıyor; tipik notlar (çok daha kısa) hiç kaydırmadan tamamen
 * görünüyor.
 */
function noteTextMaxHeight(chrome: number) {
  return Math.max(
    NOTE_COLLAPSED_LINES * NOTE_TEXT_LINE,
    NOTE_BOX_MAX_HEIGHT - chrome,
  );
}

// Kutunun açılıp kapanma ritmi. Ekrandaki DİĞER hareketlerden (kart çıkışı,
// liste kayması) ayrı bir eğri kullanıyor — kasıtlı:
//
// Onlar `Easing.out(cubic)`: t=0'da eğim 3, yani hareket en hızlı yerinden
// BAŞLIYOR. Bir kart uçup giderken doğrusu bu (kullanıcı zaten "gitti" görmek
// istiyor) ama kutu GİTMİYOR, boyut değiştiriyor: aynı eğride kutu ilk karede
// zıplayıp sonra yavaşlıyordu — açılış "pat diye açıldı, sonra oturdu" diye
// okunuyordu. Buradaki bezier iki ucu da rampalı (t=0'da eğim 0), uzun
// yavaşlama kuyruğuyla: kutu duruyorken hareket etmeye, hareket ederken durmaya
// başlıyor, sıçrayan bir kare yok.
//
// ⚠️ Bu değerden BEŞ şey birden besleniyor (kutunun yüksekliği, chevron dönüşü,
// kimlik bloğunun solması, alt perdenin boyu ve kartın bloğunu yukarı kaydıran
// pay) — hepsi tek `progress`ten okuduğu için eğriyi burada değiştirmek beşini
// birden aynı anda taşır. Ayrı ayrı zamanlama YAPMA.
//
// Süre eğriyle birlikte uzadı: rampalı bir eğri 260ms'de ortadaki hızlı bölüme
// sıkışıyor ve kazandığı yumuşaklığı geri veriyor.
const NOTE_EXPAND_MS = 340;
const NOTE_EXPAND_EASING = Easing.bezier(0.4, 0, 0.2, 1);

// Kartın listeden düşerken oynattığı çıkış animasyonu. Süre TEK yerde duruyor:
// kart bu süre boyunca uçup sönerken ekran onu veride tutuyor, sonra çıkarıyor
// (bkz. runCardExit) — yoksa animasyonun oynayacağı bir görünüm kalmazdı.
export const CARD_EXIT_MS = 260;
// Kart fotoğrafının iskelet zemininde en fazla bekleyeceği süre — bkz. LikeCard
// içindeki emniyet freni. Yavaş bağlantıda gerçek yüklemeyi kesmeyecek kadar
// uzun, takılan bir kartı ekranda bırakmayacak kadar kısa.
const IMAGE_LOAD_TIMEOUT_MS = 6000;

// Daha önce yüklenmiş foto URI'leri — tab değişip remount olunca skeleton'a tekrar düşmesin
const loadedPhotoUris = new Set();

/**
 * Ekranın cam yüzeylerinin OTURDUĞU stil (kart kutularıyla aynı — bkz.
 * CardSectionBox). Zincirin ilk ve son adımı bu.
 */
const LIKE_GLASS_STYLE = "clear" as const;

/**
 * CAM ÜSTÜNDEKİ MÜREKKEP — açık modda da KOYU MOD tokenları.
 *
 * `clear` cam kendi zeminini koyulaştırıyor ve altından geçen şey kartın
 * fotoğrafı: açık moddaki `colors.text` (#0B0B0C) orada yıkanıyordu. Bu yüzden
 * cam yüzeyin üstündeki yazı/glif iki modda da koyu modun mürekkebini
 * kullanıyor — koyu modda tamamen no-op (`colors` zaten koyu palet).
 *
 * ⚠️ Yalnız GERÇEK cam yolunda (iOS 26 + `UIDesignRequiresCompatibility`
 * kapalı). Cam yoksa not kutusunun zemini `BlurView` + `veilSurface` perdesi ve
 * o perde açık modda gerçekten AÇIK — orada beyaz mürekkep okunmaz.
 *
 * ⚠️ Sadece bu ekran için. Uygulamanın diğer cam yüzeyleri (sohbet çubuğu,
 * toaster, aksiyon sayfası) bilerek dışarıda: onlar fotoğrafın değil, açık
 * modda AÇIK olan bir zeminin üstünde duruyor.
 *
 * Render sırasında çağır: palet mutasyona uğruyor.
 */
const glassInk = () => (hasLiquidGlassSurface() ? darkColors : colors);

/**
 * `GlassView`in stil zinciri: "clear" → "none" → "clear".
 *
 * Kopyala-yapıştır değil, ZORUNLU. `UIGlassEffect` yalnız `glassEffectStyle`
 * DEĞİŞİNCE yaratılıyor ve bayat bir efektin üstüne yenisini atamak sessizce
 * no-op; aradaki "none" adımı JS'ten ulaşılabilen tek teardown yolu. Tam gerekçe
 * ve native kaynak referansları CardSectionBox'ın başında — ÜÇÜNCÜ bir kopya
 * yazılmasın, oraya bakılsın.
 *
 * Tutulan şey stilin kendisi DEĞİL zincirin ADIMI: ilk ve son adım aynı stili
 * veriyor ("clear"), tek bir string ikisini ayırt edemezdi ve "efekt kuruldu mu"
 * sorusu cevapsız kalırdı.
 *
 * Bu ekranda İKİ cam yüzey var (not kutusunun zemini + Fire pill'i) ve
 * ikisi de aynı zinciri istiyor; kanca o yüzden ortak. Kancanın kendisi cam
 * dışı yolda da güvenle çağrılabilir (`enabled: false` → zincir hiç koşmaz).
 */
function useGlassPhase(enabled: boolean) {
  const [step, setStep] = useState<"install" | "teardown" | "ready">("install");
  const [laidOut, setLaidOut] = useState(false);
  // setState bir sonraki kareye ertelendiği için sökülmüş bileşene yazma riski
  // var; tek bayrakla kapatılıyor.
  const aliveRef = useRef(true);
  useEffect(
    () => () => {
      aliveRef.current = false;
    },
    [],
  );
  const onGlassLayout = useCallback((e) => {
    const { width, height } = e.nativeEvent.layout;
    // Sıfır ölçüde zinciri açmak yarışı kapatmaz, yalnız yerini değiştirir.
    if (width > 0 && height > 0) setLaidOut(true);
  }, []);
  useEffect(() => {
    if (!enabled || step === "ready") return;
    // Kapı YALNIZ ilk adımda: "teardown" efektin SÖKÜLDÜĞÜ ara durum, zincir
    // orada durursa yüzey camsız değil BOMBOŞ kalır.
    if (step === "install" && !laidOut) return;
    const id = requestAnimationFrame(() => {
      if (!aliveRef.current) return;
      setStep((s) => (s === "install" ? "teardown" : "ready"));
    });
    return () => cancelAnimationFrame(id);
  }, [enabled, laidOut, step]);
  return {
    phase: step === "teardown" ? ("none" as const) : LIKE_GLASS_STYLE,
    onGlassLayout,
  };
}

/**
 * İsim satırının üstündeki ürün pill'i — Fire kalbi + "Sana Fire
 * gönderdi".
 *
 * Kalp cümlenin yerine GEÇMİYOR, yanında duruyor: yazı ne olduğunu söylüyor,
 * kalp onu bir bakışta seçilir kılıyor (bkz. i18n likes.firePill).
 *
 * Zemin SEÇİLİ MODUN vurgusu (`modeAccent`) — başlığın yanındaki "Beğenenleri
 * gör" pill'iyle (bkz. LikesListHeader) BİREBİR aynı dolgu, mürekkebi de aynı:
 * `onMediaInverse`, yani sabit koyu. `text` OLAMAZ, açık modda beyaza dönüp
 * dolgunun üstünde kaybolurdu; `onMedia` da olamaz, aynı sebeple ters yönde.
 * Mürekkep MODLA DÖNMÜYOR: iki vurgu da (kırmızı/yeşil) orta tonlu, ikisinin
 * üstünde de siyah okunuyor.
 *
 * ⚠️ Burada CAM YOK, bilerek: dolgu opak: `GlassView`in altındaki hiçbir şey
 * görünmeyeceği için efekt yalnız maliyet olurdu (liste hücrelerinde geri
 * dönüştürülen cam zaten hassas — bkz. useGlassPhase). Kapsül gerekirse camlı
 * hâli git geçmişinde: tint `scrimAt(0.3)`, camsız yolda `scrimAt(0.42)` +
 * hairline.
 *
 * ⚠️ Yarıçap 999 DEĞİL, yükseklikten türüyor (bkz. LIKE_CARD_PILL_RADIUS).
 *
 * ⚠️ Pill SOLMUYOR, kayboluyor: not açılınca `LikeCard` onu tamamen KALDIRIYOR
 * (gerekçe orada). Buraya fade/scale animasyonu EKLEME.
 */
function FirePill({ label, accent }: { label: string; accent: string }) {
  return (
    <View
      style={{
        alignSelf: "flex-start",
        maxWidth: "100%",
        marginBottom: LIKE_CARD_PILL_GAP,
        paddingVertical: LIKE_CARD_PILL_PAD_V,
        paddingHorizontal: LIKE_CARD_PILL_PAD_H,
        borderRadius: LIKE_CARD_PILL_RADIUS,
        borderCurve: "continuous",
        flexDirection: "row",
        alignItems: "center",
        gap: LIKE_CARD_PILL_ICON_GAP,
        backgroundColor: accent,
      }}
    >
      {/* Kalbin altında disk YOK, glif doğrudan dolgunun üstünde duruyor.
          Rengi yazıyla AYNI ve SABİT (`onMediaInverse`): dolgu TEMAYLA
          dönmediği için (yalnız MODLA dönüyor) üstündeki hiçbir şey de
          dönmemeli — açık modda da siyah. `ink()`/`colors.text` kullanma,
          ikisi de açık modda çevrilir. */}
      <FireGlyph
        size={LIKE_CARD_PILL_ICON_SIZE}
        color={colors.onMediaInverse}
      />
      <Text
        numberOfLines={1}
        // Kısalan taraf YAZI: rozet ürünün işareti, dar kartta o değil yazı
        // kırpılsın.
        style={{
          flexShrink: 1,
          color: colors.onMediaInverse,
          fontSize: LIKE_CARD_PILL_TEXT_SIZE,
          lineHeight: LIKE_CARD_PILL_TEXT_LINE,
          fontWeight: "600",
        }}
      >
        {label}
      </Text>
    </View>
  );
}

/**
 * Not kutusunun ZEMİNİ. iOS 26+'da native liquid glass (`GlassView`), diğer her
 * yerde eskisi gibi `BlurView` + ince perde.
 *
 * Katman MUTLAK ve SABİT YÜKSEKLİKTE (`NOTE_BOX_MAX_HEIGHT`), kutunun tabanına
 * çivili — kutuyla birlikte boyutlanMIYOR. Gerekçesi çağıran taraftaki notta:
 * kutunun yüksekliği not açılırken KARE KARE değişiyor ve zeminle birlikte
 * ölçülen native efekt görünümü layout'un bir kare gerisinde kalıyor. Bu
 * `GlassView` için blur'dan da kritik: efekt İLK `layoutSubviews`te kuruluyor,
 * her karede yeniden ölçülen bir cam kendini durmadan yeniden kurmak zorunda
 * kalırdı. Görünen kısmı ebeveynin kırpması belirliyor.
 *
 * ⚠️ Camın kendi köşe yarıçapı YOK, kırpmayı ebeveyn yapıyor — normalde cam
 * yolunda kaçınılan şey (maske efektin üstüne biniyor), burada mecburi: katman
 * kutudan BÜYÜK, yani şekli veren şey kırpmanın ta kendisi. Bugünkü `BlurView`
 * de aynı kırpmanın altında çalışıyor.
 *
 * Stil zinciri ("clear" → "none" → "clear") ortak kancada: bkz. useGlassPhase.
 *
 * ⚠️ ATA ZİNCİRİNDE OPACITY < 1 OLAMAZ. Bu kutu güvenli: kartın kimlik bloğu
 * `identityStyle` ile soluyor ama not kutusu o bloğun ÇOCUĞU değil KARDEŞİ,
 * kartın kök `Animated.View`i de yalnız çıkış anında (kart zaten gidiyorken)
 * opaklık yazıyor. Kutuyu identity bloğunun içine taşıma.
 */
function NoteBoxSurface() {
  const glass = hasLiquidGlassSurface();
  const { phase, onGlassLayout } = useGlassPhase(glass);

  // Katmanın geometrisi iki yolda da AYNI — yalnız malzeme değişiyor.
  const layer = {
    position: "absolute" as const,
    left: 0,
    right: 0,
    bottom: 0,
    height: NOTE_BOX_MAX_HEIGHT,
  };

  if (glass) {
    return (
      <GlassView
        // `animate: false` — geçiş UIKit'in anlık görüntü makinesine girmesin
        // (kutu listede, kaydırma sırasında doğuyor). Gerekçe CardSectionBox'ta.
        glassEffectStyle={{ style: phase, animate: false }}
        onLayout={onGlassLayout}
        tintColor={veilSurface(NOTE_GLASS_TINT_ALPHA)}
        // Sistem görünümü DEĞİL uygulamanın kendi modu (bkz. theme/glass).
        colorScheme={glassColorScheme()}
        // Basınca `UIGlassEffect` kendi tepkisini veriyor. Kutu zaten
        // basılabilir (üstündeki TouchableOpacity notu açıp kapatıyor), yani
        // cam o dokunuşla birlikte çalışıyor.
        //
        // ⚠️ Prop STATİK — sonradan değiştirmek efektin sökülüp yeniden
        // kurulmasını gerektiriyor (bkz. setInteractive).
        isInteractive
        style={layer}
      />
    );
  }

  return (
    <>
      <BlurView
        intensity={NOTE_BOX_BLUR_INTENSITY}
        // Modla DÖNEN cam: açık modda beyaz, koyuda koyu. Fotoğraf üstündeki
        // blur'lar normalde her iki modda koyu kalır (bkz. theme/blur), bu
        // kutu bilinçli istisna — zemini zaten başından beri modla dönüyor.
        tint={chromeBlurTint()}
        style={layer}
      />
      {/* İnce perde — blur tek başına yazıyı taşımıyor. `veil` DEĞİL
          `veilSurface`: koyu modda tam siyah bu ölçüde bir kutuda fotoğrafta
          kesilmiş delik gibi duruyordu (bkz. theme/colors). */}
      <View
        pointerEvents="none"
        style={[layer, { backgroundColor: veilSurface(NOTE_BOX_TINT_ALPHA) }]}
      />
    </>
  );
}

/**
 * Kartın alt bloğundaki not kutusu — notun METNİ ve NEYE yazıldığı.
 *
 * ZEMİN `veilSurface`: açık modda BEYAZ, koyu modda açık bir siyah; yazı
 * `colors.text` ile tam tersi. Kutu bir FOTOĞRAFIN üstünde duruyor, o yüzden
 * tema yüzeyleri (`surface`) değil perde ailesi kullanılıyor — fotoğrafın
 * parlaklığı ne olursa olsun kutu okunur kalıyor (SwipeCard'daki not diskiyle
 * aynı karar). Tam opak değil: altındaki fotoğraf bir tık sızsın, kutu
 * yapıştırılmış bir pul gibi durmasın.
 *
 * HEDEF ÖNİZLEMESİ kutunun İÇİNDE, iki hedefte de: fotoğrafa yazılmış notta
 * kare thumbnail sol sütunda yazıyla dikeyde ortalı, prompt'a yazılmışta ise
 * (chip'e sığmayacak kadar metin taşıdığı için) yazının üstünde tam genişlikte
 * mini kart. İkisini de aynı cümleye bağlayan şey yazının üstündeki küçük "not
 * bıraktı" satırı: "şuna, şunu yazdı".
 *
 * KUTUNUN BİÇİMİ hedefe göre DEĞİŞMEZ: her iki halde de blokla aynı genişlikte
 * ve iki yanı eşit, düz bir kapsül — üst kenarında kuyruk/çıkıntı YOK.
 *
 * Kutu iki satırdan sonra kırpılır; KUTUYA BASMAK açıp kapatır ve notun tamamı
 * görünür. Kart yüksekliği SABİT ve kutu (alt blok bottom'a çivili olduğu için)
 * yukarı doğru büyüyor — açılan not fotoğrafın üstüne taşar, kartı uzatmaz.
 * Açılışın zamanlaması kutunun değil KARTIN elinde (`progress`): kutu, kimlik
 * bloğu ve alt perde aynı değerden besleniyor.
 *
 * ⚠️ Hedef alanları GÖNDERİM ANINDAKİ kopyalar (snapshot): fotoğraf profilden
 * silinmiş olsa bile `photoUrl` notun yanında durur. Hedefi hiç olmayan not
 * (eski kayıt / realtime önizleme) sadece kutu olarak çizilir, önizlemesiz.
 */
function LikeNoteBox({ note, expanded, onToggle, progress, onExpandInfo }) {
  const { t } = useTranslation();
  const target = note?.target ?? null;
  const photoUri = target?.kind === "Photo" ? target.photoUrl || null : null;
  // Alıntı bloğunun metni iki hedeften gelebiliyor: prompt'un CEVABI ya da
  // (akış yanıtlarında) gönderinin ilk 80 karakteri. İkisi de aynı şeyi
  // yapıyor — "neye yazıldığını" tek satırda hatırlatıyor — o yüzden tek
  // değişken, tek blok.
  //
  // Prompt'ta yalnız cevap çiziliyor: sorunun kendisi (`promptDisplay`)
  // bilerek çizilmiyor — gerekçe NOTE_CHIP_* sabitlerinin başında.
  // Metin yoksa blok HİÇ çizilmiyor (eskiden soru tek başına çiziliyordu):
  // dikey çizgi + tırnak, neyi alıntıladığını söylemeyen bir işaret olurdu.
  // Hedefi zaten "promptuna not bıraktı" satırı anlatıyor.
  const quote =
    target?.kind === "Prompt"
      ? target.promptAnswer
      : target?.kind === "FeedPost"
        ? target.excerpt
        : null;
  const showChip = !!quote;
  const comment = note?.comment ?? "";
  // Hedefi olmayan notta (eski kayıt / realtime önizleme) satır çizilmiyor:
  // neye yanıt verildiğini bilmiyorken "bu fotoğrafına" demek uydurma olurdu.
  //
  // ⚠️ "FeedPost" hedefinin etiketi ÇEVİRİ ANAHTARI DEĞİL, HAZIR METİN: akışın
  // kendi cümlesi ("gönderine yanıt verdi") ve zaman damgası çağıran tarafta
  // birleşiyor (bkz. FeedReplyCard). Kart i18n kararı vermiyor — etiketler
  // prop'la geliyor (aynı kural likeLabel/recoverLabel/fireLabel'da).
  const noteTargetLabel =
    target?.kind === "Photo"
      ? t("note.leftNoteOnPhoto")
      : target?.kind === "Prompt"
        ? t("note.leftNoteOnPrompt")
        : target?.kind === "FeedPost"
          ? target.label || null
          : null;

  // Yazının GERÇEK satır geometrisi — görünmez bir kopyadan ölçülüyor (aşağıya
  // bak). `count` satır sayısı, `collapsed` ilk iki satırın kapladığı yükseklik,
  // `full` metnin tamamı. Kırpılmış Text'in `onTextLayout`'u satırları
  // `numberOfLines` kadar rapor ettiği için bunlar asıl yazıdan okunamıyor.
  //
  // Ölçümün YANINDA HANGİ METİNDEN geldiği de duruyor (`text`): FlatList
  // hücreleri yeniden kullanılabiliyor, eski ölçüm yeni notun kutusunu yanlış
  // boyutlandırırdı. Tazelik BURADAN TÜRETİLİYOR (`measured` — metin tutuyor
  // mu?), ayrı bir sıfırlama efektiyle DEĞİL.
  //
  // ⚠️ Eskiden `useEffect(… , [comment])` ölçümü sıfırlıyordu ve o efekt iki
  // ayrı yoldan kutuyu ÖLDÜRÜYORDU — ikisinin de belirtisi aynı: chevron hiç
  // çizilmiyor ve kutuya basmak açmıyor (`overflowing` false → dokunuş
  // `disabled`, üstelik karta geçip profili açıyor).
  //  • YARIŞ: sıfırlama ile `onTextLayout` arasında sıra garantisi YOK. Pasif
  //    efektler commit'ten sonra ayrı bir turda boşalıyor; native'in gönderdiği
  //    satır ölçümü araya girip ÖNCE gelirse efekt onu siliyor ve bir daha
  //    ölçüm GELMİYOR — yazı değişmediği için yeni bir text layout yok. Kutu o
  //    kartta kalıcı olarak "ölçülmemiş" kalıyordu; yarış olduğu için de her
  //    kartta değil, arada ("bazen bir kutuda").
  //  • FAST REFRESH: her düzenlemede efektler yeniden çalışıyor, yazı ise aynı
  //    kaldığı için yine yeni ölçüm gelmiyor. Aynı ölü kutu, ama her seferinde.
  // Türetilmiş tazelikte böyle bir pencere yok: ölçüm ancak kendi metniyle
  // birlikte geçerli sayılıyor, geri alınması gereken bir state kalmıyor.
  const [textMetrics, setTextMetrics] = useState<{
    text: string | null;
    count: number;
    collapsed: number;
    full: number;
  }>({
    text: null,
    count: 0,
    collapsed: 0,
    full: 0,
  });
  // Satır dizisi → kap yükseklikleri.
  //
  // ⚠️ KAPALI yükseklik ikinci satırın ALTINDAN (`y + height`) DEĞİL, ÜÇÜNCÜ
  // satırın TEPESİNDEN (`y`) okunuyor. İkisi aynı sayı değil: `onTextLayout`
  // satır yüksekliğini yazı tipinin doğal satır kutusundan raporluyor, biz ise
  // `lineHeight` ile satır aralığını sıkıştırıyoruz — doğal kutu 24'ten büyük
  // olduğunda `lines[1].y + lines[1].height` bir sonraki satırın tepesini
  // AŞIYOR ve kap üçüncü satırdan birkaç piksel gösteriyordu ("2.3 satır").
  // Fark harflere bağlı olduğu için de her notta değil, arada çıkıyordu.
  // Satır tepesinden kesmek `numberOfLines={2}`'nin yaptığının aynısı.
  //
  // AÇIK yükseklik son satırın altı olmaya devam ediyor: orada amaç kırpmak
  // değil, son satırın mürekkebini tam içine almak — fazladan gelen birkaç
  // piksel yalnız kutunun altına nefes ekler.
  const measureText = useCallback(
    (e) => {
      const lines = e.nativeEvent.lines;
      if (!lines?.length) return;
      const last = lines[lines.length - 1];
      const fullHeight = Math.ceil(last.y + last.height);
      // Kırpma sınırı = ilk GÖRÜNMEYECEK satırın tepesi. Metin zaten sığıyorsa
      // (o satır yok) kırpma da yok: tam yükseklik.
      const cut = lines[NOTE_COLLAPSED_LINES];
      // Ölçüm ÖLÇÜLEN METİNLE birlikte yazılıyor — geçerliliğini bu taşıyor.
      setTextMetrics({
        text: comment,
        count: lines.length,
        collapsed: cut ? Math.floor(cut.y) : fullHeight,
        full: fullHeight,
      });
    },
    [comment],
  );

  // Kutunun zemini iOS 26'da CAM (bkz. NoteBoxSurface) — mürekkep o zaman açık
  // modda da koyu moddan geliyor (bkz. glassInk). Cam yoksa zemin BlurView +
  // `veilSurface` perdesi, yani açık modda gerçekten açık: palet olduğu gibi.
  const glassSurface = hasLiquidGlassSurface();
  const inkOnGlass = glassInk();
  const textStyle = {
    color: inkOnGlass.text,
    fontSize: NOTE_TEXT_SIZE,
    lineHeight: NOTE_TEXT_LINE,
    fontWeight: NOTE_TEXT_WEIGHT,
  };
  // Alıntı bloğunun TEK mürekkebi: dikey çizgi, soru, tırnak ve cevap. Tek
  // değişkenden besleniyorlar ki biri değişince öbürü geride kalmasın.
  // `isLight()` render sırasında okunuyor — modül seviyesinde sabitlenirse tema
  // değişince bayat kalır (bkz. theme/colors.ts).
  //
  // Cam yolunda POLARİTE de koyu modun tarafında: `ink()` açık modda siyaha
  // dönüp camın üstünde yıkanıyordu, `onMediaAt` beyaz kalıyor. Alfa da koyu
  // modunki — siyahla beyazın aynı alfadaki ağırlığı bir değil.
  const chipInk = glassSurface
    ? onMediaAt(NOTE_CHIP_INK_ALPHA_DARK)
    : ink(isLight() ? NOTE_CHIP_INK_ALPHA_LIGHT : NOTE_CHIP_INK_ALPHA_DARK);
  // Kutunun İKİNCİL mürekkebi — aç/kapa chevron'u. "not bıraktı" satırı ayrı
  // bir değişkenden besleniyor (bkz. targetLabelInk); cam yolunda ikisi ŞU AN
  // aynı tona denk geliyor ama bilerek ayrı: satırın tonu göze göre ayarlanan
  // bir knob, okunki değil.
  //
  // Koyu modda bir tık AÇIK: kutunun zemini (cam/blur'lu fotoğraf) koyuda
  // `textMuted`ı yutuyordu. Açık modda takas TERS yönde çalışırdı — orada
  // `textSecondary` `textMuted`tan koyu, yani ok ağırlaşır.
  // CAM YOLUNDA (iOS 26+) iki mod da AYNI ve bir kademe daha açık:
  // `textSecondary` (#9CA3AF) camın üstünde hâlâ sönük kalıyordu, ok
  // `neutral200` (#D1D5DB) ile okunuyor. Kaynak koyu palet olduğu için açık
  // modda da aynı değer.
  //
  // Cam yoksa eski davranış: `isLight()` render sırasında okunuyor (palet
  // mutasyona uğruyor, sabitleme yok).
  const secondaryInk = glassSurface
    ? inkOnGlass.neutral200
    : isLight()
      ? colors.textMuted
      : colors.textSecondary;
  // "…not bıraktı" satırının mürekkebi — YANITLANAN PROMPT ALINTISIYLA AYNI
  // (`chipInk`). Satır da alıntı da tek bir şeyi anlatıyor: notun neye
  // yazıldığını. İkisi ayrı tonda çizilince o işaret iki parçaya bölünüyordu;
  // ortak mürekkep onları tek blok yapıyor, notun kendi metniyse (`colors.text`)
  // ikisinin de üstünde kalıyor.
  //
  // ⚠️ Chevron (`secondaryInk`) hâlâ AYRI değişken: satırın tonunu ayarlamak
  // oku sürüklememeli.
  //
  // Sabit renk DEĞİL: `chipInk` modla ve cam/blur yoluyla dönüyor (bkz. orada).
  const targetLabelInk = chipInk;
  // Prompt kartı yer yediği için açık tavan onda daha alçak. Fotoğraf kutunun
  // İÇİNDE ve yazıdan kısa olduğu için kutunun yüksekliğine katkısı yok.
  // Chevron akıştan çıktı (mutlak) — payı zaten alt pay içinde, ayrıca sayılmaz.
  //
  // ⚠️ Alt pay burada KOŞULSUZ `NOTE_BOX_PAD_BOTTOM`: tavanın bağladığı tek hal
  // AÇIK kutu, açılabilen kutuda da ok her zaman var (bkz. `padBottom`).
  const textMaxHeight = noteTextMaxHeight(
    NOTE_BOX_PAD_TOP +
      NOTE_BOX_PAD_BOTTOM +
      (noteTargetLabel ? NOTE_TARGET_LABEL_LINE + NOTE_TARGET_LABEL_GAP : 0) +
      (showChip ? NOTE_CHIP_HEIGHT + NOTE_CHIP_MARGIN : 0),
  );

  // ── Açılma ölçüleri ────────────────────────────────────────────────────────
  // Animasyon LAYOUT ANİMASYONUYLA DEĞİL, yazı kabının yüksekliğini kare kare
  // sürerek yapılıyor. Sebep: açılışta kartın üç ayrı parçası (kutu, fotoğraf +
  // isim bloğu, alt perde) birlikte hareket etmeli. Layout animasyonu her birini
  // AYRI zamanlıyor, aralarında senkron garantisi yok — fotoğraf tek karede
  // zıplarken kutu yumuşak açılıyordu. Yükseklik gerçekten değiştiği için blok
  // (tabana çivili) kendiliğinden yukarı kayıyor ve fotoğraf onunla birlikte
  // akıyor; perde ve kimlik bloğu da AYNI `progress` değerinden besleniyor.
  //
  // ⚠️ Yükseklikler `satır sayısı × lineHeight` ile HESAPLANMIYOR, metnin kendi
  // satır geometrisinden okunuyor (bkz. measureText).
  //
  // ⚠️ ÖLÇÜM GELMEDEN kap yüksekliği HİÇ VERİLMİYOR (bkz. `measured`). Eskiden
  // burada `2 × lineHeight` tahmini vardı ve o tahmin gerçek satır adımını
  // tutmadığı için ilk kare(ler)de üçüncü satırdan yarım bir dilim görünüyordu:
  // sekme değişimi / listeye ilk giriş gibi her yeni mount'ta "önce bozuk, sonra
  // düzeliyor". Tahmin yerine o karede kırpmayı `numberOfLines` yapıyor —
  // yükseklik metnin kendisinden geliyor, yani kaç piksel olduğunu bilmemize
  // gerek kalmıyor.
  //
  // ⚠️ "Ölçüldü" = SIFIRDAN ÇOK SATIR + ölçümün metni ŞU ANKİ notun metni.
  // İkinci koşul geri dönüştürülen hücrenin bayat ölçümünü eliyor (eski
  // sıfırlama efektinin işi, ama bu sefer bir kare bile yanlış yükseklik
  // vermeden — kap ölçüm gelene kadar zaten `numberOfLines` ile kırpılıyor).
  const measured = textMetrics.count > 0 && textMetrics.text === comment;
  const collapsedTextHeight = measured ? textMetrics.collapsed : 0;
  const fullTextHeight = measured ? textMetrics.full : 0;
  const expandedTextHeight = Math.min(fullTextHeight, textMaxHeight);
  const overflowing = measured && textMetrics.count > NOTE_COLLAPSED_LINES;
  const growth = overflowing
    ? Math.max(0, expandedTextHeight - collapsedTextHeight)
    : 0;
  // Kutunun alt payı, okun payını YALNIZ ok çizilirken taşır — ok da yalnız
  // `overflowing` iken çiziliyor (aşağıda). Sığan notta (tipik olarak fotoğrafa
  // bırakılmış kısa bir not) alt payda 16px'i dolduran hiçbir şey kalmıyordu:
  // içeriğin üstünde 22, altında 38 vardı ve kutu gözle görülür biçimde alta
  // ağır basıyordu. Ok yokken paylar simetrik.
  //
  // ⚠️ Kaynak `overflowing`, ayrı bir koşul DEĞİL: pay ile ok tek değerden
  // beslendiği için ikisi hep aynı karede yerine oturur. Ölçümden önce ikisi de
  // yok — o karede fazladan boşluk çizilmemiş oluyor.
  const padBottom = overflowing ? NOTE_BOX_PAD_BOTTOM : NOTE_BOX_PAD_TOP;
  // Kart, perdesini ve kimlik bloğunu bu büyümeye göre ayarlıyor.
  useEffect(() => {
    onExpandInfo?.(growth);
  }, [growth, onExpandInfo]);

  // Ölçüm gelene kadar UYGULANMIYOR (aşağıda `measured &&`): o karede kap
  // otomatik yükseklikte, yani `numberOfLines`'ın kırptığı iki satır ne kadarsa
  // o kadar. Tipik yön tek taraflı (önce yükseklik yok, ölçüm gelince var);
  // notun metni değişip ölçüm sıfırlandığında (bkz. useEffect) stil geri
  // çekiliyor ve o karede React yükseklik prop'unu hiç göndermediği için kap
  // otomatiğe dönüyor — Reanimated'ın yazdığı değer takılı kalmıyor.
  const textBoxStyle = useAnimatedStyle(
    () => ({ height: collapsedTextHeight + progress.value * growth }),
    [collapsedTextHeight, growth],
  );
  // Chevron aşağı bakarken kapalı, yukarı bakarken açık. Dönüş kutuyla AYNI
  // değerden: iki ayrı animasyon olsaydı ok kutudan önce/sonra yerine oturur.
  const chevronStyle = useAnimatedStyle(() => ({
    transform: [{ rotate: `${progress.value * 180}deg` }],
  }));

  return (
    // Not bölgesi = kutunun kendisi; üstünde kuyruk/çıkıntı yok.
    <View style={{ marginTop: 8 }}>
      {/* Kutu — CAM zemin. Kabın kendisinde padding YOK: Yoga mutlak çocuğu
          ebeveynin PADDING kutusuna göre konumlandırır, yani cam katmanları
          padding kadar içeri kaçar ve kenarlarda dolgusuz bir çerçeve kalırdı.
          Padding içerideki sarmalayıcıda.

          Kutunun yüksekliği içeriğinden geliyor; içerideki yazı kabı kare kare
          büyüyüp küçüldüğü için kutu da onunla birlikte açılıp kapanıyor.
          Tabana çivili olduğundan büyüme YUKARI doğru.

          ⚠️ Buraya `layout={LinearTransition}` EKLEME. Kutunun yüksekliği zaten
          kare kare değişiyor; üstüne bir de layout geçişi konunca iki animasyon
          aynı anda çalışıyor ve kutu kendi eğrisinde, kartın geri kalanı (saf
          layout'la hareket ettiği için) başka bir eğride gidiyordu — kapanışta
          kutunun alt kenarı bir an sıçrıyordu. */}
      <View
        style={{
          borderRadius: NOTE_BOX_RADIUS,
          borderCurve: "continuous",
          overflow: "hidden",
        }}
      >
        {/* ⚠️ Zemin katmanı `absoluteFill` DEĞİL: sabit yükseklikte ve kutunun
            TABANINA çivili. Kutuyla birlikte boyutlansaydı her karede yeniden
            ölçülür ve native efekt görünümü layout'un bir kare gerisinde
            kalırdı: kapanışta camın alt kenarı bir an yukarı sıçrayıp köşe
            yuvarlaklığı düzleşiyor, soldaki fotoğraf da (saf layout'la hareket
            ettiği için) camdan önde gidiyordu. Sabit boyutlu zemin hiç yeniden
            ölçülmüyor; görünen kısmını kutunun kırpması belirliyor, o da tek
            kaynaktan (yazı kabının yüksekliği) geliyor.
            Malzeme seçimi (native cam / blur+perde) NoteBoxSurface'ta. */}
        <NoteBoxSurface />

        {/* Kutunun TAMAMI basılabilir: notu açmak için ince bir bağlantıya
            nişan almak gerekmiyor. Yazı zaten sığıyorsa `disabled` — o zaman
            dokunuş buradan geçip karta gider ve profil açılır (basılı ama
            hiçbir şey yapmayan bir kutu, ölü dokunuş olurdu).
            `activeOpacity: 1` — geri bildirim açılma animasyonunun kendisi;
            cam yüzeyi soldurmak kutuyu pasif gösteriyordu. */}
        <TouchableOpacity
          activeOpacity={1}
          disabled={!overflowing}
          onPress={onToggle}
          accessibilityRole={overflowing ? "button" : undefined}
          // Etiket BURADA: ipucu artık yazı değil chevron, sesli okuyucuya
          // "aşağı ok" diye okunurdu.
          accessibilityLabel={
            overflowing
              ? expanded
                ? t("note.seeLess")
                : t("note.seeMore")
              : undefined
          }
          style={{
            paddingTop: NOTE_BOX_PAD_TOP,
            // Okun payı yalnız ok varken (bkz. `padBottom`).
            paddingBottom: padBottom,
            paddingHorizontal: NOTE_BOX_PAD_H,
          }}
        >
          {/* Prompt hedefi — fotoğraf yerine geçen alıntı, yazının ÜSTÜNDE tam
          genişlikte. Yalnız CEVAP, başında tırnak: prompt BAŞLIĞI çizilmiyor
          (gerekçe NOTE_CHIP_* sabitlerinin başında). ÇİZGİ, TIRNAK ve CEVAP
          ÜÇÜ DE aynı mürekkepte (`chipInk`): burası hedefi hatırlatan tek bir
          işaret, üç ayrı tonda çizilince blok dağılıyordu. Okunacak yer kutunun
          asıl metni; cevap beyazken (`colors.text`) notun kendisiyle yarışıp
          alıntıyı ana metin gibi gösteriyordu, ayrımı artık mürekkep taşıyor.
          Alıntıyı cam kutudan
          ayıran şey KONTUR DEĞİL, başındaki dikey çizgi: çerçeve kutunun içinde
          ikinci bir kutu gibi duruyordu, çizgi ise sohbette yanıtlanan mesajın
          işaretiyle aynı dil.

          ⚠️ Çizgi DIŞTAKİ kaba mutlak konumlu, yazı sütunu `marginLeft` ile
          kaçıyor. `paddingLeft` + `left: 0` OLMAZ: Yoga mutlak çocuğu
          ebeveynin PADDING kutusuna göre yerleştirir, çizgi de yazıyla birlikte
          içeri kayıp onun üstüne binerdi (aynı tuzak kutunun kendi dolgusunda
          da var, bkz. yukarıdaki not). */}
          {showChip && (
            <View
              pointerEvents="none"
              style={{
                alignSelf: "flex-start",
                maxWidth: "100%",
                marginBottom: NOTE_CHIP_MARGIN,
              }}
            >
              {/* Renk kenarlık token'ı DEĞİL, modla dönen şeffaf mürekkep:
                  sebep sabitin başında. */}
              <View
                style={{
                  position: "absolute",
                  left: 0,
                  top: NOTE_CHIP_LINE_INSET_V,
                  bottom: NOTE_CHIP_LINE_INSET_V,
                  width: NOTE_CHIP_LINE_W,
                  borderRadius: NOTE_CHIP_LINE_W / 2,
                  backgroundColor: chipInk,
                }}
              />
              {/* Tırnak + cevap TEK satır. Eskiden burada iki katman vardı
                  (soru sütunu + içinde cevap satırı); soru kalkınca sütunun
                  taşıdığı tek şey `marginLeft` ve dikey dolgu kaldı, o da bu
                  satıra taşındı — geometri aynı, bir View eksik. */}
              <View
                style={{
                  flexDirection: "row",
                  alignItems: "flex-start",
                  gap: 6,
                  marginLeft: NOTE_CHIP_LINE_W + NOTE_CHIP_LINE_GAP,
                  paddingVertical: NOTE_CHIP_PAD_V,
                }}
              >
                <SFIcon
                  name="quote.opening"
                  fallback={MessageCircle}
                  size={NOTE_CHIP_ICON_SIZE}
                  color={chipInk}
                  // İkon satırın ortasına otursun: (satır boyu - ikon) / 2.
                  style={{
                    marginTop: (NOTE_CHIP_ANSWER_LINE - NOTE_CHIP_ICON_SIZE) / 2,
                  }}
                />
                <Text
                  numberOfLines={1}
                  style={{
                    color: chipInk,
                    fontSize: NOTE_TEXT_SIZE,
                    fontWeight: NOTE_TEXT_WEIGHT,
                    lineHeight: NOTE_CHIP_ANSWER_LINE,
                    flexShrink: 1,
                  }}
                >
                  {quote}
                </Text>
              </View>
            </View>
          )}

          {/* Fotoğraf solda, yazı sağında — birbirlerine göre DİKEYDE ORTALI.
              Sütunlar ayrı: fotoğraf yazının hizasına değil, yazı bloğunun
              ortasına oturuyor.
              Ortalanan blok = "not bıraktı" satırı + notun kendisi. Chevron bu
              satırın DIŞINDA (aşağıda): sütunun içindeyken kendi yüksekliğini
              ortalamaya katıyor, fotoğrafı yarım satır yukarı itiyordu. */}
          <View style={{ flexDirection: "row", alignItems: "center" }}>
            {!!photoUri && (
              <Image
                source={{ uri: photoUri }}
                pointerEvents="none"
                style={{
                  width: NOTE_THUMB_SIZE,
                  height: NOTE_THUMB_SIZE,
                  marginRight: NOTE_THUMB_GAP,
                  // borderCurve YOK: expo-image'ın ImageStyle'ı kabul etmiyor.
                  borderRadius: 14,
                  backgroundColor: colors.surfaceTranslucent,
                }}
                contentFit="cover"
                cachePolicy="memory-disk"
                recyclingKey={photoUri}
                transition={150}
              />
            )}

            <View style={{ flex: 1 }}>
              {/* Başlık — soldaki fotoğrafın ne olduğunu yazıyla söyler. */}
              {!!noteTargetLabel && (
                <Text
                  numberOfLines={1}
                  style={{
                    // Alıntının mürekkebiyle aynı (bkz. targetLabelInk).
                    color: targetLabelInk,
                    fontSize: NOTE_TARGET_LABEL_SIZE,
                    lineHeight: NOTE_TARGET_LABEL_LINE,
                    fontWeight: "400",
                    marginBottom: NOTE_TARGET_LABEL_GAP,
                  }}
                >
                  {noteTargetLabel}
                </Text>
              )}

              {/* Yazı kabı — yüksekliği ANİMASYONLU, taşan kısmı kırpılıyor. Yazının
            kendisi hep TAM: kırpmayı `numberOfLines` değil kap yapıyor, böylece
            açılırken satırlar perde gibi ortaya çıkıyor (numberOfLines
            animasyon aralarında zıplayarak değişirdi).
            Kap yüksekliği gerçek layout olduğu için kutu — ve tabana çivili
            olan blok — kare kare yukarı açılıyor. */}
              <Animated.View
                style={[{ overflow: "hidden" }, measured && textBoxStyle]}
              >
                {/* Tavana dayanan uzun notlarda (bkz. noteTextMaxHeight) yazı kendi
                içinde kayıyor: kırpma yok, notun tamamı okunabiliyor. Kapalıyken
                ve sığan notlarda kaydırma KAPALI — kutuya basmak açıp
                kapatmalı, kaydırma jestini yutmamalı. */}
                <ScrollView
                  scrollEnabled={expanded && fullTextHeight > textMaxHeight}
                  showsVerticalScrollIndicator={false}
                  bounces={false}
                  nestedScrollEnabled
                  // iOS bir ScrollView'a kendiliğinden içerik payı ekleyebiliyor
                  // (navigasyon bağlamına göre). Burada o pay yazıyı aşağı iter ve
                  // kap tam iki satıra ayarlıyken üçüncü satırdan bir dilim
                  // görünmesine yol açar.
                  automaticallyAdjustContentInsets={false}
                  contentInsetAdjustmentBehavior="never"
                >
                  {/* Kırpma NORMALDE kabın yüksekliğinden geliyor (açılırken
                      satırlar perde gibi çıksın diye). Ölçüm gelene kadar kap
                      yüksekliksiz olduğu için o tek kare(ler)de işi
                      `numberOfLines` yapıyor — yoksa notun TAMAMI çizilir ve
                      kutu birden beş satır boyunda açılırdı.
                      ⚠️ Ölçüm gelince KALKMALI: kapalıyken zararsız ama açılışta
                      satırlar iki satırda takılı kalırdı. */}
                  <Text
                    style={textStyle}
                    numberOfLines={measured ? undefined : NOTE_COLLAPSED_LINES}
                  >
                    {comment}
                  </Text>
                </ScrollView>
                {/* Ölçüm kopyası — görünmez, mutlak konumlu (layout'a girmez, kabın
              yüksekliğinden de etkilenmez). Tek işi yazının GERÇEK satır
              sayısını söylemek; kap onu kırptığı için asıl yazıdan okunamıyor. */}
                <Text
                  pointerEvents="none"
                  accessible={false}
                  accessibilityElementsHidden
                  importantForAccessibility="no-hide-descendants"
                  onTextLayout={measureText}
                  style={[
                    textStyle,
                    {
                      position: "absolute",
                      left: 0,
                      right: 0,
                      top: 0,
                      opacity: 0,
                    },
                  ]}
                >
                  {comment}
                </Text>
              </Animated.View>
            </View>
          </View>
        </TouchableOpacity>

        {/* Durum ipucu — kutunun ALT ORTASINDA, mutlak. Akıştan çıktığı için
            kutuya satır eklemiyor; oturduğu yer yazının değil kutunun alt payı,
            yani son satırla çakışmıyor (bkz. NOTE_CHEVRON_BOTTOM).
            Yazı yerine CHEVRON: kutuda okunacak tek şey notun kendisi olsun,
            ipucu kelime kalabalığı yapmasın. Kendi dokunma hedefi yok —
            `pointerEvents: none`, basılabilir olan altındaki kutunun tamamı;
            sesli okuyucu için etiket kutunun üstünde (accessibilityLabel).
            Aşağı bakan ok açılınca yukarı dönüyor; dönüş kutunun açılışıyla
            AYNI değerden sürülüyor, yani ikisi tam aynı eğride.
            ⚠️ Dönüş İKİ katmanlı: dıştaki kap kutu kadar GENİŞ ve oku ortalıyor,
            `rotate` içteki ok kadar dar katmanda. Rotasyon kabın merkezinden
            hesaplandığı için geniş kabı döndürmek oku ara karelerde yay
            çizdirirdi. */}
        {overflowing && (
          <View
            pointerEvents="none"
            style={{
              position: "absolute",
              left: 0,
              right: 0,
              bottom: NOTE_CHEVRON_BOTTOM,
              alignItems: "center",
            }}
          >
            <Animated.View style={chevronStyle}>
              <SFIcon
                name="chevron.down"
                fallback={ChevronDown}
                size={NOTE_CHEVRON_SIZE}
                // Kutunun ikincil katmanı (bkz. secondaryInk): ok, notun
                // metninden bir kademe sönük — ipucu, içerik değil.
                color={secondaryInk}
                strokeWidth={2.4}
                weight="semibold"
              />
            </Animated.View>
          </View>
        )}
      </View>
    </View>
  );
}

/**
 * Bu kart free kullanıcıya da AÇIK mı — kilidi belirleyen TEK kural.
 *
 * ⚠️ EKRANDAKİ HER SEKME BUNU KULLANIR, "Kaçırdıkların" DAHİL. Kaçırdıkların
 * 2026-08-31'e kadar kuralın DIŞINDAYDI (kart `alwaysClear` ile blur'suz
 * çiziliyordu) ve bu açık bir sızıntıydı: "Seni Beğenenler"de bulanıklaştırdığımız
 * kişi, keşifte pas geçilip kaçırdıklarına düştüğünde NET görünüyordu. Aynı kişi,
 * iki ekran, iki farklı kural — free kullanıcı paralı bilgiyi bedava alıyordu.
 * Kuralı ÇATALLAMAYIN; ikinci bir kopya yazılırsa aynı bug geri gelir.
 *
 * TEK sinyal ailesi: Fire / NOT — ayrı ürünler, sözleşmeleri aynı:
 * gönderen, karşı taraf kendisini görebilsin diye ödüyor. Premium'a bağlamak
 * satın alınan şeyi teslim etmemek olurdu.
 *
 * ⚠️ İKİNCİ BİR SİNYAL VARDI VE KALDIRILDI (2026-09-03): `hasLikedMe`.
 * Gerekçesi "sunucunun kanonik görünürlük bayrağı; free'de normal beğenide HER
 * ZAMAN `false`, yani ödenmiş görünürlüğü backend tarafından doğruluyor"du. O
 * maskeleme GERÇEK ama YALNIZ KEŞİF DESTESİNDE (`GetPotentialMatches`, bkz.
 * ProfileCardDto). Bu ekranın beslendiği iki liste de tanımı gereği "seni
 * beğenenler" (`WhoLikedMe`, `MissedMatches`): orada bayrağın kısılacak bir
 * bilgisi yok, backend doğal değeriyle — yani HER KART İÇİN `true` — dolduruyor.
 * Kural böylece totolojiye düşüyordu ("seni beğenenler listesindeki kişi seni
 * beğenmiş → kilidi aç") ve free kullanıcı listenin TAMAMINI blur'suz
 * görüyordu. Cihaz logu: `isPremium:false`, üç kartın üçünde de
 * `hasLikedMe:true`, ikisi düz beğeni.
 * Alan kartlarda hâlâ taşınıyor ama KİLİT KARARINA GİRMİYOR — geri eklenirse
 * blur bu iki listede tümden açılır.
 *
 * ⚠️ Kural GÖRSELİ ve ETKİLEŞİMİ birlikte belirliyor (blur + kart dokunuşu +
 * geç/beğen butonları). Önceden yalnız blur'da not istisnası vardı; kart
 * blur'suz çiziliyor ama dokununca paywall açılıyordu — free kullanıcı kendisine
 * not bırakanı görüyor, açamıyor, yanıtlayamıyordu.
 *
 * ✅ Sunucu maskeleme YAPMIYOR (sözleşme §3.3): `displayName`/`photos` free
 * kullanıcıya da gerçek değerleriyle geliyor — blur TAMAMEN istemci tarafında
 * bir katman. Kartı blur'suz çizen bir kod yolu bırakılırsa açık geri açılır.
 * ⚠️ AMA "açık" ≠ "tüm alanlar dolu" (§3.4): gönderenin KENDİ gizlilik
 * tercihleri (yaş/konum/mesafe) sert kural, notu alan da bypass edemez —
 * `age: 0` / `city: null` gelen bir not kartı bug DEĞİL.
 */
export function isUnlockedLike(item): boolean {
  return !!item?.isSuperLike || !!item?.note || !!item?.isNote;
}

/**
 * ⚠️ Aşağıdaki `onX` prop'larının hepsi KARTI PARAMETRE ALIYOR
 * (`onPress(item)`), kapanışla bağlanmış değil. Eskiden ekran her kart için
 * `() => openLikerProfile(item)` gibi yeni bir kapanış üretiyordu; kart memo'ya
 * alınsa bile bu kapanışlar her çizimde değiştiği için memo hiçbir zaman
 * tutmuyor, ekranın HER render'ı listedeki bütün kartları yeniden çizdiriyordu.
 * Ekranın kendisi sık çiziliyor (sekme geçişi, kota, hub olayları) — kartın
 * ise değişen bir şeyi yoksa çizilmesi için sebep yok.
 */
// ⚠️ ÇEKME JESTİ VE AKSİYON KOLONU KALDIRILDI. Kart sağdan sola çekilince
// altından geç/beğen/kurtar/şikayet/engelle kolonu çıkıyordu; o jest sekmeler
// arası yatay kaydırmayla (bkz. PagerView) aynı parmak hareketini istiyor ve
// ikisi bir arada yaşayamıyor. Kaydırma kazandı.
//
// Kolonun kaybı sanıldığı kadar büyük değil, çünkü kolondaki beş aksiyonun
// üçü zaten başka yerde duruyordu:
//   • beğen / kurtar → kartın SAĞ ÜST köşesindeki cam buton (dokunuş, jest
//     değil — bkz. RecoverGlassButton). Kolon bunun kopyasıydı.
//   • şikayet / engelle → profil modalının kendi moderasyon satırı.
// Kolona ÖZEL olan tek şey "geç"ti; o da profildeki swipe'a taşındı.
function LikeCard({
  item,
  isPremium,
  onPress,
  // Sağ üst köşedeki cam buton. Kaçırdıkların sekmesinde "kurtar", beğeni
  // kartlarında "beğen" — ikisi aynı köşenin iki hâli.
  // ⚠️ VARSAYILANLARI OLAN prop'lar: kartı İKİ çağıran çiziyor ve hiçbiri
  // hepsini vermiyor (akış yanıtında kurtarma/fire/ipucu yok, Beğeniler'de
  // geç/üç nokta yok). Varsayılan olmadan TS her çağıranı hepsini yazmaya
  // zorluyor, kod da `undefined` prop'larla doluyordu.
  onRecover = undefined,
  onLike = undefined,
  likeLabel = undefined,
  recoverLabel = undefined,
  // Kartın ait olduğu mod — köşedeki kurtarma butonunun rengini veriyor
  // (Friends'te yeşil). Varsayılanı Dating, yani geçmeyen çağıran bugünkü
  // kırmızıda kalıyor.
  mode = DEFAULT_APP_MODE,
  // Köşedeki İKİNCİ buton — yalnız akış yanıtlarında (bkz. FeedReplyCard).
  // Verilmezse köşe eskisi gibi tek butonlu kalıyor; gerekçe butonun yanında.
  onSkip = undefined,
  skipLabel = undefined,
  // ⚠️ ŞU AN ÇİZİLMİYOR: üç nokta butonu kaldırıldı (gerekçe köşe kolonundaki
  // notta). Prop'lar sözleşmede duruyor — çağıranlar (FeedReplyCard →
  // FeedScreen / LikesScreen) hâlâ geçiyor ve buton geri gelirse tek
  // dokunuşla çalışır; şimdilik geçilen handler ÇAĞRILMIYOR.
  onMenu = undefined,
  menuLabel = undefined,
  // İsim satırının üstündeki pill'in metni. Diğer etiketler gibi PROP: kart
  // i18n hook'u tutmuyor, çeviri ekranın elinde (bkz. likeLabel/recoverLabel).
  fireLabel = undefined,
  // Kilitli karttaki "ne arıyor" pilinin etiketi. Diğer etiketler gibi kart
  // i18n hook'u tutmuyor; ekran `t`'ye bağlı SABİT bir çözücü veriyor (kartı
  // parametre alıyor, memo bozulmuyor). Kural likerCardTeaser'da, keşif
  // kartıyla ortak.
  resolveIntentLabel = undefined,
  // ⚠️ Burada bir zamanlar `alwaysClear` vardı ve KALDIRILDI (2026-08-31).
  // Kaçırdıkların sekmesi o prop ile blur'un tamamen dışında kalıyordu;
  // gerekçesi "liste backend'de gating'e tabi değil"di ama gating listede değil
  // KARTTA: sunucu fotoğrafları maskelemiyor, kimliği saklayan tek şey bu blur.
  // Sonuç, Beğenenler'de bulanık olan kişinin burada net görünmesiydi. Artık her
  // sekme aynı `showClear` kapısından geçiyor.
  //
  // Çıkış animasyonu: "left" / "right" jestin yönüne uçurur, "out" yerinde
  // söndürür (engelleme gibi yönü olmayan düşüşler). İkisinde de kart dokunuşa
  // kapanıyor. null → kart duruyor.
  //
  // ⚠️ "hold" KALDIRILDI (2026-09-03): kartı olduğu gibi bırakıp düşüşü ekranı
  // kaplayan alev kutlamasına örttüren hâliydi. Onay/kurtarma artık kutlama
  // oynatmıyor (bkz. runCardExit başlığındaki not) — kutlama MatchModal'ın.
  exitDirection = null,
}) {
  const [imgLoading, setImgLoading] = useState(
    !!item.mainPhoto && !loadedPhotoUris.has(item.mainPhoto),
  );
  // Fotoğrafın açılış geçişi YALNIZ ilk yüklemede. Sekme değişince o sekmede
  // olmayan kartlar unmount oluyor, geri dönünce yeniden mount oluyorlar —
  // fotoğraf bellekten anında geliyor ama `transition` her mount'ta yeniden
  // oynayıp kartı "baştan yükleniyor" gibi gösteriyordu. İskelet zaten
  // `loadedPhotoUris` sayesinde çizilmiyordu, geriye kalan tek yanıp sönme
  // buydu. Ref: değer kartın ömrü boyunca sabit kalsın (onLoadEnd kümeye
  // eklediğinde ortadan değişmesin).
  const photoTransition = useRef(
    item.mainPhoto && loadedPhotoUris.has(item.mainPhoto) ? 0 : 200,
  ).current;
  // Emniyet freni: geçersiz/expired bir URI'de expo-image ne `onLoadEnd` ne
  // `onError` verebiliyor — o durumda shimmer sonsuza kadar kalıyor ve kart
  // "yükleniyorda takıldı" gibi okunuyordu. Kart en fazla bu kadar bekler,
  // sonra fotoğrafın gelmediğini kabul edip zemine düşer.
  useEffect(() => {
    if (!imgLoading) return;
    const id = setTimeout(() => setImgLoading(false), IMAGE_LOAD_TIMEOUT_MS);
    return () => clearTimeout(id);
  }, [imgLoading]);
  const showClear = isPremium || isUnlockedLike(item);

  // Blok kart tabanından bu kadar yukarıda. Üç yerde birden okunuyor (bloğun
  // konumu, perdeyi besleyen ölçüm, kilitli kartın placeholder'ı) — üçü
  // ayrışırsa perde blokla aynı yerde başlamıyor.
  const blockBottom = item.note?.comment
    ? CARD_BOTTOM_INSET_NOTE
    : CARD_BOTTOM_INSET;

  // ── Not kutusunun açılması ────────────────────────────────────────────────
  // Durum ve ilerleme kutuda DEĞİL burada: açılış kartın üç parçasını birden
  // ilgilendiriyor (kutu büyür, kimlik bloğu solar, alt perde uzar) ve üçünün
  // AYNI eğride gitmesinin tek yolu tek bir paylaşılan değerden beslenmeleri.
  const [noteExpanded, setNoteExpanded] = useState(false);
  const noteProgress = useSharedValue(0);
  // Kutunun açılınca kazanacağı yükseklik (px) — kutu ölçüp buraya bildiriyor.
  const [noteGrowth, setNoteGrowth] = useState(0);
  useEffect(() => {
    noteProgress.value = withTiming(noteExpanded ? 1 : 0, {
      duration: NOTE_EXPAND_MS,
      easing: NOTE_EXPAND_EASING,
    });
  }, [noteExpanded, noteProgress]);
  // Animasyon boyunca alt bloğun yüksekliği kare kare değişiyor; `onLayout`
  // bunu her karede state'e yazsaydı kart saniyede 60 kez render olurdu. Ölçüm
  // yalnız DURAĞAN kapalı halde alınıyor, açılışın yarattığı fark zaten
  // `noteGrowth` olarak biliniyor.
  const noteSettlingRef = useRef(false);
  const toggleNote = useCallback(() => {
    noteSettlingRef.current = true;
    setTimeout(() => {
      noteSettlingRef.current = false;
    }, NOTE_EXPAND_MS + 60);
    setNoteExpanded((v) => !v);
  }, []);
  // Kart listeden düşüp yerine yenisi geldiğinde açık kalmış bir kutu, yeni
  // notu açık gösterirdi.
  const noteKey = item.note?.comment;
  useEffect(() => {
    setNoteExpanded(false);
  }, [noteKey]);

  // Alt bloğun (isim + üniversite + not) kart tabanından ölçülen yüksekliği —
  // alt perdenin boyu buradan geliyor. `0` yalnız ilk kare.
  //
  // ⚠️ BLOK MUTLAK KONUMDA KALMALI. Akışa alıp perdeyi Yoga'ya ölçtürmeyi
  // denedik (ölçüm/state derdi ortadan kalkıyordu) ama kutunun Reanimated'la
  // kare kare değişen yüksekliği o zaman ÜST KABA yayılıyor: React commit'i ile
  // UI-thread'in yazdığı yükseklik bir kare ayrıştığında tüm blok zıplıyor,
  // açılış "anlık açılıp kapanmış" gibi görünüyordu. Mutlak blokta yükseklik
  // değişimi kendi alt ağacında kalıyor.
  const [contentHeight, setContentHeight] = useState(0);
  // Perdenin ölçüm gelmeden önceki TABANI. Notsuz kartta blok kısa olduğu için
  // taban kartın %33'ü; notlu kartta blok bundan çok daha uzun ve ilk karede
  // %33'e düşüp `onLayout` ile gerçek boya SIÇRIYORDU — sekmeye her girişte
  // görünen "perde flash"ının sebebi buydu.
  // Notlu kartta taban artık kapalı kutunun kendi ölçülerinden hesaplanıyor
  // (NOTE_CARD_BLUR_FLOOR): ilk kare zaten doğru yerde, `onLayout` yalnız
  // birkaç piksellik farkı düzeltiyor — o da görünmüyor.
  const blurFloor = item.note?.comment
    ? NOTE_CARD_BLUR_FLOOR
    : CARD_HEIGHT * 0.33;
  // Perde kutuyla birlikte uzuyor: yükseklik state'ten değil, kutunun sürdüğü
  // ilerlemeden geliyor — arada bir kare bile kaysa perde zıplıyor gibi
  // okunuyor.
  const bottomBlurStyle = useAnimatedStyle(
    () => ({
      height: Math.min(
        CARD_HEIGHT,
        Math.max(
          blurFloor,
          contentHeight + noteProgress.value * noteGrowth + BOTTOM_BLUR_LEAD,
        ),
      ),
    }),
    [contentHeight, noteGrowth, blurFloor],
  );

  // Kartta gösterilecek üniversite. `WhoLikedMe` liste yanıtı bu alanı her
  // zaman taşımıyor (DETAY yanıtı taşıyor) — boşsa satır hiç çizilmiyor.
  // Alan kartı kuran map'te `universityNameDisplay`'den dolduruluyor: ham
  // `universityName` DB'deki Türkçe resmî ad, dile göre değişmiyor.
  const universityLabel = item.universityName;

  // İsim/yaş/üniversite — not açılırken yavaşça siliniyor. Kutu onların üstüne
  // doğru büyüdüğü için ikisi bir arada kalsaydı yazı yazının üstüne binerdi;
  // açık haldeki tek konu notun kendisi.
  const identityStyle = useAnimatedStyle(
    () => ({ opacity: 1 - noteProgress.value }),
    [],
  );

  // Çıkış — kart yalnız GÖRSEL olarak gider; veriden düşürmeyi ekran yapıyor
  // (bkz. runCardExit), o yüzden burada bitişte çağrılacak bir callback yok.
  // Hepsi transform/opacity: layout'a dokunmadığı için kare başına Fabric
  // commit'i doğurmaz, boşluğun kapanması ayrı iş (itemLayoutAnimation).
  const exitProgress = useSharedValue(0);
  useEffect(() => {
    if (!exitDirection) {
      // Emniyet: çıkış başlayıp kart bir şekilde listede kalırsa (ör. tazeleme
      // onu geri getirdi) görünmez bir hayalet bırakmasın, yerine otursun.
      exitProgress.value = 0;
      return;
    }
    exitProgress.value = withTiming(1, {
      duration: CARD_EXIT_MS,
      easing: Easing.out(Easing.cubic),
    });
  }, [exitDirection, exitProgress]);
  // Kart dokunuşu tek iş yapıyor: profili aç. Eskiden bir de "açık kolonu
  // kapat" hâli vardı (kart çekilmişken dokunuş profili DEĞİL kapanmayı
  // tetikliyordu); kolon kalkınca o dal da gitti.
  const handleCardPress = useCallback(() => {
    onPress?.(item);
  }, [onPress, item]);

  // Köşe butonunun sarmalayıcıları — prop'lar kartı parametre alıyor.
  const handleLike = useCallback(() => onLike?.(item), [onLike, item]);
  const handleRecoverPress = useCallback(
    () => onRecover?.(item),
    [onRecover, item],
  );
  const handleSkip = useCallback(() => onSkip?.(item), [onSkip, item]);
  // ⚠️ `handleMenu` SİLİNDİ: üç nokta butonu kaldırıldı, çağıracak bir şey
  // kalmadı. Buton geri gelirse satır aynen geri yazılır —
  // `useCallback(() => onMenu?.(item), [onMenu, item])`.

  const exitAxis =
    exitDirection === "left" ? -1 : exitDirection === "right" ? 1 : 0;
  const exitStyle = useAnimatedStyle(() => {
    const p = exitProgress.value;
    return {
      opacity: 1 - p,
      // `as const`: RN'in transform tipi her elemanın TEK anahtarlı olmasını
      // istiyor, TS ise heterojen diziyi `{translateX; rotate?: undefined}`
      // birleşimi olarak çıkarıyor (bkz. SwipeCard'daki aynı kaçış).
      transform: [
        { translateX: exitAxis * width * 0.7 * p },
        // Hafif eğim — kaydırma jestinde kartın yaptığının aynısı; butonla
        // yapılan aksiyon da aynı hareketin karşılığı olarak okunsun.
        { rotate: `${exitAxis * 7 * p}deg` },
        { scale: 1 - 0.08 * p },
      ] as const,
    };
  }, [exitAxis]);

  return (
    <Animated.View
      // Uçarken dokunuş almasın: kart hâlâ ekranda ve basılırsa profil açılır
      // ya da ikinci bir aksiyon gider.
      pointerEvents={exitDirection ? "none" : "auto"}
      style={[
        {
          marginBottom: CARD_ROW_GAP,
          height: CARD_HEIGHT,
          justifyContent: "center",
        },
        exitStyle,
      ]}
    >
      {/* Basılı tutunca YALNIZ ölçü değişir, opaklık değil (activeOpacity 1):
          kart bir fotoğraf taşıyor, soldurmak onu "pasif" gösteriyordu.
          Ölçü düşüşü kasten çok küçük (0.98) — büyük bir yüzeyde 0.97'lik
          varsayılan bile kartı yerinden oynatıyormuş gibi okunuyor. Yaylanma
          kapalı: bırakışta 1'i geçen taşma, tam genişlikteki kartta liste
          zıplıyormuş hissi veriyor (bkz. AnimatedPressable'daki not). */}
      <AnimatedPressable
        activeOpacity={1}
        pressScale={0.98}
        pressBounciness={0}
        onPress={handleCardPress}
        style={{
          width: CARD_WIDTH,
        }}
      >
        <View
          style={{
            width: CARD_WIDTH,
            height: CARD_HEIGHT,
            borderRadius: 40,
            borderWidth: 0.3,
            borderColor: colors.hairline,
            borderCurve: "continuous",
            overflow: "hidden",
            backgroundColor: colors.surface,
          }}
        >
          {/* İskelet ZEMİNDE, fotoğrafın ALTINDA duruyor: görsel yüklenince
              üstüne biner (expo-image `transition`) ve shimmer kendiliğinden
              görünmez olur. Eskiden fotoğrafın ÜSTÜNDE mutlak bir katmandı —
              `imgLoading` bir şekilde false'a dönmezse (aşağıdaki onError /
              emniyet freni bunun içindir) kart sonsuza kadar yüklenir gibi
              duruyordu; blur da o shimmer'ın üstüne binince kart "takıldı"
              gibi okunuyordu.
              Fotoğrafı HİÇ olmayan kartta shimmer yok: gelecek bir şey yokken
              parlatmak yükleniyor yanılsaması yaratır, düz yüzey doğru cevap
              (kartın kendi `backgroundColor`'ı zaten o). */}
          {imgLoading && !!item.mainPhoto && (
            <View
              style={{
                position: "absolute",
                top: 0,
                left: 0,
                right: 0,
                bottom: 0,
              }}
              pointerEvents="none"
            >
              <SkeletonBox
                width={CARD_WIDTH}
                height={CARD_HEIGHT}
                borderRadius={40}
              />
            </View>
          )}

          {item.mainPhoto ? (
            <Image
              source={{ uri: item.mainPhoto }}
              style={{ width: "100%", height: "100%" }}
              contentFit="cover"
              cachePolicy="memory-disk"
              // Sekme dönüşlerinde 0 (bkz. photoTransition).
              transition={photoTransition}
              // Kart geri dönüp aynı görünüme oturduğunda expo-image'ın
              // eski kaynağı bir kare boyunca tutmasını engelliyor.
              recyclingKey={item.mainPhoto}
              // Kimlik perdesinin ALT katmanı (bkz. LOCKED_CARD_*): kilitliyken
              // fotoğrafın kendisi bulanık çiziliyor, üstteki BlurView bunun
              // üstüne biniyor.
              blurRadius={showClear ? 0 : LOCKED_CARD_PHOTO_BLUR_RADIUS}
              onLoadStart={() => {
                if (!loadedPhotoUris.has(item.mainPhoto)) setImgLoading(true);
              }}
              onLoadEnd={() => {
                loadedPhotoUris.add(item.mainPhoto);
                setImgLoading(false);
              }}
              // `onLoadEnd` hata dalında da tetiklenmeli ama expo-image bunu her
              // hata türünde garanti etmiyor; ölü bir link iskeleti ekranda
              // bırakmasın.
              onError={() => setImgLoading(false)}
            />
          ) : null}

          {!showClear &&
            // Üst üste binen katmanlar — gerekçesi LOCKED_CARD_BLUR_LAYERS'ın
            // yanında. `key` indeks: liste sabit uzunlukta ve elemanlar
            // birbirinin aynısı, sıralanma/eklenme yok.
            Array.from({ length: LOCKED_CARD_BLUR_LAYERS }, (_, i) => (
              <BlurView
                key={i}
                // Açık modda daha DÜŞÜK olabiliyor ama yalnız Android'de —
                // gerekçesi sabitin yanında (iOS'ta kısmak bulanıklığı da
                // alır, kimliği açar).
                intensity={
                  isLight()
                    ? LOCKED_CARD_BLUR_INTENSITY_LIGHT
                    : LOCKED_CARD_BLUR_INTENSITY
                }
                // Ne sabit BEYAZ ne sabit SİYAH: ikisi de bu kalınlıkta
                // (2 katman × intensity 100) kartı düz bir pula çeviriyordu —
                // beyazı sütlü, siyahı kömür. Sistem malzemesi ikisinin arası:
                // aynı kalınlıkta bile altındaki fotoğrafın rengini geçiriyor,
                // yani kart hâlâ "bulanık bir fotoğraf" gibi okunuyor.
                // Kartın NOT KUTUSU da aynı kaptan besleniyor — tek kartta iki
                // farklı cam malzemesi olmuyor. Açık modda bir kademe incesi
                // (bkz. lockedVeilTint): chrome'un açık hâli iki katmanda
                // fotoğrafı tamamen yutuyordu.
                // ⚠️ Bu tint MODLA DÖNÜYOR (foto üstü örtüler için istisna,
                // bkz. theme/blur.ts) → placeholder kutuları da dönmek zorunda.
                tint={lockedVeilTint()}
                style={StyleSheet.absoluteFill}
              />
            ))}

          {/* Açık modun karartması — gerekçesi LOCKED_CARD_VEIL_SCRIM_LIGHT'ın
              yanında. Koyu modda YOK: orada karartmayı malzemenin kendisi
              yapıyor, üstüne bir de perde binerse kart kömüre döner. */}
          {!showClear && isLight() && (
            <View
              pointerEvents="none"
              style={[
                StyleSheet.absoluteFill,
                { backgroundColor: scrimAt(LOCKED_CARD_VEIL_SCRIM_LIGHT) },
              ]}
            />
          )}

          {/* Sağ üst köşe — TEK cam buton: kaçırdıkların sekmesinde KURTAR,
              diğerlerinde BEĞEN.
              ⚠️ Rozet (fire kalbi / not balonu) buradan KALDIRILDI: köşe
              artık bir aksiyonun yeri, iki şey aynı hizada durunca hangisinin
              basılabilir olduğu belirsizleşiyordu. Kartın hangi ürün olduğu
              zaten başka yerden okunuyor — notlu kartta alt bloktaki not
              kutusu, Fire'da sekmenin kendisi (Beğeniler'in "Süper
              beğeni" filtresi).

              Kap responder'ı ÜSTLENİYOR ve bu şart: butona basmak aksiyonu
              göndermenin YANINDA profili de açıyordu. Sebep, dokunuşun iki ayrı
              sistemde birden karşılanması — cam butonun basışını SwiftUI
              (iOS'ta RCTTouchHandler dokunuşu iptal etmiyor), kartınkini ise
              RN'in responder zinciri görüyor ve kartın kendi TouchableOpacity'si
              sorulan ilk kap oluyordu. Burada zinciri kesince kart artık
              responder olamıyor; butonun native dokunuşuna dokunulmuyor,
              Android'de de içerideki TouchableOpacity daha derin olduğu için o
              kazanmaya devam ediyor.
              `onResponderTerminationRequest` BİLEREK ezilmiyor: parmak butonun
              üstünden kaydırmaya başlarsa liste dokunuşu devralsın, buton
              kaydırmayı kilitlemesin.

              KOLON, YAN YANA DEĞİL (istek): butonlar yukarıdan aşağı tik → X →
              üç nokta. Üç nokta ESKİDEN SOL üst köşedeydi ve aksiyon ikilisinden
              küçüktü; artık aynı kolonda ve AYNI ÇAPTA — kartın üstündeki bütün
              dokunulabilir şeyler tek bir sütunda, parmak tek yerde kalıyor.
              Sıra kasıtlı: en üstte en çok istenen aksiyon. */}
          <View
            onStartShouldSetResponder={() => true}
            onResponderRelease={() => {}}
            style={{
              position: "absolute",
              top: CARD_TOP_RIGHT_INSET,
              right: CARD_TOP_RIGHT_INSET,
              // Tek butonda etkisi yok; ikinci/üçüncü buton (bkz. `onSkip`,
              // `onMenu`) geldiğinde kolon olarak dizilirler.
              flexDirection: "column",
              alignItems: "center",
              gap: CARD_CORNER_PAIR_GAP,
            }}
          >
            {onRecover ? (
              <RecoverGlassButton
                onPress={handleRecoverPress}
                label={recoverLabel}
                mode={mode}
              />
            ) : (
              // Beğeni kartlarında köşedeki tek buton BEĞEN. "Geç" burada
              // YOK ve bilerek yok: kartın üstünde iki buton, kolondaki
              // ikilinin kopyası olur ve köşe kalabalıklaşırdı — kısayol
              // olarak asıl istenen aksiyon beğeni. Geç hâlâ kolonda (ve
              // kartı sola çekmek zaten o jestin kendisi).
              //
              // Kabuk kurtarma butonuyla AYNI ölçüde ve o da prominent:
              // ikisi aynı köşenin iki hâli, biri sade cam olsaydı sekme
              // değiştirince köşe zayıflıyormuş gibi okunurdu.
              //
              // Renk Fire/Spark kalbinin tonu ve MODLA DÖNÜYOR
              // (`modeFireTint`): kurtarma butonu (RecoverGlassButton) zaten
              // modun rengini alıyordu, tik sabit kırmızı kalınca Arkadaş
              // modunda aynı köşenin iki hâli iki ayrı renkte çiziliyordu.
              <CardActionGlassButton
                testID="likes-accept"
                variant="prominent"
                name="checkmark"
                fallback={Check}
                tintColor={modeFireTint(mode)}
                glyphColor={colors.onMedia}
                size={CARD_CORNER_GLASS_SIZE}
                // İşaret Keşif'in tik/X'iyle aynı puntoda, DAİRE eskisi gibi:
                // çapı kutu belirliyor (bkz. iki sabitin yanındaki not).
                glyphSize={CARD_CORNER_GLYPH_SIZE}
                glyphBoxSize={CARD_CORNER_GLYPH_BOX}
                // `busy` YOK: istek fire-and-forget gidiyor ve kart aynı karede
                // düşüyor, beklenen bir yanıt yok. Free kullanıcıda da
                // dönmemeli — tek "bekleme" paywall öncesi sessiz entitlement
                // tazelemesi (bkz. actingRef). Kurtarma butonu da (2026-09-02'den
                // beri) AYNI: köşedeki iki hâlin basışa cevabı ayrışmıyor.
                onPress={handleLike}
                label={likeLabel}
              />
            )}

            {/* AKIŞ YANITLARININ İSTİSNASI (bkz. onSkip): kolonda İKİNCİ buton,
                tikin TAM ALTINDA ve onunla aynı çapta.
                Beğeni kartında "geç" burada bilerek yok çünkü o aksiyonun başka
                bir evi var — profildeki swipe. Gelen yanıtta yok: "geç" yanıtı
                kalıcı olarak reddediyor ve kartın üstünde görünür olmak zorunda,
                yoksa kullanıcının elinde yalnız "kabul" kalıyor. Sade cam + X
                (prominent DEĞİL): olumlu aksiyon tek başına öne çıksın — ayrım
                CardActionGlassButton'ın `variant` notunda. */}
            {onSkip ? (
              <CardActionGlassButton
                testID="likes-reject"
                variant="clear"
                name="xmark"
                fallback={X}
                tintColor={colors.onMedia}
                glyphColor={colors.onMedia}
                size={CARD_CORNER_GLASS_SIZE}
                glyphSize={CARD_CORNER_GLYPH_SIZE}
                glyphBoxSize={CARD_CORNER_GLYPH_BOX}
                onPress={handleSkip}
                label={skipLabel}
              />
            ) : null}

            {/* ⚠️ ÜÇ NOKTA KALDIRILDI (istek, 2026-10-10). Kısa ömürlü oldu:
                sol üst köşede küçük bir butondu, bu kolona taşındı, ölçüsü
                aksiyonlarla eşitlendi, glifi Keşif'in üç noktasına indirildi ve
                sonra tamamen kalktı.
                ⚠️ BUNUNLA BİRLİKTE AKIŞ YANITININ ŞİKAYET/ENGELLEME KAPISI DA
                GİTTİ: kartın üstünde o akışı açan başka bir giriş yok. Geri
                istenirse `onMenu`/`menuLabel` prop'ları hâlâ burada duruyor —
                eksik olan tek şey bu blok (`CardActionGlassButton`, variant
                "clear", name "ellipsis"; glif kutusu için `glyphBoxSize`
                uyarısı CardActionGlassButton'da). */}
          </View>

          {/* İsim & yaş — kartın sol altında, beyaz. Okunabilirlik için alt gradient scrim. */}
          {showClear && (
            <>
              {/* Alt progressive blur — SwipeCard'ın collapsed bottom blur'u gibi.
                  Karartma yerine maskeli hafif blur (üstten transparan → alta doğru).
                  Yükseklik SABİT DEĞİL: alt blok ne kadar yer kaplıyorsa perde
                  onun tepesinden başlıyor (+ nefes payı), yani isim satırı her
                  zaman perdenin İÇİNDE kalıyor. Not açılıp kapandıkça yükseklik
                  değişiyor — o değişim kutununkiyle AYNI değerden sürülüyor
                  (bkz. bottomBlurStyle), yoksa perde kutudan önce/sonra sıçrıyor.
                  İlk karenin doğru yerde başlaması ise `blurFloor`un işi. */}
              <Animated.View
                pointerEvents="none"
                style={[
                  {
                    position: "absolute",
                    left: 0,
                    right: 0,
                    bottom: 0,
                  },
                  bottomBlurStyle,
                ]}
              >
                <MaskedView
                  style={{ flex: 1 }}
                  maskElement={
                    <LinearGradient
                      {...(easeGradient({
                        colorStops: {
                          0: { color: "transparent" },
                          0.5: { color: "black" },
                          1: { color: "rgba(0,0,0,0.99)" },
                        },
                      }) as any)}
                      style={StyleSheet.absoluteFill}
                    />
                  }
                >
                  {/* Duraklar `cardPhotoScrim`ten: koyu modda eski değerler
                      (0.1 → mediaScrimSoft'un 0.45'i), açık modda ikisi de bir
                      tık koyu. */}
                  <LinearGradient
                    colors={[
                      cardPhotoScrim(CARD_PHOTO_SCRIM_TOP),
                      cardPhotoScrim(CARD_PHOTO_SCRIM_BOTTOM),
                    ]}
                    style={StyleSheet.absoluteFill}
                  />
                  <BlurView
                    intensity={15}
                    tint={
                      Platform.OS === "ios"
                        ? "systemChromeMaterialDark"
                        : "systemMaterialDark"
                    }
                    style={StyleSheet.absoluteFill}
                  />
                </MaskedView>
              </Animated.View>
              {/* Notlu kartta blok kart tabanına daha yakın oturuyor (bkz.
                  CARD_BOTTOM_INSET_NOTE): kutu bir satır bile eklendiğinde
                  fotoğrafın ortasına doğru tırmanıyordu.
                  Blok tabana çivili: not açılınca yüksekliği büyüyor ve TEPESİ
                  yukarı kayıyor — fotoğraf da isim de bu yüzden kutuyla
                  birlikte akıyor. Bunun için ayrı bir animasyon YOK, kutunun
                  yüksekliği gerçekten kare kare değişiyor.
                  ⚠️ MUTLAK KONUM ŞART, akışa alma: sebebi contentHeight'ın
                  yanındaki notta. */}
              <View
                onLayout={(e) => {
                  // Açılış/kapanış sırasında ölçme (bkz. noteSettlingRef).
                  if (noteSettlingRef.current || noteExpanded) return;
                  // Perdenin boyu bloğun TEPESİNDEN kart tabanına: kendi
                  // yüksekliği + tabana uzaklığı (bkz. blockBottom).
                  setContentHeight(e.nativeEvent.layout.height + blockBottom);
                }}
                style={{
                  position: "absolute",
                  left: item.note?.comment
                    ? CARD_SIDE_INSET
                    : CARD_SIDE_INSET_PLAIN,
                  right: item.note?.comment
                    ? CARD_SIDE_INSET
                    : CARD_SIDE_INSET_PLAIN,
                  bottom: blockBottom,
                }}
              >
                {/* Ürün pill'i — isim satırının ÜSTÜNDE. Karttaki tek tür
                    işareti: köşedeki rozet (Fire kalbi / not balonu)
                    orası bir aksiyonun yeri olduğu için kaldırılmıştı ve
                    "Beğeniler"de türü sekme söylüyordu; "Kaçırdıkların" tek
                    karma liste olduğu için orada hiçbir şey söylemiyordu.
                    YALNIZ FIRE'DA: notta kartın kendi not kutusu zaten
                    ne olduğunu anlatıyor, düz beğenide de söylenecek bir şey
                    yok — kartın listede olması zaten "beğendi" demek.
                    ⚠️ Kimlik satırları gibi `identityStyle` ile SOLMUYOR,
                    doğrudan kaldırılıyor. Not açılınca kutu bu satırların
                    üstüne büyüdüğü için gitmesi gerekiyor; geçişi yumuşatmak
                    için buraya fade EKLEME — kimlik satırları zaten soluyor,
                    ikinci bir soluşan katman geçişi bulanıklaştırıyor.
                    ⚠️ Fire + not aynı kartta olursa blok bu pill kadar
                    (~32px) uzuyor; NOTE_CARD_BLUR_FLOOR / NOTE_IDENTITY_BLOCK
                    tahminleri bunu saymıyor. Bilinçli: ölçüm zaten `onLayout`ile
                    düzeliyor, sapma yalnız ilk karede ve perdede görünmüyor. */}
                {item.isSuperLike && !!fireLabel && !noteExpanded && (
                  <FirePill label={fireLabel} accent={modeAccent(mode)} />
                )}
                <Animated.View
                  style={[
                    {
                      flexDirection: "row",
                      alignItems: "baseline",
                      maxWidth: "90%",
                    },
                    identityStyle,
                  ]}
                >
                  <Text
                    numberOfLines={1}
                    style={{
                      flexShrink: 1,
                      color: colors.onMedia,
                      fontSize: LIKE_CARD_NAME_SIZE,
                      lineHeight: LIKE_CARD_NAME_LINE,
                      fontWeight: "700",
                    }}
                  >
                    {item.name}
                  </Text>
                  {item.age != null && (
                    <Text
                      style={{
                        flexShrink: 0,
                        color: colors.onMedia,
                        fontSize: LIKE_CARD_NAME_SIZE,
                        lineHeight: LIKE_CARD_NAME_LINE,
                        fontWeight: "700",
                      }}
                    >
                      {`, ${item.age}`}
                    </Text>
                  )}
                  {/* Foto doğrulama rozeti — yaşın HEMEN sağında, premium'dan
                      ÖNCE (bkz. SelfieVerifiedBadge: sıra isim → doğrulama →
                      plus). Hizalama kuralı aynı: baseline satırında alignSelf
                      şart. */}
                  <SelfieVerifiedBadge
                    verified={item.isSelfieVerified}
                    size={selfieBadgeSize(LIKE_CARD_NAME_SIZE)}
                    style={{
                      flexShrink: 0,
                      marginLeft: 4,
                      alignSelf: "center",
                    }}
                  />
                  {/* Premium işareti — kart başlıklarındakinin AYNISI, satırın
                      SONUNDA; ölçü isim puntosundan türüyor (bkz. PremiumBadge).
                      `alignSelf` YOK: işaret artık daire değil metin, satırın
                      baseline hizası onu ismin tabanına oturtuyor — daire
                      döneminde gereken `center` yamasının işi bitti. */}
                  {item.isPremium && (
                    <PremiumBadge
                      fontSize={LIKE_CARD_NAME_SIZE}
                      style={{ marginLeft: 4 }}
                    />
                  )}
                </Animated.View>
                {/* Üniversite — isim/yaş satırının ALTINDA, aynı bloğun
                    ikinci satırı. `identityStyle` ile isimle birlikte solar:
                    not açılınca kutu bu iki satırın üstüne doğru büyüyor. */}
                {!!universityLabel && (
                  <Animated.Text
                    numberOfLines={1}
                    style={[
                      {
                        marginTop: LIKE_CARD_UNI_GAP,
                        maxWidth: "90%",
                        color: colors.onMedia,
                        fontSize: LIKE_CARD_UNI_SIZE,
                        lineHeight: LIKE_CARD_UNI_LINE,
                        fontWeight: "600",
                      },
                      identityStyle,
                    ]}
                  >
                    {universityLabel}
                  </Animated.Text>
                )}
                {/* Not — ismin ve üniversitenin ALTINDA, kendi kutusunda.
                    Kartın en değerli satırı: kişi bir şey YAZMIŞ. Hedef bilgisi
                    (hangi fotoğraf / hangi prompt) kutunun solunda duruyor —
                    notun anlamı neye yazıldığından ayrılamıyor (bkz.
                    LikeNoteBox). */}
                {!!item.note?.comment && (
                  <LikeNoteBox
                    note={item.note}
                    expanded={noteExpanded}
                    onToggle={toggleNote}
                    progress={noteProgress}
                    onExpandInfo={setNoteGrowth}
                  />
                )}
              </View>
            </>
          )}

          {/* Blurlu (kilitli) kartlar — Bumble'ın "Liked You" kartı gibi:
              isim yerinde TEK gri bar (+ foto doğrulama rozeti), altında
              kimliği açmayan iki ipucu pili (üniversite, ilişki niyeti).
              Eskiden iki gri bar vardı (isim + üniversite); iki bar yükleme
              iskeletiyle (SkeletonBox) birebir aynı dile sahipti ve kart
              "hâlâ yükleniyor" gibi okunuyordu. Bir ara kartın ortasına kilit
              glifi de denendi; o da kartı bir paywall duvarına çeviriyordu.
              İpucu ikisini de çözüyor: kart yüklenmiyor, kapalı ama İÇİNDE
              BİRİ VAR — paywall'ın gerekçesi kartın kendisinde.
              ⚠️ İpucuya isim/yaş/şehir EKLEME — bkz. likerCardTeaser
              (üniversite 2026-10-05'te bilerek içeri alındı, gerekçesi orada).

              KOYU MODDA bar/pil perdenin TERSİ olmak zorunda; aynı yöndeki bir
              kutu camın içinde kaybolur. AÇIK MODDA kutu artık perdeyle aynı
              yönde (yüzey grisi) ve kontrastı koyu YAZI taşıyor — bkz. barFill.
              `isLight()` render sırasında okunuyor — modül seviyesinde
              sabitlenirse tema değişince bayat kalır (bkz. theme/colors.ts).
              Bar genişliği gerçek metin uzunluğuna göre dinamik (karakter ≈ px). */}
          {!showClear &&
            (() => {
              const light = isLight();
              const boxInk = light ? scrimAt : onMediaAt;
              const teaserInk = light
                ? scrimAt(LOCKED_TEASER_INK_ALPHA_LIGHT)
                : colors.onMedia;
              // AÇIK MODDA kutular artık KOYU DEĞİL: zemin, sayfanın kendi
              // yüzey token'ı (`colors.surface` — profildeki accordion'larla
              // AYNI gri). Koyu alfa barı ve pilleri kartın en ağır öğesi
              // yapıyordu; açık temada ekranın geri kalanı yüzey grisi olduğu
              // için bu gri kartı listenin diline bağlıyor.
              // Yazı/ikon rengi hâlâ TERS yönde (`teaserInk`, koyu) — polarite
              // kuralı ölmedi, yalnız zeminden yazıya taşındı.
              // ⚠️ Zemin OPAK: aynı griyi alfayla kurmak camın ve
              // `LOCKED_CARD_VEIL_SCRIM_LIGHT` perdesinin üstünde parlak bir
              // fotoğrafta eriyip koyu yazıyı okunmaz bırakıyor.
              const barFill = light ? colors.surface : boxInk(0.6);
              const teaserFill = light
                ? colors.surface
                : boxInk(LOCKED_TEASER_FILL_ALPHA);
              const maxW = CARD_WIDTH - CARD_SIDE_INSET_PLAIN * 2;
              const nameText =
                item.age != null
                  ? `${item.name || ""}, ${item.age}`
                  : item.name || "";
              // Karakter ≈ px oranı isim ölçüsüne bağlı: 700 ağırlıkta bir
              // karakterin ortalama genişliği punto'nun yarısına yakın.
              const nameW = Math.min(
                maxW,
                Math.max(
                  28,
                  Math.round(nameText.length * LIKE_CARD_NAME_SIZE * 0.53),
                ),
              );
              // İpucunun İLK pili artık HOBİ DEĞİL ÜNİVERSİTE (2026-10-05).
              // Hobi tek kelime ve çoğu kartta aynı ("Müzik", "Spor") —
              // merak uyandırmıyordu; üniversite ise free kullanıcının
              // kartı açtıracak tek somut ortaklık. Açık karttaki üniversite
              // satırıyla AYNI kaynak (`universityLabel`), yani kart kilidi
              // açılınca bilgi yer değiştirmiyor, yalnız pilden satıra geçiyor.
              // Alan boş gelebiliyor (liste yanıtı her zaman taşımıyor, kişi
              // gizlemiş olabilir) — o kartta satırda yalnız niyet pili kalır.
              const intentLabel = resolveIntentLabel?.(item) ?? "";
              const pillStyle = {
                flexDirection: "row" as const,
                alignItems: "center" as const,
                height: LOCKED_TEASER_PILL_HEIGHT,
                paddingHorizontal: LOCKED_TEASER_PILL_PAD_H,
                borderRadius: 999,
                borderCurve: "continuous" as const,
                backgroundColor: teaserFill,
              };
              const pillTextStyle = {
                marginLeft: 6,
                color: teaserInk,
                fontSize: LOCKED_TEASER_TEXT_SIZE,
                fontWeight: "600" as const,
              };
              // Kilitli kart notsuz beğenidir (not Likes'ta blursuz
              // geliyor): blok açık kartın kimlik bloğuyla AYNI paylarda
              // duruyor ki listede kilitli/açık kartların isim satırları aynı
              // hizaya gelsin (bkz. blockBottom). Blok tabana çivili: pil
              // satırı eklenince bar yukarı çıkıyor, piller açık karttaki
              // üniversite satırının yerini alıyor.
              return (
                <View
                  style={{
                    position: "absolute",
                    left: CARD_SIDE_INSET_PLAIN,
                    right: CARD_SIDE_INSET_PLAIN,
                    bottom: blockBottom,
                  }}
                  pointerEvents="none"
                >
                  <View style={{ flexDirection: "row", alignItems: "center" }}>
                    <View
                      style={{
                        width: nameW,
                        height: 18,
                        borderRadius: 6,
                        backgroundColor: barFill,
                      }}
                    />
                    {/* Rozet açık karttakiyle AYNI ölçü ve renk (beyaz):
                        doğrulanmış olmak kimlik değil, güven sinyali —
                        free'ye verilebilecek en ucuz ve en ikna edici ipucu. */}
                    <SelfieVerifiedBadge
                      verified={item.isSelfieVerified}
                      size={selfieBadgeSize(LIKE_CARD_NAME_SIZE)}
                      style={{ marginLeft: 8 }}
                    />
                  </View>
                  {(!!universityLabel || !!intentLabel) && (
                    <View
                      style={{
                        flexDirection: "row",
                        alignItems: "center",
                        marginTop: LOCKED_TEASER_ROW_GAP,
                      }}
                    >
                      {!!universityLabel && (
                        // İKİ pil de daralıyor: hobi döneminde ilk pil
                        // `flexShrink: 0` ile sabitti (tek kelimeydi), ama
                        // üniversite adı niyet etiketinden bile uzun olabiliyor
                        // ("Orta Doğu Teknik Üniversitesi") — sabit kalsaydı
                        // satırı taşırıp niyet pilini kartın dışına atardı.
                        // İkisi de esneyince Yoga uzun olanı daha çok kırpıyor.
                        <View
                          style={[
                            pillStyle,
                            {
                              flexShrink: 1,
                              marginRight: intentLabel
                                ? LOCKED_TEASER_PILL_GAP
                                : 0,
                            },
                          ]}
                        >
                          {/* Üniversite ikonu uygulamanın her yerinde aynı
                              (bkz. filterEnumIcons / UniversityVisibilitySheet):
                              `graduationcap.fill`. */}
                          <SFIcon
                            name="graduationcap.fill"
                            fallback={GraduationCap}
                            size={LOCKED_TEASER_ICON_SIZE}
                            color={teaserInk}
                            strokeWidth={2}
                            weight="semibold"
                          />
                          <Text
                            numberOfLines={1}
                            style={[pillTextStyle, { flexShrink: 1 }]}
                          >
                            {universityLabel}
                          </Text>
                        </View>
                      )}
                      {!!intentLabel && (
                        <View style={[pillStyle, { flexShrink: 1 }]}>
                          <SFIcon
                            name="magnifyingglass"
                            fallback={Search}
                            size={LOCKED_TEASER_ICON_SIZE}
                            color={teaserInk}
                            strokeWidth={2}
                            weight="semibold"
                          />
                          <Text
                            numberOfLines={1}
                            style={[pillTextStyle, { flexShrink: 1 }]}
                          >
                            {intentLabel}
                          </Text>
                        </View>
                      )}
                    </View>
                  )}
                </View>
              );
            })()}
        </View>
      </AnimatedPressable>
    </Animated.View>
  );
}

// Sığ karşılaştırma yetiyor: prop'ların hepsi ya sabit fonksiyon, ya ilkel, ya
// da state dizisinden gelen sabit referanslı `item`. Bir kart ancak KENDİ bir
// şeyi değiştiğinde (açıldı, işlem görüyor, uçuyor) yeniden çiziliyor.
export const MemoLikeCard = memo(LikeCard);

export default MemoLikeCard;
