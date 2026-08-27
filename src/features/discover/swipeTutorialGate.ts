import { useSyncExternalStore } from "react";

/**
 * "Swipe demosu sırada / oynuyor" bayrağı — görünürlük kapısını bekletmek için.
 *
 * NEDEN: `ProfileHiddenGate` navigator seviyesinde ve kartın ÜSTÜNDE açılıyor.
 * Yeni kaydolan kullanıcının iki fotoğrafı da incelemede olduğu için kapı ilk
 * girişte hemen açılıyor, ilk giriş demosu da onun ARKASINDA oynayıp
 * "görüldü" bayrağını yazıyordu: jest hiç görülmeden bir daha da oynamıyordu.
 * Demo çözülene kadar (oynadı ya da oynamayacağı kesinleşti) kapı bekliyor.
 *
 * Değer MODÜL seviyesinde: yazan (DiscoverScreen) ile okuyan (AppNavigator
 * altındaki kapı) ayrı ağaçlarda ve kapı, Discover mount olmadan da çiziliyor.
 * Varsayılan `false` — Discover hiç mount olmamışsa kapı normal davranır.
 */
let blocking = false;
const subscribers = new Set<() => void>();

/** Yalnız DiscoverScreen yazar; unmount'ta mutlaka `false`'a döner. */
export function setSwipeTutorialBlocking(next: boolean): void {
  if (blocking === next) return;
  blocking = next;
  subscribers.forEach((cb) => cb());
}

const subscribe = (onStoreChange: () => void) => {
  subscribers.add(onStoreChange);
  return () => {
    subscribers.delete(onStoreChange);
  };
};

const getSnapshot = () => blocking;

/** `true` → demo bitene kadar görünürlük kapısı açılmamalı. */
export function useSwipeTutorialBlocking(): boolean {
  return useSyncExternalStore(subscribe, getSnapshot, getSnapshot);
}
