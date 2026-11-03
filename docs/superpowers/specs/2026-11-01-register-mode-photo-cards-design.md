# Kayıt mod adımı: fotoğraflı mod kartları

**Tarih:** 2026-11-01 · **Boyut:** küçük değişiklik

## Niyet

Kayıttaki mod seçme adımı (RegisterStepModeScreen) şu an Step10 kalıbında iki
gri satır kartı kullanıyor. Kullanıcının isteği: Keşif'teki mod seçicinin
(ModeSelectorSheet > ModeChoiceCard) fotoğraflı 3:2 kartlarının aynısı — modal
değil, ekranda alt alta 2 kart (Dating/Friends).

## Hedefler / hedef olmayanlar

- Kart görünümü Keşif'tekiyle tek kaynaktan gelsin; iki kopya kaymasın.
- Akışın kalanı aynen kalır: ilerleme çubuğu, başlık/açıklama, bilgi satırı,
  Devam butonu, seçimsiz Devam'da hata toast'ı, moda göre dallanma
  (Friends → Step13, Dating → Step10).
- Ön-seçim yok ilkesi korunur (adım zorunlu, varsayılan mod dayatılmaz).

## Yaklaşımlar

1. **ModeChoiceCard'ı ortaklaştır (SEÇİLEN):** karta `variant: "switch" |
   "select"` eklenir; kayıt `select` kullanır, eski yerel `ModeCard` silinir.
   Katmanlar (iskelet, perde, yarıçap, foto) tek dosyada kalır.
2. Kartı auth'a kopyala (RegisterModeCard): reddedildi — 5 katmanlı foto kartı
   iki yerde yaşar, kayması garanti.

## Kararlar

- `select` varyantında chevron ve "X moduna geç" satırı YOK; açıklama her
  zaman gösterilir.
- Seçim işareti: **sağ üstte checkbox** (kullanıcının isteği), akış
  filtresindeki kutunun birebir kalıbı (FeedFilterSheet > OptionRow /
  FilterModal > CheckRow): 22×22, köşe 7 continuous, yuva HER ZAMAN çizili
  (boş kutu → "birini işaretle"), seçilince dolgu + kalın tik.
- Checkbox mürekkebi medya-sabit (benim kararım): foto üstünde tema
  mürekkepleri açık temada kaybolur; çizgi `onMedia`, seçili dolgu beyaz +
  koyu tik — kart fotolarındaki perde/mürekkep diliyle aynı.
- İlk açılışta iki kart da TAM PARLAK (hiçbiri seçili değil); seçim yapılınca
  seçilmeyen Keşif'teki gibi söner (`CARD_DIM` perdesi). Yani sönükleştirme
  "seçim var VE bu kart değil" koşuluna bağlanır — Keşif'teki "active değilse
  sön" kuralından farklı, varyantla ayrışır.
- ModeChoiceCard dosya başındaki "kayıt bu bileşeni kullanmıyor, iki kart
  ayrı" notu güncellenir; RegisterStepModeScreen'deki yerel ModeCard silinir.

## Ustaya kalanlar

- Tikin giriş animasyonu: mevcut `markIn` yayı yeterli; ayrı bir koreografi
  kurulmaz.
- Kart aralığı/kenar payları kayıt ekranının mevcut ızgarasına uyar.
