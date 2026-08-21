import React, { useCallback, useEffect, useMemo, useState } from "react";
import { useTranslation } from 'react-i18next';
import { View, Text, TouchableOpacity, Alert } from "react-native";
import { BottomSheetTextInput } from "@gorhom/bottom-sheet";
import { Search, SearchX, Check } from "lucide-react-native";
import SFIcon from "@/shared/components/SFIcon";
import AppModal from "@/shared/components/AppModal";
import {
  resolveLocalized,
  type LocalizedText,
} from "@/shared/queries/commonQueries";
import { colors } from "../theme/colors";

type Option = {
  id: number;
  name: string;
  enumName: string;
  display?: string | LocalizedText;
};

type Props = {
  visible: boolean;
  onClose: () => void;
  items: Option[];
  initialSelectedValues: string[];
  maxLimit?: number;
  limitMsg?: string;
  onConfirm: (enumNames: string[]) => void;
  // Başlık çağırana bırakıldı: profil düzenlemede "kendi dillerim", keşif
  // filtresinde "karşımdakinin dilleri" seçiliyor — aynı liste, farklı soru.
  title?: string;
};

// CityPickerModal'ın multi-select kardeşi. AppModal chrome, snap points
// (75%/92% — keyboard extend), arama input ve liste yapısı CityPickerModal
// ile birebir aynı; tek fark çoklu seçim toggle ve sağda "Bitti" action.
//
// İki ekran kullanıyor (EditProfileForm ve FilterModal), o yüzden shared/'ta:
// profil özel hiçbir mantığı yok, `items` dışarıdan geliyor.
export default function LanguagePickerModal({
  visible,
  onClose,
  items,
  initialSelectedValues,
  maxLimit,
  limitMsg,
  onConfirm,
  title,
}: Props) {
  const { t, i18n } = useTranslation();
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

  // Satır etiketi `display`ten çözülüyor, `name`den DEĞİL: /api/common/*
  // yanıtlarında `name` sabit İngilizce, çift dilli karşılık `display`
  // ({ tr, en }) alanında. Arama da aynı metin üzerinde yapılıyor — kullanıcı
  // ekranda ne okuyorsa onu yazabilmeli ("Almanca" → German).
  const label = useCallback(
    (item: Option) => resolveLocalized(item.display, i18n.language, item.name),
    [i18n.language],
  );

  const ordered = useMemo(() => {
    const q = search.trim().toLocaleLowerCase("tr");
    const filtered = q
      ? items.filter((i) => label(i).toLocaleLowerCase("tr").includes(q))
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
  }, [items, search, selected, label]);

  const toggle = (enumName: string) => {
    setSelected((prev) => {
      const next = new Set(prev);
      if (next.has(enumName)) {
        next.delete(enumName);
      } else {
        if (maxLimit && next.size >= maxLimit) {
          Alert.alert(t('common.limitReached'), limitMsg || t('common.limitReached'));
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
      title={title ?? t('profile.languages.title')}
      snapPoints={["75%", "90%"]}
      stackBehavior="push"
      actionLabel={t('common.done')}
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
          <SFIcon name="magnifyingglass" fallback={Search} size={18} color={colors.textSecondary} strokeWidth={2} weight="semibold" />
        </View>
        <BottomSheetTextInput
          value={search}
          onChangeText={setSearch}
          placeholder={t('profile.languages.search')}
          placeholderTextColor={colors.textMuted}
          autoCorrect={false}
          autoCapitalize="none"
          style={{
            borderRadius: 999,
            borderCurve: "continuous",
            borderWidth: 0.5,
            borderColor: colors.hairline,
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
          <SFIcon name="magnifyingglass" fallback={SearchX} size={36} color={colors.text} strokeWidth={1.75} weight="medium" />
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
              {t('profile.languages.notFound', { search: search.trim() })}
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
                  ? colors.hairline
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
                {label(item)}
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
                  <SFIcon name="checkmark" fallback={Check} size={18} color={colors.text} strokeWidth={2.5} weight="bold" />
                </View>
              )}
            </TouchableOpacity>
          );
        })
      )}
    </AppModal>
  );
}
