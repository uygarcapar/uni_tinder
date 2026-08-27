import React, { useEffect, useMemo, useState } from "react";
import { useTranslation } from "react-i18next";
import { View, Text, TouchableOpacity, Alert, Platform } from "react-native";
import {
  BottomSheetTextInput,
  BottomSheetFlatList,
} from "@gorhom/bottom-sheet";
import { Search, SearchX, Check, X } from "lucide-react-native";
import { Host, Button as SwiftUIButton } from "@expo/ui/swift-ui";
import {
  buttonStyle,
  tint,
  labelStyle,
  controlSize,
  font,
  containerShape,
  shapes,
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
import SFIcon from "@/shared/components/SFIcon";
import AppBottomSheet from "@/shared/components/AppBottomSheet";
import type { UniversityOption } from "@/shared/queries/commonQueries";
import { colors, isLight, veil } from "../../../shared/theme/colors";
import { glassFallback } from "../../../shared/theme/glass";
import { chromeBlurTint } from "@/shared/theme/blur";

// BottomSheetFlatList'in reanimated scroll handler kabul eden hali. `any`:
// gorhom'un generic prop tipleri Animated wrapper'dan geçince çözülemiyor
// (AppModal da BottomSheetScrollView için aynısını yapıyor).
const AnimatedBottomSheetFlatList: any =
  Animated.createAnimatedComponent(BottomSheetFlatList);

const HEADER_HEIGHT = 100;

type Props = {
  visible: boolean;
  onClose: () => void;
  /** Başlık dışarıdan gelir — allowlist ve blocklist aynı bileşeni kullanıyor. */
  title: string;
  items: UniversityOption[];
  initialSelectedValues: string[];
  maxLimit?: number;
  limitMsg?: string;
  onConfirm: (domains: string[]) => void;
};

// FilterModal'ın içinden açılan çoklu üniversite seçici.
//
// AppModal yerine doğrudan AppBottomSheet + AnimatedBottomSheetFlatList:
// üniversite listesi şehir listesinden uzun, virtualize olması gerekiyor ve
// AppModal'ın scrollable modu kendi ScrollView'ını dayatıyor (içine FlatList
// nest'lemek virtualization'ı bozar). Chrome — snapPoints, progressive blur
// header, drag pill, scroll ile fade-in eden başlık, glass butonlar — şehir
// picker'ıyla (AppModal) birebir aynı; SearchableListSheet ile aynı pattern.
export default function UniversityPickerModal({
  visible,
  onClose,
  title,
  items,
  initialSelectedValues,
  maxLimit,
  limitMsg,
  onConfirm,
}: Props) {
  const { t } = useTranslation();
  const [search, setSearch] = useState("");
  const [selected, setSelected] = useState<Set<string>>(
    () => new Set(initialSelectedValues),
  );

  const ordered = useMemo(() => {
    const q = search.trim().toLocaleLowerCase("tr");
    // Kullanıcı ismi bilmiyorsa domain'den de bulabilsin ("itu" → itu.edu.tr).
    const filtered = q
      ? items.filter(
          (i) =>
            (i.name ?? "").toLocaleLowerCase("tr").includes(q) ||
            i.domain.includes(q),
        )
      : items;
    if (selected.size === 0) return filtered;
    // Seçili olanlar listenin başında — görsel referans.
    const selectedItems: UniversityOption[] = [];
    const rest: UniversityOption[] = [];
    for (const it of filtered) {
      if (selected.has(it.domain)) selectedItems.push(it);
      else rest.push(it);
    }
    return [...selectedItems, ...rest];
  }, [items, search, selected]);

  const toggle = (domain: string) => {
    setSelected((prev) => {
      const next = new Set(prev);
      if (next.has(domain)) {
        next.delete(domain);
      } else {
        // Backend limiti aşan listeyi 400 ile reddediyor (eskiden sessizce
        // kırpıyordu) — sınıra burada takılıp kullanıcıyı hatadan önce uyarıyoruz.
        if (maxLimit && next.size >= maxLimit) {
          Alert.alert(
            t("common.limitReached"),
            limitMsg || t("common.limitReached"),
          );
          return prev;
        }
        next.add(domain);
      }
      return next;
    });
  };

  // ── Floating header animasyonu (AppModal / SearchableListSheet pattern) ──
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

  // Sheet kapanıp açıldığında mount kalıcı (FilterModal her zaman render
  // ediyor) → açılışta seçimi initial'a, arama ve scroll state'ini sıfırla.
  // Yoksa Bitti'ye basmadan kapatan kullanıcı bir sonraki açılışta bayat
  // seçim ve yarı-görünür header görüyor.
  useEffect(() => {
    if (visible) {
      setSelected(new Set(initialSelectedValues));
      scrollY.value = 0;
      titleTriggered.value = 0;
    } else {
      setSearch("");
    }
  }, [visible, initialSelectedValues, scrollY, titleTriggered]);

  return (
    <AppBottomSheet
      visible={visible}
      onClose={onClose}
      // İlk snap %75 — normal durum. İkinci snap %90 — keyboardBehavior="extend"
      // klavye açıldığında otomatik en yüksek snap'e çıkar → input klavyenin
      // üstünde dururken liste daha fazla görünür kalır. (CityPickerModal ile aynı.)
      snapPoints={["75%", "90%"]}
      // Drag pill'i header'ın içinde biz çiziyoruz; gorhom'un native handle'ı
      // açık kalırsa blur'un üstünde ikinci bir pill görünür.
      handleComponent={null}
      // FilterModal'ı kapatmadan üstüne biner.
      stackBehavior="push"
    >
      <View style={{ flex: 1 }}>
        <AnimatedBottomSheetFlatList
          data={ordered}
          keyExtractor={(item: UniversityOption) => item.domain}
          keyboardShouldPersistTaps="handled"
          showsVerticalScrollIndicator={false}
          onScroll={scrollHandler}
          scrollEventThrottle={16}
          style={{ backgroundColor: colors.bg }}
          contentContainerStyle={{
            paddingTop: HEADER_HEIGHT,
            paddingHorizontal: 20,
            paddingBottom: 40,
          }}
          ListHeaderComponent={
            /* Arama input — listenin üstünde, içerikle birlikte scroll olur */
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
                <SFIcon
                  name="magnifyingglass"
                  fallback={Search}
                  size={18}
                  color={colors.textSecondary}
                  strokeWidth={2}
                  weight="semibold"
                />
              </View>
              <BottomSheetTextInput
                value={search}
                onChangeText={setSearch}
                placeholder={t("discover.universityPicker.search")}
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
          renderItem={({ item }: { item: UniversityOption }) => {
            const isSelected = selected.has(item.domain);
            return (
              <TouchableOpacity
                // activeOpacity 1 — basılı tutarken solma yok. Tek geri bildirim
                // seçimin kendisi (dolgu + tik), FilterModal'daki pill'lerle aynı.
                activeOpacity={1}
                onPress={() => toggle(item.domain)}
                style={{
                  paddingVertical: 16,
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
                {/* Yalnızca isim gösteriliyor — domain (`*.edu.tr`) satırı
                    kaldırıldı. Arama HÂLÂ domain'i de tarıyor (bkz. `ordered`):
                    kullanıcı "itu" yazıp bulabilsin, ama ekranda teknik URL
                    görünmesin. */}
                <View style={{ flex: 1, marginRight: 32 }}>
                  <Text
                    style={{
                      color: isSelected ? colors.text : colors.textSecondary,
                      fontSize: 16,
                      fontWeight: "400",
                    }}
                  >
                    {item.name}
                  </Text>
                </View>
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
                    <SFIcon
                      name="checkmark"
                      fallback={Check}
                      size={18}
                      color={colors.text}
                      strokeWidth={2.5}
                      weight="bold"
                    />
                  </View>
                )}
              </TouchableOpacity>
            );
          }}
        />

        {/* Floating header — absolute, listenin üstüne biner. İlk açılışta
            background ve başlık transparent; scroll ile belirir. */}
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
          {/* Progressive blur background — opacity scroll'a bağlı. Üst köşeler
              AppBottomSheet'in container clip'inden (radius 36) geliyor. */}
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
                  locations={bgLocations as any}
                  colors={bgColors as any}
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

          {/* Custom drag pill — AppModal ile birebir. */}
          <View
            pointerEvents="none"
            style={{
              position: "absolute",
              top: 20,
              left: 0,
              right: 0,
              alignItems: "center",
            }}
          >
            <View
              style={{
                width: 36,
                height: 4,
                borderRadius: 2,
                // AppModal'daki drag pill ile aynı kural: açık modda tam siyah.
                backgroundColor: isLight() ? colors.text : colors.hairlineMuted,
              }}
            />
          </View>

          {/* Ortalanmış başlık — scroll 55px'i geçince fade-in. */}
          <Animated.View
            pointerEvents="none"
            style={[
              {
                position: "absolute",
                top: 0,
                left: 0,
                right: 0,
                height: HEADER_HEIGHT,
                alignItems: "center",
                justifyContent: "center",
              },
              titleAnimStyle,
            ]}
          >
            <Text
              style={{ color: colors.text, fontSize: 19, fontWeight: "700" }}
              numberOfLines={1}
            >
              {title}
            </Text>
          </Animated.View>

          {/* Sol X / sağ Bitti — scroll'dan bağımsız, her zaman görünür.
              Çoklu seçim olduğu için şehir picker'ından farklı olarak confirm
              butonu şart: satıra dokunmak sheet'i kapatmıyor, toggle ediyor. */}
          <View
            style={{
              position: "absolute",
              top: 0,
              left: 0,
              right: 0,
              height: HEADER_HEIGHT,
              flexDirection: "row",
              alignItems: "center",
              justifyContent: "space-between",
              paddingHorizontal: 16,
            }}
          >
            <View style={{ paddingVertical: 8 }}>
              {Platform.OS === "ios" ? (
                <Host matchContents>
                  <SwiftUIButton
                    label="Kapat"
                    systemImage="xmark"
                    onPress={onClose}
                    // AppModal'daki (FilterModal) kapat butonuyla BİREBİR aynı
                    // modifier seti — bu sheet FilterModal'ın üstüne bindiği
                    // için iki X yan yana görünüyor, boyut/şekil farkı göze
                    // çarpıyordu. controlSize+containerShape olmadan glass
                    // buton capsule kalıp daha küçük render oluyordu.
                    modifiers={[
                      buttonStyle("glass"),
                      controlSize("large"),
                      tint(colors.text),
                      labelStyle("iconOnly"),
                      font({ size: 17, weight: "medium" }),
                      containerShape(shapes.circle()),
                      ...glassFallback({
                        shape: "circle",
                        frame: { width: 46, height: 46 },
                      }),
                    ]}
                  />
                </Host>
              ) : (
                <TouchableOpacity
                  onPress={onClose}
                  activeOpacity={0.7}
                  style={{
                    width: 46,
                    height: 46,
                    borderRadius: 999,
                    backgroundColor: colors.hairlineSoft,
                    alignItems: "center",
                    justifyContent: "center",
                  }}
                >
                  <SFIcon
                    name="xmark"
                    fallback={X}
                    size={20}
                    color={colors.text}
                    strokeWidth={2}
                    weight="semibold"
                    style={{ pointerEvents: "none" }}
                  />
                </TouchableOpacity>
              )}
            </View>

            {Platform.OS === "ios" ? (
              <Host matchContents>
                <SwiftUIButton
                  label={t("common.done")}
                  onPress={() => onConfirm(Array.from(selected))}
                  modifiers={[
                    buttonStyle("glass"),
                    controlSize("large"),
                    tint(colors.text),
                    font({ size: 12, weight: "semibold" }),
                    ...glassFallback({
                      shape: "capsule",
                      padding: { horizontal: 18, vertical: 12 },
                    }),
                  ]}
                />
              </Host>
            ) : (
              <TouchableOpacity
                onPress={() => onConfirm(Array.from(selected))}
                activeOpacity={0.7}
                style={{
                  borderRadius: 999,
                  borderCurve: "continuous",
                  overflow: "hidden",
                  paddingHorizontal: 18,
                  paddingVertical: 12,
                  backgroundColor: colors.surface,
                  borderWidth: 0.5,
                  borderColor: colors.hairline,
                }}
              >
                <Text
                  style={{
                    color: colors.text,
                    fontWeight: "700",
                    fontSize: 15,
                  }}
                >
                  {t("common.done")}
                </Text>
              </TouchableOpacity>
            )}
          </View>
        </View>
      </View>
    </AppBottomSheet>
  );
}
