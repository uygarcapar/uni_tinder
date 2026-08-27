/**
 * Süper beğeni alev dalgasının GEOMETRİSİ — Skia'dan bağımsız.
 *
 * Tüm path işlemleri dışarıdan verilen bir adaptörle yapılıyor. Sebep: aynı
 * kodu Node tarafında canvaskit-wasm ile render edip şekli cihaza gitmeden
 * doğrulayabilmek. Geometriyi bir de önizleme betiğinde yazsaydık iki sürüm
 * kaçınılmaz olarak birbirinden ayrışırdı.
 *
 * Şekil, tab bar'daki Keşfet alev ikonunun (icons/FlameGlyph) ta kendisi:
 * glyph birkaç kez, farklı boy ve konumlarda bir gövdenin üstüne oturtulup
 * BİRLEŞTİRİLİYOR. Birleşim şart — ayrı ayrı çizilse konturları birbirinin
 * içinden geçerdi; tek silüet olunca tek bir dış hat çıkıyor.
 */

/**
 * Dalganın ekranı bir uçtan bir uca geçme süresi. Kutlama kısa: alev ekranda
 * durmuyor, alttan girip üstten çıkıyor.
 *
 * AŞAĞI ÇEKİLEMEZ. Süre yalnız bir tempo tercihi değil, aynı zamanda desteyi
 * ilerletmek için elimizdeki ZAMAN: ekranın tam kapalı olduğu pencere bu
 * sürenin sabit bir oranı (~%15) ve kart değişimi o pencerenin içinde olup
 * bitmek zorunda (bkz. flameWaveGeometry / coverMs). 1250 ms'de pencere ~190
 * ms'ye düşüyordu; yeni alt kartın mount'u ona sığmayınca değişim dalganın
 * arka kenarı geçerken görünüyordu. Kısaltmak isteyen önce o pencereyi
 * ölçsün.
 *
 * Bu (Skia'ya dokunmayan) modülde duruyor çünkü İKİ taraf da okuyor: canvas
 * animasyonu sürüyor, dinleyici de canvas'ı bu süre sonunda söküyor. İki ayrı
 * sabit olarak tutulduğunda biri güncellenip diğeri bayat kalmıştı.
 */
export const FLAME_WAVE_MS = 1700;

/**
 * Alev uçlarının oynaması, tek bir şeklin deforme edilmesiyle DEĞİL, önceden
 * kurulmuş `FLICKER_FRAMES` ayrı silüet arasında geçilerek yapılıyor: şekli
 * her karede yeniden kurmak ~1.4 ms (bkz. ölçüm) ve 60 fps'de karşılanamaz.
 *
 * Düşük kare hızı burada bir taviz değil, üslubun kendisi: elle çizilmiş alev
 * döngüleri de 8-12 fps oynar. `phase` 0→1 arasında tam bir tur attığı ve tüm
 * salınım katsayıları TAM SAYI olduğu için döngü diksiz kapanıyor.
 */
export const FLICKER_FRAMES = 10;
export const FLICKER_FPS = 14;

export interface WaveApi<P> {
  fromSVG(d: string): P;
  empty(): P;
  addRect(p: P, x: number, y: number, w: number, h: number): void;
  /** 3x3, satır öncelikli: [a, b, tx, c, d, ty, 0, 0, 1] */
  transform(p: P, m: number[]): void;
  /** dst = dst ∪ src */
  union(dst: P, src: P): void;
  /** dst = dst \ src */
  difference(dst: P, src: P): void;
  offset(p: P, dx: number, dy: number): void;
}

// FlameGlyph 24'lük grid'inde alev: x 4.48..19.52, y 2..22 (bkz.
// icons/FlameGlyph — ölçüler oradaki bakeleme notuyla aynı).
const GLYPH_CX = 12;
const GLYPH_BOTTOM = 22;
const GLYPH_HEIGHT = 20;

const TAU = Math.PI * 2;

/** [merkez x (genişliğe oranla), boy çarpanı] */
type Tongue = readonly [number, number];

// Az sayıda BÜYÜK dil: ikonun kendisi okunsun. Çok dil koyunca glyph'ler
// birbirine girip jenerik bir "testere dişi" oluyor, alev ikonu kayboluyordu.
// x'ler 0'ın altına ve 1'in üstüne taşıyor — ekran kenarında yarım dil görünsün,
// dalga sağdan/soldan kesilmiş gibi durmasın.
const TOP_TONGUES: readonly Tongue[] = [
  [-0.14, 0.82],
  [0.19, 1.0],
  [0.5, 0.6],
  [0.81, 0.95],
  [1.14, 0.78],
];

// Alt kenar (dalganın arka sınırı) — daha kısa ve kaydırılmış: iki kenar aynı
// olsaydı dalga her yerde eşit kalınlıkta bir şerit gibi durur, akış kaybolurdu.
const BOTTOM_TONGUES: readonly Tongue[] = [
  [0.0, 0.9],
  [0.34, 0.58],
  [0.66, 0.88],
  [0.99, 0.66],
];

/** Alt kenarın (kesici profil) dilleri üsttekilerden kısa — bkz. buildFlameWave. */
const BOTTOM_TONGUE_SCALE = 0.85;

/** Diller boylarının bu kadarı gövdenin İÇİNE gömülü — bkz. buildProfile. */
const TONGUE_EMBED = 0.3;

/** Uçların en fazla ne kadar uzayıp kısaldığı. */
const FLICKER_STRETCH = 0.16;
/** Ucun yana yatma miktarı (x kayması / glyph yüksekliği). */
const FLICKER_LEAN = 0.06;
/** Dilin tabanının yanal kayması (genişliğe oranla). */
const FLICKER_DRIFT = 0.022;

/**
 * Tabanı `baseY`'de, boyu `h`, merkezi `cx` olan tek bir alev dili.
 *
 * `lean` ucu yana yatırıyor: matris x'e y'ye bağlı bir kayma (shear) ekliyor,
 * ama öteleme TABANDA sıfır kayma verecek şekilde seçiliyor — yoksa dil
 * gövdeye bağlı olduğu yerden kayıp kopuk görünürdü.
 */
function addTongue<P>(
  api: WaveApi<P>,
  dst: P,
  glyph: string,
  cx: number,
  baseY: number,
  h: number,
  lean: number,
): void {
  const s = h / GLYPH_HEIGHT;
  const shear = lean * s;
  const p = api.fromSVG(glyph);
  api.transform(p, [
    s,
    shear,
    cx - GLYPH_CX * s - shear * GLYPH_BOTTOM,
    0,
    s,
    baseY - GLYPH_BOTTOM * s,
    0,
    0,
    1,
  ]);
  api.union(dst, p);
}

/**
 * y >= 0 dolu bir yarı düzlem + üst kenarına oturtulmuş alev dilleri.
 * Diller boylarının %30'u kadar gövdenin İÇİNE gömülüyor: tam kenara
 * oturtulunca glyph'in yuvarlak tabanı gövdeyle birleştiği yerde ince bir
 * "boyun" bırakıyor, alev yapıştırılmış gibi duruyordu.
 */
function buildProfile<P>(
  api: WaveApi<P>,
  glyph: string,
  width: number,
  maxTongue: number,
  tongues: readonly Tongue[],
  depth: number,
  phase: number,
  seed: number,
): P {
  const p = api.empty();
  api.addRect(p, -width * 0.3, 0, width * 1.6, depth);
  tongues.forEach(([cx, hf], j) => {
    // Her dil KENDİ fazında salınıyor; hepsi aynı anda uzayıp kısalsaydı
    // alev değil, nefes alan tek bir blok olurdu.
    const k = j * 0.37 + seed;
    const h = maxTongue * hf * (1 + FLICKER_STRETCH * Math.sin(TAU * (phase + k)));
    const drift = FLICKER_DRIFT * Math.sin(TAU * (phase * 2 + k * 0.6));
    const lean = FLICKER_LEAN * Math.sin(TAU * (phase + k * 1.7));
    addTongue(api, p, glyph, (cx + drift) * width, h * TONGUE_EMBED, h, lean);
  });
  return p;
}

export interface FlameWaveOpts {
  /** FlameGlyph'in FLAME_PATH'i (24x24 viewBox). */
  glyph: string;
  width: number;
  /** Dalganın kalınlığı — gövdenin üst kenarından alt kenarına. */
  bandHeight: number;
  /** En uzun üst alev dilinin boyu (salınım öncesi). */
  tongueHeight: number;
  /** Titreşim fazı, 0..1. Aynı faz her zaman aynı şekli verir. */
  phase: number;
}

/** Uçların salınımıyla dillerin çıkabileceği en yüksek nokta çarpanı. */
export const TONGUE_PEAK = 1 + FLICKER_STRETCH;

/** Alt kenardaki en uzun dil — şeridin kesintisiz kalan kısmını bu belirliyor. */
const MAX_BOTTOM_TONGUE = Math.max(...BOTTOM_TONGUES.map(([, hf]) => hf));

/**
 * Alt kenarın dillerinin gövdeye işlediği derinlik: bu hizanın ALTI delikli
 * (aralardan zemin görünür), üstü kesintisiz dolu.
 */
function bottomNotchDepth(tongueHeight: number): number {
  return (
    tongueHeight *
    BOTTOM_TONGUE_SCALE *
    MAX_BOTTOM_TONGUE *
    TONGUE_PEAK *
    (1 - TONGUE_EMBED)
  );
}

/**
 * Kart değişimi, ekran kapanır kapanmaz yapılıyor: pencerenin geri kalanı
 * React'e bırakılıyor (yeni alt kartın mount'u kısa sürmüyor ve o iş bitmeden
 * ekranda hâlâ ESKİ kart duruyor — dalga çekildiğinde değişimi görmenin asıl
 * sebebi buydu, kartın giriş animasyonu değil).
 *
 * Sıfır değil de küçük bir pay, çünkü sayaç dalganın önüne geçebiliyor:
 * setTimeout JS thread'inde, süpürme ise UI thread'inde ve efekt kurulduktan
 * BİR KARE sonra başlıyor. İki kare (~33 ms) bu kaymayı fazlasıyla örtüyor;
 * geri kalan ~200 ms değişime kalıyor.
 */
const COVER_LEAD_MS = 40;

/** Dalganın ekran ölçüsüne göre yerleşimi + kart değişiminin yapılacağı an. */
export interface FlameWaveGeometry {
  /** En uzun üst alev dilinin boyu (salınım öncesi). */
  tongueHeight: number;
  /** Şeridin kalınlığı — gövdenin üst kenarından alt kenarına. */
  bandHeight: number;
  /** Şeridin yerel y=0'ının ekrandaki başlangıç ve bitiş ötelemesi. */
  startY: number;
  endY: number;
  /** Animasyon BAŞINDAN, dalganın ekranı tam kapattığı ana kadar geçen ms. */
  coverMs: number;
  /**
   * Ekranın TAM ORTASININ kesintisiz şeridin arkasında kaldığı ilerleme
   * aralığı (0..1). Kutlama yazısı orada duruyor (bkz. SuperLikeFlameCanvas):
   * beyaz metin alevin üstünde okunuyor, kartın fotoğrafında kayboluyor.
   *
   * Örtme penceresinden ÇOK daha geniş — tek bir noktanın kapalı olması için
   * şeridin ekranın tamamını kaplaması gerekmiyor.
   */
  centerIn: number;
  centerOut: number;
}

/**
 * Yerleşimi ve örtme anını ekran ölçüsünden hesaplar.
 *
 * Skia'ya dokunmadan, tek yerde: canvas bu sayılarla ÇİZİYOR, süper beğeni
 * akışı da aynı sayılarla kart değişimini ZAMANLIYOR. İki tarafta ayrı ayrı
 * durursa biri güncellenip diğeri bayat kalır (FLAME_WAVE_MS'te bir kez oldu).
 */
export function flameWaveGeometry(
  width: number,
  height: number,
): FlameWaveGeometry {
  // Diller BÜYÜK ve az sayıda: ikon "büyütülmüş" hissi versin, kalabalık bir
  // testere dişine dönüşmesin (dizilim: TOP_TONGUES).
  const tongueHeight = width * 0.78;
  // Şerit ekrandan ~1.35 kat kalın. Ölçüldü: dalganın ekranı TAM kapattığı
  // pencere geçişin ~%15'i — kart değişimini örtmeye yetiyor ama düz kırmızı
  // bir perde olarak kalmıyor. Daha kalın yapılırsa ortada uzun süre boş
  // kırmızı kalıyor, daha ince yapılırsa kaplama birkaç kareye düşüp kart
  // değişimi alevin altından sırıtıyor. Pencerenin MUTLAK uzunluğunu
  // kalınlıktan değil süreden ayarla (bkz. FLAME_WAVE_MS).
  const bandHeight = height * 1.35 + tongueHeight;
  // Tamamen ekranın altından, tamamen üstüne. TONGUE_PEAK payı, salınımla
  // uzayan dilin başlangıçta alt kenardan sarkmasını engelliyor.
  const startY = height + tongueHeight * TONGUE_PEAK;
  // Bitişte %6 pay: tam -bandHeight olsaydı dalganın arka kenarı EKRANIN TAM
  // ÜST KENARINDA, yani p=1'de terk ediyor olurdu. Canvas (lazy chunk + mount
  // gecikmesi yüzünden) animasyon bitmeden bir tık önce sökülürse şerit
  // ekranın tepesinde "pat" diye kaybolurdu. Payla birlikte dalga p≈0.94'te
  // zaten görünmez oluyor.
  const endY = -(bandHeight + height * 0.06);

  const travel = startY - endY;
  // Şeridin KESİNTİSİZ (tam genişlikte dolu) kaldığı yükseklik: alt kenarın
  // dilleri gövdenin içine bu kadar giriyor, o hizanın altı delikli.
  const solid = bandHeight - bottomNotchDepth(tongueHeight);
  // Kapanma: kesintisiz şeridin ÜST kenarı ekranın tepesini geçti.
  // Açılma: aynı şeridin ALT kenarı ekranın dibine kadar çekildi.
  const pIn = startY / travel;
  const pOut = (startY + solid - height) / travel;
  const inMs = pIn * FLAME_WAVE_MS;
  const outMs = pOut * FLAME_WAVE_MS;
  // Kapanır kapanmaz + kayma payı. Pay pencereden büyükse (aşırı uzun ekran:
  // şerit ekranı ya hiç tam kapatamıyor ya da göz açıp kapayıncaya kadar
  // kapatıyor) ortaya nişan al — orası "en çok kapalı" an.
  const ms =
    outMs - inMs > COVER_LEAD_MS ? inMs + COVER_LEAD_MS : (inMs + outMs) / 2;

  // Şerit ekranda [T, T + solid] aralığını dolduruyor (T = o anki öteleme).
  // Ortanın kapalı olma koşulu: T <= height/2 <= T + solid.
  const centerY = height / 2;
  const clamp01 = (v: number) => Math.min(1, Math.max(0, v));

  return {
    tongueHeight,
    bandHeight,
    startY,
    endY,
    coverMs: Math.round(Math.min(FLAME_WAVE_MS, Math.max(0, ms))),
    centerIn: clamp01((startY - centerY) / travel),
    centerOut: clamp01((startY + solid - centerY) / travel),
  };
}

/**
 * PERDE modu — eşleşme kutlaması (bkz. MatchModal).
 *
 * Aynı dalga, ama ekranı süpürüp GİTMİYOR: alttan yükselip ekranı kaplıyor ve
 * gövdesinin alt kenarı ekranın dibinin biraz üstünde ASILI KALIYOR. Boşluk
 * bilerek: kenarın alevleri karanlığa karşı okunsun, perde düz bir kırmızı
 * dikdörtgen gibi durmasın. Kapanışta aynı hareketle yukarı süpürülüp çıkıyor.
 */

/** Perdenin alt kenarını ekranın dibinden bu kadar yukarıda tutar. */
const CURTAIN_GAP_RATIO = 0.075;

/**
 * Perde, süper beğeni süpürmesinden bu katsayı kadar hızlı. Aynı hareket ama
 * mesafe daha uzun: sabit hızda giriş 1.2 sn'yi buluyor ve bir modal için
 * ağır kalıyordu. Tek katsayı — giriş ve çıkış aynı hızda kalsın.
 */
const CURTAIN_SPEED = 1.35;

export interface FlameCurtainGeometry {
  /** Perdenin asılı kaldığı ilerleme — TAM süpürmenin 0..1'i cinsinden. */
  restProgress: number;
  /**
   * Alttan asılı konuma / asılı konumdan ekran dışına, ms. Kutlama içeriği
   * `enterMs`i BEKLİYOR (bkz. MatchModal): önce ateş oturuyor, sonra
   * fotoğraflar geliyor — ikisi üst üste binmiyor.
   */
  enterMs: number;
  exitMs: number;
  /**
   * Perdenin altında "delikli" kalan şerit + boşluk. İçerik bunun üstünde
   * kalmalı: alevlerin arasına denk gelen metin okunmuyor.
   */
  hemHeight: number;
}

/** Perde modunun yerleşimi ve zamanlaması. Skia'ya dokunmuyor: modal, canvas
 *  hiç yüklenemese bile aynı sayılarla kendi içeriğini zamanlayabilsin. */
export function flameCurtainGeometry(
  width: number,
  height: number,
): FlameCurtainGeometry {
  const { startY, endY, bandHeight, tongueHeight } = flameWaveGeometry(
    width,
    height,
  );
  const gap = Math.round(height * CURTAIN_GAP_RATIO);
  const travel = startY - endY;
  // Gövdenin alt kenarı (yerel y=bandHeight) ekranın dibinden `gap` yukarıda.
  const restY = height - gap - bandHeight;
  const restProgress = Math.min(1, Math.max(0, (startY - restY) / travel));
  const sweepMs = FLAME_WAVE_MS / CURTAIN_SPEED;

  const enterMs = Math.round(sweepMs * restProgress);
  const exitMs = Math.round(sweepMs * (1 - restProgress));

  return {
    restProgress,
    enterMs,
    exitMs,
    // Tavan var: dar ekranlarda dillerin EN DERİN noktası yüksekliğin üçte
    // birini buluyor ve kutlama içeriğine ortalanacak yer kalmıyordu. İçerik
    // o zaman en uzun dilin ucuyla biraz örtüşür — kısa dillerin arası zaten
    // boş, metin oralarda okunuyor.
    hemHeight: Math.round(
      Math.min(gap + bottomNotchDepth(tongueHeight), height * 0.24),
    ),
  };
}

/**
 * İki alev profilinin farkı = bir alev DALGASI. Üst sınır yukarı bakan diller,
 * alt sınır da öyle → şerit tepede alevlenip altta alevlenerek bitiyor.
 *
 * Sonuçtaki path'in yerel koordinatları: diller yukarı doğru
 * ~0.7*tongueHeight*TONGUE_PEAK'e kadar çıkar, gövde y=0'dan bandHeight'a iner.
 */
export function buildFlameWave<P>(api: WaveApi<P>, o: FlameWaveOpts): P {
  const depth = (o.bandHeight + o.tongueHeight) * 2;
  const band = buildProfile(
    api,
    o.glyph,
    o.width,
    o.tongueHeight,
    TOP_TONGUES,
    depth,
    o.phase,
    0,
  );
  const cut = buildProfile(
    api,
    o.glyph,
    o.width,
    o.tongueHeight * BOTTOM_TONGUE_SCALE,
    BOTTOM_TONGUES,
    depth,
    o.phase,
    // Alt kenar üstle aynı ritimde oynamasın diye kaydırılmış tohum.
    0.41,
  );
  api.offset(cut, 0, o.bandHeight);
  api.difference(band, cut);
  return band;
}
