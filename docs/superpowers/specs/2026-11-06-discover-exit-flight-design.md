# Keşif: beğen/geç'te kartın çıkış uçuşu geri geliyor

Tarih: 2026-11-06 · Durum: tasarım onaylandı, plan bekliyor

## Niyet

Bugün Keşif'teki **her** çıkış aynı dili konuşuyor: kart yerinde kalıyor, alev
ekranı alttan yukarı süpürüyor, deste dalga ekranı tam kapattığı karede
ilerliyor. Dört eylem (geç · beğen · Fire/Spark · not) ve geri al, hepsi aynı
yoldan.

İstek: **alev bir kutlama olsun, bir devir mekanizması değil.** Alev yalnız
kullanıcının bir şey HARCADIĞI eylemlerde — Fire/Spark ve not — kalsın. Sıradan
beğen/geç ise eskiden olduğu gibi: kart parmağın gittiği yöne uçar, arkasından
bir sonraki kart çıkar. Geri al da alevsiz: kart soldan kayarak gelir.

Gerekçe hissiyat: beğen/geç destede saniyede bir yapılan hareket; her birine tam
ekran bir kutlama düşürmek hem ağır hem de alevin anlamını ("özel bir şey
yaptın") siliyor.

## Hedefler

- Sağa/sola kaydırmada kart ekranı terk etsin; hareket parmağın bıraktığı hızı
  taşısın.
- Aynı şey ✓ / X **butonlarında** da olsun — jest ve buton tek kapıdan geçmeye
  devam ediyor (`commitExit`), ikisi farklı görünmemeli.
- Fire/Spark ve notta alev **aynen** kalsın (örtü altında devir dahil).
- Geri al alevsiz, kart soldan kayarak girsin.
- Eşleşmeli beğenide de kart uçsun; MatchModal'ın perdesi arkadan gelsin.

## Hedef olmayanlar

- Fire'ın kendi hareketine (aşağı çekiş, alev, park) dokunmak.
- Notun gönderim akışına dokunmak.
- Kartın giriş kaymasını ileri yönde geri getirmek: ileri swipe'ta alttaki kart
  zaten tam boy duruyor ve üstteki uçunca açılıyor — kaymanın yeri yalnız geri al.
- Destenin derinlik ipucunu (0.92 ölçek) geri getirmek — tam ekran kartta
  bozuktu, sönüklük tülü yerine geçti.

## Anti-hedefler (teknik olarak çalışsa bile başarısızlık sayılır)

- Giden kartın uçuşun ortasında desteden düşüp ekranın ortasına geri
  yapışması. (Eski `exitHandoff` kurgusunun klasik belirtisi: kart ekranın
  kenarına varmadan "zınk" diye merkeze dönüyor, sonra kayboluyor.)
- Uçuş sırasında büyük tik/X rozetinin ekranın ortasında asılı kalması — rozet
  kartın içinde değil, ekran katında duruyor (`DiscoverScreen` → `SwipeOverlay`).
- Fire/not dalında alevin ya da `hold`/release zincirinin bozulması.
- Yeni üst kartın ilk karesinde donmuş bir expand oranıyla ya da kaydırılmış
  içerikle doğması.

## Kısıtlar (koddan)

1. **Uçuş takımı silinmiş durumda.** `flyOut`, `EXIT_DURATION`,
   `EXIT_DISTANCE`, `EXIT_OVERSHOOT` (1.35), `EXIT_HANDOFF_MS` (~65),
   `exitHandoff` kanalı, `unwindForExit`, rozetin çıkış sönümleri — hepsi
   2026-10-13'te kaldırıldı (bkz. `SwipeWrapper.tsx` başındaki kaldırma notu).
   Jest 2026-11-04'te geri geldi, uçuş gelmedi: `tx` · `rotate` ·
   `SWIPE_THRESHOLD` var ve parmağı takip ediyorlar.
2. **Geometri duruyor.** `EXIT_CLEAR_DISTANCE` (dönen tam ekran kartın ekranı
   tamamen terk etmesi için gereken yatay yol, `w·cosθ + h·sinθ` hesabıyla)
   hâlâ dosyada — bugün girişin mesafesi olarak kullanılıyor. Yeniden hesap yok.
3. **Eğim bedava.** `animatedStyle` içindeki `dragRotate` zaten `tx`ten
   türüyor; kart uçarken kendiliğinden `EXIT_TILT`e yatıyor.
4. **Giden kart unmount edilmiyor**, destenin en altındaki geri al yuvasına
   düşüyor; üst karttan düşer düşmez bir effect `tx`i sıfırlıyor
   (`SwipeWrapper.tsx:846`). Yani deste uçuşun ORTASINDA ilerlerse kart merkeze
   geri yapışır — anti-hedefin kaynağı bu.
5. **Rozet ekran katında**: `SwipeOverlay`, `DiscoverScreen.tsx:3282`'de
   deste kabının dışında. Kartla birlikte uçmuyor.
6. **`deckSettled` / `warmCovers` / `tryReleaseFlame`** zinciri alev
   penceresini koruyor. Uçuş dalında bekleyen bir dalga olmadığı için
   `releaseFlameSweep()` no-op; gelen kart zaten mount, ölçülü ve kapağı decode
   edilmiş (altta duruyordu), yani kapak kapısının koruduğu şey orada yok.
7. **Kapsam yalnız Keşif.** `SwipeWrapper`ın tek kullanıcısı `DiscoverScreen`;
   Beğenenler'deki `LikerSwipeModal` kendi akışında, etkilenmiyor.
8. **`BUTTON_SWIPE_LOCK_MS` 1300**, bilerek: alev modelinde buton basıştan
   ~800 ms sonra iş görüyor. Uçuş 120-180 ms, yani bu sayı geç/beğen için artık
   fazla.

## Yaklaşımlar

**A — Eski kurguyu birebir geri getir.** `flyOut` + `exitHandoff` kanalı +
"deste uçuşun 65. ms'sinde ilerler". Tanıdık; ama kısıt 4'teki tuzak
(`exitHandoff`ın var olma sebebi) ve silinmiş beş sabit birlikte geri geliyor.

**B — Uçuş bitince devir.** Sabit 180 ms ease-out-cubic; `withTiming`
callback'inde deste ilerliyor, kart offscreen'deyken sıfırlanıyor. `exitHandoff`
hiç geri gelmiyor, kart uçuş boyunca üst kart kalıyor (kısıt 4 hiç
tetiklenmiyor). Bedel: devir ~180 ms gecikiyor — gözle görünmüyor, çünkü yeni
kart zaten altta duruyor ve pencere `exitPending` ile kilitli.

**C — B + hıza duyarlı süre. ← SEÇİLEN**
Aynısı; uçuşun süresi bırakış hızından geliyor (hızlı fiskede ~120 ms, yavaş
bırakışta ~180 ms), buton yolunda hız yok, sabit eğriye düşüyor. Jest geri
geldiği için fark hissediliyor: sabit süreli uçuş sert fiskede kartı
tutuyormuş gibi oluyor. B'nin üstüne tek satırlık bir hesap.

## Son hâl: eylem matrisi

| Eylem | Kart | Deste ne zaman ilerler | Alev |
|---|---|---|---|
| Geç (sola jest · X butonu) | sola uçar | uçuş bitince | **yok** |
| Beğen (sağa jest · ✓ butonu) | sağa uçar | uçuş bitince | **yok** |
| Beğen + eşleşme gelecek | aynı uçuş | uçuş bitince | **yok** — MatchModal perdesi arkadan gelir |
| Fire/Spark (aşağı çekiş) | yerinde durur | alev ekranı kapatınca | var (`hold`) |
| Fire + eşleşme gelecek | yerinde durur | MatchModal perdesi altında | yok — perde kutlama |
| Not | yerinde durur | alev ekranı kapatınca | var (`hold`) |
| Not + eşleşme gelecek | yerinde durur | anında (bugünkü hâl) | yok |
| Geri al | **soldan kayarak girer** | kart ölçülü olunca | **yok** |

## Kararlar

### 1. Uçuş (`SwipeWrapper`)

- Yeni `flyOut(direction, velocityX)` worklet'i: `tx.value = withTiming(±EXIT_CLEAR_DISTANCE, {duration, easing: Easing.out(Easing.cubic)}, (finished) => { if (finished) runOnJS(finishFlight)(direction) })`.
- **Overshoot yok** (eski 1.35 katı): o fazlalık devri eğrinin erkenine çekmek
  içindi, devir artık uçuşun SONUNDA.
- Süre: `FLY_OUT_MS_SLOW = 180`, `FLY_OUT_MS_FAST = 120`. `|velocityX|` 0 →
  SLOW, ≥ `VELOCITY_THRESHOLD` (2500, jestteki sayının aynısı) → FAST, arası
  doğrusal. Buton yolunda velocity 0.
- `finishFlight`: `collapseUnderCover()` (adı değişiyor, aşağıda) + `onSwipe(direction, profile.userId)`. Kart o
  anda ekran dışında, yani sıfırlama görünmüyor — bugünkü "örtü altında"nın
  yerini "ekran dışında" alıyor.
- `collapseUnderCover` → **`resetAfterExit`** olarak adlandırılıyor; Fire dalı
  onu örtü altında çağırmaya devam ediyor. **Uçuş dalında `tx` SIFIRLANMIYOR**
  (iki dal arasındaki tek fark): kart uçuşun sonunda ekran dışında ama hâlâ üst
  kart; `tx = 0` yazmak onu `setCurrentIndex` commit'lenene kadar en az bir kare
  ekranın ortasına geri getirir — anti-hedef 1'in ikinci yüzü. Sıfırlamayı
  zaten var olan `!isTopCard` effect'i (`SwipeWrapper.tsx:846`) yapıyor: kart
  yuvaya düşer düşmez, yeni üst kartın tam ekran opak gövdesinin ardında.
  Geri kalanı (expand değerleri, `scrollY`, overlay kanalları) ekran dışındaki
  kartta değişiyor, yani görünmüyor.
- **Sıra korunuyor:** `resetAfterExit()` → `onSwipe()`. `overlayDragX`in 0'a
  dönmesi index değişiminden ÖNCE olmalı: kanalı alttaki kartın tülü okuyor
  (`underDimStyle`) ve 150'de bırakılırsa yeni alt kart bir kare tam parlak
  doğup sonra sönükleşir.
- **Rozet uçuşla birlikte sönüyor**: `overlayOpacity` uçuş süresiyle aynı
  sürede 0'a `withTiming`; `resetAfterExit` onu ham 1'e döndürüyor. Gerekçe
  anti-hedef 2 — rozet ekran katında, kartla gitmiyor.
- `runCoveredExit` ikiye ayrılıyor:
  - `direction === "up"` (Fire) → bugünkü yol, değişmiyor (eşleşme dalı dahil).
  - `direction === "left" | "right"` → `flyOut`. Eşleşme kestirimi (`willMatch`)
    bu dalda **hiç okunmuyor**; `onSwipe`ın üçüncü parametresi (`matching`)
    yalnız Fire'dan `true` gelebiliyor.
- `exitPending` aynen duruyor: uçuş penceresinde ikinci karar yutulmaya devam
  ediyor.

### 2. Eşleşme dalı (`DiscoverScreen > handleSwipe`)

- `matching === true` yalnız Fire'dan geliyor artık. `runMatchCurtain` ve
  `deckHoldRef` o dal için **duruyor** — silinmiyor.
- Beğeni eşleşmeli de olsa `advanceDeck()` doğrudan çağrılıyor: kart uçtu, deste
  ilerledi, MatchModal bildirim dönünce üstüne açılıyor.
- Bu, 2026-10-13'teki "önce kart değişiyor, sonra alev modalı geliyor; ilk o
  gelsin" isteğinin **bilinçli olarak geri alınmasıdır** — kullanıcıya soruldu,
  "kart uçsun sonra modal gelsin" dedi (2026-11-06). Beğeni dalında o kural
  artık geçerli değil; Fire'da aynen duruyor.

### 3. Geri al (`DiscoverScreen`)

- `startRewindUnderCover` · `rewindFlameUnsub` · `rewindCovered` ·
  `tryCommitRewind` **kaldırılıyor**. Kalan kapı tek: kart ölçülü mü?
  - Yuva yolu (normal hâl): `pendingRewind.current = userId; commitRewind();`
  - `warmRewind` yolu: ölçüm haberi (`handleRewindSlotReady`) doğrudan
    `commitRewind` çağırıyor; `STACK_ENTRY_SETTLE_TIMEOUT_MS` tavanı duruyor.
- Giriş kayması zaten orada: `commitRewind`, `cardEntryX`i
  `-CARD_ENTRY_DISTANCE`e yazıp `pendingEntryKick` ile commit sonrası
  `withTiming(0, 180ms)` başlatıyor — kart soldan, hafif çapraz ve eğimli
  geliyor. Hiçbir şey eklenmiyor.
- `commitRewind` içindeki `pendingRelease.current = true` kalabilir (bekleyen
  dalga yoksa `releaseFlameSweep()` no-op) ama artık ölü kod: builder
  temizlemeyi tercih edebilir.

### 4. Buton kilidi

- `BUTTON_SWIPE_LOCK_MS` ikiye ayrılıyor:
  - `FIRE_BUTTON_LOCK_MS = 1300` (alev modeli — değişmiyor).
  - `SWIPE_BUTTON_LOCK_MS = 250` (uçuşun tavanı 180 + pay). Aksi halde kart
    gideli 1 saniye olmuşken butonlar hâlâ ölü duruyor.
- Çift tetiklemeye karşı asıl güvence yine `exitPending`.

### 5. Dokunulmayanlar

`flameSweep.ts` sözleşmesi, `FireFlameCanvas`ın park fazı, `tryReleaseFlame` /
`warmCovers` / `deckSettled` zinciri, `RasterizeWhenCovered`, notun gönderim
akışı, kota/paywall kapıları, `swipedAtRef` koruma penceresi.

## Builder'a bırakılanlar

- `flyOut`un worklet mi JS mi olacağı ve `runOnJS` sınırının tam yeri.
- Hız → süre eşlemesinin tam formülü (doğrusal interpolasyon yeter).
- Uçuş yarıdayken kart ağaçtan düşerse (deste tazelendi, sekme değişti, tema
  remount'u): `withTiming` callback'i `finished === false` ile geliyor, yani
  `onSwipe` çağrılmıyor ve deste ilerlemiyor. Bugünkü alev dalının davranışı da
  bu (cleanup'ta `flameCoverUnsub`) — kart zaten gitmiş oluyor.
- Hangi dosya-içi notların güncelleneceği: `SwipeWrapper.tsx` başındaki
  "UÇUŞ TAMAMEN KALDIRILDI" notu ve `flameSweep.ts`in başlığı artık yanlış —
  ikisi de bu tasarıma göre yeniden yazılmalı (bu kod tabanında notlar
  sözleşme).
- Test: mevcut Keşif testlerinin hangilerinin alev beklediği ve uçuşa
  çevrileceği.

## Doğrulama

Cihazda (simülatör yetmez — jest hızı ve alev birlikte):
1. Sola/sağa kaydır → kart uçuyor, alev YOK, arkadaki kart açılıyor.
2. Hızlı fiske ile yavaş sürükleyip bırakmayı karşılaştır → uçuş hızı farklı.
3. ✓ / X butonları → aynı uçuş; art arda iki basış çalışıyor (1.3 sn ölü
   pencere yok).
4. Seni beğenmiş birine sağa kaydır → kart uçuyor, sonra MatchModal perdesi.
5. Aşağı çek (Fire) → kart yerinde, alev süpürüyor, kart örtü altında değişiyor.
6. Not gönder → alev, bugünkü gibi.
7. Geri al → alev yok, kart soldan kayarak geliyor; arkasında beyazlık/sıçrama
   yok.
8. Destenin sonunda geri al (yuva yok, `warmRewind` yolu) → kart yine kayarak
   geliyor, tavan dolsa bile ekran takılmıyor.
