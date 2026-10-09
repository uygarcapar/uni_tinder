import React, { useEffect } from "react";
import { Dimensions } from "react-native";
import { GestureDetector, Gesture } from "react-native-gesture-handler";
import Animated, {
  cancelAnimation,
  useAnimatedRef,
  useSharedValue,
  useAnimatedStyle,
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
  FIRE_PULL_THRESHOLD,
} from "@/shared/services/uiBus";
import { DISCOVER_CARD_EXPAND_LIFT } from "@/features/discover/components/discoverHeaderMetrics";
import { photoPinchActive } from "@/shared/components/pinchZoom";
import { useRenderCount } from "@/shared/debug/useRenderCount";
import type { NoteTarget, PotentialMatch } from "@/shared/types";

const { width } = Dimensions.get("window");
const SWIPE_THRESHOLD = 85;



/**
 * ── AÇ/KAPA DİYE BİR ŞEY YOK: KART HEP AÇIK ────────────────────────────────
 *
 * Model (istek): kart tüm ekranı kaplıyor, profil panelinin bölümleri kapağın
 * hemen altında STATİK duruyor ve içerik ilk dokunuştan itibaren kaydırılıyor.
 * Dikey jestin tek işi kaldı — tepedeyken aşağı çekişte Fire.
 *
 * Üst chrome'un devri (kapaktaki isim/pill bloğu, şeritteki başlık, ekranın
 * üstündeki cam geri al/filtre) artık SCROLL KONUMUNA bağlı ve onu SwipeCard
 * sürüyor: kapağın kendi ismi şeridin altına girince devir kendi süresiyle
 * yapılıyor (bkz. SwipeCard > CHROME_FADE). Jest krom kanalını hiç yazmıyor.
 *
 * ── GİDEN DÖRT MODEL, sırayla ───────────────────────────────────────────────
 *   1. Rubber-band + eşik + haptic: çekiş bir "niyet ölçme" hareketiydi, kart
 *      eşikte duvara çarpıyordu. Eşiğe varmak açılışı BAŞLATMIYOR, sadece izin
 *      veriyordu — jest ile sonuç arasında duraklama kalıyordu.
 *   2. Kısmi takip (EXPAND_FOLLOW_RATIO): kart çekişte yolun bir kısmını
 *      gidiyor, kalanı bırakışta yaya kalıyordu. Aynı duraklamanın küçüğü.
 *   3. Tam oranlı takip (`progress = yol / (TRAVEL × SCALE)`, 110 × 1.3 ≈ 143
 *      px): hareket akıcıydı ama BEKLEME getiriyordu — içeriğe inmek için önce
 *      o yolu doldurmak gerekiyordu; üstelik yazılar ve cam butonlar parmakla
 *      birlikte yarı saydam durup jest yarıda bırakılınca orada asılı
 *      kalıyordu.
 *   4. Niyet eşiği (8 px) + krom için ayrı süre: bekleme neredeyse kalkmıştı
 *      ama hâlâ iki DURUM ve aralarında bir geçiş vardı — panelin yerine
 *      oturması, scroll kapısının açılması, kapanış dalı ve Fire ile kapanışın
 *      aynı yönde olmasından doğan kilit.
 *
 * Dördü de aynı sorunun farklı ölçekleriydi: kartın "kapalı" bir hâli olması.
 * O hâl kalkınca jest de, geçiş de, aralarındaki bütün kenar durumları da
 * kalktı.
 *
 * ── BUNLARLA BİRLİKTE DÜŞEN SABİTLER ───────────────────────────────────────
 * `EXPAND_DRAG_SCALE` (1.3) / `COLLAPSE_DRAG_SCALE` (0.8): parmağın kat etmesi
 * gereken yolun çarpanları; kapanış bilerek daha duyarlıydı, çünkü açık kartta
 * tepedeyken aşağı çekmek native bounce'ın yerini alıyordu.
 * `EXPAND_TRAVEL_BASE` (110): o yolun tabanı.
 * `MOMENTUM_HANDOFF` (0.4): bırakıştaki pan hızının scroll'a devredilen payı —
 * hızın bir kısmı kartı AÇMAK için harcandığından tamamı devredilince hareket
 * "fırlatma" gibi oluyordu.
 * `OPEN_INTENT_PX` (8) ve `CHROME_FADE`: dördüncü modelin eşiği ve krom
 * süresi. Süre SwipeCard'a taşındı — kromu artık orası sürüyor.
 *
 * Scroll baştan native: yolu da savrulmayı da ScrollView'ın kendisi yapıyor.
 */

/**
 * ── KAPANIŞIN AYRI ÇEKİŞ ÖLÇEĞİ (COLLAPSE_DRAG_SCALE) KALDIRILDI ──────────
 *
 * 0.8'di: açılışın oranlı modelinde kapanış bilerek daha duyarlı sürülüyordu,
 * çünkü açık kartta tepedeyken aşağı çekmek native bounce'ın yerini alıyor ve
 * açılışla aynı ölçekte kart neredeyse kıpırdamıyor, "tepede takıldı" hissi
 * veriyordu.
 *
 * Oranlı model gitti (bkz. yukarısı): iki yön de aynı NİYET eşiğini
 * (OPEN_INTENT_PX) kullanıyor, ölçeklenecek bir yol kalmadı.
 */

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
// ⚠️ Burada bir zamanlar `EXIT_DISTANCE_Y` (Fire'ın yukarı uçuşu) vardı ve
// KALDIRILDI (2026-10-06): Fire artık hiçbir dalda kartı fırlatmıyor — ne
// eşleşmeyen dalda (alev süpürmesi örtüyor) ne eşleşmeli dalda (kutlama
// MatchModal'ın). Bkz. runFire.

export type SwipeDirection = "left" | "right" | "up";

interface SwipeWrapperProps {
  profile: PotentialMatch;
  /**
   * `covered`: deste bu değişimi ekranı KAPLAYAN bir kutlamanın altında yaptı
   * (yalnız eşleşmeyen Fire) — yeni top kart giriş animasyonunu atlar.
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
  /** 0 = yok, 1 = pass, 2 = like, 3 = fire (buton tetiklemesi). */
  programmaticSwipe: SharedValue<number>;
  onPass: () => void;
  onLike: () => void;
  onFire: () => void;
  /**
   * Bu profile gidecek beğeni EŞLEŞMEYLE mi biter? Kutlama kararı buna bağlı
   * (bkz. runFire): eşleşecekse alev süpürmesi oynatılmıyor, kutlama
   * MatchModal'ın oluyor.
   *
   * Prop değil de fonksiyon: cevap "beni beğenenler" kümesinden okunuyor ve o
   * küme her gelen beğenide değişiyor — değer olarak geçilseydi deste her
   * beğenide yeniden render olurdu. Karar ANINDA sorulsun diye çağrılıyor.
   * VERİLMEZSE kutlama her zaman oynar (eski davranış).
   */
  willMatch?: (profile: PotentialMatch) => boolean;
  swipeQuotaExhausted?: boolean;
  fireQuotaExhausted?: boolean;
  /**
   * Bu kart, ekranı kaplayan bir kutlamanın ALTINDA top karta yükseldi: giriş
   * animasyonu atlanır, kart doğrudan son hâlinde çizilir (bkz. `scale`).
   */
  snapEntry?: boolean;
  superLikesRemaining: number | null;
  /** Kart altındaki moderasyon ikonları — VERİLMEZSE hiç çizilmez. */
  onReport?: (profile: PotentialMatch) => void;
  onBlock?: (profile: PotentialMatch) => void;
  /** Kapağın sağ alt kolonundaki "üç nokta" — seçenekler sheet'ini ekran açıyor. */
  onMenu?: (profile: PotentialMatch) => void;
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
  onFire,
  willMatch,
  swipeQuotaExhausted = false,
  fireQuotaExhausted = false,
  snapEntry = false,
  superLikesRemaining,
  onReport,
  onBlock,
  onMenu,
  onNote,
}: SwipeWrapperProps) {
  useRenderCount("SwipeWrapper");
  // Kartın açılırken kalktığı mesafe — ARTIK SIFIR, çünkü kart kapalıyken de
  // tüm ekranı kaplıyor (gerekçenin tamamı + tarihçe:
  // DISCOVER_CARD_EXPAND_LIFT). Sabit yine de okunuyor: kutunun `bottom`u ve
  // açılış transform'u onunla türetilmiş kalsın, pay geri istenirse tek sayı
  // dönsün.
  //
  // ⚠️ JESTİN YOLUYLA KARIŞTIRMA: parmağın kat etmesi gereken mesafe bundan
  // BAĞIMSIZ: karar bir YOL değil bir NİYET eşiği (bkz. OPEN_INTENT_PX).
  const HEADER_COVER = DISCOVER_CARD_EXPAND_LIFT;

  // TAB BAR PAYI BURADAN GİTTİ. Kabuk bir dönem `-(HEADER_COVER + tabBarInset)`
  // ile ekranın dibinin altına taşıyordu (kap bar'a pay bırakıyor, kutu o payın
  // içine giriyordu). Kap tüm ekrana açılınca kabuğun taşacağı bir yer kalmadı;
  // bar'ın üstünde durması gereken tek şey kapağın alt bandındaki chrome ve o
  // payı kart kendi içinde okuyor (SwipeCard > coverBottomInset).
  const tx = useSharedValue(0);
  const ty = useSharedValue(0);
  const scrollY = useSharedValue(0);
  // Scroll bitip rubber-band'in başladığı andaki translationY baseline'ı.
  // Sürekli gesture'da scroll → rubber-band geçişi yumuşak olsun diye.
  const dragOffsetY = useSharedValue(0);
  const hasVibrated = useSharedValue(false);
  // Pull-down sırasında süper-like kalbinin doluluk oranı (0-1). SwipeCard'a iletilir.
  const fireProgress = useSharedValue(0);
  /**
   * Dikey jest SÜRÜYOR mu (0/1) — oranı değil, parmağın ekranda olup olmadığını
   * söylüyor.
   *
   * Gerekliliği: bırakışta `fireProgress` yayla iniyor ve 0'a yaklaşması
   * saniyeleri buluyor. Ona bakan bir taraf ("jest bitti mi") bırakıştan çok
   * sonra haber alıyordu — Fire alevinin mandallı büyümesi bu yüzden
   * parmak kalktıktan sonra da asılı kalıyordu (bkz. SwipeCard > burnGrow).
   * Bu bayrak yayı beklemiyor: `onFinalize` parmak kalkar kalkmaz sıfırlıyor.
   */
  const pullActive = useSharedValue(0);
  // Threshold geçildiğinde haptic gate (gesture başına 1 kez patlasın).
  const fireReady = useSharedValue(false);
  /**
   * ── AÇIK/KAPALI DURUMU KALDIRILDI: ÜSTTEKİ KART HEP AÇIK ──────────────────
   *
   * Burada bir durum makinesi vardı: `expanded` React state'i, onun kanonik
   * worklet aynası `expandedSV`, `commitExpanded` / `openCard` / `collapseCard`
   * ve jestin iki yönü. Kart kapalı doğuyor, yukarı çekilince açılıyor, aşağı
   * çekilince kapanıyordu.
   *
   * HEPSİ GİTTİ (istek): kart zaten tüm ekranı kaplıyor, panel hemen altında
   * ve içerik ilk dokunuşta kaydırılabiliyor. Açılacak bir şey yok — "açık"
   * demek artık sadece "bu kart destenin üstünde" demek.
   *
   * Bunun düşürdükleri (hepsinin gerekçesi kendi yerinde yazılıydı):
   *   • `drivingScroll` / `driveOffset` — scroll'u jestin ELLE sürmesi. iOS
   *     `scrollEnabled` sonradan açılan bir ScrollView'a devam eden dokunuşu
   *     devretmiyordu; scroll baştan açık olunca o sorunun konusu kalmadı.
   *   • `collapseTakeover` — aynı jestte açılıştan kapanışa geçişin
   *     `scrollY`nin bir-iki kare gecikmesine takılması.
   *   • `fireLocked` — kapanış ile Fire'ın ikisi de aşağı çekiş olduğu için
   *     kapanır kapanmaz Fire'ın devralması.
   *   • `topHitSpeed` — scroll momentumla tepeye çarpınca kartı kapatma
   *     (ve eşik altındaki çarpmalarda "az kapandı" yaylanması).
   *   • `settleExpand` — bırakışta yarım kalanı tamamlama + momentum devri.
   *
   * Geriye kalan dikey jest TEK İŞ yapıyor: tepedeyken aşağı çekişte Fire.
   */
  const expanded = isTopCard;
  // Native scroll gesture — pan ile simultaneous çalışsın diye SwipeCard içindeki
  // ScrollView'a uygulanır. Aynı obje referansı pan ve ScrollView arasında paylaşılır.
  const nativeScrollGesture = React.useMemo(() => Gesture.Native(), []);

  /**
   * Kartın scroll'una erişim — `scrollTo` ve BounceScrollView'ın ref'i.
   *
   * Yanında bir dizi bayrak daha vardı (drivingScroll · driveOffset ·
   * scrollMax · collapseTakeover · fireLocked · topHitSpeed) ve hepsi aç/kapa
   * durum makinesine aitti; makine kalkınca düştüler — listesi ve tek tek
   * gerekçeleri yukarıda, `expanded`in notunda.
   */
  const scrollRef = useAnimatedRef<Animated.ScrollView>();

  const triggerHaptic = () => {
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
  };

  const triggerFireHaptic = () => {
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Heavy);
  };

  // Pull-down sırasında threshold'a kadar artan sıklıkta haptic. Kendini
  // yeniden zamanlayan JS loop'u; interval progress arttıkça kısalır → titreşim
  // hızlanır. progress ref'ten okunur (worklet her frame runOnJS ile günceller).
  const superProgressRef = React.useRef(0);
  const superHapticTimer = React.useRef<ReturnType<typeof setTimeout> | null>(
    null,
  );
  const runFireHapticTick = () => {
    const p = superProgressRef.current;
    // Yalnızca pull sürerken (0<p<1) çalışır; threshold'da Heavy haptic devralır.
    if (p <= 0.05 || p >= 1) {
      superHapticTimer.current = null;
      return;
    }
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
    const interval = 260 - p * 190; // ~260ms → ~70ms
    superHapticTimer.current = setTimeout(runFireHapticTick, interval);
  };
  const updateSuperHaptics = (p: number) => {
    superProgressRef.current = p;
    if (p > 0.05 && p < 1 && superHapticTimer.current == null) {
      runFireHapticTick();
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
  // kalmadı (bkz. yukarıdaki "EXPAND ARTIK EŞİKSİZ"). Fire'ın haptic'i
  // duruyor — o hâlâ eşikli bir karar.

  const openPaywall = () => {
    uiBus.emit("swipePaywall", {});
  };

  const openFirePaywall = () => {
    uiBus.emit("firePaywall", {});
  };

  // Çıkış ayarları — yana kaydırma ve (eşleşmeli) Fire uçuşu ortak
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
  /*
   * ── `settleExpand` KALDIRILDI ────────────────────────────────────────────
   *
   * Parmak kalkınca çalışan bırakış işleriydi: kart oranlı açıldığı dönemde
   * "yarım kalanı tamamla" (yarıdan fazla açıksa aç, hız da sayılır —
   * SETTLE_VELOCITY 1500 px/sn), sonrasında yalnız momentumu scroll'a devretme
   * (MOMENTUM_HANDOFF). İkisi de aç/kapa durumuna aitti.
   *
   * Scroll artık baştan native: hem savrulmayı hem momentumu ScrollView'ın
   * kendisi yapıyor, devredilecek bir şey yok.
   */

  const unwindForExit = () => {
    "worklet";
    if (cardExpandAnim.value > 0)
      cardExpandAnim.value = withTiming(0, exitConfig);
    if (cardChromeAnim.value > 0)
      cardChromeAnim.value = withTiming(0, exitConfig);
  };

  /**
   * Fire onaylandı.
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
   * tek bir Fire'a iki alev düşüyordu. Ama o dalda da KART UÇMUYOR
   * (2026-10-06): yerinde kalıyor, deste ÖRTÜSÜZ ilerliyor ve kutlamayı
   * MatchModal yapıyor. Uçuş kaldırıldı çünkü tek bir basış iki harekete
   * bölünüyordu — kart tepeden çıkıyor, hemen ardından perde aşağıdan
   * yükseliyordu.
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
    scrollY.value = 0;
  };

  const runFire = () => {
    if (flameCoverUnsub.current) return;
    if (willMatch?.(profile)) {
      // ⚠️ KART UÇMUYOR (2026-10-06). Burada bir zamanlar yukarı doğru bir
      // çıkış uçuşu vardı (EXIT_DISTANCE_Y) ve KALDIRILDI: tek bir Fire iki
      // ayrı harekete bölünüyordu — kart ekranın tepesinden çıkıyor, hemen
      // ardından MatchModal'ın alev perdesi aşağıdan yükseliyordu. Eşleşme
      // kutlaması MatchModal'ın (bkz. flameSweep'teki kural); kart Fire'ın
      // eşleşmeyen dalında olduğu gibi YERİNDE kalıyor, deste de o anda
      // ilerliyor. Kullanıcının gördüğü tek hareket kutlama.
      //
      // `covered: false` — ortada ekranı kaplayan bir kutlama YOK (perde ağ
      // yanıtından sonra geliyor), yani yeni top kart giriş animasyonunu
      // oynamalı; yana kaydırmadaki değişimin aynısı.
      //
      // collapseUnderCover: açık panel burada animasyonla kapanmıyor, çünkü
      // kart bu karede desteden düşüyor — asıl iş expand shared value'larını
      // deste ilerlemeden ÖNCE sıfırlamak (yoksa yeni top kart donmuş bir
      // expand oranıyla doğuyor).
      collapseUnderCover();
      onSwipe("up", profile.userId, false);
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

  // Fire işlendi ve örtme bekleniyor. Kart hâlâ ekranda ve dokunulabilir
  // duruyor; bu bayrak o pencerede İKİNCİ bir karar alınmasını engelliyor
  // (jestler ve buton tetiklemeleri) — aksi halde aynı profile art arda iki
  // swipe gidebilirdi.
  const firePending = useSharedValue(false);

  // Worklet'ten okumak için mirror — runOnJS'siz quota check.
  const quotaExhaustedSV = useSharedValue(swipeQuotaExhausted);
  useEffect(() => {
    quotaExhaustedSV.value = swipeQuotaExhausted;
  }, [swipeQuotaExhausted, quotaExhaustedSV]);
  const fireExhaustedSV = useSharedValue(fireQuotaExhausted);
  useEffect(() => {
    fireExhaustedSV.value = fireQuotaExhausted;
  }, [fireQuotaExhausted, fireExhaustedSV]);

  useEffect(() => {
    if (isTopCard) {
      dragX.value = 0;
      overlayDragX.value = 0;
      overlayOpacity.value = 1;
      buttonDragX.value = 0;
      hasVibrated.value = false;
      // Canlı kart artık bu: bekleyen bir Fire kilidi devralınmasın.
      firePending.value = false;
      return;
    }
    // Kart tepeden düştü. Deste yalnız ileri gitmiyor: rewind currentIndex'i
    // geri alıp o anki top kartı ALT kart yapıyor — scroll konumu üstünde
    // kalırsa tekrar top olduğunda içerik ortasından doğar.
    scrollY.value = 0;
  }, [
    isTopCard,
    dragX,
    overlayDragX,
    overlayOpacity,
    buttonDragX,
    scrollY,
    firePending,
  ]);

  /**
   * Fire'ın GÖRSEL tarafı — jest ve buton yolları aynı yere düşsün.
   *
   * Kart yerine oturuyor: pull-down geri sarılıyor, dolan kalp sönüyor. Sonrası
   * alevde: değişimi runFire bekletiyor.
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
  const commitFire = () => {
    "worklet";
    if (firePending.value) return;
    firePending.value = true;
    const cfg = { damping: 16, stiffness: 380, mass: 1 };
    ty.value = withSpring(0, cfg);
    fireProgress.value = withSpring(0);
    cardPullProgress.value = withSpring(0);
    runOnJS(runFire)();
  };

  useAnimatedReaction(
    () => programmaticSwipe?.value,
    (value, previous) => {
      if (!isTopCard || value === 0 || value === previous) return;
      // Fire örtme bekliyor: buton tetiklemeleri yutulsun. Bayrağı
      // SIFIRLAMAK şart — non-zero kalırsa bir sonraki kart mount olduğunda
      // reaction'ın ilk çalışmasında (previous === undefined) tetiklenir ve
      // yeni kart kendiliğinden kayar.
      if (firePending.value) {
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
        // Fire — kart yerinde kalır, değişimi alev örter.
        commitFire();
        programmaticSwipe.value = 0;
      }
    },
    [isTopCard],
  );

  const scale = useDerivedValue(() => {
    if (isTopCard) {
      // Deste alevin ALTINDA ilerlediyse (Fire) büyüme animasyonu YOK.
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

    // Bottom kart scale'i: yatay swipe oranı VE pull-down (fire) oranı
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
    fireProgress.value = withSpring(0);
    cardPullProgress.value = withSpring(0);
    fireReady.value = false;
    // KROMA DOKUNULMUYOR: onu scroll konumu sürüyor (bkz. SwipeCard >
    // chrome devri) ve pinch scroll'u oynatmıyor. Bir dönem burada aç/kapa
    // durumuna göre iki kanal birden geri sarılıyordu.
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
      // Fire verildi, alevin örtmesi bekleniyor: kart artık kilitli.
      if (firePending.value) return;
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
      if (firePending.value) return;
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
      // like/pass/Fire'ı kabul ediyor (rehber §3), istemci kendi kuralını
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
        // Threshold geçemedi — fire ile aynı spring physics ile bounce-back.
        const cfg = { damping: 16, stiffness: 380, mass: 1 };
        tx.value = withSpring(0, cfg);
        dragX.value = withSpring(0, cfg);
        overlayDragX.value = withSpring(0, cfg);
        overlayOpacity.value = 1;
        buttonDragX.value = withSpring(0, cfg);
      }
    });

  // Dikey pan: 3 modda çalışır:
  //  - Card mode + pull-down → fire (mevcut)
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
      pullActive.value = 1;
      // Yeni jest: scroll'u yine native sürsün. Bayrak ancak açılış bu jestin
      // içinde tamamlanırsa kalkıyor. Süren bir momentum varsa da burada
      // kesiliyor — parmak ekrana değdiğinde savrulma durmalı.
      cancelAnimation(ty);
    })
    .onUpdate((event) => {
      // Foto büyütülüyor → Fire yok (bkz. cancelDragForPinch).
      if (photoPinchActive.value) return;
      // Fire verildi, alevin örtmesi bekleniyor: kart artık kilitli.
      if (firePending.value) return;

      // CARD MODE
      if (scrollY.value > 0) {
        dragOffsetY.value = event.translationY;
        ty.value = 0;
        fireProgress.value = 0;
        cardPullProgress.value = 0;
        runOnJS(resetSuperHaptics)();
        return;
      }
      const delta = event.translationY - dragOffsetY.value;
      if (delta > 0) {
        // PULL-DOWN — fire. Bu jest kartı KAPATARAK buraya geldiyse
        // atlanıyor: kapanış da Fire de aşağı çekiş, parmak
        // kaldırılmadan devam edildiğinde kart kapanır kapanmaz Fire
        // devralıyordu (bkz. fireLocked).
        //
        const max = 100;
        const c = 0.5;
        ty.value = (delta * max * c) / (max + c * delta);
        const progress = Math.min(ty.value / FIRE_PULL_THRESHOLD, 1);
        fireProgress.value = progress;
        cardPullProgress.value = progress;
        // KROM KANALINA BURADA DOKUNULMUYOR. Eskiden 0'a yazılıyordu (aynı
        // jestte önce yukarı çekilip kart kısmen açılmış olabiliyordu); açılış
        // diye bir şey kalmadı. Yazmak artık düzeltmiyor, YALNIZCA KIRIYOR:
        // ham sayı atamak çalışan animasyonu iptal ediyor, yani scroll'un
        // sürdüğü krom devri kesilip isim/pill bloğu geri sıçrıyor.
        if (progress >= 1 && !fireReady.value) {
          fireReady.value = true;
          runOnJS(resetSuperHaptics)();
          runOnJS(triggerFireHaptic)();
        } else if (progress < 1) {
          if (fireReady.value) fireReady.value = false;
          // Threshold'a kadar artan sıklıkta haptic (JS loop'u kendini zamanlar).
          runOnJS(updateSuperHaptics)(progress);
        }
      } else if (delta < 0) {
        // PULL-UP — SCROLL. Burada yapacak bir şey yok: içerik ilk dokunuştan
        // itibaren native olarak kaydırılabiliyor (scrollEnabled hep açık) ve
        // pan onunla `simultaneousWithExternalGesture` çalışıyor. Bu dal yalnız
        // Fire artıklarını topluyor — aynı jestte önce aşağı çekilip eşik
        // geçilmiş olabilir, yön dönünce o niyet iptal olmalı.
        ty.value = 0;
        fireProgress.value = 0;
        cardPullProgress.value = 0;
        fireReady.value = false;
        runOnJS(resetSuperHaptics)();
      } else {
        // delta tam 0 — parmak yatay gidiyor. Fire artıkları temizleniyor;
        // krom kanalına DOKUNULMUYOR (gerekçe bir üstteki dalda).
        ty.value = 0;
        fireProgress.value = 0;
        cardPullProgress.value = 0;
        runOnJS(resetSuperHaptics)();
      }
    })
    .onEnd(() => {
      dragOffsetY.value = 0;
      if (firePending.value) return;
      // Pinch'in parçasıydı: Fire kararı verilmemeli, kart yerine otursun.
      if (photoPinchActive.value) {
        cancelDragForPinch();
        return;
      }

      // Scroll sürüyordu: bu jest kartla ilgili DEĞİL, içerikle. Fire kararı
      // verilmemeli — aşağı doğru hızlı bir flick kartı uçururdu.
      if (scrollY.value > 0) return;

      // CARD MODE release
      const wasReady = fireReady.value;
      fireReady.value = false;
      runOnJS(resetSuperHaptics)();

      if (wasReady && fireExhaustedSV.value) {
        // Fire kotası bitti — kart geri yerine spring ile dönsün, istek yok,
        // ayrı fire paywall modal'ı açılsın.
        const cfg = { damping: 16, stiffness: 380, mass: 1 };
        ty.value = withSpring(0, cfg);
        fireProgress.value = withSpring(0);
        cardPullProgress.value = withSpring(0);
        runOnJS(openFirePaywall)();
      } else if (wasReady) {
        commitFire();
      } else {
        // Eşik geçilmeden bırakıldı: Fire artıkları yaylanarak geri sarılıyor.
        fireProgress.value = withSpring(0);
        cardPullProgress.value = withSpring(0);
        ty.value = withSpring(0, EXPAND_SPRING);
      }
    })
    // `onEnd` DEĞİL: jest iptal edilirse (pinch devraldı, başka bir jest
    // kazandı) onEnd hiç çalışmıyor ve bayrak 1'de asılı kalırdı. `onFinalize`
    // her bitişte çalışıyor — "parmak gitti"nin tek güvenli yeri.
    .onFinalize(() => {
      pullActive.value = 0;
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
  const handleMenu = React.useCallback(
    () => onMenu?.(profile),
    [onMenu, profile],
  );
  // Aynı köprü notlar için: SwipeCard yalnız HEDEFİ biliyor, hangi profile
  // yazıldığını burada ekliyoruz.
  const handleNote = React.useCallback(
    (target: NoteTarget) => onNote?.(profile, target),
    [onNote, profile],
  );

  // ── DOKUNMAYLA AÇ/KAPA TOGGLE'I KALDIRILDI ────────────────────────────────
  // `handleExpandPress` buradaydı ve SwipeCard'a `onExpandPress` olarak
  // geçiyordu: kapağın dibindeki "yukarı kaydır" ipucuna dokunmak kartı
  // açıp kapatıyordu. İpucu kaldırılınca (istek, bkz. SwipeCard) çağıranı
  // kalmadı. Geri gelirse kuralı tek satır: jestle AYNI yoldan geçmeli
  // (openCard / collapseCard) — ayrı yazılırsa dokunma ile çekiş farklı
  // hızlarda açar.

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
      // `bottom` SABİT: kutu kapalı kartta da açık kartın boyunda. Bugün ikisi
      // aynı şey — kart kabı tüm ekran ve lift 0, yani kutu tam kabın boyunda
      // ve taşma payı yok.
      //
      // TAŞMA PAYI BİR DÖNEM VARDI (`-(HEADER_COVER + tabBarInset)`): kap
      // üstte şeridin altından başlıyor, altta tab bar'a pay bırakıyordu ve
      // kutu açılışta yukarı kayınca alt kenarın ekranın dibinde kalması
      // gerekiyordu. Kap tüm ekrana açılınca ikisi de konusuz kaldı.
      //
      // ANİMASYONLU YAPMA. Bir dönem alt kenar `bottom` ile sürülüyordu:
      // `bottom` bir layout prop'u, shadow-tree commit'iyle bir kare geriden
      // geliyor, transform ise anında — o farkta "kart alttan büyüyor"
      // görüntüsü çıkıyordu. Sonra ikisi de layout'a alındı (`top` + `bottom`)
      // ve bu sefer layout animasyonu jest boyunca kare atlıyordu.
      //
      // `isTopCard`A BAĞLI DEĞİL, bilerek. Alt kart bunu 0 alıyordu, yani
      // kutusu kısa doğuyordu; SwipeCard yüksekliği "en küçük ölçüm kazanır"
      // kuralıyla kilitlediği için (bkz. oradaki onLayout notu) o kısa değer
      // kart üste çıktığında da kalıyordu: fotoğraf kısa, altında boşluk,
      // panel ekranın ortasında. Kutu deste boyunca aynı olmak zorunda.
      bottom: -HEADER_COVER,
      transform: [
        { translateX: tx.value },
        // ty: geçici sürükleme payı (Fire peek'i, swipe bounce'ı).
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
            // (fire) hangisi büyükse onu kullan → fire sırasında da
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
          onFire={onFire}
          scrollY={scrollY}
          scrollRef={scrollRef}
          nativeScrollGesture={nativeScrollGesture}
          isTopCard={isTopCard}
          expanded={expanded}
          superLikesRemaining={superLikesRemaining}
          onReport={onReport ? handleReport : undefined}
          onBlock={onBlock ? handleBlock : undefined}
          onMenu={onMenu ? handleMenu : undefined}
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
    prev.fireQuotaExhausted === next.fireQuotaExhausted &&
    prev.snapEntry === next.snapEntry &&
    prev.superLikesRemaining === next.superLikesRemaining &&
    prev.onSwipe === next.onSwipe &&
    prev.onPass === next.onPass &&
    prev.onLike === next.onLike &&
    prev.onFire === next.onFire &&
    prev.willMatch === next.willMatch &&
    prev.onReport === next.onReport &&
    prev.onBlock === next.onBlock &&
    prev.onNote === next.onNote
  );
});
