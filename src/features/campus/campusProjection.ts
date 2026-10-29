import type {
  CampusCircle,
  CampusGeometry,
  GeoPolygon,
  GeoPosition,
  GeoRing,
} from "./campusTypes";

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

/**
 * KUTUYU KAPLAYAN, POLİGON ŞEKLİNDE DELİNMİŞ bir SVG `path`i.
 *
 * Akışta haritanın blur'u bu şekille maskeleniyor: zemin bulanık kalıyor,
 * kampüsün içi net (bkz. CampusPolygonBlurMask).
 *
 * ⚠️ TEK PATH OLMAK ZORUNDA, `fillRule="evenodd"` ile. Maskede çocuklar
 * birbirini silemez — şeffaf bir çocuk atasının opaklığını geri almaz — yani
 * delik ancak aynı yolun alt yolları arasındaki sarılma sayısından doğar:
 *   dikdörtgen (1) dolu → blur var, dış halka (2) boş → kampüs net,
 *   avlu (3) dolu → blur var.
 *
 * ⚠️ HALKA ÇIKMAZSA DÜZ DİKDÖRTGEN DÖNÜYOR: boş bir maske blur'un tamamını
 * yok ederdi, yani "deliği çizemedim" hatası "zemin bir anda netleşti" olarak
 * görünürdü. Deliksiz maske = blur'un maskesiz hâli.
 */
export function campusBlurHolePath(
  geometry: CampusGeometry,
  args: CampusProjectionArgs,
): string {
  const { boxWidth, boxHeight } = args;
  const rings = projectCampusGeometry(
    geometry,
    args,
    boxWidth / 2,
    boxHeight / 2,
  )
    .flatMap((polygon) => [polygon.outer, ...polygon.holes])
    .map(ringToSubpath)
    .filter(Boolean);

  return [`M0,0H${boxWidth}V${boxHeight}H0Z`, ...rings].join(" ");
}

/**
 * `"x,y x,y …"` → kapalı bir alt yol. Üç noktadan azı alan oluşturmuyor.
 *
 * ⚠️ DIŞARI AÇIK: blur maskesi dışında `CampusPolygonOverlay` de kullanıyor.
 * Poligon artık GRADYANLA dolduruluyor ve gradyanda delik ancak `evenodd`
 * ile açılıyor — yani orada da halkalar tek bir path'in alt yolları olmak
 * zorunda. İki yerin aynı yardımcıyı paylaşması şart: ayrı yazılsalardı
 * delik hesabı maske ile dolgu arasında sessizce ayrışırdı.
 */
export function ringToSubpath(points: string): string {
  const pairs = points.split(" ").filter(Boolean);
  if (pairs.length < 3) return "";
  return `M${pairs.join("L")}Z`;
}

/**
 * Halkanın EKRAN UZAYINDAKİ çevresi (pt) — `ringToSubpath`in ÖLÇÜSÜ.
 *
 * Tek müşterisi konturun kenar boyunca silinmesi (`CampusPolygonOverlay` >
 * dissolve): `strokeDasharray` bir UZUNLUK istiyor ve o uzunluk şeklin kendi
 * çevresi olmak zorunda, yoksa silinme ya şekli bitiremiyor ya da ortasında
 * tamamlanıyor.
 *
 * ⚠️ KAPANIŞ SEGMENTİ DAHİL (`% length`): `ringToSubpath` yolu `Z` ile
 * kapatıyor, yani son noktadan ilkine dönen kenar da çiziliyor. GeoJSON
 * halkaları ilk noktayı sonda tekrar ettiği için o segment çoğu zaman sıfır
 * uzunlukta — zararsız, ama tekrar etmeyen bir halkada eksik sayılırdı.
 *
 * ⚠️ AYNI GİRDİ BİÇİMİ (`"x,y x,y …"`) ve aynı eşik (üç noktadan azı alan
 * oluşturmuyor → 0): iki fonksiyon aynı halkayı farklı sayıyorsa dash deseni
 * çizilen yolla uyuşmaz.
 */
export function ringPerimeter(points: string): number {
  const pairs = points.split(" ").filter(Boolean);
  if (pairs.length < 3) return 0;
  let total = 0;
  for (let i = 0; i < pairs.length; i += 1) {
    const [ax, ay] = pairs[i].split(",");
    const [bx, by] = pairs[(i + 1) % pairs.length].split(",");
    const dx = Number(bx) - Number(ax);
    const dy = Number(by) - Number(ay);
    total += Math.sqrt(dx * dx + dy * dy);
  }
  return total;
}

// ── Poligonu olmayan kampüs: daireden KABA BİR PARSEL ──────────────────────

/** Dünyanın ortalama yarıçapı (m) — metre → derece çevrimi için. */
const EARTH_RADIUS_M = 6371008.8;

/**
 * Birim karenin çevresi — KÖŞE ve KENAR ORTASI dönüşümlü (çift index köşe).
 *
 * Kenar ortalarının ayrıca nokta olması şart: bozulma yalnız köşelere
 * uygulanırsa şekil "köşeleri oynamış ama kenarları cetvelle çizilmiş" bir
 * dörtgen olarak kalıyor. Orta noktalar kenarların da hafifçe içe/dışa
 * kıvrılmasını sağlıyor.
 */
const SQUARE_OUTLINE: ReadonlyArray<readonly [number, number]> = [
  [1, 1],
  [0, 1],
  [-1, 1],
  [-1, 0],
  [-1, -1],
  [0, -1],
  [1, -1],
  [1, 0],
];

/**
 * BOZULMA MİKTARLARI — "bi tık" (istek). Birim: yarım kenar oranı.
 *
 * Köşeler kenar ortalarından daha serbest: gözün "bu kare düzgün değil"
 * dediği şey ağırlıkla köşelerin hizası. 820m yarıçaplı bir kampüste 0.09 ≈
 * 74m, yani ekranda görünür ama "çizim hatası" değil "parsel böyle" olarak
 * okunuyor. Büyütülürse şekil dörtgenliğini kaybediyor; 0.2 civarında amip
 * oluyor.
 *
 * ⚠️ ÖLÇEK RADYAL: nokta merkezden uzaklığıyla çarpılıyor, yani açısal sıra
 * KORUNUYOR ve halka kendini kesemiyor. Serbest (x,y) kaydırma bu garantiyi
 * kaybettiriyor ve `evenodd` dolgu kendi kendini delen bir şekilde ters
 * dönüyor.
 */
const CORNER_JITTER = 0.09;
const EDGE_JITTER = 0.05;

/** Karenin eksenlerden sapması (radyan ≈ ±7°). Gerekçe aşağıda. */
const MAX_TILT = 0.12;

/**
 * Deterministik 32-bit tohum — AYNI KAMPÜS HER ZAMAN AYNI ŞEKİL.
 *
 * ⚠️ `Math.random` OLMAZ: şekil her render'da yeniden üretiliyor (memo
 * bağımlılığı değişince de) ve rastgele olsa kampüs ekranda her seferinde
 * başka bir dörtgen olarak çizilirdi — üstelik kampüs değişimi geçişinde
 * giden ve gelen kare aynı okulun iki ayrı şekli olurdu.
 *
 * 1e5 ölçeği ≈ 1m çözünürlük: aynı kampüsün koordinatı sunucuda yuvarlanıp
 * birkaç metre oynasa bile tohum değişmez.
 */
function shapeSeed(lat: number, lon: number): number {
  const a = Math.imul(Math.round(lat * 1e5) | 0, 0x85ebca6b);
  const b = Math.imul(Math.round(lon * 1e5) | 0, 0xc2b2ae35);
  return (a ^ b ^ 0x9e3779b9) >>> 0;
}

/** mulberry32 — kısa, tohumlu, dağılımı bu iş için fazlasıyla yeterli. */
function mulberry32(seed: number): () => number {
  let s = seed >>> 0;
  return () => {
    s = (s + 0x6d2b79f5) >>> 0;
    let t = s;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

/**
 * DAİRE → ÇİZİLEBİLİR GEOMETRİ: hafifçe BOZULMUŞ bir KARE.
 *
 * Sunucuda hâlâ poligonu olmayan kampüsler var (sözleşme notu: ~25 tane) ve
 * orada eskiden temsilî bir izometrik bina çiziliyordu (`CampusFigure`). İstek
 * onu kaldırdı: "poligon yoksa o bölgeyi çiz, sonuçta merkezini biliyoruz".
 * Merkez zaten elimizde — `/campus/boundary`nin `circle` alanı (işletim
 * sistemi geofence'inin tetiği, bkz. campusTypes > CampusCircle).
 *
 * ⚠️ ŞEKİL DAİRE DEĞİL KARE, VE DÜZGÜN KARE DE DEĞİL (istek: "yuvarlak değil
 * kare çiz ama tam düzgün kare olmasına bi tık boz"). Üç ayrı bozulma var ve
 * üçü birden gerekli:
 *   1. köşeler radyal olarak oynuyor (`CORNER_JITTER`),
 *   2. kenar ortaları da oynuyor — kenarlar cetvel gibi düz kalmasın,
 *   3. karenin tamamı eksenlerden ~±7° dönük (`MAX_TILT`).
 * Dönüklük olmadan şekil ekranda "ekranla hizalı bir dikdörtgen", yani bir
 * arayüz kutusu gibi okunuyor; kampüs parseli olarak okunması için haritanın
 * kendi ızgarasıyla hizasız olması gerekiyor.
 *
 * ⚠️ BOZULMA DETERMİNİSTİK: tohum merkez koordinatından (`shapeSeed`), yani
 * aynı kampüs her açılışta aynı dörtgen, farklı kampüsler farklı dörtgen.
 *
 * ⚠️ ÇİZİM İÇİN, KARAR İÇİN DEĞİL. "Kampüsteyim" kararını YALNIZ gerçek
 * poligon veriyor (gerekçe `campusBoundary.ts` başında: Boğaziçi'nin dairesi
 * Bebek'in yarısını içine alıyor). Bu fonksiyonun ürettiği halkayı
 * `campusCanPost` benzeri bir kapıya SOKMAYIN — hem sunucunun kapısını
 * istemcide genişletmiş olursunuz hem de kapıyı UYDURULMUŞ bir kenara
 * bağlarsınız.
 *
 * ⚠️ AYRI BİR BİLEŞEN DEĞİL, GEOMETRİ: şekil gerçek poligonun yerine aynı
 * boru hattına giriyor — kadraj (`fitZoom` ile banda oturma), blur deliği,
 * tam ekranda yakınlaşma ve kampüs değişimi geçişi hiç değişmeden çalışıyor.
 * SVG'de bir `<Rect>` çizmek bunların HEPSİNİ ayrıca yazmak demekti.
 *
 * ── Metre → derece ─────────────────────────────────────────────────────────
 * Hesap METRİK uzayda yapılıyor (döndürme ancak orada doğru), çevrim en sonda:
 * enlemde sabit (`r / R`), boylamda enlemle birlikte açılıyor (`/ cos φ`) —
 * 41°'de bir boylam derecesi bir enlem derecesinin ~%75'i kadar. Bölme
 * atlanırsa kare kuzey-güney basık bir dikdörtgen olur.
 *
 * ⚠️ EKRANDA DA KARE: Mercator açı koruyan (konformal) bir projeksiyon, yani
 * kampüs ölçeğinde metrik kare ekranda da kare kalıyor; ayrıca bir düzeltme
 * GEREKMİYOR.
 *
 * Yarım kenar = dairenin yarıçapı, yani kare dairenin DIŞINA değil içine
 * teğet: kapsadığı alan dairenin kabaca dörtte üçü. Daireyle aynı sınır
 * kutusunu korumak kadrajı da koruyor.
 */
export function campusAreaGeometry(circle: CampusCircle): GeoPolygon {
  const rand = mulberry32(shapeSeed(circle.lat, circle.lon));
  const tilt = (rand() * 2 - 1) * MAX_TILT;
  const sin = Math.sin(tilt);
  const cosT = Math.cos(tilt);

  const metersToLat = 180 / (Math.PI * EARTH_RADIUS_M);
  // Kutuplara yakın `cos` sıfıra gidiyor; kampüs enlemlerinde imkânsız ama
  // bölen sıfırlanırsa halka Infinity'lerle dolar ve path sessizce ölür.
  const cosLat = Math.max(Math.cos((circle.lat * Math.PI) / 180), 1e-6);

  const ring: GeoRing = SQUARE_OUTLINE.map(([ux, uy], i) => {
    const jitter = i % 2 === 0 ? CORNER_JITTER : EDGE_JITTER;
    const scale = (1 + (rand() * 2 - 1) * jitter) * circle.radiusMeters;
    // Metrik düzlem: x doğu, y kuzey.
    const mx = ux * scale;
    const my = uy * scale;
    const rx = mx * cosT - my * sin;
    const ry = mx * sin + my * cosT;
    return [
      circle.lon + (rx * metersToLat) / cosLat,
      circle.lat + ry * metersToLat,
    ] as GeoPosition;
  });

  // GeoJSON halkası KAPALI: son nokta ilkinin aynısı. `ringToSubpath` yolu
  // zaten `Z` ile kapatıyor ama halka başka bir tüketiciye (sınır kutusu,
  // ileride bir nokta testi) de gidiyor ve orada eksik kapanış sessiz bir hata.
  ring.push([...ring[0]] as GeoPosition);

  return { type: "Polygon", coordinates: [ring] };
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

/**
 * Sınırın EKRANDAKİ ölçüsü (pt) — verilen zoom ve `cover` ölçeğinde.
 *
 * `fitZoom`un tersi: o "şu alana sığan zoom" diyor, bu "şu zoomda kaç pt
 * tutuyor". Tam ekrana geçerken poligona ne kadar yakınlaşılabileceği buradan
 * hesaplanıyor (bkz. FeedMapStrip > `expandScale`) — tahminle yapılsa şekil
 * bazı kampüslerde ekrandan taşardı.
 */
export function boundsScreenSize(
  bounds: GeoBounds,
  zoom: number,
  scale: number,
): { width: number; height: number } {
  const sw = lonLatToWorld(bounds.minLon, bounds.minLat, zoom);
  const ne = lonLatToWorld(bounds.maxLon, bounds.maxLat, zoom);
  return {
    width: Math.abs(ne.x - sw.x) * scale,
    height: Math.abs(sw.y - ne.y) * scale,
  };
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
