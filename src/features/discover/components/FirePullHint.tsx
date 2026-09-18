import { memo } from "react";
import { StyleSheet, View } from "react-native";
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
import {
  cardPullProgress,
  FIRE_PULL_THRESHOLD,
} from "@/shared/services/uiBus";
import { colors as theme, scrimAt } from "@/shared/theme/colors";
import { DISCOVER_CARD_TOP_GAP } from "./discoverHeaderMetrics";

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
 * KENDİ ŞERİDİNİ ÇİZMİYOR: perde desteyi TAMAMEN kaplıyor ve üstteki kartın
 * ALTINDA duruyor (zIndex, aşağıya bak). Yani görünen tek yeri kartın terk
 * ettiği şerit; şeridi ayrıca maskelemek gerekmiyor, kartın kendisi maskeliyor.
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
 * EXPORT, çünkü aynı çekişte HEADER da kararıyor (bkz. DiscoverScreen) ve iki
 * perde yan yana görünüyor: ayrı sayılar verilirse şerit ile üst bant farklı
 * tonda kararıp aradaki çizgi ortaya çıkıyor.
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
 * Yazının satır yüksekliğinin yarısı (px). `translateY` yazının MERKEZİNİ
 * konumlandırsın diye çıkarılıyor, üst kenarını değil.
 */
const LINE_HALF = 9;

/**
 * Perdenin destenin ÜSTÜNE taştığı pay (px).
 *
 * Deste kabının `paddingTop`u kadar (bkz. DISCOVER_CARD_TOP_GAP): header ile
 * kartların arasında o kadarlık bir şerit var ve orası deste kabının İÇİNDE
 * değil, dolayısıyla buradaki perde onu kaplamıyordu. Header de kararınca
 * (bkz. DiscoverScreen) iki koyu alanın arasında zemin renginde 5 px'lik bir
 * çizgi kalıyordu — koyu modda açık bir tel, gölge gibi.
 *
 * Taşma bu kapta, header tarafında DEĞİL: header'ın perdesini aşağı sarkıtmak
 * Android'de ViewGroup kırpmasına bağımlı olurdu; buradaki kap zaten mutlak
 * konumlu ve kendi kırpmasını kendi yapıyor.
 */
const TOP_BLEED = DISCOVER_CARD_TOP_GAP;

function FirePullHint() {
  const { t } = useTranslation();

  const scrimStyle = useAnimatedStyle(() => ({
    opacity: cardPullProgress.value * FIRE_PULL_SCRIM_ALPHA,
  }));

  /**
   * Yazı bloğu: şeridin ORTASINDA duruyor ve şeritle birlikte aşağı iniyor.
   *
   * Şeridin yüksekliği orana doğrudan bağlı — oran `ty / THRESHOLD` olduğu için
   * eşiğin altında şerit tam olarak `oran × THRESHOLD` piksel, yani yarısı
   * merkez. Eşikten SONRA şerit lastik gibi uzamaya devam ederken oran 1'de
   * pinlendiği için yazı orada duruyor: jest zaten tamamlanmışken aşağı
   * sürüklenen bir yazı göz çeliyor.
   *
   * Sabit bir `top` da denenebilirdi ama o, çekişin başında yazıyı kartın
   * ALTINDA bırakıyor: şerit daha açılmamışken yazı zaten ekranın o
   * bölgesinde, yani görünmez. Şeritle birlikte inince ilk açılan piksellerde
   * bile okunuyor.
   */
  const textStyle = useAnimatedStyle(() => {
    const p = cardPullProgress.value;
    return {
      opacity: interpolate(p, [TEXT_IN, TEXT_FULL], [0, 1], Extrapolate.CLAMP),
      transform: [
        { translateY: p * (FIRE_PULL_THRESHOLD / 2) - LINE_HALF },
      ],
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
    // KIRPAN KAP KENDİSİ: destenin kabına `overflow: hidden` konamaz, açık kart
    // o kabın dibinden TAŞIYOR (bkz. SwipeWrapper animatedStyle > bottom).
    // Kırpma burada kalınca hem yazı deste dışına sızmıyor hem kart özgür.
    <View
      pointerEvents="none"
      style={{
        position: "absolute",
        // Deste kabının üst payına TAŞIYOR (bkz. TOP_BLEED): header perdesiyle
        // arada zemin renginde bir çizgi kalmasın.
        top: -TOP_BLEED,
        left: 0,
        right: 0,
        bottom: 0,
        overflow: "hidden",
        // Üstteki kart 10, arkadaki 1 (bkz. SwipeWrapper animatedStyle):
        // aradaki her sayı "kartın altında ama destenin üstünde" demek.
        // Yatay swipe'ın LIKE/NOPE perdesi 100'de, yani o hep üstte kalıyor.
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
      <Animated.View
        style={[
          // `top` TOP_BLEED kadar geri alınıyor: kap yukarı taştı ama yazının
          // sıfır noktası destenin tepesi olmalı, şeridin yüksekliği oradan
          // ölçülüyor (bkz. textStyle).
          { position: "absolute", top: TOP_BLEED, left: 0, right: 0 },
          textStyle,
        ]}
      >
        {/* İki metin ÜST ÜSTE: ikisi de mutlak konumlu ve `textAlign` ile
            ortalı, yani uzunlukları farklı olsa da aynı merkezde duruyorlar ve
            devirde yazı yana kaymıyor. */}
        <Animated.Text style={[styles.line, pullTextStyle]}>
          {t("discover.swipe.firePullHint")}
        </Animated.Text>
        <Animated.Text style={[styles.line, releaseTextStyle]}>
          {t("discover.swipe.fireReleaseHint")}
        </Animated.Text>
      </Animated.View>
    </View>
  );
}

const styles = StyleSheet.create({
  line: {
    position: "absolute",
    top: 0,
    left: 0,
    right: 0,
    textAlign: "center",
    // Kapaktaki "yukarı kaydır" ipucuyla AYNI mürekkep (bkz. SwipeCard >
    // expandHint): ikisi de jestin ne yapacağını söyleyen aynı cins fısıltı,
    // farklı tonda olmaları ikisini ayrı diller gibi gösteriyordu.
    // `onMediaMuted` medya ailesinden ve modla DÖNMEZ — perde sabit siyah.
    color: theme.onMediaMuted,
    fontSize: 13,
    fontWeight: "600",
    letterSpacing: 0.2,
  },
});

// Çeviri dışında prop'u yok; deste her render'ında yeniden çizilmesin.
export default memo(FirePullHint);
