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
    a._pending === b._pending &&
    a._failed === b._failed &&
    reactionsEqual(a.reactions, b.reactions)
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
