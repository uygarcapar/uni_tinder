import { ReactNode } from 'react';
import { View, Pressable, StyleSheet } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { colors, isLight, withAlpha } from '../../theme/colors';

/**
 * Toast kabuğu — TEK KAYNAK (Info / Message / MissedMatch / Like).
 *
 * İKİ KATMAN, bilerek: gölge dış katmanda, kırpma iç katmanda. Aynı View'da
 * `overflow: 'hidden'` iOS'ta masksToBounds açtığı için gölgeyi de kırpıyor —
 * kart "yapışık"/düz görünüyordu. Dış katmanda `overflow` YOK, iç katmanda
 * gölge YOK; ikisini birleştirme.
 *
 * Açık modda ayrım daha derin/yayvan gölgeden ve dolgu farkından geliyor: kart
 * zemini uygulama zeminiyle (beyaz) neredeyse aynı olduğu için dolgu `bg`
 * değil `surface` — kırık beyaz. Kenarlık bilerek çok silik.
 *
 * Değerler render anında okunuyor: palet tema değişiminde MUTASYONA uğruyor
 * (bkz. shared/theme/colors.ts), modül seviyesinde sabitlenemez.
 */

type Props = {
  /** Basılabilir toast'lar için — verilmezse kabuk dokunulamaz olur. */
  onPress?: () => void;
  radius?: number;
  children: ReactNode;
};

export default function ToastShell({ onPress, radius = 24, children }: Props) {
  const insets = useSafeAreaInsets();
  const light = isLight();

  const shadow = {
    marginTop: insets.top,
    marginHorizontal: 12,
    borderRadius: radius,
    shadowColor: colors.shadow,
    shadowOpacity: light ? 0.16 : 0.35,
    shadowRadius: light ? 20 : 12,
    shadowOffset: { width: 0, height: light ? 8 : 4 },
    elevation: 8,
  };

  const clip = {
    borderRadius: radius,
    overflow: 'hidden' as const,
    borderWidth: StyleSheet.hairlineWidth,
    // Kenarlık yalnızca kenarı "kapatıyor", çerçeve çizmiyor — ayrımın asıl
    // yükünü dolgu farkı ve gölge taşıyor. hairlineSoft ikisinde de doğru
    // yönde: açıkta siyah-üstü %6, koyuda beyaz-üstü %8.
    borderColor: colors.hairlineSoft,
  };

  const inner = <View style={clip}>{children}</View>;

  return onPress ? (
    <Pressable onPress={onPress} style={shadow}>
      {inner}
    </Pressable>
  ) : (
    <View style={shadow}>{inner}</View>
  );
}

/** Cam dolgu — blur'un üstündeki renk katmanı. */
export function toastFill() {
  return isLight() ? withAlpha(colors.surface, 0.78) : withAlpha(colors.bg, 0.62);
}

/** Cam yoğunluğu — arkaplanın sızmaması için tüm toast'larda aynı. */
export const TOAST_BLUR_INTENSITY = 100;
