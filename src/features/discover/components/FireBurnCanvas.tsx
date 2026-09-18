import { useEffect, useMemo } from "react";
import { StyleSheet, View } from "react-native";
import {
  Canvas,
  Group,
  LinearGradient,
  Path,
  Skia,
  vec,
} from "@shopify/react-native-skia";
import {
  Easing,
  useDerivedValue,
  useSharedValue,
  withRepeat,
  withSequence,
  withTiming,
  type SharedValue,
} from "react-native-reanimated";
import { FLAME_PATH } from "@/shared/components/icons/FlameGlyph";
import { colors as theme, gradients } from "@/shared/theme/colors";
import {
  BURN_CONTOUR_POINTS,
  BURN_FLICKER_FRAMES,
  BURN_PAD_RATIO,
  buildBurnContour,
  burnPolygon,
} from "./flameBurn";

/**
 * Keşif kartının kapağındaki FIRE ALEVİ — çekme/basılı tutma oranıyla
 * gerçekten yanan sürüm.
 *
 * Eskiden burası üç katmanlı bir RN yığınıydı: kalp şeklinde iki `MaskedView`
 * (gradyan dolgu + kayan parıltı) ve bir de kontur `Svg`'si. Şekil sabit
 * olduğu için yetiyordu; silüetin KENDİSİ oynamaya başlayınca yetmez oldu —
 * maskeyi her karede değiştirmek offscreen compose'u her karede yeniden
 * kurmak demek. Tek `Canvas` hepsinin yerine geçiyor ve silüeti UI
 * thread'inde kuruyor (bkz. flameBurn).
 *
 * SİLÜET BİR POLİGON, EKLENMİŞ ŞEKİL YOK: glyph'in dış hattı mount'ta bir kez,
 * YAY UZUNLUĞUNA göre eşit aralıklarla örnekleniyor (Skia `ContourMeasureIter`)
 * ve her karede yalnız ikonun kendi dalgasının olduğu pencerede noktalar
 * oynatılıp tek `addPoly` çağrısıyla path'e dönüyor. Kare başına tek JSI
 * çağrısı, hiç path birleştirme yok.
 *
 * ÖRNEKLEME NEDEN YAY UZUNLUĞUNA GÖRE: pencereler (bkz. flameBurn > WAVES)
 * yay uzunluğuyla tanımlı. Bezier'in kontrol noktalarına göre örnekleseydik
 * uzun kübikler seyrek kalır ve dalga orada basamaklanırdı.
 *
 * SKIA BURADA BEDAVA: modül zaten cold start'ta değerlendiriliyor, çünkü tab
 * bar'ın profil avatarı onu statik import ediyor (bkz. navigation/
 * profileTabAvatar). Kutlama alevinin (FireFlame) lazy chunk'ı bu yüzden
 * burada TEKRARLANMADI: kart zaten Skia'nın yüklendiği bir ağacın altında.
 *
 * DİNLENİRKEN BEDAVA: ısı 0'da hiçbir nokta itilmiyor, silüet ikonun dış
 * hattının kendisi oluyor ve faz da ilerlemediği için `useDerivedValue` yeniden
 * hesaplanmıyor. Yani kart boştayken burada dönen tek şey parıltı — o da yalnız
 * en üstteki kartta (bkz. `shimmer`).
 */

/**
 * RENK HİÇ DEĞİŞMİYOR — burada iki katman daha vardı, ikisi de kaldırıldı:
 *
 *  • ısıyla açılan ak-sıcak çekirdek (tabandan yükselen krem gradyan),
 *  • ısıyla açılan turuncu dış ışıma (`BlurMask`).
 *
 * İkisi de "eşiğe yaklaştın" sinyalini renkle söylüyordu ve ikonu kendi
 * renginden çıkarıyordu. Kapaktaki alev artık her ısıda Likes'taki, mağazadaki,
 * cam butondaki alevle AYNI renk; anlatan tek şey hareket (bkz. flameBurn >
 * WAVES). Geri isteyen, ısıyı okuyan bir `opacity` ile aynı path'in üstüne bir
 * katman daha çizsin — silüet zaten paylaşımlı.
 */

/**
 * İnce açık kenar — işi YALNIZCA okunurluk: fotoğrafın parlak yerinde silüetin
 * sınırını tutmak. Kalpteyken de aynı renk ve aynı kalınlıktı.
 *
 * Bir ara kutlama perdesindeki sıcak kreme (#ffd79e) çevrilmişti, gerekçe
 * "kartın alevi perdeninkiyle aynı elden çıkmış görünsün"di. GERİ ALINDI: ikon
 * her yerde aynı görünmeli ve kapaktaki alev, Likes'taki ya da mağazadaki
 * alevle aynı işaret. Konturun rengi bir ayrım yaratıyordu.
 *
 * Kalınlık 24'lük GRID biriminde (çizim grid'de, ölçek en dıştaki Group'ta).
 * Eski `Svg`'deki `strokeWidth={0.1}` da viewBox birimiydi, yani birebir aynı
 * çizgi.
 */
const OUTLINE_WIDTH = 0.1;

/** Parıltı bandının genişliği (grid birimi) — glyph 15 birim geniş. */
const SHIMMER_BAND = 26;

type Props = {
  /** İkonun kutusu — kapaktaki serbest alev için FIRE_SIZE. */
  size: number;
  /**
   * 0..1 yanma oranı: çekme ile basılı tutmadan hangisi büyükse o. Sahibi
   * SwipeCard (tek `useFrameCallback` hepsini sürüyor).
   */
  heat: SharedValue<number>;
  /** Titreşim saati, tur cinsinden. 1'de tam tur — sarması çağıranın işi. */
  phase: SharedValue<number>;
  /**
   * 0..1 MANDALLI büyüme: jest başlayınca 1'e açılıyor ve parmak kalkana kadar
   * orada kalıyor. Isıdan ayrı bir kanal, çünkü biri oran diğeri durum
   * (bkz. flameBurn > BURN_SCALE).
   */
  grow: SharedValue<number>;
  /**
   * Premium parıltısı. Desteki HER kart için açık bırakılırsa arkadaki kartlar
   * da her karede canvas tazeliyor; SwipeCard yalnız en üstteki için açıyor.
   */
  shimmer?: boolean;
};

export default function FireBurnCanvas({
  size,
  heat,
  phase,
  grow,
  shimmer = false,
}: Props) {
  // Kutu ikondan geniş: diller glyph'in tepesini aşıyor ve ışıma daha da
  // taşıyor (bkz. BURN_PAD_RATIO). Kırpan bir katman yok, dar kutu doğrudan
  // eksik alev demek.
  const pad = size * BURN_PAD_RATIO;
  const box = size + pad * 2;

  /**
   * Glyph BİR KEZ ayrıştırılıyor; çizim artık onu değil, ondan çıkan noktaları
   * kullanıyor. `MakeFromSVGString` null dönebilir (bozuk path) — o zaman boş
   * bir path kalıyor, ölçüm hiç kontur bulamıyor ve elimizde boş bir halka
   * kalıyor: ikon kaybolur ama kart çökmez.
   */
  const base = useMemo(
    () => Skia.Path.MakeFromSVGString(FLAME_PATH) ?? Skia.Path.Make(),
    [],
  );

  /** Dış hat, yay uzunluğuna göre örnekleniyor — BİR KEZ. */
  const contour = useMemo(() => {
    const ring: [number, number][] = [];
    // `forceClosed`: glyph zaten kapalı ama ölçüm kapalı kabul etsin ki son
    // örnek ile ilki arasındaki kenar da uzunluğa dahil olsun.
    const measure = Skia.ContourMeasureIter(base, true, 1).next();
    if (measure) {
      const total = measure.length();
      for (let i = 0; i < BURN_CONTOUR_POINTS; i++) {
        const [pos] = measure.getPosTan((i / BURN_CONTOUR_POINTS) * total);
        ring.push([pos.x, pos.y]);
      }
    }
    return buildBurnContour(ring);
  }, [base]);

  /**
   * O karenin silüeti — kurulum UI thread'inde.
   *
   * Faz kademelere yuvarlanıyor: dalga akmıyor, oynuyor (bkz.
   * BURN_FLICKER_FRAMES). Isı 0'da `burnPolygon` hiçbir noktayı oynatmıyor,
   * yani çıkan poligon ikonun dış hattının ta kendisi — ayrıca faz da
   * ilerlemediği için bu blok o durumda hiç yeniden çalışmıyor.
   */
  const burnPath = useDerivedValue(() => {
    const step =
      Math.floor(phase.value * BURN_FLICKER_FRAMES) / BURN_FLICKER_FRAMES;
    return Skia.Path.Make().addPoly(
      burnPolygon(contour, step, heat.value, grow.value),
      true,
    );
  });

  // Parıltı: 1.7 sn süpürüp 4.3 sn bekliyor (toplam 6 sn) — kalpteyken de aynı
  // ritimdeydi. Şerit ayrı bir katman değil, AYNI path'in üstünden geçen bir
  // gradyan: silüet oynadıkça parıltı da onunla kırpılıyor.
  const sweep = useSharedValue(0);
  useEffect(() => {
    if (!shimmer) {
      sweep.value = 0;
      return;
    }
    sweep.value = 0;
    sweep.value = withRepeat(
      withSequence(
        withTiming(1, { duration: 1700, easing: Easing.inOut(Easing.ease) }),
        withTiming(0, { duration: 0 }),
        withTiming(0, { duration: 4300 }),
      ),
      -1,
      false,
    );
  }, [shimmer, sweep]);

  const shimmerStart = useDerivedValue(() =>
    vec(-SHIMMER_BAND + sweep.value * (SHIMMER_BAND + 24), 0),
  );
  const shimmerEnd = useDerivedValue(() =>
    vec(sweep.value * (SHIMMER_BAND + 24), 24),
  );

  return (
    <View
      // Kutu ikonun kutusundan büyük olduğu için ONUN üstüne ortalanıyor;
      // dokunmayı ikonun kendi `TouchableOpacity`'si karşılıyor.
      pointerEvents="none"
      style={{
        position: "absolute",
        left: -pad,
        top: -pad,
        width: box,
        height: box,
      }}
    >
      <Canvas style={StyleSheet.absoluteFill}>
        {/* Çizim 24'lük GRID'de: flameBurn'ün bütün sayıları glyph'in kendi
            koordinatlarında, ölçek tek yerde. */}
        <Group
          transform={[
            { translateX: pad },
            { translateY: pad },
            { scale: size / 24 },
          ]}
        >
          {/* Marka dolgusu — kalpteyken de aynı gradyan ve aynı köşegen.
              Isıdan BAĞIMSIZ (bkz. yukarıdaki renk notu). */}
          <Path path={burnPath}>
            <LinearGradient
              start={vec(0, 0)}
              end={vec(24, 24)}
              colors={[...gradients.swipeHeart]}
            />
          </Path>

          {shimmer && (
            <Path path={burnPath}>
              <LinearGradient
                start={shimmerStart}
                end={shimmerEnd}
                colors={[
                  "rgba(255,255,255,0)",
                  "rgba(255,255,255,0.22)",
                  "rgba(255,255,255,0)",
                ]}
              />
            </Path>
          )}

          {/* İnce açık kenar (bkz. OUTLINE_WIDTH). `strokeJoin` yuvarlak:
              silüet poligon, yani köşeli birleşimlerde çizgi her örnekte
              dışarı doğru minik dikenler bırakıyor. */}
          <Path
            path={burnPath}
            style="stroke"
            strokeWidth={OUTLINE_WIDTH}
            strokeJoin="round"
            color={theme.swipeHeartBorder}
          />
        </Group>
      </Canvas>
    </View>
  );
}
