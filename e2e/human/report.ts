import { writeFileSync } from 'node:fs';
import { artifact } from '../support/env';
import { WEIGHTS, type ActionId } from './weights';
import type { MonkeyResult } from './engine';

/**
 * Maymun raporu.
 *
 * En değerli iki satırı:
 *   • HİÇ GİRİLMEYEN yüzeyler — senaryo kataloğundaki boşluğu da gösteriyor.
 *   • Beklenen vs gerçekleşen ağırlık sapması — sapma büyükse eylemlerin
 *     `surfaces` kapıları fazla sıkı, yani maymun aslında dolaşmıyor.
 */
export function writeMonkeyReport(result: MonkeyResult): string {
  const total = result.steps.length;
  const counts = new Map<ActionId, number>();
  const noops = new Map<ActionId, number>();
  for (const step of result.steps) {
    counts.set(step.action, (counts.get(step.action) ?? 0) + 1);
    if (step.outcome === 'noop') noops.set(step.action, (noops.get(step.action) ?? 0) + 1);
  }

  const weightTotal = Object.values(WEIGHTS).reduce<number>((s, w) => s + w, 0);
  const rows = (Object.keys(WEIGHTS) as ActionId[])
    .map((id) => {
      const n = counts.get(id) ?? 0;
      const expected = (WEIGHTS[id] / weightTotal) * 100;
      const actual = total > 0 ? (n / total) * 100 : 0;
      return { id, n, expected, actual, noop: noops.get(id) ?? 0 };
    })
    .sort((a, b) => b.n - a.n);

  const durations = result.steps.map((s) => s.ms).sort((a, b) => a - b);
  const pct = (p: number): number => durations[Math.min(durations.length - 1, Math.floor(durations.length * p))] ?? 0;

  const coverage =
    result.unvisited.length === 0
      ? 'Tanımlı her yüzeye girildi.'
      : `**HİÇ GİRİLMEYEN:** ${result.unvisited.join(', ')}\n\n` +
        '> Bu liste senaryo kataloğundaki boşluğu da gösteriyor: maymunun\n' +
        "> ulaşamadığı bir yüzeyin scripted spec'i de muhtemelen yok.";

  const md: string[] = [
    `# Maymun raporu · seed ${result.seed}`,
    '',
    `Koşu: \`${result.runId}\` · ${total} eylem`,
    '',
    `Tekrar üret: \`E2E_SEED=${result.seed} E2E_RUN_ID=${result.runId} npm run e2e:monkey\``,
    '',
    '## Kapsama',
    '',
    coverage,
    '',
    '## Kapı karşılaşmaları',
    '',
  ];

  const gateEntries = Object.entries(result.gates);
  if (gateEntries.length === 0) {
    md.push('Hiç kapıya çarpılmadı (paywall / izin / KVKK).');
  } else {
    md.push('| Kapı | Kez |', '|---|---|');
    for (const [gate, n] of gateEntries) md.push(`| ${gate} | ${n} |`);
  }

  md.push(
    '',
    '## Eylem dağılımı',
    '',
    '| Eylem | Kez | Beklenen % | Gerçekleşen % | noop |',
    '|---|---:|---:|---:|---:|',
    ...rows.map(
      (r) =>
        `| ${r.id} | ${r.n} | ${r.expected.toFixed(1)} | ${r.actual.toFixed(1)} | ${r.noop} |`
    ),
    '',
    '## Süre',
    '',
    `p50 ${pct(0.5)} ms · p95 ${pct(0.95)} ms · en yavaş ${durations[durations.length - 1] ?? 0} ms`,
    '',
    '> Süre dağılımı ücretsiz bir performans göstergesi: p95 koşudan koşuya',
    '> belirgin büyüyorsa bir yüzey ağırlaşmış demektir.',
    ''
  );

  const path = artifact('monkey', `${result.seed}-report.md`);
  writeFileSync(path, md.join('\n'));
  return path;
}
