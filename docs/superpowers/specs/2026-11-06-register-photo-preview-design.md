# Kayıtta fotoğraf önizlemesi — kampüs anlarıyla aynı ekran

**Tarih:** 2026-11-06
**Boyut:** küçük-orta bir değişiklik (4 dosya + i18n; yeni mimari yok, iki mevcut
köprü olduğu gibi kullanılıyor)

---

## Niyet

Kayıt akışının fotoğraf adımında (`RegisterStep15Screen`) fotoğraf eklemenin iki
yolu var — galeri ve kamera — ve ikisi de kırpma ekranına çıkıyor. İstek: her iki
yol da **kampüs anlarında deklanşörden sonra görülen önizleme ekranının aynısına**
çıksın. Tek fark sol alttaki gri açıklama yazısının olmaması; ek olarak o ekrana
bir **kırpma butonu** gelsin.

### Neden

Bugün kayıtta eklenen fotoğraf, kullanıcının gördüğü son ekran olarak kırpma
ekranını bırakıyor: kadraj seçtiren, köşe tırnakları olan, "Kaydet" diyen bir
düzenleme yüzeyi. Kampüs anlarındaki ekran ise bir **onay** yüzeyi — fotoğrafı
olduğu gibi gösteriyor, tek bir yuvarlak ok ile ileri gidiyor. Kayıtta eklenen
fotoğraf için doğru soru "kadrajı nasıl ayarlayayım" değil "bu fotoğraf mı",
dolayısıyla doğru yüzey de onay yüzeyi. Kırpma, isteğe bağlı bir detour hâline
geliyor.

---

## Hedefler

1. Kayıtta galeri ve kamera, **tek ve aynı** önizleme ekranına çıksın.
2. O ekran kampüs anlarındaki ekranla **aynı bileşen** olsun (birebir aynılık
   yapısal olarak garanti edilsin, kopyalamayla değil).
3. Önizlemede **kırpma butonu** olsun; kırpma ekranı onun arkasına geçsin.
4. Sol alttaki açıklama yazısı kayıtta **çizilmesin**.
5. Önizlemede görülen kare, yüklenen karenin **tam olarak kendisi** olsun.

## Hedef olmayanlar

- **Kampüs anları ekranı değişmiyor.** Pencere orada ekran oranında kalıyor,
  kırpma butonu çıkmıyor, `commitHint` duruyor.
- **Profil düzenleme (`EditProfileForm` / `ProfileScreen`) değişmiyor.** Orada
  bugünkü kırpıcı akışı duruyor. ⚠️ Bu, uygulamada iki farklı fotoğraf ekleme
  deneyimi bırakıyor; bilinçli bir kapsam kararı, ayrı bir istek olarak
  ele alınmalı.
- **Selfie doğrulama** (`SelfieVerificationOverlay`) hiç dokunulmuyor.
- Kırpıcının kendi arayüzü değişmiyor.

## Karşı-hedefler (teknik olarak çalışsa bile başarısızlık sayılır)

- Önizlemede görülen kadrajın yüklenen kareden farklı olması. Kırpma butonu
  eklendiği an bu bir hata sınıfı: kullanıcı kadrajı seçer, döner, kenarlarının
  kesildiğini görür.
- Kamera yolunda deklanşörden sonra ekranın kapanıp yenisinin açılması. Kampüs
  ekranının tüm tasarımı (`cameraBridge > commit`) tam olarak bunu engellemek
  için var.
- Aynı görünen iki ayrı ekranın kodda iki kopya hâlinde yaşaması.

---

## Kısıtlar

1. **Yüklenen kare her zaman 3:4.** `fitPhotoForUpload` ortadan 3:4 kesiyor,
   kırpıcı da 900×1200 üretiyor (`cropGeometry > OUTPUT_W/H`). Önizleme penceresi
   buna uymak zorunda.
2. **Kamera 3:4 çekiyor** (`pictureSize="Photo"`) — bu sabit, değiştirilmemeli
   (gerekçe `CameraCaptureOverlay` içinde `pictureSize` prop'unun başında).
3. **`GlassView` tuzağı:** ata zincirinde `opacity < 1` veya `transform` varsa cam
   efekti sessizce düşüyor. Ekranın kayması bu yüzden `top` ile yapılıyor; yeni
   hiçbir gizleme/animasyon opaklıkla ya da transform'la yapılmamalı.
4. **Kırpıcı, önizlemenin ÜSTÜNDE açılmak zorunda.** `App.tsx`te
   `<CropperOverlay />` (satır 211) `<CameraCaptureOverlay />`den (satır 220)
   ÖNCE render ediliyor, yani kardeş sırası kamerayı üste koyardı; kırpıcının
   kökündeki `zIndex: 1` (`CropperOverlay.tsx:1000`) bunu şu an telafi ediyor.
   Bugüne kadar hiç test edilmedi çünkü iki ekran hiç aynı anda açık olmadı.
5. **`pickingRef` mandalı kamera ile galeri arasında paylaşılıyor**
   (`RegisterStep15Screen.tsx:272`) ve "kayıtta galeri çalışmıyor" raporunun en
   güçlü hipotezi bu. Bu akış zaten yeniden yazılıyor.

---

## Yaklaşımlar

Üçü de değerlendirildi; seçilen **1**.

**1. `CameraCaptureOverlay` genişletilir — SEÇİLEN.**
Overlay'e üç ayar ekleniyor: pencere şekli, hazır bir kareyle "kamerasız"
giriş (galeri yolu) ve kırpma eylemi. Galeri fotoğrafı da kamera karesi de
**aynı bileşende** duruyor. "Birebir aynı" şartı yapısal olarak sağlanıyor;
kamera yolunda deklanşörden sonra ekran kapanmıyor, kampüsteki donma davranışı
aynen korunuyor.
*Bedeli:* dosya zaten 1386 satır ve kamerasız modda flaş/çevir/mercek/zaman
aşımı/`pausePreview` dallarının kapatılması gerekiyor.

**2. Ayrı `PhotoPreviewOverlay` + kendi köprüsü.**
Kamera çeker → kapanır → önizleme açılır. Temiz ayrım, kamera dosyasına
dokunulmuyor. **Reddedildi:** kamera yolunda ekran aşağı kayıp yenisi yukarı
geliyor — kampüsün en bilinçli kararının tam tersi, ve "tamamen aynı" hissi
orada bozuluyor.

**3. Hibrit:** kamera yolu yerinde donar, galeri yolu ayrı ekran kullanır.
**Reddedildi:** aynı görünen ekranın iki kopyası; kırpma butonu iki yere
konur ve zamanla ayrışırlar (hedef 2'nin ihlali).

---

## Kararlar

### Pencere: 3:4, `frameWindow` ile, ekranın ortasında

Kayıt yolunda pencere `frameWindow({ screenW, screenH, headerH, footerH,
aspectW: 3, aspectH: 4 })` ile hesaplanır ve ekran merkezine oturur — kırpıcının
kullandığı formülün ve yerleşimin aynısı (`cropGeometry > frameWindow`,
`CropperOverlay > layout`).

**`headerH`/`footerH` girdisi kamera ekranının KENDİ ölçüleri olmalı**, kırpıcının
değil. Modern telefonlarda iki pencere zaten birebir çakışıyor (iPhone 15:
her ikisi de 393×524, merkezde) çünkü `winW` ekran genişliğinde tavanlanıyor.
Küçük cihazlarda (ör. SE) kırpıcının girdileri kullanılırsa pencere deklanşör
şeridinin altına taşıyor; kameranın kendi ölçüleriyle taşma olmuyor, karşılığında
o cihazlarda kırpıcıya geçerken küçük bir ölçek sıçraması kalıyor. Taşma, sıçramadan
daha kötü.

Fotoğraf pencereye `contentFit="cover"` ile oturur. 3:4 pencere + `cover` =
`fitPhotoForUpload`ın ürettiği ortadan 3:4 kesimin ta kendisi, yani önizleme
yüklenen karenin birebir aynısı (hedef 5). Kırpıldıktan sonra kaynak zaten 3:4
olduğu için pencereye tam oturur, ikinci bir kesme olmaz.

**Kampüs yolu bugünkü tam-kanama penceresini korur** — orada 3:4'e dönmek kadrajı
daraltır, ayrı bir karar.

### Chrome

Kayıt önizlemesinde:
- Sol üst **✕** — kameradan geldiyse "vazgeç", galeriden geldiyse "bu fotoğrafı
  atla". (Aynı buton, anlamı çağıranda.)
- Sağ üst: **kırpma** butonu (`systemImage="crop"`, `t('common.cropper.crop')` —
  kırpıcının başlığındakiyle aynı ikon ve etiket). Kameradan geldiyse solunda
  **yeniden çek** de duruyor; galeri yolunda yeniden çekilecek bir şey yok, o
  buton çizilmiyor.
- Alt satır: **sol taraf boş** (`commitHint` verilmiyor), sağda bugünkü yuvarlak
  dolu ok.
- Galeri yolunda flaş / çevir / deklanşör / çift-dokunuş-çevir yok.

### Kırpma, overlay'in İŞİ DEĞİL — çağıranın

Overlay kırpıcıyı kendisi açmaz. İsteğe şu eklenir:

```ts
/** Verilirse sağ üstte kırpma butonu çıkar. Dönen kare ekrandakinin YERİNE
 *  geçer; `null` = vazgeçildi, kare aynı kalır. */
crop?: (shot: CameraShot) => Promise<CameraShot | null>;
```

Böylece overlay `PickedPhoto`yu, `presentCropper`ı, `persistPickedPhoto`yu ve
"kırpılmış çıktı artık nihai dosya" bilgisini hiç bilmez; bunların hepsi zaten
`photoPicker.ts`te. Kırpma tekrar edilebilir (900×1200 bir çıktı yeniden
kırpılabilir); her turda bir öncekinin dosyası unutulur.

### `cameraBridge > CameraRequest` eklemeleri

```ts
/** Pencere şekli. 'fill' = bugünkü tam kanama (kampüs), 'photo' = 3:4 (kayıt). */
frame?: 'fill' | 'photo';            // varsayılan 'fill'
/** Dolu ise KAMERA HİÇ AÇILMAZ: ekran doğrudan bu kareyle donmuş başlar. */
source?: CameraShot;
/** Yukarıdaki kırpma kancası. */
crop?: (shot: CameraShot) => Promise<CameraShot | null>;
```

`CameraOutcome` değişmiyor. `source` verilmiş bir oturum da host bağlı değilse
`unavailable` dönebilir; çağıran o dalda bugünkü kırpıcı yoluna düşer, yani
fotoğraf eklemek hiç çalışmamaz hâle gelmez.

### Kamerasız modda kapatılacak dallar

`source` doluyken: `CameraView` hiç mount edilmez; 3.5sn `unavailable` zaman
aşımı kurulmaz; `pickDefaultLens`, `pausePreview`/`resumePreview`,
`handleCapture`, `handleFlip`, `flipTap`, flaş ve deklanşör devre dışı;
`showStill` daima `true`; `frozen` daima `true`; `handleRetake` çizilmez.

### `photoPicker.ts`

İki yeni dışa açık fonksiyon (eskiler kalıyor — profil ve yedek yollar
kullanıyor):

- `captureAndPreviewPhoto(options)` → `PickedPhoto | null`
  `presentCameraCapture({ facing, frame: 'photo', crop, commit })`.
- `pickAndPreviewPhotos(maxFiles)` → `PickedPhoto[]`
  Galeri seçimi bugünkü gibi (`launchImageLibraryAsync`, `orderedSelection`,
  ayarlar DEĞİŞMEZ), ardından her asset için **sırayla** önizleme
  (`source` ile). `cancelled` = o fotoğrafı atla, `unavailable` = döngüyü kır ve
  kalanları bugünkü `cropSequentially` yoluna ver.

`commit`, karenin kırpıcıdan mı geldiğini URI ile ayırt eder: kırpılmışsa dosya
zaten nihai (900×1200, kalıcı dizinde), değilse `fitPhotoForUpload`dan geçer.
Ölçekleme bu yüzden hâlâ ok'a basıldıktan sonra, göstergenin altında koşuyor.

**Dosya sahipliği:** kırpma her turda bir öncekinin dosyasını unutur; ✕ ile
atılan kare overlay'in `discard`ı ile silinir; onaylanan karenin ham hâli
`commit` içinde, `fitPhotoForUpload` yeni dosyayı yazdıktan SONRA unutulur.

### `RegisterStep15Screen`

`addFromGallery`/`addFromCamera` yeni fonksiyonlara geçer.
**`pickingRef` ikiye ayrılır** (galeri ve kamera ayrı mandal) — kısıt 5'teki
paylaşımlı mandal bu akışın yeniden yazıldığı yerde duruyor ve bilinen bir
sessiz hata kaynağı. Teşhis `devLog`ları korunur.

### i18n

Yeni görünür metin yok. Tek ekleme: `common.add: 'Ekle'` / `'Add'` — ok butonunun
erişilebilir adı (`commitLabel`); bugünkü varsayılan `common.save` kayıt bağlamında
yanlış okunuyor. Ekranda yazı olarak görünmüyor.

### `App.tsx`

Mount sırası olduğu gibi bırakılır; kırpıcının `zIndex: 1`i onu üstte tutuyor
(kısıt 4). **Cihazda doğrulanmalı** — önizleme açıkken kırpma butonuna basıldığında
kırpıcı görünmüyorsa çözüm `<CameraCaptureOverlay />`i `<CropperOverlay />`in
ÖNÜNE almak; `App.tsx:215-219`teki yorum zaten bu niyeti yazıyor.

---

## Uygulayıcıya bırakılanlar

- `frame: 'photo'` yerleşiminin kodda nasıl ifade edileceği (mevcut `layout`
  memo'su içinde dallanma mı, iki ayrı memo mu).
- Kamerasız modda dalları kapatmanın şekli (tek bir `previewOnly` türetilmiş
  değer mi, isteğin `source`una doğrudan bakmak mı).
- Önizleme ile kırpıcı arasındaki geçişte ek bir animasyon olup olmayacağı —
  varsayılan: yok, kırpıcı kendi açılışıyla geliyor.
- Testler: `cropGeometry` saf ve test edilebilir; overlay'in kamerasız modu için
  bir render testi değerli, mevcut test altyapısına göre karar uygulayıcının.

## Doğrulama

Cihazda (simülatörde kamera donanımı yok, kamera yolu orada `unavailable`a düşer):

1. Kayıt → galeriden 1 fotoğraf → önizleme açılıyor, sol alt boş, kırpma butonu var.
2. Aynı akış → kırp → kırpıcı önizlemenin ÜSTÜNDE açılıyor → Kaydet → önizlemeye
   kırpılmış kare dönüyor → ok → fotoğraf ekleniyor.
3. Galeriden 3 fotoğraf → üç önizleme sırayla; ortadakine ✕ → o atlanıyor, diğer
   ikisi ekleniyor.
4. Kayıt → kamera → deklanşör → ekran KAPANMIYOR, kare donuyor; yeniden çek ve
   kırp çalışıyor; ok → fotoğraf ekleniyor.
5. Kampüs anları → ekran bugünkü hâlinde (tam kanama pencere, sol altta okul
   metni, kırpma butonu YOK).
6. Önizlemede görülen kadraj ile ızgaraya eklenen küçük resmin kadrajı aynı.
