/**
 * BÜYÜYEN KAMPÜS ANI KARTININ ÖLÇÜSÜ — saf hesap.
 *
 * Karta dokunulduğunda kart şeritteki yerinden kalkıp ekranın ortasına uçuyor
 * ve büyüyor; bu modül o hareketin İKİ UCUNU veriyor: başladığı kare ve
 * varacağı kare. Aradaki her şey (süre, eğri) bileşenin işi.
 *
 * Kendi modülünde çünkü hedef kare üç kısıtın kesişimi — 3:4 oranı, güvenli
 * alan ve sağdaki cam sütunu — ve üçü bir `useMemo`nun içinde gözle
 * doğrulanamıyor (aynı gerekçe `campusStripBoxes` ve `cropGeometry`de).
 *
 * ⚠️ MODÜL EKRAN BİLMİYOR: `useWindowDimensions`/`useSafeAreaInsets` çağırmıyor,
 * hepsi parametre. Testin node'da koşabilmesinin tek sebebi bu.
 */

/** Ekran koordinatlarında bir dikdörtgen — `measureInWindow`ın çıktısıyla aynı şekil. */
export interface ExpandRect {
  x: number;
  y: number;
  width: number;
  height: number;
}

export interface ExpandGeometryArgs {
  screenW: number;
  screenH: number;
  topInset: number;
  bottomInset: number;
  /**
   * Kartın şeritteki ÖLÇÜLEN karesi; `null` = ölçüm alınamadı.
   *
   * ⚠️ `null` BİR HATA DALI DEĞİL, kasıtlı degradasyon: ölçüm alınamazsa
   * başlangıç hedefin kendisi oluyor, yani kart uçmadan yerinde büyüyor.
   * Hareketin yarısı kayboluyor ama kart yine de açılıyor — ölçüme bağlı bir
   * kapı koymak, ölçüm geri çağırmadığında yüzeyi tamamen ölü bırakırdı.
   */
  start: ExpandRect | null;
}

/**
 * SAĞDA CAM BUTONA AYRILAN SÜTUN.
 *
 * ⚠️ KART EKRANIN ORTASINDA DEĞİL: buton bu sütunun içinde duruyor ve kart o
 * kadar sola kayıyor. Hesap ortalasaydı buton kartın üstüne binerdi — cam
 * yüzeyde kartın fotoğrafı üstünde duran bir buton, camın kendi zeminini
 * okunamaz yapıyor.
 *
 * 96: dock ölçüsündeki cam buton (80) + iki yanında nefes. Küçültülecekse
 * butonun kendi çapı da birlikte düşünülmeli.
 */
export const BUTTON_COLUMN = 96;

/** Kartın güvenli alandan ve yan kenarlardan bırakacağı pay. */
const EDGE_PAD = 20;

/** Kutunun oranı — şeritteki kartla AYNI (CampusMomentsStrip > CARD_ASPECT). */
const ASPECT = 3 / 4;

export function campusExpandGeometry({
  screenW,
  screenH,
  topInset,
  bottomInset,
  start,
}: ExpandGeometryArgs): { start: ExpandRect; target: ExpandRect } {
  /**
   * İKİ KISITTAN BAĞLAYICI OLANI SEÇİLİYOR.
   *
   * Dikeyde güvenli alan, yatayda "ekran eksi cam sütunu" sınırlıyor. Hangisi
   * önce doluyorsa kutuyu o belirliyor; ötekini ondan türetmek oranı bozar.
   * Yalnız yükseklikten türetilse geniş bir telefonda kart cam sütununa
   * girerdi, yalnız genişlikten türetilse uzun bir telefonda kart güvenli
   * alanı taşardı.
   */
  const availableH = Math.max(0, screenH - topInset - bottomInset - EDGE_PAD * 2);
  const availableW = Math.max(0, screenW - BUTTON_COLUMN - EDGE_PAD * 2);

  const height = Math.min(availableH, availableW / ASPECT);
  const width = height * ASPECT;

  const target: ExpandRect = {
    // Yatayda cam sütunu ÇIKARILDIKTAN sonra kalan alanın ortası.
    x: EDGE_PAD + (availableW - width) / 2,
    // Dikeyde güvenli alanın ortası — chrome üstte, şerit altta kalıyor.
    y: topInset + EDGE_PAD + (availableH - height) / 2,
    width,
    height,
  };

  return { start: start ?? { ...target }, target };
}
