import { useMemo } from "react";
import { useReducedMotion } from "react-native-reanimated";
import type { SharedValue } from "react-native-reanimated";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { SCREEN_HEADER_TITLE_HEIGHT } from "@/shared/components/ScreenHeader";

/**
 * AKIŞ KARTLARININ ÜST BANTTA YAPIŞMASI.
 *
 * Kart üst banda dayandığında kaydırmanın bir kısmını yutarak GERİDE kalıyor;
 * geride kaldığı kadar BİR SONRAKİ KARTIN ALTINA giriyor. Bütçe bitince pay
 * donuyor ve kart o payla, doğal hızda akıp gidiyor — bir daha hiçbir şey
 * oynamıyor.
 *
 * Dönüşüm `scrollY`nin SAF fonksiyonu: geri kaydırmak aynı yoldan geri
 * getiriyor, durum tutan hiçbir şey yok.
 *
 * ── KALDIRILAN İKİ TUR (sırayla istendi, geri eklenmeden önce okunmalı) ──────
 *
 * 1. ⚠️🔴 İVMELİ ÇIKIŞ ("daha fazla kaydırınca yukarı ekrandan uçuyor, o uçmayı
 *    kaldır"). Yapışma bitince kart bırakıp ivmeleniyor, doğalın ~320px önünde
 *    ekranı terk ediyordu. Yanında giden üçü de kalktı, çünkü üçü de o çıkışın
 *    parçasıydı: SÖNME (kartın yarısı hattın altında, yani görünür kalıyor —
 *    çıkmayan bir kartı soluklaştırmak "bu gönderi neden soluk" sorusunu
 *    doğuruyor), DEVRİLME (rotateX + perspektif; anlamı "benden uzaklaşıyor"du),
 *    UZAKLAŞMA (ölçek küçülmesi).
 *
 * 2. ⚠️🔴 MOMENTUM DİSTORSİYONU ("o momentumla alakalı şeyleri kaldırabilirsin").
 *    Kaydırma hızıyla ölçeklenen gerilme/yatma vardı (yaylı bir takipçiyle
 *    ölçülüyordu: `lag`, `FLIGHT_LAG_SPRING`, `trackFlightMomentum`,
 *    `flightEnvelope`, `flightFrame`). Çıkış kalktıktan sonra tek başına
 *    kaldığında yaptığı şey, YERİNDE DURAN bir kartı kaydırma hızına göre
 *    oynatmaktı — "altına girdikten sonra bir daha oynamasın" isteğinin
 *    doğrudan karşıtı. Geri eklenecekse ancak kartın ekranı terk ettiği bir
 *    tasarımla birlikte anlamlı.
 *
 * Kalan tek hesap `flightOffset`. Geometri saf ve test edilebilir (kampüs
 * dioramasındaki kural): worklet ama React/Reanimated'a hiç dokunmuyor, yalnız
 * sayı alıp sayı veriyor.
 */

/**
 * YAPIŞMA BÜTÇESİ — kart üst hatta değdikten sonra kaç px'lik kaydırma boyunca
 * direniyor. Küçültülürse yapışma hissi kaybolup kart doğrudan geçip gidiyor.
 */
export const FLIGHT_HOLD = 110;

/**
 * Bütçenin ne kadarının GERİDE kaldığı. 1.0 = kart ekranda tam çivilenir; o
 * hâlde ardışık kartlar üst üste yığılıyor ve liste donmuş gibi okunuyordu.
 * 0.42 kartı belirgin biçimde yavaşlatıyor ama akışı durdurmuyor; geride kalan
 * en fazla `FLIGHT_HOLD * FLIGHT_STICK` ≈ 46px — bir sonraki kartın ALTINA
 * girdiği pay bu (binmenin yönü z-sırası, bkz. FeedFlightCell).
 */
export const FLIGHT_STICK = 0.42;

export interface FeedFlight {
  /** Akış listesinin canlı offset'i — FeedScreen'deki `feedScrollY`. */
  scrollY: SharedValue<number>;
  /** Yapışmanın başladığı EKRAN hattı (bulanık başlığın alt kenarı). */
  edge: number;
  /** Hareketi kısan erişilebilirlik ayarı açıkken kapalı. */
  enabled: boolean;
}

/**
 * Kartın kaydırmaya EK olarak aldığı dikey öteleme (pozitif = aşağı, yani
 * kaydırmanın bir kısmını yutuyor).
 *
 * `travel` = kartın üst kenarının yapışma hattını kaç px geçtiği (negatifse
 * kart henüz hattın altında, yani hiç dokunulmuyor).
 *
 * İKİ FAZ ve geçiş C1 SÜREKLİ (konum VE hız): smoothstep'in türevi iki uçta da
 * sıfır, ikinci faz ise sabit. Bu bir süs değil — hız sıçrasa kart tam o
 * karede "takılıyor" gibi okunuyor; aynı hata chrome'un çıkışında yaşanmıştı
 * (bkz. FeedScreen > chromeSlideStyle, "iki fazın ayrı formülleri olduğu
 * dönem").
 *
 * ⚠️ İKİNCİ FAZ "SABİT", "0'A DÖNÜŞ" DEĞİL: pay sıfıra çekilseydi kart
 * yapışmayı geri ödemek için doğaldan HIZLI gitmek zorunda kalır — kaldırılan
 * uçuşun küçük bir kopyası. Payı taşımak demek: hattın üstündeki kartların
 * tamamı 46px geride, aralarındaki mesafe BOZULMADAN akıp gidiyor ve kart
 * bir kez altına girdikten sonra bir daha kıpırdamıyor.
 *
 * ⚠️ DÖNÜŞ DEĞERİ HİÇ NEGATİF OLMUYOR. Bir test bunu koruyor: negatif pay =
 * kartın doğalından hızlı gitmesi = kaldırılan uçuşun geri sızması.
 */
export function flightOffset(travel: number): number {
  "worklet";
  if (travel <= 0) return 0;
  const held = FLIGHT_HOLD * FLIGHT_STICK;
  if (travel >= FLIGHT_HOLD) return held;
  const u = travel / FLIGHT_HOLD;
  return held * u * u * (3 - 2 * u);
}

/**
 * Yapışmanın bağlamı. `scrollY` DIŞARIDAN geliyor (FeedScreen'in `feedScrollY`
 * si): burada ikinci bir offset tutulsaydı sayfa arkada beklerken bayatlar ve
 * akışa dönüşte kartlar yanlış yerden yapışırdı (aynı tuzağın uzun gerekçesi
 * `feedScrollY`nin başında).
 *
 * `edge` = bulanık başlık bandının ALT kenarı. Kart tam orada yapışmaya
 * başlıyor: bir tık yukarısı olsaydı yapışma blur'un arkasında, görünmez bir
 * yerde geçerdi.
 */
export function useFeedFlight(scrollY: SharedValue<number>): FeedFlight {
  const insets = useSafeAreaInsets();
  const reduced = useReducedMotion();
  const edge = insets.top + SCREEN_HEADER_TITLE_HEIGHT;
  return useMemo(
    () => ({ scrollY, edge, enabled: !reduced }),
    [scrollY, edge, reduced],
  );
}
