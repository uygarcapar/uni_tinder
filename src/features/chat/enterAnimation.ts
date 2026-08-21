/**
 * "Az önce BU cihazdan gönderildi" kaydı — gönderim balonunun alttan süzülerek
 * girmesi (MessageBubble) için.
 *
 * NEDEN mesaj nesnesinde taşınmıyor: bayrak mesaja yazılsa balon her yeniden
 * render'da (hub echo id'yi temp-x → sunucu id'siyle değiştiriyor, _pending ack
 * gelince düşüyor, recycle edilen container aynı mesaja geri dönebiliyor) tekrar
 * animasyona girerdi. Kayıt burada durur ve satır başına TEK KEZ tüketilir.
 *
 * Anahtar clientMessageId: liste keyExtractor'ı da onu kullanıyor (temp → sunucu
 * id geçişinde satır kimliği değişmesin diye) — ikisi aynı kimlikten beslenir.
 */
const pending = new Set<string>();

// Render'a hiç girmeyen gönderim (ekran kapandı, mesaj 402'de silindi) kaydı
// açıkta bırakır; set sınırlı tutulur, taşarsa en eski kayıt düşer.
const MAX_PENDING = 20;

export function markMessageEntering(clientMessageId?: string | null) {
  if (!clientMessageId) return;
  if (pending.size >= MAX_PENDING) {
    const oldest = pending.values().next().value;
    if (oldest) pending.delete(oldest);
  }
  pending.add(clientMessageId);
}

/** Kayıt varsa TÜKETİR (true döner) — ikinci çağrı hep false. */
export function consumeMessageEntering(clientMessageId?: string | null) {
  if (!clientMessageId || !pending.has(clientMessageId)) return false;
  pending.delete(clientMessageId);
  return true;
}
