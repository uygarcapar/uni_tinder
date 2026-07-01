import React, { useEffect, useMemo, useState } from "react";
import { View, Text, TouchableOpacity } from "react-native";
import { BottomSheetTextInput } from "@gorhom/bottom-sheet";
import { Search, SearchX, Check } from "lucide-react-native";
import AppModal from "@/shared/components/AppModal";
import type { CityOption } from "@/shared/queries/commonQueries";
import { colors } from "../../../shared/theme/colors";

type Props = {
  visible: boolean;
  onClose: () => void;
  items: CityOption[];
  initialValue: string;
  onConfirm: (enumName: string) => void;
};

// FilterModal'ın içinden açılan şehir seçici. AppModal'ın standart scrollable
// modu kullanılıyor → X butonu, başlık ve scroll-driven progressive blur header
// AppModal'dan otomatik geliyor (FilterModal/EditModal ile aynı chrome).
// 81 şehir için inline .map() yeterli, ayrı virtualized list'e gerek yok.
export default function CityPickerModal({
  visible,
  onClose,
  items,
  initialValue,
  onConfirm,
}: Props) {
  const [search, setSearch] = useState("");

  // Modal kapanınca arama state'ini sıfırla — yoksa tekrar açıldığında
  // input'ta hiçbir şey yazmıyor görünüyor ama filter eski sorguyla
  // gelmiş gibi sonuç sayısı azalmış oluyor.
  useEffect(() => {
    if (!visible) setSearch("");
  }, [visible]);

  const ordered = useMemo(() => {
    const q = search.trim().toLocaleLowerCase("tr");
    const filtered = q
      ? items.filter((i) => (i.name ?? "").toLocaleLowerCase("tr").includes(q))
      : items;
    if (!initialValue) return filtered;
    const selected = items.find((i) => i.enumName === initialValue);
    if (!selected) return filtered;
    if (q && !(selected.name ?? "").toLocaleLowerCase("tr").includes(q)) {
      return filtered;
    }
    return [selected, ...filtered.filter((i) => i.enumName !== initialValue)];
  }, [items, initialValue, search]);

  return (
    <AppModal
      visible={visible}
      onClose={onClose}
      title="Şehir Seç"
      // İlk snap %75 — normal durum. İkinci snap %90 — keyboardBehavior="extend"
      // klavye açıldığında otomatik en yüksek snap'e çıkar → modal yukarı kayar,
      // input klavyenin üstünde rahat dururken liste daha fazla görünür kalır.
      snapPoints={["75%", "90%"]}
      stackBehavior="push"
      closeButton={false}
    >
      {/* Arama input — listenin üstünde, içerikle birlikte scroll olur */}
      <View style={{ position: "relative", marginBottom: 12 }}>
        <View
          pointerEvents="none"
          style={{
            position: "absolute",
            left: 18,
            top: 0,
            bottom: 0,
            justifyContent: "center",
            zIndex: 1,
          }}
        >
          <Search size={18} color={colors.textSecondary} strokeWidth={2} />
        </View>
        <BottomSheetTextInput
          value={search}
          onChangeText={setSearch}
          placeholder="Şehir ara"
          placeholderTextColor={colors.textMuted}
          autoCorrect={false}
          autoCapitalize="none"
          style={{
            borderRadius: 999,
            borderCurve: "continuous",
            borderWidth: 0.5,
            borderColor: "rgba(255,255,255,0.1)",
            backgroundColor: "transparent",
            paddingLeft: 44,
            paddingRight: 16,
            paddingVertical: 14,
            color: colors.text,
            fontSize: 15,
          }}
        />
      </View>

      {ordered.length === 0 ? (
        <View style={{ paddingVertical: 32, alignItems: "center" }}>
          <SearchX size={36} color={colors.text} strokeWidth={1.75} />
          {search.trim() !== "" && (
            <Text
              style={{
                color: colors.text,
                fontSize: 15,
                fontWeight: "500",
                marginTop: 12,
                textAlign: "center",
              }}
            >
              '{search.trim()}' bulunamadı
            </Text>
          )}
        </View>
      ) : (
        ordered.map((item, idx) => {
          const isSelected = item.enumName === initialValue;
          return (
            <TouchableOpacity
              key={item.id}
              activeOpacity={0.7}
              onPress={() => onConfirm(item.enumName)}
              style={{
                marginTop: idx === 0 ? 0 : 6,
                paddingVertical: 20,
                paddingHorizontal: 16,
                flexDirection: "row",
                alignItems: "center",
                borderCurve: "continuous",
                overflow: "hidden",
                borderRadius: 999,
                backgroundColor: isSelected
                  ? "rgba(255,255,255,0.1)"
                  : "transparent",
                position: "relative",
              }}
            >
              <Text
                style={{
                  color: isSelected ? colors.text : colors.textSecondary,
                  fontSize: 16,
                  fontWeight: "400",
                  flex: 1,
                  marginRight: 32,
                }}
              >
                {item.name}
              </Text>
              {isSelected && (
                <View
                  pointerEvents="none"
                  style={{
                    position: "absolute",
                    right: 16,
                    top: 0,
                    bottom: 0,
                    justifyContent: "center",
                  }}
                >
                  <Check size={18} color={colors.text} strokeWidth={2.5} />
                </View>
              )}
            </TouchableOpacity>
          );
        })
      )}
    </AppModal>
  );
}
