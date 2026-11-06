# Akış ARKADAŞ'a özel oldu — üç talep (2026-11-05)

**Ürün kararı:** Lit Akışı (ve içindeki kampüs anları) bundan sonra **yalnız Arkadaş
modunun yüzeyi**. Flört modunda sekme hiç çizilmiyor. İstemci tarafı indi; bu doküman
kararın sunucuda karşılığı olması gereken üç maddeyi istiyor.

Kardeş doküman: `backend_per_mode_photos_2026-11-05.md` (mod başına fotoğraf) — ayrı bir
iş, sırayla ya da bağımsız yapılabilir.

---

## 0. Önce bir yapı notu — sunucu "seçili mod"u BİLMİYOR

Aşağıdaki maddelerin hangisinin sunucuda çözülebileceğini bu belirliyor, o yüzden en başa
koyuyoruz:

- **Seçili mod** cihaz-yerel bir tercih (MMKV, `appMode:<userId>`). Hiçbir uca
  gönderilmiyor, sunucu bir kullanıcının o an hangi modda durduğunu **öğrenemiyor**.
- **Açık modlar** sunucunun bildiği şey: `GET /api/profile → modes { dating, friends }`.

Yani "kullanıcı şu an Flört'te" diye bir sunucu kuralı yazılamaz. Yazılabilecek olan
"kullanıcının Arkadaş profili **kapalı**" — talep 3 tam olarak buna dayanıyor.

---

## 1. Talep A — `/api/feed/posts` ARKADAŞ'a kapsansın

### Gözlem

Akış listesi uçları bugün modu hiç bilmiyor. Modu taşıyan tek akış ucu
`GET /api/feed/posts/{id}/author-profile?mode=`; liste uçlarında (`/api/feed/posts`,
`/api/feed/posts/mine`) mod parametresi **yok**.

Bu, akış iki moda da açıkken tutarlıydı. Artık değil, ve somut bir hata üretiyor:

Satırdaki `note.availableModes` ve yazar kartındaki `availableModes` **karşılıklı uygun
modları** veriyor. İstemci bunlardan birini seçerken seçili mod listede yoksa listenin
İLK moduna düşüyor (`feedCardMode.ts > resolveCardMode`). Sonuç:

> Kullanıcı Arkadaş yüzeyinde duruyor, yalnız Flört'ü açık bir yazarın gönderisinde
> Fire'a basıyor ve **Arkadaş akışından Flört beğenisi gidiyor.**

İki modlu ayrımın delindiği tek yer burası. İstemcide kartı salt-okunura düşürerek de
kapatılabilirdi ama o, listede aksiyonsuz satırlar bırakıyor ("neden buton yok"); doğru
yer kaynağın kendisi.

### Talep (2026-11-05 düzeltmesi — ilk hâli çelişkiliydi)

> ⚠️ Bu bölümün ilk hâli başlıkta "kapalı yazarların gönderileri listeden düşsün" derken
> yan etki bölümünde "kalsın, kart salt-okunur olsun" diyordu — aynı kitle için zıt iki
> sonuç. Backend incelemesi ayrıca **mod kapatma diye bir yol olmadığını** gösterdi
> (`FriendsProfileOpenedAt` yalnız yazılıyor, hiç null'a çekilmiyor), yani "sonradan
> kapatan" diye bir kitle de yok. Kalan tek kitle: **Arkadaş'ı HİÇ AÇMAMIŞ yazarlar.**
> Karar aşağıda, tek sonuç olarak.

**Liste yazar SÜZMESİN. Süzülen şey AKSİYON olsun:** `note.availableModes` (ve yazar
kartının `availableModes`i) akış bağlamında **yalnız `Friends` içerebilsin** — yazarın
Arkadaş'ı açık değilse boş dizi dönsün.

Hatanın kökü bu yamayla tamamen kapanıyor, çünkü `resolveCardMode(availableModes,
selectedMode)` ancak listede olan bir modu döndürebiliyor: liste ⊆ {Friends} olduğunda
sonuç ya `Friends` ya `null` (salt-okunur). **Flört beğenisi matematiksel olarak
imkânsız hâle geliyor** — gönderiyi listeden düşürmek aynı çiviye vurulan daha ağır bir
çekiçti.

Gönderiyi listede bırakmanın gerekçesi:

- **İçerik kaybolmuyor.** Akış iki moda da açıkken Flört-only kullanıcılar gönderi
  bırakabiliyordu; bunları süzmek mevcut akışı bir gecede boşaltabilir.
- **Satır ölü DEĞİL.** Gönderi beğenisi (`POST /api/feed/posts/{id}/like`) yazarın
  modundan bağımsız; okuma ve beğenme çalışmaya devam ediyor. Kapanan tek şey yazara
  giden Fire/Spark ve not — yani ücretli sinyal.
- **İstemcide sıfır iş.** `availableModes: []` → salt-okunur kart yolu zaten var ve
  testli.

Doğru çerçeve şu: **akış Arkadaş'ta yaşayan bir kampüs içerik yüzeyi; mod kapsamlı olan
içerik değil, AKSİYON.**

**Gönderi OLUŞTURMA ise kapıdan geçsin:** `POST /api/feed/posts`, Arkadaş profili açık
değilse `UT-2304 MODE_NOT_OPENED` ile reddetsin. Yazar akışa zaten ulaşamıyor; bu kitleyi
büyütmenin anlamı yok. Mevcut gönderiler kalıyor, yenisi doğmuyor — küme donuyor.

### UT-2304 kapısının YARIÇAPI (2026-11-05 kararı)

Kapı **DAR olsun** — yalnız iki yere:

| Uç | Kapı | Gerekçe |
|---|---|---|
| `GET /api/feed/posts` | ✅ `UT-2304` | Arkadaş havuzu; açmamış kullanıcının işi yok. Güncel istemci zaten çağırmıyor (sekme yok), kapı bayat sürümler için. |
| `POST /api/feed/posts` | ✅ `UT-2304` | Kümeyi dondurur (yukarıda). |
| `GET /api/feed/posts/mine` | ❌ **KAPI YOK** | Yalnız çağıranın KENDİ içeriğini dönüyor — havuz bütünlüğü ya da gizlilik argümanı yok, yani kapının hiçbir kazancı yok. Buna karşılık §3'teki muafiyetle doğrudan çelişirdi: "gönderin kaldırıldı" bildirimini alan kullanıcı hangi gönderi olduğunu açamazdı. **Kapı = sıfır kazanç + bir çıkmaz.** |
| `GET /api/feed/me` | ❌ **KAPI YOK** | Bootstrap ucu ve bayrak probe'unun tek girdisi — aşağıdaki uyarı. Kampüs `/me`de de kapı bilerek konmamıştı; tutarlılık da bu yönde. |

⚠️ **`/api/feed/me`'ye `UT-2304` koymak probe'u BOZAR.** `feedProbe.ts` yalnız üç şeyi
tanıyor: başarı → "on", `UT-7301` → pencereyi yak, `GATED_BUT_ENABLED` (`UT-7315` ·
`UT-7308` · `UT-7310`) → "on". **Tanınmayan kod = bilgi yok → pencere YAKILMAZ.** Sonuç:
Arkadaş'ı açmamış her kullanıcı için **her boot ve her foreground'da** bir `/feed/me`
isteği, sonsuza kadar, hiç yakınsamadan — üstelik latch "on" yazamadığı için özellik
açıkken bile bilinmiyor kalır.

Yine de koymak isterseniz mümkün ama **sıra bağlayıcı**: `UT-2304`ün
`GATED_BUT_ENABLED`e eklenmesi gerekir (anlamca oturuyor — o kodu alıyorsak kapı çalışıyor
demektir, yani özellik AÇIK) ve o **istemci değişikliği sunucudan ÖNCE inmek zorunda.**
Kazancı sıfır olduğu için önerimiz koymamak.

### Kitle kendiliğinden eriyor

Not: Flört-only yazarların gönderileri **büyümeyen ve küçülen** bir küme — oluşturma
kapandığı için yenisi doğmuyor, mevcutlar da `expiresAt` taşıyor. Yani bu istisnaların
hepsi geçici; kalıcı bir yüzey borcu yaratmıyoruz.

---

## 2. Talep B — kampüs anları da Arkadaş'a özel

### Gözlem

Kampüs anları yüzeyi **yalnız FeedScreen'in içinde** yaşıyor (haritanın tek girişi
akıştaki moment destesi). Akış Arkadaş'a özel olunca kampüs de fiilen öyle oldu: istemci
bundan sonra `GET /api/campus/moments` ve `/api/campus/me` çağrılarını
**`?mode=Friends` dışında bir değerle atmayacak.**

Bu kasıtlı bir ürün kararı — kampüs anları Arkadaş'ın parçası sayılıyor.

### Talep

1. ~~**Flört anları için temizlik/geçiş.**~~ → **DÜŞTÜ (2026-11-05).** Kota mod başına
   olduğu için (§4 soru 3) canlı bir Flört anı kimsenin hakkını harcamıyor; istemci onu
   istemeyi bıraktığında 24 saat içinde kendiliğinden sönüyor. Temizlik işi yok.

2. **`POST /api/campus/moments` `mode: "Dating"` ile gelirse** artık bir hata hâli: eski
   bir istemci sürümünden geliyor demektir. `UT-2304 MODE_NOT_OPENED` ya da yeni bir kod
   — hangisi size uygunsa, yeter ki sessizce yazılmasın.

3. ~~**Kampüs kotası mod başına mı, hesap başına mı?**~~ → **CEVAPLANDI: mod başına**
   (`m.Mode == mode`, `CampusMomentService.cs:117`). `backend_campus_mode_quota_2026-10-30.md`
   bu soruyu açık bırakmıştı, artık kapandı. Sonucu: B.1 temizliği **gereksiz** —
   kimsenin göremediği bir Flört anı kimsenin hakkını da harcamıyor, 24 saatte sönüyor.

---

## 3. Talep C — Arkadaş'ı kapalı kullanıcıya akış/kampüs bildirimi GİTMESİN

### Gözlem

Arkadaş profili kapalı bir kullanıcı artık akışa **hiçbir yoldan** ulaşamıyor. Ama sunucu
ona sekiz ayrı akış/kampüs push'u göndermeye devam ediyor:

```
FeedLikeMilestone · FeedPostModerated · FeedRestricted · FeedDailyRefill
FeedDailyUnused   · CampusMomentsNearby · CampusMomentModerated · FeedReply
```

İstemci bunları kırmadan karşılıyor (akış açılamıyorsa dokunuş Bildirimler'e düşüyor),
yani **bozuk değil — ölü.** Kullanıcı bildirime basıp hiçbir şey olmadığını görüyor.

### Talep

Açık modlarında **Arkadaş olmayan** kullanıcıya bu sekiz tür hiç gönderilmesin. Sunucu
bunu temiz yapabiliyor çünkü `modes.friends`i biliyor.

⚠️ **İki modu da açık olup o an Flört'te duran kullanıcı için bir şey YAPILAMAZ** (§0:
seçili mod sunucuda yok) ve **yapılmasına gerek de yok**: o kullanıcı için akış gerçekten
var, sadece o an başka sekmede. Dokunduğunda istemci Bildirimler'e düşürüyor, bu doğru
davranış. Talep yalnız **modu hiç açmamış** kullanıcılar için.

⚠️ Moderasyon/kısıt bildirimleri (`FeedPostModerated`, `CampusMomentModerated`,
`FeedRestricted`) için bir istisna düşünün. Gerekçe düzeltildi — "modu kapatan kullanıcı"
diye bir kitle yok (`FriendsProfileOpenedAt` hiç null'a çekilmiyor); asıl kitle şu:
**akış iki moda da açıkken gönderi bırakmış ve Arkadaş'ı hiç açmamış** kullanıcılar. O
gönderi sonradan moderasyondan kalkarsa bunu duymaları gerekir — kendi içerikleri. Bizim
tarafta bu bildirimler zaten "sistem bildirimleri"ne bağlı ve akış anahtarından muaf
(`SettingsScreen > feedAlerts`); aynı muafiyeti burada da koruyabilirsiniz.

---

## 4. Sorular

**1 ve 2 CEVAPLANDI (backend incelemesi, 2026-11-05):**

1. ~~Friends kapalı kullanıcıya bugün ne dönüyor?~~ → **Normal liste.** Akış liste uçları
   modu hiç okumuyor (`FeedQueryService.cs:117`). Hata da yok, boş da değil. Yani talep A
   mevcut bir süzgeci değiştirmiyor, **yeni davranış** ekliyor.
2. ~~`AlreadySwiped` Keşif'i katlıyor mu?~~ → **Evet.** Kapı
   `GetStillHiddenTargetsAsync`ten besleniyor (`UserRelationsQuery.cs:162`); Keşif'teki
   beğeni aynı `SwipeAction` satırını yazıyor. Like dışlaması varsayılanda kalıcı, buton
   geri gelmiyor. İstemcideki iyimser yama sunucuyla uyumlu.

**3. CEVAPLANDI — `AlreadySwiped` mod kapsamlı, NOT ise modsuz; ikisi ÇELİŞMİYOR.**

- Flört'te beğenilen X'in Arkadaş'taki satırı: `note.state = "Ok"`,
  `availableModes = ["Friends"]`. **Gönderim de geçiyor**, `UT-6404` yemiyor —
  `NoteHandler`ın dup kapısı da aynı mod kapsamlı `GetStillHiddenTargetsAsync(..., mode)`
  çağrısını kullanıyor (`NoteHandler.cs:186`). Modsuz `UNIQUE(ActorId, TargetId)` yalnız
  `Notes` tablosunda (`AppDbContext.cs:482`) ve Flört'teki bir **beğeni** `Notes` satırı
  yazmıyor, yani o unique'e hiç dokunulmuyor. Kapı ile gönderim aynı fikirde → ölü buton
  yok.
- **Bitişik durum:** Flört'te **NOT** gönderilmişse (beğeni değil) `NoteAlreadySent`
  modsuz okunuyor (`FeedQueryService.cs:378`) → her mod kapanıyor, `AlreadySwiped`
  dönüyor. Bu da gönderimle tutarlı: o yolda unique ihlali catch'e düşüyor, kredi iade
  ediliyor, `UT-6404` dönüyor (`NoteHandler.cs:365`). Kredi kaybı yok.

✅ **İstemci düzeltmesi indi.** İyimser yama artık iki kuralı ayırıyor: **beğeni/Fire**
yalnız `mode === "Friends"` iken satırları kapatıyor (mod `variables`ta yoksa
mutation'ın sunucuya gönderdiği değere düşülüyor), **not** ise modsuz olduğu için
koşulsuz kapatıyor. İkisi de testli (`swipeFeedNoteGate.test.tsx`).

**4. CEVAPLANDI — kampüs kotası MOD BAŞINA** (`m.Mode == mode`,
`CampusMomentService.cs:117`; `/me → postedToday` aynı ölçütte). Dolayısıyla **B.1
kendiliğinden düşüyor:** canlı bir Flört anı yalnız Flört'ün hakkını harcıyor, Arkadaş'ta
paylaşmayı engellemiyor, 24 saatte sönüyor. **Temizlik gerekmiyor, sayıma gerek yok.**

---

## 5. Geriye uyum

- Talep A ve B **eski istemcileri kırmıyor**: eski sürüm Flört'te de akış sekmesini
  çiziyordu, kapsama inince o kullanıcı daha az gönderi görür — hata değil, daralma.
- Talep C tamamen eksiltici; hiçbir istemci sürümü bir bildirimin gelmemesinden bozulmaz.
- Üç madde de birbirinden bağımsız, ayrı ayrı inebilir.
