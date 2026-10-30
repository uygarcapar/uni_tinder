import { useEffect, useMemo, useState } from "react";
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
import {
  Easing,
  useDerivedValue,
  useSharedValue,
  withRepeat,
  withTiming,
} from "react-native-reanimated";
import { FLAME_PATH } from "@/shared/components/icons/FlameGlyph";
import { gradients } from "@/shared/theme/colors";
import {
  DEFAULT_APP_MODE,
  modeFireGradient,
  modeFlameOutline,
  type AppMode,
} from "../modeTheme";
import uiBus from "@/shared/services/uiBus";
import {
  buildFlameWave,
  flameCurtainGeometry,
  flameWaveGeometry,
  COVER_HOLD_LIMIT_MS,
  FLAME_WAVE_MS,
  FLICKER_FPS,
  FLICKER_FRAMES,
  HOLD_BREATHE_EXIT_MS,
  HOLD_BREATHE_MS,
  type FlameWaveGeometry,
  type WaveApi,
} from "./flameWavePath";
import type { SharedValue } from "react-native-reanimated";

/** Dalga geçerken hafif yalpalasın — katı bir blok gibi kaymasın. */
const SWAY_PX = 7;

/** Dalganın o andaki ötelemesi: yol boyunca ilerleme + yalpalama. */
function waveOffset(p: number, startY: number, endY: number) {
  "worklet";
  return {
    y: startY + (endY - startY) * p,
    x: Math.sin(p * 7.5) * SWAY_PX,
  };
}

/**
 * Kontur — "kenarları belli" olsun diye. Fotoğraf üstünde okunan düşük
 * kontrastlı kenar. Rengi MODA GÖRE: Flört'te sıcak krem, Arkadaş'ta soluk
 * nane (bkz. modeTheme > modeFlameOutline). İkisi de MEDYA rengi — perde her
 * temada aynı çiziliyor, o yüzden palet token'ı değil sabit.
 */
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
 * kurulum — ve aynı oturumdaki sonraki Fire'lar bedava.
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
  // düşürürdü. Kutlamanın atlanması kabul — Fire akışı buna bağlı değil.
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
 * oranı) sürmek ÇAĞIRANA ait: Fire baştan sona süpürüyor, eşleşme
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
  breathe,
  breatheSpan = 0,
  parked = false,
  mode = DEFAULT_APP_MODE,
}: {
  wave: Wave;
  width: number;
  progress: SharedValue<number>;
  /**
   * Parkın nefesi, 0..1 — `progress`in ÜSTÜNE binen AYRI kanal.
   *
   * ⚠️ NEDEN AYRI: nefes bir tur doğrudan `progress`i sürüyordu ve çıkışın
   * süresi "kalan yol" olarak `progress.value` JS'ten OKUNARAK hesaplanıyordu.
   * O okuma bayat: Reanimated'ın native mutable'ı her runtime için ayrı bir
   * değer kapanışı tutuyor ve animasyonu UI runtime'ı sürüyor, yani JS tarafı
   * kendisine son yazılan şeyi görüyor (bir sayı değil, animasyon tanımı).
   * Süre çöp çıkıyor, dalga da ya ışınlanıyor ya sürünüyordu.
   *
   * Kanal ayrılınca `progress` park boyunca TAM OLARAK `coverProgress`te
   * duruyor → çıkış süresi sabit ve bilinir (`FLAME_WAVE_MS - coverMs`), yani
   * orijinal süpürmenin ikinci yarısının birebir aynısı. Okumaya gerek yok.
   */
  breathe?: SharedValue<number>;
  /** Nefesin ilerlemedeki genliği (`holdCeilProgress - coverProgress`). */
  breatheSpan?: number;
  /**
   * Dalga, kart değişimini bekleyerek park ediyor mu (bkz. FireFlameCanvas'ın
   * park fazı). Park boyunca titreşim DURUYOR — gerekçe aşağıda.
   */
  parked?: boolean;
  /** Alevin rengi — Flört ateşi / Arkadaş Spark'ı. */
  mode?: AppMode;
}) {
  // Titreşim karesi. Bunun için React state'i yeterli: dalga boyunca ~18 render
  // oluyor, 60 fps'lik öteleme ise React'e hiç uğramıyor.
  const [tick, setTick] = useState(0);
  useEffect(() => {
    /**
     * ── PARKTA TİTREŞİM YOK, BİLEREK ──────────────────────────────────────
     *
     * Park tam o anda yeni kartın React commit'ini bekliyor, yani JS thread'i
     * tıkanmak ÜZERE. Saniyede 14 render oraya ekleyecek en son şey; aralık
     * zaten tıkanma sırasında ya gecikir ya hiç koşmaz, üstelik commit'i de
     * yavaşlatır.
     *
     * CANLILIK KAYBOLMUYOR, yerini UI thread'ine bırakıyor: park, ilerlemeyi
     * nefes gibi gidip getirerek 60 fps'te oynuyor (ve `waveOffset`in yalpası
     * da ilerlemeden türüyor, yani şerit yanal olarak da salınıyor). Donuk
     * görünen bir park ile tıkanmış bir JS thread'i aynı anda olurdu.
     */
    if (parked) return;
    const id = setInterval(
      () => setTick((v) => v + 1),
      Math.round(1000 / FLICKER_FPS),
    );
    return () => clearInterval(id);
  }, [parked]);

  const { startY, endY, tongueHeight, bandHeight } = wave;

  const transform = useDerivedValue(() => {
    // Nefes toplamsal: park dışında `breathe` sıfır, yani süpürme etkilenmiyor.
    // Üst ucu geometriden sınırlı (holdCeilProgress ≤ uncoverProgress), o yüzden
    // hiçbir fazda kaplamanın dışına çıkmıyor.
    const p = progress.value + (breathe ? breathe.value * breatheSpan : 0);
    const o = waveOffset(p, startY, endY);
    return [{ translateY: o.y }, { translateX: o.x }];
  }, [startY, endY, breatheSpan]);

  const path = frameAt(wave, tick, width);
  if (!path) return null;

  return (
    <View pointerEvents="none" style={StyleSheet.absoluteFill}>
      <Canvas style={StyleSheet.absoluteFill}>
        <Group transform={transform}>
          <Path path={path}>
            {/* İkonun kendi gradyanı: uçlarda koyu, aşağı indikçe parlak —
                rozet ve Fire/Spark kalbiyle AYNI token (modeFireGradient). */}
            <LinearGradient
              start={vec(0, -tongueHeight)}
              end={vec(width, bandHeight * 0.55)}
              colors={[...modeFireGradient(mode)]}
            />
          </Path>
          <Path
            path={path}
            style="stroke"
            strokeWidth={OUTLINE_WIDTH}
            strokeJoin="round"
            strokeCap="round"
            color={modeFlameOutline(mode)}
          />
        </Group>
      </Canvas>
    </View>
  );
}

export default function FireFlameCanvas({
  mode,
  hold,
}: {
  mode?: AppMode;
  /**
   * Dalga, ekranı tam kapattığı yerde PARK ETSİN mi (bkz. flameSweep >
   * runFlameSweep'in `hold` notu). Park, kart değişiminin dalganın arka
   * kenarından sırıtmasını yapısal olarak bitiriyor; bedeli kutlamanın
   * değişim bitene kadar uzaması (tavansız — bkz. COVER_HOLD_LIMIT_MS).
   */
  hold?: boolean;
} = {}) {
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
  /** Parkın nefesi, 0..1 — ayrı kanal (gerekçe FlameWaveLayer'ın prop'unda). */
  const breathe = useSharedValue(0);
  const { coverMs, coverProgress, holdCeilProgress } = wave;
  const breatheSpan = holdCeilProgress - coverProgress;
  /** Park sürüyor mu — titreşimi duraklatan bayrak (bkz. FlameWaveLayer). */
  const [parked, setParked] = useState(false);
  useEffect(() => {
    progress.value = withTiming(
      // Park edecekse ilk faz yalnız örtme noktasına kadar sürülüyor; kalan yol
      // salıverilince (aşağıdaki effect) tamamlanıyor.
      hold ? coverProgress : 1,
      {
        duration: hold ? coverMs : FLAME_WAVE_MS,
        // Süpürme hissi için ivmelenmeye gerek yok: giriş ve çıkış zaten ekran
        // dışında oluyor, ease sadece ortadaki geçişi yavaşlatırdı. Doğrusal
        // olması parkın da şartı: iki fazın ekleme yerinde hız değişmiyor.
        easing: Easing.linear,
      },
    );
    // Kart değişimi bu ana KİLİTLİ (bkz. flameSweep — Fire de not da):
    // dalga ekranı tam kapatınca deste ilerliyor, kullanıcı değişimi görmüyor.
    //
    // Sayaç OLAY anında değil, dalganın gerçekten başladığı yerde kuruluyor:
    // ilk kutlamada bu bileşen lazy chunk çözülene kadar mount olmuyor (yüz
    // ms'yi bulabilir). Olaydan sayılsaydı değişim, alev daha ekranın
    // yarısındayken açıkta yapılırdı.
    const cover = setTimeout(() => uiBus.emit("flameSweepCover"), coverMs);
    return () => clearTimeout(cover);
  }, [progress, coverMs, coverProgress, hold]);

  /**
   * ── İKİNCİ FAZ: PARKTAN ÇIKIŞ ─────────────────────────────────────────────
   *
   * `hold` yokken bu effect hiç kurulmuyor ve yukarıdaki TEK `withTiming` aynen
   * eskisi gibi çalışıyor — iki fazın ekleme yeri (farklı karelerde kurulan iki
   * animasyon) beklemeyen çağıranlara bir karelik takılma riski bindirmesin.
   *
   * Tavan ŞART: salıverecek kimse çıkmazsa (beklenmeyen bir dal, çağıran
   * ağaçtan düştü) dalga ekranın ortasında asılı kalırdı. Sayaç örtme anından
   * DEĞİL mount'tan sayıyor, yukarıdaki `cover` sayacıyla aynı saati paylaşsın.
   */
  useEffect(() => {
    if (!hold) return;
    let valve: ReturnType<typeof setTimeout> | null = null;
    /** Park başladı mı — erken gelen salıverme buna bakıyor. */
    let armed = false;
    /** Salıverme park başlamadan geldi: park açılır açılmaz çıkılacak. */
    let wanted = false;
    let left = false;

    const leave = () => {
      if (left) return;
      left = true;
      unsub();
      if (valve) clearTimeout(valve);
      valve = null;
      setParked(false);
      // Nefesi sıfıra çek: yukarı süpürmeyi TEK kaynak (progress) sürsün.
      breathe.value = withTiming(0, { duration: HOLD_BREATHE_EXIT_MS });
      /**
       * ── ÇIKIŞ SABİT SÜRELİ: ORİJİNAL SÜPÜRMENİN İKİNCİ YARISI ─────────
       *
       * `progress` park boyunca TAM OLARAK `coverProgress`te durduğu için
       * (nefes ayrı kanalda) kalan yol bilinir: `FLAME_WAVE_MS - coverMs`.
       * Yani dalga, hiç park etmemiş gibi aynı hızla yukarı süpürüp çıkıyor ve
       * alt kenarın alev dilleri ekranı baştan aşağı geçiyor.
       *
       * ⚠️ BURADA `progress.value` OKUNMAZ. Bir tur "kalan yolu oku, süreyi
       * ona göre ver" denendi ve BOZDU: Reanimated'ın native mutable'ı her
       * runtime için ayrı değer kapanışı tutuyor, animasyonu UI runtime'ı
       * sürüyor; JS tarafından okunan şey bayat. Süre çöp çıkıyor ve dalga
       * "bir anda yok oluyor" (ya da sürünüyor).
       */
      progress.value = withTiming(1, {
        duration: FLAME_WAVE_MS - coverMs,
        easing: Easing.linear,
      });
    };

    /**
     * Salıverme park BAŞLAMADAN gelebiliyor: örtme olayı ile park aynı gecikmeli
     * iki sayaç ve araya React'in commit'i + bir rAF giriyor (bkz.
     * DiscoverScreen > tryReleaseFlame). Bir tur bu durumda olay YUTULUYORDU ve
     * park, salıverecek kimse kalmadığı için 8 saniyelik valfe kadar bekliyordu
     * — "ekran kapanıyor, öyle bekliyor" tam buydu.
     *
     * Artık HATIRLANIYOR: hemen uygulamak dalgayı yarı yolda hızlandırırdı, o
     * yüzden bayrak bırakılıyor ve park açıldığı anda çıkışa geçiliyor.
     */
    const unsub = uiBus.on("flameSweepRelease", () => {
      if (armed) leave();
      else wanted = true;
    });

    const arm = setTimeout(() => {
      armed = true;
      // Beklenen haber çoktan gelmiş: park etmeye hiç gerek yok, dalga
      // doğrudan yoluna devam ediyor (devir zaten örtünün altında oldu).
      if (wanted) {
        leave();
        return;
      }
      setParked(true);
      /**
       * ── PARKIN NEFESİ: CANLILIK UI THREAD'İNDE ────────────────────────
       *
       * Park, "bekliyorum" demenin GÖRÜNEN hâli olmak zorunda: beklediğimiz
       * şey JS'in tıkanması ve titreşim de JS'e bağlı (bkz. FlameWaveLayer),
       * yani donuk bir resim bırakmak tam da en kötü anda olurdu.
       *
       * `withRepeat(..., -1, true)`: nefes 0↔1 arasında gidip geliyor ve
       * transform'da `breatheSpan` ile ölçeklenip ilerlemenin ÜSTÜNE biniyor.
       * Genliğin üst ucu `holdCeilProgress`, o da geometriden kaplamanın
       * içinde kalacak şekilde türüyor — nefes hiçbir fazda kartı açığa
       * çıkarmıyor. Hareket UI thread'inde: React'in kaç kez render olduğu
       * onu ilgilendirmiyor.
       *
       * `Easing.inOut`: uçlarda yavaşlayıp dönüyor, yani "ileri geri sürülen
       * bir şerit" değil nefes gibi okunuyor.
       */
      if (breatheSpan > 0) {
        breathe.value = withRepeat(
          withTiming(1, {
            duration: HOLD_BREATHE_MS,
            easing: Easing.inOut(Easing.sin),
          }),
          -1,
          true,
        );
      }
      // EMNİYET VALFİ, tavan DEĞİL (bkz. flameWavePath > COVER_HOLD_LIMIT_MS):
      // buraya gelmek "salıverecek kimse çıkmadı" demek, yani bir hata — işi
      // ekranı sonsuza kadar kaplı bırakmamak.
      valve = setTimeout(leave, COVER_HOLD_LIMIT_MS);
    }, coverMs);

    return () => {
      left = true;
      clearTimeout(arm);
      unsub();
      if (valve) clearTimeout(valve);
    };
  }, [progress, breathe, coverMs, breatheSpan, hold]);

  return (
    <FlameWaveLayer
      wave={wave}
      width={width}
      progress={progress}
      breathe={breathe}
      breatheSpan={breatheSpan}
      parked={parked}
      mode={mode}
    />
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
export function FlameCurtainCanvas({
  closing,
  mode,
}: {
  closing?: boolean;
  /**
   * Eşleşmenin modu — perde Flört'te kırmızı, Arkadaş'ta yeşil.
   *
   * ⚠️ DEĞER BİLDİRİM PAYLOAD'INDAN GELMEK ZORUNDA, ekrandaki seçili moddan
   * DEĞİL: eşleşme kullanıcı diğer moddayken, arka plandayken ya da mod
   * tercihi diskten okunmadan önce gelebilir (bkz. MatchModal).
   */
  mode?: AppMode;
}) {
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

  return (
    <FlameWaveLayer wave={wave} width={width} progress={progress} mode={mode} />
  );
}
