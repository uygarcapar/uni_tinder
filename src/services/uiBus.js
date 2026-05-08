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
