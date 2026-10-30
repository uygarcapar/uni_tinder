/**
 * Maymunun EYLEM HAVUZU.
 *
 * ⚠️ "Tıklanabilir her şeye bas" YETKİSİ YOK. Her eylem tanımlı, hangi
 * yüzeyde anlamlı olduğunu biliyor ve `flows`/`screens` katmanından geçiyor.
 * Gerekçe: gelişigüzel dokunan bir maymun bu uygulamada hesabı siler, kişiyi
 * engeller ya da e-posta değiştirip oturumu kapatır — ürettiği "hata"ların
 * hiçbiri gerçek olmaz.
 */
import { Nav, type TabName } from '../screens/nav';
import { Keyboard, longPress } from '../support/driver';
import { els, idsWithPrefix } from '../support/selectors';
import type { Rng } from '../support/rng';
import type { ActionId } from './weights';

export type SurfaceId =
  | 'discover'
  | 'likes'
  | 'feed'
  | 'messages'
  | 'chat'
  | 'profile'
  | 'settings'
  | 'unknown';

export type ActionOutcome =
  | { kind: 'ok' }
  /** Bir kapıya çarptık — HATA DEĞİL, ölçülen bir olay. */
  | { kind: 'gate'; gate: 'paywall' | 'permission' | 'kvkk' | 'update' | 'blocked' }
  /** Eleman yoktu / pasifti — HATA DEĞİL. */
  | { kind: 'noop'; why: string };

export interface HumanCtx {
  rng: Rng;
  surface: SurfaceId;
  actionIndex: number;
  /** Kapatma denemesi sayacı — invariants'ın "kapanmayan modal" kuralı okuyor. */
  noteDismissAttempt(sheetName: string): void;
}

export interface HumanAction {
  readonly id: ActionId;
  /** Hangi yüzeylerde anlamlı. Boş = her yerde. */
  readonly surfaces: readonly SurfaceId[];
  readonly run: (ctx: HumanCtx) => Promise<ActionOutcome>;
}

const ok: ActionOutcome = { kind: 'ok' };
const noop = (why: string): ActionOutcome => ({ kind: 'noop', why });

/** Seçici varsa dokunur, yoksa `noop` — maymunun hatası değil, ekranın durumu. */
async function tapIfPresent(id: string): Promise<ActionOutcome> {
  const el = browser.$(`~${id}`);
  if (!(await el.isExisting())) return noop(`${id} yok`);
  if (!(await el.isDisplayed().catch(() => false))) return noop(`${id} görünmüyor`);
  await el.click();
  return ok;
}

async function tapRandomWithPrefix(prefix: string, rng: Rng): Promise<ActionOutcome> {
  const items = await idsWithPrefix(prefix);
  if (items.length === 0) return noop(`${prefix}* yok`);
  const target = items[rng.int(items.length)];
  if (!target) return noop(`${prefix}* seçilemedi`);
  await target.click();
  return ok;
}

const TABS: readonly TabName[] = ['Discover', 'Likes', 'Feed', 'Messages', 'Profile'];

export const ACTIONS: readonly HumanAction[] = [
  // ── Gezinme ───────────────────────────────────────────────────────────────
  {
    id: 'nav.tab',
    surfaces: [],
    run: async ({ rng }) => {
      const available = Nav.tabOrder();
      const tab = available[rng.int(available.length)] ?? TABS[0]!;
      // İnsan sekmeye DOKUNUR, deep link atmaz. Dokunma çözülmezse
      // (tab bar tipi beklenenden farklıysa) deep link'e düşüyoruz.
      try {
        await Nav.tapTab(tab);
      } catch {
        await Nav.deepLink(tab.toLowerCase() as 'discover');
      }
      return ok;
    },
  },
  {
    id: 'nav.back',
    surfaces: [],
    run: async () => {
      await browser.back().catch(() => {});
      return ok;
    },
  },
  {
    id: 'nav.deepLink',
    surfaces: [],
    run: async ({ rng }) => {
      await Nav.deepLink(rng.pick(['discover', 'likes', 'messages', 'profile'] as const));
      return ok;
    },
  },
  {
    id: 'nav.openSettings',
    surfaces: ['profile'],
    run: async () => tapIfPresent('profile-btn-settings'),
  },

  // ── Keşif ─────────────────────────────────────────────────────────────────
  { id: 'discover.pass', surfaces: ['discover'], run: async () => tapIfPresent('discover-btn-pass') },
  { id: 'discover.like', surfaces: ['discover'], run: async () => tapIfPresent('discover-btn-like') },
  { id: 'discover.fire', surfaces: ['discover'], run: async () => tapIfPresent('discover-btn-fire') },
  {
    id: 'discover.rewind',
    surfaces: ['discover'],
    // Free kullanıcıda İLK basışta paywall açıyor — bu bir kapı karşılaşması.
    run: async () => tapIfPresent('discover-btn-rewind'),
  },
  {
    id: 'discover.expandCard',
    surfaces: ['discover'],
    run: async () => {
      const card = browser.$('~discover-screen');
      if (!(await card.isExisting())) return noop('kart yok');
      const { width, height } = await browser.getWindowSize();
      // Kartın ORTASINA dokun: kenarlar chrome butonlarının ve Fire çekişinin.
      await browser.performActions([
        {
          type: 'pointer',
          id: 'finger1',
          parameters: { pointerType: 'touch' },
          actions: [
            { type: 'pointerMove', duration: 0, x: Math.round(width / 2), y: Math.round(height * 0.45) },
            { type: 'pointerDown', button: 0 },
            { type: 'pause', duration: 60 },
            { type: 'pointerUp', button: 0 },
          ],
        },
      ]);
      await browser.releaseActions();
      return ok;
    },
  },

  // ── Beğeniler ─────────────────────────────────────────────────────────────
  {
    id: 'likes.quickDecide',
    surfaces: ['likes'],
    // ⚠️ ÖN EK DEĞİL TAM AD: kartın tik/X butonları `LikerSwipeModal` içinde
    // ve aynı anda YALNIZ BİR kart görünüyor, yani indeksli bir aile yok.
    // Önceki hâli `likes-accept-` ön ekini arıyordu ve hiçbir zaman eşleşmiyordu
    // — maymun sessizce `noop` dönüyordu.
    run: async ({ rng }) =>
      rng.next() < 0.6 ? tapIfPresent('likes-accept') : tapIfPresent('likes-reject'),
  },

  // ── Sohbet ────────────────────────────────────────────────────────────────
  {
    id: 'chat.open',
    surfaces: ['messages'],
    run: async ({ rng }) => tapRandomWithPrefix('msgs-row-', rng),
  },
  {
    id: 'chat.sendText',
    surfaces: ['chat'],
    run: async ({ actionIndex }) => {
      const input = browser.$('~chat-input-text');
      if (!(await input.isExisting())) return noop('composer yok');
      await input.click();
      await input.setValue(`e2e maymun #${actionIndex}`);
      await Keyboard.dismissIfOpen();
      return tapIfPresent('chat-btn-send');
    },
  },
  {
    id: 'chat.reactToBubble',
    surfaces: ['chat'],
    run: async ({ rng }) => {
      const bubbles = await idsWithPrefix('chat-bubble-');
      if (bubbles.length === 0) return noop('balon yok');
      const target = bubbles[rng.int(bubbles.length)];
      if (!target) return noop('balon seçilemedi');
      // `els()` çözülmüş Element veriyor, `longPress` zincirlenebilir referans
      // bekliyor → kimliği üzerinden yeniden seç.
      const name = (await target.getAttribute('name')) ?? '';
      await longPress(browser.$(`~${name}`), 600);
      return ok;
    },
  },
  {
    id: 'chat.swipeReply',
    surfaces: ['chat'],
    run: async () => noop('yanıt jesti Page Object bekliyor (ReplySwipeRow seçicisi Tur 4b)'),
  },

  // ── Akış / kampüs / profil ────────────────────────────────────────────────
  {
    id: 'feed.like',
    surfaces: ['feed'],
    run: async ({ rng }) => tapRandomWithPrefix('feed-card-like-', rng),
  },
  { id: 'feed.compose', surfaces: ['feed'], run: async () => tapIfPresent('feed-btn-compose') },
  { id: 'campus.openMap', surfaces: ['feed'], run: async () => tapIfPresent('feed-btn-campus') },
  {
    id: 'profile.scroll',
    surfaces: ['profile'],
    run: async () => {
      const { width, height } = await browser.getWindowSize();
      await browser.performActions([
        {
          type: 'pointer',
          id: 'finger1',
          parameters: { pointerType: 'touch' },
          actions: [
            { type: 'pointerMove', duration: 0, x: Math.round(width / 2), y: Math.round(height * 0.7) },
            { type: 'pointerDown', button: 0 },
            { type: 'pointerMove', duration: 300, x: Math.round(width / 2), y: Math.round(height * 0.3) },
            { type: 'pointerUp', button: 0 },
          ],
        },
      ]);
      await browser.releaseActions();
      return ok;
    },
  },

  // ── Modal aç/kapa ─────────────────────────────────────────────────────────
  { id: 'modal.openFilter', surfaces: ['discover'], run: async () => tapIfPresent('discover-btn-filter') },
  { id: 'modal.openModeSelector', surfaces: ['discover'], run: async () => tapIfPresent('discover-btn-mode') },
  { id: 'modal.openPhotoSource', surfaces: ['profile'], run: async () => tapIfPresent('profile-btn-add-photo') },
  {
    id: 'sheet.dismissByBackdrop',
    surfaces: [],
    run: async (ctx) => {
      const sheets = await els("-ios predicate string: name ENDSWITH '-sheet'");
      if (sheets.length === 0) return noop('açık sheet yok');
      const name = (await sheets[0]?.getAttribute('name')) ?? 'sheet';
      ctx.noteDismissAttempt(name);
      // Üst %12: sheet'in ÜSTÜNDEKİ backdrop. Sheet'in kendi gövdesine
      // dokunmak kapatmaz, içindeki bir kontrolü tetikler.
      const { width, height } = await browser.getWindowSize();
      await browser.performActions([
        {
          type: 'pointer',
          id: 'finger1',
          parameters: { pointerType: 'touch' },
          actions: [
            { type: 'pointerMove', duration: 0, x: Math.round(width / 2), y: Math.round(height * 0.06) },
            { type: 'pointerDown', button: 0 },
            { type: 'pause', duration: 50 },
            { type: 'pointerUp', button: 0 },
          ],
        },
      ]);
      await browser.releaseActions();
      return ok;
    },
  },

  // ── Kaotik ────────────────────────────────────────────────────────────────
  {
    id: 'chaos.backgroundForeground',
    surfaces: [],
    run: async () => {
      // AppState devri: foreground'da önce refresh sonra fanout koşuyor ve
      // SignalR yeniden bağlanıyor. Ağırlığı düşük tutuldu (bağlantı fırtınası
      // backend log'unu kirletiyor).
      await browser.execute('mobile: backgroundApp', { seconds: 2 });
      return ok;
    },
  },
  {
    id: 'chaos.rapidDoubleTap',
    surfaces: ['discover'],
    run: async () => {
      // `BUTTON_SWIPE_LOCK_MS = 1300` kilidini zorluyor: ikinci basış
      // YUTULMALI, iki kart birden geçmemeli.
      const first = await tapIfPresent('discover-btn-pass');
      if (first.kind !== 'ok') return first;
      await tapIfPresent('discover-btn-pass');
      return ok;
    },
  },
  {
    id: 'chaos.killAndRelaunch',
    surfaces: [],
    run: async () => {
      // Outbox + SQLite kalıcılığı: öldür, aç, mesaj hâlâ orada mı.
      const { relaunchIntoApp } = await import('../support/devClient');
      await relaunchIntoApp();
      return ok;
    },
  },
  { id: 'chaos.rotate', surfaces: [], run: async () => noop('portrait kilitli (requireFullScreen)') },
];

export const ACTION_BY_ID = new Map<ActionId, HumanAction>(ACTIONS.map((a) => [a.id, a]));
