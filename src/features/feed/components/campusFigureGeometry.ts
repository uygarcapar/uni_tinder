/**
 * Akış haritasındaki KAMPÜS DİORAMASININ geometrisi — tek bir nokta bile elle
 * yazılmıyor, hepsi aynı izometrik projeksiyondan türüyor.
 *
 * ── Neden ayrı dosya ────────────────────────────────────────────────────────
 * Burası saf matematik: hiçbir import'u yok, çıktısı salt sayı ve nokta dizesi.
 * `CampusFigure.tsx` ise onu boyayan katman (palet, gradyan, çizim sırası).
 * Ayrılmalarının iki somut faydası var:
 *   • Geometri `node` ile ÇALIŞTIRILIP doğrulanabiliyor — çapa oranı ve en/boy
 *     figürün banda sığıp sığmadığını belirliyor, gözle kestirilecek sayılar
 *     değil (bkz. FeedMapStrip > CAMPUS_FIGURE_HEIGHT).
 *   • Bileşen dosyası 200 poligonun hesabıyla değil, yalnız boyamayla
 *     ilgileniyor.
 *
 * ── Projeksiyon ─────────────────────────────────────────────────────────────
 * Klasik 30° izometri: dünyadaki (x, y, z) → `((x−y)·cos30, (x+y)·sin30 − z)`.
 * x sağa-arkaya, y sola-öne, z yukarı.
 *
 * ⚠️ GÖRÜNEN YÜZLER `x = x1` VE `y = y1` DÜZLEMLERİ. Bu projeksiyonda `(x+y)`
 * büyüdükçe nokta ekranda AŞAĞI iniyor, yani izleyiciye yakın olan uçlar
 * x1/y1 tarafı. İlk kurulumda yüzler x0/y0'dan alınmıştı — figür ARKASINDAN
 * çiziliyordu ve çatı bütün duvarları örttüğü için "masa" gibi görünüyordu.
 * Yeni bir hacim eklerken yüzleri `boxFaces`ten al, elle yazma.
 *
 * ⚠️ UZAK NOKTA YUKARI ÇIKAR. Aynı `z`de geride duran nokta ekranda `d/2`
 * kadar YUKARIDA. Kule bu yüzden siluetin tepesini DELMİYOR ama önündeki çatı
 * düzleminin üstünde net duruyor. Kuleyi "daha görünür" yapmak için boyunu
 * uzatmak yerine öne (büyük y) almak gerekir.
 *
 * ── Z-SIRASI SADECE ÇİZİM SIRASI ────────────────────────────────────────────
 * Ressam algoritması: arkadaki önce. Dosyadaki `CAMPUS_DRAW_ORDER` yorumu
 * bileşenin sırasıyla birebir aynı olmalı. Yeni bir hacim eklerken "bu
 * neyin önünde/arkasında" sorusunun cevabı `x+y` toplamı — büyük olan önde.
 */

/** 30° izometri — iki sabit tek yerde. */
const ISO_COS = Math.cos(Math.PI / 6);
const ISO_SIN = 0.5;

type Point = [number, number];

/**
 * Çizilen HER noktanın kaydı — viewBox ve çapa bundan türüyor.
 * ⚠️ Yan etki bilerek `project`in içinde: geometri bir düzine yardımcıya
 * dağıldığı için "sınır kutusuna neyi kattığımı" ayrıca listelemek, bir poligon
 * eklenip listeye yazılmadığında sessizce kırpılan bir figür demekti.
 */
const SEEN: Point[] = [];

/** Ekran uzayında kurulan noktalar (daire/elips uçları) sınır kutusuna elle girer. */
function see(point: Point): Point {
  SEEN.push(point);
  return point;
}

/** Dünya koordinatı → SVG koordinatı (öteleme YOK; viewBox negatif başlıyor). */
function project(x: number, y: number, z: number): Point {
  return see([(x - y) * ISO_COS, (x + y) * ISO_SIN - z]);
}

function poly(...points: Point[]): string {
  return points.map(([x, y]) => `${x.toFixed(2)},${y.toFixed(2)}`).join(" ");
}

/** Ekranda kurulan dairesel/eliptik şeklin dört ucu. */
function seeOval(cx: number, cy: number, rx: number, ry: number): void {
  see([cx - rx, cy]);
  see([cx + rx, cy]);
  see([cx, cy - ry]);
  see([cx, cy + ry]);
}

// ── Ölçüler ────────────────────────────────────────────────────────────────
/** Ana blok: en (x) · derinlik (y) · duvar yüksekliği (z). */
const W = 56;
const D = 36;
const WALL_TOP = 28;
/** Düz çatının korkuluğu: çatıyı "kapak" değil ZEMİN gibi okutan ince bant. */
const PARAPET = 3;
const ROOF_TOP = WALL_TOP + PARAPET;

/**
 * SÖVE (binanın oturduğu basamak) — dışa taşma ve yüksekliği.
 *
 * Süs değil, KONTRAST ÇÖZÜMÜ: gövde sıcak açık taş, kaide ise çimen; açık
 * temada (harita neredeyse beyaz) ikisinin arasında koyu bir bant olmadan
 * binanın tabanı zemine yapışıyor. Söve o bandı veriyor ve aynı zamanda
 * "bina yere OTURUYOR" okunuşunu kuruyor.
 *
 * ⚠️ ÇIKINTI İNCE OLMAK ZORUNDA. 4 birimde (bir pencere eni) söve duvarın
 * dibinde dolanan açık renkli bir RAF gibi okunuyordu: üst şeridi duvarın alt
 * bandını örtüyor — geometrik olarak doğru, çünkü çıkıntı gerçekten duvarın
 * önünde — ama ekranda binadan fırlayan bir kalas. 1.5'ta şerit bir çizgiye
 * iniyor ve geriye tam olarak istenen şey kalıyor: ayırıcı koyu bant.
 */
const PLINTH_OUT = 1.5;
const PLINTH_TOP = 3.2;

/**
 * Saat kulesi — çatının ön yarısında.
 *
 * ⚠️ DAR VE UZUN olmak zorunda. İlk kurulumda 12 birim genişti (binanın
 * eninin beşte biri) ve 17 birim yükseliyordu: ekranda kule değil, çatıya
 * konmuş bir asansör kulesi gibi duruyordu. Oran kuleyi kule yapan şey.
 */
const TOWER_X0 = 24;
const TOWER_X1 = 34;
const TOWER_Y0 = 19;
const TOWER_Y1 = 29;
const TOWER_TOP = 50;

/** Kat hizaları = pencere sıraları. */
const FLOORS: Array<[number, number]> = [
  [5, 11],
  [17, 23],
];
const DOOR_X: [number, number] = [24, 32];
const DOOR_TOP = 12;

/**
 * KAİDE (kampüs parseli) — figürü "boşlukta duran bina"dan "bir YERDE duran
 * kampüs"e çeviren parça.
 *
 * ⚠️ PAYLAR HER İKİ UÇTA EŞİT OLMAK ZORUNDA. Kaide binanın merkezine
 * (W/2, D/2) simetrik olduğu sürece — ki çapa da orası — sınır kutusu çapanın
 * etrafında simetrik çıkıyor, yani `CAMPUS_FIGURE_ANCHOR.x` tam 0.5 oluyor ve
 * çağıran yatayda `alignItems: "center"` ile hizalayabiliyor. Payları
 * asimetrik yaparsan bina haritadaki kampüs noktasının yanına düşer; o zaman
 * yatay çapayı da uygulamak gerekir.
 *
 * ⚠️ Kaide en DIŞTAKİ şey olmalı: ağaçlar, flama ve gölge onun izdüşümünün
 * içinde kalıyor (hesaplandı). Biri taşarsa yukarıdaki simetri bozulur.
 */
const PLATE_MARGIN_X = 14;
const PLATE_MARGIN_Y = 16;
const PLATE_RADIUS = 16;
/** Parselin kalınlığı — toprak kesiti. Ekran uzayında AŞAĞI öteleme. */
const PLATE_T = 5.5;

// ── Yüz üreticileri ────────────────────────────────────────────────────────
/** Eksenlere paralel bir kutunun GÖRÜNEN üç yüzü (bkz. yüz uyarısı). */
function boxFaces(
  x0: number,
  x1: number,
  y0: number,
  y1: number,
  z0: number,
  z1: number,
) {
  return {
    /** Üst yüz — ışığı en çok alan. */
    top: poly(
      project(x0, y0, z1),
      project(x1, y0, z1),
      project(x1, y1, z1),
      project(x0, y1, z1),
    ),
    /** Sağdaki yan yüz: `x = x1` düzlemi. */
    side: poly(
      project(x1, y0, z0),
      project(x1, y1, z0),
      project(x1, y1, z1),
      project(x1, y0, z1),
    ),
    /** Soldaki CEPHE: `y = y1` düzlemi — kapı ve pencerelerin çoğu burada. */
    front: poly(
      project(x0, y1, z0),
      project(x1, y1, z0),
      project(x1, y1, z1),
      project(x0, y1, z1),
    ),
  };
}

/** Cephe düzlemine (y sabit) yatan dikdörtgen panel. */
function frontPanel(
  x0: number,
  x1: number,
  z0: number,
  z1: number,
  y = D,
): string {
  return poly(
    project(x0, y, z0),
    project(x1, y, z0),
    project(x1, y, z1),
    project(x0, y, z1),
  );
}

/** Yan yüze (x = W) yatan panel. */
function sidePanel(y0: number, y1: number, z0: number, z1: number): string {
  return poly(
    project(W, y0, z0),
    project(W, y1, z0),
    project(W, y1, z1),
    project(W, y0, z1),
  );
}

/** ZEMİNE (z sabit) yatan dörtgen — yol, söve şeridi. */
function groundQuad(
  a: Point,
  b: Point,
  c: Point,
  d: Point,
  z = 0,
): string {
  return poly(
    project(a[0], a[1], z),
    project(b[0], b[1], z),
    project(c[0], c[1], z),
    project(d[0], d[1], z),
  );
}

/**
 * Cephe düzlemindeki DAİRE — saat kadranı.
 *
 * ⚠️ `<Circle>` + matris dönüşümü DEĞİL: düşey bir düzlemdeki daire izometride
 * dönmüş bir elipse düşüyor ve bunu SVG'de kurmak `matrix(...)` dizesi
 * istiyor; react-native-svg'de o yol sürüm sürüm değişiyor. Çokgen yaklaşımı
 * aynı projeksiyon fonksiyonundan geçtiği için KESİN doğru ve 14 kenar bu
 * ölçekte daireden ayırt edilemiyor.
 */
function faceCircle(cx: number, cz: number, r: number, y: number): string {
  const STEPS = 14;
  return poly(
    ...Array.from({ length: STEPS }, (_, i) => {
      const a = (i / STEPS) * Math.PI * 2;
      return project(cx + r * Math.cos(a), y, cz + r * Math.sin(a));
    }),
  );
}

/**
 * Zemindeki YUVARLAK KÖŞELİ dikdörtgenin çevresi — dünya uzayında örnekleniyor,
 * sonra projeksiyondan geçiyor. Köşe başına 6 adım bu ölçekte yaydan ayırt
 * edilemiyor (24 nokta, dize kısa kalıyor).
 */
function roundedRectOutline(
  x0: number,
  x1: number,
  y0: number,
  y1: number,
  r: number,
): Point[] {
  const STEPS = 6;
  const corners: Array<{ cx: number; cy: number; from: number }> = [
    { cx: x1 - r, cy: y0 + r, from: -Math.PI / 2 },
    { cx: x1 - r, cy: y1 - r, from: 0 },
    { cx: x0 + r, cy: y1 - r, from: Math.PI / 2 },
    { cx: x0 + r, cy: y0 + r, from: Math.PI },
  ];
  return corners.flatMap(({ cx, cy, from }) =>
    Array.from({ length: STEPS + 1 }, (_, i): Point => {
      const a = from + (i / STEPS) * (Math.PI / 2);
      return [cx + r * Math.cos(a), cy + r * Math.sin(a)];
    }),
  );
}

// ── Kaide ──────────────────────────────────────────────────────────────────
const PLATE_X0 = -PLATE_MARGIN_X;
const PLATE_X1 = W + PLATE_MARGIN_X;
const PLATE_Y0 = -PLATE_MARGIN_Y;
const PLATE_Y1 = D + PLATE_MARGIN_Y;

const PLATE_OUTLINE = roundedRectOutline(
  PLATE_X0,
  PLATE_X1,
  PLATE_Y0,
  PLATE_Y1,
  PLATE_RADIUS,
).map(([x, y]) => project(x, y, 0));

/** Parselin üst yüzü (çimen). */
export const PLATE_TOP = poly(...PLATE_OUTLINE);

/**
 * Parselin KALINLIĞI — ayrı bir yan yüz hesabı YOK.
 *
 * `project`te `z` yalnız ekran y'sini etkiliyor, yani aynı çevrenin `z = −T`
 * hâli üstteki çevrenin `T` kadar AŞAĞI ötelenmişi. Alt çevreyi önce koyu
 * toprak rengiyle, üstünü sonra çimenle boyayınca iki şeklin BİRLEŞİMİ tam
 * olarak ekstrüzyonun silueti oluyor — yuvarlak köşelerde bile. Siluetin alt
 * kenarında kalan hilal de toprak kesitinin kendisi.
 */
export const PLATE_SIDE = poly(
  ...PLATE_OUTLINE.map(([x, y]): Point => see([x, y + PLATE_T])),
);

/** Kapıdan parselin ön kenarına uzanan, hafifçe genişleyen yol. */
export const PLATE_PATH = groundQuad(
  [DOOR_X[0], D],
  [DOOR_X[1], D],
  [DOOR_X[1] + 3, PLATE_Y1],
  [DOOR_X[0] - 3, PLATE_Y1],
);

// ── Bina ───────────────────────────────────────────────────────────────────
const BODY = boxFaces(0, W, 0, D, 0, WALL_TOP);
const CAP = boxFaces(0, W, 0, D, WALL_TOP, ROOF_TOP);
/** Kule en son çiziliyor: önündeki çatıyı örtüyor, "yükseliyor" okunuşu oradan. */
const TOWER = boxFaces(
  TOWER_X0,
  TOWER_X1,
  TOWER_Y0,
  TOWER_Y1,
  ROOF_TOP,
  TOWER_TOP,
);

export const BODY_SIDE = BODY.side;
export const BODY_FRONT = BODY.front;
export const CAP_TOP = CAP.top;
export const CAP_SIDE = CAP.side;
export const CAP_FRONT = CAP.front;
export const TOWER_TOP_FACE = TOWER.top;
export const TOWER_SIDE = TOWER.side;
export const TOWER_FRONT = TOWER.front;

/**
 * SÖVENİN GÖRÜNEN parçaları — üst yüzün TAMAMI değil.
 *
 * Söve gövdeden SONRA çiziliyor (ön/yan yüzleri `y = D+out` ve `x = W+out`
 * düzlemlerinde, yani gövdeden DAHA YAKIN). Ama üst yüzün tamamını o sırada
 * basmak, duvarların alt yarısının üstüne koca bir elmas sürmek demek: o yüzün
 * `y < D` kalan kısmı gövdenin ARKASINDA. O yüzden yalnız iki şerit var —
 * binanın önünde kalan ve sağında kalan.
 *
 * ⚠️ Kapının tabanı `PLINTH_TOP`tan başlıyor (zeminden değil): sövenin ön
 * şeridinin iç kenarıyla TAM hizalanıyor, yoksa kapı basamağın üstüne taşardı.
 */
export const PLINTH_TOP_FRONT = groundQuad(
  [-PLINTH_OUT, D],
  [W + PLINTH_OUT, D],
  [W + PLINTH_OUT, D + PLINTH_OUT],
  [-PLINTH_OUT, D + PLINTH_OUT],
  PLINTH_TOP,
);
export const PLINTH_TOP_SIDE = groundQuad(
  [W, -PLINTH_OUT],
  [W + PLINTH_OUT, -PLINTH_OUT],
  [W + PLINTH_OUT, D],
  [W, D],
  PLINTH_TOP,
);
export const PLINTH_FRONT = frontPanel(
  -PLINTH_OUT,
  W + PLINTH_OUT,
  0,
  PLINTH_TOP,
  D + PLINTH_OUT,
);
export const PLINTH_SIDE = poly(
  project(W + PLINTH_OUT, -PLINTH_OUT, 0),
  project(W + PLINTH_OUT, D + PLINTH_OUT, 0),
  project(W + PLINTH_OUT, D + PLINTH_OUT, PLINTH_TOP),
  project(W + PLINTH_OUT, -PLINTH_OUT, PLINTH_TOP),
);

export const FRONT_WINDOWS = [
  ...FLOORS.flatMap(([z0, z1]) =>
    [4, 13, 36, 45].map((x) => frontPanel(x, x + 7, z0, z1)),
  ),
  // Giriş aksında ÜST katta pencere var, zeminde kapı.
  frontPanel(DOOR_X[0], DOOR_X[1], FLOORS[1][0], FLOORS[1][1]),
];
export const SIDE_WINDOWS = FLOORS.flatMap(([z0, z1]) =>
  [8, 21].map((y) => sidePanel(y, y + 7, z0, z1)),
);
export const DOOR = frontPanel(DOOR_X[0], DOOR_X[1], PLINTH_TOP, DOOR_TOP);

/**
 * Çatı pencereleri — düz çatının ortasındaki koca boş elması bölen tek şey.
 * Camlarla aynı soğuk tonda oldukları için çatıya "bu bir bina" bilgisini
 * geri veriyorlar.
 *
 * ⚠️ KULENİN EKRAN SÜTUNUNDAN UZAK DURMALILAR. İlk yerleşimde ikisi de çatının
 * ARKA yarısındaydı; soldaki kulenin tam arkasına düşüyordu ve kule onu
 * (doğru biçimde) örtüyordu — yani hiç çizilmemiş gibiydi. Çatıda bir şey
 * konumlandırırken ölçüt dünya koordinatı değil, kulenin EKRANDAKİ x aralığı.
 */
export const SKYLIGHTS = [
  groundQuad([4, 18], [14, 18], [14, 26], [4, 26], ROOF_TOP),
  groundQuad([40, 6], [50, 6], [50, 14], [40, 14], ROOF_TOP),
];

// ── Saat ve flama ──────────────────────────────────────────────────────────
/** Saat — kulenin CEPHESİNDE (y = TOWER_Y1). Akrep/yelkovan ince panel. */
const CLOCK_CX = (TOWER_X0 + TOWER_X1) / 2;
const CLOCK_CZ = 43;
const CLOCK_R = 3.4;
export const CLOCK_DIAL = faceCircle(CLOCK_CX, CLOCK_CZ, CLOCK_R, TOWER_Y1);
export const CLOCK_MINUTE = frontPanel(
  CLOCK_CX - 0.35,
  CLOCK_CX + 0.35,
  CLOCK_CZ,
  CLOCK_CZ + 2.8,
  TOWER_Y1,
);
export const CLOCK_HOUR = frontPanel(
  CLOCK_CX,
  CLOCK_CX + 2.4,
  CLOCK_CZ - 0.35,
  CLOCK_CZ + 0.35,
  TOWER_Y1,
);

/** Bayrak direği kulenin üst yüzünün ORTASINDAN çıkıyor. */
const [POLE_X, POLE_BASE_Y] = project(
  CLOCK_CX,
  (TOWER_Y0 + TOWER_Y1) / 2,
  TOWER_TOP,
);
const POLE_HEIGHT = 14;
const FLAG_W = 11;
const FLAG_H = 6;
export const POLE = {
  x: POLE_X,
  topY: POLE_BASE_Y - POLE_HEIGHT,
  height: POLE_HEIGHT,
};
/** Dalgasız, üç köşeli flama — bu ölçekte kıvrım çamura dönüyor. */
export const FLAG = poly(
  see([POLE.x, POLE.topY]),
  see([POLE.x + FLAG_W, POLE.topY + FLAG_H / 2]),
  [POLE.x, POLE.topY + FLAG_H],
);

// ── Ağaçlar ────────────────────────────────────────────────────────────────
export interface CampusTree {
  /** Gövdenin ekrandaki x'i. */
  x: number;
  /** Gövdenin TABANI — ağacın çimene değdiği nokta. */
  baseY: number;
  trunkHeight: number;
  canopyY: number;
  canopyR: number;
  shadowRx: number;
  shadowRy: number;
}

/**
 * Küre izometride DAİREYE düşüyor (ortografik projeksiyon yarıçapı korur), yani
 * taç tek bir `<Circle>`. Hacmi radyal gradyan veriyor, poligon değil.
 *
 * ⚠️ KONUMLAR BİNAYLA ÇAKIŞMAYACAK ŞEKİLDE SEÇİLDİ (hesaplandı): sol ağaç
 * binanın sol köşesinin ekran x'inin solunda, sağ ağaç sağ köşesinin sağında
 * kalıyor. Çakışmadıkları için çizim sırası serbest; yine de doğru olsun diye
 * ARKADAKİ (küçük x+y) binadan önce, ÖNDEKİ sonra çiziliyor. Bir ağacı
 * oynatacaksan bu iki şeyi birlikte kontrol et.
 */
function tree(
  worldX: number,
  worldY: number,
  trunkHeight: number,
  canopyR: number,
): CampusTree {
  const [x, baseY] = project(worldX, worldY, 0);
  const canopyY = baseY - trunkHeight - canopyR * 0.75;
  seeOval(x, canopyY, canopyR, canopyR);
  return {
    x,
    baseY,
    trunkHeight,
    canopyY,
    canopyR,
    // Zemindeki daire izometride elipse düşüyor: rx = r·√2·cos30, ry = r·√2/2.
    shadowRx: canopyR * 1.1,
    shadowRy: canopyR * 0.62,
  };
}

/**
 * ⚠️ TAÇ GÖVDEDEN BASKIN OLMALI. İlk ölçüler (gövde 5, taç 6) ekranda LOLİPOP
 * veriyordu: ince uzun bir çubuğun ucunda küçük bir top. Ağaç okunuşunu veren
 * oran tacın gövdeyi neredeyse yutması — gövdeden geriye bir-iki birim
 * kalıyor, o da zaten tacın gölgesinde.
 */
/** Binanın ARKASINDA kalan (küçük x+y) — gövdeden ÖNCE çiziliyor. */
export const TREES_BEHIND: CampusTree[] = [tree(68, 2, 3, 6.5)];
/** Binanın ÖNÜNDE kalan — gövdeden SONRA çiziliyor. */
export const TREES_FRONT: CampusTree[] = [
  tree(2, 48, 3, 7),
  tree(40, 48, 1.2, 3.8),
];

// ── Zemin gölgesi ──────────────────────────────────────────────────────────
const PLATE_LEFT = Math.min(...PLATE_OUTLINE.map(([x]) => x));
const PLATE_RIGHT = Math.max(...PLATE_OUTLINE.map(([x]) => x));
const PLATE_NEAR = Math.max(...PLATE_OUTLINE.map(([, y]) => y));
const PLATE_FAR = Math.min(...PLATE_OUTLINE.map(([, y]) => y));

/**
 * Parselin altındaki yumuşak gölge — figürü haritaya BASTIRAN tek öğe.
 * Ölçüsü parselin kendi izdüşümünden türüyor, elle verilmiş bir elips değil;
 * payları değiştirince gölge de peşinden geliyor.
 */
export const GROUND_SHADOW = {
  cx: (PLATE_LEFT + PLATE_RIGHT) / 2,
  cy: (PLATE_FAR + PLATE_NEAR) / 2 + PLATE_T + 4,
  rx: (PLATE_RIGHT - PLATE_LEFT) / 2,
  ry: (PLATE_NEAR - PLATE_FAR) / 2,
};
seeOval(GROUND_SHADOW.cx, GROUND_SHADOW.cy, GROUND_SHADOW.rx, GROUND_SHADOW.ry);

// ── Kadraj: viewBox ve çapa, çizilen noktalardan ───────────────────────────
/** Kontur yarısı + gölgenin taşması için pay. */
const PAD = 3;
const MIN_X = Math.min(...SEEN.map(([x]) => x)) - PAD;
const MAX_X = Math.max(...SEEN.map(([x]) => x)) + PAD;
const MIN_Y = Math.min(...SEEN.map(([, y]) => y)) - PAD;
const MAX_Y = Math.max(...SEEN.map(([, y]) => y)) + PAD;
const VB_W = MAX_X - MIN_X;
const VB_H = MAX_Y - MIN_Y;

export const CAMPUS_VIEW_BOX = `${MIN_X.toFixed(2)} ${MIN_Y.toFixed(
  2,
)} ${VB_W.toFixed(2)} ${VB_H.toFixed(2)}`;

/** Figürün OTURDUĞU nokta — parselin (ve binanın) merkezi. */
const [ANCHOR_X, ANCHOR_Y] = [
  ((W - D) / 2) * ISO_COS,
  ((W + D) / 2) * ISO_SIN,
];

/**
 * Çapanın viewBox içindeki ORANI. Çağıran `top`u bununla geri alıyor.
 *
 * `x` tam 0.5 çıkıyor — parsel binanın merkezine simetrik ve sınır kutusunu O
 * belirliyor (bkz. PLATE_MARGIN uyarısı). Çağıran bu yüzden yatayda
 * `alignItems: "center"` kullanabiliyor.
 */
export const CAMPUS_FIGURE_ANCHOR = {
  x: (ANCHOR_X - MIN_X) / VB_W,
  y: (ANCHOR_Y - MIN_Y) / VB_H,
};

/** Figürün en/boy oranı — çağıran YÜKSEKLİĞİ veriyor (bandın sınırı o). */
export const CAMPUS_FIGURE_ASPECT = VB_W / VB_H;
