import React, { useEffect } from "react";
import { Dimensions, View } from "react-native";
import { GestureDetector, Gesture } from "react-native-gesture-handler";
import Animated, {
  cancelAnimation,
  Easing,
  useAnimatedRef,
  useSharedValue,
  useAnimatedStyle,
  withSpring,
  withTiming,
  runOnJS,
  interpolate,
  useAnimatedReaction,
} from "react-native-reanimated";
import type { SharedValue } from "react-native-reanimated";
import * as Haptics from "expo-haptics";
import SwipeCard from "@/features/discover/components/SwipeCard";
import type { AppMode } from "../modeTheme";
import { runFlameSweep } from "@/features/discover/flameSweep";
import { flyOutDurationMs, SWIPE_COOLDOWN_MS } from "@/features/discover/exitFlight";
import uiBus, {
  cardExpandAnim,
  cardPullProgress,
  discoverRailLift,
  discoverSwipeDemoX,
  discoverSwipeLockedUntil,
  flamePullPeek,
  resetCardExpandState,
  FIRE_PULL_THRESHOLD,
} from "@/shared/services/uiBus";
import { DISCOVER_CARD_EXPAND_LIFT } from "@/features/discover/components/discoverHeaderMetrics";
import { photoPinchActive } from "@/shared/components/pinchZoom";
import { useRenderCount } from "@/shared/debug/useRenderCount";
import type { NoteTarget, PotentialMatch } from "@/shared/types";

const { width, height } = Dimensions.get("window");

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

/**
 * Yatay kaydırmanın KARAR EŞİĞİ (px, görsel yol üzerinden ölçülüyor).
 *
 * 2026-10-13'te jestle birlikte kaldırılmıştı, 2026-11-04'te jestle birlikte
 * GERİ GELDİ — sayı eskisinin aynısı. Ham `translationX` değil rubber-band'den
 * geçmiş `tx` ile karşılaştırılıyor: kullanıcı kartın NEREYE gittiğini görüyor,
 * parmağının ne kadar yol aldığını değil (bkz. horizontalPan > onUpdate).
 *
 * Rozetin kendi eşiği AYRI (SwipeOverlay > SWIPE_THRESHOLD = 120): tik/X tam
 * doygunluğa karar eşiğinden biraz sonra varıyor, yani "kararı verdim" anı
 * rozetin en parlak hâliyle çakışmıyor — eşikteki haptic o farkı dolduruyor.
 */
const SWIPE_THRESHOLD = 85;

/** Çekişten vazgeçince alevin aşağı inişi. */
const FLAME_PEEK_RECEDE = { duration: 220 };

/** Keşif kartında sağa/sola sürükleme jesti (bkz. horizontalPan). */
const HORIZONTAL_SWIPE_ENABLED = true;

/*
 * ── ÇIKIŞIN İKİ MODELİ: UÇUŞ (beğen/geç) · ALEV (Fire) ─────────────────────
 *
 * Tarihçe üç adımda, çünkü üçü de aynı yerde yaşıyor:
 *
 * 1. 2026-10-13 — UÇUŞ TAMAMEN KALDIRILDI. "Uçma animasyonunu yok et; kart tam
 *    alev ekrandayken değişsin ki user değiştiğini görmesin." Dört eylem de
 *    (geç · beğen · Fire · not) Fire'ın yolundan gitmeye başladı: kart yerinde,
 *    alev süpürüyor, deste örtünün altında ilerliyor.
 * 2. 2026-11-04 — YATAY JEST GERİ GELDİ, uçuş gelmedi: `tx` · `rotate` ·
 *    `SWIPE_THRESHOLD` parmağı takip ediyor ama kart bırakıldığı yerde donup
 *    alevi bekliyordu.
 * 3. 2026-11-06 — UÇUŞ DA GERİ GELDİ, ama YALNIZ BEĞEN/GEÇ'TE (bkz. flyOut).
 *    Alev artık bir kutlama: kullanıcının bir şey HARCADIĞI eylemlerde
 *    (Fire/Spark · not) kalıyor. Geri al da alevsiz (bkz. DiscoverScreen >
 *    commitRewind).
 *
 * 4. 2026-11-06 (aynı gün, sonra) — UÇUŞ PARK EDİLDİ. "Like'ta da dislike'ta
 *    da alev banner'ı geri gelsin; uçuş silinmesin, comment'te dursun." Kod
 *    yorum satırı olarak duruyor (bkz. runCoveredExit · flyOut), geri alma
 *    tarifi: docs/superpowers/specs/2026-11-06-discover-exit-flight-PARKED.md
 *
 * 5. 2026-11-08 — UÇUŞ VE YATAY JEST YENİDEN AÇILDI. Cam buton kolonu kartın
 *    dışına, ekran katına taşındı (bkz. DiscoverActionRail).
 *
 * BUGÜNKÜ HÂL:
 *   • `left` / `right` → `flyOut`.
 *   • `up` → `runFlameSweep({ hold })`; eşleşme varsa MatchModal perdesi.
 *
 * UÇUŞLA BİRLİKTE GERİ GELMEYENLER (hepsi 2026-10-13'te düşmüştü, bilerek
 * dışarıda bırakıldı):
 *   • `exitHandoff` kanalı · `EXIT_HANDOFF_MS` (~65): destenin uçuş ORTASINDA
 *     ilerlemesi. Gerekçesi flyOut'ta — giden kart aynı karede yuvaya düşüp
 *     `tx` sıfırlanınca ekranın ortasına geri yapışıyordu.
 *   • `EXIT_OVERSHOOT` (1.35): yalnız o erken devir anı içindi.
 *   • `exitConfig` / `unwindForExit`: açık kartın oranlı geri sarımı. Kart
 *     olduğu gibi uçuyor, temizlik ekran dışında (bkz. resetAfterExit).
 *   • `FADE_OUT_DURATION` / `fadeOutConfig`: buton kanalının çıkış sönümü.
 *     Rozetin sönümü geri geldi ama tek sayıyla — uçuşun kendi süresi.
 *   • `dragX` · `buttonDragX` prop'ları: alttaki kartın tülü sürükleme oranını
 *     ROZET kanalından (`overlayDragX`) okuyor — onu zaten hem jest hem buton
 *     yolu yazıyor, ikinci bir kanal tutmanın karşılığı yok (bkz.
 *     underDimStyle).
 *
 * CAM YÜZEYLERİN BEDELİ DURUYOR: sürükleme ve uçuş boyunca kartın ata
 * transform'u kimliksel olmuyor, yani o karelerde içerideki GlassView'lar
 * efektlerini çizmeyebilir (bkz. memo: GlassView yaşam döngüsü). Giriş kayması
 * da aynı bedeli ödüyor.
 */

/**
 * Giriş kaymasının EĞİM TAVANI (derece) — kart düz değil ÇAPRAZ geliyor.
 *
 * Hem sürüklemenin/çıkış uçuşunun hem de girişin tavanı: giriş "reddedilen
 * kartın yattığı açıdan düzelme" olsun diye aynı sayıdan türüyor (bkz.
 * CARD_ENTRY_TILT).
 */
const EXIT_TILT = 15;
const EXIT_TILT_RAD = (EXIT_TILT * Math.PI) / 180;

/**
 * Tam ekran ve EXIT_TILT kadar yatık bir kartın ekranı TAMAMEN terk etmesi
 * için gereken yatay yol. İKİ MÜŞTERİSİ VAR: çıkış uçuşunun hedefi (bkz.
 * flyOut) ve girişin başlangıcı (bkz. CARD_ENTRY_DISTANCE) — gelen kart tam
 * bu kadar yandan başlıyor.
 *
 * Hesabın gerekçesi:
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

/**
 * ── ÖRTÜLÜ KARTIN RASTER SARMALAYICISI ──────────────────────────────────────
 *
 * `shouldRasterizeIOS`in iki zamanlama kuralı var ve ikisi de burada:
 *
 * 1. GECİKMELİ AÇILIŞ. Bayrak `covered` olur olmaz kalksaydı doku çizimleri
 *    alevin penceresine yığılırdı — o pencere zaten destenin en kalabalık anı:
 *    eski üst kart yuvaya düşüyor, paneli 700ms'de soğuyor (içerik değişimi =
 *    yeniden doku), yeni arka kart ısınma zinciriyle (foto · panel 240ms · cam
 *    remount 700ms) mount oluyor ve HER adım ayrı bir tam ekran rasterleştirme.
 *    Bekleme o zincirin tamamından uzun: kart sakinleşmeden doku çekilmiyor.
 *    O ana kadar örtülü kart canlı yoldan boyanıyor — scroll o pencerede değil.
 *
 * 2. GECİKMESİZ KAPANIŞ. Kart üste geçerken canlı render'a dönüş alevin
 *    örtüsü altında / giriş kayması sırasında olmalı, bir timer'ın arkasında
 *    değil.
 *
 * AYRI BİLEŞEN OLMASI OPTİMİZASYONUN KENDİSİ, taşıma kolaylığı değil: state
 * SwipeWrapper'ın gövdesindeyken her geçiş (`setState`) 6000 satırlık SwipeCard
 * ağacını baştan render ediyordu — biri tam devir karesinde (bayrağın inişi),
 * ikisi alev çıktıktan 1.5sn sonra (iki örtülü kartın timer'ı). Belirti "alev
 * girerken ve çıktıktan bir süre sonra JS kasıyor"du. Burada `children`
 * SwipeWrapper'ın render'ından geliyor ve bu bileşenin kendi state geçişinde
 * REFERANSI DEĞİŞMİYOR → React alt ağacı hiç render etmiyor; geçişin tek işi
 * View'ın prop güncellemesi. State'i tekrar yukarı taşıma.
 *
 * `collapsable={false}`: kabın tek görsel işi raster prop'u; Fabric onsuz
 * view'ı düzleştirip rasterize edilecek katmanı yok edebilir (bkz.
 * DiscoverScreen'deki zIndex sızıntısı notu — aynı tuzak ailesi).
 *
 * Android karşılığı (`renderToHardwareTextureAndroid`) BİLEREK yok: orada cam
 * yok, blur'lar 'none' (bkz. CardGlassBackdrop) — örtülü kart zaten ucuz,
 * doku belleği ise bedava değil.
 */
const RASTER_SETTLE_MS = 1500;

/**
 * ── 3. ALEVİN ALTINDA HEMEN (2026-11-06) ────────────────────────────────────
 *
 * Gecikmeli açılış alevli devirde dalganın ÇEKİLİŞİNE denk geliyordu: iki
 * örtülü kartın tam ekran rasterleştirmesi, alev ekranı terk ederken. Keşif
 * artık deste tamamen oturana kadar alevi parkta tutuyor (bkz. DiscoverScreen
 * > settleBehindFlame) ve oturduğu anda bu olayı yayınlıyor: zincir bitti,
 * örtülü kartlar ŞİMDİ dokuya alınabilir, alev hâlâ ekranı kaplıyor.
 *
 * Prop değil olay, bilerek: prop SwipeWrapper'ları (ve altlarındaki dev
 * SwipeCard'ı) yeniden render ettirirdi. Gecikmeli yol yedek olarak duruyor
 * (alevsiz devirler, olay gelmeyen dallar).
 */
export const DECK_RASTER_NOW_EVENT = "deckRasterNow";

function RasterizeWhenCovered({
  covered,
  children,
}: {
  covered: boolean;
  children: React.ReactNode;
}) {
  const [raster, setRaster] = React.useState(false);
  useEffect(() => {
    if (!covered) {
      setRaster(false);
      return;
    }
    const id = setTimeout(() => setRaster(true), RASTER_SETTLE_MS);
    const unsub = uiBus.on(DECK_RASTER_NOW_EVENT, () => setRaster(true));
    return () => {
      clearTimeout(id);
      unsub();
    };
  }, [covered]);
  return (
    <View collapsable={false} shouldRasterizeIOS={raster} style={{ flex: 1 }}>
      {children}
    </View>
  );
}
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
   * üst kart yazar, rozet VE alttaki kartın tülü okur.
   *
   * `dragX` ve `buttonDragX` KALDIRILDI (uçuşla birlikte, bkz. yukarıdaki
   * not) ve yatay jest geri gelince de DÖNMEDİLER: tülün paydası artık
   * `overlayDragX` (bkz. underDimStyle), ikincisinin okuyucusu (kaymayla
   * ölçeklenen eski aksiyon barı) çok önce kalkmıştı.
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
  /**
   * Beğeni kotası doldu — SAĞA KAYDIRMA burada bloklanıyor: kart yerine geri
   * yaylanıyor, istek atılmıyor, paywall açılıyor (bkz. horizontalPan > onEnd).
   *
   * Jestle birlikte kaldırılıp jestle birlikte geri geldi. O arada kotanın tek
   * kapısı beğen butonuydu (DiscoverScreen > handleLikeButton) ve O KAPI
   * DURUYOR — iki yol aynı toast'ı + aynı sheet'i açıyor, farkları yalnız
   * tetikleyici: buton doğrudan çağırıyor, jest `uiBus > swipePaywall`
   * üzerinden (worklet'ten JS'e tek atlayış).
   *
   * SOLA KAYDIRMA (geç) BLOKLANMIYOR: backend pass'i günlük kotaya saymıyor.
   */
  swipeQuotaExhausted?: boolean;
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
  /** Kart tamamen oturdu — bkz. SwipeCard.onSettled. */
  onSettled?: (userId: string) => void;
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
  swipeQuotaExhausted = false,
  fireQuotaExhausted = false,
  entryX,
  superLikesRemaining,
  onReport,
  onBlock,
  onMenu,
  onNote,
  onCoverReady,
  onSettled,
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
  /**
   * YATAY SÜRÜKLEME KANALI — kartın parmağı takip ettiği pay (px).
   *
   * Kartın GİTTİĞİ yol, parmağın gittiği yol değil: rubber-band'den geçmiş
   * değer burada duruyor ve eşik kararı da bunun üzerinden veriliyor (bkz.
   * horizontalPan).
   *
   * ÇIKIŞ KANALI DA: beğen/geç'te eşik geçilince aynı kanal kartı ekran dışına
   * götürüyor (bkz. flyOut) — sürükleme nerede bıraktıysa uçuş oradan devam
   * ediyor, arada geri yaylanma yok. Fire dalında ise değer bırakıldığı yerde
   * DONUYOR (alev onu örtene kadar kartın nerede bırakıldığı görünsün diye) ve
   * örtünün altında sıfırlanıyor.
   *
   * KARTA ÖZEL, paylaşılan değil: alttaki kart bu değeri okumuyor, tülünü
   * rozet kanalından sürüyor (bkz. underDimStyle).
   */
  const tx = useSharedValue(0);
  const ty = useSharedValue(0);
  const scrollY = useSharedValue(0);
  // Scroll bitip rubber-band'in başladığı andaki translationY baseline'ı.
  // Sürekli gesture'da scroll → rubber-band geçişi yumuşak olsun diye.
  const dragOffsetY = useSharedValue(0);
  // Yatay eşiğin bir-kez haptic kapısı: eşik GEÇİLDİĞİNDE bir kez patlıyor,
  // altına inilince yeniden kuruluyor (parmak eşiğin iki yanında gezinirken
  // titreşim makinesi olmasın). Jestle birlikte kaldırılıp jestle birlikte
  // geri geldi.
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

  // Yatay eşiğin haptic'i — hafif. Fire'ınki (Heavy) ondan BİLEREK ayrı: aynı
  // parmak iki farklı kararı veriyor, ikisi aynı şiddette olursa hangisinin
  // eşiğine varıldığı yalnız gözle anlaşılır.
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

  /**
   * ── SIFIRLAMANIN WORKLET AYNASI ───────────────────────────────────────────
   *
   * `resetSuperHaptics` bir ref'i 0'lıyor ve varsa bir timer'ı temizliyor —
   * yani SIFIRLANACAK BİR ŞEY YOKKEN çağırmanın tek etkisi `runOnJS`in kendi
   * maliyeti: UI thread'inden JS thread'ine bir atlama.
   *
   * O atlama aşağıda (verticalPan.onUpdate) HER PAN UPDATE'İNDE yapılıyordu ve
   * bedeli normal scroll'da ödeniyordu: jest `simultaneousWithExternalGesture`
   * ile native scroll'la birlikte koşuyor, yani parmak içeriği kaydırırken de
   * `onUpdate` her karede çalışıyor. Dalların üçü de (scroll modu · pull-up ·
   * yatay) koşulsuz `runOnJS` çağırıyordu — Fire'a dair hiçbir şey olmamasına
   * rağmen her kare JS thread'i uyandırılıyordu.
   *
   * Kalıp YATAY JESTTEN alındı, yeni değil: `hasVibrated` orada tam bunu yapıyor
   * — `runOnJS` yalnız eşik GEÇİŞİNDE, her karede değil.
   *
   * Bayrak yalnız gerçekten haptic döngüsü başlatıldığında kalkıyor
   * (`updateSuperHaptics`in çağrıldığı dal), sıfırlamada iniyor. Sıfırlama
   * idempotent olduğu için atlanan çağrıların davranışsal karşılığı yok.
   */
  const hapticArmed = useSharedValue(false);
  const disarmSuperHaptics = () => {
    "worklet";
    if (!hapticArmed.value) return;
    hapticArmed.value = false;
    runOnJS(resetSuperHaptics)();
  };

  // Expand/collapse'in haptic'i YOK: eşik kalkınca haber verilecek bir an da
  // kalmadı (bkz. yukarıdaki "EXPAND ARTIK EŞİKSİZ"). Fire'ın haptic'i
  // duruyor — o hâlâ eşikli bir karar.

  /**
   * Beğeni kotası dolu kartta sağa kaydırıldı.
   *
   * `swipePaywall` dinleyicisi DiscoverScreen'de duruyor (jest kaldırılmışken
   * de duruyordu — premium filtreler ve geri alma kotası da aynı event'i
   * kullanıyor) ve payload'suz emit'i bilerek "beğeni kotası" sayıyor: önce
   * "hakkın şu saatte yenilenecek" toast'ı, sonra sheet. Yani bu yolun
   * gördüğü şey beğen butonununkiyle birebir aynı.
   */
  const openPaywall = () => {
    uiBus.emit("swipePaywall", {});
  };

  const openFirePaywall = () => {
    uiBus.emit("firePaywall", {});
  };

  /*
   * ── ESKİ ÇIKIŞ AYARLARI ──────────────────────────────────────────────────
   *
   * `exitConfig` (180 ms ease-out-cubic) · `fadeOutConfig` (350 ms) ·
   * `overlayFadeConfig` (~120 ms) · `exitHandoff` kanalı · `flyOut` ·
   * `unwindForExit` buradaydı ve 2026-10-13'te hep birlikte kalktı. Uçuş
   * 2026-11-06'da geri geldi ama listenin TAMAMI değil: bugünkü `flyOut`
   * aşağıda, kendi süresini hızdan alıyor ve `exitHandoff`/`unwindForExit`
   * olmadan çalışıyor (gerekçeler dosya başındaki iki model notunda).
   *
   * `settleExpand` da (bırakışta "yarım kalanı tamamla" + momentum devri)
   * daha önce aynı yerde duruyordu ve aç/kapa durumuyla birlikte düşmüştü.
   */

  /**
   * ── FIRE'IN ÇIKIŞ MODELİ: ÖRTÜ ALTINDA DEVİR (istek, 2026-10-13) ──────────
   *
   * Kart FIRLAMIYOR, yerinde kalıyor; kutlama ekranı alttan yukarı süpürüyor ve
   * deste dalga ekranı TAM KAPATTIĞINDA ilerliyor (sözleşme: flameSweep). Not
   * gönderimi de aynı modelde (bkz. DiscoverScreen > handleSendNote).
   *
   * "Tam alev ekrandayken değişsin ki user değiştiğini görmesin": Fire bir
   * dönem kartı 320 ms'de yukarı fırlatıyordu — alev daha ekranın alt
   * yarısındayken kart çoktan gitmiş, yenisi açıkta belirmiş olurdu.
   *
   * ⚠️ BEĞEN/GEÇ ARTIK BU MODELDE DEĞİL (2026-11-06): onlar uçuyor (bkz.
   * flyOut). Model 13 Ekim'de dört eylemin ortak diliydi; bugün yalnız Fire'ın.
   *
   * AÇIK KART DA "yerinde" sayılıyor: panel kapanmadan alev onun üstünden
   * geçiyor, kapanış örtünün altında (bkz. resetAfterExit).
   *
   * Bu ref örtme aboneliğini taşıyor — aynı anda İKİ çıkışın başlamasını da
   * engelliyor.
   */
  const flameCoverUnsub = React.useRef<(() => void) | null>(null);

  /**
   * Kartı ANINDA sıfırla — yay yok, timing yok. İki çıkış modelinin ortak
   * temizliği, ama İKİ FARKLI GİZLENME ANINDA çağrılıyor:
   *   • Fire (alev modeli) — dalganın ekranı tam kapattığı karede. Panelin
   *     kapanışı da destenin ilerlemesi de aynı örtünün altında oluyor.
   *   • Beğen/geç (uçuş modeli) — kart ekran DIŞINA çıktığı karede
   *     (`keepTx`, aşağıda).
   * Animasyonla yapılsaydı ilk dalda dalga çekilirken kart hâlâ kapanıyor
   * olurdu.
   *
   * Modül seviyesindeki expand değerlerini (bkz. resetCardExpandState) deste
   * ilerlemeden ÖNCE sıfırlamak şart — `dropProfileFromDeck`taki sıranın aynısı:
   * yeni top kart donmuş bir expand oranıyla doğarsa ilk karesinde header'ın
   * üstüne binmiş, tab bar'a taşmış hâlde görünür.
   *
   * ROZET DE BURADA SİLİNİYOR: büyük tik/X karar anından gizlenme anına kadar
   * ekranda duruyor (tek yön geri bildirimi). Alev dalında örtünün altında
   * siliniyor; uçuş dalında rozet uçuşla birlikte sönüyor (bkz. flyOut) ve bu
   * satır yalnız kanalı dinlenme değerine döndürüyor.
   *
   * ⚠️ `overlayDragX`İN SIFIRLANMASI DESTE İLERLEMEDEN ÖNCE OLMALI: kanalı
   * alttaki kartın tülü okuyor (bkz. underDimStyle) ve doygun bırakılırsa yeni
   * ALT kart bir kare tam parlak doğup sonra sönükleşir. Çağıranların ikisi de
   * bu fonksiyonu `onSwipe`tan önce çağırıyor.
   *
   * `keepTx` — UÇUŞ DALININ TEK FARKI. Kart uçuşun sonunda ekran dışında ama
   * HÂLÂ ÜST KART: `setCurrentIndex` commit'lenene kadar `tx = 0` yazmak onu
   * en az bir kare ekranın ortasına geri getirir ("kart zınk diye merkeze
   * dönüp kayboluyor"). Sıfırlamayı destenin kendi devri yapıyor: kart yuvaya
   * düşer düşmez `!isTopCard` effect'i (aşağıda) `tx`i yeni üst kartın tam
   * ekran opak gövdesinin ardında siliyor.
   */
  const resetAfterExit = (opts?: { keepTx?: boolean }) => {
    resetCardExpandState();
    scrollY.value = 0;
    // Sürükleme payından ÖNCE: sıra tersi olursa kolon bir kare eski yerine sıçrar.
    discoverRailLift.value = 0;
    overlayDragX.value = 0;
    overlayOpacity.value = 1;
    // Alev dalında sürükleme payı burada siliniyor, rozetle aynı gerekçeyle:
    // kart eşiği geçtiği YERDE kalıyor (bırakışta geri yaylanmıyor — kullanıcı
    // kararının nereye düştüğünü görüyor) ve alev onu örtünce sıfırlanıyor.
    // Yaylanarak kapatılsaydı alev yükselirken kart arkada kıpırdıyor olurdu.
    if (!opts?.keepTx) tx.value = 0;
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
  const runCoveredExit = (direction: SwipeDirection, _velocityX = 0) => {
    // Beğen/geç kartı yana uçuruyor; alev yalnız Fire'da kalıyor.
    if (direction !== "up") {
      flyOut(direction, _velocityX);
      return;
    }
    if (flameCoverUnsub.current) return;
    // Buraya yalnız Fire geliyor: eşleşmeli beğeni uçuyor, perde arkadan açılıyor.
    if (willMatch?.(profile)) {
      // Kutlamayı perde yapıyor, çekiş alevi geri çekilsin.
      flamePullPeek.value = withTiming(0, FLAME_PEEK_RECEDE);
      // resetAfterExit: açık panel burada animasyonla kapanmıyor, çünkü
      // kart bu karede desteden düşüyor — asıl iş expand shared value'larını
      // deste ilerlemeden ÖNCE sıfırlamak (yoksa yeni top kart donmuş bir
      // expand oranıyla doğuyor).
      resetAfterExit();
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
        resetAfterExit();
        onSwipe(direction, profile.userId);
      },
      // Kartın modu dalgaya da geçiyor: Arkadaş'ta Spark yeşili, Flört'te ateş.
      // HAREKET aynı — değişen yalnız dolgu/kontur (bkz. runFlameSweep > mode).
      { hold: true, mode },
    );
  };

  /**
   * ── BEĞEN/GEÇ: KART YİNE YANA UÇUYOR (istek, 2026-11-06) ──────────────────
   *
   * "Alev banner'ı yalnız not veya Fire/Spark atınca çıksın; diğerlerinde sağa
   * sola swipe edince kart eskisi gibi sağa sola uçsun." Yani alev bir KUTLAMA
   * oldu, bir devir mekanizması değil: kullanıcının bir şey HARCADIĞI iki
   * eylemde (Fire/Spark · not) kalıyor, destede saniyede bir yapılan beğen/geç
   * ise kendi hareketine döndü.
   *
   * ⚠️ 2026-10-13'teki "değişim hiçbir dalda örtüsüz olmaz" kuralı BU DALDA
   * BİLEREK DELİNDİ. Kullanıcı gelen kartı görüyor — zaten görmesi isteniyor.
   * Kural Fire ve notta aynen duruyor.
   *
   * ESKİ UÇUŞ TAKIMI GERİ GELMEDİ, yalnız uçuşun kendisi geldi:
   *   • `EXIT_OVERSHOOT` (1.35) YOK. O fazlalık devri eğrinin erkenine çekmek
   *     içindi; devir artık uçuşun SONUNDA, çekilecek bir an yok.
   *   • `exitHandoff` kanalı ve "deste uçuşun 65. ms'sinde ilerler" YOK. Deste
   *     uçuşun ortasında ilerleseydi giden kart aynı karede geri al yuvasına
   *     düşer, `!isTopCard` effect'i `tx`i sıfırlar ve kart ekranın ortasına
   *     geri yapışırdı — eski kurgunun klasik belirtisi. Kart uçuş boyunca üst
   *     kart kalıyor.
   *   • `unwindForExit` YOK: kaydırılmış/açık kart olduğu gibi uçuyor,
   *     temizliği ekran dışındayken oluyor (bkz. resetAfterExit).
   *
   * ROZET UÇUŞLA BİRLİKTE SÖNÜYOR: büyük tik/X kartın içinde değil EKRAN
   * KATINDA (bkz. DiscoverScreen > SwipeOverlay), yani kartla gitmiyor.
   * Söndürülmeseydi kart ekrandan çıktıktan sonra ortada asılı kalırdı.
   *
   * Süre hızdan geliyor (bkz. exitFlight > flyOutDurationMs); eğim bedava —
   * `dragRotate` zaten `tx`ten türüyor, kart uçarken kendiliğinden EXIT_TILT'e
   * yatıyor (bkz. animatedStyle).
   */
  const flyOut = (direction: SwipeDirection, velocityX: number) => {
    const duration = flyOutDurationMs(velocityX);
    const target =
      direction === "right" ? EXIT_CLEAR_DISTANCE : -EXIT_CLEAR_DISTANCE;
    overlayOpacity.value = withTiming(0, { duration });
    tx.value = withTiming(
      target,
      { duration, easing: Easing.out(Easing.cubic) },
      (finished) => {
        // ⚠️ `finished` KAPISI: animasyon iptal edildiyse (kart örtme anından
        // önce ağaçtan düştü — deste tazelendi, sekme değişti, tema remount'u)
        // burada deste ilerletilmemeli; sökülmüş bir ağaçtan `onSwipe`
        // çağırmak desteyi sahipsiz bir kare ileri sürerdi.
        if (finished) runOnJS(finishFlight)(direction);
      },
    );
  };

  /**
   * Uçuş bitti: kart ekran dışında, temizlik ve devir aynı karede.
   *
   * SIRA ZORUNLU — önce sıfırlama, sonra `onSwipe`: `overlayDragX`in deste
   * ilerlemeden önce dinlenmeye dönmesi gerekiyor (gerekçe resetAfterExit'te).
   */
  const finishFlight = (direction: SwipeDirection) => {
    resetAfterExit({ keepTx: true });
    onSwipe(direction, profile.userId);
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

  // Çıkış işlendi, kart henüz desteden düşmedi: Fire'da örtme bekleniyor
  // (~800 ms, kart gözle görünür duruyor), beğen/geç'te uçuş sürüyor
  // (120-180 ms). Bu bayrak o pencerede İKİNCİ bir karar alınmasını engelliyor
  // (jest ve buton tetiklemeleri). Aksi halde aynı profile art arda iki swipe
  // gidebilirdi.
  const exitPending = useSharedValue(false);
  const dragBlocked = useSharedValue(false);
  const flamePeekAnnounced = useSharedValue(false);

  // Worklet'ten okumak için mirror — runOnJS'siz quota check. İkisi de jestin
  // `onEnd`inde okunuyor: beğeni kotası sağa kaydırmada, Fire kotası aşağı
  // çekişte.
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
      // Canlı kart artık bu: bekleyen bir Fire kilidi devralınmasın.
      exitPending.value = false;
      // Eşiğin haptic kapısı da yeni kartta kapalı doğmalı.
      hasVibrated.value = false;
      return;
    }
    // ── KART TEPEDEN DÜŞTÜ: ÜSTÜNDEKİ HER ARTIK SİLİNİYOR ───────────────────
    //
    // Deste yalnız ileri gitmiyor: rewind `currentIndex`i geri alıp o anki top
    // kartı ALT kart yapıyor, ve giden kart artık UNMOUNT DA EDİLMİYOR —
    // destenin en altındaki geri al yuvasında duruyor (bkz. DiscoverScreen >
    // slotProfile). Yani bu bileşen aynı kartla ikinci kez üste çıkabiliyor.
    //
    // `tx` SIFIRLAMASI GERİ GELDİ (jestle birlikte) ama GEREKÇESİ DEĞİŞTİ:
    // eskiden kartı ekran dışında bırakan uçuşu temizliyordu, bugün yarıda
    // kalmış bir SÜRÜKLEMEYİ. Kart yana uçmuyor (bkz. uçuşun kaldırıldığı
    // not), ama geri al yuvasından üste çıkan kart kaydırılmış hâlde donmuş
    // olabilir. `ty` aynı sebeple duruyor — Fire çekişi yarıda kalmış olabilir.
    //
    // ANINDA VE GÖRÜNMEZ: sıfırlama ÜSTTEKİ kartın tam ekran opak gövdesinin
    // ardında oluyor. Ham atama koşan animasyonu da iptal ediyor.
    scrollY.value = 0;
    ty.value = 0;
    tx.value = 0;
    hasVibrated.value = false;
  }, [isTopCard, scrollY, exitPending, ty, tx, hasVibrated]);
  /*
   * ── PAYLAŞILAN KANALLAR BURADA SIFIRLANMIYOR ──────────────────────────────
   *
   * `overlayDragX · overlayOpacity` bir zamanlar tam burada, kart üste geçer
   * geçmez sıfırlanıyordu. Deste kartın uçuşu bitince ilerlediği sürece
   * zararsızdı; uçuşun son dönemde deste 65 ms'de ilerliyordu ve sıfırlama
   * giden kartın çıkış kuyruğunun ortasına düşüp rozetin sönümünü kesiyordu.
   *
   * Artık sıfırlamanın yeri ÖRTÜNÜN ALTI (bkz. resetAfterExit): deste
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
   * kareye — bırakılıyor (bkz. resetAfterExit). Önceden burada 300 ms'lik
   * bir timing vardı ve sıra tersti: kart önce kapanıyor, kutlama ancak ondan
   * sonra görünüyordu; tek bir tap iki ayrı harekete bölünüyordu.
   *
   * Yarı açık kart (card mode'da yukarı çekilmiş ama açılmamış) yine geri
   * sarılıyor: orada saklanacak bir panel yok, kalan oran alevin altında
   * donmasın.
   */
  const commitExit = (direction: SwipeDirection, velocityX = 0) => {
    "worklet";
    if (exitPending.value) return;
    exitPending.value = true;
    // Art arda swipe'ı kesen süre; bir sonraki kartın jesti buna bakıyor.
    discoverSwipeLockedUntil.value = Date.now() + SWIPE_COOLDOWN_MS;
    const cfg = { damping: 16, stiffness: 380, mass: 1 };
    ty.value = withSpring(0, cfg);
    fireProgress.value = withSpring(0);
    cardPullProgress.value = withSpring(0);
    // `velocityX` yalnız JEST yolunda dolu (bkz. horizontalPan > onEnd): uçuşun
    // süresi oradan geliyor. Buton yolunda hız diye bir şey yok, varsayılan 0
    // en uzun uçuşu seçiyor (bkz. exitFlight > flyOutDurationMs).
    runOnJS(runCoveredExit)(direction, velocityX);
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
       * ROZET: buton yolunun TEK yön geri bildirimi.
       *
       * Jestte kartın kendi hareketi de "hangi yöne karar verdim" diyor, ama
       * butona basıldığında ondan önce hiçbir şey olmuyor — tik/X o boşluğu
       * dolduruyor ve kart uçarken onunla birlikte sönüyor (bkz. flyOut).
       * Fire dalında sönüm YOK: rozet alev yükselirken duruyor ve örtünün
       * altında siliniyor (bkz. resetAfterExit) — 350 ms'lik bir sönüm onu
       * alevin içinde yarı saydam bırakıyordu.
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
   * `tx` BURAYA GERİ DÖNDÜ (yatay jestle birlikte): pinch'in iptal edebileceği
   * sürükleme yine iki yönlü. `dragX · buttonDragX` dönmedi — o kanallar hiç
   * geri gelmedi (bkz. prop'ların notu).
   *
   * BURADA YAYLANARAK sıfırlanıyor, `resetAfterExit`daki gibi ham atamayla
   * değil: bu bir KARAR DEĞİL, iptal — kartın yerine geri oturduğunun
   * görünmesi gerekiyor.
   *
   * ⚠️ KARAR VERİLDİKTEN SONRA İPTAL YOK (`exitPending`). Jestin `onUpdate` ve
   * `onEnd` dalları bu bayrağı zaten okuyor, ama pinch reaction'ı PARMAKTAN
   * BAĞIMSIZ tetikleniyor — kart uçarken (120-180 ms) başlayan bir pinch
   * buraya düşüp `tx`e yay yazardı. Sonucu KALICI BİR KİLİT olurdu: ham atama
   * uçuşu iptal eder, `withTiming` callback'i `finished: false` ile gelir
   * (bkz. flyOut), yani `onSwipe` hiç çağrılmaz — kart ekranın ortasına geri
   * döner, `exitPending` de o kart için bir daha inmez. Ne jest ne buton
   * çalışır; kullanıcı o karta kilitlenir.
   */
  const recedeFlamePeek = () => {
    "worklet";
    flamePeekAnnounced.value = false;
    flamePullPeek.value = withTiming(0, FLAME_PEEK_RECEDE);
  };
  const clearFlamePeek = () => {
    "worklet";
    flamePeekAnnounced.value = false;
    flamePullPeek.value = 0;
  };
  const announceFlamePull = () => uiBus.emit("flamePull", { mode });

  const cancelDragForPinch = () => {
    "worklet";
    if (exitPending.value) return;
    const cfg = { damping: 16, stiffness: 380, mass: 1 };
    tx.value = withSpring(0, cfg);
    overlayDragX.value = withSpring(0, cfg);
    overlayOpacity.value = 1;
    hasVibrated.value = false;
    ty.value = withSpring(0, cfg);
    fireProgress.value = withSpring(0);
    cardPullProgress.value = withSpring(0);
    recedeFlamePeek();
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
   * ── YATAY SWIPE JESTİ GERİ GELDİ (istek, 2026-11-04) ──────────────────────
   *
   * 2026-10-13'te kaldırılmıştı (karar yalnız kapağın sağ alt kolonundaki tik
   * ve X'te kalmıştı); jestin kendisi bugün geri döndü. Parmak kartı yana
   * sürüklüyor, kart eğiliyor, büyük tik/X rozeti doluyor ve eşikte haptic
   * patlıyor — yani 13 Ekim öncesinin HİSSİ birebir.
   *
   * ÇIKIŞ MODELİ DE ESKİYE DÖNDÜ (2026-11-06): bırakışta kart ekranın dışına
   * uçuyor. Karar yine butonlarınkiyle AYNI kapıdan — `commitExit` — geçiyor;
   * tek fark jestin BIRAKIŞ HIZINI da geçirmesi (bkz. flyOut). Kart eşiği
   * geçtikten sonra geri yaylanMIYOR: hareket kesintisiz, parmağın bıraktığı
   * yerden uçuşa devam ediyor.
   *
   * ⚠️ Fire (aşağı çekiş) bu modelde DEĞİL: orada kart yerinde kalıyor ve
   * değişimi alev örtüyor. "Değişim hiçbir dalda örtüsüz olmaz" kuralı artık
   * yalnız Fire ve not için geçerli.
   *
   * DİKEY JESTLE AYNI PARMAĞI PAYLAŞIYORLAR: ikisi `Gesture.Simultaneous`
   * altında ve payları birlikte ayarlı — yatay `failOffsetY([-15,15])` ile
   * dikey niyette çekiliyor, dikey `failOffsetX([-20,20])` ile yatayda. Birini
   * oynatan ötekine bakmak zorunda; aksi halde ya kart çapraz parmakta
   * titriyor ya da Fire çekişi hiç aktive olmuyor.
   */
  const horizontalPan = Gesture.Pan()
    .enabled(HORIZONTAL_SWIPE_ENABLED && isTopCard)
    .activeOffsetX([-10, 10])
    .failOffsetY([-15, 15])
    .onStart(() => {
      // Karar jestin başında: bekleme ortasında biterse kart zıplamasın.
      dragBlocked.value = Date.now() < discoverSwipeLockedUntil.value;
    })
    .onUpdate((event) => {
      if (dragBlocked.value) return;
      // Foto büyütülüyor → kart kıpırdamasın (bkz. cancelDragForPinch).
      if (photoPinchActive.value) return;
      // Karar verildi, alevin örtmesi bekleniyor: kart artık kilitli.
      if (exitPending.value) return;

      // Asimptotik rubber-band — "orta zorlanma": max=400, c=1.2 → 200 px
      // parmak yolunda kart ~150 px gidiyor (eşiğin epey üstü), 400 px'te
      // ~240 px. Asimptot 400 olduğu için sert çekişte kart hâlâ kıpırdıyor
      // ama duvara dayanmış gibi değil.
      const delta = event.translationX;
      const absDelta = Math.abs(delta);
      const max = 400;
      const c = 1.2;
      const damped = (absDelta * max * c) / (max + c * absDelta);
      const signed = delta < 0 ? -damped : damped;
      tx.value = signed;
      // Rozet kartın GİTTİĞİ yolu okuyor (parmağınkini değil) — kart ile tik/X
      // aynı anda doluyor. Aynı kanalı alttaki kartın tülü de okuyor.
      overlayDragX.value = signed;

      // Haptic görsel yol üzerinden: kart eşiği GÖZLE geçtiğinde patlasın.
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
      if (dragBlocked.value) return;
      if (exitPending.value) return;
      // Parmaklar kalktı ama büyütme kapanışı sürüyor: bu jest pinch'in
      // parçasıydı, swipe olarak yorumlanmamalı.
      if (photoPinchActive.value) {
        cancelDragForPinch();
        return;
      }

      // İki kapı: YOL (85 px) ya da HIZ (2500 px/sn + en az 60 px yol). Hız
      // dalı olmadan hızlı/kısa fiskeler yutuluyordu.
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

      // Spring'ler burada tek yerde: eşik geçilemeyen bırakış ve kota bloğu
      // aynı fizikle geri dönüyor (Fire'ın geri sarımıyla da aynı).
      const cfg = { damping: 16, stiffness: 380, mass: 1 };

      // Beğeni kotası bitti: sağa kaydırma GERÇEKLEŞMİŞ olsa bile kart yerine
      // dönsün, istek atılmasın, paywall açılsın. Sola kaydırma (geç) backend'de
      // kotaya sayılmadığı için burada da bloklanmıyor.
      // KOTA DIŞINDA KİLİT YOK: profil keşif havuzunda görünmese bile backend
      // like/pass/Fire'ı kabul ediyor (rehber §3), istemci kendi kuralını
      // uydurmuyor.
      if (goRight && quotaExhaustedSV.value) {
        tx.value = withSpring(0, cfg);
        overlayDragX.value = withSpring(0, cfg);
        overlayOpacity.value = 1;
        runOnJS(openPaywall)();
        return;
      }

      if (goRight || goLeft) {
        // Rozet tam doygunluğa tamamlanıyor (buton yolundaki değerin aynısı):
        // karar kilitlendi, alev yükselirken tik/X eşikteki yarım hâlinde
        // asılı kalmasın. Kart ise OLDUĞU YERDE kalıyor — `tx`e dokunmuyoruz.
        overlayDragX.value = withTiming(goRight ? 150 : -150, {
          duration: FADE_IN_DURATION,
        });
        overlayOpacity.value = 1;
        // Hız uçuşa geçiyor: sert fiskede kart daha çabuk çıkıyor (bkz.
        // exitFlight > flyOutDurationMs).
        commitExit(goRight ? "right" : "left", event.velocityX);
        return;
      }

      // Eşik geçilemedi — kart ve rozet yaylanarak yerine dönüyor.
      tx.value = withSpring(0, cfg);
      overlayDragX.value = withSpring(0, cfg);
      overlayOpacity.value = 1;
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
      if (exitPending.value) return;

      // CARD MODE
      if (scrollY.value > 0) {
        dragOffsetY.value = event.translationY;
        ty.value = 0;
        fireProgress.value = 0;
        cardPullProgress.value = 0;
        clearFlamePeek();
        disarmSuperHaptics();
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
        flamePullPeek.value = progress;
        if (progress > 0 && !flamePeekAnnounced.value) {
          flamePeekAnnounced.value = true;
          runOnJS(announceFlamePull)();
        }
        // KROM KANALINA BURADA DOKUNULMUYOR. Eskiden 0'a yazılıyordu (aynı
        // jestte önce yukarı çekilip kart kısmen açılmış olabiliyordu); açılış
        // diye bir şey kalmadı. Yazmak artık düzeltmiyor, YALNIZCA KIRIYOR:
        // ham sayı atamak çalışan animasyonu iptal ediyor, yani scroll'un
        // sürdüğü krom devri kesilip isim/pill bloğu geri sıçrıyor.
        if (progress >= 1 && !fireReady.value) {
          fireReady.value = true;
          disarmSuperHaptics();
          runOnJS(triggerFireHaptic)();
        } else if (progress < 1) {
          if (fireReady.value) fireReady.value = false;
          // Threshold'a kadar artan sıklıkta haptic (JS loop'u kendini zamanlar).
          // AYNAYI BURADA KALDIRIYORUZ: döngüyü başlatan tek dal bu, yani
          // sıfırlamanın gerçekten iş yapacağı tek hâl de buradan doğuyor.
          hapticArmed.value = true;
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
        clearFlamePeek();
        fireReady.value = false;
        disarmSuperHaptics();
      } else {
        // delta tam 0 — parmak yatay gidiyor. Fire artıkları temizleniyor;
        // krom kanalına DOKUNULMUYOR (gerekçe bir üstteki dalda).
        ty.value = 0;
        fireProgress.value = 0;
        cardPullProgress.value = 0;
        clearFlamePeek();
        disarmSuperHaptics();
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
      // Karar verildiyse alev dalgaya devrediliyor; değilse geri çekiliyor.
      if (!exitPending.value) recedeFlamePeek();
    });

  // İki jest aynı parmağı paylaşıyor (yatay karar · aşağı çekişte Fire), o
  // yüzden `Simultaneous`: biri ötekinin başarısız olmasını BEKLEMİYOR, ikisi
  // birden dinliyor ve hangisinin konuşacağını `activeOffset/failOffset`
  // payları seçiyor (bkz. horizontalPan'in notu).
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
    // İKİ AYRI YATAY HAREKET, AYNI EKSENDE TOPLANIYOR:
    //   • `tx` — parmağın sürüklemesi (bkz. horizontalPan). Yalnız üst kartta
    //     yazılıyor ve ÇIKIŞ DEĞİL: kart bununla ekranı terk etmiyor.
    //   • `entryX` — yeni üst kartın giriş kayması (px, ≤ 0), DiscoverScreen
    //     sürüyor.
    // Pratikte ikisi aynı anda olmuyor (giriş biterken jest henüz başlamıyor),
    // ama toplanmaları şart: giriş yarıdayken parmak değerse kart kendi
    // yolundan devam etsin, sıfırdan başlamasın.
    //
    // Girişin dikey payı ve eğimi `entryX`ten TÜRETİLİYOR — ayrı kanallar
    // olsaydı üçü farklı anlarda yerine oturur, çapraz hareket kırılırdı.
    const entry = isTopCard && entryX ? entryX.value : 0;
    const entryT = Math.min(1, Math.abs(entry) / CARD_ENTRY_DISTANCE);
    // Sürüklemenin EĞİMİ: ekran genişliğinde EXIT_TILT'e varan doğrusal
    // yatma — kart parmağın altında yana "deviriliyor". Girişin eğimiyle aynı
    // tavanı paylaşıyor, çünkü ikisi de aynı hareketin iki ucu.
    const dragRotate = isTopCard
      ? interpolate(
          tx.value + discoverSwipeDemoX.value,
          [-width, 0, width],
          [-EXIT_TILT, 0, EXIT_TILT],
        )
      : 0;

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
        // Sürükleme + giriş ofseti; ikisi de YALNIZ ÜST KARTTA yazılıyor.
        // Dördüncü terim alt kartın karşı salınımı (üst kartta yay 0'da).
        {
          translateX:
            entry + (isTopCard ? tx.value + discoverSwipeDemoX.value : 0),
        },
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
        // İKİ EĞİM TOPLANIYOR (translateX'teki toplamın karşılığı):
        //   • Sürüklemenin eğimi — kart parmağın altında yana deviriliyor.
        //   • Girişin eğimi: aynı oranla açılıp kapanıyor ve işareti reddetme
        //     atışıyla aynı (sola giden kart -15°'ye yatıyor) — kart o
        //     yatıklıktan düzelerek yerine oturuyor, yani hareket atışın geri
        //     sarımı.
        {
          rotate: isTopCard
            ? `${dragRotate - entryT * CARD_ENTRY_TILT}deg`
            : "0deg",
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
        {/* ── ÖRTÜLÜ KART TEK DOKUYA RASTERİZE EDİLİYOR ──────────────────────
            Keşif'te scroll "60fps'te ama takılıyor"du ve CPU tarafı temizdi
            (kare aralıkları 17ms tavanında, kasma anında bile). Kaynak GPU:
            deste 3 kart mount ediyor ve HER kart, görünmese de, kare başına
            kompozit edilen pahalı katmanlar taşıyor — kapağın tamamını saran
            erime maskesi + dipteki maskeli progressive-blur rampası (maske =
            her kare tam ekran offscreen geçiş) + blur/cam yüzeyler. 3 kart ×
            2 maske 60Hz telefonda scroll'un kendi yüküyle birleşince kare
            ekrana geç yetişiyordu. Teşhis kaydı: deste teke indirilince
            kasma tamamen kayboldu; zemin BlurView'ını söküp maskeleri
            bırakmak ise değiştirmedi.

            Çare katmanları örtülü kartta SÖKMEK DEĞİL (ısınma mimarisi onları
            bilerek erken kuruyor: panel warmup, camın ilk-layout kuralı,
            rewind yuvası — bkz. SwipeCard > profileReady), kompozisyonu
            önbelleklemek: `shouldRasterizeIOS` örtülü kartı BİR KEZ dokuya
            çizdiriyor, sonraki her kare o dokuyu tek quad olarak basıyor.
            İçerik değişince (foto geldi, panel kuruldu) doku kendiliğinden
            tazeleniyor — bu olay bazlı, kare bazlı değil. Bayrağın ZAMANLAMASI
            sarmalayıcının kendisinde (RasterizeWhenCovered — gecikmeli açılış,
            gecikmesiz kapanış, ve state'in orada tutulma sebebi).

            TÜL (underDim) BU KABIN BİLEREK DIŞINDA: opaklığı swipe boyunca
            her kare değişiyor; içeride kalsaydı her karesi tam ekran yeniden
            rasterleştirme olurdu — kazancın tam tersi. */}
        <RasterizeWhenCovered covered={!isTopCard}>
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
            onSettled={onSettled}
            panelWarmup={!rewindSlot}
          />
        </RasterizeWhenCovered>
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
    prev.onSettled === next.onSettled &&
    prev.rewindSlot === next.rewindSlot
  );
});
