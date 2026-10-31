# Kampüs anları — **günlük an hakkı MOD BAŞINA olsun** (talep, 2026-10-30)

**Tek maddelik talep.** `GET /api/campus/me?mode=X`'in `postedToday`/`myMomentId` alanları
ve `POST /api/campus/moments`'ın `UT-7403` kapısı **mod başına** hesaplansın: Dating'de
paylaşmak Friends'in günlük hakkını yakmasın.

Kardeş talepler: `backend_campus_mode_gate_2026-10-30.md` (kapalı modda boş liste),
`backend_campus_decided_moments_2026-10-30.md` (karar verilmiş anlar listede kalsın).
Üçü de aynı ailenin kuralları, sırayla ya da birlikte yapılabilir.

---

## 1. Ölçüm — bugün ne oluyor

Cihazdaki teşhis aracı `/api/campus/me`yi **iki mod için ayrı ayrı, doğrudan** çekiyor
(istemci cache'i devrede değil):

```
GET /api/campus/me?mode=Dating   → postedToday: true
GET /api/campus/me?mode=Friends  → postedToday: true
```

Oysa kullanıcı **yalnız Dating'de** paylaşmıştı. Yani `mode` parametresi `postedToday`
hesabında kullanılmıyor; günlük hak kullanıcı başına **küresel** sayılıyor.

Sonucu kullanıcıda şu: Friends moduna geçip haritayı açtığında paylaşım butonu ("+")
**hiç çizilmiyor** — istemci kapısı `postedToday`e bakıyor ve o `true` geliyor.

---

## 2. Talep

### 2.1 `/api/campus/me` — `postedToday` ve `myMomentId` mod başına

```
GET /api/campus/me?mode=Friends   (bugün yalnız Dating'de paylaşılmış)
→ 200 { …, "postedToday": false, "myMomentId": null, … }
```

- `mode` **verilmezse** `Dating`e düşsün — ⚠️ bu madde **düzeltildi** (ilk hâli "bugünkü
  küresel davranış korunsun" diyordu, backend incelemesi çelişkiyi yakaladı ve haklı):
  `CreateCampusMomentRequest.Mode` null gelince zaten Dating'e düşüyor, yani mode
  göndermeyen eski bir istemcinin **paylaşımı Dating kapsamlı**. `/me` küresel kalsaydı
  aynı istemci yalnız Friends'te paylaşmış kullanıcıda `postedToday: true` görüp "+"yı
  gizlerdi — oysa POST'u kabul edilecekti. Yani küresel yol, düzeltmeye çalıştığımız
  "/me bir şey der, paylaşım kapısı başka şey yapar" ayrışmasını eski istemcilerde
  sürdürür ve kalıcı olarak bakılması gereken üçüncü bir kapsam doğururdu. İstemci
  yüzeyde her hâlükârda `mode` gönderiyor.
- `quota.decisionsRemaining` **KÜRESEL KALSIN** — değişiklik istemiyoruz. Beğeni kotası
  ana akıştaki tek `DailySwipeCount` emsalini izliyor ve istemci bunu böyle varsayıyor
  (paylaşım/silme tek modun `/me` kopyasını, beğeni ise kökü tazeliyor).

### 2.2 `POST /api/campus/moments` — `UT-7403` kapısı mod başına

```
POST /api/campus/moments { "mode": "Friends", … }   (bugün yalnız Dating'de paylaşılmış)
→ 201  (UT-7403 DEĞİL)
```

Gövdedeki `mode` zaten zorunlu alan ve istemci her zaman gönderiyor; kapı aynı alanı
okusun. Aynı modda ikinci paylaşım elbette `UT-7403` almaya devam etsin.

### 2.3 Silme kuralı değişmiyor

"Sil + yeniden at" sonsuz döngüsünü kapatan kural (`DELETE` günün hakkını geri
**vermiyor**, `postedToday` `true` kalıyor) aynen kalsın — yalnız artık **o modun**
hakkı yanmış olsun.

---

## 3. Neden

- **Ürün:** iki mod ayrı birer profil (ayrı fotoğraf, ayrı prompt, ayrı niyet) ve
  izleyici havuzları ayrık — Friends listesi Dating'de paylaşılmış anı zaten görmüyor.
  Tek hakkın iki modda paylaşılması, Friends'i açmış kullanıcıyı o yüzeyden tamamen
  dışlıyor: Dating'de paylaşan kişi Friends havuzuna o gün hiç giremiyor.
- **Sözleşmedeki boşluk:** `/api/campus/me` sözleşmesi (`backend_campus_moments_2026-10.md`
  §2) `mode` parametresinden hiç söz etmiyor — bu kuralın yazılı olarak talep edilmemiş
  olması muhtemel. İstemci bugün `?mode=` göndermeye başladı ve mod başına davranış
  varsayıyor; kural sunucuda yoksa varsayım sessizce yanlış.
- **İstemci bunu telafi EDEMEZ:** `postedToday` otorite. İstemci "Dating'de paylaştım ama
  Friends hakkım duruyor" diye yerel bir sayaç tutarsa, başka cihazdan yapılan paylaşımı
  kaçırır ve kullanıcıya sunucunun `UT-7403` ile reddedeceği bir "+" butonu çizer.

---

## 4. Geçiş

- Değişiklik **hiçbir istemciyi kırmıyor:** `postedToday` alanının anlamı aynı, yalnız
  kapsamı daralıyor. `mode` göndermeyen eski istemcinin gördüğü tek sapma, o gün ikinci
  bir an paylaşabilmesi — yani talebin istediği şeyin kendisi.
- İstemci tarafında yapılacak bir iş yok: sorgu anahtarı, paylaşım gövdesi ve paylaşım
  sonrası tazeleme zaten mod başına.

---

## 5. Özet

1. `GET /api/campus/me?mode=X` → `postedToday`/`myMomentId` **yalnız X modunu** anlatsın.
2. `POST /api/campus/moments` → `UT-7403` kapısı gövdedeki `mode`u okusun.
3. `quota` küresel kalsın, `DELETE` kuralı değişmesin.

---

## 6. ✅ UYGULANDI — backend cevabı (2026-10-30)

Üç madde de girdi (`CampusQueryService.cs:86`, `CampusMomentService.cs:121`; kota sayımına
ve silme kuralına dokunulmadı), ölçüm teşhisle birebir örtüştü. Dal merge bekliyor.

Talebin dışında, **istemciyi ilgilendiren iki not:**

1. **`DELETE /api/campus/moments/{id}` artık `{ "mode": "Dating" }` dönüyor.** §4'ün
   "istemcide iş yok" cümlesinin istisnası — ama istemci bunu **zaten okuyor**
   (`campusService.deleteMoment` → `useDeleteCampusMoment` → `invalidateCampusMe(mode)`),
   additive alan olduğu için ek iş çıkmadı.
2. 🔴 **`/campus/me` KAPALI MOD İÇİN DE yanıt veriyor** (bootstrap ucu, `UT-2304`
   dönmüyor). Friends'i hiç açmamış kullanıcıda `postedToday: false` + `myMomentId: null`
   geliyor — yani **"+ aktif" satırının birebir aynısı**, ama dokunuş `UT-2304` yiyor.
   Yüzeyin modun açıklığını `/api/profile → modes`ten doğrulaması gerekiyor; bu, kardeş
   talep `backend_campus_mode_gate_2026-10-30.md` §4'te "eklenecek" denen istemci kapısı
   ve **henüz eklenmedi** (akış/kampüs yüzeyi `modes` haritasını okumuyor; bugün yalnız
   Keşif, Profil ve EditProfile okuyor).
