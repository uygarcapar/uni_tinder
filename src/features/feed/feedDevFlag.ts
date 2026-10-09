/**
 * 🔴 GELİŞTİRME KANCASI — ürün davranışının parçası DEĞİL.
 *
 * NEDEN VAR: backend bayrağı (`feed.enabled`) kapalıyken her `/api/feed/*` ucu
 * `403 + UT-7301` dönüyor ve istemci doğru davranıp Akış sekmesini HİÇ
 * çizmiyor (bkz. feedFlag.ts). Bu doğru, ama yazılmış olan ekranı — pager,
 * kartlar, boş durumlar, sekme ikonu — bayrak açılana kadar tamamen
 * erişilemez kılıyor. Yerleşimi ve metinleri görebilmek için dev'de sekme
 * zorla açılıyor.
 *
 * NE ZAMAN DEVREYE GİRİYOR: yalnız `__DEV__` VE yalnız diskteki latch
 * "açık değil" derken. Gerçek bir "açık" cevabını ASLA maskelemiyor; bayrak
 * sahiden açıldığı gün bu dosyanın hiçbir etkisi kalmaz.
 *
 * ⚠️ NE YAPMIYOR: uçları taklit ETMİYOR. Sekme açılır, ekran çizilir, ama
 * veri çağrıları yine UT-7301 alır → listeler "akış şu an kapalı" boş
 * durumuna düşer. Amaç kabuğu görmek, akışı sahte veriyle doldurmak değil.
 *
 * ⚠️ Sekme GÖRÜNÜRKEN bir feed çağrısının UT-7301'i latch'e "off" yazar
 * (feedService > guard). Oturum değeri dondurulmuş olduğu için sekme o
 * oturumda kaybolmaz — dev'de de üretimdeki gibi "ancak cold start'ta
 * değişir" kuralı geçerli.
 *
 * NASIL SİLİNİR: bu dosyayı sil, feedFlag.ts'teki tek `devForceFeedEnabled()`
 * çağrısını kaldır. Başka bağı yok.
 */

/**
 * Dev'de sekmeyi aç.
 *
 * Buradaki sabiti `false` yapmak kancayı kapatır — backend bayrağı kapalıyken
 * üretimdeki davranışı (sekme yok) dev'de de görmek istediğinde kullan.
 */
const DEV_FORCE_FEED_TAB = true;

export function devForceFeedEnabled(): boolean {
  return __DEV__ && DEV_FORCE_FEED_TAB;
}
