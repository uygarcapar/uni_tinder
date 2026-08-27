import React, { useCallback, useEffect, useMemo, useState } from "react";
import { useTranslation } from "react-i18next";
import { View, Text, TouchableOpacity } from "react-native";
import { BottomSheetTextInput } from "@gorhom/bottom-sheet";
import { Search, SearchX, Check } from "lucide-react-native";
import SFIcon from "@/shared/components/SFIcon";
import AppModal from "@/shared/components/AppModal";
import {
  resolveLocalized,
  selectablePrompts,
  type PromptGroupOption,
} from "@/shared/queries/commonQueries";
import { colors } from "../theme/colors";

type Props = {
  visible: boolean;
  onClose: () => void;
  groups: PromptGroupOption[] | undefined;
  /**
   * Kullanıcının hâlihazırda kullandığı anahtarlar — listeden elenir.
   * Aynı prompt iki kez seçilemiyor (backend `UT-2203`).
   *
   * DÜZENLENEN slotun kendi anahtarı buraya DAHİL EDİLMEMELİ, yoksa kullanıcı
   * kendi seçtiği soruyu listede göremez ve seçili satır kaybolur.
   */
  usedKeys: readonly string[];
  /** Düzenlenen slotun mevcut anahtarı — listede seçili görünür. */
  selectedKey?: string | null;
  onSelect: (enumName: string) => void;
};

// Tek seçimli prompt seçici. LanguagePickerModal'ın kardeşi: aynı AppModal
// chrome'u, aynı arama input'u — farkı çoklu seçim yerine tek seçim (satıra
// basınca modal kapanır) ve kategoriye gruplu liste.
//
// Pasife alınmış prompt'lar (`isActive: false`) listede GÖSTERİLMEZ ama
// katalogdan silinmedikleri için kullanıcının mevcut cevabı çözülmeye devam
// eder — bkz. `selectablePrompts` / `findPrompt`.
export default function PromptPickerModal({
  visible,
  onClose,
  groups,
  usedKeys,
  selectedKey,
  onSelect,
}: Props) {
  const { t, i18n } = useTranslation();
  const [search, setSearch] = useState("");

  useEffect(() => {
    if (!visible) setSearch("");
  }, [visible]);

  // Etiket `display`ten çözülüyor, `name`den DEĞİL: `name` sunucuda sabit
  // İngilizce, çift dilli karşılık `display` ({tr,en}) alanında.
  const label = useCallback(
    (value: unknown, fallback: string) =>
      resolveLocalized(value as any, i18n.language, fallback),
    [i18n.language],
  );

  const visibleGroups = useMemo(() => {
    const q = search.trim().toLocaleLowerCase("tr");
    return selectablePrompts(groups, usedKeys)
      .map((g) => ({
        ...g,
        prompts: q
          ? g.prompts.filter((p) =>
              label(p.display, p.name).toLocaleLowerCase("tr").includes(q),
            )
          : g.prompts,
      }))
      .filter((g) => g.prompts.length > 0);
  }, [groups, usedKeys, search, label]);

  const isEmpty = visibleGroups.length === 0;

  return (
    <AppModal
      visible={visible}
      onClose={onClose}
      title={t('profile.prompts.pickerTitle')}
      snapPoints={["75%", "90%"]}
      stackBehavior="push"
      // Header'da buton YOK: seçim satıra basınca kapanıyor, ayrıca swipe-down
      // ve backdrop da kapatıyor — X ayrı bir çıkış yolu eklemiyordu.
      closeButton={false}
      // Buton kalkınca header'daki 88px'lik yuva boş kalıyordu; içerik drag
      // pill'inin (top 20 + 4px) hemen altından başlıyor. Header'ın blur zemini
      // ve scroll'da gelen başlığı yerinde — yalnız boşluk kapandı.
      contentContainerStyle={{ paddingTop: 36 }}
    >
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
          placeholder={t('profile.prompts.pickerTitle')}
          placeholderTextColor={colors.textMuted}
          autoCorrect={false}
          // Yükseklik SABİT + dikey dolgu 0: `paddingVertical` ile büyüyen tek
          // satırlık input'ta metin/placeholder içerik kutusunun altına
          // kayıyordu (iOS'ta ölçülen satır yüksekliği dolguyla toplanıyor),
          // solundaki büyüteç ikonu dikeyde ortalıyken yazı aşağıda kalıyordu.
          // Sabit yükseklikte ikisi de aynı merkeze oturuyor.
          style={{
            height: 50,
            borderRadius: 999,
            borderCurve: "continuous",
            borderWidth: 0.5,
            borderColor: colors.hairline,
            backgroundColor: "transparent",
            paddingLeft: 44,
            paddingRight: 16,
            paddingVertical: 0,
            color: colors.text,
            fontSize: 15,
          }}
        />
      </View>

      {isEmpty ? (
        <View style={{ paddingVertical: 32, alignItems: "center" }}>
          <SFIcon name="magnifyingglass" fallback={SearchX} size={36} color={colors.text} strokeWidth={1.75} weight="medium" />
          <Text
            style={{
              color: colors.text,
              fontSize: 15,
              fontWeight: "500",
              marginTop: 12,
              textAlign: "center",
            }}
          >
            {/* Katalog boş (backend K2 henüz doldurmadı) ile "arama sonuç
                vermedi"/"hepsini kullandın" ayrı durumlar — kullanıcıya
                yapabileceği şeyi söylemek için ayrıştırılıyor. */}
            {(groups?.length ?? 0) === 0
              ? t('profile.prompts.catalogEmpty')
              : t('profile.prompts.pickerEmpty')}
          </Text>
        </View>
      ) : (
        visibleGroups.map((group, groupIndex) => (
          <View
            key={group.categoryEnumName ?? group.category ?? String(groupIndex)}
            style={{ marginTop: groupIndex === 0 ? 4 : 20 }}
          >
            <Text
              style={{
                color: colors.text,
                fontSize: 20,
                fontWeight: "600",
                marginBottom: 6,
                paddingHorizontal: 16,
                paddingVertical: 8,
              }}
            >
              {label(group.categoryDisplay, group.category)}
            </Text>
            {group.prompts.map((prompt, idx) => {
              const isSelected = prompt.enumName === selectedKey;
              return (
                <TouchableOpacity
                  key={prompt.enumName}
                  activeOpacity={1}
                  onPress={() => {
                    onSelect(prompt.enumName);
                    onClose();
                  }}
                  style={{
                    marginTop: idx === 0 ? 0 : 6,
                    paddingVertical: 18,
                    paddingHorizontal: 16,
                    flexDirection: "row",
                    alignItems: "center",
                    borderCurve: "continuous",
                    overflow: "hidden",
                    borderRadius: 999,
                    backgroundColor: isSelected ? colors.hairline : "transparent",
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
                    {label(prompt.display, prompt.name)}
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
            })}
          </View>
        ))
      )}
    </AppModal>
  );
}
