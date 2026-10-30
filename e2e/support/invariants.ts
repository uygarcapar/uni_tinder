/**
 * DEĞİŞMEZ KOŞULLAR — her maymun eyleminden sonra koşan ucuz kontroller.
 *
 * Tasarım kararı: "ekran görüntüsü karşılaştırması" HİÇBİR yerde kullanılmıyor.
 * Bu uygulamada alev tam kapalıyken TAVANSIZ park ediyor ve canlılığı UI
 * thread'inde nefes alıyor, Reanimated döngüleri de hiç durmuyor — piksel
 * karşılaştırması yanlış pozitif üretmesi KESİN.
 */
import { APP_STATE_FOREGROUND, appState, withTimeout } from './driver';
import { Alerts, UnexpectedAlertError } from './alerts';
import { assertNoFatals } from './logstream';
import { els } from './selectors';

export class InvariantError extends Error {
  constructor(
    readonly invariant: string,
    message: string
  ) {
    super(`[${invariant}] ${message}`);
  }
}

/** Kapanmaması GEREKEN yüzeyler — "kapanmayan modal" dedektörü bunları muaf tutuyor. */
const STICKY_BY_DESIGN = ['gate-location', 'gate-kvkk', 'gate-update', 'gate-blocked'];

export interface InvariantContext {
  /** Kaçıncı eylemdeyiz — hata mesajında tekrar üretme için. */
  actionIndex: number;
  /** Aynı sheet/modal kökünün üst üste kaç eylemdir ekranda olduğu. */
  modalStreak: Map<string, number>;
  /** O sheet için kaç kez kapatma denendi. */
  dismissAttempts: Map<string, number>;
}

export function newInvariantContext(): InvariantContext {
  return { actionIndex: 0, modalStreak: new Map(), dismissAttempts: new Map() };
}

/** Uygulama ön planda mı? state 4 = running foreground. */
async function checkAlive(): Promise<void> {
  const state = await appState();
  if (state !== APP_STATE_FOREGROUND) {
    throw new InvariantError(
      'alive',
      `Uygulama ön planda değil (queryAppState=${state}). ` +
        `1=çalışmıyor, 2=arka planda askıda, 3=arka planda, 4=ön planda. ` +
        `Çökme ya da jetsam olası — crashlog'a bak.`
    );
  }
}

/**
 * BEYAZ EKRAN DEDEKTÖRÜ.
 *
 * Her ekran/overlay `*-screen` ya da `*-sheet` kökü taşıyor (adlandırma
 * konvansiyonunun ZORUNLU parçası). Hiçbiri yoksa ya bilinmeyen bir
 * yüzeydeyiz ya da ağaç boş.
 *
 * ⚠️ Tek başına "kök yok" yetmiyor: dev-client başlatıcısı 80 elemanlı dolu
 * bir ağaç üretiyor ve hiçbir kökü yok. İkinci kanıt olarak StaticText sayısı
 * da raporlanıyor — 0 ise gerçekten beyaz ekran, >0 ise "bilinmeyen yüzey".
 */
async function checkKnownSurface(): Promise<void> {
  const roots = await els(
    "-ios predicate string: name ENDSWITH '-screen' OR name ENDSWITH '-sheet'"
  );
  if (roots.length > 0) return;
  const texts = await els('-ios class chain:**/XCUIElementTypeStaticText');
  throw new InvariantError(
    'known-surface',
    texts.length === 0
      ? 'BEYAZ EKRAN — hiç kök işaretçi ve hiç metin yok.'
      : `Bilinmeyen yüzey — kök işaretçi yok, ${texts.length} metin var. ` +
        `(Yeni bir ekran eklenip *-screen kökü unutulmuş olabilir.)`
  );
}

/**
 * DONUK UI DEDEKTÖRÜ.
 *
 * `getPageSource` WDA'nın ana thread'inden geçiyor: 8 sn'de dönmüyorsa UI
 * kilitli. Pahalı olduğu için seyrek çağrılıyor.
 */
async function checkNotFrozen(): Promise<void> {
  const t0 = Date.now();
  await withTimeout(
    browser.getPageSource(),
    8_000,
    'getPageSource 8 sn içinde dönmedi — UI thread kilitli'
  ).catch((err: Error) => {
    throw new InvariantError('not-frozen', err.message);
  });
  const ms = Date.now() - t0;
  if (ms > 5_000) {
    process.stdout.write(`[uyarı] UI yavaş: getPageSource ${ms} ms\n`);
  }
}

/** KAPATILAMAYAN MODAL — 6 eylem üst üste + en az 2 kapatma denemesi. */
async function checkNoStuckModal(ctx: InvariantContext): Promise<void> {
  const sheets = await els("-ios predicate string: name ENDSWITH '-sheet'");
  const present = new Set<string>();
  for (const sheet of sheets) {
    const name = (await sheet.getAttribute('name')) ?? '';
    if (name) present.add(name);
  }

  for (const name of present) {
    ctx.modalStreak.set(name, (ctx.modalStreak.get(name) ?? 0) + 1);
  }
  for (const name of [...ctx.modalStreak.keys()]) {
    if (!present.has(name)) {
      ctx.modalStreak.delete(name);
      ctx.dismissAttempts.delete(name);
    }
  }

  for (const [name, streak] of ctx.modalStreak) {
    if (STICKY_BY_DESIGN.some((prefix) => name.startsWith(prefix))) continue;
    const attempts = ctx.dismissAttempts.get(name) ?? 0;
    if (streak >= 6 && attempts >= 2) {
      throw new InvariantError(
        'no-stuck-modal',
        `"${name}" ${streak} eylemdir ekranda ve ${attempts} kapatma denemesi ` +
          `sonuç vermedi. (Kapatılamaz OLMASI gerekenler: ${STICKY_BY_DESIGN.join(', ')})`
      );
    }
  }
}

async function checkNoUnexpectedAlert(): Promise<void> {
  try {
    await Alerts.expectNone('maymun');
  } catch (err) {
    if (err instanceof UnexpectedAlertError) {
      throw new InvariantError('no-unexpected-alert', err.message);
    }
    throw err;
  }
}

function checkNoFatalLog(): void {
  // `incremental` ŞART: aksi halde ilk fatal'den sonraki HER eylem aynı
  // hatayla düşer ve asıl eylem indeksi kaybolur.
  try {
    assertNoFatals({ incremental: true });
  } catch (err) {
    throw new InvariantError('no-fatal-log', (err as Error).message);
  }
}

/**
 * Sıklık kararı — hepsini her eylemde koşturmak maymunu 3× yavaşlatıyor:
 *   alive, no-fatal-log      → HER eylem (ucuz)
 *   known-surface, no-alert  → her 3 eylem
 *   no-stuck-modal           → her 3 eylem (sayaç tutarlılığı için aynı ritim)
 *   not-frozen               → her 10 eylem (getPageSource pahalı)
 */
export async function runInvariants(ctx: InvariantContext): Promise<void> {
  await checkAlive();
  checkNoFatalLog();

  if (ctx.actionIndex % 3 === 0) {
    await checkKnownSurface();
    await checkNoUnexpectedAlert();
    await checkNoStuckModal(ctx);
  }
  if (ctx.actionIndex % 10 === 0) {
    await checkNotFrozen();
  }
}
