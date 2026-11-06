# Mod açılışında fotoğraf adımı + editörden mod seçicisinin kalkması (2026-11-06)

## Niyet

İki istek, tek tur:

1. **Mod açarken fotoğraf sorulsun.** Bugün `ModeSetupSheet` yalnız niyet +
   prompt topluyor; `openProfileMode` fotoğraf alanı göndermiyor ve backend
   (kütüphane modeli, §4.4 devralma kuralı) yeni modu diğer modun
   fotoğraflarıyla açıyor. Kullanıcı bunu seçmedi, haberi de yok.
2. **Profil editöründeki Flört/Arkadaş segmenti kalksın.** Editör, aktif
   uygulama modunun profilini açsın — "hangi profili düzenliyorum" sorusu
   kullanıcının zaten içinde bulunduğu modla cevaplanıyor.

Backend sözleşmesi hazır ve yayında (`backend_mode_photos_answer_to_fe.md`):
`POST /api/profile/modes/{mode}/open` multipart kabul ediyor, `PhotoIds[]`
(dizi sırası = order), `MainPhotoId`, opsiyonel `NewPhotos`; idempotent;
"yeni istemci her zaman `PhotoIds` gönderir" beklentisi açıkça yazılı.

## Hedefler / hedef olmayanlar

- Hedef: kurulum TEK istekte bitmeye devam etsin (open ucu her şeyi alıyor).
- Hedef: kullanıcı ya mevcut (diğer modun) fotoğraflarını bilinçli seçsin ya
  da yeni kare çeksin/seçsin.
- Hedef değil: kurulum sheet'inde sürükle-sırala, karma düzenleme (mevcut +
  yeni birlikte), foto çıkarma — bunlar editörün işi olarak kalıyor.
- Anti-hedef: `open`'ı iki isteğe bölmek (foto sonra) — görünürlük penceresi
  açar (profil fotosuz açılır, `HiddenInsufficientPhotos`'a düşer).

## Yaklaşımlar (konuşmada seçildi)

- **A — Seçenek kartı + koşullu ızgara (SEÇİLDİ).** "Flört fotoğraflarımı
  kullan" işaretli başlar; işaret kalkınca ekle karolu mini ızgara (kamera /
  galeri). İki yol alternatif, karma yok.
- B — Tam ızgara (önseçili, çıkarılabilir, sürüklenebilir): tam esneklik ama
  bottom sheet içinde sürükleme çatışması + belirgin fazla iş. Elendi.

## Tasarım — fotoğraf adımı

**Yer:** `ModeSetupSheet` içinde yeni "Fotoğraflar" bölümü (niyet bölümünün
üstünde ya da altında — builder kararı; sheet zaten çok bölümlü ve kaydırmalı).

**İki hâl:**

1. **"Flört fotoğraflarımı kullan" (varsayılan, işaretli).** Mevcut
   `RegisterOptionCheckbox` kalıbıyla bir seçenek satırı; altında diğer modun
   fotoğraflarının KÜÇÜK, salt-okunur önizleme şeridi (thumbnail satırı —
   `ProfilePhotoGrid` DEĞİL, sürükleme/ekleme yok). Submit'te `PhotoIds` =
   kaynak modun slot sırası, `MainPhotoId` = kaynak modun anası (açıkça
   gönderilir — sunucunun devralma varsayılanına yaslanılmaz, sözleşme "yeni
   istemci her zaman PhotoIds gönderir" diyor).
   - Etiket moda göre: Friends açılırken "Flört fotoğraflarımı kullan",
     Dating açılırken "Arkadaş fotoğraflarımı kullan" (simetri korunuyor).
2. **İşaret kaldırılınca:** boş foto ızgarası — yalnız EKLE karoları (statik
   yerleşim, mutlak konum/sürükleme YOK; `photoGridGeometry` ölçüleriyle aynı
   görsel dil). Ekle karosu kayıtla ortak `PhotoSourceSheet`i açar → kamera
   (`captureAndCropPhoto`, uygulama içi kamera + kırpıcı) ya da galeri
   (`pickAndCropPhotos`). Seçilen kareler YEREL kalır (kayıt akışı kalıbı:
   upload submit'e kadar yok), küçük önizleme + silme ✕'i çizilir. İlk kare =
   ana foto (rozetle gösterilir). Submit'te `NewPhotos` (multipart) gider,
   `PhotoIds` GÖNDERİLMEZ.
   - **En az 2 kare** şartı (sunucu `PhotoVisibility.MinimumVisiblePhotos = 2`,
     mod başına): daha azıyla profil açılır ama görünmez olurdu. Buton 2'den
     az seçimde pasif + açıklama satırı.
   - Tavan: `MAX_PROFILE_PHOTOS` (6) — kütüphane tavanı yok ama slot tavanı var.

**Submit (`DiscoverScreen > handleSubmitModeSetup` + `profileService.openProfileMode`):**
- `openProfileMode` multipart'a geçer (kanonik content-type). Alanlar:
  `FriendshipIntents[]`/`InterestedIn[]`/`RelationshipIntent` (mevcut),
  `Prompts[i].PromptKey/Answer`, ve yeni: `PhotoIds[i]` + `MainPhotoId` YA DA
  `NewPhotos` dosyaları.
- Hata yolu aynı kalır: sheet açık, veri korunur, `errorText` gösterilir.
- Yeni kare yolunda moderasyon cevabı okunur (`summarizeModeration` kalıbı):
  istek 200 dönse de kare Review'a düşmüş olabilir — Alert ile söylenir.

**Veri kaynağı:** diğer modun fotoğraf listesi `GET /api/profile`
(`photosList` / `friendsPhotosList`). Sheet açıldığında eldeki profil
cache'inden okunur; yoksa çekilir.

**Moderasyonlu kaynak (builder-check bulgusu, benim kararım):** "mevcut
fotoğrafları kullan" seçeneği yalnız kaynak modun GÖRÜNÜR
(`isVisibleToOthers`) foto sayısı ≥ 2 iken çizilir; azsa doğrudan 2. hâl
açılır. `PhotoIds` yine TÜM slotları taşır (sunucunun devralma semantiğiyle
birebir), `MainPhotoId` kaynak ana — görünmez kareler kopyada da görünmez
kalır, görünürlük eşiğini görünür olanlar sağlar.

**Moderasyon özeti (builder-check bulgusu, benim kararım):** `open` yanıtı
`{dating, friends}` haritası olarak KALIYOR — yanıt sözleşmesine dokunulmaz.
Yeni-kare yolunda başarıdan sonra tek `GET /api/profile` atılır, özet
(`summarizeModeration` kalıbı) yeni modun listesinden okunur; Review'a düşen
kare Alert ile söylenir. "Mevcut fotoğraflar" yolunda yeni moderasyon yok,
ek tur da yok.

## Tasarım — editörden mod seçicisinin kalkması

- `EditProfileForm > ModeSwitch` (segmented kapsül) ve `ModeClosedNotice`
  SÖKÜLÜR. Formun `editMode`'u artık state değil, aktif uygulama modundan
  türer.
- **Kapalı mod yedeği (builder-check bulgusu, benim kararım):** "aktif mod her
  zaman açık" varsayımı güvenli değil — `useAppMode` Keşif'e hiç uğramadan
  (reconcile koşmadan) kapalı Dating dönebilir (modePrefs'in kendi notu).
  Editör aktif mod kapalıysa sessizce AÇIK olan moda düşer:
  `editMode = openModes[aktif] ? aktif : açıkOlan`. Kapalı-mod ekranı geri
  gelmez, kullanıcı asla var olmayan profili düzenlemez.
- Sonuç (konuşmada onaylandı): öbür modun profilini düzenlemek için önce modu
  değiştirmek gerekir; kapalı modu açma girişi Keşif'teki seçicide zaten var.
- Editör başlığı/çerçevesi hangi modun düzenlendiğini söylemeye devam etmeli
  (kullanıcı moddan habersiz editöre girmiş olabilir) — mevcut mod etiketi
  kalıbıyla, builder kararı.

## Tasarım — editörün FOTO boru hattı moda bağlanıyor (konuşmada onaylandı)

Segment kalkınca "hangi moddaysam o profil" sözünün tutması için foto tarafı
da moda bağlanmak ZORUNDA — yoksa Friends'te "Arkadaş profilim" başlığı
altında Flört fotoğrafları görünür ve kurulumda çekilen kareler hiçbir yerden
düzenlenemez (builder-check'in 1. bulgusu).

- **Tek çözücü kalıbı:** aktif düzenleme moduna göre alan adlarını ve listeyi
  veren saf bir modül (`modePhotoFields(mode)` gibi): okuma
  `photosList`/`friendsPhotosList` + `profileVisibility`/`friendsProfileVisibility`,
  yazma `NewPhotos`/`FriendsNewPhotos`, `PhotoOrders`/`FriendsPhotoOrders`,
  `NewMainPhotoId`/`FriendsNewMainPhotoId`, `PhotoIdsToDelete`/
  `FriendsPhotoIdsToDelete`. Dokunma noktaları (ızgara kaynağı, görünürlük
  banner'ı, gizli-profil kapısı, moderasyon rozet/itiraz yamaları, foto tavanı
  kontrolü, ana foto/selfie akışı) bu çözücüden geçer — mekanik ama çok
  noktalı iş.
- Silme = "bu moddan çıkar": dosya öbür modda duruyorsa yaşar (sözleşme).
  Editördeki silme onay metni buna göre (builder kararı).
- Moderasyon kararı dosyaya ait ve iki listede AYNI; `reasonText` numarası mod
  başına farklı olabilir — itiraz/rozet yamaları her İKİ listeyi de
  güncellemeli (aynı `photoId` iki listede olabilir).

## Kısıtlar / bilinenler

- `open` idempotent: zaten açık moda POST = alanlar uygulanır, 200. Yani
  Non-Binary havuz güncelleme yolu (DiscoverScreen'deki `shouldAskFriendsPool`
  akışı) kırılmaz; o yol foto alanı GÖNDERMEZ ("gönderilmeyen alana
  dokunulmaz").
- Ana foto tek-yüz kuralı mod başına ve ana-yapma denemesinde koşuyor: "Flört
  fotoğraflarımı kullan" yolunda ana zaten Flört'te ana olarak onaylı — aynı
  dosya, aynı kural, geçer. Yeni kare yolunda ilk kare ana yapılırken
  UT-6301/6302 dönebilir → sheet açık kalır, hata gösterilir (red KALICI
  DEĞİL, moderation bloğuna yazılmıyor).
- JSON yolu (foto alanı yok) eski istemci şimi olarak kalıyor; biz artık her
  zaman multipart göndeririz.

## Builder'a kalanlar

- Bölümün sheet içindeki sırası ve görsel ayrıntıları (thumbnail ölçüsü,
  ana foto rozeti).
- Önizleme şeridi/boş ızgara için yeni küçük bileşen mi, `ProfilePhotoGrid`'in
  statik bir alt hâli mi — sürükleme gerekmediği için muhtemelen yeni hafif
  bileşen.
- i18n anahtar adları (tr+en).

## Açık varsayım (backend'e not düşülecek)

Yalnız `NewPhotos` gönderilen açılışta sıranın dosya sırası, ananın ilk kare
olduğu varsayılıyor — sözleşme bunu açıkça yazmıyor (`MainPhotoId` yalnız
mevcut id alıyor). Yanlışsa düzeltme ucuz: ilk istekte `NewPhotos` + ikinci
`UpdateProfile` ile ana ataması. Teslimden önce canlıda doğrulanacak.
