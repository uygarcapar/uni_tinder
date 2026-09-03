import { Platform } from "react-native";
import {
  background,
  contentShape,
  controlSize,
  fixedSize,
  font,
  foregroundStyle,
  frame,
  glassEffect,
  padding,
  shapes,
  strokeBorder,
  type ModifierConfig,
  type Shape,
} from "@expo/ui/swift-ui/modifiers";
import { isLiquidGlassAvailable } from "expo-glass-effect";
import { colors, isLight, withAlpha } from "@/shared/theme/colors";

/**
 * Liquid Glass yalnızca iOS 26+'da var. @expo/ui altındaki sürümlerde
 * buttonStyle("glass")'ı SESSİZCE .automatic'e, glassEffect()'i de no-op'a
 * düşürüyor (node_modules/@expo/ui/ios/Modifiers/ViewModifierRegistry.swift:1581
 * ve GlassEffectModifier.swift:33). Sonuç: iOS 18 ve altında butonlar zeminsiz,
 * çerçevesiz düz bir label olarak kalıyor — bu yüzden border'ı biz çiziyoruz.
 */
export const HAS_LIQUID_GLASS =
  Platform.OS === "ios" && parseInt(String(Platform.Version), 10) >= 26;

/**
 * RN katmanındaki cam YÜZEY (expo-glass-effect > `GlassView`) kullanılabilir mi?
 *
 * `HAS_LIQUID_GLASS`tan farkı KAYNAĞI: o sabit @expo/ui'nin SwiftUI
 * modifier'ları için `Platform.Version`dan tahmin ediyor; bu ise native modülün
 * kendi sabitini okuyor ve Info.plist'teki `UIDesignRequiresCompatibility`
 * bayrağını da hesaba katıyor — bayrak açık olan bir binary'de iOS 26'da bile
 * cam YOK. Yüzey (panel/kart) tarafında hep bunu kullan.
 *
 * Buton tarafında `HAS_LIQUID_GLASS` kalmalı: orada soru "cam var mı" değil,
 * "SwiftUI modifier'ı sessizce .automatic'e mi düştü" — cevabı aynı olsa da
 * fallback'i tetikleyen şey o.
 */
export function hasLiquidGlassSurface(): boolean {
  return Platform.OS === "ios" && isLiquidGlassAvailable();
}

/**
 * `GlassView`in görünümünü uygulamanın KENDİ temasına bağlar.
 *
 * Prop'un varsayılanı "auto" ve o SİSTEM görünümünü okuyor; uygulamanın kendi
 * açık/koyu anahtarı olduğu için (bkz. shared/theme/colors.ts) sistem koyu,
 * uygulama açıkken cam ters tarafa düşerdi — koyu camın üstünde koyu yazı.
 *
 * Render anında okunmalı: palet mutasyona uğruyor, modül seviyesinde sabitleme.
 */
export const glassColorScheme = (): "light" | "dark" =>
  isLight() ? "light" : "dark";

type GlassFallbackShape = "capsule" | "circle" | "roundedRectangle";

type GlassFallbackOptions = {
  /** Border + zemin şekli. İkon butonu → "circle", metin butonu → "capsule". */
  shape?: GlassFallbackShape;
  /** shape === "roundedRectangle" için köşe yarıçapı. */
  cornerRadius?: number;
  /** Border kalınlığı (pt) — varsayılan 0.5, saç teli inceliğinde. */
  borderWidth?: number;
  /** Türetilen tonları ezmek için doğrudan renk verilebilir. */
  borderColor?: string;
  /**
   * Düz dolgu. VARSAYILAN YOK: zemin normalde `GlassFallbackSurface`in
   * `BlurView`inden geliyor, SwiftUI zincirinden değil. Yalnızca bulanıklığın
   * kullanılamadığı iki durumda ver — dolu tint'li butonlar (süper beğeni,
   * kırpıcının onay butonu) ve kutusu bilerek butondan geniş bırakılan
   * kapsüller (bkz. `glassFallbackFill`).
   */
  backgroundColor?: string | null;
  /**
   * .automatic buton stili kendiliğinden padding vermiyor; frame()'i olmayan
   * metin butonlarında border yazıya yapışmasın diye boşluk buradan gelir.
   */
  padding?: { horizontal?: number; vertical?: number; all?: number };
  /**
   * frame()'i olmayan ikon butonları için: border'ın tam daire olması ancak
   * kare bir kutu ile mümkün. Yalnızca fallback'te uygulanır, iOS 26'daki
   * native glass ölçüsüne dokunmaz.
   */
  frame?: { width?: number; height?: number };
};

function toShape(shape: GlassFallbackShape, cornerRadius: number): Shape {
  if (shape === "circle") return shapes.circle();
  if (shape === "roundedRectangle") {
    return shapes.roundedRectangle({
      cornerRadius,
      roundedCornerStyle: "continuous",
    });
  }
  return shapes.capsule();
}

/**
 * Bulanıklığın kullanılamadığı yerlerde zeminin yerini tutan düz dolgu.
 *
 * TEK MEŞRU KULLANIMI kutusu (`frame({ maxWidth, alignment })` ile) bilerek
 * butondan geniş bırakılan kapsüller: orada görünen genişliği yalnız SwiftUI
 * biliyor, RN'deki `BlurView` kutunun şeffaf kalan kısmını da boyardı.
 * Onun dışında zemin `GlassFallbackSurface`ten gelmeli.
 *
 * 0.16 iki modda da simetrik: koyuda beyaz @0.16 → ≈rgb(57,57,57), açıkta
 * siyah @0.16 → ≈rgb(216,216,216); ikisi de zeminden ~39 birim ayrılıyor.
 * Render anında ÇAĞIR — palet mutasyona uğruyor.
 */
export const glassFallbackFill = (): string => withAlpha(colors.text, 0.16);

/**
 * iOS 26 öncesindeki glass fallback'ine border (+ padding/frame) ekler; 26 ve
 * üstünde boş dizi döner — native glass kendi kenarını zaten çiziyor.
 *
 * ZEMİN BURADA DEĞİL: bulanıklığı `GlassFallbackSurface` çiziyor ve bu zinciri
 * kuran butonun Host'unu o sarmalıyor. İkisi ÇİFT — birini ekleyip diğerini
 * unutursan buton ya zeminsiz kalır ya da bulanıklık kenardan taşar.
 *
 * DİKKAT — sıra önemli: @expo/ui, modifiers dizisini SwiftUI zinciri gibi
 * baştan sona reduce ediyor (View+ModifierArray.swift). strokeBorder bir
 * .overlay olduğu için frame()/padding()'den SONRA gelmeli; aksi halde border
 * buton frame'ini değil label'ın kendi ölçüsünü takip eder.
 *
 * @example
 * <GlassFallbackSurface shape="circle" width={44} height={44}>
 *   <Host style={{ width: 44, height: 44 }}>
 *     <Button modifiers={[
 *       buttonStyle("glass"),
 *       tint(colors.text),
 *       labelStyle("iconOnly"),
 *       frame({ width: 44, height: 44 }),
 *       ...glassFallback({ shape: "circle" }),
 *     ]} />
 *   </Host>
 * </GlassFallbackSurface>
 */
export function glassFallback({
  shape = "capsule",
  cornerRadius = 8,
  borderWidth = 0.5,
  borderColor,
  backgroundColor,
  padding: pad,
  frame: box,
}: GlassFallbackOptions = {}): ModifierConfig[] {
  if (HAS_LIQUID_GLASS) return [];

  // Border tint'ten değil nötr griden türüyor: beyaz tint'te saf beyaz çerçeve
  // fazla parlak kalıyordu.
  //
  // Nötr gri MODA GÖRE seçiliyor: tek bir ton (`textDisabled`) iki tarafta da
  // fazla belirgin kalıyordu — koyuda #4B5563 zeminden kopan açık bir halka,
  // açıkta #B0B4BB beyazın üstünde fazla koyu bir çerçeve. `border` aynı nötr
  // aileden ama her iki modda bir tık daha yumuşak (koyu #3A3A3A / açık
  // #DCDCE0) ve tema anahtarıyla birlikte çevriliyor. Alfa da kalktı: ton
  // zaten moda göre doğru, saydamlık yalnızca kenarı bulanıklaştırıyordu.
  //
  // Kalınlık 0.5pt (varsayılan): zemini bulanıklık taşıdığı için kenarın işi
  // artık kabuğu ÇİZMEK değil yalnızca kapatmak. 1pt'de çerçeve butondan önce
  // okunuyordu.
  const stroke = borderColor ?? colors.border;
  // Zemin ARTIK burada değil: bulanıklık RN tarafında, `GlassFallbackSurface`
  // Host'u sarmalayarak çiziyor (gerekçesi o dosyada — @expo/ui'nin
  // `background()`i malzeme değil yalnızca hex renk alıyor). Burada kalan tek
  // dolgu yolu ÇAĞIRANIN açıkça verdiği renk.
  const fill = backgroundColor ?? null;

  const modifiers: ModifierConfig[] = [];
  if (pad) modifiers.push(padding(pad));
  if (box) modifiers.push(frame(box));
  if (fill) modifiers.push(background(fill, toShape(shape, cornerRadius)));
  modifiers.push(
    strokeBorder({
      color: stroke,
      style: { lineWidth: borderWidth },
      shape,
      cornerRadius,
    }),
  );
  return modifiers;
}

/**
 * Cam yuvarlak ikon butonlarının (sohbet başlığındaki geri/menü, profil
 * başlığındaki çan/ayarlar) ORTAK ölçüsü. Ekranlar kendi modifier zincirini
 * kuruyor ama sayılar buradan gelmeli — biri elle değiştiği gün butonlar
 * ekrandan ekrana farklı boyda kalıyor.
 *
 * Zinciri kurarken iki tuzak (ikisi de canlıda görüldü):
 *  1. Kabuğu tam daireye kilitleyen modifier `buttonBorderShape("circle")` —
 *     `containerShape` DEĞİL, o yalnızca ContainerRelativeShape'i etkiliyor.
 *     Onsuz kabuk glif'in intrinsic kutusundan türeyip kapsül oluyor.
 *  2. Dairenin görünen çapı `frame()`ten değil LABEL + controlSize padding'inden
 *     geliyor; `frame` sadece ona yetecek kutuyu ayırır. Bu yüzden glif
 *     `systemImage` prop'uyla değil, `Image` children + `frame(LABEL)` ile
 *     verilmeli: aksi halde alçak-geniş bir glif (ellipsis) yüksek-dar bir
 *     glif'ten (chevron) küçük daire üretiyor.
 *
 * Ayrıca `Image`'a `size` prop'u VERME: @expo/ui o durumda glif'e kendi
 * `font({ size })`'ını ekliyor (weight regular) ve ağırlığı eziyor. Ağırlık
 * `font()` modifier'ı ile doğrudan Image'a verilmeli.
 */
export const GLASS_ICON_BUTTON = {
  /** Host + button frame'i; kabuğa yetecek kutu. */
  size: 40,
  /** Glif'in oturduğu KARE label kutusu — çapı belirleyen asıl kol. */
  label: 17,
  /** Glif punto. */
  icon: 17,
  /** Glif ağırlığı; Image'ın kendi font modifier'ına verilir. */
  weight: "bold",
} as const;

/**
 * Berrak cam ikon butonunun dış ölçüsü — `GLASS_ICON_BUTTON.size`ın bir tık
 * üstü. Çap 40'ta yanlış değildi (eski dolgulu kabuk da 40 çiziyordu), ama
 * `clear` variant'ın dolgusu yok — yalnız kırılma ve kenar parlaması var — ve
 * daire dolgulu `regular` kardeşinin yanında gözle küçük okunuyordu. Pay o
 * kaybı geri veriyor.
 *
 * TEK SAYI: Host, `GlassFallbackSurface` ve butonun kendi frame'i de bunu
 * okumak ZORUNDA. Yalnız camın kutusunu büyütmek iOS 26'da daireyi RN
 * kutusundan taşırır (dokunma alanı 40'ta kalır, cam kenarı boşa basılır),
 * 26 altında da bulanık zemin 40'ta kalıp cam kenarıyla ayrışır.
 *
 * 40 → 44 → 48. Pay kartın payıyla (SuperLikeGlassButton > CARD_GLASS_BUMP)
 * aynı, yani uygulamadaki BÜTÜN yuvarlak cam butonlar tek çapta.
 *
 * `GLASS_ICON_BUTTON.size` yine de 40'ta duruyor ve artık hiçbir buton onu
 * doğrudan çizmiyor: yalnızca bu sabitin ve kart kabuğunun (SUPER_LIKE_GLASS_
 * SIZE) türediği ÖLÇÜ TABANI. İkisi de üstüne 8 ekliyor, yani 40'ı oynatmak
 * başlıkları ve kart şeridini (bant yüksekliği dahil, bkz. CardStickyHeader)
 * birlikte kaydırır — çapı değiştirmek istiyorsan buradaki payı oynat.
 *
 * Glif BÜYÜMÜYOR ve oran burada SINIRA GELDİ: 17 punto 48'in içinde her yanda
 * ~15.5pt cam kenar bırakıyor, glif/kabuk oranı 0.43'ten 0.35'e indi. Kabuk
 * bir daha büyütülecekse `GLASS_ICON_BUTTON.icon` da büyümeli, yoksa işaret
 * kabuğun ortasında kaybolur (aynı uyarı SUPER_LIKE_GLASS_SIZE'da).
 */
export const GLASS_ICON_CLEAR_SIZE = GLASS_ICON_BUTTON.size + 8;

/**
 * `GLASS_ICON_BUTTON`ın BERRAK (clear) hâli — butonun GLİFİNE takılan zincir.
 * Uygulamadaki yuvarlak cam ikon butonlarının TAMAMI bunu kullanıyor:
 * profildeki çan/ayarlar, Bildirimler ve Ayarlar'daki geri, sohbetteki
 * geri/menü, kayıt + giriş + şifre/e-posta akışlarının ve kırpıcının geri
 * butonu (hepsi RegisterBackButton).
 *
 * Kartın üstündeki ikili (SuperLikeGlassButton, CardActionGlassButton) BUNUN
 * DIŞINDA: onlar dolgulu cam istiyor — biri tint'e boyanan `glassProminent`,
 * diğeri fotoğrafın üstünde duruyor ve berrak camın kenarı orada kayboluyor.
 *
 * ── Neden `buttonStyle("glass")` değil ────────────────────────────────────
 * O stil yalnızca `.regular` cam üretiyor, berrağı vermiyor; tek yolu
 * `.glassEffect(.clear, in:)` (bkz. node_modules/@expo/ui/ios/Modifiers/
 * GlassEffectModifier.swift). O da bir buton KABUĞU değil ARKA PLAN çiziyor,
 * yani buton stilinin `.plain`e inmesi gerekiyor.
 *
 * ── Neden butonun kendisine değil de glife ────────────────────────────────
 * `.plain` bir butonun dokunma alanı RENDER EDİLEN etiketi kadardır. Cam +
 * 40pt kutu butonun DIŞINA (frame'in üstüne) konsaydı daire 40pt görünür ama
 * basılabilir alan glifin 17pt'lik kutusu kalırdı. Bu yüzden hem kutu hem cam
 * glifin üstünde; `contentShape` de o kutunun boşluğunu hedefe çeviriyor —
 * onsuz `frame()`in glif dışında kalan kısmı dokunuşa ölüdür.
 *
 * Buradaki `frame` `label`ı DEĞİL doğrudan dış ölçüyü kullanıyor: çap artık
 * kabuğun label + controlSize padding'inden türemiyor (GLASS_ICON_BUTTON'ın
 * 2. tuzağı bu butonlar için geçersiz), `GLASS_ICON_CLEAR_SIZE`tan geliyor.
 *
 * Geçiş sırasında çap KENDİLİĞİNDEN değişmedi — eski kabuk da 40 çiziyordu:
 * cam butonun extraLarge payı 23pt, label 17 ile toplamı 40 (aynı denklem kart
 * tarafında da tutuyor, bkz. SuperLikeGlassButton > SUPER_LIKE_GLASS_SIZE:
 * 25'lik kutu 48 veriyor). Sonradan gelen 4pt'lik pay bilinçli ve gerekçesi
 * `GLASS_ICON_CLEAR_SIZE`ın başında. Yan faydası, 26 altındaki
 * `GlassFallbackSurface` dairesiyle ölçünün artık VARSAYIMLA değil birebir
 * tutması.
 *
 * iOS 26 altında `glassEffect` no-op — zemin yine `GlassFallbackSurface` +
 * `glassFallback()` ikilisinden geliyor, o yol değişmedi.
 */
export function glassIconClearGlyph(): ModifierConfig[] {
  return [
    // Kabuk artık ondan doğmuyor ama `controlSize` DURUYOR: ortamdaki
    // `imageScale`i de o belirliyor, yani punto sabit kalsa bile silmek SF
    // Symbol'ü bir tık küçük çizdirirdi. Buradaki tek işi bu.
    controlSize("extraLarge"),
    // `size` prop'u DEĞİL font modifier'ı — bkz. GLASS_ICON_BUTTON.
    font({ size: GLASS_ICON_BUTTON.icon, weight: GLASS_ICON_BUTTON.weight }),
    frame({ width: GLASS_ICON_CLEAR_SIZE, height: GLASS_ICON_CLEAR_SIZE }),
    contentShape(shapes.circle()),
    glassEffect({
      // interactive: basış morph'u artık buton stilinden değil camdan geliyor;
      // `.plain` hiçbir görsel geri bildirim vermiyor.
      glass: { variant: "clear", interactive: true },
      shape: "circle",
    }),
  ];
}

/**
 * `glassIconClearGlyph`ın METİN karşılığı — berrak cam KAPSÜL butonun ETİKETİNE
 * (Text child'ına) takılan zincir. Buton `buttonStyle("plain")` olmalı ve
 * `label` prop'u YERİNE children kullanılmalı (bkz. RegisterBackButton: `label`
 * verildiği anda native taraf children'ı yok sayıyor).
 *
 * Aynı üç gerekçe ikon tarafındakiyle birebir:
 *  1. `buttonStyle("glass")` yalnız `.regular` cam üretiyor; berrağın tek yolu
 *     `.glassEffect(.clear, in:)` ve o bir kabuk değil ARKA PLAN çiziyor →
 *     buton stili `.plain`e inmek zorunda.
 *  2. `.plain` butonun dokunma alanı RENDER EDİLEN etiket kadar; bu yüzden hem
 *     dolgu/frame hem de cam ETİKETİN üstünde, `contentShape` ile de kapsülün
 *     tamamı hedefe çevriliyor.
 *  3. iOS 26 altında `glassEffect` sessizce no-op → kenar + zemin
 *     `glassFallback`ten geliyor. Zemin BURADA düz dolgu (`glassFallbackFill`),
 *     `GlassFallbackSurface`in bulanıklığı DEĞİL: kutu bilerek butondan geniş
 *     bırakılıyor (çağıranın `frame({ maxWidth, alignment })`i) ve görünen
 *     kapsülün genişliğini yalnız SwiftUI biliyor — RN'deki BlurView kutunun
 *     şeffaf kalan kısmını da boyardı.
 *
 * Sıra: padding → frame → (cam) → glassFallback. `strokeBorder` bir .overlay
 * olduğu için en sonda; öncesine konsa etiketin kendi ölçüsünü sarardı.
 */
export function glassTextClearCapsule({
  height,
  paddingHorizontal = 18,
  fontSize = 13,
  color = colors.text,
}: {
  /** Kapsülün SABİT yüksekliği — çağıranın Host'uyla aynı sayı olmalı. */
  height: number;
  paddingHorizontal?: number;
  fontSize?: number;
  color?: string;
}): ModifierConfig[] {
  return [
    font({ size: fontSize, weight: "semibold" }),
    // `tint` DEĞİL: `.plain` butonun tint'i Text child'ının rengini vermiyor.
    foregroundStyle(color),
    // Etiket ideal genişliğinde kalsın — çağıranın maxWidth kutusu onu
    // kısaltmasın (kutu bilerek kapsülden geniş).
    fixedSize({ horizontal: true }),
    padding({ horizontal: paddingHorizontal }),
    frame({ height }),
    contentShape(shapes.capsule()),
    glassEffect({
      glass: { variant: "clear", interactive: true },
      shape: "capsule",
    }),
    // 26+'da boş dizi. Padding TEKRAR verilmiyor: yukarıdaki `padding` her
    // sürümde uygulanıyor, fallback'in kendi padding'i çift boşluk yapardı.
    ...glassFallback({
      shape: "capsule",
      backgroundColor: glassFallbackFill(),
    }),
  ];
}
