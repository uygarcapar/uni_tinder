import { Text, type StyleProp, type TextStyle } from "react-native";
import { colors } from "../theme/colors";

/**
 * İSMİN YANINDAKİ premium işareti — ürünün wordmark'ı, marka renginde küçük.
 *
 * Eskiden yuvarlak zeminin içinde bir alevdi (`PremiumFlame`); alev artık bu
 * satırlarda çizilmiyor. Rozetin ne olduğunu simgeden çıkarmak gerekiyordu,
 * wordmark doğrudan söylüyor. `PremiumFlame` yerinde duruyor ama işi değişti —
 * zemini kendinden belli yerlerin glyph'i (toast ikonu, lit shop kartı, fayda
 * listesi). İsim satırında ONU DEĞİL bunu çağır, aksi halde aynı işaret
 * ekrandan ekrana farklı görünür.
 *
 * Kullanıldığı yerler kart başlıkları (keşif kartının kapağı ve açılmış paneli,
 * yukarı kaydırınca çıkan şerit, Likes kartı) ve profildeki hero ismi.
 *
 * Ölçü ELLE VERİLMİYOR, yanındaki ismin puntosundan çıkıyor: tek bir kural
 * bütün satırlarda aynı oranı tutuyor (bkz. premiumBadgeFontSize).
 */

/**
 * Marka yazımı — çevrilmiyor, "lit plus" DEĞİL.
 *
 * Ürünün her yerdeki wordmark'ıyla birebir aynı dize ve aynı font: plus
 * sayfasının plan kartı (PurchaseSections > PlanBrandWord), lit shop satırı
 * (PlusCard), profildeki upsell kartının başlığı ve karşılaştırma tablosunun
 * sütun başlığı. "+" da Duckie'nin KENDİ glifi: ayrı fontta bir artı işareti
 * iki farklı yazı gibi okunuyor (aynı gerekçe PlanBrandWord'de).
 *
 * `premium.planName` çevirisinden okunmuyor: bu bir marka işareti, tr/en'de
 * aynı ve satır başına bir `useTranslation` aboneliği (LikesScreen'de liste
 * satırı başına bir tane) sabit bir dize için gereksiz render trafiği demek.
 */
const BADGE_LABEL = "plus+";

/**
 * Duckie-regular. Runtime'da yüklenmiyor, expo-font config plugin'i binary'e
 * gömüyor (bkz. App.tsx) — ilk frame'de hazır, yükleme kapısı gerekmiyor.
 */
const BADGE_FONT = "Duckie-regular";

/**
 * İsmin puntosundan wordmark'ın PUNTOSUNU verir.
 *
 * 0.75 SF Pro'ya bakan bir orana göre YÜKSEK duruyor, sebebi fontun metriği:
 * Duckie'nin x yüksekliği 0.338em (SF Pro'da ≈0.52). Yani aynı puntoda
 * Duckie'nin küçük harfleri arayüz fontununkilerin ancak üçte ikisi kadar
 * okunuyor; oran ismin puntosuyla kıyaslanacak bir sayı değil, o kaybı
 * kapatıyor. Aynı hesap uygulamada zaten var: profildeki upsell kartının tablo
 * başlığında 25 punto Duckie, yanındaki 12 punto BÜYÜK HARF SF ile aynı boyda
 * okunuyor.
 *
 * 18 tabanı okunurluk sınırı: oran hero isminde (18) 13'e düşüyordu ve o
 * puntoda kelime lekeye dönüşüyor. Fiilen: kart kapağı 21, panel 23,
 * şerit/Likes/hero 18.
 *
 * 0.55/14 → 0.65/16 → 0.75/18: wordmark ismin yanında iki turda da silik
 * kaldı. Büyütürken İKİSİ BİRLİKTE oynuyor — yalnız oranı artırmak küçük
 * puntolu satırları (hero 18, şerit 21) tabanda bıraktığı için orada hiçbir şey
 * değişmiyor. Buradan sonrası ismin puntosuna dayanıyor: 0.75'te kapaktaki
 * wordmark'ın ink yüksekliği ismin cap bandına yaklaşıyor, daha ötesi "isim
 * yanında küçük işaret" değil ikinci bir başlık olur.
 *
 * Daire çapı hesabı (0.7 × 1.15, cap bandı payı) BİLEREK gitti: kutu yok,
 * metnin kendi satır kutusu var.
 */
export const premiumBadgeFontSize = (fontSize: number): number =>
  Math.max(18, Math.round(fontSize * 0.75));

export default function PremiumBadge({
  fontSize,
  style,
}: {
  /** İşaretin yanındaki ismin puntosu — ölçü bundan türüyor. */
  fontSize: number;
  style?: StyleProp<TextStyle>;
}) {
  return (
    <Text
      numberOfLines={1}
      style={[
        {
          // İsim kırpılır, bu kırpılmaz: iki karakteri eksik kalan bir wordmark
          // bilgi vermiyor. Satırda daralacak olan taraf isim (çağıranlarda
          // `flexShrink: 1`).
          flexShrink: 0,
          // Marka rengi — `litPlus` (#ff3d3d), plus sayfasının ve dolu
          // CTA'ların rengiyle AYNI. Modla dönmüyor (sabit marka tonu) ve
          // render anında okunuyor: palet mutasyona uğruyor, modül seviyesinde
          // sabitleme.
          color: colors.litPlus,
          fontFamily: BADGE_FONT,
          fontSize: premiumBadgeFontSize(fontSize),
          // `fontWeight` YOK: Duckie tek ağırlıklı, kalınlık istendiğinde
          // Android sentetik bold çiziyor ya da aileyi ıskalayıp sistem fontuna
          // düşüyor — wordmark o an marka olmaktan çıkıyor.
          includeFontPadding: false,
          // `lineHeight` BİLEREK verilmiyor: fontun satır kutusu harflerin
          // üstünde kendi boşluğunu taşıyor ve elle daraltılan kutu "plus"ın
          // sarkan p'sini kırpıyor (aynı tuzak profildeki upsell kartında da
          // not düşülmüş). Dikey hizayı satırın kendi `alignItems`ı yapıyor —
          // baseline hizalı satırlarda (Likes kartı) wordmark ismin tabanına
          // oturuyor, ki metin için doğru duruş bu.
        },
        style,
      ]}
    >
      {BADGE_LABEL}
    </Text>
  );
}
