# Akış gönderisine not: "gönderine not bıraktı"

**Tarih:** 2026-10-30 · **Boyut:** proje (sözleşme + üç yüzey)

## Niyet ve neden

Akışta bir gönderi okuyup o kişiye yazmak isteyen kullanıcının bugünkü yolu
dolambaçlı: yazarın adına dokun → profil kartı açılsın (`LikerSwipeModal`) →
kartın içinde bir fotoğrafın ya da prompt cevabının altındaki not kutusunu bul →
yaz. Not gittiğinde alıcı "fotoğrafına not bıraktı" görüyor — oysa not,
**okuduğu gönderi** yüzünden yazılmıştı. Bağlam gönderenin kafasında kalıyor,
alıcıya hiç ulaşmıyor.

İstenen şey: gönderi satırında bir not butonu, ve notun alıcıya **gönderisiyle
birlikte** düşmesi. Kullanıcının kendi cümlesi: "aynı prompt'a atılan notlar
gibi olacak, sadece gönderiye".

Yani gönderi, notun üçüncü hedef türü oluyor — fotoğraf ve prompt cevabının
yanına.

## Hedefler

1. Gönderi satırında not butonu; basınca **Keşif'teki aynı not modalı**
   (`NoteComposerModal`) açılıyor.
2. Not semantiği **birebir aynı**: aynı consumable ve kota, aynı 150 code-point
   tavanı, aynı paywall, aynı hata tablosu. Not = yorumlu beğeni, yani gönderen
   kişiyi o modda **beğenmiş** de sayılıyor.
3. Alıcı tarafta Beğeniler kartının NoteBox'ında "**gönderine not bıraktı**" +
   gönderinin kendisi + not metni (blursuz, bugünkü not kartı gibi).
4. Bir gönderiye **tek** not: gönderildikten sonra o satırda buton çizilmiyor,
   uygulama yeniden açılsa da çizilmiyor.
5. Buton yalnız notun gerçekten gidebileceği gönderilerde çiziliyor.

## Hedef olmayanlar

- Gönderi **kalbine** dokunmak. Kalp içeriğe tepki, eşleşme üretmiyor; not
  kişiye gidiyor. İkisi aynı satırda yan yana duracak ve bağımsız kalacak.
- Gönderiye **Fire/Spark**. Bu tur yalnız not.
- Yanıt akışını geri getirmek (2026-10-28'de kaldırıldı).
- Akış dışındaki yüzeylere not hedefi eklemek (kampüs anı, sohbet kartı).
- Gönderi altında yorum/sohbet. Not tek yönlü ve tek seferlik.

## Anti-hedefler (teknik olarak çalışsa bile başarısızlık)

- **Ölü buton.** Basıldığında sunucunun reddedeceği ya da hiçbir yere düşmeyen
  bir buton çizmek. Kapı istemcide, "gönder ama reddedilsin" değil.
- **Bağlamsız not.** Alıcının, bahsi geçmeyen bir fotoğrafın altında yorum
  okuması. Bugünkü `photoIndex` uyarısının aynı tuzağı: gönderi silinir ya da
  moderasyondan kalkarsa anlık görüntü yoksa not bağlamsız kalır.
- **Anonim gönderide not.** Not kişiye gidiyor ve alıcıya "şu gönderine"
  diyor — anonim yazarın kimliğini hem gönderene (butonun varlığı) hem alıcıya
  (notun geldiği gönderi) ifşa eder.
- **İkinci kredi.** Aynı gönderiye ikinci not: kullanıcı bir daha beğenemediği
  birine ikinci kez ödeme yapar.
- **Yanlış modda beğeni.** Not bir beğenidir ve gönderinin `cardMode`ı ile
  gider, Keşif'te seçili modla değil (mevcut kural, `feedCardMode.ts`).
- **Sahte "gönderildi" hâli.** Sunucu alanı yoksa butonu yerel bir bayrakla
  kalıcı gizlemek: cihaz değişince buton geri gelir ve kullanıcı ikinci kez
  ödeme yapar.

## Kısıtlar

- **`FeedPostDto` yazarın aksiyon hâlini bilmiyor.** Satırda ne
  `availableModes`, ne `likedMe`, ne `isMatched`, ne de "bu gönderiye not
  attım mı" var; o bilgi ancak kart açılınca
  `/api/feed/posts/{id}/author-profile`den geliyor. Yani butonun kapısı
  **sunucudan** gelmek zorunda. Aynı DTO'da bunun emsali var:
  `reply: { state }` — "Yanıt butonunun durumu SUNUCU karar veriyor. İstemci
  bunu YENİDEN HESAPLAMAZ."
- **`whoLikedMeIds` tam kapsama vermiyor** (yalnız ilk sayfa) — kapıyı Redux'tan
  türetmek yanlış.
- **`NoteTarget` iki türlü** (`Photo` | `Prompt`) ve üç yerde okunuyor: gönderim
  gövdesi, composer başlığı/önizlemesi, alıcının NoteBox'ı. Üçü de yeni türü
  tanımak zorunda.
- **`NoteComposerModal` paylaşımlı** (Keşif + akış yazar kartı). Yeni propların
  varsayılanı bugünkü davranışı korumalı.
- **Composer akış ekranında render ediliyor**, Keşif'e uiBus ile devredilmiyor
  (Keşif lazy mount + uiBus replay yapmıyor). Yeni akış da aynı yerde.
- Not tavanı 150 ve **aşağı** esnek, yukarı değil (`NOTE_MAX_LENGTH` notu).

## Yaklaşımlar

Üçü konuşuldu, 1 seçildi.

1. **Yeni hedef türü `kind: "FeedPost"` + `postId`; metni sunucu snapshot'lıyor.**
   `NoteTarget` üçüncü değerini alıyor, mevcut `POST /api/swipe/Note` ucu aynı
   kalıyor. Tek kota, tek hata tablosu, tek composer. Bedeli: backend turu ve uç
   çıkana kadar butonun kapalı durması. **SEÇİLEN.**
2. **Gönderi metnini notun gövdesine alıntı olarak gömmek.** Sıfır backend işi,
   bugün çıkar. Elendi: not fotoğrafa yazılmış görünür, "gönderine not bıraktı"
   satırı çizilemez, alıntı 150 tavanından yer yer — yani istenen şeyi
   (bağlamıyla düşmesi) hiç yapmıyor.
3. **Akışa ayrı uç** (`POST /api/feed/posts/{id}/note`). Swipe sözleşmesine
   dokunulmuyor. Elendi: aynı consumable iki uçtan harcanır, bakiye/paywall/hata
   kodları ikiye ayrılır ve zamanla kaçınılmaz olarak ayrışır; üstelik daha çok
   backend işi.

## Sunucu sözleşmesi (backend önerisi olarak yazılacak)

Üç parça. Hiçbiri gelmezse özellik **sessizce kapalı**.

### A. Satırdaki kapı — `FeedPostDto.note`

`reply: { state }` ile birebir aynı kalıpta, kararı sunucu veriyor:

```
note: {
  state: "Ok" | "AlreadySent" | "AlreadySwiped" | "NoMode" | "LikedMe"
       | "Matched" | "OwnPost" | "Anonymous" | "Restricted",
  availableModes: string[]   // yalnız state = "Ok" iken anlamlı
}
```

- `Ok` → buton çizilir. `availableModes` bugünkü `FeedAuthorProfileGate` ile
  aynı anlamda; istemci `resolveCardMode` ile hangi modda gideceğini seçiyor ve
  butonun rengi/adı o modun vurgusunu alıyor.
- `AlreadySent` → bu gönderiye not atılmış (hedef 4'ün kalıcı kaynağı).
- `AlreadySwiped` → yazara **zaten bir beğeni/not gitmiş** (başka bir
  gönderisinden ya da Keşif'ten). Not bir beğeni olduğu için kişi başına tek
  sefer gidiyor; bu hâl çizilirse buton sunucudan `UT-6404 ALREADY_SWIPED`
  yiyecekti. **Görünür sonucu:** birine not attıktan sonra o kişinin TÜM
  gönderilerinde buton kayboluyor. Bu bir ürün kararı değil, mevcut beğeni
  sözleşmesinin zorunlu sonucu.
- `NoMode` / `LikedMe` / `Matched` / `OwnPost` / `Anonymous` / `Restricted` →
  buton çizilmiyor. Ayrı değerler olmaları istemci için şart değil ama
  teşhis/analitik için isteniyor; istemci **hepsini** "çizme" diye okuyor, yani
  listeye yeni bir değer eklenmesi istemciyi bozmuyor.
- Alan **hiç gelmezse** buton çizilmiyor (eski sunucu). `FeedAuthorProfileGate`
  ile aynı gerekçe: olmayan bir hakkı varsaymak, reddedilecek bir buton çizmek.

### B. Gönderim — `POST /api/swipe/Note`

`target` gövdesi üçüncü türü tanıyor; null'lar bugünkü gibi **açıkça** yazılıyor:

```
target: { kind: "FeedPost", photoIndex: null, promptKey: null, postId: "<id>" }
```

Sunucu gönderim anında gönderi metnini (ve konusunu) **anlık görüntü** olarak
saklıyor. Kota, krediden düşme, `remainingNotes` / `remainingPurchasedNotes`
alanları ve `isMatch` davranışı aynen bugünkü gibi.

Hata kodları: mevcut tablo (UT-6401 bakiye, UT-6402/6406/6407 düzeltilebilir
hatalar) + **UT-6403 `INVALID_TARGET`** gönderi silinmiş/kaldırılmış ya da bu
gönderiye zaten not atılmış olduğunda. İstemcinin bu dalda davranışı mevcut
`INVALID_TARGET` dalıyla aynı: composer kapanır, akış satırı tazelenir.

### C. Alıcı tarafı — `note` nesnesi

Beğeniler kartının okuduğu `note` üçüncü hedefi taşıyor:

```
note: {
  comment: "...",
  target: { kind: "FeedPost", postId, postBody, postTopic | null, postDeleted }
}
```

`postBody` **anlık görüntü** (gönderi silinse de not okunabilir kalıyor).
`postDeleted` true iken istemci metni yine basıyor ama "gönderi kaldırıldı"
notunu ekliyor. Alanlar eksikse etiket jenerik "gönderine not bıraktı"ya
düşüyor — başlıksız NoteBox çizilmiyor.

## İstemci tarafı

### Hedef sözleşmesi

`src/shared/types/index.ts` → `NoteTarget.kind` üçüncü değerini alıyor, `postId`
alanı ekleniyor (diğer türlerde `null`).

`src/features/discover/noteTarget.ts`:
- `postNoteTarget(postId)` kurucusu.
- `noteTargetPayload` `postId`yi de yazıyor (her türde açıkça).
- `isSameNoteTarget` `postId` dalını alıyor.
- `noteTargetLabel` gönderi dalında `t("note.targetPost")` döndürüyor.

### Satırdaki buton — `FeedPostCard`

Kalbin bulunduğu aksiyon satırında, kalbin **sağında**, aynı hizada: `NoteGlyph`
konturlu + kalple aynı tema mürekkebi, sayı yok. Yanında metin yok (kalp de
metinsiz; satırın ritmi korunuyor).

- Çizilme kapısı **tek koşul**: `post.note?.state === "Ok"` ve `onNote` prop'u
  verilmiş. Kart içinde başka hiçbir kural yeniden hesaplanmıyor —
  `likedByMe`, `isMine`, `isAnonymous` burada **okunmuyor**; sunucu zaten
  bunları `state`e katlıyor ve ikinci bir yerde kural tutmak iki kuralın
  ayrışması demek (`replyActionFor` tarihçesinin dersi).
- `variant === "mine"` ve modsuz/salt-okunur hâller sunucu tarafında `OwnPost` /
  `NoMode` olarak zaten kapalı; istemci ayrıca bir şey yapmıyor.
- Not gönderildikten sonra buton **anında** kayboluyor: `patchPostInCaches` ile
  `note.state = "AlreadySent"` yazılıyor (kalp optimistic'inin aynı yolu).
  Kalıcılığı sunucu veriyor (A).

### Gönderim — `FeedScreen`

Yeni handler, bugünkü `handleAuthorNote`in kardeşi; aralarındaki tek fark
hedefin nereden geldiği:

- Hedef: `postNoteTarget(post.id)`; alıcı: `post.author.userId`.
  `authorProfile` sorgusu **beklenmiyor** — kart açılmıyor, dolayısıyla ek bir
  istek yok.
- Mod: `resolveCardMode(post.note.availableModes, selectedMode)`; `null` dönerse
  (sunucu `Ok` derken liste boş geldi) buton zaten çizilmemiş olmalı, yine de
  handler sessizce çıkıyor.
- **Bakiye kapısı aynen**: `notesRemaining` sayı değil ya da ≤ 0 → composer
  değil `NotePurchaseModal`, `analytics.capture("note_paywall_shown", {
  surface: "feed_post" })`.
- Gönderim `useNoteMutation` ile, `mode: cardMode`. Başarıda: `note_sent`
  (`targetKind: "FeedPost"`, `surface: "feed_post"`), composer kapanıyor,
  bugünkü tek onay satırı (toast) + satırdaki optimistic yama.
- Hata dalları mevcut `handleSendAuthorNote` ile **aynı**: UT-6401 → paket
  sheet'i; `INVALID_TARGET` → composer kapanır + o gönderi tazelenir (kart
  invalidate'i yerine `feedKeys.postsRoot`); gerisi inline hata, sheet açık,
  metin korunuyor.

Mevcut yazar-kartı not akışına **dokunulmuyor**; iki giriş aynı composer'ı ve
aynı mutasyonu paylaşıyor.

### Composer önizlemesi — `NoteComposerModal`

Bugün iki varyant var: foto thumbnail'i ve prompt chip'i; ikisi de kutunun sol
üstüne `PREVIEW_INSET` kadar binip yukarı taşıyor ve yazı her hedefte **aynı**
yerden başlıyor. Üçüncü varyant aynı kuralı izliyor: **gönderi chip'i** — prompt
chip'inin kardeşi, soru yerine konu kapsülü (varsa), cevap yerine gönderi metni
**en fazla iki satır**. Burası hedefi hatırlatan etiket, gönderinin okunduğu yer
değil (kullanıcı zaten akışta okuyup bastı).

Yeni prop: `postPreview?: { body: string; topic?: FeedTopic | null } | null`.
Verilmezse bugünkü davranış. Chip ölçümü prompt chip'inin yolunu kullanıyor
(sabit yükseklik verilemiyor, iki satıra çıkabiliyor).

Başlık satırı `noteTargetLabel` üzerinden "gönderisine yanıt veriyorsun"
karşılığını alıyor.

### Alıcı tarafı — `LikeCard`

`noteTargetLabel` üçüncü dalını alıyor: `note.leftNoteOnPost`. Hedef bloğunda
gönderi metni (anlık görüntü) basılıyor; `postDeleted` iken altına tek satır
"gönderi kaldırıldı". Kutunun yükseklik hesabı (`noteTextMaxHeight`) yeni satırı
sayıyor — hedef etiketi + gönderi metni için ayrılan terim, bugünkü
`NOTE_TARGET_LABEL_LINE` kalıbıyla aynı yerde.

### i18n

`en` + `tr`: `note.targetPost`, `note.leftNoteOnPost`, `note.postRemoved`,
`note.codes.*` tablosuna UT-6403 karşılığı, akış butonunun erişilebilirlik
etiketi.

## Testler

- `noteTarget`: `postNoteTarget` → payload'da `postId` dolu, `photoIndex` ve
  `promptKey` **açıkça null**; `isSameNoteTarget` gönderi dalı; `noteTargetLabel`
  gönderi dalı.
- Satır kapısı: `state` değerlerinin her biri için buton çizilir/çizilmez —
  özellikle bilinmeyen bir `state` ve alanın hiç gelmediği hâl (ikisi de
  "çizme"). `feedCardMode.test.ts`in kalıbı.
- `FeedScreen` gönderimi: bakiye 0/`null` → composer değil paket sheet'i; başarı
  → satırda buton kayboluyor; UT-6401 → paket sheet'i; `INVALID_TARGET` →
  composer kapanıyor.
- Composer: `postPreview` verildiğinde chip çiziliyor ve yazı başlangıcı foto
  varyantıyla **aynı** yerde (mevcut ölçüm testlerinin kalıbı).

## Builder'a bırakılanlar

- Chip'in tipografisi ve metin kırpma sınırı (iki satır kuralı sabit).
- `patchPostInCaches` yamasının tam imzası.
- Analitik alan adlarının son hâli (`surface: "feed_post"` niyeti sabit).
- Butonun hitSlop/dokunma payı — kalbin bugünkü değerleriyle hizalı olacak.

## Sıra

1. Backend önerisi (`backend_feed_post_note_2026-10-30.md`) — A/B/C sözleşmesi.
2. İstemci: hedef sözleşmesi + satır butonu + gönderim + composer varyantı +
   alıcı etiketi, hepsi `note.state` kapısının arkasında. Uç çıkana kadar
   kullanıcı hiçbir değişiklik görmüyor.
3. Uç çıktığında doğrulama: gönderim, alıcı kartı, ikinci notun imkânsızlığı,
   silinmiş gönderi.
