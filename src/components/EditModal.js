import React, { useCallback } from "react";
import { View, Text, TouchableOpacity, ActivityIndicator } from "react-native";
import {
  BottomSheetScrollView,
  BottomSheetBackdrop,
} from "@gorhom/bottom-sheet";
import { X } from "lucide-react-native";
import AppBottomSheet from "./AppBottomSheet";

export default function EditModal({
  visible,
  title,
  onClose,
  onSave,
  saving,
  children,
}) {
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
    <AppBottomSheet
      visible={visible}
      onClose={onClose}
      snapPoints={["90%"]}
      backdropComponent={renderBackdrop}
    >
      <View
        style={{
          flexDirection: "row",
          alignItems: "center",
          paddingHorizontal: 20,
          paddingTop: 32,
          paddingBottom: 12,
          backgroundColor: "#121212",
        }}
      >
        <TouchableOpacity
          onPress={onClose}
          activeOpacity={0.7}
          style={{ width: 60 }}
        >
          <X size={22} color="#9CA3AF" strokeWidth={2} pointerEvents="none" />
        </TouchableOpacity>
        <Text
          style={{
            flex: 1,
            color: "#fff",
            fontSize: 15,
            fontWeight: "700",
            textAlign: "center",
          }}
        >
          {title}
        </Text>
        <TouchableOpacity
          onPress={onSave}
          disabled={saving}
          activeOpacity={0.7}
          style={{ alignItems: "flex-end" }}
        >
          {saving ? (
            <ActivityIndicator size={18} color="#fff" />
          ) : (
            <View
              style={{
                borderRadius: 999,
                borderCurve: "continuous",
                overflow: "hidden",
              }}
              className="flex row bg-[#1E1E1E] self-start justify-center text-center items-center border-[0.5px] border-white/10 px-3 py-3 gap-2 rounded-full"
            >
              <Text style={{ color: "#fff", fontWeight: "700", fontSize: 13 }}>
                Kaydet
              </Text>
            </View>
          )}
        </TouchableOpacity>
      </View>

      <BottomSheetScrollView
        style={{ flex: 1, backgroundColor: "#121212" }}
        contentContainerStyle={{ paddingHorizontal: 20, paddingBottom: 40 }}
        showsVerticalScrollIndicator={false}
        nestedScrollEnabled={true}
      >
        {children}
      </BottomSheetScrollView>
    </AppBottomSheet>
  );
}
