import { useMemo, useState } from "react";
import { useTranslation } from "react-i18next";
import { StyleSheet, Text, View } from "react-native";
import Animated, {
  runOnJS,
  useAnimatedReaction,
  useAnimatedStyle,
  useSharedValue,
  withTiming,
  interpolate,
  Extrapolation,
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
import CardCollapseGlassButton, {
  CARD_COLLAPSE_GLASS_SIZE,
} from "./CardCollapseGlassButton";
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
// kayan şerit) aynı sayıyı kullanıyor, premium rozeti de ondan türüyor
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

/** İsim eşiğe yaklaşırken camın belirdiği mesafe (px). Eşikte 1'e ulaşır. */
const FADE_RANGE = 40;

/**
 * "Başa dön" butonu ile ismin arasındaki boşluk. Buton ortak cam ikon ölçüsüne
 * (40) inince isim otomatik olarak sola kaydı — 6pt orada yeterliyken artık
 * isim butona yapışık duruyordu. Sol paya eklenen bu değer o farkı kapatıyor.
 */
const TITLE_GAP_AFTER_BUTTON = 14;

/**
 * İKİ CAM BUTONLU şeritte (yani Keşif'te) başlık satırının İKİ yan payı:
 * butonun köşe boşluğu + çapı + nefes. Butonlar iki köşede aynı boşlukta
 * durduğu için pay simetrik → satırın merkezi kartın merkezi oluyor ve isim
 * `justifyContent: "center"` ile TAM ORTADA, iki butonun arasında kalıyor.
 * Uzun isim de butonun altına girmek yerine "…"ya düşüyor (numberOfLines={1}).
 *
 * Sola ve sağa AYRI sabitler (eski TITLE_RIGHT, butondan sonra 12 nefes)
 * KULLANILMIYOR: aradaki 2px fark ortalamada doğrudan kaymaya dönüşüyordu.
 */
const TITLE_SIDE_INSET =
  SUPER_LIKE_GLASS_INSET + SUPER_LIKE_GLASS_SIZE + TITLE_GAP_AFTER_BUTTON;

/**
 * Soldaki "başa dön" kabuğu sağdakinden BÜYÜK olduğu için konumuna uygulanan
 * yarım fark: kutular değil merkezler çakışsın (bkz. CARD_COLLAPSE_GLASS_SIZE).
 * Kabuklar eşitlenirse 0 olur ve düzeltme kendiliğinden devre dışı kalır.
 */
const COLLAPSE_CENTER_FIX =
  (CARD_COLLAPSE_GLASS_SIZE - SUPER_LIKE_GLASS_SIZE) / 2;

/**
 * ÖNİZLEME şeridinin (`alwaysOpen`) iki yan payı — soldaki "bugün aktif" ve
 * sağdaki üç nokta bu çizgide başlar/biter.
 *
 * Ölçü, altındaki bölüm fotoğraflarından geliyor: üç noktanın SAĞ kenarı
 * fotoğrafın sağ kenarına, durum işaretinin SOL kenarı fotoğrafın sol kenarına
 * hizalansın. Fotoğraflar panelin içinde tam genişlik çiziliyor, yani hizayı
 * panelin yatay dolgusu (`px-4`) belirliyor.
 *
 * SwipeCard'dan import EDİLEMİYOR (o bu dosyayı import ediyor, döngü olurdu) ve
 * zaten bir Tailwind sınıfı — okunacak bir sabit yok. Panelin dolgusu
 * değişirse burası da değişmeli.
 */
const PREVIEW_SIDE_INSET = 16;

/**
 * Önizleme şeridinde başlık satırının yan payı.
 *
 * Sağ köşede üç nokta VARSA pay ondan türüyor (kenar boşluğu + çap + nefes):
 * iki yan pay eşit olduğu için satırın merkezi kartın merkezi kalıyor ve uzun
 * isim butonun altına girmek yerine "…"ya düşüyor. Buton yoksa (Profil kendi
 * önizlemesi) pay panelin optik hizası: 28.
 */
const PREVIEW_TITLE_INSET_WITH_MENU =
  PREVIEW_SIDE_INSET + CARD_MENU_GLASS_SIZE + TITLE_GAP_AFTER_BUTTON;
const PREVIEW_TITLE_INSET_PLAIN = 28;

/**
 * Üç nokta kabuğunun (48) başlık satırından (44) yarım farkı — DİKEYDE. Kutular
 * değil merkezler çakışsın; soldaki "başa dön"deki COLLAPSE_CENTER_FIX ile aynı
 * iş, aynı gerekçe. Yatayda uygulanmıyor: orada hizalanan şey merkez değil,
 * kabuğun kenarı (bkz. PREVIEW_SIDE_INSET).
 */
const MENU_CENTER_FIX = (CARD_MENU_GLASS_SIZE - SUPER_LIKE_GLASS_SIZE) / 2;

/**
 * "Bugün aktif"in isimden toplam boşluğu: satırın kendi `gap`i (6) + işaretin
 * kendi `marginLeft`i (6). İsmin ortalanma kaymasını hesaplayan formül bu
 * sayıyı okuyor — ikisi ayrışırsa isim eksik/fazla kayar.
 */
const ACTIVITY_SPACING = 12;

/**
 * "Bugün aktif"in sönmesini TETİKLEYEN scroll eşiği (px).
 *
 * EŞİK, mesafe DEĞİL: işaret scroll'a bağlı sürülmüyor. Eşik geçilince kendi
 * süresiyle (ACTIVITY_FADE_DURATION) tek seferde sönüyor, geri gelince aynı
 * şekilde tek seferde dönüyor — parmağı yavaş oynatınca işaretin yarı yolda
 * asılı kalması ya da kaydırmayla birlikte titremesi böyle bitiyor. Aynı kural
 * şeridin başlığında da var (bkz. titleAnim).
 *
 * 40: kullanıcı kaydırma niyetini belli edecek kadar uzak, işaret ilk bölüm
 * şeridin altına girmeden ÖNCE gidip bitecek kadar yakın.
 */
const ACTIVITY_FADE_TRIGGER = 40;

/** Sönme/dönme süresi — şeridin başlık devriyle aynı 450ms cubic. */
const ACTIVITY_FADE_DURATION = 450;

/**
 * Kart kabuğunun köşe yarıçapı. ÜÇ yer aynı sayıyı kullanmak ZORUNDA: kartın
 * kökü (SwipeCard), bu şeridin kendi kırpması ve kartı taşıyan sheet'in clip'i
 * (AppBottomSheet `cornerRadius`). Ayrıştıkları an köşelerde ya hilal kalıyor
 * ya da iki farklı eğri üst üste biniyor.
 */
export const CARD_CORNER_RADIUS = 50;

/**
 * Kartın AÇIKKEN köşe yarıçapı — Keşif'te tam ekran expand, sheet'lerde
 * (Beğeniler / Sohbet / Profil önizlemesi) sheet'in en üst detent'i.
 *
 * Açık kart ekranı birebir kaplıyor. Kabuk 50'de kalınca telefonun köşe
 * maskesinden DAHA YUVARLAK oluyor ve dört köşede kartla ekran kenarı arasında
 * sayfa zemininden ince bir hilal görünüyor (açık modda beyaz). Çözüm kabuğu
 * telefonunkine EŞİTLEMEK değil — o sayı cihazdan cihaza değişiyor (39…62pt)
 * ve RN'e açık değil — ondan DAHA KARE yapmak: kart köşeye kadar doluyor,
 * kırpmayı donanım maskesi yapıyor, görünen köşe telefonun kendi köşesi
 * oluyor. 35 çentikli iPhone'ların en küçüğünün (39) de altında.
 *
 * Aynı sayıyı okuyan yerler: kart kabuğu (SwipeCard > cardFrameRadiusStyle),
 * kapak fotoğrafı (photoBorderStyle), bu şeridin kendi kırpması ve kartı
 * taşıyan sheet'in clip'i. Ayrıştıkları an köşede ya hilal kalıyor ya iki
 * farklı eğri üst üste biniyor (bkz. CARD_CORNER_RADIUS'un notu).
 */
export const CARD_EXPANDED_CORNER_RADIUS = 35;

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
   * Kartın scroll pozisyonu. İKİ AYRI İŞ yapıyor, hangisi olduğunu `alwaysOpen`
   * belirliyor:
   *   Keşif — şeridi AÇAN sinyal (isim eşiği geçince cam + başlık belirir).
   *   Sheet — şerit zaten açık; sinyal bir EŞİK olarak okunuyor: geçilince
   *           "bugün aktif" kendi süresiyle sönüp isim ortalanıyor (bkz.
   *           ACTIVITY_FADE_TRIGGER). Verilmezse işaret hiç sönmez, satır da
   *           kıpırdamaz — yani opsiyonel kalması güvenli.
   */
  scrollY?: SharedValue<number>;
  /**
   * İsmin şeridin altına indiği eşik — SwipeCard ölçüp yazıyor
   * (bkz. oradaki headerTriggerY). Ölçüler oturmadan MAX_SAFE_INTEGER: şerit
   * hiç açılmaz. `alwaysOpen` ile GEREKSİZ.
   */
  triggerY?: SharedValue<number>;
  /**
   * Şerit scroll beklemeden AÇIK doğar. Önizlemede (Likes / Chat / Profil)
   * böyle: orada kartın kendi büyük ismi hiç çizilmiyor — isim yalnız burada
   * duruyor, yani devredilecek bir başlık yok, şerit kartın sabit başlığı.
   */
  alwaysOpen?: boolean;
  /**
   * Kartın açıklık oranı (Keşif'teki cardExpandAnim). Verilmezse 1 sayılır —
   * sheet'te kart zaten açık doğuyor. Keşif'te şart: collapse ederken scroll
   * birkaç kare eski değerinde kalabiliyor, kapak fotoğrafının üstünde şerit
   * parlamasın.
   */
  progress?: SharedValue<number>;
  /** Bandın kendi kırpması — varsayılanı kart kabuğuyla aynı. */
  radius?: number;
  /**
   * Verilirse şeridin SOL ucuna cam bir "başa dön" butonu konur (bkz.
   * CardCollapseGlassButton) ve isim onun sağına kayar.
   *
   * Yalnız KEŞİF veriyor: kapak fotoğrafının dibindeki ok aşağı kaydırınca akıp
   * gidiyor, buton onun şerideki karşılığı. Önizlemelerde (`alwaysOpen`)
   * kapatılacak bir açıklık yok — sheet zaten aşağı çekilerek kapanıyor —
   * o yüzden orada geçilmiyor ve buton hiç çizilmiyor.
   */
  onCollapse?: () => void;
  /**
   * Verilirse şeridin SAĞ ucuna cam bir "üç nokta" konur (bkz.
   * CardMenuGlassButton) ve isim iki butonun arasında ortalanır.
   *
   * Yalnız ÖNİZLEME şeritleri veriyor (`alwaysOpen`): sohbetten açılan profil
   * kartı, ekranın başlığındaki menü butonunu şeride taşıyor — kart tam ekranı
   * kapladığı için altındaki başlık artık erişilebilir değil. Keşif'te YOK:
   * orada sağ köşe süper beğeni butonunun.
   *
   * Buton `titleStyle` ile SARILMIYOR (soldaki "başa dön"in aksine): cam yüzey
   * ata zincirinde opacity<1 ya da kimliksel olmayan transform görürse sessizce
   * hiç render edilmiyor. `alwaysOpen` şeritte fade zaten yok — animasyonlu
   * sarmalayıcı sıfır fayda karşılığında o riski alırdı.
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
  triggerY,
  alwaysOpen = false,
  progress,
  radius = CARD_CORNER_RADIUS,
  onCollapse,
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

  // "Bugün aktif" satırı — YALNIZ `alwaysOpen` bağlamında, yani önizlemelerde
  // (Likes / Chat / Profil). Orada kartın kendi isim bloğu hiç çizilmiyor, şerit
  // kartın tek başlığı: durum işareti de onunla aynı satırda, ismin sağında
  // duruyor. Keşif'te DEĞİL — orada satır kartın kendi isim bloğunda kalıyor ve
  // şerit yalnız devraldığı ismi taşıyor.
  //
  // Bayrağın kaynağı SwipeCard'dakiyle aynı alan: `isOnlineToday` (24 saatlik
  // pencere, anlık presence DEĞİL — bkz. ActivityStatus).
  const showActivity = alwaysOpen && profile?.isOnlineToday === true;

  /**
   * Satır HER İKİ bağlamda da simetrik payla mutlak konumlu ve kendi içinde
   * ortalı — pay Keşif'te köşe butonlarından (TITLE_SIDE_INSET), önizlemede üç
   * noktadan (PREVIEW_TITLE_INSET_*) türüyor.
   *
   * ORTALANAN ŞEY önizlemede başta isim DEĞİL, isim + "bugün aktif" ikilisi;
   * işaret kaydırınca sönerken satır aynı miktarda sağa kayıp ismi tek başına
   * ortalıyor (bkz. activityShift / previewTitleShift).
   */
  // "Burada yeni" rozeti burada YOK ve eklenmeyecek: önizleme kartlarında
  // (Likes / Chat / Profil) şerit isim + yaş + "bugün aktif" ile sınırlı.
  // Rozet yalnız Keşif kartına ait (bkz. SwipeCard > NewMemberBadge) — orada
  // swipe kararına giren bir sinyal, karşındaki kişiyi zaten beğenmişken /
  // yazışırken taşıdığı bir bilgi yok.

  // `alwaysOpen` dalında bu ikisi hiç okunmuyor; hook sırası bozulmasın diye
  // yine de kuruluyorlar (prop verilmediğinde de worklet'lerin okuyacağı bir
  // değer olsun).
  const noScroll = useSharedValue(0);
  const noTrigger = useSharedValue(Number.MAX_SAFE_INTEGER);
  const scroll = scrollY ?? noScroll;
  const trigger = triggerY ?? noTrigger;

  // Cam zemin — isim eşiğe yaklaşırken açılır.
  const blurStyle = useAnimatedStyle(() => {
    const open = progress ? Math.max(0, Math.min(1, progress.value)) : 1;
    if (alwaysOpen) return { opacity: open };
    const reveal = interpolate(
      scroll.value,
      [trigger.value - FADE_RANGE, trigger.value],
      [0, 1],
      Extrapolation.CLAMP,
    );
    return { opacity: reveal * open };
  });

  // Başlık metni — zeminden AYRI, eşiği geçince tek seferde açılır
  // (ScreenHeader / SearchableListSheet ile aynı 450ms cubic devri).
  const titleAnim = useSharedValue(alwaysOpen ? 1 : 0);
  useAnimatedReaction(
    () => (alwaysOpen ? null : scroll.value > trigger.value),
    (isPast, prev) => {
      if (isPast == null) return;
      // prev null = ilk çağrı. Karşılaştırmaya SOKULUYOR (atlanmıyor): kart
      // eşiğin altındayken doğduysa withTiming(0) zaten no-op, üstündeyken
      // doğduysa (ölçüler geç oturunca oluyor) başlık ilk karede açılır.
      if (isPast !== prev) {
        titleAnim.value = withTiming(isPast ? 1 : 0, {
          duration: 450,
          easing: Easing.out(Easing.cubic),
        });
      }
    },
  );
  /**
   * Cam butonun DOKUNULABİLİR olduğu an — görünürlüğünü izlemek ZORUNDA.
   *
   * Şerit kapalıyken `titleStyle` opacity'yi 0'a çekiyor ama view hit-test
   * almaya devam ediyor: kapağın sol üst köşesinde görünmez bir buton kalırdı
   * ve ona basmak KAPALI kartı açardı (collapse yolu `onExpandPress`'i
   * çağırıyor, o da bir toggle). Opacity UI thread'de sürüldüğü için render
   * tarafından okunamıyor → JS aynası.
   *
   * Eşik `titleStyle`in iki çarpanını da okuyor: eşiği geçmiş OLMAK yetmez,
   * kart da açık olmalı (collapse ederken scroll birkaç kare eski değerinde
   * kalabiliyor — bkz. `progress` prop'unun kendi notu).
   */
  const [interactive, setInteractive] = useState(alwaysOpen);
  useAnimatedReaction(
    () => {
      const open = progress ? Math.max(0, Math.min(1, progress.value)) : 1;
      const past = alwaysOpen ? true : scroll.value > trigger.value;
      return past && open > 0.9;
    },
    (next, prev) => {
      if (prev != null && next === prev) return;
      runOnJS(setInteractive)(next);
    },
  );

  const titleStyle = useAnimatedStyle(() => {
    const open = progress ? Math.max(0, Math.min(1, progress.value)) : 1;
    return {
      opacity: titleAnim.value * open,
      transform: [{ translateY: 12 * (1 - titleAnim.value) }],
    };
  });

  /**
   * "Bugün aktif"in YARIM genişliği (işaret + isimden boşluğu). İsim satırın
   * ortasında değil, işaretle BİRLİKTE ortalanmış duruyor — yani tam bu kadar
   * sola kaymış. İşaret sönerken satır aynı miktarda sağa kayıyor ve isim
   * kendi başına ortalanmış oluyor.
   *
   * ÖLÇÜMDEN geliyor (onLayout): metin dile ve yazı tipi ölçeğine göre
   * değişiyor, sabit yazılamaz. Ölçüm bir kez düşüyor (metin statik) ve
   * shared value'ya yazıldığı için satırı yeniden render ETMİYOR.
   */
  const activityShift = useSharedValue(0);

  /**
   * İşaretin görünürlüğü: 1 → 0. İki animasyonun ORTAK sürücüsü — işaretin
   * opaklığı ve satırın kayması aynı değerden besleniyor, yoksa biri biterken
   * diğeri yolda kalıp isim bir an yamuk duruyor.
   *
   * Scroll'a BAĞLI SÜRÜLMÜYOR: scroll yalnız eşiği tetikliyor, geçildiği anda
   * değer kendi süresiyle uçtan uca gidiyor (bkz. ACTIVITY_FADE_TRIGGER).
   *
   * `alwaysOpen` DIŞINDA hiç okunmuyor: Keşif'te bu satırda işaret çizilmiyor.
   */
  const activityAnim = useSharedValue(1);
  useAnimatedReaction(
    () => (alwaysOpen ? scroll.value > ACTIVITY_FADE_TRIGGER : null),
    (isPast, prev) => {
      if (isPast == null) return;
      // prev null = ilk çağrı; titleAnim'deki ile aynı gerekçeyle
      // karşılaştırmaya sokuluyor (kart eşiğin üstünde doğabiliyor).
      if (isPast !== prev) {
        activityAnim.value = withTiming(isPast ? 0 : 1, {
          duration: ACTIVITY_FADE_DURATION,
          easing: Easing.out(Easing.cubic),
        });
      }
    },
  );

  const activityReveal = useAnimatedStyle(() => {
    if (!alwaysOpen) return { opacity: 1 };
    return { opacity: activityAnim.value };
  });

  const previewTitleShift = useAnimatedStyle(() => {
    if (!alwaysOpen) return { transform: [{ translateX: 0 }] };
    // 1 → işaret görünür, satır olduğu yerde (isim solda).
    // 0 → işaret gitti, satır yarım genişlik kadar sağa kaydı (isim ortada).
    return {
      transform: [
        { translateX: activityShift.value * (1 - activityAnim.value) },
      ],
    };
  });

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
    // dokunmayı yakalamıyor ama İÇİNDEKİ tek gerçek kontrol (cam "başa dön"
    // butonu) yakalayabiliyor. Kalan katmanlar tek tek `none`: aksi halde tam
    // ekran blur katmanı ya da isim satırı, kartın üst şeridindeki jestleri
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
        style={[StyleSheet.absoluteFill, blurStyle]}
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

      {/* Cam "başa dön" — ismin SOLUNDA, sağdaki süper beğeni butonuyla aynı
          köşe boşluğunda ve aynı dikey merkezde (TITLE_TOP/TITLE_HEIGHT ikisi
          de o butondan türüyor). Başlık satırının İÇİNDE değil KARDEŞİ: satır
          tamamen dekoratif kalsın, dokunmayı yalnız bu buton alsın (bkz.
          yukarıdaki pointerEvents notu). Fade'i başlıkla ORTAK (`titleStyle`)
          → tam kapaktaki ok akıp giderken beliriyor. */}
      {onCollapse && (
        <Animated.View
          // Görünmezken dokunmayı altındaki kapak fotoğrafına bırak
          // (bkz. `interactive` notu).
          pointerEvents={interactive ? "auto" : "none"}
          style={[
            {
              position: "absolute",
              // Yarım fark geri alınıyor: bu kabuk sağdaki kardeşinden büyük
              // (bkz. CARD_COLLAPSE_GLASS_SIZE) ve kutuları değil MERKEZLERİ
              // çakışmalı — aynı dikey eksen, köşelerden aynı optik uzaklık.
              // Aynı düzeltme kalp↔cam ikilisinde de var
              // (SUPER_LIKE_GLASS_INSET), gerekçesi orada uzun uzun yazılı.
              top: TITLE_TOP - COLLAPSE_CENTER_FIX + topInset,
              left: SUPER_LIKE_GLASS_INSET - COLLAPSE_CENTER_FIX,
              width: CARD_COLLAPSE_GLASS_SIZE,
              height: CARD_COLLAPSE_GLASS_SIZE,
            },
            titleStyle,
          ]}
        >
          <CardCollapseGlassButton
            onPress={onCollapse}
            label={t("profile.card.backToTop")}
          />
        </Animated.View>
      )}

      {/* Cam "üç nokta" — şeridin sağ ucunda, başlık satırının DIŞINDA. Satır
          animasyonlu (aşağıdaki kayma) ve cam yüzey ata zincirinde kimliksel
          olmayan bir transform görürse sessizce hiç render edilmiyor; buton bu
          yüzden kardeş olarak duruyor, hiçbir animasyonun altında değil. */}
      {alwaysOpen && onMenu && (
        <View
          style={{
            position: "absolute",
            // Kabuk başlık satırından 4pt yüksek: kutular değil MERKEZLER
            // çakışsın (soldaki "başa dön"deki COLLAPSE_CENTER_FIX ile aynı iş).
            top: TITLE_TOP - MENU_CENTER_FIX + topInset,
            // Yatayda merkez değil KENAR hizalanıyor: kabuğun sağ kenarı
            // alttaki bölüm fotoğraflarının sağ kenarında (PREVIEW_SIDE_INSET).
            right: PREVIEW_SIDE_INSET,
            width: CARD_MENU_GLASS_SIZE,
            height: CARD_MENU_GLASS_SIZE,
          }}
        >
          <CardMenuGlassButton onPress={onMenu} label={t("common.menu")} />
        </View>
      )}

      {/* ── ÖNİZLEME ŞERİDİNİN BAŞLIK SATIRI ────────────────────────────────
          İsim + yaş (+ premium ateşi) ve YANINDA "bugün aktif" — hepsi tek
          satırda, satır simetrik payla ortalı. Yani başlangıçta ortalanan şey
          isim değil, isim + işaret İKİLİSİ; isim o kadar solda duruyor.

          KAYDIRINCA: eşik geçilince (ACTIVITY_FADE_TRIGGER) işaret sönüyor ve
          satır tam o kaymayı geri alacak kadar (işaretin yarım genişliği, bkz.
          activityShift) sağa gidiyor — işaret giderken isim kendi başına
          ortalanmış oluyor. İki animasyon TEK değerden besleniyor
          (activityAnim), yoksa biri biterken diğeri yolda kalıp isim bir an
          yamuk duruyor. Değer parmağa değil kendi süresine bağlı: yavaş
          kaydırmada işaret yarı yolda asılı kalmıyor.

          Kayma TRANSFORM ile, layout ile DEĞİL: işaretin kutusu yerinde
          kalıyor (opaklığı 0'a iniyor), yani her karede Yoga'ya dokunulmuyor —
          şerit fotoğrafın üstünde, orada layout fırtınası commit fırtınasına
          dönüşür. */}
      {alwaysOpen ? (
        <Animated.View
          pointerEvents="none"
          style={[
            {
              position: "absolute",
              top: TITLE_TOP + topInset,
              left: onMenu
                ? PREVIEW_TITLE_INSET_WITH_MENU
                : PREVIEW_TITLE_INSET_PLAIN,
              right: onMenu
                ? PREVIEW_TITLE_INSET_WITH_MENU
                : PREVIEW_TITLE_INSET_PLAIN,
              height: TITLE_HEIGHT,
              flexDirection: "row",
              alignItems: "center",
              justifyContent: "center",
              gap: 6,
            },
            previewTitleShift,
          ]}
        >
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
          {/* Kart başlıklarındaki rozetin AYNISI — ölçü isim puntosundan
              türüyor, elle verilmiyor (bkz. PremiumBadge). */}
          {profile?.isPremium && <PremiumBadge fontSize={TITLE_FONT} />}
          {/* `flexShrink: 0`: uzun isim satırı doldurursa kırpılacak olan isim,
              bu işaret değil — ya tam görünür ya hiç. `marginLeft` satırın
              `gap`ine ek: bu ayrı bir bilgi, ismin devamı değil (ikisinin
              toplamı ACTIVITY_SPACING). */}
          {showActivity && (
            <Animated.View
              onLayout={(e) => {
                // Yarım genişlik: satır bu kadar sağa kayınca isim ortalanır.
                activityShift.value =
                  (e.nativeEvent.layout.width + ACTIVITY_SPACING) / 2;
              }}
              style={[{ flexShrink: 0, marginLeft: 6 }, activityReveal]}
            >
              <ActivityStatus label={t("profile.card.activeToday")} />
            </Animated.View>
          )}
        </Animated.View>
      ) : (
        /* Başlık satırı — KEŞİF. Zemin chrome olduğu için renk theme.text;
         fotoğraf üstündeki isim gibi sabit beyaz DEĞİL — açık modda
         beyaz-üstüne-beyaz kalırdı. */
        <Animated.View
          pointerEvents="none"
          style={[
            {
              position: "absolute",
              top: TITLE_TOP + topInset,
              // Simetrik pay + kendi içinde ortalı satır = isim şeridin tam
              // ortasında (bkz. TITLE_SIDE_INSET).
              left: TITLE_SIDE_INSET,
              right: TITLE_SIDE_INSET,
              height: TITLE_HEIGHT,
              flexDirection: "row",
              alignItems: "center",
              justifyContent: "center",
              gap: 6,
            },
            titleStyle,
          ]}
        >
          {/* Punto/satır TITLE_FONT + TITLE_LINE'dan; gerekçesi orada.

            `numberOfLines={1}` bu ölçüde daha geç devreye giriyor ama sınır
            duruyor: uzun isim cam butonların altına girmek yerine "…" ile
            kırpılır (bkz. TITLE_SIDE_INSET). */}
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
          {/* Rozet isimle ORANLI kalmak zorunda — oranı artık elle tutmuyoruz,
            `PremiumBadge` puntodan çıkarıyor. Kapak/panel başlıklarıyla aynı
            kural, tek fark punto. */}
          {profile?.isPremium && <PremiumBadge fontSize={TITLE_FONT} />}
          {/* "Bugün aktif" BURADA YOK: durum işareti yalnız önizleme şeridinde
            çiziliyor ve orada satırın SOL bölmesinde duruyor (yukarıdaki
            dala bak). Keşif'te bilgi kartın kendi isim bloğunda kalıyor. */}
        </Animated.View>
      )}
    </View>
  );
}
