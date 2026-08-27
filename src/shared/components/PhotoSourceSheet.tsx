import { useCallback, useRef } from "react";
import { Text, View } from "react-native";
import * as Haptics from "expo-haptics";
import { useTranslation } from "react-i18next";
import { Camera, ChevronRight, Images } from "lucide-react-native";

import { BottomSheetView } from "@gorhom/bottom-sheet";

import AppBottomSheet from "@/shared/components/AppBottomSheet";
import AnimatedPressable from "@/shared/components/AnimatedPressable";
import SFIcon, { type SFSymbol } from "@/shared/components/SFIcon";
import { colors, ink } from "@/shared/theme/colors";

/**
 * Fotoğraf kaynağı seçimi — kayıt akışı ve profil düzenleme ortak kullanır.
 * Eskiden iki yerde de `Alert.alert` üç butonluydu.
 *
 * DİKKAT — aksiyon `onPress`'te DEĞİL, sheet KAPANDIKTAN sonra çalışır:
 * gorhom sheet kapanma animasyonundayken PHPickerViewController sunmak iOS'ta
 * "already presenting" no-op'una düşüyor ve picker hiç açılmıyor. Seçim bir
 * ref'e yazılıp `onClose` içinde tetikleniyor.
 */
export default function PhotoSourceSheet({
  visible,
  onClose,
  onCamera,
  onGallery,
  stackBehavior,
}: {
  visible: boolean;
  onClose: () => void;
  onCamera: () => void;
  onGallery: () => void;
  stackBehavior?: "push" | "switch" | "replace";
}) {
  const { t } = useTranslation();
  const pendingRef = useRef<null | "camera" | "gallery">(null);

  const choose = useCallback(
    (source: "camera" | "gallery") => {
      Haptics.selectionAsync().catch(() => {});
      pendingRef.current = source;
      onClose();
    },
    [onClose],
  );

  const handleClose = useCallback(() => {
    const pending = pendingRef.current;
    pendingRef.current = null;
    onClose();
    if (pending === "camera") onCamera();
    else if (pending === "gallery") onGallery();
  }, [onClose, onCamera, onGallery]);

  return (
    <AppBottomSheet
      visible={visible}
      onClose={handleClose}
      // snapPoints YOK: tek detent ölçülen içerik yüksekliği. İçerik sabit ve
      // kısa (başlık + iki satır), sabit bir yüzde altta boşluk bırakıyordu.
      // Ölçüm `BottomSheetView`den geliyor — düz `View` yüksekliği bildirmez.
      enableDynamicSizing
      backdrop="blur"
      stackBehavior={stackBehavior}
      handleIndicatorStyle={{ backgroundColor: ink(0.25) }}
    >
      <BottomSheetView style={{ paddingHorizontal: 20, paddingTop: 8, paddingBottom: 32 }}>
        <Text
          style={{
            color: colors.text,
            fontSize: 22,
            fontWeight: "700",
            // Ufak yatay pay: satırların METNİ kendi iç padding'iyle içeride
            // başlıyor, başlık bunun bir kısmını yakalasın.
            paddingHorizontal: 6,
            marginBottom: 20,
          }}
        >
          {t("profile.photos.addTitle")}
        </Text>

        <SourceRow
          icon="camera.fill"
          fallback={Camera}
          label={t("profile.photos.sourceCamera")}
          onPress={() => choose("camera")}
        />
        <View style={{ height: 12 }} />
        <SourceRow
          icon="photo.on.rectangle.angled"
          fallback={Images}
          label={t("profile.photos.sourceGallery")}
          onPress={() => choose("gallery")}
        />
      </BottomSheetView>
    </AppBottomSheet>
  );
}

function SourceRow({
  icon,
  fallback,
  label,
  onPress,
}: {
  icon: SFSymbol;
  fallback: typeof Camera;
  label: string;
  onPress: () => void;
}) {
  return (
    <AnimatedPressable
      onPress={onPress}
      pressBounciness={0}
      accessibilityRole="button"
      accessibilityLabel={label}
      style={{
        flexDirection: "row",
        alignItems: "center",
        gap: 14,
        paddingVertical: 16,
        paddingHorizontal: 20,
        borderRadius: 999,
        borderCurve: "continuous",
        // Ters yüzey dolgusu: açık modda neredeyse siyah, koyu modda beyaz.
        // Üstündeki yazı/ikon `onInverseSurface` — `colors.text` DEĞİL, o açık
        // modda siyah kalıp siyah zemine düşerdi.
        backgroundColor: colors.inverseSurface,
      }}
    >
      <View
        pointerEvents="none"
        style={{ width: 40, height: 40, alignItems: "center", justifyContent: "center" }}
      >
        <SFIcon
          name={icon}
          fallback={fallback}
          size={28}
          color={colors.onInverseSurface}
          weight="semibold"
        />
      </View>
      <View pointerEvents="none" style={{ flex: 1 }}>
        <Text style={{ color: colors.onInverseSurface, fontSize: 19, fontWeight: "600" }}>
          {label}
        </Text>
      </View>
      <View pointerEvents="none">
        <SFIcon
          name="chevron.right"
          fallback={ChevronRight}
          size={15}
          color={colors.onInverseSurface}
          weight="semibold"
        />
      </View>
    </AnimatedPressable>
  );
}
