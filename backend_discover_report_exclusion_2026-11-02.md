# Keşif — **şikayet edilen kullanıcılar adaylardan elensin**

> **Durum: GEÇERSİZ (2026-11-06).** Ürün kararı tersine döndü: şikayet hiçbir
> şeyi gizlemiyor, engel gizliyor ve geri alınabiliyor. Bkz.
> `backend_report_no_hide_2026-11-06.md`. Aşağıdaki metin tarihçe için duruyor.
>
> ~~**Durum: BEKLİYOR.**~~ İstemci tarafı bugün yapıldı (§4): şikayet başarıyla
> kaydedilince kart, engelleme işaretli olsun olmasın desteden düşüyor. Ama bu
> korumanın penceresi **15 saniye** — kalıcı eleme ancak sunucuda kurulabilir.

**İki maddelik talep.** Mevcut hiçbir alan değişmiyor, yeni uç yok — yalnız
iki listenin aday kümesine bir süzgeç ekleniyor:

1. `GET /api/swipe/GetPotentialMatches` kullanıcının **aktif şikayeti olduğu**
   hedefleri döndürmesin.
2. Aynı eleme `GET /api/swipe/wholikedme` için de uygulansın.

---

## 1. Gözlem — şikayet edilen kişi desteye geri geliyor

Şikayet v1.5'ten beri bilerek engelleme yapmıyor: `POST /api/moderation/report`
gövdesinde `alsoBlock` açıkça gidiyor ve kullanıcı switch'i kapatabiliyor
("bildirmek istiyorum ama iletişimi kesmek istemiyorum"). Switch kapalıyken:

- Şikayet sunucuda **kaydediliyor** — UT-6804 mükerrer şikayeti tanıdığına
  göre şikayet ilişkisi (reporter → reported) zaten tutuluyor.
- Ama bu ilişki keşif aday sorgusuna **girmiyor**: hedef, sonraki
  `GetPotentialMatches` sayfalarında geri gelebiliyor.

Yani kullanıcı birini taciz/sahte profil diye bildirdikten sonra aynı yüz
birkaç deste çekişi sonra tekrar karşısına çıkıyor. Engelleme bunun çözümü
değil — v1.5 kararının kendisi bu iki niyeti ayırıyor; ayrışan uç nokta
yalnızca keşif görünürlüğü.

## 2. Talep A — keşif adayları

`GET /api/swipe/GetPotentialMatches` aday kümesinden, **istek atan
kullanıcının aktif şikayeti olduğu** hedefler çıkarılsın.

**Kurallar:**

1. **Tek yönlü.** Şikayet EDEN görmesin; şikayet EDİLENİN destesi
   değişmesin. Aksi, "şikayet edildim" bilgisini davranış değişikliği olarak
   sızdırır (edilen kişi, şikayetçinin kartının kaybolduğunu fark edebilir).
2. **Engellemeden bağımsız ve kalıcı.** `alsoBlock:false` ile kaydedilen
   şikayet de eler. Engelleme süzgeci neyse bu onun yanına ikinci bir koşul.
3. **Mod ayrımı yok.** Şikayet mod'a bağlı değil (Dating'de şikayet edilen
   Friends'te de gösterilmemeli) — eleme iki modda da geçerli.
4. **Sohbet/mevcut eşleşme ETKİLENMEZ.** Bu talep yalnız keşif
   görünürlüğü; eşleşme, konuşma, mesajlaşma v1.5 davranışında kalır.

## 3. Talep B — WhoLikedMe

Aynı süzgeç `GET /api/swipe/wholikedme` listesine de uygulansın.

İstemci, şikayet anında rozeti ve listedeki kaydı anlık temizliyor
(`dropProfileFromDeck` → `removeWhoLikedMe`), ama sonraki fetch kişiyi geri
getirir — kaynak liste sunucuda süzülmedikçe temizlik kozmetik kalıyor.

## 4. İstemci durumu (2026-11-02'de yapıldı)

- `DiscoverScreen` > ReportModal `onSuccess`: şikayet başarıyla kaydedilince
  `dropProfileFromDeck` **koşulsuz** çağrılıyor (eskiden yalnız
  `result.blocked` ise). Kart desteden düşüyor, WhoLikedMe rozeti anlık
  temizleniyor, deste sonraki kullanıcıya geçiyor.
- Aynı davranış Beğeniler modalında da var (`LikerSwipeModal`): şikayet
  edilen kişi listeden ve rozetten anlık düşüyor.
- Yeniden görünmeye karşı tek koruma `swipedAtRef` guard penceresi: Map diske
  yazılıp açılışta geri yükleniyor ama penceresi yalnızca **15 saniye**
  (`SWIPE_GUARD_MS`) — bilinçli olarak kısa, çünkü pencere "backend bu
  profili bir daha sunmaz" varsayımını değil, yalnız anlık yarışları örtüyor.
  Pencere dolunca şikayet edilen kişi geri gelir.
- Sunucu elemesi canlıya çıktığında istemcide ek değişiklik **gerekmiyor**;
  guard penceresi zararsız bir çift kontrole dönüşür.

## 5. Backend'in kararına bırakılanlar

- **Moderasyon reddi:** Şikayet incelenip reddedilirse elemenin kalkıp
  kalkmayacağı backend'in kararı. İki yönde de istemci değişikliği
  gerektirmiyor ("aktif şikayet"in tanımı sunucuda).
- **Süzgecin uygulanma katmanı** (sorgu koşulu mu, aday havuzu üretimi mi)
  tamamen implementasyon detayı — istemcinin gördüğü tek şey listede o
  `userId`'nin olmaması.
