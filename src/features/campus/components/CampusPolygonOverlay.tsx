import { memo, useMemo } from "react";
import Svg, { Polygon } from "react-native-svg";
import { colors, withAlpha } from "@/shared/theme/colors";
import {
  projectCampusGeometry,
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
 * Poligonu olmayan kampüslerde (sunucuda hâlâ 25 tane) diorama duruyor —
 * orada çizilecek bir sınır yok.
 *
 * ── Şekil haritanın KADRAJINA bağlı ────────────────────────────────────────
 * Çizim Mercator projeksiyonuyla görüntünün merkezinden türüyor
 * (`campusProjection`). Yani kutu kaydığında (tam ekrana geçişte kadraj
 * ortalanıyor) poligon da aynı transform'un içinde kalmak ZORUNDA — çağıran
 * onu haritayla aynı `Animated.View`in çocuğu yapıyor. Ayrı bir katmana
 * konsaydı açılma animasyonu boyunca haritadan kayardı.
 *
 * ── Neden dolgu AÇIK, kenar KOYU ───────────────────────────────────────────
 * Harita artık Mapbox'ın kendi sokak stili, yani altında yol/park/bina var.
 * Opak bir dolgu onların hepsini örter ve "kampüsüm neresi" sorusunu yine
 * cevapsız bırakırdı. Düşük alfalı dolgu alanı işaretliyor, kenar sınırı
 * söylüyor.
 *
 * ── RENK SABİT SİYAH — MOD AKSANI DA DEĞİL, TEMA MÜREKKEBİ DE DEĞİL ────────
 * Kenar ve dolgu eskiden seçili modun aksanındaydı (Flört'te kırmızı,
 * Arkadaş'ta yeşil). 2026-10-22 isteği: sınır bir MOD bilgisi değil, haritanın
 * kendi dili → kenar tam siyah, dolgu aynı siyahın düşük alfalısı.
 *
 * ⚠️ `ink()` KULLANILMIYOR ve bu BİLİNÇLİ bir istisna: o yardımcı temayla
 * dönüyor (koyuda beyaz) ve bir tur öyle yazıldı, istenen bu değil — siyah HER
 * İKİ TEMADA da siyah kalıyor (açık istek).
 *
 * Bedeli biliniyor: harita stili temayla dönüyor (bkz. mapbox.ts), yani koyu
 * temada koyu bir zeminin üstünde siyah sınırın kontrastı düşük. Sınır çizgisi
 * yine de görünür çünkü Mapbox'ın koyu stili tam siyah değil; okunurluk
 * yetmezse çözüm renk DEĞİL kalınlık ya da ince bir beyaz dış hat (çift
 * kontur) olur.
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
 * Kenar kalınlıkları.
 *
 * ⚠️ İKİSİ BİRLİKTE DÜŞÜYOR, oran korunuyor: dış halka deliğin kenarından
 * belirgin şekilde kalın olmak zorunda — ikisi eşitlenince "kampüsün sınırı"
 * ile "avlunun sınırı" aynı ağırlıkta okunuyor ve şekil düzleşiyor.
 */
const OUTER_STROKE = 2;
const HOLE_STROKE = 1.25;

/**
 * Sınırın rengi — SABİT siyah, temadan BAĞIMSIZ (gerekçe dosya başında).
 * `colors.*`tan okunmuyor: paletteki her mürekkep temayla dönüyor.
 */
const STROKE = "#000000";
/** Alanı işaretleyen dolgu — altındaki sokak dokusu okunmaya devam etmeli. */
const FILL_ALPHA = 0.18;
/** Deliğin kenarı dış halkadan SOLUK: avlu sınırı kampüs sınırı değil. */
const HOLE_STROKE_ALPHA = 0.6;

export interface CampusPolygonOverlayProps {
  geometry: CampusGeometry;
  projection: CampusProjectionArgs;
}

const CampusPolygonOverlay = memo(function CampusPolygonOverlay({
  geometry,
  projection,
}: CampusPolygonOverlayProps) {
  const { boxWidth, boxHeight } = projection;
  const originX = boxWidth / 2;
  const originY = boxHeight / 2;

  const polygons = useMemo(
    () => projectCampusGeometry(geometry, projection, originX, originY),
    [geometry, projection, originX, originY],
  );

  if (!polygons.length) return null;

  return (
    <Svg
      pointerEvents="none"
      width={boxWidth}
      height={boxHeight}
      style={{ position: "absolute", left: 0, top: 0 }}
    >
      {polygons.map((polygon, i) => (
        <Polygon
          key={`outer-${i}`}
          points={polygon.outer}
          fill={withAlpha(STROKE, FILL_ALPHA)}
          stroke={STROKE}
          strokeWidth={OUTER_STROKE}
          strokeLinejoin="round"
        />
      ))}

      {/* DELİKLER — avlu/iç boşluk. Dış halkayla aynı dolguyla değil, haritanın
          kendisiyle doldurulamıyor (SVG'de delik `fill-rule` ile olurdu ama
          `Polygon` tek halka alıyor); bu yüzden delik, altındaki haritayı geri
          getiren bir "silgi" olarak değil, kendi ince kenarıyla çiziliyor.
          Alan olarak dolgusu YOK: içi kampüs sayılmıyor ve öyle de görünüyor. */}
      {polygons.flatMap((polygon, i) =>
        polygon.holes.map((hole, j) => (
          <Polygon
            key={`hole-${i}-${j}`}
            points={hole}
            fill={colors.mediaScrimSoft}
            stroke={withAlpha(STROKE, HOLE_STROKE_ALPHA)}
            strokeWidth={HOLE_STROKE}
            strokeLinejoin="round"
          />
        )),
      )}
    </Svg>
  );
});

export default CampusPolygonOverlay;
