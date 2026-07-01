import { View, Text, TouchableOpacity } from "react-native";
import { LinearGradient } from "expo-linear-gradient";
import { Heart } from "lucide-react-native";
import AppModal from "@/shared/components/AppModal";
import { colors, gradients } from "../../../shared/theme/colors";

export default function SuperLikePurchaseModal({
  visible,
  onClose,
  onUpgrade,
}: any) {
  return (
    <AppModal
      visible={visible}
      onClose={onClose}
      title="Süper Beğeni"
      snapPoints={["60%"]}
      scrollable={false}
      containerStyle={{
        paddingHorizontal: 24,
        paddingBottom: 24,
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
        <Heart size={60} color={colors.text} fill={colors.text} strokeWidth={1.5} />
      </View>

      <Text
        style={{
          color: colors.text,
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
          color: colors.textSecondary,
          fontSize: 14,
          textAlign: "center",
          lineHeight: 20,
          marginBottom: 28,
          paddingHorizontal: 8,
        }}
      >
        Premium üyelikle daha fazla süper beğeni hakkın olur ve fark yaratırsın.
        Gönderilen süper beğeniler 3x daha fazla eşleşme sağlar.
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
          colors={gradients.premiumAlt}
          start={{ x: 0, y: 0 }}
          end={{ x: 1, y: 0 }}
          style={{
            paddingVertical: 16,
            alignItems: "center",
          }}
        >
          <Text style={{ color: colors.text, fontSize: 14, fontWeight: "700" }}>
            Premium'a Geç
          </Text>
        </LinearGradient>
      </TouchableOpacity>

      <TouchableOpacity
        activeOpacity={0.7}
        onPress={onClose}
        style={{ paddingVertical: 12 }}
      >
        <Text style={{ color: colors.textSecondary, fontSize: 13, fontWeight: "500" }}>
          Henüz değil
        </Text>
      </TouchableOpacity>
    </AppModal>
  );
}
