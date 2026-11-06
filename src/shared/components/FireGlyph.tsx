import type { StyleProp, ViewStyle } from "react-native";
import Svg, { Path } from "react-native-svg";
import {
  DEFAULT_APP_MODE,
  modeFireGlyph,
  type AppMode,
} from "@/features/discover/modeTheme";

/**
 * Fire ikonu: ALEV (bkz. icons/FlameGlyph) — SF `heart.fill` / lucide
 * `Heart` değil, app-icon'un kalbi de değil.
 *
 * MODLA ŞEKİL DEĞİŞTİRİYOR (istek, 2026-11-06): Flört'te alev, Arkadaş'ta
 * lucide `sparkle` yıldızı (bkz. modeTheme > modeFireGlyph · icons/
 * SparkleGlyph). Ürünün görünen adı zaten modla dönüyordu
 * (`modeFireNameKey` → "Fire" / "Spark"); "Spark" yazan bir satırın yanında
 * alev çizmek adı yalanlıyordu. Mod verilmezse Dating — mod bilmeyen eski
 * çağıranlar bozulmasın (`fireTint`in aynı kuralı).
 *
 * ⚠️ ANİMASYON BU GLİFİ KULLANMIYOR ve bu kasıtlı: alev dalgası
 * (FireFlameCanvas) ile kartta yanma (FireBurnCanvas) FLAME_SWEEP_PATH
 * üstünde, her iki modda ALEV. Yani Arkadaş'ta duran ikon yıldız, kutlama
 * alev — değiştirmek istenirse oranın geometrisi (flameWavePath · flameBurn)
 * baştan türetilmeli.
 *
 * KALPTEN ALEVE GEÇİLDİ (istek): ürünün Fire kutlaması zaten ekranı
 * süpüren bir alev dalgası (bkz. FireFlameCanvas) ve keşif kartında ikon
 * çekme sırasında YANIYOR (bkz. flameBurn / FireBurnCanvas). Kalp o
 * hareketin içinde bir yabancıydı: titreşen bir kalp ile alevden bir kutlama
 * aynı jestin iki ucunda duruyordu.
 *
 * ÖLÇÜ DEĞİŞMEDİ, o yüzden çağıran tarafların `size`'ı oynamadı: iki glyph de
 * aynı 24'lük grid'e, UZUN KENARI 20 olacak şekilde bakelendi (kalp 20×16.95
 * yatay, alev 15.04×20 dikey). Yani aynı `size`ta optik ağırlıkları eşit, yalnız
 * yönleri farklı.
 *
 * Renk kararı çağıranın: `color` düz dolgu, `stroke`/`strokeWidth` ince kontur.
 * Gradyan dolgu isteyen yerler bunu MaskedView'a maskeElement olarak veriyor
 * (`<FireGlyph color="black" />`) — lucide'de olduğu gibi.
 *
 * GRADYANI KENDİNDEN OLAN BİR YAKINI VAR: `PremiumFlame` ALEVİ tek `Svg`
 * içinde `<Defs>` gradyanıyla çiziyor (zemini kendinden belli yerler için).
 * Fire ürününü işaretleyen her yer BUNU çağırsın — anlamları ayrı,
 * `PremiumFlame` lit plus'ın işareti.
 *
 * ⚠️ ARTIK "AYNI ŞEKİL" DEĞİLLER: `PremiumFlame` MODSUZ ve her zaman alev
 * (premium ürünü mod ekseninde bölünmüyor), bu glif Arkadaş'ta yıldıza
 * dönüyor. Yani Arkadaş modunda premium rozeti ile Spark işareti BİLEREK
 * farklı şekiller.
 *
 * Not ürününün glyph'i (NoteGlyph) hâlâ app-icon'dan sökülen konuşma balonu:
 * iki ürün artık aynı aileden DEĞİL ve bu kasıtlı — not "yorumlu beğeni",
 * Fire ise ürünün ateş hattı.
 */
export default function FireGlyph({
  size = 24,
  color,
  stroke,
  strokeWidth,
  style,
  mode = DEFAULT_APP_MODE,
}: {
  size?: number;
  color?: string;
  stroke?: string;
  strokeWidth?: number;
  style?: StyleProp<ViewStyle>;
  /** Uygulama modu — Flört alev, Arkadaş yıldız. Verilmezse Dating. */
  mode?: AppMode;
}) {
  const { path, viewBox } = modeFireGlyph(mode);
  return (
    <Svg width={size} height={size} viewBox={viewBox} style={style}>
      <Path
        d={path}
        fill={color ?? "none"}
        stroke={stroke}
        strokeWidth={strokeWidth}
      />
    </Svg>
  );
}
