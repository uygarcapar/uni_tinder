import { makeMutable } from "react-native-reanimated";

type EventCallback = (...args: any[]) => void;

class UIBus {
  private listeners: Map<string, Set<EventCallback>> = new Map();

  on(event: string, cb: EventCallback): () => void {
    if (!this.listeners.has(event)) this.listeners.set(event, new Set());
    this.listeners.get(event)!.add(cb);
    return () => this.listeners.get(event)?.delete(cb);
  }

  emit(event: string, ...args: any[]): void {
    const set = this.listeners.get(event);
    if (!set) return;
    set.forEach((cb) => {
      try { cb(...args); } catch {}
    });
  }
}

const uiBus = new UIBus();
export default uiBus;

// Cross-component shared value — SwipeCard scrollY → cardExpandAnim → TabNavigator translateY.
// Worklet-safe: class instance'a property olarak değil, ayrı named export olarak.
// 0 = card mode (top), 1 = expanded (scroll >= 150).
export const cardExpandAnim = makeMutable(0);

// Top card'ın pull-down (super-like) progress'i.
export const cardPullProgress = makeMutable(0);

// Card stack container'ının expand/collapse durumu.
export const containerExpand = makeMutable(0);
