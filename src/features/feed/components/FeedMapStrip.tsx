import { memo, useEffect, useMemo, useRef, useState } from "react";
import { StyleSheet, View, useWindowDimensions } from "react-native";
import Animated, {
  Easing,
  runOnJS,
  useAnimatedReaction,
  useAnimatedStyle,
  useDerivedValue,
  useSharedValue,
  withTiming,
  type SharedValue,
} from "react-native-reanimated";
import { Image } from "expo-image";
import { LinearGradient } from "expo-linear-gradient";
import { BlurView } from "expo-blur";
import MaskedView from "@react-native-masked-view/masked-view";
import { easeGradient } from "react-native-easing-gradient";
import { chromeBlurTint } from "@/shared/theme/blur";
import {
  buildMapboxStaticUrl,
  MAPBOX_STYLE_DEFAULT,
} from "@/shared/constants/mapbox";
import { isLight, scrimAt, veil } from "@/shared/theme/colors";
import SkeletonBox from "@/shared/components/SkeletonBox";
import type { UniversityOption } from "@/shared/queries/commonQueries";
import { resolveUniversityCoordinate } from "../universityGeo";
import CampusFigure, { CAMPUS_FIGURE_ANCHOR } from "./CampusFigure";
import CampusPolygonOverlay from "@/features/campus/components/CampusPolygonOverlay";
import { feedMapFraming } from "./feedMapFraming";
// Blur'un geri gelmesi haritanın hareketiyle aynı sayıda (gerekçe aşağıda).
import {
  MAP_MOTION_MS,
  MAP_PULL_SHARE,
  mapMotionEasing,
} from "./feedMapMotion";
import {
  boundsCenter,
  coverScale,
  fitZoom,
  geometryBounds,
  type CampusProjectionArgs,
} from "@/features/campus/campusProjection";
import {
  campusTransitionVector,
  TRANSITION_MS,
  TRANSITION_SCALE,
} from "./CampusMapTransition";
import type {
  CampusBoundaryDto,
  CampusGeometry,
} from "@/features/campus/campusTypes";

/**
 * Akışın KAMPÜS HARİTASI ZEMİNİ — EKRANIN TAMAMINI kaplayan, SABİT bir katman.
 * Sekme şeridi, büyük başlık, açıklama ve filtre pill'leri bunun üstünde
 * yüzüyor; gönderiler kaydırılırken harita YERİNDE KALIYOR ve kartlar onun
 * üzerinden akıyor.
 *
 * Katman tam ekran ama İKİ ÖLÇÜSÜ hero bandına (chrome'un durduğu üst bölge)
 * bağlı: okunabilirlik perdesinin bittiği çizgi ve GÖRÜNTÜNÜN DİKEY YERİ.
 * İkisi de `heroHeight`ten konumlanıyor — perde tam ekrana yayılsa pill'lerin
 * arkası açılır ve ekranın dibi gereksiz karanlıklaşırdı; görüntü ekranın
 * ortasına oturtulsa kampüsün kendisi kartların arkasında kalırdı
 * (bkz. imageTop).
 *
 * ── Neden LİSTENİN DIŞINDA, onun KARDEŞİ ─────────────────────────────────────
 * İki tur denendi, ikisi de aynı duvara çarptı:
 *
 *  1. Kartlarla aynı hizada, 120pt'lik yuvarlak köşeli bir ŞERİT (adı oradan
 *     kalma). Listeyle birlikte kayıyordu, "sabit zemin" isteği bunu bitirdi.
 *  2. Liste BAŞLIĞININ içinde, scroll'u ters öteleyerek sabit durma. Z-sırası
 *     bunu imkânsız kılıyor: `contentContainer`ın zemini bir ATA, harita onun
 *     ÇOCUĞU, kartlar ise sonraki kardeşler → sıra "kap zemini < harita <
 *     kartlar". Kabın zemini opak yapılsa harita onun ÜSTÜNDE kaldığı için
 *     kartların ARASINDAKİ boşluklardan sızıyordu (gap'ler `marginBottom`,
 *     yani şeffaf — bkz. feedRowShell > ROW_GAP). Bir ata, çocuğunu kendi
 *     zeminiyle örtemez.
 *
 * Çözüm: katman AKIŞ SAYFASININ içinde, FlatList'ten ÖNCE çiziliyor (yani
 * onun kardeşi ve arkasında):
 *   harita (sabit) < liste içeriği (kayan, kartlar opak) < sekme şeridi
 * Kartlar haritanın üstünden geçiyor; başlık ve pill'ler zeminsiz olduğu için
 * haritayı gösteriyor.
 *
 * ⚠️ Pager'ın DIŞINA (ekran köküne) konmadı: iOS'ta `AnimatedPagerView` native
 * bir sayfa denetleyicisi ve kendi zeminini taşıyor — arkasına konan katmanı
 * örtme riski var. Sayfanın içinde kap düz bir şeffaf `View`.
 *
 * ⚠️ KARTLARIN ARASINDAKİ BOŞLUKLARDAN harita GÖRÜNÜYOR, bilerek: liste
 * şeffaf, kartlar opak. "Gönderiler haritanın üstünde yüzüyor" okunuşunu veren
 * şey bu. Boşlukların kapanması istenirse çözüm satır kabuğuna zemin vermek
 * (feedRowShell), listenin kabına DEĞİL — yukarıdaki (2) o yüzden çalışmıyor.
 *
 * ── Katmanlar, alttan üste ──────────────────────────────────────────────────
 *   1. Mapbox statik görüntüsü — kampüs BANDIN ortasında (bkz. imageTop)
 *   2. SÖNÜMLEME — görüntünün tamamına çekilen ince siyah perde (istek:
 *      "harita çok parlak"). Sabit, animasyonsuz; bkz. MAP_DIM_ALPHA.
 *   3. GENEL BULANIKLIK — akışta zemin yumuşak, tam ekranda çözülüyor
 *      (bkz. MAP_OVERVIEW_BLUR)
 *   4. Okunabilirlik perdesi — TEPEDE koyu, dipte YOK. Perde `colors.bg` ile
 *      çiziliyor, siyahla DEĞİL: metin renkleri temayla dönüyor (açık temada
 *      siyah yazı) ve siyah bir perde açık temada kontrastı ters çeviriyordu.
 *      Harita stili de temaya göre seçiliyor, yani iki tarafta da zemin ile
 *      perde aynı aileden.
 *   5. İzometrik okul figürü, kampüsün noktasında
 *
 * ── KATMAN DOKUNUŞ ALMIYOR (`pointerEvents="none"`) ─────────────────────────
 * Burada bir zamanlar tam ekranı kaplayan bir `TouchableOpacity` vardı ve
 * haritayı tam ekrana açması bekleniyordu. HİÇ ÇALIŞMADI, çalışması da mümkün
 * değildi: katman listenin ARKASINDA ve liste (RCTScrollView) ekranın
 * tamamını kaplıyor. iOS'ta hit-test en üstteki görünümü buluyor, bulduğu
 * görünümün atalarında dokunuşu işleyen yoksa olay KARDEŞE DÜŞMÜYOR — sessizce
 * yutuluyor. Yani arkadaki katmana konulan her dokunma hedefi ölü kod.
 *
 * Doğru yer dokunuşu zaten alan ağaç: haritanın açıkta kaldığı bant LİSTENİN
 * İÇİNDE bir boşluk ve asıl buton orada (bkz. FeedScreen > listHeader'daki
 * `Pressable`). Katmanın tamamı artık geçirgen — altındaki hiçbir şeyi
 * gölgelemiyor.
 *
 * ── PIN ve KAMPÜS ETİKETİ KALDIRILDI (2026-10-19 isteği) ────────────────────
 * Bandın üstünde bir pin dairesi ve sol dipte kampüs adını yazan bir kapsül
 * vardı. İkisi de gitti. Kampüs adı zaten pill satırındaki kampüs pill'inde
 * yazıyor, yani etiket aynı şeyi ikinci kez söylüyordu; pin'in yerini ise
 * İZOMETRİK OKUL FİGÜRÜ aldı (bkz. CampusFigure) — ikisi de kampüsün tam
 * noktasında duruyor ama pin "burada bir şey var", figür "burada OKUL var"
 * diyor. Kampüsün ADI artık bu katmanda hiç geçmiyor; erişilebilirlik adını
 * da bandın butonu taşıyor (bkz. FeedScreen).
 *
 * ── STATİK görüntü, canlı MapView değil ─────────────────────────────────────
 * "Tam ekran harita" hâli de bu görüntünün kendisi: bant butonuna basınca
 * gönderiler aşağı, chrome yukarı kayıyor ve geriye kadrajı ortalanmış görüntü
 * kalıyor. KAYDIRILABİLİR/YAKINLAŞTIRILABİLİR harita ayrı bir iş ve NATIVE SDK
 * istiyor (`@rnmapbox/maps` + dev-client yeniden build).
 *
 * ── URL render içinde kuruluyor ─────────────────────────────────────────────
 * `buildMapboxStaticUrl` stil seçimi için `isLight()` okuyor; modül seviyesine
 * alınırsa tema değişince bayat kalır (mapbox.ts'teki kural). `useMemo`
 * bağımlılıkları koordinat + TEMA.
 *
 * ── Koordinat yoksa HİÇ ÇİZİLMİYOR ──────────────────────────────────────────
 * Yanlış yere pin koymak, hiç harita göstermemekten kötü: kullanıcı başka bir
 * şehri kendi kampüsü sanır. Katman artık chrome taşımadığı için `null`
 * dönmek güvenli — başlık ve pill'ler listenin kendi başlığında duruyor.
 */
export interface FeedMapStripProps {
  /** Seçili kampüsün domain'i; `null` = kullanıcının kendi kampüsü. */
  domain: string | null;
  /** Sunucudan gelen üniversite kaydı (geo alanları buradan). */
  option?: UniversityOption | null;
  /**
   * TAM EKRAN HARİTA ilerlemesi (0 → 1). Katman bunu yalnız KADRAJ için
   * okuyor: açılırken kampüs noktası bandın ortasından EKRANIN ortasına
   * kayıyor, yoksa "tam ekran harita" hâlinde bina tepede sıkışık kalırdı.
   *
   * ⚠️ Animasyonu SÜREN değer değil, yalnız okunan: açma/kapama ve bütün
   * kardeş katmanların (liste, chrome, sekme şeridi) ötelemesi FeedScreen'de.
   */
  expandProgress: SharedValue<number>;
  /**
   * ÇEKMENİN ORANI (0 → 1) — eşiğe ne kadar kaldı.
   *
   * Katman bunu yalnız ÜST BANDIN sönmesi için okuyor: chrome parmakla yukarı
   * çıkarken onu okunur kılan blur da birlikte açılıyor (istek). Kadraj ve
   * genel bulanıklık bunu KULLANMIYOR — harita çekerken yerinde duruyor.
   *
   * Opsiyonel: Gönderilerim sayfasında çekme haritayı açmıyor (orada harita da
   * yok) ve bu katmanın bir çekme kavramı olmak zorunda değil.
   */
  pullProgress?: SharedValue<number>;
  /**
   * HERO yüksekliği — ekranın tepesinden (status bar dahil) chrome'un bittiği
   * yerin `bandHeight` kadar altına. Çağıran ölçüyor: üst pay + chrome'un
   * gerçek yüksekliği + bant.
   *
   * ⚠️ HARİTANIN yüksekliği DEĞİL: görüntü ekranın TAMAMINI kaplıyor (istek).
   * Bu sayı iki şeyi konumlandırıyor — okunabilirlik perdesinin bittiği çizgi
   * ve görüntünün dikey kayması (kampüsü bandın ortasına getiren `imageTop`).
   * Perdenin üç durağı bu bandın oranlarına göre ayarlı; tam ekrana yayılsa
   * pill'lerin arkası açılıp dip gereksiz karanlıklaşırdı.
   *
   * `0` iken perde çizilmiyor ve görüntü kaymıyor (ölçüm henüz gelmedi);
   * harita yine çiziliyor.
   */
  heroHeight: number;
  /** Haritanın AÇIKTA kaldığı bant — chrome'un altındaki alan. */
  bandHeight?: number;
  /**
   * TAM EKRAN hâlde ALTTAN kapanan yükseklik — kampüs anları sheet'inin küçük
   * detenti.
   *
   * ⚠️ Kampüs noktası ekranın ortasına DEĞİL, sheet'in ÜSTÜNDE kalan alanın
   * ortasına getiriliyor. Ekran ortası alınsaydı okul sheet'in arkasında
   * kalırdı — yüzeyin tamamı "kampüsüm nerede" sorusu üzerine kurulu.
   *
   * `0` = alttan kapanan bir şey yok (sheet kapalı).
   */
  expandedBottomInset?: number;
  /**
   * Kampüsün SINIRI — varsa izometrik diorama yerine POLİGON çiziliyor.
   *
   * Gerekçe: diorama bir işaret, poligon bilgi. "Okul şurada bir yerde" ile
   * "okulun sınırı tam burası" arasındaki fark; elimizde sınır varken temsilî
   * bir bina çizmek bilgiyi saklamak olurdu. Sunucuda 25 kampüsün poligonu
   * hâlâ yok, orada diorama duruyor.
   */
  boundary?: CampusBoundaryDto | null;
}

/**
 * Chrome'un altında haritanın AÇIKTA kaldığı bant. 120 — eski şeridin
 * yüksekliği; zeminin dibi böylece bugün olduğu yerde kalıyor (istek).
 */
export const FEED_MAP_BAND_HEIGHT = 120;

/**
 * Perdenin üç durağı. TEPE sekme şeridinin ve başlığın arkası — orada metin
 * kontrastı haritadan önce gelir. DİP sıfır: bandın tamamı harita.
 *
 * 0.82 → 0.45 → 0: ortadaki durak pill satırının hizasına denk geliyor.
 * Doğrusal iki duraklı bir perdede pill'ler ya okunmuyor (üst düşükse) ya da
 * harita bandın yarısına kadar kayboluyor (üst yüksekse).
 */
/**
 * Blur maskesinin yumuşaması — `easeGradient` ile.
 *
 * Düz (doğrusal) bir maske blur'un bittiği yerde gözle seçilen bir çizgi
 * bırakıyor; eğrili geçiş onu yok ediyor. Aynı kalıp `ScreenHeader`da ve
 * `AppModal`ın başlığında da var.
 */
const { colors: BLUR_MASK_COLORS, locations: BLUR_MASK_LOCATIONS } =
  easeGradient({
    colorStops: {
      0: { color: "rgba(0,0,0,1)" },
      0.72: { color: "rgba(0,0,0,0.92)" },
      1: { color: "transparent" },
    },
  });

/** Blur bandın içine bu kadar sarkıp orada sönüyor (sert kenar olmasın). */
const BLUR_FADE_OVERLAP = 28;

/**
 * Yakınlık KOORDİNATIN KESİNLİĞİNE göre seçiliyor — tek bir sabit DEĞİL.
 *
 * 14 cadde adlarının ve kampüs adasının seçildiği ölçek; istenen "daha yakın"
 * görüntü bu (11 şehrin tamamını gösteriyordu ve kampüs birkaç piksellik bir
 * lekeydi). AMA 14 aynı zamanda bir İDDİA: "okul tam burada".
 *
 * ⚠️ SUNUCUNUN KOORDİNATLARININ ÇOĞU KAMPÜS DEĞİL. `/api/common/universities`
 * ölçüldüğünde 207 kaydın 131'i `isApproximate: true`, yani İL MERKEZİ — 29
 * İstanbul üniversitesi birebir aynı noktada (41.0082, 28.9784 = Sultanahmet)
 * oturuyor. Böyle bir koordinatı 14'te göstermek, kullanıcının kampüsünü
 * tanıdığı bir ölçekte ona yanlış sokağı işaret etmek demek — figür de
 * "okul burada" dediği için yanlışlık iki kat görünür oluyor.
 *
 * O yüzden yaklaşık koordinat ŞEHİR ÖLÇEĞİNDE çiziliyor: o ölçekte kare
 * "şehrin neresi" değil "hangi şehir" diyor ve il merkezi için doğru cevap bu.
 *
 * ⚠️ ASIL ÇÖZÜM SUNUCUDA: 131 kayda gerçek kampüs koordinatı girildiğinde
 * hepsi kendiliğinden 14'e geçecek, burada değişiklik gerekmiyor.
 *
 * ⚠️ SwipeCard 6 kullanıyor, orada soru "hangi şehirde". Aynı sabit DEĞİL.
 */
const MAP_ZOOM_CAMPUS = 14;
const MAP_ZOOM_CITY = 11;

/**
 * Poligon kadrajının üst sınırı. Tek binalık bir kampüste `fitZoom` 18-19'a
 * fırlıyor ve o ölçekte harita "neresi" sorusunu değil "hangi oda" sorusunu
 * cevaplıyor — çevre bağlamı tamamen kayboluyor.
 */
const MAP_ZOOM_MAX = 16.5;

/** Şekil bandın kenarlarına yapışmasın: üstte pill'ler, altta ilk kart. */
const POLYGON_FIT_PADDING = 32;

/**
 * İstenen görüntünün ölçüsü — DİKEY ve dar.
 *
 * Kutu artık ekrandan DAHA UZUN (bkz. imageTop): ~0.35–0.37 en/boy. `cover`
 * görüntüyü kutuya yüksekliğinden oturttuğu için kareye yakın bir istek
 * yanlardan ağır kırpılır, yani boşuna indirilen piksel olur. 440×1200 o orana
 * yakın; Mapbox tavanı 1280 olduğu için @2x ile birlikte hâlâ sınır içinde.
 */
const MAP_IMAGE_WIDTH = 440;
const MAP_IMAGE_HEIGHT = 1200;

/**
 * Okul figürünün YÜKSEKLİĞİ (genişliği figürün kendi oranından türüyor).
 *
 * ⚠️ BU SAYI FİGÜRÜN GEOMETRİSİNE BAĞLI, serbest bir tercih değil. Kampüs
 * noktası bandın ORTASINDA duruyor, yani çapanın üstüne de altına da en fazla
 * `FEED_MAP_BAND_HEIGHT / 2` = 60 kalıyor; taşarsa figür ya pill satırının
 * arkasına girer ya ilk kartın altında kaybolur.
 *
 * Diorama (parsel + ağaçlar) geldiğinde eski 86 geçersiz kaldı: çapa artık
 * boyun %70'inde değil %58'inde (parsel çapanın ALTINA uzuyor). 100 → üstte
 * 58.1, altta 41.9, genişlik ~111. İkisi de 60'ın altında ama ÜST PAY İNCE:
 * tavan 103, ondan sonrası bayrağın ucunu pill satırına sokuyor.
 *
 * Geometriyi oynatırsan sayıyı YENİDEN HESAPLA, gözle kestirme:
 *   npx tsc src/features/feed/components/campusFigureGeometry.ts --ignoreConfig \
 *     --target es2020 --module commonjs --outDir /tmp/geo
 *   node -e "const g=require('/tmp/geo/campusFigureGeometry');
 *     console.log(g.CAMPUS_FIGURE_ANCHOR, g.CAMPUS_FIGURE_ASPECT)"
 * (modülün hiç import'u yok, o yüzden tek başına derlenip çalışıyor)
 */
const CAMPUS_FIGURE_HEIGHT = 100;

/**
 * İskeletin sönme süresi.
 *
 * Kısa bilerek: iskelet bir GEÇİŞ değil, bir BEKLEME yüzeyi — uzun bir sönme
 * haritanın altından sırıtırken "iki katman üst üste" okunuyor. 180ms sert
 * kesmeyi yumuşatmaya yetiyor.
 */
const SKELETON_FADE_MS = 180;

/**
 * HARİTANIN SÖNÜMLEMESİ — görüntünün tamamına çekilen ince siyah perde.
 *
 * Mapbox'ın sokak stili (MAPBOX_STYLE_DEFAULT) beyaz zeminli ve kalabalık:
 * tam ekranda ekranın tamamı parlıyordu, akışta da kartların arasından
 * fazla göze çarpıyordu (istek: "mapin üstüne ufak bir siyah overlay ekle,
 * çok parlak").
 *
 * ⚠️ `veil()` DEĞİL `scrimAt()`: perde her iki temada SİYAH. Açık temada
 * beyazlatmak haritayı daha da parlatırdı — uygulamanın medya perdeleri
 * (kart kapağı, kampüs şeridinin bandı) de aynı kuralda.
 *
 * ⚠️ İNCE OLMAK ZORUNDA: yüzeyin tamamı "kampüsüm nerede" sorusu üzerine
 * kurulu ve koyu bir perde sokak adlarını, park lekelerini okunmaz yapıyor.
 * 0.18 parlaklığı alıyor, haritayı yok etmiyor.
 *
 * ⚠️ ANİMASYONSUZ ve her iki hâlde AYNI: ilerlemeye bağlanırsa harita açılıp
 * kapanırken parlaklık da değişir, yani kullanıcı iki ayrı harita görür.
 */
const MAP_DIM_ALPHA = 0.18;

/**
 * AKIŞTAKİ HARİTANIN BULANIKLIĞI — "arka plan" okunuşunu veren şey.
 *
 * Akışta harita bir ZEMİN: gönderiler onun üstünde yüzüyor ve keskin bir sokak
 * haritası kartlarla dikkat için yarışıyordu (istek: "akışta harita üstünde az
 * blur olsun"). Tam ekranda ise harita ASIL İÇERİK, yani blur orada hiç
 * olmamalı — bu yüzden sabit değil, haritanın açılmasıyla çözülüyor.
 *
 * ⚠️ AZ OLMAK ZORUNDA: 14 kampüsün dokusunu (ada, yollar, yeşil alan) bırakıp
 * yalnız detayı yumuşatıyor. 25'in üstünde zemin tanınmaz bir lekeye dönüyor
 * ve "burası benim kampüsüm" okunuşu kayboluyor.
 */
const MAP_OVERVIEW_BLUR = 14;

/**
 * Blur'un AÇILMA süresi — haritanın kendi hareketinden (280ms) BİLEREK UZUN.
 *
 * İstek birebir: "yavaşça blur'u açılsın girersem expanded map'e". Harita
 * yerine oturduktan sonra netleşme bir süre daha devam ediyor, yani hareket
 * "ekran açıldı" değil "odaklandı" gibi okunuyor.
 *
 * ⚠️ GERİ GELİŞİ UZUN DEĞİL: kapanışta harita 280ms'de akışın arkasına
 * dönüyor ve blur ondan geride kalırsa kullanıcı akışa döndüğünde zeminin
 * netten bulanığa kaydığını görür — kapanış `MAP_MOTION_MS` ile eş.
 */
const MAP_FOCUS_MS = 760;

/**
 * İskeletin güvenlik ağı — bu süre sonunda harita ne hâldeyse açılıyor
 * (gerekçe `forcedUri`de). 2.5sn: yavaş bağlantıda Mapbox görüntüsü için makul
 * bir pay, kullanıcıyı "ekran bozuk" demeye götürecek kadar uzun değil.
 */
const SKELETON_WATCHDOG_MS = 2500;

const FeedMapStrip = memo(function FeedMapStrip({
  domain,
  option,
  expandProgress,
  pullProgress,
  heroHeight,
  bandHeight = FEED_MAP_BAND_HEIGHT,
  expandedBottomInset = 0,
  boundary = null,
}: FeedMapStripProps) {
  const { width: windowWidth, height: windowHeight } = useWindowDimensions();
  /**
   * KATMANIN KENDİ YÜKSEKLİĞİ — `useWindowDimensions()` DEĞİL.
   *
   * Aşağıdaki iki hesap (görüntünün kayması ve kampüsün ekrandaki y'si) bu
   * katmanın KOORDİNAT UZAYINDA çalışıyor: çocukların `top`/`bottom` değerleri
   * katmana göre. Pencere yüksekliği onunla aynı OLMAK ZORUNDA DEĞİL —
   * sayfa opak bir tab bar'ın üstünde bitiyorsa, iPad'de bölünmüş görünümde
   * ya da Android'de pencere dekorasyonu farklıysa aradaki fark kampüs
   * noktasını FARKIN YARISI kadar kaydırır ve figür haritadaki okulun yanına
   * düşer.
   *
   * Ölçüm gelene kadar pencere yüksekliği yaklaşık değer: ilk karede figür
   * zaten çizilmiyor (`heroReady` chrome ölçümünü de bekliyor), yani sıçrama
   * görünmüyor.
   */
  const [layerHeight, setLayerHeight] = useState(0);
  const viewportHeight = layerHeight || windowHeight;

  const coordinate = useMemo(
    () => resolveUniversityCoordinate(domain, option),
    [domain, option],
  );

  // ⚠️ `isLight()` BAĞIMLILIKTA: tema değişince URL yenilenmeli (stil
  // değişiyor). Palet mutable olduğu için değer render'da okunuyor.
  const light = isLight();

  // Ölçüm gelmeden perde ve görüntünün kayması hesaplanamaz; harita yine
  // çiziliyor — zeminin bir kare için düz renk kalması gereksiz bir sıçrama
  // olurdu.
  const heroReady = heroHeight > 0 && layerHeight > 0;

  // ── 1) GÖRÜNTÜ KUTUSU ─────────────────────────────────────────────────────
  /**
   * ⚠️ SIRA: KUTU ÖNCE, KADRAJ SONRA — tersi çalışmıyor.
   *
   * Poligonun banda sığdığı zoom, kutunun `cover` ÖLÇEĞİNDEN türüyor (ekranda
   * gördüğümüz piksel haritanın kendi pikseli değil). Kadraj önce yazıldığında
   * o ölçek henüz bilinmediği için kutunun yüksekliği `viewportHeight`
   * varsayılıyordu; kutu aslında ondan `-imageTop` kadar UZUN. Sapma iPhone
   * ölçülerinde küçük (~%0.6, ölçek orada genişlikten bağlı) ama kutu bir de
   * sheet payı kadar uzatıldığında %9'a çıkıyordu — yani hata tek başına
   * görünmüyor, ikinci bir değişiklikle birlikte ortaya çıkıyordu. Ölçek artık
   * kutunun kendisinden okunuyor, tahmin edilmiyor.
   *
   * Hesabın kendisi `feedMapFraming`de: dört girdiden türeyen dört çıktı ve
   * aralarındaki "kutu sheet payından BAĞIMSIZ" değişmezi testle çivili
   * (bu dosyada yaşarken bir regresyon üretti, gerekçe orada).
   */
  const { imageTop, boxHeight, campusScreenY, mapShift } = feedMapFraming({
    heroHeight,
    bandHeight,
    viewportHeight,
    expandedBottomInset,
    ready: heroReady,
  });

  /**
   * Ekran pt / harita px oranı. `contentFit="cover"` ile BİREBİR aynı hesap;
   * hem poligonun çizimi hem sığdığı zoom buna bağlı.
   */
  const mapScale = coverScale({
    imageWidth: MAP_IMAGE_WIDTH,
    imageHeight: MAP_IMAGE_HEIGHT,
    boxWidth: windowWidth,
    boxHeight,
  });

  // ── 2) KADRAJ ─────────────────────────────────────────────────────────────
  /**
   * ⚠️ TEK KAYNAK: hem URL'e hem poligon projeksiyonuna bu gidiyor. İkisi
   * ayrışırsa poligon haritadan farklı ölçekte çizilir ve hata "biraz kaymış"
   * gibi görünür, sebebi görünmez.
   *
   * Poligon varsa merkez ve zoom SINIRDAN türüyor: şekil, pill'lerin altında
   * açıkta kalan BANDIN içine tam oturuyor. Sabit 14 kullanılsaydı Boğaziçi
   * gibi küçük bir kampüs bandın ortasında kaybolur, ODTÜ gibi 4 km² bir
   * kampüs ise banttan taşardı — iki uç aynı sayıyla idare edilemiyor.
   *
   * ⚠️ Bant yüksekliği KÜÇÜK (120pt) ve sınırlayıcı eksen genelde o. Genişlik
   * ekran kadar, yani yatay uzanan bir kampüs bile dikeyde sıkışıyor.
   */
  const framing = useMemo(() => {
    const fallbackZoom = coordinate?.isApproximate
      ? MAP_ZOOM_CITY
      : MAP_ZOOM_CAMPUS;
    if (!coordinate) return { zoom: fallbackZoom, lat: 0, lon: 0 };

    const geometry = boundary?.polygon ?? null;
    const bounds = geometry ? geometryBounds(geometry) : null;
    if (!bounds) {
      return {
        zoom: fallbackZoom,
        lat: coordinate.latitude,
        lon: coordinate.longitude,
      };
    }

    return {
      ...boundsCenter(bounds),
      zoom: fitZoom({
        bounds,
        viewportWidth: windowWidth,
        viewportHeight: bandHeight,
        scale: mapScale,
        // Şekil bandın kenarlarına yapışmasın; üstte pill'ler, altta ilk kart.
        padding: POLYGON_FIT_PADDING,
        minZoom: MAP_ZOOM_CITY,
        // Tek binalık bir kampüste zoom 18'e fırlamasın — o ölçekte harita
        // "neresi" sorusunu değil "hangi oda" sorusunu cevaplar.
        maxZoom: MAP_ZOOM_MAX,
      }),
    };
  }, [bandHeight, boundary?.polygon, coordinate, mapScale, windowWidth]);

  const mapZoom = framing.zoom;
  const mapUri = useMemo(() => {
    if (!coordinate) return null;
    return buildMapboxStaticUrl({
      // ⚠️ MERKEZ POLİGONUN ORTASI (varsa), kampüs noktası değil: istenen şey
      // şeklin bantta ortalanması.
      latitude: framing.lat,
      longitude: framing.lon,
      // Yaklaşık koordinat (il merkezi) ŞEHİR ölçeğinde — gerekçe sabitlerde.
      zoom: mapZoom,
      // Mapbox'ın kendi sokak haritası — Studio stillerimiz kampüs okumak için
      // fazla boş (gerekçe mapbox.ts > MAPBOX_STYLE_DEFAULT).
      style: MAPBOX_STYLE_DEFAULT,
      // ⚠️ DİKEY İSTENİYOR, eski 600×240 DEĞİL: görüntü ekranın tamamını
      // kaplıyor ve kutusu ekrandan da uzun (bkz. imageTop).
      width: MAP_IMAGE_WIDTH,
      height: MAP_IMAGE_HEIGHT,
    });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [coordinate, framing.lat, framing.lon, light, mapZoom]);

  /**
   * Poligonun projeksiyon argümanları — görüntü kutusunun GERÇEK ölçüsü.
   *
   * Kutu `top: imageTop, bottom: 0` ile tanımlı, yani yüksekliği
   * `viewportHeight - imageTop`. Poligon `cover` ölçeğini bu kutudan
   * hesaplıyor; kutu değişirse (tema, ekran) şekil kendiliğinden uyuyor.
   *
   * ⚠️ Sheet'in payı buraya GİRMİYOR — kutu artık ondan bağımsız (gerekçe
   * `mapShift`te).
   */
  const projection = useMemo(
    () =>
      coordinate
        ? {
            // ⚠️ URL'dekiyle AYNI merkez ve zoom — ayrışırsa poligon kayar.
            centerLat: framing.lat,
            centerLon: framing.lon,
            zoom: mapZoom,
            imageWidth: MAP_IMAGE_WIDTH,
            imageHeight: MAP_IMAGE_HEIGHT,
            boxWidth: windowWidth,
            boxHeight,
          }
        : null,
    [
      boxHeight,
      coordinate,
      framing.lat,
      framing.lon,
      mapZoom,
      windowWidth,
    ],
  );

  /**
   * Blur bandın İÇİNE bu kadar sarkıp orada sönüyor — pill'lerin bittiği
   * çizgide sert bir kenar kalmasın diye. Bandın yarısından küçük olmak
   * zorunda, yoksa kampüsün üstü bulanıklaşır.
   */
  const blurHeight = Math.max(heroHeight - bandHeight + BLUR_FADE_OVERLAP, 0);
  const blurMask = {
    colors: BLUR_MASK_COLORS,
    locations: BLUR_MASK_LOCATIONS,
  };

  /** Sınır varsa poligon, yoksa diorama — ikisi birden ÇİZİLMİYOR. */
  const showPolygon = Boolean(boundary?.polygon) && Boolean(projection);

  // ── Kampüs değişimi: yönlü süzülme + çapraz geçiş ────────────────────────
  /**
   * Kadraj değiştiğinde ESKİ görüntü ekranda kalıp gidilecek yönde süzülerek
   * çıkıyor, YENİ görüntü aynı yönden geliyor.
   *
   * ⚠️ Bu bir "fly-to" DEĞİL ve olamaz: harita statik bir görüntü, iki kampüs
   * arasındaki coğrafyayı render edemiyoruz (uzun gerekçe
   * `CampusMapTransition`da). Hareket coğrafi olarak DOĞRU YÖNDE ama mesafesi
   * sembolik.
   *
   * Eğri `Easing.inOut(cubic)`: yavaş başlıyor, ortada hızlanıyor, varmaya
   * yakın yavaşlıyor — istenen his bu.
   */
  type MapSnapshot = {
    uri: string;
    projection: CampusProjectionArgs | null;
    geometry: CampusGeometry | null;
    center: { lat: number; lon: number };
    /**
     * HANGİ KAMPÜS. Kadrajın kimliği DEĞİL — kadraj aynı kampüs için de
     * değişiyor (bkz. aşağıdaki `sameCampus` kapısı).
     */
    campus: string | null;
  };

  const current: MapSnapshot | null = mapUri
    ? {
        uri: mapUri,
        projection,
        geometry: showPolygon ? (boundary?.polygon ?? null) : null,
        center: { lat: framing.lat, lon: framing.lon },
        campus: domain,
      }
    : null;

  const [previous, setPrevious] = useState<MapSnapshot | null>(null);
  const lastRef = useRef<MapSnapshot | null>(null);
  const transition = useSharedValue(1);
  const vectorRef = useRef<{ dx: number; dy: number; distance: number } | null>(
    null,
  );

  useEffect(() => {
    const last = lastRef.current;
    lastRef.current = current;
    if (!current) return;
    // İlk mount'ta geçiş YOK — açılışta ekranın kayması anlamsız.
    if (!last || last.uri === current.uri) return;

    /**
     * ⚠️ YÖNLÜ SÜZÜLME YALNIZ KAMPÜS DEĞİŞİNCE.
     *
     * Kadraj aynı kampüs için de değişiyor: sınır poligonu sonradan geliyor ve
     * geldiğinde merkez kampüs NOKTASINDAN poligonun ORTASINA, zoom da sabit
     * 14'ten `fitZoom`a atlıyor. İki merkez arasında birkaç yüz metre fark
     * olduğu için yön hesabı çalışıyor ve harita ekranın üçte biri kadar
     * süzülüyordu — yani kullanıcı başka bir kampüse geçmediği hâlde haritayı
     * yana kayarken görüyordu. Poligon yalnız harita bir kez tam ekrana
     * açıldıktan sonra geldiği için belirti de tam oradaydı: "bir kere girip
     * çıkınca harita oynuyor".
     *
     * ⚠️ AYNI KAMPÜSTE ARTIK HİÇ ANİMASYON YOK — İSKELET VAR.
     *
     * Çapraz sönme de denendi ve istenmedi: kullanıcının gördüğü şey "harita
     * kıpırdıyor, yerine oturuyor" oluyordu. Kadrajın toparlanması bir HAREKET
     * değil, bir YÜKLENME — gösterilecek doğru şey hareket değil iskelet
     * (bkz. aşağıdaki `mapSettled`). Yeni URL sessizce takılıyor, iskelet
     * görüntü inene kadar üstünü kapatıyor.
     *
     * Yönlü süzülme YALNIZ gerçek kampüs değişiminde kalıyor: orası kullanıcının
     * bilinçli aksiyonu ve hareketin kendisi "oraya gidiyoruz" diyor.
     */
    const sameCampus = last.campus === current.campus;
    if (sameCampus) {
      vectorRef.current = null;
      return;
    }

    vectorRef.current = campusTransitionVector(
      last.center,
      current.center,
      windowWidth,
    );
    setPrevious(last);
    transition.value = 0;
    transition.value = withTiming(
      1,
      { duration: TRANSITION_MS, easing: Easing.inOut(Easing.cubic) },
      (finished) => {
        // Eski katman animasyon BİTİNCE sökülüyor: erken kaldırılsa yerine
        // bir kare boşluk düşerdi.
        if (finished) runOnJS(setPrevious)(null);
      },
    );
    // `current` her render'da yeni bir nesne; kimlik olarak URI yeterli.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [mapUri, windowWidth]);

  /**
   * Giden kadraj: yöne doğru süzülüp küçülerek sönüyor.
   *
   * ⚠️ ÖLÇEK YALNIZ KAMPÜS DEĞİŞİMİNDE (yani yön varken). Aynı kampüsün kadrajı
   * toparlanırken (bkz. `sameCampus`) ölçek KÜÇÜLTMEK demek ve bu katmanın
   * ARKASINDA harita yok — ekranın zemini var. 0.92'lik ölçek görüntüyü
   * kenarlardan içeri çekip o zemini açıyordu: kullanıcının gördüğü şey
   * "harita yanlardan siyah olup ekrana oturuyor"du. Belirti ilk açılışa
   * özgüydü çünkü URL'in değiştiği tek yer orası: soğuk başlangıçta kadraj ilk
   * olarak koordinat + sabit zoom'dan kuruluyor, sınır poligonu indiğinde
   * `fitZoom`a geçiyor (disk kopyası olan ikinci açılışta URL hiç değişmiyor,
   * o yüzden "ilk").
   *
   * Aynı kampüste geçiş artık SAF ÇAPRAZ SÖNME — "kadraj toparlandı" okunuşu
   * ölçeğe ihtiyaç duymuyor, siyah kenar ise tasarımda hiç yok.
   */
  const outgoingStyle = useAnimatedStyle(() => {
    const v = vectorRef.current;
    const p = transition.value;
    const slide = v ? v.distance * p : 0;
    return {
      opacity: 1 - p,
      // `as any`: farklı şekilli transform girdileri birleşim tipi doğuruyor ve
      // Reanimated'ın `DefaultStyle`ına oturmuyor (SwipeOverlay'deki aynı kaçış).
      transform: [
        { translateX: v ? -v.dx * slide : 0 },
        { translateY: v ? -v.dy * slide : 0 },
        { scale: v ? 1 - (1 - TRANSITION_SCALE) * p : 1 },
      ] as any,
    };
  });

  /**
   * AKIŞTA BULANIK, TAM EKRANDA NET — kendi süresiyle.
   *
   * ⚠️ `expandProgress`e DOĞRUDAN bağlanmadı (ör. `opacity: 1 - progress`):
   * istenen şey netleşmenin haritadan DAHA YAVAŞ olması (gerekçe
   * `MAP_FOCUS_MS`te) ve doğrudan bağlanan bir opaklık haritayla aynı 340ms'de
   * biter. Bu yüzden eşik geçildiğinde kendi `withTiming`i başlıyor.
   *
   * ⚠️ `useAnimatedReaction` UI thread'de koşuyor ve `prev` ilk turda `null`:
   * karşılaştırma onu da yutmak zorunda, yoksa mount anında bir animasyon
   * tetiklenir (akışta blur'un bir kez "açılıp kapanması").
   *
   * ⚠️ Söndürme OPAKLIKLA ve bu GÜVENLİ: katman `expo-blur` materyali, SwiftUI
   * `GlassView` DEĞİL (onda ata zincirindeki opacity<1 efekti sessizce hiç
   * çizdirmiyor). Üstteki okunabilirlik bandı da tam olarak böyle sönüyor.
   */
  const blurReveal = useSharedValue(1);

  /**
   * Blur'un HEDEFİ — 0 (net) ya da 1 (bulanık).
   *
   * Yön değişimini bir kez yakalamak için: koşul `blurReveal`e bakamaz (o
   * animasyon boyunca değişiyor ve her karede yeni bir `withTiming` açardı).
   */
  const blurTarget = useSharedValue(1);

  useAnimatedReaction(
    () => expandProgress.value,
    (p, prev) => {
      if (prev === null) return;

      /**
       * ⚠️ EŞİK DEĞİL YÖN. Burada bir eşik vardı (`ilerleme > 0.02`) ve
       * KAPANIŞTA gözle görülür bir hata üretiyordu: eşik ancak animasyonun
       * SONUNDA, ilerleme sıfıra yaklaşırken geçiliyor; yani bulanıklık akış
       * geri geldikten SONRA 280ms boyunca açılıyordu. Kullanıcının tarifi
       * "expanded'den çıkınca üstteki blur çok sonra geliyor"du.
       *
       * Yön okuması ikisini birden çözüyor: ilerleme ARTIYORSA (açılış
       * başladı) blur çözülmeye başlıyor, AZALIYORSA (kapanış başladı) geri
       * gelmeye. Kapanış 1'den düşmeye başladığı an tetiklendiği için
       * bulanıklık chrome'la (başlık + pill satırı) AYNI ANDA yerine oturuyor.
       *
       * Yarıda kesilen hareketler de kendiliğinden doğru: eşik tabanlı kurgu
       * 0.6'dan dönen bir kapanışı hiç görmüyordu, yön her turda görüyor.
       */
      if (p > prev && blurTarget.value !== 0) {
        blurTarget.value = 0;
        blurReveal.value = withTiming(0, {
          duration: MAP_FOCUS_MS,
          easing: Easing.out(Easing.cubic),
        });
        return;
      }
      if (p < prev && blurTarget.value !== 1) {
        blurTarget.value = 1;
        // ⚠️ GERİ GELİŞ HARİTANIN SÜRESİYLE: akış 280ms'de dönüyor ve blur
        // ondan yavaş olursa kullanıcı zemini netken görüp sonra bulanıklaşmasını
        // izliyor.
        blurReveal.value = withTiming(1, {
          duration: MAP_MOTION_MS,
          easing: mapMotionEasing,
        });
      }
    },
  );

  /**
   * İKİ BLUR'UN TEK OPAKLIĞI — yavaş eğri × çekmenin payı.
   *
   * ⚠️ İki katman (haritanın geneli ve üstteki okunabilirlik bandı) AYNI
   * değerden sürülüyor. Ayrı yazıldıkları dönemde biri çekmeye bağlıydı, diğeri
   * doğrudan ilerlemeye — ekranın üstü bir anda açılırken zemin yavaşça
   * netleşiyordu, yani tek bir hareket iki hızda görünüyordu.
   *
   * Çarpanların işi ayrı:
   *   • `blurReveal` — eşik geçildikten sonraki YAVAŞ çözülme (MAP_FOCUS_MS),
   *   • `pullProgress` — parmağın sürdüğü erken kısım (MAP_PULL_SHARE).
   * Çekme geri alınırsa ikinci çarpan kendiliğinden 1'e dönüyor; ayrı bir
   * "iptal" yolu yok.
   */
  const blurDim = useDerivedValue(
    () =>
      blurReveal.value *
      (1 - (pullProgress ? pullProgress.value * MAP_PULL_SHARE : 0)),
  );
  const overviewBlurStyle = useAnimatedStyle(() => ({
    opacity: blurDim.value,
  }));

  /**
   * ÜSTTEKİ OKUNABİLİRLİK BANDI — genel bulanıklıkla AYNI DEĞERDEN sönüyor.
   *
   * Blur'un tek işi üstündeki chrome'u (sekme şeridi, başlık, pill'ler) okunur
   * kılmak. Tam ekran hâlde o chrome yukarı kayıp ekrandan çıkıyor, yani blur
   * okunacak bir şey kalmadığı hâlde haritanın tepesini perdeliyor olurdu —
   * asıl gösterilmek istenen şeyin üstünde.
   *
   * ⚠️ `1 - expandProgress` DEĞİL, `blurReveal`: doğrudan ilerlemeye bağlıyken
   * bant haritanın 280ms'lik hareketiyle sönüyordu ve ekranın üstü "bir anda
   * açılıyor" gibi okunuyordu (şikâyet birebir buydu). Artık genel
   * bulanıklığın yavaş eğrisini (bkz. MAP_FOCUS_MS) paylaşıyor: iki blur tek
   * değerden sürüldüğü için ayrı ayrı ayarlanamaz ve ayrışamaz.
   *
   * ⚠️ Opaklıkla söndürmek burada GÜVENLİ: bu `expo-blur` materyali, SwiftUI
   * `GlassView` DEĞİL (onda ata zincirindeki `opacity<1` efekti sessizce hiç
   * çizdirmiyor). `ScreenHeader`ın kendi blur zemini de tam olarak böyle
   * söndürülüyor — ev kalıbı bu.
   */
  const blurFadeStyle = useAnimatedStyle(() => ({
    // Haritanın genel bulanıklığıyla AYNI değer (gerekçe `blurDim`de).
    opacity: blurDim.value,
  }));

  /**
   * Gelen kadraj: aynı yönden gelip yerine oturuyor.
   *
   * ⚠️ Ölçek burada da yalnız kampüs değişiminde — gerekçesi `outgoingStyle`da
   * (0.92'den büyüyen görüntü kenarlardan ekranın siyah zeminini açıyor).
   */
  const incomingStyle = useAnimatedStyle(() => {
    const v = vectorRef.current;
    const p = transition.value;
    const slide = v ? v.distance * (1 - p) : 0;
    return {
      opacity: p,
      transform: [
        { translateX: v ? v.dx * slide : 0 },
        { translateY: v ? v.dy * slide : 0 },
        { scale: v ? TRANSITION_SCALE + (1 - TRANSITION_SCALE) * p : 1 },
      ] as any,
    };
  });
  /**
   * TAM EKRANA GEÇERKEN KADRAJIN TOPARLANMASI — harita ve figür AYNI deltayla.
   *
   * Kampüs noktası akışta bandın ortasında (ekranın üst üçte biri); tam ekranda
   * sheet'in üstünde kalan alanın ortasına geliyor. Delta `feedMapFraming`den
   * (kapsama paylarına kırpılmış).
   *
   * ⚠️ İKİ AYRI HOOK, tek stil iki bileşene VERİLMİYOR: Reanimated aynı
   * animasyonlu stilin paylaşılmasından şikâyet ediyor (ve paylaşılan stil bir
   * bileşen unmount olduğunda diğerinde bozuluyor).
   *
   * ⚠️ Hook'lar `mapUri` kapısının ÜSTÜNDE: koordinat yoksa katman hiç
   * çizilmiyor ama hook sayısı render'dan render'a değişemez.
   *
   * ⚠️ Figür haritayla AYNI deltayı almak zorunda, yoksa tam ekrana geçerken
   * bina kendi noktasından kopar.
   */
  const imageExpandStyle = useAnimatedStyle(() => ({
    transform: [{ translateY: expandProgress.value * mapShift }],
  }));
  const figureExpandStyle = useAnimatedStyle(() => ({
    transform: [{ translateY: expandProgress.value * mapShift }],
  }));

  /**
   * ── HARİTA "KENDİNE GELENE" KADAR İSKELET ─────────────────────────────────
   *
   * İstek: kullanıcı haritanın kuruluşunu izlemesin. Kuruluş üç adımdan
   * oluşuyor ve üçü de ayrı anlarda tamamlanıyor:
   *   1. ÖLÇÜMLER (`heroReady`) — chrome'un yüksekliği ve katmanın boyu. Bunlar
   *      gelmeden kutu kaydırılmıyor, yani görüntü bir kare yanlış yerde durur.
   *   2. KADRAJ — sınır poligonu indiğinde merkez/zoom değişiyor, yani URL
   *      değişiyor (soğuk başlangıçta bir kez).
   *   3. GÖRÜNTÜNÜN KENDİSİ — Mapbox'tan inip çözülene kadar kutu BOŞ, yani
   *      arkasındaki zemin (siyah) görünüyor.
   * Üçü bitmeden ekranda "kıpırdayan, yerine oturan" bir harita vardı; artık
   * onun yerinde shimmer'lı bir iskelet duruyor.
   *
   * ⚠️ `loadedUri` KARŞILAŞTIRMALI tutuluyor, boolean DEĞİL: kadraj değişince
   * yüklenen URL bayatlıyor ve iskelet yeni görüntü inene kadar geri gelmek
   * zorunda (yoksa aradaki boşlukta yine siyah kutu görünür).
   *
   * ⚠️ `previous` varken iskelet YOK: o yalnız gerçek kampüs değişiminde
   * doluyor ve orada ekranda ESKİ harita duruyor — üstünü iskeletle kapatmak
   * bilinçli bir aksiyonun hareketini öldürürdü.
   */
  const [loadedUri, setLoadedUri] = useState<string | null>(null);

  /**
   * GÜVENLİK AĞI — iskelet EKRANDA KALICI OLAMAZ.
   *
   * İki kapısı da sessizce gelmeyebilir: `onLoad` görüntü katmanı geri
   * bildirimsiz düşerse hiç tetiklenmiyor, `heroReady` ise iki `onLayout`a
   * bağlı. İkisinden biri gelmezse eski davranış "harita biraz yanlış yerde"
   * iken yenisi "harita HİÇ YOK" olurdu — kabul edilemez takas. Süre dolunca
   * elimizdeki ne varsa açılıyor (perde + figür, görüntü inince o da gelir).
   *
   * Bayrak URL BAŞINA: kadraj değişince yeni görüntü için ağ sıfırdan kuruluyor.
   */
  const [forcedUri, setForcedUri] = useState<string | null>(null);
  const mapSettled =
    (heroReady && loadedUri !== null && loadedUri === mapUri) ||
    (mapUri !== null && forcedUri === mapUri);
  const skeletonWanted = !mapSettled && previous === null;

  useEffect(() => {
    if (mapSettled || !mapUri) return;
    const id = setTimeout(() => setForcedUri(mapUri), SKELETON_WATCHDOG_MS);
    return () => clearTimeout(id);
  }, [mapSettled, mapUri]);

  /**
   * İskelet SÖNEREK kalkıyor (sert bir pop yerine), o yüzden mount'u kendi
   * state'inde: animasyon bitmeden sökülürse harita bir karede pat diye
   * belirir.
   */
  const [skeletonMounted, setSkeletonMounted] = useState(true);
  const skeletonFade = useSharedValue(1);
  useEffect(() => {
    if (skeletonWanted) {
      setSkeletonMounted(true);
      skeletonFade.value = 1;
      return;
    }
    skeletonFade.value = withTiming(
      0,
      { duration: SKELETON_FADE_MS, easing: Easing.out(Easing.cubic) },
      (finished) => {
        if (finished) runOnJS(setSkeletonMounted)(false);
      },
    );
  }, [skeletonFade, skeletonWanted]);

  const skeletonFadeStyle = useAnimatedStyle(() => ({
    opacity: skeletonFade.value,
  }));

  if (!mapUri) return null;

  return (
    /* Katman EKRANIN TAMAMINI kaplıyor (istek): zeminin dibi de harita.
       Kartlar opak olduğu için üstünden geçiyor, boşluklardan harita görünüyor;
       liste kısaysa dipte de harita kalıyor. */
    <View
      pointerEvents="none"
      style={StyleSheet.absoluteFill}
      onLayout={(e) => {
        const h = e.nativeEvent.layout.height;
        // Aynı değeri tekrar yazmak gereksiz render doğuruyor.
        setLayerHeight((prev) => (Math.abs(prev - h) < 0.5 ? prev : h));
      }}
    >
      {/* 1. Harita — kutusu ekrandan UZUN ve yukarı kaymış, kampüs böylece
          bandın ortasına geliyor (gerekçe `imageTop`te); tam ekrana açılırken
          kadraj ortalanıyor (`imageExpandStyle`). */}
      <Animated.View
        style={[
          {
            position: "absolute",
            left: 0,
            right: 0,
            top: imageTop,
            bottom: 0,
          },
          imageExpandStyle,
        ]}
      >
        {/* GİDEN KADRAJ — yalnız kampüs değişiminde var. Kendi poligonuyla
            birlikte sönüyor: yalnız görüntü taşınsaydı şekil geçişin ilk
            karesinde pat diye kaybolurdu. */}
        {previous ? (
          <Animated.View
            pointerEvents="none"
            style={[StyleSheet.absoluteFill, outgoingStyle]}
          >
            <Image
              source={{ uri: previous.uri }}
              style={StyleSheet.absoluteFill}
              contentFit="cover"
              cachePolicy="memory-disk"
              recyclingKey={previous.uri}
            />
            {previous.geometry && previous.projection ? (
              <CampusPolygonOverlay
                geometry={previous.geometry}
                projection={previous.projection}
              />
            ) : null}
          </Animated.View>
        ) : null}

        <Animated.View
          pointerEvents="none"
          style={[StyleSheet.absoluteFill, incomingStyle]}
        >
          <Image
            source={{ uri: mapUri }}
            style={StyleSheet.absoluteFill}
            contentFit="cover"
            // URL stil sürümünü taşıyor (MAPBOX_STYLE_VERSION), yani cache
            // anahtarı stil yayınlandığında kendiliğinden tazeleniyor.
            cachePolicy="memory-disk"
            recyclingKey={mapUri}
            // ⚠️ `transition` YOK: çapraz geçişi biz sürüyoruz, expo-image'ın
            // kendi sönmesi üstüne binince iki ayrı eğri çakışıyor.
            //
            // ⚠️ İSKELETİN KALKMA SİNYALİ BU. Hangi URL'in indiği kaydediliyor,
            // "indi mi" bayrağı DEĞİL: kadraj değişince eski kayıt bayatlamalı
            // (gerekçe `mapSettled`te). Önbellekten gelen görüntüde de
            // tetikleniyor, yani ikinci açılışta iskelet bir kare görünüp
            // kalkıyor.
            onLoad={() => setLoadedUri(mapUri)}
            // ⚠️ HATA DA "OTURDU" SAYILIYOR: ağ yoksa gelecek bir görüntü de
            // yok, iskeleti süresiz tutmak ekranı kalıcı olarak yükleniyor
            // gösterirdi. Perde ve figür çiziliyor — çevrimdışı eski davranış.
            onError={() => setLoadedUri(mapUri)}
          />

          {/* ⚠️ POLİGON HARİTANIN KARDEŞİ VE AYNI KUTUNUN İÇİNDE. Ayrı bir
              katmana konsaydı tam ekrana geçerken kadraj kayarken haritadan
              ayrılırdı — şekil coğrafi olarak görüntünün merkezine bağlı. */}
          {showPolygon && projection && boundary?.polygon ? (
            <CampusPolygonOverlay
              geometry={boundary.polygon}
              projection={projection}
            />
          ) : null}
        </Animated.View>
      </Animated.View>

      {/* 2. SÖNÜMLEME — haritanın tamamına, SABİT (gerekçe MAP_DIM_ALPHA'da).
          ⚠️ GÖRÜNTÜ KUTUSUNUN DIŞINDA, onun çocuğu DEĞİL: kutu tam ekrana
          geçerken `translateY` ile kayıyor ve perde onunla birlikte kayarsa
          kayma payı kadar bir ucu sönümsüz kalırdı. Katmanın tamamını
          kaplıyor, yani kutu nereye kayarsa kaysın perde yerinde.
          ⚠️ POLİGONUN ÜSTÜNDE (o kutunun içinde) ama FİGÜRÜN ALTINDA: okul
          figürü bir işaret, perdenin onu soluklaştırması istenmiyor. */}
      <View
        pointerEvents="none"
        style={[
          StyleSheet.absoluteFill,
          { backgroundColor: scrimAt(MAP_DIM_ALPHA) },
        ]}
      />

      {/* 3. GENEL BULANIKLIK — akışta var, tam ekranda çözülüyor.
          Gerekçe MAP_OVERVIEW_BLUR / MAP_FOCUS_MS'te.

          ⚠️ FİGÜRÜN ALTINDA: okul figürü bir işaret, bulanıklaşmamalı. Poligon
          ise görüntünün kutusunda, yani zeminle birlikte yumuşuyor — o haritanın
          bir parçası.

          ⚠️ KUTUNUN DIŞINDA (sönümlemeyle aynı gerekçe): kutu tam ekrana
          geçerken kayıyor, blur onunla kayarsa kayma payı kadar bir uç keskin
          kalırdı. */}
      <Animated.View
        pointerEvents="none"
        style={[StyleSheet.absoluteFill, overviewBlurStyle]}
      >
        <BlurView
          intensity={MAP_OVERVIEW_BLUR}
          tint={chromeBlurTint()}
          style={StyleSheet.absoluteFill}
        />
      </Animated.View>

      {/* 4. PROGRESSIVE BLUR — ekranın tepesinden pill'lerin altına.
          Sekme şeridi, büyük başlık ve pill satırı bunun üstünde duruyor.

          ── Neden düz perde değil, blur ──────────────────────────────────────
          Harita artık Mapbox'ın SOKAK stili: altında yol çizgileri, park
          lekeleri, bina adları var. Düz alfalı bir perde (eski hâli) o dokuyu
          soluklaştırıyor ama DESENİNİ bırakıyordu — ince beyaz yol çizgileri
          başlığın harflerinin arasından geçiyordu. Blur deseni ÇÖZÜYOR.

          Kalıp `ScreenHeader`ın başlık blur'uyla aynı — maske + veil + materyal
          blur — ama DAHA UZUN: orada bant safe-area + 90pt, burada pill'lerin
          altına kadar iniyor.

          ⚠️ Blur BANDA TAŞMIYOR: maske pill'lerin bittiği çizgiden önce sönüyor
          (`BLUR_FADE_OVERLAP` kadar bandın içine sarkıp orada bitiyor). Banda
          taşsaydı asıl gösterilmek istenen şeyi — kampüsün kendisini —
          bulanıklaştırırdı. */}
      {heroReady ? (
        <Animated.View
          pointerEvents="none"
          style={[
            {
              position: "absolute",
              top: 0,
              left: 0,
              right: 0,
              height: blurHeight,
            },
            blurFadeStyle,
          ]}
        >
          <MaskedView
            maskElement={
              <LinearGradient
                colors={blurMask.colors as any}
                locations={blurMask.locations as any}
                style={StyleSheet.absoluteFill}
              />
            }
            style={StyleSheet.absoluteFill}
          >
            {/* Derinlik perdesi: koyu temada karartıyor, açıkta AYNI oranlarla
                beyazlatıyor. Üstteki maske siyah/şeffaf kalıyor — o bir ALFA
                maskesi, renk değil. */}
            <LinearGradient
              colors={[veil(0.92), veil(0.15)]}
              style={StyleSheet.absoluteFill}
            />
            <BlurView
              intensity={22}
              tint={chromeBlurTint()}
              style={StyleSheet.absoluteFill}
            />
          </MaskedView>
        </Animated.View>
      ) : null}

      {/* 5. İZOMETRİK OKUL FİGÜRÜ — kampüsün TAM durduğu noktada.
          `top` çapanın oranıyla geri alınıyor: binanın OTURDUĞU yer kutunun
          ortası değil (figür yukarı uzuyor), bkz. CAMPUS_FIGURE_ANCHOR.
          Haritayla AYNI deltayla kayıyor, yoksa tam ekrana geçerken bina
          noktasından kopardı.

          ⚠️ Perdeden SONRA: perde figürün üstünden geçse bina tepeye yakın
          kısmında soluklaşırdı. */}
      {heroReady && !showPolygon ? (
        <Animated.View
          style={[
            {
              position: "absolute",
              left: 0,
              right: 0,
              top:
                campusScreenY - CAMPUS_FIGURE_HEIGHT * CAMPUS_FIGURE_ANCHOR.y,
              alignItems: "center",
            },
            figureExpandStyle,
          ]}
        >
          <CampusFigure height={CAMPUS_FIGURE_HEIGHT} />
        </Animated.View>
      ) : null}

      {/* 6. İSKELET — HARİTA KURULANA KADAR KATMANIN TAMAMI.
          ⚠️ EN SONDA, yani katmanın her şeyinin ÜSTÜNDE: görüntü, perde ve
          figür/poligon birlikte kapanmak zorunda. Figür ölçümlerle birlikte
          belirdiği için ayrı bırakılsa iskeletin üstünde tek başına duran bir
          bina görünürdü.

          Chrome (sekme şeridi, başlık, pill'ler) bu katmanın DIŞINDA ve
          üstünde kalıyor — iskelet düz bir yüzey olduğu için metin okunur,
          perdeye ihtiyaç yok.

          ⚠️ Zemin `surface`: `bg` ile çizilse iskelet ekranın zemininden
          ayırt edilemez, yani "yükleniyor" demek yerine "harita yok" derdi.
          Shimmer `SkeletonBox`tan — uygulamadaki tüm iskeletlerin kalıbı. */}
      {skeletonMounted ? (
        <Animated.View
          pointerEvents="none"
          style={[StyleSheet.absoluteFill, skeletonFadeStyle]}
        >
          <SkeletonBox
            width="100%"
            height="100%"
            borderRadius={0}
            style={StyleSheet.absoluteFill}
          />
        </Animated.View>
      ) : null}
    </View>
  );
});

export default FeedMapStrip;
