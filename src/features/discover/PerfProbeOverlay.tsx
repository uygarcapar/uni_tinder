import { useEffect, useRef, useState } from "react";
import { Text, View } from "react-native";
import { useFrameCallback, useSharedValue } from "react-native-reanimated";

/**
 * ── KEŞİF KASMASI: ÖLÇÜ ALETİ (GEÇİCİ, bkz. perfProbe.ts) ──────────────────
 *
 * Perf monitor'ün "60fps" sayacı ORTALAMA — tek tek geç kalan kareleri
 * göstermiyor. Belirti "fps sabit ama takılıyor + gittikçe kötüleşiyor" olduğu
 * için bize iki şey lazım ve ikisini de bu overlay ölçüyor:
 *
 *   • EN KÖTÜ KARE ARALIĞI (son 1 sn): ortalamanın sakladığı şey.
 *     120Hz ekranda pürüzsüzlük sınırı ~8ms, 60Hz üretimde ~17ms.
 *     "ui" UI thread'inden (useFrameCallback), "js" JS event-loop'undan
 *     (timer drift'i) ölçülüyor.
 *   • BİRİKME SAYAÇLARI: ekranda canlı SwipeCard sayısı (alive) ve açılıştan
 *     beri toplam mount (total). Kasma kart geçtikçe kötüleşiyorsa ve "alive"
 *     3'ün üstüne çıkıyorsa sökülmeyen kart var demektir.
 *
 * NASIL OKUNUR: Keşif'te scroll ederken üst satıra bak.
 *   ui-max sürekli 17ms+ gösteriyorsa → UI thread'de her-kare iş var (ölçülen
 *     gerçek bir kare kaybı; perf monitor'ün 60'ı yanılıyor).
 *   ui-max ~8-12ms'te sabit ve yine takılıyorsa → kare ÜRETİMİ değil kare
 *     HIZI sorun: içerik 60'ta, ekran 120'de — ProMotion eşleşmesi.
 *   js-max büyükse ama ui-max küçükse → JS tıkanıyor ama scroll'u UI thread
 *     sürdüğü için dolaylı (dokunma gecikmesi olarak hissedilir).
 *   alive > 3 ya da zamanla artıyorsa → birikme bulundu.
 */
export const probeCounters = {
  alive: 0,
  total: 0,
};

export default function PerfProbeOverlay() {
  const [stats, setStats] = useState({
    uiMax: 0,
    jsMax: 0,
    alive: 0,
    total: 0,
  });
  const uiMaxSV = useSharedValue(0);

  // UI thread: iki kare arasındaki en uzun boşluk. Her kare koşuyor ama işi
  // bir karşılaştırma — ölçtüğü şeyi bozacak ağırlıkta değil.
  useFrameCallback((info) => {
    const dt = info.timeSincePreviousFrame ?? 0;
    if (dt > uiMaxSV.value) uiMaxSV.value = dt;
  });

  const jsMaxRef = useRef(0);
  useEffect(() => {
    // JS event-loop gecikmesi: 100ms'lik timer'ın rötarı. JS tıkalıysa timer
    // geç uyanır; rötarın tepe değeri tıkanıklığın boyu.
    let last = Date.now();
    const tick = setInterval(() => {
      const now = Date.now();
      const drift = now - last - 100;
      if (drift > jsMaxRef.current) jsMaxRef.current = drift;
      last = now;
    }, 100);
    // Saniyede bir raporla ve pencereyi sıfırla.
    const report = setInterval(() => {
      const ui = Math.round(uiMaxSV.value);
      uiMaxSV.value = 0;
      const js = Math.round(jsMaxRef.current);
      jsMaxRef.current = 0;
      setStats({
        uiMax: ui,
        jsMax: js,
        alive: probeCounters.alive,
        total: probeCounters.total,
      });
    }, 1000);
    return () => {
      clearInterval(tick);
      clearInterval(report);
    };
  }, [uiMaxSV]);

  return (
    <View
      pointerEvents="none"
      style={{
        position: "absolute",
        top: 70,
        left: 8,
        backgroundColor: "rgba(0,0,0,0.75)",
        paddingHorizontal: 8,
        paddingVertical: 4,
        borderRadius: 6,
        zIndex: 9999,
      }}
    >
      <Text style={{ color: "#0f0", fontSize: 11, fontVariant: ["tabular-nums"] }}>
        ui-max {stats.uiMax}ms · js-max {stats.jsMax}ms
      </Text>
      <Text style={{ color: "#0f0", fontSize: 11, fontVariant: ["tabular-nums"] }}>
        cards alive {stats.alive} · total {stats.total}
      </Text>
    </View>
  );
}
