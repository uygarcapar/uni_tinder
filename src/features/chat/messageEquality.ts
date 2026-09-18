/**
 * Mesaj "içerik eşitliği" — tek kaynak.
 *
 * Aynı alan seti ÜÇ yerde birden kullanılır ve ayrışmaları bug üretir:
 *  - MessageBubble memo comparator'ı (balon ne zaman yeniden çizilir)
 *  - ChatMessageList itemsAreEqual (LegendList "structural data change" kararı)
 *  - chatSlice reconcile merge'i (server kopyası mı, eski referans mı)
 * Buradaki alanlar balonun GÖSTERDİĞİ her şeyi kapsamalı; comparator'da olmayan
 * bir alan server'da değişirse balon stale kalır (mevcut memo davranışıyla aynı
 * risk sınıfı — yeni alan eklerken buraya da ekle).
 */
export function reactionsEqual(a: any, b: any) {
  if (a === b) return true;
  const la = a?.length || 0;
  const lb = b?.length || 0;
  if (la !== lb) return false;
  for (let i = 0; i < la; i++) {
    if (a[i].emoji !== b[i].emoji || (a[i].count || 0) !== (b[i].count || 0)) return false;
    // userIds balonda GÖSTERİLMEZ ama "hangi reaction benim" kararını besler
    // (kullanıcı başına tek reaction → yeni emoji eskisini değiştirir). Karşılaştırmaya
    // girmezse reconcile eşit sayıp eski/bayat userIds'li kopyayı koruyabilir.
    if ((a[i].userIds || []).join(",") !== (b[i].userIds || []).join(",")) return false;
  }
  return true;
}

export function messageContentEqual(a: any, b: any) {
  if (a === b) return true;
  if (!a || !b) return false;
  return (
    a.id === b.id &&
    a.content === b.content &&
    // Sesli mesaj: optimistic baloncuk yerel süre/dalga formuyla doğuyor, server
    // kopyası gelince (ve mediaUrl dolunca) balon tazelenmeli.
    a.contentType === b.contentType &&
    a.mediaUrl === b.mediaUrl &&
    a.durationMs === b.durationMs &&
    a.waveformPeaks === b.waveformPeaks &&
    a.readAt === b.readAt &&
    a.deliveredAt === b.deliveredAt &&
    a.editedAt === b.editedAt &&
    a.deletedAt === b.deletedAt &&
    // Hesap silinince mesaj yerinde kalıyor, yalnız gönderen anonimleşiyor —
    // yani mesaj oluştuktan SONRA değişebilen bir alan. messageIdentityEqual'a
    // koysaydık balon bayat kalırdı.
    !!a.isSenderDeleted === !!b.isSenderDeleted &&
    a._pending === b._pending &&
    a._failed === b._failed &&
    reactionsEqual(a.reactions, b.reactions)
  );
}

/**
 * "Kimlik" eşitliği — messageContentEqual'ın KAPSAMADIĞI alanlar.
 *
 * Neden ayrı bir fonksiyon: messageContentEqual kasten dar, çünkü "balon
 * yeniden çizilsin mi" sorusunu cevaplıyor. Ama SQLite projeksiyonunda ikinci
 * bir soru var — "bu satır hâlâ AYNI mesaj mı" — ve onu cevaplayan alanlar
 * (sentAt, senderId, conversationId…) hiçbir comparator'da yoktu. İkisini tek
 * comparator'a katmak balonu gereksiz yere yeniden çizdirirdi.
 *
 * INVARIANT: iki comparator'da da olmayan bir alan insert'ten SONRA asla
 * değişmemeli. Yeni alan eklerken ya buraya ya messageContentEqual'a koy.
 *
 * `id` kasten YOK: temp-<cmid> → server id geçişinde değişen tek alan o ve
 * orası meşru (bkz. messageCache.rekey); messageContentEqual zaten karşılaştırıyor.
 */
export function messageIdentityEqual(a: any, b: any) {
  if (a === b) return true;
  if (!a || !b) return false;
  return (
    a.sentAt === b.sentAt &&
    a.senderId === b.senderId &&
    a.conversationId === b.conversationId &&
    a.clientMessageId === b.clientMessageId &&
    !!a.isSystemMessage === !!b.isSystemMessage &&
    a.localizationKey === b.localizationKey &&
    !!a.deletedForEveryone === !!b.deletedForEveryone &&
    a._localUri === b._localUri &&
    a.replyToMessageId === b.replyToMessageId &&
    (a.replyTo?.id ?? null) === (b.replyTo?.id ?? null)
  );
}

/**
 * Liste item'ı (mesaj VEYA gün separator'ı) eşitliği — LegendList itemsAreEqual.
 * Separator objeleri her messagesWithSeparators useMemo'sunda yeniden yaratılır
 * (referansları hep taze); id+label eşitliği olmadan LegendList her rebuild'i
 * yapısal değişim sayıp tüm container'ları resetler.
 */
export function chatListItemsEqual(a: any, b: any) {
  if (a === b) return true;
  if (!a || !b) return false;
  if (a.__separator || b.__separator) {
    return !!a.__separator && !!b.__separator && a.id === b.id && a.label === b.label;
  }
  // Rematch kapısı (gizli geçmiş satırı): separator gibi her useMemo'da yeniden
  // yaratılan sanal satır — içeriği id'sinden ibaret, "yükleniyor" state'i
  // bileşenin İÇİNDE (bkz. HiddenHistoryBanner).
  if (a.__hiddenHistory || b.__hiddenHistory) {
    return !!a.__hiddenHistory && !!b.__hiddenHistory;
  }
  return messageContentEqual(a, b);
}
