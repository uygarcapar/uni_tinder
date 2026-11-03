# Kampüs anları — **kişi başına TEK canlı an** + paylaşımın sıfırlanma saati

> **Durum: BEKLİYOR.** İstemci tarafı bugün yapıldı (§5) ve talep gelmese de
> şerit bozulmuyor; ama kullanıcının günlük **tek beğenisini** koruyan asıl
> kapı sunucuda.

**İki maddelik talep.** Mevcut hiçbir alan değişmiyor:

1. `GET /api/campus/moments` **aynı kullanıcıdan yalnız EN YENİ anı** döndürsün.
2. `GET /api/campus/me` paylaşım hakkının ne zaman yenilendiğini söylesin
   (`postResetAt`) — bugün o saat sözleşmede hiç yok.

---

## 1. Gözlem — aynı kişi şeritte İKİ KEZ

Cihazda görüldü (2026-10-31): aynı kullanıcı **Dating modunda** 6 saat arayla
**iki an** paylaşabildi ve ikisi de canlı.

Bu bir kaçak değil, **iki pencerenin aynı olmamasının** doğal sonucu:

| pencere | süre |
|---|---|
| Anın **ömrü** | 24 saat (§0) |
| Paylaşım **kotası** | Günde 1 — gün sınırında sıfırlanıyor (§0) |

Sıfırlama iki paylaşımın arasına düştüğü anda ilk an **hâlâ canlı** ve ikincisi
de hakkın içinde. Yani kullanıcı başına **aynı anda 2 canlı an** sözleşmenin
izin verdiği bir hâl ve günde bir kez, her gün tekrar oluşabiliyor.

> Hangi dal olduğunu istemciden **ayırt edemedik**: eğer sıfırlama arada
> geçmediyse bu `UT-7403 ALREADY_POSTED_TODAY`ın kaçırılması demek. Ayıracak
> veri DTO'da yok — bkz. §3.

### Niye sorun

- **Şeritte aynı yüz iki kart.** Kampüs listesinde skor/çeşitlilik yok
  (`createdAt` DESC, §3) — iki kart yan yana düşüyor.
- **🔴 ASIL MESELE: free kullanıcının günlük TEK beğenisi.** §3 "kullanıcının
  zaten karar verdiği **anları**" süzüyor — **anı**, kişiyi değil. Kişinin
  ikinci anı listede duruyor ve `canLike: true` geliyor. Yani kullanıcı
  **aynı kişiye ikinci kez beğeni gönderip günün tek hakkını yakabiliyor.**
  Maddenin kendi gerekçesi ("üçü de dönerse kullanıcı günde 1 olan hakkını
  zaten karar verdiği birine harcar") burada aynen geçerli, yalnız kapı
  yanlış ölçekte kurulmuş.
- Eşleşme tarafında bir zarar YOK (karar `/api/swipe/*`a gidiyor ve orası
  kullanıcı başına çalışıyor) — bedel tamamen **boşa giden kota**.

---

## 2. Talep A — liste kişi başına tekilleşsin

`GET /api/campus/moments` sayfalarında **bir `userId` en fazla bir kez**
görünsün; iki canlı an varsa **`createdAt` en yeni olan** dönsün.

**Kurallar:**

1. **Tekilleştirme sayfalamadan ÖNCE.** Sayfa kurulduktan sonra elenirse
   `pageSize` tutmaz ve `hasMore`/`nextCursor` ile kurulan pencere kayar —
   istemci sonsuz döngüye karşı boş sayfayı terminal sayıyor, yani eksik
   sayfa sessizce listeyi kısaltır.
2. **Seçim `createdAt` DESC — moderasyona bakmadan.** Yeni an düşmüşse kişi o
   gün şeritte görünmesin; "düşmüş olanı atla, eskisini göster" kullanıcının
   kaldırılmış fotoğrafının yerine **bir öncekini** koymak demek ve bu bir
   moderasyon kararını delmek olur.
3. **Kendi anım ayrı.** `isMine` satırı listenin başına sabitleniyor ve cursor
   penceresinin dışında (§3) — orada da **en yenisi** gelsin. İki canlı anım
   varsa eskisini göremeyeceğim kabul: tek karta bakan bir yüzey.
4. **`canLike` kişi ölçeğinde olsun.** Bir kişiye bu mod için karar verdiysem,
   o kişinin dönen anı `canLike: false` ile gelsin — bugün karar **an** başına
   okunuyor (`backend_campus_decided_moments_2026-10-30.md`) ve ikinci an
   `true` ile geliyor. §1'deki kota yakma dalı tam burada kapanıyor.
5. `DELETE` davranışı değişmiyor: silmek günün hakkını geri vermiyor.

**Alternatifi NEDEN istemiyoruz:** "kotayı 24 saate çevirin" (yani an ölmeden
yenisi atılamasın) ürün kuralını değiştirir — gece yarısından sonra paylaşan
kullanıcı ertesi gün 23:50'ye kadar bekler. İstenen, günlük hakkın aynen
kalması; yalnız **görünen** anın tek olması.

---

## 3. Talep B — `postResetAt` (paylaşım hakkının sıfırlanma saati)

Bugün `/api/campus/me` şunu dönüyor:

```jsonc
"postedToday": true,
"myMomentId": "9381",
"quota": { "decisionsRemaining": 1, "nextResetAt": "…" }   // KARAR kotası
```

`quota.nextResetAt` **beğeni** kotasına ait. Paylaşımın ne zaman yenileneceğini
söyleyen bir alan **yok**, dolayısıyla:

- İstemci "yarın yeniden paylaşabilirsin"i **saat vererek yazamıyor** (akışta
  "20:30"u sabit yazma kazası yaşandı, bir daha sabit yazılmıyor).
- §1'deki gözlemin hangi dal olduğu (meşru sıfırlama mı, kaçırılmış `UT-7403`
  mü) **dışarıdan ayırt edilemiyor**.

```jsonc
"postedToday": true,
"postResetAt": "2026-11-01T00:00:00Z",   // YENİ — ISO+Z, postedToday false iken null
```

- **ISO+Z** (wire kuralı) ve `postedToday: false` iken `null`.
- **Mod başına**, `postedToday` ile aynı ölçekte
  (`backend_campus_mode_quota_2026-10-30.md`).

---

## 4. Sorular

1. Paylaşım sınırı hangi saat? **UTC gece yarısı mı, TR gece yarısı mı, akış
   penceresiyle aynı (20:30) mı?** Üçü de §1'deki gözlemi açıklar.
2. §2.4 (`canLike` kişi ölçeğinde) ayrı bir tur mu, listeyle birlikte mi?
   İstemci için ikisi de aynı gün ya da ayrı ayrı inebilir — alan davranışı
   değişmiyor, yalnız değeri doğruluyor.

---

## 5. İstemcide bugün ne yapıldı

İki yama kondu; **ikisi de talep geldiğinde silinebilir.**

**(a) Görsel tekilleştirme — `dedupeMomentsByUser`** (`campusQueries.ts`):
`userId` başına `createdAt` en yeni an, ilk görülen sıra korunarak (kazanan
yerinde değiştiriliyor, çünkü kendi anım listenin başına sabitleniyor). İki
yerde çağrılıyor ve idempotent: listenin `select`'inde (`dedupeMoments`'ten
sonra) ve `mergeKeptMoments`'ten sonra — geri karıştırma sunucunun düşürdüğü
bir anı eklediğinde kişi ikinci kez girebiliyordu.

**(b) Karar kapısı kişi ölçeğinde — `isMomentDecided`'ın üçüncü parametresi:**
bu oturumda karar verilen **kullanıcı kimlikleri** (`decidedUserIds`). Kapı
`canLike`tan **önce** okunuyor: sunucu o an için doğru söylüyor ("bu AN için
karar verilmedi") ama kişi için verildi.

⚠️ **İkisi birlikte bile kapı DEĞİL:**

- **Sayfalamayı düzeltmiyor** (a): eleme sayfa indikten sonra oluyor, yani
  20'lik bir sayfa ekranda 19 karta düşebiliyor.
- **(b) yalnız BU OTURUMUN, BU CİHAZIN kararını biliyor.** Önceki oturumda ya
  da Keşif'ten verilmiş karar istemcide görünmüyor; o dalın tek kaynağı
  `canLike` ve kişi ölçeğine çıkması §2.4 ile sizin tarafınızda.
- Sunucu hâlâ **kişi başına iki karar kabul ediyor**: istemci kapısı
  atlatılabilir bir arayüz kararı, kotanın kendisi değil.
