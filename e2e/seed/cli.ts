/**
 * Tohumlayıcı CLI.
 *
 *   npm run e2e:seed -- --bots 6          # karşı kullanıcıları yarat
 *   npm run e2e:seed -- --purge           # defterdeki her hesabı sil
 *   npm run e2e:seed -- --purge --run ID  # yalnız o koşununkiler
 *   npm run e2e:seed -- --list            # defteri göster
 *
 * BOT DAĞILIMI (varsayılan 6):
 *   2 × liker   → Beğeniler sekmesi, rozet, LikerSwipeModal, EŞLEŞME + sohbet
 *   2 × neutral → Keşif destesi dolsun (dört karar için en az 4 kart gerekiyor)
 *   1 × feed    → akış gönderisi sahibi (beğen / yazara dokun / yanıt / şikayet)
 *   1 × campus  → kampüs anı sahibi (şerit / karar modalı / şikayet)
 */
import { BOT_COUNT, E2E_LAT, E2E_LON, EMAIL_DOMAIN, RUN_ID, SEED, artifact } from '../support/env';
import { existsSync, readFileSync, writeFileSync } from 'node:fs';
import { createBot, type Bot, type BotRole } from './createBot';
import { resolveCampusFix, seedCampusMoment, seedFeedPost } from './interactions';
import { purge } from './cleanup';
import * as ledger from './ledger';
import type { RegMode } from '../flows/types';

interface Args {
  bots?: number;
  purge: boolean;
  list: boolean;
  runId?: string;
  mode: RegMode;
}

function parseArgs(argv: string[]): Args {
  const out: Args = { purge: false, list: false, mode: 'Dating' };
  for (let i = 0; i < argv.length; i += 1) {
    const a = argv[i];
    if (a === '--bots') out.bots = Number(argv[++i] ?? BOT_COUNT);
    else if (a === '--purge') out.purge = true;
    else if (a === '--list') out.list = true;
    else if (a === '--run') out.runId = argv[++i];
    else if (a === '--mode') out.mode = argv[++i] === 'Friends' ? 'Friends' : 'Dating';
  }
  return out;
}

/** Slot → rol haritası. Sıra önemli: liker'lar önce gelsin ki az sayıda bot
 *  istendiğinde bile eşleşme akışı kurulabilsin. */
function roleFor(slot: number, total: number): BotRole {
  if (slot < Math.min(2, total)) return 'liker';
  if (slot < total - 2) return 'neutral';
  if (slot === total - 2) return 'feed';
  return 'campus';
}

export interface SeedReport {
  runId: string;
  seed: number;
  bots: Array<{ email: string; userId: string; role: BotRole; displayName: string }>;
  feedPost?: { postId: string } | { skipped: string };
  campusMoment?: { momentId: string } | { skipped: string };
}

async function seedBots(count: number, mode: RegMode): Promise<SeedReport> {
  const bots: Bot[] = [];
  const report: SeedReport = { runId: RUN_ID, seed: SEED, bots: [] };

  for (let slot = 0; slot < count; slot += 1) {
    const role = roleFor(slot, count);
    process.stdout.write(`[seed] bot ${slot + 1}/${count} (${role})… `);
    const bot = await createBot({ seed: SEED, slot, mode, role });
    // Defter ANINDA yazılıyor: process ölse de temizlik bu hesabı bulabilsin.
    ledger.record({ email: bot.email, password: bot.password, userId: bot.userId, role });
    bots.push(bot);
    report.bots.push({
      email: bot.email,
      userId: bot.userId,
      role,
      displayName: bot.displayName,
    });
    process.stdout.write(`${bot.displayName}\n`);
  }

  const feedBot = bots.find((b) => b.role === 'feed');
  if (feedBot) {
    const res = await seedFeedPost(
      feedBot,
      `e2e tohum gönderisi · ${RUN_ID}`,
      'Genel'
    );
    report.feedPost = res.ok ? res.value : { skipped: res.skipped };
    process.stdout.write(
      `[seed] akış gönderisi: ${res.ok ? res.value.postId : `ATLANDI (${res.skipped})`}\n`
    );
  }

  const campusBot = bots.find((b) => b.role === 'campus');
  if (campusBot) {
    // Nokta BOT TOKEN'IYLA çözülüyor: /api/campus/boundary anonim değil (401),
    // bu yüzden `e2e:setup` onu alamıyor.
    const fix = await resolveCampusFix(campusBot, EMAIL_DOMAIN);
    if (fix.ok) {
      writeFileSync(
        artifact('campus-fix.json'),
        JSON.stringify({ enabled: true, domain: EMAIL_DOMAIN, ...fix.value }, null, 2)
      );
      process.stdout.write(
        `[seed] kampüs sabiti: ${fix.value.lat.toFixed(6)},${fix.value.lon.toFixed(6)} ` +
          `(${fix.value.vertices} köşe)\n` +
          `       ⚠️ simülatör konumu da bu olmalı: xcrun simctl location <udid> set ` +
          `${fix.value.lat},${fix.value.lon}\n`
      );
    } else {
      process.stdout.write(`[seed] kampüs sabiti ATLANDI (${fix.skipped})\n`);
    }
    const at = fix.ok ? fix.value : { lat: campusFixLat(), lon: campusFixLon() };
    const res = await seedCampusMoment(campusBot, at);
    report.campusMoment = res.ok ? res.value : { skipped: res.skipped };
    process.stdout.write(
      `[seed] kampüs anı: ${res.ok ? res.value.momentId : `ATLANDI (${res.skipped})`}\n`
    );
  }

  writeFileSync(artifact('seed-report.json'), JSON.stringify(report, null, 2));
  return report;
}

/** `e2e:setup`in yazdığı kampüs noktası varsa onu, yoksa .env değerini kullan. */
function campusFix(): { lat: number; lon: number } | null {
  const path = artifact('campus-fix.json');
  if (!existsSync(path)) return null;
  try {
    const data = JSON.parse(readFileSync(path, 'utf8')) as {
      enabled?: boolean;
      lat?: number;
      lon?: number;
    };
    if (data.enabled && typeof data.lat === 'number' && typeof data.lon === 'number') {
      return { lat: data.lat, lon: data.lon };
    }
  } catch {
    // Bozuk dosya → .env'e düş.
  }
  return null;
}
const campusFixLat = (): number => campusFix()?.lat ?? E2E_LAT;
const campusFixLon = (): number => campusFix()?.lon ?? E2E_LON;

async function main(): Promise<void> {
  const args = parseArgs(process.argv.slice(2));

  if (args.list) {
    const entries = ledger.pending(args.runId);
    process.stdout.write(`[seed] defterde ${entries.length} bekleyen hesap\n`);
    for (const e of entries) {
      process.stdout.write(`  ${e.runId}  ${e.role.padEnd(8)}  ${e.email}\n`);
    }
    return;
  }

  if (args.purge) {
    process.stdout.write(`[seed] temizlik${args.runId ? ` (koşu ${args.runId})` : ''}…\n`);
    const r = await purge(args.runId);
    process.stdout.write(
      `[seed] silindi=${r.deleted} zaten-yok=${r.alreadyGone} başarısız=${r.failed.length}\n`
    );
    for (const f of r.failed) process.stdout.write(`  ✖ ${f.email}: ${f.reason}\n`);
    if (r.failed.length > 0) process.exitCode = 1;
    return;
  }

  const count = args.bots ?? BOT_COUNT;
  process.stdout.write(`[seed] runId=${RUN_ID} seed=${SEED} mod=${args.mode} bot=${count}\n`);
  const t0 = Date.now();
  await seedBots(count, args.mode);
  process.stdout.write(
    `[seed] bitti · ${((Date.now() - t0) / 1000).toFixed(0)} sn · rapor: ${artifact('seed-report.json')}\n`
  );
}

void main().catch((err) => {
  console.error(`\n[seed] BAŞARISIZ\n${err instanceof Error ? err.message : String(err)}\n`);
  process.exit(1);
});
