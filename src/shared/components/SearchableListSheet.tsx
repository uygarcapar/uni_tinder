import React, { useState, useMemo, useEffect } from "react";
import { View, Text, TouchableOpacity, Platform, Alert } from "react-native";
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

// BottomSheetFlatList'in reanimated handler kabul eden versiyonu —
// scroll değerini paylaşılan değere bağlamak için.
const AnimatedBottomSheetFlatList =
  Animated.createAnimatedComponent(BottomSheetFlatList);

const HEADER_HEIGHT = 100;

// Searchable sheet content (single + multi mode). EditModal ile aynı floating
// header pattern'i: ilk açılışta header transparent + title gizli, scroll ile
// blur + title fade-in. Search input içeriğin en üstünde (header'da değil).
//
// items shape: [{id, name, enumName, ...}]
//
// Single mode (default):
//   - initialValue: enumName (string)
//   - item tap → onConfirm(enumName) anında, sheet kapanır
//   - "Bitti" → onConfirm(localValue) (initial value)
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
}: any) => {
  const isValid =
    initialValue !== null && initialValue !== undefined && initialValue !== "";
  const localValue = isValid ? String(initialValue) : "";
  const [search, setSearch] = useState("");
  const [localSet, setLocalSet] = useState(() =>
    multi ? new Set(initialSelectedValues) : null,
  );

  const filtered = useMemo(() => {
    const q = search.trim().toLocaleLowerCase("tr");
    if (!q) return items;
    return items.filter((i) =>
      (i.name ?? "").toLocaleLowerCase("tr").includes(q),
    );
  }, [search, items]);

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

    const q = search.trim().toLocaleLowerCase("tr");
    if (q && !(selectedItem.name ?? "").toLocaleLowerCase("tr").includes(q)) {
      return filtered;
    }

    const rest = filtered.filter((i) => i.enumName !== localValue);
    return [selectedItem, ...rest];
  }, [filtered, items, localValue, multi, localSet, search]);

  const isItemSelected = (item) => {
    if (multi) return localSet?.has(item.enumName) ?? false;
    return item.enumName === localValue;
  };

  const handleItemPress = (item) => {
    if (multi) {
      setLocalSet((prev) => {
        const next = new Set(prev);
        if (next.has(item.enumName)) {
          next.delete(item.enumName);
        } else {
          if (maxLimit && next.size >= maxLimit) {
            Alert.alert("Sınır Aşıldı", limitMsg || "Sınır aşıldı.");
            return prev;
          }
          next.add(item.enumName);
        }
        return next;
      });
    } else {
      onConfirm(item.enumName);
    }
  };

  const handleDonePress = () => {
    if (multi) {
      onConfirm(Array.from(localSet ?? []));
    } else {
      onConfirm(localValue);
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
        style={{ backgroundColor: "#121212" }}
        contentContainerStyle={{
          paddingTop: HEADER_HEIGHT,
          paddingHorizontal: 16,
          paddingBottom: 32,
        }}
        ListHeaderComponent={
          <View style={{ position: "relative", marginBottom: 30 }}>
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
              <Search size={18} color="#9CA3AF" strokeWidth={2} />
            </View>
            <BottomSheetTextInput
              defaultValue=""
              onChangeText={setSearch}
              placeholder=""
              autoCorrect={false}
              autoCapitalize="none"
              style={{
                borderRadius: 999,
                borderCurve: "continuous",
                borderWidth: 0.5,
                borderColor: "rgba(255,255,255,0.1)",
                backgroundColor: "transparent",
                paddingLeft: 44,
                paddingRight: 16,
                paddingVertical: 14,
                color: "#fff",
                fontSize: 15,
              }}
            />
          </View>
        }
        ItemSeparatorComponent={() => <View style={{ height: 6 }} />}
        ListEmptyComponent={
          <View style={{ paddingVertical: 32, alignItems: "center" }}>
            <SearchX size={36} color="#fff" strokeWidth={1.75} />
            {search.trim() !== "" && (
              <Text
                style={{
                  color: "#fff",
                  fontSize: 15,
                  fontWeight: "500",
                  marginTop: 12,
                  textAlign: "center",
                }}
              >
                '{search.trim()}' bulunamadı
              </Text>
            )}
          </View>
        }
        renderItem={({ item }) => {
          const isSelected = isItemSelected(item);
          return (
            <TouchableOpacity
              activeOpacity={0.7}
              onPress={() => handleItemPress(item)}
              style={{
                paddingVertical: 20,
                paddingHorizontal: 16,
                flexDirection: "row",
                alignItems: "center",
                borderCurve: "continuous",
                overflow: "hidden",
                borderRadius: 999,
                backgroundColor: isSelected
                  ? "rgba(255,255,255,0.1)"
                  : "transparent",
                position: "relative",
              }}
            >
              <Text
                style={{
                  color: isSelected ? "#fff" : "#9CA3AF",
                  fontSize: 16,
                  fontWeight: "400",
                  flex: 1,
                  marginRight: 32,
                }}
              >
                {item.name}
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
                  <Check size={18} color="#fff" strokeWidth={2.5} />
                </View>
              )}
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
            <LinearGradient
              colors={["black", "rgba(0, 0, 0, 0.2)"]}
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
              tint={
                Platform.OS === "ios"
                  ? "systemChromeMaterialDark"
                  : "systemMaterialDark"
              }
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

        {/* Centered animated title — scroll 55px'i geçince fade-in. */}
        {title ? (
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
              style={{ color: "#fff", fontSize: 19, fontWeight: "700" }}
              numberOfLines={1}
            >
              {title}
            </Text>
          </Animated.View>
        ) : null}

        {/* Sol/sağ butonlar — her zaman görünür, scroll'dan bağımsız. */}
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
                  onPress={onCancel}
                  modifiers={[
                    buttonStyle("glass"),
                    tint("#ffffff"),
                    labelStyle("iconOnly"),
                    font({ size: 22, weight: "medium" }),
                  ]}
                />
              </Host>
            ) : (
              <TouchableOpacity
                onPress={onCancel}
                activeOpacity={0.7}
                style={{
                  width: 46,
                  height: 46,
                  borderRadius: 999,
                  backgroundColor: "rgba(255,255,255,0.08)",
                  alignItems: "center",
                  justifyContent: "center",
                }}
              >
                <X
                  size={24}
                  color="#fff"
                  strokeWidth={2}
                  pointerEvents="none"
                />
              </TouchableOpacity>
            )}
          </View>

          {Platform.OS === "ios" ? (
            <Host matchContents>
              <SwiftUIButton
                label="Bitti"
                onPress={handleDonePress}
                modifiers={[
                  buttonStyle("glass"),
                  controlSize("large"),
                  tint("#ffffff"),
                  font({ size: 12, weight: "semibold" }),
                ]}
              />
            </Host>
          ) : (
            <TouchableOpacity
              onPress={handleDonePress}
              activeOpacity={0.7}
              style={{
                borderRadius: 999,
                borderCurve: "continuous",
                overflow: "hidden",
                paddingHorizontal: 18,
                paddingVertical: 12,
                backgroundColor: "#1E1E1E",
                borderWidth: 0.5,
                borderColor: "rgba(255,255,255,0.1)",
              }}
            >
              <Text
                style={{
                  color: "#fff",
                  fontWeight: "700",
                  fontSize: 15,
                }}
              >
                Bitti
              </Text>
            </TouchableOpacity>
          )}
        </View>
      </View>
    </View>
  );
};

export default SearchableListSheet;
