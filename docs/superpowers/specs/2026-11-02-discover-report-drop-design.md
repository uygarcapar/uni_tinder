# Keşif'te şikayet sonrası kartın düşmesi — kısa tasarım

**Tarih:** 2026-11-02 · **Durum:** Onaylandı (sohbette)

## Niyet / neden

Keşif'te bir profili şikayet eden kullanıcı o profille işini bitirmiştir.
Bugün kart yalnızca "ayrıca engelle" switch'i açıkken düşüyor
(`result.blocked` koşulu, DiscoverScreen ReportModal `onSuccess`). Switch
kapatılıp sadece şikayet edilince kart ekranda kalıyor ve sunucu tarafında
da eleme olmadığı için kişi sonraki deste çekişlerinde geri gelebiliyor.

## Hedefler

1. Şikayet başarıyla kaydedildiğinde kart **her durumda** desteden düşsün
   ve deste sonraki kullanıcıya geçsin (FE).
2. Kullanıcının aktif şikayeti olduğu hedefler keşif adaylarından ve
   WhoLikedMe listesinden sunucuda kalıcı olarak elensin (backend isteği —
   doküman).

## Hedef olmayanlar / anti-hedefler

- Şikayet engellemeye dönüşmez: sohbet ve mevcut eşleşme ETKİLENMEZ
  (v1.5 "şikayet zorunlu engelleme yapmıyor" kararı korunuyor).
- Mod ayrımı yok: şikayet mod'a bağlı değil, eleme iki modda da geçerli.
- "Zaten şikayet etmişsin" (UT-6804) hata dalında kart düşürülmüyor —
  o yol paylaşımlı `ReportModal`'ın catch'inde ve chat/feed/kampüs
  şikayetlerini de etkiler; backend eleme gelince senaryo zaten kalkıyor.

## Kısıtlar

- `dropProfileFromDeck` mevcut mekanizma: guard penceresi, WhoLikedMe
  rozet temizliği, deste ilerletme. Yeni mekanizma kurulmaz.
- `onSuccess` closure'ı `reportTarget`'ı render kapsamından okur; `finish`
  içinde `onClose` önce çağrılsa da aynı closure'da eski değer durur —
  mevcut kod da buna dayanıyor, değişmez.

## Yaklaşımlar

- **Seçilen:** `onSuccess`'te `result?.blocked` şartını kaldırıp
  `reportTarget` doluysa koşulsuz `dropProfileFromDeck` + backend eleme
  talebini `backend_*.md` formatında yazmak.
- **Elenen:** Kart düşürmeyi backend eleme canlıya çıkana kadar beklemek —
  gereksiz; istemci guard'ı kısa vadeyi kapatıyor, FE bugün çıkabilir.

## Yapımcıya kalanlar

- Backend dokümanının bölüm kurgusu, repo'daki mevcut `backend_*.md`
  dosyalarının üslubuna uyar (gözlem → talep → kurallar → istemci durumu).
