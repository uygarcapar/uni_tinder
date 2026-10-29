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
  const shown = moment ?? (collapsing ? lastShownRef.current : null);

  const photoUri = useMemo(
    () => (shown ? campusPhotoUri(shown) : null),
    [shown],
  );

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
  useEffect(() => {
    if (!moment) return;
    closedRef.current = false;
    decidedRef.current = false;
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
    if (!collapsing) return;
    setSettled(false);
    progress.value = withTiming(0, {
      duration: EXPAND_MS,
      easing: Easing.in(Easing.cubic),
    });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [collapsing]);

  const cardStyle = useAnimatedStyle(() => {
    const { start, target } = geometry;
    const p = progress.value;
    return {
      left: start.x + (target.x - start.x) * p,
      top: start.y + (target.y - start.y) * p,
      width: start.width + (target.width - start.width) * p,
      height: start.height + (target.height - start.height) * p,
    };
  });

  /**
   * PERDE KARTTAN HIZLI AÇILIYOR — ORİJİNALİ ÖRTMEK İÇİN.
   *
   * ⚠️ ŞERİTTEKİ KART UÇUŞ BOYUNCA YERİNDE DURUYOR (gizlenmiyor): kart bir
   * SwiftUI `ContextMenu` host'u taşıyor ve `opacity: 0` ile gizlemek projenin
   * en sert tuzağına giriyor — opaklığı 1'in altına inen bir atanın altındaki
   * SwiftUI yüzeyi SESSİZCE çizilmiyor ve sonradan DÜZELMİYOR. Yani kartı
   * gizlemenin bedeli, geri geldiğinde menüsü ölü bir kart olabilir.
   *
   * Çözüm perdede: perde hareketin ilk %45'inde tam güce çıkıyor, yani kopya
   * havalanırken orijinal çoktan örtülmüş oluyor. Kartın kendi hareketi
   * değişmiyor.
   */
  const scrimStyle = useAnimatedStyle(() => ({
    opacity: Math.min(1, progress.value / 0.45),
  }));

  const close = () => {
    if (closedRef.current) return;
    closedRef.current = true;
    onClose();
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
              position: "absolute",
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

      {/* CAM TİK — kartın KARDEŞİ ve yalnız oturduktan sonra (dosya başı). */}
      {settled ? (
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
