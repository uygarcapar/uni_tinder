import { useEffect, useState } from "react";
import { View, Text, TouchableOpacity } from "react-native";
import { LinearGradient } from "expo-linear-gradient";
import { BlurView } from "expo-blur";
import { Heart } from "lucide-react-native";
import AppBottomSheet from "@/shared/components/AppBottomSheet";
import { colors } from "../../../shared/theme/colors";

const PACKS = [
  { id: 5, count: 5, price: "₺49,99" },
  { id: 10, count: 10, price: "₺89,99" },
  { id: 20, count: 20, price: "₺149,99" },
];

export default function SuperLikePurchaseModal({
  visible,
  onClose,
  onUpgrade,
}: any) {
  const [selectedId, setSelectedId] = useState<number | null>(null);

  useEffect(() => {
    if (!visible) setSelectedId(null);
  }, [visible]);

  const hasSelection = selectedId !== null;

  const footer = (
    <BlurView
      intensity={70}
      tint="dark"
      style={{
        paddingHorizontal: 20,
        paddingTop: 12,
        paddingBottom: 24,
        borderTopWidth: 0.5,
        borderTopColor: "rgba(255,255,255,0.08)",
        overflow: "hidden",
      }}
    >
      <TouchableOpacity
        activeOpacity={0.9}
        onPress={() => hasSelection && onUpgrade?.(selectedId)}
        disabled={!hasSelection}
        style={{
          width: "100%",
          borderRadius: 999,
          borderCurve: "continuous",
          overflow: "hidden",
          backgroundColor: hasSelection
            ? colors.litPlus
            : "rgba(255,255,255,0.15)",
          paddingVertical: 18,
          alignItems: "center",
          justifyContent: "center",
        }}
      >
        <Text
          style={{
            color: hasSelection ? colors.text : "rgba(255,255,255,0.5)",
            fontSize: 15,
            fontWeight: "700",
          }}
        >
          Satın Al
        </Text>
      </TouchableOpacity>
      <Text
        style={{
          marginTop: 10,
          marginHorizontal: 10,
          color: "rgba(255,255,255,0.5)",
          fontSize: 11,
          textAlign: "center",
          lineHeight: 15,
        }}
      >
        Süper beğeniler satın alma tamamlandığında hesabına anında eklenir ve
        süresi dolmaz. Ödemeler App Store hesabından tahsil edilir, satın alma
        sonrası iade yapılmaz.
      </Text>
    </BlurView>
  );

  return (
    <AppBottomSheet
      visible={visible}
      onClose={onClose}
      snapPoints={["55%", "70%"]}
      backgroundStyle={{ backgroundColor: "#a83220" }}
      handleComponent={null}
      footer={footer}
    >
      {/* Yukarıdan gri → aşağıda messageOwn'a fade — PurchaseModal ile aynı */}
      <LinearGradient
        pointerEvents="none"
        colors={["#2e2e2e", "#2e2e2e", "#a83220"]}
        locations={[0, 0.4, 1]}
        start={{ x: 0.5, y: 0 }}
        end={{ x: 0.5, y: 1 }}
        style={{
          position: "absolute",
          top: 0,
          left: 0,
          right: 0,
          height: 700,
          borderTopLeftRadius: 36,
          borderTopRightRadius: 36,
          overflow: "hidden",
        }}
      />

      <View
        style={{
          flex: 1,
          paddingTop: 35,
          paddingHorizontal: 24,
          paddingBottom: 20,
          alignItems: "center",
        }}
      >
        <Text
          style={{
            color: colors.text,
            fontSize: 24,
            fontWeight: "700",
            textAlign: "center",
            marginBottom: 10,
            marginTop: 8,
          }}
        >
          Süper Beğeni Al
        </Text>
        <Text
          style={{
            color: "rgba(255,255,255,0.75)",
            fontSize: 14,
            textAlign: "center",
            lineHeight: 20,
            marginBottom: 24,
            paddingHorizontal: 8,
          }}
        >
          Süper beğeniler 3x daha fazla eşleşme sağlar. Paketini seç ve fark
          yarat.
        </Text>

        <View
          style={{
            flexDirection: "row",
            flexWrap: "wrap",
            width: "100%",
            gap: 10,
            marginBottom: 20,
          }}
        >
          {PACKS.map((pack) => {
            const isSelected = pack.id === selectedId;
            return (
              <TouchableOpacity
                key={pack.id}
                activeOpacity={0.85}
                onPress={() => setSelectedId(pack.id)}
                style={{
                  width: "48%",
                  aspectRatio: 1.25,
                  borderRadius: 24,
                  borderCurve: "continuous",
                  borderWidth: 0.5,
                  borderColor: isSelected
                    ? colors.text
                    : "rgba(255,255,255,0.2)",
                  overflow: "hidden",
                  opacity: !hasSelection || isSelected ? 1 : 0.45,
                }}
              >
                <BlurView
                  intensity={70}
                  tint="dark"
                  style={{
                    flex: 1,
                    alignItems: "center",
                    justifyContent: "center",
                    paddingVertical: 22,
                  }}
                >
                  <Heart
                    size={40}
                    color={colors.text}
                    fill={colors.text}
                    strokeWidth={1.5}
                  />
                  <Text
                    style={{
                      color: "rgba(255,255,255,0.9)",
                      fontSize: 14,
                      fontWeight: "700",
                      marginTop: 8,
                    }}
                    numberOfLines={1}
                  >
                    {pack.count}x Superlike
                  </Text>
                  <Text
                    style={{
                      color: "rgba(255,255,255,0.75)",
                      fontSize: 15,
                      fontWeight: "300",
                      marginTop: 4,
                    }}
                    numberOfLines={1}
                  >
                    {pack.price}
                  </Text>
                </BlurView>
              </TouchableOpacity>
            );
          })}
        </View>

      </View>
    </AppBottomSheet>
  );
}
