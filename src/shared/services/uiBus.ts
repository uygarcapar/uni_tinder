import { cancelAnimation, makeMutable } from "react-native-reanimated";

type EventCallback = (...args: any[]) => void;

class UIBus {
  private listeners: Map<string, Set<EventCallback>> = new Map();

  on(event: string, cb: EventCallback): () => void {
    if (!this.listeners.has(event)) this.listeners.set(event, new Set());
    this.listeners.get(event)!.add(cb);
    return () => this.listeners.get(event)?.delete(cb);
  }

  /**
   * Bu olayı dinleyen var mı? Yayıncının "kimse dinlemiyorsa ben hallederim"
   * diyebilmesi için — ör. lazy mount edilmiş bir ekran kanonik tazelemeyi
   * üstlenemiyorsa yayıncı kendi (daha dar kapsamlı) fallback'ini çalıştırır.
   */
  hasListeners(event: string): boolean {
    return (this.listeners.get(event)?.size ?? 0) > 0;
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

// Buraya bir dönem `cardStackMotion` eklendi ("deste kabı hareketli mi" —
// kart camlarının bekleyeceği sinyal), sonra kaldırıldı: camı GECİKTİREN her
// kapı hatanın kendisiydi, çünkü efekt view'ın ilk layout turunda kurulmak
// zorunda. Gerekçe CardSectionBox'ın tepesinde.

/**
 * Expand/pull durumunu sıfırla — kart destesi her taze doğuşunda.
 *
 * Bu üç değer MODÜL seviyesinde: onları yazan ağaç (Discover destesi) unmount
 * olsa da değer ayakta kalıyor. Kart expanded'ken (1) tema değişimi ağacı
 * remount ediyor (App.tsx `key={mode}`) ya da (2) deste tazelenip top kart
 * değişiyorsa, yeni kart 1'de donmuş expand değeriyle doğuyordu: header soluk +
 * kart header'ın üstüne binmiş + tab bar'a taşmış + chevron ters. Reset'i tek
 * tek kartların mount effect'ine bırakmak yetmiyor — deste o an boşsa (tazeleme
 * penceresi, lazy mount edilmemiş sekme) resetleyecek kart YOK, dolayısıyla
 * değer 1'de kalıyor ve yalnız reload düzeltiyordu (modül yeniden evaluate
 * olduğu için).
 *
 * Uçan animasyon varsa önce iptal edilir; aksi halde spring bir sonraki frame'de
 * 0 yazımını ezerdi.
 */
export function resetCardExpandState(): void {
  cancelAnimation(cardExpandAnim);
  cancelAnimation(cardPullProgress);
  cancelAnimation(containerExpand);
  cardExpandAnim.value = 0;
  cardPullProgress.value = 0;
  containerExpand.value = 0;
}

/**
 * "Şu fotoğrafı düzenleme modalında göster" isteği — moderasyon bildirimlerinden
 * (PhotoApproved / PhotoRejected / PhotoAppealResolved) geliyor.
 *
 * Neden sadece `emit` yetmiyor: uiBus replay yapmıyor ve Profil sekmesi lazy
 * mount. Push'tan COLD START'ta yönlendirme, ProfileScreen daha ağaçta yokken
 * çalışıyor — düz bir emit boşluğa düşerdi. İstek bu yüzden modülde BEKLİYOR;
 * ekran ister o an dinliyor olsun (emit), ister sonradan mount olsun
 * (`consumePhotoHighlight`), aynı isteği bir KEZ tüketiyor.
 */
let pendingPhotoHighlight: string | null = null;

export function requestPhotoHighlight(photoId: string | number): void {
  pendingPhotoHighlight = String(photoId);
  uiBus.emit("openProfilePhoto", { photoId: pendingPhotoHighlight });
}

/** Bekleyen isteği okur ve TÜKETİR (iki kez uygulanmasın). */
export function consumePhotoHighlight(): string | null {
  const id = pendingPhotoHighlight;
  pendingPhotoHighlight = null;
  return id;
}
