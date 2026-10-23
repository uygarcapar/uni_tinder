/**
 * Önizleme kartının (Beğeniler · Sohbet · Profil · Akış) ANA FOTOĞRAF
 * geometrisi — hem fotoğrafın kendisi hem onu taşıyan sheet'in İLK DETENT'i
 * buradan besleniyor.
 *
 * ── Neden ayrı dosya ──────────────────────────────────────────────────────
 * Sayının iki müşterisi var ve biri ötekini import EDEMEZ:
 *   • `SwipeCard` — bloğu `aspectRatio` olarak çiziyor (SectionPhoto > bleed).
 *   • Sheet'ler (`LikerSwipeModal` · profile/`PreviewModal`) — ilk detenti bu
 *     orandan türetiyor.
 * Sheet'ler sabiti SwipeCard'dan okuyordu ve test tarafında SwipeCard mock'lanan
 * yerlerde (PreviewModal testi) named export kayboluyor, sheet mount'ta
 * patlıyordu. Tek sayılık bir modülün bedeli yok, bağımlılık yönü de düzeldi.
 *
 * ⚠️ TEK KAYNAK: detent ile fotoğrafın boyu AYNI sayıdan çıkmak zorunda.
 * Ayrışırlarsa ilk durakta ya fotoğrafın alt bandı kesiliyor ya da altında
 * panelden bir dilim görünüyor.
 */

/**
 * Önizlemenin TAM KENAR ana fotoğrafının oranı (w/h).
 *
 * Bölüm fotoğraflarından (`SECTION_PHOTO_ASPECT`, 4/5) UZUN, bilerek (istek): o
 * blok panelin dolgusunun dışına taşıyor, yani 32px daha geniş çiziliyor ve aynı
 * oranda kalsa kutu boyuyla birlikte "basık" okunuyordu. Sticky şerit de
 * üstünde durduğu için fotoğrafın kendi yüzüne kalan alan kısalıyor.
 *
 * 4/5 (1.25w) → 3/4 (1.33w) → 7/10 (1.43w), hepsi istek: fotoğrafın boyunu
 * oynatmak isteyen TEK ayar noktası burası — `SECTION_PHOTO_ASPECT`e dokunmamalı,
 * o diğer bütün bölüm fotoğraflarının ritmi.
 */
export const PREVIEW_COVER_ASPECT = 7 / 10;

/**
 * Verilen kart genişliğinde ana fotoğrafın yüksekliği = sheet'in ilk detenti.
 *
 * Kart sheet'in tam genişliğinde çiziliyor, yani `width` pratikte pencere
 * genişliği. Çağıran yuvarlamayı kendi yapıyor (gorhom detentleri px bekliyor).
 */
export function previewCoverHeight(width: number): number {
  return width / PREVIEW_COVER_ASPECT;
}
