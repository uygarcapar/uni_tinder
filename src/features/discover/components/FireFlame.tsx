import { useEffect, useRef, useState } from "react";
import uiBus from "@/shared/services/uiBus";
import LazyChunkBoundary from "@/shared/components/LazyChunkBoundary";
// Süre canvas ile PAYLAŞILAN modülden geliyor: elle kopyalanan iki sabit olarak
// tutulduğunda biri güncellenip diğeri bayat kalmıştı.
import { FLAME_WAVE_MS } from "@/features/discover/components/flameWavePath";
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
import FlameCanvas from "@/features/discover/components/FireFlameCanvas";

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
 * Fire kutlaması: ekranı alttan yukarı süpüren alev dalgası (bkz.
 * FireFlameCanvas). Eskiden burada kalp ikonundan süzülen renkli kalp
 * parçacıkları vardı.
 *
 * Bu dosya bilerek "hafif": yalnız uiBus'ı dinler, dalga süresince canvas'ı
 * mount edip sonra söker. Boşta hiçbir animasyon/frame callback dönmüyor.
 */
export default function FireFlame() {
  const [runId, setRunId] = useState<number | null>(null);
  const seq = useRef(0);

  useEffect(() => {
    let timer: ReturnType<typeof setTimeout> | undefined;
    let fallback: ReturnType<typeof setTimeout> | undefined;
    const unsub = uiBus.on("flameSweep", () => {
      // Üst üste kutlamalarda YENİ key veriliyor: canvas remount olur, dalga
      // baştan başlar. Aynı key kalsaydı ikinci alev, birincinin ekranı terk
      // etme fazının ortasında görünürdü.
      setRunId(seq.current++);
      if (timer) clearTimeout(timer);
      if (fallback) clearTimeout(fallback);
      // Pay bilerek geniş: sayaç OLAY anında başlıyor, animasyon ise canvas
      // mount olup efekt çalıştığında (ilk kutlamada silüetler de kuruluyor).
      // Dar payla ilk kutlamada dalga bitmeden sökülebiliyordu. Fazladan
      // bekleyen canvas boşta duruyor — animasyonu bitmiş, çizimi ekran dışı.
      timer = setTimeout(() => setRunId(null), FLAME_WAVE_MS + 400);
      fallback = setTimeout(
        () => uiBus.emit("flameSweepCover"),
        COVER_FALLBACK_MS,
      );
    });
    // Canvas kendi (doğru zamanlı) olayını yayınladıysa yedeği sök — yoksa
    // aynı kutlamada ikinci kez tetiklerdi.
    const unsubCover = uiBus.on("flameSweepCover", () => {
      if (fallback) clearTimeout(fallback);
      fallback = undefined;
    });
    return () => {
      if (timer) clearTimeout(timer);
      if (fallback) clearTimeout(fallback);
      unsub();
      unsubCover();
    };
  }, []);

  if (runId === null) return null;

  return (
    <LazyChunkBoundary resetKey={runId}>
      <FlameCanvas key={runId} />
    </LazyChunkBoundary>
  );
}
