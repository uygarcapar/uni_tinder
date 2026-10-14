import React, { useCallback, useEffect, useMemo, useState } from "react";
import { useTranslation } from "react-i18next";
import { View, Text, TouchableOpacity } from "react-native";
import { SearchX, Check } from "@/shared/icons";
import SFIcon from "@/shared/components/SFIcon";
import SheetSearchInput from "@/shared/components/SheetSearchInput";
import AppModal, {
  SHEET_PICKER_SNAP_POINTS,
} from "@/shared/components/AppModal";
import type { CityOption } from "@/shared/queries/commonQueries";
import { colors } from "../../../shared/theme/colors";

type Props = {
  visible: boolean;
  onClose: () => void;
  items: CityOption[];
  initialValue: string;
  onConfirm: (enumName: string) => void;
};

/**
 * FilterModal'ın içinden açılan şehir seçici.
 *
 * YERLEŞİM AKIŞIN KAMPÜS SEÇİCİSİYLE BİREBİR (bkz. FeedUniversitySheet):
 * header'da X + tik, üstte kapsül arama, altında dolgusuz satırlar ve her
 * satırın sağında sabit yuvarlak kare kutu. İki sheet de "uzun bir listeden tek
 * bir şey seç" işi yapıyor; iki ayrı görünüm taşımaları için sebep yok.
 *
 * ⚠️ SEÇİM ONAYLI. Eskiden satıra dokunmak doğrudan `onConfirm` çağırıp
 * sheet'i kapatıyordu; header'a X + tik konduğu için artık dokunuş yalnız
 * TASLAĞI değiştiriyor, uygulayan şey tik.
 */

/** Seçenek satırının sağındaki kutu — kampüs/filtre sheet'leriyle aynı ölçü. */
const CHECKBOX_SIZE = 22;

export default function CityPickerModal({
  visible,
  onClose,
  items,
  initialValue,
  onConfirm,
}: Props) {
  const { t } = useTranslation();
  const [search, setSearch] = useState("");
  const [draft, setDraft] = useState(initialValue);
  /**
   * LİSTENİN BAŞINA ALINAN anahtar — `draft` DEĞİL.
   *
   * Sıralama taslağa bakarsa satıra dokunan kullanıcı seçtiği şehri parmağının
   * altından kaybediyor: liste anında yeniden diziliyor ve seçilen en tepeye
   * uçuyor. Sabitlenen anahtar YALNIZ SHEET AÇILIRKEN yazılıyor.
   */
  const [pinnedKey, setPinnedKey] = useState(initialValue);

  // Modal kapanınca arama state'ini sıfırla — yoksa tekrar açıldığında
  // input'ta hiçbir şey yazmıyor görünüyor ama filter eski sorguyla
  // gelmiş gibi sonuç sayısı azalmış oluyor. Açılışta taslak VE sabitlenen
  // anahtar dışarıdaki gerçekle hizalanıyor (kullanıcı önceki turda tike
  // basmadan kapatmış olabilir).
  useEffect(() => {
    if (!visible) {
      setSearch("");
      return;
    }
    setDraft(initialValue);
    setPinnedKey(initialValue);
  }, [visible, initialValue]);

  // ⚠️ `onClose()` ÇAĞRILMIYOR: çağıran (`onCityConfirm`) sheet'i kendisi
  // kapatıyor. Burada da kapatmak aynı state'i iki kez yazmak olurdu.
  const apply = useCallback(() => onConfirm(draft), [draft, onConfirm]);

  const ordered = useMemo(() => {
    const q = search.trim().toLocaleLowerCase("tr");
    const filtered = q
      ? items.filter((i) => (i.name ?? "").toLocaleLowerCase("tr").includes(q))
      : items;
    if (!pinnedKey) return filtered;
    const pinned = items.find((i) => i.enumName === pinnedKey);
    if (!pinned) return filtered;
    if (q && !(pinned.name ?? "").toLocaleLowerCase("tr").includes(q)) {
      return filtered;
    }
    return [pinned, ...filtered.filter((i) => i.enumName !== pinnedKey)];
  }, [items, pinnedKey, search]);

  return (
    <AppModal
      visible={visible}
      onClose={onClose}
      title={t("discover.cityPicker.title")}
      // Detentler ortak sabitten: en üst durak, seçiciyi açan FilterModal ile
      // aynı tepe. `fullScreen` burada "tam ekran" değil "tepe, status bar'ın
      // ALTI" demek (topInset = safe area), yani başlık çentiğe girmiyor.
      // Klavye açıldığında sheet otomatik üst durağa çıkıyor → input klavyenin
      // üstünde dururken liste görünür kalıyor.
      snapPoints={SHEET_PICKER_SNAP_POINTS}
      fullScreen
      stackBehavior="push"
      // Header YAPISI profil düzenleme modalının aynısı: sol üstte X, sağ üstte
      // tik, ikisi de yuvarlak BERRAK cam ölçüsünde (bkz. clearGlassHeader).
      closeButton
      actionIcon="checkmark"
      actionIconLabel={t("common.done")}
      onAction={apply}
      clearGlassHeader
    >
      {/* Arama input — listenin üstünde, içerikle birlikte scroll olur.
          Diğer seçicilerle ortak bileşen (bkz. SheetSearchInput). */}
      <SheetSearchInput value={search} onChangeText={setSearch} />

      {ordered.length === 0 ? (
        <View style={{ paddingVertical: 32, alignItems: "center" }}>
          <SFIcon
            name="magnifyingglass"
            fallback={SearchX}
            size={36}
            color={colors.text}
            strokeWidth={1.75}
            weight="medium"
          />
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
              {t("common.notFound", { query: search.trim() })}
            </Text>
          )}
        </View>
      ) : (
        ordered.map((item, idx) => {
          // İşaret TASLAĞA bakıyor (sıralamanın baktığı `pinnedKey`e değil):
          // dokunulan satırın kutusu anında doluyor, yeri değişmeden.
          const isSelected = item.enumName === draft;
          return (
            <TouchableOpacity
              key={item.id}
              // activeOpacity 1 — basılı tutarken solma yok. Tek geri bildirim
              // seçimin kendisi (sağdaki kutu).
              activeOpacity={1}
              // Dokunuş YALNIZ taslağı değiştiriyor; uygulayan şey header'daki
              // tik (bkz. `apply`).
              onPress={() => setDraft(item.enumName)}
              // ZEMİN HİÇ DEĞİŞMİYOR: seçili satır eskiden `hairline` dolguya
              // bürünüyordu. Seçimi söyleyen tek şey sağdaki kutu — iki ayrı
              // işaret aynı bilgiyi iki kez veriyordu.
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
                  // 400 → 500: profil düzenlemedeki kutulu satırların
                  // (EditProfileForm > OptionListItem) ağırlığı. Aynı kutuyu
                  // taşıyan satırların yazısı da aynı ağırlıkta olmalı; 400
                  // yanlarında silik kalıyordu.
                  fontWeight: "500",
                  flex: 1,
                  marginRight: 12,
                }}
              >
                {item.name}
              </Text>
              {/* ⚠️ Kutu HER ZAMAN çiziliyor, koşullu olan yalnız içindeki tik:
                  yoksa seçim anında metin alanı genişleyip satır yana kayıyor. */}
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
