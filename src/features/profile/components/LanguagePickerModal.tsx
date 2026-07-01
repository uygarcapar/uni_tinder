import React, { useEffect, useMemo, useState } from "react";
import { View, Text, TouchableOpacity, Alert } from "react-native";
import { BottomSheetTextInput } from "@gorhom/bottom-sheet";
import { Search, SearchX, Check } from "lucide-react-native";
import AppModal from "@/shared/components/AppModal";
import { colors } from "../../../shared/theme/colors";

type Option = { id: number; name: string; enumName: string };

type Props = {
  visible: boolean;
  onClose: () => void;
  items: Option[];
  initialSelectedValues: string[];
  maxLimit?: number;
  limitMsg?: string;
  onConfirm: (enumNames: string[]) => void;
};

// CityPickerModal'ın multi-select kardeşi. AppModal chrome, snap points
// (75%/92% — keyboard extend), arama input ve liste yapısı CityPickerModal
// ile birebir aynı; tek fark çoklu seçim toggle ve sağda "Bitti" action.
export default function LanguagePickerModal({
  visible,
  onClose,
  items,
  initialSelectedValues,
  maxLimit,
  limitMsg,
  onConfirm,
}: Props) {
  const [search, setSearch] = useState("");
  const [selected, setSelected] = useState<Set<string>>(
    () => new Set(initialSelectedValues),
  );

  // Modal her açıldığında initial seçimi resetle; kapanınca arama state'ini sıfırla
  // (CityPickerModal ile aynı pattern — stale state karışmasın).
  useEffect(() => {
    if (visible) {
      setSelected(new Set(initialSelectedValues));
    } else {
      setSearch("");
    }
  }, [visible, initialSelectedValues]);

  const ordered = useMemo(() => {
    const q = search.trim().toLocaleLowerCase("tr");
    const filtered = q
      ? items.filter((i) => (i.name ?? "").toLocaleLowerCase("tr").includes(q))
      : items;
    if (selected.size === 0) return filtered;
    // Seçili olanlar listenin başında — görsel referans.
    const selectedItems: Option[] = [];
    const rest: Option[] = [];
    for (const it of filtered) {
      if (selected.has(it.enumName)) selectedItems.push(it);
      else rest.push(it);
    }
    return [...selectedItems, ...rest];
  }, [items, search, selected]);

  const toggle = (enumName: string) => {
    setSelected((prev) => {
      const next = new Set(prev);
      if (next.has(enumName)) {
        next.delete(enumName);
      } else {
        if (maxLimit && next.size >= maxLimit) {
          Alert.alert("Sınır Aşıldı", limitMsg || "Sınır aşıldı.");
          return prev;
        }
        next.add(enumName);
      }
      return next;
    });
  };

  return (
    <AppModal
      visible={visible}
      onClose={onClose}
      title="Dil Seç"
      snapPoints={["75%", "90%"]}
      stackBehavior="push"
      actionLabel="Bitti"
      onAction={() => onConfirm(Array.from(selected))}
    >
      {/* Arama input — CityPickerModal ile birebir */}
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
          placeholder="Dil ara"
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
          const isSelected = selected.has(item.enumName);
          return (
            <TouchableOpacity
              key={item.id}
              activeOpacity={0.7}
              onPress={() => toggle(item.enumName)}
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
