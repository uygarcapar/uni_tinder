/**
 * Beğeni/not kartı — fotoğraf kartı, kimlik bloğu ve ürün pill'i (Fire / not).
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
import {
  Dimensions,
  Platform,
  StyleSheet,
  Text,
  TouchableOpacity,
  View,
} from "react-native";
import { Image } from "expo-image";
import { LinearGradient } from "expo-linear-gradient";
import { BlurView } from "expo-blur";
import MaskedView from "@react-native-masked-view/masked-view";
import {
  DEFAULT_APP_MODE,
  modeAccent,
  modeFireTint,
} from "../modeTheme";
import { isUnlockedLike } from "../likeUnlock";
import { easeGradient } from "react-native-easing-gradient";
import Animated, {
  Easing,
  useAnimatedStyle,
  useSharedValue,
  withTiming,
} from "react-native-reanimated";
import {
  Check,
  ChevronRight,
  GraduationCap,
  Search,
  X,
} from "@/shared/icons";
import SFIcon from "@/shared/components/SFIcon";
import FireGlyph from "@/shared/components/FireGlyph";
import NoteGlyph from "@/shared/components/NoteGlyph";
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
  isLight,
  onMediaAt,
  scrimAt,
} from "@/shared/theme/colors";
import { chromeBlurTint } from "@/shared/theme/blur";
import {
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
 * (kartın alt perdesiyle aynı malzeme ailesi); açık
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
 * satırı ve ürün pill'i bunun üstünde duruyor. İki durak: tepede neredeyse yok,
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
// Kart başlığı — isim/yaş TEK yerden ölçülüyor: satırın kendisi ve blurlu
// kartın yerine geçen kutu hep buna bakar. Premium işaretinin puntosu da buradan türüyor, ayrı sabiti YOK
// (eskiden LIKE_CARD_FLAME_SIZE vardı; bkz. PremiumBadge > premiumBadgeFontSize).
const LIKE_CARD_NAME_SIZE = 22;
const LIKE_CARD_NAME_LINE = 26;
// Üniversite — kimlik bloğunun ikinci satırı. İsimden bir kademe küçük ama
// okunur; aralarındaki boşluk iki satırı ayrı iki bilgi gibi okutuyor (bitişik
// olduklarında tek bir sarkan cümle gibi görünüyorlardı). Yükseklik bütçeleri
// (perdenin boyu, bkz. bottomBlurHeight) bu üçüne bakıyor.
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

// ── Alt blok payları ─────────────────────────────────────────────────────────
// Not kutusu KALDIRILDI (2026-11-06): not artık isim satırının üstünde Fire
// pill'iyle aynı yapıda bir pill (bkz. LikeProductPill) ve metni basınca açılan
// sheet'te (LikeNoteSheet). Notlu kartın ayrı payları (CARD_SIDE_INSET /
// CARD_BOTTOM_INSET_NOTE) ve kutunun yükseklik bütçesi onunla birlikte gitti —
// notlu kart da düz kartın paylarını kullanıyor.
// ⚠️ Bu paylar listenin yan payıyla (LIST_H_PADDING) BİRLİKTE okunur: isim
// satırının ekran kenarına uzaklığı ikisinin toplamı.
const CARD_SIDE_INSET_PLAIN = 24;
const CARD_BOTTOM_INSET = 32;

// Alt perdenin içeriğin TEPESİNDEN yukarı taşan payı. Perde en üstte şeffaf
// başlayıp aşağı doğru koyulaştığı için (maske) bu pay olmadan geçiş tam isim
// satırının üstünde başlar ve isim keskin bir kenarın dibinde kalır.
const BOTTOM_BLUR_LEAD = 36;

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

// Not pill'inin sağındaki chevron. Yazı satırından küçük: işaret "açılır"
// demeli, yazıyla yarışmamalı. Chevron görsel bir boşluk taşıdığı için pill'in
// sağ dolgusu bu hâlde bir kademe dar (bkz. LIKE_CARD_PILL_PAD_RIGHT_CHEVRON).
const LIKE_CARD_PILL_CHEVRON_SIZE = 11;
const LIKE_CARD_PILL_PAD_RIGHT_CHEVRON = 10;

/**
 * İsim satırının üstündeki ürün pill'i — ürünün glifi + cümlesi. İki hâli var:
 *   • Fire/Spark: FireGlyph + "Sana Fire gönderdi". Bilgi, basılamaz.
 *   • Not: NoteGlyph + "Sana not bıraktı" + chevron. BASILABİLİR: notun metni
 *     kartta değil, basınca açılan sheet'te (LikeNoteSheet) okunuyor.
 *
 * Not pill'i Fire'ınkiyle BİREBİR aynı yapıda (istek, 2026-11-06): eskiden not
 * kartın alt bloğunda cam bir kutuda (LikeNoteBox) açılıp kapanıyordu; kutu
 * fotoğrafın üstüne tırmanıyor ve kartın en ağır öğesi oluyordu.
 *
 * Glif cümlenin yerine GEÇMİYOR, yanında duruyor: yazı ne olduğunu söylüyor,
 * glif onu bir bakışta seçilir kılıyor (bkz. i18n likes.firePill / notePill).
 *
 * Zemin SEÇİLİ MODUN vurgusu (`modeAccent`) — başlığın yanındaki "Beğenenleri
 * gör" pill'iyle (bkz. LikesListHeader) BİREBİR aynı dolgu, mürekkebi de aynı:
 * `onMediaInverse`, yani sabit koyu. `text` OLAMAZ, açık modda beyaza dönüp
 * dolgunun üstünde kaybolurdu; `onMedia` da olamaz, aynı sebeple ters yönde.
 * Mürekkep MODLA DÖNMÜYOR: iki vurgu da (kırmızı/yeşil) orta tonlu, ikisinin
 * üstünde de siyah okunuyor.
 *
 * ⚠️ Burada CAM YOK, bilerek: dolgu opak, `GlassView`in altındaki hiçbir şey
 * görünmeyeceği için efekt yalnız maliyet olurdu.
 *
 * ⚠️ Yarıçap 999 DEĞİL, yükseklikten türüyor (bkz. LIKE_CARD_PILL_RADIUS).
 *
 * ⚠️ Basılabilir hâl kartın kendi dokunuşunun (profili aç) İÇİNDE duruyor.
 * RN responder zinciri en derindeki adaydan başladığı için pill'in
 * TouchableOpacity'si kazanıyor; kart profili AÇMIYOR. Pill'i bir
 * SwiftUI/cam butona çevirirsen bu garanti biter (köşe kolonundaki
 * `onStartShouldSetResponder` kalıbı gerekir).
 */
function LikeProductPill({
  label,
  accent,
  glyph,
  onPress,
  accessibilityLabel,
}: {
  label: string;
  accent: string;
  /** Pill'in solundaki glif — rengi `colors.onMediaInverse` olmalı. */
  glyph: React.ReactNode;
  /** Verilirse pill basılabilir olur ve sağına chevron eklenir. */
  onPress?: () => void;
  accessibilityLabel?: string;
}) {
  const pressable = !!onPress;
  const style = {
    alignSelf: "flex-start" as const,
    maxWidth: "100%" as const,
    marginBottom: LIKE_CARD_PILL_GAP,
    paddingVertical: LIKE_CARD_PILL_PAD_V,
    paddingLeft: LIKE_CARD_PILL_PAD_H,
    paddingRight: pressable
      ? LIKE_CARD_PILL_PAD_RIGHT_CHEVRON
      : LIKE_CARD_PILL_PAD_H,
    borderRadius: LIKE_CARD_PILL_RADIUS,
    borderCurve: "continuous" as const,
    flexDirection: "row" as const,
    alignItems: "center" as const,
    gap: LIKE_CARD_PILL_ICON_GAP,
    backgroundColor: accent,
  };
  const content = (
    <>
      {/* Glifin altında disk YOK, doğrudan dolgunun üstünde duruyor. Rengi
          yazıyla AYNI ve SABİT (`onMediaInverse`): dolgu TEMAYLA dönmediği
          için (yalnız MODLA dönüyor) üstündeki hiçbir şey de dönmemeli. */}
      {glyph}
      <Text
        numberOfLines={1}
        // Kısalan taraf YAZI: glif ürünün işareti, dar kartta o değil yazı
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
      {pressable && (
        <SFIcon
          name="chevron.right"
          fallback={ChevronRight}
          size={LIKE_CARD_PILL_CHEVRON_SIZE}
          color={colors.onMediaInverse}
          strokeWidth={3}
          weight="bold"
        />
      )}
    </>
  );

  if (!pressable) return <View style={style}>{content}</View>;
  return (
    <TouchableOpacity
      onPress={onPress}
      activeOpacity={0.8}
      hitSlop={8}
      accessibilityRole="button"
      accessibilityLabel={accessibilityLabel ?? label}
      style={style}
    >
      {content}
    </TouchableOpacity>
  );
}

/**
 * ⚠️ `isUnlockedLike` BURADAN TAŞINDI → `@/features/discover/likeUnlock`.
 * Kuralı akış yazar kartı da okuyor (`feedCardMode > authorLikeVisible`) ve o
 * saf modül bu bileşene bağlanamaz. Buraya geri yazma: iki kopya, kuralın
 * kendi doc'undaki "ÇATALLAMAYIN" uyarısının tarif ettiği bug demek.
 */

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
  // Notlu kartın pill'i: metni ("Sana not bıraktı") ve basınca notu açan
  // handler. Handler KARTI parametre alıyor (memo için, bkz. aşağıdaki not);
  // notun metni kartta DEĞİL, ekranın açtığı sheet'te (LikeNoteSheet).
  noteLabel = undefined,
  noteOpenLabel = undefined,
  onNotePress = undefined,
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
  const blockBottom = CARD_BOTTOM_INSET;

  // Kartın pill'i — NOT ÖNCE: sekmeler de aynı sırayla ayrılıyor (bkz.
  // LikesScreen > likesByTab). Fire ve not aynı kayıtta BİRLİKTE gelemiyor (biri
  // gönderildikten sonra o kişiye ikincisi gönderilemiyor), sıra yalnız emniyet.
  // `isNote` tek başına da yetiyor: canlı gelen kartta önizleme boş olabiliyor
  // (bkz. LikesScreen'in incomingLike dalı) — pill yine not der, ama okunacak
  // metin olmadığı için basılamaz (chevron yok).
  const hasNote = !!item.note?.comment || !!item.isNote;
  const noteReadable = !!item.note?.comment && !!onNotePress;
  const handleNotePress = useCallback(
    () => onNotePress?.(item),
    [onNotePress, item],
  );

  // Alt bloğun (isim + üniversite + pill) kart tabanından ölçülen yüksekliği —
  // alt perdenin boyu buradan geliyor. `0` yalnız ilk kare; o karede perde
  // tabanında (kartın %33'ü) duruyor, blok ondan kısa olduğu için fark görünmez.
  const [contentHeight, setContentHeight] = useState(0);
  const bottomBlurHeight = Math.min(
    CARD_HEIGHT,
    Math.max(CARD_HEIGHT * 0.33, contentHeight + BOTTOM_BLUR_LEAD),
  );

  // Kartta gösterilecek üniversite. `WhoLikedMe` liste yanıtı bu alanı her
  // zaman taşımıyor (DETAY yanıtı taşıyor) — boşsa satır hiç çizilmiyor.
  // Alan kartı kuran map'te `universityNameDisplay`'den dolduruluyor: ham
  // `universityName` DB'deki Türkçe resmî ad, dile göre değişmiyor.
  const universityLabel = item.universityName;

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
                // Açık modda bir kademe incesi
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
                  zaman perdenin İÇİNDE kalıyor (bkz. bottomBlurHeight). */}
              <View
                pointerEvents="none"
                style={{
                  position: "absolute",
                  left: 0,
                  right: 0,
                  bottom: 0,
                  height: bottomBlurHeight,
                }}
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
              </View>
              {/* Kimlik bloğu — kart tabanına çivili, pill + isim + üniversite. */}
              <View
                onLayout={(e) => {
                  // Perdenin boyu bloğun TEPESİNDEN kart tabanına: kendi
                  // yüksekliği + tabana uzaklığı (bkz. blockBottom).
                  setContentHeight(e.nativeEvent.layout.height + blockBottom);
                }}
                style={{
                  position: "absolute",
                  left: CARD_SIDE_INSET_PLAIN,
                  right: CARD_SIDE_INSET_PLAIN,
                  bottom: blockBottom,
                }}
              >
                {/* Ürün pill'i — isim satırının ÜSTÜNDE. Karttaki tek tür
                    işareti: köşedeki rozet (Fire kalbi / not balonu) orası bir
                    aksiyonun yeri olduğu için kaldırılmıştı; "Kaçırdıkların"
                    tek karma liste olduğu için türü sekme de söylemiyor.
                    Düz beğenide pill YOK — kartın listede olması zaten
                    "beğendi" demek. NOT ÖNCE (bkz. hasNote). */}
                {hasNote && !!noteLabel ? (
                  <LikeProductPill
                    label={noteLabel}
                    accent={modeAccent(mode)}
                    glyph={
                      <NoteGlyph
                        size={LIKE_CARD_PILL_ICON_SIZE}
                        color={colors.onMediaInverse}
                      />
                    }
                    onPress={noteReadable ? handleNotePress : undefined}
                    accessibilityLabel={noteOpenLabel}
                  />
                ) : item.isSuperLike && !!fireLabel ? (
                  <LikeProductPill
                    label={fireLabel}
                    accent={modeAccent(mode)}
                    glyph={
                      // Glif modla dönüyor: Flört alev, Arkadaş yıldız.
                      <FireGlyph
                        size={LIKE_CARD_PILL_ICON_SIZE}
                        color={colors.onMediaInverse}
                        mode={mode}
                      />
                    }
                  />
                ) : null}
                <View
                  style={{
                    flexDirection: "row",
                    alignItems: "baseline",
                    maxWidth: "90%",
                  }}
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
                </View>
                {/* Üniversite — isim/yaş satırının ALTINDA, aynı bloğun
                    ikinci satırı. */}
                {!!universityLabel && (
                  <Text
                    numberOfLines={1}
                    style={{
                      marginTop: LIKE_CARD_UNI_GAP,
                      maxWidth: "90%",
                      color: colors.onMedia,
                      fontSize: LIKE_CARD_UNI_SIZE,
                      lineHeight: LIKE_CARD_UNI_LINE,
                      fontWeight: "600",
                    }}
                  >
                    {universityLabel}
                  </Text>
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
