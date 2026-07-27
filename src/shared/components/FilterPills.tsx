import { View, Text, TouchableOpacity } from "react-native";
import { colors } from "@/shared/theme/colors";

// Tab filtre pilleri — MessagesScreen ve LikesScreen aynı görünümü paylaşıyor.
// tabs: [{ key, label }], activeTab: seçili key, onChange: (key) => void.
// Dış boşluk/animasyon çağıran ekranda yönetilir; burası sadece pill satırını
// (flex-row gap-2) render eder.
export default function FilterPills({ tabs, activeTab, onChange, style }: any) {
  return (
    <View className="flex-row gap-2" style={style}>
      {tabs.map((tab: any) => {
        const isActive = activeTab === tab.key;
        return (
          <TouchableOpacity
            key={tab.key}
            activeOpacity={1}
            onPress={() => onChange(tab.key)}
            style={{
              borderRadius: 999,
              borderCurve: "continuous",
              overflow: "hidden",
              flexDirection: "row",
              alignItems: "center",
              paddingHorizontal: 14,
              paddingVertical: 13,
              backgroundColor: isActive ? colors.text : "transparent",
              borderWidth: 1,
              borderColor: "rgba(255,255,255,0.25)",
            }}
          >
            <Text
              style={{
                color: isActive ? "#000" : colors.text,
                fontWeight: "600",
                fontSize: 12,
              }}
            >
              {tab.label}
            </Text>
          </TouchableOpacity>
        );
      })}
    </View>
  );
}
