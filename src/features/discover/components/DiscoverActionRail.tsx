import { memo } from "react";
import { StyleSheet, View } from "react-native";
import Animated, {
  useAnimatedStyle,
  type SharedValue,
} from "react-native-reanimated";
import { useTranslation } from "react-i18next";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import CardChromeGlassButton from "@/features/discover/components/CardChromeGlassButton";
import CardMenuGlassButton from "@/features/discover/components/CardMenuGlassButton";
import FireGlassButton from "@/features/discover/components/FireGlassButton";
import { DISCOVER_GLASS_BUTTON_SIZE } from "@/features/discover/components/discoverHeaderMetrics";
import {
  COVER_ACTION_GAP,
  COVER_ACTION_RIGHT,
  COVER_ACTION_SIZE,
  NoteBox,
} from "@/features/discover/components/SwipeCard";
import {
  DEFAULT_APP_MODE,
  modeFireNameKey,
  modeFireTint,
  type AppMode,
} from "@/features/discover/modeTheme";
import { Check, X } from "@/shared/icons";
import {
  discoverRailBottom,
  discoverRailLift,
} from "@/shared/services/uiBus";

/** Kart bu kadar yana gidince (px) kolon normal yerine varmış oluyor. */
const RAIL_SETTLE_DRAG = 85;

type Props = {
  /** Kartın yatay sürükleme payı; yeni kart en üstten başladığı için kolon inecek. */
  dragX: SharedValue<number>;
  mode?: AppMode;
  onLike: () => void;
  onPass: () => void;
  onFire: () => void;
  onNote?: () => void;
  onMenu: () => void;
};

/**
 * Keşif kapağının sağındaki cam buton kolonu.
 *
 * Kartın DIŞINDA, ekran katında duruyor: swipe kartı `translateX` + `rotate` ile
 * taşıyor ve cam, atasında kimliksel olmayan bir transform görünce efektini
 * çizmiyor. Kolon kartın kardeşi olunca kart altından geçiyor, cam hiç bozulmuyor
 * ve kart değişiminde SwiftUI host'ları yeniden kurulmuyor.
 *
 * Konumu üst karttan iki kanalla geliyor (bkz. SwipeCard): `discoverRailBottom`
 * ortak nokta satırının boyuna göre tabanı, `discoverRailLift` kaydırmadaki
 * yukarı payı veriyor.
 *
 * KIRPMA: kolon kaydırmada kapakla birlikte yukarı gidiyor. Kartın şeridi artık
 * kolonun altında kaldığı için üst butonların hizasında kırpılıyor.
 */
function DiscoverActionRail({
  dragX,
  mode,
  onLike,
  onPass,
  onFire,
  onNote,
  onMenu,
}: Props) {
  const { t } = useTranslation();
  const insets = useSafeAreaInsets();

  const columnStyle = useAnimatedStyle(() => {
    const settle = Math.min(1, Math.abs(dragX.value) / RAIL_SETTLE_DRAG);
    return {
      bottom: discoverRailBottom.value,
      transform: [{ translateY: -discoverRailLift.value * (1 - settle) }],
    };
  });

  return (
    <View
      pointerEvents="box-none"
      style={[
        StyleSheet.absoluteFill,
        {
          top: insets.top + DISCOVER_GLASS_BUTTON_SIZE,
          overflow: "hidden",
          zIndex: 55,
        },
      ]}
    >
      <Animated.View
        pointerEvents="box-none"
        style={[
          {
            position: "absolute",
            right: COVER_ACTION_RIGHT,
            alignItems: "center",
            gap: COVER_ACTION_GAP,
          },
          columnStyle,
        ]}
      >
        <CardChromeGlassButton
          testID="discover-btn-like"
          onPress={onLike}
          label={t("likes.likeButton")}
          systemName="checkmark"
          fallback={Check}
          size={COVER_ACTION_SIZE}
          onMedia
          surfaceTint={modeFireTint(mode ?? DEFAULT_APP_MODE)}
        />
        <CardChromeGlassButton
          testID="discover-btn-pass"
          onPress={onPass}
          label={t("likes.passButton")}
          systemName="xmark"
          fallback={X}
          size={COVER_ACTION_SIZE}
          onMedia
        />
        <FireGlassButton
          testID="discover-btn-fire"
          onPress={onFire}
          label={t(modeFireNameKey(mode))}
          mode={mode}
          variant="clear"
          size={COVER_ACTION_SIZE}
        />
        {!!onNote && <NoteBox onPress={onNote} onPhoto />}
        <CardMenuGlassButton
          onPress={onMenu}
          label={t("common.menu")}
          size={COVER_ACTION_SIZE}
          onMedia
        />
      </Animated.View>
    </View>
  );
}

export default memo(DiscoverActionRail);
