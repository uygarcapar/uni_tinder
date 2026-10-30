import { colors } from "@/shared/theme/colors";

/**
 * BÖLÜM KUTUSU — "bir listenin satırları tek bir gri kutunun içinde" dili.
 *
 * Kullanıldığı yerler: Ayarlar'ın kök kategori listesi ve kategori sayfaları
 * (bkz. SettingsScreen > SettingsList) ve Gizlilik'teki rıza anahtarları.
 *
 * AKIŞ FİLTRE SHEET'İ de bir süre buradaydı, 2026-10-27'de ÇIKTI (istek):
 * Ayarlar'da kutunun içinde gidilen satırlar var, akış filtresinde ise üç kısa
 * radyo/onay listesi — kutu onları sayfadan kopuk üç ada gibi gösteriyordu
 * (bkz. FeedFilterSheet > Section).
 *
 * KEŞİF FİLTRESİ ve PROFİL DÜZENLEME bunun DIŞINDA (istek, 2026-10-13):
 * oradaki bölümlerin gövdesi bir liste değil — pill akışı, mesafe dial'i,
 * kendi kapsülü olan seçim satırları, fotoğraf ızgarası. Kutuya alındıklarında
 * çerçeve içinde çerçeve çıkıyor. Oralarda bölüm ayrımını başlık + açıklama
 * taşıyor; bu kutuyu o iki modala tekrar götürmeden önce bunu düşün.
 *
 * Üç değer ProfileScreen'in bölümlerinden BİREBİR alındı (bkz. ProfileScreen >
 * CompletionAccordion, profile/components/SelfieVerificationRow,
 * ConsumableShopCard — ayrıca feed/feedRowShell aynı aileden):
 *   • zemin   → `colors.surface`
 *   • çerçeve → 0.5 / `colors.hairline`
 *   • köşe    → 40, `borderCurve: "continuous"`
 * Burada kendi sayını üretme: bu kutular aynı oturumda yan yana görülüyor,
 * farklı bir gri ya da farklı bir çerçeve alfası ikisini iki ayrı ürün gibi
 * gösteriyor.
 *
 * Yarıçap neden 40: ProfileScreen'de iki sayı var (accordion 40, doğrulama
 * satırı 28) ve ikisi de kutunun YÜKSEKLİĞİNE göre seçilmiş. Bu kutu çok
 * satırlı bir liste, 40 onu kapsüle çevirmiyor — yalnız köşeyi yumuşatıyor;
 * accordion'la aynı sayı olması da iki ekranı tek dile bağlıyor.
 *
 * ⚠️ FONKSİYON, SABİT DEĞİL — modül düzeyinde kurulamaz. `colors` mutable bir
 * palet ve `applyPalette` içeriğini YERİNDE değiştiriyor; modül gövdesi ise
 * oturumda bir kez çalışıyor. Kök remount ağacı yeniden MOUNT ediyor ama
 * modülü yeniden DEĞERLENDİRMİYOR, yani bir sabit ilk import'un modunda donup
 * kalır — koyu paletin grisi açık modda asılı kalırdı (bkz. theme/colors.ts >
 * mutasyon sözleşmesi).
 *
 * `overflow: hidden` kutunun bir parçası: satırların basılı zemini kutunun
 * yuvarlak köşelerine kırpılıyor, yoksa köşelerden taşıp dışarı sızıyor.
 */
export const sectionGroupStyle = () => ({
  backgroundColor: colors.surface,
  borderRadius: 40,
  borderCurve: "continuous" as const,
  borderWidth: 0.5,
  borderColor: colors.hairline,
  overflow: "hidden" as const,
});

/**
 * Kutunun yatay iç boşluğu — ProfileScreen'in bölümlerindekiyle aynı (20).
 *
 * Kutunun KENDİSİNE değil SATIRLARA veriliyor: ayırıcılar böylece kutunun bir
 * kenarından diğerine kesintisiz geçiyor ve basılı zemin satırın tamamını
 * kaplıyor — iOS'un gruplu listelerinde olduğu gibi.
 */
export const SECTION_GROUP_PAD_H = 20;

/**
 * SATIRLA değil METİNLE biten kutunun alt iç boşluğu (bkz. Ayarlar >
 * Gizlilik'teki rıza kutusu — son eleman anahtarın açıklaması).
 *
 * Satırla biten kutularda böyle bir paya gerek yok: satırın `minHeight`'ı
 * metnin üstünde ve altında ~21pt boşluk bırakıyor, kutu kendi kendine nefesli
 * duruyor. Açıklama metni o payı taşımıyor, kutu alttan sıkışık görünüyordu —
 * bu sabit üstteki optik payı taklit ediyor (metnin satır aralığından gelen
 * ~3pt ile birlikte 21'e denk geliyor).
 */
export const SECTION_GROUP_PAD_B = 18;
