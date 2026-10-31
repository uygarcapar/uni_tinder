# Kampüs anları — **izleyicinin KAPALI modunda liste boş dönsün** (talep, 2026-10-30)

**Tek maddelik talep.** `GET /api/campus/moments?mode=X`, isteyen kullanıcının **X modu
kapalıysa** (o profili hiç açmamış ya da kapatmış) **boş liste** dönsün. Karar uçları da
aynı durumda **belirli bir kodla** reddetsin.

İki soru + bir talep. Kardeş talep: `backend_campus_decided_moments_2026-10-30.md`
(karar verilmiş anlar listede kalsın) — ikisi aynı ucun iki ayrı kuralı, sırayla ya da
birlikte yapılabilir.

---

## 1. Gözlem — nasıl oluşuyor

Sözleşme §3 modu doğru kuruyor: *"`mode=Friends` isteği yalnız Friends profilinden
atılmış anları döndürsün."* Yani **paylaşan** tarafta mod net. Eksik olan **izleyen**
taraf: listenin, isteyen kullanıcının o modu açıp açmadığına göre süzüleceği hiçbir
yerde yazılı değil.

İstemcide mod bir **yerel tercih** (cihazda MMKV) ve kampüs yüzeyi onu doğrulamıyor:
açık mod haritası (`/api/profile → modes`) yalnız Keşif ekranında okunuyor. Normal akışta
sorun çıkmıyor — mod seçici kapalı modun kartına dokunulduğunda modu değiştirmeyip
kurulum akışını açıyor. Ama tercihin kapalı bir modda kalabildiği **iki hâl** var:

1. **Açık mod haritası henüz gelmemişken** kartlar "açık" varsayılıyor (bilinçli: olmayan
   bir kısıtı uydurmamak için). O anda yapılan dokunuş tercihi `Friends` yazıyor; Keşif
   sonra kurulum CTA'sına düşüyor ama **tercih `Friends` kalıyor.**
2. **Friends'i açıp sonra kapatan** kullanıcı: istemci kullanıcının AÇIK seçimine kasten
   dokunmuyor (seçimi elinden almamak için).

Her iki hâlde akış ekranı `?mode=Friends` ile liste istiyor.

---

## 2. Soru — bugün ne oluyor (ölçemedik)

1. `GET /api/campus/moments?mode=Friends`, **Friends profili kapalı** bir kullanıcıdan
   gelirse bugün ne dönüyor? Liste mi (yani o kullanıcı hiç katılamayacağı bir havuzu
   görüyor), boş mu, hata mı?
2. Aynı kullanıcı o listedeki birine beğeni atarsa — `POST /api/swipe/Like { mode:
   "Friends", source: "CampusMoment", momentId }` — ne dönüyor? **Elimizde bu durum için
   bir kod yok:** UT-74xx'te kota (`UT-7420`), yok olmuş an (`UT-7421`), kendi anı
   (`UT-7422`), zaten karar (`UT-7424`) var; "bu mod sende kapalı" yok.
3. `POST /api/campus/moments { mode: "Friends" }` kapalı modda ne dönüyor —
   `UT-7402 PROFILE_INCOMPLETE` mi, başka bir şey mi?

---

## 3. Talep

### 3.1 Liste: boş dönsün (hata DEĞİL)

İstek sahibinin `mode` profili kapalıysa:

```
GET /api/campus/moments?mode=Friends   (Friends kapalı)
→ 200 { "items": [], "nextCursor": null, "hasMore": false }
```

**Neden hata değil, boş:** şeridin boş durumu zaten var ve bir hata yüzeyi değil —
kuralları anlatan poster kutuları çiziliyor. Hata dönerse kullanıcı, gerçekten bir şey
bozulmuş gibi bir ekran görür; oysa durum "burada senin için bir şey yok".

⚠️ **Kendi anım istisnası korunsun:** §3 "kendi anım listenin başında dönsün" diyor.
Kapalı modda kendi anı da olamayacağı için pratikte fark etmiyor; yine de boş liste
kuralının kendi anı sabitlemesini bozmaması gerekiyor (kapalı mod → gerçekten boş).

### 3.2 Karar uçları: belirli bir kodla reddetsin

Bayat liste, iki cihaz yarışı ve eski istemciler yüzünden istek yine gelebiliyor. O
yüzden liste süzülse de karar ucunun kendi kapısı olmalı:

```
POST /api/swipe/Like   { "mode": "Friends", "source": "CampusMoment", … }
→ 403  UT-7425  MODE_NOT_OPEN     (yeni kod — UT-7425 boş)
```

- Aynı kod kampüs **geçme** ucunda da (`POST /api/campus/moments/{id}/pass`) geçerli
  olsun;
- `POST /api/campus/moments` (paylaşma) için **mevcut `UT-7402`** uygun görünüyor,
  istemci onu zaten tanıyor — farklı bir şey dönüyorsa söylemeniz yeterli.

İstemcide bu kod **kartı düşüren** kodlar kümesine girer (hedef artık karar verilebilir
bir şey değil) ve kullanıcıya mod kurulumunu gösteren tek satırlık bir yönlendirme
yapılır.

### 3.3 Numara seçimi

`UT-7425` boş (UT-74xx'te dolu olanlar: 7401-7407, 7410-7415, 7420-7422, 7424, 7430).
Başka bir numara tercih ederseniz sorun değil — **tek şart**, "mod kapalı" hâlinin
genel bir 400/500'e değil **kendi koduna** düşmesi: aksi hâlde istemci onu ağ hatasından
ayırt edemiyor ve kullanıcıya "bir şeyler ters gitti" demekten başka seçeneği kalmıyor.

---

## 4. Neden sunucu, neden istemci değil

Açık mod haritasının **tek doğru kaynağı sunucu**: profil başka bir cihazdan açılıp
kapatılabiliyor ve istemcideki tercih yalnız o cihazın belleği. İstemci kapısı da
eklenecek (akış yüzeyi haritayı okumuyor, okuyacak) ama o bir **cila**: bayat haritayla
çalışan ya da güncellenmemiş bir istemci yine kapalı modda liste isteyebilir.

Aynı gerekçe kardeş talepte de yazılı: kullanıcının neye karar verebileceğini sunucu
biliyor, istemci bilmiyor.

---

## 5. Geçiş

- Boş liste **hiçbir şeyi kırmıyor**: istemci bugün de boş listeyi (kampüste kimse
  paylaşmamış) zarif karşılıyor.
- `UT-7425` gelmeden önce de güvenli: kod tanınmazsa istemci genel hata yoluna düşüyor
  (bugünkü davranış), kart yerinde kalıyor.
- Sürüm sırası serbest.

---

## 6. Özet

1. `GET /api/campus/moments`, isteyenin o modu kapalıysa **boş liste** dönsün.
2. Karar uçları aynı durumda **`UT-7425 MODE_NOT_OPEN` (403)** dönsün (paylaşma için
   mevcut `UT-7402` yeterli).
3. §2'deki üç soruya kısa bir "bugün şu oluyor" cevabı — davranışı ölçemedik.
