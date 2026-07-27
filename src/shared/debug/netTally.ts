import { PERF_NET, STARTUP_REPORT_MS } from "./flags";

// Açılışta atılan HTTP isteklerini endpoint bazında sayar, duplike/burst'leri
// işaretler ve pencere sonunda (STARTUP_REPORT_MS) tek bir tablo basar.
// Amaç: "cold boot'ta ne kadar request atılıyor, hangileri gereksiz tekrar?"
// sorusunu gözle görülür kılmak. api.ts request interceptor'ından beslenir.
//
// Prod'da otomatik kapalı (PERF_NET __DEV__ guard). Ölçüm bitince flag'i kapat.

type Row = { key: string; count: number; firstMs: number; lastMs: number; burst: number };

const t0 = Date.now();
const rows = new Map<string, Row>();
const rawSeq: { key: string; ms: number }[] = [];
let scheduled = false;

// URL'i normalize et: query string'i at, UUID / sayı segmentlerini :id yap →
// "/conversations/<uuid>/history-cursor" gibi 10 farklı çağrı tek satırda toplanır.
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
function normalize(method: string, url: string): string {
  const path = (url || "").split("?")[0];
  const norm = path
    .split("/")
    .map((seg) => (UUID.test(seg) || /^\d+$/.test(seg) ? ":id" : seg))
    .join("/");
  return `${(method || "GET").toUpperCase()} ${norm}`;
}

export function recordRequest(method: string, url: string) {
  if (!PERF_NET) return;
  const ms = Date.now() - t0;
  const key = normalize(method, url);
  rawSeq.push({ key, ms });
  const r = rows.get(key);
  if (r) {
    r.count += 1;
    // Aynı endpoint'e 400ms içinde tekrar → burst (çift-fetch şüphesi).
    if (ms - r.lastMs < 400) r.burst += 1;
    r.lastMs = ms;
  } else {
    rows.set(key, { key, count: 1, firstMs: ms, lastMs: ms, burst: 0 });
  }
  if (!scheduled) {
    scheduled = true;
    setTimeout(printNetSummary, STARTUP_REPORT_MS);
  }
}

export function printNetSummary() {
  if (!PERF_NET) return;
  const list = [...rows.values()].sort((a, b) => b.count - a.count);
  const total = list.reduce((s, r) => s + r.count, 0);
  const dupEndpoints = list.filter((r) => r.count > 1);
  const dupWasted = dupEndpoints.reduce((s, r) => s + (r.count - 1), 0);

  console.log(
    `\n[net] ═══ Açılış istek raporu (ilk ${STARTUP_REPORT_MS / 1000}s) ` +
      `— toplam ${total} istek, ${list.length} farklı endpoint, ` +
      `${dupWasted} tekrar (${dupEndpoints.length} endpoint) ═══`,
  );
  // Düz-metin (Metro'da console.table güvenilir değil):
  console.log(
    list
      .map(
        (r) =>
          `   ${String(r.count).padStart(2)}×  ${r.key}` +
          (r.burst > 0 ? `  ⚠burst${r.burst}` : "") +
          (r.count > 1 ? `   [${r.firstMs}→${r.lastMs}ms]` : `   [${r.firstMs}ms]`),
      )
      .join("\n"),
  );

  if (dupEndpoints.length) {
    console.warn(
      "[net] Tekrarlanan endpoint'ler (gereksiz olabilir):\n" +
        dupEndpoints
          .map((r) => `   ${r.count}×  ${r.key}${r.burst ? "  (burst)" : ""}`)
          .join("\n"),
    );
  }
}
