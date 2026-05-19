import { useCallback, useEffect, useRef } from "react";
import { View, Text, TouchableOpacity, ActivityIndicator } from "react-native";
import { X } from "lucide-react-native";
import {
  BottomSheetModal,
  BottomSheetScrollView,
  BottomSheetBackdrop,
} from "@gorhom/bottom-sheet";
import SwipeCard from "./SwipeCard";

export default function PreviewModal({ visible, onClose, profile }) {
  const bottomSheetRef = useRef(null);

  useEffect(() => {
    if (visible) {
      bottomSheetRef.current?.present();
    } else {
      bottomSheetRef.current?.dismiss();
    }
  }, [visible]);

  const renderBackdrop = useCallback(
    (props) => (
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
    <BottomSheetModal
      ref={bottomSheetRef}
      snapPoints={["90%"]}
      enablePanDownToClose={true}
      enableOverDrag={false}
      onDismiss={onClose}
      backdropComponent={renderBackdrop}
      backgroundStyle={{
        backgroundColor: "#121212",
        borderTopLeftRadius: 42,
        borderTopRightRadius: 42,
        borderCurve: "continuous",
        overflow: "hidden",
        borderRadius: 42,
      }}
      handleComponent={null}
    >
      <BottomSheetScrollView
        style={{ flex: 1 }}
        contentContainerStyle={{ flexGrow: 1 }}
        showsVerticalScrollIndicator={false}
        nestedScrollEnabled={true}
      >
        <View style={{ flex: 1 }}>
          {profile ? (
            <SwipeCard
              profile={profile}
              hideActions
              previewMode
              expanded
            />
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
    </BottomSheetModal>
  );
}
