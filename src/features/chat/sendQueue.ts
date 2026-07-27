/**
 * Outbound mesaj gönderim kuyruğu — FIFO, tek eşzamanlı (concurrency 1).
 *
 * Rapid-fire gönderimlerde her mesaj bağımsız bir SignalR `invoke` fırlatıyordu;
 * invoke'lar üst üste binince (render-churn ile JS thread baskısı altında) bağlantı
 * tıkanıyor, `MessageSent`/`ReceiveMessage` broadcast'leri geç işlenip pending
 * watchdog'unu aşıyor ve gereksiz resend fırtınası + rate-limit hatası doğuyordu.
 *
 * Kuyruk yalnızca NETWORK kısmını serialize eder — optimistic append UI'da anında
 * kalır, kullanıcı akıcılığı bozulmaz. Görevler settle sırasına göre paslanır,
 * böylece mesaj sırası da deterministik olur.
 */
let tail: Promise<unknown> = Promise.resolve();

export function enqueueSend<T>(task: () => Promise<T>): Promise<T> {
  const result = tail.then(task, task);
  // Zinciri canlı tut: bir görev reject etse bile sonraki görev çalışsın.
  tail = result.then(
    () => undefined,
    () => undefined,
  );
  return result;
}

/**
 * Bir promise'i verilen süre içinde çözülmezse reject eder. Asılı kalan hub
 * invoke'unun (withServerTimeout 60sn) tüm kuyruğu bloklamasını engeller —
 * timeout'ta caller HTTP fallback'e düşer.
 */
export function withTimeout<T>(promise: Promise<T>, ms: number): Promise<T> {
  let timer: ReturnType<typeof setTimeout>;
  const timeout = new Promise<never>((_, reject) => {
    timer = setTimeout(() => reject(new Error('send-timeout')), ms);
  });
  return Promise.race([promise, timeout]).finally(() => clearTimeout(timer)) as Promise<T>;
}
