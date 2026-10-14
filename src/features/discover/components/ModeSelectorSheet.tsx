import { useCallback } from "react";
import { Text, TouchableOpacity, View } from "react-native";
import { useTranslation } from "react-i18next";
import AppModal from "@/shared/components/AppModal";
import SFIcon from "@/shared/components/SFIcon";
import { Check, ChevronRight } from "@/shared/icons";
import { sectionGroupStyle, SECTION_GROUP_PAD_H } from "@/shared/theme/sectionGroup";
import { colors } from "@/shared/theme/colors";
import { APP_MODES, modeAccent, type AppMode } from "../modeTheme";

/**
 * Mod seçici — Keşif başlığındaki mod adına dokununca açılıyor.
 *
 * İki satır: Flört ve Arkadaş. Satırın hâli kullanıcının o modun profilini
 * AÇIP AÇMADIĞINA göre değişiyor:
 *   • açık   → seçilebilir satır, seçiliyse sağda tik
 *   • kapalı → "Profili aç" CTA'sı (sağda chevron), dokunuş mini kuruluma gider
 *
 * ⚠️ "Açık mı" kararı SUNUCUDAN (`/api/profile` → `modes`), diskten DEĞİL:
 * başka cihazda açılan profil burada bayat "kapalı" görünürdü. Bilgi henüz
 * gelmediyse (`openModes === undefined`) satırlar seçilebilir çiziliyor —
 * olmayan bir kısıt uydurmamak doğru taraf (premiumTier.resolved kuralının
 * aynısı); sunucu kapalıysa istek yapılandırılmış retle dönüyor ve ekran
 * CTA'ya düşüyor.
 *
 * Mod RENGİ satırın solundaki noktada: seçicinin kendisi modların renkli
 * olduğunu öğrettiği yer (kullanıcı sohbet listesindeki halkaları burada
 * tanıyor).
 */
export interface ModeSelectorSheetProps {
  visible: boolean;
  onClose: () => void;
  mode: AppMode;
  /** Sunucudan gelen açık mod haritası; `undefined` = henüz bilinmiyor. */
  openModes?: Partial<Record<AppMode, boolean>>;
  onSelect: (mode: AppMode) => void;
  /** Kapalı modun satırına dokunuldu → mini kurulum akışını aç. */
  onOpenProfile: (mode: AppMode) => void;
}

export default function ModeSelectorSheet({
  visible,
  onClose,
  mode,
  openModes,
  onSelect,
  onOpenProfile,
}: ModeSelectorSheetProps) {
  const { t } = useTranslation();

  const handlePress = useCallback(
    (next: AppMode) => {
      // Bilinmiyorsa AÇIK varsay (yukarıdaki not): kullanıcıyı olmayan bir
      // kurulum akışına sokmaktansa isteği sunucuya bırak.
      const isOpen = openModes?.[next] !== false;
      // Sheet ÖNCE kapanıyor, sonra üst akış tetikleniyor: iki sheet üst üste
      // açılırsa (kurulum akışı da modal) gorhom'un stack davranışı
      // beklenmedik sıraya düşüyor (FeedUniversitySheet'teki aynı kural).
      onClose();
      if (isOpen) {
        if (next !== mode) onSelect(next);
      } else {
        onOpenProfile(next);
      }
    },
    [mode, onClose, onSelect, onOpenProfile, openModes],
  );

  return (
    <AppModal
      visible={visible}
      onClose={onClose}
      title={t("discover.mode.pickerTitle")}
      // İki satırlık sabit içerik → içerikten ölçülen sheet. `snapPoints` ile
      // %75'e açılsa sheet'in yarısı boş kalırdı.
      dynamicSizing
      scrollable={false}
      closeButton
      clearGlassHeader
      contentContainerStyle={{ paddingBottom: 28 }}
    >
      <View style={sectionGroupStyle()}>
        {APP_MODES.map((m, i) => (
          <ModeRow
            key={m}
            mode={m}
            selected={m === mode}
            open={openModes?.[m] !== false}
            first={i === 0}
            onPress={handlePress}
          />
        ))}
      </View>
    </AppModal>
  );
}

function ModeRow({
  mode,
  selected,
  open,
  first,
  onPress,
}: {
  mode: AppMode;
  selected: boolean;
  open: boolean;
  first: boolean;
  onPress: (mode: AppMode) => void;
}) {
  const { t } = useTranslation();

  return (
    <TouchableOpacity
      activeOpacity={0.7}
      onPress={() => onPress(mode)}
      style={{
        flexDirection: "row",
        alignItems: "center",
        gap: 12,
        paddingHorizontal: SECTION_GROUP_PAD_H,
        paddingVertical: 16,
        // Satır ayırıcısı ilk satırda YOK — kutunun üst kenarıyla çakışırdı.
        borderTopWidth: first ? 0 : 0.5,
        borderTopColor: colors.hairline,
      }}
    >
      {/* Mod rengi: sohbet listesindeki halkanın öğretildiği yer. */}
      <View
        style={{
          width: 10,
          height: 10,
          borderRadius: 5,
          backgroundColor: modeAccent(mode),
        }}
      />
      <View style={{ flex: 1 }}>
        <Text style={{ color: colors.text, fontSize: 17, fontWeight: "600" }}>
          {t(`discover.mode.title.${mode}`)}
        </Text>
        <Text
          style={{
            color: colors.textSecondary,
            fontSize: 13,
            lineHeight: 18,
            marginTop: 2,
          }}
        >
          {open
            ? t(`discover.mode.description.${mode}`)
            : t("discover.mode.openCta")}
        </Text>
      </View>
      {/* İşaret yuvası HER ZAMAN çiziliyor: koşullu olsaydı seçim anında metin
          alanı genişleyip satır yana kayardı (FeedFilterSheet > OptionRow'un
          aynı kuralı). Açık modda tik, kapalıda chevron. */}
      <View style={{ width: 22, alignItems: "center" }}>
        {!open ? (
          <SFIcon
            name="chevron.right"
            fallback={ChevronRight}
            size={16}
            color={colors.textSecondary}
            strokeWidth={2.5}
          />
        ) : selected ? (
          <SFIcon
            name="checkmark"
            fallback={Check}
            size={16}
            color={colors.text}
            strokeWidth={3}
            weight="bold"
          />
        ) : null}
      </View>
    </TouchableOpacity>
  );
}
