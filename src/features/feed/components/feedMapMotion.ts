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
 * AŞAĞI ÇEKME EŞİĞİ — bu kadar çekilince tam ekran harita açılıyor.
 *
 * Akışta pull-to-refresh KALDIRILDI ve jest haritaya devredildi (gerekçe
 * FeedScreen > onRefresh): çekerken gönderiler iniyor, başlık ve pill satırı
 * yerinde duruyor, açılan boşluktan harita görünüyor — jestin kendisi zaten
 * "haritayı aç" diyor.
 *
 * 92: iOS'un lastik direnci bu mesafede belirgin biçimde sertleşiyor, yani
 * kullanıcı "çektim" dediği anla eşik aynı yere düşüyor. Daha küçük bir sayı
 * (ör. 48) listeyi hızlı bırakan her fling'de kazara haritayı açıyordu;
 * 140 ve üstü ise parmağın rahat menzilinin dışına çıkıyor.
 *
 * ⚠️ TETİK EŞİĞİN GEÇİLMESİ, PARMAĞIN BIRAKILMASI DEĞİL: kullanıcı eşiği
 * geçtiği anda harita açılıyor. "Bırakınca" yapılsaydı jest yarıda kalan bir
 * his veriyordu — ekran çekilirken bekliyor, parmak kalkınca hareket ediyor.
 */
export const MAP_PULL_EXPAND_PX = 92;

/**
 * ÇEKMENİN ÖNDEN SÜRDÜĞÜ PAY — her katmanın KENDİ mesafesinin bu oranı.
 *
 * Eşik geçilmeden ÖNCE de açılış başlıyor (istek: "title, sekmeler, blur ve
 * kutular da çekmeye bağlı olsun"). Yani açılış dokunuşla değil PARMAKLA
 * başlıyor: kullanıcı eşiğe vardığında her katman kendi yolunun %45'inde ve
 * animasyon onları kaldığı yerden alıyor — "açılış daha smooth" denen şey bu
 * süreklilik.
 *
 * ⚠️ ORAN, PİKSEL DEĞİL ve bu bilinçli: katmanların çıkış mesafeleri çok
 * farklı (sekme şeridi ~100pt, chrome ~210pt, kutuların şeridi ~400pt).
 * Çekilen pikseli hepsine birebir uygulamak sekmeleri eşikten önce tamamen
 * çıkarırken kutuları kıpırdatmıyordu — oranla hepsi aynı NİSPİ yolu alıyor,
 * yani birlikte hareket ediyormuş gibi okunuyor.
 *
 * ⚠️ 1.0 OLAMAZ: katmanlar eşikte tamamen çıkarsa geriye animasyona iş
 * kalmıyor ve kullanıcı eşiği geçmezse her şey ekranın dışından geri dönüyor —
 * çekmenin iptal edilebilir olduğu hissi kayboluyor. 0.45 hem niyeti gösteriyor
 * hem geri dönüşü mümkün bırakıyor.
 */
export const MAP_PULL_SHARE = 0.45;

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
