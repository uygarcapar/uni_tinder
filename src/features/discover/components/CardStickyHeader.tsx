import { useMemo } from "react";
import { useTranslation } from "react-i18next";
import { StyleSheet, Text, View } from "react-native";
import Animated, {
  useAnimatedReaction,
  useAnimatedStyle,
  useSharedValue,
  withTiming,
  Easing,
} from "react-native-reanimated";
import type { SharedValue } from "react-native-reanimated";
import MaskedView from "@react-native-masked-view/masked-view";
import { easeGradient } from "react-native-easing-gradient";
import { BlurView } from "expo-blur";
import { LinearGradient } from "expo-linear-gradient";
import PremiumBadge from "@/shared/components/PremiumBadge";
import ActivityStatus from "./ActivityStatus";
import { colors as theme, veil } from "@/shared/theme/colors";
import { chromeBlurTint } from "@/shared/theme/blur";
import { resolveCardAge } from "../cardPrivacy";
import {
  SUPER_LIKE_GLASS_INSET,
  SUPER_LIKE_GLASS_SIZE,
} from "./SuperLikeGlassButton";
import CardMenuGlassButton, {
  CARD_MENU_GLASS_SIZE,
} from "./CardMenuGlassButton";

/**
 * Açık kartın üstünde asılı duran başlık şeridi — profil kartının içindeki isim
 * başlığın altından kayıp gidince aynı isim burada belirir (iOS'un large-title
 * devri). Şeritteki isim panelinkinden (text-3xl = 30) belirgin küçük (23) ama
 * eski 20'den büyük: şerit önizlemelerde (`alwaysOpen`) kartın tek başlığı
 * olduğu için orada bir dipnot değil, başlık gibi okunmalı.
 *
 * Zemin PROGRESSIVE BLUR: MaskedView + easeGradient alfa maskesi → üstte tam
 * cam, aşağı doğru şeffafa çözülür. Üçlü ScreenHeader / SearchableListSheet ile
 * birebir aynı: veil perdesi + chrome tint'li BlurView + maske.
 *
 * Blur tint'i `chromeBlurTint()`, kart fotoğraflarındaki gibi sabit "dark"
 * DEĞİL: şerit bu noktada fotoğrafın değil panelin (surface3) üstünde duruyor —
 * orası uygulama chrome'u, modla dönmeli (bkz. theme/blur.ts).
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

// Şeridin ölçüleri asılı süper beğeni butonundan türüyor: başlık satırı o
// butonla AYNI merkezde durur, yoksa kartın üst şeridinde iki farklı hizada iki
// öğe olurdu. (Sheet'te buton çizilmiyor ama şerit iki bağlamda da aynı
// görünsün diye ölçü ortak.)
const TITLE_TOP = SUPER_LIKE_GLASS_INSET;
const TITLE_HEIGHT = SUPER_LIKE_GLASS_SIZE;

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
 * Kartın içindeki büyük ismin ALTININ, şeridin neresine geldiğinde devri
 * tamamlamış sayıldığı çizgi = başlık satırının dibi. Eşiği hesaplayan taraf
 * (SwipeCard) buradan okur: ölçü tek yerde kalsın.
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

/**
 * Cam buton ile ismin arasındaki boşluk. Buton ortak cam ikon ölçüsüne (40)
 * inince isim otomatik olarak sola kaydı — 6pt orada yeterliyken artık isim
 * butona yapışık duruyordu. Yan paya eklenen bu değer o farkı kapatıyor.
 */
const TITLE_GAP_AFTER_BUTTON = 14;

/**
 * Keşif şeridinde başlık satırının SOL payı = süper beğeni butonunun köşe
 * boşluğu. Eskiden solda cam bir "başa dön" butonu vardı ve isim onun sağına
 * kayıyordu; buton kaldırılınca isim o köşeye TAŞINDI — yani satır artık
 * ortalı değil, sola dayalı ve tam butonun durduğu çizgide başlıyor.
 *
 * Sağdaki süper beğeni butonuyla aynı sabitten türüyor: iki öğe kartın üst
 * şeridinde simetrik köşe boşluğunda durur.
 */
const TITLE_LEFT_INSET = SUPER_LIKE_GLASS_INSET;

/**
 * Aynı şeridin SAĞ payı: sağ köşedeki süper beğeni butonunun boşluğu + çapı +
 * nefes. Uzun isim butonun altına girmek yerine "…"ya düşüyor
 * (numberOfLines={1}).
 */
const TITLE_SIDE_INSET =
  SUPER_LIKE_GLASS_INSET + SUPER_LIKE_GLASS_SIZE + TITLE_GAP_AFTER_BUTTON;

/**
 * ÖNİZLEME şeridinin (`alwaysOpen`) yan payı — soldaki isim ve sağdaki üç nokta
 * bu çizgide başlar/biter.
 *
 * KEŞİF'İNKİYLE AYNI SABİT: aynı kart iki bağlamda da aynı kenar payıyla
 * açılıyor. Beğeniler / Sohbet / Profil önizlemesinden açılan kartın şeridi,
 * Keşif'teki kartın şeridinden gözle ayrışmamalı — orada isim de köşe cam
 * butonu da SUPER_LIKE_GLASS_INSET çizgisinde duruyor (bkz. TITLE_LEFT_INSET).
 *
 * Bir dönem 16'ydı ve ölçü altındaki bölüm fotoğraflarından geliyordu (panelin
 * `px-4` dolgusu): üç noktanın sağ kenarı fotoğrafın sağ kenarına hizalansın
 * diye. O hiza bırakıldı — Keşif'te de köşedeki cam buton fotoğrafların
 * çizgisinde değil, kartın köşe boşluğunda duruyor; iki bağlamı ayrıştıran tek
 * şey oydu.
 */
const PREVIEW_SIDE_INSET = TITLE_LEFT_INSET;

/**
 * Önizleme şeridinde başlık satırının SAĞ payı.
 *
 * Sağ köşede üç nokta VARSA pay ondan türüyor (kenar boşluğu + çap + nefes):
 * uzun isim butonun altına girmek yerine "…"ya düşüyor. Sayı Keşif'inkinden
 * (TITLE_SIDE_INSET) birkaç puan büyük, çünkü üç noktanın kabuğu süper beğeni
 * kabuğundan geniş (48 / 44) — GÖRÜNEN kenar payı, yani butonun kartın sağ
 * kenarına uzaklığı ikisinde de aynı.
 *
 * Buton yoksa (Profil kendi önizlemesi) pay soldakiyle eşitleniyor: sağda
 * yer tutan bir şey olmadığı için satır simetrik duruyor.
 */
const PREVIEW_TITLE_INSET_WITH_MENU =
  PREVIEW_SIDE_INSET + CARD_MENU_GLASS_SIZE + TITLE_GAP_AFTER_BUTTON;
const PREVIEW_TITLE_INSET_PLAIN = PREVIEW_SIDE_INSET;

/**
 * Üç nokta kabuğunun (48) başlık satırından (44) yarım farkı — DİKEYDE. Kutular
 * değil merkezler çakışsın. Yatayda uygulanmıyor: orada hizalanan şey merkez
 * değil, kabuğun kenarı (bkz. PREVIEW_SIDE_INSET).
 */
const MENU_CENTER_FIX = (CARD_MENU_GLASS_SIZE - SUPER_LIKE_GLASS_SIZE) / 2;

// ACTIVITY_SPACING (12) KALDIRILDI: "bugün aktif"in isimden toplam boşluğunu
// (satırın gap'i + işaretin marginLeft'i) yalnız ortalama kaymasını hesaplayan
// formül okuyordu. Satır sola yaslandı, kayma da formül de gitti.

/**
 * "Bugün aktif"in sönmesini TETİKLEYEN scroll eşiği (px).
 *
 * EŞİK, mesafe DEĞİL: işaret scroll'a bağlı sürülmüyor. Eşik geçilince kendi
 * süresiyle (ACTIVITY_FADE_DURATION) tek seferde sönüyor, geri gelince aynı
 * şekilde tek seferde dönüyor — parmağı yavaş oynatınca işaretin yarı yolda
 * asılı kalması ya da kaydırmayla birlikte titremesi böyle bitiyor.
 *
 * 40: kullanıcı kaydırma niyetini belli edecek kadar uzak, işaret ilk bölüm
 * şeridin altına girmeden ÖNCE gidip bitecek kadar yakın.
 *
 * İKİ BAĞLAM DA AYNI eşiği ve aynı süreyi kullanıyor. Keşif'te scroll kartın
 * İÇİNDE, önizlemede kartın DIŞINDA akıyor ama ikisi de aynı şeyi ölçüyor:
 * içeriğin şeridin altından ne kadar geçtiğini. Ayrı eşik, aynı jestte iki
 * farklı anda sönen bir işaret demek olurdu.
 */
const ACTIVITY_FADE_TRIGGER = 40;

/** Sönme/dönme süresi — şeridin başlık devriyle aynı 450ms cubic. */
const ACTIVITY_FADE_DURATION = 450;

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
 * KEŞİF KARTININ YÜZÜ — kabuk + kapak fotoğrafı, tek sayı. Kartın KAPALI
 * köşesi: açılırken çekişle CARD_OPEN_CORNER_RADIUS'a iniyor (bkz. SwipeCard >
 * cardCornerRadius), yani açık kart belirgin şekilde kareleşiyor.
 *
 * DÖRT KÖŞE DE AYNI ve iniş ikisinde de aynı formülden: bir dönem alt köşeler
 * açılma oranıyla 0'A kadar iniyordu (açık kartta panel kapağın DEVAMI
 * sayılıyordu), panel ondan ayrı bir yüzeye dönünce kapağın dibi de gerçek bir
 * kenar oldu — 0'a inen kenar fotoğrafı panelin üstünde köşesiz bir blok gibi
 * gösteriyordu. Şimdiki iniş 44→35, yani kenar her durumda yuvarlak.
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
 * SHEET'TEKİ açık kartın köşe yarıçapı — Beğeniler / Sohbet / Profil
 * önizlemesi, sheet'in en üst detent'i.
 *
 * Açık kart ekranı birebir kaplıyor. Kabuk 50'de kalınca telefonun köşe
 * maskesinden DAHA YUVARLAK oluyor ve dört köşede kartla ekran kenarı arasında
 * sayfa zemininden ince bir hilal görünüyor (açık modda beyaz). Çözüm kabuğu
 * telefonunkine EŞİTLEMEK değil — o sayı cihazdan cihaza değişiyor (39…62pt)
 * ve RN'e açık değil — ondan DAHA KARE yapmak: kart köşeye kadar doluyor,
 * kırpmayı donanım maskesi yapıyor, görünen köşe telefonun kendi köşesi
 * oluyor. 35 çentikli iPhone'ların en küçüğünün (39) de altında.
 *
 * BU SAYI SHEET'İN CLIP'İYLE ZİNCİRLİ (AppBottomSheet `cornerRadius`), o yüzden
 * "biraz daha kare olsun" gibi bir istek buradan karşılanmıyor — Keşif'in kendi
 * varış noktası ayrı sabitte (CARD_OPEN_CORNER_RADIUS).
 *
 * Aynı sayıyı okuyan yerler: kart kabuğu (SwipeCard > cardFrameRadiusStyle),
 * kapak fotoğrafı (photoBorderStyle), kapağın pinch kopyası, bu şeridin kendi
 * kırpması ve kartı taşıyan sheet'in clip'i. Ayrıştıkları an köşede ya hilal
 * kalıyor ya iki farklı eğri üst üste biniyor (bkz. CARD_CORNER_RADIUS'un
 * notu).
 */
export const CARD_EXPANDED_CORNER_RADIUS = 35;

/**
 * KEŞİF'TE açık kartın köşe yarıçapı — kabuk ve kapak fotoğrafı çekişle 44'ten
 * buraya iniyor (bkz. SwipeCard > cardCornerRadius): sıçrayarak değil, jest
 * yarıda bırakılırsa köşe de yarıda kalıyor.
 *
 * Sheet'inkinden (35) DAHA KARE ve ondan AYRI bir sabit, çünkü o sayı sheet'in
 * kendi clip'iyle eşleşmek zorunda — burada ise kartı kırpan bir sheet yok,
 * kart doğrudan ekranın kenarına dayanıyor ve istenen "açıkken belirgin şekilde
 * kareleşsin" idi. Hilal riski de yok: telefonun köşe maskesinden (39…62pt) çok
 * daha kare, kırpmayı donanım yapıyor.
 *
 * Keşif'te bu sayıyı okuyan yerler: kabuk, kapak fotoğrafı, şeridin kendi
 * kırpması ve kapağın pinch kopyası.
 */
export const CARD_OPEN_CORNER_RADIUS = 26;

/**
 * Açık karttaki ÜST CHROME'un (köşe cam butonları + şeridin başlık satırı)
 * köşe diyagonalinden aşağı kayma payı.
 *
 * Kart tepeye dayandığı için chrome, pay olmadan durum çubuğu gliflerinin
 * (~y17-40) üstüne biniyor; tam safe-area payı (insets.top ≈ 59) ise butonları
 * köşeden kopartıp ortada asılı bırakıyor. İkisinin arası: buton köşenin
 * butonu gibi okunmaya devam ediyor, üst kenarı saatin/pilin birkaç px altına
 * iniyor.
 *
 * SABİT, açılma oranıyla ANİME DEĞİL: buton bir kez yerine oturduktan sonra
 * hiçbir jestte kıpırdamamalı (gerekçesi SwipeCard > cornerDrop).
 */
export const CARD_CHROME_TOP_DROP = 14;

type Props = {
  profile: any;
  /**
   * Kartın scroll pozisyonu — İKİ BAĞLAMDA DA tek iş için okunuyor: bir EŞİK
   * olarak. Geçilince "bugün aktif" kendi süresiyle sönüyor, geri gelince aynı
   * şekilde dönüyor (bkz. ACTIVITY_FADE_TRIGGER).
   *
   * Şeridin GÖRÜNÜRLÜĞÜNÜ sürmüyor: onu kartın açıklık oranı belirliyor (bkz.
   * `progress`). Verilmezse işaret hiç sönmez, satır da kıpırdamaz — yani
   * opsiyonel kalması güvenli.
   *
   * Ölçtüğü scroll bağlama göre farklı yerde akıyor (Keşif'te kartın İÇİNDE,
   * sheet'te kartın DIŞINDA) ama eşik için ikisi de aynı şeyi söylüyor:
   * içerik şeridin altından ne kadar geçti.
   */
  scrollY?: SharedValue<number>;
  /**
   * Şeridin ÖNİZLEME dizilişi (Likes / Chat / Profil): sağ köşede süper beğeni
   * butonu değil, varsa "üç nokta" duruyor — başlık satırının SAĞ payı bu
   * yüzden ayrışıyor. Kenar boşluğu ayrışmıyor: iki bağlam da aynı sabitten
   * besleniyor (bkz. PREVIEW_SIDE_INSET).
   *
   * ŞERİDİN GÖRÜNÜRLÜĞÜNÜ ARTIK BELİRLEMİYOR: iki bağlamda da şerit kartın
   * açıklık oranıyla (`progress`) beliriyor — önizlemede o oran zaten sabit 1.
   */
  alwaysOpen?: boolean;
  /**
   * ŞERİDİN GÖRÜNÜRLÜĞÜNÜ SÜREN ORAN. Verilmezse 1 sayılır — sheet'te kart
   * zaten açık doğuyor, şerit de onunla birlikte.
   *
   * Keşif KROM kanalını veriyor (cardChromeAnim, cardExpandAnim DEĞİL): şerit
   * kapaktaki büyük ismin yerini alıyor ve o isim krom kanalından çekiliyor —
   * gerekçe SwipeCard'daki prop'un yanında.
   */
  progress?: SharedValue<number>;
  /** Bandın kendi kırpması — varsayılanı kart kabuğuyla aynı. */
  radius?: number;
  /**
   * Verilirse şeridin SAĞ ucuna cam bir "üç nokta" konur (bkz.
   * CardMenuGlassButton) ve isim iki butonun arasında ortalanır.
   *
   * Yalnız ÖNİZLEME şeritleri veriyor (`alwaysOpen`): sohbetten açılan profil
   * kartı, ekranın başlığındaki menü butonunu şeride taşıyor — kart tam ekranı
   * kapladığı için altındaki başlık artık erişilebilir değil. Keşif'te YOK:
   * orada sağ köşe süper beğeni butonunun.
   *
   * Buton `titleStyle` ile SARILMIYOR: cam yüzey ata zincirinde opacity<1 ya da
   * kimliksel olmayan transform görürse sessizce hiç render edilmiyor.
   * `alwaysOpen` şeritte fade zaten yok — animasyonlu sarmalayıcı sıfır fayda
   * karşılığında o riski alırdı.
   */
  onMenu?: () => void;
  /**
   * Şeridin İÇERİĞİNİ (başlık satırı + cam buton) bu kadar aşağı iter; bandın
   * kendisi kartın tepesinde kalır, yalnız o kadar uzar.
   *
   * Yalnız Keşif veriyor: açık kart ekranın en tepesine biniyor, yani bandın
   * tepesi = ekranın 0'ı. Pay, sağ üstteki süper beğeni butonununkiyle AYNI
   * olmak zorunda (bkz. SwipeCard > EXPANDED_CORNER_DROP) — iki köşe butonu
   * simetrik durmalı. Şeridin başlık satırı da butonla aynı merkezi paylaştığı
   * için onunla birlikte iniyor.
   *
   * Sheet'lerde (`alwaysOpen`) 0: orada kart lift almıyor.
   */
  topInset?: number;
};

export default function CardStickyHeader({
  profile,
  scrollY,
  alwaysOpen = false,
  progress,
  radius = CARD_CORNER_RADIUS,
  onMenu,
  topInset = 0,
}: Props) {
  const { t } = useTranslation();
  // İsmin yanındaki ", 23" eki — SwipeCard'daki başlıkla aynı kural:
  // `showAge` kapalıyken backend null yerine 0 gönderiyor (bkz. cardPrivacy).
  const ageSuffix = useMemo(() => {
    const age = resolveCardAge({
      age: profile?.age,
      showAge: profile?.showAge,
    });
    return age != null ? `, ${age}` : "";
  }, [profile?.age, profile?.showAge]);

  // "Bugün aktif" satırı — HER İKİ bağlamda da şeritte, ismin sağında. Keşif'te
  // de buraya taşındı: kartın panelindeki isim bloğu (satırın eski yeri)
  // kaldırıldı, şerit artık açık kartın tek başlığı.
  //
  // Bayrağın kaynağı SwipeCard'dakiyle aynı alan: `isOnlineToday` (24 saatlik
  // pencere, anlık presence DEĞİL — bkz. ActivityStatus).
  const showActivity = profile?.isOnlineToday === true;

  // "Burada yeni" rozeti burada YOK ve eklenmeyecek: şerit isim + yaş + premium
  // + "bugün aktif" ile sınırlı. Rozet kapalı Keşif kartına ait (bkz. SwipeCard
  // > NewMemberBadge) — swipe kararına giren bir sinyal, kart açıkken ya da
  // karşındaki kişiyi zaten beğenmişken / yazışırken taşıdığı bir bilgi yok.

  // Prop verilmediğinde de worklet'lerin okuyacağı bir değer olsun.
  const noScroll = useSharedValue(0);
  const scroll = scrollY ?? noScroll;

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
   * de yok. Önizlemede `progress` hiç verilmiyor → oran sabit 1, şerit her
   * zaman açık; davranış değişmedi.
   */
  const revealStyle = useAnimatedStyle(() => ({
    opacity: progress ? Math.max(0, Math.min(1, progress.value)) : 1,
  }));

  /**
   * İşaretin görünürlüğü: 1 → 0.
   *
   * Scroll'a BAĞLI SÜRÜLMÜYOR: scroll yalnız eşiği tetikliyor, geçildiği anda
   * değer kendi süresiyle uçtan uca gidiyor (bkz. ACTIVITY_FADE_TRIGGER).
   *
   * İKİ BAĞLAMDA DA: açık kartta bir süre kaydırdıktan sonra satırın sadeleşip
   * yalnız isme düşmesi isteniyor — hangi ekrandan açıldığı fark etmemeli.
   * Keşif'te bir dönem işaret sabit duruyordu (`alwaysOpen` kapısı); kapı
   * kalktı, kanal ortak. Orada scroll kartın İÇİNDE ama şerit yine sabit
   * duruyor, yani sönmenin gerekçesi de birebir aynı.
   *
   * Keşif'te değer kendiliğinden GERİ DÖNÜYOR: kart kapanınca scroll 0'a
   * çekiliyor (bkz. BounceScrollView'ın collapse effect'i), eşik geri
   * geçiliyor ve işaret aynı süreyle dönüyor — bir sonraki açılış temiz
   * başlıyor.
   *
   * Satırın KAYMASI kaldırıldı (activityShift + previewTitleShift): o kayma,
   * ortalanmış satırda işaret giderken ismi tek başına ortalamak içindi. Satır
   * artık sola yaslı, yani işaret gidince isim zaten yerinde kalıyor.
   */
  const activityAnim = useSharedValue(1);
  useAnimatedReaction(
    () => scroll.value > ACTIVITY_FADE_TRIGGER,
    (isPast, prev) => {
      // prev null = ilk çağrı. Karşılaştırmaya SOKULUYOR (atlanmıyor): kart
      // eşiğin üstünde doğabiliyor (ölçüler geç oturunca).
      if (isPast !== prev) {
        activityAnim.value = withTiming(isPast ? 0 : 1, {
          duration: ACTIVITY_FADE_DURATION,
          easing: Easing.out(Easing.cubic),
        });
      }
    },
  );

  const activityReveal = useAnimatedStyle(() => ({
    opacity: activityAnim.value,
  }));

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
    // Şerit dekoratif: altındaki içerik (ve Keşif'te üstündeki cam süper beğeni
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
        height: CARD_HEADER_HEIGHT + topInset,
        // Kendi kırpması var: sheet'te bant kartın DIŞINDA çiziliyor, kartın
        // yuvarlak köşesini oradan devralmazsa üst köşelerde backdrop'un
        // üstüne taşar.
        overflow: "hidden",
        borderTopLeftRadius: radius,
        borderTopRightRadius: radius,
      }}
    >
      <Animated.View
        pointerEvents="none"
        style={[StyleSheet.absoluteFill, revealStyle]}
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
          {/* Derinlik perdesi — koyuda karartır, açıkta AYNI oranlarla
              beyazlatır. Maske siyah/şeffaf kalır: o alfa maskesi, renk değil. */}
          <LinearGradient
            colors={[veil(1), veil(0.2)]}
            style={StyleSheet.absoluteFill}
          />
          <BlurView
            intensity={15}
            tint={chromeBlurTint()}
            style={StyleSheet.absoluteFill}
          />
        </MaskedView>
      </Animated.View>

      {/* Cam "üç nokta" — şeridin sağ ucunda, başlık satırının DIŞINDA. Satır
          animasyonlu (aşağıdaki kayma) ve cam yüzey ata zincirinde kimliksel
          olmayan bir transform görürse sessizce hiç render edilmiyor; buton bu
          yüzden kardeş olarak duruyor, hiçbir animasyonun altında değil. */}
      {alwaysOpen && onMenu && (
        <View
          style={{
            position: "absolute",
            // Kabuk başlık satırından 4pt yüksek: kutular değil MERKEZLER
            // çakışsın.
            top: TITLE_TOP - MENU_CENTER_FIX + topInset,
            // Yatayda merkez değil KENAR hizalanıyor: kabuğun sağ kenarı,
            // Keşif'te sağ köşede duran cam butonun çizgisinde
            // (PREVIEW_SIDE_INSET → SUPER_LIKE_GLASS_INSET).
            right: PREVIEW_SIDE_INSET,
            width: CARD_MENU_GLASS_SIZE,
            height: CARD_MENU_GLASS_SIZE,
          }}
        >
          <CardMenuGlassButton onPress={onMenu} label={t("common.menu")} />
        </View>
      )}

      {/* ── ŞERİDİN BAŞLIK SATIRI — TEK DAL, İKİ BAĞLAM ────────────────────
          İsim + yaş, premium işareti ve "bugün aktif": hepsi tek satırda ve
          satır SOLA YASLI. Bir dönem satır ortalıydı ve önizlemede ortalanan
          şey isim değil "isim + işaret" ikilisiydi; işaret kaydırınca sönerken
          satır tam o kaymayı geri alacak kadar sağa gidiyordu (activityShift).
          Sola yaslanınca o düzeltmenin konusu kalmadı: isim zaten yerinde.

          SOL PAY İKİ BAĞLAMDA DA AYNI: süper beğeni butonunun köşe boşluğu
          (TITLE_LEFT_INSET = PREVIEW_SIDE_INSET). Sağ pay o köşede ne
          durduğuna göre türüyor — Keşif'te süper beğeni butonu
          (TITLE_SIDE_INSET), önizlemede varsa "üç nokta"
          (PREVIEW_TITLE_INSET_WITH_MENU), yoksa soldakinin aynısı. Üç sayı da
          aynı kenar boşluğundan çıkıyor, yani kartın şeridi hangi ekrandan
          açılırsa açılsın aynı çizgide başlıyor.

          Zemin chrome olduğu için renk theme.text; fotoğraf üstündeki isim gibi
          sabit beyaz DEĞİL — açık modda beyaz-üstüne-beyaz kalırdı. */}
      <Animated.View
        pointerEvents="none"
        style={[
          {
            position: "absolute",
            top: TITLE_TOP + topInset,
            left: TITLE_LEFT_INSET,
            right: alwaysOpen
              ? onMenu
                ? PREVIEW_TITLE_INSET_WITH_MENU
                : PREVIEW_TITLE_INSET_PLAIN
              : TITLE_SIDE_INSET,
            height: TITLE_HEIGHT,
            flexDirection: "row",
            alignItems: "center",
            justifyContent: "flex-start",
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
            color: theme.text,
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
        {/* `flexShrink: 0`: uzun isim satırı doldurursa kırpılacak olan isim,
            bu işaret değil — ya tam görünür ya hiç. `marginLeft` satırın
            `gap`ine ek: bu ayrı bir bilgi, ismin devamı değil (ikisinin toplamı
            ACTIVITY_SPACING). */}
        {showActivity && (
          <Animated.View
            style={[{ flexShrink: 0, marginLeft: 6 }, activityReveal]}
          >
            <ActivityStatus label={t("profile.card.activeToday")} />
          </Animated.View>
        )}
      </Animated.View>
    </View>
  );
}
