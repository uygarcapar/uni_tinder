# Önizlemede yerinde kırpma — ekran değişmeden

**Tarih:** 2026-11-06
**Boyut:** proje (ortak kırpma parçasının çıkarılması + kamera ekranında kırpma kipi + `photoPicker` sözleşme değişikliği)
**Önceki iş:** `2026-11-06-register-photo-preview-design.md` (kayıt/profil önizlemesi). Bu doküman onun "kırp → ayrı `CropperOverlay`" kararını değiştiriyor.

---

## Niyet

Kayıt ve profil düzenlemede fotoğraf eklerken (kamera ya da galeri) fotoğraf, kamera
ekranının (`CameraCaptureOverlay`) donmuş-kare önizlemesinde açılıyor. Bugün oradaki
**kırp** düğmesi ayrı, tam ekran kırpma sayfasını (`CropperOverlay`) açıyor: ortalı
3:4 pencere, kendi düğmeleri, uzun bir "Kaydet". Kullanıcının isteği birebir:

> "O ekranda direkt kırpma tuşuna basınca direkt ekran değişmeden o fotoğrafın üstünde
> kırpma işareti gelsin ve kırptıktan sonra kaydedeyim ve kaydettiğim haliyle aynı
> ekranda dursun yine. Ekran değişmesin, farklı bir yere gitmesin."

Kullanıcı tarayıcıdaki mockup'ı gördü ve "aynen böyle yap" dedi. Mockup'taki akış:

1. **Önizleme** (bugünkü): sol üst ✕, sağ üst yeniden çek (yalnız kamera yolu) + kırp,
   sağ alt kırmızı/yeşil yuvarlak ok (ekle).
2. **Kırpma kipi** (kırp'a basınca): AYNI pencere, fotoğraf yerinden OYNAMIYOR; üstüne
   3:4 çerçeve + ızgara + köşe tırnakları iniyor, çerçevenin dışı (pencerenin içinde
   kalan üst/alt bantlar) kararıyor. Fotoğraf iki parmakla büyütülüp sürüklenerek
   çerçevenin altına yerleştiriliyor. Düğmeler: sol üst ✕ (kırpmadan vazgeç), sağ üst
   ⟲ (sıfırla) + kırp düğmesi "açık" görünümde, sağ alt yuvarlak **✓ (kaydet)**,
   alt ortada küçük bir ipucu ("iki parmakla büyüt · sürükle").
3. **Kaydedildi**: kırpma kipi kapanıyor, kırpılmış fotoğraf önizlemede duruyor; ok ile
   ekleniyor.

3. adım için iki seçenek gösterildi, kullanıcı **B**'yi seçti: kırpılmış fotoğraf
önizleme penceresini YİNE TAMAMEN dolduruyor (bant yok). Bedeli kullanıcıya gösterildi
ve kabul edildi: 3:4 kırpılmış kare, deklanşöre kadar uzanan pencereyi doldurmak için
iki yanından tekrar kesik görünür; yüklenen ise kırpılan karenin tamamı.

---

## Hedefler

1. Kırp'a basmak ekranı DEĞİŞTİRMİYOR: aynı kamera ekranı, aynı pencere, fotoğraf aynı
   yerde ve aynı ölçekte; yalnız çerçeve iniyor ve düğmeler değişiyor.
2. Kırpma etkileşimi (büyütme, sürükleme, kenar sınırı + titreşim, çift dokunuş)
   bugünkü kırpıcınınkiyle BİREBİR aynı his — çünkü aynı kod.
3. ✓ ile kırpma kaydediliyor ve önizlemeye dönülüyor; kırpılmış fotoğraf pencereyi
   dolduruyor (B). Ok ile ekleme bugünkü gibi.
4. Kırpılmış fotoğraf tekrar kırpılabiliyor (kırp'a yeniden basınca aynı akış, artık
   kırpılmış kare üzerinde).

## Hedef olmayanlar

- **`CropperOverlay` kaldırılmıyor.** Hâlâ kullanılan yollar: profildeki mevcut
  fotoğrafı "Düzenle" (`recropExistingPhoto`), Keşif mod kurulumu
  (`ModeSetupPhotoSection` — kamera + galeri), ve önizleme yollarının yedekleri
  (`captureWithSystemCamera`, `cropSequentially`). Davranışı DEĞİŞMEMELİ.
- Kampüs anları: kırpma kancası yok, kırp düğmesi çizilmiyor — değişmiyor.
- Serbest oranlı / köşeden sürüklenen kırpma çerçevesi yok: çerçeve 3:4 ve sabit,
  hareket eden fotoğraf (bugünkü kırpıcı modeli).
- Önizleme kipinde (kırpma kipi DIŞINDA) fotoğrafa yakınlaşma/bakış yok.

## Karşı-hedefler (çalışsa bile başarısızlık)

- Kırp'a basınca fotoğrafın sıçraması, küçülmesi ya da kayması.
- Kırpma kipine girerken ya da çıkarken ayrı bir ekranın kayarak gelmesi/gitmesi.
- Dokunma kodunun (pan/pinch/çift dokunuş) iki ayrı kopya olarak yaşaması.
- `CropperOverlay`ın mevcut kullanıcılarında herhangi bir davranış değişikliği.
- Kırpma kipindeyken ✕ / arka plan / ok ile yarım kalmış bir dosyanın sahipsiz kalması.

---

## Kısıtlar

1. **Çıktı 3:4** — `OUTPUT_W=900`, `OUTPUT_H=1200`, `OUTPUT_QUALITY=0.85`
   (`cropGeometry.ts`). Kırpma çerçevesi bu yüzden 3:4.
2. **Önizleme penceresi 3:4 DEĞİL**: kayıt ve profil `frame: 'fill'` kullanıyor —
   güvenli alanın altından deklanşör şeridine kadar, tam genişlik (iPhone 15: 393×653).
   3:4 çerçeve bu pencerenin İÇİNDE durur.
3. **GlassView tuzağı:** ata zincirinde `opacity < 1` veya `transform` olan bir görünüm
   cam düğmeleri (`MediaChromeIconButton`) sessizce bozuyor. Dönüştürülen fotoğraf ve
   opaklığı animasyonlu çerçeve katmanı düğmelerin ATASI olamaz, KARDEŞİ olmalı
   (bugünkü `CropperOverlay` düzeni zaten böyle).
4. **iOS'ta donmuş kare dosya değil:** kamera yolunda iOS'ta ekranda kalan şey
   duraklatılmış canlı önizleme; çekilen dosya varsayılan olarak çizilmiyor
   (`showStill`, gerekçe dosyada — HDR yüzünden "foto kendi kendine değişti" şikâyeti).
   Kırpma DOSYA üzerinde yapılıyor, yani kırpma kipine girerken dosya çizilmek zorunda.
   Bu, ton farkının tam o anda görünmesi demek — kullanıcı açıkça kırp'a bastığı için
   kabul edilebilir. Kırp düğmesi dosya gelene kadar zaten kapalı (`disabled={busy || !shot}`).
5. **Dosya sahipliği sözleşmesi** (önceki işten, korunmalı): ✕ / yeniden çek'te overlay
   ekrandaki kareyi siler; `photoPicker` `cancelled`da hiçbir şey silmez; kırpma kancası
   bir ÖNCEKİ dosyayı siler; commit ham kaynağı `fitPhotoForUpload` yeni dosyayı
   YAZDIKTAN SONRA siler.
6. **Mount sırası:** `App.tsx`te `CameraCaptureOverlay` `CropperOverlay`den önce —
   bu iş sonrası önizleme yolları kırpıcıyı artık açmıyor ama sıra diğer yollar için
   duruyor; dokunulmayacak.

---

## Yaklaşımlar

Üçü konuşuldu, kullanıcı **1**'i seçti.

**1. Kırpıcının dokunma mantığını ortak bir parçaya çıkarmak — SEÇİLEN.**
Bugünkü kırpıcıdaki büyütme/kaydırma/kenar/çift dokunuş jestleri, bunların paylaşılan
değerleri ve çerçeve çizimi (karartma + ızgara + köşe tırnakları) ortak parçalara
taşınıyor; `CropperOverlay` ve `CameraCaptureOverlay` ikisi de bunları kullanıyor.
*Artısı:* tek dokunma kodu, iki yerde aynı his; bir düzeltme iki yere birden gidiyor.
*Bedeli:* `CropperOverlay`ın içi değişiyor — onun kullanıcıları (Düzenle, mod kurulumu,
yedekler) cihazda yeniden denenmeli.

**2. Kamera ekranına sıfırdan ayrı bir kırpma kipi yazmak.** Reddedildi: ~150 satırlık
jest kodu (iki parmağa geçiş sıçraması, kenar titreşimi, Fabric'te bayat okuma gibi
zor kazanılmış düzeltmeler) kopyalanırdı; karşı-hedef.

**3. `CropperOverlay`ı önizlemenin üstüne "görünmez" oturtmak.** Reddedildi: iki ayrı
ekranı üst üste koyarak tek ekran taklidi; düğme konumları iki dosyada senkron tutulmak
zorunda ve "hangi ekran üstte" tuzağına geri dönülür.

---

## Kararlar

### Ortak parçalar (kırpıcıdan çıkarılan)

Yeni dosyalar `src/shared/components/cropper/` altında:

- **`useCropGestures`** (hook) — bugün `CropperOverlay` içinde duran:
  paylaşılan değerler (`scale`, `tx`, `ty`, "ev" `homeS/homeX/homeY`, `gestureActive`,
  `atEdge`, `pinchPointers`), JS aynası (`latest` ref + `commit`), `clampTranslate`,
  `settleBack`, pan / pinch / çift dokunuş tanıyıcıları ve `Gesture.Simultaneous`
  bileşimi, `imageStyle`, `gridStyle`, `resetTransform(animated)`, kenar titreşimi.
  Girdiler: kırpma kipi açık mı, kaynak boyutu, `baseScale`, `maxScale`, öteleme sınır
  kutusu (`clampW`, `clampH`), jest koordinat uzayındaki çerçeve merkezi (`winCX`,
  `winCY`), ve **kip dışında pinch-bakış açık mı** (kırpıcı: evet — bugünkü davranış;
  kamera ekranı: hayır). Kırpıcının bugünkü yorumları (NEDEN'leri) kodla birlikte taşınır.
- **`CropFrame`** (bileşen) — karartma dikdörtgenleri + ızgara + `CornerTicks`,
  opaklığı kipe bağlı (`frameStyle`). Girdi: çerçeve dikdörtgeni ve karartmanın
  kapsayacağı alan (kırpıcıda tüm ekran; kamera ekranında YALNIZ pencerenin içi —
  pencerenin dışı zaten siyah zemin).
- **Kırpma uygulama yardımcısı** — bugünkü `handleApplyCrop`ın görüntü işleme kısmı:
  `ImageManipulator` ile `crop(rect)`, yeniden ÖLÇEKLEMEDEN `STEP_QUALITY` ile kaydet,
  `release()`; `{ uri, width, height }` döner (ölçü sonuçtan okunur, rect'ten değil —
  gerekçe bugünkü kodda). `CropperOverlay.handleApplyCrop` ve `photoPicker`ın kırpma
  kancası bunu kullanır.

`CropperOverlay` bu parçaları kullanacak şekilde yeniden yazılır; **görünür ve hissedilen
davranışı değişmez** (kip dışında pinch-bakış, Kırp/Sıfırla/Kaydet, `adjusted`, ara
dosya temizliği dahil).

### Kamera ekranında kırpma kipi

**Çerçeve:** 3:4, önizleme penceresinin içinde **dikeyde ortalı**, genişlik
`min(pencereEni, pencereBoyu × 3/4)` (iPhone 15: 393×524, üstte ve altta ~64.5pt bant).

**Fotoğraf yerinden oynamıyor (hedef 1):** önizlemede fotoğraf pencereyi `cover` ile
dolduruyor. Kırpma kipindeki taban ölçek kırpıcınınkiyle aynı kuralla
(`baseScale = max(pencereEni / kaynakEni, coverScale(kaynak, çerçeve))`) hesaplanır,
ama kip **`s0 = coverScale(kaynak, pencere) / baseScale`** ölçeğinden, öteleme 0'dan
başlar. Çerçevenin merkezi pencerenin merkezi olduğu için bu, önizlemedeki görüntünün
piksel piksel aynısı. `s0 ≥ 1`; kullanıcı iki parmakla 1'e kadar uzaklaşıp fotoğrafın
tamamını çerçeveye alabilir. Öteleme sınırı: yatay → pencere eni, dikey → çerçeve
boyu (kırpıcının "eksen başına sabit kutu" kuralıyla aynı gerekçe).

**Çizim:** kırpma kipinde pencerenin içindeki `contentFit="cover"` görüntünün yerine,
kaynak oranında boyutlanmış ve `imageStyle` ile dönüştürülen bir görüntü çizilir
(bugünkü kırpıcıdaki gibi). Geçiş anında görüntü aynı olmalı (yukarıdaki `s0`).
Dosya çizilir (kısıt 4). `CropFrame` pencerenin içinde, düğmelerin KARDEŞİ olarak.

**Jestler:** kırpma jestleri pencereye bağlı; koordinatlar pencerenin kendi uzayında
(odak noktası pencere merkezine göre). Kip dışında (önizleme) kırpma jesti yok.

**Düğmeler (kırpma kipi):**
- Sol üst **✕**: kırpmadan çık — kadraj atılır, fotoğraf değişmez, önizlemeye dönülür.
- Sağ üst: **⟲ sıfırla** (yeniden çek düğmesinin yerinde) + **kırp** düğmesi `active`
  görünümde.
- Sağ alt yuvarlak düğme: ok yerine **✓** — kırpmayı kaydet. İşlem sürerken göstergeli
  ve devre dışı.
- Alt ortada küçük ipucu metni (i18n, ör. "İki parmakla büyüt · sürükle").
- Flaş, deklanşör, çevir zaten donmuş karede gizli; değişmez.

**✓ (kaydet):** jest değerlerinden `toSourceRect` (kaynak, çerçeve boyutu, `baseScale`,
`scale`, `tx`, `ty`, 3:4) → çağıranın kancası `crop(shot, rect)` → dönen kare ekrandakinin
yerine geçer, kırpma kipi kapanır, `showStill` açık kalır. Kırpılmış kare önizlemede
pencereyi `cover` ile doldurur (**B**) — bu, overlay'in her kare için bugünkü çizimi,
özel bir şey gerekmez.

**Çerçevede ne görünüyorsa o kaydedilir — dokunulmamış ✓ dahil.** ✓ HER ZAMAN
`toSourceRect` ile hesaplanan dikdörtgeni keser. Kip `s0`'dan başladığı ve `s0` genelde
1'den büyük olduğu için (iPhone 15'te 3:4 kaynakta ≈1.25), hiç dokunmadan ✓'ye basmak
fotoğrafın çerçevede görünen orta bölümünü keser — bu, "fotoğraf yerinden oynamasın"
kararının doğrudan sonucu ve WYSIWYG. Dosya yalnız dikdörtgen kaynağın TAMAMIYSA
üretilmez (`originX/Y = 0`, en/boy kaynağa eşit — kırpıcının "whole" kuralı); o
durumda kip kapanır, kare değişmez.

**Ölçü kipe girmeden kesin olmalı.** `s0`/`baseScale` kaynağın gerçek ölçüsüne bağlı ve
yanlışsa fotoğraf girişte sıçrar. Kaynak ölçüsü `0` gelebilir (`CameraShot` sözleşmesi):
o durumda overlay kırp'a basılınca ölçüyü `Image.getSize` ile okur ve kipe ancak ölçü
gelince girer (düğme o arada `busy`). Yön (EXIF) için ayrı iş YOK: kırpıcıyla aynı
varsayım — kamera dosyası `normalizeOrientation` sonrası, galeri ölçüleri picker'dan
dik raporlanıyor, `ImageManipulator.manipulate()` başa yön düzeltmesi ekliyor; yani
ölçü, ekrandaki görüntü ve `crop(rect)` aynı piksel uzayında.

**Tekrar kırpma** (hedef 4): kırpılmış kare yeni bir kaynak; kipe ikinci girişte `s0`
ONUN ölçüsünden yeniden hesaplanır (yine "yerinden oynamaz").

### Köprü sözleşmesi (`cameraBridge`)

`crop` kancasının imzası değişiyor:

```ts
/** Verilirse sağ üstte kırpma düğmesi çıkar ve ekran KENDİ kırpma kipini açar.
 *  ✓'de kullanıcının seçtiği KAYNAK dikdörtgeniyle çağrılır; dönen kare
 *  ekrandakinin YERİNE geçer. `null`/hata = kare aynı kalır. */
crop?: (shot: CameraShot, rect: SourceRect) => Promise<CameraShot | null>;
```

Kırpıcıyı overlay de çağıran da AÇMIYOR. Overlay `PickedPhoto`yu, dosya sahipliğini ve
`ImageManipulator`ı bilmemeye devam ediyor; görüntü işleme kancada.

### `photoPicker`

`createPreviewSession`ın `crop`u: kırpma uygulama yardımcısıyla `shot.uri`den `rect`i
keser (tam çözünürlük ara dosya), BİR ÖNCEKİ dosyayı (`shot.uri`) unutur, yeni kareyi
döner. **"Nihai dosya" haritası kalkıyor:** kırpma çıktısı artık 900×1200 nihai dosya
değil, tam çözünürlüklü 3:4 bir ara kare. `commit` her kareyi `fitPhotoForUpload`dan
geçirir (3:4 karede ortadan kesme bir şey atmaz, yalnız 900×1200'e ölçekler) ve ham/ara
kaynağı yeni dosya yazıldıktan SONRA unutur. Böylece tekrar kırpma (hedef 4) kalite
kaybetmeden ara kare üzerinden yapılır ve sahiplik kuralı (kısıt 5) aynen kalır.
Yedek yollar (`captureWithSystemCamera`, `cropSequentially`) değişmez.

---

## Benim kararlarım (kullanıcıya sorulmadı — düzeltilebilir)

- **⟲ sıfırla** kadrajı kırpma kipine GİRİLDİĞİ hâle (`s0`, ortalı) döndürür; önceki bir
  ✓ ile kaydedilmiş kırpmayı GERİ ALMAZ. Kaydedilmiş kırpmayı geri almanın yolu
  kamerada yeniden çek, galeride ✕ ile atlayıp yeniden seçmek. (Kırpıcının Sıfırla'sı
  özgün dosyaya dönüyor; burada özgün dosya ilk kırpmada siliniyor — sahiplik kuralı.)
- Kırpma kipindeyken **kırp düğmesine tekrar basmak = ✕** (kırpmadan çık).
- Kırpma kipindeyken arka plana geçmek oturumu kapatmaz (elde kare var — bugünkü kural).
- İpucu metni yalnız kırpma kipinde görünür.
- Dokunulmamış ✓ çerçevedeki bölümü keser (fotoğrafın tamamını DEĞİL) — yukarıdaki
  "çerçevede ne görünüyorsa" kuralı.
- Ölçü bilinmiyorsa kipe girmeden önce ölçülür (bir anlık bekleme, sıçrama yok).

## Uygulayıcıya bırakılanlar

- Ortak hook'un tam API'sinin şekli ve dosya bölümlemesi (yukarıdaki sorumluluklar sabit).
- Kırpma kipine giriş/çıkışta çerçeve opaklığının süresi (kırpıcıdaki 180ms makul).
- `CropFrame`ın karartma alanını nasıl parametrelediği.

## Doğrulama

**Otomatik:** `cropGeometry` saf ve testli; `s0` ve çerçeve dikdörtgeni hesabı da saf
fonksiyon olarak yazılıp test edilmeli (pencere/çerçeve/`s0` sayıları, iPhone 15 ve SE).
`photoPicker` testleri yeni `crop(shot, rect)` sözleşmesine göre güncellenir: kanca
manipülatöre doğru `rect` ile gidiyor, ara dosya yeniden ölçeklenmiyor, önceki dosya
unutuluyor, `commit` kırpılmış kareyi de `fitPhotoForUpload`dan geçiriyor.

**Cihazda (simülatörde kamera yok):**
1. Kayıt → kamera → çek → kırp: ekran değişmiyor, fotoğraf kıpırdamıyor, çerçeve iniyor.
2. İki parmakla uzaklaş: fotoğrafın tamamı çerçeveye giriyor; sürükle; kenarda titreşim.
3. ✓: kip kapanıyor, kırpılmış kare pencereyi dolduruyor (yanlar kesik — B); ok → ekleniyor;
   eklenen küçük resim kırpılan kare.
4. Kırpma kipinde ✕: fotoğraf değişmeden önizlemeye dönüş. ⟲: kadraj başa dönüyor.
5. Galeri (kayıt + profil) aynı akış.
6. Kırpılmış kareyi tekrar kırp: çalışıyor.
7. **Regresyon:** profil fotoğrafında "Düzenle", Keşif mod kurulumunda kamera ve galeri —
   eski kırpıcı birebir eskisi gibi (kip dışında pinch-bakış dahil).
8. Kampüs anları: kırp düğmesi yok, değişiklik yok.
