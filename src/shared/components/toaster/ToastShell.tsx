import { ReactNode } from 'react';
import { View, Pressable, StyleSheet, type ViewStyle } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { BlurView } from 'expo-blur';
import { GlassView } from 'expo-glass-effect';
import { colors, isLight, withAlpha } from '../../theme/colors';
import { plainBlurTint } from '../../theme/blur';
import { glassColorScheme, hasLiquidGlassSurface } from '../../theme/glass';

/**
 * Toast kabuğu — TEK KAYNAK (Info / Message / MissedMatch / Like).
 *
 * Dört toast da yalnızca İÇERİĞİNİ veriyor: zemin, köşe, kenar boşluğu ve gölge
 * burada. Kabuk iki yoldan biriyle çiziliyor:
 *
 *   • iOS 26+ → native liquid glass (`GlassView`). Arkasındaki içeriği kırıyor,
 *     kendi kenar parıltısını çiziyor.
 *   • Diğer her yerde → `BlurView` + `toastFill()` dolgusu; camın taklidi.
 *
 * CAM YOLUNDA DOLGU/KENARLIK YOK, bilerek: opak bir katman ya da hairline
 * çerçeve camın kırılmasını öldürüyor ve kart yine düz bir dikdörtgene dönüyor.
 * Zeminden ayrımı camın kendi kenarı + hafif gölge taşıyor. Ekleyeceğin her
 * "biraz daha kontrast" katmanı efektin kendisini siler — önce tint'i (bkz.
 * toastGlassTint) dene.
 *
 * İKİ KATMAN, bilerek: gölge dış katmanda, kırpma iç katmanda. Aynı View'da
 * `overflow: 'hidden'` iOS'ta masksToBounds açtığı için gölgeyi de kırpıyor —
 * kart "yapışık"/düz görünüyordu. Dış katmanda `overflow` YOK, iç katmanda
 * gölge YOK; ikisini birleştirme. (Cam yolunda kırpmaya da gerek yok: köşeyi
 * native `cornerConfiguration` çiziyor ve içerik zaten padding'in içinde.)
 *
 * Blur yolunda açık modda ayrım daha derin/yayvan gölgeden ve dolgu farkından
 * geliyor: kart zemini uygulama zeminiyle (beyaz) neredeyse aynı olduğu için
 * dolgu `bg` değil `surface` — kırık beyaz. Kenarlık bilerek çok silik.
 *
 * Değerler render anında okunuyor: palet tema değişiminde MUTASYONA uğruyor
 * (bkz. shared/theme/colors.ts), modül seviyesinde sabitlenemez.
 */

type Props = {
  /** Basılabilir toast'lar için — verilmezse kabuk dokunulamaz olur. */
  onPress?: () => void;
  radius?: number;
  /** İçeriğin kenar boşluğu — toast'lar farklı yoğunlukta. */
  paddingVertical: number;
  paddingHorizontal: number;
  children: ReactNode;
};

export default function ToastShell({
  onPress,
  radius = 24,
  paddingVertical,
  paddingHorizontal,
  children,
}: Props) {
  const insets = useSafeAreaInsets();
  const light = isLight();
  const glass = hasLiquidGlassSurface();

  const shadow: ViewStyle = {
    marginTop: insets.top,
    marginHorizontal: 12,
    borderRadius: radius,
    borderCurve: 'continuous',
    shadowColor: colors.shadow,
    // Cam kendi kenarını çizdiği için gölge orada yalnız kartı zeminden
    // koparacak kadar: blur yolundaki değerler camın altında kirli bir hale
    // bırakıyor.
    shadowOpacity: glass ? (light ? 0.1 : 0.2) : light ? 0.16 : 0.35,
    shadowRadius: glass ? 16 : light ? 20 : 12,
    shadowOffset: { width: 0, height: light ? 8 : 4 },
    elevation: 8,
  };

  const content: ViewStyle = { paddingVertical, paddingHorizontal };

  const surface = glass ? (
    <GlassView
      glassEffectStyle="regular"
      tintColor={toastGlassTint()}
      colorScheme={glassColorScheme()}
      style={{ borderRadius: radius, borderCurve: 'continuous', ...content }}
    >
      {children}
    </GlassView>
  ) : (
    <View
      style={{
        borderRadius: radius,
        borderCurve: 'continuous',
        overflow: 'hidden',
        borderWidth: StyleSheet.hairlineWidth,
        // Kenarlık yalnızca kenarı "kapatıyor", çerçeve çizmiyor — ayrımın asıl
        // yükünü dolgu farkı ve gölge taşıyor. hairlineSoft ikisinde de doğru
        // yönde: açıkta siyah-üstü %6, koyuda beyaz-üstü %8.
        borderColor: colors.hairlineSoft,
      }}
    >
      <BlurView
        intensity={TOAST_BLUR_INTENSITY}
        tint={plainBlurTint()}
        style={{ backgroundColor: toastFill(), ...content }}
      >
        {children}
      </BlurView>
    </View>
  );

  return onPress ? (
    <Pressable onPress={onPress} style={shadow}>
      {surface}
    </Pressable>
  ) : (
    <View style={shadow}>{surface}</View>
  );
}

/** Cam dolgu — blur'un üstündeki renk katmanı. Yalnız fallback yolunda. */
function toastFill() {
  return isLight() ? withAlpha(colors.surface, 0.78) : withAlpha(colors.bg, 0.62);
}

/**
 * Native camın tint'i — dolgu DEĞİL, camın kendi rengine verilen hafif eğim.
 *
 * Sıfır tint'te toast Keşfet'teki parlak fotoğrafların üstünde yıkanıyor ve
 * yazı okunmuyor; yüksek alfada ise cam opak bir karta dönüp efekti siliyor.
 * Ayarlanabilir tek yer burası — kontrast sorununu dolgu/kenarlık ekleyerek
 * değil bu alfayı oynatarak çöz.
 */
function toastGlassTint() {
  return isLight() ? withAlpha(colors.surface, 0.2) : withAlpha(colors.bg, 0.2);
}

/** Cam yoğunluğu — arkaplanın sızmaması için tüm toast'larda aynı. */
const TOAST_BLUR_INTENSITY = 100;
