import { memo, useMemo } from "react";
import Animated, {
  useAnimatedProps,
  type SharedValue,
} from "react-native-reanimated";
import Svg, { Path } from "react-native-svg";
import { ink } from "@/shared/theme/colors";
import {
  projectCampusGeometry,
  ringPerimeter,
  ringToSubpath,
  type CampusProjectionArgs,
} from "../campusProjection";
import type { CampusGeometry } from "../campusTypes";

/**
 * KAMPÜSÜN GERÇEK SINIRI — haritanın üstüne çizilen poligon.
 *
 * Poligonu olan kampüslerde izometrik diorama'nın (CampusFigure) YERİNE
 * geçiyor. Gerekçe: diorama bir İŞARET, poligon ise BİLGİ — "okul şurada
 * bir yerde" ile "okulun sınırı tam burası" arasındaki fark. Poligon elimizde
 * varken temsilî bir bina çizmek, elde olan bilgiyi saklamak olurdu.
 *
 * ⚠️ GELEN GEOMETRİ GERÇEK SINIR OLMAK ZORUNDA DEĞİL. Poligonu olmayan
 * kampüslerde (sunucuda hâlâ ~25 tane) çağıran `circle` alanından hafifçe
 * BOZULMUŞ bir KARE üretip buraya onu veriyor (istek: "poligon yoksa o
 * bölgeyi kare çiz ama tam düzgün kare olmasın, bi tık boz" — bkz.
 * campusProjection > campusAreaGeometry ve FeedMapStrip > displayGeometry).
 * Bu dosya aradaki farkı GÖRMÜYOR ve görmemeli: ikisi de halka listesi, ikisi
 * de aynı konturla çiziliyor. Diorama yalnız ikisi de yokken (sınır inmedi /
 * il merkezi) kalıyor.
 *
 * ── Şekil haritanın KADRAJINA bağlı ────────────────────────────────────────
 * Çizim Mercator projeksiyonuyla görüntünün merkezinden türüyor
 * (`campusProjection`). Yani kutu kaydığında (tam ekrana geçişte kadraj
 * ortalanıyor) poligon da aynı transform'un içinde kalmak ZORUNDA — çağıran
 * onu haritayla aynı `Animated.View`in çocuğu yapıyor. Ayrı bir katmana
 * konsaydı açılma animasyonu boyunca haritadan kayardı.
 *
 * ── YALNIZ KENAR: DOLGU YOK ────────────────────────────────────────────────
 * Poligon artık bir YÜZEY değil, bir ÇİZGİ (istek: "sadece etrafı çizilsin,
 * border gibi"). Altındaki harita hiçbir yerde perdelenmiyor; sınır bir alanı
 * boyamıyor, sadece gösteriyor.
 *
 * ⚠️🔴 DOLGU TARİHÇESİ — DÖRT TUR, HEPSİ AYNI ŞİKÂYETTE BİTTİ: üç duraklı
 * mod gradyanı (alfa 0.45→0.15) → "puslu, alta doğru eriyor"; düz mod tinti
 * 0.34 → yine "puslu, üstünde overlay kalmış gibi"; perdelerin üstüne taşınan
 * aynı dolgu → yine fazla. Her turda azaltılan şey alfaydı ve sorun alfa
 * değildi: DOLU bir yüzey, kartlarla aynı ekranda bir leke olarak okunuyor.
 * Kenar o yüzden dolgunun "incesi" değil, ondan BAŞKA bir şey.
 *
 * ⚠️ DOLGU GERİ İSTENİRSE: `fill="none"` yerine alfalı bir ton konulabilir ama
 * kontur KALMALI — eski turların tamamında şeklin nerede bittiğini söyleyen
 * tek şey alfaydı ve harita koyulaştıkça zayıflıyordu.
 *
 * ── RENK MODDAN DEĞİL TEMADAN: `ink(1)` ────────────────────────────────────
 * Koyu temada BEYAZ, açık temada SİYAH (istek birebir). `ink()` tanımı gereği
 * moda ZIT mürekkep, yani tam bu iş için var.
 *
 * ⚠️ MOD RENGİ (Flört kırmızısı / Arkadaş yeşili) KALDIRILDI ve `mode` prop'u
 * da onunla gitti — FeedMapStrip'ten ve FeedScreen'den gelen zincir dahil.
 * Gerekçe 2026-10-22'de yazılmış olanın aynısı: "sınır bir MOD bilgisi değil,
 * haritanın kendi dili". Geri istenirse `modeFireTint(mode)` tek satır, ama
 * prop zincirinin tamamı yeniden kurulmak zorunda.
 *
 * ⚠️ TEMAYLA DÖNMEK ZORUNDA: altındaki harita 2026-10-27'den beri tema başına
 * ayrı stil çiziyor (bkz. mapbox.ts > MAPBOX_STYLE_CAMPUS_LIGHT). Sabit bir
 * renk iki zeminden birinde kaybolurdu — beyaz kontur açık haritada, siyah
 * kontur koyu haritada.
 *
 * ⚠️ PALET MUTABLE: `ink()` RENDER SIRASINDA çağrılıyor. Modül seviyesinde bir
 * sabite alınırsa tema çevrildiğinde eski renk kalır.
 *
 * ── MERKEZ NOKTASI KALDIRILDI (2026-10-22 isteği) ──────────────────────────
 * Poligonun ortasında aksan renkli bir daire ve altında yumuşak bir hale vardı
 * ("merkez burası" diyen işaret). İkisi de gitti: poligon zaten alanın
 * tamamını söylüyor, nokta onun üstünde ikinci bir iddia — hem de yanlış
 * olabilen bir iddia, çünkü merkez poligonun ORTALAMASI ve çok parçalı
 * kampüslerde sınırın dışına düşebiliyor (sunucunun ölçümü: 162 kampüsün
 * 6'sında 60–407 m dışarıda). Yani işaret bazı kampüslerde poligonun
 * dışında yüzen bir nokta olarak çiziliyordu.
 *
 * ⚠️ Geri eklenecekse koordinat `boundary.circle` değil poligonun İÇİNDEN
 * doğrulanmış bir nokta olmak zorunda (bkz. campusDevLocation > insidePoint).
 */

/**
 * KONTURUN KALINLIĞI — sınırı söyleyen tek şey.
 *
 * ⚠️ 2 → 2.5 (istek: "bi tık kalınlaştır"). 2, 2026-10-22'de kaldırılan eski
 * konturun kalınlığıydı; dolgu gidince çizgi tek başına kaldı ve o ölçüde
 * biraz cılız duruyordu.
 *
 * ⚠️ BİRİM EKRAN PUNTOSU: `<Svg>`in genişliği kutunun genişliğiyle aynı ve
 * `viewBox` YOK, yani yol koordinatları doğrudan ekran uzayında. Buradaki sayı
 * gördüğün kalınlık.
 *
 * ⚠️ TAM EKRANDA ÖLÇEKLE BÜYÜYOR: katman poligona yakınlaşırken `scale`
 * alıyor (FeedMapStrip > `zoom`) ve kontur onunla birlikte kalınlaşıyor. Akışta
 * ölçülen bir sayı, tam ekranda `expandScale` kadar daha kalın görünür —
 * "tam ekranda çok kalın" denirse çözüm bu sayı değil, konturu ölçekten muaf
 * tutmaktır (RN transform'u `vectorEffect`i dinlemiyor, yani kontur
 * `expandScale`in tersiyle çarpılmak zorunda).
 */
const STROKE_WIDTH = 2.5;

/**
 * ── KONTURUN KENAR BOYUNCA ÇİZİLMESİ (istek) ────────────────────────────────
 *
 * "o moments kısmına geçince üç kareye dokunup çizgi animasyonla, çizgi
 * şeklinde yavaşça çizilsin poligon."
 *
 * Belirme bir SÖNME DEĞİL: çizginin UCU kenar boyunca ilerliyor, arkasında
 * kalan kısım çizilmiş oluyor. Yani şekil opaklaşmıyor, kendi sınırını takip
 * ederek KURULUYOR.
 *
 * Uygulama `strokeDasharray` + `strokeDashoffset`: desen tek bir çizgi (şeklin
 * çevresi kadar) ve bir o kadar boşluk; offset `çevre`den 0'a inerken görünen
 * pay `[0, çevre − offset]` olarak büyüyor. `opacity` KULLANILMIYOR — o, şeklin
 * tamamını birden belirirdi ve istenen tam olarak onun tersi.
 *
 * ⚠️ YÖN BİR TUR TERSİYDİ: akışta kaydırmaya bağlı SİLİNME olarak yazılmıştı
 * (offset 0 → çevre). Akışta poligon artık hiç çizilmiyor (bant kaldırıldı),
 * yani aynı mekanizma tam ekrana geçişte TERS yönde kullanılıyor. Sabitin
 * kendisi değişmedi, yalnız `reveal`in anlamı: 0 = hiç çizilmemiş.
 *
 * ⚠️ DESEN ALT YOL BAŞINA SIFIRLANIYOR (SVG sözleşmesi): avlular kendi
 * kenarlarını kendi başlarına çiziyor. Uzunluk EN UZUN halkadan alındığı için
 * (bkz. aşağı) kısa halkalar yolun sonuna doğru hızlı tamamlanıyor; hepsi
 * `reveal = 1`de birlikte bitiyor. Her halkanın kendi oranında çizilmesi için
 * halka başına ayrı `<Path>` gerekirdi ve o TEK PATH kuralını kırar (gerekçe
 * `path`in notunda).
 *
 * ⚠️ `strokeLinecap` VARSAYILANDA ("butt") BIRAKILIYOR: yuvarlak bir uç,
 * ilerleyen baş kısmında yarım daire bir damla bırakıyor ve çizgi "akıyor" gibi
 * okunuyor. Düz kesim, kenarı takip eden temiz bir uç veriyor.
 */
export interface CampusPolygonOverlayProps {
  geometry: CampusGeometry;
  projection: CampusProjectionArgs;
  /**
   * 0 = kontur HİÇ çizilmemiş, 1 = şekil tam çizili.
   *
   * Opsiyonel ve VERİLMEZSE DESEN DE KURULMUYOR (şekil tam çizili): kampüs
   * yüzeyinin kendi haritası şekli her zaman tam çiziyor, oraya boş bir
   * animasyon bağlamanın karşılığı yok.
   *
   * Değeri çağıran üretiyor (tam ekrana geçişin ardından, bkz. feedMapMotion >
   * MAP_POLYGON_DRAW_MS): bu bileşen haritanın açılıp kapandığını bilmiyor —
   * tek işi şekli çizmek ve ne kadarının çizildiğini okumak.
   */
  reveal?: SharedValue<number>;
}

/**
 * ⚠️ `Path`in animasyonlu hâli MODÜL DÜZEYİNDE: `createAnimatedComponent`
 * render içinde çağrılırsa her çizimde YENİ bir bileşen tipi doğar ve React
 * ağacı her karede yeniden mount eder (SVG'de bu, şeklin yanıp sönmesi olarak
 * görünür).
 */
const AnimatedPath = Animated.createAnimatedComponent(Path);

const CampusPolygonOverlay = memo(function CampusPolygonOverlay({
  geometry,
  projection,
  reveal,
}: CampusPolygonOverlayProps) {
  const { boxWidth, boxHeight } = projection;
  const originX = boxWidth / 2;
  const originY = boxHeight / 2;

  /**
   * ⚠️ TEK PATH — ve dolgu gidince de TEK KALMAK ZORUNDA.
   *
   * Eskiden dış halka ile delikler ayrı `Polygon`lardı; delik altındaki
   * haritayı geri getiren bir silgi değil, üstüne çizilen soluk bir kapaktı.
   * Tek path'te delik alt yollar arasındaki sarılma sayısından doğuyor
   * (`fillRule="evenodd"`): dış halka dolu, avlu boş.
   *
   * ⚠️ `fillRule` DOLGU GİTSE DE DURUYOR: tek masrafı yok ve dolgu geri
   * eklenirse delikler kendiliğinden doğru çalışıyor.
   *
   * ⚠️ KONTUR HER ALT YOLU ÇİZİYOR — yani avluların kenarı da (tek path, ayrı
   * ayrı kontrol edilemezler). İSTENEN DE BU: avlu da kampüsün sınırı.
   *
   * Blur maskesi aynı kuralı ve aynı yardımcıyı (`ringToSubpath`) paylaşıyor —
   * ayrı yazılsalardı delik hesabı ikisi arasında sessizce ayrışırdı.
   */
  /**
   * Yol VE çizilmenin ölçüsü AYNI HESAPTAN: desenin uzunluğu şeklin kendi
   * çevresi olmak zorunda (gerekçe `ringPerimeter`da) ve iki ayrı `useMemo`
   * zamanla ayrışır — biri halkayı eler, öteki elemez.
   *
   * ⚠️ UZUNLUK EN UZUN HALKADAN: desen alt yol başına sıfırlandığı için tek bir
   * sayı tüm halkaları kapsamak zorunda. En uzunu seçmek "hiçbir halka
   * `reveal = 1`den önce tamamlanmasın ve hiçbiri eksik kalmasın" demek —
   * toplam alınsaydı en uzun halka bile yarı yolda kalırdı.
   */
  const { path, dashLength } = useMemo(() => {
    const rings = projectCampusGeometry(
      geometry,
      projection,
      originX,
      originY,
    ).flatMap((polygon) => [polygon.outer, ...polygon.holes]);
    return {
      path: rings.map(ringToSubpath).filter(Boolean).join(" "),
      // 1 taban: sıfır uzunlukta bir desen SVG'de "desen yok" demek, yani
      // şekil silinmek yerine tam çizili kalırdı.
      dashLength: Math.max(1, ...rings.map(ringPerimeter)),
    };
  }, [geometry, projection, originX, originY]);

  /**
   * ⚠️ `reveal` YOKKEN DE HOOK ÇAĞRILIYOR (React kuralı) ama aşağıda prop
   * olarak BAĞLANMIYOR — koşul JSX'te, hook'ta değil. O dalda offset 0, yani
   * desen kurulsa bile şekil tam çizili olurdu.
   */
  const dashProps = useAnimatedProps(() => ({
    strokeDashoffset: (1 - (reveal ? reveal.value : 1)) * dashLength,
  }));

  /**
   * ⚠️ `<Defs>` + ÖRNEĞE ÖZEL ID İHTİYACI DA GRADYANLA BİRLİKTE GİTTİ. Akışta
   * haritanın çapraz geçişi sırasında bu bileşen AYNI ANDA İKİ KEZ canlı
   * (giden ve gelen kare) ve iki `<Defs>` aynı gradyan adını tanımlıyordu;
   * biri sökülünce diğerinin dolgusu kayboluyordu ("poligon bazen renksiz").
   * Düz dolguda paylaşılan bir ad yok. Gradyan geri gelirse `useId()`li id de
   * geri gelmek ZORUNDA.
   */
  if (!path) return null;

  return (
    <Svg
      pointerEvents="none"
      width={boxWidth}
      height={boxHeight}
      style={{ position: "absolute", left: 0, top: 0 }}
    >
      {/* ⚠️ `fill="none"` — DOLGU YOK, yalnız kontur (gerekçe dosya başında).
          "transparent" yerine "none": SVG'de ikisi aynı sonucu veriyor ama
          `none` "boyama yok" demek, yani dolgu hesabı hiç kurulmuyor.

          ⚠️ RENK RENDER SIRASINDA OKUNUYOR (`ink(1)`): koyuda beyaz, açıkta
          siyah. Modül sabitine alınırsa tema çevrilince eski renk kalır.

          ⚠️ `strokeLinejoin="round"`: kampüs sınırları çok kırıklı poligonlar
          ve keskin birleşimlerde SVG konturu dışa doğru uzun sivriler
          (miter spike) çıkarıyor — 2.5pt'de bunlar şeklin dışında iğneler
          olarak görünüyor. */}
      <AnimatedPath
        d={path}
        fill="none"
        stroke={ink(1)}
        strokeWidth={STROKE_WIDTH}
        strokeLinejoin="round"
        fillRule="evenodd"
        // ⚠️ İKİSİ BİRLİKTE: desen olmadan offset'in hiçbir etkisi yok, offset
        // olmadan desen şekli "tam çizili" göstermekle kalır. `reveal`
        // verilmediğinde ikisi de kurulmuyor (gerekçe prop'un notunda).
        strokeDasharray={reveal ? [dashLength, dashLength] : undefined}
        animatedProps={reveal ? dashProps : undefined}
      />
    </Svg>
  );
});

export default CampusPolygonOverlay;
