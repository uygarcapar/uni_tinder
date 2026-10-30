/**
 * XCUITest ağacı analizi — seçici arkeolojisinin tek aleti.
 *
 * `browser.getPageSource()` iOS'ta bir XML döndürüyor. Burada DOM parser yok
 * (Node'da yerleşik değil ve e2e'ye bir bağımlılık daha eklemek istemiyoruz);
 * ölçümler satır/regex üzerinden yapılıyor ve yeterli — amaç raporlama,
 * seçici üretimi değil.
 */
import { writeFileSync } from 'node:fs';
import { artifact } from './env';

export interface TreeStats {
  bytes: number;
  elementCount: number;
  maxDepth: number;
  /** Eleman tipi → sayı, çoktan aza. */
  typeHistogram: Array<[string, number]>;
  /** Doldurulmuş `name` attribute'ları (accessibilityIdentifier ?? label). */
  names: string[];
}

const TAG = /<(\/?)(XCUIElementType[A-Za-z]+)([^>]*?)(\/?)>/g;
const NAME_ATTR = /\bname="([^"]*)"/;

export function analyzeTree(xml: string): TreeStats {
  const types = new Map<string, number>();
  const names = new Set<string>();
  let depth = 0;
  let maxDepth = 0;
  let elementCount = 0;

  for (const match of xml.matchAll(TAG)) {
    const [, closing, type, attrs, selfClosing] = match;
    if (!type) continue;

    if (closing === '/') {
      depth = Math.max(0, depth - 1);
      continue;
    }

    elementCount += 1;
    types.set(type, (types.get(type) ?? 0) + 1);

    const nameHit = attrs ? NAME_ATTR.exec(attrs) : null;
    if (nameHit?.[1]) names.add(nameHit[1]);

    if (selfClosing !== '/') {
      depth += 1;
      maxDepth = Math.max(maxDepth, depth);
    } else {
      maxDepth = Math.max(maxDepth, depth + 1);
    }
  }

  return {
    bytes: xml.length,
    elementCount,
    maxDepth,
    typeHistogram: [...types.entries()].sort((a, b) => b[1] - a[1]),
    names: [...names].sort(),
  };
}

/** Ağacı diske yazar ve ölçümleri döndürür. */
export async function dumpTree(label: string): Promise<TreeStats> {
  const xml = await browser.getPageSource();
  writeFileSync(artifact('trees', `${label}.xml`), xml);
  const stats = analyzeTree(xml);
  writeFileSync(
    artifact('trees', `${label}.stats.json`),
    JSON.stringify(stats, null, 2)
  );
  return stats;
}

export function formatStats(label: string, s: TreeStats): string {
  const top = s.typeHistogram
    .slice(0, 8)
    .map(([t, n]) => `${t.replace('XCUIElementType', '')}=${n}`)
    .join(' ');
  return (
    `[tree] ${label}: ${s.elementCount} eleman, derinlik ${s.maxDepth}, ` +
    `${(s.bytes / 1024).toFixed(0)} KB, isimli ${s.names.length}\n` +
    `       ${top}`
  );
}

/** Bulguları tek bir rapora biriktirir — sonraki fazlar bunu okuyor. */
export class Findings {
  private readonly rows: Array<{ question: string; answer: string; detail?: string }> = [];

  record(question: string, answer: string, detail?: string): void {
    this.rows.push({ question, answer, detail });
    process.stdout.write(`[bulgu] ${question}\n        → ${answer}\n`);
    if (detail) process.stdout.write(`        ${detail}\n`);
  }

  write(): void {
    writeFileSync(artifact('trees', 'findings.json'), JSON.stringify(this.rows, null, 2));
    const md = [
      '# 00-tree-dump bulguları',
      '',
      '| Soru | Cevap | Ayrıntı |',
      '|---|---|---|',
      ...this.rows.map(
        (r) => `| ${r.question} | ${r.answer} | ${(r.detail ?? '').replace(/\|/g, '\\|')} |`
      ),
      '',
    ].join('\n');
    writeFileSync(artifact('trees', 'findings.md'), md);
  }
}
