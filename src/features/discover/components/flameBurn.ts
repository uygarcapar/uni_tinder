/**
 * Kartın Fire ikonunun YANMASI — yalnız geometri, Skia yok.
 *
 * OYNAYAN ŞEY İKONUN KENDİ KIVRIMLARI. Glyph'in dış hattında duran ikonda da
 * var olan üç kıvrım oynuyor (bkz. icons/FlameGlyph ve `--nodes` çıktısı):
 *
 *   • KIVRIK UÇ — tepe düz bir sivrilik değil, sağa kıvrılan bir dalga
 *     (düğüm 17–19–1, path'in başlangıcının iki yanı).
 *   • SAĞ ÇENTİK — sağ yanda, orta yükseklikteki girinti (düğüm 3–8).
 *   • SOL YANAK — sol kenarın içbükey süpürmesi (düğüm 14–16).
 *
 * TABAN OYNAMAZ (yay uzunluğunun %40–%66'sı): ateş oturduğu yerden yanmaz ve
 * ikon köşe boşluğunun içinde kaymamalı.
 *
 * Referans, kullanıcının gönderdiği MatchModal kaydındaki "ateşin ÜSTÜNDEKİ
 * dalgalar": orada da oynayan şey perdenin KENARI, üstüne konmuş bir şey
 * değil.
 *
 * DÖRDÜNCÜ YAZIM ve öncekilerin hepsi ŞEKİL EKLİYORDU — asıl yanlış buydu:
 *
 *  1. Glyph'in üstüne, içinden çıkan tam boy kopyalar → "ana ateşin arkasında
 *     ikinci bir ateş var, sallanıyor".
 *  2. Dış hattın TAMAMI sinüslerle dışarı itildi → "çok gerçekçi"; simetrik,
 *     yuvarlak sinüs lobu akışkan bir sıvı gibi dalgalanıyor.
 *  3. Dış hatta kök salan, glyph şeklinde dört alev dili → yine EKLEME: ikon
 *     büyüyüp taçlanıyor ama ikonun kendisi hâlâ kıpırdamıyor.
 *
 * RENK DE SABİT: ısıyla açılan ak-sıcak çekirdek ve dış ışıma vardı, ikisi de
 * kaldırıldı. İkonun rengi her ısıda `gradients.swipeHeart` — anlatan tek şey
 * hareket.
 *
 * Şimdi ikona hiçbir şey eklenmiyor ve hiçbir şey çıkarılmıyor: silüet her
 * karede yine ikonun ta kendisi, yalnız kendi dalgasının olduğu yerde dış hat
 * bir ileri bir geri gidiyor. Pencerenin dışında tek bir nokta bile
 * kıpırdamıyor, yani ikon her karede ikon kalıyor.
 *
 * ÇIKTI NOKTA DİZİSİ: bu dosya hiçbir path kurmuyor. Sebep, silüetin her karede
 * UI THREAD'İNDE kuruluyor olması (bkz. FireBurnCanvas) — worklet'in
 * içinden çağrılabilmesi için Skia'ya dokunmaması gerekiyor.
 *
 * Bütün salınım katsayıları TAM SAYI (aynı gerekçe flameWavePath > FLICKER):
 * faz 1'de tam tur attığı için `phase % 1` ile sarmak diksiz.
 */
import { FLAME_GLYPH } from "@/shared/components/icons/FlameGlyph";

const { cx: CX, bottom: BOTTOM } = FLAME_GLYPH;
const TAU = Math.PI * 2;

/**
 * Dalganın kaç ayrı durakta oynadığı — faz bu adımlara YUVARLANIYOR.
 *
 * Kurulum her karede yapılabiliyor, yani 60 fps akıcı bir morph mümkün.
 * İSTENMİYOR: sürekli akan bir kenar sıvı gibi duruyor, ateş gibi durmuyor.
 * Kutlama perdesi de aynı sebeple kademeli (bkz. flameWavePath >
 * FLICKER_FRAMES) ve ekran kaydında sayılabiliyor.
 */
export const BURN_FLICKER_FRAMES = 10;

/**
 * Faz saatinin hızı (tur/sn): ısı 0 → 1 arasında bu aralıkta geziyor. Hem
 * kademelerin hızını hem de dalganın akma temposunu belirliyor.
 */
export const BURN_HZ_MIN = 1.2;
export const BURN_HZ_MAX = 2.6;

/**
 * Dış hattın kaç noktadan örnekleneceği.
 *
 * Silüet POLİGON olarak çiziliyor (Skia `addPoly` — tek JSI çağrısı), yani
 * eğriler bu sayı kadar kırılıyor. Alevin çevresi 24'lük grid'de 59.3 birim:
 * 128 noktada kenar ~0.46 birim, 55 puntoluk ikonda ~1 pt. 3x ekranda 3 px'lik
 * bir faseta denk geliyor — ikonun yuvarlak hatlarında fark edilmiyor.
 *
 * Düşürmek CAZİP DEĞİL: oynayan bölge çevrenin ancak beşte biri (bkz.
 * WAVES), yani bir kıvrımı taşıyan nokta sayısı bunun küçük bir oranı.
 * 64'te dalganın içinde ~12 nokta kalıyor ve tepeler köşeleniyor.
 */
export const BURN_CONTOUR_POINTS = 128;

/**
 * [merkez, yarı genişlik, genlik, pencere boyu tepe sayısı, akma hızı,
 *  faz tohumu] — hepsi yay uzunluğu oranı cinsinden (0..1), genlik grid birimi.
 *
 * ÖLÇÜLDÜ (`node scripts/preview-flame-burn.js --nodes` düğümleri yay
 * uzunluğuyla basıyor):
 *   düğüm 1  s=0.180   düğüm 3  s=0.248   düğüm 8  s=0.331
 *   düğüm 14 s=0.727   düğüm 16 s=0.882   düğüm 17 s=0.948   düğüm 19 s=1.000
 *
 * Merkezi 0 olan pencere SARIYOR: glyph'in ucu path'in başlangıcı, yani kıvrım
 * s=0'ın iki yanına yayılıyor (0.98 ile 0.02 komşu).
 *
 * TABANA HİÇBİR PENCERE DEĞMİYOR (s 0.40–0.66): ikon dibinden kıpırdarsa köşe
 * boşluğunda kayıyor ve cam ikizinin merkeziyle ayrışıyor.
 *
 * HIZIN İŞARETİ AKIŞ YÖNÜ. Yol ucun sağından başlayıp SAAT YÖNÜNDE dönüyor,
 * yani yay uzunluğu sağ kenarda aşağı, sol kenarda YUKARI ilerliyor. Tek bir
 * işaret kullanılınca sağdaki dalga yukarı, soldaki aşağı akıyordu ve alevin
 * "yukarı yalama" hissi bozuluyordu: iki kenar birbirine ters akınca hareket
 * yön değil salınım gibi okunuyor. Sol yanağın hızı bu yüzden negatif — üç
 * kıvrım da UCA doğru akıyor.
 *
 * Hızlar TAM SAYI olmak zorunda (faz `% 1` ile sarılıyor); tohumlar kesirli
 * olabilir, onlar yalnız kaydırma. Tohumlar eşit aralıklı DEĞİL: eşit verilince
 * üç kıvrım aynı ritimde soluyor ve ikon nefes alan tek bir blok gibi duruyor.
 *
 * Glyph yeniden bakelenirse merkezler/genişlikler yeniden ölçülmeli.
 */
const WAVES: readonly (readonly [
  number,
  number,
  number,
  number,
  number,
  number,
])[] = [
  // Kıvrık uç — en büyük hareket, ikonun en tanınır yeri.
  [0.0, 0.14, 1.7, 1.5, 1, 0.0],
  // Sağ çentik — küçük bir girinti, genliği de küçük yoksa kapanıp kayboluyor.
  [0.29, 0.085, 0.85, 1.5, 2, 0.41],
  // Sol yanak — uzun ve yumuşak bir yay. Hız NEGATİF: bu kenarda yay uzunluğu
  // yukarı ilerliyor, dalga da uca doğru aksın.
  [0.77, 0.07, 1.05, 1, -1, 0.73],
];

/**
 * PENCERELER BİRBİRİNE DEĞMEMELİ. Uç [0.86–1.14] ile sol yanak [0.70–0.84] bir
 * dönem üst üste biniyordu ve ikisi tek bir uzun kenar gibi birlikte esiyordu —
 * "üç kıvrım oynuyor" değil "sol üst kenar deforme oluyor" diye okunuyordu.
 * Aralarındaki boşluk küçük (yay uzunluğunun ~%2'si) ama yeterli: yükseltilmiş
 * kosinüs zaten pencere kenarında sıfıra iniyor.
 */

/**
 * Sapmanın nefesi: genlik bu oranda azalıp çoğalıyor.
 *
 * KÜÇÜK TUTULUYOR (0.35 → 0.12). Yerinde kabarıp çekilme "alevleniyor" değil
 * TOMURCUKLANIYOR diye okunuyor: gonca da öyle yapar, şişer ve söner. Alevin
 * hareketi yer değiştirmedir — tepe yukarı akar. Nefes yalnız o akışa hafif
 * bir düzensizlik katsın diye duruyor.
 */
const WAVE_SWELL = 0.12;

/**
 * Sapmanın YÖNÜ: dış normale bu kadar "yukarı" karıştırılıyor.
 *
 * TOMURCUKLANMA SORUNUNUN ASIL KAYNAĞI BUYDU. Saf normal boyunca itilen bir
 * lob kenara DİK çıkıyor, yani iki yanı simetrik ve yuvarlak — gonca. Alev
 * dili ise yukarı yalar: tabanı geniş, ucu eğik. Yukarı harman lobu kayma
 * (shear) altına sokuyor ve o eğikliği veriyor.
 *
 * Yüksekliğe göre ÖLÇEKLENMİYOR: alçak kıvrımlarda ağırlık düşünce yatay
 * normal yeniden baskın çıkıp lob yana tomurcuklanıyor.
 */
const UP_BIAS = 1.0;

/**
 * Dalga biçiminin ÇARPIKLIĞI: saf sinüs yerine `sin(x) + SKEW·sin(2x)`.
 *
 * Saf sinüs simetrik — çıkışı ve inişi aynı, yani yine yuvarlak bir tomurcuk.
 * İkinci harmonik tepeyi bir yana yatırıyor: bir yanı dik, diğer yanı uzun
 * kuyruk. Alev dilinin profili bu.
 *
 * Harmonik TAM SAYI olmak zorunda (faz `% 1` ile sarılıyor) — 2 o yüzden.
 */
const WAVE_SKEW = 0.45;

/**
 * Çarpık dalganın tepe değeri — genlik `WAVE_AMP` ile verilsin diye bölünüyor.
 * `max(sin x + 0.45 sin 2x)` sayısal olarak ≈ 1.26.
 */
const WAVE_SKEW_NORM = 1.26;

/**
 * İkonun tabanından büyüme oranı — "bu jest başladı" geri bildirimi.
 *
 * ÇEKİŞ ORANINA BAĞLI DEĞİL. Bir tur ısıyla çarpılıyordu, yani parmak
 * oynadıkça ikon da büyüyüp küçülüyordu; o bir ORAN göstergesiydi ve zaten
 * dalga onu anlatıyor. Büyüme artık MANDALLI: jest başlar başlamaz kendi
 * saatinde açılıyor ve parmak kalkana kadar orada duruyor (mandalın sahibi
 * SwipeCard > burnGrow). Oranı `burnPolygon`un `grow` parametresi taşıyor.
 *
 * Küçük: asıl anlatan şey dalga, ikonun büyümesi değil. 0.08 → 0.1 → 0.14,
 * çünkü artık kademeli bir ramp DEĞİL tek bir adım: ramp'te gözün takip edecek
 * bir hareketi var, tek adımda ise yalnız iki durum arasındaki FARK okunuyor ve
 * o farkın eşiği daha yüksek.
 *
 * Tavan da var: ikon köşe boşluğunun içinde duruyor (FIRE_INSET) ve cam
 * ikiziyle merkezi çakışmak zorunda; %20'yi geçen bir büyüme kapağın kenarına
 * dayanıyor.
 */
const BURN_SCALE = 0.14;

/** Dış hattın önceden hesaplanmış örnekleri — çizim başına bir kez kurulur. */
export interface BurnContour {
  /** Örnek sayısı. */
  n: number;
  /** Dış hat noktaları. */
  x: number[];
  y: number[];
  /**
   * Dış normal (birim). Sarım yönünü doğrulamak ve belgelemek için duruyor;
   * SAPMA BUNUN BOYUNCA DEĞİL (bkz. dx/dy ve UP_BIAS).
   */
  nx: number[];
  ny: number[];
  /**
   * Sapmanın yönü (birim): dış normal + yukarı harmanı. Saf normal kullanılınca
   * kıvrımlar kenara dik, simetrik loblar olarak çıkıyor ve alev değil
   * TOMURCUK gibi duruyor.
   */
  dx: number[];
  dy: number[];
  /** Halka boyunca normalize konum 0..1 (path'in başlangıcından). */
  s: number[];
}

/** 0..1 kıskacı — ısı dışarıdan geliyor ve eşiği aşınca 1'i geçebiliyor. */
function clamp01(v: number): number {
  "worklet";
  return v < 0 ? 0 : v > 1 ? 1 : v;
}

/**
 * Kapalı bir halkadan (sırayla gelen, son nokta ilkini TEKRARLAMAYAN) sapma
 * çatısını kurar.
 *
 * Halkayı kimin ürettiği önemli değil: çizim tarafı Skia'nın `ContourMeasureIter`
 * ile yay uzunluğuna göre örnekliyor, önizleme betiği bezier'i kendi
 * düzleştiriyor. Yay uzunluğuna göre örnekleme ŞART — pencereler (WAVES)
 * yay uzunluğuyla tanımlı.
 */
export function buildBurnContour(
  ring: readonly (readonly [number, number])[],
): BurnContour {
  const n = ring.length;
  const x: number[] = new Array(n);
  const y: number[] = new Array(n);
  const nx: number[] = new Array(n);
  const ny: number[] = new Array(n);
  const dx: number[] = new Array(n);
  const dy: number[] = new Array(n);
  const s: number[] = new Array(n);

  // Merkez, normallerin DIŞARI baktığını doğrulamak için. Sarım yönünden
  // (signed area) çıkarmak da mümkündü ama y'nin aşağı baktığı ekran
  // koordinatlarında işaret kuralı kolayca ters okunuyor; merkeze göre oylama
  // hem okunur hem de bu şekil için (merkezine göre yıldızsı) güvenilir.
  let cx = 0;
  let cy = 0;
  for (let i = 0; i < n; i++) {
    cx += ring[i][0];
    cy += ring[i][1];
  }
  cx /= n || 1;
  cy /= n || 1;

  let outward = 0;
  for (let i = 0; i < n; i++) {
    const [px, py] = ring[i];
    // Teğet KOMŞULARDAN (merkezi fark): tek komşuyla alınınca normal yarım
    // örnek kayıyor ve dalganın tepeleri hafifçe yamuluyor.
    const [ax, ay] = ring[(i + n - 1) % n];
    const [bx, by] = ring[(i + 1) % n];
    const tx = bx - ax;
    const ty = by - ay;
    const len = Math.hypot(tx, ty) || 1;
    nx[i] = ty / len;
    ny[i] = -tx / len;
    outward += nx[i] * (px - cx) + ny[i] * (py - cy);
    x[i] = px;
    y[i] = py;
    s[i] = i / n;
  }

  const flip = outward < 0 ? -1 : 1;
  for (let i = 0; i < n; i++) {
    nx[i] *= flip;
    ny[i] *= flip;
    // Yukarı harman: lob kenara dik değil, yukarı yatık çıksın.
    const vy = ny[i] - UP_BIAS;
    const len = Math.hypot(nx[i], vy) || 1;
    dx[i] = nx[i] / len;
    dy[i] = vy / len;
  }

  return { n, x, y, nx, ny, dx, dy, s };
}

/**
 * Dış hattın `s` noktasındaki sapması (grid birimi, artı = dışarı).
 *
 * Pencerenin dışında TAM SIFIR ve iki ucunda da yumuşak sıfıra iniyor
 * (yükseltilmiş kosinüs): ikonun geri kalanı kıpırdamıyor, kıvrımın kenarında
 * da dirsek kalmıyor.
 */
export function burnDisplacement(
  s: number,
  phase: number,
  heat: number,
): number {
  "worklet";
  const t = clamp01(heat);
  if (t <= 0) return 0;

  // Sapma ayrıca nefes alıyor — kıvrımlar yalnız akmıyor, kabarıp çekiliyor.
  const swell = 1 + WAVE_SWELL * Math.sin(TAU * phase);
  let sum = 0;

  for (let k = 0; k < WAVES.length; k++) {
    const [center, half, amp, crests, speed, seed] = WAVES[k];
    // Merkeze İŞARETLİ uzaklık, halka etrafından SARARAK: kıvrımlardan biri
    // path'in başlangıç noktasında ve penceresi onun iki yanına taşıyor.
    let d = s - center;
    if (d > 0.5) d -= 1;
    if (d < -0.5) d += 1;
    const q = d / half;
    if (q < -1 || q > 1) continue;

    // Yükseltilmiş kosinüs: iki uçta 0, merkezde 1. Sert kesilseydi kıvrımın
    // iki ucunda her karede bir köşe belirirdi.
    const window = 0.5 * (1 + Math.cos(Math.PI * q));
    // Tepeler kıvrım boyunca AKIYOR — hareketin asıl yükü burada, yerinde
    // kabarmada değil (bkz. WAVE_SWELL).
    const angle = TAU * (crests * q * 0.5 + speed * phase + seed);
    // Çarpık profil: bir yanı dik, diğer yanı uzun kuyruk (bkz. WAVE_SKEW).
    const travel =
      (Math.sin(angle) + WAVE_SKEW * Math.sin(2 * angle)) / WAVE_SKEW_NORM;
    sum += amp * window * travel;
  }

  return t * swell * sum;
}

/**
 * Yanan ikonun o andaki dış hattı — doğrudan `addPoly`ye verilebilir.
 *
 * @param phase 0..1, tam bir tur. Kademelendirmek ÇAĞIRANIN işi (bkz.
 *   BURN_FLICKER_FRAMES).
 * @param heat 0..1. Çekme oranı ile basılı tutmadan hangisi büyükse o
 *   (bkz. SwipeCard). 0 = sönük ikon, 1 = eşik. YALNIZ dalgayı sürüyor.
 * @param grow 0..1 mandallı büyüme — jest başladı mı (bkz. BURN_SCALE).
 *   Isıdan AYRI, çünkü biri oran diğeri durum.
 */
export function burnPolygon(
  c: BurnContour,
  phase: number,
  heat: number,
  grow: number = 0,
): { x: number; y: number }[] {
  "worklet";
  const t = clamp01(heat);
  // Tabandan büyüme. Döndürme/yükselme YOK: ikon yerinde duruyor, oynayan tek
  // şey kendi dalgası.
  const k = 1 + clamp01(grow) * BURN_SCALE;
  const out: { x: number; y: number }[] = new Array(c.n);
  for (let i = 0; i < c.n; i++) {
    const d = burnDisplacement(c.s[i], phase, t);
    const px = c.x[i] + c.dx[i] * d;
    const py = c.y[i] + c.dy[i] * d;
    out[i] = { x: CX + (px - CX) * k, y: BOTTOM + (py - BOTTOM) * k };
  }
  return out;
}

/**
 * Çizim kutusunun ikonun KENDİ ölçüsünden ne kadar taşacağı (her yandan, `size`
 * oranı olarak).
 *
 * Taşma KÜÇÜK: kıvrımlar dış hattan en çok kendi genlikleri kadar sapıyor ve
 * glyph zaten 24'lük grid'in içinde 2 birim payla duruyor. Bir dönem burada
 * ışımanın yayılması da hesaba katılıyordu; ışıma kaldırıldı (renk sabit),
 * pay da ona göre daraldı.
 *
 * ÖLÇÜLDÜ: scripts/preview-flame-burn.js bütün faz × ısı kombinasyonlarının
 * bbox'ını basıyor, kutu dar kalırsa sıfırdan farklı kodla çıkıyor.
 *
 * Pay her yana EŞİT veriliyor: canvas'ın ikona ortalanması hizalamayı tek
 * çıkarma işlemine indiriyor, asimetrik pay her boyut değişiminde yeniden hesap
 * isterdi.
 */
export const BURN_PAD_RATIO = 0.18;
