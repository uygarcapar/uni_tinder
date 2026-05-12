import { makeMutable } from "react-native-reanimated";

/**
 * Tiny pub-sub singleton — global UI events için (settings modal'ı her ekrandan açabilmek vb.).
 * Redux yerine basit kalsın diye; sadece imperative işlemler için.
 *
 * Kullanım:
 *   uiBus.emit('openSettings');
 *   const unsub = uiBus.on('openSettings', () => { ... });
 */
class UIBus {
  constructor() {
    this.listeners = new Map();
  }
  on(event, cb) {
    if (!this.listeners.has(event)) this.listeners.set(event, new Set());
    this.listeners.get(event).add(cb);
    return () => this.listeners.get(event)?.delete(cb);
  }
  emit(event, ...args) {
    const set = this.listeners.get(event);
    if (!set) return;
    set.forEach((cb) => {
      try { cb(...args); } catch {}
    });
  }
}

const uiBus = new UIBus();
export default uiBus;

// Cross-component shared value — SwipeCard scrollY → cardExpandAnim → TabNavigator
// translateY. Worklet-safe: class instance'a property olarak değil, ayrı named
// export olarak (worklet'ler class instance erişimi vermiyor).
// 0 = card mode (top), 1 = expanded (scroll >= 150).
export const cardExpandAnim = makeMutable(0);

// Top card'ın pull-down (super-like) progress'i. Bottom card scale'i bunu
// okuyup pull oranına göre öne büyür ("arkadaki kart önden gelir" hissi).
export const cardPullProgress = makeMutable(0);

// Card stack container'ının "tab bar üstünde dur ↔ tüm ekrana yayıl" durumu.
// cardExpandAnim'den ayrı: gesture sırasında değişmez, sadece expand/collapse
// commit olduğunda withTiming ile 0↔1 animasyonu yapılır (paddingBottom layout
// değişimi gesture frame'lerinde lag yaratıyordu).
export const containerExpand = makeMutable(0);
