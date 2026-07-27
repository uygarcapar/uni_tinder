/**
 * Optimistic UI + retry idempotency için client-tarafı mesaj id'si (UUID v4).
 * Backend bunu geri yansıtır → optimistic mesajı gerçek mesajla eşleştiririz.
 * crypto.randomUUID RN'de güvenilir olmadığı için Math.random tabanlı v4.
 */
export function newClientMessageId(): string {
  return "xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx".replace(/[xy]/g, (c) => {
    const r = (Math.random() * 16) | 0;
    const v = c === "x" ? r : (r & 0x3) | 0x8;
    return v.toString(16);
  });
}
