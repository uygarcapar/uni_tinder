import { memo, useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useTranslation } from "react-i18next";
import type PagerView from "react-native-pager-view";
import PagerTabBar, {
  AnimatedPagerView,
  usePagerScrollHandler,
  usePagerTabCommit,
} from "@/shared/components/PagerTabBar";
import {
  View,
  Text,
  Dimensions,
  TouchableOpacity,
  Platform,
  ScrollView,
  StyleSheet,
  AppState,
} from "react-native";
import { Image } from "expo-image";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { LinearGradient } from "expo-linear-gradient";
import { BlurView } from "expo-blur";
import MaskedView from "@react-native-masked-view/masked-view";
import { easeGradient } from "react-native-easing-gradient";
import * as Haptics from "expo-haptics";
import {
  Check,
  ChevronDown,
  MessageCircle,
  RotateCcw,
} from "@/shared/icons";
import SFIcon from "@/shared/components/SFIcon";
import SuperLikeGlyph from "@/shared/components/SuperLikeGlyph";
import NoteGlyph from "@/shared/components/NoteGlyph";
import { useNavigation } from "@react-navigation/native";
import Animated, {
  Easing,
  LinearTransition,
  useAnimatedStyle,
  useSharedValue,
  useAnimatedScrollHandler,
  withTiming,
} from "react-native-reanimated";
import { useAppDispatch } from "@/shared/hooks/redux";
import { refreshEntitlementsForPaywall } from "@/features/profile/subscriptionSlice";
import { usePremiumTier } from "@/features/profile/premiumTier";
import profileService from "@/features/profile/profileService";
import AnimatedPressable from "@/shared/components/AnimatedPressable";
import EmptyState from "@/shared/components/EmptyState";
import LikerSwipeModal from "@/features/discover/components/LikerSwipeModal";
import { openLitPlus } from "@/features/profile/litPlusEntry";
import RecoverGlassButton, {
  RECOVER_GLASS_GLYPH_SIZE,
  RECOVER_GLASS_SIZE,
} from "@/features/discover/components/RecoverGlassButton";
import CardActionGlassButton from "@/features/discover/components/CardActionGlassButton";
import SuperLikePurchaseModal from "@/features/discover/components/SuperLikePurchaseModal";
import NotePurchaseModal from "@/features/discover/components/NotePurchaseModal";
import ScreenHeader, {
  SCREEN_HEADER_TITLE_HEIGHT,
} from "@/shared/components/ScreenHeader";
import SkeletonBox from "@/shared/components/SkeletonBox";
import PremiumBadge from "@/shared/components/PremiumBadge";
import swipeService from "@/features/discover/swipeService";
import { resolveCardAge } from "@/features/discover/cardPrivacy";
import {
  useSwipeMutation,
  useSwipeStats,
} from "@/features/discover/swipeQueries";
import {
  fetchMissedMatches,
  recoverMissedMatch,
} from "@/features/discover/missedMatchRecovery";
import { normalizeLikerNote } from "@/features/discover/likerNote";
import { resolveRecoveryAccess } from "@/features/discover/recoveryQuota";
import {
  setWhoLikedMe,
  removeWhoLikedMe,
} from "@/features/discover/swipeSlice";
import { fetchConversations } from "@/features/chat/chatSlice";
import { showInfoToast, showMissedMatchToast } from "@/shared/services/toaster";
import { runFlameSweep } from "@/features/discover/flameSweep";

import uiBus from "@/shared/services/uiBus";
import {
  colors,
  darkColors,
  gradients,
  ink,
  isLight,
  onMediaAt,
  scrimAt,
  veilSurface,
} from "../../../shared/theme/colors";
import { chromeBlurTint } from "@/shared/theme/blur";
import { GlassView } from "expo-glass-effect";
import { glassColorScheme, hasLiquidGlassSurface } from "@/shared/theme/glass";
import { useRenderCount } from "@/shared/debug/useRenderCount";

// ── Boş durum ikonları ──────────────────────────────────────────────────────
// Lucide `HeartCrack` / SF `heart.slash` DEĞİL: bu ekranın konusu süper beğeni
// ve not, ikisinin de uygulamaya özel kendi glyph'i var (SuperLikeGlyph /
// NoteGlyph — SwipeCard'daki kalp ve not kutusuyla birebir aynı şekil).
//
// DOLGU YOK, sadece kontur: dolu glif boş sayfada bir ürün rozeti gibi
// okunuyor, "burada henüz bir şey yok" demiyordu. EmptyState `Icon`'a
// (size, color, strokeWidth) geçiriyor; `color` burada dolguya değil KONTURA
// bağlanıyor (glyph'lerin `stroke` prop'u), o yüzden bu iki sarmalayıcı var.
//
// Modül seviyesinde — render içinde tanımlansalar her render'da yeni bir tip
// olur, EmptyState'in ikonu boş yere yeniden mount ederdi.
type EmptyGlyphProps = {
  size?: number;
  color?: string;
  strokeWidth?: number;
};
const EmptyHeartIcon = ({ size, color, strokeWidth }: EmptyGlyphProps) => (
  <SuperLikeGlyph size={size} stroke={color} strokeWidth={strokeWidth} />
);
// Balonun içindeki kalp burada da delik (fillRule evenodd) — konturlu çizimde
// ikisi de ayrı ayrı çizilir, yani balonun içinde ince bir kalp kalır.
const EmptyNoteIcon = ({ size, color, strokeWidth }: EmptyGlyphProps) => (
  <NoteGlyph size={size} stroke={color} strokeWidth={strokeWidth} />
);

const { width } = Dimensions.get("window");
// Tek sütun: kart listenin TAM genişliğini kaplar. Aksiyon kolonu kartın
// ALTINDA duruyor ve kart sağdan sola çekilince ortaya çıkıyor (bkz.
// LikeCard'daki reveal jesti) — sürekli görünür bir kolon kartın genişliğini
// yiyordu ve dört glif kartla yarışıyordu.
// Kartlar ekranın kenarına yakın duruyor: aksiyon kolonu kartın ALTINDA
// olduğundan yan pay artık hiçbir şeye yer ayırmıyor, sadece kabuk payı.
// Daha geniş bir pay kartı ekranın ortasına doğru çekip fotoğrafı küçültüyordu.
const LIST_H_PADDING = 10;
// Sayfa başlığı + filtre satırı KARTLARLA DEĞİL, birbirleriyle hizalı. Kartın
// yan payı kabuk payı (fotoğraf kenara yaklaşsın diye dar); başlık ve sekmeler
// ise yazı — o dar payda ekranın kenarına yapışıyorlardı. İkisi de tek sayıdan
// besleniyor ki header bloğu kendi içinde tek bir sol hatta otursun.
const HEADER_LEFT_INSET = 16;
// Kartlar arası nefes — kartın kendi yüksekliği arttıkça büyük bir aralık
// listeyi seyreltiyor, kaydırırken bir sonraki kartın ucu geç görünüyordu.
const CARD_ROW_GAP = 10;
const CARD_WIDTH = width - LIST_H_PADDING * 2;
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
const CARD_HEIGHT = Math.round(CARD_METRIC_WIDTH * 1.24); // Aspect ratio

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
const lockedVeilTint = () =>
  isLight() ? ("systemThinMaterialLight" as const) : chromeBlurTint();
// Açık modun KARARTMA düğmesi — malzemede böyle bir düğme YOK: koyu modda
// intensity kartı karartıyor (malzeme siyah), açık modda ise BEYAZLATIYOR
// (malzeme beyaz). Yani "biraz daha koyu olsun" isteği açık tarafta camın
// ayarlarından çıkmıyor; camın ÜSTÜNE ince bir siyah perde gerekiyor.
// Blur'un ÜSTÜNDE duruyor, altında değil: altta kalsaydı iki katman onu da
// bulanıklaştırıp yutardı, perde ancak katmanlar bittikten sonra iş görüyor.
// Kimliği gizlemeye katkısı YOK (o hâlâ blurRadius'ün işi) — bu sayı sadece
// kartın ne kadar koyu okunduğunu ayarlıyor.
// ⚠️ Yükseltirken placeholder kutuları unutulmamalı: açık modda kutular KOYU
// (bkz. boxInk), perde koyulaştıkça kutularla arasındaki kontrast düşer.
const LOCKED_CARD_VEIL_SCRIM_LIGHT = 0.2;

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
// not balonu / superlike kalbi rozetleri buradan kaldırıldı (gerekçe LikeCard'da).
const CARD_TOP_RIGHT_INSET = 12;
// Köşedeki cam butonun çapı ve glifi — kurtar ve beğen TEK ölçüden besleniyor:
// ikisi aynı köşenin sekmeye göre değişen iki hâli, ayrı sayılara
// bağlansalardı sekme değiştirince köşe büyüyüp küçülüyormuş gibi okunurdu.
// Glif kabuğa göre dock'un oranından daha küçük — gerekçesi
// RECOVER_GLASS_GLYPH_SIZE'ın yanında.
// ⚠️ Sayılar SABİT DEĞİL: camsız yolda (iOS 26 altı + Android) ikisi de bir
// kademe küçülüyor, çünkü orada kabuk düz ve opak bir disk. Gerekçe yine
// RECOVER_GLASS_SIZE'ın yanında — buradaki iki sabit oradan türer, elle sayı
// yazma.
const CARD_CORNER_GLASS_SIZE = RECOVER_GLASS_SIZE;
const CARD_CORNER_GLYPH_SIZE = RECOVER_GLASS_GLYPH_SIZE;
// Kart başlığı — isim/yaş TEK yerden ölçülüyor: satırın kendisi, blurlu kartın
// yerine geçen kutu ve not kutusunun yükseklik bütçesi (NOTE_IDENTITY_BLOCK)
// hep buna bakar. Premium rozetinin çapı da buradan türüyor, ayrı sabiti YOK
// (eskiden LIKE_CARD_FLAME_SIZE vardı; bkz. PremiumBadge > premiumBadgeSize).
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
// Pill'in solundaki süper beğeni kalbi (SuperLikeGlyph) ve yazıya olan payı.
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
// Alt pay üstten GENİŞ — simetrik değil. Kutunun altında yazının yanı sıra
// chevron da duruyor (mutlak, bkz. NOTE_CHEVRON_BOTTOM); eşit paylarda ok
// yazının dibine yapışıyor ve kutunun alt kenarı sıkışık okunuyordu.
// ⚠️ Bu sayı chevron'un ÜSTÜNDEKİ boşluğu da belirliyor: ok akışta olmadığı için
// yazının son satırıyla arasındaki tek şey bu payın chevron'dan artan kısmı
// (pay − CHEVRON_BOTTOM − CHEVRON_SIZE). 30'ken o fark 2px'ti ve ok yazıya
// değiyor gibi duruyordu.
const NOTE_BOX_PAD_TOP = 22;
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
const CARD_EXIT_MS = 260;
// Kart düştükten sonra boşluğun kapanması. Çıkıştan biraz daha yavaş ve
// yumuşak: kart önce uçar, alttakiler sonra sakince yukarı kayar. İkisi eşit
// hızda olsaydı tek bir sıçrama gibi okunurdu.
const LIST_SHIFT_MS = 320;
// TEK örnek, render'da kurulmuyor: builder her çizimde yeniden üretildiğinde
// hücrelerin `layout` prop'u değişiyor ve mount'lu her kartın layout animasyonu
// baştan kaydediliyordu. Ekran sık çiziliyor; o iş sekme kayarken düşen bir
// commit'e denk geldiğinde geçiş takılıyordu.
const CARD_LAYOUT_TRANSITION = LinearTransition.duration(LIST_SHIFT_MS).easing(
  Easing.out(Easing.cubic),
);

// Ekran görünür olduğunda listenin bu yaştan eskiyse tazelenmesi. Tab'lar arası
// gidip gelmeyi her seferinde isteğe çevirmeyecek kadar uzun, "bildirime basıp
// girdim, beğeni orada olsun" beklentisini karşılayacak kadar kısa.
const LIKES_STALE_MS = 30 * 1000;

// Kurtarma 200 döndükten sonra `MatchNotification` için beklenen süre. Backend
// eşleşmeyi asenkron yazıyor ve sinyali SignalR taşıyor; bağlantı kopmuşsa
// sohbet backend'de vardır ama uygulama görmez. Süre dolduğunda sohbet listesi
// BİR KEZ tazeleniyor (döngü değil). Backend önerisi: 10 sn.
const MATCH_SIGNAL_TIMEOUT_MS = 10 * 1000;

// Skeleton yalnız istek gerçekten "bekleniyor" hissi verecek kadar sürerse
// görünür. Boş liste cevabı tipik olarak 200ms'nin altında dönüyor ve grid'i
// gösterip hemen boş duruma atlamak ekranda yanıp sönme olarak okunuyordu:
// önce gecikme (bu süre içinde biterse shimmer hiç çizilmez), bir kez çizildiyse
// de minimum süre ekranda kalır (30ms'lik shimmer yerine kasıtlı bir bekleme).
const SKELETON_DELAY_MS = 220;
const SKELETON_MIN_VISIBLE_MS = 450;

// Kart fotoğrafının iskelet zemininde en fazla bekleyeceği süre — bkz. LikeCard
// içindeki emniyet freni. Yavaş bağlantıda gerçek yüklemeyi kesmeyecek kadar
// uzun, takılan bir kartı ekranda bırakmayacak kadar kısa.
const IMAGE_LOAD_TIMEOUT_MS = 6000;

// Yatay padding + üst boşluk YOK: bu liste FlatList'in ListEmptyComponent'i
// olarak contentContainer'ın içinde çiziliyor, hizayı oradan alır. Böylece
// skeleton satırları gerçek kartlarla birebir aynı yerde durur.
// Aksiyon kolonu ÇİZİLMİYOR: gerçek kartta da görünmüyor (kart çekilince
// çıkıyor), iskelette göstermek veri gelince kaybolan bir kolon demek olurdu.
function LikesSkeletonList() {
  const placeholders = Array.from({ length: 3 });
  return (
    <View>
      {placeholders.map((_, i) => (
        <View key={i} style={{ marginBottom: CARD_ROW_GAP }}>
          <SkeletonBox
            width={CARD_WIDTH}
            height={CARD_HEIGHT}
            borderRadius={40}
          />
        </View>
      ))}
    </View>
  );
}

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
 * Bu ekranda İKİ cam yüzey var (not kutusunun zemini + süper beğeni pill'i) ve
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
 * İsim satırının üstündeki ürün pill'i — süper beğeni kalbi + "Sana Superlike
 * gönderdi".
 *
 * Kalp cümlenin yerine GEÇMİYOR, yanında duruyor: yazı ne olduğunu söylüyor,
 * kalp onu bir bakışta seçilir kılıyor (bkz. i18n likes.superLikePill).
 *
 * Zemin `litPlus` — başlığın yanındaki "Beğenenleri gör" pill'iyle (bkz.
 * LikesListHeader) BİREBİR aynı dolgu, mürekkebi de aynı: `onMediaInverse`,
 * yani sabit koyu. `text` OLAMAZ, açık modda beyaza dönüp dolgunun üstünde
 * kaybolurdu; `onMedia` da olamaz, aynı sebeple ters yönde.
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
function SuperLikePill({ label }: { label: string }) {
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
        backgroundColor: colors.litPlus,
      }}
    >
      {/* Kalbin altında disk YOK, glif doğrudan dolgunun üstünde duruyor.
          Rengi yazıyla AYNI ve SABİT (`onMediaInverse`): kırmızı dolgu modla
          dönmediği için üstündeki hiçbir şey de dönmemeli — açık modda da
          siyah. `ink()`/`colors.text` kullanma, ikisi de açık modda çevrilir. */}
      <SuperLikeGlyph
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
  const promptAnswer = target?.kind === "Prompt" ? target.promptAnswer : null;
  // Alıntı bloğu YALNIZ cevabı taşıyor: sorunun kendisi (`promptDisplay`)
  // bilerek çizilmiyor — gerekçe NOTE_CHIP_* sabitlerinin başında.
  // Cevap yoksa blok HİÇ çizilmiyor (eskiden soru tek başına çiziliyordu):
  // dikey çizgi + tırnak, neyi alıntıladığını söylemeyen bir işaret olurdu.
  // Hedefi zaten "promptuna not bıraktı" satırı anlatıyor.
  const showChip = !!promptAnswer;
  const comment = note?.comment ?? "";
  // Hedefi olmayan notta (eski kayıt / realtime önizleme) satır çizilmiyor:
  // neye yanıt verildiğini bilmiyorken "bu fotoğrafına" demek uydurma olurdu.
  const noteTargetLabel =
    target?.kind === "Photo"
      ? t("note.leftNoteOnPhoto")
      : target?.kind === "Prompt"
        ? t("note.leftNoteOnPrompt")
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
  // "…not bıraktı" satırının mürekkebi — notun metninden AÇIK GRİ tarafa iki
  // kademe (`neutral200`, cam yolunda #D1D5DB). Satır, yanındaki önizlemenin ne
  // olduğunu söyleyen tek şey: sönük olmamalı ama notun kendisiyle aynı beyazda
  // olunca ikisi tek blok gibi okunuyordu.
  //
  // ⚠️ `secondaryInk`e denk geliyor, ONA BAĞLANMIŞ DEĞİL: eskiden ortak
  // değişkendi ve satırın tonunu her ayarlamak chevron'u da sürüklüyordu. Daha
  // gri istenirse sıradaki kademe `textSecondary` (#9CA3AF).
  //
  // `inkOnGlass`ten (bkz. glassInk) besleniyor, sabit renk DEĞİL: paletin
  // polaritesi modla dönüyor, yani cam yoksa açık modda bu token koyu
  // (#374151) — orada zemin gerçekten açık ve açık gri okunmazdı.
  const targetLabelInk = inkOnGlass.neutral200;
  // Prompt kartı yer yediği için açık tavan onda daha alçak. Fotoğraf kutunun
  // İÇİNDE ve yazıdan kısa olduğu için kutunun yüksekliğine katkısı yok.
  // Chevron akıştan çıktı (mutlak) — payı zaten alt pay içinde, ayrıca sayılmaz.
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
            paddingBottom: NOTE_BOX_PAD_BOTTOM,
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
                  {promptAnswer}
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
                    // Nottan açık gri tarafta (bkz. targetLabelInk).
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
 * TEK sinyal ailesi: SuperLike / NOT — ayrı ürünler, sözleşmeleri aynı:
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
function isUnlockedLike(item): boolean {
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
  onRecover,
  onLike,
  likeLabel,
  recoverLabel,
  // İsim satırının üstündeki pill'in metni. Diğer etiketler gibi PROP: kart
  // i18n hook'u tutmuyor, çeviri ekranın elinde (bkz. likeLabel/recoverLabel).
  superLikeLabel,
  // ⚠️ Burada bir zamanlar `alwaysClear` vardı ve KALDIRILDI (2026-08-31).
  // Kaçırdıkların sekmesi o prop ile blur'un tamamen dışında kalıyordu;
  // gerekçesi "liste backend'de gating'e tabi değil"di ama gating listede değil
  // KARTTA: sunucu fotoğrafları maskelemiyor, kimliği saklayan tek şey bu blur.
  // Sonuç, Beğenenler'de bulanık olan kişinin burada net görünmesiydi. Artık her
  // sekme aynı `showClear` kapısından geçiyor.
  //
  // Çıkış animasyonu: "left" / "right" jestin yönüne uçurur, "out" yerinde
  // söndürür (engelleme gibi yönü olmayan düşüşler), "hold" ise kartı OLDUĞU
  // GİBİ bırakır — düşüşü örten şey kartın kendi hareketi değil, ekranı
  // kaplayan alev kutlaması (bkz. runCardFlameExit). Üç hâlde de kart dokunuşa
  // kapanıyor. null → kart duruyor.
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
    // "hold" da burada: kart kutlamanın altında düşüyor, yani GÖRSEL olarak
    // hiçbir şey yapmıyor — uçarsa ya da sönerse dalganın altında kalmayan
    // ilk karelerde hareket görünür ve "kart nereye gitti" hissi doğardı.
    if (!exitDirection || exitDirection === "hold") {
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
              ⚠️ Rozet (superlike kalbi / not balonu) buradan KALDIRILDI: köşe
              artık bir aksiyonun yeri, iki şey aynı hizada durunca hangisinin
              basılabilir olduğu belirsizleşiyordu. Kartın hangi ürün olduğu
              zaten başka yerden okunuyor — notlu kartta alt bloktaki not
              kutusu, süper beğenide sekmenin kendisi (Beğeniler'in "Süper
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
              kaydırmayı kilitlemesin. */}
          <View
            onStartShouldSetResponder={() => true}
            onResponderRelease={() => {}}
            style={{
              position: "absolute",
              top: CARD_TOP_RIGHT_INSET,
              right: CARD_TOP_RIGHT_INSET,
            }}
          >
            {onRecover ? (
              <RecoverGlassButton
                onPress={handleRecoverPress}
                label={recoverLabel}
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
              // değiştirince köşe zayıflıyormuş gibi okunurdu. Renk
              // kolondaki tikin rengi (SuperLike kalbinin kırmızısı).
              <CardActionGlassButton
                variant="prominent"
                name="checkmark"
                fallback={Check}
                tintColor={gradients.swipeHeart[0]}
                glyphColor={colors.onMedia}
                size={CARD_CORNER_GLASS_SIZE}
                glyphSize={CARD_CORNER_GLYPH_SIZE}
                // `busy` YOK: istek fire-and-forget gidiyor ve kart aynı karede
                // düşüyor, beklenen bir yanıt yok. Free kullanıcıda da
                // dönmemeli — tek "bekleme" paywall öncesi sessiz entitlement
                // tazelemesi (bkz. actingRef). Kurtarma butonu da (2026-09-02'den
                // beri) AYNI: köşedeki iki hâlin basışa cevabı ayrışmıyor.
                onPress={handleLike}
                label={likeLabel}
              />
            )}
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
                    işareti: köşedeki rozet (süper beğeni kalbi / not balonu)
                    orası bir aksiyonun yeri olduğu için kaldırılmıştı ve
                    "Beğeniler"de türü sekme söylüyordu; "Kaçırdıkların" tek
                    karma liste olduğu için orada hiçbir şey söylemiyordu.
                    YALNIZ SÜPER BEĞENİDE: notta kartın kendi not kutusu zaten
                    ne olduğunu anlatıyor, düz beğenide de söylenecek bir şey
                    yok — kartın listede olması zaten "beğendi" demek.
                    ⚠️ Kimlik satırları gibi `identityStyle` ile SOLMUYOR,
                    doğrudan kaldırılıyor. Not açılınca kutu bu satırların
                    üstüne büyüdüğü için gitmesi gerekiyor; geçişi yumuşatmak
                    için buraya fade EKLEME — kimlik satırları zaten soluyor,
                    ikinci bir soluşan katman geçişi bulanıklaştırıyor.
                    ⚠️ Süper beğeni + not aynı kartta olursa blok bu pill kadar
                    (~32px) uzuyor; NOTE_CARD_BLUR_FLOOR / NOTE_IDENTITY_BLOCK
                    tahminleri bunu saymıyor. Bilinçli: ölçüm zaten `onLayout`ile
                    düzeliyor, sapma yalnız ilk karede ve perdede görünmüyor. */}
                {item.isSuperLike && !!superLikeLabel && !noteExpanded && (
                  <SuperLikePill label={superLikeLabel} />
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
                  {/* Premium rozeti — kart başlıklarındakinin AYNISI, yaşın
                      sağında; ölçü isim puntosundan türüyor (bkz. PremiumBadge).
                      `alignSelf: "center"` ŞART: satır baseline hizalı ve bir
                      View'ın baseline'ı ALT kenarıdır — onsuz daire yazının
                      altına sarkar. */}
                  {item.isPremium && (
                    <PremiumBadge
                      fontSize={LIKE_CARD_NAME_SIZE}
                      style={{
                        flexShrink: 0,
                        marginLeft: 4,
                        alignSelf: "center",
                      }}
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

          {/* Blurlu (kilitli) kartlar — isim/yaş/üni yerine kutu placeholder.
              Kutu perdenin TERSİ olmak zorunda; aynı yöndeki bir kutu camın
              içinde kaybolur. Perde `chromeBlurTint()` ile modla döndüğü için
              kutular da dönüyor: açık modda koyu, koyu modda açık.
              `isLight()` render sırasında okunuyor — modül seviyesinde
              sabitlenirse tema değişince bayat kalır (bkz. theme/colors.ts).
              Genişlikler gerçek metin uzunluğuna göre dinamik (karakter ≈ px). */}
          {!showClear &&
            (() => {
              const boxInk = isLight() ? scrimAt : onMediaAt;
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
              // Kilitli kart notsuz beğenidir (not Likes'ta blursuz
              // geliyor): placeholder'lar açık kartın kimlik bloğuyla AYNI
              // paylarda duruyor ki listede kilitli/açık kartların isim
              // satırları aynı hizaya gelsin (bkz. blockBottom).
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
                  <View
                    style={{
                      width: nameW,
                      height: 18,
                      borderRadius: 6,
                      backgroundColor: boxInk(0.6),
                    }}
                  />
                  <View
                    style={{
                      marginTop: 8,
                      width: "80%",
                      height: 12,
                      borderRadius: 5,
                      backgroundColor: boxInk(0.35),
                    }}
                  />
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
const MemoLikeCard = memo(LikeCard);

/**
 * Sayfanın büyük başlığı + alt yazısı — her sekmenin KENDİ liste başlığı olarak
 * çiziliyor (blok listenin içinde olduğu için kaydırınca yukarı çıkıp
 * ScreenHeader'a devrediyor, sekme kayarken de sayfayla birlikte native olarak
 * kayıyor).
 *
 * ⚠️ `memo` ve prop'ları PRİMİTİF: ekranın kendisi sık çiziliyor (kota, /Stats,
 * hub olayları, sekme commit'i) ve blok her çizimde yeniden commit edildiğinde
 * — pager kayarken düşen bir commit'te — başlıkla alt yazı bir kare takılıyordu.
 * Bu yüzden `onActionPress` de çağıran tarafta SABİT referans olmalı, yoksa memo
 * hiç tutmaz.
 */
const LikesListHeader = memo(function LikesListHeader({
  title,
  description,
  actionLabel,
  onActionPress,
}: {
  title: string;
  description: string;
  actionLabel: string | null;
  onActionPress: (() => void) | null;
}) {
  if (!title) return null;
  return (
    // Üstte pay YOK — blok listenin en başında ve listenin kendi paddingTop'u
    // zaten başlığı header satırının (sekme şeridi) altından başlatıyor (o
    // payın sonundaki sayı başlığın üstündeki nefes).
    <View
      style={{
        // Blok iki satır (başlık + alt yazı); altındaki pay doğrudan ilk kartla
        // arasındaki nefes.
        marginBottom: 26,
        // Listenin kendi payının ÜSTÜNE eklenen fark — başlık ekran kenarından
        // HEADER_LEFT_INSET kadar içeride başlasın diye.
        marginLeft: HEADER_LEFT_INSET - LIST_H_PADDING,
      }}
    >
      {/* Başlık satırı — metin ve (varsa) hemen SAĞINDA satın alma pill'i.
          Aksiyon eskiden alttaki açıklama satırının sonunda düz bir bağlantıydı;
          başlığın yanındaki dolgulu pill hem daha erken görülüyor hem de
          tıklanabilir olduğunu kendi söylüyor. */}
      <View style={{ flexDirection: "row", alignItems: "center", gap: 10 }}>
        {/* Ana metin `colors.text` — açık modda siyah (#0B0B0C), koyu modda
            beyaz. textSecondary açık modda gri kalıyordu ve bu satır sayfanın
            başlığı, ikincil bir dipnot değil.
            `flexShrink: 1` — uzun başlık (ör. bakiye metni) pill'i satır dışına
            itmesin, kırpılacak olan başlık. */}
        <Text
          style={{
            flexShrink: 1,
            color: colors.text,
            fontSize: 33,
            fontWeight: "700",
          }}
        >
          {title}
        </Text>
        {!!actionLabel && !!onActionPress && (
          // Zemin `litPlus` — "Seni beğenenleri gör" CTA'sıyla AYNI dolgu;
          // ekranda tek bir "bu satın almalı" dili olsun (hangi sheet'e gittiği
          // sekmeye göre değişse de, bkz. headerActionFor).
          // Yazı `text` olamaz (açık modda beyaza döner, dolgunun üstünde
          // kaybolur); sabit dolguların mürekkebi `onMediaInverse`.
          <AnimatedPressable
            pressScale={0.96}
            onPress={onActionPress}
            accessibilityRole="button"
            hitSlop={8}
            style={{
              flexShrink: 0,
              borderRadius: 999,
              borderCurve: "continuous",
              backgroundColor: colors.litPlus,
              paddingHorizontal: 12,
              paddingVertical: 6,
            }}
          >
            <Text
              style={{
                color: colors.onMediaInverse,
                fontSize: 13,
                fontWeight: "700",
              }}
            >
              {actionLabel}
            </Text>
          </AnimatedPressable>
        )}
      </View>
      {/* Bakiyenin altında bir zamanlar info glifi + gri açıklama satırı vardı
          ("kurtarma hakkı ne işe yarar"). KALDIRILDI: aynı bilgi zaten sekmenin
          kendi açıklama satırında duruyor ve iki gri satır üst üste gelince
          başlık bloğu üç katmanlı bir metin yığınına dönüyordu. Hakkın nasıl
          alınacağı da burada değil, başlığın yanındaki pill'de. */}
      {/* Başlığın alt yazısı — tek cümle, glifsiz. Eskiden bu bilgi
          kapatılabilir bir kartta (LikesInfoCard) ve daha uzun duruyordu; kart
          kaldırıldı, satır kalıcı hâle geldi. Kaçırdıkların sekmesinde cümlenin
          sonuna kurtarma bakiyesi ekleniyor (bkz. tabDescriptionFor). */}
      <Text
        style={{
          // 33 punto başlığın kendi satır boşluğu zaten aşağı doğru bir pay
          // bırakıyor; üstüne eklenen her px ikisini ayrı iki blok gibi
          // gösteriyor. Alt yazı başlığın devamı, bağımsız bir paragraf değil —
          // bu yüzden pay neredeyse sıfır.
          marginTop: 2,
          color: colors.textSecondary,
          fontSize: 16,
          lineHeight: 22,
          paddingRight: 8,
        }}
      >
        {description}
      </Text>
    </View>
  );
});

export default function LikesScreen() {
  useRenderCount("LikesScreen");
  const { t } = useTranslation();
  const [likes, setLikes] = useState([]);
  // Event handler'larda güncel listeye erişmek için — setLikes updater'ının
  // içinde dispatch etmek render sırasında TabNavigator'ı güncelliyordu.
  const likesRef = useRef([]);
  const whoLikedMeInFlightRef = useRef(false);
  // İlk çekim tamamlandı mı — skeleton'ın tek yetkisi bu. Sonraki hiçbir çekim
  // (premium geçişi, 404 sonrası reload, görünürlük tazelemesi) ekranı skeleton'a
  // geri döndüremez; oturmuş bir ekranı shimmer'a çevirmek yanıp sönme demekti.
  const hasLoadedOnceRef = useRef(false);
  // Son BAŞARILI çekimin damgası + AppState geçişini ayırt etmek için önceki durum.
  const lastLikesFetchRef = useRef(0);
  const appStateRef = useRef(AppState.currentState);
  likesRef.current = likes;
  const [loading, setLoading] = useState(true);
  const [_currentPage, setCurrentPage] = useState(1);
  const [_hasNextPage, setHasNextPage] = useState(false);
  const [profilePremium, setProfilePremium] = useState(false);
  // Tier'ın kaynağı abonelik slice'ı (bkz. features/profile/premiumTier) —
  // satın almada anında true, hub `SubscriptionChanged`/`admin_revoke` ile
  // anında false. `profilePremium` YALNIZ backend henüz konuşmamışken vekil:
  // ÖNCESİ ikisi OR'lanıyordu ve OR tek yönlü çalıştığı için (profil bayrağı
  // true kaldığı sürece redux'ın false'ı geçmiyordu) düşüş yönü ayrı bir
  // effect'le elle yamanmak zorundaydı.
  const { isPremium: reduxPremium, resolved: premiumResolved } =
    usePremiumTier();
  const isPremium = premiumResolved
    ? reduxPremium
    : profilePremium || reduxPremium;
  // Premium durumu HENÜZ bilinmiyor mu — sticky satın alma butonunun tek kapısı.
  // `profilePremium` ve redux'ın ikisi de false'tan başlıyor, dolayısıyla ilk
  // karelerde premium kullanıcıya da "beğenenleri gör" butonu çiziliyor ve
  // profil cevabı gelince kayboluyordu (yanıp sönme + yanlış upsell). Bayrak
  // yalnız getMyProfile GERÇEKTEN cevap verince kalkar; hata dönerse bilmiyoruz
  // sayılır ve buton çizilmez (premium'a satış göstermektense hiç göstermemek).
  const premiumCheckedRef = useRef(false);
  const [premiumChecked, setPremiumChecked] = useState(false);
  const [activeTab, setActiveTab] = useState("all");
  const pagerRef = useRef<PagerView>(null);
  // Pager'ın ANLIK konumu — tam sayı değil, kaydırma sürerken 1.0 → 1.37 → 2.0
  // diye akıyor. Alt çizgi bunu okuyor, dolayısıyla parmakla yarım sayfa çekip
  // bırakıldığında da doğru yerde duruyor.
  const pagerOffset = useSharedValue(0);
  const pagerScrollHandler = usePagerScrollHandler({
    onPageScroll: (e: any) => {
      "worklet";
      pagerOffset.value = e.position + e.offset;
    },
  });
  const insets = useSafeAreaInsets();
  const dispatch = useAppDispatch();
  const navigation = useNavigation();
  const statsQuery = useSwipeStats();
  // /Stats'ı ekranın kendi tazelik damgasından tetikleyebilmek için ref'te:
  // deps'e konsa `loadMissed` her render'da yeniden yaratılırdı.
  const refetchStatsRef = useRef(statsQuery.refetch);
  refetchStatsRef.current = statsQuery.refetch;
  // `mutate` TanStack Query'de referans olarak stabil — mutation nesnesinin
  // kendisi her render'da değişiyor, onu bağımlılığa koymak handleQuickSwipe'ı
  // her karede tazelerdi (bu ekran uygulama ömrü boyunca mount kalıyor).
  const { mutate: swipeMutate } = useSwipeMutation();
  // ⚠️ Kurtarma paketi sheet'i (`RecoveryPurchaseModal`) KALDIRILDI: kurtarma
  // 2026-08-31'de consumable olmaktan çıkıp premium ayrıcalığı oldu. Paywall
  // artık yalnız free'ye dönüyor ve hedefi doğrudan abonelik (openLitPlus).
  // SuperLike / not paketi sheet'leri — başlığın yanındaki "Nasıl alırım?"
  // pill'inden açılıyor (bkz. headerAction). İkisi de DiscoverScreen'dekiyle
  // aynı bileşen ve aynı ürün; buradan açılmaları yalnız ikinci bir giriş
  // kapısı, ayrı bir akış değil.
  const [superLikePurchaseVisible, setSuperLikePurchaseVisible] =
    useState(false);
  const [notePurchaseVisible, setNotePurchaseVisible] = useState(false);
  // Şikayet edilen kullanıcı — ReportModal'ın hem görünürlüğü hem hedefi.

  // Aksiyon kilidi — aynı anda iki karta basılmasını engelliyor.
  //
  // State DEĞİL ref, ve karttaki butona SPINNER OLARAK BAĞLI DEĞİL: bu bayrak
  // yalnız paywall öncesi canonical entitlement tazelemesi sürerken doluyor.
  // Free kullanıcı tik'e bastığında kartın köşesinde bir loader dönüyor, sonra
  // paywall açılıyordu — dönen şey kullanıcının istediği aksiyon değil, ona
  // GÖSTERİLMEYECEK bir kontroldü; "beğenin gidiyor" gibi okunup paywall'ı
  // sürpriz yapıyordu. Premium kullanıcıda zaten hiç görünmüyordu: istek
  // fire-and-forget, kart aynı karede düşüyor.
  const actingRef = useRef(false);
  // Aksiyon kolonu açık olan satır. Tek bir kimlik: ikinci bir kart çekilince
  // ilki kendiliğinden kapanıyor (bkz. LikeCard'daki `isRevealed` etkisi).

  // ── Kart çıkışı ───────────────────────────────────────────────────────────
  // Aksiyon alınan kart veriden ANINDA düşmüyor: önce `exitingIds`e giriyor,
  // düşüş sonra oluyor. Ağdan bağımsız — istek zaten yola çıkmış durumda, bu
  // yalnız görsel sıra. İki tür var:
  //   • runCardExit — kart uçup söner (bkz. LikeCard), CARD_EXIT_MS sonra düşer.
  //   • runCardFlameExit — kart yerinde durur, ekranı kaplayan alev kutlaması
  //     onu ÖRTTÜĞÜ anda düşer (onaylama ve kurtarma).
  //
  // Boşluğun kapanması BURADA değil: kart veriden çıkınca FlatList'in
  // `itemLayoutAnimation`ı alttaki hücreleri yukarı kaydırıyor.
  const [exitingIds, setExitingIds] = useState({});
  // userId → çıkışı İPTAL eden fonksiyon. İki çıkış türü var (zamanlayıcılı
  // uçuş ve alev örtüsünü bekleyen düşüş) ve ikisi de aynı haritada duruyor:
  // "bu kart zaten gidiyor" kontrolü ile unmount temizliği tek yerden okunsun.
  const exitTimersRef = useRef(new Map());
  const finishCardExit = useCallback((userId, remove) => {
    exitTimersRef.current.delete(userId);
    setExitingIds((prev) => {
      if (!(userId in prev)) return prev;
      const next = { ...prev };
      delete next[userId];
      return next;
    });
    remove();
  }, []);
  const runCardExit = useCallback(
    (userId, direction, remove) => {
      if (!userId) {
        remove();
        return;
      }
      // Aynı kart için ikinci bir çıkış başlatma — animasyon baştan oynar ve
      // `remove` iki kez çağrılırdı.
      if (exitTimersRef.current.has(userId)) return;
      setExitingIds((prev) => ({ ...prev, [userId]: direction }));
      const timer = setTimeout(
        () => finishCardExit(userId, remove),
        CARD_EXIT_MS,
      );
      exitTimersRef.current.set(userId, () => clearTimeout(timer));
    },
    [finishCardExit],
  );

  // Kutlamalı çıkış — ONAYLAMA ve KURTARMA. İkisi de bir eşleşme yaratıyor,
  // yani Keşfet'teki süper beğeni/not ile aynı ana ait (bkz. flameSweep):
  // kart hiçbir yere uçmuyor, yerinde duruyor; ekranı alttan yukarı süpüren
  // alev dalgası ekranı TAM KAPATTIĞI anda kart listeden düşüyor. Boşluğun
  // kapanması (LIST_SHIFT_MS) da örtünün altında bitiyor — kullanıcı ne kartın
  // gidişini ne de listenin toparlanmasını görüyor, yalnız kutlamayı.
  //
  // Aynı anda tek kutlama: dalga ekranı kaplayana kadar liste hâlâ dokunulabilir
  // ve ikinci bir onay, örtme olayını (tek bir global olay) kendi kartına
  // kaydırıp ilkini yarım bırakırdı.
  const flamePendingRef = useRef(null);
  const runCardFlameExit = useCallback(
    (userId, remove) => {
      if (!userId) {
        remove();
        return;
      }
      if (exitTimersRef.current.has(userId)) return;
      flamePendingRef.current = userId;
      const clearPending = () => {
        if (flamePendingRef.current === userId) flamePendingRef.current = null;
      };
      // "hold": kart görsel olarak değişmiyor, yalnız dokunuşa kapanıyor —
      // örtülene kadar geçen ~yarım saniyede ikinci bir aksiyon gitmesin.
      setExitingIds((prev) => ({ ...prev, [userId]: "hold" }));
      const cancel = runFlameSweep(() => {
        clearPending();
        finishCardExit(userId, remove);
      });
      exitTimersRef.current.set(userId, () => {
        clearPending();
        cancel();
      });
    },
    [finishCardExit],
  );
  // Ekran uygulama ömrü boyunca mount kalıyor ama yine de: bekleyen çıkışlar
  // unmount'ta iptal edilir (timer/dinleyici, kapanmış bir ekranın state'ine
  // yazmasın).
  useEffect(() => {
    const timers = exitTimersRef.current;
    return () => {
      timers.forEach((cancel) => cancel());
      timers.clear();
    };
  }, []);

  // ── Kaçırılan eşleşmeler ("Kaçırdıkların" sekmesi) ────────────────────────
  // Beğeni listesinden tamamen ayrı: farklı uç (`/MissedMatches`), farklı kota
  // ve sekme açılana kadar HİÇ istenmiyor. Bu ekran boot'ta preload edildiği
  // için koşulsuz çekmek her açılışa bir istek eklerdi.
  const [missed, setMissed] = useState([]);
  const missedRef = useRef([]);
  missedRef.current = missed;
  const [missedLoading, setMissedLoading] = useState(false);
  // İLK TURUN BİTTİĞİ — "liste boş" ile "liste henüz çekilmedi" ayrı şeyler ve
  // `missed.length === 0` ikisini de aynı gösteriyordu. Sekmeye ilk girişte
  // sayfa bir kare "Kaçırdığın kimse yok" yazıyor, sonra iskelete düşüp veri
  // gelince yeniden boş duruma dönüyordu — görünen flash buydu.
  // Ref + state ikizi: ref'i `loadMissed` senkron okuyor (deps'i boş, state'i
  // göremez), state'i render kullanıyor.
  const missedLoadedRef = useRef(false);
  const [missedLoaded, setMissedLoaded] = useState(false);
  // ⚠️ `recoveringId` KALDIRILDI (2026-09-02). Kurtarma isteği uçarken karttaki
  // butonu spinner'a çeviren state'ti; artık istek fire-and-forget gidiyor ve
  // kutlama aynı karede başlıyor, yani gösterilecek bir bekleme yok. Tekrar
  // basmayı da o engellemiyor: kart basılır basılmaz çıkışa giriyor ve
  // `exitTimersRef`/`flamePendingRef` guard'ları beğeniyle aynı kapıyı kuruyor
  // (bkz. handleRecover / handleQuickSwipe).
  const lastMissedFetchRef = useRef(0);
  const missedInFlightRef = useRef(false);
  // Sekmedeki adet — LİSTEDEN AYRI tutuluyor, iki sebeple:
  //   1) Sayı, sekmeye girmenin sebebi: "Kaçırdıkların"da bir şey yoksa oraya
  //      hiç girilmemeli. `missed.length` ancak sekme açıldıktan sonra dolduğu
  //      için pill o ana kadar sayısız kalıyordu.
  //   2) `missed` yalnız İLK SAYFA (20 kayıt); toplam ondan büyük olabilir.
  //      Kanonik sayı zarfın `totalProfiles` alanı.
  // `null` = HENÜZ BİLİNMİYOR (0 değil) — pill sayıyı ancak bilince yazıyor,
  // bilinmeyeni "0" diye göstermek yanlış bilgi olurdu (bkz. FilterPills).
  const [missedTotal, setMissedTotal] = useState(null);
  const lastMissedCountFetchRef = useRef(0);
  const missedCountInFlightRef = useRef(false);
  // Kurtarma sonrası SignalR emniyeti (bkz. handleRecover). Unmount'ta iptal
  // ediliyor: ekran kapandıktan sonra istek atmak boşuna.
  const matchSignalTimerRef = useRef(null);
  useEffect(
    () => () => {
      if (matchSignalTimerRef.current)
        clearTimeout(matchSignalTimerRef.current);
    },
    [],
  );

  const loadMissed = useCallback(async ({ force = false } = {}) => {
    if (missedInFlightRef.current) return;
    if (!force && Date.now() - lastMissedFetchRef.current < LIKES_STALE_MS) {
      return;
    }
    missedInFlightRef.current = true;
    // Liste tazelenirken BAKİYE de tazelensin. /Stats `staleTime: Infinity` ile
    // oturumda bir kez çekiliyor; bu ekranın kota satırı onun dışında hiçbir
    // yerden yenilenmiyordu, yani başka bir cihazdan (ya da bu oturumdan önce)
    // harcanmış hak ekranda hep eski değeriyle duruyordu — kullanıcının
    // "5/5 yazıyor ve hiç azalmıyor" dediği durumun ikinci yarısı bu.
    //
    // Ayrı bir damga tutmuyoruz: yukarıdaki `LIKES_STALE_MS` guard'ının arkasında
    // olduğu için sekmeye her girişte değil, en fazla 30 sn'de bir istek çıkar.
    refetchStatsRef.current?.()?.catch?.(() => {});
    // Dolu listeyi skeleton'a çevirme — beğeni listesindeki `silent` kuralının
    // aynısı. Kapı "liste boş mu" DEĞİL "ilk tur bitti mi": boş bir liste
    // eskiden HER tazelemede iskelete düşüp geri dönüyordu (boş → iskelet →
    // boş), oysa ekranda zaten bir cevap duruyor.
    if (!missedLoadedRef.current) setMissedLoading(true);
    try {
      const page = await fetchMissedMatches();
      setMissed(page.profiles);
      // Adet listenin uzunluğundan DEĞİL zarftan: `profiles` ilk sayfa, sayı
      // tüm kümeyi anlatmalı.
      setMissedTotal(page.totalProfiles);
      // Damga YALNIZ başarıda: hatada 0'da kalır, bir sonraki girişte koşulsuz
      // yeniden denenir.
      lastMissedFetchRef.current = Date.now();
    } catch {
      // yut
    } finally {
      // Hatada da işaretleniyor: yoksa istek düşen kullanıcı sonsuza kadar
      // iskelete bakardı. Tazelik damgası (lastMissedFetchRef) yalnız başarıda
      // yazıldığı için bir sonraki girişte istek koşulsuz yineleniyor.
      missedLoadedRef.current = true;
      setMissedLoaded(true);
      setMissedLoading(false);
      missedInFlightRef.current = false;
    }
  }, []);

  /**
   * Yalnız ADEDİ çeken hafif tur — sekmeye GİRMEDEN pill'de sayı görünsün diye.
   *
   * `pageSize: 1`: bize `totalProfiles` lazım, 20 kartlık gövde değil. Sekme
   * açıldığında listeyi `loadMissed` ayrıca çekiyor.
   *
   * Tazelik damgası listeninkinden AYRI (`lastMissedCountFetchRef`) — bu tur
   * listeyi doldurmadığı için onun damgasına yazsaydı, sekmeye girildiğinde
   * liste "az önce çekildi" sayılıp boş kalırdı. Ters yön ise geçerli: liste
   * taze çekildiyse sayı da onunla gelmiştir, ikinci istek boşuna.
   */
  const loadMissedCount = useCallback(async () => {
    if (missedCountInFlightRef.current || missedInFlightRef.current) return;
    const now = Date.now();
    if (now - lastMissedFetchRef.current < LIKES_STALE_MS) return;
    if (now - lastMissedCountFetchRef.current < LIKES_STALE_MS) return;
    missedCountInFlightRef.current = true;
    try {
      const page = await fetchMissedMatches(1, 1);
      setMissedTotal(page.totalProfiles);
      lastMissedCountFetchRef.current = Date.now();
    } catch {
      // yut — sayı "bilinmiyor" kalır, pill sayısız çizilir. Uydurma bir rakam
      // (ör. 0) göstermek sekmeyi yanlışlıkla "boş" ilan ederdi.
    } finally {
      missedCountInFlightRef.current = false;
    }
  }, []);

  /**
   * Kaçırdıkların listesinden tek kart düşürme — TEK giriş noktası.
   *
   * Adet listeden ayrı tutulduğu için (sekmeye girmeden de biliniyor) düşüş
   * İKİSİNE birden uygulanmalı; yoksa kurtardığın kart gittiği hâlde pill eski
   * sayıda kalırdı.
   *
   * Sayaç yalnız GERÇEKTEN düşen kart için iniyor. Liste hiç çekilmemişse
   * (sekmeye girilmediyse) burada eşleşme olmaz ve sayı olduğu gibi kalır —
   * bir sonraki odaklanmada kanonik değerine döner.
   */
  const dropMissed = useCallback((userId) => {
    if (!userId) return;
    const prev = missedRef.current;
    const next = prev.filter((it) => it.userId !== userId);
    if (next.length === prev.length) return;
    missedRef.current = next;
    setMissed(next);
    setMissedTotal((n) => (typeof n === "number" ? Math.max(0, n - 1) : n));
  }, []);

  useEffect(() => {
    if (activeTab !== "missed") return;
    loadMissed();
  }, [activeTab, loadMissed]);

  // Ekran ODAKTAYKEN adet turu. `isFocused` kapısı şart: bu ekran boot'ta
  // `navigation.preload("Likes")` ile mount oluyor ve koşulsuz bir mount
  // effect'i her açılışa bir istek eklerdi (bkz. yukarıdaki not). Odak
  // Discover'dayken burada istek ÇIKMAZ; sayı ancak kullanıcı gerçekten
  // Beğeniler'e geldiğinde isteniyor.
  useEffect(() => {
    if (activeTab === "missed") return;
    if (!navigation.isFocused()) return;
    loadMissedCount();
  }, [activeTab, navigation, loadMissedCount]);

  // Ekrana geri dönüldüğünde tazele. Beğeni listesindeki görünürlük kuralının
  // aynısı ama KENDİ damgasıyla: iki liste ayrı uçlardan geliyor, birinin
  // tazeliği diğerininkini söylemiyor.
  //
  // Sekme açıksa TÜM liste, değilse yalnız adet tazeleniyor — pill başka bir
  // sekmedeyken de doğru sayıyı göstermeli.
  useEffect(() => {
    const unsub = navigation.addListener("focus", () => {
      if (activeTab === "missed") loadMissed();
      else loadMissedCount();
    });
    return unsub;
  }, [activeTab, navigation, loadMissed, loadMissedCount]);

  // Arka plandan dönüş — Likes ZATEN odaktayken 'focus' çıkmıyor (bkz. aşağıdaki
  // görünürlük tazelemesi notu). Ref'te tutuluyor ki AppState aboneliği sekme
  // her değiştiğinde yeniden kurulmasın.
  const resumeMissedRef = useRef(() => {});
  resumeMissedRef.current = () => {
    if (activeTab === "missed") loadMissed();
    else loadMissedCount();
  };

  const scrollY = useSharedValue(0);
  const scrollHandler = useAnimatedScrollHandler({
    onScroll: (e) => {
      scrollY.value = e.contentOffset.y;
    },
  });
  // Şerit ARTIK KAYMIYOR: header'ın kendi satırında duruyor (bkz. ScreenHeader
  // `centerSlot`, Profil ekranındaki kurulumun aynısı). Eskiden içerikle
  // birlikte yukarı çıkıp yerini header'ın küçük başlığına bırakıyordu; sekmeler
  // etkileşimli olduğu için kaydırınca erişilemez hâle geliyorlardı.
  // `scrollY` yalnız header'ın bulanık zeminini besliyor.

  // Detay preview state — karta tıklayınca LikerProfile detayını çekip
  // PreviewModal'da SwipeCard layout'unu reuse ederek gösteriyoruz.
  const [previewVisible, setPreviewVisible] = useState(false);
  const [previewProfile, setPreviewProfile] = useState(null);
  // Açılan kartın SWIPE'sız olup olmadığı — "kaçırdıkların" sekmesinde kart
  // yalnız okunur açılır (bkz. LikerSwipeModal `swipeDisabled`).
  //
  // Sekmeye render anında bakmak yerine AÇILIŞTA dondurmasının sebebi kapanış:
  // `previewVisible` false olduktan sonra sheet hâlâ ekranda kayıyor ve o sırada
  // bayrak değişirse aksiyon satırı bir an belirip kartla birlikte aşağı iniyor.
  // Bu yüzden kapanışta da SIFIRLANMIYOR; bir sonraki açılış üzerine yazar.
  const [previewSwipeDisabled, setPreviewSwipeDisabled] = useState(false);
  const [_previewLoading, setPreviewLoading] = useState(false);

  // Sekmeler AYRIK kümeler: bir kart tek bir sekmeye ait. Not bir beğeninin
  // üstüne binen ayrı ürün olduğu için "Beğeni" sekmesinden de çıkarılıyor —
  // yoksa aynı kart hem orada hem "Notlar"da görünürdü. Önceliği not alıyor,
  // kartın rozetindeki sırayla aynı (bkz. LikeCard'ın sağ üst rozeti).
  //
  // Bayrak İÇERİĞE değil `isNote`e DE bakıyor: realtime gelen kartta önizleme
  // boş olabiliyor (`notePreview` yok) — o kart notluğunu kaybetmemeli.
  //
  // ⚠️ BEŞ SEKMENİN HEPSİ birden hesaplanıyor, yalnız aktif olan değil: pager'da
  // beş sayfa da aynı anda canlı ve her biri kendi dizisini istiyor.
  //
  // ⚠️ useMemo ŞART, kozmetik değil: bu her çizimde yeni diziler üretiyordu ve
  // FlatList `data` referansına bakıyor — sekmeyle ilgisi olmayan her state
  // değişiminde (kota, hub olayı) liste kendini baştan çizdiriyordu. Tek bir
  // memo'da toplanması da bilinçli: `likes` değişince beşi birden tazelenir,
  // ayrı memo'lar aynı diziyi beş kez gezerdi.
  const likesByTab = useMemo(() => {
    const note = [];
    const like = [];
    const superLike = [];
    for (const l of likes) {
      if (l.note || l.isNote) note.push(l);
      else if (l.isSuperLike) superLike.push(l);
      else like.push(l);
    }
    return {
      all: likes,
      like,
      superlike: superLike,
      note,
    };
  }, [likes]);

  // Pill'lerin yanındaki adetler. Sınıflandırma `likesByTab` ile AYNI sırayı
  // izliyor (önce not, sonra süper beğeni) — sekmeler ayrık kümeler, bir kart
  // tek bir sayıya girer.
  const likeCounts = useMemo(
    () => ({
      all: likes.length,
      like: likesByTab.like.length,
      superLike: likesByTab.superlike.length,
      note: likesByTab.note.length,
    }),
    [likes, likesByTab],
  );

  // Kaçırdıkların sekmesi AYRI bir veri kaynağı (beğeni listesinin filtresi
  // değil): farklı uç, farklı sayfalama, farklı boş durum.
  const isMissedTab = activeTab === "missed";
  const listDataFor = useCallback(
    (tabKey: string) => (tabKey === "missed" ? missed : likesByTab[tabKey]),
    [missed, likesByTab],
  );

  // Başlığın yanındaki "Beğenenleri gör" pill'inin GÖRÜNÜRLÜK kapısı (bkz.
  // headerActionFor). Premium upsell'in ekrandaki tek yeri o pill; alttaki
  // sticky buton kaldırıldı.
  //   tier bilindi     → premium durumu bilinmeden çizme, sonra geri alma
  //   !isPremium       → premium'a satış yapma
  //   liste dolu       → boş durumda EmptyState'in kendi CTA'sı var; kilitli
  //                      kart yokken açılacak bir şey de yok
  //
  // Kaçırdıkların ARTIK DAHİL (2026-08-31): o sekmenin kartları da blur'lu ve
  // kilidi açan şey aynı abonelik. Sekme eskiden istisnaydı ("liste gating'e
  // tabi değil") — kartlar blur'suz çizildiği sürece doğruydu, artık değil.
  // Listesi ayrı bir kaynaktan geldiği için uzunluğu `listDataFor` üzerinden
  // okunuyor (`likesByTab` bu sekmeyi tanımıyor).
  const showPremiumUpsellFor = useCallback(
    (tabKey: string) =>
      (premiumResolved || premiumChecked) &&
      !isPremium &&
      (listDataFor(tabKey)?.length ?? 0) > 0,
    [premiumResolved, premiumChecked, isPremium, listDataFor],
  );

  // Kurtarma artık bir BAKİYE değil (2026-08-31): premium'da sınırsız, free'de
  // hiç yok. Sayı, payda, "kalan hak" kavramı ve satın alınabilir paket kalktı.
  // Tek yorumlama noktası recoveryQuota.ts.
  const recoveryAccess = useMemo(
    () => resolveRecoveryAccess(statsQuery.data),
    [statsQuery.data],
  );
  // Açıklama satırına eklenen kurtarma cümlesi.
  //
  // Free'de SAYAÇ GÖSTERİLMİYOR ("0 hakkın kaldı" yerine hiçbir şey): kazanılıp
  // yenilenecek bir hak yok, sayaç yanıltıcı olurdu — satış başlıktaki pill'de
  // (bkz. headerActionFor). Sinyal hiç okunamadıysa da yazmıyoruz; "Sınırsız"
  // demek olmayan bir hakkı vaat etmek olurdu.
  const recoveryAccessText = useMemo(
    () =>
      recoveryAccess.unlimited && !recoveryAccess.unknown
        ? t("likes.recoverUnlimited")
        : null,
    [recoveryAccess, t],
  );

  // Bölüm başlığı — HER sekmede listenin ne olduğunu söyleyen sabit bir metin,
  // kaçırdıkların sekmesi DAHİL. Orada eskiden başlık bakiyenin kendisiydi
  // ("Kurtarma hakkın: 3/5"): sayfanın büyük başlığı sekmenin adını hiç
  // söylemiyordu ve bakiye bilinmediğinde blok tümden kaybolduğu için açıklama
  // satırı da gidiyordu. Bakiye artık açıklamanın içinde (bkz.
  // tabDescriptionFor) — başlık her sekmede aynı işi yapıyor.
  const sectionTitleFor = useCallback(
    (tabKey: string) =>
      tabKey === "missed"
        ? t("likes.headerMissed")
        : tabKey === "like"
          ? t("likes.headerLike")
          : tabKey === "superlike"
            ? t("likes.headerSuperLike")
            : tabKey === "note"
              ? t("likes.headerNote")
              : t("likes.headerAll"),
    [t],
  );

  // Başlığın SAĞINDAKİ pill. Her sekmede aynı görev: bu sekmede kilidi/eksiği
  // açan sheet'i açmak. Metin sekmeye göre değişiyor, çünkü satılan şey de
  // değişiyor.
  //   • Süper beğeni / not → kendi consumable paket sheet'leri, "Nasıl alırım?".
  //     KOŞULSUZ çiziliyor: ikisi de tükenen ürün, elinde kaç tane olduğu bu
  //     ekrandan görünmüyor ve daha fazlası her zaman satın alınabilir.
  //   • Tümü / Beğeni / Kaçırdıkların → "Beğenenleri gör", premium sheet'i.
  //     Satılan bir consumable yok ama kartlar kilitli: bu sekmelerde upsell
  //     artık alttaki sticky butonda değil BURADA (bkz. showPremiumUpsell).
  //     Buton listenin üstüne biniyordu ve kilidin ne olduğunu ancak sayfanın
  //     dibinde söylüyordu; pill kilitli kartların hemen üstünde duruyor.
  //     Kaçırdıkların bu üçlüye 2026-08-31'de KATILDI: kartları artık blur'lu
  //     ve kurtarma premium ayrıcalığı oldu, yani orada da satılan şey abonelik.
  //     Eski kapı bakiyenin sıfır olmasıydı (`recoveryEmpty`) ve satılan şey
  //     kurtarma paketiydi — ikisi de kalktı.
  //
  // ⚠️ `onPress`ler SABİT referans (aşağıdaki üç useCallback): pill başlık
  // bloğunun içinde ve blok memo'lu (bkz. LikesListHeader) — her çağrıda yeni
  // bir kapanış üretilseydi memo hiç tutmaz, blok ekranın her render'ında
  // yeniden commit edilirdi.
  const openSuperLikePurchase = useCallback(
    () => setSuperLikePurchaseVisible(true),
    [],
  );
  const openNotePurchase = useCallback(() => setNotePurchaseVisible(true), []);
  const openPremiumPurchase = useCallback(() => openLitPlus(), []);
  const headerActionFor = useCallback(
    (tabKey: string) => {
      if (tabKey === "superlike") {
        return {
          label: t("likes.howToGetAction"),
          onPress: openSuperLikePurchase,
        };
      }
      if (tabKey === "note") {
        return {
          label: t("likes.howToGetAction"),
          onPress: openNotePurchase,
        };
      }
      if (
        (tabKey === "all" || tabKey === "like" || tabKey === "missed") &&
        showPremiumUpsellFor(tabKey)
      ) {
        return {
          label: t("likes.viewLikersAction"),
          onPress: openPremiumPurchase,
        };
      }
      return null;
    },
    [
      showPremiumUpsellFor,
      t,
      openSuperLikePurchase,
      openNotePurchase,
      openPremiumPurchase,
    ],
  );

  // Boş durum alt metni: pencere uzunluğu backend'den geldiyse sayıyla, yoksa
  // sayısız varyantla. Sabit "30 gün" yazmak, config değiştiği gün yalan olurdu.
  const missedEmptySubtitle = useMemo(() => {
    const days = statsQuery.data?.missedMatchLookbackDays;
    return typeof days === "number" && days > 0
      ? t("likes.emptyMissedSubtitleDays", { days })
      : t("likes.emptyMissedSubtitle");
  }, [statsQuery.data?.missedMatchLookbackDays, t]);

  // Sekme pill'i kaçırdıkların ADEDİNİ liste isteğinden ÖNCE biliyor
  // (loadMissedCount — ekran odaklanınca uçuyor). Sayı sıfırsa cevabı zaten
  // biliyoruz: liste isteğini beklemeye, yani iskelet göstermeye gerek yok,
  // sayfa doğrudan boş durumla açılıyor. Aksi hâlde "boş sayfa → iskelet → boş
  // durum" üçlemesi çıkıyordu ve istek pager'ın kayması bitmeden döndüğü için
  // üçü de geçişin ortasında görünüyordu.
  // `null` (adet BİLİNMİYOR) sıfır değil — o hâlde iskelet doğru cevap.
  const missedKnownEmpty = missedTotal === 0;
  // Kaçırdıkların sayfasında iskelet mi çiziliyor — yalnız gerçekten kart
  // beklerken: istek uçuyorken (pill'e basınca başlıyor, sayfa daha kaymadan)
  // ya da sekme AÇIKKEN ilk tur hiç yapılmamışsa (parmakla gelme / odak).
  // Sekme kapalı ve istek yoksa iskelet YOK: shimmer sonsuz bir döngü,
  // görünmeyen sayfada boşuna dönerdi (bu ekran boot'ta preload ediliyor).
  const missedSkeletonVisible =
    !missedKnownEmpty && (missedLoading || (isMissedTab && !missedLoaded));

  // Büyük başlığın ALTINDAKİ tek cümlelik açıklama. Kaçırdıkların penceresi
  // backend'den geliyor (/Stats → missedMatchLookbackDays); sayı henüz yoksa
  // sayısız varyanta düşüyor — gömülü bir "30 gün" config değiştiği gün yalan
  // söylerdi.
  //
  // Kaçırdıkların sekmesinde cümlenin SONUNA kurtarma cümlesi ekleniyor —
  // ama YALNIZ premium'da ("Kurtarma sınırsız."). Free'de eklenmiyor: eskiden
  // burada bakiye yazıyordu, artık kazanılabilecek bir hak olmadığı için "0
  // hakkın kaldı" demek yanıltıcı olurdu. Free'ye teklif başlığın yanındaki
  // pill'den geliyor (bkz. headerActionFor).
  const tabDescriptionFor = useCallback(
    (tabKey: string) => {
      if (tabKey === "missed") {
        const days = statsQuery.data?.missedMatchLookbackDays;
        const desc =
          typeof days === "number" && days > 0
            ? t("likes.descMissedDays", { days })
            : t("likes.descMissed");
        return recoveryAccessText ? `${desc} ${recoveryAccessText}` : desc;
      }
      if (tabKey === "like") return t("likes.descLike");
      if (tabKey === "superlike") return t("likes.descSuperLike");
      if (tabKey === "note") return t("likes.descNote");
      return t("likes.descAll");
    },
    [statsQuery.data?.missedMatchLookbackDays, recoveryAccessText, t],
  );

  // `silent`: listeyi ekranda tutarak tazele. Görünürlük tazelemesinde (focus /
  // foreground) setLoading(true) tüm grid'i skeleton'a çeviriyordu — kullanıcı
  // zaten dolu bir listeye bakarken ekranın yanıp sönmesi anlamsız.
  const fetchWhoLikedMe = useCallback(
    async (page = 1, { silent = false } = {}) => {
      // In-flight dedupe: preload mount'u + kullanıcı navigasyonu/premium-transition
      // aynı anda tetikleyince istek çiftleniyordu (Sentry trace kanıtlı). State
      // (loading) async güncellendiği için guard ref ile senkron tutulur.
      if (whoLikedMeInFlightRef.current) return;
      whoLikedMeInFlightRef.current = true;
      try {
        // `hasLoadedOnceRef` ikinci bir kilit: çağıran `silent` demeyi unutsa bile
        // ilk yüklemeden sonrası asla skeleton'a düşmez.
        if (!silent && !hasLoadedOnceRef.current) setLoading(true);
        // Yeni API: superLikes ve likes ayrı paginated bölümler.
        // Şimdilik ikisini de tek sayfa olarak çekiyoruz, ileride ayrı paginate edebiliriz.
        // getMyProfile YALNIZ ilk yüklemede: tek işi `profilePremium`'u kurmak ve
        // sonraki değişimler redux'tan geliyor (satın alma + hub
        // `SubscriptionChanged`). Sessiz tazeleme her focus/foreground'da bunu da
        // çekseydi görünürlük tazelemesinin istek maliyeti iki katına çıkardı.
        // Premium daha hiç doğrulanamadıysa (ilk çekim hata aldı) sessiz tazeleme
        // de profili dener — yoksa buton, ekran remount olana kadar gizli kalırdı.
        const [data, profile] = await Promise.all([
          swipeService.getWhoLikedMe(page),
          silent && premiumCheckedRef.current
            ? Promise.resolve(null)
            : profileService.getMyProfile().catch(() => null),
        ]);

        if (profile) {
          premiumCheckedRef.current = true;
          setPremiumChecked(true);
          // İKİ YÖNLÜ yazılıyor: eskiden yalnız true'ya çekiliyordu ve bayrak bir
          // kez kalktıktan sonra hiçbir şey onu indiremiyordu.
          setProfilePremium(!!profile.isPremium);
        }

        if (data.isSuccess && data.result) {
          const superLikeProfiles = (
            data.result.superLikes?.profiles || []
          ).map((p) => ({
            id: `sl_${p.profileId}`,
            userId: p.userId, // LikerProfile detay endpoint'i için lazım
            name: p.displayName,
            // Gizli yaş `null` değil `0` geliyor (DTO'da non-nullable int) —
            // normalize burada, kart `age != null` kontrolüne güvenebilsin.
            age: resolveCardAge(p),
            universityName: p.universityNameDisplay || p.universityName || "",
            mainPhoto: p.photos?.[0] || "",
            likedAt: p.likedMeAt,
            isSuperLike: true,
            isPremium: p.isPremium ?? false,
            // `isNote` sunucunun bayrağı, `note` içeriği. İkisi ayrı: bayrak
            // true iken içerik boş gelirse (beklenmiyor ama) blur yine açılır.
            isNote: !!p.isNote,
            note: normalizeLikerNote(p),
            // ⚠️ KİLİT KURALINA GİRMİYOR (bkz. isUnlockedLike): bu listede
            // bayrak her kart için `true` geliyor, çünkü liste zaten "seni
            // beğenenler". Alan yalnız taşınıyor.
            hasLikedMe: p.hasLikedMe === true,
          }));
          const likeProfiles = (data.result.likes?.profiles || []).map((p) => ({
            id: `l_${p.profileId}`,
            userId: p.userId,
            name: p.displayName,
            age: resolveCardAge(p),
            universityName: p.universityNameDisplay || p.universityName || "",
            mainPhoto: p.photos?.[0] || "",
            likedAt: p.likedMeAt,
            isSuperLike: false,
            isPremium: p.isPremium ?? false,
            isNote: !!p.isNote,
            note: normalizeLikerNote(p),
            hasLikedMe: p.hasLikedMe === true,
          }));

          // SuperLike'lar her zaman üstte (vurgulu bölüm).
          const merged = [...superLikeProfiles, ...likeProfiles];
          setLikes(merged);
          const slTotal = data.result.superLikes?.totalProfiles || 0;
          const lTotal = data.result.likes?.totalProfiles || 0;
          // Sayaç TOPLAM'dan, id kümesi yüklenen sayfadan — ikisi kasten ayrı
          // (bkz. SwipeState.whoLikedMeIds).
          dispatch(
            setWhoLikedMe({
              count: slTotal + lTotal,
              ids: merged.map((it) => it.userId),
            }),
          );
          setHasNextPage(data.result.likes?.hasNextPage || false);
          setCurrentPage(data.result.likes?.currentPage || 1);
          // Tazelik damgası YALNIZ başarıda. Hata yutulduğu için (aşağıdaki boş
          // catch) başarısız bir çekim ekranı "hiç beğenin yok" boş durumuna
          // düşürüyordu; damga 0'da kaldığı sürece bir sonraki görünürlükte
          // koşulsuz yeniden denenir.
          lastLikesFetchRef.current = Date.now();
        }
      } catch {
        // yut
      } finally {
        // Hata da olsa "ilk yükleme bitti": başarısız çekim ekranı boş duruma
        // düşürür, bir sonraki tazeleme onu sessizce doldurur (bkz.
        // lastLikesFetchRef damgası — hatada 0'da kalır, koşulsuz yeniden denenir).
        hasLoadedOnceRef.current = true;
        setLoading(false);
        whoLikedMeInFlightRef.current = false;
      }
    },
    [dispatch],
  );

  // Skeleton görünürlüğü — `loading`'in kendisi değil, geciktirilmiş/asgari
  // süreli türevi. Hızlı cevapta hiç açılmaz, açıldıysa da yanıp sönmeyecek
  // kadar kalır.
  const [showSkeleton, setShowSkeleton] = useState(false);
  const skeletonShownAtRef = useRef(0);
  useEffect(() => {
    if (loading) {
      const id = setTimeout(() => {
        skeletonShownAtRef.current = Date.now();
        setShowSkeleton(true);
      }, SKELETON_DELAY_MS);
      return () => clearTimeout(id);
    }
    if (!showSkeleton) return;
    const rest =
      SKELETON_MIN_VISIBLE_MS - (Date.now() - skeletonShownAtRef.current);
    if (rest <= 0) {
      setShowSkeleton(false);
      return;
    }
    const id = setTimeout(() => setShowSkeleton(false), rest);
    return () => clearTimeout(id);
  }, [loading, showSkeleton]);

  useEffect(() => {
    fetchWhoLikedMe();
  }, [fetchWhoLikedMe]);

  // ============ Görünürlük tazelemesi ============
  // Bu ekran DiscoverScreen'in `navigation.preload("Likes")` çağrısıyla boot'ta
  // mount olup uygulama ömrü boyunca mount kalıyor → mount effect'i bir kez
  // çalışıyor ve liste `useState`'te donuyor. Sonuç: arka planda gelen beğeniyi
  // bildirimden açtığında rozet (redux, AppNavigator foreground turundan) artıyor
  // ama grid bayat/boş kalıyordu — ekranın local state'ine kimse dokunmuyor.
  // İki tetikleyici birlikte tüm vakaları kapsıyor:
  //   focus     → başka bir tab'dan (veya bildirim tap'iyle) Likes'a girildi
  //   foreground→ Likes ZATEN odaktayken arka plana atılıp geri dönüldü; bu
  //               durumda ekran hiç blur olmadığı için 'focus' event'i çıkmıyor
  const refreshLikesIfStale = useCallback(() => {
    if (Date.now() - lastLikesFetchRef.current < LIKES_STALE_MS) return;
    fetchWhoLikedMe(1, { silent: true });
  }, [fetchWhoLikedMe]);

  // Beğeni bildirimine basılarak girildi → eşiğe bakma, koşulsuz tazele
  // (bkz. AppNavigator routeFromNotification 'Like'/'SuperLike').
  useEffect(() => {
    return uiBus.on("likesDirty", () => {
      lastLikesFetchRef.current = 0;
      fetchWhoLikedMe(1, { silent: true });
    });
  }, [fetchWhoLikedMe]);

  useEffect(() => {
    const unsubFocus = navigation.addListener("focus", refreshLikesIfStale);
    const sub = AppState.addEventListener("change", (next) => {
      const prev = appStateRef.current;
      appStateRef.current = next;
      if (!prev.match(/inactive|background/) || next !== "active") return;
      // Odakta değilsek boşuna istek atma — Likes'a geçildiğinde 'focus' zaten
      // aynı kontrolü yapacak.
      if (!navigation.isFocused()) return;
      refreshLikesIfStale();
      // Kaçırdıkların da bayatlıyor: sekme açıksa liste, değilse yalnız pill'in
      // adedi. İkisi de kendi 30 sn eşiğinin arkasında.
      resumeMissedRef.current?.();
    });
    return () => {
      unsubFocus();
      sub.remove();
    };
  }, [navigation, refreshLikesIfStale]);

  // NOT: burada `profilePremium`'u elle indiren bir effect vardı. Tek işi
  // tek yönlü OR'u telafi etmekti (redux false'a düşse bile profil bayrağı
  // ekranı premium tutuyordu). Tier artık kanonik kaynaktan okunduğu için o
  // telafiye gerek yok — bir bayrağı iki yerden yönetmek de bu ekranın asıl
  // sorunuydu.

  // Premium geçişinde listeyi tazele — İKİ YÖNDE de. Bu ekran react-query
  // kullanmadığı için PurchaseModal'ın refetchPremiumScoped'u buraya dokunmuyor.
  //
  //   false→true: liste free scope'ta çekilmiş olabiliyor (backend free
  //               kullanıcıya kısıtlı alan dönerse foto/isim eksik kalırdı).
  //               PurchaseModal'ın onSuccess callback'inin yerini tutar ve
  //               premium'un başka bir ekrandan (Discover/Profile) veya restore
  //               ile alındığı durumu da kapsar.
  //   true→false: TERSİ — bellekteki liste premium scope'ta çekilmiş net
  //               fotoğrafları taşıyor. Yalnız `isPremium`i false yapmak blur'u
  //               geri getirir ama veriyi free scope'a döndürmez; kart açıldığında
  //               premium-scoped alanlar hâlâ elimizde olurdu.
  const prevIsPremiumRef = useRef(isPremium);
  useEffect(() => {
    if (prevIsPremiumRef.current === isPremium) return;
    prevIsPremiumRef.current = isPremium;
    fetchWhoLikedMe();
  }, [isPremium, fetchWhoLikedMe]);

  // Karta tıklayınca:
  //   - Premium DEĞİL ve normal like → PurchaseModal aç (upsell).
  //   - Premium ise VEYA beğeni zaten açıksa (SuperLike / NOT — bkz.
  //     `isUnlockedLike`) → LikerProfile detayını çek + interactive
  //     SwipeWrapper'lı LikerSwipeModal'ı aç. Kullanıcı sağa/sola kaydırıp
  //     like/pass yapabilir; mutual like ise backend match yaratır, global
  //     MatchModal açılır.
  // İstisna kartın görselindekiyle AYNI kaptan geliyor: kart blur'suz
  // gösterilip dokununca paywall açmak, gönderenin satın aldığı şeyi teslim
  // etmemek olurdu.
  // 404 → liker silinmiş/banlanmış/like'ını geri çekmiş → modal'ı kapat ve
  // listeyi yenile.
  // useCallback: karta prop olarak gidiyor ve kart memo'lu — her çizimde yeni
  // bir referans üretseydi memo hiçbir zaman tutmazdı.
  const openLikerProfile = useCallback(
    async (item) => {
      if (!isPremium && !isUnlockedLike(item)) {
        // §11: paywall'dan önce canonical tazeleme — başka cihazda premium
        // olunmuşsa kullanıcıyı satış ekranına düşürmek yerine doğrudan profili
        // açıyoruz (bu ekranın premium transition effect'i listeyi de tazeler).
        const premium = await dispatch(refreshEntitlementsForPaywall())
          .unwrap()
          .catch(() => false);
        if (!premium) {
          openLitPlus();
          return;
        }
      }
      const likerUserId = item?.userId || item?.likerUserId;
      if (!likerUserId) return;
      setPreviewProfile(null);
      setPreviewLoading(true);
      try {
        const res = await swipeService.getLikerProfileDetail(likerUserId);
        if (res?.isSuccess && res?.result) {
          setPreviewProfile(res.result);
          // Kaçırılan eşleşmede yanıt yolu TEK: kurtarma. Detayda swipe açık
          // kalsaydı listede olmayan bir aksiyon (pas/beğen) kotasız bir arka
          // kapıdan sunulmuş olurdu.
          setPreviewSwipeDisabled(isMissedTab);
          setPreviewVisible(true);
        } else {
          fetchWhoLikedMe();
        }
      } catch (e) {
        const status = e?.response?.status ?? e?.status;
        if (status === 404) {
          fetchWhoLikedMe();
        } else if (status === 401 || status === 403) {
          // Backend LikerProfile'ı premium'a kilitliyorsa free kullanıcının açık
          // bir karta (SuperLike / NOT) dokunuşu sessizce ölmesin: paywall'a düş.
          // Bu dal ancak backend bu istisnaları tanımıyorsa çalışır — kalıcı
          // çözüm orada, burası sadece ölü dokunuşa karşı emniyet.
          openLitPlus();
        }
      } finally {
        setPreviewLoading(false);
      }
      // ⚠️ `isMissedTab` bağımlılıkta OLMAK ZORUNDA: önizlemenin swipe'ı ona göre
      // kapanıyor (kaçırılan eşleşmede tek yanıt kurtarma). Kapanış bayat bir
      // sekme değeri yakalasaydı kaçırdıkların detayında pas/beğen açık kalırdı.
      // `isUnlockedLike` modül seviyesinde saf bir fonksiyon, bağımlılık değil.
    },
    [isPremium, isMissedTab, dispatch, fetchWhoLikedMe],
  );

  const handleClosePreview = () => {
    setPreviewVisible(false);
    setPreviewProfile(null);
  };

  /**
   * "Kurtar" — pass'i like'a çevirir, karşı taraf zaten beğendiği için sonuç
   * gerçek bir eşleşmedir.
   *
   * Akış ONAY BUTONUYLA BİREBİR AYNI (bkz. handleQuickSwipe) ve bu bilinçli:
   * köşedeki cam buton sekmeye göre "beğen" ya da "kurtar" oluyor, ikisi aynı
   * köşenin iki hâli — basışa verdikleri cevap ayrışmamalı. Değişen üç şey:
   *   • SPINNER YOK. Eskiden yanıt beklenirken butonun glifi loader'a dönüyor
   *     (`recoveringId` + `busy`), kart da yerinde donuyordu; kutlama ancak
   *     cevap gelince başlıyordu. Free kullanıcıda dönen şey daha da
   *     yanıltıcıydı — bekleyen aksiyon değil, sonunda paywall'a çıkacak bir
   *     kontroldü (aynı gerekçe: actingRef).
   *   • Paywall kapısı istekten ÖNCE: free kullanıcı 403'ü beklemeden satış
   *     ekranını görüyor ve kart hiç kıpırdamıyor.
   *   • İstek fire-and-forget; kutlama AYNI KAREDE başlıyor, yanıt yalnız
   *     sonucu bildiriyor (toast + hata yolunda listeyi sunucudan doğrulatma).
   *
   * Yanıt `matchId` TAŞIMIYOR: backend `Match` ve `Conversation` satırlarını
   * asenkron yazıyor, sohbete yönlendirme SignalR `MatchNotification`ından
   * geliyor (AppNavigator global MatchModal'ı açıyor, bu ekran da `uiBus`
   * "match" ile kartı zaten düşürüyor).
   */
  const handleRecover = useCallback(
    async (item) => {
      const userId = item?.userId;
      // Guard'lar beğeniyle aynı: uçmakta olan kart hâlâ veride duruyor (ikinci
      // basış aynı kişiye ikinci bir istek göndermesin) ve kutlama sürerken
      // (flamePendingRef) hiçbir karta aksiyon alınamaz — dalga ekranı kaplayana
      // kadar liste dokunulabilir kalıyor ve ikinci bir onay, tek olan örtme
      // anını kendi kartına kaydırıp ilkini yarım bırakırdı.
      if (
        !userId ||
        actingRef.current ||
        flamePendingRef.current ||
        exitTimersRef.current.has(userId)
      ) {
        return;
      }

      // Kurtarma 2026-08-31'den beri premium ayrıcalığı: tükenebilecek bir kota
      // yok, sunucunun 403'ü TEK bir şey demek — kullanıcı free. O yüzden kapı
      // istekten önce burada: satılacak şey de zaten aboneliğin kendisi.
      //
      // §11: paywall'dan ÖNCE canonical tazeleme — başka cihazda ABONE OLUNMUŞSA
      // doğru cevap satış ekranı değil, kartların kilidini açmak. Tazeleme
      // SESSİZ (actingRef): kartta hiçbir iz bırakmıyor.
      if (!isPremium) {
        actingRef.current = true;
        const premium = await dispatch(refreshEntitlementsForPaywall())
          .unwrap()
          .catch(() => false);
        actingRef.current = false;
        if (!premium) {
          openLitPlus();
          return;
        }
        statsQuery.refetch?.();
      }

      Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
      // İstek ANINDA gidiyor, kartın veriden düşmesi kutlama kadar gecikiyor.
      // Kurtarma = geri alınmış bir "geç", yani kesin bir eşleşme: kart BEĞEN
      // YÖNÜNE UÇMUYOR, Keşfet'teki süper beğeni/not kutlamasının aynısı oynuyor
      // ve kart alev ekranı kaplamışken listeden düşüyor (bkz. runCardFlameExit).
      //
      // Bakiye HİZALAMASI YOK ve gerekmiyor: kurtarma premium'da sınırsız,
      // free bu satıra hiç gelmiyor. Harcanan bir sayı olmadığı için ne iyimser
      // düşüş ne kanonik tazeleme kaldı (ikisi birlikte 2026-08-24'teki "kota
      // 5/5'te takılı kalıyor" bug'ı içindi).
      const request = recoverMissedMatch(userId);
      // Hata yolundaki doğrulama çekimi kartın düşmesinden SONRA olmalı:
      // kutlama oynarken gelen taze liste kartı yerinde tutar, düşüş örtünün
      // altında değil ekranın ortasında olurdu. Yanıt çıkıştan önce de sonra da
      // gelebildiği için iki yön de bu iki bayrakla bağlanıyor.
      let exited = false;
      let needsResync = false;
      runCardFlameExit(userId, () => {
        exited = true;
        dropMissed(userId);
        if (needsResync) loadMissed({ force: true });
      });

      const outcome = await request;
      if (outcome.kind === "recovered") {
        showInfoToast({
          title: t("likes.recoverSuccessTitle"),
          message: t("likes.recoverSuccessMessage"),
          icon: "recovery",
        });
        // SignalR kopmuş olabilir: `MatchNotification` gelmezse sohbet
        // backend'de VARDIR ama uygulama haberdar olmaz. Tek seferlik emniyet —
        // sinyal geldiyse zaten AppNavigator tazeliyor, bu istek fazladan ama
        // zararsız. (Backend'in "eşleşme yok" durumu buraya HİÇ düşmüyor:
        // engelli/uygunsuz çift 400 ile ayrı dalda dönüyor.)
        if (matchSignalTimerRef.current) {
          clearTimeout(matchSignalTimerRef.current);
        }
        matchSignalTimerRef.current = setTimeout(() => {
          dispatch(fetchConversations({ force: true }));
        }, MATCH_SIGNAL_TIMEOUT_MS);
        return;
      }

      // Buradan aşağısı KART ZATEN GİTMİŞKEN çalışıyor — iyimser akışın bedeli.
      // Üç ihtimal kaldı: 400 (zaten kurtarılmış, pas penceresi geçmiş, çift
      // uygun değil), geçici hata (401/5xx/ağ) ve yerel tier bayatken gelen 403.
      // Hiçbirinde kurtarma gerçekleşmedi, yani son söz sunucunun: listeyi
      // tazeliyoruz ve kart hâlâ oradaysa geri geliyor.
      if (outcome.kind === "paywall") {
        // Yukarıdaki kapı `isPremium`e bakıyor; sunucu yine de 403 dediyse
        // yerel tier BAYAT (abonelik arada düşmüş olabilir). Canonical'i
        // tazele, hâlâ free ise satış ekranını aç — hata toast'ı YOK, paywall
        // mesajın kendisi.
        const premium = await dispatch(refreshEntitlementsForPaywall())
          .unwrap()
          .catch(() => false);
        if (premium) statsQuery.refetch?.();
        else openLitPlus();
      } else {
        showInfoToast({
          title: t("likes.recoverFailed"),
          message: outcome.message ?? "",
          icon: "recovery",
        });
      }
      if (exited) loadMissed({ force: true });
      else needsResync = true;
    },
    [
      dispatch,
      dropMissed,
      isPremium,
      loadMissed,
      runCardFlameExit,
      statsQuery,
      t,
    ],
  );

  // LikerSwipeModal'dan dönen swipe sonrası — like/pass/superlike/block fark
  // etmez,
  // kullanıcı bu liker'ı handle etti → listeden anında çıkar (backend
  // MatchNotification gelene kadar bekleme). Rozet de aynı karede düşer:
  // sayacı `next.length`e eşitlemiyoruz, o yalnızca YÜKLENEN sayfanın boyutu —
  // toplam daha büyükse rozeti sessizce yanlışa çekerdi.
  const handleLikerSwiped = (likerUserId, direction) => {
    if (!likerUserId) return;
    const passed = likesRef.current.find(
      (it) => it.userId === likerUserId || it.likerUserId === likerUserId,
    );
    const next = likesRef.current.filter(
      (it) => it.userId !== likerUserId && it.likerUserId !== likerUserId,
    );
    likesRef.current = next;
    setLikes(next);
    dispatch(removeWhoLikedMe(likerUserId));
    // Pass = kesin kaçırılmış eşleşme; bu kişi zaten seni beğenmişti.
    if (direction === "left") {
      showMissedMatchToast({
        name: passed?.name,
        photoUrl: passed?.mainPhoto,
      });
    }
  };

  /**
   * Karttaki yuvarlak X / ✓ butonları — LikerSwipeModal'ı açmadan doğrudan
   * pas/beğeni. Sonuç tarafı modal'daki jestle BİREBİR aynı yolu kullanıyor
   * (`useSwipeMutation` + `handleLikerSwiped`): liste/rozet düşmesi, kaçırılan
   * eşleşme toast'ı ve mutual like'ta MatchNotification akışı tek yerden gelir.
   *
   * Kilit, kart dokunuşundakiyle AYNI (bkz. openLikerProfile): free kullanıcı
   * blur'lu bir kartı butonla da "harcayamaz" — kim olduğunu görmeden pas
   * geçmek de beğenmek de premium'un sattığı bilgiyi bedava tüketirdi.
   * Açık beğeniler (SuperLike / NOT) burada da istisna: zaten blur'suz
   * gösteriliyorlar, yanıtlanabilmeleri ürünün kendisi (bkz. isUnlockedLike).
   */
  const handleQuickSwipe = useCallback(
    async (item, direction) => {
      const likerUserId = item?.userId || item?.likerUserId;
      // Uçmakta olan kart hâlâ veride duruyor: ikinci bir basış aynı kişiye
      // ikinci bir swipe göndermesin. Kutlama sürerken (flamePendingRef) HİÇBİR
      // karta aksiyon alınamaz: dalga ekranı kaplayana kadar liste dokunulabilir
      // kalıyor ve ikinci bir onay, tek olan örtme anını kendi kartına kaydırıp
      // ilkini yarım bırakırdı.
      if (
        !likerUserId ||
        actingRef.current ||
        flamePendingRef.current ||
        exitTimersRef.current.has(likerUserId)
      ) {
        return;
      }

      if (!isPremium && !isUnlockedLike(item)) {
        // §11: paywall'dan önce canonical tazeleme — başka cihazda premium
        // olunmuşsa kullanıcıyı satış ekranına düşürmek yanlış olur.
        // Bayrak SESSİZ: tazeleme kartta hiçbir iz bırakmıyor, kullanıcı ya
        // paywall'ı ya da (başka cihazda premium olunmuşsa) aksiyonun kendisini
        // görüyor (bkz. actingRef).
        actingRef.current = true;
        const premium = await dispatch(refreshEntitlementsForPaywall())
          .unwrap()
          .catch(() => false);
        actingRef.current = false;
        if (!premium) {
          openLitPlus();
          return;
        }
      }

      Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
      // İstek ANINDA gidiyor, kartın veriden düşmesi animasyon kadar gecikiyor:
      // görsel yumuşama ağı bekletmesin.
      swipeMutate({ direction, userId: likerUserId });
      if (direction === "right") {
        // ONAY: bu kişi seni zaten beğenmişti, yani sonuç eşleşme. Kart yana
        // uçmuyor — kutlama alevi giriyor ve kart örtünün altında düşüyor
        // (bkz. runCardFlameExit). Pas yönü olduğu gibi kalıyor: orada
        // kutlanacak bir şey yok, kart sola uçup söner.
        // Örtünün altındaki temizlik HER İKİ listeyi de kapsıyor: eşleşme
        // sinyali kutlama sürerken geldiğinde `pruneBoth` bu kartı atlıyor
        // (bkz. aşağıdaki prune guard'ı), yani kaçırdıkların tarafını da
        // buranın düşürmesi gerek.
        runCardFlameExit(likerUserId, () => {
          handleLikerSwiped(likerUserId, direction);
          dropMissed(likerUserId);
        });
        return;
      }
      runCardExit(likerUserId, "left", () =>
        handleLikerSwiped(likerUserId, direction),
      );
    },
    // handleLikerSwiped her render'da yeniden yaratılıyor ama yalnızca ref +
    // dispatch okuyor; bağımlılığa eklemek callback'i her render'da tazelerdi.
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [
      dispatch,
      dropMissed,
      isPremium,
      runCardExit,
      runCardFlameExit,
      swipeMutate,
    ],
  );

  /**
   * Kişiyi HER İKİ listeden birden düşürür — engelleme ve "engelle" kutusu
   * işaretli şikayet buradan geçer.
   *
   * ⚠️ Tek çağıran artık profil modalı (bkz. handleModalSwipe). Karttaki
   * bayrak/engelle butonları çekme jestiyle birlikte kalktı, moderasyon
   * tamamen modalın kendi satırında.
   *
   * `handleLikerSwiped` tek başına YETMİYOR: o yalnız `likes` dizisine
   * dokunuyor, kaçırdıkların listesi ayrı bir dizi. Modal doğrudan ona
   * bağlansaydı Kaçırdıklarım sekmesinde engellenen kart listede kalırdı.
   */
  const dropFromLists = useCallback(
    (userId) => {
      // Yönsüz çıkış: engelleme/şikayet bir "geç" ya da "beğen" değil, kart
      // yana uçmak yerine yerinde söner.
      runCardExit(userId, "out", () => {
        handleLikerSwiped(userId, "block");
        // Kaçırdıkların listesi ayrı bir dizi — `handleLikerSwiped` ona dokunmaz.
        dropMissed(userId);
      });
    },
    // handleLikerSwiped ref + dispatch okuyor (bkz. handleQuickSwipe notu).
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [runCardExit, dropMissed],
  );

  /**
   * Modalın swipe/engelleme sonucu. "block" yönü AYRI bir yol izliyor:
   * engelleme her iki listeden de düşmeli, düz swipe ise yalnız beğeni
   * listesinden. Modal iki durumu da aynı `onSwipe` ile bildiriyor (engelleme
   * de "block" yönüyle geliyor), ayrımı burada yapıyoruz.
   */
  const handleModalSwipe = useCallback(
    (userId, direction) => {
      if (direction === "block") {
        dropFromLists(userId);
        return;
      }
      handleLikerSwiped(userId, direction);
    },
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [dropFromLists],
  );

  // Karta giden prop'ların SABİT sürümleri. Hepsi kartı parametre alıyor;
  // eskiden bunlar `renderItem` içinde her çizimde yeniden üretilen kapanışlardı
  // (`() => handleQuickSwipe(item, "left")` gibi) ve kartın memo'sunu her
  // seferinde geçersiz kılıyorlardı.
  const handleLikeCard = useCallback(
    (item) => handleQuickSwipe(item, "right"),
    [handleQuickSwipe],
  );

  // Bu ekran dışında handle edilen liker'lar (match, ya da Discover destesinde
  // pass'lenmiş bir liker) listeden düşsün. Ekran lazy mount olup açık kaldığı
  // için kendi kendine tazelenmiyor; bu olmadan liste bayat kalıyordu.
  // Rozet sayacı iki olayda da kaynağında düşürülüyor (AppNavigator /
  // DiscoverScreen) — burada TEKRAR dispatch etmiyoruz, çift düşerdi.
  // Fetch'ten gelen item'lar `userId`, realtime eklenenler `likerUserId`
  // alanı taşıyor; iki ihtimali de kontrol et.
  useEffect(() => {
    const prune = (userId) => {
      if (!userId) return;
      const prev = likesRef.current;
      const next = prev.filter(
        (it) => it.userId !== userId && it.likerUserId !== userId,
      );
      if (next.length === prev.length) return;
      likesRef.current = next;
      setLikes(next);
    };
    // Kaçırdıkların listesi de aynı olaylardan etkileniyor: bir kişiyle
    // eşleştiysen (kurtarma ya da başka yoldan) artık "kaçırılmış" değil.
    // Düşürme `dropMissed` üzerinden — sekme pill'indeki adet de onunla iniyor.
    const pruneBoth = (userId) => {
      // Kart ZATEN bir çıkışın içindeyse dokunma. Kritik olan onay/kurtarma:
      // ikisi de eşleşme yaratıyor, yani `MatchNotification` kutlamanın tam
      // ortasında (~1 sn) geliyor ve buradan düşürülseydi kart alev daha
      // ekranın yarısındayken AÇIKTA yok olurdu — kaçınmaya çalıştığımız şeyin
      // ta kendisi. Çıkışın kendi `remove`'u aynı temizliği örtünün altında
      // zaten yapıyor (bkz. runCardFlameExit çağrıları: her ikisi de hem
      // beğeni listesini hem kaçırdıkları düşürüyor).
      if (userId && exitTimersRef.current.has(userId)) return;
      prune(userId);
      dropMissed(userId);
    };
    const unsubMatch = uiBus.on("match", (m) => pruneBoth(m?.matchedUserId));
    const unsubHandled = uiBus.on("likerHandled", (p) => pruneBoth(p?.userId));
    return () => {
      unsubMatch();
      unsubHandled();
    };
    // `dropMissed` referansı sabit (useCallback []) — abonelik yeniden kurulmaz.
  }, [dropMissed]);

  // Realtime: socket'ten yeni IncomingLike geldiğinde listeyi reload etmeden prepend et.
  // AppNavigator IncomingLike SignalR event'ini yakalayıp uiBus.emit('incomingLike', payload)
  // çağırır; payload backend IncomingLikeDto = { likerUserId, likerDisplayName,
  // likerPhotoUrl, isSuperLike, isNote, notePreview, likedAt }. Mutual like'ta
  // backend bu event'i göndermez (MatchNotification akışı çalışır) — burada
  // dedup gerekmiyor.
  //
  // ⚠️ Not için AYRI bir event YOK (sözleşme §6): aynı olaya `isNote` +
  // `notePreview` eklendi. Önizleme ~60 karakter, yani KIRPIK — canlı kart
  // `noteId` de taşımıyor. İkisi de reconcile'da (scheduleLikesReconcile) tam
  // kayıtla değişiyor; o yüzden bu kartta şikayet not id'siz gider.
  useEffect(() => {
    const unsub = uiBus.on("incomingLike", (payload) => {
      if (!payload?.likerUserId) return;
      setLikes((prev) => {
        // Aynı liker zaten listedeyse (ör. reconnect race) ekleme.
        const isSuper = !!payload.isSuperLike;
        const dupId = `${isSuper ? "sl" : "l"}_live_${payload.likerUserId}`;
        const existingByUser = prev.some(
          (it) => it.id === dupId || it.likerUserId === payload.likerUserId,
        );
        if (existingByUser) return prev;

        const notePreview =
          typeof payload.notePreview === "string"
            ? payload.notePreview.trim()
            : "";
        const card = {
          // profileId yok (DTO sadece userId döner) — live kart için sentetik id.
          id: dupId,
          likerUserId: payload.likerUserId,
          name: payload.likerDisplayName || "",
          age: null, // backend payload'da age yok; kart "İsim, " olarak görünür — kabul
          mainPhoto: payload.likerPhotoUrl || "",
          likedAt: payload.likedAt,
          isSuperLike: isSuper,
          isNote: !!payload.isNote,
          // Önizleme boşsa `note` hiç kurulmuyor: kart `!!item.note`a bakıp
          // yorum bloğunu çiziyor, boş bir yorum kutusu çizmenin anlamı yok.
          // Blur yine açık kalır — onu `isNote` taşıyor.
          note: notePreview ? { comment: notePreview } : null,
        };

        // Yeni SuperLike → listenin en başına (en yeni en üstte).
        if (isSuper) return [card, ...prev];

        // Yeni normal Like → SuperLike bloğunun hemen altına, normal like'ların başına.
        const firstNonSuper = prev.findIndex((it) => !it.isSuperLike);
        if (firstNonSuper === -1) return [...prev, card];
        return [
          ...prev.slice(0, firstNonSuper),
          card,
          ...prev.slice(firstNonSuper),
        ];
      });
    });
    return unsub;
  }, []);

  // Sekmeler pill satırının İÇİNDE tanımlıydı; geçiş yönü (yeni sekme eskisinin
  // sağında mı solunda mı) bu sıraya bakmak zorunda, dolayısıyla sıra tek yerde
  // durmalı — iki ayrı liste tutulsaydı biri değişip diğeri unutulduğunda
  // animasyon sessizce ters yöne kayardı.
  //
  // Adetler: dolu sekmenin etiketinin yanında bir sayı (bkz. FilterPills
  // `count`). Kaçırdıkların sayısı LİSTEDEN gelmiyor — o liste ancak sekmeye
  // basılınca çekiliyor ve sayı sekmeye girmenin sebebi. Ekran odağa gelince
  // hafif bir sayı turu atılıyor (bkz. loadMissedCount) ve sonuç `missedTotal`e
  // yazılıyor; `missed.length` kullanılsaydı hem sekmeye girmeden 0 görünürdü
  // hem de girildiğinde ilk sayfayla (20) sınırlı kalırdı. Sayı hâlâ
  // bilinmiyorsa `null` gidiyor — pill onu çizmiyor, "0" yazmıyor.
  const tabs = useMemo(
    () => [
      { key: "all", label: t("likes.tabAll"), count: likeCounts.all },
      { key: "like", label: t("likes.tabLike"), count: likeCounts.like },
      {
        key: "superlike",
        label: t("likes.tabSuperLike"),
        count: likeCounts.superLike,
      },
      { key: "note", label: t("likes.tabNote"), count: likeCounts.note },
      { key: "missed", label: t("likes.tabMissed"), count: missedTotal },
    ],
    [t, likeCounts, missedTotal],
  );

  // Pill'e basınca pager'a sayfa değiştirmesini söylüyoruz; `activeTab` state'i
  // pager'ın kendi olaylarından dönüyor. Doğrudan setState edilseydi sekme
  // state'inin iki kaynağı olurdu (pill ve parmak jesti) ve ikisi birbirini
  // ezerdi — özellikle jest yarıda bırakılıp geri dönüldüğünde.
  const handleTabChange = useCallback(
    (key: string) => {
      const index = tabs.findIndex((tb) => tb.key === key);
      if (index < 0) return;
      // Yükleme pill'e BASILDIĞI anda başlıyor, `activeTab` değişince değil:
      // state pager oturunca dönüyor (bkz. usePagerTabCommit), ona bağlı
      // kalsaydı sayfa boş kayıp gelir, yerine oturduktan sonra iskelet
      // belirirdi. Guard'lar (in-flight + tazelik) mükerrer isteği zaten
      // yutuyor — `activeTab` effect'i birazdan aynı çağrıyı yapacak.
      if (key === "missed") loadMissed();
      pagerRef.current?.setPage(index);
    },
    [tabs, loadMissed],
  );

  // Sekme state'i pager DURUNCA yazılıyor. Kaymanın ortasında yazıldığında bu
  // ekranın render'ı (beş sayfa + liste başlıkları) geçişin tam ortasında bir
  // Fabric commit'i doğuruyor ve ana thread'de mount işi yapıldığı için sayfayla
  // birlikte kayan büyük başlık/alt yazı bir kare takılıyordu. Ayrıntı:
  // usePagerTabCommit.
  const commitPage = useCallback(
    (index: number) => {
      const key = tabs[index]?.key;
      if (key) setActiveTab(key);
    },
    [tabs],
  );
  const pagerCommitHandlers = usePagerTabCommit(commitPage);

  // Listenin içerik payı — beş sayfa da AYNI iki nesneden birini kullanıyor.
  // Render'da kurulsaydı her çizimde yeni bir stil kimliği doğar ve beş
  // listenin içerik kabı boşuna yeniden commit edilirdi; sekme kayarken düşen
  // bir commit'te bu iş doğrudan geçişin üstüne biniyor.
  //
  // Ayrılan pay HEADER SATIRININ kendisi: sekme şeridi orada duruyor (sabit,
  // kaymıyor), dolayısıyla liste onun altından başlamalı. Sabit elle
  // kopyalanmıyor — ölçü değiştiği gün büyük başlık şeridin altına girerdi.
  // Sondaki 14 yalnız nefes payı.
  const listContentStyle = useMemo(
    () => ({
      flexGrow: 1,
      paddingHorizontal: LIST_H_PADDING,
      paddingTop: insets.top + SCREEN_HEADER_TITLE_HEIGHT + 14,
      // 120 = alttaki tab bar payı.
      paddingBottom: 120,
    }),
    [insets.top],
  );
  // Boş sayfada dip payı yok: içerik zaten ekranı doldurmuyor, 120'lik pay boş
  // durumu yukarı itiyordu.
  const emptyListContentStyle = useMemo(
    () => ({ ...listContentStyle, paddingBottom: 0 }),
    [listContentStyle],
  );

  // Header her sayfanın KENDİ liste başlığında: büyük başlık sayfayla birlikte
  // native olarak kayıyor (pager'ın dışına alınsaydı hiç kaymazdı). Sekme
  // şeridi artık ekranın header'ında ve sabit — büyük başlık onun altından
  // başlayıp kaydırınca üstünden geçiyor.
  const renderListHeader = (tabKey: string) => {
    const headerAction = headerActionFor(tabKey);
    return (
      // Bölüm başlığı — HER sekmede var ve sekme şeridinin ALTINDA: sayfanın
      // "büyük başlığı" o, şerit onun üstündeki filtre satırı.
      // Kaçırdıkların sekmesinde başlık da sekmenin adı; kurtarma bakiyesi
      // (sayıyı ve tavanı /Stats veriyor, tier tavanları backend config'inden
      // geldiği için burada YAZILMIYOR) altındaki açıklama satırının sonunda.
      // Sağdaki "Nasıl alırım?" pill'i üç sekmede (bkz. headerActionFor).
      <LikesListHeader
        title={sectionTitleFor(tabKey)}
        description={tabDescriptionFor(tabKey)}
        actionLabel={headerAction?.label ?? null}
        onActionPress={headerAction?.onPress ?? null}
      />
    );
  };

  // Liste HER ZAMAN mount — yükleme/boş/dolu üç durumu da aynı FlatList'in
  // içinde geçiyor. Önce ayrı bir `loading ?` dalı vardı: skeleton kendi
  // container'ında, boş durum listenin içinde çiziliyordu; aradaki geçiş
  // ağaç değişimi olduğu için sekmeler bile yeniden mount oluyordu.
  const renderListEmpty = (tabKey: string) => {
    if (tabKey === "missed") {
      // Kaçırdıkların kendi yükleme durumunu taşıyor (ayrı uç, ayrı istek).
      // Skeleton gecikme/asgari-süre makinesine bağlanmıyor: bu liste yalnız
      // sekmeye basınca çekiliyor, yani kullanıcı zaten bir bekleme bekliyor.
      if (missedSkeletonVisible) return <LikesSkeletonList />;
      // İlk tur BİTMEDEN boş durum çizilmiyor: "Kaçırdığın kimse yok" henüz
      // bilinmeyen bir şeyi söylerdi (bkz. missedLoaded). Tek istisna adedin
      // SIFIR bilinmesi (missedKnownEmpty) — orada cevap zaten elimizde ve
      // sayfa iskelete hiç uğramadan boş durumla açılıyor.
      if (!missedLoaded && !missedKnownEmpty) return null;
      return (
        <View className="flex-1 items-center justify-center pb-[50%]">
          <EmptyState
            // Bu sekmenin konusu süper beğeni DEĞİL kurtarma: eksik olan şey
            // bir beğeni değil, geri alınacak bir kaçırma. Glif kurtarma
            // butonuyla (RecoverGlassButton) ve kolondaki kurtar aksiyonuyla
            // aynı — boş sayfa hangi aksiyonun burayı dolduracağını söylesin.
            //
            // `sf` GEÇİLMİYOR, iOS'ta da lucide çiziliyor: SF sembolü kendi
            // en-boy oranıyla geliyor (kutusu 100×100 değil) ve gövdesi
            // "regular" ağırlıkta kalın — diğer sekmelerin boş durumunda ise
            // ikon 24'lük viewBox'lı konturlu bir SVG. Yan yana konduğunda
            // hem başlık farklı yükseklikten başlıyor hem de glif daha ağır
            // okunuyordu. Lucide de 24 viewBox'ta olduğu için kutu tam
            // 100×100 ve `iconStrokeWidth={1}` ekranda diğer gliflerle AYNI
            // kalınlığa (100/24 ≈ 4.2px) düşüyor.
            Icon={RotateCcw}
            iconStrokeWidth={1}
            topOffset={0}
            text={t("likes.emptyMissed")}
            subtitle={missedEmptySubtitle}
            buttonLabel={t("likes.startSwipingButton")}
            // Etiket koyuda da SİYAH: `text` koyu modda beyaza dönüp litPlus
            // dolgunun üstünde duruyordu, burada sabit mürekkep isteniyor.
            buttonLabelColor={colors.onMediaInverse}
            onButtonPress={() => navigation.navigate("Discover")}
          />
        </View>
      );
    }
    if (showSkeleton) return <LikesSkeletonList />;
    // Skeleton gecikmesi penceresi: boş durumu ERKEN göstermek de bir flash —
    // istek daha sürüyorken "hiç beğenin yok" yazıp sonra geri almak yerine
    // sadece sekmeler dursun.
    if (loading) return null;
    return (
      <View className="flex-1 items-center justify-center pb-[50%]">
        <EmptyState
          // Not sekmesi kendi ürününün glif'ini alıyor: o listede eksik olan
          // şey beğeni değil NOT — boş sayfa hangi ürünü beklediğini söylesin.
          Icon={tabKey === "note" ? EmptyNoteIcon : EmptyHeartIcon}
          iconStrokeWidth={1}
          topOffset={0}
          text={
            tabKey === "superlike"
              ? t("likes.emptySuperLike")
              : tabKey === "note"
                ? t("likes.emptyNote")
                : tabKey === "like"
                  ? t("likes.emptyLike")
                  : t("likes.emptyAll")
          }
          subtitle={
            tabKey === "superlike"
              ? t("likes.emptySuperLikeSubtitle")
              : tabKey === "note"
                ? t("likes.emptyNoteSubtitle")
                : tabKey === "like"
                  ? t("likes.emptyLikeSubtitle")
                  : t("likes.emptyAllSubtitle")
          }
          // Üç filtrenin boş durumu da aynı yere çıkar: beğeni beklemek yerine
          // kaydırmaya dön. Sekmeye göre değişen etiketler (süper beğeni gönder
          // / profilimi geliştir) tek bir "kaydırmaya başla" aksiyonuna indi.
          buttonLabel={t("likes.startSwipingButton")}
          buttonLabelColor={colors.onMediaInverse}
          onButtonPress={() => navigation.navigate("Discover")}
        />
      </View>
    );
  };

  /**
   * Bir sekmenin tam sayfası: kendi header'ı (büyük başlık + pill satırı +
   * açıklama kartı) ve kendi listesi. Beş sayfanın hepsi AYNI ANDA canlı —
   * pager'ın örtüşen geçişi ancak böyle mümkün: eski sayfa sola çıkarken yeni
   * sayfa sağdan giriyor, ikisi de ekranda.
   *
   * ⚠️ `onScroll` YALNIZ aktif sayfada bağlı. ScreenHeader'ın küçük başlığı tek
   * bir `scrollY`ye bakıyor; beş sayfa birden yazsaydı arka plandaki sayfaların
   * (0'da duran) offset'i öndekini ezer, başlık rastgele belirip kaybolurdu.
   */
  const renderPage = (tabKey: string) => {
    const data = listDataFor(tabKey);
    const isMissed = tabKey === "missed";
    const empty = renderListEmpty(tabKey);
    // Bu SEKMEDE iskelet mi çiziliyor — dip payı buna bakıyor. İki sekme
    // ailesinin yükleme bayrağı ayrı (kaçırdıkların ayrı uçtan geliyor);
    // eskiden ikisi tek ifadede AND'leniyordu, yani beğeni listesi yüklenirken
    // kaçırdıkların boş sayfası da 120 pay alıyordu.
    const showsSkeleton = isMissed ? missedSkeletonVisible : showSkeleton;
    return (
      <Animated.FlatList
        data={data}
        onScroll={tabKey === activeTab ? scrollHandler : undefined}
        scrollEventThrottle={16}
        // Bir kart veriden düştüğünde altındaki hücreler boşluğa YAVAŞÇA kayar
        // (yerlerine zıplamak yerine). Kartın kendi çıkışı ayrı iş: o
        // transform/opacity ile LikeCard içinde oynuyor.
        //
        // Sekme geçişinde artık KAPATILMASI GEREKMİYOR: her sekmenin kendi
        // listesi var, bir sekmeden diğerine geçerken hiçbir satır yer
        // değiştirmiyor — dikey sürüklenme sorunu (eski skipItemLayoutRef)
        // tek listeyi paylaşmaktan doğuyordu.
        itemLayoutAnimation={CARD_LAYOUT_TRANSITION}
        renderItem={({ item }) => (
          <MemoLikeCard
            item={item}
            isPremium={isPremium}
            onPress={openLikerProfile}
            onRecover={isMissed ? handleRecover : undefined}
            onLike={handleLikeCard}
            likeLabel={t("likes.likeButton")}
            recoverLabel={t("likes.recoverButton")}
            superLikeLabel={t("likes.superLikePill")}
            exitDirection={exitingIds[item.userId || item.likerUserId] ?? null}
          />
        )}
        keyExtractor={(item) => item.id}
        ListHeaderComponent={renderListHeader(tabKey)}
        ListEmptyComponent={empty}
        // Skeleton da 3 kart yüksekliğinde — boş durum gibi 0 padding verirsek
        // son satır tab bar'ın altında kalıyor (bkz. iki stil).
        contentContainerStyle={
          data.length === 0 && !showsSkeleton
            ? emptyListContentStyle
            : listContentStyle
        }
        showsVerticalScrollIndicator={false}
      />
    );
  };

  return (
    <View className="flex-1" style={{ backgroundColor: colors.bg }}>
      {/* Sekmeler bir pager — geçişi native yapıyor: eski sayfa çıkarken yeni
          sayfa giriyor, ikisi aynı anda ekranda. Elle yazılmış çıkış/giriş
          animasyonu bunu veremiyordu (tek liste vardı, iki içerik aynı anda
          çizilemiyordu) ve arada eski içeriğin ekranda kaldığı bir pencere
          bırakıyordu.
          ⚠️ Kartlardaki sağdan-sola çekme jesti bu kaydırmayla aynı parmak
          hareketini istiyordu; jest kaldırıldı (bkz. LikeCard). */}
      <AnimatedPagerView
        ref={pagerRef}
        style={{ flex: 1 }}
        initialPage={0}
        onPageScroll={pagerScrollHandler}
        // Sekme state'inin TEK kaynağı bu ikili: pill'e basmak da parmakla
        // çevirmek de önce pager'ı hareket ettiriyor, state buradan dönüyor.
        // Pill'den doğrudan setState edilseydi parmakla çevirmede iki kaynak
        // olurdu. Seçim ref'te bekliyor, React state'i kayma bitince (idle)
        // değişiyor — bkz. usePagerTabCommit.
        onPageSelected={pagerCommitHandlers.onPageSelected}
        onPageScrollStateChanged={pagerCommitHandlers.onPageScrollStateChanged}
      >
        {tabs.map((tab) => (
          <View key={tab.key} style={{ flex: 1 }} collapsable={false}>
            {renderPage(tab.key)}
          </View>
        ))}
      </AnimatedPagerView>

      {/* Logo YOK ve BAŞLIK DA YOK: header satırının yerini sekme şeridi aldı
          (Profil ekranındaki kurulumun aynısı). Scroll'la beliren başlık tam
          onun üstüne binerdi; sayfanın adı zaten listenin içindeki büyük
          başlık.
          ⚠️ Logo gidince swipe kotası göstergesi de gitti (WaveFillLogo'nun
          dolgusu `fillRatio`dan geliyordu), o yüzden prop da kaldırıldı —
          header'a gelen tek şey scroll konumu (bulanık zemin onu okuyor). */}
      <ScreenHeader
        scrollY={scrollY}
        showLogo={false}
        centerSlot={
          // Şerit ORTALANMIYOR (Profil'de iki sekme var, burada beş): sığmaz.
          // Kaydırılabilir şerit tam genişlikte duruyor ve büyük başlıkla aynı
          // sol hattan (HEADER_LEFT_INSET) başlıyor.
          //
          // `width: "100%"` ŞART: slot `alignItems: "center"` ile hizalıyor,
          // kap içeriği kadar daralır ve şerit ortalanmış bir blok olurdu.
          <View style={{ width: "100%" }}>
            <PagerTabBar
              tabs={tabs}
              activeTab={activeTab}
              offset={pagerOffset}
              onPress={(key) => handleTabChange(key)}
              inset={HEADER_LEFT_INSET}
            />
          </View>
        }
      />

      {/* Alttaki sticky "Seni beğenenleri gör" butonu KALDIRILDI: premium
          upsell'in tek yeri artık başlığın yanındaki pill (bkz. headerAction).
          Buton listenin üstüne biniyor, son kartı kapatıyor ve kilidin ne
          olduğunu ancak sayfanın dibinde söylüyordu. */}

      {/* Satın alma sonrası liste tazelemesi onSuccess'te değil, isPremium
          false→true transition effect'inde (yukarıda) yapılıyor. */}

      {/* Kurtarma paketi sheet'i KALDIRILDI (2026-08-31): kurtarma consumable
          olmaktan çıkıp premium ayrıcalığı oldu, satılacak bir paket kalmadı.
          Free'nin paywall'ı artık doğrudan abonelik (bkz. handleRecover). */}

      {/* SuperLike / not paketleri — başlığın yanındaki "Nasıl alırım?"
          pill'inden açılıyor. DiscoverScreen'dekiyle aynı sheet'ler ve aynı
          kapanış davranışı: satın alma sonrası kapan + /Stats'ı tazele (bakiye
          bu ekranda görünmese de kota sayıları oradan besleniyor). */}
      <SuperLikePurchaseModal
        visible={superLikePurchaseVisible}
        onClose={() => setSuperLikePurchaseVisible(false)}
        onPurchased={() => {
          setSuperLikePurchaseVisible(false);
          statsQuery.refetch?.();
        }}
      />

      <NotePurchaseModal
        visible={notePurchaseVisible}
        onClose={() => setNotePurchaseVisible(false)}
        onPurchased={() => {
          setNotePurchaseVisible(false);
          statsQuery.refetch?.();
        }}
      />

      <LikerSwipeModal
        visible={previewVisible}
        profile={previewProfile}
        onClose={handleClosePreview}
        // Doğrudan `handleLikerSwiped` DEĞİL: engelleme yönü kaçırdıkların
        // listesinden de düşmeli (bkz. handleModalSwipe).
        onSwipe={handleModalSwipe}
        swipeDisabled={previewSwipeDisabled}
      />
    </View>
  );
}
