import { useRef, useState } from "react";
import { View, Text, TouchableOpacity, Animated } from "react-native";
import { Check, ChevronDown, ChevronUp } from "lucide-react-native";
import SFIcon from "./SFIcon";
import { useTranslation } from "react-i18next";
import {
  resolveLocalized,
  type GenderCategoryOption,
  type GenderSubOption,
} from "@/shared/queries/commonQueries";
import { colors } from "@/shared/theme/colors";

// Kategori (Erkek / Kadın / Non-Binary) + genişletilebilir alt cinsiyet listesi.
// RegisterStep7 ve EditProfileForm aynı bileşeni kullanıyor — kayıtta seçilen
// cinsiyetin profil düzenlemede birebir aynı UI ile değiştirilebilmesi için.
//
// Seçim `enumName` üzerinden takip ediliyor, `id` üzerinden DEĞİL: backend
// Transgender'ı hem Erkek hem Kadın kategorisinde döndürüyor, yani id kategoriler
// arasında tekil değil. Hangi kategorinin açık olduğunu ayrıca tutuyoruz.

type Props = {
  categories: GenderCategoryOption[];
  /** Seçili GenderType enumName'i, ör. "TransMale". Boş string = seçim yok. */
  value: string;
  onChange: (enumName: string) => void;
};

// `display` çift dilli { tr, en } objesi olarak geliyor — resolveLocalized ile
// çözülmeden render edilirse React "Objects are not valid as a React child"
// hatası verir. `name` sunucu tarafında Accept-Language ile çözülmüş string,
// fallback olarak kullanılıyor.
const labelOf = (o: GenderSubOption, language: string) =>
  resolveLocalized(o.display, language, o.name);

const categoryLabelOf = (c: GenderCategoryOption, language: string) =>
  resolveLocalized(c.categoryDisplay, language, c.categoryName);

/** value'yu içeren ilk kategorinin enumName'i (yoksa null). */
const categoryOfValue = (
  categories: GenderCategoryOption[],
  value: string,
): string | null => {
  if (!value) return null;
  const cat = categories.find((c) =>
    c.subGenders.some((sg) => sg.enumName === value),
  );
  return cat?.categoryEnumName ?? null;
};

const AnimatedPressable = ({ onPress, onLayout, style, children }: any) => {
  const scale = useRef(new Animated.Value(1)).current;

  const handlePressIn = () =>
    Animated.spring(scale, {
      toValue: 0.95,
      useNativeDriver: true,
      speed: 20,
    }).start();

  const handlePressOut = () =>
    Animated.spring(scale, {
      toValue: 1,
      useNativeDriver: true,
      bounciness: 8,
      speed: 20,
    }).start();

  return (
    <Animated.View style={{ transform: [{ scale }] }}>
      <TouchableOpacity
        activeOpacity={1}
        onPressIn={handlePressIn}
        onPressOut={handlePressOut}
        onPress={onPress}
        onLayout={onLayout}
        style={style}
      >
        {children}
      </TouchableOpacity>
    </Animated.View>
  );
};

export default function GenderCategoryPicker({
  categories,
  value,
  onChange,
}: Props) {
  const { t, i18n } = useTranslation();
  const language = i18n.language;

  // Kullanıcı kategori değiştirdikçe bunu güncelliyoruz; ilk değer value'dan
  // türetiliyor. Ayrı state tutmamızın sebebi: Transgender iki kategoride birden
  // olduğu için value tek başına hangi kategorinin açılacağını söylemiyor.
  const [selectedCatEnum, setSelectedCatEnum] = useState(() =>
    categoryOfValue(categories, value),
  );
  const [expandedCatEnum, setExpandedCatEnum] = useState<string | null>(null);
  const [pillHeights, setPillHeights] = useState<Record<string, number>>({});

  // categories async geldiyse (useGenders) ilk render'da boş olabilir; liste
  // dolduğunda kategoriyi bir kez türet.
  const derivedCat = categoryOfValue(categories, value);
  const activeCatEnum = selectedCatEnum ?? derivedCat;

  const handleSelectCategory = (category: GenderCategoryOption) => {
    if (activeCatEnum === category.categoryEnumName) {
      setExpandedCatEnum((prev) =>
        prev === category.categoryEnumName ? null : category.categoryEnumName,
      );
      return;
    }
    setSelectedCatEnum(category.categoryEnumName);
    setExpandedCatEnum(null);
    const primary = category.subGenders[0];
    if (primary) onChange(primary.enumName);
  };

  const handleSelectSubGender = (enumName: string) => {
    setExpandedCatEnum(null);
    onChange(enumName);
  };

  return (
    <View style={{ gap: 12 }}>
      {categories.map((category) => {
        const catEnum = category.categoryEnumName;
        const isSelected = activeCatEnum === catEnum;
        const isExpanded = expandedCatEnum === catEnum;
        const pillHeight = pillHeights[catEnum];

        // Kategori pill'i normalde kategori adını gösterir; kullanıcı alt
        // cinsiyet seçtiyse (primary olan değilse) onun adını gösterir.
        const selectedSub = isSelected
          ? category.subGenders.find((sg) => sg.enumName === value)
          : undefined;
        const isPrimary = category.subGenders[0]?.enumName === value;
        const pillLabel =
          selectedSub && !isPrimary
            ? labelOf(selectedSub, language)
            : categoryLabelOf(category, language);

        return (
          <View key={catEnum}>
            <View style={{ position: "relative" }}>
              <AnimatedPressable
                onPress={() => handleSelectCategory(category)}
                onLayout={(e: any) => {
                  const { height } = e.nativeEvent.layout;
                  setPillHeights((prev) =>
                    prev[catEnum] === height
                      ? prev
                      : { ...prev, [catEnum]: height },
                  );
                }}
                style={{
                  borderRadius: 30,
                  borderCurve: "continuous",
                  overflow: "hidden",
                  borderWidth: 0.5,
                  borderColor: isSelected
                    ? colors.text
                    : "rgba(255,255,255,0.1)",
                  backgroundColor: isSelected ? colors.text : "transparent",
                  paddingHorizontal: 20,
                  paddingVertical: 18,
                }}
              >
                <Text
                  style={{
                    color: isSelected ? colors.bg : colors.text,
                    fontSize: 17,
                    fontWeight: "600",
                  }}
                >
                  {pillLabel}
                </Text>
                {isSelected && (
                  <View
                    style={{
                      flexDirection: "row",
                      alignItems: "center",
                      gap: 4,
                      marginTop: 6,
                    }}
                  >
                    <Text
                      style={{
                        color: colors.neutral700,
                        fontSize: 12,
                        fontWeight: "500",
                      }}
                    >
                      {t('auth.step7.detailedSelect')}
                    </Text>
                    {isExpanded ? (
                      <SFIcon
                        name="chevron.up"
                        fallback={ChevronUp}
                        size={14}
                        color={colors.neutral700}
                        strokeWidth={2.5}
                        weight="bold"
                      />
                    ) : (
                      <SFIcon
                        name="chevron.down"
                        fallback={ChevronDown}
                        size={14}
                        color={colors.neutral700}
                        strokeWidth={2.5}
                        weight="bold"
                      />
                    )}
                  </View>
                )}
              </AnimatedPressable>

              {isSelected && pillHeight != null && (
                <View
                  pointerEvents="none"
                  style={{
                    position: "absolute",
                    right: 20,
                    top: 0,
                    height: pillHeight,
                    justifyContent: "center",
                  }}
                >
                  <SFIcon
                    name="checkmark"
                    fallback={Check}
                    size={20}
                    color={colors.bg}
                    strokeWidth={2.5}
                    weight="bold"
                  />
                </View>
              )}
            </View>

            {isSelected && isExpanded && (
              <View style={{ gap: 8, marginTop: 8 }}>
                {category.subGenders.map((subGender, idx) => {
                  const isSubSelected = value === subGender.enumName;
                  // İlk (primary) seçenek kategoriyle aynı adı taşıyor: pill'de
                  // "Erkek" yazarken listede yine "Erkek" görünmesin diye
                  // "Sadece Erkek" olarak etiketliyoruz. Listeden çıkarmıyoruz —
                  // TransMale seçtikten sonra düz Male'e dönüş yolu bu.
                  const subLabel =
                    idx === 0
                      ? t('auth.step7.primaryOption', {
                          category: categoryLabelOf(category, language),
                        })
                      : labelOf(subGender, language);
                  return (
                    <AnimatedPressable
                      key={`${catEnum}-${subGender.enumName}`}
                      onPress={() => handleSelectSubGender(subGender.enumName)}
                      style={{
                        borderRadius: 999,
                        borderCurve: "continuous",
                        overflow: "hidden",
                        borderWidth: 0.5,
                        borderColor: isSubSelected
                          ? colors.text
                          : "rgba(255,255,255,0.1)",
                        backgroundColor: isSubSelected
                          ? colors.text
                          : "rgba(255,255,255,0.08)",
                        paddingHorizontal: 20,
                        paddingVertical: 16,
                      }}
                    >
                      <Text
                        style={{
                          color: isSubSelected ? colors.bg : colors.text,
                          fontSize: 15,
                          fontWeight: "500",
                        }}
                      >
                        {subLabel}
                      </Text>
                      {isSubSelected && (
                        <View
                          pointerEvents="none"
                          style={{
                            position: "absolute",
                            right: 20,
                            top: 0,
                            bottom: 0,
                            justifyContent: "center",
                          }}
                        >
                          <SFIcon
                            name="checkmark"
                            fallback={Check}
                            size={18}
                            color={colors.bg}
                            strokeWidth={2.5}
                            weight="bold"
                          />
                        </View>
                      )}
                    </AnimatedPressable>
                  );
                })}
              </View>
            )}
          </View>
        );
      })}
    </View>
  );
}
