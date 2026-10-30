/**
 * AKIŞ HARİTASININ DİKEY GEOMETRİSİ — saf hesap.
 *
 * Kendi modülünde çünkü bir regresyonun kaynağı oldu ve çıplak gözle
 * doğrulanamıyor: dört girdiden (hero, bant, katman boyu, sheet payı) türeyen
 * dört çıktı var ve aralarındaki bağımlılık, hatayı "harita biraz kaymış"
 * gibi gösteriyor — sebebini göstermiyor.
 *
 * ── Değişmez (bunun için var) ─────────────────────────────────────────────
 * KUTU VE MERKEZ, `expandedBottomInset`TEN BAĞIMSIZ.
 *
 * O pay kampüs anları sheet'inin küçük detentinden geliyor, yani VARLIĞI bir
 * sorgunun cevabına bağlı (`campus.available`). Kutu ya da merkez paya bağlı
 * olursa akıştaki harita o cevap gelene kadar bir türlü, sonra başka türlü
 * duruyor — kullanıcının gördüğü tam olarak buydu. Pay yalnız TAM EKRAN
 * hâlindeki kaymayı etkiliyor.
 *
 * ⚠️ Kapı sorgusu artık ÖNCEDEN ısıtılıyor (bkz. useCampusSurface > `prewarm`),
 * yani pay ilk açılıştan önce biliniyor ve açılış ortasında değişmiyor. Bu
 * değişmez gene de duruyor: ısınma yarışı kaybedilirse (soğuk başlangıçta hemen
 * dokunmak) kutunun kıpırdamaması hâlâ doğru davranış.
 */

/**
 * ── YATAY: KAMPÜS SOLDA, SAĞI ANLARA AYRILIYOR ─────────────────────────────
 *
 * Akışta bandın içinde iki şey var (istek): SOLDA kampüsün poligonu, SAĞINDA
 * anların küçük kartları. Yani kampüs noktası artık ekranın yatay ortasında
 * DEĞİL, solda bir sütunun ortasında duruyor.
 *
 * ⚠️ Kaydırma DİKEYDEKİNİN BİREBİR AYNISI ve başka türlü yapılamıyor:
 * görüntü kutuya `cover` ile oturuyor ve kampüs noktası KUTUNUN MERKEZİ. Nokta
 * sola alınacaksa kutunun merkezi sola alınmak zorunda; kutu ekranı kaplamaya
 * devam edeceği için de SOLA DOĞRU UZUYOR (sol ucu ekranın dışında).
 *
 * Harita URL'inin merkezini kaydırmak da denenebilirdi ve YANLIŞ olurdu: tam
 * ekrana geçerken kampüs ortaya dönmek zorunda ve bir URL animasyonla
 * değişemez. Kutu çözümünde dönüş tek bir `translateX`.
 */

/**
 * Poligonun durduğu SOL SÜTUN — ekran genişliğinin oranı.
 *
 * 0.42: bandın kalan ~%58'i (eksi sağ pay) iki küçük karta yetiyor. Sütun
 * büyütülürse kartlar sığmıyor, küçültülürse poligon bandın içinde bir lekeye
 * dönüyor — `fitZoom` şekli bu sütuna sığdırdığı için sayı doğrudan kampüsün
 * ekrandaki boyu demek.
 */
export const FEED_MAP_CAMPUS_COLUMN_SHARE = 0.42;

export function feedMapCampusColumn(viewportWidth: number): number {
  return Math.round(viewportWidth * FEED_MAP_CAMPUS_COLUMN_SHARE);
}

export interface FeedMapHorizontalArgs {
  /** Katmanın genişliği (= ekran). */
  viewportWidth: number;
  /** Kampüsün ortalanacağı sol sütun (bkz. `feedMapCampusColumn`). */
  columnWidth: number;
  /** Ölçümler geldi mi — gelmeden kutu kaydırılmıyor. */
  ready: boolean;
}

export interface FeedMapHorizontal {
  /** Görüntü kutusunun sol kenarı (negatif, ekran dışında). */
  imageLeft: number;
  /** Kutunun genişliği — sağ kenarı ekranın sağ kenarında. */
  boxWidth: number;
  /** Kampüs noktasının AKIŞ hâlindeki ekran x'i. */
  campusScreenX: number;
  /** Tam ekrana geçerken kutunun yatay kayması (pozitif = sağa). */
  mapShiftX: number;
}

export function feedMapHorizontal({
  viewportWidth,
  columnWidth,
  ready,
}: FeedMapHorizontalArgs): FeedMapHorizontal {
  const centered = viewportWidth / 2;
  if (!ready) {
    return {
      imageLeft: 0,
      boxWidth: viewportWidth,
      campusScreenX: centered,
      mapShiftX: 0,
    };
  }

  /**
   * ⚠️ SAĞA KAYDIRMA YOK (üst sınır ekranın ortası). Sütun ekranın yarısından
   * genişse kampüs zaten ortada ya da sağda olurdu ve o durumda kutuyu
   * uzatmanın karşılığı yok: dikeydeki `Math.min(0, …)` kırpmasının aynısı,
   * kayma tek yönlü.
   */
  const campusScreenX = Math.min(Math.max(columnWidth / 2, 0), centered);

  /**
   * Kutunun SOLA uzayan payı: merkez `campusScreenX`e inerken sağ kenarın
   * ekranın sağ kenarında kalması için gereken fazlalık.
   *   sol = merkez − genişlik/2,  sağ = merkez + genişlik/2 = ekran
   *   → genişlik = 2·(ekran − merkez) + ... → fazlalık = ekran − 2·merkez
   */
  const extraLeft = viewportWidth - 2 * campusScreenX;

  return {
    imageLeft: -extraLeft,
    boxWidth: viewportWidth + extraLeft,
    campusScreenX,
    // Tam ekranda kampüs ORTAYA dönüyor. Kayma fazlalığın yarısı, yani kutunun
    // sol ucu hâlâ ekranın dışında (−fazlalık/2): kayarken kenar açılmıyor.
    mapShiftX: centered - campusScreenX,
  };
}

export interface FeedMapExpandScaleArgs {
  /** Poligonun ekrandaki ölçüsü (pt), ölçeksiz hâli. */
  shapeWidth: number;
  shapeHeight: number;
  /** Tam ekranda şeklin oturacağı alan. */
  viewportWidth: number;
  viewportHeight: number;
  /** Kenarlardan bırakılacak TOPLAM nefes (pt). */
  padding: number;
  /** Tavan — bundan fazla yakınlaşma yok. */
  maxScale: number;
}

/**
 * TAM EKRANA GEÇERKEN POLİGONA NE KADAR YAKLAŞILABİLİR (istek: "biraz zoom in,
 * ekrandan taşmayacak şekilde").
 *
 * Kadraj akıştaki BANDA göre kuruluyor (poligon 120pt'lik bir bandın sol
 * sütununa sığdırılıyor), yani tam ekranda aynı şekil koca bir ekranın
 * ortasında küçücük kalıyor. Yakınlaşma bir `scale` transformu — yeni bir
 * görüntü istenmiyor, URL değişmiyor.
 *
 * ⚠️ TAVAN İKİ TARAFLI: sayıyı sabit vermek (ör. 1.5) küçük kampüste iyi, ODTÜ
 * gibi dört kilometrelik bir sınırda şekli ekranın dışına taşırıyor — istek
 * zaten "taşmayacak şekilde". Ölçek şeklin GERÇEK ölçüsünden türüyor ve iki
 * eksenin küçüğü seçiliyor.
 *
 * ⚠️ ASLA 1'İN ALTINA İNMEZ: şekil zaten ekrandan büyükse (olabiliyor, kadraj
 * banda göre) küçültmek "geri zoom" demek olurdu ve kullanıcı tam ekrana
 * geçerken haritanın uzaklaştığını görürdü.
 *
 * ⚠️ `scale` görüntüyü BÜYÜTÜYOR, yani statik harita o oranda yumuşuyor.
 * Tavanın asıl sebebi bu: 2'nin üstünde sokak adları dağılmaya başlıyor.
 */
export function feedMapExpandScale({
  shapeWidth,
  shapeHeight,
  viewportWidth,
  viewportHeight,
  padding,
  maxScale,
}: FeedMapExpandScaleArgs): number {
  if (shapeWidth <= 0 || shapeHeight <= 0) return 1;
  const availableW = Math.max(viewportWidth - padding, 1);
  const availableH = Math.max(viewportHeight - padding, 1);
  const fit = Math.min(availableW / shapeWidth, availableH / shapeHeight);
  if (!Number.isFinite(fit)) return 1;
  return Math.min(Math.max(fit, 1), maxScale);
}

export interface FeedMapFramingArgs {
  /**
   * Ekranın tepesinden chrome'un bittiği yerin `bandHeight` kadar altına.
   * `0` = ölçüm henüz gelmedi.
   */
  heroHeight: number;
  /** Haritanın chrome'un altında AÇIKTA kaldığı bant. */
  bandHeight: number;
  /** Katmanın ölçülen yüksekliği (pencere DEĞİL). */
  viewportHeight: number;
  /** Tam ekran hâlde ALTTAN kapanan yükseklik — sheet'in küçük detenti. */
  expandedBottomInset: number;
  /** Ölçümler geldi mi — gelmeden görüntü kaydırılmıyor. */
  ready: boolean;
}

export interface FeedMapFraming {
  /** Görüntü kutusunun üst kenarı (negatif, ekran dışında). */
  imageTop: number;
  /** Kutunun yüksekliği — dibi katmanın dibinde. */
  boxHeight: number;
  /** Kampüs noktasının AKIŞ hâlindeki ekran y'si. */
  campusScreenY: number;
  /** Tam ekrana geçerken kutunun dikey kayması (negatif = yukarı). */
  mapShift: number;
}

export function feedMapFraming({
  heroHeight,
  bandHeight,
  viewportHeight,
  expandedBottomInset,
  ready,
}: FeedMapFramingArgs): FeedMapFraming {
  /**
   * Kutunun üst kenarı — EKRANIN DIŞINDA, negatif.
   *
   * İstek: kampüsün konumu haritanın AÇIKTA KALAN kısmında (chrome'un altındaki
   * bant) görünsün. Kampüs statik görüntünün tam ortasında duruyor, kutu da
   * ekranı kaplasa o orta nokta ekranın ortasına, yani kartların ARKASINA
   * düşüyor. Çözüm kutuyu yukarı kaydırıp aynı oranda uzatmak:
   *   merkez = top + yükseklik/2  ve  top + yükseklik = katman boyu
   *   → top = 2·bantMerkezi − katmanBoyu
   *
   * ⚠️ `Math.min(0, …)`: chrome beklenmedik şekilde uzarsa (çok büyük dinamik
   * punto, uzun çeviri) bant ekranın ortasının ALTINA düşebilir; o zaman kutu
   * AŞAĞI kaymaya kalkar ve tepede boşluk açılır. Kayma tek yönlü.
   */
  const imageTop = ready
    ? Math.min(0, 2 * (heroHeight - bandHeight / 2) - viewportHeight)
    : 0;

  const boxHeight = viewportHeight - imageTop;

  /**
   * Kampüsün ekrandaki y'si — figürün çapalandığı, poligonun ortalandığı yer.
   * `contentFit="cover"` görüntüyü kutunun MERKEZİNE oturttuğu için:
   *   merkez = top + yükseklik/2
   *
   * ⚠️ `imageTop`un KIRPILMIŞ hâliyle de doğru: clamp devreye girerse merkez
   * ekran ortasına döner. Bant merkezini doğrudan kullanmak o durumda figürü
   * haritanın gerçek merkezinden koparırdı.
   */
  const campusScreenY = imageTop + boxHeight / 2;

  /** Tam ekranda hedef: sheet'in ÜSTÜNDE kalan alanın ortası. */
  const expandedTargetY = (viewportHeight - expandedBottomInset) / 2;

  /**
   * KAYMA SINIRLI — kutu büyütülmüyor ve DİBİ EKRANIN DİBİNDEN AYRILMIYOR.
   *
   * Kutuyu kayma kadar uzatmak iki yoldan da bedelli: tek yönde uzatmak
   * `cover` merkezini payın yarısı kadar kaydırıyor (kampüs bandın ortasından
   * düşüyor), simetrik uzatmak ise kutuyu yükselttiği için `cover` ÖLÇEĞİNİ
   * büyütüyor ve harita her zaman daha yakın görünüyor (iPhone ölçülerinde
   * ~%17: ölçek orada sınırda duruyor, kutu uzadığı an yükseklikten
   * bağlanıyor). İkisi de akıştaki görüntüyü şeridin varlığına bağlıyor —
   * asıl kaçınılan şey bu.
   *
   * O yüzden sınırlar KAPSAMA koşulu olarak yazılı:
   *   • YUKARI KAYMA YOK (alt sınır 0). Kutunun dibi `bottom: 0`da, yani her
   *     yukarı kayma ekranın dibinde kutunun ARKASINI açıyor. Arkada harita
   *     değil sayfanın zemini var → SİYAH ŞERİT.
   *
   *     ⚠️ Eskiden sınır `-expandedBottomInset`ti ve "açılan şerit sheet'in
   *     ALTINDA kalıyor" diye gerekçelendirilmişti: doğruydu, çünkü anlar
   *     yüzeyi OPAK bir sheet'ti ve o payı örtüyordu. Sheet şeride dönüşünce
   *     (zemini yok, altındaki harita görünüyor) aynı pay ekranda siyah bir
   *     bant olarak göründü — kullanıcının tarifi "haritada alttan siyah
   *     boşluk var, direkt tabana dokunsun"du. Bedeli: kampüs noktası şeridin
   *     üstünde kalan alanın tam ortasına değil, birkaç on piksel aşağısına
   *     oturuyor. Görünmeyen bir hizalama hatası, görünen bir boşluktan iyi.
   *   • Aşağı kayma ≤ `-imageTop`: kutunun ekran dışındaki üst payı bu kadar.
   *     Aşmak tepede boşluk açardı (aynı hata, öbür uçta).
   */
  const mapShift = Math.min(
    Math.max(expandedTargetY - campusScreenY, 0),
    -imageTop,
  );

  return { imageTop, boxHeight, campusScreenY, mapShift };
}
