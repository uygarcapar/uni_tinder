import { Easing } from "react-native-reanimated";

/**
 * TAM EKRAN HARİTANIN HAREKETİ — tek kaynak.
 *
 * Buradaki SÜRE ve EĞRİ, aynı dokunuşla hareket eden HER ŞEYİ sürüyor: harita
 * kadrajı, gönderiler, chrome (başlık + pill'ler), sekme şeridi, kampüs anları
 * şeridi ve ekranın üst/alt perdeleri.
 *
 * ── Eşzamanlılık bir AYAR değil, YAPI ─────────────────────────────────────
 * Burada uzun bir "iki kütüphaneyi hizalama" bölümü vardı: anlar listesi gorhom
 * `BottomSheetModal`ının içindeydi, yani ötelemeyi Reanimated, sheet'i gorhom
 * sürüyordu. Modal kaldırıldı (bazen HİÇ AÇILMIYORDU, gerekçe
 * CampusMomentsStrip'in başında) ve şerit doğrudan `mapProgress`i okuyor: tek
 * paylaşılan değer, tek animasyon.
 *
 * ── TEK SÜRE, TEK EĞRİ — iki yön AYNI (2026-10-23 isteği) ─────────────────
 * Açılış bir dönem AYRI ayarlıydı: 340ms + `Easing.out(cubic)`. Kullanıcının
 * tarifi "açılırken animasyon aşırı hızlı gibi, başlık ve gönderiler için
 * kapanışla aynı olsun"du ve sebebi süre değil EĞRİYDİ: `out(cubic)` yolun
 * yarısını ilk %20'lik zamanda alıyor, yani gönderiler ve başlık bir anda
 * "fırlıyor" sonra yavaşça oturuyordu. Kapanıştaki `inOut(cubic)` iki uçta da
 * yumuşak, o yüzden daha ağır ve kontrollü okunuyor.
 *
 * ⚠️ İKİ SABİT DEĞİL BİR SABİT: "açılış süresi" ve "kapanış süresi" ayrı
 * yazılıp eşit tutulmaya çalışılsa kaçınılmaz olarak ayrışırlar (bu dosyanın
 * tarihçesi tam olarak bu). Yön başına farklı bir his gerekirse ikisini ayırmak
 * bilinçli bir karar olmalı, kazara değil.
 */

/** Haritanın açılma ve kapanma süresi — İKİ YÖN AYNI. */
export const MAP_MOTION_MS = 280;

/** İki uçta da yumuşak: yolun büyük kısmı ortada alınıyor. */
export const mapMotionEasing = Easing.inOut(Easing.cubic);

/**
 * KUTULARIN ŞERİDİNİN KENDİ GİRİŞİ — harita yerine oturduktan SONRA.
 *
 * ⚠️ ŞERİT ÇEKMEYE BAĞLI DEĞİL (istek). Bir dönem öyleydi: parmak aşağı
 * çekerken kutular da yukarı çıkıyordu. İstenen his o değil — kutular haritanın
 * bir parçası gibi davranıyor, oysa onlar haritanın ÜSTÜNE gelen ayrı bir
 * yüzey. Artık açılış animasyonu bittiğinde, yani ekran tam ekran haritaya
 * oturduğunda, kendiliğinden aşağıdan geliyorlar.
 *
 * 320: haritanın kendi hareketinden (280) bir tık uzun — iki hareket arka
 * arkaya okunsun, aynı hareketin devamı gibi görünmesin.
 *
 * ⚠️ Kapanışta AYRI SÜRE YOK: şerit haritayla birlikte iniyor
 * (`MAP_MOTION_MS`). Kendi süresiyle inse harita kapandıktan sonra ekranın
 * dibinde asılı kalan bir şerit görünürdü.
 */
export const MAP_STRIP_ENTRY_MS = 320;

/**
 * TAM EKRAN CHROME'UNUN SÖNÜMÜ — perdeler, başlık ve Plus pill'i.
 *
 * ⚠️ HARİTANIN HAREKETİNDEN AYRI ve bilerek daha yavaş (istek: "expanded
 * olunca bir anda oluşmasın, yavaşça olsun"). Perdeler `mapProgress`e bağlıyken
 * haritayla aynı 280ms'de beliriyordu ve ekranın iki ucu bir anda
 * karanlıklaşıyor gibi okunuyordu.
 *
 * Sıra böylece üç kademeye oturuyor: harita açılır (280) → chrome yavaşça
 * belirir (420) → kutular aşağıdan gelir (320).
 *
 * ⚠️ KAPANIŞTA AYRI SÜRE YOK: chrome haritayla birlikte sönüyor
 * (`MAP_MOTION_MS`). Kendi süresiyle sönse akış geri geldikten sonra ekranın
 * üstünde asılı kalan bir başlık görünürdü.
 */
export const MAP_CHROME_FADE_MS = 420;

/**
 * ── POLİGONUN ÇİZİLME SÜRESİ (istek) ───────────────────────────────────────
 *
 * "üç kareye dokunup çizgi animasyonla, çizgi şeklinde yavaşça çizilsin."
 *
 * Kontur kenar boyunca çiziliyor (mekanizma CampusPolygonOverlay > reveal) ve
 * bu süre o yolun tamamını kapsıyor.
 *
 * ⚠️ HARİTANIN HAREKETİNDEN (280) ÇOK UZUN ve bilerek: "yavaşça" denen şey bu.
 * Sıra böylece dört kademeye oturuyor — harita açılır (280) → chrome yavaşça
 * belirir (420) → kutular aşağıdan gelir (320) → sınır kendini çizer (1100).
 * Aynı süreye sıkıştırılsa çizim açılışın içinde kaybolur, yani kullanıcı
 * şeklin KURULDUĞUNU değil "zaten orada olduğunu" görür.
 *
 * ⚠️ ÇİZİM HARİTANIN HAREKETİ BİTTİKTEN SONRA BAŞLIYOR (çağıran geciktiriyor):
 * kadraj hâlâ kayarken başlayan bir çizim, iki hareketin üst üste binmesi
 * yüzünden "kayan bir çizgi" gibi okunuyordu.
 *
 * ⚠️ KAPANIŞTA AYRI SÜRE YOK: şekil haritayla birlikte (MAP_MOTION_MS)
 * geri silinmiyor, bir kerede sıfırlanıyor — kapanırken ekranda kalan son şey
 * bir çizgi parçası olmasın (ve akışta poligon zaten hiç çizilmiyor).
 */
export const MAP_POLYGON_DRAW_MS = 1100;
