import { memo, useEffect, useMemo } from "react";
import { View } from "react-native";
import {
  Easing,
  cancelAnimation,
  useDerivedValue,
  useReducedMotion,
  useSharedValue,
  withRepeat,
  withTiming,
} from "react-native-reanimated";
import {
  BlurMask,
  Canvas,
  Path as SkiaPath,
  Skia,
  SweepGradient,
  vec,
} from "@shopify/react-native-skia";
import { Image } from "expo-image";
import AnimatedPressable from "@/shared/components/AnimatedPressable";
import { Plus } from "@/shared/icons";
import { colors, withAlpha, type Gradient } from "@/shared/theme/colors";
import { CampusOutlinedBox } from "@/features/campus/components/CampusInfoBox";
import { filterLiveMoments } from "@/features/campus/campusQueries";
import type { CampusMomentDto } from "@/features/campus/campusTypes";

/**
 * KAMPÜS ANLARININ BAŞLIK SATIRINDAKİ ÜÇLÜ DESTESİ.
 *
 * Akış başlığının (başlık + açıklama) SAĞ UCUNDA, o bloğun dikey ortasında:
 * önde son anın fotoğrafı, arkasında %20'si görünen iki kare daha (2. ve 3.
 * an). Tamamı tek bir dokunma hedefi ve tam ekran kampüs haritasını açıyor.
 *
 * ── NEYİN YERİNE GELDİ ─────────────────────────────────────────────────────
 * Akışta pill'lerin altında 120pt'lik bir BANT vardı: solunda kampüs poligonu,
 * sağında anların süzülen küçük kareleri, tamamı tam ekranı açan bir buton; ve
 * ikinci bir giriş olarak listeyi yukarıdan aşağı ÇEKMEK. Üçü birden kaldırıldı
 * (istek): gönderiler artık doğrudan pill'lerin altında başlıyor, çekme jesti
 * yenilemeye geri döndü, haritanın tek girişi bu deste oldu.
 *
 * ⚠️ HARİTA ZEMİNİ KALDIRILMADI — yalnız AÇIKTA KALAN BANDI kalktı. Katman
 * listenin arkasında duruyor ve kartların aralarından görünmeye devam ediyor
 * (bkz. FeedMapStrip'in başı).
 *
 * ── Üç kare, üç durum ──────────────────────────────────────────────────────
 *   • 3+ an      → üç fotoğraf
 *   • 1–2 an     → olmayanların yerinde AÇIK GRİ dolgu (kutunun kendi zemini)
 *   • hiç an yok → öndeki kare de gri ve içinde ARTI ikonu
 *
 * Yani deste hiçbir zaman kaybolmuyor: "burada bir şey var" ile "burada bir
 * şey YOK ama sen koyabilirsin" aynı yüzeyin iki hâli. Bir dönem bandın boş
 * durum karesi tamamen kaldırılmıştı (satır hiç çizilmiyordu) — orada bandın
 * geri kalanını harita dolduruyordu, burada doldurulacak bir alan yok.
 */

/**
 * KUTUNUN GENİŞLİĞİ — ve boyu tam 3:4 oranla ondan türüyor (istek: "2:3 değil
 * 3:4 yap, çok uzun oldu").
 *
 * ⚠️ ORAN SABİTTEN TÜREMEK ZORUNDA, iki ayrı sayı olarak yazılmamalı: kutular
 * fotoğraf taşıyor ve fotoğraflar `cover` ile oturuyor — en-boy elle tutulsa
 * bir gün orandan kayar ve fotoğraflar sessizce farklı kırpılır.
 *
 * ⚠️ GENİŞLİK 3'E BÖLÜNÜYOR, keyfi değil: 3:4'te boy `W * 4 / 3` ve bölünmeyen
 * bir sayı küsuratlı yükseklik veriyor — 3pt'lik kenar yarım piksele oturunca
 * çizgi kalınlığı kutular arasında gözle ayrışıyor.
 *
 * 42 → 56: "ufak" (istek) ve başlık bloğunun iki satırına (33pt başlık + tek
 * satır açıklama ≈ 64pt) sığıyor. Büyütülecekse ÜST SINIR o blok.
 */
const BOX_W = 42;
const BOX_H = (BOX_W * 4) / 3;

/**
 * ARKADAKİ KUTULARIN BOYU — öndekinden BİR TIK KISA (istek).
 *
 * ⚠️ ÖNCE EŞİTTİ ve gerekçesi "boy farkı üç ayrı kutu okunuşu veriyor, oysa
 * istenen üst üste duran bir DESTE"ydi. Fark ufak tutulduğu sürece o risk
 * doğmuyor: %12 (56 → 49), yani öndeki kutu destenin en uzunu olarak okunuyor,
 * arkadakiler onun gerisinde kalıyor.
 *
 * ⚠️ YALNIZ BOY KISALIYOR, GENİŞLİK AYNI. Peek payı genişliğin oranı: yan
 * kutular daraltılsa ekranda görünen sliver de daralır ve "%20'si gözüksün"
 * ölçüsü bozulur. Yani 3:4 oranı ÖNDEKİ kutunun sözleşmesi; arkadakiler zaten
 * %80'i örtülü, görünen sliver'ın oranı diye bir şey yok.
 *
 * ⚠️ DİKEY ORTALANIYOR (aşağıdaki `top`): kısalma iki uçtan birden alınıyor,
 * yani kutular öndekinin hem üstünde hem altında geride kalıyor — tek uçtan
 * kısaltmak desteyi bir kenara yatık gösteriyordu.
 */
const SIDE_BOX_H = Math.round(BOX_H * 0.88);
const SIDE_BOX_TOP = (BOX_H - SIDE_BOX_H) / 2;

/**
 * Arkadaki kutuların GÖRÜNEN payı — GENİŞLİĞİN oranı (istek: "yüzde 20'si
 * gözüken"). Kutular artık kare değil 3:4, yani pay boydan DEĞİL enden
 * okunmak zorunda; yoksa taşma kutunun üçte birine çıkar.
 *
 * Kutular öndekiyle AYNI ölçüde ve arkasında duruyor; görünen tek şey iki yana
 * taşan bu pay. Küçültülmüş kutular denenmedi, bilerek: boy farkı "üç ayrı
 * kutu" okunuşu veriyor, oysa istenen üst üste duran bir DESTE.
 */
const PEEK = 0.2;

/**
 * ARKADAKİ KARELERİN EĞİMİ (derece) — "ufak çapraz dursun" (istek).
 *
 * İki kare TERS yönlere yatıyor: deste yelpaze gibi açılıyor, tek yöne yatan
 * bir yığın "kayıyor" gibi okunuyordu (aynı kural kaldırılan bandın süzülen
 * karelerinde de vardı).
 *
 * ⚠️ ÖNDEKİ KARE EĞİLMİYOR: o fotoğrafın kendisi, yani okunması gereken yüzey.
 * Eğim arkadakilere derinlik veriyor; öne uygulanması kutuyu "düşmüş" gösterir.
 *
 * ⚠️ DÖNEN KUTU KABIN DIŞINA birkaç px TAŞIYOR (56pt'lik bir kutu 7°'de yatayda
 * ~3.4pt yayılıyor) ve kırpan bir ata YOK — bilerek: kırpılsa köşeler kesilir.
 * Taşan pay açıklamanın sağ boşluğuna düşüyor.
 */
const TILT_DEG = 7;

/**
 * Kenar ve kenar-foto arası boşluk — İSTEK BİREBİR (3 / 2).
 *
 * ⚠️ `campusBoxMetrics` reçetesi ÇAĞRILMIYOR — ama artık yalnız KÖŞE yüzünden:
 * şeridin çerçevesi 7/4'ten 3/2'ye inceltildikten sonra (istek, gerekçe
 * CampusInfoBox > RING_WIDTH) reçete bu boyda da tabanlara çöküp aynı çizgi ve
 * boşluğu veriyor; ayrışan tek sayı köşe (reçetede ~5, burada 9 — 222pt'lik
 * kutudan ölçeklenen bir yarıçap bu kutuda gereğinden keskin kalıyor).
 * Üç sayı o yüzden burada sabit. İKİSİ BİRLİKTE DÜŞÜNÜLMELİ: deste, şeridin
 * küçültülmüş hâli gibi okunmak zorunda.
 */
const BOX_RING = 3;
const BOX_GAP = 2;

/**
 * Köşe — GENİŞLİĞİN 0.22'si (≈9). Boydan türetilmiyor: 3:4 bir kutuda boy
 * oranı köşeyi gereğinden yuvarlak yapıyor. Oran, kaldırılan bandın karelerinden birebir
 * (orada da `BAND_RADIUS_RATIO` 0.22'ydi): deste o karelerin devamı olarak
 * okunmalı, yeni bir kutu ailesi değil.
 */
const BOX_RADIUS = Math.round(BOX_W * 0.22);

/** Artı ikonunun boyu ve kalınlığı — 42×56'lık kutuda dibe yakın durmuyor. */
const ADD_ICON = 18;
const ADD_STROKE = 2.4;

/**
 * ── ÖNDEKİ KUTUNUN KENARINDA DOLAŞAN IŞIK (istek) ───────────────────────────
 *
 * "burayı öne çıkarmak için ana karenin border'ında moda göre yeşil veya
 * kırmızı-turuncu çizgi olarak çizilsin, hepsi animasyonla yavaşça, sonra aynı
 * şekilde gitsin" + "daha smooth yap, uçları progressive opacity filan olsun".
 *
 * ── ⚠️🔴 İKİNCİ UYGULAMA. İLKİ (SVG + dash) NİYE YETMEDİ ───────────────────
 * İlk tur poligonun kendini çizme mekanizmasını ödünç almıştı:
 * `strokeDasharray=[çevre, çevre]` + animasyonlu `strokeDashoffset`, uçların
 * sönümü için de offset'i kaydırılmış DÖRT ek `<Path>` (opaklık 0.5 / 0.18).
 * İki ayrı sebepten pürüzlü kaldı:
 *   1. SVG'de kontur gradyanı UZAYSAL (x/y), yani "yol boyunca sönen alfa"
 *      kurulamıyor. Katmanlı taklit 3 KADEMELİ bir bant veriyor — istenen
 *      progressive sönüm değil, görünür basamaklar.
 *   2. Beş `<Path>`in beşi de her karede animasyonlu bir prop güncelliyor ve
 *      react-native-svg tek bir prop değişiminde TÜM tuvali yeniden çiziyor.
 *      42×56'lık bir yüzey için kare bütçesinin boşa gitmesi.
 *
 * ── Bugünkü yol: SKIA + SWEEP (konik) GRADYAN + ZARF ───────────────────────
 * Kenarın yolu bir KONTUR olarak çiziliyor ve boyası dönen bir sweep gradyan:
 * tek parlak yay, iki yanında alfası GRADYANDA sönen uçlar. Gradyan döndükçe
 * ışık kenarda dolaşıyor.
 *
 * Kazanç: uçların sönümü GERÇEK gradyan (shader'da alfa interpolasyonu —
 * basamak yok), tek çizim düğümü, iş GPU'da.
 *
 * ⚠️🔴 ZARF (`beamAlpha`) ZORUNLU, ve sebebi bir YANILGIYDI: "şeffaf yay
 * beklemeyi de taşıyor" diye yazılmıştı ve YANLIŞTI. Şeffaf kısım gradyanın
 * parçası, yani ışıkla BİRLİKTE dönüyor — ışık her an kenarın bir yerinde
 * duruyor, hiç kaybolmuyordu (şikâyet birebir: "tek sefer dolaşıp kaybolsun,
 * sonra intervali olsun"). Dönme TEK TUR atıyor, görünürlüğü ise ayrı bir
 * opaklık zarfı açıp kapatıyor.
 *
 * Devir TEK bir doğrusal sayıdan türüyor (`cycle`): tur ilerlemesi, zarf ve
 * bekleme hepsi onun dilimleri. `withSequence` yok — sıralı animasyonlar
 * tekrarda başa sarmak için bir "sıfırla" adımı istiyor ve o adım bir kare
 * görünüyor.
 *
 * ⚠️ TUR `Easing.linear`: sabit hızla dolaşan ışık doğal, ivmelenen ışık "bir
 * şeye takıldı" gibi okunuyor. Yumuşaklık zarfın işi, turun değil.
 */

/** Işığın kenarda BİR TUR atma süresi. */
const LAP_MS = 3000;

/** İki tur arası bekleme — ışık tamamen yok. */
const LAP_PAUSE_MS = 2800;

const CYCLE_MS = LAP_MS + LAP_PAUSE_MS;
/** Turun devir içindeki payı — zarf ve bekleme bu orandan türüyor. */
const LAP_FRACTION = LAP_MS / CYCLE_MS;

/**
 * ZARFIN AÇILMA/KAPANMA PAYI — turun yüzdesi.
 *
 * 0.3: ışık turun ilk %30'unda beliriyor, son %30'unda gidiyor, ortada tam.
 * Dar bir pay (0.1) "pat diye belirdi" hissi veriyor — tam olarak kaçınılan
 * şey; geniş bir pay (0.45) ışığı hiç tam parlaklığa çıkarmıyor.
 */
const BEAM_FADE = 0.3;

/**
 * PARLAK YAYIN ÇEVREYE ORANI.
 *
 * 0.22 → 0.3 (istek: "daha smooth yap opacity progressi"): sönümün yayılacağı
 * yay uzadı, yani uçların geçişi daha uzun bir mesafede oluyor. Daha geniş bir
 * yay kenarın çoğunu kaplayıp "dönen çerçeve"ye dönüyor.
 */
const BEAM_SPAN = 0.3;

/**
 * ⚠️🔴 TUVALİN TAŞMA PAYI — HALE OLMADAN KIRPILIYOR.
 *
 * Skia `Canvas` kendi sınırında kırpıyor. Hale konturu 6.6pt kalın ve yolun
 * ORTA hattına oturuyor, yani kutunun dışına ~1.8pt taşıyor; üstüne `BlurMask`
 * onu ~3pt daha yayıyor. Tuval kutu ölçüsünde bırakılsa halenin dış yarısı DÜZ
 * BİR ÇİZGİ gibi kesiliyor — yumuşaklık tam olarak orada kayboluyor (aynı tuzak
 * şeridin natif menüsünde `LIFT_BLEED` olarak yazılı).
 *
 * Tuval her yönden bu pay kadar büyük, yol da aynı pay kadar içeri kaydırılmış:
 * kutunun EKRANDAKİ yeri değişmiyor, yalnız çizim alanı büyüyor.
 */
const SWEEP_BLEED = 6;

/** Konturun merkez hattı — kenar bandının tam ortası (kalınlık 3'ün yarısı). */
const SWEEP_INSET = BOX_RING / 2 + SWEEP_BLEED;
const SWEEP_W = BOX_W - BOX_RING;
const SWEEP_H = BOX_H - BOX_RING;
const SWEEP_R = BOX_RADIUS - BOX_RING / 2;
const SWEEP_CENTER = vec(
  BOX_W / 2 + SWEEP_BLEED,
  BOX_H / 2 + SWEEP_BLEED,
);

/**
 * Yuvarlak dikdörtgenin yolu — kutunun kenarının TA KENDİSİ.
 *
 * ⚠️ SVG SÖZDİZİMİ KALDI (Skia `MakeFromSVGString` ile okuyor): yol tek bir
 * yerde yazılı olsun diye. Skia'nın `addRRect`i ile kurmak da mümkündü ama o
 * zaman köşe yarıçapı iki ayrı yerden türeyecekti.
 */
const SWEEP_PATH = [
  `M${SWEEP_INSET + SWEEP_R},${SWEEP_INSET}`,
  `H${SWEEP_INSET + SWEEP_W - SWEEP_R}`,
  `A${SWEEP_R},${SWEEP_R} 0 0 1 ${SWEEP_INSET + SWEEP_W},${SWEEP_INSET + SWEEP_R}`,
  `V${SWEEP_INSET + SWEEP_H - SWEEP_R}`,
  `A${SWEEP_R},${SWEEP_R} 0 0 1 ${SWEEP_INSET + SWEEP_W - SWEEP_R},${SWEEP_INSET + SWEEP_H}`,
  `H${SWEEP_INSET + SWEEP_R}`,
  `A${SWEEP_R},${SWEEP_R} 0 0 1 ${SWEEP_INSET},${SWEEP_INSET + SWEEP_H - SWEEP_R}`,
  `V${SWEEP_INSET + SWEEP_R}`,
  `A${SWEEP_R},${SWEEP_R} 0 0 1 ${SWEEP_INSET + SWEEP_R},${SWEEP_INSET}`,
  "Z",
].join(" ");

/** Halenin konturu — net ışıktan kalın ve bulanık (gerekçe render'da). */
const GLOW_WIDTH = BOX_RING * 2.2;
const GLOW_BLUR = 3;
const GLOW_OPACITY = 0.5;

/**
 * İKİ UÇTA DA TÜREVİ SIFIR OLAN GEÇİŞ — zarfın ve uç sönümünün ortak eğrisi.
 *
 * ⚠️ DOĞRUSAL RAMPA DEĞİL: alfa doğrusal arttığında göz BAŞLANGIÇ ve BİTİŞ
 * anlarını köşe olarak görüyor (parlaklık algısı doğrusal değil). Smoothstep
 * iki uçta da yavaşlayıp ortada hızlanıyor, yani ışık "açılıp kapanıyor" değil
 * "var olup yok oluyor" gibi okunuyor.
 */
function smoothstep(t: number): number {
  "worklet";
  const u = t < 0 ? 0 : t > 1 ? 1 : t;
  return u * u * (3 - 2 * u);
}

/**
 * IŞIĞIN GÖRÜNÜRLÜĞÜ — devrin neresindeyiz.
 *
 * Bekleme fazında (tur bitti) SIFIR; tur içinde iki uçtan smoothstep ile
 * açılıp kapanıyor. Turun sonunda zarf ZATEN sıfıra indiği için beklemeye
 * geçiş kesintisiz, döngünün başa sarması da görünmüyor.
 */
function beamAlpha(cycle: number): number {
  "worklet";
  const lap = cycle / LAP_FRACTION;
  if (lap >= 1) return 0;
  return smoothstep(lap / BEAM_FADE) * smoothstep((1 - lap) / BEAM_FADE);
}

/**
 * IŞIĞIN DURAKLARI — iki yanı alfada sönen tek bir yay.
 *
 * ⚠️ UÇLAR `withAlpha(..., 0)` İLE BİTİYOR, rengi ATLAYARAK değil: Skia
 * duraklar arasında RGBA'yı doğrusal karıştırıyor ve şeffaf uç farklı bir renk
 * olursa sönüm sırasında tonu kayıyor (kırmızıdan şeffafa giderken griye
 * düşmek gibi).
 *
 * Mod ailesinin üç durağı sırayla kullanılıyor: sönük uç → orta → parlak tepe.
 * Yani ışık kendi içinde de modun gradyanını taşıyor.
 */
function beamStops(gradient: Gradient) {
  const [dim, mid, hot] = gradient;
  /**
   * ⚠️ DURAK SAYISI ARTTI (5 → 8, istek: "daha smooth yap opacity progressi"):
   * Skia duraklar arasında DOĞRUSAL karıştırıyor, yani az durak = köşeli bir
   * alfa eğrisi. Sayılar `smoothstep`in örneklenmiş hâli: kuyrukta yavaş
   * başlıyor, tepeye doğru hızlanıyor, baş tarafında yine yavaşlıyor.
   */
  return {
    colors: [
      withAlpha(dim, 0),
      withAlpha(dim, 0.06),
      withAlpha(dim, 0.22),
      withAlpha(mid, 0.52),
      withAlpha(mid, 0.82),
      hot,
      withAlpha(mid, 0.6),
      withAlpha(dim, 0.2),
      withAlpha(dim, 0),
      withAlpha(dim, 0),
    ],
    positions: [
      0,
      BEAM_SPAN * 0.12,
      BEAM_SPAN * 0.26,
      BEAM_SPAN * 0.42,
      BEAM_SPAN * 0.56,
      BEAM_SPAN * 0.68,
      BEAM_SPAN * 0.82,
      BEAM_SPAN * 0.92,
      BEAM_SPAN,
      1,
    ],
  };
}

/** Kenarda dolaşan ışık — yalnız ÖNDEKİ kutuda. */
const BorderSweep = memo(function BorderSweep({
  gradient,
}: {
  gradient: Gradient;
}) {
  const reduced = useReducedMotion();
  /**
   * 0 → 1 = tur + bekleme. TEK sayı, üç tüketici: dönme, zarf ve (dolaylı)
   * bekleme. Doğrusal, yani zaman ekseninin kendisi.
   */
  const cycle = useSharedValue(0);

  useEffect(() => {
    if (reduced) {
      /**
       * ⚠️ HAREKET YOK AMA IŞIK VAR: işaretin kendisi bilgi, dolaşması süs.
       * Devrin ORTASINDA park ediyor — zarf orada tam, yani ışık sol üst
       * köşede durağan ve tam parlaklıkta.
       */
      cycle.value = LAP_FRACTION / 2;
      return;
    }
    cycle.value = withRepeat(
      withTiming(1, { duration: CYCLE_MS, easing: Easing.linear }),
      -1,
      false,
    );
    return () => cancelAnimation(cycle);
  }, [cycle, reduced]);

  /**
   * ⚠️ YOL RENDER SIRASINDA KURULUYOR, modül düzeyinde DEĞİL: `Skia.*` native
   * taraf hazır olmadan çağrılırsa patlıyor (aynı kural FireFlameCanvas'ta da
   * yazılı). `useMemo` ile bir kez kuruluyor.
   */
  const path = useMemo(() => Skia.Path.MakeFromSVGString(SWEEP_PATH), []);
  const stops = useMemo(() => beamStops(gradient), [gradient]);
  /**
   * Gradyanın dönüşü — radyan. TUR BİTİNCE 2π'de PARK EDİYOR (`min(…, 1)`):
   * bekleme boyunca dönmeye devam etse ışık görünmezken yol alır ve bir sonraki
   * tur rastgele bir köşeden başlardı.
   */
  const transform = useDerivedValue(() => [
    { rotate: Math.min(cycle.value / LAP_FRACTION, 1) * 2 * Math.PI },
  ]);
  /** Zarf — net ışık ve hale AYNI değeri okuyor (hale kendi payıyla çarpıyor). */
  const beamOpacity = useDerivedValue(() => beamAlpha(cycle.value));
  const glowOpacity = useDerivedValue(
    () => beamAlpha(cycle.value) * GLOW_OPACITY,
  );

  if (!path) return null;

  return (
    <Canvas
      pointerEvents="none"
      /* Taşma payı kadar büyük ve o kadar negatif konumlu: kutunun ekrandaki
         yeri aynı, kırpma sınırı halenin dışında (gerekçe SWEEP_BLEED'de). */
      style={{
        position: "absolute",
        left: -SWEEP_BLEED,
        top: -SWEEP_BLEED,
        width: BOX_W + SWEEP_BLEED * 2,
        height: BOX_H + SWEEP_BLEED * 2,
      }}
    >
      {/* 1. HALE — aynı ışık, kalın ve bulanık. Işığı kenara "yaymak" için:
          tek başına 3pt'lik bir çizgi keskin bir çıta gibi duruyor, altındaki
          yumuşak kopya onu kenarın üstünde parlayan bir şeye çeviriyor.
          ⚠️ `BlurMask` KONTURUN KENDİSİNE: ayrı bir katman + opacity ile
          yapılsaydı iki ayrı tuval kompoziti olurdu. */}
      <SkiaPath
        path={path}
        style="stroke"
        strokeWidth={GLOW_WIDTH}
        strokeJoin="round"
        strokeCap="round"
        opacity={glowOpacity}
      >
        <BlurMask blur={GLOW_BLUR} style="normal" />
        <SweepGradient
          c={SWEEP_CENTER}
          origin={SWEEP_CENTER}
          colors={stops.colors}
          positions={stops.positions}
          transform={transform}
        />
      </SkiaPath>

      {/* 2. NET IŞIK — kenar bandının tam ölçüsü (3pt), gri rayın üstünde. */}
      <SkiaPath
        path={path}
        style="stroke"
        strokeWidth={BOX_RING}
        strokeJoin="round"
        strokeCap="round"
        opacity={beamOpacity}
      >
        <SweepGradient
          c={SWEEP_CENTER}
          origin={SWEEP_CENTER}
          colors={stops.colors}
          positions={stops.positions}
          transform={transform}
        />
      </SkiaPath>
    </Canvas>
  );
});

export interface FeedMomentsPeekProps {
  moments: CampusMomentDto[];
  onPress: () => void;
  accessibilityLabel: string;
  /**
   * Kenarda dolaşan çizginin gradyanı — SEÇİLİ MODUN Fire ailesi. Prop, modül
   * sabiti değil: akış iki modda da aynı ekran ve renk dışarıdan geliyor (aynı
   * kural başlığın Plus pill'inde de var).
   */
  gradient: Gradient;
}

/** Tek kutu — fotoğraf varsa onu, yoksa kutunun kendi gri zeminini çiziyor. */
const PeekBox = memo(function PeekBox({
  moment,
  add,
  height = BOX_H,
}: {
  moment: CampusMomentDto | null;
  /** Hiç an yokken ÖNDEKİ karenin içine artı konuyor (istek). */
  add?: boolean;
  /** Arkadaki kutular bir tık kısa — gerekçe `SIDE_BOX_H`de. */
  height?: number;
}) {
  return (
    <CampusOutlinedBox
      width={BOX_W}
      height={height}
      ring={BOX_RING}
      gap={BOX_GAP}
      radius={BOX_RADIUS}
      /**
       * ⚠️ BOŞLUK ŞEFFAF DEĞİL, SAYFA ZEMİNİ (istek: "boşluk yerine arkaplan
       * rengi olsun direkt o sayfanın"). Kabuğun varsayılanı şeffaf ve orada
       * kalması gerekiyor — gerekçe prop'un yanında; burada arkadan geçen şey
       * haritanın bulanık bandı ve iki çizgi arasında bir şerit olarak
       * görünüyordu.
       *
       * ⚠️ `colors.bg` RENDER SIRASINDA okunuyor (palet mutable): modül
       * sabitine alınırsa tema çevrildiğinde eski renk kalır.
       */
      gapFill={colors.bg}
    >
      {moment ? (
        // ⚠️ `expo-image`: disk+bellek önbelleği sayesinde aynı an sekme
        // dönüşlerinde yeniden indirilmiyor. `recyclingKey` an id'si — o
        // olmadan deste tazelenirken bir kare ÖNCEKİ anın fotoğrafını
        // taşıyor (akış kartındaki avatarın aynı tuzağı).
        <Image
          source={{ uri: moment.photoUrl }}
          style={{ width: "100%", height: "100%" }}
          contentFit="cover"
          cachePolicy="memory-disk"
          recyclingKey={moment.id}
        />
      ) : add ? (
        <Plus
          size={ADD_ICON}
          color={colors.onMedia}
          strokeWidth={ADD_STROKE}
        />
      ) : null}
    </CampusOutlinedBox>
  );
});

const FeedMomentsPeek = memo(function FeedMomentsPeek({
  moments,
  onPress,
  accessibilityLabel,
  gradient,
}: FeedMomentsPeekProps) {
  /**
   * ⚠️ SÜRESİ GEÇENLER BURADA DA SÜZÜLÜYOR. An 24 saat yaşıyor ve listeyi
   * veren sorgu arka planda tazelenene kadar elde ölmüş bir an kalabiliyor;
   * deste "son an" diyen tek yüzey, yani bayat bir fotoğrafı göstermemesi
   * gereken ilk yer burası (aynı süzgeç kaldırılan bantta da vardı).
   */
  const live = useMemo(() => filterLiveMoments(moments, Date.now()), [moments]);

  /**
   * ÖNDE SON AN. Sunucu listeyi yeniden-eskiye veriyor (kampüs sözleşmesi), o
   * yüzden sıralama BURADA tekrar yapılmıyor — iki yerde sıralamak, uç bir gün
   * sırayı değiştirdiğinde iki yüzeyi iki ayrı sıraya düşürür.
   */
  const [first = null, second = null, third = null] = live;

  return (
    <AnimatedPressable
      pressScale={0.94}
      onPress={onPress}
      accessibilityRole="button"
      accessibilityLabel={accessibilityLabel}
      hitSlop={10}
      style={{
        // Deste öndeki kutu + iki yana taşan paylar kadar yer tutuyor.
        width: BOX_W * (1 + 2 * PEEK),
        height: BOX_H,
        flexShrink: 0,
      }}
    >
      {/*
        ⚠️ ÇİZİM SIRASI = Z SIRASI: arkadaki iki kare ÖNCE, öndeki SONRA.
        `zIndex` kullanılmadı — sıra zaten doğru ve zIndex her kareyi ayrı bir
        yığın bağlamına sokuyor.

        ⚠️ ÜÇÜ DE MUTLAK: akışa bırakılsalardı (row + negatif marj) öndeki kare
        iki kardeşinin arasında KALIR, yani arkadakiler onun üstüne binerdi.

        2. an SAĞDA, 3. an SOLDA — sıra keyfi ama SABİT: sıradaki an sağdan
        yaklaşıyor (yatay listelerdeki okunuş), en eskisi solda geride kalıyor.
      */}
      <View
        style={{
          position: "absolute",
          left: 0,
          top: SIDE_BOX_TOP,
          transform: [{ rotate: `-${TILT_DEG}deg` }],
        }}
      >
        <PeekBox moment={third} height={SIDE_BOX_H} />
      </View>
      <View
        style={{
          position: "absolute",
          left: BOX_W * 2 * PEEK,
          top: SIDE_BOX_TOP,
          transform: [{ rotate: `${TILT_DEG}deg` }],
        }}
      >
        <PeekBox moment={second} height={SIDE_BOX_H} />
      </View>
      <View
        style={{
          position: "absolute",
          left: BOX_W * PEEK,
          top: 0,
          width: BOX_W,
          height: BOX_H,
        }}
      >
        {/* Hiç an yoksa artı BURADA — arkadaki kutular boşken yalnız gri. */}
        <PeekBox moment={first} add={!first} />
        {/* ⚠️ KUTUNUN KARDEŞİ: kabuğun `overflow: hidden`ı içeri konan çizimi
            kırpıyor (gerekçe BorderSweep'in başında). */}
        <BorderSweep gradient={gradient} />
      </View>
    </AnimatedPressable>
  );
});

export default FeedMomentsPeek;
