/**
 * "Yazıyor..." için İSTEMCİ TARAFI zaman aşımı.
 *
 * Kök neden (Eylül 2026 geri bildirimi: "Remzi yarım bıraktı, 2 saattir
 * yazıyor gözüküyor"): alıcı taraf `UserStartedTyping` ile göstergeyi açıyor
 * ve KAPATMAK İÇİN YALNIZ `UserStoppedTyping`e güveniyordu. O event tek bir
 * sebeple bile kaçarsa (alıcı o an arka planda / soket kopuk, gönderenin
 * StopTyping'i bağlantısızken düştü, hub rate limiter'ı yuttu) gösterge
 * uygulama yeniden başlatılana kadar kalıyordu. Sunucudaki Redis TTL'i de
 * yardım etmiyor: anahtar 5 sn'de siliniyor ama silinince kimseye
 * "durdu" gönderilmiyor, anahtarı okuyan da yok.
 *
 * Çözüm WhatsApp'ınkiyle aynı sözleşme:
 *  - Gönderen yazdıkça `StartTyping`i periyodik TEKRARLAR (heartbeat, bkz.
 *    MessageComposer TYPING_HEARTBEAT_MS).
 *  - Alıcı her `StartTyping`te sayacı SIFIRDAN kurar; TTL dolunca kendi
 *    kendine kapatır. `StopTyping` gelirse hemen kapatır.
 *  - TTL heartbeat'ten belirgin uzun (jitter payı): 3 sn'de bir gelen
 *    heartbeat 6 sn'lik pencereyi hiç boşa düşürmez, gösterge titremez.
 *
 * Saf modül: zamanlayıcılar enjekte edilebilir, test sahte saatle koşuyor.
 */

export const TYPING_EXPIRE_MS = 6000;

export interface TypingEventPayload {
  conversationId: string;
  userId: string;
}

type TimerHandle = ReturnType<typeof setTimeout>;

interface TypingExpiryOptions {
  onExpire: (payload: TypingEventPayload) => void;
  ttlMs?: number;
  setTimer?: (fn: () => void, ms: number) => TimerHandle;
  clearTimer?: (handle: TimerHandle) => void;
}

export interface TypingExpiry {
  /** `UserStartedTyping` geldi — sayacı (yeniden) kur. */
  started: (payload: TypingEventPayload) => void;
  /** `UserStoppedTyping` geldi — bekleyen sayacı iptal et. */
  stopped: (payload: TypingEventPayload) => void;
  /** Tüm sayaçları iptal et (reconnect, foreground, unmount). */
  clearAll: () => void;
  /** Test/teşhis: bekleyen sayaç sayısı. */
  pendingCount: () => number;
}

const keyOf = (p: TypingEventPayload) => `${p.conversationId}:${p.userId}`;

export function createTypingExpiry({
  onExpire,
  ttlMs = TYPING_EXPIRE_MS,
  setTimer = setTimeout,
  clearTimer = clearTimeout,
}: TypingExpiryOptions): TypingExpiry {
  const timers = new Map<string, TimerHandle>();

  const stopped = (payload: TypingEventPayload) => {
    const key = keyOf(payload);
    const handle = timers.get(key);
    if (handle !== undefined) {
      clearTimer(handle);
      timers.delete(key);
    }
  };

  const started = (payload: TypingEventPayload) => {
    if (!payload?.conversationId || !payload?.userId) return;
    stopped(payload);
    const key = keyOf(payload);
    const handle = setTimer(() => {
      timers.delete(key);
      onExpire(payload);
    }, ttlMs);
    timers.set(key, handle);
  };

  const clearAll = () => {
    timers.forEach((handle) => clearTimer(handle));
    timers.clear();
  };

  return { started, stopped, clearAll, pendingCount: () => timers.size };
}
