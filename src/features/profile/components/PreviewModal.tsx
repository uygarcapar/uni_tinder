import { useCallback } from "react";
import { View, ActivityIndicator } from "react-native";
import {
  BottomSheetScrollView,
  BottomSheetBackdrop,
} from "@gorhom/bottom-sheet";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import SwipeCard from "@/features/discover/components/SwipeCard";
import AppBottomSheet from "@/shared/components/AppBottomSheet";
import { colors } from "../../../shared/theme/colors";

export default function PreviewModal({ visible, onClose, profile }: any) {
  const insets = useSafeAreaInsets();

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
    >
      <BottomSheetScrollView
        style={{ flex: 1, backgroundColor: colors.bg }}
        contentContainerStyle={{ paddingBottom: 0 }}
        showsVerticalScrollIndicator={false}
        nestedScrollEnabled
      >
        {profile ? (
          <SwipeCard profile={profile} hideActions previewMode expanded />
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
      </BottomSheetScrollView>
    </AppBottomSheet>
  );
}
