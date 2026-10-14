import React, { useCallback, useEffect, useMemo, useState } from "react";
import { useTranslation } from 'react-i18next';
import { View, Text, TouchableOpacity, Alert } from "react-native";
import { SearchX, Check } from "@/shared/icons";
import SFIcon from "@/shared/components/SFIcon";
import SheetSearchInput from "@/shared/components/SheetSearchInput";
import AppModal, {
  SHEET_PICKER_SNAP_POINTS,
} from "@/shared/components/AppModal";
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

/** Seçenek satırının sağındaki kutu — akış kampüs/filtre sheet'i ile aynı ölçü. */
const CHECKBOX_SIZE = 22;

// CityPickerModal'ın multi-select kardeşi. AppModal chrome, detentler
// (SHEET_PICKER_SNAP_POINTS — keyboard extend en üst durağa taşır), arama input
// ve liste yapısı CityPickerModal ile birebir aynı; tek fark çoklu seçim toggle
// ve sağda "Bitti" action.
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
  /**
   * LİSTENİN BAŞINA ALINAN anahtarlar — canlı `selected` DEĞİL.
   *
   * Sıralama canlı seçime bakarsa satıra dokunan kullanıcı dokunduğu dili
   * parmağının altından kaybediyor: liste anında yeniden diziliyor. Bu yüzden
   * sabitlenen küme YALNIZ modal açılırken yazılıyor (bkz. FeedUniversitySheet
   * > pinnedKey — aynı tuzak, aynı çözüm).
   */
  const [pinned, setPinned] = useState<Set<string>>(
    () => new Set(initialSelectedValues),
  );

  // Modal her açıldığında initial seçimi resetle; kapanınca arama state'ini sıfırla
  // (CityPickerModal ile aynı pattern — stale state karışmasın).
  useEffect(() => {
    if (visible) {
      setSelected(new Set(initialSelectedValues));
      setPinned(new Set(initialSelectedValues));
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
    if (pinned.size === 0) return filtered;
    // Açılışta seçili olanlar listenin başında — görsel referans. Dokunuşla
    // sıra DEĞİŞMİYOR; `pinned` yalnız açılışta yazılıyor.
    const selectedItems: Option[] = [];
    const rest: Option[] = [];
    for (const it of filtered) {
      if (pinned.has(it.enumName)) selectedItems.push(it);
      else rest.push(it);
    }
    return [...selectedItems, ...rest];
  }, [items, search, pinned, label]);

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
      // Detentler ortak sabitten: seçiciyi açan sheet (profil düzenleme /
      // filtreler) ile aynı tepeye çıkar — bkz. SHEET_PICKER_SNAP_POINTS.
      snapPoints={SHEET_PICKER_SNAP_POINTS}
      fullScreen
      stackBehavior="push"
      // "Bitti" YAZISI yerine onay işareti — X'in simetriği.
      actionIcon="checkmark"
      actionIconLabel={t('common.done')}
      onAction={() => onConfirm(Array.from(selected))}
      // X + ✓ uygulamanın yuvarlak cam ikon ölçüsünde (bkz. AppModal):
      // X, ekran başlıklarındaki çan/ayarlar butonunun aynısı oluyor.
      clearGlassHeader
    >
      {/* Arama input — CityPickerModal ile birebir (ortak bileşen) */}
      <SheetSearchInput value={search} onChangeText={setSearch} />

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
              // activeOpacity 1 — basılı tutarken solma yok. Tek geri bildirim
              // seçimin kendisi (sağdaki kutu).
              activeOpacity={1}
              onPress={() => toggle(item.enumName)}
              // ZEMİN HİÇ DEĞİŞMİYOR (istek): seçili satır eskiden `hairline`
              // dolguya bürünüyordu. Seçimi söyleyen tek şey artık sağdaki kutu
              // — bkz. FeedUniversitySheet, birebir aynı satır.
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
                {label(item)}
              </Text>
              {/* Kutu HER ZAMAN çiziliyor, koşullu olan yalnız içindeki tik:
                  yoksa seçim anında metin alanı genişleyip satır yana kayıyor
                  (bkz. FeedFilterSheet > OptionRow). */}
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
        })
      )}
    </AppModal>
  );
}
