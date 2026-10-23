# `IncomingLike` ve beğeni push'una `mode` alanı — backend talebi

> **Durum (2026-10-21, aynı gün):** Backend **A ve B'yi yaptı**, iki doğrulama
> sorusuna da "evet, tam ayrım" dedi. **C (in-app bildirim feed'i) yapılmadı** —
> `extraData` kalıcı değil, `AppNotification`a kolon + migration gerekiyor;
> backend onay bekliyor.
>
> **İstemci tarafı A ve B'ye bağlandı:**
> - **A** için kod değişikliği GEREKMEDİ: hub guard'ı `payload.mode`u zaten
>   okuyordu (`isAppMode` + seçili modla karşılaştırma) → çapraz-mod beğenisi
>   artık gerçekten sessiz. "Alan hep dolu geliyor" teyidi önemliydi: guard
>   yalnız GEÇERLİ bir mod gördüğünde bastırıyor.
> - **B** bağlandı: beğeni bildirimine basılınca istemci `data.mode`u okuyup
>   seçili modu DEVREDİYOR, sonra Beğeniler'e gidiyor — liste artık o modla
>   açılıyor. Mod devredildiyse `likesDirty` atılmıyor (mod değişimi ekranda
>   zaten tam yeniden kurulum tetikliyor, ikinci istek bayat modla giderdi).
> - Canlı beğeni toast'ının METNİ de olayın modundan: Arkadaş'ta "Spark attı"
>   (`likeToast.fire` artık `{{fire}}` ile ad alıyor).
> - Toast'ın DAİRE RENGİ bilerek kırmızı kaldı → aşağıdaki C notuna bak.
>
> **Kalan tek açık madde C.** Bizim cevabımız: **evet, migration'ı yapın** —
> gerekçe C bölümünün sonuna eklendi.

**Tarih:** 2026-10-21
**Engelleyici mi:** hayır. İstemci bugün çalışıyor ama iki modlu yapının tek
sızıntısı burada: çapraz-mod bir beğeni, kullanıcı öbür moddayken rozete ve
canlı karta yazılıyor.
**İstenen değişiklik boyu:** `IncomingLikeDto`ya bir alan + handler'da iki
satır (veri ZATEN handler'ın elinde).

---

## Bağlam — istemcide ne yapıldı (2026-10-21)

Beğeniler ekranı, sekme rozeti ve Keşif'in "bu kişi beni beğenmişti" kümesi
artık **seçili modun** verisi. Entegrasyon rehberinizdeki uçları kullanıyoruz:

| Uç | İstemci artık ne gönderiyor |
|---|---|
| `GET /api/swipe/WhoLikedMe` | `?mode=Dating\|Friends` (önce HİÇ göndermiyordu → sunucu Dating sayıyordu, Arkadaş modunda flört beğenileri listeleniyordu) |
| `GET /api/swipe/MissedMatches` | `?mode=` (ekranın kapanış hatası düzeltildi: mod değişince istek eski modla gidiyordu) |
| `GET /api/swipe/LikerProfile/{id}` | `?mode=` |
| `POST /api/swipe/RecoverMissedMatch` | gövdede `mode` |

Mod değiştiğinde iki liste de boşaltılıp yeni modun cevabıyla yeniden
kuruluyor; rozet (`whoLikedMeCount`) ve liker id kümesi de aynı cevaptan
yazılıyor.

---

## Sorun: `IncomingLike` hangi modun beğenisi olduğunu söylemiyor

`IncomingLikeDto` (`UniversityTinder/Models/Dto/IncomingLikeDto.cs`) bugün şu
alanları taşıyor:

```
LikerUserId · LikerDisplayName · LikerPhotoUrl · IsSuperLike · IsNote · NotePreview · LikedAt
```

Modu bildiren bir alan yok. İstemci tarafındaki sonuç:

1. Kullanıcı **Flört** modunda duruyor.
2. Biri ona **Arkadaş** modunda beğeni/Spark/not gönderiyor.
3. Hub olayı geliyor → rozet +1, listeye canlı kart ekleniyor, toast çıkıyor.
4. Kullanıcı toast'a basıyor → Beğeniler ekranı **Flört** listesini çekiyor
   (`?mode=Dating`) ve o kart **yok**. Rozet 1, liste 0.

`MatchNotification`da bu alan **var** (`mode`) ve biz onu zaten perde rengi ve
eşleşme modunu çözmek için okuyoruz. `IncomingLike`da eşi yok.

### Önemli: veri zaten handler'ın elinde

`LikeRegisteredNotification` (`UniversityTinder/Events/`) bu alanı **taşıyor**:

```csharp
Utility.SD.AppMode Mode = Utility.SD.AppMode.Dating
```

`IncomingLikeNotifyHandler` payload'ı kurarken onu aktarmıyor
(`IncomingLikeNotifyHandler.cs`, `var payload = new IncomingLikeDto { ... }`).
Yani talep yeni bir veri üretmek değil, var olanı payload'a geçirmek.

---

## Talep A (asıl istek) — `IncomingLikeDto.Mode`

```jsonc
{
  "likerUserId": "…", "likerDisplayName": "…", "likerPhotoUrl": "…",
  "isSuperLike": false, "isNote": false, "notePreview": null,
  "likedAt": "2026-10-21T09:00:00Z",
  "mode": "Friends"          // ← YENİ: "Dating" | "Friends"
}
```

- Değer `MatchNotification.mode` ile **aynı biçimde** olsun (PascalCase string)
  — istemcide tek tip koruması var (`isAppMode`).
- Enum yerine string bekliyoruz (wire sözleşmesinin geri kalanı öyle).

**İstemci bu alanı nasıl kullanıyor (kod zaten yazıldı):** payload'da GEÇERLİ
bir `mode` varsa ve seçili moddan farklıysa olay **tamamen sessiz** — rozet
artmıyor, canlı kart eklenmiyor, toast çıkmıyor. Beğeni kaybolmuyor: kullanıcı
o moda geçtiğinde `WhoLikedMe` kanonik cevabıyla görünüyor.

Alan **gelmezse bastırma yapılmıyor** (bugünkü davranış aynen sürüyor) — o
yüzden bu değişiklik istemciyi kırmaz, sadece etkinleştirir. Bugün etkisi:
çapraz-mod beğenisi hâlâ rozete yazılıyor.

---

## Talep B (küçük, A ile aynı yerde) — push `extraData`'sına `mode`

Aynı handler push'u da atıyor:

```csharp
extraData: new Dictionary<string, string>
{
    ["likerId"] = notification.ActorId,
    ["isSuperLike"] = …,
    ["isNote"] = …
    // ["mode"] = notification.Mode.ToString()   ← istenen
}
```

Sebep: bildirime basmak kullanıcıyı Beğeniler ekranına götürüyor. Bildirim
**Arkadaş** modundaki bir beğeniye aitse ve kullanıcı Flört'te duruyorsa, açılan
liste boş görünüyor — yani bildirim "bir şey var" diyor, ekran "yok" diyor.
Alan gelirse istemci bildirime basıldığında doğru moda geçip listeyi o modla
çekebilir.

Aynı soru **uygulama içi bildirim feed'i** (`/api/notifications`) için de
geçerli: `Like`/`SuperLike`/`Note` satırları mod bilgisi taşıyor mu? Taşımıyorsa
feed'den yönlendirme de aynı boş-liste durumuna düşüyor. (Bu C önceliği — push
ve hub çözülürse ana yol kapanıyor.)

### C maddesine cevabımız: EVET, migration'ı yapın (acil değil)

`extraData`nın kalıcı olmadığı tespiti doğru, teşekkürler — biz onu DB'ye
yazılıyor sanıyorduk. Yine de alanı istiyoruz, iki sebeple:

1. **Bildirim listesi ana yollardan biri.** Push bildirimi kaçırılabiliyor
   (sessize alınmış, izin verilmemiş, uygulama açıkken `skipPushWhenOnline`);
   o durumda kullanıcının beğeniye tek erişimi listedeki satır oluyor ve orada
   mod yoksa Beğeniler yine yanlış modda açılıyor.
2. **Fire/Spark rozetinin rengi oraya bağlı.** Aynı olayın yuvarlak işareti iki
   yerde çiziliyor — Bildirimler listesindeki tip rozeti ve toast'ın solundaki
   simge — ve bizde bu TEK KAYNAK (`shared/theme/badge.ts`). Toast artık modu
   biliyor ama liste satırı bilmiyor; yalnız toast'ı yeşile çevirseydik aynı
   Fire bildirimi listede kırmızı, toast'ta yeşil görünürdü. Bu yüzden ikisini
   de şimdilik kırmızıda bıraktık: `mode` listeye gelince iki yüzey birlikte
   moda dönecek.

Dört dokunuşluk planınız bize doğru görünüyor. İki not:

- **Geriye dönük `null` bizde sorun değil:** istemci "geçerli bir mod varsa
  kullan, yoksa bugünkü davranış" kuralını her yerde böyle kurdu (hub guard'ı
  da, push devri de). Eski satırlar mod devretmez, bastırılmaz.
- Değer **string** olsun (`"Dating"` / `"Friends"`), A ve B ile aynı biçim —
  istemcide tek tip koruması var.

Acil değil: ana yol (hub + push) kapandı.

---

## Talep C — bildirim metinlerindeki ürün adı: "Superlike" artık iki modda da yanlış

İstemci tarafında ürünün adı 2026-09-17'de **"Fire"** oldu, iki modlu yapıda da
**Arkadaş modunda "Spark"** (aynı consumable, yalnız görünen ad; plan §Ürün
girdileri 1). Backend'in gönderdiği metinler hâlâ **"Superlike"** diyor ve bu
metinler sunucuda RENDER EDİLİP DB'ye yazılıyor — istemci onları yeniden
yazamıyor (`AppNotification.Title/Body` düz metin, `localizationKey` yok; bkz.
`UniversityTinder/Models/AppNotification.cs`).

Kod taramamızda "Spark" sözcüğü backend'de **hiç geçmiyor** (0 eşleşme), yani
mod-farkındalı adlandırma sunucu tarafında hiç yok. Etkilenen satırlar:

| Dosya | Metin | Mod bilgisi elinde mi |
|---|---|---|
| `Handlers/IncomingLikeNotifyHandler.cs:124-125` | "Bir Superlike aldın!" · "{ad} sana Superlike attı!" | **Evet** (`notification.Mode`) |
| `Services/Swipes/PassHandler.cs:226-229` | "Bir Superlike'ı kaçırdın" · "{ad} sana Superlike attı. Geri alabilirsin." | Swipe modu handler'da var |
| `Services/Swipes/RecoverMissedMatchHandler.cs:210` | "Superlike kurtarıldı! …" (`SwipeResultDto.Message`) | **Evet** (`mode`) |

Beklenen davranış: `Mode == Friends` ise ad **"Spark"**, `Dating` ise **"Fire"**
(not: "Superlike" hiçbir modda kullanıcıya gösterilen ad değil — wire adı olarak
`superLikeBalance` vb. aynen kalıyor, bu yalnız METİN).

İki yol görüyoruz, tercihiniz hangisi:

- **C1 (küçük):** metinler sunucuda moda göre seçiliyor — üç dosyada ad bir
  yardımcıdan geliyor (`Mode == Friends ? "Spark" : "Fire"`).
- **C2 (doğru olan, daha büyük):** `AppNotification`a `localizationKey` +
  parametre sözlüğü eklenir, metni istemci yazar — sohbetteki **sistem
  mesajlarının** bugün çalıştığı yolun aynısı (`system.match_created` /
  `system.rematched`: sunucu anahtar gönderiyor, istemci `chat.system.*`
  anahtarından çiziyor, bkz. `ChatService.AddSystemMessageAsync`'in
  `localizationKey` parametresi). Yan kazanç: bildirim metinleri bugün
  **yalnız Türkçe** — uygulamanın İngilizce dili var, push'lar o dilde gelmiyor.

**Bizim notumuz:** C1 bugünün sorununu kapatıyor, C2 aynı sorunun dil
tarafını da kapatıyor. Acil olan C1; C2 ayrı bir iş olarak planlanabilir.

### Sohbet sistem mesajları — burada SORUN YOK (teyit)

`SystemMessageType` (MatchCreated · Rematched · ConversationDeleted ·
IceBreakerSent) metinlerinin hiçbirinde ürün adı geçmiyor ("Yeni bir eşleşmen
var!", "Tekrar eşleştiniz!", "Bu sohbet sonlandırıldı.") ve zaten
`localizationKey` ile geliyorlar — istemci onları kendi sözlüğünden çiziyor
(`ChatScreen > i18nResolver`). Yani sohbet akışında mod-yanlış bir ad çıkmıyor;
iş yalnız yukarıdaki üç bildirim metninde.

---

## Doğrulamak istediğimiz iki şey (soru, talep değil)

1. **`WhoLikedMe` mod süzgeci gerçekten iki yönlü mü?** Yani `?mode=Friends`
   yalnız friends beğenilerini, `?mode=Dating` yalnız dating beğenilerini mi
   döndürüyor — yoksa `Friends` süzgeci dating'i de kapsıyor mu? İstemci şimdi
   "tam ayrım" varsayımıyla çalışıyor (iki liste, iki cache, mod değişiminde
   boşaltma). `MissedMatches` ve `LikerProfile` için de aynı soru.
2. **Rozet/toplam `totalProfiles` de süzülüyor mu?** Sayacı `superLikes
   .totalProfiles + likes.totalProfiles` toplamından kuruyoruz; bu sayılar da
   moda göre süzülmüş değilse rozet listeden büyük görünür ("rozet 3, kart 2"
   vakasının mod hâli).

---

## Bilgi (talep değil)

- İstemci `getWhoLikedMe`yi artık **her zaman** modla çağırıyor; "parametre
  yoksa Dating" yoluna yeni istemcide hiçbir çağıran düşmüyor.
- Mod tercihi istemcide diskte (kullanıcı başına) tutuluyor; kayıtta seçilen
  mod artık uygulamaya ilk girişte de yazılıyor (önceden Arkadaş olarak
  kaydolan kullanıcı Keşif'i "Flört" başlığıyla açıyordu).
- Kullanıcının seçimi yoksa ve `GET /api/profile` → `modes` seçili modu kapalı
  gösteriyorsa istemci açık moda kayıyor (kullanıcının AÇIK seçimine
  dokunulmuyor — o yol kurulum CTA'sında kalıyor).
