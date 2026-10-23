import React, { useState, useMemo, useEffect } from "react";
import { useTranslation } from "react-i18next";
import { View, Text, TouchableOpacity, Platform, Alert } from "react-native";
import { BottomSheetFlatList } from "@gorhom/bottom-sheet";
import { SearchX, Check, X, type LucideIcon } from "@/shared/icons";
import SFIcon, { type SFSymbol } from "./SFIcon";
import SheetSearchInput from "./SheetSearchInput";
import {
  Host,
  Button as SwiftUIButton,
  Image as SwiftUIImage,
} from "@expo/ui/swift-ui";
import {
  accessibilityLabel,
  buttonStyle,
  tint,
  frame,
} from "@expo/ui/swift-ui/modifiers";
import Animated, {
  useSharedValue,
  useAnimatedStyle,
  useAnimatedScrollHandler,
  useAnimatedReaction,
  withTiming,
  interpolate,
  Extrapolation,
  Easing,
} from "react-native-reanimated";
import MaskedView from "@react-native-masked-view/masked-view";
import { easeGradient } from "react-native-easing-gradient";
import { BlurView } from "expo-blur";
import { LinearGradient } from "expo-linear-gradient";
import { foldForSearch } from "../utils/searchText";
import { colors, veil } from "../theme/colors";
import {
  glassFallback,
  glassIconClearGlyph,
  GLASS_ICON_CLEAR_SIZE,
} from "../theme/glass";
import GlassFallbackSurface from "./GlassFallbackSurface";
import { chromeBlurTint } from "@/shared/theme/blur";

// BottomSheetFlatList'in reanimated handler kabul eden versiyonu —
// scroll değerini paylaşılan değere bağlamak için.
const AnimatedBottomSheetFlatList =
  Animated.createAnimatedComponent(BottomSheetFlatList);

// AppModal'ın `MODAL_HEADER_HEIGHT`i ile BİREBİR aynı sayı — profil düzenleme
// modalı (ProfileEditModal) da onu çiziyor, bu sheet de aynı çizgide dursun
// diye. Dikey breakdown aynı: satır 20'de başlıyor, yüksekliği butonun kendisi
// kadar (GLASS_ICON_CLEAR_SIZE = 48), altta 6px nefes payı → 74. Eskiden 86'ydı
// ve satır bandın içinde ORTALANIYORDU; sayı AppModal'dan 12px fazla olduğu
// için başlık/butonlar o kadar aşağıda duruyordu.
const HEADER_HEIGHT = 74;
// Satırın bandın tepesinden payı — AppModal'ın MODAL_HEADER_ROW_TOP'u.
const HEADER_ROW_TOP = 20;
// Yuvarlak cam butonun çapı. Sayıyı uydurmuyoruz: uygulamadaki BÜTÜN berrak cam
// ikon butonları (profildeki çan/ayarlar, AppModal'ın clearGlassHeader yolundaki
// X + onay) bu tek sabitten besleniyor.
const ACTION_SIZE = GLASS_ICON_CLEAR_SIZE;

// Modül seviyesinde: inline default her render'da yeni kimlik üretir ve
// aşağıdaki memo'ları (liste filtresi/sıralaması) her render'da geçersiz kılardı.
const defaultLabelOf = (item: any) => item?.name ?? "";

/**
 * Satırın sağındaki kutu — şehir/kampüs seçicilerle AYNI ölçü (bkz.
 * CityPickerModal, FeedUniversitySheet). Uygulamada "uzun listeden seç"
 * sheet'lerinin tek işaret dili bu; sayı üç dosyada da 22.
 */
const CHECKBOX_SIZE = 22;

/**
 * Header'ın YUVARLAK cam ikon butonu — X (sol) ve onay (sağ) TEK buradan
 * çıkıyor, yani ölçü/malzeme/glif puntosu iki uçta birebir aynı.
 *
 * Zincir AppModal'ın `clearGlassHeader` yolundan kopya (ProfileEditModal'ın
 * çizdiği buton): dolgulu `buttonStyle("glass")` KABUĞU değil, `.plain` butonun
 * GLİFİNE takılan BERRAK cam (`glassIconClearGlyph`). Gerekçeler theme/glass.ts'te
 * — kısaca: `buttonStyle("glass")` yalnız `.regular` cam veriyor, berrağın tek
 * yolu `glassEffect(.clear)` ve o bir arka plan çizdiği için buton stilinin
 * `.plain`e inmesi, cam + frame + contentShape'in de glifin üstünde durması
 * şart (yoksa dokunma alanı 17pt'lik glif kutusunda kalır).
 *
 * `label`/`systemImage` PROP'LARI YOK: verildiği anda native taraf children'ı
 * yok sayıyor, erişilebilirlik adı bu yüzden modifier'dan geliyor.
 */
const renderHeaderIconButton = (
  symbol: SFSymbol,
  fallback: LucideIcon,
  onPress: (() => void) | undefined,
  label: string,
) => {
  const handlePress = onPress ?? (() => {});

  return Platform.OS === "ios" ? (
    // Host'ta `matchContents` YOK (bkz. AppModal): SwiftUI ölçümü ikinci Fabric
    // commit'inde geldiği için ilk frame'de 0 genişlikte kalıyor, space-between
    // satırında butonlar kenara yapışıp ölçüm gelince yerine zıplıyordu.
    // Sarmalayıcı iOS 26 ALTINDA zemini veriyor, 26+'da hiç render olmuyor;
    // ölçüsü glassFallback'in frame'iyle BİREBİR aynı olmalı.
    <GlassFallbackSurface shape="circle" width={ACTION_SIZE} height={ACTION_SIZE}>
      <Host style={{ width: ACTION_SIZE, height: ACTION_SIZE }}>
        <SwiftUIButton
          onPress={handlePress}
          modifiers={[
            buttonStyle("plain"),
            tint(colors.text),
            frame({ width: ACTION_SIZE, height: ACTION_SIZE }),
            accessibilityLabel(label),
            ...glassFallback({ shape: "circle" }),
          ]}
        >
          <SwiftUIImage
            systemName={symbol}
            color={colors.text}
            modifiers={glassIconClearGlyph(ACTION_SIZE)}
          />
        </SwiftUIButton>
      </Host>
    </GlassFallbackSurface>
  ) : (
    <TouchableOpacity
      onPress={handlePress}
      activeOpacity={0.7}
      accessibilityRole="button"
      accessibilityLabel={label}
      style={{
        width: ACTION_SIZE,
        height: ACTION_SIZE,
        borderRadius: 999,
        backgroundColor: colors.hairlineSoft,
        alignItems: "center",
        justifyContent: "center",
      }}
    >
      <SFIcon
        name={symbol}
        fallback={fallback}
        size={20}
        color={colors.text}
        strokeWidth={2}
        weight="semibold"
        style={{ pointerEvents: "none" }}
      />
    </TouchableOpacity>
  );
};

// Searchable sheet content (single + multi mode). EditModal ile aynı floating
// header pattern'i: ilk açılışta header transparent + title gizli, scroll ile
// blur + title fade-in. Search input içeriğin en üstünde (header'da değil).
//
// items shape: [{id, name, enumName, ...}]
//
// labelOf: satırda çizilecek ve ARAMANIN taradığı metni üretir. Varsayılan
// `item.name` — sunucuda tek dile çözülmüş alan. Listesi çift dilli `display`
// taşıyan uçlar (bölümler) bunu geçip resolveLocalized ile çözmeli, yoksa
// backend'in dil tercihi istemcininkinden ayrıştığında liste yanlış dilde çıkar.
//
// SATIR GÖRÜNÜMÜ ŞEHİR SEÇİCİNİN BİREBİR KALIBI (bkz. CityPickerModal,
// FeedUniversitySheet): dolgusuz satır + sağda sabit yuvarlak kare kutu,
// seçiliyken dolu + beyaz tik. Eskiden seçili satır `hairline` kapsül dolgusuna
// bürünüp sağına sade bir ✓ koyuyordu; aynı işi yapan üç sheet'in üçü de artık
// aynı işareti çiziyor.
//
// Single mode (default):
//   - initialValue: enumName (string)
//   - item tap → YALNIZ taslağı değiştirir (sheet kapanmaz)
//   - "Bitti" (header'daki ✓) → onConfirm(draft)
//
// ⚠️ SEÇİM ONAYLI. Eskiden satıra dokunmak doğrudan `onConfirm` çağırıp sheet'i
// kapatıyordu; header'da X + ✓ duran bir sheet'te o iki buton anlamsız kalıyor
// (FeedUniversitySheet'te aynı gerekçeyle değişti). Dokunuş taslağı yazar,
// uygulayan şey ✓, X ise taslağı atar.
//
// Multi mode (multi={true}):
//   - initialSelectedValues: enumName array
//   - item tap → local Set'te toggle
//   - "Bitti" → onConfirm(enumNames array)
//   - maxLimit aşılırsa Alert + no-op
const SearchableListSheet = ({
  initialValue,
  initialSelectedValues = [],
  onConfirm,
  onCancel,
  items,
  title,
  multi = false,
  maxLimit,
  limitMsg,
  labelOf = defaultLabelOf,
}: any) => {
  const { t } = useTranslation();
  const isValid =
    initialValue !== null && initialValue !== undefined && initialValue !== "";
  /**
   * LİSTENİN BAŞINA ALINAN anahtar — taslak DEĞİL.
   *
   * Sıralama taslağa bakarsa satıra dokunan kullanıcı seçtiğini parmağının
   * altından kaybediyor: liste anında yeniden diziliyor ve seçilen en tepeye
   * uçuyor (bkz. CityPickerModal'daki aynı not). Bu değer prop'tan geliyor ve
   * sheet açıkken değişmiyor — bileşen her açılışta yeniden mount ediliyor.
   */
  const localValue = isValid ? String(initialValue) : "";
  const [search, setSearch] = useState("");
  // Single mode'un taslağı. Mount = açılış (çağıran koşullu mount ediyor), bu
  // yüzden prop'u izleyen bir efekt gerekmiyor.
  const [draft, setDraft] = useState(localValue);
  const [localSet, setLocalSet] = useState(() =>
    multi ? new Set(initialSelectedValues) : null,
  );

  const filtered = useMemo(() => {
    const q = foldForSearch(search.trim());
    if (!q) return items;
    return items.filter((i) => foldForSearch(labelOf(i)).includes(q));
  }, [search, items, labelOf]);

  const orderedItems = useMemo(() => {
    // Multi mode: seçili itemleri listenin başına çek (görsel referans).
    if (multi) {
      if (!localSet || localSet.size === 0) return filtered;
      const selected = [];
      const rest = [];
      for (const it of filtered) {
        if (localSet.has(it.enumName)) selected.push(it);
        else rest.push(it);
      }
      return [...selected, ...rest];
    }
    // Single mode: tek seçili itemi başa çek.
    if (!localValue) return filtered;
    const selectedItem = items.find((i) => i.enumName === localValue);
    if (!selectedItem) return filtered;

    const q = foldForSearch(search.trim());
    if (q && !foldForSearch(labelOf(selectedItem)).includes(q)) {
      return filtered;
    }

    const rest = filtered.filter((i) => i.enumName !== localValue);
    return [selectedItem, ...rest];
  }, [filtered, items, localValue, multi, localSet, search, labelOf]);

  const isItemSelected = (item) => {
    if (multi) return localSet?.has(item.enumName) ?? false;
    // İşaret TASLAĞA bakıyor (sıralamanın baktığı `localValue`e değil):
    // dokunulan satırın kutusu anında doluyor, yeri değişmeden.
    return item.enumName === draft;
  };

  const handleItemPress = (item) => {
    if (multi) {
      setLocalSet((prev) => {
        const next = new Set(prev);
        if (next.has(item.enumName)) {
          next.delete(item.enumName);
        } else {
          if (maxLimit && next.size >= maxLimit) {
            Alert.alert(t("common.limitReached"), limitMsg || t("common.limitReached"));
            return prev;
          }
          next.add(item.enumName);
        }
        return next;
      });
    } else {
      setDraft(item.enumName);
    }
  };

  const handleDonePress = () => {
    if (multi) {
      onConfirm(Array.from(localSet ?? []));
    } else {
      onConfirm(draft);
    }
  };

  // ── Floating header animasyonu (ScreenHeader / EditModal pattern) ──
  const scrollY = useSharedValue(0);
  const scrollHandler = useAnimatedScrollHandler({
    onScroll: (e) => {
      scrollY.value = e.contentOffset.y;
    },
  });

  const headerBgStyle = useAnimatedStyle(() => ({
    opacity: interpolate(scrollY.value, [0, 60], [0, 1], Extrapolation.CLAMP),
  }));

  const titleTriggered = useSharedValue(0);
  useAnimatedReaction(
    () => scrollY.value > 55,
    (isPast, prev) => {
      if (isPast !== prev) {
        titleTriggered.value = withTiming(isPast ? 1 : 0, {
          duration: 450,
          easing: Easing.out(Easing.cubic),
        });
      }
    },
  );
  const titleAnimStyle = useAnimatedStyle(() => ({
    opacity: titleTriggered.value,
    transform: [{ translateY: 12 * (1 - titleTriggered.value) }],
  }));

  const { colors: bgColors, locations: bgLocations } = useMemo(
    () =>
      easeGradient({
        colorStops: {
          0: { color: "rgba(0,0,0,0.99)" },
          0.5: { color: "black" },
          1: { color: "transparent" },
        },
      }),
    [],
  );

  // Sheet her mount'ta scroll sıfırla.
  useEffect(() => {
    scrollY.value = 0;
    titleTriggered.value = 0;
  }, [scrollY, titleTriggered]);

  return (
    <View style={{ flex: 1 }}>
      <AnimatedBottomSheetFlatList
        data={orderedItems}
        keyExtractor={(item) => String(item.id)}
        keyboardShouldPersistTaps="handled"
        showsVerticalScrollIndicator={false}
        onScroll={scrollHandler}
        scrollEventThrottle={16}
        style={{ backgroundColor: colors.bg }}
        contentContainerStyle={{
          paddingTop: HEADER_HEIGHT,
          paddingHorizontal: 16,
          paddingBottom: 32,
        }}
        ListHeaderComponent={
          /* Arama input — diğer seçicilerle ortak bileşen (bkz.
             SheetSearchInput). `value` GEÇİLMİYOR: burada input kontrolsüz
             kalıyor, liste zaten arama state'iyle yeniden diziliyor.
             Alttaki 30pt'lik boşluk bu sheet'e özel, o yüzden stilden. */
          <SheetSearchInput
            onChangeText={setSearch}
            style={{ marginBottom: 30 }}
          />
        }
        ItemSeparatorComponent={() => <View style={{ height: 6 }} />}
        ListEmptyComponent={
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
        }
        renderItem={({ item }) => {
          const isSelected = isItemSelected(item);
          return (
            <TouchableOpacity
              // activeOpacity 1 — basılı tutarken solma yok. Tek geri bildirim
              // seçimin kendisi (sağdaki kutu). Şehir/kampüs seçicilerle aynı.
              activeOpacity={1}
              onPress={() => handleItemPress(item)}
              // ZEMİN HİÇ DEĞİŞMİYOR: seçili satır eskiden `hairline` kapsül
              // dolgusuna bürünüyordu, seçimi söyleyen tek şey artık sağdaki
              // kutu. Dolgu kalkınca `borderRadius`/`overflow` da işsiz kaldı
              // (yuvarlatacak yüzey yok) ve satırın kendi yatay payı düştü:
              // metin artık arama input'uyla aynı hizada (kap zaten 16 veriyor).
              style={{
                paddingVertical: 18,
                flexDirection: "row",
                alignItems: "center",
              }}
            >
              <Text
                style={{
                  color: isSelected ? colors.text : colors.textSecondary,
                  fontSize: 16,
                  // 400 → 500: kutu taşıyan satırların ağırlığı (bkz.
                  // CityPickerModal); 400 o kutunun yanında silik kalıyor.
                  fontWeight: "500",
                  flex: 1,
                  marginRight: 12,
                }}
              >
                {labelOf(item)}
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
        }}
      />

      {/* Floating header — absolute, içerik üstüne biner. İlk açılışta
          background ve title transparent; scroll ile belirir. */}
      <View
        pointerEvents="box-none"
        style={{
          position: "absolute",
          top: 0,
          left: 0,
          right: 0,
          height: HEADER_HEIGHT,
          zIndex: 10,
        }}
      >
        {/* Progressive blur background — opacity scroll'a bağlı */}
        <Animated.View
          pointerEvents="none"
          style={[
            {
              position: "absolute",
              top: 0,
              left: 0,
              right: 0,
              height: HEADER_HEIGHT,
            },
            headerBgStyle,
          ]}
        >
          <MaskedView
            maskElement={
              <LinearGradient
                locations={bgLocations}
                colors={bgColors}
                style={{
                  position: "absolute",
                  top: 0,
                  left: 0,
                  right: 0,
                  bottom: 0,
                }}
              />
            }
            style={{
              position: "absolute",
              top: 0,
              left: 0,
              right: 0,
              bottom: 0,
            }}
          >
            {/* Derinlik perdesi — koyuda karartır, açıkta AYNI oranlarla
                beyazlatır (veil). Maske siyah/şeffaf kalır: alfa maskesi. */}
            <LinearGradient
              colors={[veil(1), veil(0.2)]}
              style={{
                position: "absolute",
                top: 0,
                left: 0,
                right: 0,
                bottom: 0,
              }}
            />
            <BlurView
              intensity={15}
              tint={chromeBlurTint()}
              style={{
                position: "absolute",
                top: 0,
                left: 0,
                right: 0,
                bottom: 0,
              }}
            />
          </MaskedView>
        </Animated.View>

        {/* Drag pill YOK — AppModal ile birebir (bkz. MODAL_HEADER_HEIGHT notu).
            Sheet aşağı çekilerek kapanmaya devam ediyor. */}

        {/* Title + butonlar AYNI satırda (AppModal ile birebir): satır bandın
            tepesinden 20px'te başlıyor ve yüksekliği butonun kendisi kadar,
            başlık da o satırın içinde ortalanıyor — yani ✓/X ile aynı eksende.
            Butonlar her zaman görünür; başlık scroll 55px'i geçince fade-in. */}
        <View
          style={{
            position: "absolute",
            top: HEADER_ROW_TOP,
            // left + right İKİSİ DE ŞART: biri düşerse satır ekran genişliğine
            // yayılmaz, space-between yayılacak boşluk bulamaz.
            left: 0,
            right: 0,
            height: ACTION_SIZE,
            flexDirection: "row",
            alignItems: "center",
            justifyContent: "space-between",
            paddingHorizontal: 16,
          }}
        >
          {title ? (
            <Animated.View
              pointerEvents="none"
              style={[
                {
                  position: "absolute",
                  top: 0,
                  left: 0,
                  right: 0,
                  bottom: 0,
                  alignItems: "center",
                  justifyContent: "center",
                },
                titleAnimStyle,
              ]}
            >
              <Text
                style={{
                  color: colors.text,
                  fontSize: 18,
                  fontWeight: "700",
                  includeFontPadding: false,
                  textAlignVertical: "center",
                }}
                numberOfLines={1}
              >
                {title}
              </Text>
            </Animated.View>
          ) : null}

          {/* AppModal'ın satırıyla aynı 8px dikey pay — buton kutusu satırın
              tam ortasında kalsın diye iki uçta da var. */}
          <View style={{ paddingVertical: 8 }}>
            {renderHeaderIconButton("xmark", X, onCancel, t("common.close"))}
          </View>

          {/* "Bitti" METİN KAPSÜLÜ DEĞİL — soldaki X ile birebir aynı yuvarlak
              cam kutu, yalnız sembolü ✓ (AppModal'ın actionIcon yolunun bu
              sheet'teki karşılığı). */}
          <View style={{ paddingVertical: 8 }}>
            {renderHeaderIconButton(
              "checkmark",
              Check,
              handleDonePress,
              t("common.done"),
            )}
          </View>
        </View>
      </View>
    </View>
  );
};

export default SearchableListSheet;
