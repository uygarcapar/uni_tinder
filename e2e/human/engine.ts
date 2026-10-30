/**
 * MAYMUN MOTORU — "insan gibi" dolaşan katman.
 *
 * Döngü: yüzeyi oku → uygun eylemleri süz → ağırlıklı seç → koş → değişmez
 * koşulları kontrol et → insan gecikmesi → kaydet.
 *
 * Determinizm sözleşmesi (ihlal edilemez):
 *   • Tek bir seed her kararı belirliyor; `Math.random` hiç kullanılmıyor.
 *   • Her eylem `<seed>.jsonl`a bir satır olarak yazılıyor → eylem eylem
 *     yeniden oynatılabiliyor.
 *   • Hata mesajının İLK satırı tekrar üretme komutu.
 */
import { appendFileSync, writeFileSync } from 'node:fs';
import { RUN_ID, SEED, artifact } from '../support/env';
import { makeRng, type Rng } from '../support/rng';
import { newInvariantContext, runInvariants, InvariantError } from '../support/invariants';
import { els } from '../support/selectors';
import { enterApp } from '../support/devClient';
import { ACTIONS, type ActionOutcome, type HumanCtx, type SurfaceId } from './actions';
import { contextualMultiplier, SATURATION_FACTOR, SATURATION_RECOVERY, WEIGHTS, type ActionId, type WeightContext } from './weights';

export interface MonkeyStep {
  i: number;
  surface: SurfaceId;
  action: ActionId;
  outcome: ActionOutcome['kind'];
  detail?: string;
  ms: number;
}

export interface MonkeyResult {
  seed: number;
  runId: string;
  steps: MonkeyStep[];
  /** Hiç girilmeyen yüzeyler — senaryo kataloğundaki boşluğu da gösteriyor. */
  unvisited: SurfaceId[];
  gates: Record<string, number>;
}

const ALL_SURFACES: readonly SurfaceId[] = [
  'discover',
  'likes',
  'feed',
  'messages',
  'chat',
  'profile',
  'settings',
];

/** Ekrandaki `*-screen` kökünden yüzeyi okur. */
async function detectSurface(): Promise<SurfaceId> {
  const roots = await els("-ios predicate string: name ENDSWITH '-screen'");
  for (const root of roots) {
    const name = (await root.getAttribute('name')) ?? '';
    const id = name.replace(/-screen$/, '');
    if ((ALL_SURFACES as readonly string[]).includes(id)) return id as SurfaceId;
    if (id === 'msgs') return 'messages';
  }
  return 'unknown';
}

/** Açık bir paywall sheet'i var mı — bağlamsal ağırlıkların girdisi. */
async function detectPaywall(): Promise<boolean> {
  const sheets = await els(
    "-ios predicate string: name BEGINSWITH 'plan-' OR name CONTAINS 'purchase' OR name CONTAINS 'paywall'"
  );
  return sheets.length > 0;
}

/**
 * İnsan tepki süresi: log-normal, kırpılmış.
 * Medyan ~650 ms, p95 ~2.4 sn, tavan 4 sn.
 */
function thinkTime(rng: Rng): number {
  const mu = Math.log(0.65);
  const sigma = 0.62;
  return Math.min(4_000, Math.max(180, Math.exp(mu + sigma * rng.normal()) * 1000));
}

export interface MonkeyOptions {
  actions: number;
  seed?: number;
  /** Akış sekmesi bu oturumda çizili mi (ağırlıkları etkiliyor). */
  feedEnabled?: boolean;
}

export async function runMonkey(options: MonkeyOptions): Promise<MonkeyResult> {
  const seed = options.seed ?? SEED;
  const rng = makeRng(seed);
  const invariants = newInvariantContext();
  const steps: MonkeyStep[] = [];
  const visited = new Set<SurfaceId>();
  const gates: Record<string, number> = {};
  const lastRun = new Map<ActionId, number>();

  const jsonl = artifact('monkey', `${seed}.jsonl`);
  writeFileSync(jsonl, '');

  const repro =
    `E2E_SEED=${seed} E2E_RUN_ID=${RUN_ID} E2E_SUITE=monkey npm run e2e`;
  process.stdout.write(`[maymun] seed=${seed} eylem=${options.actions}\n[maymun] tekrar: ${repro}\n`);

  await enterApp();

  for (let i = 0; i < options.actions; i += 1) {
    invariants.actionIndex = i;
    const surface = await detectSurface();
    visited.add(surface);

    const weightCtx: WeightContext = {
      paywallOpen: await detectPaywall(),
      // Kota durumu UI'dan okunmuyor: bir kez 0'a düşen eylem zaten `noop`
      // döndürüp kendini söndürüyor. Burada yalnız paywall sonrası davranış
      // modelleniyor.
      likeQuotaExhausted: false,
      fireQuotaExhausted: false,
      hasMatch: surface === 'chat' || surface === 'messages',
      feedEnabled: options.feedEnabled ?? true,
    };

    const candidates = ACTIONS.filter(
      (a) => a.surfaces.length === 0 || a.surfaces.includes(surface)
    ).map((a) => {
      const sinceLast = i - (lastRun.get(a.id) ?? -SATURATION_RECOVERY);
      // Doygunluk: yeni koşmuşsa ağırlık düşük, SATURATION_RECOVERY eylem
      // sonra tabana dönüyor.
      const recovery = Math.min(1, sinceLast / SATURATION_RECOVERY);
      const saturation = SATURATION_FACTOR + (1 - SATURATION_FACTOR) * recovery;
      return {
        item: a,
        weight: WEIGHTS[a.id] * saturation * contextualMultiplier(a.id, weightCtx),
      };
    });

    // Hiç uygun eylem yoksa sekme değiştirmek ZORUNLU — maymun kilitlenmesin.
    const chosen =
      rng.weighted(candidates) ?? ACTIONS.find((a) => a.id === 'nav.tab') ?? ACTIONS[0]!;

    const ctx: HumanCtx = {
      rng,
      surface,
      actionIndex: i,
      noteDismissAttempt: (name) =>
        invariants.dismissAttempts.set(name, (invariants.dismissAttempts.get(name) ?? 0) + 1),
    };

    const t0 = Date.now();
    let outcome: ActionOutcome;
    try {
      outcome = await chosen.run(ctx);
    } catch (err) {
      throw new Error(
        `Tekrar üret: ${repro}\n` +
          `Eylem #${i} "${chosen.id}" (${surface}) patladı: ${(err as Error).message}`
      );
    }
    lastRun.set(chosen.id, i);

    if (outcome.kind === 'gate') gates[outcome.gate] = (gates[outcome.gate] ?? 0) + 1;

    const step: MonkeyStep = {
      i,
      surface,
      action: chosen.id,
      outcome: outcome.kind,
      detail: outcome.kind === 'noop' ? outcome.why : undefined,
      ms: Date.now() - t0,
    };
    steps.push(step);
    appendFileSync(jsonl, `${JSON.stringify(step)}\n`);

    try {
      await runInvariants(invariants);
    } catch (err) {
      if (err instanceof InvariantError) {
        await browser.saveScreenshot(artifact('shots', `monkey-${seed}-${i}.png`)).catch(() => {});
        throw new Error(
          `Tekrar üret: ${repro}\n` +
            `Eylem #${i} "${chosen.id}" (${surface}) sonrası değişmez koşul ihlali:\n` +
            `${err.message}\n` +
            `  görüntü: ${artifact('shots', `monkey-${seed}-${i}.png`)}\n` +
            `  izleme : ${jsonl}`
        );
      }
      throw err;
    }

    // "Okuma" molası: her 6-11 eylemde bir, kartı/mesajı okuyormuş gibi.
    const pause = i > 0 && i % (6 + rng.int(6)) === 0 ? 1_500 + rng.int(3_500) : thinkTime(rng);
    await new Promise((r) => setTimeout(r, Math.round(pause)));
  }

  return {
    seed,
    runId: RUN_ID,
    steps,
    unvisited: ALL_SURFACES.filter((s) => !visited.has(s)),
    gates,
  };
}
