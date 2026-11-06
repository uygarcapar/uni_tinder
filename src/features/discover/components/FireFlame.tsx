import { useEffect, useRef, useState } from "react";
import { InteractionManager, useWindowDimensions } from "react-native";
import uiBus from "@/shared/services/uiBus";
import LazyChunkBoundary from "@/shared/components/LazyChunkBoundary";
// Süre canvas ile PAYLAŞILAN modülden geliyor: elle kopyalanan iki sabit olarak
// tutulduğunda biri güncellenip diğeri bayat kalmıştı.
import {
  COVER_HOLD_LIMIT_MS,
  FLAME_WAVE_MS,
} from "@/features/discover/components/flameWavePath";
/**
 * ── CANVAS ARTIK LAZY CHUNK'TA DEĞİL (2026-10-16) ───────────────────────────
 *
 * Burada `lazyChunk(() => import("./FireFlameCanvas"))` vardı; gerekçe
 * "Skia'nın JS modülü ağır, kök ağaçta statik import her cold start'ta
 * bedavaya evaluate eder"di. GEREKÇE GEÇERSİZ: AppNavigator → TabNavigator →
 * profileTabAvatar zinciri Skia'yı ZATEN statik import ediyor, yani modül her
 * cold start'ta ana bundle'da evaluate ediliyor. Erteleme hiçbir şey
 * kazandırmıyordu.
 *
 * Karşılığında ÖDENEN bedel ağırdı: chunk isteği patlarsa lazyChunk reddi
 * promise seviyesinde yutuyor ve bileşen sessizce `null` çiziyor — kutlama
 * kayboluyor, deste FireFlame'in yedek `flameSweepCover` zamanlayıcısıyla yine
 * ilerliyor, yani hata hiçbir yere YANSIMIYOR. Dev'de bu teorik değil: Metro'nun
 * HMR soketi bir kez düştükten sonra o oturumdaki her chunk isteği patlıyor
 * (bkz. lazyChunk'taki not) ve alev uygulama reload edilene kadar bir daha
 * görünmüyor. "Beğeni/geç/Fire/not atıyorum, alev gelmiyor" tam bu.
 *
 * LazyChunkBoundary DURUYOR: kapsamı chunk değil, canvas'ın KENDİ render'ında
 * çıkan hata (Skia path'i kurulamadı) — kutlama atlanır, ekran gitmez.
 */
import FlameCanvas, {
  FlameWarmCanvas,
  prewarmFlameWave,
} from "@/features/discover/components/FireFlameCanvas";
import { isAppMode, type AppMode } from "@/features/discover/modeTheme";

/**
 * Kart değişimini bekleten taraf (bkz. flameSweep) "flameSweepCover" olayını
 * dinliyor ve onu normalde CANVAS yayınlıyor — kendi animasyon saatinden, tam
 * ekranı kapattığı anda. Canvas hiç çizemezse (Skia path'i kurulamadı, render
 * boundary'ye düştü) o olay hiç gelmez ve kart sonsuza kadar askıda kalırdı.
 * Bu yüzden olayı burada da, geniş bir gecikmeyle, yedek olarak yayınlıyoruz:
 * kutlama atlanabilir, deste durmaz.
 */
const COVER_FALLBACK_MS = FLAME_WAVE_MS + 500;

/**
 * ── PARK EDEN DALGANIN SÖKÜLMESİ SABİT BİR SÜREYE BAĞLANAMAZ ───────────────
 *
 * Park TAVANSIZ (bkz. flameWavePath > COVER_HOLD_LIMIT_MS — oradaki sayı bir
 * tavan değil emniyet valfi), yani kutlamanın ne kadar süreceği mount anında
 * BİLİNMİYOR. Sabit bir sayaç ya parkın ortasına düşüp dalgayı ekranda "pat"
 * diye yok eder ya da valf kadar (saniyeler) boşta canvas taşır.
 *
 * Çözüm: bekleyen koşularda sayaç mount'ta DEĞİL SALIVERMEDE kuruluyor. O
 * andan sonra kalan iş belli — dalganın çekilişi (en fazla bütün süpürme
 * kadar) + aynı pay.
 */
const RELEASE_TEARDOWN_MS = FLAME_WAVE_MS + 400;

/**
 * Isıtmanın başlangıcı: açılışın etkileşimleri bittikten SONRA bu kadar daha
 * bekle — cold start'ın kendi işi (ilk deste, fotoğraflar) önce bitsin.
 */
const PREWARM_DELAY_MS = 1500;
/**
 * Görünmez ısıtma katmanının ağaçta kalma süresi — birkaç titreşim karesi
 * (14 fps'te ~10 kare) çizilsin, yani drawable takası da ısınsın.
 */
const SHADER_WARM_MS = 700;

/**
 * Fire kutlaması: ekranı alttan yukarı süpüren alev dalgası (bkz.
 * FireFlameCanvas). Eskiden burada kalp ikonundan süzülen renkli kalp
 * parçacıkları vardı.
 *
 * Bu dosya bilerek "hafif": yalnız uiBus'ı dinler, dalga süresince canvas'ı
 * mount edip sonra söker. Boşta hiçbir animasyon/frame callback dönmüyor.
 */
export default function FireFlame() {
  // `hold` ve `mode` ÇALIŞMAYLA BİRLİKTE tek state'te: ayrı tutulsalar canvas
  // bir render boyunca yeni key ile ama eski/bayat değerlerle mount olabilirdi
  // (Arkadaş'ta verilen kararın alevi bir kare Flört kırmızısı yanardı).
  const [run, setRun] = useState<{
    id: number;
    hold: boolean;
    mode?: AppMode;
  } | null>(null);
  const seq = useRef(0);

  /**
   * ── İLK KUTLAMANIN BEDELİ BOŞTA ÖDENİYOR (2026-11-06) ──────────────────
   *
   * Oturumun ilk alevinde iki şey dalganın İÇİNE düşüyordu: on silüetin JS'te
   * kurulması (PathOp birleşimleri) ve Skia'nın çizim programlarını ilk kez
   * derlemesi. İkisi de burada, açılış sakinleştikten sonra yapılıyor (bkz.
   * prewarmFlameWave · FlameWarmCanvas). Ekran ölçüsü değişirse (iPad
   * split-view) yeni ölçü için yeniden ısıtılıyor.
   */
  const { width, height } = useWindowDimensions();
  const [shaderWarm, setShaderWarm] = useState(false);
  useEffect(() => {
    let cancelBuild: (() => void) | undefined;
    let delay: ReturnType<typeof setTimeout> | undefined;
    let unwarm: ReturnType<typeof setTimeout> | undefined;
    const task = InteractionManager.runAfterInteractions(() => {
      delay = setTimeout(() => {
        cancelBuild = prewarmFlameWave(width, height);
        setShaderWarm(true);
        unwarm = setTimeout(() => setShaderWarm(false), SHADER_WARM_MS);
      }, PREWARM_DELAY_MS);
    });
    return () => {
      task.cancel();
      if (delay) clearTimeout(delay);
      if (unwarm) clearTimeout(unwarm);
      cancelBuild?.();
      setShaderWarm(false);
    };
  }, [width, height]);

  useEffect(() => {
    let timer: ReturnType<typeof setTimeout> | undefined;
    let fallback: ReturnType<typeof setTimeout> | undefined;
    /** Bu koşu salıvermeyi bekliyor mu — sökme sayacı o zamana erteli. */
    let holding = false;
    const unsub = uiBus.on(
      "flameSweep",
      (payload?: { hold?: boolean; mode?: AppMode }) => {
      const hold = !!payload?.hold;
      // Bilinmeyen/eksik mod canvas'ın kendi varsayılanına (Dating) düşsün —
      // `isAppMode` kapısı, uiBus tipsiz olduğu için.
      const mode = isAppMode(payload?.mode) ? payload.mode : undefined;
      holding = hold;
      // Üst üste kutlamalarda YENİ key veriliyor: canvas remount olur, dalga
      // baştan başlar. Aynı key kalsaydı ikinci alev, birincinin ekranı terk
      // etme fazının ortasında görünürdü.
      setRun({ id: seq.current++, hold, mode });
      if (timer) clearTimeout(timer);
      if (fallback) clearTimeout(fallback);
      // Pay bilerek geniş: sayaç OLAY anında başlıyor, animasyon ise canvas
      // mount olup efekt çalıştığında (ilk kutlamada silüetler de kuruluyor).
      // Dar payla ilk kutlamada dalga bitmeden sökülebiliyordu. Fazladan
      // bekleyen canvas boşta duruyor — animasyonu bitmiş, çizimi ekran dışı.
      //
      // Bekleyen koşuda sayaç EN KÖTÜ HÂLE kuruluyor (park valfi dolar +
      // çekiliş) ve salıverme gelince aşağıda öne çekiliyor. Yalnız salıvermeye
      // bırakılamaz: canvas parkı kendi valfiyle de bitirebiliyor ve o yolda
      // salıverme olayı hiç geçmiyor — sayaç hiç kurulmazsa canvas sonsuza
      // kadar ağaçta kalırdı.
      timer = setTimeout(
        () => setRun(null),
        hold
          ? COVER_HOLD_LIMIT_MS + RELEASE_TEARDOWN_MS
          : RELEASE_TEARDOWN_MS,
      );
      fallback = setTimeout(
        () => uiBus.emit("flameSweepCover"),
        COVER_FALLBACK_MS,
      );
      },
    );
    // Canvas kendi (doğru zamanlı) olayını yayınladıysa yedeği sök — yoksa
    // aynı kutlamada ikinci kez tetiklerdi.
    const unsubCover = uiBus.on("flameSweepCover", () => {
      if (fallback) clearTimeout(fallback);
      fallback = undefined;
    });
    // Park bitti: kalan iş yalnız dalganın çekilişi, sayaç ŞİMDİ kurulabilir.
    // `holding` kapısı şart — park etmeyen koşularda da salıverme olayı
    // geçiyor (DiscoverScreen her devirde çağırıyor, bekleyen yoksa no-op) ve
    // sayacı ikinci kez kurmak sökülmeyi öne çekerdi.
    const unsubRelease = uiBus.on("flameSweepRelease", () => {
      if (!holding) return;
      holding = false;
      if (timer) clearTimeout(timer);
      timer = setTimeout(() => setRun(null), RELEASE_TEARDOWN_MS);
    });
    return () => {
      if (timer) clearTimeout(timer);
      if (fallback) clearTimeout(fallback);
      unsub();
      unsubCover();
      unsubRelease();
    };
  }, []);

  if (run === null) {
    return shaderWarm ? (
      <LazyChunkBoundary resetKey="warm">
        <FlameWarmCanvas />
      </LazyChunkBoundary>
    ) : null;
  }

  return (
    <LazyChunkBoundary resetKey={run.id}>
      <FlameCanvas key={run.id} hold={run.hold} mode={run.mode} />
    </LazyChunkBoundary>
  );
}
