import { devLog } from '@/shared/utils/devLog';
// Cold start'ta "uygulama kabuğu tamamen oturdu" latch'i.
//
// Boot penceresi tek bir olay değil, bir zincir: NavigationContainer mount →
// Discover mount + ilk kartlar → kardeş sekmelerin staggered preload'u
// (Messages 600ms, Likes 2sn, Profile 3.4sn; latch 4.4sn — bkz. DiscoverScreen
// "hibrit warm-up"). Bu zincir bitmeden üstüne ağır bir overlay (match modal: BlurView +
// 110 parçalı konfeti + iki remote görsel) mount edilirse ShadowTree commit
// storm'a giriyoruz.
//
// Ertelenmesi gereken her şey whenAppShellReady() ile kuyruğa girer; latch bir
// kez açılır ve açık kalır, sonradan abone olan callback anında çalışır. Yani
// "uygulama saatlerdir açık, şimdi match geldi" akışında hiç gecikme yok.
//
// InteractionManager.runAfterInteractions bilerek kullanılmıyor — bu kod
// tabanında handle stuck kalıp callback'i hiç çağırmayabiliyor (bkz.
// DiscoverScreen splash notu, MessagesScreen.openChat notu).

let ready = false;
let waiters: Array<() => void> = [];

export function isAppShellReady() {
  return ready;
}

// Idempotent — birden fazla yerden (preload zinciri sonu, preload API yok,
// safety timeout) çağrılabilir; ilk çağrı latch'i açar, gerisi no-op.
export function markAppShellReady(source = "?") {
  if (ready) return;
  ready = true;
  if (__DEV__) devLog(`[boot] appShellReady ← ${source}`);
  const queued = waiters;
  waiters = [];
  queued.forEach((fn) => {
    try {
      fn();
    } catch {}
  });
}

// Latch açıksa fn senkron çağrılır. Dönen fonksiyon aboneliği iptal eder.
export function whenAppShellReady(fn: () => void): () => void {
  if (ready) {
    fn();
    return () => {};
  }
  waiters.push(fn);
  return () => {
    waiters = waiters.filter((w) => w !== fn);
  };
}
