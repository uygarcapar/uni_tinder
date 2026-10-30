import { memo, useMemo } from "react";
import Svg, { Path } from "react-native-svg";
import {
  campusBlurHolePath,
  type CampusProjectionArgs,
} from "../campusProjection";
import type { CampusGeometry } from "../campusTypes";

/**
 * KAMPÜSÜN SINIRI KADAR BLUR DELİĞİ — bir `MaskedView` maskesi.
 *
 * Akışta harita bulanık bir ZEMİN (bkz. FeedMapStrip > MAP_OVERVIEW_BLUR), ama
 * yüzeyin asıl cümlesi "kampüsüm burası". İstek bu ikisini ayırıyor: zemin
 * bulanık kalsın, POLİGONUN İÇİ net olsun. Yani blur katmanının poligon
 * şeklinde bir deliği var.
 *
 * ⚠️ BU BİR MASKE, ÇİZİM DEĞİL: döndürülen siyahlık "burada blur çizilsin"
 * demek, ekranda siyah bir şey görünmüyor. Maskenin alfası 0 olan yeri
 * (poligonun içi) blur'u hiç çizdirmiyor ve altındaki keskin harita kalıyor.
 *
 * Şeklin kendisi saf modülde ve testli (`campusBlurHolePath`): tek path +
 * `evenodd` kuralının neden zorunlu olduğu da orada yazılı.
 *
 * ── Kutu KOORDİNAT UZAYI haritanınkiyle AYNI olmak zorunda ─────────────────
 * Projeksiyon `CampusPolygonOverlay`la birebir aynı çağrı (aynı merkez, zoom ve
 * kutu). Çağıran bu maskeyi haritanın kutusuyla aynı yere ve AYNI transform'un
 * altına koyuyor — ayrışırsa delik haritanın üstünde kayar ve hata "blur
 * tuhaf" diye görünür, sebebi görünmez.
 */

export interface CampusPolygonBlurMaskProps {
  geometry: CampusGeometry;
  projection: CampusProjectionArgs;
}

const CampusPolygonBlurMask = memo(function CampusPolygonBlurMask({
  geometry,
  projection,
}: CampusPolygonBlurMaskProps) {
  const { boxWidth, boxHeight } = projection;

  const d = useMemo(
    () => campusBlurHolePath(geometry, projection),
    [geometry, projection],
  );

  return (
    <Svg
      pointerEvents="none"
      width={boxWidth}
      height={boxHeight}
      style={{ position: "absolute", left: 0, top: 0 }}
    >
      {/* Renk önemsiz, ALFA önemli: maske siyah/şeffaf okunuyor. */}
      <Path d={d} fill="#000000" fillRule="evenodd" />
    </Svg>
  );
});

export default CampusPolygonBlurMask;
