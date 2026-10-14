import React, { useCallback, useEffect, useMemo, useState } from "react";
import { useTranslation } from "react-i18next";
import { View, Text, TouchableOpacity } from "react-native";
import { SearchX, Check } from "@/shared/icons";
import SFIcon from "@/shared/components/SFIcon";
import SheetSearchInput from "@/shared/components/SheetSearchInput";
import AppModal, {
  SHEET_PICKER_SNAP_POINTS,
} from "@/shared/components/AppModal";
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

/** Seçenek satırının sağındaki kutu — akış kampüs/filtre sheet'i ile aynı ölçü. */
const CHECKBOX_SIZE = 22;

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
      // Detentler ortak sabitten: en üst durak, seçiciyi açan profil düzenleme
      // sheet'iyle aynı tepe (bkz. SHEET_PICKER_SNAP_POINTS).
      snapPoints={SHEET_PICKER_SNAP_POINTS}
      fullScreen
      stackBehavior="push"
      // Header'da buton YOK: seçim satıra basınca kapanıyor, ayrıca swipe-down
      // ve backdrop da kapatıyor — X ayrı bir çıkış yolu eklemiyordu.
      closeButton={false}
      // Buton kalkınca header'daki 88px'lik yuva boş kalıyordu; içerik drag
      // pill'inin (top 20 + 4px) hemen altından başlıyor. Header'ın blur zemini
      // ve scroll'da gelen başlığı yerinde — yalnız boşluk kapandı.
      contentContainerStyle={{ paddingTop: 36 }}
    >
      {/* Arama input — diğer seçicilerle ortak bileşen (bkz. SheetSearchInput).
          ÜST BOŞLUK SIFIR: ortak bileşenin 10pt'lik payı header'daki X/tik
          butonlarının altında nefes bırakmak için; bu sheet'te o butonlar YOK
          (closeButton={false}) ve içerik zaten `paddingTop: 36` ile drag
          pill'inin altından başlıyor — 10pt daha fazlası arama kutusunu
          gereksiz aşağı itiyordu. */}
      <SheetSearchInput
        value={search}
        onChangeText={setSearch}
        style={{ marginTop: 0 }}
      />

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
                // Yatay dolgu YOK: satırların kapsül dolgusu kalkınca metinler
                // kenara dayandı, 16pt'lik girinti kategori başlığını
                // altındaki satırlardan içeri kaydırıyordu.
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
                  // ZEMİN HİÇ DEĞİŞMİYOR (istek): seçili satır eskiden
                  // `hairline` dolguya bürünüyordu. Seçimi söyleyen tek şey
                  // artık sağdaki kutu — bkz. FeedUniversitySheet, birebir aynı
                  // satır.
                  // ⚠️ Dolgu kalkınca `borderRadius`/`overflow` da işsiz kaldı:
                  // yuvarlatacak bir yüzey yok.
                  style={{
                    marginTop: idx === 0 ? 0 : 6,
                    paddingVertical: 18,
                    flexDirection: "row",
                    alignItems: "center",
                  }}
                >
                  <Text
                    style={{
                      color: isSelected ? colors.text : colors.textSecondary,
                      fontSize: 16,
                      fontWeight: "500",
                      flex: 1,
                      marginRight: 12,
                    }}
                  >
                    {label(prompt.display, prompt.name)}
                  </Text>
                  {/* Kutu HER ZAMAN çiziliyor, koşullu olan yalnız içindeki
                      tik: yoksa seçim anında metin alanı genişleyip satır yana
                      kayıyor (bkz. FeedFilterSheet > OptionRow). */}
                  <View
                    style={{
                      width: CHECKBOX_SIZE,
                      height: CHECKBOX_SIZE,
                      borderRadius: 7,
                      borderCurve: "continuous",
                      borderWidth: isSelected ? 0 : 1.5,
                      borderColor: colors.hairlineStrong,
                      backgroundColor: isSelected
                        ? colors.inverseSurface
                        : "transparent",
                      alignItems: "center",
                      justifyContent: "center",
                    }}
                  >
                    {isSelected && (
                      <SFIcon
                        name="checkmark"
                        fallback={Check}
                        size={14}
                        color={colors.onInverseSurface}
                        strokeWidth={3}
                        weight="bold"
                      />
                    )}
                  </View>
                </TouchableOpacity>
              );
            })}
          </View>
        ))
      )}
    </AppModal>
  );
}
