# Kampüs anı kartı — dokununca büyüyen kart + cam tik

**Tarih:** 2026-10-30 · **Boyut:** küçük değişiklik (kısa tasarım)

## Niyet

Kampüs anı kartına dokunmak bugün kişinin **profil kartını** açıyor. Bu yol kapanıyor.
Yerine: kart bulunduğu yerden **ekranın ortasına uçuyor**, sonra **büyüyor**; sağında tek
bir cam **tik** butonu duruyor ve beğeni oradan gönderiliyor.

**Neden.** Profil yolu şu an fiilen çalışmıyor: ödünç alınan uç (`/api/swipe/LikerProfile`)
sert bir beğeni kapısı taşıyor ve bizi beğenmemiş biri için **404** dönüyor (backend teyit
etti, `GetLikerProfileDetailHandler.cs:66-71`). Kampüse özel uç
(`GET /api/campus/moments/{id}/profile`) talep edildi ama yazılmadı. Yani bugün kart bir
kapı ama arkasında oda yok. Büyüyen kart, profili beklemeden kullanıcıya "önce bak, sonra
karar ver" adımını geri veriyor — karar hâlâ görmeden verilmiyor.

## Hedefler

- Karta dokunmak → kart ortaya uçsun, sonra büyüsün.
- Büyük kartın sağında **cam tik**; basınca beğeni gider.
- Tikten sonra **Keşif'in alev süpürmesi** oynasın; kart, alevin örtüsü **altındayken**
  küçülüp yerine dönsün ve overlay kapansın.
- Karar vermeden çıkmak serbest ve bedelsiz.

## Hedef olmayanlar

- Profil açma (bu sürümde **tamamen** kapalı; uç gelince ayrı iş).
- **Fire ve Not butonları.** Sözleşme yalnız düz beğeniyi kampüs kaynağıyla kapsıyor
  (`/api/swipe/Like` + `source:"CampusMoment"` + `momentId`); Fire'ın ve Not'un bu
  yüzeyden gönderilmesi hiç konuşulmadı — `allowFire={false}`ın sebebi de buydu.
  İstek üzerine **şimdilik yalnız tik**.
- "Geç" (X). Bu yüzeyde karar tek yönlü: beğen ya da çık. `/moments/{id}/pass` ucu
  duruyor, çağıran kalmıyor.

## Anti-hedefler (teknik olarak çalışsa bile başarısızlık sayılır)

- **Cam butonun sessizce çizilmemesi.** Animasyonlu/kimliksel olmayan bir transform'un
  altında doğan `GlassView` hiç render edilmiyor ve sonradan düzelmiyor (projede yazılı
  en sert tuzak; eski `actionsReady` kapısı tam bunun içindi).
- **Giden kartın görünmesi.** Alev örtüsü altında yapılması gereken küçülme, örtü
  açıldıktan sonra yapılırsa kullanıcı kartın "geri kaçtığını" görür.
- Kota harcanmadan kapanan bir yüzeyin kota harcamış gibi görünmesi (ya da tersi).

## Kısıtlar

1. **Cam kuralı.** Butonlar uçan kartın **çocuğu olamaz**; kardeşi olmak ve kart yerine
   oturduktan **sonra** mount edilmek zorunda. Kullanıcı isteği zaten bu ("cam buton kart
   ekranın ortasına geldikten sonra çizilsin") — yani ürün isteği ile teknik zorunluluk
   aynı yere bakıyor.
2. **Alev global.** `<FireFlame />` `AppNavigator.tsx:2246`'da mount; `runFlameSweep`
   `uiBus` üzerinden çalışıyor, yani Keşif dışından da tetiklenebiliyor. Yeni bir alev
   katmanı **kurulmayacak**.
3. **Beğeni yolu değişmiyor.** `useCampusSurface.like` zaten kotayı, paywall'ı
   (`CAMPUS_LIKE_LIMIT`), `UT-7424` gibi kart-düşüren kodları ve `refreshCampus`i
   yönetiyor. Bu yüzey yalnız onu çağırıyor.
4. **Şerit bir `FlatList` ve kırpıyor.** Büyüyen kart listenin içinde kalamaz
   (`UIScrollView` her zaman kendi sınırına kırpıyor — `LIFT_BLEED` notu).

## Yaklaşımlar

| | Nasıl | Takas |
|---|---|---|
| **A — ölçülen kareden uçan kopya** *(seçildi)* | Şeritteki kart `measureInWindow` ile ölçülüyor; overlay'de o kareden başlayan bir kopya doğuyor, ortaya uçuyor, sonra büyüyor. Orijinal kart o sırada görünmez. | Ölçüm + overlay gerekiyor; karşılığında "önce ortaya gel, sonra büyü" sırası birebir kurulabiliyor |
| B — ortada doğup büyüyen kart | Overlay ortada bir kart açıyor, ölçüm yok | İstenen sıra kurulamıyor: kart nereden geldiğini söylemiyor, "uçma" fazı yok |
| C — mevcut `LikerSwipeModal`ı kart moduna sokmak | Var olan modal yeniden kullanılır | O bileşen profil kartı + kaydırma kararı için yazılmış; profilsiz bir kart için içinin yarısını kapatmak gerekiyor ve kaydırma jesti bu yüzeyde anlamsız |

**Seçim: A.** Kullanıcının tarif ettiği iki fazlı hareket ("önce ortaya getir, sonra
büyüt") yalnız başlangıç karesi bilinirse kurulabilir.

## Kararlar

- **Büyük kart = aynı kartın büyüğü.** Yeni içerik yok; ad/yaş ve saat zaten kartın
  üstünde. *(önerim, kabul edildi)*
- **Kapanış:** zemine dokunmak + aşağı çekmek. Karar vermeden çıkmak kota harcamıyor.
  *(önerim, kabul edildi)*
- **Zemin:** haritanın üstüne perde, ekranın kendi dili (`CampusMapScrim`). *(önerim)*
- **Tikten sonra:** `runFlameSweep({ hold: true })` → örtü kapandığında kart küçülüp
  yerine dönüyor ve overlay kapanıyor → `releaseFlameSweep()`. Beğeni isteği örtüyü
  **beklemiyor**, paralel gidiyor. *(kullanıcı isteği)*
- **Kota bitmişse** tik paywall açıyor — bugünkü `like` davranışı, dokunulmuyor.
- **Kendi anım** dokunulamaz kalıyor (UT-7422); overlay hiç açılmıyor.

## Oluşturucuya bırakılanlar

- Hareketin süresi/eğrisi: iki faz (uçuş → büyüme) ya da tek yaylı geçiş, hangisi
  cihazda doğru duruyorsa. Tavan: alevin örtü bütçesi (~215ms) **değil** — küçülme
  örtünün altında ve park tavansız (8sn valf).
- Büyük kartın ölçüsü ve cam butonun çapı/yeri (sağ kenar, dikey orta).
- Overlay'in FeedScreen ağacındaki tam yeri — şerit ve haritanın kardeşi olmak koşuluyla.
- Ölçümün ne zaman alınacağı (dokunma anı) ve kart listede kaydırılırken bayatlarsa ne
  olacağı.
