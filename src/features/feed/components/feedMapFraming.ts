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
