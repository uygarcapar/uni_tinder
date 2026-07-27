import { PERF_STARTUP } from "./flags";

const marks = new Map<string, number>();
const t0 = Date.now();

export function mark(name: string) {
  if (!PERF_STARTUP) return;
  const ms = Date.now() - t0;
  marks.set(name, ms);
  console.log(`[startup] ${name}: +${ms}ms`);
}

export function summary() {
  if (!PERF_STARTUP) return;
  const rows: { phase: string; ms: number }[] = [];
  marks.forEach((ms, phase) => rows.push({ phase, ms }));
  rows.sort((a, b) => a.ms - b.ms);
  console.table(rows);
}
