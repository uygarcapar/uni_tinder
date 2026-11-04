# Friends modu: yalnız aynı cinsiyet

**Tarih:** 2026-11-04
**Durum:** Tasarım — onay bekliyor

## Niyet

Friends (Arkadaş) modunun destesi kullanıcının kendi cinsiyetiyle sınırlansın.

Bu yeni bir özellik değil, **tutulmamış bir söz**. Mod seçici sheet'i bugün
şunu yazıyor:

- [tr.ts:1103](../../../src/shared/i18n/translations/tr.ts#L1103) — "Kampüsten arkadaş bul — yalnız aynı cinsiyetten kişiler."
- [en.ts:1093](../../../src/shared/i18n/translations/en.ts#L1093) — "Find friends on campus — same gender only."

Gerçek davranış bunun tersi: Friends kaydında `RegisterStep10` (InterestedIn)
atlanıyor ve sunucu `InterestedInFlags`i varsayılan üç kategoride bırakıyor
([registrationFlow.ts:29-32](../../../src/features/auth/registrationFlow.ts#L29-L32),
[two_mode_frontend_plan_2026-10.md:47](../../../two_mode_frontend_plan_2026-10.md#L47)).
Yani deste karma geliyor.

## Hedefler

- Friends destesi kullanıcının cinsiyet **kategorisiyle** sınırlı olsun.
- Kural kullanıcı tarafından gevşetilemesin — bir filtre değil, modun tanımı.
- Non-Binary kullanıcı modu ilk açtığında boş desteyle karşılaşmasın.
- Friends'teki tercih Dating destesini etkilemesin.

## Hedef olmayanlar

- Dating modunun davranışı. `InterestedIn` orada aynen kullanıcının seçimi.
- Hesap seviyesindeki swipe filtrelerinin (yaş/mesafe/şehir/hobi) yapısı.
- Friends'e ayrı bir cinsiyet **filtresi** eklemek.
- Alt cinsiyet (sub-gender) seviyesinde eşleştirme.

## Anti-hedefler (teknik olarak çalışsa bile başarısızlık sayılır)

- Non-Binary kullanıcının Friends'i açıp **boş deste** görmesi.
- Friends'te yapılan bir seçimin Dating destesini sessizce daraltması.
- Yalnız FE'yi değiştirip kuralı kurmamak: bölüm gizlenir, deste karma kalır,
  söz hâlâ tutulmaz.

## Kısıtlar (koddan)

1. **Filtreler hesap seviyesinde tek.** `swipeKeys.filters = ["swipe","filters"]`,
   `GET/PUT /api/swipe/filters` uçlarında mod parametresi yok
   ([swipeQueries.ts:139-149](../../../src/features/discover/swipeQueries.ts#L139-L149)).
   Friends'teki bir cinsiyet seçimi bu alana yazılırsa Dating'i de daraltır.
2. **Per-mode alan zaten var.** `POST /api/profile/modes/{mode}/open`
   gövdesinde `interestedIn` kabul ediliyor
   ([api.ts:79](../../../src/shared/constants/api.ts#L79)). Friends'te
   gönderilmiyor ve sunucu yok sayıyor
   ([ModeSetupSheet.tsx:195-198](../../../src/features/discover/components/ModeSetupSheet.tsx#L195-L198)).
3. **FilterModal'ın mod farkındalığı yok.** `mode` prop'u hiç geçmiyor
   ([DiscoverScreen.tsx:3410](../../../src/features/discover/screens/DiscoverScreen.tsx#L3410)),
   bölüm Friends'te de çiziliyor, üstelik boşken Uygula'yı kilitliyor
   ([FilterModal.tsx:2788](../../../src/features/discover/components/FilterModal.tsx#L2788))
   ve Sıfırla'yı engelliyor
   ([FilterModal.tsx:2521](../../../src/features/discover/components/FilterModal.tsx#L2521)).
4. **Profilde kategori saklanmıyor.** Yalnız alt cinsiyetin `enumName`i var
   ([RegisterStep7Screen.tsx:38-39](../../../src/features/auth/screens/RegisterStep7Screen.tsx#L38-L39)).
   Kategori istemcide "listede ilk hangi kategoride geçiyorsa o" diye
   türetiliyor
   ([GenderCategoryPicker.tsx:38-47](../../../src/shared/components/GenderCategoryPicker.tsx#L38-L47)).
5. **Transgender iki kategoride birden.** Backend `Transgender`ı hem Erkek hem
   Kadın altında döndürüyor
   ([commonQueries.ts:85-90](../../../src/shared/queries/commonQueries.ts#L85-L90)).
   Kısıt 4 ile birlikte: istemcinin kategori tahmini **sıraya bağlı** ve bir
   kuralın temeli olamaz.
6. **İki uç iki format konuşuyor.** `/swipe/filters` int bekliyor (Men=0,
   Women=1, NonBinary=2 — [FilterModal.tsx:464-474](../../../src/features/discover/components/FilterModal.tsx#L464-L474)),
   `/modes/{mode}/open` enumName bekliyor ("Men"/"Women"/"NonBinary" —
   [RegisterStep10Screen.tsx:19](../../../src/features/auth/screens/RegisterStep10Screen.tsx#L19)).

## Değerlendirilen yollar

**A — Yeni alan.** Sunucu Friends'te `InterestedIn`i yok saymaya devam eder,
kuralı kendi türetir; Non-Binary havuzu için ayrı bir `FriendsInterestedIn`
eklenir. Kavramsal ayrım net, ama aynı soruyu iki alan cevaplar ve deste
sorgusu iki yerden okur — `*Name` ikizlerinin kaldırılma gerekçesiyle aynı
maliyet.

**B — Var olan per-mode alanı Friends'te saklamak. ✅ SEÇİLDİ**
Sunucu `/modes/friends/open`'daki `interestedIn`i artık saklar. İkili
kategorideki kullanıcıda değer **sunucu tarafından kendi cinsiyetinden
doldurulur ve kilitlenir**; Non-Binary'de istemcinin sorduğu havuz yazılır.
Tek alan, yeni sözleşme yok, deste sorgusu tek yerden okur, kural istemciye
güven gerektirmez.

**C — Kuralı istemcide filtre olarak kurmak.** Elendi: Kısıt 1 yüzünden
Friends'teki seçim Dating'i bozar, üstelik kullanıcı gevşetebileceği için
kopyadaki söz yine tutulmaz.

## Kararlar

### Kuralın yeri

Kural **backend'in deste sorgusunda**, `Mode=Friends` dalında. İstemci hiçbir
noktada kapı değil. FE'nin tek sorumluluğu soruyu doğru yerde sormak ve
sormadığı yerde bölümü göstermemek.

### Eşleşme birimi: kategori

Havuz, cinsiyet **kategorisi** (Erkek / Kadın / Non-Binary) üzerinden kurulur,
alt cinsiyet üzerinden değil. `Male` ile `TransMale` aynı havuzdadır.

Alt cinsiyet → kategori eşlemesi **sunucunun sahipliğinde**. Kısıt 4+5 gereği
istemci bunu güvenilir biçimde türetemez; `Transgender` gibi iki kategoride
görünen değerlerin hangi havuza düştüğü sunucuda sabitlenmeli ve bu karar
yazılı olmalı.

### Değerin doldurulması

| Kullanıcının kategorisi | `interestedIn` nasıl belirlenir | FE soruyor mu |
|---|---|---|
| Erkek | Sunucu `["Men"]` yazar ve kilitler | Hayır |
| Kadın | Sunucu `["Women"]` yazar ve kilitler | Hayır |
| Non-Binary | Kullanıcının seçtiği havuz (çoklu) | Evet |

İkili kategorilerde sunucu istemciden geleni **yok sayar** ve kendi
türetmesini yazar — eski istemciler ve elle kurulmuş istekler de kurala uyar.

### Non-Binary havuz sorusu

Non-Binary kullanıcıya tek seferlik bir soru: *"Arkadaş modunda kimleri görmek
istersin?"* — Kadınlar / Erkekler / Non-Binary, çoklu seçim, en az bir tane
zorunlu.

Gerekçe: "NB yalnız NB görür" kuralı kampüs ölçeğinde bu kullanıcılara modun
ilk açılışında boş deste gösterirdi (anti-hedef). Bumble BFF de aynı çözümü
kullanıyor.

**Soruyu kime soracağımızı nasıl biliyoruz.** İki ayrı yol, çünkü kayıt
sırasında profil daha sunucuda yok:

- **Kayıt sırasında** istemci kararı `useGenders()` kataloğundan verir: seçilen
  alt cinsiyet Non-Binary kategorisinde mi? Kısıt 5'teki belirsizlik bu kararı
  **etkilemiyor** — iki kategoride görünen değerler (`Transgender`) Erkek ve
  Kadın altında; Non-Binary'de ikizlenme yok. Yine de savunma kuralı: bir alt
  cinsiyet hem Non-Binary'de hem ikili bir kategoride görünürse istemci
  **sormaz**, sunucunun türetmesine bırakır.
- **Kayıttan sonra** istemci hiç türetmez. Sunucu Friends profilinde
  `interestedIn` ile birlikte bir **kilit bayrağı** döndürür; istemci yalnız
  kilit açıkken sorar (bkz. Backend 6).

**Üç yüzey:**

1. **ModeSetupSheet** (Friends'i sonradan açma) —
   [ModeSetupSheet.tsx:401](../../../src/features/discover/components/ModeSetupSheet.tsx#L401)'deki
   `!isFriends` koşulu "Dating ise cinsiyet tercihi, Friends + kilit açıksa
   havuz sorusu" hâline gelir.
2. **Kayıt akışı** — `RegisterStep10` bugün `DATING_ONLY_STEPS` içinde
   ([registrationFlow.ts:57](../../../src/features/auth/registrationFlow.ts#L57)).
   Friends seçen Non-Binary kullanıcı için adım gösterilmeli; eleme artık
   moda **ve** seçilen cinsiyete bağlı. İlerleme çubuğunun paydası ile resume
   yığını bu kaynaktan okumaya devam etmeli (ayrışırsa bar takılır —
   dosyadaki mevcut uyarı).
3. **Friends'e girişte tek seferlik sheet** — mevcut Non-Binary kullanıcılar
   için. Gerekçe aşağıda.

### Sorunun ulaşılabilirliği (mevcut Non-Binary kullanıcılar)

`interestedIn` için profil düzenlemede **hiçbir yüzey yok** — alan filtreye
taşındığından beri `src/features/profile` altında hiç geçmiyor. Friends
niyetleri de yalnız ModeSetupSheet ve kayıt adımlarında düzenlenebiliyor;
`useFriendshipIntents` başka hiçbir yerden çağrılmıyor. ModeSetupSheet ise
yalnız mod **kapalıyken** açılıyor.

Yani "sheet bir dahaki açılışında sorulur" demek, zaten Friends'i açmış bir
kullanıcı için **hiçbir zaman sorulmaz** demek. Kalıcı durum tanımlayıp ona
ulaşan yolu tanımlamama tuzağı.

**Karar:** DiscoverScreen'in mevcut `setupMode` makinesi genişletilir. Friends
moduna girildiğinde profil açık ama havuz değeri boş **ve** kilit açıksa,
ModeSetupSheet'in yalnız havuz sorusunu taşıyan dar hâli açılır. Yeni ekran
yok, var olan makine kullanılır.

Reddedilen alternatif: soruyu FilterModal'ın Friends görünümüne koymak.
Ulaşılabilir ama o modal `/swipe/filters`'a yazıyor — değer Friends profiline
ait, tek modalde iki ayrı hedefe yazmak sözleşmeyi bulandırırdı.

### FilterModal

- `mode` prop'u geçilir.
- Friends'te `interestedIn` bölümü **hiç çizilmez**.
- `interestedInEmpty` guard'ı Friends'te Uygula'yı ve Sıfırla'yı
  **kilitlememeli** (Kısıt 3). Bugün değer dolu geldiği için kilit görünmüyor;
  bölüm kalkınca bu sessiz bağımlılık açığa çıkar.
- Bölümün Dating'deki başlığı düzeltilir: `interestedIn.title` bugün
  **"İlgi Alanı"** ([tr.ts:1321](../../../src/shared/i18n/translations/tr.ts#L1321))
  ve hobilerle karışıyor — filtrede ayrıca gerçek bir "Hobiler" bölümü var.
  ModeSetupSheet'in dili ("Kiminle ilgileniyorsun?") kanonik alınır.

### Mevcut kullanıcılar

- **Var olan eşleşmeler ve sohbetler korunur.** Kural yalnız yeni deste
  kartlarına uygulanır; kimsenin arkadaşı bir güncellemede kaybolmaz.
- **İkili kategorideki mevcut Friends kullanıcıları** için sunucu değeri
  geriye dönük doldurur (kendi cinsiyetinden). Kullanıcıdan bir şey istenmez.
- **Non-Binary mevcut Friends kullanıcıları** için değer boş kalır. Boş değer
  "üç kategori" (bugünkü davranış) sayılır — deste çökmez — ve havuz sorusu
  yukarıdaki tek seferlik sheet ile sorulur. Alternatifi modu kilitlemekti;
  mevcut kullanıcıyı çalışan bir modun dışında bırakmamak için seçilmedi.
- **Kullanıcı cinsiyetini sonradan değiştirirse** sunucu ikili kategorilerde
  değeri yeniden türetip yazmalı. Aksi hâlde kilit bayatlar.

### Hata kodları

Mod uçları UT-23xx ailesini kullanıyor ve 2305/2309 **bilerek nötr** — karşı
tarafın modu/cinsiyeti bilgi sızıntısı sayılıyor
([tr.ts:1149-1151](../../../src/shared/i18n/translations/tr.ts#L1149-L1151)).
Yeni doğrulama (Non-Binary'de havuz boş) için eklenecek kod da aynı kurala
uymalı: mesaj kullanıcının kendi eksiğini anlatmalı, karşı taraf hakkında
hiçbir şey ima etmemeli.

## Backend'den istenecekler

Repo konvansiyonuna göre ayrı bir `backend_friends_same_gender_2026-11.md`
yazılacak. İçeriği:

1. `Mode=Friends` deste sorgusunda aynı-kategori kuralı.
2. `/modes/friends/open` → `interestedIn` saklanmaya başlasın; ikili
   kategorilerde sunucu kendi türetmesini yazsın (istemciden geleni yok sayarak).
3. Alt cinsiyet → kategori eşlemesinin sabitlenmesi, özellikle `Transgender`.
4. Geriye dönük doldurma + mevcut eşleşmelerin korunması.
5. Cinsiyet değişiminde yeniden türetme.
6. Friends profilinin `interestedIn`i **bir kilit bayrağıyla birlikte**
   okunabilir bir uçtan dönsün (ör. `friendsInterestedIn` +
   `friendsInterestedInLocked`). İstemci kayıttan sonra kategori türetmemeli;
   soruyu sorup sormayacağını bu bayraktan okumalı. Bayrak olmadan FE,
   Kısıt 4+5 yüzünden kime soracağını güvenilir biçimde bilemez.

## Builder'a bırakılanlar

- Havuz sorusunun bölüm yerleşimi ve metin anahtarlarının adları.
- `RegisterStep10`'un Friends varyantında başlık/açıklama kopyası.
- FilterModal'daki `interestedInEmpty` guard'ının mod-farkındalı hâlinin
  nereye yazılacağı (guard'ın kendisi mi, Uygula'nın `actionDisabled`ı mı).
- Testlerin kapsamı; mevcut `tests/features/discover/` kalıbı izlenir.

## Açık bağımlılık

FE tarafı tek başına kuralı kurmuyor. Backend 1 ve 2 maddeleri inmeden
sürüm çıkarsa bölüm gizlenmiş ama deste hâlâ karma olur — yani kopyadaki söz
tutulmamaya devam eder. Sıralama: backend kuralı → FE yüzeyleri.
