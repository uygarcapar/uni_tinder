import { useCallback, useEffect, useMemo, useState } from "react";
import {
  FlatList,
  Text,
  View,
  useWindowDimensions,
  type ListRenderItemInfo,
} from "react-native";
import Animated, {
  useAnimatedStyle,
  type SharedValue,
} from "react-native-reanimated";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { useTranslation } from "react-i18next";
import SkeletonBox from "@/shared/components/SkeletonBox";
import { colors, withAlpha } from "@/shared/theme/colors";
import { NATIVE_TAB_BAR_HEIGHT } from "@/navigation/tabBarMetrics";
import CampusMomentCard from "./CampusMomentCard";
import { CAMPUS_FACE_CAPTION } from "./CampusMomentFace";
import CampusMapTitle from "./CampusMapTitle";
import { CampusInfoBox, campusBoxMetrics } from "./CampusInfoBox";
import { filterLiveMoments } from "../campusQueries";
import {
  buildStripBoxes,
  orderInfoKeys,
  type StripBox,
} from "../campusStripBoxes";
import type { ExpandRect } from "../campusExpandGeometry";
import type { CampusMomentDto } from "../campusTypes";

/**
 * KAMPÜS ANLARI — tam ekran haritanın DİBİNDEKİ ŞERİT.
 *
 * ── Burada bir MODAL vardı ─────────────────────────────────────────────────
 * Aynı liste gorhom `BottomSheetModal`ının içinde duruyordu ve kaldırıldı.
 * Gerekçe tek bir cümlede: BAZEN AÇILMIYORDU — kullanıcının tarifi "her 2
 * girişimde 1 çıkıyor". Sebebi gorhom'un modal durum makinesi (portal kaydı +
 * `present()` yarışı + `DISMISSING` zehirlenmesi); `AppBottomSheet` o kilidin
 * etrafında bir watchdog, bir remount anahtarı ve ertelenmiş bir `present()`
 * taşıyor ve yine de kapatamıyordu. Yüzeyin modal olmaya ihtiyacı da yoktu:
 * kapanabilir değildi (`enablePanDownToClose={false}`), perdesi yoktu
 * (`backdrop="none"`), çıkışı haritanın X'iydi. Yani bir sheet'ten alınan
 * HİÇBİR ŞEY kullanılmıyordu — yalnızca riski taşınıyordu.
 *
 * Şerit artık düz bir `Animated.View`: haritanın kardeşi ve HAREKETİ AYNI
 * PAYLAŞILAN DEĞERLE sürüyor (`progress` = `mapProgress`). Eşzamanlılık artık
 * bir ayar meselesi değil, yapısal: iki animasyon yok, tek değer var. Harita
 * ve gönderiler ne eğriyle gidiyorsa kutular da onunla geliyor.
 *
 * ── Neden YATAY liste ──────────────────────────────────────────────────────
 * Ürün kararı: "modal içinde yana kayan kutu kutu kişiler" (modal gitti, kutu
 * kutu kaldı). Kutu başına 3:4 fotoğraf tam boy duruyor ve deste "bugün
 * kampüste kimler var"ı tek hamlede gezdiriyor.
 *
 * ── SERBEST KAYDIRMA, DURAK YOK (istek: "kartlar free drag olsun") ──────────
 * Liste `snapToInterval` ile kutu başına duruyordu (`pagingEnabled` yerine,
 * yandaki kutunun kenarı görünsün diye) ve `decelerationRate="fast"` ile
 * kısa sürüyordu. Üçü birden kalktı: deste artık parmağı serbest bırakıyor,
 * momentumla süzülüyor ve istenen yerde duruyor.
 *
 * ⚠️ GERİ KONULURSA ÜÇÜ BİRLİKTE DÜŞÜNÜLMELİ: tek başına `snapToInterval`
 * aralığı kutu + boşluk olmak zorunda (`cardWidth + CARD_GAP`) ve yan payı
 * (`LIST_GUTTER`) hesaba katmadığı için ilk kutuda bir pay kayması bırakıyor.
 *
 * ── Boş durum YOK, DOLGU KUTULARI var — AMA YALNIZ ŞERİT BOŞKEN ────────────
 * Kampüste kimse paylaşmamışsa şerit boşalmıyor: kuralı anlatan poster
 * kutuları geliyor (bkz. CampusInfoBox). Klasik boş durum (büyük glif +
 * başlık) buradan kaldırıldı.
 *
 * ⚠️ TEK AN VARSA DOLGU HİÇ ÇİZİLMİYOR (istek). Dolgu bir dönem tavana kadar
 * tamamlıyordu (1 an + 2 poster) ve kural anlatan kutular gerçek anların
 * yanında içeriğin DEVAMI gibi okunuyordu. Hesap ve gerekçe
 * `campusStripBoxes`te; kuralları söyleyen yüzey artık başlığın altındaki
 * açıklama satırı.
 *
 * ── Okunabilirlik ŞERİDİN KENDİSİNDE DEĞİL ─────────────────────────────────
 * Şeridin zemini YOK — altındaki harita görünmeye devam ediyor. Kutular opak,
 * yani kendi okunabilirliklerini taşıyorlar; aralarından ve altlarından
 * görünen haritayı ekranın alt perdesi yatıştırıyor (bkz. CampusMapScrim).
 * Şeride opak bir zemin verilse yüzeyin tamamı ("kampüsümün haritası")
 * kaybolurdu.
 *
 * ── ŞERİTTE AKSİYON YOK, YALNIZ İÇERİK ────────────────────────────────────
 * "7 an · Kampüs" satırı şeridin tepesinde (tarihçesi CampusMapTitle'da) ve
 * ALTINDA yalnız kutular var. Paylaşma aksiyonu iki adımda buradan çıktı:
 * önce şeridin başındaki tam boy "Share yours" kutusu kaldırıldı (kullanıcının
 * kaydırmadan gördüğü TEK kutu o olduğu için deste "kimler var" sorusuna hiç
 * cevap vermiyordu), sonra onun yerine konan küçük başlık kutusu da kaldırılıp
 * haritanın SAĞ ÜST köşesindeki cam yuvarlak butona taşındı (istek) — yani
 * aksiyon ilk hâline, cam butona geri döndü.
 *
 * `canShare` yine prop: artık bir kutu çizmiyor ama hangi DOLGU kutusunun başa
 * sabitlendiğini belirliyor (bkz. `pinnedInfoKey`).
 */

/** Şeridin yan payı — ilk kutu buradan başlıyor. */
const LIST_GUTTER = 20;
/** Kutular arası boşluk. */
const CARD_GAP = 12;


/**
 * NATİF MENÜNÜN KALDIRMA PAYI — listenin kırpma sınırına eklenen dikey hava.
 *
 * Karta basılı tutunca iOS kartı büyüterek kaldırıyor (bkz. CampusMomentCard >
 * context menü). Büyüyen kart listenin sınırını aşıyor ve `UIScrollView` her
 * zaman kırptığı için üstten/alttan kesiliyordu.
 *
 * 28: sistemin kaldırma ölçeği kutu boyunun ~%5'i (222pt'lik karede kenar
 * başına ~11pt) ve üstüne gölge payı düşüyor. Pay BÜYÜK OLMAK ZORUNDA değil —
 * yalnız kesmeyecek kadar; büyütmenin bedeli yok çünkü akıştaki yer negatif
 * marjla geri alınıyor.
 */
const LIFT_BLEED = 28;

/**
 * KUTULARIN ORANI — 3:4 (istek: "akış ana sayfasındaki sağ üstteki
 * dikdörtgenler gibi"). Akış başlığındaki anlar destesi (FeedMomentsPeek >
 * BOX_W/BOX_H) aynı oranı taşıyor: iki yüzey AYNI kutu ailesini konuşuyor.
 *
 * ⚠️ ÖLÇÜ GENİŞLİKTEN DEĞİL YÜKSEKLİKTEN TÜRÜYOR ve sebebi şu: şerit ne kadar
 * yer kaplayacaksa kutu da o kadar olmalı. Kutu ekran genişliğinden
 * türetildiği dönemde (ekran − 64) oran onu ~440pt yapıyor ve şerit 580pt'ye
 * çıkıyordu — haritadan geriye bir şerit kalıyordu.
 *
 * ⚠️ KARE HÂLİNDEN GERİ DÖNÜLDÜ ama `CARD_HEIGHT_RATIO` 0.26'DA KALDI. 3:4'ün
 * ilk turunda oran 0.30'du ve şerit sekme şeridinin de üstünde durmak zorunda
 * olduğu için (+49/80pt, bkz. NATIVE_TAB_BAR_HEIGHT) iPhone SE'de ekranın
 * yarısını aşıyordu. Yükseklik aynı kalıp yalnız GENİŞLİK düştüğünde (222 →
 * 166) şeridin boyu hiç değişmiyor, yani haritanın kadrajı da (FeedMapStrip >
 * expandedBottomInset) olduğu yerde kalıyor. Oranı büyütmek isteyen önce o
 * hesabı okumalı.
 */
/**
 * ⚠️ ORAN 0.26 → 0.29 (istek: "kartları biraz daha büyüt"). Üç sayı birlikte
 * okunur ve TAVANI tutan şey yukarıdaki hesap:
 *   • ALT SINIR (200) KASTEN DEĞİŞMEDİ: SE'de (667) 0.29 zaten 193 veriyor,
 *     yani o cihaz tabanda kalıyor ve şerit ekranın yarısını aşmıyor (testli
 *     değişmez). Tabanı büyütmek doğrudan o sınırı kırıyor.
 *   • ÜST SINIR 300 → 320: oran büyüyünce tablet zaten tavana dayanıyordu,
 *     yani tavan kalsaydı büyüme büyük ekranlarda hiç görünmezdi.
 */
const CARD_ASPECT = 3 / 4;
const CARD_HEIGHT_RATIO = 0.29;
const CARD_HEIGHT_MIN = 200;
const CARD_HEIGHT_MAX = 320;

/** Kutuların altındaki pay (güvenli alan BUNA EK). */
const BOTTOM_PAD = 16;

/**
 * BAŞLIK SATIRI — kutuların ÜSTÜNDE (bkz. CampusMapTitle'daki tarihçe).
 *
 * Satır yüksekliği başlığın kendi `lineHeight`i (27) ile aynı; altındaki
 * boşluk kutularla arasını açıyor. Hepsi burada toplanıyor (`TITLE_ROW`)
 * çünkü hem şeridin boyu hem alt perdenin boyu aynı sayıyı okumak zorunda —
 * biri değişip diğeri kalırsa şerit sessizce kayar ya da perde kısa kalır.
 */
const TITLE_LINE = 27;
const TITLE_GAP = 10;

/**
 * BAŞLIĞIN ALTINDAKİ AÇIKLAMA — "bu ekran ne?" satırı.
 *
 * Punto/satır/pay ÜÇÜ DE Sohbetler ekranının başlık alt yazısıyla AYNI
 * (MessagesScreen > DESC_FONT_SIZE/DESC_LINE_HEIGHT/DESC_MARGIN_TOP: 16/22/2):
 * iki ekranın başlık bloğu aynı tipografiyi konuşuyor. Pay orada da 2 ve
 * gerekçesi orada yazılı — büyük başlığın kendi satır boşluğu aşağı zaten pay
 * bırakıyor, eklenen her px ikisini ayrı blok gibi gösteriyor.
 *
 * ⚠️ İKON KALDIRILDI. Bir tur solunda 14'lük bir `info.circle` durdu
 * (FilterModal'ın bölüm başlığı kalıbı) ve istek üzerine gitti: orada ikon bir
 * FORM ALANINI işaretliyor, burada satır zaten başlığın devamı — ikon satırı
 * bir uyarı gibi okutuyordu. Geri konacaksa satır tekrar `flexDirection: row`
 * bir kutuya girmeli, yazının `flex: 1`i de onunla gelir.
 *
 * ⚠️ TEK SATIR + KÜÇÜLEREK SIĞIYOR (`adjustsFontSizeToFit`). Sarmasına izin
 * verilse yükseklik dile/cihaza göre değişirdi ve `TITLE_ROW` sabit olmaktan
 * çıkardı — şeridin boyu da, perdenin sönümü de o sabitten türüyor. Uzun bir
 * çeviri "…" ile kesilmek yerine bir punto küçülüyor (Sohbetler'deki ikizi
 * kesiyor; oradaki satır sabit bir etiket, buradaki çeviriyle uzuyor).
 *
 * ⚠️ MÜREKKEP ARTIK TEMAYLA DÖNÜYOR: `withAlpha(colors.text, DESC_INK_ALPHA)`.
 * Bir tur `textSecondary`deydi (istek "Sohbetler'deki desc rengi") ve gerekçesi
 * "o tek token iki palette de aynı (#8E8E93), yani perde dönmezken güvenli"
 * idi. Açık modda tutmadı: satır alt perdenin İÇ ucunda, yani ~%10 siyahın
 * altında ve altta harita AÇIK — #8E8E93 orada soluk bir gri lekeye dönüyordu.
 * Başlık da aynı turda tema mürekkebine geçti (uzun gerekçe CampusMapTitle'da).
 *
 * ⚠️ TAM SİYAH DEĞİL (istek: "desc siyah değil koyu gri olsun"): alfa başlıkla
 * arasındaki hiyerarşiyi kuran şey — ikisi aynı mürekkepte olsaydı iki satır
 * tek blok gibi okunurdu. Koyu temada aynı alfa beyazı söndürüyor, yani oradaki
 * davranış `textSecondary`ye çok yakın kalıyor.
 */
const DESC_INK_ALPHA = 0.65;

const DESC_FONT = 16;
const DESC_LINE = 22;
const DESC_GAP = 2;

const TITLE_ROW = TITLE_LINE + DESC_GAP + DESC_LINE + TITLE_GAP;

/**
 * PERDENİN KUYRUĞU — bandın içerik bittikten sonra sönmek için kullandığı pay.
 *
 * 16: `CardStickyHeader`ın `CHROME_BAND_TAIL`ı ile aynı sayı. O şeridin bandı
 * "satırın bittiği yer + 16" kadar ve uygulamadaki perde dilinin ölçüsü bu.
 */
const SCRIM_TAIL = 16;

export function campusCardHeight(windowHeight: number): number {
  return Math.round(
    Math.min(
      Math.max(windowHeight * CARD_HEIGHT_RATIO, CARD_HEIGHT_MIN),
      CARD_HEIGHT_MAX,
    ),
  );
}

/**
 * ŞERİDİN TOPLAM YÜKSEKLİĞİ.
 *
 * Dışarı açık: haritanın katmanı da bunu biliyor olmak zorunda — kampüs
 * noktası şeridin ÜSTÜNDE kalan alanın ortasına getiriliyor (bkz. FeedMapStrip
 * > expandedBottomInset). İki yerde elle yazılsaydı biri değiştiğinde okul
 * şeridin arkasına kayardı.
 */
export function campusStripHeight(
  windowHeight: number,
  bottomInset: number,
): number {
  return (
    TITLE_ROW +
    campusCardHeight(windowHeight) +
    /**
     * ⚠️ YAZI BLOĞU KUTUNUN DIŞINDA (istek: "isim/yaş kartın altında olsun —
     * dışında ama altında") ve şeridin boyuna EKLENİYOR, kutudan ÇIKMIYOR:
     * kutuyu kısaltmak kullanıcının az önce büyüttüğü fotoğrafı geri
     * küçültürdü. Şerit bu yüzden bir tık uzadı; haritanın kadrajı da aynı
     * sayıdan türüdüğü için kendiliğinden takip ediyor (bkz. FeedMapStrip >
     * expandedBottomInset).
     */
    CAMPUS_FACE_CAPTION +
    BOTTOM_PAD +
    bottomInset +
    // ⚠️ SEKME ŞERİDİ DE EKLENİYOR: kutular onun üstünde durmak zorunda
    // (kullanıcının gördüğü hata "kartlar bottom tabs'le çakışıyor"du).
    // Pencere insets'i bu yüksekliği İÇERMİYOR — gerekçe sabitin yanında.
    NATIVE_TAB_BAR_HEIGHT
  );
}

/**
 * ALT PERDENİN BOYU — artık KUTULARIN ÜSTÜNE KADAR (istek).
 *
 * ── Tarihçe, çünkü bu sayı iki kez ters yöne gitti ────────────────────────
 * Perde önce şeridin tamamını (+40) kaplıyordu ve ekranın alt yarısı bulanık
 * bir levhaya dönüyordu ("blur çok fazla"). Sonra kutuların ALTINA indirildi:
 * kutular opak, arkalarında perdeye ihtiyaç yok. Şimdi tekrar yukarı çıkıyor
 * ama ESKİ HÂLİ DEĞİL, iki farkla:
 *
 *   1. Başlık perdenin İÇİNDE (aşağı indi), yani perdenin taşıdığı bir iş
 *      var — eskiden kutuların arkasını boşuna bulanıklaştırıyordu.
 *   2. Maske KENARDAN söndüğü için üst uç neredeyse şeffaf: kutuların
 *      hizasında perde "hafifçe" geliyor, levha olduğu yer dip.
 *
 * ⚠️ Perde KUTULARIN ARKASINDA: şerit DOM sırasında perdeden SONRA çiziliyor
 * (FeedScreen). Kutular opak olduğu için üst uçtaki hafif perde fiilen yalnız
 * kutuların ARASINDAKİ boşluklarda ve başlığın arkasında görünüyor.
 */
/**
 * KUTULARIN SÖNÜME GİREN PAYI — sönüm kutuların ortasına kadar iniyor.
 *
 * 0.55: sönümün alt ucu kutu boyunun yarısını bir tık geçiyor, yani perde
 * ancak kutuların alt yarısında TAM güce ulaşıyor. Daha küçük bir pay (0.2–0.3)
 * sönümü yine kısa bir bant yapıyor ve "levha + ani kesim" okunuşu geri
 * geliyor; 1.0 ise perdeyi kutuların dibine kadar seyreltiyor ve sekme
 * şeridinin arkasındaki harita yeniden okunuyor.
 */
const SCRIM_FADE_CARD_SHARE = 0.55;

/**
 * ALT PERDENİN SÖNÜM UZUNLUĞU (pt) — başlıktan AŞAĞI doğru uzanan rampa.
 *
 * ── Bu sayı dört kez yön değiştirdi, son hâli en önemlisi ──────────────────
 * Önce bandın yarısıydı (varsayılan reçete) ve başlık fiilen çıplak haritada
 * kalıyordu. Sonra 32'ye indi: perde başlığın tepesine kadar TAM GÜÇTE geldi,
 * yani bant bir LEVHA oldu ve üst ucunda 32pt'lik ani bir kesim bıraktı —
 * kullanıcının tarifi "progressive olsun, azalsın; başlığın üstünde çok
 * gözükmesin". İkisi aynı kusurun iki yüzü: sönümün nerede BİTTİĞİ ayarlıydı
 * ama ne kadar UZUN olduğu değil.
 *
 * Artık uzun ve içerikten türüyor: başlık satırının tamamı + kutuların üst
 * yarısı. Sonuç, perdenin dipten yukarı doğru GİTTİKÇE azalması —
 *   • dipte (sekme şeridi, kutuların altı) tam güç,
 *   • kutuların ortasından itibaren azalmaya başlıyor,
 *   • başlığın hizasında yalnız hafif bir yatıştırma (~0.1–0.3),
 *   • başlığın birkaç pt üstünde sıfır.
 *
 * ⚠️ ÖLÇÜYE BAĞLI, SABİT DEĞİL: kutu boyu ekranla büyüyor (200–300pt) ve sabit
 * bir sönüm küçük telefonda bandın tamamını, tablette küçük bir ucunu
 * kaplardı.
 */
export function campusStripScrimFade(windowHeight: number): number {
  return (
    TITLE_ROW + Math.round(campusCardHeight(windowHeight) * SCRIM_FADE_CARD_SHARE)
  );
}

export function campusStripScrimHeight(
  windowHeight: number,
  bottomInset: number,
): number {
  /**
   * BANDIN ÜST UCU: başlığın tepesinden YALNIZ BİR KUYRUK kadar yukarıda.
   *
   * ⚠️ Bir tur `+ sönümün kendisi` (32) yazılmıştı ve bant başlığın 32pt
   * üstünde, TAM GÜÇTE bitiyordu — istenmeyen şey tam buydu. Kuyruk artık
   * sönümün değil perdenin dili kadar (16, `CardStickyHeader`ın
   * `CHROME_BAND_TAIL`ı): sönüm o kuyruğun İÇİNDE sıfıra varıyor, yani
   * başlığın üstünde gözle seçilen bir perde kalmıyor.
   *
   * ⚠️ `campusStripScrimFade` İLE BİRLİKTE OKUNUR: sönüm bu bandın boyundan
   * büyük olamaz (perde onu kırpıyor) ve kuyruktan kısa olursa üst uçta yine
   * ani bir kesim doğar.
   */
  return campusStripHeight(windowHeight, bottomInset) + SCRIM_TAIL;
}

/** Geri sayım tik aralığı — kart başına zamanlayıcı YOK, tek kaynak. */
const TICK_MS = 60_000;

/**
 * DOLGU KUTULARININ HAVUZU — ÜÇ KARE, SABİT SIRA.
 *
 * Her anahtar yüzeyin bir KURALINI adlandırıyor ve kelimesi karenin İÇİNDE
 * yazılı (bkz. campusInfoArt).
 *
 * ⚠️ KARIŞTIRMA KALDIRILDI. Havuz beş anahtardı ve sıra her açılışta
 * karıştırılıyordu (eski istek: "rastgele bilgi versin"); şeritte üç kutu
 * olduğu için kullanıcı her girişinde BAŞKA üç kart görüyordu ve yüzey
 * oturmuyordu ("bu 3 kart sürekli değişiyor neden"). Artık havuz tam olarak
 * şeridin aldığı kadar (MIN_STRIP_BOXES = 3) ve sıra sabit: aynı kullanıcı
 * her açılışta aynı üç kareyi aynı yerde buluyor.
 *
 * ⚠️ Havuza YAZISIZ kare ekleme — gerekçe campusInfoArt'ta. Dördüncü bir
 * kural eklenecekse kutu sayısı da (MIN_STRIP_BOXES) birlikte düşünülmeli,
 * yoksa havuzun kuyruğu hiç görünmez.
 *
 * Tek değişken sıralama `pinnedInfoKey`: paylaşamıyorsan sebebini söyleyen
 * kare başa alınıyor, kalan ikisinin sırası bozulmuyor.
 */
const INFO_KEYS = [
  "campus.info.expiry",
  "campus.info.insideOnly",
  "campus.info.daily",
];

export interface CampusMomentsStripProps {
  /**
   * HARİTANIN İLERLEMESİ — şerit bununla geliyor (0 ekranın altında, 1
   * yerinde). Aynı paylaşılan değer haritayı, gönderileri ve chrome'u da
   * sürüyor; eşzamanlılık buradan geliyor.
   */
  progress: SharedValue<number>;
  /**
   * ⚠️ `actionsReady` KALDIRILDI: tek müşterisi kartların cam karar çiftiydi
   * ve o satır kaldırıldı (gerekçe CampusMomentCard'ın başında). Şeride cam
   * bir yüzey geri eklenecekse kapı da geri gelmeli — animasyonlu bir atanın
   * altında doğan cam sessizce hiç çizilmiyor (proje notu).
   */
  moments: CampusMomentDto[];
  /** Başlıktaki kampüs adı — şerit yalnız taşıyor, `CampusMapTitle` yazıyor. */
  campusLabel: string | null;
  loading: boolean;
  /**
   * Paylaşım kapısı. ⚠️ ARTIK BİR KUTU ÇİZMİYOR: ne şeridin başındaki tam boy
   * kutu ne başlığın yanındaki küçük kutu kaldı (ikisi de kaldırıldı, aksiyon
   * haritanın sağ üstündeki cam butonda). Burada tek işi, paylaşamıyorsa
   * SEBEBİNİ söyleyen dolgu kutusunu başa sabitlemek (`pinnedInfoKey`).
   */
  canShare: boolean;
  /**
   * Konum kampüste mi — dolgu kutularının SIRASINI belirliyor.
   *
   * Kaldırılan boş durumun bir işi vardı: paylaşamıyorsan hangi kuralın seni
   * durdurduğunu göstermek. Rastgele sıra o etiketi bazen hiç
   * göstermeyeceği için ilgili anahtar başa SABİTLENİYOR (bkz. `pinnedInfoKey`).
   */
  isInsideCampus: boolean;
  /**
   * BAŞKASININ ANINA DOKUNULDU — kartı BÜYÜTEN kapı.
   *
   * ⚠️ ESKİDEN PROFİL AÇIYORDU (`onOpenProfile`) ve o yol kapandı: ödünç
   * alınan uç bizi beğenmemiş biri için 404 veriyor, kampüse özel uç
   * (`/campus/moments/{id}/profile`) henüz yazılmadı. Dokunuş artık kartı
   * ekranın ortasına uçurup büyütüyor; karar oradaki cam tikte.
   *
   * İkinci argüman kartın ÖLÇÜLEN penceresi — hareketin başlangıç karesi;
   * `null` ise kart yerinde büyüyor (bkz. campusExpandGeometry > `start`).
   */
  onOpenCard: (moment: CampusMomentDto, frame: ExpandRect | null) => void;
  /**
   * BÜYÜMÜŞ HÂLDE AÇIK OLAN ANIN KİMLİĞİ — o kart şeritte ÇİZİLMİYOR.
   *
   * ⚠️ "KOPYA" HİSSİNİ KIRAN TEK ŞEY BU. Büyüyen kart teknik olarak ayrı bir
   * görünüm (RN'de bir görünümü ağaçtan ağaca taşımak mümkün değil); kullanıcı
   * hareketi "taşındı" diye okusun diye aslının o sırada yerinde durmaması
   * gerekiyor.
   *
   * ⚠️ GİZLEME OPAKLIKLA DEĞİL: kart bir SwiftUI `ContextMenu` host'u taşıyor
   * ve opaklığı 1'in altına inen bir atanın altındaki SwiftUI yüzeyi sessizce
   * çizilmiyor, üstelik SONRADAN DÜZELMİYOR — kart geri geldiğinde menüsü ölü
   * olurdu. Kart hiç çizilmiyor, yerinde aynı ölçüde boş bir kutu kalıyor:
   * liste kaymıyor ve host sökülüp yeniden kuruluyor (o yol temiz).
   */
  openMomentId?: string | null;
  onRemove: (moment: CampusMomentDto) => void;
  /**
   * Başkasının anını şikayet et — kartın uzun basış menüsünden (natif).
   * Şerit yalnız taşıyor; şikayet formunu ekran açıyor (ReportModal).
   */
  onReport: (moment: CampusMomentDto) => void;
  onEndReached?: () => void;
}

export default function CampusMomentsStrip({
  progress,
  moments,
  campusLabel,
  loading,
  canShare,
  isInsideCampus,
  onOpenCard,
  openMomentId = null,
  onRemove,
  onReport,
  onEndReached,
}: CampusMomentsStripProps) {
  const { t } = useTranslation();
  const insets = useSafeAreaInsets();
  const { height: windowHeight } = useWindowDimensions();

  const cardHeight = campusCardHeight(windowHeight);
  /**
   * 3:4 (istek). ⚠️ ORAN SABİTİNDEN TÜRÜYOR, iki ayrı sayı olarak YAZILMIYOR:
   * kutular fotoğraf taşıyor ve fotoğraflar `cover` ile oturuyor — en ve boy
   * elle tutulsa bir gün orandan kayar ve fotoğraflar sessizce farklı kırpılır
   * (aynı uyarı akış destesinin BOX_W/BOX_H'sinde de yazılı).
   */
  const cardWidth = Math.round(cardHeight * CARD_ASPECT);
  /**
   * ÜÇ KUTUNUN DA ÇERÇEVESİ — tek reçete, tek ölçek (istek: "etrafına aynı
   * şekilde border da ekleyelim, boşluk filan da" + "borderi incelt, ufak").
   *
   * Dıştan içe GRİ ÇİZGİ → BOŞLUK → içerik; sayılar `campusBoxMetrics`ten
   * geliyor (222pt'lik kutuda ring 3 / gap 2 / köşe 28) ve İNCELTME REÇETENİN
   * KENDİSİNDE yapıldı, burada bir override olarak DEĞİL: şeridin kartı,
   * poster karesi ve reçeteyi okuyan herkes aynı kalınlığı çizmek zorunda —
   * tek çağrının kendi sayılarını yazması tam olarak reçetenin önlediği şey.
   *
   * ⚠️ ÖLÇEK YÜKSEKLİKTEN OKUNUYOR, GENİŞLİKTEN DEĞİL: reçetenin referansı
   * (CAMPUS_BOX_REF_SIZE = 222) şeridin kutu BOYU ve o boy 3:4'e geçerken
   * değişmedi. Genişlik verilseydi köşe 28 → 21'e düşerdi, yani yalnız oranı
   * değiştiren bir istek kutunun köşesini de sessizce sertleştirirdi.
   *
   * ⚠️ KÖŞE ARTIK BURADAN GELİYOR: kartın, dolgu kutusunun ve iskeletin üçü de
   * 28'i elle yazıyordu. Yan yana duran üç kutunun köşesi ayrışırsa şerit
   * "farklı kutu aileleri" gibi okunuyor.
   */
  const boxMetrics = useMemo(() => campusBoxMetrics(cardHeight), [cardHeight]);
  const stripHeight = campusStripHeight(windowHeight, insets.bottom);

  /**
   * Dakikalık tik — TEK zamanlayıcı.
   *
   * N kart için N `setInterval` demek 20 kartlık bir listede 20 ayrı JS
   * zamanlayıcısı demekti. Sayaç yalnız şerit mount'luyken koşuyor; mount'u
   * ekran yönetiyor (harita kapanınca sökülüyor).
   */
  const [nowMs, setNowMs] = useState(() => Date.now());
  useEffect(() => {
    const id = setInterval(() => setNowMs(Date.now()), TICK_MS);
    return () => clearInterval(id);
  }, []);

  /** Süresi dolanlar listeden düşüyor — istek atılmadan, yerinde. */
  const liveMoments = useMemo(
    () => filterLiveMoments(moments, nowMs),
    [moments, nowMs],
  );

  /**
   * PAYLAŞAMIYORSA SEBEBİ BAŞA SABİTLENİYOR.
   *
   * Artı kutusu yokken kullanıcı "neden paylaşamıyorum" sorusunu soruyor ve
   * eski boş durumun tek işi buydu. Üç kutunun üçü de ekranda ama ilki
   * kaydırmadan görünen tek kutu, o yüzden ilgili kare başa alınıyor:
   *   • kampüs dışında  → "YALNIZ KAMPUSTE",
   *   • kampüste ama paylaşamıyor (bugünü harcadı) → "GÜNDE BİR".
   * Paylaşabiliyorsa sabitleme yok — sıra havuzun kendi sırası.
   *
   * ⚠️ ARTIK YALNIZ ŞERİT BOŞKEN GÖRÜNÜYOR: dolgu kutuları tek an varken bile
   * çizilmiyor (istek, gerekçe `campusStripBoxes`te), yani bu sıralama da
   * yalnız "kampüste hiç an yok" durumunda bir işe yarıyor. Hesap yine de her
   * turda yapılıyor — ucuz ve dizilim hangi dala girdiğine bakmıyor.
   */
  const pinnedInfoKey = canShare
    ? null
    : isInsideCampus
      ? "campus.info.daily"
      : "campus.info.insideOnly";

  /**
   * Bilgi anahtarlarının sırası — havuzun sırası, biri başa alınarak.
   *
   * ⚠️ RASTGELELİK YOK (gerekçe INFO_KEYS'te): aynı kullanıcı her açılışta
   * aynı üç kareyi aynı yerde buluyor.
   */
  const infoKeys = useMemo(
    () => orderInfoKeys(INFO_KEYS, pinnedInfoKey),
    [pinnedInfoKey],
  );

  /** Şeridin dizilimi — hesap `campusStripBoxes`te (saf ve testli). */
  const boxes = useMemo(
    () =>
      buildStripBoxes<CampusMomentDto>({
        moments: liveMoments,
        idOf: (moment) => moment.id,
        loading,
        infoKeys,
      }),
    [infoKeys, liveMoments, loading],
  );

  const renderItem = useCallback(
    // `index` artık okunmuyor: gradyan yönünü indeksten türeten kabuk kalktı
    // (kutular ya fotoğraf ya düz zemin — bkz. CampusInfoBox).
    ({ item }: ListRenderItemInfo<StripBox<CampusMomentDto>>) => {
      if (item.skeleton) {
        return (
          <SkeletonBox
            width={cardWidth}
            height={cardHeight}
            // ⚠️ ÇERÇEVE YOK, yalnız köşe: iskelet bekleyen bir SİLUET, dolu
            // bir kutu değil. Çizgi çizilse yüklenme bitmeden kutu "geldi"
            // gibi okunurdu; köşe yine de reçeteden, yoksa gelen kartla
            // iskeletin köşesi ayrışıyor.
            borderRadius={boxMetrics.radius}
          />
        );
      }
      if (item.infoKey) {
        return (
          <CampusInfoBox
            width={cardWidth}
            height={cardHeight}
            ring={boxMetrics.ring}
            gap={boxMetrics.gap}
            radius={boxMetrics.radius}
            infoKey={item.infoKey}
            // ÇİZİLMİYOR — kelime karenin içinde yazılı, bu yalnız VoiceOver
            // etiketi (bkz. CampusInfoBox).
            text={t(item.infoKey)}
          />
        );
      }
      if (!item.moment) return null;
      // AÇIK KART ŞERİTTE YOK — yerinde yalnız ölçüsü kadar boşluk
      // (gerekçe `openMomentId`de).
      if (item.moment.id === openMomentId) {
        return <View style={{ width: cardWidth, height: cardHeight }} />;
      }
      return (
        <CampusMomentCard
          moment={item.moment}
          width={cardWidth}
          height={cardHeight}
          ring={boxMetrics.ring}
          gap={boxMetrics.gap}
          radius={boxMetrics.radius}
          nowMs={nowMs}
          // ⚠️ KENDİ ANIM DOKUNULAMAZ: kendine karar veremezsin (UT-7422) ve
          // açılacak bir profil kartı da yok. `onPress` verilmeyince kart
          // erişilebilirlik ağacında da buton gibi görünmüyor.
          /* ⚠️ KENDİ ANIM DA AÇILIYOR (istek): kapı artık burada DEĞİL, cam
             tikte. Dokunuş bir karar değil, büyütüp bakma — eskiden kendi
             anına dokunmak hiçbir şey yapmıyordu ve yüzey bozuk gibi
             okunuyordu. "Kendine karar veremezsin" (UT-7422) kuralını butonun
             kendisi taşıyor (bkz. CampusMomentExpandOverlay). */
          onPress={onOpenCard}
          onRemove={onRemove}
          onReport={onReport}
        />
      );
    },
    [
      boxMetrics,
      cardHeight,
      cardWidth,
      nowMs,
      openMomentId,
      onOpenCard,
      onRemove,
      onReport,
      t,
    ],
  );

  /**
   * ŞERİDİN GELİŞİ — ekranın altından yerine.
   *
   * ⚠️ `translateY`, `bottom` DEĞİL: layout prop'unu her karede değiştirmek
   * şeridin (liste + kartlar) Yoga geçişini her karede tekrarlatıyor. Camın
   * kuralı (animasyonlu ata = cam çizilmiyor) `actionsReady` kapısıyla
   * karşılanıyor, yani transform güvenli.
   *
   * ⚠️ OPAKLIK YOK: kartların içindeki cam ve blur yüzeyler ata zincirindeki
   * opacity<1'den ölüyor. Ekran dışına ötelemek zaten tam gizliyor.
   */
  const slideStyle = useAnimatedStyle(() => ({
    transform: [{ translateY: (1 - progress.value) * stripHeight }],
  }));

  return (
    <Animated.View
      style={[
        {
          position: "absolute",
          left: 0,
          right: 0,
          bottom: 0,
          height: stripHeight,
          // Sekme şeridi + güvenli alan: ikisi de şeridin ALTINDA kalıyor
          // (gerekçe `campusStripHeight`te, sayı oradaki hesapla aynı).
          paddingBottom: BOTTOM_PAD + insets.bottom + NATIVE_TAB_BAR_HEIGHT,
        },
        slideStyle,
      ]}
    >
      {/* BAŞLIK — kutuların üstünde, alt perdenin içinde.
          ⚠️ Şeridin ÇOCUĞU: aynı `translateY` ile geliyor, yani kutularla
          birlikte açılıyor. Ekranın köküne konsaydı iki ayrı animasyon
          senkronda tutulmak zorunda kalırdı.
          `nowMs` buradan geçiyor — başlık kendi zamanlayıcısını kurmuyor
          (şeridin tiki tek kaynak, bkz. CampusMapTitle).

          ⚠️ SATIR YİNE SALT YAZI (`pointerEvents="none"`): bir tur sağında
          küçük bir artı kutusu durdu ve istek üzerine kaldırıldı — paylaşma
          aksiyonu haritanın SAĞ ÜST köşesine, cam yuvarlak butona taşındı
          (bkz. FeedScreen > kampüs paylaş butonu). Satıra tekrar bir aksiyon
          konacaksa `box-none` da geri gelmeli, yoksa kutu dokunuş almaz. */}
      <View
        pointerEvents="none"
        style={{
          marginBottom: TITLE_GAP,
          paddingHorizontal: LIST_GUTTER,
        }}
      >
        <View style={{ height: TITLE_LINE, justifyContent: "center" }}>
          <CampusMapTitle
            moments={moments}
            campusLabel={campusLabel}
            nowMs={nowMs}
          />
        </View>

        {/* "BU NE?" SATIRI — başlığın alt yazısı (ölçüler DESC_* sabitlerinde).
            Başlık sayıyı söylüyor ("7 an · Kampüs"), bu satır KURALI söylüyor;
            şeridin dolgu kutuları (CampusInfoBox) da aynı kuralları taşıyor
            ama onlar an YOKKEN dolan yüzeyler — anlar gelince kaybolabiliyor
            ve açıklama onlarla birlikte gitmemeli, o yüzden başlıkta. */}
        <Text
          numberOfLines={1}
          // ⚠️ Kesmek değil KÜÇÜLTMEK: satırın yüksekliği TITLE_ROW'un
          // parçası ve sarmasına izin verilemiyor (gerekçe DESC_* blokunda).
          adjustsFontSizeToFit
          style={{
            marginTop: DESC_GAP,
            height: DESC_LINE,
            // Gerekçe DESC_INK_ALPHA'nın yanında (tema mürekkebi, tam siyah
            // değil).
            color: withAlpha(colors.text, DESC_INK_ALPHA),
            fontSize: DESC_FONT,
            lineHeight: DESC_LINE,
          }}
        >
          {t("campus.headerSubtitle")}
        </Text>
      </View>

      <FlatList
        data={boxes}
        keyExtractor={(item) => item.key}
        renderItem={renderItem}
        horizontal
        showsHorizontalScrollIndicator={false}
        // ⚠️ DURAK YOK (istek: "free drag") — `snapToInterval` /
        // `snapToAlignment` / `decelerationRate="fast"` üçlüsü kaldırıldı,
        // gerekçe dosyanın başındaki blokta.
        contentContainerStyle={{
          paddingHorizontal: LIST_GUTTER,
          // Kalkma payı İÇERİDEN geri veriliyor — kutular aynı yerde kalıyor
          // (gerekçe LIFT_BLEED'de).
          paddingVertical: LIFT_BLEED,
          gap: CARD_GAP,
        }}
        // ⚠️ YÜKSEKLİK AÇIK YAZILI: `campusStripHeight` listenin tam olarak
        // kutu boyunda olduğunu varsayıyor ve o sayıyı harita da okuyor
        // (kampüs noktasının yeri). Ölçüye içerikten karar verilse bir
        // `contentContainerStyle` değişikliği şeridi sessizce kaydırırdı.
        //
        // ⚠️ KUTU BOYU + KALKMA PAYI, NEGATİF MARJLA GERİ ALINIYOR: liste bir
        // `UIScrollView` ve o HER ZAMAN kendi sınırına kırpıyor (RN
        // görünümlerinin aksine — onlarda `overflow` varsayılan olarak
        // görünür). Liste tam kutu boyundayken natif context menüsü kartı
        // kaldırırken büyüyen kartın ÜSTÜ VE ALTI kesiliyordu (yatayda liste
        // zaten ekran kadar geniş, o yüzden yalnız dikeyde görünüyordu).
        //
        // Üç sayı birlikte okunur ve ayrışırsa şerit sessizce kayar:
        //   yükseklik  +2·pay   → kırpma sınırı genişliyor
        //   marj       −pay     → AKIŞTAKİ yeri değişmiyor (negatif marj
        //                         kutunun kapladığı alanı geri kısıyor)
        //   iç dolgu   +pay     → kutular aynı ekran y'sinde kalıyor
        // Yani `campusStripHeight`in varsayımı korunuyor: liste akışta hâlâ
        // tam `cardHeight` kadar yer kaplıyor.
        style={{
          // ⚠️ YAZI DA LİSTENİN İÇİNDE: kart artık fotoğraf + altındaki iki
          // satır (gerekçe `campusStripHeight`te). Pay eklenmezse
          // `UIScrollView` yazıyı kırpıyor.
          height: cardHeight + CAMPUS_FACE_CAPTION + LIFT_BLEED * 2,
          marginVertical: -LIFT_BLEED,
        }}
        onEndReached={onEndReached}
        onEndReachedThreshold={0.6}
      />
    </Animated.View>
  );
}
