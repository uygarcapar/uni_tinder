import React, { useEffect, useState } from "react";
import { Dimensions } from "react-native";
import { GestureDetector, Gesture } from "react-native-gesture-handler";
import Animated, {
  cancelAnimation,
  scrollTo,
  useAnimatedRef,
  useSharedValue,
  useAnimatedStyle,
  withDecay,
  withSequence,
  withSpring,
  withTiming,
  runOnJS,
  interpolate,
  Extrapolate,
  useDerivedValue,
  useAnimatedReaction,
  Easing,
} from "react-native-reanimated";
import type { SharedValue } from "react-native-reanimated";
import * as Haptics from "expo-haptics";
import SwipeCard from "@/features/discover/components/SwipeCard";
import { runFlameSweep } from "@/features/discover/flameSweep";
import uiBus, {
  cardChromeAnim,
  cardExpandAnim,
  cardPullProgress,
  resetCardExpandState,
} from "@/shared/services/uiBus";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import {
  DISCOVER_CARD_TOP_GAP,
  DISCOVER_HEADER_HEIGHT,
  discoverTabBarInset,
} from "@/features/discover/components/discoverHeaderMetrics";
import { photoPinchActive } from "@/shared/components/pinchZoom";
import { useRenderCount } from "@/shared/debug/useRenderCount";
import type { NoteTarget, PotentialMatch } from "@/shared/types";

const { width, height } = Dimensions.get("window");
const SWIPE_THRESHOLD = 85;

const SUPER_LIKE_PULL_THRESHOLD = 50; // pull down ty.value bu px'e ulaşınca süper beğeni "ready"

/**
 * ── EXPAND ARTIK EŞİKSİZ ────────────────────────────────────────────────────
 *
 * Kart parmağı ORANLI izliyor: `cardExpandAnim = çekilen yol / (HEADER_COVER
 * × EXPAND_DRAG_SCALE)`.
 * Duvar yok, direnç eğrisi yok, "hazır" haptic'i yok — ve tam açıldığı an mod
 * AYNI JESTİN İÇİNDE devrolduğu için parmak yukarı gitmeye devam ederse
 * hareket kesintisiz scroll'a dönüyor. Bırakış yalnız yarım kalanı tamamlıyor
 * (bkz. settleExpand).
 *
 * ÖNCEKİ İKİ MODEL VE NEDEN GİTTİKLERİ:
 *   1. Rubber-band + eşik + haptic (EXPAND_PULL_RANGE 110, ease-out direnç):
 *      çekiş bir "niyet ölçme" hareketiydi, kart eşikte duvara çarpıyordu.
 *      Sorun: eşiğe varmak açılışı BAŞLATMIYOR, sadece izin veriyordu — jest
 *      ile sonuç arasında bir duraklama kalıyordu.
 *   2. Kısmi takip (EXPAND_FOLLOW_RATIO): kart çekişte yolun bir kısmını
 *      gidiyor, kalanı bırakışta yaya kalıyordu. Aynı duraklamanın küçüğü.
 *
 * Bölen HEADER_COVER, çünkü kartın açılırken kat ettiği yol tam olarak o
 * (bkz. animatedStyle) — parmak ne kadar giderse kart o kadar gidiyor.
 *
 * Kartın kendi kabuğunu açıyoruz, sahte bir "panel ucu" göstermiyoruz: bir ara
 * kardeş olarak çizilen düz `surface3` bir yüzey vardı ve bıraktığın an devri
 * gerçek panel alıyordu — gri yüzey blur'lu zemine, boş şerit isme ve cam
 * kutulara dönüşüyordu. Çekişte gelen şeyle bırakışta duran şey aynı olmalı.
 */

/**
 * Parmağın kartı tam açmak için kat etmesi gereken yolun, kartın kat ettiği
 * yola oranı.
 *
 * 1 iken hareket birebirdi ve açılış fazla kolay tetikleniyordu; 2'ye
 * çıkarıldı ve o da fazla geldi: kart parmağın o kadar gerisinde kalıyordu ki
 * hafif bir kaydırmada hiç kıpırdamıyor, "ya kapalı ya açık" gibi
 * davranıyordu. 1.3 ikisinin arası — kısmi açılma görünür kalıyor ama kartı
 * yolun yarısına götürmek yine kasıtlı bir hareket istiyor.
 *
 * Kartın GÖRSEL yolu değişmiyor (o hâlâ HEADER_COVER); değişen yalnız o yolu
 * doldurmak için gereken parmak mesafesi.
 */
const EXPAND_DRAG_SCALE = 1.3;

/**
 * Bırakıştaki pan hızının ne kadarının scroll'a devredileceği.
 *
 * Ham hız aktarıldığında hareket doğal bir scroll gibi değil, fırlatma gibi
 * oluyordu: hızlı bir flick içeriği ortalara kadar götürüyordu. Sebebi, o
 * hızın bir kısmının kartı AÇMAK için harcanmış olması — parmak kartı açacak
 * kadar hızlı gitti, kalanı scroll'un payı.
 *
 * Sönüm katsayısına dokunma; orası iOS'un normali. Momentum uzun/kısa
 * geliyorsa ayarlanacak yer burası.
 */
const MOMENTUM_HANDOFF = 0.4;

/**
 * Aynı ölçeğin KAPANIŞ tarafı — bilerek daha küçük (yani daha duyarlı).
 *
 * Açık kartta scroll tepedeyken aşağı çekmek native bounce'ın yerini alıyor:
 * ScrollView yaylanmıyor, onun yerine kart kapanmaya başlıyor. Açılışın
 * ölçeğiyle (2) sürüldüğünde o hareket neredeyse görünmüyordu — parmak
 * bounce kadar yol alıyor ama kart kıpırdamıyor, "tepede takıldı" hissi
 * veriyordu.
 *
 * 1 olması kapanışı kolaylaştırmıyor: karar hâlâ yolun yarısında
 * (settleExpand). Değişen yalnız o yarıya kadar olan hareketin görünürlüğü —
 * eşiği geçmeden bırakılırsa kart yayla geri açılıyor, yani bounce gibi
 * davranıyor.
 */
const COLLAPSE_DRAG_SCALE = 0.8;

/**
 * ── KAPANIŞTA EK `ty` PAYI YOK ──────────────────────────────────────────────
 *
 * Bir tur burada COLLAPSE_PEEK_MAX (70px) vardı: kart kapanış çekişinde
 * rubber-band ile aşağı kaysın, bounce gibi hissettirsin diye. KALDIRILDI —
 * kartın aşağı inmesini zaten kapanma oranı sağlıyor (cardExpandAnim düşünce
 * lift azalıyor, kart yerine iniyor). İkisi üst üste binince kart parmağın
 * altında fazladan, "zorlanarak" iniyor gibi duruyordu.
 */

/**
 * ── KROM AÇILIŞLA BİREBİR ───────────────────────────────────────────────────
 *
 * `cardChromeAnim` bir dönem açılışın ilk yarısına sıkıştırılmıştı (CHROME_LEAD
 * = 0.5): krom panelden önce çekilsin, gelen panelin üstünde bir süre birlikte
 * durmasınlar diye. Panel de aynı kanala bağlanınca o gerekçe düştü ve üç
 * hareket — kapağın sol altındaki isim/pill bloğunun çekilmesi, panelin
 * ekranın dibinden yukarı süzülmesi, fotoğrafın üst kenarının ekranın tepesine
 * çıkması — farklı hızlarda koşuyordu.
 *
 * Artık üçü de AYNI oranı okuyor, yani aynı anda başlayıp aynı anda bitiyor.
 * Kanal yine ayrı duruyor (SwipeCard krom katmanlarını ondan sürüyor), ama
 * değeri açılış oranının birebir aynısı.
 */


/**
 * Expand/collapse yaylarının ORTAK ayarı — `overshootClamping` şart.
 *
 * Kartın açılışı yalnız hedefe koşmalı, hedefi AŞMAMALI: bu yayın sönüm oranı
 * ~0.41, yani clamp'siz bırakılınca cardExpandAnim 1'i geçiyor (kartın üstü
 * header'ın üstüne fazladan binip geri iniyor) ve kapanışta 0'ın altına
 * sarkıyor. Açılan bir panelde o yaylanma "kart yerine oturmadı" gibi
 * okunuyor; üstelik 0'ın altına sarkması kartın collapsed boyundan KISA bir
 * karede ölçülmesine yol açıp photoHeight'ı kalıcı olarak bozabiliyordu
 * (bkz. SwipeCard > onLayout, "en küçük ölçüm kazanır").
 *
 * Hız aynı kalıyor: clamp yayı yavaşlatmıyor, yalnız tepesini kesiyor. Bu
 * yüzden damping'i yükseltmek yerine bu seçenek kullanılıyor.
 */
const EXPAND_SPRING = {
  damping: 16,
  stiffness: 380,
  mass: 1,
  overshootClamping: true,
};

// Animasyon süreleri
const EXIT_DURATION = 180;
const FADE_IN_DURATION = 100;
const FADE_OUT_DURATION = 350;
const EXIT_DISTANCE = width * 1.2;
/**
 * Süper beğeninin YUKARI uçuşu — yalnız eşleşmeyle bitecek dalda (bkz.
 * runSuperLike). Kartın üst kenarı zaten ekranın tepesine yakın, yani bir ekran
 * boyu onu fazlasıyla dışarı taşıyor; yatay çıkıştaki pay burada da var.
 */
const EXIT_DISTANCE_Y = height * 1.1;

export type SwipeDirection = "left" | "right" | "up";

interface SwipeWrapperProps {
  profile: PotentialMatch;
  /**
   * `covered`: deste bu değişimi ekranı KAPLAYAN bir kutlamanın altında yaptı
   * (yalnız eşleşmeyen süper beğeni) — yeni top kart giriş animasyonunu atlar.
   */
  onSwipe: (
    direction: SwipeDirection,
    userId: string,
    covered?: boolean,
  ) => void;
  isTopCard: boolean;
  // DiscoverScreen'de yaşayan, kartlar arasında PAYLAŞILAN shared value'lar:
  // üst kart yazar, overlay ve alttaki kart okur.
  dragX: SharedValue<number>;
  overlayDragX: SharedValue<number>;
  overlayOpacity: SharedValue<number>;
  buttonDragX: SharedValue<number>;
  /** 0 = yok, 1 = pass, 2 = like, 3 = super like (buton tetiklemesi). */
  programmaticSwipe: SharedValue<number>;
  onPass: () => void;
  onLike: () => void;
  onSuperLike: () => void;
  /**
   * Bu profile gidecek beğeni EŞLEŞMEYLE mi biter? Kutlama kararı buna bağlı
   * (bkz. runSuperLike): eşleşecekse alev süpürmesi oynatılmıyor, kutlama
   * MatchModal'ın oluyor.
   *
   * Prop değil de fonksiyon: cevap "beni beğenenler" kümesinden okunuyor ve o
   * küme her gelen beğenide değişiyor — değer olarak geçilseydi deste her
   * beğenide yeniden render olurdu. Karar ANINDA sorulsun diye çağrılıyor.
   * VERİLMEZSE kutlama her zaman oynar (eski davranış).
   */
  willMatch?: (profile: PotentialMatch) => boolean;
  swipeQuotaExhausted?: boolean;
  superLikeQuotaExhausted?: boolean;
  /**
   * Bu kart, ekranı kaplayan bir kutlamanın ALTINDA top karta yükseldi: giriş
   * animasyonu atlanır, kart doğrudan son hâlinde çizilir (bkz. `scale`).
   */
  snapEntry?: boolean;
  superLikesRemaining: number | null;
  /** Kart altındaki moderasyon ikonları — VERİLMEZSE hiç çizilmez. */
  onReport?: (profile: PotentialMatch) => void;
  onBlock?: (profile: PotentialMatch) => void;
  /** Not kutuları — VERİLMEZSE hiç çizilmez (bkz. SwipeCard.onNote). */
  onNote?: (profile: PotentialMatch, target: NoteTarget) => void;
}

function SwipeWrapper({
  profile,
  onSwipe,
  isTopCard,
  dragX,
  overlayDragX,
  overlayOpacity,
  buttonDragX,
  programmaticSwipe,
  onPass,
  onLike,
  onSuperLike,
  willMatch,
  swipeQuotaExhausted = false,
  superLikeQuotaExhausted = false,
  snapEntry = false,
  superLikesRemaining,
  onReport,
  onBlock,
  onNote,
}: SwipeWrapperProps) {
  useRenderCount("SwipeWrapper");
  const insets = useSafeAreaInsets();
  // Expanded'ken kart EKRANIN EN TEPESİNE çıkıp orada kalsın (kapatılana
  // kadar): header şeridi tamamen örtülür, kartın üst kenarı ekranın 0'ına
  // oturur — durum çubuğu artık kapak fotoğrafının üstünde durur. Okunurluğu
  // fotonun üstündeki koyu blur rampası taşıyor (bkz. SwipeCard'daki "Top Blur
  // Gradient Overlay", 230px).
  //
  // Hesap: kart container'ının tepesi ekranın tepesinden insets.top (durum
  // çubuğu) + header satırı + container paddingTop kadar aşağıda (bkz.
  // DiscoverScreen) — lift o farkın tamamı. Son iki sayı ortak dosyadan
  // okunuyor, burada tekrar yazma (bkz. discoverHeaderMetrics).
  //
  // KARTIN LİFT'İ SABİT, ÜST CHROME'U KÜÇÜK BİR PAY GERİ ALIR: üst şerit
  // (sağ üstte süper beğeni, solda isim satırı) diyagonalin biraz
  // altına iniyor — ne durum çubuğuna girsin ne de köşeden kopsun
  // (bkz. SwipeCard > EXPANDED_CORNER_DROP). Buradaki lift'i o pay için
  // DEĞİŞTİRME: kabuk tepeye kadar gitmeye devam etmeli.
  //
  // TARİHÇE: header satırı + 1 - LOGO_INK_CENTER_Y (≈28.75) idi — kartın üst kenarı
  // logonun görünür dikey merkezinde duruyor, header'ın üst yarısı açıkta
  // kalıyordu. Ondan önce 51 (header tam örtülü, kart safe-area'nın tepesinde),
  // en başta 25 (logonun altında kalıyordu). cardExpandAnim'e bağlı: expand
  // oranıyla yukarı biner, collapse'de (gesture/chevron/cam buton) senkron
  // geri iner.
  const HEADER_COVER =
    insets.top + DISCOVER_HEADER_HEIGHT + DISCOVER_CARD_TOP_GAP;

  /**
   * Kapalı kartın tab bar'a bıraktığı dolgu (bkz. DiscoverScreen).
   *
   * Açılışta kabuk bu dolgunun içine de girip ekranın dibine iniyor; kartın
   * dibi ile ekranın dibi arasındaki o bant panelin belireceği alan.
   */
  const tabBarInset = discoverTabBarInset(insets.bottom);
  const tx = useSharedValue(0);
  const ty = useSharedValue(0);
  const scrollY = useSharedValue(0);
  // Scroll bitip rubber-band'in başladığı andaki translationY baseline'ı.
  // Sürekli gesture'da scroll → rubber-band geçişi yumuşak olsun diye.
  const dragOffsetY = useSharedValue(0);
  const hasVibrated = useSharedValue(false);
  // Pull-down sırasında süper-like kalbinin doluluk oranı (0-1). SwipeCard'a iletilir.
  const superLikeProgress = useSharedValue(0);
  // Threshold geçildiğinde haptic gate (gesture başına 1 kez patlasın).
  const superLikeReady = useSharedValue(false);
  // Expand state — sadece top kart için. Pan threshold geçince true olur, ScrollView
  // SwipeCard içinde scrollEnabled={expanded} ile native scroll'a açılır.
  //
  // expandedSV KANONİK, React `expanded` onun aynası — tersi değil. Eskiden SV
  // bir useEffect ile React state'inden besleniyordu: runOnJS → render → effect
  // zinciri en az bir frame (ağır kartta birkaç frame) sürüyor ve o pencerede
  // başlayan yeni bir pan ESKİ değeri okuyup yanlış moda giriyordu:
  //   expand → hemen pull-down  ⇒ CARD MODE dalı, cardExpandAnim anında 0,
  //   ama React `expanded` true kaldığı için ScrollView açık kalıyor:
  //   görsel collapsed + kart scroll'lanabilir + scrollY>0 olunca dikey pan
  //   tamamen ölüyor = kilitlenmiş bug durumu.
  // Bu yüzden SV artık karar anında, worklet'in İÇİNDE yazılıyor.
  const [expanded, setExpanded] = useState(false);
  const expandedSV = useSharedValue(false);
  const applyExpanded = React.useCallback((next: boolean) => {
    setExpanded(next);
  }, []);
  const commitExpanded = React.useCallback(
    (next: boolean) => {
      "worklet";
      if (expandedSV.value === next) return;
      expandedSV.value = next;
      // Collapse'de scroll gate'ini de temizle: scrollY>0 kalırsa card mode'daki
      // pull-up expand kalıcı olarak early-return'e düşüyor (BounceScrollView de
      // native offset'i 0'a çeker, iki taraf tutarlı olsun).
      if (!next) scrollY.value = 0;
      runOnJS(applyExpanded)(next);
    },
    [applyExpanded, expandedSV, scrollY],
  );

  /**
   * YAYLA kapanış — React aynası animasyonun SONUNA bırakılıyor.
   *
   * Kapanış açılıştan farklı takılıyordu ve sebebi buydu: `commitExpanded`
   * `setExpanded(false)`i ANINDA çağırıyor, yani yayın ilk karesinde SwipeCard
   * (ağır bir ağaç) baştan render ediliyor, BounceScrollView'ın collapse
   * effect'i koşuyor, ScrollView kapanıyor. Aynı karede üç layout animasyonu
   * da sürüyor (kartın `bottom`u, panelin `marginTop`u, zeminin kırpma kutusu)
   * — JS thread'deki o iş, yayın ilk karelerini yiyordu.
   *
   * Açılışta bu yaşanmıyor, çünkü orada React güncellemesi (kart tam açıldığı
   * an) ile yay (bırakış) AYNI KAREYE düşmüyor.
   *
   * Shared value hemen yazılıyor, yalnız aynası bekliyor: jest bir sonraki
   * karede card mode'a girebilmeli. Bu ikisinin ayrışması KISA bir pencerede
   * güvenli — o pencerede ScrollView açık kalıyor ama scrollY zaten 0 (kapanış
   * hep tepeden başlıyor), yani pan'in `scrollY > 0` kapısı kilitlenmiyor.
   *
   * Callback'teki `!expandedSV.value` kontrolü şart: yay biterken kullanıcı
   * kartı yeniden açmış olabilir, o zaman ayna güncellenmemeli.
   */
  const collapseWithSpring = React.useCallback(
    () => {
      "worklet";
      expandedSV.value = false;
      scrollY.value = 0;
      ty.value = withSpring(0, EXPAND_SPRING);
      cardChromeAnim.value = withSpring(0, EXPAND_SPRING);
      cardExpandAnim.value = withSpring(0, EXPAND_SPRING, (finished) => {
        if (finished && !expandedSV.value) runOnJS(applyExpanded)(false);
      });
    },
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [applyExpanded, expandedSV, scrollY],
  );
  // Native scroll gesture — pan ile simultaneous çalışsın diye SwipeCard içindeki
  // ScrollView'a uygulanır. Aynı obje referansı pan ve ScrollView arasında paylaşılır.
  const nativeScrollGesture = React.useMemo(() => Gesture.Native(), []);

  /**
   * Kartın scroll'una yazma kapısı ve "scroll'u BU JEST sürüyor" bayrağı.
   *
   * Kart tam açıldığında ScrollView etkinleşiyor ama iOS devam eden bir
   * dokunuşu UIScrollView'a DEVRETMİYOR: `scrollEnabled` açılmadan önce
   * başlamış bir parmak hareketi scroll'u sürmüyor, kullanıcının parmağını
   * kaldırıp yeniden sürmesi gerekiyordu. Açılışın hemen ardından hareket
   * ölüyordu.
   *
   * Çözüm, taşan mesafeyi scroll'a ELLE yazmak. Bayrak şart, çünkü scroll
   * pozisyonu 0'ı geçtiği anda expanded dalının "scroll'u native handle ediyor"
   * erken dönüşü devreye girip bizim sürüşümüzü ilk karede kesiyordu.
   */
  const scrollRef = useAnimatedRef<Animated.ScrollView>();
  const drivingScroll = useSharedValue(false);

  /**
   * Aynı jestte açılıştan KAPANIŞA geçildi.
   *
   * Parmak kaldırılmadan kart açılıp hemen geri kapatılmaya çalışıldığında kart
   * tepede takılıyordu: açılışın sonunda scroll'u biz sürüyoruz (drivingScroll)
   * ve parmak aşağı dönünce onu 0'a geri sarıyoruz, ama `scrollY` native
   * event'ten geldiği için bir-iki kare geriden geliyor. O karelerde expanded
   * dalının "scroll sürüyor" kapısı devreye girip `dragOffsetY`yi her frame
   * yeniliyor, yani kapanış için gereken delta hiç birikmiyordu — kullanıcının
   * parmağını kaldırıp yeniden sürmesi gerekiyordu.
   *
   * Bayrak o kapıyı bu jest için kapatıyor: scroll'u zaten biz tepeye
   * getirdik, native değerin yetişmesini beklemeye gerek yok.
   */
  const collapseTakeover = useSharedValue(false);

  /**
   * Bu jest kartı KAPATMAKLA bitti — süper beğeniye geçmesin.
   *
   * Kapanış aşağı doğru bir çekiş, süper beğeni de öyle: parmak kaldırılmadan
   * devam edildiğinde kart kapanır kapanmaz süper beğeni jesti devralıyor ve
   * kullanıcı istemeden o animasyona giriyordu. İki hareket aynı yönde olduğu
   * için ayıracak tek doğal sınır parmağın kalkması.
   *
   * Yalnız bu yönde geçerli: açılış tamamlandığında scroll'a devretmek
   * isteniyor (bkz. drivingScroll), orada kilit yok.
   */
  const superLikeLocked = useSharedValue(false);

  /**
   * Sürdüğümüz scroll konumu ve içeriğin alt sınırı.
   *
   * Konum ayrı bir shared value, çünkü bırakışta MOMENTUM gerekiyor: parmak
   * kalkınca `withDecay` bu değeri sürmeye devam ediyor ve aşağıdaki reaction
   * her karede scroll'a yazıyor. Doğrudan `scrollTo` çağırsaydık hareket
   * parmakla birlikte bıçak gibi kesilirdi — native scroll'un yaptığı
   * savrulma olmazdı.
   *
   * Sınır (scrollMax) kartın kendi scroll event'inden geliyor: `withDecay`
   * clamp'siz bırakılsa içerik biterken durmaz, ScrollView'ı bounce alanının
   * ötesine iterdi.
   */
  const driveOffset = useSharedValue(0);
  const scrollMax = useSharedValue(0);

  /**
   * Scroll momentumla tepeye çarptı — kart kapanıyor.
   *
   * Açık kartta aşağı doğru hızlı bir flick, içeriği tepeye getirip orada
   * ölüyordu; hareketin devamı yoktu. Artık aynı savrulma kartı kapalı hâline
   * götürüyor: scroll biter, kapanış onun momentumunu devralır.
   *
   * Eskiden bu ana bağlı olan şey kapak fotoğrafına verilen bir ZOOM darbesiydi
   * (bkz. SwipeCard > BounceScrollView'daki top-hit ölçümü). Ölçüm aynı yerde
   * duruyor, yalnız sonucu değişti.
   *
   * Eşik var, çünkü tepeye YAVAŞ oturan her scroll kartı kapatmamalı — parmakla
   * sürüklenip tepede bırakılan içerik açık kalmaya devam etmeli.
   */
  const topHitSpeed = useSharedValue(0);
  // px/frame. 6 → 16 → 30 → 55: scroll ederken tepeye çarpmak kartı
  // kapatmamalı; o çarpma çoğu zaman "içeriğin başına döndüm" demek, "kartı
  // kapat" değil. 55 sıradan bir geri sarmanın çok üstünde, yani momentumla
  // kapanmak neredeyse yalnız kasıtlı bir fırlatmaya kalıyor.
  //
  // Altındaki hızlar boşa düşmüyor: yaylanmayla karşılanıyorlar (aşağıda) ve
  // dip miktarı bu sayıya ORANLI olduğu için eşik yükseldikçe aynı hızdaki
  // yaylanma da küçülüyor — kart genel olarak sertleşiyor.
  const TOP_HIT_COLLAPSE_SPEED = 55;
  // Eşiğin altında kalan çarpmalarda kartın geri saracağı EN FAZLA açılma
  // oranı. Hızla orantılı: yavaş oturan scroll neredeyse hiç, eşiğe yakın olan
  // belirgin bir yaylanma yapıyor.
  const TOP_HIT_DIP_RATIO = 0.22;

  useAnimatedReaction(
    () => topHitSpeed.value,
    (speed) => {
      if (!isTopCard || speed <= 0) return;
      topHitSpeed.value = 0;
      if (!expandedSV.value) return;
      if (speed < TOP_HIT_COLLAPSE_SPEED) {
        // Eşiğin ALTINDA: kart kapanmıyor ama hareket de duvara çarpmış gibi
        // bitmesin — çarpma hızıyla orantılı bir "az kapandı, geri açıldı"
        // yaylanması. Scroll tepeye yumuşak oturduğunda hiçbir şey olmuyordu,
        // hızlı geldiğinde ise doğrudan kapanıyordu; aradaki bant boştu.
        //
        // AÇILMA ORANININ KENDİSİ geri sarılıyor, yalnız kartın konumu değil:
        // bir tur `ty` ile yapılmıştı ve kart aşağı zıplıyor ama kapanışın geri
        // kalanı olmuyordu — isim/pill bloğu gelmiyor, süper beğeni cam
        // butondan serbest kalbe dönmüyor, kapaktaki rampalar belirmiyordu.
        // Yaylanma "az kapandı" gibi okunacaksa kapanışın bütün katmanları o
        // kadar geri gitmeli.
        const dip = (TOP_HIT_DIP_RATIO * speed) / TOP_HIT_COLLAPSE_SPEED;
        const dipCfg = {
          duration: 90,
          easing: Easing.out(Easing.quad),
        };
        cardExpandAnim.value = withSequence(
          withTiming(1 - dip, dipCfg),
          withSpring(1, EXPAND_SPRING),
        );
        cardChromeAnim.value = withSequence(
          withTiming(1 - dip, dipCfg),
          withSpring(1, EXPAND_SPRING),
        );
        return;
      }
      collapseWithSpring();
    },
    [isTopCard],
  );

  useAnimatedReaction(
    () => driveOffset.value,
    (v) => {
      // Yalnız biz sürerken: bayrak inince (yeni jest başladı, ya da momentum
      // bitti) scroll'un sahibi yine native taraf.
      if (!drivingScroll.value) return;
      scrollTo(scrollRef, 0, v, false);
    },
  );

  const triggerHaptic = () => {
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
  };

  const triggerSuperLikeHaptic = () => {
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Heavy);
  };

  // Pull-down sırasında threshold'a kadar artan sıklıkta haptic. Kendini
  // yeniden zamanlayan JS loop'u; interval progress arttıkça kısalır → titreşim
  // hızlanır. progress ref'ten okunur (worklet her frame runOnJS ile günceller).
  const superProgressRef = React.useRef(0);
  const superHapticTimer = React.useRef<ReturnType<typeof setTimeout> | null>(
    null,
  );
  const runSuperLikeHapticTick = () => {
    const p = superProgressRef.current;
    // Yalnızca pull sürerken (0<p<1) çalışır; threshold'da Heavy haptic devralır.
    if (p <= 0.05 || p >= 1) {
      superHapticTimer.current = null;
      return;
    }
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
    const interval = 260 - p * 190; // ~260ms → ~70ms
    superHapticTimer.current = setTimeout(runSuperLikeHapticTick, interval);
  };
  const updateSuperHaptics = (p: number) => {
    superProgressRef.current = p;
    if (p > 0.05 && p < 1 && superHapticTimer.current == null) {
      runSuperLikeHapticTick();
    }
  };
  const resetSuperHaptics = () => {
    superProgressRef.current = 0;
    if (superHapticTimer.current != null) {
      clearTimeout(superHapticTimer.current);
      superHapticTimer.current = null;
    }
  };
  useEffect(() => resetSuperHaptics, []);

  // Expand/collapse'in haptic'i YOK: eşik kalkınca haber verilecek bir an da
  // kalmadı (bkz. yukarıdaki "EXPAND ARTIK EŞİKSİZ"). Süper beğeninin haptic'i
  // duruyor — o hâlâ eşikli bir karar.

  const openPaywall = () => {
    uiBus.emit("swipePaywall", {});
  };

  const openSuperLikePaywall = () => {
    uiBus.emit("superLikePaywall", {});
  };

  // Çıkış ayarları — yana kaydırma ve (eşleşmeli) süper beğeni uçuşu ortak
  // kullanıyor, o yüzden ikisinden de ÖNCE duruyorlar.
  const exitConfig = {
    duration: EXIT_DURATION,
    easing: Easing.out(Easing.cubic),
  };
  // Yumuşak fade out ayarı
  const fadeOutConfig = {
    duration: FADE_OUT_DURATION,
    easing: Easing.out(Easing.quad),
  };

  /**
   * Kart yana uçarken açık hâlini swipe ile ORANTILI geri sar.
   *
   * Panel ve kapak kromu tek elden: ikisi ayrı düğme (bkz. cardChromeAnim) ama
   * bir çıkışta ikisinin de aynı süreyle kapanması gerekiyor. Dört çıkış yolu
   * var (buton × 2, jest × 2) ve dördü de buradan geçiyor — biri unutulursa
   * kart sönük isimle uçar, sonrakinin krom devri yarım doğardı.
   */
  /**
   * Parmak kalktı — kart nerede kaldıysa en yakın uca yerleştir.
   *
   * Çekişin KENDİSİNDE eşik yok: kart parmağı sürekli izliyor, duvara çarpmıyor,
   * haptic patlamıyor. Karar yalnız BIRAKIŞTA veriliyor ve o da bir eşikten
   * çok bir "yarım kalanı tamamla" hareketi: yarıdan fazla açıksa açılır.
   *
   * Hız da sayılıyor: yukarı fırlatıp bırakınca kart daha yolun başındayken de
   * açılıyor, aşağı fırlatınca yolun sonundayken de kapanıyor. Eşik tek başına
   * kalsaydı hızlı jestler "az çektin" diye geri düşerdi.
   */
  // Momentumla karar eşiği (px/sn). 600 → 1500: o değerde sıradan bir
  // kaydırma bile "flick" sayılıyor, kart farkında olmadan açılıp
  // kapanıyordu. Bir tur 320'ye de indirilmişti (açılış kolaylaşsın diye) ve
  // geri alındı — asıl eksik eşik değil momentumun devamıydı (bkz.
  // settleExpand).
  //
  // Eşik yükseldikçe karar konuma kayıyor: yavaş sürüklenen kart yine yolun
  // yarısını geçtiyse açılıyor, yani hareket ölmüyor, yalnız kazara
  // tetiklenmiyor.
  const SETTLE_VELOCITY = 1500;
  const settleExpand = (velocityY: number) => {
    "worklet";
    const open =
      velocityY < -SETTLE_VELOCITY
        ? true
        : velocityY > SETTLE_VELOCITY
          ? false
          : cardExpandAnim.value >= 0.5;
    if (!open) {
      // Kapanışta React aynası yayın sonuna bırakılıyor (bkz.
      // collapseWithSpring) — açılışta böyle bir sorun yok, orada ayna zaten
      // jest sırasında, yaydan ÖNCE güncellenmiş oluyor.
      collapseWithSpring();
      return;
    }
    ty.value = withSpring(0, EXPAND_SPRING);
    cardExpandAnim.value = withSpring(1, EXPAND_SPRING);
    cardChromeAnim.value = withSpring(1, EXPAND_SPRING);
    commitExpanded(true);

    // Bırakıştaki momentum scroll'a devrediliyor: yukarı fırlatıp bırakınca
    // kart açılıyor ve hareket orada ölmüyor.
    //
    // Yalnız HIZLA açıldıysa — konumla açılan (yavaş sürüklenip bırakılan) bir
    // kartta devam edecek momentum yok.
    if (velocityY >= -SETTLE_VELOCITY) return;
    drivingScroll.value = true;
    driveOffset.value = 0;
    driveOffset.value = withDecay(
      {
        // HAM PAN HIZI DEĞİL: o hızın bir kısmı kartı AÇMAK için harcandı,
        // tamamı scroll'a geçince hareket "fırlatma" gibi oluyordu — hızlı bir
        // flick içeriği ortalara kadar götürüp orada duruyordu. Kalan pay
        // devrediliyor.
        velocity: -velocityY * MOMENTUM_HANDOFF,
        // Sınır henüz ölçülmemiş olabilir (kart yeni açılıyor, scroll event'i
        // gelmedi): o zaman bir ekran boyuna izin ver, ScrollView fazlasını
        // zaten göstermez.
        clamp: [0, Math.max(scrollMax.value, height)],
        // iOS'un normal scroll sönümü — "yavaşlaması doğal değil"in çaresi
        // burayı sertleştirmek değil, yukarıdaki hızı doğru vermek.
        deceleration: 0.998,
      },
      () => {
        drivingScroll.value = false;
      },
    );
  };

  const unwindForExit = () => {
    "worklet";
    if (cardExpandAnim.value > 0)
      cardExpandAnim.value = withTiming(0, exitConfig);
    if (cardChromeAnim.value > 0)
      cardChromeAnim.value = withTiming(0, exitConfig);
  };

  /**
   * Süper beğeni onaylandı.
   *
   * Kart FIRLAMIYOR: yerinde kalıyor, kutlama ekranı alttan yukarı süpürüyor ve
   * deste dalga ekranı tam kapattığında ilerliyor (sözleşme: flameSweep). Not
   * gönderimi de aynı yolu kullanıyor.
   *
   * AÇIK KART DA "yerinde" sayılıyor: panel kapanmadan alev onun üstünden
   * geçiyor, kapanış örtünün altında (bkz. collapseUnderCover). Kullanıcının
   * gördüğü tek hareket kutlama — tıpkı not gönderiminde olduğu gibi.
   *
   * Eskiden kart 320 ms'de yukarı fırlar, swipe da orada işlenirdi: alev daha
   * ekranın alt yarısındayken kart çoktan gitmiş, yenisi açıkta belirmiş olurdu.
   *
   * ⚠️ EŞLEŞMEYLE BİTECEKSE SÜPÜRME YOK (bkz. flameSweep'teki kural): MatchModal
   * saniyesinde aynı ateşin perde hâliyle açılıyor, ikisi arka arkaya oynayınca
   * tek bir süper beğeniye iki alev düşüyordu. O dalda kart, eski davranışın
   * kendisiyle yukarı fırlıyor ve deste ÖRTÜSÜZ ilerliyor — ortada saklanacak
   * bir değişim yok, kartın gidişi hareketin kendisi.
   */
  const flameCoverUnsub = React.useRef<(() => void) | null>(null);

  /**
   * Açık kartı ANINDA yerine oturt — yay yok, timing yok.
   *
   * Alevin ekranı tam kapattığı karede çağrılıyor: panelin kapanışı da destenin
   * ilerlemesi de aynı örtünün altında oluyor, kullanıcı ikisini de görmüyor.
   * Animasyonla kapatılsaydı dalga çekilirken kart hâlâ kapanıyor olurdu.
   *
   * Modül seviyesindeki expand değerlerini (bkz. resetCardExpandState) deste
   * ilerlemeden ÖNCE sıfırlamak şart — `dropProfileFromDeck`taki sıranın aynısı:
   * yeni top kart donmuş bir expand oranıyla doğarsa ilk karesinde header'ın
   * üstüne binmiş, tab bar'a taşmış hâlde görünür.
   */
  const collapseUnderCover = () => {
    resetCardExpandState();
    expandedSV.value = false;
    scrollY.value = 0;
    setExpanded(false);
  };

  const runSuperLike = () => {
    if (flameCoverUnsub.current) return;
    if (willMatch?.(profile)) {
      // Bu dalda örtü yok: kart AÇIKTA uçuyor, o yüzden açık panel uçuşla
      // birlikte kapanmalı (commitSuperLike artık kapatmıyor). Süre uçuşun
      // kendisiyle aynı ölçekte — kart ekranı terk ederken tam boy kalmasın.
      expandedSV.value = false;
      scrollY.value = 0;
      setExpanded(false);
      if (cardExpandAnim.value > 0)
        cardExpandAnim.value = withTiming(0, { duration: 300 });
      if (cardChromeAnim.value > 0)
        cardChromeAnim.value = withTiming(0, { duration: 300 });
      // Swipe uçuşun SONUNDA işleniyor (yana kaydırmadaki kalıbın aynısı):
      // önce çağrılsaydı kart aynı karede unmount olur, uçuş hiç görünmezdi.
      ty.value = withTiming(-EXIT_DISTANCE_Y, exitConfig, (finished) => {
        if (finished) runOnJS(onSwipe)("up", profile.userId, false);
      });
      return;
    }
    flameCoverUnsub.current = runFlameSweep(() => {
      flameCoverUnsub.current = null;
      collapseUnderCover();
      onSwipe("up", profile.userId, true);
    });
  };
  // Kart örtme anından ÖNCE ağaçtan düşerse (deste tazelendi, sekme değişti,
  // tema remount'u) dinleyici arkada kalmasın.
  useEffect(
    () => () => {
      flameCoverUnsub.current?.();
      flameCoverUnsub.current = null;
    },
    [],
  );

  // Süper beğeni işlendi ve örtme bekleniyor. Kart hâlâ ekranda ve dokunulabilir
  // duruyor; bu bayrak o pencerede İKİNCİ bir karar alınmasını engelliyor
  // (jestler ve buton tetiklemeleri) — aksi halde aynı profile art arda iki
  // swipe gidebilirdi.
  const superLikePending = useSharedValue(false);

  // Worklet'ten okumak için mirror — runOnJS'siz quota check.
  const quotaExhaustedSV = useSharedValue(swipeQuotaExhausted);
  useEffect(() => {
    quotaExhaustedSV.value = swipeQuotaExhausted;
  }, [swipeQuotaExhausted, quotaExhaustedSV]);
  const superLikeExhaustedSV = useSharedValue(superLikeQuotaExhausted);
  useEffect(() => {
    superLikeExhaustedSV.value = superLikeQuotaExhausted;
  }, [superLikeQuotaExhausted, superLikeExhaustedSV]);

  useEffect(() => {
    if (isTopCard) {
      dragX.value = 0;
      overlayDragX.value = 0;
      overlayOpacity.value = 1;
      buttonDragX.value = 0;
      hasVibrated.value = false;
      // Canlı kart artık bu: bekleyen bir süper beğeni kilidi devralınmasın.
      superLikePending.value = false;
      return;
    }
    // Kart tepeden düştü. Deste yalnız ileri gitmiyor: rewind currentIndex'i
    // geri alıp o anki top kartı ALT kart yapıyor. Expand state'i üstünde
    // kalırsa tekrar top olduğunda cardExpandAnim (global) 0'a resetlenmiş
    // olur ama `expanded` true kalır → görsel collapsed, ScrollView açık,
    // dikey pan EXPANDED MODE'a girer = aynı desync.
    expandedSV.value = false;
    scrollY.value = 0;
    setExpanded(false);
  }, [
    isTopCard,
    dragX,
    overlayDragX,
    overlayOpacity,
    buttonDragX,
    expandedSV,
    scrollY,
    superLikePending,
  ]);

  /**
   * Süper beğeninin GÖRSEL tarafı — jest ve buton yolları aynı yere düşsün.
   *
   * Kart yerine oturuyor: pull-down geri sarılıyor, dolan kalp sönüyor. Sonrası
   * alevde: değişimi runSuperLike bekletiyor.
   *
   * ⚠️ AÇIK KART BURADA KAPANMIYOR (2026-09-04). Kutlama, kullanıcı cam butona
   * bastığı anda BULUNDUĞU yerden başlıyor: panel açık kalıyor, alev onun
   * üstünden süpürüyor ve kapanış örtünün altına — destenin ilerlemesiyle aynı
   * kareye — bırakılıyor (bkz. collapseUnderCover). Önceden burada 300 ms'lik
   * bir timing vardı ve sıra tersti: kart önce kapanıyor, kutlama ancak ondan
   * sonra görünüyordu; tek bir tap iki ayrı harekete bölünüyordu.
   *
   * Yarı açık kart (card mode'da yukarı çekilmiş ama açılmamış) yine geri
   * sarılıyor: orada saklanacak bir panel yok, kalan oran alevin altında
   * donmasın.
   */
  const commitSuperLike = () => {
    "worklet";
    if (superLikePending.value) return;
    superLikePending.value = true;
    const cfg = { damping: 16, stiffness: 380, mass: 1 };
    ty.value = withSpring(0, cfg);
    superLikeProgress.value = withSpring(0);
    cardPullProgress.value = withSpring(0);
    if (!expandedSV.value) {
      if (cardExpandAnim.value > 0)
        cardExpandAnim.value = withTiming(0, { duration: 300 });
      if (cardChromeAnim.value > 0)
        cardChromeAnim.value = withTiming(0, { duration: 300 });
    }
    runOnJS(runSuperLike)();
  };

  useAnimatedReaction(
    () => programmaticSwipe?.value,
    (value, previous) => {
      if (!isTopCard || value === 0 || value === previous) return;
      // Süper beğeni örtme bekliyor: buton tetiklemeleri yutulsun. Bayrağı
      // SIFIRLAMAK şart — non-zero kalırsa bir sonraki kart mount olduğunda
      // reaction'ın ilk çalışmasında (previous === undefined) tetiklenir ve
      // yeni kart kendiliğinden kayar.
      if (superLikePending.value) {
        programmaticSwipe.value = 0;
        return;
      }

      if (value === 1) {
        dragX.value = withTiming(-150, { duration: FADE_IN_DURATION });
        overlayDragX.value = withTiming(-150, { duration: FADE_IN_DURATION });
        buttonDragX.value = withTiming(-150, { duration: FADE_IN_DURATION });
        overlayOpacity.value = withTiming(1, { duration: 50 });

        unwindForExit();
        tx.value = withTiming(-EXIT_DISTANCE, exitConfig, () => {
          runOnJS(onSwipe)("left", profile.userId);
        });

        overlayOpacity.value = withTiming(0, fadeOutConfig);
        buttonDragX.value = withTiming(0, fadeOutConfig);
        programmaticSwipe.value = 0;
      } else if (value === 2) {
        dragX.value = withTiming(150, { duration: FADE_IN_DURATION });
        overlayDragX.value = withTiming(150, { duration: FADE_IN_DURATION });
        buttonDragX.value = withTiming(150, { duration: FADE_IN_DURATION });
        overlayOpacity.value = withTiming(1, { duration: 50 });

        unwindForExit();
        tx.value = withTiming(EXIT_DISTANCE, exitConfig, () => {
          runOnJS(onSwipe)("right", profile.userId);
        });

        overlayOpacity.value = withTiming(0, fadeOutConfig);
        buttonDragX.value = withTiming(0, fadeOutConfig);
        programmaticSwipe.value = 0;
      } else if (value === 3) {
        // Süper beğeni — kart yerinde kalır, değişimi alev örter.
        commitSuperLike();
        programmaticSwipe.value = 0;
      }
    },
    [isTopCard],
  );

  const scale = useDerivedValue(() => {
    if (isTopCard) {
      // Deste alevin ALTINDA ilerlediyse (süper beğeni) büyüme animasyonu YOK.
      // Değişimin kendisi örtülüyor ama 0.92→1 yayı ~yarım saniye sürüyor:
      // dalga çekildikten sonra da devam ettiği için kart "o an geliyormuş"
      // gibi görünüyordu. Örtülü değişimde kart son hâlinde doğuyor.
      //
      // snapEntry bir prop, yani worklet'in kapanışına RENDER anında giriyor —
      // UI thread'de bu satırın ne zaman değerlendirildiği kararı değiştirmez
      // (paylaşılan bir bayrak okusaydı, swap'taki JS takılması kararı
      // kaçırabilirdi).
      if (snapEntry) return 1;
      return withSpring(1, { damping: 20, stiffness: 100 });
    }

    // Bottom kart scale'i: yatay swipe oranı VE pull-down (super-like) oranı
    // hangisi büyükse onu kullan → her iki gesture'da da arkadaki kart önden büyür.
    const horizontal = Math.abs(dragX.value) / SWIPE_THRESHOLD;
    const vertical = cardPullProgress.value;
    const combined = Math.min(1, Math.max(horizontal, vertical));
    return interpolate(combined, [0, 1], [0.92, 1], Extrapolate.CLAMP);
  });

  /**
   * Foto büyütme (pinch) başlayınca kartın sürüklemesini iptal et.
   *
   * İki parmak birbirinden uzaklaşırken parmakların ORTAK hareketi pan için tek
   * parmaklı bir sürüklemeden ayırt edilemiyor: kart yana kayıyor, hatta
   * beğeni/geçme eşiğini geçiyordu. Jest ilişkisi (blocksExternalGesture)
   * yerine bayrak: "önce pinch'in başarısız olmasını bekle" ilişkisi TEK
   * parmaklı swipe'ı da geciktirir, o da uygulamanın ana hareketi.
   */
  const cancelDragForPinch = () => {
    "worklet";
    const cfg = { damping: 16, stiffness: 380, mass: 1 };
    tx.value = withSpring(0, cfg);
    dragX.value = withSpring(0, cfg);
    overlayDragX.value = withSpring(0, cfg);
    buttonDragX.value = withSpring(0, cfg);
    overlayOpacity.value = 1;
    hasVibrated.value = false;
    ty.value = withSpring(0, cfg);
    superLikeProgress.value = withSpring(0);
    cardPullProgress.value = withSpring(0);
    superLikeReady.value = false;
    // Expand durumu KORUNUYOR: pinch çoğunlukla expanded panelde yapılıyor,
    // yarım kalmış bir collapse varsa bulunduğu uca geri otursun. Yay
    // expand'in ortak ayarı — bounce'suz (bkz. EXPAND_SPRING); yukarıdaki
    // `cfg` swipe'ın geri dönüşü için, orada yaylanma isteniyor.
    cardExpandAnim.value = withSpring(
      expandedSV.value ? 1 : 0,
      EXPAND_SPRING,
    );
    // Krom aynı uca: kart açıksa devrolmuş (cam buton), kapalıysa yerinde.
    cardChromeAnim.value = withSpring(
      expandedSV.value ? 1 : 0,
      EXPAND_SPRING,
    );
    runOnJS(resetSuperHaptics)();
  };

  useAnimatedReaction(
    () => photoPinchActive.value,
    (active, prev) => {
      if (active && !prev) cancelDragForPinch();
    },
  );

  // Yatay swipe — asymptotic rubber-band ile orta zorlanma hissi.
  // max=400, c=1.2 → delta=200'de tx ~150 (threshold), delta=400'de ~240,
  // asymptote 400 → daha güçlü pull'da hala kart hareketi var ama dampened.
  const horizontalPan = Gesture.Pan()
    .enabled(isTopCard)
    .activeOffsetX([-10, 10])
    .failOffsetY([-15, 15])
    .onUpdate((event) => {
      // Foto büyütülüyor → kart kıpırdamasın (bkz. cancelDragForPinch).
      if (photoPinchActive.value) return;
      // Süper beğeni verildi, alevin örtmesi bekleniyor: kart artık kilitli.
      if (superLikePending.value) return;
      const delta = event.translationX;
      const absDelta = Math.abs(delta);
      const max = 400;
      const c = 1.2;
      const damped = (absDelta * max * c) / (max + c * absDelta);
      const signed = delta < 0 ? -damped : damped;
      tx.value = signed;
      dragX.value = signed;
      overlayDragX.value = signed;
      buttonDragX.value = signed;

      // Haptic: visual tx üzerinden — kart threshold'u görsel olarak geçince patlasın.
      if (!hasVibrated.value && Math.abs(signed) > SWIPE_THRESHOLD) {
        hasVibrated.value = true;
        runOnJS(triggerHaptic)();
      }
      if (hasVibrated.value && Math.abs(signed) < SWIPE_THRESHOLD) {
        hasVibrated.value = false;
      }
    })
    .onEnd((event) => {
      hasVibrated.value = false;
      if (superLikePending.value) return;
      // Parmaklar kalktı ama büyütme kapanışı sürüyor: bu jest pinch'in
      // parçasıydı, swipe olarak yorumlanmamalı.
      if (photoPinchActive.value) {
        cancelDragForPinch();
        return;
      }

      // Displacement (85) + velocity (2500 + min 60px) — daha kolay swipe.
      const VELOCITY_THRESHOLD = 2500;
      const VELOCITY_MIN_DISPLACEMENT = 60;
      const goRight =
        tx.value > SWIPE_THRESHOLD ||
        (event.velocityX > VELOCITY_THRESHOLD &&
          tx.value > VELOCITY_MIN_DISPLACEMENT);
      const goLeft =
        tx.value < -SWIPE_THRESHOLD ||
        (event.velocityX < -VELOCITY_THRESHOLD &&
          tx.value < -VELOCITY_MIN_DISPLACEMENT);

      // Like kotası bittiyse: sağa swipe gerçekleşmiş olsa bile karta geri
      // dönsün, istek atılmasın, paywall açılsın. Sola swipe (Pass) backend'de
      // kotaya sayılmadığı için burada da bloklanmıyor.
      // KOTA DIŞINDA KİLİT YOK: profil keşif havuzunda görünmese bile backend
      // like/pass/süper beğeniyi kabul ediyor (rehber §3), istemci kendi kuralını
      // uydurmuyor.
      if (goRight && quotaExhaustedSV.value) {
        const cfg = { damping: 16, stiffness: 380, mass: 1 };
        tx.value = withSpring(0, cfg);
        dragX.value = withSpring(0, cfg);
        overlayDragX.value = withSpring(0, cfg);
        overlayOpacity.value = 1;
        buttonDragX.value = withSpring(0, cfg);
        runOnJS(openPaywall)();
        return;
      }

      if (goRight) {
        dragX.value = withTiming(SWIPE_THRESHOLD, exitConfig);
        overlayDragX.value = withTiming(SWIPE_THRESHOLD, exitConfig);
        buttonDragX.value = withTiming(0, fadeOutConfig);
        overlayOpacity.value = withTiming(0, fadeOutConfig);
        // Expand state varsa swipe boyunca paralel unwind et — yeni top kartı
        // mount olunca instant snap olmasın, swipe ile orantılı geri sarsın.
        unwindForExit();
        tx.value = withTiming(EXIT_DISTANCE, exitConfig, () => {
          runOnJS(onSwipe)("right", profile.userId);
        });
      } else if (goLeft) {
        dragX.value = withTiming(-SWIPE_THRESHOLD, exitConfig);
        overlayDragX.value = withTiming(-SWIPE_THRESHOLD, exitConfig);
        buttonDragX.value = withTiming(0, fadeOutConfig);
        overlayOpacity.value = withTiming(0, fadeOutConfig);
        unwindForExit();
        tx.value = withTiming(-EXIT_DISTANCE, exitConfig, () => {
          runOnJS(onSwipe)("left", profile.userId);
        });
      } else {
        // Threshold geçemedi — super-like ile aynı spring physics ile bounce-back.
        const cfg = { damping: 16, stiffness: 380, mass: 1 };
        tx.value = withSpring(0, cfg);
        dragX.value = withSpring(0, cfg);
        overlayDragX.value = withSpring(0, cfg);
        overlayOpacity.value = 1;
        buttonDragX.value = withSpring(0, cfg);
      }
    });

  // Dikey pan: 3 modda çalışır:
  //  - Card mode + pull-down → super-like (mevcut)
  //  - Card mode + pull-up → expand (rubber-band)
  //  - Expanded mode + pull-down (scrollY=0) → collapse (rubber-band)
  // Expanded mode + pull-up: ScrollView native scroll'u handle eder.
  const verticalPan = Gesture.Pan()
    .enabled(isTopCard)
    // 15 → 10: jest daha erken aktive olsun. 15'te hafif kaydırmaların ilk
    // yarısı ölü bölgede kalıyor, kart ancak parmak epey yol aldıktan sonra
    // kıpırdamaya başlıyordu.
    .activeOffsetY([-10, 10])
    .failOffsetX([-20, 20])
    .simultaneousWithExternalGesture(nativeScrollGesture)
    .onBegin(() => {
      dragOffsetY.value = 0;
      // Yeni jest: scroll'u yine native sürsün. Bayrak ancak açılış bu jestin
      // içinde tamamlanırsa kalkıyor. Süren bir momentum varsa da burada
      // kesiliyor — parmak ekrana değdiğinde savrulma durmalı.
      drivingScroll.value = false;
      collapseTakeover.value = false;
      superLikeLocked.value = false;
      cancelAnimation(driveOffset);
    })
    .onUpdate((event) => {
      // Foto büyütülüyor → ne collapse ne super-like (bkz. cancelDragForPinch).
      if (photoPinchActive.value) return;
      // Süper beğeni verildi, alevin örtmesi bekleniyor: kart artık kilitli.
      if (superLikePending.value) return;
      if (expandedSV.value) {
        // Açılış bu jestte tamamlandı → scroll'u biz sürüyoruz (bkz.
        // drivingScroll). Taşan mesafe doğrudan scroll konumu: parmak
        // yukarıda kaldıkça içerik akıyor, hareket hiç durmuyor.
        if (drivingScroll.value) {
          const target = Math.max(
            0,
            dragOffsetY.value - event.translationY,
          );
          driveOffset.value = target; // reaction scroll'a yazıyor
          // Parmak geri indi ve içerik tepeye oturdu: sürüşü bırak, bundan
          // sonrası collapse jesti. Referansı da taşı ki kapanış sıfırdan
          // başlasın.
          if (target <= 0) {
            // Native offset'i de KESİN olarak tepeye çek. `driveOffset`
            // üzerinden giden reaction bu karede bayrağı inmiş görüp
            // atlayabiliyor; içerik o zaman scroll edilmiş kalıyor ve kapanışın
            // sonunda BounceScrollView'ın `scrollTo(0)`ı onu tek karede geri
            // alıyordu — "içerik alta kayıyor" görüntüsü buydu.
            scrollTo(scrollRef, 0, 0, false);
            drivingScroll.value = false;
            // Aynayı da hemen yaz ki bir sonraki karede kapanış deltası
            // sıfırdan başlasın.
            scrollY.value = 0;
            collapseTakeover.value = true;
            dragOffsetY.value = event.translationY;
          }
          return;
        }
        // EXPANDED MODE — sadece scrollY=0'da pull-down ile collapse.
        // `collapseTakeover`: bu jest scroll'dan kapanışa geçtiyse native
        // scrollY'nin yetişmesini bekleme (bkz. bayrağın notu).
        if (scrollY.value > 0 && !collapseTakeover.value) {
          dragOffsetY.value = event.translationY;
          ty.value = 0;
          return;
        }
        const delta = event.translationY - dragOffsetY.value;
        if (delta > 0) {
          // Açılışın simetriği: parmak kapatıyor, eşik/direnç yok.
          const progress = Math.min(
            1,
            delta / (HEADER_COVER * COLLAPSE_DRAG_SCALE),
          );
          // Kartın aşağı inişini kapanma oranı taşıyor (lift azalıyor); buraya
          // ek bir kayma KOYMA (bkz. yukarıdaki not).
          ty.value = 0;
          cardExpandAnim.value = 1 - progress;
          cardChromeAnim.value = 1 - progress;
          // Kart tamamen kapandı: modu da kapat ki parmak aşağı çekmeye devam
          // ederse süper beğeniye geçebilsin (card mode dalı). Referansı da
          // taşı — yoksa card mode `delta`yı kapanışın kat ettiği yoldan
          // devralır ve süper beğeni doğrudan eşikte doğar.
          if (progress >= 1) {
            // Kapanış anında da garanti: kart kapalıyken içerik tepede olmalı,
            // yoksa bir sonraki açılış scroll edilmiş bir panelle doğuyor.
            scrollTo(scrollRef, 0, 0, false);
            commitExpanded(false);
            // Kapanışın rubber-band payını (ty) burada bırakıyoruz: card mode
            // süper beğeniyi kendi eğrisiyle sıfırdan sürüyor ve `ty`yi ilk
            // karede 0'a yakın bir değere yazıyor. Devralınmazsa kart o karede
            // COLLAPSE_PEEK_MAX kadar yukarı zıplıyor — "süper beğeni
            // animasyonuyla çakışma" olarak görünen şey buydu.
            ty.value = 0;
            // Aynı jest artık card mode: expanded kapısı yeniden geçerli
            // olmalı (bkz. collapseTakeover).
            collapseTakeover.value = false;
            // Ama süper beğeniye GEÇMESİN: kapanış da süper beğeni de aşağı
            // çekiş, aralarındaki tek doğal sınır parmağın kalkması.
            superLikeLocked.value = true;
            dragOffsetY.value = event.translationY;
          }
        } else {
          // Pull-up expanded'da: scroll handle etmeli. Yarıda bırakılmış bir
          // collapse varsa görseli de expanded'a geri al — yoksa
          // cardExpandAnim kısmi değerinde donuyor: panel yarı kapalı
          // görünürken mod hâlâ expanded kalıyordu.
          ty.value = 0;
          if (cardExpandAnim.value < 1) {
            cardExpandAnim.value = 1;
            cardChromeAnim.value = 1;
          }
        }
        return;
      }

      // CARD MODE
      if (scrollY.value > 0) {
        dragOffsetY.value = event.translationY;
        ty.value = 0;
        superLikeProgress.value = 0;
        cardPullProgress.value = 0;
        runOnJS(resetSuperHaptics)();
        return;
      }
      const delta = event.translationY - dragOffsetY.value;
      if (delta > 0) {
        // PULL-DOWN — super-like. Bu jest kartı KAPATARAK buraya geldiyse
        // atlanıyor: kapanış da süper beğeni de aşağı çekiş, parmak
        // kaldırılmadan devam edildiğinde kart kapanır kapanmaz süper beğeni
        // devralıyordu (bkz. superLikeLocked).
        //
        // Kilit YALNIZ BU DAL: bir tur card mode'un tamamına konmuştu ve o
        // zaman aynı jestte kartı tekrar AÇMAK da imkânsız hâle geliyordu —
        // yukarı çekiş kapanışın tersi yönde, kazara tetiklenen bir hareket
        // değil.
        if (superLikeLocked.value) {
          ty.value = 0;
          superLikeProgress.value = 0;
          cardPullProgress.value = 0;
          return;
        }
        const max = 100;
        const c = 0.5;
        ty.value = (delta * max * c) / (max + c * delta);
        const progress = Math.min(ty.value / SUPER_LIKE_PULL_THRESHOLD, 1);
        superLikeProgress.value = progress;
        cardPullProgress.value = progress;
        cardExpandAnim.value = 0;
        // Yön değişti: aynı jest içinde önce yukarı çekilip kart kısmen
        // açılmış olabilir. Açılışı da kromu da geri al, yoksa isim sönük
        // kalır ve kalp yarı yolda donar.
        cardChromeAnim.value = 0;
        if (progress >= 1 && !superLikeReady.value) {
          superLikeReady.value = true;
          runOnJS(resetSuperHaptics)();
          runOnJS(triggerSuperLikeHaptic)();
        } else if (progress < 1) {
          if (superLikeReady.value) superLikeReady.value = false;
          // Threshold'a kadar artan sıklıkta haptic (JS loop'u kendini zamanlar).
          runOnJS(updateSuperHaptics)(progress);
        }
      } else if (delta < 0) {
        // PULL-UP — expand. EŞİK YOK, DİRENÇ YOK: kart parmağı sürekli izliyor.
        // Bölende HEADER_COVER var, çünkü kartın açılırken kat ettiği görsel
        // yol o (bkz. animatedStyle); EXPAND_DRAG_SCALE ise parmağın o yolu
        // doldurmak için kat etmesi gereken mesafeyi uzatıyor.
        const progress = Math.min(
          1,
          -delta / (HEADER_COVER * EXPAND_DRAG_SCALE),
        );
        ty.value = 0;
        cardExpandAnim.value = progress;
        // Krom açılışla BİREBİR (bkz. yukarıdaki not): isim/pill bloğunun
        // çekilmesi, panelin gelmesi ve fotoğrafın açılması tek hareket.
        cardChromeAnim.value = progress;
        superLikeProgress.value = 0;
        // Arkadaki kart BÜYÜMÜYOR. O büyüme "bu kart gidiyor, sıradaki geliyor"
        // sinyali (swipe ve super-like); expand'de kart gitmiyor.
        cardPullProgress.value = 0;
        // Simetrik temizlik: önce aşağı çekip super-like eşiğini geçtiyse,
        // yukarı dönüşte o niyet iptal olmalı — yoksa expand'e bırakırken kart
        // super-like olarak uçuyordu.
        superLikeReady.value = false;
        runOnJS(resetSuperHaptics)();
        // Kart tam açıldı: modu AYNI JESTİN İÇİNDE devret. ScrollView
        // `expanded` ile açılıyor (bkz. SwipeCard) ve pan onunla simultaneous
        // çalışıyor — parmak yukarı çekmeye devam ederse hareket kesintisiz
        // scroll'a dönüşüyor. Bırakışı beklemek burada bir duraklama olurdu.
        // Referans taşınıyor: parmak yön değiştirirse collapse sıfırdan
        // başlasın, açılışın kat ettiği yolu kapanış olarak saymasın.
        if (progress >= 1) {
          commitExpanded(true);
          dragOffsetY.value = event.translationY;
          // Bundan sonrası scroll ve onu bu jest sürecek: iOS devam eden
          // dokunuşu ScrollView'a devretmiyor (bkz. drivingScroll).
          drivingScroll.value = true;
        }
      } else {
        ty.value = 0;
        superLikeProgress.value = 0;
        cardPullProgress.value = 0;
        cardChromeAnim.value = 0;
        runOnJS(resetSuperHaptics)();
      }
    })
    .onEnd((event) => {
      dragOffsetY.value = 0;
      if (superLikePending.value) return;
      // Pinch'in parçasıydı: expand/collapse/super-like kararlarının hiçbiri
      // verilmemeli, kart bulunduğu uca geri otursun.
      if (photoPinchActive.value) {
        cancelDragForPinch();
        return;
      }

      if (expandedSV.value) {
        // Scroll'u BİZ sürüyorduk: parmak kalktı ama hareket bitmedi —
        // momentumu withDecay devralıyor, tıpkı native scroll'un savrulması
        // gibi. Bayrak decay bitene kadar kalkmıyor, yoksa reaction ilk
        // karede susar ve savrulma hiç görünmez.
        if (drivingScroll.value) {
          driveOffset.value = withDecay(
            {
              velocity: -event.velocityY,
              clamp: [0, scrollMax.value],
              deceleration: 0.998,
            },
            () => {
              drivingScroll.value = false;
            },
          );
          return;
        }
        // Native scroll sürüyordu: bu jest kartla ilgili DEĞİL, içerikle.
        // Karar verilmemeli — aşağı doğru hızlı bir flick `settleExpand`e
        // "kapat" diye okunurdu.
        if (scrollY.value > 0) return;
        // EXPANDED MODE release — kart yarı kapalı kaldıysa en yakın uca.
        settleExpand(event.velocityY);
        return;
      }

      // CARD MODE release
      const wasReady = superLikeReady.value;
      superLikeReady.value = false;
      runOnJS(resetSuperHaptics)();

      if (wasReady && superLikeExhaustedSV.value) {
        // SuperLike kotası bitti — kart geri yerine spring ile dönsün, istek yok,
        // ayrı superlike paywall modal'ı açılsın.
        const cfg = { damping: 16, stiffness: 380, mass: 1 };
        ty.value = withSpring(0, cfg);
        superLikeProgress.value = withSpring(0);
        cardPullProgress.value = withSpring(0);
        runOnJS(openSuperLikePaywall)();
      } else if (wasReady) {
        commitSuperLike();
      } else {
        // Yukarı çekiş yarıda bırakıldı: kart nerede kaldıysa oradan en yakın
        // uca. Süper beğeni artıkları da burada temizleniyor — aynı jest önce
        // aşağı çekilmiş olabilir.
        superLikeProgress.value = withSpring(0);
        cardPullProgress.value = withSpring(0);
        settleExpand(event.velocityY);
      }
    });

  const composedGesture = Gesture.Simultaneous(horizontalPan, verticalPan);

  // Moderasyon köprüleri — SwipeCard argümansız handler bekliyor, DiscoverScreen
  // ise hangi profilin şikayet/engel edildiğini bilmek zorunda. Prop verilmezse
  // undefined kalır: SwipeCard o zaman ikonları hiç çizmez.
  const handleReport = React.useCallback(
    () => onReport?.(profile),
    [onReport, profile],
  );
  const handleBlock = React.useCallback(
    () => onBlock?.(profile),
    [onBlock, profile],
  );
  // Aynı köprü notlar için: SwipeCard yalnız HEDEFİ biliyor, hangi profile
  // yazıldığını burada ekliyoruz.
  const handleNote = React.useCallback(
    (target: NoteTarget) => onNote?.(profile, target),
    [onNote, profile],
  );

  // "Yukarı kaydır" ipucuna dokunmakla expand/collapse toggle — jestin
  // bırakışıyla AYNI yay (bkz. EXPAND_SPRING).
  const handleExpandPress = React.useCallback(() => {
    // Krom burada PANELLE BİRLİKTE yayda: jestte ikisi ayrı zamanlanıyor
    // (krom parmakla, panel bırakışta) ama dokunmada ayıracak bir çekiş yok —
    // tek bir hareket olmalılar. Krom yazılmazsa açık kartta isim/pill duruyor
    // ve süper beğeni kalbi cam butona hiç dönüşmüyor.
    if (expandedSV.value) {
      // Jestin bırakışıyla aynı yol: ayna yayın sonunda güncelleniyor.
      collapseWithSpring();
    } else {
      ty.value = withSpring(0, EXPAND_SPRING);
      cardExpandAnim.value = withSpring(1, EXPAND_SPRING);
      cardChromeAnim.value = withSpring(1, EXPAND_SPRING);
      cardPullProgress.value = withSpring(0, EXPAND_SPRING);
      commitExpanded(true);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [commitExpanded, collapseWithSpring]);

  const animatedStyle = useAnimatedStyle(() => {
    const rotate = interpolate(tx.value, [-width, 0, width], [-15, 0, 15]);

    return {
      // Expanded lift'in bedeli: kart HEADER_COVER kadar yukarı binince,
      // kutusu `inset:0` olduğu için aynı miktar kartın ALTINDA boşluk olarak
      // kalıyordu (tab bar'ın altındaki şerit). Kutuyu aşağı doğru aynı
      // miktarda büyütüyoruz → alt kenar container'ın dibinde kalır ve o şeridi
      // expanded içeriğin devamı doldurur. Kartın iç yapısı değişmiyor.
      //
      // BİR ARA `top` İLE YAPILDI, GERİ ALINDI: amacı kart açıkken ata
      // transform'unu kimliksel tutup içerideki cam kutuları kurtarmaktı
      // (bkz. CardSectionBox'taki ata kuralı). Kâğıt üstünde geometri birebir
      // aynı — ama camları düzeltmedi ve kartın yerleşiminde gerileme yarattı.
      // Amacını vermeyen bir değişikliği tutmadık. Tekrar denenecekse önce
      // yerleşim doğrulanmalı.
      //
      // ── KUTU HİÇ BOYUT DEĞİŞTİRMİYOR, YALNIZ KAYIYOR ────────────────────
      //
      // `bottom` SABİT ve en büyük hâlinde: kutu kapalı kartta da açık kartın
      // boyunda, alt ucu ekranın dibinin altına taşıyor (ekran kırpıyor, orada
      // panel bekliyor). Açılış tek bir `translateY` ile — kutu yukarı kayınca
      // üstten HEADER_COVER kadarı açılıyor, alt kenar ekranın dibinde
      // kalıyor.
      //
      // ÖNCE İKİSİ DE ANİMASYONLUYDU (lift transform, alt kenar `bottom`) ve
      // birbirini götürmesi gerekiyordu; ekranda götürmüyordu: `bottom` bir
      // layout prop'u, shadow-tree commit'iyle bir kare geriden geliyor,
      // transform ise anında. O farkta alt kenar aşağı taşıyor, "kart alttan
      // büyüyor" görüntüsü çıkıyordu. Sonra ikisi de layout'a alındı (`top` +
      // `bottom`) — bu sefer de layout animasyonu jest boyunca kare
      // atlıyordu.
      //
      // Kutu sabit olunca her iki sorun da kalmıyor: tek animasyon transform,
      // üstelik `measuredCardHeight` de artık hiç değişmiyor.
      //
      // `isTopCard`A BAĞLI DEĞİL, bilerek. Alt kart bunu 0 alıyordu, yani
      // kutusu kısa doğuyordu; SwipeCard yüksekliği "en küçük ölçüm kazanır"
      // kuralıyla kilitlediği için (bkz. oradaki onLayout notu) o kısa değer
      // kart üste çıktığında da kalıyordu: fotoğraf kısa, altında boşluk,
      // panel ekranın ortasında. Kutu deste boyunca aynı olmak zorunda.
      //
      // Görsel bir bedeli yok: alt kart üstteki tarafından tamamen örtülü ve
      // kutunun alt ucu zaten ekranın dışına taşıyor.
      bottom: -(HEADER_COVER + tabBarInset),
      transform: [
        { translateX: tx.value },
        // ty: geçici sürükleme payı (süper beğeni peek'i, swipe bounce'ı).
        // İkinci terim kalıcı lift — açık kartta kutu bu kadar yukarıda.
        {
          translateY:
            ty.value -
            (isTopCard
              ? HEADER_COVER * Math.max(0, Math.min(1, cardExpandAnim.value))
              : 0),
        },
        { rotate: isTopCard ? `${rotate}deg` : "0deg" },
        { scale: scale.value },
        // `as any`: RN'in transform tipi her elemanın TEK anahtarlı olmasını
        // istiyor, TS ise heterojen diziyi `{translateX; translateY?: undefined}`
        // birleşimi olarak çıkarıyor (undefined ≠ never). Ekranın kendi
        // FigureEightRadar'ında da aynı kaçış kullanılıyor. Props `any` iken
        // hata görünmüyordu, tipleme onu ortaya çıkardı — davranış aynı.
      ] as any,
      opacity: isTopCard
        ? 1
        : interpolate(
            // Scale ile aynı combined: horizontal swipe VE vertical pull-down
            // (super-like) hangisi büyükse onu kullan → super-like sırasında da
            // bottom card brightness artar, swipe sonrası "0.8 → 1 zıplaması" olmaz.
            Math.min(
              1,
              Math.max(
                Math.abs(dragX.value) / SWIPE_THRESHOLD,
                cardPullProgress.value,
              ),
            ),
            [0, 1],
            [0.8, 1],
            Extrapolate.CLAMP,
          ),
      zIndex: isTopCard ? 10 : 1,
    };
  });

  
  return (
    <GestureDetector gesture={composedGesture}>
      <Animated.View
        // `inset: 0` kısayolu yerine açık kenarlar: animatedStyle'daki `bottom`
        // (expanded'da negatife inen) statik değerle ezilmesin.
        style={[
          { position: "absolute", top: 0, left: 0, right: 0, bottom: 0 },
          animatedStyle,
        ]}
      >
        <SwipeCard
          profile={profile}
          onPass={onPass}
          onLike={onLike}
          onSuperLike={onSuperLike}
          onExpandPress={handleExpandPress}
          scrollY={scrollY}
          scrollRef={scrollRef}
          scrollMax={scrollMax}
          topHitSpeed={topHitSpeed}
          nativeScrollGesture={nativeScrollGesture}
          superLikeProgress={superLikeProgress}
          isTopCard={isTopCard}
          expanded={expanded}
          superLikesRemaining={superLikesRemaining}
          onReport={onReport ? handleReport : undefined}
          onBlock={onBlock ? handleBlock : undefined}
          onNote={onNote ? handleNote : undefined}
        />
      </Animated.View>
    </GestureDetector>
  );
}

// React.memo: DiscoverScreen optimistic stats update'inde re-render olunca
// SwipeWrapper'lar tekrar render edilmesin. Profile + isTopCard + quota
// flag'leri değişmediği sürece skip et. Handler ref'leri DiscoverScreen'de
// useCallback ile stabilize edildi.
export default React.memo(SwipeWrapper, (prev, next) => {
  return (
    prev.profile?.userId === next.profile?.userId &&
    prev.isTopCard === next.isTopCard &&
    prev.swipeQuotaExhausted === next.swipeQuotaExhausted &&
    prev.superLikeQuotaExhausted === next.superLikeQuotaExhausted &&
    prev.snapEntry === next.snapEntry &&
    prev.superLikesRemaining === next.superLikesRemaining &&
    prev.onSwipe === next.onSwipe &&
    prev.onPass === next.onPass &&
    prev.onLike === next.onLike &&
    prev.onSuperLike === next.onSuperLike &&
    prev.willMatch === next.willMatch &&
    prev.onReport === next.onReport &&
    prev.onBlock === next.onBlock &&
    prev.onNote === next.onNote
  );
});
