import React, { useEffect, useMemo, useState } from "react";
import { StyleSheet, View, useWindowDimensions } from "react-native";
import {
  Canvas,
  Group,
  LinearGradient,
  Path,
  PathOp,
  Skia,
  vec,
  type SkPath,
} from "@shopify/react-native-skia";
import Animated, {
  Easing,
  Extrapolation,
  interpolate,
  useAnimatedStyle,
  useDerivedValue,
  useSharedValue,
  withTiming,
} from "react-native-reanimated";
import { FLAME_PATH } from "@/shared/components/icons/FlameGlyph";
import PremiumFlame from "@/shared/components/PremiumFlame";
import { gradients } from "@/shared/theme/colors";
import uiBus from "@/shared/services/uiBus";
import {
  buildFlameWave,
  flameCurtainGeometry,
  flameWaveGeometry,
  FLAME_WAVE_MS,
  FLICKER_FPS,
  FLICKER_FRAMES,
  type FlameWaveGeometry,
  type WaveApi,
} from "./flameWavePath";
import type { SharedValue } from "react-native-reanimated";

/** Dalga geçerken hafif yalpalasın — katı bir blok gibi kaymasın. */
const SWAY_PX = 7;

/** Kontur — "kenarları belli" olsun diye. Fotoğraf üstünde okunan sıcak krem. */
const OUTLINE = "#FFD79E";
const OUTLINE_WIDTH = 5;

const skiaApi: WaveApi<SkPath> = {
  fromSVG: (d) => Skia.Path.MakeFromSVGString(d)!,
  empty: () => Skia.Path.Make(),
  addRect: (p, x, y, w, h) => {
    p.addRect(Skia.XYWHRect(x, y, w, h));
  },
  // 3x3 satır öncelikli veriliyor: Matrix'in translate/scale/skew sıralaması
  // (pre- mi post- mi) sürümler arası kaygan, açık matris tek anlamlı.
  transform: (p, m) => {
    p.transform(m);
  },
  union: (dst, src) => {
    dst.op(src, PathOp.Union);
  },
  difference: (dst, src) => {
    dst.op(src, PathOp.Difference);
  },
  offset: (p, dx, dy) => {
    p.offset(dx, dy);
  },
};

interface Wave extends FlameWaveGeometry {
  frames: (SkPath | null)[];
}

/**
 * Silüetler ekran ölçüsü başına önbelleklenir ve İLK İSTENDİKLERİNDE kurulur.
 *
 * Hepsini mount'ta kurmak ~10 karelik bir takılma demekti (tek kurulum ~1.4 ms).
 * Tembel kurulumla maliyet titreşim hızına (14 fps) yayılıyor — kare başına bir
 * kurulum — ve aynı oturumdaki sonraki süper beğeniler bedava.
 */
const CACHE = new Map<string, Wave>();

function getWave(width: number, height: number): Wave {
  const key = `${width}x${height}`;
  const hit = CACHE.get(key);
  if (hit) return hit;

  const wave: Wave = {
    frames: new Array(FLICKER_FRAMES).fill(null),
    ...flameWaveGeometry(width, height),
  };
  CACHE.set(key, wave);
  return wave;
}

function frameAt(wave: Wave, index: number, width: number): SkPath | null {
  const i = ((index % FLICKER_FRAMES) + FLICKER_FRAMES) % FLICKER_FRAMES;
  const cached = wave.frames[i];
  if (cached) return cached;
  // Path kurulumu render sırasında çalışıyor: glyph ayrıştırılamaz ya da bir
  // path op'u başarısız olursa fırlatılan hata KUTLAMA yüzünden tüm ağacı
  // düşürürdü. Kutlamanın atlanması kabul — süper beğeni akışı buna bağlı değil.
  try {
    const built = buildFlameWave(skiaApi, {
      glyph: FLAME_PATH,
      width,
      bandHeight: wave.bandHeight,
      tongueHeight: wave.tongueHeight,
      phase: i / FLICKER_FRAMES,
    });
    wave.frames[i] = built;
    return built;
  } catch {
    return null;
  }
}

/**
 * Dalganın ÇİZİMİ — tab bar'daki Keşfet alev ikonundan üretilmiş, ekranı
 * alttan yukarı süpüren bir alev şeridi. İlerlemeyi (0..1, tam süpürmenin
 * oranı) sürmek ÇAĞIRANA ait: süper beğeni baştan sona süpürüyor, eşleşme
 * perdesi yolun bir yerinde durup bekliyor (aşağıdaki iki bileşen).
 *
 * Prosedürel ateş shader'ı (fbm türbülansı, ısı rampası, kıvılcım) denendi ve
 * fazla detaylıydı; sadeleştirilmiş gradyan sürümü de ekranda çok duruyordu.
 * Bu sürüm ikonun kendi silüetini kullanıyor: glyph'ler birleştirilip TEK bir
 * şekle indirgeniyor, o yüzden tek bir dış kontur çizilebiliyor — "doodle"
 * hissi buradan geliyor.
 *
 * İki ayrı hız var, bilerek:
 *  • ÖTELEME 60 fps, tamamen UI thread'inde (withTiming) — süpürme akıcı olmalı
 *    ve JS thread'i takılsa bile (ör. ilk kutlamada silüetler kuruluyorken)
 *    etkilenmemeli.
 *  • UÇLARIN OYNAMASI 14 fps, silüet değiştirerek — hem şekli her karede
 *    yeniden kurmak pahalı, hem de elle çizilmiş alev döngülerinin dili bu.
 */
function FlameWaveLayer({
  wave,
  width,
  progress,
  children,
}: {
  wave: Wave;
  width: number;
  progress: SharedValue<number>;
  /** Alevin ÜSTÜNE çizilecekler. Silüet kurulamazsa bunlar da çizilmiyor:
   *  alevsiz kalan beyaz bir yazı kart fotoğrafının üstünde okunmaz. */
  children?: React.ReactNode;
}) {
  // Titreşim karesi. Bunun için React state'i yeterli: dalga boyunca ~18 render
  // oluyor, 60 fps'lik öteleme ise React'e hiç uğramıyor.
  const [tick, setTick] = useState(0);
  useEffect(() => {
    const id = setInterval(
      () => setTick((v) => v + 1),
      Math.round(1000 / FLICKER_FPS),
    );
    return () => clearInterval(id);
  }, []);

  const { startY, endY, tongueHeight, bandHeight } = wave;

  const transform = useDerivedValue(() => {
    const p = progress.value;
    return [
      { translateY: startY + (endY - startY) * p },
      { translateX: Math.sin(p * 7.5) * SWAY_PX },
    ];
  }, [startY, endY]);

  const path = frameAt(wave, tick, width);
  if (!path) return null;

  return (
    <View pointerEvents="none" style={StyleSheet.absoluteFill}>
      <Canvas style={StyleSheet.absoluteFill}>
        <Group transform={transform}>
          <Path path={path}>
            {/* İkonun kendi gradyanı (gradients.swipeHeart): uçlarda kırmızı,
                aşağı indikçe turuncu — rozet ve süper beğeni kalbiyle aynı. */}
            <LinearGradient
              start={vec(0, -tongueHeight)}
              end={vec(width, bandHeight * 0.55)}
              colors={[...gradients.swipeHeart]}
            />
          </Path>
          <Path
            path={path}
            style="stroke"
            strokeWidth={OUTLINE_WIDTH}
            strokeJoin="round"
            strokeCap="round"
            color={OUTLINE}
          />
        </Group>
      </Canvas>
      {children}
    </View>
  );
}

/** İşaretin açılıp kapanma payı — ilerleme (0..1) cinsinden ~200 ms. */
const MARK_FADE = 200 / FLAME_WAVE_MS;

/** Ortadaki rozetin boyu. Rozetin kendi ölçüsünün (26) çok üstünde: burada
 *  isim yanındaki küçük nişan değil, kutlamanın tek görsel odağı. */
const MARK_SIZE = 72;

/**
 * Kutlamanın ortadaki işareti: dalganın üstünde, ekranın tam ortasında duran
 * premium alev rozeti (bkz. PremiumFlame).
 *
 * DÜZ BEYAZ çiziliyor, kendi gradyanıyla değil: rozetin dolgusu
 * `gradients.swipeHeart` ve dalganın dolgusu da aynı gradyan — üst üste
 * geldiklerinde rozet ateşin içinde kayboluyor. PremiumFlame'in `color`
 * kaçışı zaten tam bu durum için var (lit plus kartında da öyle kullanılıyor).
 *
 * Görünürlük SÜREYE değil GEOMETRİYE bağlı — işaret yalnız ekranın ortası
 * kesintisiz şeridin arkasındayken açılıyor (centerIn..centerOut). Sabit bir
 * gecikmeyle açılsaydı, dalganın ortayı ne zaman kapattığı ekran boyuna göre
 * değiştiği için kısa ekranda geç, uzun ekranda erken kalırdı; erken kalanı
 * beyaz rozeti kartın fotoğrafı üstüne koymak demek.
 *
 * Opaklık aynı `progress`ten türüyor, yani tamamen UI thread'inde: JS takılsa
 * bile işaret dalgadan kopmuyor.
 */
function SweepMark({
  progress,
  centerIn,
  centerOut,
}: {
  progress: SharedValue<number>;
  centerIn: number;
  centerOut: number;
}) {
  // Pencere dar kalırsa (aşırı geniş ekran) sabit pay iki ucu birbirine
  // geçirir ve işaret hiç tam açılmaz — payı pencerenin üçte biriyle sınırla.
  const fade = Math.min(MARK_FADE, (centerOut - centerIn) / 3);

  const style = useAnimatedStyle(
    () => ({
      opacity: interpolate(
        progress.value,
        [centerIn, centerIn + fade, centerOut - fade, centerOut],
        [0, 1, 1, 0],
        Extrapolation.CLAMP,
      ),
    }),
    [centerIn, centerOut, fade],
  );

  return (
    <Animated.View style={[StyleSheet.absoluteFill, styles.markWrap, style]}>
      <PremiumFlame size={MARK_SIZE} color="#FFFFFF" />
    </Animated.View>
  );
}

const styles = StyleSheet.create({
  markWrap: {
    alignItems: "center",
    justifyContent: "center",
  },
});

export default function SuperLikeFlameCanvas() {
  // Modül seviyesinde Dimensions.get() DEĞİL: iPad split-view'da pencere
  // yeniden boyutlandığında o değer bayatlar. Hook her mount'ta güncelini verir.
  const { width, height } = useWindowDimensions();
  const wave = useMemo(() => getWave(width, height), [width, height]);

  // İlerleme 0→1. Saati ELLE tutmuyoruz (useFrameCallback + timeSinceFirstFrame):
  // o hook'un useEffect bağımlılığı callback'in KENDİSİ, satır içi arrow her
  // render'da yeni referans → aşağıdaki 14 fps'lik titreşim render'ı frame
  // callback'i saniyede 14 kez yeniden kaydediyor, timeSinceFirstFrame her
  // seferinde sıfırlanıyordu. Dalga alttan birkaç piksel çıkıp geri sıçrıyor,
  // hiç ilerlemiyordu. withTiming UI thread'inde kendi başına dönüyor;
  // React'in kaç kez render olduğu onu ilgilendirmiyor.
  const progress = useSharedValue(0);
  const { coverMs } = wave;
  useEffect(() => {
    progress.value = withTiming(1, {
      duration: FLAME_WAVE_MS,
      // Süpürme hissi için ivmelenmeye gerek yok: giriş ve çıkış zaten ekran
      // dışında oluyor, ease sadece ortadaki geçişi yavaşlatırdı.
      easing: Easing.linear,
    });
    // Kart değişimi bu ana KİLİTLİ (bkz. flameSweep — süper beğeni de not da):
    // dalga ekranı tam kapatınca deste ilerliyor, kullanıcı değişimi görmüyor.
    //
    // Sayaç OLAY anında değil, dalganın gerçekten başladığı yerde kuruluyor:
    // ilk kutlamada bu bileşen lazy chunk çözülene kadar mount olmuyor (yüz
    // ms'yi bulabilir). Olaydan sayılsaydı değişim, alev daha ekranın
    // yarısındayken açıkta yapılırdı.
    const cover = setTimeout(() => uiBus.emit("flameSweepCover"), coverMs);
    return () => clearTimeout(cover);
  }, [progress, coverMs]);

  return (
    <FlameWaveLayer wave={wave} width={width} progress={progress}>
      <SweepMark
        progress={progress}
        centerIn={wave.centerIn}
        centerOut={wave.centerOut}
      />
    </FlameWaveLayer>
  );
}

/**
 * Aynı dalganın PERDE hâli — eşleşme kutlaması (bkz. MatchModal).
 *
 * Fark tek şeyde: ilerleme 1'e kadar değil, `restProgress`e kadar sürülüyor ve
 * orada bekliyor; ekran kaplı, gövdenin alt kenarı ekranın dibinin biraz
 * üstünde. `closing` ile kalan yol tamamlanıp perde üstten çıkıyor.
 *
 * Yerleşim ve süreler Skia'sız modülde (flameCurtainGeometry): modal, bu chunk
 * hiç yüklenemese bile aynı sayılarla kendi içeriğini zamanlıyor.
 */
export function FlameCurtainCanvas({ closing }: { closing?: boolean }) {
  const { width, height } = useWindowDimensions();
  const wave = useMemo(() => getWave(width, height), [width, height]);
  const curtain = useMemo(
    () => flameCurtainGeometry(width, height),
    [width, height],
  );

  const progress = useSharedValue(0);
  const { restProgress, enterMs, exitMs } = curtain;

  useEffect(() => {
    // Çıkış sürerken ekran döndürülürse (ölçüler değişir → bu efekt yeniden
    // kurulur) perdeyi geri aşağı çekmesin.
    if (closing) return;
    progress.value = withTiming(restProgress, {
      duration: enterMs,
      // Süpürmenin aksine perde DURUYOR: sabit hızla gelip "pat" diye kesilmesin
      // diye yavaşlayarak oturuyor.
      easing: Easing.out(Easing.quad),
    });
  }, [closing, progress, restProgress, enterMs]);

  useEffect(() => {
    if (!closing) return;
    // Duruştan hızlanarak çıkış — girişin aynadaki hâli.
    progress.value = withTiming(1, {
      duration: exitMs,
      easing: Easing.in(Easing.quad),
    });
  }, [closing, progress, exitMs]);

  return <FlameWaveLayer wave={wave} width={width} progress={progress} />;
}
