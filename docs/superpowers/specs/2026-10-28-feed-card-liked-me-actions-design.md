# Akış yazar kartı: aksiyon kümesi + "beni beğenmiş" hâli

**Tarih:** 2026-10-28 · **Boyut:** küçük değişiklik

## Niyet ve neden

Akıştan açılan yazar kartı (`LikerSwipeModal`) şu an kullanıcıya anlamı
olmayan bir buton gösteriyor: **X (geç)**. Kullanıcının kendi ifadesiyle "niye
reddedeyim herifi, o bana bir şey yollamadı ki" — X'i kavramsal olarak
**kabul/reddet** çiftinin yarısı olarak düşünüyor, tek başına duran bir "geç"
olarak değil. Akışta kart, karşı taraftan gelen bir sinyale cevap değil; sen
kendi isteğinle birinin profiline giriyorsun. Orada reddedilecek bir şey yok.

Buna karşılık yazar **daha önce seni beğenmişse** durum tersine dönüyor: ortada
cevap bekleyen gerçek bir sinyal var. O kartta doğru çift kabul/reddet, ve
orada Fire ile not anlamsız — karşı taraf seni zaten beğenmiş, yükseltecek bir
şey yok (bu gerekçe `LikerSwipeModal > allowFire`'ın varsayılanının neden
kapalı olduğunun ta kendisi).

Ayrıca bir yerleşim hatası var: Fire butonu not kutusunun üstüne biniyor.

## Hedefler

1. **Normal kart** (yazar beni beğenmemiş): yalnız **Fire/Spark + not**. X yok,
   tik yok. Moderasyon (şikayet · engelle) ve üç nokta aynen duruyor.
2. **Beğenilmiş kart** (yazar beni daha önce beğenmiş): yalnız **kabul (tik) +
   reddet (X)**. Fire yok, not yok. İki modda da aynı.
3. Fire butonu ile not kutusu artık çakışmıyor.

## Hedef olmayanlar

- Yazarın bana **not**la mı Fire'la mı geldiğini kartta göstermek. Beğeniler
  ekranı bunu yapıyor (notu blursuz basıyor); akış kartı bu turda yapmıyor.
- Sunucu sözleşmesini değiştirmek. Alan gelirse kullanılır, gelmezse özellik
  sessizce tetiklenmez.
- Keşif destesine ya da Beğeniler kartına dokunmak.

## Anti-hedefler (teknik olarak çalışsa bile başarısızlık sayılır)

- **Ölü buton.** Basıldığında hiçbir şey yapmayan ya da sunucudan reddedilecek
  bir buton çizmek. Kapı istemcide, "gönder ama reddedilsin" değil.
- **`allowPass`'in varsayılanının kapalı olması.** `LikerSwipeModal`'ın asıl
  kullanıcısı Beğeniler listesi; orada X kartın iki anlamlı cevabından biri.
  Varsayılan açık kalmalı, akış kartı opt-out etmeli.
- **Yanlış modda beğeni.** Kabul bir beğenidir ve `cardMode` ile gider, seçili
  modla değil (mevcut kural, bkz. `feedCardMode.ts` başlığı).
- **Sessizce yanlış hâl.** Yazar beni beğenmişken Fire+not göstermek, zaten
  bekleyen birine Fire yakmak demek.

## Kısıtlar

- `LikerSwipeModal` ve `SwipeCard` **paylaşımlı**: Beğeniler, sohbet kartı,
  profil önizlemesi ve Keşif destesi de kullanıyor. Yeni propların varsayılanı
  bugünkü davranışı korumak zorunda.
- `whoLikedMeIds` kümesi **yalnız ilk sayfayı** tutuyor (`getWhoLikedMe(1,10,10,
  mode)` → `applyWhoLikedMe`: "sayaç TOPLAM'dan, id kümesi yalnız çekilen
  sayfadan"). Yani Redux tek başına tam kapsama vermiyor.
- `hasLikedMe` selector'ü **abone olmadan** okunmalı (`store.getState()`) — kendi
  dosyasındaki not: selector'le okumak her yeni beğenide render churn'ü
  artırıyor.
- ⚠️ **DÜZELTİLDİ (2026-10-30, final incelemede yakalandı).** Bu madde
  başlangıçta "Author profile ucu istemciye ham geçiyor (`getPostAuthorProfile`
  → `any`), alanın dönüp dönmediği kodda görünmüyor" diyordu. **Yanlıştı:
  görünüyor.** `api.ts:252-254`, `FEED_POST_AUTHOR_PROFILE`'ın hemen üstünde
  açıkça yazıyor — gövde `GET /api/swipe/LikerProfile/{id}` ile birebir aynı
  `ProfileCardDto` ve *"beğeniye özel alanlar — **hasLikedMe**, note — burada
  dolu **GELMEZ**"*.

  Sonucu önemli: seçilen yaklaşım (a), bu uçta **bugün** aşağıda reddedilen
  yaklaşım (b)'ye fiilen eşit — sunucu kolu ileriye dönük kablolama, gerçek
  kapsama tamamen yerel kümeden ve o küme yalnız **seçili modun ilk sayfasını**
  tutuyor. Kararı değiştirmiyor ((a) hâlâ doğru tercih: alan geldiği gün
  istemci değişikliği olmadan tamamlanır) ama (b)'nin reddedilme gerekçesindeki
  kullanıcı zararı bugün CANLI: ilk sayfanın ötesindeki bir liker normal kart
  görüyor ve Flört'te yalnız bedelli yollar açık olduğu için ücretsiz bir kabul
  yerine consumable harcıyor.

  **Takip işi:** backend'den `hasLikedMe`'yi bu uçta da doldurmasını istemek.
  Spec'in non-goal'ü sözleşmeyi DEĞİŞTİRMEYİ yasaklıyor, istemeyi değil.
- Cam yüzey kuralı: aksiyon kolonu `Animated.View` **olmamalı** ve ata
  zincirinde `opacity < 1` ya da kimliksel olmayan transform bulunmamalı —
  yoksa cam efekti hiç render edilmiyor.

## Yaklaşımlar

### Karar 1 — "Beni beğenmiş" bilgisi nereden gelecek?

| | Yaklaşım | Takas |
|---|---|---|
| **(a)** | **Sunucu bayrağı + Redux yedeği, OR'lı** ← **seçilen** | Bugün kısmen çalışır (son 10+10 beğenen), sunucu `hasLikedMe` göndermeye başladığı an istemci değişikliği olmadan tamamlanır. Kalıp zaten canlı: `DiscoverScreen.tsx:2466`. |
| (b) | Yalnız Redux | Backend işi yok, ama 30 beğeni öncesi biri hâlâ Fire+not gösterir → zaten bekleyen birine Fire yakılır. Tutarsız. |
| (c) | Yalnız sunucu bayrağı | Temiz ve tam, ama alan dönmüyorsa özellik hiç tetiklenmez — bugün hiçbir şey kazanmayız. |

**Seçim: (a).** Gerekçe: aynı sorunun bu kod tabanında çalışan, kanıtlanmış
cevabı bu ve zarif şekilde dejenere oluyor — yanlış tarafa değil, güvenli
tarafa düşüyor (bilinmiyorsa normal kart).

### Karar 2 — Fire–not çakışması

Çakışma iki ayrı mutlak katmanın **aynı köşeyi** istemesinden:

- Not kutusu fotoğrafın **içinde**, tam genişlikte bir katmanda
  (`SwipeCard.tsx:1439`, `left/right/bottom: 14`) — ama kutunun kendisi
  `alignSelf: "flex-end"` ile sağa yaslı (`SwipeCard.tsx:1271`), yani fiilen
  fotoğrafın sağ alt köşesinde duran bir daire.
- Önizlemenin aksiyon kolonu fotoğrafın **kardeşi** (`SwipeCard.tsx:3918`,
  `right/bottom: 16`), dibinde Fire.

⚠️ İkisi de `COVER_ACTION_SIZE` çapında, `onPhoto` yolunda **aynı cam kabuğu**
kullanan daireler (`NoteBox` → `CardGlyphGlassButton`,
`SwipeCard.tsx:1265-1276`). Yani ortada "geniş şerit ile buton çakışıyor" diye
bir durum yok: birbirinin üstüne oturmuş iki özdeş daire var.

Keşif'te bu olmuyor çünkü orada not kutusu **kolonun içinde** (sıra: tik · X ·
Fire · **not** · üç nokta) ve o dal `!previewMode` ile akış kartından dışlanmış
(`SwipeCard.tsx:4464`).

| | Yaklaşım | Takas |
|---|---|---|
| **(a)** | **Not kutusunu önizleme kolonuna al** ← **seçilen** | Keşif'tekiyle birebir aynı dizilim; çakışma yapısal olarak imkânsız hâle geliyor, iki bağlamda tek buton dili. Kutu zaten aynı kabuk ve çapta olduğu için **görsel bir bedeli yok** — sadece üst üste binmek yerine diziliyor. |
| (b) | Kutuyu yerinde bırak, sağ pay ver (`coverActionClearance`) | Tek satır. Ama iki daire yan yana iki ayrı mutlak katmandan gelmeye devam ediyor ve pay elle bakımlı bir sayı olur; kolon bir buton daha alırsa yeniden kırılır. |

**Seçim: (a).**

## Kararlaştırılan how

### Aksiyon kuralı — `feedCardMode.ts`

`feedCardActions` ikinci bir girdi alıyor ve dördüncü bir alan döndürüyor:

```
feedCardActions(mode: AppMode | null, hasLikedMe: boolean): {
  like: boolean;   // tik
  pass: boolean;   // X
  fire: boolean;   // Fire/Spark
  note: boolean;   // not kutuları
}
```

| Hâl | like | pass | fire | note |
|---|---|---|---|---|
| mod yok (`resolveCardMode` → null) | false | false | false | false |
| yazar beni beğenmiş | **true** | **true** | false | false |
| normal (Dating ya da Friends) | false | false | **true** | **true** |

Normal hâlde iki mod aynı kümeyi alıyor; fark yalnız butonun **adında** ve
**renginde** (Dating "Fire" / Friends "Spark", `modeFireNameKey` ·
`modeFireTint`).

⚠️ `like`/`pass` ikisi birden açılıyor ya da birden kapanıyor — kabul/reddet bir
**çift**. Ayrı ayrı açılabilir iki bayrak gibi davranmak, tek başına duran bir
X'e (yani bu işin düzeltmeye geldiği hataya) geri dönmenin yolu.

### Tespit — `FeedScreen`

```
profile?.hasLikedMe === true || hasLikedMe(store.getState(), profile?.userId)
```

`DiscoverScreen.tsx:2466`'nın birebir aynısı. `store.getState()` ile, selector
aboneliği **yok** (gerekçe `swipeSlice.ts:137`).

⚠️ Değer `useMemo` içinde okunursa `store.getState()` reaktif değildir: canlı
`IncomingLike` kart açıkken gelirse hâl değişmez. Kabul edilebilir — kart
açılırken bir kez çözülmesi doğru taraf, çünkü hâlin kart ortasında değişmesi
kullanıcının elindeki butonları altından çeker.

### X'in kapısı — `LikerSwipeModal`

Yeni prop `allowPass`, **varsayılan `true`** (`allowLike`'ın birebir ikizi).
Kapalıyken `onPass` `SwipeCard`'a **hiç verilmiyor** → `undefined`, yani X ne
önizleme kolonunda ne panelin dibindeki satırda çiziliyor. `SwipeCard` tarafında
değişiklik gerekmiyor: her iki yer de zaten `onPass &&` ile korumalı
(`SwipeCard.tsx:3946` · `5665`).

⚠️ Bugün `onPass={() => triggerAction("left")}` **koşulsuz** veriliyor
(`LikerSwipeModal.tsx:409`) — bu işin asıl düzelttiği şey o.

### Not kutusunun yeri — `SwipeCard` önizleme kolonu

- Önizleme kolonuna (`SwipeCard.tsx:3918` bloğu) `NoteBox` ekleniyor, sıra
  Keşif'le aynı: **tik · X · Fire · not**.
- Ana (`bleed`) fotoğrafın `SectionPhoto` çağrısı `hideNote` ile kutusunu
  bırakıyor — kutu artık kolonda.
- **Diğer bölüm fotoğrafları ve prompt kutuları DEĞİŞMİYOR**: onların kolonu yok,
  geniş kutu orada doğru ve tek seçenek.
- Kolonun görünme koşulu `note`u da sayıyor, yoksa yalnız not açıkken (teorik)
  kolon hiç doğmaz.

### Kabul/reddet'in sonucu — `FeedScreen > handleAuthorSwipe`

Mevcut imza `(userId, direction)` zaten elimizde ve `LikerSwipeModal`
`onSwipe?.(userId, direction)` ile "left"/"right" gönderiyor. Kabul ya da
reddetten **sonra** rozet anında düşsün diye `removeWhoLikedMe(userId)`
dispatch ediliyor — Keşif'in `DiscoverScreen.tsx:2537` · `2711`'deki aynı
kalıbı, aynı `hasLikedMe` kapısıyla (kümede yoksa dokunulmuyor; kaynağı
bilinmeyen bir düşüş sayfalanmamış toplamı bozar).

Beğeninin kendisi değişmiyor: kabul `swipeMutation` ile sağ, reddet sol —
eşleşmeyi sunucu karşılıklı beğeniden kuruyor. Yeni uç yok, `onDecide` yolu
kullanılmıyor (o yanıt kabul/reddi için, ayrı uçlar ve ayrı kotalar).

## Builder'a kalanlar

- `feedCardActions`'ın üç hâli için test (mevcut dosya: `tests/features/feed/
  feedCardMode.test.ts`). Arkadaş dalı **tarihçe taşıyor** — düz beğeni orada bir
  tur açıktı, kapatıldı, geri açıldı; şimdi yalnız "beğenilmiş" hâlinde var.
  Testin işi bu salınımı dondurmak.
- `allowPass` kapalıyken X'in **iki** yerden de gittiğinin doğrulanması.
- Kolona not eklenince dizilimin dar ekranda fotoğraf dışına taşmadığının
  kontrolü (kolon artık normal hâlde 2, beğenilmiş hâlde 2 daire taşıyor —
  bugünkü 2'den fazla değil, yani risk düşük).
- Cihaz testi: cam kabukların kolonda hâlâ render edildiği (ata zinciri kuralı).
