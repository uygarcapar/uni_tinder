import { memo, useEffect, useMemo, useRef, useState } from "react";
import { StyleSheet, View, useWindowDimensions } from "react-native";
import Animated, {
  Easing,
  useAnimatedStyle,
  useSharedValue,
  withTiming,
} from "react-native-reanimated";
import { Gesture, GestureDetector } from "react-native-gesture-handler";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { useTranslation } from "react-i18next";
import AnimatedPressable from "@/shared/components/AnimatedPressable";
import CardActionGlassButton from "@/features/discover/components/CardActionGlassButton";
import { Check } from "@/shared/icons";
import { modeAccent, type AppMode } from "@/features/discover/modeTheme";
import { colors, scrimAt } from "@/shared/theme/colors";
import { campusBoxMetrics } from "./CampusInfoBox";
import CampusMomentFace, {
  CAMPUS_FACE_CAPTION,
  CampusMomentCaption,
} from "./CampusMomentFace";
import {
  campusExpandGeometry,
  campusExpandTransform,
  type ExpandRect,
} from "../campusExpandGeometry";
import type { CampusMomentDto } from "../campusTypes";

/**
 * BÜYÜYEN KAMPÜS ANI KARTI — karta dokununca açılan tam ekran yüzey.
 *
 * ══════════════════════════════════════════════════════════════════════════
 * NEDEN VAR: PROFİL YOLU KAPANDI.
 * ══════════════════════════════════════════════════════════════════════════
 * Karta dokunmak kişinin profil kartını açıyordu ve o yol FİİLEN ÇALIŞMIYORDU:
 * ödünç alınan uç (`/api/swipe/LikerProfile`) sert bir beğeni kapısı taşıyor,
 * bizi beğenmemiş biri için 404 dönüyor (backend teyidi). Kampüse özel uç
 * (`GET /api/campus/moments/{id}/profile`) istendi ama yazılmadı.
 *
 * Yerine: kart şeritteki yerinden ekranın ortasına uçuyor, büyüyor ve sağında
 * tek bir cam tik duruyor. Kullanıcı kararını yine GÖREREK veriyor — yalnız
 * gördüğü şey profil değil, anın kendisi.
 *
 * ⚠️ BU YÜZEYDE "GEÇ" (X) YOK. Karar tek yönlü: beğen ya da çık. `/moments/
 * {id}/pass` ucu duruyor ama çağıranı kalmadı; geri konacaksa cam çiftin
 * ikinci elemanı olarak gelir.
 *
 * ══════════════════════════════════════════════════════════════════════════
 * 🔴 CAM, HAREKETİN BİTMESİNİ BEKLİYOR — KALDIRMA.
 * ══════════════════════════════════════════════════════════════════════════
 * `GlassView`/SwiftUI cam kabuğu, ata zincirinde KİMLİKSEL OLMAYAN bir
 * transform (ya da opacity<1) varken SESSİZCE HİÇ ÇİZİLMİYOR ve sonradan
 * düzelmiyor. Uçan + büyüyen kartın altında doğan bir cam buton, kart yerine
 * oturduğunda da görünmezdi. Bu yüzden iki kural birden:
 *   1. Buton kartın ÇOCUĞU DEĞİL KARDEŞİ,
 *   2. ve yalnız `settled` olduktan sonra mount ediliyor.
 *
 * ⚠️ KAPI ZAMANLAYICIYLA AÇILIYOR, `withTiming` CALLBACK'İYLE DEĞİL: kesilen
 * bir animasyonun callback'i `finished: false` ile geliyor ve bayrak bir daha
 * hiç dönmüyor (aynı hata eski `actionsReady` kapısında yaşandı).
 *
 * ══════════════════════════════════════════════════════════════════════════
 * 🔴 İKİ BİLEŞEN: DIŞI ÖMÜR, İÇİ HAREKET — VE SEBEBİ BİR HATAYDI.
 * ══════════════════════════════════════════════════════════════════════════
 * Cihazda görülen hata: "karta basınca kart bir an GİDECEĞİ YERDE, tam
 * boyunda görünüyor (ışınlanmış gibi), sonra animasyon başlıyor ve kart oraya
 * yavaşça gidiyor."
 *
 * Sebep Reanimated'in `useAnimatedStyle`i: dönen stilin `initial.value`su
 * hook'un İLK KOŞUŞUNDA bir kez hesaplanıyor (`if (!animatedUpdaterData
 * .current)`, bkz. node_modules/react-native-reanimated/…/useAnimatedStyle)
 * ve animasyonlu görünüm mount olduğunda natif tarafa İLK STİL olarak o
 * veriliyor. Bu dosya ekranın kökünde SÜREKLİ mount'luydu (`moment: null` ile
 * `null` döndürüyordu), yani hook ilk kez AN YOKKEN koşuyordu: `frame` null →
 * `geometry.start === geometry.target` → dönüşüm KİMLİK. Kart açıldığında
 * natif görünüm o kimlik dönüşümüyle doğuyor (hedefte, tam boy) ve ancak bir
 * sonraki UI karesinde gerçek değere atlıyordu.
 *
 * ⚠️ STATİK STİLE BAŞLANGIÇ DÖNÜŞÜMÜ YAZMAK BU HATAYI ÇÖZMÜYOR (denendi):
 * Reanimated'in stili dizide SONRA geliyor ve `transform`u o taşıyor, yani
 * bayat `initial` statik değeri EZİYOR.
 *
 * Çözüm: hareketi taşıyan her şey (paylaşılan değer + animasyonlu stiller)
 * yalnız KART AÇIKKEN yaşayan bir çocuk bileşende (`ExpandedSurface`) ve o
 * bileşen `key={moment.id}` ile mount ediliyor. Hook'lar doğru geometriyle
 * doğuyor, yani `initial` zaten başlangıç karesi.
 *
 * ⚠️ BU AYRIM KORUNMAK ZORUNDA: animasyonlu bir stili, görünümünden ÖNCE
 * doğan bir bileşene koymak aynı hatayı geri getirir. Dışta kalanlar bilerek
 * ömür işleri — gösterilen anın dondurulması, kapanışın tek sefer olması.
 */

/**
 * Kartın uçup büyüme süresi — cam kapısı da bunu okuyor.
 *
 * ⚠️ TEK SAYI, İKİ TÜKETİCİ: hareket ve kapı ayrışırsa cam ya kart hâlâ
 * uçarken (çizilmez) ya da oturduktan çok sonra (gecikmiş buton) doğar.
 */
export const EXPAND_MS = 320;

/** Aşağı çekerek kapatma eşiği (pt). */
const DISMISS_DY = 90;

/**
 * DİNLENME HÂLİNİN KÖŞESİ — şeridinkinin bir tık yuvarlağı (istek: "kart
 * büyürken rounded'ları yavaşça artsın biraz daha").
 *
 * ⚠️ ANİMASYON DEĞİL: kart bir `scale` ile büyüdüğü için ekrandaki köşe zaten
 * kartla birlikte artıyor; burada ayarlanan şey VARIŞ noktası. Çarpanı
 * `faceScale` yapmak köşeyi iki katına çıkarıyor ve "rounded değişiyor" diye
 * geri alındı — 1.25 o iki uç arasında bilinçli bir orta.
 */
export const RADIUS_GROWTH = 1.25;

/**
 * ══════════════════════════════════════════════════════════════════════════
 * ⚠️🔴 KARTIN YÜZÜ BURADA YAZILMIYOR — ŞERİDİN KARTININ KENDİSİ.
 * ══════════════════════════════════════════════════════════════════════════
 * Bu yüzey kendi düzenini çiziyordu: köşe 28, pay 20, ad 28pt, ZAMAN SATIRI
 * YOK, çerçeve yok. Şeritteki kart ise 0.5pt kenarlı, ad 20pt ve ALTINDA saat
 * satırı olan bir kutu. İki düzen ayrı durduğu için dokunuşun ilk karesinde
 * kart "oynuyordu" (kullanıcı tarifi): yazı kayıyor, saat satırı yok oluyor,
 * kenar çizgisi kayboluyordu — oysa hareketin tamamı tek bir `scale`, yani
 * başlangıç karesi şeritteki kartın BİREBİR aynısı olmak zorunda.
 *
 * Yüz artık tek yerde (`CampusMomentFace`) ve buradan İKİ ÇARPAN veriliyor:
 *   • ÇİZGİ/KÖŞE çarpanla büyütülmüş sayılar olarak (istek: "borderi bu son
 *     yaptığın şekliyle aynı şekilde büyüsün direkt") — kıl çizgi büyük kartta
 *     da kıl çizgi oranında, kartla birlikte açılan bir kenar;
 *   • `scale`: ad ve saat de kartla AYNI ORANDA büyüyor (istek). Yazı artık
 *     fotoğrafın İÇİNDE değil ALTINDA, yani hedef kare fotoğrafı değil TÜM
 *     ÖĞEYİ kapsıyor (bkz. `captionHeight`).
 */

export interface CampusMomentExpandOverlayProps {
  /** `null` → yüzey ağaçta HİÇ yok (kamera/kırpıcı kabuklarının kuralı). */
  moment: CampusMomentDto | null;
  /**
   * Kartın şeritteki ÖLÇÜLEN karesi; `null` ise uçma fazı düşüyor ve kart
   * yerinde büyüyor (gerekçe `campusExpandGeometry > start`).
   */
  frame: ExpandRect | null;
  /** Vurgu rengi ANIN modundan — ekranın seçili modundan DEĞİL. */
  mode: AppMode;
  /** Beğeni isteği uçuyor — tik kilitli (çift tik tek karar). */
  busy: boolean;
  /**
   * KÜÇÜLME FAZI — alev örtüsü kapandı, kart yerine dönüyor.
   *
   * ⚠️ YÜZEY HEMEN SÖKÜLMÜYOR: sökülseydi küçülecek bir şey kalmazdı. Ekran
   * önce bu bayrağı kaldırıyor, `EXPAND_MS` sonra `moment`i null'lıyor
   * (bkz. FeedScreen > `handleMomentLike`).
   */
  collapsing?: boolean;
  /**
   * BU AN İÇİN KARAR ZATEN VERİLDİ — cam tik çizilmiyor VE KART DAHA GENİŞ.
   *
   * İki tüketicisi var:
   *   1. tik hiç çizilmiyor (beğenilen kart şeritte kaldığı için kullanıcı
   *      aynı karta yeniden dokunabiliyor; ikinci beğeni boşa bir istek ve
   *      `UT-7424` turu demek),
   *   2. SAĞDAKİ CAM SÜTUNU AYRILMIYOR (istek: "karar verilmiş kartta kart
   *      sağdan da kaplasın, soldan olduğu kadar") — kart iki yandan simetrik,
   *      3:4 oranında büyüdüğü kadar büyük. Aynı şey KENDİ anımda da geçerli
   *      (orada da tik yok, UT-7422); gerekçe `hasDecisionColumn`da.
   *
   * Kaynağı `isMomentDecided`: sunucunun `canLike`ı, yoksa oturum kümesi.
   */
  decided?: boolean;
  onLike: () => void;
  onClose: () => void;
}

interface ExpandedSurfaceProps {
  /** Gösterilen an — dondurulmuş olabilir (bkz. dıştaki `shown`). */
  moment: CampusMomentDto;
  /** `campusExpandGeometry`nin çıktısı — FOTOĞRAFIN başlangıç ve hedef karesi. */
  geometry: { start: ExpandRect; target: ExpandRect };
  /** Küçülme — hem beğeni yolunun hem kendi kapanışının birleşimi. */
  collapsing: boolean;
  mode: AppMode;
  busy: boolean;
  /** Karar verilmiş — tik yok (gerekçe dıştaki prop'ta). */
  decided: boolean;
  onLike: () => void;
  /** Perde/jest kapanışı — tek sefer kuralı DIŞTA (gerekçe orada). */
  onRequestClose: () => void;
}

/**
 * HAREKETİ TAŞIYAN YÜZEY — perde + uçan/büyüyen kart + cam tik.
 *
 * ⚠️🔴 YALNIZ KART AÇIKKEN MOUNT'LU ve bu bir performans tercihi DEĞİL,
 * doğruluk koşulu: `useAnimatedStyle`in `initial`i hook'un ilk koşuşunda
 * donuyor ve animasyonlu görünüme İLK STİL olarak veriliyor. Uzun gerekçe
 * dosyanın başındaki "İKİ BİLEŞEN" blokunda — oraya bakmadan bu bileşeni
 * ebeveynin içine geri taşıma.
 */
const ExpandedSurface = memo(function ExpandedSurface({
  moment,
  geometry,
  collapsing,
  mode,
  busy,
  decided,
  onLike,
  onRequestClose,
}: ExpandedSurfaceProps) {
  const { t } = useTranslation();

  /** 0 = başlangıç karesi, 1 = hedef kare. */
  const progress = useSharedValue(0);
  const [settled, setSettled] = useState(false);

  /**
   * ⚠️🔴 KARAR BİR KEZ — ve kilit `busy`DEN AYRI.
   *
   * `busy` isteğin ÖMRÜ kadar: mutasyon `finally`de temizliyor, yani 120ms'lik
   * bir RTT'de bayrak t=120'de düşüyor. Buton ise alev örtüsü kapanana kadar
   * (~215ms) ekranda — aradaki pencerede sıradan bir çift dokunuş İKİNCİ BİR
   * BEĞENİ gönderiyor ve uçan alev dalgasını iptal edip yeniden başlatıyor.
   * Kilit kararın kendisine ait: basıldıysa bir daha basılamaz; yeni an
   * açılınca bu bileşen zaten yeniden mount ediliyor.
   */
  const decidedRef = useRef(false);

  /**
   * AÇILIŞ — mount'ta bir kez.
   *
   * ⚠️ BAĞIMLILIK LİSTESİ BOŞ ve olması gereken bu: bileşen an başına bir kez
   * yaşıyor (`key={moment.id}`). Eskiden bu effect ebeveyndeydi ve `moment?.id`
   * ile tetikleniyordu; `moment` NESNESİ ya da `progress` bağımlılığa girdiği
   * anda effect her renderda yeniden koşuyor, ilk satırı `setSettled(false)`
   * olduğu için cam kapısı hiç açılmıyordu (testte zamanlayıcı sayısı 1'den
   * 4'e çıkarak yakalandı).
   */
  useEffect(() => {
    progress.value = withTiming(1, {
      duration: EXPAND_MS,
      easing: Easing.out(Easing.cubic),
    });
    const timer = setTimeout(() => setSettled(true), EXPAND_MS);
    return () => clearTimeout(timer);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  /**
   * KÜÇÜLME — örtü kapandıktan sonra kart başlangıç karesine dönüyor.
   *
   * ⚠️ CAM AYNI KARDE SÖKÜLÜYOR (`settled` false): küçülme bir transform ve
   * camın altında kaldığı an zaten çizilmez; üstelik giden kartın üstünde
   * basılabilir bir buton kalması ikinci bir beğeni demekti.
   */
  useEffect(() => {
    if (!collapsing) return;
    setSettled(false);
    progress.value = withTiming(0, {
      duration: EXPAND_MS,
      easing: Easing.in(Easing.cubic),
    });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [collapsing]);

  /**
   * ⚠️🔴 HAREKET TRANSFORM — bir dönem `left/top/width/height` idi.
   *
   * Layout özellikleri her karede Yoga geçişi demek: hareket JS'in temposuna
   * bağlanıyor ve liste/harita meşgulken takılıyor. `translate + scale`
   * doğrudan kompozitörde çalışıyor — istenen "native smooth" bu.
   *
   * Yan kazanç: kart ölçeklendiği için İÇİNDEKİ HER ŞEY (fotoğraf, ad) onunla
   * birlikte büyüyor, yani şeritteki kart gerçekten "taşınıyor" gibi okunuyor.
   * Layout animasyonunda yazı sabit kalıp kutu büyüyordu ve kopya hissi tam
   * oradan doğuyordu.
   */
  const cardStyle = useAnimatedStyle(() => {
    const t = campusExpandTransform(geometry.start, geometry.target, progress.value);
    return {
      /**
       * ⚠️ DEMET OLARAK TİPLENİYOR: üç ayrı biçimli nesne bir diziye konunca
       * TS birleşim türetiyor ve RN'in `transform` tipi onu reddediyor (aynı
       * hata RegisterStep15'te duruyor). Demet, sırayı da sabitliyor —
       * `campusExpandTransform` ötelemenin ölçekten ÖNCE uygulandığını
       * varsayıyor.
       */
      transform: [
        { translateX: t.translateX },
        { translateY: t.translateY },
        { scale: t.scale },
      ] as [{ translateX: number }, { translateY: number }, { scale: number }],
    };
  });

  /**
   * PERDE KARTLA BİRLİKTE AÇILIYOR — yavaşça.
   *
   * ⚠️ BİR DÖNEM HIZLANDIRILMIŞTI (ilk %45'te tam güç) ve sebebi şuydu:
   * şeritteki asıl kart uçuş boyunca yerinde duruyordu, perde onu örtmek
   * zorundaydı. Kart artık şeritte HİÇ ÇİZİLMİYOR (bkz. CampusMomentsStrip >
   * `openMomentId`), yani örtme işi perdeden alındı ve hızlandırmanın tek
   * gerekçesi kalmadı — kalsaydı zemin "bir anda siyah oluyor" (kullanıcı
   * tarifi) hâlinde kalırdı.
   */
  const scrimStyle = useAnimatedStyle(() => ({ opacity: progress.value }));

  /**
   * ══════════════════════════════════════════════════════════════════════════
   * AD SATIRI TEK VE KENDİSİ YOL ALIYOR (istek).
   * ══════════════════════════════════════════════════════════════════════════
   * İstek birebir: "küçük kartın altındaki yazı opasite azalmasın direkt hiç;
   * kart büyürken kendisi olması gereken yere animasyonla gitsin; küçülürken
   * de geri küçüğün olması gereken yere gitsin."
   *
   * Bir tur İKİ KOPYA birbirine geçiyordu (içeride sönen + dışarıda beliren).
   * Kaldırıldı: iki ayrı düğümün sönümü, tek bir satırın taşınması kadar net
   * okunmuyor — ve istek açıkça opaklığa değil HAREKETE işaret ediyor.
   *
   * ── Niye `translate`, niye `left/top` değil ────────────────────────────────
   * Layout prop'u her karede Yoga geçişi demek; satır kartla aynı anda
   * hareket ediyor ve kart zaten kompozitörde. İkisi ayrı tempoda akarsa yazı
   * kartın altından kayıyor gibi görünür.
   *
   * ── Niye ÖLÇEK YOK ────────────────────────────────────────────────────────
   * Punto iki uçta da AYNI (taban): şeritte 20pt, dinlenmede 20pt. Yani
   * hareket saf öteleme — büyüyüp küçülen bir yazı yeniden örneklenirdi.
   *
   * ⚠️ HEDEFTEKİ X, YAZININ GENİŞLİĞİNDEN TÜRÜYOR: satır büyük kartın ORTA
   * altında duracak (istek) ama `textAlign: center` ile ortalanamıyor — o
   * zaman kutunun kendisi sabit genişlikte olmalı ve başlangıçta (şeridin dar
   * kutusunda) satır yanlış yerden başlardı. Genişlik `onLayout` ile bir kez
   * ölçülüyor; ölçüm gelene kadar merkezleme payı 0, yani satır hedefte sola
   * hizalı duruyor — ilk karede gözle fark edilmeyen, bir kare sonra düzelen
   * bir fark.
   */
  const [captionW, setCaptionW] = useState(0);

  /**
   * ADIN KIRPILMA GENİŞLİĞİ — kartla birlikte açılıyor (istek: "kart küçükken
   * isim truncate olsun, büyüyünce uzayabilir").
   *
   * ⚠️ AYRI BİR STİL, `captionStyle`ın İÇİNDE DEĞİL: `maxWidth` bir LAYOUT
   * prop'u (yazıyı yeniden ölçüyor), transform ise kompozitör işi. İkisini
   * aynı nesnede birleştirmek, her karede hem ölçüm hem öteleme demek —
   * ayrıldıklarında Reanimated yalnız değişeni yazıyor.
   *
   * ⚠️ PAY DÜŞÜLÜYOR: satırın kendi sol payı (`CAMPUS_FACE_CAPTION_LEFT`)
   * kutunun içinde; genişlik ondan düşülmezse uzun ad kartın sağından bir tık
   * taşıyor.
   */
  const captionWidthStyle = useAnimatedStyle(() => {
    const p = progress.value;
    const from = geometry.start.width;
    const to = geometry.target.width;
    return { maxWidth: from + (to - from) * p };
  });

  const captionStyle = useAnimatedStyle(() => {
    const p = progress.value;
    // Başlangıç: şeritteki kartın SOL ALTI (fotoğrafın hemen altı).
    const startX = geometry.start.x;
    const startY = geometry.start.y + geometry.start.height;
    // Hedef: büyük kartın ORTA altı.
    const endX =
      geometry.target.x + Math.max(0, geometry.target.width - captionW) / 2;
    const endY = geometry.target.y + geometry.target.height;
    return {
      transform: [
        { translateX: startX + (endX - startX) * p },
        { translateY: startY + (endY - startY) * p },
      ] as [{ translateX: number }, { translateY: number }],
    };
  });

  /**
   * YÜZÜN ÇARPANI  /**
   * YÜZÜN ÇARPANI — hedef kare, başlangıç karesinin kaç katı.
   *
   * Kart hedef ölçüsünde doğuyor ve `scale` ile şeritteki karesine iniyor
   * (bkz. campusExpandTransform). Yüzün içindeki sayılar bu çarpanla yazılınca
   * p=0'da şeridin kartıyla PİKSEL PİKSEL aynı oluyor — "kart oynuyor"
   * şikâyetini kapatan şey tam bu.
   *
   * ⚠️ ÖLÇÜM ALINAMADIYSA 1: `start === target` (uçma fazı düşüyor) ve kart
   * yerinde büyüyor, yani kıyaslanacak bir şerit karesi de yok.
   */
  const faceScale =
    geometry.start.width > 0 ? geometry.target.width / geometry.start.width : 1;

  /**
   * ÇERÇEVE ŞERİDİN REÇETESİNDEN, hedef boydan DEĞİL.
   *
   * ⚠️ ÖLÇÜ `geometry.start.height`: şerit kutularının metriklerini kendi kutu
   * BOYUNDAN türetiyor (CampusMomentsStrip > `boxMetrics`) ve başlangıç karesi
   * tam o kutu. Hedef boy geçilseydi köşe büyük kartta bir kez, küçülürken bir
   * kez daha ölçeklenir ve şeritteki kartın köşesine oturmazdı.
   */
  const metrics = useMemo(
    () => campusBoxMetrics(geometry.start.height),
    [geometry.start.height],
  );

  /**
   * ⚠️ TEK OKUMA, TİK YOK: "saat" satırı anın paylaşım zamanını yazıyor
   * (bugün için saat, dün için "Dün") ve bu yüzey saniyeler yaşıyor — şeridin
   * dakikalık tiki burada bir şey değiştirmezdi.
   */
  const nowMs = useMemo(() => Date.now(), []);

  /**
   * AŞAĞI ÇEKEREK KAPATMA — jest KARTIN üstünde, perdenin değil.
   *
   * Perde zaten dokununca kapanıyor; iki yüzeye birden jest koymak dokunuşu
   * ikisinin arasında bölüyor ve hangisinin kazandığı cihaza göre değişiyor.
   */
  const pan = Gesture.Pan()
    .activeOffsetY(20)
    .onEnd((e) => {
      if (e.translationY > DISMISS_DY) onRequestClose();
    })
    .runOnJS(true);

  return (
    <View style={StyleSheet.absoluteFill}>
      {/* PERDE — haritanın üstünü yatıştırıyor; dokunuş kapatıyor. */}
      <AnimatedPressable
        pressScale={1}
        onPress={onRequestClose}
        accessibilityRole="button"
        accessibilityLabel={t("common.close")}
        wrapperStyle={StyleSheet.absoluteFill}
        style={StyleSheet.absoluteFill}
      >
        <Animated.View
          style={[
            StyleSheet.absoluteFill,
            // ⚠️ STATİK 0 — animasyonlu stilin yetişmediği bir karede perdenin
            // TAM GÜÇTE boyanmasını (ekranın bir kare siyaha düşmesi) kapatan
            // kemer. Asıl düzeltme hook'un doğru geometriyle doğması
            // (dosya başı), bu onun yanındaki ucuz güvence.
            { backgroundColor: scrimAt(0.82), opacity: 0 },
            scrimStyle,
          ]}
        />
      </AnimatedPressable>

      {/* UÇAN/BÜYÜYEN KART — perdenin üstünde, camın ALTINDA.
          ⚠️ Cam buton bunun ÇOCUĞU DEĞİL (gerekçe dosya başında). */}
      <GestureDetector gesture={pan}>
        <Animated.View
          style={[
            {
              // ⚠️ KART HEDEF ÖLÇÜSÜNDE DOĞUYOR; şeritteki kareye ölçekle
              // iniyor (gerekçe campusExpandTransform'da). Layout sabit, yani
              // hareket boyunca tek bir Yoga geçişi bile yok.
              position: "absolute",
              left: geometry.target.x,
              top: geometry.target.y,
              width: geometry.target.width,
              height: geometry.target.height,
            },
            cardStyle,
          ]}
        >
          {/* ŞERİDİN KARTININ KENDİSİ — köşe, kıl çizgi, fotoğraf ve ALTINDAKİ
              isim/yaş/saat hepsi yüzün içinden geliyor. Kabuk burada ÇIPLAK:
              köşe/kırpma/zemin verilmiyor, yoksa yüzün kendi kutusunun üstünde
              ikinci bir maske olurdu (iç içe iki eğri = titreyen köşeler, bkz.
              CampusInfoBox > `overflow`) — üstelik yazı kutunun DIŞINDA, yani
              burada bir kırpma onu yok ederdi. */}
          <CampusMomentFace
            moment={moment}
            width={geometry.target.width}
            height={geometry.target.height}
            /**
             * ⚠️🔴 ÇİZGİ ÇARPILMIYOR (istek: "0.5px olsun ve kırılma yapmasın,
             * büyürken kendini korusun").
             *
             * Bir tur `ring * faceScale` idi — büyük kartta çizgi iki katına
             * çıkıyordu. Asıl kusur ise ters uçtaydı: ölçeklenen kartta
             * 0.5pt'lik bir kenar p=0'da ekranda ~0.23pt'ye iniyor (yarım
             * pikselin altı) ve cihaz onu yer yer atlıyor — "kırık" kenar.
             * Çizgi artık her karede `ring / kartın ölçeği` olarak çiziliyor
             * (bkz. `cardScaleStart`), yani ekranda her zaman tam 0.5pt.
             */
            ring={metrics.ring}
            gap={metrics.gap}
            cardScaleStart={faceScale > 0 ? 1 / faceScale : 1}
            /**
             * ⚠️🔴 KÖŞE ÇARPILMIYOR (istek: "foto büyürken rounded değişiyor,
             * değişmesin"). Çarpanla çizilen bir köşe ekranda
             * `radius × faceScale × kartın ölçeği` kadar görünüyor: p=0'da
             * şeridinkiyle aynı, p=1'de onun iki katı — yani büyüme köşeyi de
             * büyütüyordu. Çarpansız yazılınca iki DURAN hâl (şerit ve
             * dinlenme) aynı köşeyi paylaşıyor; uçuş boyunca köşe ölçekle
             * birlikte küçük kalıyor, o da 320ms.
             */
            /**
             * ══════════════════════════════════════════════════════════════
             * KÖŞE HAREKETLE BİRLİKTE AÇILIYOR — iki uç + aradaki her kare.
             * ══════════════════════════════════════════════════════════════
             * Ekrandaki köşe `çizilen × kartın ölçeği`. Sabit bir çizilen
             * değerle iki DURAN hâl aynı köşeyi paylaşamıyor ve dokunma/kapanma
             * anlarında SIÇRIYOR (cihaz şikâyeti: "bir anda köşeleri
             * değişiyor"). Bu yüzden iki uç ayrı veriliyor:
             *   • `radiusStart` = şeridin köşesi / başlangıç ölçeği → p=0'da
             *     ekranda tam şeridinkiyle aynı köşe,
             *   • `radius` = dinlenme hâli, şeridinkinden `RADIUS_GROWTH`
             *     kadar yuvarlak (istek: "artacaksa artsın, ama yavaşça").
             * Arası `progress` ile UI thread'de doluyor.
             */
            radius={metrics.radius * RADIUS_GROWTH}
            radiusStart={
              faceScale > 0 ? metrics.radius * faceScale : metrics.radius
            }
            progress={progress}
            nowMs={nowMs}
            /* Gösterge ve rozet kartla aynı oranda. */
            scale={faceScale}
            /* ⚠️ AD SATIRI BURADA ÇİZİLMİYOR: tek kopya, kartın kardeşi ve
               kendi yolunu alıyor (gerekçe `captionStyle`da). */
            caption={false}
          />
        </Animated.View>
      </GestureDetector>

      {/* AD + YAŞ — DİNLENME KOPYASI: kartın KARDEŞİ, taban puntosunda ve
          kartın ORTA altında (istek).

          ⚠️ KARTIN İÇİNE KONAMAZ: ölçeklenen bir görünümün içindeki yazı
          kaçınılmaz olarak ölçekleniyor (ters ölçek denendi, cihazda bozuldu —
          gerekçe `CampusMomentFace > caption`).

          ⚠️ UYGULAMA ŞERİTTEKİYLE AYNI (`CampusMomentCaption`): iki kopya
          yazılsaydı ayrışırlardı — bu yüzeyin tüm tarihçesi o hatanın. */}
      <Animated.View
        pointerEvents="none"
        onLayout={(e) => setCaptionW(e.nativeEvent.layout.width)}
        style={[
          {
            position: "absolute",
            // ⚠️ KÖŞEDEN BAŞLIYOR, konumu TAMAMEN transform taşıyor: `left`/
            // `top` animasyonu Yoga geçişi demek (gerekçe `captionStyle`da).
            left: 0,
            top: 0,
          },
          captionStyle,
        ]}
      >
        <CampusMomentCaption
          moment={moment}
          nowMs={nowMs}
          /* ⚠️ MEDYA MÜREKKEBİ: bu satır 0.82 siyah perdenin üstünde (şeritteki
             kopya tema mürekkebinde — orada alt perde açık modda BEYAZ). */
          onMedia
          /* Kırpılma genişliği kartla birlikte açılıyor (istek). */
          maxWidth={captionWidthStyle}
        />
      </Animated.View>

      {/* CAM TİK — kartın KARDEŞİ ve yalnız oturduktan sonra (dosya başı).

          ⚠️ KENDİ ANIMDA HİÇ ÇİZİLMİYOR: kendine beğeni gönderemezsin
          (UT-7422). Büyüme herkese açık — kendi fotoğrafına büyük bakmak bir
          karar değil — ama buton ölü çizilmek yerine yok sayılıyor (kabuğun
          kendi kuralı: ölü buton çizilmiyor). */}
      {settled && !moment.isMine && !decided ? (
        <View
          style={{
            position: "absolute",
            right: 0,
            left: geometry.target.x + geometry.target.width,
            top: geometry.target.y,
            height: geometry.target.height,
            alignItems: "center",
            justifyContent: "center",
          }}
        >
          <CardActionGlassButton
            variant="prominent"
            name="checkmark"
            fallback={Check}
            tintColor={modeAccent(mode)}
            glyphColor={colors.onMedia}
            label={t("campus.like")}
            busy={busy}
            onPress={() => {
              if (busy || decidedRef.current) return;
              decidedRef.current = true;
              onLike();
            }}
          />
        </View>
      ) : null}
    </View>
  );
});

const CampusMomentExpandOverlay = memo(function CampusMomentExpandOverlay({
  moment,
  frame,
  mode,
  busy,
  collapsing = false,
  decided = false,
  onLike,
  onClose,
}: CampusMomentExpandOverlayProps) {
  const insets = useSafeAreaInsets();
  const { width: screenW, height: screenH } = useWindowDimensions();

  /**
   * KENDİ KAPANIŞI — perde/jest ile başlayan küçülme.
   *
   * ⚠️ `collapsing` PROP'UNDAN AYRI: o beğeni yolunun küçülmesi ve ALEV
   * ÖRTÜSÜNÜN takvimine bağlı (çağıran, örtü kapandığında kaldırıyor). Bu ise
   * yüzeyin kendi çıkışı. İkisi aynı animasyonu sürüyor ama tetikleyicileri
   * ayrı; tek bayrağa bindirilse çağıran kendi kapanışını da "örtü kapandı"
   * sanardı.
   */
  const [selfCollapsing, setSelfCollapsing] = useState(false);

  /**
   * ⚠️🔴 KÜÇÜLÜRKEN GÖSTERİLEN AN DONDURULUYOR.
   *
   * Çağıran anı CANLI listeden çözüyor (bayat veri göstermemek için doğru) ama
   * beğeni başarılı olunca liste tazeleniyor ve karar verilmiş an listeden
   * DÜŞÜYOR. Yarışın kaybedildiği hâlde `moment` tam küçülme sırasında `null`
   * oluyor, yüzey anında sökülüyor ve kart küçülmeden yok oluyor.
   * Küçülme başladıktan sonra gösterilen şey son bilinen an.
   */
  const lastShownRef = useRef<CampusMomentDto | null>(null);
  if (moment) lastShownRef.current = moment;
  const shown =
    moment ?? (collapsing || selfCollapsing ? lastShownRef.current : null);

  /**
   * ══════════════════════════════════════════════════════════════════════════
   * SAĞDAKİ CAM SÜTUNU AYRILACAK MI — AÇILIŞTA DONDURULUYOR.
   * ══════════════════════════════════════════════════════════════════════════
   * Buton iki hâlde hiç çizilmiyor: karar zaten verilmiş (`decided`) ve KENDİ
   * anım (UT-7422). O hâllerde sütun da ayrılmıyor, yani kart ekranı sağdan da
   * soldaki pay kadar kaplıyor (istek) — oran 3:4 kaldığı için yalnız daha
   * büyük bir kutu oluyor.
   *
   * ⚠️🔴 NEDEN DONDURULUYOR: `decided` hareketin ORTASINDA değişebiliyor —
   * beğeni gidince kart o anda "karar verilmiş" oluyor (optimistik küme) ve
   * tam o sırada KÜÇÜLME animasyonu koşuyor. Değer canlı okunsa hedef kare
   * küçülmenin ortasında büyür ve kart şeritteki yerine değil başka bir yere
   * doğru küçülürdü.
   *
   * ⚠️ BAĞIMLILIK `shown?.id`, `moment?.id` DEĞİL: çağıran küçülme sırasında
   * `moment`i null'lıyor (an listeden düşüyor) ve o anda yeniden hesaplanan
   * bir değer sütunu geri açardı. `shown` küçülme boyunca son bilinen anı
   * taşıyor, yani kimlik kart sökülene kadar sabit.
   */
  const hasDecisionColumn = useMemo(
    () => !decided && !shown?.isMine,
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [shown?.id],
  );

  const geometry = useMemo(
    () =>
      campusExpandGeometry({
        screenW,
        screenH,
        topInset: insets.top,
        bottomInset: insets.bottom,
        start: frame,
        hasDecisionButton: hasDecisionColumn,
        /**
         * ⚠️ YAZI KUTUNUN DIŞINDA (istek): isim/yaş/saat fotoğrafın ALTINDA
         * duruyor ve kartla aynı oranda büyüyor. Hedef kare o yüzden yalnız
         * fotoğrafı değil TÜM ÖĞEYİ kapsıyor — yoksa yazı güvenli alanın
         * dışına taşıyor (gerekçe `campusExpandGeometry > captionHeight`).
         */
        captionHeight: CAMPUS_FACE_CAPTION,
      }),
    [frame, hasDecisionColumn, insets.bottom, insets.top, screenH, screenW],
  );

  /**
   * ⚠️ Kapanış bir kez: perde, jest ve tik aynı anda tetiklenebiliyor ve
   * çağıran iki kez kapanmayı iki ayrı olay sanıyordu.
   *
   * ⚠️ BAYRAK DIŞTA, hareketi taşıyan çocukta DEĞİL: çocuk an başına yeniden
   * mount ediliyor, yani orada tutulan bir "bir kez" kilidi her mount'ta
   * sıfırlanırdı — oysa kilidin ömrü KAPANIŞIN kendisi kadar.
   */
  const closedRef = useRef(false);

  /**
   * ⚠️ GÜVENCE: an dışarıdan kaldırıldıysa dondurma her hâlükârda biter.
   *
   * Aşağıdaki zamanlayıcı kaçırılırsa (ekran sökülüp geri gelirse, kapanış
   * başka bir yoldan tetiklenirse) yüzey ağaçta kalmaya devam ederdi. Bu
   * effect o kalıntıyı imkânsız kılıyor — küçülme `collapsing` prop'uyla
   * sürüyorsa ona dokunmuyor, o çağıranın takvimine bağlı.
   */
  useEffect(() => {
    if (moment || collapsing) return;
    setSelfCollapsing(false);
  }, [collapsing, moment]);

  /**
   * YENİ AN AÇILDI — kapanış kilidi çözülüyor.
   *
   * ⚠️ BAĞIMLILIK YALNIZ `moment?.id`, NESNE DEĞİL: liste her tazelendiğinde
   * yeni bir kopya geliyor ve nesneye bağlanan bir effect her turda koşardı.
   */
  useEffect(() => {
    if (!moment) return;
    closedRef.current = false;
    setSelfCollapsing(false);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [moment?.id]);

  /**
   * KAPANIŞ DA BİR HAREKET — açılışın tersi.
   *
   * Perdeye basmak ya da aşağı çekmek yüzeyi ANINDA söktürmüyor: kart önce
   * şeritteki yerine küçülüyor, çağıran ancak o bittiğinde haber alıyor.
   * Anında sökmek kartı "pat diye yok eden" bir kapanış bırakıyordu.
   *
   * ⚠️ BİR KEZ: perde, jest ve üst üste basışlar aynı kapanışı tetikleyebilir;
   * ikinci bir küçülme animasyonu ve ikinci bir `onClose` doğardı.
   */
  const close = () => {
    if (closedRef.current) return;
    closedRef.current = true;
    setSelfCollapsing(true);
    setTimeout(() => {
      /**
       * ⚠️🔴 DONDURMA DA BİTİYOR — sırası önemli.
       *
       * Küçülme sırasında gösterilen an donduruluyor (`shown`), yoksa liste
       * tazelenip anı düşürdüğünde kart küçülmeden yok oluyor. Ama dondurma
       * KAPANIŞLA BİRLİKTE bitmezse çağıran anı null'ladığında yüzey ağaçta
       * KALIYOR: perdesiz, camsız, donmuş bir kart haritanın üstünde duruyor
       * (cihazda görülen hata buydu). Bayrak önce düşüyor, `onClose` sonra.
       */
      setSelfCollapsing(false);
      onClose();
    }, EXPAND_MS);
  };

  if (!shown) return null;

  return (
    /**
     * ⚠️🔴 `key` ŞART: hareketi taşıyan bileşen AN BAŞINA yeniden doğmak
     * zorunda — `useAnimatedStyle`in `initial`i ilk koşuşta donuyor ve
     * animasyonlu görünüme ilk stil olarak veriliyor (uzun gerekçe dosyanın
     * başındaki "İKİ BİLEŞEN" blokunda). Anahtar olmadan ikinci bir an eski
     * anın başlangıç karesinden açılırdı.
     */
    <ExpandedSurface
      key={shown.id}
      moment={shown}
      geometry={geometry}
      collapsing={collapsing || selfCollapsing}
      mode={mode}
      busy={busy}
      decided={decided}
      onLike={onLike}
      onRequestClose={close}
    />
  );
});

export default CampusMomentExpandOverlay;
