# Akışta kalıcı harita zemini — tasarım

**Tarih:** 2026-10-28 · **Boyut:** küçük değişiklik

## Niyet ve gerekçe

Kampüs haritası bugün yalnız **Akış** sayfasının zemini. Gönderilerim'e yatay
kaydırınca harita sayfayla birlikte yana gidiyor ve arkada düz `colors.bg`
kalıyor — yani harita, ekranın zemini değil bir sayfanın parçası gibi okunuyor.

İstenen: harita **iki sekmenin de ortak ve sabit zemini** olsun. Sayfalar onun
üstünden kaysın, harita hiç kıpırdamasın.

## Hedefler

- Harita Akış ↔ Gönderilerim geçişinin tamamı boyunca yerinde kalır.
- Gönderilerim'de harita **Akış'takiyle birebir aynı görünür** (kullanıcı kararı):
  aynı kadraj, aynı okunabilirlik perdesi, aynı kampüs. Sekmeye özel soluklaştırma
  veya ikinci bir görünüm yok.
- Tek harita örneği kalır.

## Hedef olmayanlar

- Alt sekme çubuğundaki ekranlar arası geçiş (Keşif, Mesajlar…) kapsam dışı; istek
  yalnız akışın kendi iki sayfası için.
- Tam ekran harita akışının (`mapProgress`, perdeler, anlar şeridi, köşe
  butonları) davranışı değişmiyor.
- Gönderilerim'in içeriği, boş durumu ve liste payları değişmiyor.

## Karşı-hedefler (teknik olarak çalışsa bile başarısızlık sayılır)

- Köşelerdeki SwiftUI cam butonların ya da şeridin sessizce çizilmemesi.
- Geçiş sırasında haritanın bir kare bile kayması/zıplaması.
- Gönderilerim'de haritanın ARDINDAN gelen opak bir zemin yüzünden harita hiç
  görünmemesi (pager'ın native zemini).

## Kısıtlar

- `FeedMapStrip`in kökü `StyleSheet.absoluteFill` — taşındığı yerde kendi
  konumunu kendi kuruyor, sarmalayıcı gerekmiyor.
- Haritanın kadrajı ve perdesi `heroHeight = listTopPadding + chromeHeight`ten
  türüyor; `chromeHeight` **Akış** sayfasının chrome bloğundan ölçülüyor. Akış
  sayfası pager'da mount'lu kaldığı için bu sayı Gönderilerim'deyken de geçerli.
- Proje notu: ata zincirinde `opacity < 1` ya da kimliksel olmayan transform gören
  SwiftUI camı sessizce hiç render edilmiyor. Haritanın yeni kabı bu yüzden
  transformsuz ve tam opak olmalı.
- Proje notu: stili yalnız `flex: 1` olan `View` native ağaçta düzleşebiliyor →
  sayfa kapları `collapsable={false}` kalmalı.

## Yaklaşımlar

**A — Haritayı pager'ın dışına al (seçilen).** `mapHero`, kök `View`in ilk çocuğu
olur; katman sırası `harita < pager < şerit < perdeler < köşe butonları`. Şerit ve
perdeler zaten pager'ın dışında, yani harita da ait olduğu katmana geçmiş oluyor.
Tek örnek, hesapsız, gerçekten sabit. Bedeli: `FeedScreen.tsx:2425`teki notun
uyardığı risk — iOS'ta `AnimatedPagerView` native bir sayfa denetleyicisi ve kendi
zemini arkasındakini örtebilir. Pager'a ve iki sayfaya açık `backgroundColor:
"transparent"` vermek gerekiyor; doğrulama cihazda.

**B — Harita Akış sayfasında kalsın, `pagerOffset` kadar ters ötelensin.** Pager
zemini riskine girmiyor. Ama Gönderilerim'e tam geçildiğinde harita, ekran
dışındaki bir sayfanın çocuğu olarak kabının sınırları dışına çizilmek zorunda —
Android'de pager bunu kırpıyor, iOS'ta kırpmama garantisi yok. Ayrıca sabitlik her
karede bir hesaba bağlanıyor, yani kaymaya açık.

**C — Sayfa başına bir harita örneği.** Elendi: iki Mapbox + Skia katmanı demek ve
harita yine sayfayla birlikte kayar — isteği hiç karşılamıyor.

**Seçilen: A.** Tek belirsizliği (şeffaf zemin) tek satırla kapanıyor ve cihazda
hemen görülüyor; B'nin riski yapısal ve görünmez.

## Kararlaştırılan how

1. `mapHero` pager'ın içinden çıkar; kök `View`in **ilk** çocuğu olur, yani
   `AnimatedPagerView`den önce → arkasında. Koşulu (`key === "feed"`) düşer.
2. `AnimatedPagerView`in ve iki sayfa kabının zemini açıkça `transparent`.
   Pager'ın `style`ı `{ flex: 1, backgroundColor: "transparent" }`, sayfalar
   `{ flex: 1, backgroundColor: "transparent" }` + mevcut `collapsable={false}`.
3. `listSlideStyle` **yalnız Akış sayfasında** kalır (değişmiyor): tam ekran harita
   yalnız Akış'tan açılıyor ve açıkken pager jesti zaten kilitli.
4. Kök `View`in `colors.bg` zemini kalır — haritanın altındaki taban.
5. Taşınan yerdeki yorum güncellenir: eski not "pager'ın dışına değil, sayfanın
   içine" diyor ve artık tersi geçerli. Yeni not, reddin neden kalktığını ve
   şeffaf zeminin neyi taşıdığını yazar — yoksa bir sonraki okuyan eski nota
   bakıp geri alır.

## Builder'a bırakılanlar

- Yorumların tam metni ve yeri.
- Şeffaflığın `StyleSheet` sabiti mi satır içi nesne mi olacağı.

## Doğrulama

- `yarn tsc --noEmit` (ya da projenin tip kontrolü) ve ilgili jest testleri.
- **Cihaz/simülatör:** Akış ↔ Gönderilerim arasında yavaş kaydırırken haritanın
  hiç kıpırdamadığı; Gönderilerim'de haritanın Akış'takiyle aynı göründüğü; köşe
  cam butonlarının ve sekme şeridinin iki sekmede de çizildiği; tam ekran harita
  açılış/kapanışının bozulmadığı.
