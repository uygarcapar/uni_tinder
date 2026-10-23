import type { CampusGeometry, GeoRing } from "./campusTypes";

/**
 * KAMPÜS POLİGONUNU HARİTANIN ÜSTÜNE OTURTMA — Web Mercator.
 *
 * Statik Mapbox görüntüsünün merkezi, zoom'u ve kutusu biliniyor; poligonun
 * ekrandaki yeri bundan TÜRETİLEBİLİR. Yani harita bir resim olmasına rağmen
 * üstüne coğrafi olarak doğru bir şekil çizebiliyoruz.
 *
 * ── Neden Mapbox'ın GeoJSON overlay'i KULLANILMIYOR ────────────────────────
 * Static Images API `geojson(...)` ile poligon basabiliyor ama:
 *   • URL sınırı 8192 bayt ve poligonlar ≤120 nokta — URL-encode sonrası
 *     ("[29.04812,41.08312]" → ~60 bayt) 120 nokta rahat taşıyor.
 *   • Şekil görüntünün İÇİNE pişiyor, yani tam ekrana geçerken kadraj
 *     kaydığında poligonu ayrıca kaydıramıyoruz; yeni bir ağ isteği gerekirdi.
 *   • Rengi/kalınlığı tema ile oynatmak yine yeni istek demek.
 * Kendimiz çizince üçü de bedava: tek SVG, haritayla aynı transform.
 *
 * ── Mercator ───────────────────────────────────────────────────────────────
 * Mapbox stilleri 512px karo kullanıyor, yani zoom z'de dünya
 * `512 · 2^z` piksel. Projeksiyon standart:
 *   x = (lon + 180) / 360 · W
 *   y = (1 − ln(tan φ + sec φ) / π) / 2 · W
 *
 * ⚠️ `y` ENLEMLE DOĞRUSAL DEĞİL. Kampüs ölçeğinde (birkaç yüz metre) fark
 * ihmal edilebilir görünse de projeksiyonu doğru yapmak bedava: yanlış olanı
 * sonradan fark etmek, kuzey-güney uzayan bir kampüste poligonun kaymasıyla
 * olurdu.
 */

/** Mapbox stillerinde karo boyu. 256 varsayılırsa her şey iki kat kayar. */
const TILE_SIZE = 512;

export interface MercatorPoint {
  x: number;
  y: number;
}

export function lonLatToWorld(
  lon: number,
  lat: number,
  zoom: number,
): MercatorPoint {
  const worldSize = TILE_SIZE * Math.pow(2, zoom);
  const x = ((lon + 180) / 360) * worldSize;
  // Kutuplara yaklaşırken `tan` patlıyor; Mercator zaten ±85.051°de kesiliyor.
  const clampedLat = Math.min(Math.max(lat, -85.05112878), 85.05112878);
  const phi = (clampedLat * Math.PI) / 180;
  const y =
    ((1 - Math.log(Math.tan(phi) + 1 / Math.cos(phi)) / Math.PI) / 2) *
    worldSize;
  return { x, y };
}

export interface CampusProjectionArgs {
  /** Görüntünün merkezi — kampüs koordinatı. */
  centerLat: number;
  centerLon: number;
  /** Statik görüntünün zoom'u. Haritanın URL'indekiyle AYNI olmak zorunda. */
  zoom: number;
  /** İstenen görüntünün ölçüsü (mantıksal harita pikseli, @2x ÖNCESİ). */
  imageWidth: number;
  imageHeight: number;
  /** Görüntünün ekrandaki kutusu. */
  boxWidth: number;
  boxHeight: number;
}

/**
 * Ekran pikseli / harita pikseli oranı.
 *
 * ⚠️ `contentFit="cover"` ile aynı hesap: görüntü kutuyu KAPLIYOR, yani ölçek
 * iki orandan BÜYÜĞÜ ve fazlalık kırpılıyor. `max` yerine `min` yazmak
 * (`contain`) poligonu haritadan farklı ölçekte çizer — ikisi birbirinden
 * ayrılır ve hata "poligon biraz kaymış" gibi görünür, sebebi görünmez.
 */
export function coverScale(
  // Merkez/zoom OKUNMUYOR: ölçek yalnız kutu ile görüntü ölçüsünün oranı.
  // Daraltılmış tip, kadrajı HENÜZ bilinmeyen çağıranın (zoom'u bu ölçekten
  // türeten `fitZoom` yolu) sahte bir merkez uydurmasını gerektirmiyor.
  args: Pick<
    CampusProjectionArgs,
    "boxWidth" | "boxHeight" | "imageWidth" | "imageHeight"
  >,
): number {
  return Math.max(
    args.boxWidth / args.imageWidth,
    args.boxHeight / args.imageHeight,
  );
}

/**
 * Koordinat → kutunun MERKEZİNE göre ekran ofseti (pt).
 *
 * Merkez referans alınıyor çünkü görüntünün merkezi = kampüs noktası = kutunun
 * merkezi. Çağıran bu ofseti kutunun ortasına ekliyor.
 */
export function projectOffset(
  lon: number,
  lat: number,
  args: CampusProjectionArgs,
): MercatorPoint {
  const scale = coverScale(args);
  const center = lonLatToWorld(args.centerLon, args.centerLat, args.zoom);
  const point = lonLatToWorld(lon, lat, args.zoom);
  return {
    x: (point.x - center.x) * scale,
    y: (point.y - center.y) * scale,
  };
}

/** Bir halkayı SVG `points` dizesine çevirir (kutu merkezine göre). */
function ringToPoints(
  ring: GeoRing,
  args: CampusProjectionArgs,
  originX: number,
  originY: number,
): string {
  return ring
    .map(([lon, lat]) => {
      const { x, y } = projectOffset(lon, lat, args);
      return `${(originX + x).toFixed(2)},${(originY + y).toFixed(2)}`;
    })
    .join(" ");
}

export interface ProjectedPolygon {
  /** Dış halka. */
  outer: string;
  /** Delikler (avlu vb.) — ayrı çiziliyor. */
  holes: string[];
}

/**
 * Geometriyi çizilebilir hâle getirir.
 *
 * `MultiPolygon` her parçası için ayrı bir girdi döndürüyor: çok kampüslü
 * üniversitede yerleşkelerin hepsi çiziliyor (sunucu da hepsini kapsıyor).
 */
export function projectCampusGeometry(
  geometry: CampusGeometry,
  args: CampusProjectionArgs,
  originX: number,
  originY: number,
): ProjectedPolygon[] {
  const polygons: GeoRing[][] =
    geometry.type === "Polygon" ? [geometry.coordinates] : geometry.coordinates;

  return polygons
    .filter((rings) => rings.length > 0)
    .map((rings) => ({
      outer: ringToPoints(rings[0], args, originX, originY),
      holes: rings.slice(1).map((r) => ringToPoints(r, args, originX, originY)),
    }));
}

// ── Kadraj: poligonu görünür alana oturtma ─────────────────────────────────

export interface GeoBounds {
  minLon: number;
  minLat: number;
  maxLon: number;
  maxLat: number;
}

/** Geometrinin sınır kutusu. Boş geometride `null`. */
export function geometryBounds(geometry: CampusGeometry): GeoBounds | null {
  const polygons: GeoRing[][] =
    geometry.type === "Polygon" ? [geometry.coordinates] : geometry.coordinates;

  let minLon = Infinity;
  let minLat = Infinity;
  let maxLon = -Infinity;
  let maxLat = -Infinity;

  for (const rings of polygons) {
    // ⚠️ YALNIZ DIŞ HALKA: delikler (avlu) sınırın İÇİNDE, kutuyu büyütemezler.
    const outer = rings[0];
    if (!outer) continue;
    for (const [lon, lat] of outer) {
      if (lon < minLon) minLon = lon;
      if (lon > maxLon) maxLon = lon;
      if (lat < minLat) minLat = lat;
      if (lat > maxLat) maxLat = lat;
    }
  }

  if (!Number.isFinite(minLon) || !Number.isFinite(minLat)) return null;
  return { minLon, minLat, maxLon, maxLat };
}

/** Sınır kutusunun merkezi — haritanın merkezi bu oluyor. */
export function boundsCenter(b: GeoBounds): { lat: number; lon: number } {
  return {
    lon: (b.minLon + b.maxLon) / 2,
    // ⚠️ Enlem ortası MERCATOR'DA alınıyor, derece ortalamasıyla DEĞİL:
    // projeksiyon doğrusal olmadığı için derece ortası kuzey-güney uzayan bir
    // kampüste şekli bir miktar kaydırır.
    lat: mercatorLatCenter(b.minLat, b.maxLat),
  };
}

function mercatorLatCenter(minLat: number, maxLat: number): number {
  const a = lonLatToWorld(0, minLat, 0).y;
  const b = lonLatToWorld(0, maxLat, 0).y;
  const mid = (a + b) / 2;
  // Ters Mercator: y → enlem.
  const n = Math.PI - (2 * Math.PI * mid) / 512;
  return (180 / Math.PI) * Math.atan(Math.sinh(n));
}

export interface FitZoomArgs {
  bounds: GeoBounds;
  /** Şeklin oturacağı alan (pt). */
  viewportWidth: number;
  viewportHeight: number;
  /** Ekran pt / harita px oranı (`coverScale`). */
  scale: number;
  /** Kenarlardan bırakılacak toplam nefes (pt). */
  padding: number;
  minZoom: number;
  maxZoom: number;
}

/**
 * Poligonu görünür alana SIĞDIRAN zoom.
 *
 * Mercator'da zoom bir katlama: `z+1` her şeyi iki katına çıkarıyor. Sıfır
 * zoomdaki piksel boyundan istenen ekran boyuna giden kat sayısının log2'si
 * aranan zoom.
 *
 * ⚠️ `scale` HESABA GİRİYOR: görüntü kutuya `cover` ile oturuyor ve ekranda
 * gördüğümüz piksel, haritanın kendi pikseli DEĞİL. Unutulursa kampüs
 * `1/scale` kadar (bizde ~%12) taşar.
 *
 * ⚠️ İki eksenden KÜÇÜK zoom seçiliyor: ikisi birden sığmak zorunda. Bantta
 * sınırlayıcı genelde YÜKSEKLİK — bant 120pt, ekran 393pt.
 */
export function fitZoom(args: FitZoomArgs): number {
  const { bounds, viewportWidth, viewportHeight, scale, padding } = args;

  const sw = lonLatToWorld(bounds.minLon, bounds.minLat, 0);
  const ne = lonLatToWorld(bounds.maxLon, bounds.maxLat, 0);
  const width0 = Math.abs(ne.x - sw.x);
  const height0 = Math.abs(sw.y - ne.y);

  const availableW = Math.max(viewportWidth - padding, 1);
  const availableH = Math.max(viewportHeight - padding, 1);

  // Nokta gibi (sıfır boyutlu) bir sınırda log2(∞) oluşmasın.
  const zoomX = width0 > 0 ? Math.log2(availableW / (scale * width0)) : Infinity;
  const zoomY =
    height0 > 0 ? Math.log2(availableH / (scale * height0)) : Infinity;

  const fit = Math.min(zoomX, zoomY);
  if (!Number.isFinite(fit)) return args.maxZoom;
  return Math.min(Math.max(fit, args.minZoom), args.maxZoom);
}
