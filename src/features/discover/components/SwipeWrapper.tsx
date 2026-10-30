import React, { useEffect } from "react";
import { Dimensions, StyleSheet } from "react-native";
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
  useAnimatedReaction,
} from "react-native-reanimated";
import type { SharedValue } from "react-native-reanimated";
import * as Haptics from "expo-haptics";
import SwipeCard from "@/features/discover/components/SwipeCard";
import type { AppMode } from "../modeTheme";
import { runFlameSweep } from "@/features/discover/flameSweep";
import uiBus, {
  // `cardChromeAnim` ARTIK OKUNMUYOR: tek kullanıcısı `unwindForExit`ti
  // (çıkış uçuşunda kromu oranlı geri sarmak) ve uçuşla birlikte kalktı.
  // Kanalı artık yalnız scroll konumu sürüyor (bkz. SwipeCard > krom devri),
  // çıkışta ise `resetCardExpandState` örtünün altında sıfırlıyor.
  cardExpandAnim,
  cardPullProgress,
  resetCardExpandState,
  FIRE_PULL_THRESHOLD,
} from "@/shared/services/uiBus";
import { DISCOVER_CARD_EXPAND_LIFT } from "@/features/discover/components/discoverHeaderMetrics";
import { photoPinchActive } from "@/shared/components/pinchZoom";
import { colors } from "@/shared/theme/colors";
import { useRenderCount } from "@/shared/debug/useRenderCount";
import type { NoteTarget, PotentialMatch } from "@/shared/types";

const { width, height } = Dimensions.get("window");

/**
 * Destenin ALTINDAKİ kartın üstüne serilen tülün alfası — kart jest başlamadan
 * ne kadar sönük duruyor.
 *
 * ESKİ OPAKLIĞIN TÜMLEYENİ (1 − 0.8), yani görüntü birebir aynı: tül sayfa
 * zemininin renginde (bkz. `underDimStyle`), kartın da altındaki tek şey o
 * zemin. Ata opaklığından tüle geçişin gerekçesi animatedStyle'da.
 */
const UNDER_CARD_DIM = 0.2;



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
const FADE_IN_DURATION = 100;

/*
 * ── KARTIN ÇIKIŞ UÇUŞU TAMAMEN KALDIRILDI (istek, 2026-10-13) ──────────────
 *
 * "Uçma animasyonunu yok et; kart tam alev ekrandayken değişsin ki user
 * değiştiğini görmesin." Yani beğen/geç artık FIRE'IN YOLUNUN AYNISI: kart
 * yerinde duruyor, alev alttan yukarı süpürüyor ve deste dalga ekranı tam
 * kapattığı karede ilerliyor (sözleşme: flameSweep).
 *
 * BUNLARLA BİRLİKTE DÜŞTÜLER (hepsi uçuşun parçasıydı):
 *   • `flyOut` — kartı EXIT_DISTANCE'a atan ve destenin devrini zamanlayan
 *     ortak yol; `exitHandoff` kanalı da onun saatiydi.
 *   • `EXIT_DURATION` (180) · `EXIT_DISTANCE` · `EXIT_OVERSHOOT` (1.35) ·
 *     `EXIT_HANDOFF_MS` (~65): kartın ekranı terk etmesi için gereken yol,
 *     onun 1.35 katı (devir anını eğrinin erkenine çekmek için) ve o devir
 *     anı. Devri artık alev söylüyor, hesaplanacak bir an yok.
 *   • `exitConfig` / `unwindForExit`: açık kartın oranlı geri sarımı. Kapanış
 *     artık ÖRTÜNÜN ALTINDA ve ANINDA (bkz. collapseUnderCover) — Fire'da
 *     olduğu gibi.
 *   • `OVERLAY_EXIT_FADE_MS` / `overlayFadeConfig` / `FADE_OUT_DURATION` /
 *     `fadeOutConfig`: rozetin ve buton kanalının çıkış sönümleri. Rozet
 *     artık sönmüyor — alev örtene kadar duruyor, kanalları da örtünün
 *     altında sıfırlanıyor.
 *   • `tx` (yatay sürükleme/uçuş kanalı) ve animatedStyle'daki `rotate`:
 *     kartı yana götüren ya da yatıran hiçbir yol kalmadı. KARTIN
 *     TRANSFORM'U ARTIK YALNIZ GİRİŞİN — kimliksel olmayan tek ata
 *     transform'u o (cam yüzeyler için önemli, bkz. memo: GlassView yaşam
 *     döngüsü).
 *   • `dragX` · `buttonDragX` prop'ları ve `SWIPE_THRESHOLD`: ilki alttaki
 *     kartın tülünün paydasıydı (sürükleme oranı), ikincisinin okuyucusu çok
 *     önce kalkmıştı. Tül artık yalnız GİRİŞ oranını okuyor.
 */

/**
 * Giriş kaymasının EĞİM TAVANI (derece) — kart düz değil ÇAPRAZ geliyor.
 *
 * Adı hâlâ "exit": sayı bir dönem sürüklemenin ve çıkış uçuşunun tavanıydı,
 * giriş de "reddedilen kartın yattığı açıdan düzelme" olsun diye ondan
 * türetiliyordu (bkz. CARD_ENTRY_TILT). Uçuş kalktı, geometri kaldı.
 */
const EXIT_TILT = 15;
const EXIT_TILT_RAD = (EXIT_TILT * Math.PI) / 180;

/**
 * Tam ekran ve EXIT_TILT kadar yatık bir kartın ekranı TAMAMEN terk etmesi
 * için gereken yatay yol — bugün tek müşterisi GİRİŞ (bkz.
 * CARD_ENTRY_DISTANCE): gelen kart tam bu kadar yandan başlıyor.
 *
 * Hesabın gerekçesi (çıkış uçuşu için yazıldı, geometri aynı):
 *
 * O sayı kart ekrandan KÜÇÜKKEN ve DÖNMEDEN uçuyormuş gibi davranıyordu. İkisi
 * de artık doğru değil: kart tam ekran (bkz. SwipeWrapper'ın başındaki not) ve
 * uçarken EXIT_TILT kadar yatıyor. Dönen bir dikdörtgenin yatay uzanımı
 * kendi genişliği değil `w·cosθ + h·sinθ` — 390×844'lük bir ekranda 15°'de
 * fazladan ~109 px, yani kart "yolun sonunda" hâlâ ekranın içinde kalıyordu.
 *
 * BELİRTİ (bunu arıyorsan): sağa kaydırmada ekranın SAĞ ALT köşesinde kartın
 * üçgen bir dilimi asılı kalıyor, animasyon bitince (deste ilerleyip kart
 * unmount olunca) bir anda siliniyor. "Ufak bir kart kalıntısı kalıyor, sonra
 * gidiyor" tarifi tam olarak bu: dönen kartın ARKADA KALAN alt köşesi.
 *
 * Hesap, dönme merkezi kartın ortası olduğu için yarı kenarlardan: kartın en
 * soldaki noktası `cx + tx − (w/2·cosθ + h/2·sinθ)` ve bunun ekran genişliğini
 * geçmesi gerekiyor. `EXIT_CLEARANCE` yuvarlama/alt piksel payı.
 */
const EXIT_CLEARANCE = 8;
const EXIT_CLEAR_DISTANCE =
  width / 2 +
  (width / 2) * Math.cos(EXIT_TILT_RAD) +
  (height / 2) * Math.sin(EXIT_TILT_RAD) +
  EXIT_CLEARANCE;

/**
 * Yeni ÜST kartın giriş yolu — kart bu kadar yandan başlayıp yerine kayıyor
 * (bkz. `entryX`).
 *
 * Çıkış uçuşu bir dönem bundan DAHA UZUN bir yol gidiyordu (EXIT_OVERSHOOT
 * 1.35) ve o fazlalık buraya hiç geçmedi: zamanlama içindi (deste kartın
 * ekrandan çıktığı anda ilerlesin diye), gelen kartta karşılığı yoktu —
 * oradan başlarsa girişin ilk üçte biri ekran dışında geçer, kart geç belirip
 * aceleyle yerine oturur. Uçuş da o zamanlama da artık yok (bkz. yukarıdaki
 * kaldırma notu); gelen kart tam ekranın kenarından başlıyor.
 *
 * DiscoverScreen bunu buradan okuyor — kaymayı o başlatıyor ama mesafenin
 * sahibi kart. İki yerde ayrı yazılsa biri oynatıldığında alttaki kartın
 * "giriş bitti" eşiği sessizce ayrışırdı.
 */
export const CARD_ENTRY_DISTANCE = EXIT_CLEAR_DISTANCE;

/**
 * Girişin DİKEY payı — kart yatay değil ÇAPRAZ geliyor: reddetme atışının geri
 * sarımı (istek). Yola oranlı türetiliyor, çünkü yol ekran genişliğinden
 * geliyor ve ikisi birlikte oynamalı.
 *
 * İŞARET POZİTİF = kart AŞAĞIDAN geliyor (sol-alt köşeden yukarı doğru
 * yerine oturuyor). Eksiye çevirmek onu üstten getirir; aşağısı seçildi çünkü
 * reddedilen kart aşağı-sola savruluyormuş gibi okunuyor.
 */
const CARD_ENTRY_RISE = CARD_ENTRY_DISTANCE * 0.22;

/**
 * Girişin EĞİMİ (derece). Giriş yolu da aynı açıdan hesaplanıyor (bkz.
 * EXIT_CLEAR_DISTANCE) — ayrı yazılsa biri oynatıldığında kart yolun
 * başında ekranın içinde kalırdı.
 */
const CARD_ENTRY_TILT = EXIT_TILT;
// ⚠️ Burada bir zamanlar `EXIT_DISTANCE_Y` (Fire'ın yukarı uçuşu) vardı ve
// KALDIRILDI (2026-10-06): Fire artık hiçbir dalda kartı fırlatmıyor — ne
// eşleşmeyen dalda (alev süpürmesi örtüyor) ne eşleşmeli dalda (kutlama
// MatchModal'ın). Bkz. runFire.

export type SwipeDirection = "left" | "right" | "up";

interface SwipeWrapperProps {
  profile: PotentialMatch;
  /**
   * Kart desteden düşüyor.
   *
   * ÜÇÜNCÜ PARAMETRE `matching` (2026-10-13): "bu çıkış EŞLEŞMEYLE bitecek,
   * yani kutlamayı MatchModal'ın perdesi yapacak." Kart burada alev
   * süpürmesini oynatmıyor ve ÖRTÜLMEDEN haber veriyor — desteyi perdenin
   * altına bırakma işi ekranın (bkz. DiscoverScreen > handleSwipe).
   *
   * Kararı burada verip geçiriyoruz, ekranda yeniden hesaplamıyoruz: iki taraf
   * aynı kestirimi (`willMatch`) ayrı anlarda okursa ayrışabiliyor — ekran
   * tarafı "beni beğenenler" kümesini kartın düşüşüyle AYNI karede buduyor.
   *
   * (Bir dönem burada `covered` vardı: "deste bu değişimi bir kutlamanın
   * altında yaptı" demekti ve tek işi yeni üst kartın giriş yayını atlatmaktı;
   * o yay kaldırılınca düştü.)
   */
  onSwipe: (
    direction: SwipeDirection,
    userId: string,
    matching?: boolean,
  ) => void;
  isTopCard: boolean;
  /*
   * DiscoverScreen'de yaşayan, kartlar arasında PAYLAŞILAN shared value'lar:
   * üst kart yazar, rozet okur.
   *
   * `dragX` ve `buttonDragX` KALDIRILDI (uçuşla birlikte, bkz. yukarıdaki
   * not): ilki alttaki kartın tülünün paydasıydı — tül artık yalnız GİRİŞ
   * oranını okuyor — ikincisinin okuyucusu (kaymayla ölçeklenen eski aksiyon
   * barı) çok önce kalkmıştı.
   */
  overlayDragX: SharedValue<number>;
  overlayOpacity: SharedValue<number>;
  /** 0 = yok, 1 = pass, 2 = like, 3 = fire (buton tetiklemesi). */
  programmaticSwipe: SharedValue<number>;
  onPass: () => void;
  onLike: () => void;
  onFire: () => void;
  /** Kartın modu — Fire/Spark rengi ve adı buradan (bkz. modeTheme). */
  mode?: AppMode;
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
  /*
   * `swipeQuotaExhausted` KALDIRILDI: tek okuyucusu sağa kaydırmanın kota
   * dalıydı (bkz. yatay jestin kaldırıldığı not). Beğeni kotası artık yalnız
   * beğen BUTONUNDA sınanıyor — orası toast'ı da açıyor, jest dalı
   * açmıyordu.
   */
  fireQuotaExhausted?: boolean;
  /*
   * `snapEntry` KALDIRILDI: tek işi yeni üst kartın 0.92→1 giriş yayını
   * atlatmaktı, o yay da kaldırıldı (gerekçesi ölçeğin silindiği yerde). Kart
   * artık HER YOLDA son boyunda doğuyor; atlatılacak bir animasyon yok.
   */
  /**
   * YENİ ÜST KARTIN GİRİŞ OFSETİ (px, ≤ 0) — DiscoverScreen sürüyor, YALNIZ ÜST
   * KART okuyor.
   *
   * Destenin KABINA değil karta veriliyor, bilerek: kabı kaydırmak (eski
   * `stackEntryX`) ekrandaki canlı kartı da götürüp arkasındaki sayfa zeminini
   * açıyor — açık temada tam ekran beyazlık. Yalnız gelen kart kayınca altındaki
   * kart yerinde duruyor ve gelen kart onun ÜSTÜNE biniyor.
   *
   * ALT KARTLAR DA OKUYOR ama konum için değil: giriş sürerken kendilerini ÜST
   * kart gibi (tam boy, sönüklük yok) çiziyorlar — bkz. `entering`.
   */
  entryX?: SharedValue<number>;
  superLikesRemaining: number | null;
  /** Kart altındaki moderasyon ikonları — VERİLMEZSE hiç çizilmez. */
  onReport?: (profile: PotentialMatch) => void;
  onBlock?: (profile: PotentialMatch) => void;
  /** Kapağın sağ alt kolonundaki "üç nokta" — seçenekler sheet'ini ekran açıyor. */
  onMenu?: (profile: PotentialMatch) => void;
  /** Not kutuları — VERİLMEZSE hiç çizilmez (bkz. SwipeCard.onNote). */
  onNote?: (profile: PotentialMatch, target: NoteTarget) => void;
  /**
   * Kapağın alt chrome'u ölçülüp yerine oturdu — iskeletin beklediği haber,
   * olduğu gibi karttan geçiyor (bkz. SwipeCard.onCoverReady).
   */
  onCoverReady?: () => void;
  /**
   * Bu kart REWIND YUVASINDA: ekranda değil, canlı kartın ardında yalnız
   * ölçülmek için duruyor (bkz. DiscoverScreen > rewindSlot). Ağır paneli
   * kurulmuyor — gerekçe SwipeCard > panelWarmup.
   */
  rewindSlot?: boolean;
}

function SwipeWrapper({
  profile,
  onSwipe,
  isTopCard,
  overlayDragX,
  overlayOpacity,
  programmaticSwipe,
  onPass,
  onLike,
  onFire,
  mode,
  willMatch,
  fireQuotaExhausted = false,
  entryX,
  superLikesRemaining,
  onReport,
  onBlock,
  onMenu,
  onNote,
  onCoverReady,
  rewindSlot = false,
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
  // `tx` (yatay sürükleme/uçuş kanalı) KALDIRILDI — gerekçesi uçuşun
  // kaldırıldığı notta. Kartı yana götüren hiçbir yol kalmadı; `ty` duruyor,
  // onu Fire çekişi sürüyor.
  const ty = useSharedValue(0);
  const scrollY = useSharedValue(0);
  // Scroll bitip rubber-band'in başladığı andaki translationY baseline'ı.
  // Sürekli gesture'da scroll → rubber-band geçişi yumuşak olsun diye.
  const dragOffsetY = useSharedValue(0);
  // `hasVibrated` (yatay eşiğin bir-kez haptic kapısı) yatay jestle birlikte
  // kaldırıldı — gerekçesi o jestin notunda.
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

  // `openPaywall` (uiBus > swipePaywall) yatay jestle birlikte kaldırıldı:
  // beğeni kotasının tek kapısı artık beğen butonu (bkz. DiscoverScreen >
  // handleLikeButton). Fire'ın kendi paywall'ı DURUYOR — o hâlâ bir jestten
  // tetiklenebiliyor.
  const openFirePaywall = () => {
    uiBus.emit("firePaywall", {});
  };

  /*
   * ── ÇIKIŞ AYARLARI VE UÇUŞ YOLU KALDIRILDI ───────────────────────────────
   *
   * `exitConfig` (180 ms ease-out-cubic) · `fadeOutConfig` (350 ms) ·
   * `overlayFadeConfig` (~120 ms) · `exitHandoff` kanalı · `flyOut` ·
   * `unwindForExit` buradaydı. Hepsi kartı yana atan ve destenin devrini
   * ZAMANLAYAN kurulumun parçasıydı; uçuş kalkınca (bkz. dosya başındaki
   * kaldırma notu) devri alev söylüyor, kapanışı da örtünün altında
   * `collapseUnderCover` yapıyor.
   *
   * `settleExpand` da (bırakışta "yarım kalanı tamamla" + momentum devri)
   * daha önce aynı yerde duruyordu ve aç/kapa durumuyla birlikte düşmüştü.
   */

  /**
   * ── KARTIN TEK ÇIKIŞ MODELİ: ÖRTÜ ALTINDA DEVİR (istek, 2026-10-13) ───────
   *
   * Geç · beğen · Fire — üçü de aynı yoldan (bkz. commitExit/runCoveredExit):
   * kart FIRLAMIYOR, yerinde kalıyor; kutlama ekranı alttan yukarı süpürüyor ve
   * deste dalga ekranı TAM KAPATTIĞINDA ilerliyor (sözleşme: flameSweep). Not
   * gönderimi ve geri al (bkz. DiscoverScreen > startRewindUnderCover) da aynı
   * modelde.
   *
   * "Tam alev ekrandayken değişsin ki user değiştiğini görmesin": beğen/geç
   * bir dönem kartı yana uçuruyor ve desteyi uçuşun 65. ms'sinde
   * ilerletiyordu — değişim göz önünde oluyordu. Fire'da ise kart bir dönem
   * 320 ms'de yukarı fırlıyordu: alev daha ekranın alt yarısındayken kart
   * çoktan gitmiş, yenisi açıkta belirmiş olurdu.
   *
   * AÇIK KART DA "yerinde" sayılıyor: panel kapanmadan alev onun üstünden
   * geçiyor, kapanış örtünün altında (bkz. collapseUnderCover).
   *
   * Bu ref örtme aboneliğini taşıyor — aynı anda İKİ çıkışın başlamasını da
   * engelliyor.
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
   *
   * ROZET DE BURADA SİLİNİYOR: beğen/geç'te büyük tik/X alev yükselirken kartın
   * üstünde duruyor (tek yön geri bildirimi) ve örtünün altında kayboluyor.
   * Sönümle kaldırılsaydı ya alevin içinde yarı saydam asılı kalır ya da
   * kullanıcı basışının onayını hiç görmezdi.
   */
  const collapseUnderCover = () => {
    resetCardExpandState();
    scrollY.value = 0;
    overlayDragX.value = 0;
    overlayOpacity.value = 1;
  };

  /**
   * Alevi başlat, deste onun ÖRTÜSÜ ALTINDA ilerlesin.
   *
   * `direction` doğrudan `onSwipe`a gidiyor — backend isteğini ve rewind
   * hedefini ekran ona göre seçiyor (bkz. DiscoverScreen > handleSwipe).
   *
   * ⚠️ EŞLEŞMEYLE BİTECEKSE SÜPÜRME YOK (bkz. flameSweep'teki kural):
   * MatchModal aynı ateşin perde hâliyle açılıyor, ikisi arka arkaya oynayınca
   * tek eylemden iki alev düşüyordu. Kural "up" için yazıldı ama beğeniye de
   * aynen uyuyor — ikisi de eşleşme yaratabiliyor. "left" (geç) hiç
   * eşleşmediği için her zaman süpürüyor.
   *
   * O DALDA DA DEĞİŞİM ÖRTÜ ALTINDA, ama örtüyü başka biri kuruyor: haber
   * `matching: true` ile desteye geçiyor ve deste MatchModal'ın perdesinin
   * ekranı kapladığı anı bekliyor (bkz. DiscoverScreen > handleSwipe ·
   * flameSweep > runMatchCurtain). Burada bekleyemiyoruz: perde ancak
   * beğeninin İSTEĞİ gidip eşleşme bildirimi döndükten sonra açılıyor, yani
   * `onSwipe` (isteği atan taraf) önce çağrılmak zorunda.
   */
  const runCoveredExit = (direction: SwipeDirection) => {
    if (flameCoverUnsub.current) return;
    if (direction !== "left" && willMatch?.(profile)) {
      // collapseUnderCover: açık panel burada animasyonla kapanmıyor, çünkü
      // kart bu karede desteden düşüyor — asıl iş expand shared value'larını
      // deste ilerlemeden ÖNCE sıfırlamak (yoksa yeni top kart donmuş bir
      // expand oranıyla doğuyor).
      collapseUnderCover();
      onSwipe(direction, profile.userId, true);
      return;
    }
    // `hold`: dalga, deste ilerleyip yeni kart EKRANA BOYANANA kadar ekranı
    // kapalı tutuyor (bkz. runFlameSweep > hold · DiscoverScreen >
    // tryReleaseFlame). Örtme anı değişime ~200 ms bırakıyordu ve o pay bazen
    // yetmiyordu: dalga, eski kart hâlâ boyalıyken çekiliyordu.
    flameCoverUnsub.current = runFlameSweep(
      () => {
        flameCoverUnsub.current = null;
        collapseUnderCover();
        onSwipe(direction, profile.userId);
      },
      { hold: true },
    );
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

  // Çıkış (geç · beğen · Fire) işlendi ve ÖRTME bekleniyor. Kart hâlâ ekranda
  // ve dokunulabilir duruyor — uçuş kalktığı için artık gözle de görünüyor;
  // bu bayrak o ~800 ms'de İKİNCİ bir karar alınmasını engelliyor (jest ve
  // buton tetiklemeleri). Aksi halde aynı profile art arda iki swipe
  // gidebilirdi.
  const exitPending = useSharedValue(false);

  // Worklet'ten okumak için mirror — runOnJS'siz quota check. BEĞENİ
  // kotasının aynası (`quotaExhaustedSV`) yatay jestle birlikte kaldırıldı:
  // onu okuyan tek dal sağa kaydırmaydı. Fire'ın aynası duruyor, çekiş jesti
  // hâlâ var.
  const fireExhaustedSV = useSharedValue(fireQuotaExhausted);
  useEffect(() => {
    fireExhaustedSV.value = fireQuotaExhausted;
  }, [fireQuotaExhausted, fireExhaustedSV]);

  useEffect(() => {
    if (isTopCard) {
      // Canlı kart artık bu: bekleyen bir Fire kilidi devralınmasın.
      exitPending.value = false;
      return;
    }
    // ── KART TEPEDEN DÜŞTÜ: ÜSTÜNDEKİ HER ARTIK SİLİNİYOR ───────────────────
    //
    // Deste yalnız ileri gitmiyor: rewind `currentIndex`i geri alıp o anki top
    // kartı ALT kart yapıyor, ve giden kart artık UNMOUNT DA EDİLMİYOR —
    // destenin en altındaki geri al yuvasında duruyor (bkz. DiscoverScreen >
    // slotProfile). Yani bu bileşen aynı kartla ikinci kez üste çıkabiliyor.
    //
    // `tx` SIFIRLAMASI BURADAN GİTTİ, kanalın kendisiyle birlikte: kartı
    // ekranın dışında bırakan bir uçuş yok (bkz. uçuşun kaldırıldığı not),
    // dolayısıyla geri al yuvasından üste çıkan kart artık hiçbir karede
    // ekran dışında doğmuyor. `ty` DURUYOR — Fire çekişi yarıda kalmış
    // olabilir.
    //
    // ANINDA VE GÖRÜNMEZ: sıfırlama ÜSTTEKİ kartın tam ekran opak gövdesinin
    // ardında oluyor. Ham atama koşan animasyonu da iptal ediyor.
    scrollY.value = 0;
    ty.value = 0;
  }, [isTopCard, scrollY, exitPending, ty]);
  /*
   * ── PAYLAŞILAN KANALLAR BURADA SIFIRLANMIYOR ──────────────────────────────
   *
   * `overlayDragX · overlayOpacity` bir zamanlar tam burada, kart üste geçer
   * geçmez sıfırlanıyordu. Deste kartın uçuşu bitince ilerlediği sürece
   * zararsızdı; uçuşun son dönemde deste 65 ms'de ilerliyordu ve sıfırlama
   * giden kartın çıkış kuyruğunun ortasına düşüp rozetin sönümünü kesiyordu.
   *
   * Artık sıfırlamanın yeri ÖRTÜNÜN ALTI (bkz. collapseUnderCover): deste
   * ilerlemeden bir an önce, alev ekranı tamamen kapatmışken. Hem rozet
   * basıştan örtmeye kadar ekranda duruyor hem de yeni kart temiz kanallarla
   * doğuyor.
   */

  /**
   * ÇIKIŞI ONAYLA — üç yönün (geç · beğen · Fire) tek kapısı.
   *
   * Kart yerine oturuyor: Fire çekişi varsa geri sarılıyor. Sonrası alevde:
   * değişimi runCoveredExit bekletiyor.
   *
   * ⚠️ AÇIK KART BURADA KAPANMIYOR (2026-09-04). Kutlama, kullanıcı butona
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
  const commitExit = (direction: SwipeDirection) => {
    "worklet";
    if (exitPending.value) return;
    exitPending.value = true;
    const cfg = { damping: 16, stiffness: 380, mass: 1 };
    ty.value = withSpring(0, cfg);
    fireProgress.value = withSpring(0);
    cardPullProgress.value = withSpring(0);
    runOnJS(runCoveredExit)(direction);
  };

  useAnimatedReaction(
    () => programmaticSwipe?.value,
    (value, previous) => {
      if (!isTopCard || value === 0 || value === previous) return;
      // Çıkış örtme bekliyor: buton tetiklemeleri yutulsun. Bayrağı
      // SIFIRLAMAK şart — non-zero kalırsa bir sonraki kart mount olduğunda
      // reaction'ın ilk çalışmasında (previous === undefined) tetiklenir ve
      // yeni kart kendiliğinden kayar.
      if (exitPending.value) {
        programmaticSwipe.value = 0;
        return;
      }

      /*
       * ROZET: tek hareket geri bildirimi.
       *
       * Kart artık kıpırdamıyor (uçuş kaldırıldı), yani "hangi yöne karar
       * verdim" sorusunu yalnız bu büyük tik/X cevaplıyor. Alev yükselirken
       * kartın üstünde DURUYOR ve örtünün altında siliniyor (bkz.
       * collapseUnderCover) — sönüm YOK: 350 ms'lik bir sönüm onu alevin
       * içinde yarı saydam bırakıyordu, 120 ms'lik eski (uçuşa ayarlı)
       * sönümde ise basışın onayı göz kırpması kadar sürüyordu.
       *
       * `opacity` ham atanıyor, animasyonla değil: dinlenme değeri 1 ve
       * rozetin görünürlüğünü `overlayDragX` belirliyor (bkz. SwipeOverlay).
       */
      if (value === 1) {
        overlayDragX.value = withTiming(-150, { duration: FADE_IN_DURATION });
        overlayOpacity.value = 1;
        commitExit("left");
        programmaticSwipe.value = 0;
      } else if (value === 2) {
        overlayDragX.value = withTiming(150, { duration: FADE_IN_DURATION });
        overlayOpacity.value = 1;
        commitExit("right");
        programmaticSwipe.value = 0;
      } else if (value === 3) {
        // Fire — rozet YOK (alevin kendisi o eylemin işareti).
        commitExit("up");
        programmaticSwipe.value = 0;
      }
    },
    [isTopCard],
  );

  /*
   * ── DESTENİN ÖLÇEK İPUCU (`scale`) KALDIRILDI ─────────────────────────────
   *
   * Burada bir `useDerivedValue` vardı: alt kart 0.92'de duruyor, jest
   * ilerledikçe (yatay swipe oranı ya da Fire çekişi, hangisi büyükse) 1'e
   * büyüyor; yeni üst kart ise 0.92'den `withSpring(1, {damping:20,
   * stiffness:100})` ile yerine oturuyordu. `snapEntry` prop'u o yayı
   * atlatıyordu (örtülü değişimlerde).
   *
   * TAM EKRAN KARTTA BU İPUCU BOZUK ÇALIŞIYOR: kart ekranın tamamı olduğu için
   * 0.92, dört kenarda sayfa zemininden birer şerit demek — "swipe'larken sağa
   * da sola da kartın ucu gözüküyor, ufak kalıyor ekranda" diye bildirildi.
   * Üstüne yay yarım saniye sürüyordu, yani kart swipe bittikten sonra da bir
   * süre küçük duruyor sonra yerine oturuyordu ("sonra gidiyor").
   *
   * Derinlik ipucu artık YALNIZ SÖNÜKLÜK (bkz. underDimStyle): tül kartın
   * kutusunu birebir kapladığı için hiçbir karede zemin sızdırmıyor, ve jestle
   * aynı oranı okuduğu için "arkadaki kart önden açılıyor" hissi duruyor.
   *
   * GERİ İSTENİRSE kartın KENDİSİNİ küçültme — pay kabuğun İÇİNE konmalı
   * (kart kenarlardan içeri çekilince aradan sayfa zemini değil kartın kendi
   * zemini görünür). `snapEntry` prop'u da bu yayla birlikte gitti; örtülü
   * değişimi anlatan `covered` bayrağı zincirin başında duruyor.
   */

  /**
   * Foto büyütme (pinch) başlayınca kartın ÇEKİŞİNİ iptal et.
   *
   * İki parmak birbirinden uzaklaşırken parmakların ORTAK hareketi pan için tek
   * parmaklı bir sürüklemeden ayırt edilemiyor: kart aşağı kayıyor, hatta Fire
   * eşiğini geçiyordu. Jest ilişkisi (blocksExternalGesture) yerine bayrak:
   * "önce pinch'in başarısız olmasını bekle" ilişkisi tek parmaklı çekişi de
   * geciktirir.
   *
   * YATAY KANALLAR BURADAN GİTTİ (`tx · dragX · buttonDragX`): pinch'in iptal
   * edebileceği tek sürükleme dikey olan. Rozet kanalı yine sıfırlanıyor —
   * ucu açık kalmasın.
   */
  const cancelDragForPinch = () => {
    "worklet";
    const cfg = { damping: 16, stiffness: 380, mass: 1 };
    overlayDragX.value = withSpring(0, cfg);
    overlayOpacity.value = 1;
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

  /**
   * ── YATAY SWIPE JESTİ KALDIRILDI (istek, 2026-10-13) ──────────────────────
   *
   * Kartı yana sürükleyip beğenme/geçme hareketi yok: karar artık YALNIZ
   * BUTONLARDAN veriliyor (kapağın sağ alt kolonundaki tik ve X, bkz.
   * SwipeCard) ve oradan da programmaticSwipe kanalıyla Fire'ın yoluna
   * giriyor — kart yerinde kalıyor, değişimi alev örtüyor (bkz. commitExit).
   *
   * Burada duran ve onunla birlikte DÜŞEN şeyler:
   *   • `Gesture.Pan()` + rubber-band (max 400, c 1.2) ve eşik kararı
   *     (SWIPE_THRESHOLD 85 ya da 2500 px/sn hız + 60 px yol).
   *   • Eşik geçilince patlayan `triggerHaptic` ve onun bir-kez-kapısı
   *     (`hasVibrated`).
   *   • Sağa kaydırmanın KOTA dalı: `quotaExhaustedSV` aynası + `openPaywall`
   *     (uiBus > swipePaywall). Kota kapısı artık tek yerde, beğen butonunda
   *     (bkz. DiscoverScreen > handleLikeButton) — oradaki yol toast'ı da
   *     açıyor, bu dalda yoktu.
   *   • Jest başında paylaşılan kanalların devralınması (`onBegin`): dragX ·
   *     overlayDragX · buttonDragX · overlayOpacity. İlk ikisi tamamen
   *     kalktı (bkz. uçuşun kaldırıldığı not), rozet kanallarını yazan tek
   *     taraf da programmatic dal.
   *
   * GERİ İSTENİRSE: jest `Gesture.Simultaneous` ile dikey pan'ın yanına
   * dönmeli ve `failOffsetY/activeOffsetX` payları birlikte ayarlanmalı —
   * ikisi aynı parmağı paylaşıyor.
   */

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
      if (exitPending.value) return;

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
      if (exitPending.value) return;
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
        commitExit("up");
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

  // Tek jest kaldı (bkz. yatay jestin kaldırıldığı not): aşağı çekişte Fire.
  // `Gesture.Simultaneous` sarmalayıcısı da onunla birlikte düştü — tek
  // elemanlı bir kompozisyon yalnız fazladan bir jest düğümü demekti.
  const composedGesture = verticalPan;

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
    // KARTIN YATAY KANALI (`tx`) VE ONA BAĞLI `rotate` KALKTI: sürükleme de
    // çıkış uçuşu da yok (bkz. uçuşun kaldırıldığı not). Geriye kalan tek
    // yatay hareket GİRİŞ — o da kendi eğimini `entryT`den türetiyor.
    //
    // Girişin tek sürücüsü `entryX` (px, ≤ 0). Dikey pay ve eğim ondan
    // TÜRETİLİYOR — ayrı kanallar olsaydı üçü farklı anlarda yerine oturur,
    // çapraz hareket kırılırdı.
    const entry = isTopCard && entryX ? entryX.value : 0;
    const entryT = Math.min(1, Math.abs(entry) / CARD_ENTRY_DISTANCE);

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
        // Giriş ofseti YALNIZ ÜST KARTTA — tek yatay sürücü bu.
        { translateX: entry },
        // ty: geçici çekiş payı (Fire peek'i).
        // İkinci terim kalıcı lift — açık kartta kutu bu kadar yukarıda.
        // Üçüncüsü GİRİŞİN DİKEY PAYI: kart yatay değil ÇAPRAZ geliyor, yani
        // reddetme atışının tersi (bkz. CARD_ENTRY_RISE).
        {
          translateY:
            ty.value -
            (isTopCard
              ? HEADER_COVER * Math.max(0, Math.min(1, cardExpandAnim.value))
              : 0) +
            entryT * CARD_ENTRY_RISE,
        },
        // Girişin EĞİMİ: aynı oranla açılıp kapanıyor ve işareti reddetme
        // atışıyla aynı (sola giden kart -15°'ye yatıyor) — kart o yatıklıktan
        // düzelerek yerine oturuyor, yani hareket atışın geri sarımı.
        {
          rotate: isTopCard ? `${-entryT * CARD_ENTRY_TILT}deg` : "0deg",
        },
        // ── ÖLÇEK KALDIRILDI (`scale`) ─────────────────────────────────────
        // Alt kart 0.92'de duruyor, yeni üst kart da 0.92→1 yayıyla büyüyordu
        // (destenin klasik derinlik ipucu). TAM EKRAN KARTTA BU BOZUK: kart
        // ekranın tamamı olduğu için 0.92, dört kenarda sayfa zemininden şerit
        // demek — "swipe'larken kartın ucu gözüküyor, ufak kalıyor" diye
        // bildirildi. Üstüne 0.92→1 yayı (damping 20 / stiffness 100) yarım
        // saniye sürüyordu: kart swipe bittikten sonra da küçük duruyor, sonra
        // yerine oturuyordu.
        //
        // Derinlik ipucu artık YALNIZ SÖNÜKLÜK (bkz. underDimStyle): tül kartın
        // kutusunu birebir kaplıyor, yani hiçbir karede zemin sızdırmıyor.
        // GERİ İSTENİRSE kartın kendisini küçültme — kabuğun İÇİNE pay koy
        // (kart kenarlardan içeri çekilirse zemin yerine kendi zemini görünür).
        // `as any`: RN'in transform tipi her elemanın TEK anahtarlı olmasını
        // istiyor, TS ise heterojen diziyi `{translateX; translateY?: undefined}`
        // birleşimi olarak çıkarıyor (undefined ≠ never). Ekranın kendi
        // FigureEightRadar'ında da aynı kaçış kullanılıyor. Props `any` iken
        // hata görünmüyordu, tipleme onu ortaya çıkardı — davranış aynı.
      ] as any,
      // ── ALT KARTIN SÖNÜKLÜĞÜ BURADA DEĞİL, ÜSTÜNE SERİLEN TÜLDE ──────────
      //
      // Burada `opacity: isTopCard ? 1 : interpolate(combined, [0,1], [0.8,1])`
      // vardı. KALDIRILDI, ÇÜNKÜ KARTIN ATASINDA ALFA = KARTIN İÇİNDEKİ
      // BLUR'LAR ÖLÜ: 1'in altında bir ata opaklığı iOS'ta alt ağacı offscreen
      // bir gruba alıyor ve `UIVisualEffectView` o karelerde efektini
      // çizmiyor. Kartın iki ucundaki gölge bantları (kapağın dibindeki metin
      // rampası ve tepedeki şerit — ikisi de scrim + BlurView) tam bu yüzden
      // alt karttayken yarım çiziliyor, kart üste geçip alfa 1 olunca BİR ANDA
      // tamamlanıyordu. Aynı kural camı da vuruyor (bkz. memo:
      // GlassView + alfa).
      //
      // Tül AYNI SAYIYI veriyor: altındaki tek şey sayfa zemini olduğu için
      // `colors.bg`yi 0.2 alfayla kartın ÜSTÜNE sermek, kartı 0.8 alfayla o
      // zeminin üstüne koymakla birebir aynı pikseli üretiyor — kartın
      // kırpılmayan köşelerinde bile (orada zemin zaten o renk).
      zIndex: isTopCard ? 10 : 1,
    };
  });

  /**
   * ALT KARTIN TÜLÜ — kartın ATASINDAKİ opaklığın yerini alan katman
   * (gerekçesi animatedStyle'da, opaklığın kaldırıldığı yerde).
   *
   * KARTIN ÇOCUĞU DEĞİL KARDEŞİ ve kartın ÜSTÜNDE: ata zincirine alfa
   * sokmadığı için kartın içindeki blur bantları ve cam yüzeyler alt karttayken
   * de normal çiziliyor — kart üste geçtiğinde gölgesi çoktan yerinde oluyor.
   *
   * Oran eski opaklığın tümleyeni (1 − 0.8). İki sürücü OR'lanıyor: Fire çekişi
   * ve gelen kartın giriş yolu — ikisinde de arkadaki kart önden açılıyor, yani
   * "0.8 → 1 zıplaması" olmuyor.
   *
   * YATAY SÜRÜKLEME TERİMİ KALKTI (`|dragX| / SWIPE_THRESHOLD`): o jest de
   * kartın yana uçuşu da yok (bkz. uçuşun kaldırıldığı not). Beğen/geç'te
   * arkadaki kart artık hiç açılmıyor — açılmasına gerek de yok, değişim
   * alevin altında oluyor ve kullanıcı o kareleri görmüyor.
   */
  const underDimStyle = useAnimatedStyle(() => {
    if (isTopCard) return { opacity: 0 };
    const combined = Math.min(
      1,
      Math.max(
        cardPullProgress.value,
        // GİRİŞ DE AÇIYOR: gelen kart yoldayken alttaki kart (yani bir önceki
        // üst kart) sönükleşmemiş olmalı — ekranda görünen o. Gelen kart
        // yaklaştıkça sönüklük geri geliyor ve tam örtüldüğü an tamamlanıyor.
        // Sert geçiş YOK, bilerek: gelen kartın yuvarlak köşelerinden alttaki
        // kart görünüyor, orada bir anda koyulaşma "arkadaki kart değişti" gibi
        // okunuyordu.
        entryX
          ? Math.min(1, Math.abs(entryX.value) / CARD_ENTRY_DISTANCE)
          : 0,
      ),
    );
    return {
      opacity: interpolate(
        combined,
        [0, 1],
        [UNDER_CARD_DIM, 0],
        Extrapolate.CLAMP,
      ),
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
          mode={mode}
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
          onCoverReady={onCoverReady}
          panelWarmup={!rewindSlot}
        />
        {/* Tül — KARTIN ÜSTÜNDE ve dokunma almıyor. Üst kartta opaklığı 0;
            yine de çiziliyor (koşulsuz) ki kart üste geçerken bir katman
            mount/unmount edilmesin — swap karesi destenin en dar yeri. */}
        <Animated.View
          pointerEvents="none"
          style={[
            StyleSheet.absoluteFill,
            { backgroundColor: colors.bg },
            underDimStyle,
          ]}
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
    prev.fireQuotaExhausted === next.fireQuotaExhausted &&
    prev.superLikesRemaining === next.superLikesRemaining &&
    prev.onSwipe === next.onSwipe &&
    prev.onPass === next.onPass &&
    prev.onLike === next.onLike &&
    prev.onFire === next.onFire &&
    prev.mode === next.mode &&
    prev.willMatch === next.willMatch &&
    prev.onReport === next.onReport &&
    prev.onBlock === next.onBlock &&
    prev.onNote === next.onNote &&
    prev.onCoverReady === next.onCoverReady &&
    prev.rewindSlot === next.rewindSlot
  );
});
