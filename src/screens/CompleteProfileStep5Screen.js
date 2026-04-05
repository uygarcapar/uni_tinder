import React, { useState, useRef, useMemo, useCallback } from "react";
import { View, Text, TouchableOpacity, Keyboard } from "react-native";
import { useDispatch, useSelector } from "react-redux";
import { updateMultipleFields } from "../store/slices/profileSlice";
import { Picker } from "@react-native-picker/picker";
import {
  BottomSheetModal,
  BottomSheetView,
  BottomSheetBackdrop,
} from "@gorhom/bottom-sheet";
import { BlurView } from "expo-blur";
import { KeyboardStickyView } from "react-native-keyboard-controller";
import { LinearGradient } from "expo-linear-gradient";

const InterestedInPickerContent = ({ initialValue, onConfirm, onCancel }) => {
  const isValidValue =
    initialValue !== null && initialValue !== undefined && initialValue !== "";

  const [localValue, setLocalValue] = useState(isValidValue ? initialValue : 0);

  return (
    <BottomSheetView className="flex-1 bg-[#121212] px-4 pb-8">
      <View className="flex-row justify-between items-center py-4 px-4">
        <TouchableOpacity onPress={onCancel}>
          <Text className="text-gray-400 text-xl">İptal</Text>
        </TouchableOpacity>
        <TouchableOpacity onPress={() => onConfirm(localValue)}>
          <Text className="text-white text-xl font-bold">Bitti</Text>
        </TouchableOpacity>
      </View>
      <Picker
        selectedValue={localValue}
        onValueChange={(value) => setLocalValue(value)}
        style={{ height: 200, color: "#FFFFFF" }}
        itemStyle={{ color: "#FFFFFF" }}
      >
        <Picker.Item label="Erkek" value={0} color="#FFFFFF" />
        <Picker.Item label="Kadın" value={1} color="#FFFFFF" />
        <Picker.Item label="Diğer" value={2} color="#FFFFFF" />
      </Picker>
    </BottomSheetView>
  );
};

export default function CompleteProfileStep5Screen({ navigation }) {
  const dispatch = useDispatch();
  const profile = useSelector((state) => state.profile || {});

  const [interestedIn, setInterestedIn] = useState(profile.interestedIn || "");

  const interestedInSheetRef = useRef(null);
  const snapPoints = useMemo(() => ["35%"], []);

  const handleOpenInterestedInModal = useCallback(() => {
    Keyboard.dismiss();
    setTimeout(() => {
      interestedInSheetRef.current?.present();
    }, 100);
  }, []);

  const confirmInterestedInSelection = (value) => {
    setInterestedIn(value);
    interestedInSheetRef.current?.dismiss();
  };

  const cancelInterestedInSelection = () => {
    interestedInSheetRef.current?.dismiss();
  };

  const renderBackdrop = useCallback(
    (props) => (
      <BottomSheetBackdrop
        {...props}
        disappearsOnIndex={-1}
        appearsOnIndex={0}
        opacity={1}
        pressBehavior="close"
        onPress={() => {
          interestedInSheetRef.current?.dismiss();
        }}
        style={[props.style, { backgroundColor: "transparent" }]}
      >
        <BlurView
          style={{
            position: "absolute",
            top: 0,
            left: 0,
            right: 0,
            bottom: 0,
          }}
          intensity={30}
          tint="dark"
        />
      </BottomSheetBackdrop>
    ),
    [],
  );

  const getInterestedInLabel = () => {
    switch (interestedIn) {
      case 0: // Male
        return "Erkek";
      case 1: // Female
        return "Kadın";
      case 2: // Other
        return "Diğer";
      default:
        return "Seçiniz";
    }
  };

  const handleNext = () => {
    dispatch(
      updateMultipleFields({
        interestedIn:
          interestedIn !== "" &&
          interestedIn !== null &&
          interestedIn !== undefined
            ? interestedIn
            : null,
      }),
    );
    navigation.navigate("CompleteProfileStep6");
  };

  const handleBack = () => {
    navigation.goBack();
  };

  const handleSkip = () => {
    dispatch(
      updateMultipleFields({
        interestedIn: null,
      }),
    );
    navigation.navigate("CompleteProfileStep6");
  };

  // Check if interestedIn is not selected
  const isNotSelected =
    interestedIn === "" || interestedIn === null || interestedIn === undefined;

  return (
    <View className="flex-1 bg-[#121212]">
      {/* Header */}
      <View className="bg-[#121212] pt-16 pb-6 px-6">
        <View className="flex-row items-center justify-between">
          <TouchableOpacity
            activeOpacity={1}
            onPress={handleBack}
            className="flex-row items-center"
          >
            <Text className="text-4xl mr-2 text-white">←</Text>
          </TouchableOpacity>
          {isNotSelected && (
            <TouchableOpacity activeOpacity={0.9} onPress={handleSkip}>
              <Text className="text-gray-400 text-[16px] font-semibold">
                Atla
              </Text>
            </TouchableOpacity>
          )}
        </View>
      </View>

      <View className="flex-1 px-6 py-6 pt-0">
        <View className="flex flex-col gap-2">
          <Text className="text-4xl font-bold text-white">İlgi Alanın</Text>
          <Text className="text-[18px] font-normal text-gray-400 mb-6">
            Kiminle eşleşmek istersin?
          </Text>
        </View>

        <View className="mb-4">
          <Text className="text-gray-300 text-lg font-semibold mb-2">
            İlgilendiğim Cinsiyet
          </Text>
          <TouchableOpacity
            style={{
              borderRadius: 999,
              borderCurve: "continuous",
              overflow: "hidden",
            }}
            activeOpacity={1}
            onPress={handleOpenInterestedInModal}
            className="border-[0.5px] border-white/10 px-4 py-5 flex-row items-center justify-between"
          >
            <Text
              className={`${
                interestedIn !== "" ? "text-white" : "text-gray-400"
              } text-[18px]`}
            >
              {getInterestedInLabel()}
            </Text>
            <Text className="text-gray-400 text-xl">▼</Text>
          </TouchableOpacity>
        </View>
      </View>

      {/* Sticky Button with KeyboardStickyView */}
      <KeyboardStickyView offset={{ closed: 0, opened: 0 }}>
        <View className="px-8 pb-8 pt-4 bg-[#121212]">
          <TouchableOpacity
            activeOpacity={1}
            onPress={handleNext}
            className="rounded-full overflow-hidden"
            style={{
              borderRadius: 999,
              borderCurve: "continuous",
              overflow: "hidden",
            }}
          >
            <LinearGradient
              colors={["#fc2f26", "#fc1626"]}
              start={{ x: 0, y: 0 }}
              end={{ x: 1, y: 0 }}
              className="py-3.5"
            >
              <Text className="text-white py-[20px] font-bold text-[15px] text-center">
                {isNotSelected ? "Atla" : "Devam Et"}
              </Text>
            </LinearGradient>
          </TouchableOpacity>
        </View>
      </KeyboardStickyView>

      {/* InterestedIn Bottom Sheet */}
      <BottomSheetModal
        ref={interestedInSheetRef}
        index={0}
        backgroundStyle={{
          borderRadius: 32,
          backgroundColor: "#121212",
        }}
        snapPoints={snapPoints}
        backdropComponent={renderBackdrop}
        enablePanDownToClose={true}
        handleIndicatorStyle={{ backgroundColor: "#4B5563", width: 50 }}
      >
        <InterestedInPickerContent
          initialValue={interestedIn}
          onConfirm={confirmInterestedInSelection}
          onCancel={cancelInterestedInSelection}
        />
      </BottomSheetModal>
    </View>
  );
}
