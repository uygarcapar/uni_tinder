import { useCallback } from "react";
import { View, Text, TouchableOpacity } from "react-native";
import { BottomSheetView } from "@gorhom/bottom-sheet";
import { LinearGradient } from "expo-linear-gradient";
import { Heart } from "lucide-react-native";
import BlurBottomSheetBackdrop from "@/shared/components/BlurBottomSheetBackdrop";
import AppBottomSheet from "@/shared/components/AppBottomSheet";

export default function SuperLikePurchaseModal({ visible, onClose, onUpgrade }: any) {
  const renderBackdrop = useCallback(
    (props) => <BlurBottomSheetBackdrop {...props} onPress={onClose} />,
    [onClose],
  );

  return (
    <AppBottomSheet
      visible={visible}
      snapPoints={["55%"]}
      onClose={onClose}
      backdropComponent={renderBackdrop}
      backgroundStyle={{ borderTopLeftRadius: 42, borderTopRightRadius: 42 }}
    >
      <BottomSheetView
        style={{
          flex: 1,
          paddingHorizontal: 24,
          paddingTop: 16,
          paddingBottom: 40,
          alignItems: "center",
        }}
      >
        <View
          style={{
            alignItems: "center",
            justifyContent: "center",
            paddingVertical: 22,
          }}
        >
          <Heart size={60} color="#fff" fill="#fff" strokeWidth={1.5} />
        </View>

        <Text
          style={{
            color: "#fff",
            fontSize: 24,
            fontWeight: "700",
            textAlign: "center",
            marginBottom: 10,
          }}
        >
          Süper beğeni hakkın bitti
        </Text>
        <Text
          style={{
            color: "#9CA3AF",
            fontSize: 14,
            textAlign: "center",
            lineHeight: 20,
            marginBottom: 28,
            paddingHorizontal: 8,
          }}
        >
          Premium üyelikle daha fazla süper beğeni hakkın olur ve fark
          yaratırsın. Gönderilen süper beğeniler 3x daha fazla eşleşme sağlar.
        </Text>

        <TouchableOpacity
          activeOpacity={0.9}
          onPress={onUpgrade}
          style={{
            width: "100%",
            borderRadius: 999,
            borderCurve: "continuous",
            overflow: "hidden",
            marginBottom: 12,
          }}
        >
          <LinearGradient
            colors={["#ff173a", "#FF4D4D", "#fc803d"]}
            start={{ x: 0, y: 0 }}
            end={{ x: 1, y: 0 }}
            style={{
              paddingVertical: 16,
              alignItems: "center",
            }}
          >
            <Text
              style={{
                color: "#fff",
                fontSize: 14,
                fontWeight: "700",
              }}
            >
              Premium'a Geç
            </Text>
          </LinearGradient>
        </TouchableOpacity>

        <TouchableOpacity
          activeOpacity={0.7}
          onPress={onClose}
          style={{ paddingVertical: 12 }}
        >
          <Text
            style={{
              color: "#9CA3AF",
              fontSize: 13,
              fontWeight: "500",
            }}
          >
            Henüz değil
          </Text>
        </TouchableOpacity>
      </BottomSheetView>
    </AppBottomSheet>
  );
}
