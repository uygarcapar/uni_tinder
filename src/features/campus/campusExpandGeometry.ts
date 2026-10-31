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
  /**
   * SAĞDAKİ CAM SÜTUNU AYRILSIN MI — yani karar butonu çizilecek mi.
   *
   * ⚠️ VARSAYILAN `true` ve bilerek: sütunsuz hesap kartı butonun ALTINA
   * sokuyor. Çağıran "buton yok"u AÇIKÇA söylemeli.
   *
   * ⚠️ ÇAĞIRAN BUNU AÇILIŞTA DONDURMAK ZORUNDA: değer hareketin ortasında
   * değişirse (ör. beğeni gidip kart "karar verilmiş"e dönerken) hedef kare
   * de değişir ve küçülen kart başka bir yere doğru küçülür — gerekçe
   * CampusMomentExpandOverlay > `hasDecisionColumn`.
   */
  hasDecisionButton?: boolean;
  /**
   * FOTOĞRAFIN ALTINA AYRILAN SABİT PAY — ad satırı (`CampusMomentFace >
   * CAMPUS_FACE_CAPTION`).
   *
   * ⚠️🔴 HESABA GİRMEK ZORUNDA: ad/yaş kutunun DIŞINDA, altında (istek) ve
   * güvenli alanın içinde kalmalı. Yalnız fotoğrafa göre hesaplanan bir hedef
   * yazıyı ekranın dibine (kimi telefonda dışına) taşırıyor.
   *
   * ⚠️🔴 ÖLÇEKLENMİYOR, SABİT: yazı büyüyen kartta kartın KARDEŞİ ve taban
   * puntosunda çiziliyor (istek: "isim/yaş büyümesin"). Bir tur çarpanla
   * büyüyordu ve hesap da `caption * (width/startWidth)` ile ona uyuyordu —
   * ikisi birlikte değişmek zorunda, yoksa ya yazı taşar ya altında boşluk
   * kalır.
   *
   * ⚠️ VARSAYILAN 0 — yazısız bir kutu için hesap eski hâline dönüyor.
   */
  captionHeight?: number;
}

/**
 * SAĞDA CAM BUTONA AYRILAN SÜTUN.
 *
 * ⚠️ BUTON VARKEN KART EKRANIN ORTASINDA DEĞİL: buton bu sütunun içinde
 * duruyor ve kart o kadar sola kayıyor. Hesap ortalasaydı buton kartın üstüne
 * binerdi — cam yüzeyde kartın fotoğrafı üstünde duran bir buton, camın kendi
 * zeminini okunamaz yapıyor.
 *
 * ⚠️🔴 BUTON YOKSA SÜTUN DA YOK (istek: "karar verilmiş kartta kart sağdan da
 * kaplasın, soldan olduğu kadar"). İki hâlde buton hiç çizilmiyor — karar
 * zaten verilmiş (`canLike: false`) ve KENDİ anım (UT-7422) — ve o hâllerde
 * sütun boş bir şerit olarak duruyordu: kart sebepsiz sola yatık, sağında
 * 96pt'lik bir hiç. Sütun kalkınca kart iki yandan EDGE_PAD ile simetrik
 * oturuyor ve 3:4 oranında büyüdüğü kadar büyüyor.
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
  hasDecisionButton = true,
  captionHeight = 0,
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
  const availableW = Math.max(
    0,
    screenW - (hasDecisionButton ? BUTTON_COLUMN : 0) - EDGE_PAD * 2,
  );

  /**
   * ⚠️ YAZI PAYI DİKEY ALANDAN ÖNCE DÜŞÜLÜYOR: hedef kutu YALNIZ FOTOĞRAF
   * (hareket onu ölçekliyor), ad satırı ise kartın kardeşi olarak ALTINA
   * çiziliyor ve ölçeklenmiyor. Pay düşülmezse yazı güvenli alanın dışına
   * taşıyor.
   */
  const usableH = Math.max(0, availableH - captionHeight);
  const height = Math.min(usableH, availableW / ASPECT);
  const width = height * ASPECT;

  const target: ExpandRect = {
    // Yatayda cam sütunu ÇIKARILDIKTAN sonra kalan alanın ortası.
    x: EDGE_PAD + (availableW - width) / 2,
    /**
     * Dikeyde güvenli alanın ortası — chrome üstte, şerit altta kalıyor.
     *
     * ⚠️ ORTALANAN ŞEY FOTOĞRAF + YAZI: `usableH` üzerinden ortalamak kartı
     * yazının payı kadar yukarı alıyor, yani ikisi birlikte ortada duruyor.
     */
    y: topInset + EDGE_PAD + (usableH - height) / 2,
    width,
    height,
  };

  return { start: start ?? { ...target }, target };
}

export interface ExpandTransform {
  translateX: number;
  translateY: number;
  scale: number;
}

/**
 * ══════════════════════════════════════════════════════════════════════════
 * HAREKETİN KENDİSİ — TRANSFORM, LAYOUT DEĞİL.
 * ══════════════════════════════════════════════════════════════════════════
 * Kart HEDEF ÖLÇÜSÜNDE doğuyor; `p=0`da şeritteki kareye küçültülüp
 * taşınıyor, `p=1`de dönüşüm kimliğe iniyor.
 *
 * ⚠️ NEDEN LAYOUT DEĞİL: `left/top/width/height` her karede Yoga geçişi ve
 * yeniden ölçüm demek — hareket JS'in temposuna bağlanıyor. `translate/scale`
 * doğrudan kompozitörde çalışıyor, yani UI thread meşgulken bile akıyor.
 * "Native smooth" olan tam bu fark.
 *
 * ⚠️ ÖLÇEK MERKEZDEN UYGULANIYOR (RN'in `transform` varsayılanı), bu yüzden
 * öteleme KÖŞELER değil MERKEZLER arasındaki fark. Köşe farkı yazılırsa kart
 * küçükken şeridin yanına düşüyor — ölçek onu merkeze doğru çektiği için.
 *
 * ⚠️ ÖTELEME ÖLÇEKTEN BAĞIMSIZ HESAPLANIYOR: RN önce `translate` sonra `scale`
 * uyguluyor (dizideki sıra), yani öteleme ölçeklenmemiş uzayda. Sıra
 * değişirse bu hesap da değişmeli.
 *
 * ⚠️ `"worklet"` DİREKTİFİ GÖVDENİN İLK SATIRI — gerekçe orada.
 */
export function campusExpandTransform(
  start: ExpandRect,
  target: ExpandRect,
  p: number,
): ExpandTransform {
  /**
   * ⚠️🔴 UI THREAD'DE KOŞUYOR. `useAnimatedStyle`in içinden çağrılıyor, yani
   * JS thread'de değil. Direktif olmadan uygulama FATAL ile düşüyor:
   * "[Worklets] Tried to synchronously call a non-worklet function". Bir kez
   * cihazda yaşandı; kaynak nöbetçisi testte duruyor.
   *
   * ⚠️ Direktif fonksiyonu JS tarafında bozmuyor — düz bir dize ifadesi, yani
   * node'daki testler aynen koşuyor.
   */
  "worklet";
  const startScale = target.width > 0 ? start.width / target.width : 1;
  const scale = startScale + (1 - startScale) * p;

  const dx = start.x + start.width / 2 - (target.x + target.width / 2);
  const dy = start.y + start.height / 2 - (target.y + target.height / 2);

  return { translateX: dx * (1 - p), translateY: dy * (1 - p), scale };
}
