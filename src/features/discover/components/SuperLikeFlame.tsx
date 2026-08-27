import { Suspense, lazy, useEffect, useRef, useState } from "react";
import uiBus from "@/shared/services/uiBus";
// Süre canvas ile PAYLAŞILAN modülden geliyor: flameWavePath Skia'ya
// dokunmadığı için import etmek lazy chunk'ı buraya çekmiyor. Elle kopyalanan
// iki sabit olarak tutulduğunda biri güncellenip diğeri bayat kalmıştı.
import { FLAME_WAVE_MS } from "@/features/discover/components/flameWavePath";

/**
 * Skia'nın JS modülü ağır ve kök ağaçta duruyoruz (bkz. AppNavigator) —
 * statik import edilseydi her cold start'ta bedavaya evaluate edilirdi.
 * Canvas ayrı chunk'ta: ilk süper beğeniye kadar yüklenmiyor.
 */
const FlameCanvas = lazy(
  () => import("@/features/discover/components/SuperLikeFlameCanvas"),
);

/**
 * Kart değişimini bekleten taraf (bkz. flameSweep) "flameSweepCover" olayını
 * dinliyor ve onu normalde CANVAS yayınlıyor — kendi animasyon saatinden, tam
 * ekranı kapattığı anda. Canvas hiç çizemezse (lazy chunk yüklenemedi, Skia
 * path'i kurulamadı) o olay hiç gelmez ve kart sonsuza kadar askıda kalırdı.
 * Bu yüzden olayı burada da, geniş bir gecikmeyle, yedek olarak yayınlıyoruz:
 * kutlama atlanabilir, deste durmaz.
 */
const COVER_FALLBACK_MS = FLAME_WAVE_MS + 500;

/**
 * Süper beğeni kutlaması: ekranı alttan yukarı süpüren alev dalgası (bkz.
 * SuperLikeFlameCanvas). Eskiden burada kalp ikonundan süzülen renkli kalp
 * parçacıkları vardı.
 *
 * Bu dosya bilerek "hafif": yalnız uiBus'ı dinler, dalga süresince canvas'ı
 * mount edip sonra söker. Boşta hiçbir animasyon/frame callback dönmüyor.
 */
export default function SuperLikeFlame() {
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
      // mount olup (ilk seferde lazy chunk çözülerek) efekt çalıştığında.
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
    <Suspense fallback={null}>
      <FlameCanvas key={runId} />
    </Suspense>
  );
}
