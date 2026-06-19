import { View, ActivityIndicator } from "react-native";
import { BottomSheetScrollView } from "@gorhom/bottom-sheet";
import SwipeCard from "./SwipeCard";
import AppBottomSheet from "./AppBottomSheet";

export default function PreviewModal({ visible, onClose, profile }) {
  return (
    <AppBottomSheet
      visible={visible}
      onClose={onClose}
      snapPoints={["90%"]}
      handleComponent={null}
      backgroundStyle={{
        borderTopLeftRadius: 42,
        borderTopRightRadius: 42,
        borderCurve: "continuous",
        overflow: "hidden",
        borderRadius: 42,
      }}
    >
      <BottomSheetScrollView
        style={{ flex: 1 }}
        contentContainerStyle={{ flexGrow: 1 }}
        showsVerticalScrollIndicator={false}
        nestedScrollEnabled={true}
      >
        <View style={{ flex: 1 }}>
          {profile ? (
            <SwipeCard profile={profile} hideActions previewMode expanded />
          ) : (
            <View
              style={{
                flex: 1,
                alignItems: "center",
                justifyContent: "center",
              }}
            >
              <ActivityIndicator color="#fff" />
            </View>
          )}
        </View>
      </BottomSheetScrollView>
    </AppBottomSheet>
  );
}
