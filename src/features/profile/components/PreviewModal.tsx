import { useCallback } from "react";
import { View, ActivityIndicator } from "react-native";
import { BottomSheetBackdrop } from "@gorhom/bottom-sheet";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { useSharedValue } from "react-native-reanimated";
import SwipeCard from "@/features/discover/components/SwipeCard";
import CardSheetScrollView from "@/features/discover/components/CardSheetScrollView";
import AppBottomSheet from "@/shared/components/AppBottomSheet";
import { colors } from "../../../shared/theme/colors";

// onReport/onBlock: kartın altındaki kırmızı moderasyon satırları. VERİLMEZSE
// çizilmez — ProfileScreen kendi profilini önizlediği için oradan geçilmiyor.
export default function PreviewModal({
  visible,
  onClose,
  profile,
  onReport,
  onBlock,
}: any) {
  const insets = useSafeAreaInsets();
  // Top'a çarpma zoom'u — scroll CardSheetScrollView'da, foto katmanı SwipeCard'da.
  const photoZoom = useSharedValue(0);

  const renderBackdrop = useCallback(
    (props: any) => (
      <BottomSheetBackdrop
        {...props}
        appearsOnIndex={0}
        disappearsOnIndex={-1}
        opacity={0.5}
      />
    ),
    [],
  );

  return (
    <AppBottomSheet
      visible={visible}
      onClose={onClose}
      snapPoints={["100%"]}
      topInset={insets.top}
      handleComponent={null}
      backdropComponent={renderBackdrop}
      // Sheet zemini şeffaf: kartın kendi (daha yuvarlak) köşeleri ile sheet'in
      // 36'lık clip'i arasında kalan hilal alanda beyaz zemin görünüyordu.
      // Şeffaf olunca orası kesilmiş gibi durur — arkadaki backdrop görünür,
      // kartın yuvarlak köşesi korunur.
      backgroundStyle={{ backgroundColor: "transparent" }}
    >
      <CardSheetScrollView
        style={{ flex: 1, backgroundColor: "transparent" }}
        contentContainerStyle={{ paddingBottom: 0 }}
        zoomImpact={photoZoom}
      >
        {profile ? (
          // hideChevron: kart zaten `expanded` açılıyor ve `onExpandPress`
          // yok — ok sadece dekoratif kalıyordu. LikerSwipeModal ile aynı.
          // expanded={false}: scroll'u saran CardSheetScrollView yapar, kartın
          // kendi scroll'u kapalı (bkz. CardSheetScrollView).
          <SwipeCard
            profile={profile}
            hideActions
            previewMode
            expanded={false}
            hideChevron
            zoomImpact={photoZoom}
            onReport={onReport}
            onBlock={onBlock}
          />
        ) : (
          <View
            style={{
              flex: 1,
              alignItems: "center",
              justifyContent: "center",
              minHeight: 400,
            }}
          >
            <ActivityIndicator color={colors.text} />
          </View>
        )}
      </CardSheetScrollView>
    </AppBottomSheet>
  );
}
