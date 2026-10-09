import { useCallback, useMemo } from "react";
import { useTranslation } from "react-i18next";
import AppBottomSheet from "@/shared/components/AppBottomSheet";
import SearchableListSheet from "@/shared/components/SearchableListSheet";
import {
  resolveLocalized,
  useUniversities,
} from "@/shared/queries/commonQueries";

/**
 * Akış kampüs seçici (Plus).
 *
 * `UniversityPickerModal` KULLANILMIYOR: o çoklu seçim için yazılmış (profil
 * görünürlük listesi). Burada tekli seçim var ve `SearchableListSheet`in
 * varsayılan modu zaten tekli.
 *
 * ⚠️ İKİ TUZAK:
 *  1. `useUniversities()` `{domain, name, display}` döndürüyor — `id`/`enumName`
 *     YOK. SearchableListSheet seçimi `enumName` üzerinden taşıdığı için
 *     domain oraya map'leniyor; domain zaten hem anahtar hem wire değeri.
 *  2. `display` bir NESNE (`{tr, en}`). Doğrudan render etmek
 *     "Objects are not valid as a React child" ile patlar; `labelOf`
 *     `resolveLocalized`den geçmek ZORUNDA. `name`e güvenilmez: sunucu onu
 *     DB'deki profil dilinden çözüyor, istemcinin dilinin gerisinde kalabiliyor.
 */

/** Listenin başındaki "Kendi kampüsüm" satırının taşıyıcı değeri. */
export const OWN_CAMPUS_VALUE = "__own__";

export interface FeedUniversitySheetProps {
  visible: boolean;
  onClose: () => void;
  /** null = kendi kampüsü. */
  value: string | null;
  onSelect: (domain: string | null) => void;
}

export default function FeedUniversitySheet({
  visible,
  onClose,
  value,
  onSelect,
}: FeedUniversitySheetProps) {
  const { t, i18n } = useTranslation();
  const { data: universities } = useUniversities();

  const items = useMemo(() => {
    const list = (universities ?? []).map((u) => ({
      id: u.domain,
      // SearchableListSheet seçimi `enumName` ile taşıyor → domain oraya.
      enumName: u.domain,
      name: u.name,
      display: u.display,
    }));
    // "Kendi kampüsüm" listenin BAŞINDA: en sık seçilen ve geri dönüş yolu.
    return [
      {
        id: OWN_CAMPUS_VALUE,
        enumName: OWN_CAMPUS_VALUE,
        name: t("feed.university.own"),
        display: undefined,
      },
      ...list,
    ];
  }, [universities, t]);

  const labelOf = useCallback(
    (item: any) => resolveLocalized(item?.display, i18n.language, item?.name ?? ""),
    [i18n.language],
  );

  const handleConfirm = useCallback(
    (selected: string) => {
      onSelect(selected === OWN_CAMPUS_VALUE ? null : selected);
      onClose();
    },
    [onSelect, onClose],
  );

  if (!visible) return null;

  return (
    <AppBottomSheet
      visible={visible}
      onClose={onClose}
      snapPoints={["75%", "100%"]}
      backdrop="blur"
      backgroundStyle={{ borderRadius: 44 }}
      handleComponent={null}
      // Filtre sheet'inin üstünde açılabiliyor — "switch" alttakini küçültürdü.
      stackBehavior="push"
    >
      <SearchableListSheet
        items={items}
        labelOf={labelOf}
        initialValue={value ?? OWN_CAMPUS_VALUE}
        title={t("feed.university.title")}
        onConfirm={handleConfirm}
        onCancel={onClose}
      />
    </AppBottomSheet>
  );
}
