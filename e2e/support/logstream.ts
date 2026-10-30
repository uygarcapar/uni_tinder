/**
 * ÇÖKME AVI — üç kanal, ürün koduna dokunmadan.
 *
 * `src/shared/debug/crashLogger.ts` değerlendirmesi: `__DEV__`-only,
 * `ErrorUtils.setGlobalHandler` ile `[fatal] isFatal=…` basıyor ve
 * `[unhandled-rejection] …` yakalıyor; App.tsx:1'de import ediliyor.
 * SINIRI dosyanın kendi beyanı: *"Native crash ise burada da iz olmaz"* ve
 * çıktısı YALNIZ console — dosyaya yazmıyor, callback'i yok.
 *
 * Bu modül KANAL 1'i kuruyor: os_log tail'i (RN console.log → RCTLog → NSLog).
 * KANAL 2 `browser.getLogs('crashlog')` + DiagnosticReports (native çökme,
 * crashLogger'ın göremediği tek şey). KANAL 3 `queryAppState` (invariants.ts).
 */
import { spawn, type ChildProcess } from 'node:child_process';
import { appendFileSync, createWriteStream, existsSync, readdirSync, statSync } from 'node:fs';
import { homedir } from 'node:os';
import { basename, resolve } from 'node:path';
import { DEVICE_UDID, artifact } from './env';

const FATAL_PATTERNS: ReadonlyArray<{ re: RegExp; what: string }> = [
  // crashLogger kanalı
  { re: /\[fatal\] isFatal=true/, what: 'JS fatal (crashLogger)' },
  { re: /\[unhandled-rejection\]/, what: 'Yakalanmamış promise reddi' },
  // native
  { re: /Fatal Exception|Terminating app due to uncaught exception/, what: 'Native exception' },
  { re: /\b(SIGABRT|SIGSEGV|SIGBUS|EXC_BAD_ACCESS)\b/, what: 'Native sinyal' },
  // Fabric commit fırtınası — ShadowTree::commit assert'i (attempts < 1024)
  { re: /ShadowTree::commit.*attempts/, what: 'Fabric commit fırtınası' },
  { re: /Native part of Worklets doesn't seem to be initialized/, what: 'Worklets başlatılmadı' },
  // bellek
  { re: /JetsamEvent.*(largestProcess|Lit)/, what: 'Jetsam (OOM)' },
  // expo-camera patch'i binary'de yoksa kare şişiyor → gerçek cihazda jetsam
  { re: /KARE ŞİŞMİŞ/, what: 'expo-camera patch düşmüş (kare şişmesi)' },
];

export class FatalLogError extends Error {}

let proc: ChildProcess | null = null;
let logPath: string | null = null;
let tail = '';
let fatals: string[] = [];
let reported = 0;

/**
 * os_log akışını başlatır. Predicate hem process hem sender tarafını kapsıyor:
 * RN'in NSLog'u uygulama process'inden, bazı native assert'ler ise paylaşılan
 * kütüphanelerden geliyor.
 */
export function startLogStream(specFile: string): void {
  stopLogStream();
  tail = '';
  fatals = [];
  reported = 0;

  const name = basename(specFile).replace(/\.e2e\.ts$/, '');
  logPath = artifact('logs', `${name}.log`);
  const out = createWriteStream(logPath, { flags: 'a' });

  proc = spawn('xcrun', [
    'simctl',
    'spawn',
    DEVICE_UDID,
    'log',
    'stream',
    '--style',
    'compact',
    '--level',
    'debug',
    '--predicate',
    'processImagePath CONTAINS "Lit" OR senderImagePath CONTAINS "Lit"',
  ]);

  proc.stdout?.pipe(out);
  proc.stdout?.on('data', (chunk: Buffer) => scan(chunk.toString('utf8')));
  proc.stderr?.on('data', (chunk: Buffer) => out.write(chunk));
}

export function stopLogStream(): void {
  proc?.kill('SIGTERM');
  proc = null;
}

function scan(chunk: string): void {
  tail = (tail + chunk).slice(-64_000);
  for (const line of chunk.split('\n')) {
    for (const { re, what } of FATAL_PATTERNS) {
      if (re.test(line)) {
        fatals.push(`${what}: ${line.trim()}`);
        appendFileSync(artifact('logs', 'fatals.txt'), `${what}\n  ${line.trim()}\n`);
      }
    }
  }
}

/**
 * Yeni fatal var mı?
 *
 * `incremental: true` — maymun döngüsünde her eylemde çağrılıyor ve yalnız
 * BU çağrıdan beri birikenleri bildiriyor; aksi halde ilk fatal'den sonraki
 * her eylem aynı hatayla düşer ve asıl eylem indeksi kaybolur.
 */
export function assertNoFatals({ incremental = false } = {}): void {
  const fresh = incremental ? fatals.slice(reported) : fatals;
  reported = fatals.length;
  if (fresh.length === 0) return;
  throw new FatalLogError(
    `Uygulama log'unda ${fresh.length} ölümcül kayıt:\n` +
      fresh.map((f) => `  • ${f}`).join('\n') +
      `\n  tam log: ${logPath ?? '(yok)'}`
  );
}

/** Son N satır — hata mesajına bağlam eklemek için. */
export function logTail(lines = 40): string {
  return tail.split('\n').slice(-lines).join('\n');
}

/**
 * KANAL 2 — native çökme raporları. crashLogger'ın GÖREMEDİĞİ tek şey.
 * `getLogs('crashlog')` driver'a bağlı; dosya sistemi tarafı yedek.
 */
export function recentNativeCrashReports(sinceMs: number): string[] {
  const dir = resolve(homedir(), 'Library/Logs/DiagnosticReports');
  if (!existsSync(dir)) return [];
  return readdirSync(dir)
    .filter((f) => /^Lit[-_]/.test(f) && /\.(ips|crash)$/.test(f))
    .map((f) => resolve(dir, f))
    .filter((p) => statSync(p).mtimeMs >= sinceMs);
}
