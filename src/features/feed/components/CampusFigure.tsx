import { memo } from "react";
import Svg, {
  Circle,
  Defs,
  Ellipse,
  LinearGradient,
  Polygon,
  RadialGradient,
  Rect,
  Stop,
} from "react-native-svg";
import { colors } from "@/shared/theme/colors";
import {
  BODY_FRONT,
  BODY_SIDE,
  CAMPUS_FIGURE_ANCHOR,
  CAMPUS_FIGURE_ASPECT,
  CAMPUS_VIEW_BOX,
  CAP_FRONT,
  CAP_SIDE,
  CAP_TOP,
  CLOCK_DIAL,
  CLOCK_HOUR,
  CLOCK_MINUTE,
  DOOR,
  FLAG,
  FRONT_WINDOWS,
  GROUND_SHADOW,
  PLATE_PATH,
  PLATE_SIDE,
  PLATE_TOP,
  PLINTH_FRONT,
  PLINTH_SIDE,
  PLINTH_TOP_FRONT,
  PLINTH_TOP_SIDE,
  POLE,
  SIDE_WINDOWS,
  SKYLIGHTS,
  TOWER_FRONT,
  TOWER_SIDE,
  TOWER_TOP_FACE,
  TREES_BEHIND,
  TREES_FRONT,
  type CampusTree,
} from "./campusFigureGeometry";

/**
 * Akış haritasının üstünde, KAMPÜSÜN TAM DURDUĞU NOKTADA duran izometrik
 * KAMPÜS DİORAMASI. Kaldırılan pin'in yerini alıyor ama işi farklı: pin "burada
 * bir şey var" diyordu, diorama "burada OKUL var" diyor.
 *
 * Bu dosya yalnız BOYAMA — her nokta `campusFigureGeometry`den geliyor, orada
 * da elle yazılmıyor, tek bir izometrik projeksiyondan türüyor. Bir ölçüyü
 * değiştirmek için oraya git; kadraj (viewBox) ve çapa kendini topluyor.
 *
 * ── Neden "yalnız bina" değil, DİORAMA ──────────────────────────────────────
 * Önceki hâl düz dolgulu, sert siyah konturlu tek bir bloktu ve ~86pt'de
 * clip-art okunuyordu. Eksik olan üç şey vardı, üçü de burada:
 *   • MALZEME — her yüz artık düz dolgu değil, kendi gradyanı var. İzometride
 *     hacmi veren tek şey ton farkı; tek renkli yüz kâğıttan kesilmiş duruyor.
 *   • BAĞLAM — bina boşlukta değil, yuvarlak köşeli bir PARSELİN üstünde: yol,
 *     ağaçlar, çimen. "Bir yerde duran kampüs" okunuşu buradan geliyor.
 *   • TEMAS — parselin toprak kesiti + altındaki yumuşak gölge figürü haritaya
 *     bastırıyor; ağaçların kendi küçük gölgeleri de aynı işi yapıyor.
 *
 * ── SERT KONTUR KALDIRILDI, bilerek ─────────────────────────────────────────
 * Eskiden her yapısal yüzün 0.8'lik koyu lacivert bir konturu vardı ve gerekçe
 * "zemin ne olursa olsun silueti ayırmak"tı. İki sebeple gerekmiyor:
 *   1. Mapbox stillerinin İKİSİ DE neredeyse boş — koyu tema düz grafit, açık
 *      tema neredeyse beyaz, aralarında yol çizgilerinden başka bir şey yok.
 *      Ayrışma problemi sanıldığı kadar büyük değil.
 *   2. Siluetin dışını artık PARSEL çiziyor ve onun toprak kesiti zaten koyu —
 *      yani dış kontur işini bir KATMAN görüyor, çizgi değil.
 * Kalan kenarlar TONAL (sıcak kahvenin düşük alfalı hâli): yüzleri ayırıyor
 * ama figürü çizgi filme çevirmiyor.
 *
 * ── Palet SICAK, tema BAĞIMSIZ ──────────────────────────────────────────────
 * Figür bir arayüz parçası değil, haritanın üstünde duran bir İLLÜSTRASYON; iki
 * temada da AYNI harita üstünde okunur kalmalı.
 *
 * ⚠️ TONLAR ORTA DEĞERDE KALMAK ZORUNDA. Açık tema haritası neredeyse beyaz,
 * koyu tema neredeyse siyah: beyaza kaçan bir yüz birinde, siyaha kaçan öbürde
 * kayboluyor. En açık ton kremde duruyor (beyaz değil), en koyu ton sıcak
 * kahvede (siyah değil) — ikisinin de kendi rengi var, yani düz zeminden
 * renkle de ayrılıyorlar.
 *
 * Aile: taş gövde + kiremit çatı/kapı aksanı + onlara tamamlayıcı duran soğuk
 * arduvaz camlar; parsel ise kırık bir YEŞİL. Parselin sıcak kum olmaması
 * kasıtlı — gövdeyle aynı aileye girip binayı yutuyordu.
 *
 * Tek marka rengi FLAMA (`colors.primary`): figürdeki en doygun nokta o, yani
 * göz önce oraya gidiyor.
 *
 * ⚠️ ÜÇ TON BİRBİRİNDEN AYRI DURMALI (üst > cephe > yan). İzometride derinliği
 * veren tek şey bu sıra; ilk denemede üst yüz cepheden yalnız bir tık açıktı ve
 * hacim kayboluyordu.
 *
 * ── ÇİZİM SIRASI = DERİNLİK ─────────────────────────────────────────────────
 * Ressam algoritması, arkadaki önce. Sıra aşağıda numaralı; `x+y` toplamı büyük
 * olan ÖNDE. Ağaçlar bu yüzden ikiye ayrılmış durumda (bkz. TREES_BEHIND).
 *
 * ── Neden SVG, neden 3B model değil ─────────────────────────────────────────
 * Harita DÜZ bir Mapbox Studio stili. Fotogerçekçi bir 3D render o stilin
 * üstünde yapıştırılmış duruyor; izometrik vektör aynı dili konuşuyor.
 * Teknik taraf da bunu söylüyor:
 *   • `react-native-svg` zaten her ekranda yüklü → YENİ PAKET YOK.
 *   • Skia alternatifi her örnek için GPU destekli bir surface açıyor; STATİK
 *     bir figür için gereksiz (gradyan ve radyal gölge SVG'de de var).
 *   • `expo-gl` + `three` + GLTF gerçek 3B verirdi ama üç paket ve NATIVE bir
 *     modül, yani dev-client yeniden build'i demek (prebuild build numarasını
 *     sıfırlıyor — App Store notundaki tuzak).
 *   • Vektör olduğu için ek ağ isteği/decode yok ve her yoğunlukta net.
 */

// ── Palet ──────────────────────────────────────────────────────────────────
/** Taş gövde — cephe ışığı alıyor, yan yüz gölgede. */
const WALL_FRONT_LIT = "#EADCC4";
const WALL_FRONT_DIM = "#D6BC9C";
const WALL_SIDE_LIT = "#C9AD8C";
const WALL_SIDE_DIM = "#AE9070";
/** Düz çatının taş/mıcır yüzeyi. */
const ROOF_LIT = "#D6C6AE";
const ROOF_DIM = "#C2AE92";
/** Kiremit aksanı: korkuluk bandı + kule çatısı + kapı aynı aileden. */
const TRIM_FRONT_LIT = "#CE7254";
const TRIM_FRONT_DIM = "#B85B3F";
const TRIM_SIDE_LIT = "#B35A3E";
const TRIM_SIDE_DIM = "#9C4830";
const TRIM_TOP_LIT = "#DD8260";
const TRIM_TOP_DIM = "#C66845";
const DOOR_FILL = "#7E4330";
/** Camlar SOĞUK arduvaz — sıcak taşın tamamlayıcısı, gökyüzü yansıması gibi. */
const GLASS_FRONT_LIT = "#6B7F8A";
const GLASS_FRONT_DIM = "#44545E";
const GLASS_SIDE = "#3B4951";
/** Parsel: kırık yeşil çimen + sıcak toprak kesiti. */
const LAWN_LIT = "#A9BC8D";
const LAWN_DIM = "#8CA371";
const SOIL_LIT = "#706345";
const SOIL_DIM = "#564B33";
const PATH_LIT = "#DDCDB2";
const PATH_DIM = "#CBB795";
/** Söve — gövdeyle çimen arasındaki koyu ayırıcı bant. */
const PLINTH_TOP_FILL = "#B09272";
const PLINTH_FRONT_FILL = "#9A7C5E";
const PLINTH_SIDE_FILL = "#846549";
/** Ağaçlar. */
const CANOPY_LIT = "#A9C98A";
const CANOPY_DIM = "#5E7F4A";
const TRUNK_FILL = "#7E6448";
/** Saat ve direk. */
const DIAL_FILL = "#F4E9D5";
const HAND_FILL = "#4A3728";
const POLE_FILL = "#8C7C66";

/** Yüzleri ayıran TONAL kenar — sert kontur değil (bkz. başlıktaki not). */
const EDGE = "rgba(74,52,37,0.35)";
const EDGE_W = 0.7;
const LAWN_EDGE = "rgba(60,56,36,0.26)";

/** Gövde + cephe için ortak kenar/eklem ayarları. */
const face = {
  stroke: EDGE,
  strokeWidth: EDGE_W,
  strokeLinejoin: "round",
} as const;

/** Ağacın üç parçası — gölge, gövde, taç. İki listede de aynı çizim. */
function Tree({ tree }: { tree: CampusTree }) {
  return (
    <>
      {/* Tacın çimene düşen gölgesi — ağacı parsele bağlayan şey. */}
      <Ellipse
        cx={tree.x}
        cy={tree.baseY}
        rx={tree.shadowRx}
        ry={tree.shadowRy}
        fill="url(#campusTreeShadow)"
      />
      <Rect
        x={tree.x - tree.canopyR * 0.14}
        y={tree.baseY - tree.trunkHeight}
        width={tree.canopyR * 0.28}
        height={tree.trunkHeight}
        fill={TRUNK_FILL}
      />
      {/* Küre izometride daireye düşüyor; hacmi radyal gradyan veriyor. */}
      <Circle
        cx={tree.x}
        cy={tree.canopyY}
        r={tree.canopyR}
        fill="url(#campusCanopy)"
      />
    </>
  );
}

const CampusFigure = memo(function CampusFigure({
  height = 100,
}: {
  /** Figürün YÜKSEKLİĞİ; genişlik orandan türüyor (bandın sınırı yükseklik). */
  height?: number;
}) {
  return (
    <Svg
      width={height * CAMPUS_FIGURE_ASPECT}
      height={height}
      viewBox={CAMPUS_VIEW_BOX}
    >
      <Defs>
        {/* Zemin gölgesi — blur yerine yarıçapa yayılan radyal gradyan:
            `feGaussianBlur` react-native-svg'de güvenilir değil ve burada tek
            ihtiyaç kenarın yumuşaklığı. */}
        <RadialGradient id="campusShadow" cx="50%" cy="50%" r="50%">
          <Stop offset="0" stopColor="#000000" stopOpacity="0.28" />
          <Stop offset="0.55" stopColor="#000000" stopOpacity="0.13" />
          <Stop offset="1" stopColor="#000000" stopOpacity="0" />
        </RadialGradient>
        <RadialGradient id="campusTreeShadow" cx="50%" cy="50%" r="50%">
          <Stop offset="0" stopColor="#3B3A24" stopOpacity="0.34" />
          <Stop offset="1" stopColor="#3B3A24" stopOpacity="0" />
        </RadialGradient>

        {/* Yüz gradyanları — hepsi DİKEY (ışık tepeden), kutunun kendi sınır
            kutusuna göre. Çatıda yön çapraz: geniş yatay yüzde dikey gradyan
            bant gibi okunuyor, çapraz olan ışığın yüzeyde kaymasını veriyor. */}
        <LinearGradient id="campusWallFront" x1="0%" y1="0%" x2="0%" y2="100%">
          <Stop offset="0" stopColor={WALL_FRONT_LIT} />
          <Stop offset="1" stopColor={WALL_FRONT_DIM} />
        </LinearGradient>
        <LinearGradient id="campusWallSide" x1="0%" y1="0%" x2="0%" y2="100%">
          <Stop offset="0" stopColor={WALL_SIDE_LIT} />
          <Stop offset="1" stopColor={WALL_SIDE_DIM} />
        </LinearGradient>
        <LinearGradient id="campusRoof" x1="0%" y1="0%" x2="100%" y2="100%">
          <Stop offset="0" stopColor={ROOF_LIT} />
          <Stop offset="1" stopColor={ROOF_DIM} />
        </LinearGradient>
        <LinearGradient id="campusTrimFront" x1="0%" y1="0%" x2="0%" y2="100%">
          <Stop offset="0" stopColor={TRIM_FRONT_LIT} />
          <Stop offset="1" stopColor={TRIM_FRONT_DIM} />
        </LinearGradient>
        <LinearGradient id="campusTrimSide" x1="0%" y1="0%" x2="0%" y2="100%">
          <Stop offset="0" stopColor={TRIM_SIDE_LIT} />
          <Stop offset="1" stopColor={TRIM_SIDE_DIM} />
        </LinearGradient>
        <LinearGradient id="campusTrimTop" x1="0%" y1="0%" x2="100%" y2="100%">
          <Stop offset="0" stopColor={TRIM_TOP_LIT} />
          <Stop offset="1" stopColor={TRIM_TOP_DIM} />
        </LinearGradient>
        {/* Camda gradyan = YANSIMA. Her pencere kendi sınır kutusunu kullandığı
            için sıra sıra aynı şekilde parlıyorlar; düz dolguda hepsi delik
            gibi duruyordu. */}
        <LinearGradient id="campusGlass" x1="0%" y1="0%" x2="0%" y2="100%">
          <Stop offset="0" stopColor={GLASS_FRONT_LIT} />
          <Stop offset="1" stopColor={GLASS_FRONT_DIM} />
        </LinearGradient>
        <LinearGradient id="campusLawn" x1="0%" y1="0%" x2="50%" y2="100%">
          <Stop offset="0" stopColor={LAWN_LIT} />
          <Stop offset="1" stopColor={LAWN_DIM} />
        </LinearGradient>
        <LinearGradient id="campusSoil" x1="0%" y1="0%" x2="0%" y2="100%">
          <Stop offset="0" stopColor={SOIL_LIT} />
          <Stop offset="1" stopColor={SOIL_DIM} />
        </LinearGradient>
        <LinearGradient id="campusPath" x1="0%" y1="0%" x2="0%" y2="100%">
          <Stop offset="0" stopColor={PATH_LIT} />
          <Stop offset="1" stopColor={PATH_DIM} />
        </LinearGradient>
        {/* Işık SOL ÜSTTEN: tacın parlak noktası merkezin solunda ve üstünde. */}
        <RadialGradient id="campusCanopy" cx="35%" cy="28%" r="78%">
          <Stop offset="0" stopColor={CANOPY_LIT} />
          <Stop offset="1" stopColor={CANOPY_DIM} />
        </RadialGradient>
      </Defs>

      {/* 1. Parselin altındaki yumuşak gölge. */}
      <Ellipse
        cx={GROUND_SHADOW.cx}
        cy={GROUND_SHADOW.cy}
        rx={GROUND_SHADOW.rx}
        ry={GROUND_SHADOW.ry}
        fill="url(#campusShadow)"
      />

      {/* 2. PARSEL. Önce toprak kesiti (aynı çevrenin aşağı ötelenmişi), sonra
          çimen: ikisinin BİRLEŞİMİ ekstrüzyonun silueti, altta kalan hilal de
          kesitin kendisi (bkz. geometri > PLATE_SIDE). */}
      <Polygon points={PLATE_SIDE} fill="url(#campusSoil)" />
      <Polygon
        points={PLATE_TOP}
        fill="url(#campusLawn)"
        stroke={LAWN_EDGE}
        strokeWidth={EDGE_W}
        strokeLinejoin="round"
      />

      {/* 3. Kapıdan parselin ön kenarına yol — ilk 3.5 birimi sövenin altında
          kalıyor, yani basamağın altından çıkıyor gibi okunuyor. */}
      <Polygon points={PLATE_PATH} fill="url(#campusPath)" />

      {/* 4. ARKADAKİ ağaçlar — gövdeden önce. */}
      {TREES_BEHIND.map((tree, i) => (
        <Tree key={`tb${i}`} tree={tree} />
      ))}

      {/* 5. Ana gövde. Üst yüzü YOK — korkuluk onu zaten kapatıyor. */}
      <Polygon points={BODY_SIDE} fill="url(#campusWallSide)" {...face} />
      <Polygon points={BODY_FRONT} fill="url(#campusWallFront)" {...face} />

      {/* 6. Katlar ve giriş. Konturu YOK: bu ölçekte her panelin çizgisi gri
          bir lekeye dönüşüyor. */}
      {SIDE_WINDOWS.map((points, i) => (
        <Polygon key={`ws${i}`} points={points} fill={GLASS_SIDE} />
      ))}
      {FRONT_WINDOWS.map((points, i) => (
        <Polygon key={`wf${i}`} points={points} fill="url(#campusGlass)" />
      ))}
      <Polygon points={DOOR} fill={DOOR_FILL} />

      {/* 7. SÖVE — gövdeden SONRA, çünkü yüzleri ona göre DAHA YAKIN
          düzlemlerde; duvarların zemine saplanan alt bandını örtüyor. Üst yüzün
          yalnız iki şeridi çiziliyor (gerekçe geometride). */}
      <Polygon points={PLINTH_TOP_SIDE} fill={PLINTH_TOP_FILL} />
      <Polygon points={PLINTH_TOP_FRONT} fill={PLINTH_TOP_FILL} />
      <Polygon points={PLINTH_SIDE} fill={PLINTH_SIDE_FILL} />
      <Polygon points={PLINTH_FRONT} fill={PLINTH_FRONT_FILL} />

      {/* 8. Düz çatı + kiremit korkuluk — duvarlardan SONRA, üst kenarları
          örtsün. */}
      <Polygon points={CAP_SIDE} fill="url(#campusTrimSide)" {...face} />
      <Polygon points={CAP_FRONT} fill="url(#campusTrimFront)" {...face} />
      <Polygon points={CAP_TOP} fill="url(#campusRoof)" {...face} />
      {SKYLIGHTS.map((points, i) => (
        <Polygon key={`sk${i}`} points={points} fill="url(#campusGlass)" />
      ))}

      {/* 9. Saat kulesi — en önde. Çatısı KİREMİT: ana çatıyla aynı tonda
          olsaydı kule, üstüne oturduğu yüzeyin içinde kaybolurdu. */}
      <Polygon points={TOWER_SIDE} fill="url(#campusWallSide)" {...face} />
      <Polygon points={TOWER_FRONT} fill="url(#campusWallFront)" {...face} />
      <Polygon points={TOWER_TOP_FACE} fill="url(#campusTrimTop)" {...face} />

      {/* 10. Kadran — figürü "bina"dan "OKUL/KURUM"a çeviren işaret. */}
      <Polygon
        points={CLOCK_DIAL}
        fill={DIAL_FILL}
        stroke={EDGE}
        strokeWidth={0.6}
      />
      <Polygon points={CLOCK_MINUTE} fill={HAND_FILL} />
      <Polygon points={CLOCK_HOUR} fill={HAND_FILL} />

      {/* 11. Direk + flama.
          ⚠️ `colors.primary` RENDER İÇİNDE okunuyor (palet mutable, modül
          seviyesine alınırsa tema değişince bayat kalır). */}
      <Rect
        x={POLE.x - 0.6}
        y={POLE.topY}
        width={1.2}
        height={POLE.height}
        fill={POLE_FILL}
      />
      <Polygon points={FLAG} fill={colors.primary} />

      {/* 12. ÖNDEKİ ağaçlar + çalı — her şeyden sonra. */}
      {TREES_FRONT.map((tree, i) => (
        <Tree key={`tf${i}`} tree={tree} />
      ))}
    </Svg>
  );
});

export { CAMPUS_FIGURE_ANCHOR, CAMPUS_FIGURE_ASPECT };
export default CampusFigure;
