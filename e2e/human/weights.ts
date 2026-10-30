/**
 * Maymunun eylem ağırlıkları.
 *
 * Sayılar bir gerçek kullanıcının dağılımına yakın tutuldu: gezinme ve Keşif
 * kararları ağır, kaotik eylemler seyrek. Amaç "rastgele dokunmak" değil,
 * ürünü GERÇEKÇİ bir oranla yormak — dejenere bir koşu (20 kez üst üste pass)
 * ne kapsama üretir ne de inandırıcı bir hata.
 */
export const WEIGHTS = {
  // ── Gezinme (%25) ─────────────────────────────────────────────────────────
  'nav.tab': 14,
  'nav.back': 6,
  // "Bildirime bastım" taklidi — insan deep link atmaz, ama push ile gelir.
  'nav.deepLink': 2,
  'nav.openSettings': 3,

  // ── Keşif kararları (%30) — uygulamanın kalbi ─────────────────────────────
  'discover.pass': 10,
  'discover.like': 9,
  'discover.fire': 4,
  'discover.rewind': 2,
  'discover.expandCard': 5,

  // ── Sohbet (%18) ──────────────────────────────────────────────────────────
  'chat.open': 6,
  'chat.sendText': 6,
  'chat.reactToBubble': 3,
  'chat.swipeReply': 3,

  // ── İkincil sosyal (%14) ──────────────────────────────────────────────────
  'likes.quickDecide': 5,
  'feed.like': 3,
  'feed.compose': 2,
  'campus.openMap': 2,
  'profile.scroll': 2,

  // ── Modal aç/kapa (%8) — maymunun ASIL avı kapatılabilirlik ───────────────
  'modal.openFilter': 3,
  'modal.openModeSelector': 2,
  'modal.openPhotoSource': 1,
  'sheet.dismissByBackdrop': 2,

  // ── Kaotik (%5) ───────────────────────────────────────────────────────────
  'chaos.backgroundForeground': 2,
  // `BUTTON_SWIPE_LOCK_MS = 1300` kilidini zorlar.
  'chaos.rapidDoubleTap': 2,
  // Outbox + SQLite kalıcılığı: öldür, aç, mesaj duruyor mu.
  'chaos.killAndRelaunch': 1,
  // `requireFullScreen: true` + portrait → rotasyon anlamsız, bilerek 0.
  'chaos.rotate': 0,
} as const;

export type ActionId = keyof typeof WEIGHTS;

/**
 * DOYGUNLUK: bir eylem koştuğunda ağırlığı ×0.55'e iniyor, 8 eylem boyunca
 * tabana geri tırmanıyor. "20 kez üst üste pass'a basan" koşuları engelliyor.
 */
export const SATURATION_FACTOR = 0.55;
export const SATURATION_RECOVERY = 8;

/**
 * BAĞLAMSAL ÇARPANLAR.
 *
 * `paywallOpen` → insan paywall'ı kapatır: kapatma eylemi 8× ağırlaşıyor.
 * `quotaExhausted` → kota bitince beğeni ağırlığı 0, AMA 0'a düşmeden önce
 * bir kez basılmış oluyor; paywall karşılaşması istenen şey.
 */
export interface WeightContext {
  paywallOpen: boolean;
  likeQuotaExhausted: boolean;
  fireQuotaExhausted: boolean;
  hasMatch: boolean;
  feedEnabled: boolean;
}

export function contextualMultiplier(id: ActionId, ctx: WeightContext): number {
  if (ctx.paywallOpen) {
    return id === 'sheet.dismissByBackdrop' || id === 'nav.back' ? 8 : 0.1;
  }
  if (id === 'discover.like' && ctx.likeQuotaExhausted) return 0;
  if (id === 'discover.fire' && ctx.fireQuotaExhausted) return 0;
  if ((id === 'chat.open' || id === 'chat.sendText') && !ctx.hasMatch) return 0;
  if (id.startsWith('feed.') && !ctx.feedEnabled) return 0;
  return 1;
}
