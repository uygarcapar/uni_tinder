import {
  PERF_HUD,
  PERF_STORM,
  STORM_THRESHOLD,
  PERF_STARTUP_RENDER,
  STARTUP_REPORT_MS,
} from "./flags";

type Snapshot = { label: string; count: number }[];

const counts = new Map<string, number>();
const listeners = new Set<(s: Snapshot) => void>();
let scheduled = false;

// Frame-başına render sayacı. requestAnimationFrame her frame'de sıfırlar; senkron
// bir render loop rAF'a hiç dönemediği için bu sayaç frame boyunca birikip eşiği aşar.
const frameCounts = new Map<string, number>();
const stormed = new Set<string>(); // aynı storm'u her render'da tekrar loglama

function flush() {
  scheduled = false;
  frameCounts.clear();
  stormed.clear();
  if (!PERF_HUD) return;
  const snap: Snapshot = [];
  counts.forEach((count, label) => snap.push({ label, count }));
  snap.sort((a, b) => b.count - a.count);
  listeners.forEach((l) => l(snap));
}

// ── Açılış render sayacı ───────────────────────────────────────────────────
// Component başına LIFETIME render sayısını açılış penceresinde biriktirir ve
// STARTUP_REPORT_MS sonunda tek tablo basar. HUD'dan bağımsız (HUD frame-başına
// canlı sayaç; bu ise "ilk 6sn'de kim kaç kez render etti" özeti). Ucuz: her
// bump'ta bir Map artışı. bump zaten çağrıldığı için ekstra hook gerekmez.
const startupCounts = new Map<string, number>();
let startupScheduled = false;

export function printStartupRenderSummary() {
  if (!PERF_STARTUP_RENDER) return;
  const list = [...startupCounts.entries()]
    .map(([label, count]) => ({ label, count }))
    .sort((a, b) => b.count - a.count);
  const total = list.reduce((s, r) => s + r.count, 0);
  console.log(
    `\n[render] ═══ Açılış render raporu (ilk ${STARTUP_REPORT_MS / 1000}s) ` +
      `— toplam ${total} render, ${list.length} component ═══\n` +
      list
        .map((r) => `   ${String(r.count).padStart(3)}×  ${r.label}`)
        .join("\n"),
  );
}

export function bump(label: string) {
  if (PERF_STARTUP_RENDER) {
    startupCounts.set(label, (startupCounts.get(label) ?? 0) + 1);
    if (!startupScheduled) {
      startupScheduled = true;
      setTimeout(printStartupRenderSummary, STARTUP_REPORT_MS);
    }
  }

  if (!PERF_HUD && !PERF_STORM) return;

  if (PERF_HUD) counts.set(label, (counts.get(label) ?? 0) + 1);

  if (PERF_STORM) {
    const fc = (frameCounts.get(label) ?? 0) + 1;
    frameCounts.set(label, fc);
    if (fc >= STORM_THRESHOLD && !stormed.has(label)) {
      stormed.add(label);
      // Senkron: JS thread donmadan önce bu satır konsola düşer.
      console.error(
        `[render-storm] "${label}" tek frame'de ${fc}+ render — render loop şüphesi. ` +
          `Bu component'in setState'i/effect'i kendini tetikliyor olabilir (stabil olmayan ` +
          `dependency, render içinde setState, yeni obje/fonksiyon prop'u).`,
      );
    }
  }

  if (!scheduled) {
    scheduled = true;
    requestAnimationFrame(flush);
  }
}

export function subscribe(fn: (s: Snapshot) => void) {
  if (!PERF_HUD) return () => {};
  listeners.add(fn);
  const snap: Snapshot = [];
  counts.forEach((count, label) => snap.push({ label, count }));
  snap.sort((a, b) => b.count - a.count);
  fn(snap);
  return () => {
    listeners.delete(fn);
  };
}

export function reset() {
  counts.clear();
  frameCounts.clear();
  stormed.clear();
  listeners.forEach((l) => l([]));
}
