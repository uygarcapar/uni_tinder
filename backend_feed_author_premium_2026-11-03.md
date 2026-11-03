# Akış — gönderi yazarının **Plus+ rozeti** (`author.isPremium`)

> **Durum: BEKLİYOR.** İstemci tarafı bugün yapıldı (§4): akış kartı yazar
> isminin yanına Keşif kartındakiyle aynı "plus+" wordmark'ını çiziyor. Alan
> `FeedAuthorDto`da **opsiyonel** tanımlı, yani bu uç gelene kadar hiçbir şey
> kırılmıyor — rozet yalnızca çizilmiyor.

**Tek maddelik talep.** Yeni uç yok, mevcut alanlar değişmiyor — akış
gönderilerinin `author` nesnesine Keşif kartındakiyle **aynı sözleşmeli** bir
bool ekleniyor:

```
author: {
  userId, name, age, mainPhotoUrl, universityDisplay,
  isPremium: bool          // ← YENİ
}
```

---

## 1. Gözlem — aynı kişi iki yüzeyde farklı görünüyor

Plus+ işareti bugün Keşif kartının kapağında, açılmış panelinde, yukarı
kaydırınca çıkan şeritte, Beğeniler kartında ve profil hero isminde var; hepsi
`isPremium` alanını sunucudan okuyor. Akışta **yok**, çünkü `FeedAuthorDto`
alanı taşımıyor.

Sonuç: aynı kullanıcı Keşif'te rozetli, akışta rozetsiz görünüyor. Rozet bir
abonelik faydası olarak satılıyor ("Profilinde Plus+ rozeti", paywall'daki
`benefits.premiumBadge` maddesi), yani eksik olduğu her yüzey vaadin eksik
kaldığı bir yer.

## 2. Talep — `author.isPremium`

`author` nesnesi dönen **tüm** akış uçlarında alan dolsun:

- `GET /api/feed/posts` (ve sort/page varyantları)
- `GET /api/feed/posts/{id}`
- `GET /api/feed/mine`
- Yanıt/bildirim yüklerinde `author` taşıyan her yer

**Kurallar:**

1. **Tier DEĞİL, "rozet görünsün mü".** Alan, kart sözleşmesinin kuralını
   aynen izlemeli: kullanıcı Ayarlar'dan rozetini gizlediyse
   (`showPremiumBadge:false`), premium olsa bile `isPremium:false` dönmeli.
   Keşif kartındaki davranışın birebir aynısı — iki yüzey ayrışırsa kullanıcı
   rozetini kapatıp akışta açık bulur.
2. **Anonim gönderide alan HİÇ GİTMEZ.** Anonim gönderide `author` zaten null
   yollanıyor; bu kural değişmemeli. Rozet kimliğe bağlı bir işaret, anonim
   bir satırda görünmesi yazarın abonelik durumunu sızdırır ve anonimliği
   daraltır (premium olmayanlar arasından eleme yapılabilir).
3. **Kendi gönderimde de sunucudan.** `isMine:true` olan satırlarda da alan
   dolmalı. İstemci burada `usePremiumTier`a **bakmıyor** ve bakmamalı: o,
   kullanıcının rozet gizleme tercihini çiğner. (Aynı yüzeyde benzer bir
   istemci yaması zaten var — `useOwnFeedAvatar`, çünkü sunucu kendi
   gönderimin `author.mainPhotoUrl`unu null bırakıyor. İkinci bir yamadan
   kaçınmak istiyoruz.)
4. **Mod ayrımı yok.** Abonelik Flört ve Arkadaş modlarında birlikte geçerli
   (`descriptionModes`), rozet de öyle.

## 3. Neden türetilemiyor

İstemcinin elinde yalnız iki şey var ve ikisi de yetmiyor:

- **Kendi tier'ı** (`usePremiumTier`) — yalnız kendi satırlarını kapsıyor ve
  rozet gizleme tercihini atlıyor (§2.1 / §2.3).
- **`useFeedAuthorProfile`** — tam profili çekiyor ve `isPremium` orada var,
  ama bu uç yalnız bir gönderi AÇILDIĞINDA çağrılıyor. Liste satırı başına bir
  profil isteği atmak akışın ilk ekranında onlarca ek tur demek.

## 4. İstemci durumu (2026-11-03'te yapıldı)

- `feedTypes.ts` > `FeedAuthorDto`: `isPremium?: boolean` eklendi
  (opsiyonel — alanı göndermeyen sürümde `undefined`).
- `FeedPostCard.tsx`: isim satırına `<PremiumBadge fontSize={AUTHOR_NAME_FONT} />`
  eklendi, kapısı `!post.isAnonymous && post.author?.isPremium`. Rozet Keşif
  kartındakiyle AYNI bileşen, ölçüsü ismin puntosundan türüyor.
- İsim puntosu (15) tek bir sabite (`AUTHOR_NAME_FONT`) alındı ki rozetin
  ölçüsü isimle birlikte dönsün.

Alan gelir gelmez rozet kendiliğinden çizilmeye başlar; istemcide değişiklik
gerekmiyor.
