# Kararlar — Recovery consumable + tier bazlı SuperLike

Cevap tarihi: 2026-08-21
Yanıtlanan doküman: "Karar gerekiyor — Recovery consumable + tier bazlı SuperLike (2026-08-21)"

---

## 0. Ön koşul — kod yazmadan önce doğrulanması gereken

Doküman "SuperLike consumable altyapısı zaten canlı ve **kanıtlanmış**" varsayımıyla
recovery'yi onun aynası olarak kuruyor. Bizdeki son kayıt (2026-08-12) bu varsayımla
çelişiyor:

- `POST /api/swipe/SuperLike/Redeem` sandbox'ta **402 `UT-6101`** dönüyordu.
- Blokaj `NON_RENEWING_PURCHASE` webhook'unun işlenmemesine izole edilmişti
  (kontrol grubu: aynı `app_user_id`, aynı sandbox, aynı dakika → abonelik
  `INITIAL_PURCHASE` iniyor ve premium açılıyor, consumable redeem 402 alıyor).
- Yani bugüne kadar **hiçbir consumable satın alma uçtan uca krediye dönüşmedi.**

**İstenen:** Faz 1'e başlamadan önce tek bir sandbox SuperLike satın almasının
gerçekten bakiyeyi artırdığı teyit edilsin. Düzeldiyse haber verin, aynen devam.
Düzelmediyse recovery'yi aynı boruya bağlamak "para gitti, kredi gelmedi"
yüzeyini ikiye katlar — önce o bug, sonra Faz 1.

---

## 1. Recovery premium'da: kredi — ama grant **tek seferlik değil, periyodik**

**Cevap: A, tek bir düzeltmeyle.** Dokümandaki A tablosu "2 (tek seferlik)" diyor;
tek seferlik olmayacak.

| | Free | Premium |
|---|---|---|
| Günlük yenilenen hak | 0 | 0 (kaldırılıyor) |
| Grant | — | **her yenileme periyodunda** tier kadar kredi, mevcut bakiyenin üstüne |
| Ekstra | Satın alma | Satın alma |

Harcama sırası SuperLike ile aynı: **önce kota, sonra kredi.**

**Premium'un günlük 5 hakkının kaldırıldığı teyit ediliyor** — bilinçli. Ama
karşılığı "ömür boyu 2" değil, "her yenilemede tier kadar". Aylık abone ayda 2,
yıllık abone yılda 5 alır. Bu hâliyle C'nin ölü kod problemi de oluşmuyor:
yenilenen günlük kota kalmadığı için kredi gerçekten harcanıyor.

### ⚠️ Recovery grant'ı da TIER'A BAĞLANMAK ZORUNDA

Dokümanda recovery grant'ı düz "2" olarak geçiyor. Bu, SuperLike için kendi
yazdığınız "yenileme periyodu tier'a bağlanır" gerekçesinin ihlali:

> Haftalık abone 7 günde bir yenilendiği için düz 2 verilirse ayda ~8.6 recovery
> alır, aylık abone 2 alır. Haftalık planın fiyatı aylığın ~1/3'ü olduğundan bu
> doğrudan arbitraj — en ucuz plan en çok hakkı alır.

**Karar: recovery grant'ı SuperLike ile aynı haritayı kullansın — haftalık 1,
aylık 2, yıllık 5.** Admin panelinden verilen premium aylık sayılır (2), SuperLike'ta
aldığınız kararla aynı.

Tavan kuralı da SuperLike'la aynı mantıkta olsun (tier kotası + satın alınan kredi);
free'nin lifetime hakkı olmadığı için recovery'de ek +1 yok.

---

## 2. Mevcut bakiyeler: B — ama "canlı kalan" değil **sabit** hediye

**Cevap: B (krediye taşı), premium dahil herkes.** Tek değişiklik: taşınan miktar
migration anındaki *kalan* bakiye olmasın.

Gerekçe: bakiye günlük yenilendiği için "kalan"ı taşımak, hediyeyi **migration'ın
günün hangi saatinde koştuğuna** bağlar. Sabah iki hakkını kullanmış kullanıcı 0,
uygulamayı o gün hiç açmamış kullanıcı 2 alır — aynı kullanıcı profili, farklı
sonuç, destek tarafında savunulamaz.

**Yerine: herkese sabit kredi yazılsın — free 2, premium 5** ("son bir günlük
hakkın kalıcıya döndü"). Aynı tek `UPDATE`, deterministik sonuç.

Not: mevcut satırların DB varsayılanından etkilenmediği tespiti doğru — migration'da
açık `UPDATE` şart, aksi hâlde yarım durum oluşur.

---

## 3. Tier düşünce fazla SuperLike: onaylanıyor

**Claw-back yapılmasın**, sadece tier bilgisi güncellensin. Fazlalık bir sonraki
yenilemede normale iner.

Bunun bir sonucu var, sözleşmede yazılı olmasını istiyoruz: **"kalan > tavan"
artık normal bir durum** (yıllıktan aylığa düşen kullanıcı: 6 kalan, tavan 3).
Frontend kota satırlarını oran olarak yazıyor; "6/3" bozuk görünür.

**İstenen:** payda kuralı sözleşmede tanımlansın — `tavan + satın alınan kredi`.
Backend clamp yapmayacaksa bu kuralın tek bir yerde yazılı olması gerekiyor,
yoksa her ekranda ayrı ayrı yanlış hesaplanır.

---

## 4. Recovery paketleri: 3 SKU, adetler küçük, birim fiyat SuperLike'tan yüksek

**Cevap: `recovery_1`, `recovery_3`, `recovery_10`.**

SuperLike merdivenini (5/10/15/20) adet adet kopyalamıyoruz. Gerekçe konumlandırma:
recovery **garantili eşleşme** üretiyor (karşı taraf zaten beğenmiş, kurtarma
Pass → Like'a çeviriyor), SuperLike ise piyango bileti. 20'li recovery paketi
"20 garantili eşleşme" demek olurdu — hem fiyatlanamaz hem ekonomiyi bozar.

`recovery_1` özellikle önemli: "Kurtar"a basıp paywall gören kullanıcı için tek
tıklık dürtüsel alım — dönüşümün büyük kısmının oradan gelmesini bekliyoruz.

**Fiyat:** birim fiyat SuperLike'ın ~3-5 katı bandında, merdivende birim fiyat
düşen. Kesin kademeler: ⚠️ **DOLDURULACAK** (ASC fiyat kademesi seçilince).

**Teknik kısıt — ürün id'si:** frontend adedi id'deki **ilk sayıdan** okuyor
(`match(/(\d+)/)`). `recovery_10` doğru çalışır; `2026_recovery_10` gibi başka
rakam içeren bir id sessizce 2026 kredi okur. Id'de adetten başka rakam olmasın.

---

## 5. Mağaza ürünleri

⚠️ **DOLDURULACAK** (kim / hangi tarih).

Backend'in beklemesine gerek yok. Frontend'in şimdiden sabitlenmesini istediği tek
şey **RevenueCat offering id'si**: SuperLike paketleri `offerings.all["superlikes"]`
altında duruyor, recovery için ayrı bir offering açılsın — önerilen id: **`recovery`**.
Bu isim şimdi sabitlenirse mağaza ürünleri açılmadan frontend yazılıp mock'la test
edilebilir.

---

## 6. Sözleşmeye eklenmesi gereken dört madde

Faz 3 "kota yanıtına recovery kredisi alanları" deyip geçiyor; aşağıdakiler
açıkça yazılmazsa uygulama yarım kalır.

### 6.1 Eski istemci uyumu — `remainingMissedMatchRecovery` TOPLAM kalmalı

Sahadaki sürümler `remainingMissedMatchRecovery` ve `dailyMissedMatchRecoveryLimit`
okuyor. SuperLike'taki üçlüyle aynı deseni kurun:

| Alan | Anlam |
|---|---|
| `remainingMissedMatchRecovery` | **kota + kredi toplamı** (mevcut alan, anlamı korunuyor) |
| `quotaRecoveryRemaining` | yalnız tier kotasından kalan (yeni) |
| `purchasedRecoveries` | süresiz kredi (yeni) |

Alan kaldırılır veya anlamı daraltılırsa güncellememiş istemcilerde kota satırı boşalır.

### 6.2 Premium'un bakiyesi bittiğinde de satın alma açılmalı

Bugün: **403** = free kotası doldu → paywall · **400 + `showPaywall:false`** =
premium kotası doldu → düz mesaj.

Yeni modelde premium de recovery satın alabildiği için, premium'un bakiyesi
bittiğinde de `showPaywall: true` + `paywallType: MISSED_MATCH_RECOVERY_LIMIT`
dönmeli — SuperLike'ta zaten yaptığınız değişikliğin aynısı. Aksi hâlde premium
kullanıcı ürünü satın alamaz.

### 6.3 Redeem ucu ayrı hata kodu ailesi istiyor

Frontend `superlikeRedeem.ts`'i klonlayacak (402 → retry → MMKV kuyruğu → açılışta
flush). Kuyruk anahtarı ve hata kodları SuperLike'ınkilerle **çakışmamalı**, yoksa
iki kuyruk birbirinin isteğini flush eder. `UT-61xx` ailesinden ayrı kodlar
(veya ayrı bir aile) tanımlansın.

### 6.4 Geri sayım alanları

`missedMatchRecoveryResetInSeconds`, `nextMissedMatchRecoveryResetAt`,
`missedMatchRecoveryResetAt` — günlük kota kalkınca anlamsızlaşıyor. Kaldırılacaksa
haber verin; frontend null tolere edecek şekilde güncellenecek. Metinler de
("Bugün kalan kurtarma hakkın: …") bakiye semantiğine çevrilecek.

---

## Özet

| # | Karar |
|---|---|
| 0 | Faz 1'den önce SuperLike redeem'in uçtan uca çalıştığı doğrulansın |
| 1 | Tümüyle kredi; premium'da günlük kota kalkıyor, **her yenilemede tier kadar** grant (1/2/5) |
| 2 | Mevcut kullanıcılara **sabit** kredi hediyesi (free 2 / premium 5), herkes dahil |
| 3 | Tier düşüşünde claw-back yok — onaylandı; payda kuralı sözleşmeye yazılsın |
| 4 | `recovery_1` / `recovery_3` / `recovery_10`; fiyat kademesi doldurulacak |
| 5 | RC offering id'si `recovery`; mağaza sahibi/tarih doldurulacak |

Frontend eforu ~1-1.5 gün, backend'in 2-3 günüyle paralel ilerleyebilir.
Kritik yol backend değil: §0'daki doğrulama ve §5'teki mağaza ürünleri.
