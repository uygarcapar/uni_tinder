import { ScrollView, Text, TouchableOpacity } from "react-native";
import { colors, ink } from "@/shared/theme/colors";

// Tab filtre pilleri — MessagesScreen ve LikesScreen aynı görünümü paylaşıyor.
// tabs: [{ key, label }], activeTab: seçili key, onChange: (key) => void.
// Dış boşluk/animasyon çağıran ekranda yönetilir; burası sadece pill satırını
// render eder.
//
// Satır YATAY KAYDIRILABİLİR. Sabit `flex-row` iken 4. sekme ("Kaçırdıkların")
// dar ekranlarda taşıyordu — pill genişliği etiket uzunluğuna ve kullanıcının
// yazı tipi ölçeğine bağlı olduğu için bu, sekme sayısıyla sınırlı bir sorun
// da değil. İçerik sığdığında görünüm birebir aynı (kaydırma çubuğu gizli,
// bounce yok), sığmadığında pill'ler kırpılmak yerine kaydırılabilir kalıyor.
export default function FilterPills({ tabs, activeTab, onChange, style }: any) {
  return (
    <ScrollView
      horizontal
      showsHorizontalScrollIndicator={false}
      bounces={false}
      style={style}
      contentContainerStyle={{ flexDirection: "row", gap: 8 }}
    >
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
              backgroundColor: isActive ? colors.inverseSurface : "transparent",
              borderWidth: 1,
              borderColor: ink(0.25),
            }}
          >
            <Text
              style={{
                color: isActive ? colors.onInverseSurface : colors.text,
                fontWeight: "600",
                fontSize: 12,
              }}
            >
              {tab.label}
            </Text>
          </TouchableOpacity>
        );
      })}
    </ScrollView>
  );
}
