# Akış gönderisi üç nokta menüsü — ara modal

Tarih: 2026-11-04

## Niyet

Akış kartındaki üç nokta bugün ara adımsız davranıyor: kendi gönderinde
doğrudan silme Alert'i, başkasınınkinde doğrudan şikayet modalı. İstenen,
araya SwipeCard'ın üç noktasındakiyle (ProfileOptionsSheet) aynı tasarımda
bir menü modalı girmesi: gönderinin tam tarihi/dakikası görünsün, şikayet
oradan açılsın, kendi gönderiyse silme de orada olsun.

## Hedefler / hedef olmayanlar

- Hedef: üç nokta → ara modal (tarih + duruma göre şikayet VEYA sil).
- Hedef: tasarım birebir ProfileOptionsSheet kalıbı — AppModal, dynamicSizing,
  closeButton yok, radius-36 kapsül satırlar, destructive satır dolu kırmızı.
- Hedef değil: yanıt (Reply) şikayeti geri getirmek, engelleme satırı eklemek,
  silme onay metnini değiştirmek.

## Kararlar (konuşmada verildi)

- Kendi gönderide şikayet satırı YOK (tarih + sil); başkasınınkinde tarih +
  şikayet. (benim önerim, onaylandı)
- "Sil" yine mevcut onay Alert'ine gider — "hak geri gelmiyor + bekleyen
  yanıtlar düşüyor" uyarısı atlanmaz. (benim önerim, onaylandı)
- Tarih biçimi: bugün → "bugün 10:23", dün → "dün 10:23", <7 gün →
  "pazartesi 10:23", daha eskisi → "3 kasım 10:23" (kullanıcı onayı: haftadan
  eskide tam tarihe düş). Akış kartındaki küçük-harf kuralına uyar
  (toDisplayLowercase).

## Yaklaşımlar

1. **Yeni `FeedPostOptionsSheet` bileşeni (SEÇİLEN).** ProfileOptionsSheet'in
   Section/ActionRow kalıbını akışa taşır; FeedScreen yalnız state bağlar.
2. ProfileOptionsSheet'i prop'larla genelleştirmek — reddedildi: o bileşen
   bilerek "yalnız güvenlik" menüsü, tarih satırı ve koşullu sil onu başka
   bir şeye çevirir.
3. FeedScreen içine inline modal — reddedildi: ekran zaten çok büyük, kalıp
   yeniden kullanılabilir olmalı.

## Nasıl

- `src/features/feed/components/FeedPostOptionsSheet.tsx`: AppModal; başlık
  i18n'den; üstte Section tarzı satırda saat ikonu + tam tarih (ikincil gri);
  altta tek aksiyon satırı — `isMine` ise destructive "Sil", değilse bayraklı
  "Şikayet et". Satır basılınca önce sheet kapanır, sonra callback.
- Tarih yazımı `feedText.ts`'e saf fonksiyon olarak girer
  (`formatPostTimestamp(iso, t)`), `parseUtc` kullanır (Z'siz damga tuzağı),
  testi `tests/features/feed`e yazılır.
- FeedScreen: `handlePostMenu` artık `menuPost` state'ini doldurur; sheet'in
  onReport'u `setReportTarget`a, onDelete'i mevcut Alert+`deletePost.mutate`
  akışına bağlanır. FeedReportSheet ve silme davranışı aynen kalır.
- i18n: tr/en'e menü başlığı, "bugün"/"dün" (mevcut anahtar varsa o) ve satır
  etiketleri.

## Yapana kalanlar

- Şikayet sheet'inin, menü kapanırken açılma sırası (stackBehavior/zamanlama)
  — DiscoverScreen'deki mevcut sıralama neyse o.
- "Sil" satır ikonu (çöp kutusu SF sembolü + lucide fallback) seçimi.
