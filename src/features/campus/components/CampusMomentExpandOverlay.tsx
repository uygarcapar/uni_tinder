import { memo, useEffect, useMemo, useRef, useState } from "react";
import { StyleSheet, Text, View, useWindowDimensions } from "react-native";
import Animated, {
  Easing,
  useAnimatedStyle,
  useSharedValue,
  withTiming,
} from "react-native-reanimated";
import { Gesture, GestureDetector } from "react-native-gesture-handler";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { Image } from "expo-image";
import { LinearGradient } from "expo-linear-gradient";
import { useTranslation } from "react-i18next";
import AnimatedPressable from "@/shared/components/AnimatedPressable";
import CardActionGlassButton from "@/features/discover/components/CardActionGlassButton";
import { Check } from "@/shared/icons";
import { modeAccent, type AppMode } from "@/features/discover/modeTheme";
import { colors, scrimAt } from "@/shared/theme/colors";
import {
  campusExpandGeometry,
  campusExpandTransform,
  type ExpandRect,
} from "../campusExpandGeometry";
import { campusPhotoUri } from "../campusPhotoUri";
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

/** Büyük kartın köşesi — şeritteki kartın köşesinden (28) daha yumuşak değil. */
const RADIUS = 28;

/** Yazı bloğunun payları — şeritteki kartla aynı dil, bir tık büyük punto. */
const TEXT_INSET = 20;
const TEXT_BOTTOM = 20;

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
  onLike: () => void;
  onClose: () => void;
}

const CampusMomentExpandOverlay = memo(function CampusMomentExpandOverlay({
  moment,
  frame,
  mode,
  busy,
  collapsing = false,
  onLike,
  onClose,
}: CampusMomentExpandOverlayProps) {
  const { t } = useTranslation();
  const insets = useSafeAreaInsets();
  const { width: screenW, height: screenH } = useWindowDimensions();

  const geometry = useMemo(
    () =>
      campusExpandGeometry({
        screenW,
        screenH,
        topInset: insets.top,
        bottomInset: insets.bottom,
        start: frame,
      }),
    [frame, insets.bottom, insets.top, screenH, screenW],
  );

  /** 0 = başlangıç karesi, 1 = hedef kare. */
  const progress = useSharedValue(0);
  const [settled, setSettled] = useState(false);
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

  const photoUri = useMemo(
    () => (shown ? campusPhotoUri(shown) : null),
    [shown],
  );


  /**
   * ⚠️ Kapanış bir kez: perde, jest ve tik aynı anda tetiklenebiliyor ve
   * çağıran iki kez kapanmayı iki ayrı olay sanıyordu.
   */
  const closedRef = useRef(false);
  /**
   * ⚠️🔴 KARAR BİR KEZ — ve kilit `busy`DEN AYRI.
   *
   * `busy` isteğin ÖMRÜ kadar: mutasyon `finally`de temizliyor, yani 120ms'lik
   * bir RTT'de bayrak t=120'de düşüyor. Buton ise alev örtüsü kapanana kadar
   * (~215ms) ekranda — aradaki pencerede sıradan bir çift dokunuş İKİNCİ BİR
   * BEĞENİ gönderiyor ve uçan alev dalgasını iptal edip yeniden başlatıyor.
   * Kilit kararın kendisine ait: basıldıysa bir daha basılamaz, yeni an
   * açılınca sıfırlanıyor.
   */
  const decidedRef = useRef(false);

  /**
   * ⚠️🔴 BAĞIMLILIK YALNIZ `moment?.id` — ne `moment` NESNESİ ne `progress`.
   *
   * İkisi de bu effect'i sonsuz bir döngüye sokuyordu ve döngünün belirtisi
   * SESSİZ: effect'in ilk satırı `setSettled(false)`, yani her yeniden
   * koşuşta cam kapısı kapanıyor ve buton HİÇ doğmuyordu (testte böyle
   * yakalandı — zamanlayıcı sayısı turda 1'den 4'e çıkıyordu).
   *   • `progress` bir paylaşılan değer, sözleşmesi gereği kalıcı bir kimlik —
   *     ama jest mock'u her render yeni nesne döndürüyor.
   *   • `moment` NESNESİ liste her tazelendiğinde yeni kopya; kimliği aynı
   *     olduğu hâlde animasyonu baştan başlatırdı.
   * Hareketi başlatan şey KARTIN KİMLİĞİ: aynı an için bir kez, başka an için
   * yeniden.
   */
  /**
   * ⚠️ GÜVENCE: an dışarıdan kaldırıldıysa dondurma her hâlükârda biter.
   *
   * Yukarıdaki zamanlayıcı kaçırılırsa (ekran sökülüp geri gelirse, kapanış
   * başka bir yoldan tetiklenirse) yüzey ağaçta kalmaya devam ederdi. Bu
   * effect o kalıntıyı imkânsız kılıyor — küçülme `collapsing` prop'uyla
   * sürüyorsa ona dokunmuyor, o çağıranın takvimine bağlı.
   */
  useEffect(() => {
    if (moment || collapsing) return;
    setSelfCollapsing(false);
  }, [collapsing, moment]);

  useEffect(() => {
    if (!moment) return;
    closedRef.current = false;
    decidedRef.current = false;
    setSelfCollapsing(false);
    setSettled(false);
    progress.value = 0;
    progress.value = withTiming(1, {
      duration: EXPAND_MS,
      easing: Easing.out(Easing.cubic),
    });
    const timer = setTimeout(() => setSettled(true), EXPAND_MS);
    return () => clearTimeout(timer);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [moment?.id]);

  /**
   * KÜÇÜLME — örtü kapandıktan sonra kart başlangıç karesine dönüyor.
   *
   * ⚠️ CAM AYNI KARDE SÖKÜLÜYOR (`settled` false): küçülme bir transform ve
   * camın altında kaldığı an zaten çizilmez; üstelik giden kartın üstünde
   * basılabilir bir buton kalması ikinci bir beğeni demekti.
   */
  useEffect(() => {
    if (!collapsing && !selfCollapsing) return;
    setSettled(false);
    progress.value = withTiming(0, {
      duration: EXPAND_MS,
      easing: Easing.in(Easing.cubic),
    });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [collapsing, selfCollapsing]);

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

  /**
   * AŞAĞI ÇEKEREK KAPATMA — jest KARTIN üstünde, perdenin değil.
   *
   * Perde zaten dokununca kapanıyor; iki yüzeye birden jest koymak dokunuşu
   * ikisinin arasında bölüyor ve hangisinin kazandığı cihaza göre değişiyor.
   */
  const pan = Gesture.Pan()
    .activeOffsetY(20)
    .onEnd((e) => {
      if (e.translationY > DISMISS_DY) close();
    })
    .runOnJS(true);

  if (!shown) return null;

  return (
    <View style={StyleSheet.absoluteFill}>
      {/* PERDE — haritanın üstünü yatıştırıyor; dokunuş kapatıyor. */}
      <AnimatedPressable
        pressScale={1}
        onPress={close}
        accessibilityRole="button"
        accessibilityLabel={t("common.close")}
        wrapperStyle={StyleSheet.absoluteFill}
        style={StyleSheet.absoluteFill}
      >
        <Animated.View
          style={[
            StyleSheet.absoluteFill,
            { backgroundColor: scrimAt(0.82) },
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
              borderRadius: RADIUS,
              borderCurve: "continuous",
              overflow: "hidden",
              backgroundColor: colors.surface4,
            },
            cardStyle,
          ]}
        >
          {/* ⚠️ HAM `photoUrl` DEĞİL ortak çözücü: göreli yol tabana bağlanıyor,
              reddedilmiş anda istek hiç kurulmuyor. Burada yüzeyin TAMAMI
              fotoğraf, yani çözülemeyen bir adres koca bir boş dikdörtgen
              demek (gerekçe campusPhotoUri'de). */}
          <Image
            source={photoUri ? { uri: photoUri } : null}
            style={StyleSheet.absoluteFill}
            contentFit="cover"
            cachePolicy="memory-disk"
            recyclingKey={photoUri ?? shown.id}
          />
          {/* Dipteki perde — ad/yaşın okunurluğu fotoğrafa bırakılmıyor. */}
          <LinearGradient
            colors={[scrimAt(0), scrimAt(0.72)]}
            style={{
              position: "absolute",
              left: 0,
              right: 0,
              bottom: 0,
              height: 160,
            }}
            pointerEvents="none"
          />
          <View
            pointerEvents="none"
            style={{
              position: "absolute",
              left: TEXT_INSET,
              right: TEXT_INSET,
              bottom: TEXT_BOTTOM,
            }}
          >
            <Text
              numberOfLines={1}
              style={{ color: colors.onMedia, fontSize: 28, fontWeight: "700" }}
            >
              {shown.displayName}
              {typeof shown.age === "number" ? `, ${shown.age}` : null}
            </Text>
          </View>
        </Animated.View>
      </GestureDetector>

      {/* CAM TİK — kartın KARDEŞİ ve yalnız oturduktan sonra (dosya başı).

          ⚠️ KENDİ ANIMDA HİÇ ÇİZİLMİYOR: kendine beğeni gönderemezsin
          (UT-7422). Büyüme herkese açık — kendi fotoğrafına büyük bakmak bir
          karar değil — ama buton ölü çizilmek yerine yok sayılıyor (kabuğun
          kendi kuralı: ölü buton çizilmiyor). */}
      {settled && !shown.isMine ? (
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

export default CampusMomentExpandOverlay;
