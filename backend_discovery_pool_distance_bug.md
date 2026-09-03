# Bug — `ignoreDistanceFilter` AÇIKKEN yakındaki aday destede yok

Tarih: 2026-08-27
Uçlar: `GET /api/swipe/GetPotentialMatches`, `PUT /api/swipe/UpdateFilters`
İlgili sözleşmeler: mesafe katı filtre (2026-08-21) + kalıcı `ignoreDistanceFilter` (2026-08-22)

---

## 0. Semptom

Bir aday (B), keşif destesinde **mesafe sınırı AÇIKKEN görünüyor**
(`ignoreDistanceFilter: false`, `maxDistance: N`), aynı aday **sınır kaldırılınca
kayboluyor** (`ignoreDistanceFilter: true`).

Bu küme mantığıyla mümkün değil: sınırsız uygunluk kümesi, yarıçapla sınırlı
kümenin **üst kümesi**. Bir eleme kalkarken aday kaybolamaz.

Beklenen: sınır kalkınca deste büyür, içindekiler korunur.
Gerçekleşen: deste değişiyor ve yakındaki aday dışarıda kalıyor.

---

## 1. Frontend suçsuz — kanıt

- Deste isteği mesafeyle ilgili **hiçbir parametre taşımıyor**:
  `GET /api/swipe/GetPotentialMatches?pageNumber=1&pageSize=50`. Başka alan yok.
  (`?expandRadius` 2026-08-22'de kaldırıldı, geri eklenmedi.)
- Yanıttaki `profiles` dizisine uygulanan **tek** istemci süzgeci:
  1. `userId` dedupe (sayfa kenarında tekrar eden kayıt),
  2. son **15 sn** içinde swipe edilmiş kullanıcıların kuyruktan atılması —
     `ZREM` fire-and-forget olduğu için az önce kaydırılan kart yanıtta hâlâ
     dönebiliyor. Pencere dışındaki hiçbir id elenmiyor.
  Mesafeye bakan tek satır yok.
- `pageSize = 50 = TargetPoolSize` → **tek istekte havuzun tamamı** çekiliyor.
  Sayfalama sınırında kayıp yok, `hasNextPage` pratikte hep `false`.

Yani gösterilen deste, yanıtın `profiles` dizisinin birebir kendisi. Destede
olmayan aday **yanıtta da yok**.

---

## 2. Hipotezler

Bizdeki yazılı backend davranışı:

- Aday havuzu Redis ZSET, `TargetPoolSize = 50`, TTL 15 dk.
- Sıra tohumu: `userId + gün kovası + filtre imzası` (deterministik).
- Swipe edilen `ZREM` ile düşer; **havuz tükenmeden yeni aday üretilmez**.

2026-08-22 sözleşmesinin ilgili maddesi:

> Sıralama değişmiyor: yakındakiler yine destenin başında, kalkan yalnızca eleme.

Gözlem bu maddeyle çelişiyor.

**H1 — havuz kesimi (en olası).** Sınır kalkınca uygun aday kümesi 50'yi çok
aşıyor, havuz skor sırasına göre **top-50'de kesiliyor**. Skorda yakınlık baskın
olmadığı için 3 km'deki aday, 120 km'deki daha yüksek skorlulara yenilip havuza
hiç giremiyor. Sınır varken küme zaten 50'nin altında olduğu için herkes giriyor.

> Bu, bug'ın neden şimdiye kadar fark edilmediğini de açıklıyor: az kullanıcılı
> şehirde havuz 50'ye ulaşmıyor → semptom yok. Yoğun bölgede (İstanbul/Ankara)
> her seferinde görülüyor.

**H2 — sınırsız yolda ayrı sorgu dalı.** `ignoreDistanceFilter=true` farklı bir
sorgu/indeks dalına düşüyor ve o dalda mesafe dışı ek bir eleme var (görünürlük
listeleri, foto moderasyon, aktiflik penceresi vb. bir kuralın farklı
uygulanması). H1 çürürse buraya bakılmalı.

**H3 — havuz cache'i.** Anahtar değişimi havuzu invalidate etse bile yeni havuz o
an kurulup 15 dk sabit kalıyor; kurulma anında aday geçici olarak dışarıdaysa
15 dk boyunca yok. Tekrar üretilebilirlik testi (aşağıda) bunu ayırır.

---

## 3. Tekrar üretim

1. Yoğun bir şehirdeki hesap (A) — sınır açık, `maxDistance` dar (ör. 25 km).
   Destede aday B görülüyor.
2. `PUT /api/swipe/UpdateFilters` → `{ "ignoreDistanceFilter": true }`.
3. Deste yeniden çekiliyor (`profiles.length` = 50 bekleniyor). **B listede yok.**
4. Anahtar geri kapatılıyor → B yeniden görünüyor.
5. 3–4 arası tekrarlandığında sonuç değişmiyorsa H3 elenir, H1/H2 kalır.

FE tarafında `__DEV__` derlemesinde her adayın adı/yaşı/**mesafesi**/üniversitesi
konsola sırayla basılıyor (`[deck] gösterilecek:`); iki durumun listesi istenirse
gönderilebilir.

---

## 4. İstenen doğrulama (tek turda sonuç verir)

Elimizdeki `userId A` (gözleyen) ve `userId B` (kayıp aday) için, anahtar AÇIKKEN:

1. **B, A'nın sınırsız uygunluk kümesinde mi?** (yaş/cinsiyet/engel/rapor/
   görünürlük listeleri/foto moderasyon/aktiflik — hangi hard filter'lar
   uygulanıyorsa hepsi.)
   - Hayır → H2, sebep hangi kural?
2. **B'nin skoru** ve **havuza giren 50 kişinin en düşük skoru**. B kesimin
   altında mı?
   - Evet → H1 doğrulandı.
3. **B'nin A'ya mesafesi** ve havuzdaki 50 kişinin mesafe dağılımı
   (min / medyan / maks).
   - Medyan, kullanıcının kayıtlı `maxDistance`ının belirgin üstündeyse
     "yakındakiler yine destenin başında" maddesi fiilen tutmuyor demektir.

---

## 5. Talep edilen düzeltme

### D1 — Havuz kompozisyonu (asıl talep)

Sınır kalkarken **yakındaki adaylar kaybolmamalı**. Tercih sırasıyla:

**(a) Katmanlı doldurma — tercihimiz.** `ignoreDistanceFilter = true` iken havuzun
ilk K'sı (öneri: 50'nin **en az yarısı**) kullanıcının kayıtlı `maxDistance`
yarıçapı **içinden** doldurulsun, kalan slotlar yarıçap dışından. Böylece
sözleşmedeki "eleme kalktı, sıralama korundu" ifadesi fiilen sağlanır ve anahtar
açmak hiçbir adayı kaybettirmez.

**(b) Skor ağırlığı.** Mesafe ağırlığı, sınır kapalıyken de yakın adayı top-50'ye
taşıyacak kadar baskın olsun.

(a) tercih ediliyor çünkü etkisi izole: yalnız anahtar açıkken devreye girer.
(b) skorlamayı **tüm** kullanıcılar için değiştirir, regresyon yüzeyi çok daha geniş.

### D2 — Sözleşme netleştirmesi

`ignoreDistanceFilter = true` iken bir adayın havuza girmesini engelleyen
**mesafe dışı** bir kural varsa (H2), yazılı sözleşmeye eklensin. Şu an FE'nin
elindeki metin "kalkan yalnızca eleme, başka hiçbir şey değişmiyor" diyor.

### D3 — Gözlemlenebilirlik (küçük, kırılmaz ek)

Yanıta **kesimden önceki** uygun aday sayısı eklensin:

```jsonc
{
  "profiles": [ /* ≤ 50 */ ],
  "totalProfiles": 50,
  "poolCandidateCount": 1284,   // YENİ: havuz kesiminden ÖNCEKİ uygun aday sayısı
  "distanceFilterIgnored": true,
  "appliedRadiusKm": null
}
```

Bununla FE "deste 50'ye kırpıldı" durumunu "gerçekten 50 aday var" durumundan
ayırt edebilir; bu sınıf raporlar bir daha kod okumadan kapanır. FE tanımadığı
alanı yok sayar, mevcut istemcileri kırmaz.

### D4 — TTL teyidi

Anahtar değişince havuzun gerçekten düşürüldüğü teyit edilsin (bizdeki not böyle
diyor). Düşürülüyorsa H3 elenir ve ekstra iş çıkmaz.

---

## 6. Frontend'de bilinçli olarak YAPILMAYACAKLAR

- **Mesafeye göre yeniden sıralama yok.** Destenin sırası backend sözleşmesi;
  iki yerde sıralama iki farklı gerçek demek.
- **`pageSize` düşürüp daha çok sayfa çekmek çözüm değil.** Havuz zaten 50 ve
  sayfalama bellek içi — 5 istek, tek isteğin getirdiğinin aynısını getirir.
- **Anahtar açıkken `maxDistance`ı "ipucu" olarak ayrıca göndermek yok.**
  Kullanıcının kayıtlı yarıçapı zaten sizde; mevcut alanlar D1(a) için yeterli.

---

## 7. Etki

Bu bug, `UT-6001` / `NoCandidatesInRadius` boş-deste akışının **değerini tersine
çeviriyor**: kullanıcıya "Mesafe Sınırını Kaldır" butonunu biz gösteriyoruz,
basan kullanıcı daha fazla aday görmek yerine **yakınındaki adayları kaybediyor**.
Anahtar kalıcı olduğu için etki tek bir desteyle sınırlı da değil — kullanıcı
geri kapatana kadar sürüyor.
