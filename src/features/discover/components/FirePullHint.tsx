import { Fragment, memo } from "react";
import { StyleSheet, View } from "react-native";
import { LinearGradient } from "expo-linear-gradient";
import Animated, {
  Easing,
  interpolate,
  useAnimatedReaction,
  useAnimatedStyle,
  useSharedValue,
  withTiming,
  Extrapolate,
} from "react-native-reanimated";
import { useTranslation } from "react-i18next";
// `FIRE_PULL_THRESHOLD` ARTIK OKUNMUYOR: yazının yeri ondan türüyordu (şeridin
// ortası) ve band kartın üstüne alınınca o hesap düştü — bkz. dosya başındaki
// iki katman notu. Eşik hâlâ ORANI üreten sayı (SwipeWrapper), buranın ondan
// haberi olmasına gerek yok.
import { cardPullProgress } from "@/shared/services/uiBus";
import { colors as theme, scrimAt } from "@/shared/theme/colors";

/**
 * Kartı AŞAĞI çekerken (Fire) açılan şeridin içeriği: kararan zemin +
 * jestin o anda ne yapacağını söyleyen ipucu.
 *
 * Çekiş kartı aşağı ötelediği için desteden geriye üstte bir şerit kalıyor ve
 * orada arkadaki kart görünüyor. Bu bileşen o şeridi karartıp ortasına yazıyı
 * koyuyor — kullanıcı parmağını kaldırmadan önce kararını okuyabilsin.
 *
 * İKİ METİN, EŞİKTE DEVREDİYOR:
 *   • eşiğin altında "aşağı kaydır"  → jest bitmedi, yapılacak şey çekmek.
 *   • eşikte      "bırak"            → parmağı kaldırmak Fire gönderir.
 *
 * Bu ayrım kozmetik değil, DOĞRULUK meselesi: eşiğin altında bırakmak süper
 * beğeni göndermiyor, kartı geri yaylandırıyor. Tek metin ("bırak") gösterilen
 * bir dönem vardı ve çekişin başında yalan söylüyordu; o yüzden geç açılmak
 * zorundaydı, yani en çok gerektiği anda (kullanıcı ne olacağını bilmezken)
 * ekranda değildi. İkiye bölününce ipucu çekişin BAŞINDAN gösterilebiliyor.
 *
 * DEVİR REACT'E UĞRAMIYOR: iki metin üst üste duruyor ve opaklıkla çapraz
 * sönüyorlar. `useAnimatedReaction` + `setState` ile metni değiştirmek jestin
 * ortasında bir render (ve Fabric commit'i) demekti.
 *
 * ── İKİ KATMAN, KARTIN İKİ YANINDA (2026-10-13 düzeltmesi) ─────────────────
 *
 * Bileşenin tamamı bir dönem üstteki kartın ALTINDA duruyordu (zIndex 5) ve
 * görünen tek yeri kartın terk ettiği şeritti. YAZI O ŞERİDE SIĞMIYOR:
 * çekişin tamamı `FIRE_PULL_THRESHOLD` (50 px) ve yazının sıfır noktası
 * güvenli alanın üstü (çentikli telefonlarda ~59 px) — yani şerit tam açıkken
 * bile yazının yeri kartın ALTINDA kalıyor, ipucu hiç görünmüyordu.
 * ("yukarıdan alta çekerken 'bırak' yazısı kartın altında kalıyor.")
 *
 * Şimdi iki parça:
 *   • ŞERİT PERDESİ — kartın ALTINDA (zIndex 5), eskisi gibi. Kartın terk
 *     ettiği bandı karartıyor; maskeye gerek yok, kartın kendisi maskeliyor.
 *   • İPUCU BANDI — kartın ÜSTÜNDE (zIndex 100, yatay rozetle aynı kat).
 *     Ekranın tepesine sabit, yüksekliği güvenli alan + bir satır: üstten
 *     aşağı sönen bir gradyan ve ortasında yazı. Kart altından kayıp gidiyor,
 *     yazı yerinde duruyor — pull-to-refresh başlığının davranışı.
 *
 * YAZIYI ŞERİDİN İÇİNDE TUTMAYA ÇALIŞMA: eşiği büyütmek gerekir (çekişin
 * asimptotu 100 px, bkz. SwipeWrapper'daki rubber-band) ve jestin hissi o
 * sayıya bağlı. Bandı kartın üstüne almak jeste hiç dokunmuyor.
 *
 * SÜRÜCÜ GLOBAL (`cardPullProgress`, bkz. uiBus): prop olarak geçirmek
 * SwipeWrapper → DiscoverScreen yönünde ters akış olurdu. Değer yalnız
 * aşağı-çekiş dalında yazılıyor, yatay swipe'ta değil — perde yana kaydırırken
 * açılmıyor.
 */

/**
 * Perdenin tam çekişteki koyuluğu. Arkadaki kart seçilebilir kalmalı: bu bir
 * "kapatma" perdesi değil, yazının taşıyıcısı.
 *
 * EXPORT'U TEST İÇİN. Bir dönem DiscoverScreen de okuyordu: aynı çekişte
 * header'ın zemini bu oranla kararıyordu ve iki perde yan yana görünüyordu.
 * Header'ın zemini kalktı (kart tüm ekranı kaplıyor, üstte yalnız yüzen cam
 * butonlar var), o perde de kaldırıldı.
 */
export const FIRE_PULL_SCRIM_ALPHA = 0.55;

/**
 * Yazının açılma bandı (çekiş oranı).
 *
 * ERKEN: iki metin de kendi anında doğru olduğu için ipucunun geç gelmesi için
 * bir sebep kalmadı (yukarıdaki nota bak). Yine de sıfırdan başlamıyor —
 * kartın birkaç pikselik kazara oynaması yazıyı çakmamalı.
 */
const TEXT_IN = 0.06;
const TEXT_FULL = 0.34;

/**
 * "Aşağı kaydır" → "bırak" devrinin süresi (ms).
 *
 * DEVİR ÇEKİŞE DEĞİL EŞİĞE BAĞLI. Bir tur oran bandıyla (0.85→1) sürülüyordu:
 * yazı o zaman parmakla SCRUB edilebiliyordu — birkaç piksel ileri geri
 * oynayınca iki metin arasında sallanıyor, hatta yarı yolda donup ikisi birden
 * yarı saydam kalıyordu. Oysa bu bir DURUM değişimi: eşik ya geçildi ya
 * geçilmedi. Şimdi geçiş anı tetikleyici, devir kendi saatinde akıyor.
 *
 * Süre kısa: yazı değişimi jestin ortasında, göz onu beklemiyor. 160 ms
 * "değişti" demeye yetiyor, "bir şey oluyor" dedirtecek kadar uzun değil.
 */
const SWAP_MS = 160;

/**
 * İpucu bandının güvenli alanın ALTINDA kapladığı yer (px) — bir satır yazı +
 * gradyanın sönmesi için nefes. Band yazıyı taşıyor, perde değil: ekranın
 * tepesinden başlıyor ki durum çubuğunun ardı da kararsın.
 */
const BAND_BELOW_INSET = 52;

/**
 * Yazının bandın içindeki yeri — güvenli alan çizgisinin hemen altı.
 * Eskiden yazı çekişle birlikte AŞAĞI iniyordu (`p × THRESHOLD/2`) çünkü
 * kartın terk ettiği şeridin ortasında durması gerekiyordu; band kartın
 * üstüne alınınca o hesap düştü (bkz. dosya başındaki iki katman notu).
 */
const TEXT_TOP_GAP = 6;

/**
 * Yazının çekişle birlikte indiği KÜÇÜK pay (px). Sıfır da olabilirdi; bu
 * kadarı bandı jeste bağlı gösteriyor, scrub edilebilir bir yazı hissi
 * vermeden.
 */
const TEXT_DRIFT = 6;

/**
 * ── ÜST TAŞMA PAYI (TOP_BLEED) KALDIRILDI ───────────────────────────────────
 *
 * Kap bir dönem `-DISCOVER_CARD_TOP_GAP` kadar yukarı taşıyordu: header ile
 * deste kabının arasında o kadarlık bir şerit vardı, orası kabın İÇİNDE değildi
 * ve header de kararınca iki koyu alanın arasında zemin renginde ince bir tel
 * kalıyordu. Deste kabı tüm ekrana açılınca (bkz. DiscoverScreen) o şerit de
 * header'ın perdesi de kalktı — taşacak bir yer yok, kap zaten ekranın
 * tepesinden başlıyor.
 */

type Props = {
  /**
   * Güvenli alanın üst payı — YAZININ sıfır noktası.
   *
   * Perde ekranın 0'ından başlıyor (kart da oradan başlıyor, kapak durum
   * çubuğunun ardından geçiyor) ama YAZI oraya konamaz: saatin/adanın altında
   * kalırdı. Şeridin yüksekliği bu çizgiden ölçülüyor.
   *
   * PROP, çünkü bileşen `useSafeAreaInsets`e bağlanmasın — ölçüyü zaten bilen
   * taraf onu çizen ekran.
   */
  topInset?: number;
};

function FirePullHint({ topInset = 0 }: Props) {
  const { t } = useTranslation();

  const scrimStyle = useAnimatedStyle(() => ({
    opacity: cardPullProgress.value * FIRE_PULL_SCRIM_ALPHA,
  }));

  /**
   * İpucu bandının gradyanı — çekişle birlikte koyulaşıyor, yazıyla aynı
   * bantta (TEXT_FULL'de tam) ki yazı hiçbir karede perdesiz kalmasın.
   *
   * Band kartın ÜSTÜNDE olduğu için bu opaklık KARTI karartıyor: bu yüzden
   * tam ekran değil, yalnız tepedeki bir satırlık şerit ve altına doğru
   * sönüyor (gradyan). Tam ekran bir perde kartın tamamını griye çekerdi.
   */
  const bandStyle = useAnimatedStyle(() => ({
    opacity: interpolate(
      cardPullProgress.value,
      [0, TEXT_FULL],
      [0, 1],
      Extrapolate.CLAMP,
    ),
  }));

  /**
   * Yazı bloğu: bandın içinde, güvenli alan çizgisinin hemen altında SABİT.
   *
   * Çekişle birlikte inen hâli (`p × THRESHOLD/2`) kartın altında kaldığı
   * için kaldırıldı — tarihçesi dosya başındaki iki katman notunda. Kalan
   * `TEXT_DRIFT` yalnız bandı jeste bağlı göstermek için.
   */
  const textStyle = useAnimatedStyle(() => {
    const p = cardPullProgress.value;
    return {
      opacity: interpolate(p, [TEXT_IN, TEXT_FULL], [0, 1], Extrapolate.CLAMP),
      transform: [{ translateY: p * TEXT_DRIFT }],
    };
  });

  /**
   * 0 = "aşağı kaydır", 1 = "bırak". Oranın KENDİSİ değil, eşiğin geçilip
   * geçilmediği.
   *
   * Oran eşikte tam olarak 1'e pinleniyor (`Math.min(ty / THRESHOLD, 1)`, bkz.
   * SwipeWrapper), yani karşılaştırma kaygan bir eşik hesabı değil.
   */
  const ready = useSharedValue(0);
  useAnimatedReaction(
    () => cardPullProgress.value >= 1,
    (isReady, wasReady) => {
      // Yalnız GEÇİŞ anında: reaction her karede çalışıyor, koşulsuz yazmak
      // devri her karede yeniden başlatır ve yazı hiç oturmaz.
      if (isReady === wasReady) return;
      ready.value = withTiming(isReady ? 1 : 0, {
        duration: SWAP_MS,
        easing: Easing.out(Easing.quad),
      });
    },
  );

  // Çapraz sönme — ikisi de aynı `ready` saatinden, yani toplamları hep 1.
  const pullTextStyle = useAnimatedStyle(() => ({ opacity: 1 - ready.value }));
  const releaseTextStyle = useAnimatedStyle(() => ({ opacity: ready.value }));

  return (
    <Fragment>
      {/* ŞERİT PERDESİ — KARTIN ALTINDA.
          KIRPAN KAP KENDİSİ: destenin kabına `overflow: hidden` konamaz, açık
          kart o kabın dibinden TAŞIYOR (bkz. SwipeWrapper animatedStyle >
          bottom). Kırpma burada kalınca hem perde deste dışına sızmıyor hem
          kart özgür. */}
      <View
        pointerEvents="none"
        style={{
          position: "absolute",
          // Kabın tepesi = destenin tepesi = ekranın tepesi (bkz. yukarıdaki
          // TOP_BLEED notu).
          top: 0,
          left: 0,
          right: 0,
          bottom: 0,
          overflow: "hidden",
          // Üstteki kart 10, arkadaki 1 (bkz. SwipeWrapper animatedStyle):
          // aradaki her sayı "kartın altında ama destenin üstünde" demek.
          zIndex: 5,
        }}
      >
        <Animated.View
          style={[
            StyleSheet.absoluteFill,
            { backgroundColor: scrimAt(1) },
            scrimStyle,
          ]}
        />
      </View>

      {/* İPUCU BANDI — KARTIN ÜSTÜNDE (gerekçesi dosya başında).
          Ekranın tepesine sabit; kart altından kayıp giderken yazı yerinde
          duruyor. Yükseklik güvenli alan + bir satır: gradyan o satırın
          altında sönüyor, yani kartın geri kalanı kararmıyor.
          zIndex 100 — rozetle (SwipeOverlay) aynı kat, kartın (10) üstü. */}
      <Animated.View
        pointerEvents="none"
        style={[
          {
            position: "absolute",
            top: 0,
            left: 0,
            right: 0,
            height: topInset + BAND_BELOW_INSET,
            zIndex: 100,
          },
          bandStyle,
        ]}
      >
        <LinearGradient
          // Dipte TAM SAYDAM: bandın alt kenarı kartın üstünde bir çizgi
          // olarak okunmasın.
          colors={[scrimAt(FIRE_PULL_SCRIM_ALPHA + 0.2), scrimAt(0)]}
          style={StyleSheet.absoluteFill}
        />
        <Animated.View
          style={[
            // Yazı güvenli alanın ALTINDA: band ekranın 0'ından başlıyor ama
            // yazı saatin/adanın ardına düşemez (bkz. `topInset`).
            {
              position: "absolute",
              top: topInset + TEXT_TOP_GAP,
              left: 0,
              right: 0,
            },
            textStyle,
          ]}
        >
          {/* İki metin ÜST ÜSTE: ikisi de mutlak konumlu ve `textAlign` ile
              ortalı, yani uzunlukları farklı olsa da aynı merkezde duruyorlar
              ve devirde yazı yana kaymıyor. */}
          <Animated.Text style={[styles.line, pullTextStyle]}>
            {t("discover.swipe.firePullHint")}
          </Animated.Text>
          <Animated.Text style={[styles.line, releaseTextStyle]}>
            {t("discover.swipe.fireReleaseHint")}
          </Animated.Text>
        </Animated.View>
      </Animated.View>
    </Fragment>
  );
}

const styles = StyleSheet.create({
  line: {
    position: "absolute",
    top: 0,
    left: 0,
    right: 0,
    textAlign: "center",
    // `onMedia` (tam beyaz), `onMediaMuted` DEĞİL: yazı artık kartın terk
    // ettiği boş şeritte değil, FOTOĞRAFIN üstündeki gradyanın içinde duruyor
    // (bkz. dosya başındaki iki katman notu) — sönük beyaz orada açık
    // fotoğraflarda kayboluyor. Aile aynı kalıyor: medya mürekkebi modla
    // dönmez, perde iki temada da koyu.
    color: theme.onMedia,
    fontSize: 13,
    fontWeight: "600",
    letterSpacing: 0.2,
  },
});

// Çeviri dışında prop'u yok; deste her render'ında yeniden çizilmesin.
export default memo(FirePullHint);
