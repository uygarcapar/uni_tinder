import React, { useEffect, useState, useRef, useCallback } from "react";
import {
  View,
  Text,
  Image,
  TouchableOpacity,
  TextInput,
  ActivityIndicator,
  Alert,
  Dimensions,
  Keyboard,
} from "react-native";
import { useDispatch, useSelector } from "react-redux";
import { GestureHandlerRootView } from "react-native-gesture-handler";
import Animated, {
  useSharedValue,
  withTiming,
  useAnimatedStyle,
  Easing,
} from "react-native-reanimated";

const { width: SCREEN_WIDTH } = Dimensions.get("window");
const ENTRY_DISTANCE = SCREEN_WIDTH * 1.2;
const ENTRY_DURATION = 180;
const ENTRY_EASING = Easing.out(Easing.cubic);
import { useSafeAreaInsets } from "react-native-safe-area-context";
import {
  BottomSheetModal,
  BottomSheetScrollView,
  BottomSheetBackdrop,
} from "@gorhom/bottom-sheet";
import MultiSlider from "@ptomasroos/react-native-multi-slider";
import {
  Flame,
  RotateCcw,
  SlidersHorizontal,
  X,
  Lock,
} from "lucide-react-native";
import LottieView from "lottie-react-native";
import SwipeWrapper from "../components/SwipeWrapper";
import SwipeOverlay from "../components/SwipeOverlay";
import PurchaseModal from "../components/PurchaseModal";
import api from "../services/api";
import { API_ENDPOINTS } from "../constants/api";
import {
  fetchPotentialMatches,
  performLike,
  performPass,
  nextCard,
  loadMoreProfiles,
  rewindCard,
  updateSwipeStats,
} from "../store/slices/swipeSlice";

const GENDER_OPTIONS = [
  { label: "Erkek", value: "Male" },
  { label: "Kadın", value: "Female" },
  { label: "Non-Binary", value: "NonBinary" },
  { label: "Diğer", value: "Other" },
];

const AnimatedFlameLoader = () => {
  return (
    <View
      style={{
        flex: 1,
        alignItems: "center",
        justifyContent: "center",
        marginBottom: 80,
      }}
    >
      <LottieView
        source={require("../../assets/Flame animation.json")}
        autoPlay
        loop
        style={{ width: 200, height: 200 }}
      />
    </View>
  );
};

function FilterModal({ bottomSheetRef, filters, isPremium, onSave, saving }) {
  const [local, setLocal] = useState(filters);
  const [isDragging, setIsDragging] = useState(false);

  useEffect(() => {
    setLocal(filters);
  }, [filters]);

  const renderBackdrop = useCallback(
    (props) => (
      <BottomSheetBackdrop
        {...props}
        appearsOnIndex={0}
        disappearsOnIndex={-1}
        opacity={0.5}
      />
    ),
    [],
  );

  const toggleGender = (value) => {
    const current = local.genders || [];
    setLocal((prev) => ({
      ...prev,
      genders: current.includes(value)
        ? current.filter((g) => g !== value)
        : [...current, value],
    }));
  };

  const pillInput = (val, onChange) => (
    <View
      style={{
        borderRadius: 999,
        borderCurve: "continuous",
        overflow: "hidden",
        borderWidth: 0.5,
        borderColor: "rgba(255,255,255,0.1)",
      }}
    >
      <TextInput
        style={{
          color: "#fff",
          fontSize: 16,
          paddingHorizontal: 16,
          paddingVertical: 14,
        }}
        value={String(val ?? "")}
        onChangeText={onChange}
        keyboardType="number-pad"
        maxLength={3}
        placeholderTextColor="#6B7280"
      />
    </View>
  );

  return (
    <BottomSheetModal
      ref={bottomSheetRef}
      snapPoints={["90%"]}
      enablePanDownToClose={true}
      enableOverDrag={false}
      enableContentPanningGesture={!isDragging}
      backdropComponent={renderBackdrop}
      backgroundStyle={{
        backgroundColor: "#121212",
        borderTopLeftRadius: 36,
        borderTopRightRadius: 36,
      }}
      handleIndicatorStyle={{ backgroundColor: "rgba(255,255,255,0.3)" }}
    >
      {/* Header */}
      <View
        style={{
          flexDirection: "row",
          alignItems: "center",
          paddingHorizontal: 20,
          paddingTop: 32,
          paddingBottom: 12,
          backgroundColor: "#121212",
        }}
      >
        <TouchableOpacity
          onPress={() => bottomSheetRef.current?.dismiss()}
          activeOpacity={0.7}
          style={{ width: 60 }}
        >
          <X size={22} color="#9CA3AF" strokeWidth={2} pointerEvents="none" />
        </TouchableOpacity>
        <Text
          style={{
            flex: 1,
            color: "#fff",
            fontSize: 15,
            fontWeight: "700",
            textAlign: "center",
          }}
        >
          Filtreler
        </Text>
        <TouchableOpacity
          onPress={() => {
            Keyboard.dismiss();
            onSave(local);
          }}
          disabled={saving}
          activeOpacity={0.7}
          style={{ alignItems: "flex-end" }}
        >
          {saving ? (
            <ActivityIndicator size={18} color="#fff" />
          ) : (
            <View
              style={{
                borderRadius: 999,
                borderCurve: "continuous",
                overflow: "hidden",
              }}
              className="flex row bg-[#1E1E1E] self-start justify-center text-center items-center border-[0.5px] border-white/10 px-3 py-3 gap-2 rounded-full"
            >
              <Text style={{ color: "#fff", fontWeight: "700", fontSize: 13 }}>
                Uygula
              </Text>
            </View>
          )}
        </TouchableOpacity>
      </View>

      <BottomSheetScrollView
        style={{ flex: 1, backgroundColor: "#121212" }}
        contentContainerStyle={{ paddingHorizontal: 20, paddingBottom: 40 }}
        showsVerticalScrollIndicator={false}
        nestedScrollEnabled={true}
        scrollEnabled={!isDragging}
      >
        {/* Age Range */}
        <Text
          style={{
            color: "#fff",
            fontWeight: "700",
            fontSize: 16,
            marginTop: 20,
            marginBottom: 12,
          }}
        >
          Yaş Aralığı
        </Text>
        <View style={{ alignItems: "center", marginBottom: 4 }}>
          <MultiSlider
            values={[local.ageRangeMin || 18, local.ageRangeMax || 65]}
            onValuesChangeStart={() => setIsDragging(true)}
            onValuesChange={(values) =>
              setLocal((p) => ({
                ...p,
                ageRangeMin: values[0],
                ageRangeMax: values[1],
              }))
            }
            onValuesChangeFinish={(values) => {
              setIsDragging(false);
              setLocal((p) => ({
                ...p,
                ageRangeMin: values[0],
                ageRangeMax: values[1],
              }));
            }}
            min={18}
            max={65}
            step={1}
            sliderLength={320}
            minMarkerOverlapDistance={100}
            selectedStyle={{ backgroundColor: "#fff" }}
            unselectedStyle={{ backgroundColor: "#374151" }}
            markerStyle={{
              backgroundColor: "#fff",
              height: 28,
              width: 28,
              borderRadius: 100,
              borderWidth: 0,
              marginTop: 2,
              shadowColor: "transparent",
              shadowOffset: { width: 0, height: 0 },
              shadowOpacity: 0,
              shadowRadius: 0,
              elevation: 0,
            }}
            containerStyle={{ height: 40 }}
            trackStyle={{ height: 4, borderRadius: 3 }}
          />
        </View>
        <View style={{ flexDirection: "row", justifyContent: "space-between" }}>
          <Text style={{ color: "#fff", fontSize: 22, fontWeight: "700" }}>
            {local.ageRangeMin || 18} yaş
          </Text>
          <Text style={{ color: "#fff", fontSize: 22, fontWeight: "700" }}>
            {(local.ageRangeMax || 65) === 65 ? "65+" : local.ageRangeMax || 65}{" "}
            yaş
          </Text>
        </View>

        {/* Distance */}
        <Text
          style={{
            color: "#fff",
            fontWeight: "700",
            fontSize: 16,
            marginTop: 28,
            marginBottom: 12,
          }}
        >
          Maksimum Mesafe (km)
        </Text>
        {pillInput(local.maxDistance, (v) => {
          const n = parseInt(v);
          setLocal((p) => ({ ...p, maxDistance: isNaN(n) ? "" : n }));
        })}

        {/* Gender */}
        <Text
          style={{
            color: "#fff",
            fontWeight: "700",
            fontSize: 16,
            marginTop: 28,
            marginBottom: 12,
          }}
        >
          Cinsiyet
        </Text>
        <View style={{ flexDirection: "row", flexWrap: "wrap", gap: 8 }}>
          {GENDER_OPTIONS.map((opt) => {
            const selected = (local.genders || []).includes(opt.value);
            return (
              <TouchableOpacity
                key={opt.value}
                onPress={() => toggleGender(opt.value)}
                activeOpacity={0.8}
                style={{
                  borderRadius: 999,
                  borderCurve: "continuous",
                  borderWidth: 0.5,
                  borderColor: selected ? "#fc4526" : "rgba(255,255,255,0.15)",
                  backgroundColor: selected
                    ? "rgba(252,69,38,0.12)"
                    : "transparent",
                  paddingHorizontal: 16,
                  paddingVertical: 10,
                }}
              >
                <Text
                  style={{
                    color: selected ? "#fc4526" : "#9CA3AF",
                    fontWeight: "600",
                    fontSize: 14,
                  }}
                >
                  {opt.label}
                </Text>
              </TouchableOpacity>
            );
          })}
        </View>

        {/* Premium-only fields */}
        <View
          style={{
            marginTop: 28,
            opacity: 0.4,
            pointerEvents: isPremium ? "auto" : "none",
          }}
        >
          <View
            style={{
              flexDirection: "row",
              alignItems: "center",
              marginBottom: 12,
            }}
          >
            <Text
              style={{
                color: "#fff",
                fontWeight: "700",
                fontSize: 16,
                flex: 1,
              }}
            >
              Şehir
            </Text>
            {!isPremium && <Lock size={15} color="#9CA3AF" />}
          </View>
          <View
            style={{
              borderRadius: 999,
              borderWidth: 0.5,
              borderColor: "rgba(255,255,255,0.1)",
              paddingHorizontal: 16,
              paddingVertical: 14,
            }}
          >
            <Text style={{ color: "#6B7280", fontSize: 16 }}>
              {local.preferredCity || "Seçilmedi"}
            </Text>
          </View>

          <View
            style={{
              flexDirection: "row",
              alignItems: "center",
              marginTop: 20,
              marginBottom: 12,
            }}
          >
            <Text
              style={{
                color: "#fff",
                fontWeight: "700",
                fontSize: 16,
                flex: 1,
              }}
            >
              Üniversite
            </Text>
            {!isPremium && <Lock size={15} color="#9CA3AF" />}
          </View>
          <View
            style={{
              borderRadius: 999,
              borderWidth: 0.5,
              borderColor: "rgba(255,255,255,0.1)",
              paddingHorizontal: 16,
              paddingVertical: 14,
            }}
          >
            <Text style={{ color: "#6B7280", fontSize: 16 }}>
              {local.preferredUniversityDomain || "Seçilmedi"}
            </Text>
          </View>
        </View>
      </BottomSheetScrollView>
    </BottomSheetModal>
  );
}

export default function DiscoverScreen() {
  const dispatch = useDispatch();
  const insets = useSafeAreaInsets();
  const { potentialMatches, currentIndex, loading, hasNextPage, loadingMore, remainingUndos } =
    useSelector((state) => state.swipe);

  const [isSwiping, setIsSwiping] = useState(false);
  const [lastSwipeWasPass, setLastSwipeWasPass] = useState(false);
  const purchaseBottomSheetRef = useRef(null);
  const [filters, setFilters] = useState({
    ageRangeMin: 18,
    ageRangeMax: 30,
    maxDistance: 50,
    genders: [],
    preferredCity: null,
    preferredUniversityDomain: null,
    isPremium: false,
  });
  const [filterSaving, setFilterSaving] = useState(false);

  const filterBottomSheetRef = useRef(null);
  const lastSwipePromiseRef = useRef(null);

  const dragX = useSharedValue(0);
  const overlayDragX = useSharedValue(0);
  const overlayOpacity = useSharedValue(1);
  const buttonDragX = useSharedValue(0);
  const programmaticSwipe = useSharedValue(0);
  const stackEntryX = useSharedValue(0);

  const stackEntryStyle = useAnimatedStyle(() => ({
    transform: [{ translateX: stackEntryX.value }],
  }));

  useEffect(() => {
    dispatch(fetchPotentialMatches(1));
  }, []);

  useEffect(() => {
    api
      .get(API_ENDPOINTS.SWIPE_FILTERS)
      .then((res) => {
        if (res.isSuccess && res.result) setFilters(res.result);
      })
      .catch(() => {});

    api
      .get(API_ENDPOINTS.SWIPE_STATS)
      .then((res) => {
        if (res.isSuccess && res.result) {
          const r = res.result;
          dispatch(updateSwipeStats({
            remainingSwipes: r.remainingSwipes ?? null,
            superLikesRemaining: r.superLikesRemaining ?? null,
            swipeCountResetAt: r.swipeCountResetAt ?? null,
            superLikeCountResetAt: r.superLikeCountResetAt ?? null,
            premiumExpiresAt: r.premiumExpiresAt ?? null,
            isPremium: r.isPremium ?? false,
            totalSwipesToday: r.totalSwipesToday ?? 0,
            likesToday: r.likesToday ?? 0,
            passesToday: r.passesToday ?? 0,
            superLikesToday: r.superLikesToday ?? 0,
            matchesToday: r.matchesToday ?? 0,
            remainingUndos: r.remainingUndos ?? null,
            undoCountResetAt: r.undoCountResetAt ?? null,
            remainingMissedMatchRecovery: r.remainingMissedMatchRecovery ?? null,
            missedMatchRecoveryResetAt: r.missedMatchRecoveryResetAt ?? null,
          }));
        }
      })
      .catch(() => {});
  }, []);

  useEffect(() => {
    const remainingCards = potentialMatches.length - currentIndex;
    if (remainingCards <= 5 && hasNextPage && !loadingMore) {
      dispatch(loadMoreProfiles());
    }
  }, [currentIndex, hasNextPage, loadingMore, potentialMatches.length]);

  const handleSwipe = (direction, userId) => {
    dispatch(nextCard());
    const isPass = direction !== "right";
    setLastSwipeWasPass(isPass);
    const action = isPass ? performPass(userId) : performLike(userId);
    lastSwipePromiseRef.current = dispatch(action);
  };

  const handleRewind = async () => {
    if (currentIndex === 0) return;
    if (!lastSwipeWasPass) return;
    if (remainingUndos === 0) {
      purchaseBottomSheetRef.current?.present();
      return;
    }

    // Optimistic UI: kart hemen geri gelir + animasyon
    dispatch(rewindCard());
    setLastSwipeWasPass(false);
    stackEntryX.value = -ENTRY_DISTANCE;
    stackEntryX.value = withTiming(0, {
      duration: ENTRY_DURATION,
      easing: ENTRY_EASING,
    });
    const prevUndos = remainingUndos;
    if (remainingUndos !== null && remainingUndos !== -1) {
      dispatch(updateSwipeStats({ remainingUndos: remainingUndos - 1 }));
    }

    // Race fix: bekleyen swipe varsa onun POST'u tamamlansın
    const pending = lastSwipePromiseRef.current;
    let swipeOk = true;
    if (pending) {
      try {
        const result = await pending;
        swipeOk = result?.meta?.requestStatus === "fulfilled";
      } catch {
        swipeOk = false;
      }
    }
    lastSwipePromiseRef.current = null;

    // Swipe POST başarısız olduysa: backend'de zaten swipe yok → Undo gönderme
    if (!swipeOk) {
      if (prevUndos !== null) dispatch(updateSwipeStats({ remainingUndos: prevUndos }));
      return;
    }

    try {
      const res = await api.post(API_ENDPOINTS.SWIPE_UNDO);
      if (res.isSuccess) {
        if (res.result?.remainingUndosToday != null) {
          dispatch(updateSwipeStats({ remainingUndos: res.result.remainingUndosToday }));
        }
      } else {
        dispatch(nextCard());
        if (prevUndos !== null) dispatch(updateSwipeStats({ remainingUndos: prevUndos }));
        Alert.alert("", res.result?.message || res.message || "Geri alınamadı");
      }
    } catch {
      dispatch(nextCard());
      if (prevUndos !== null) dispatch(updateSwipeStats({ remainingUndos: prevUndos }));
      Alert.alert("", "Geri alınamadı");
    }
  };

  const handleSaveFilters = async (localFilters) => {
    setFilterSaving(true);
    try {
      const payload = {
        ageRangeMin: localFilters.ageRangeMin || 18,
        ageRangeMax: localFilters.ageRangeMax || 30,
        maxDistance: localFilters.maxDistance || 50,
        genders: localFilters.genders,
      };
      const res = await api.put(API_ENDPOINTS.SWIPE_UPDATE_FILTERS, payload);
      if (res.isSuccess) {
        setFilters(res.result);
        await dispatch(fetchPotentialMatches(1))
          .unwrap()
          .catch(() => {});
        stackEntryX.value = ENTRY_DISTANCE;
        stackEntryX.value = withTiming(0, {
          duration: ENTRY_DURATION,
          easing: ENTRY_EASING,
        });
        filterBottomSheetRef.current?.dismiss();
      } else {
        Alert.alert("", res.message || "Filtreler kaydedilemedi");
      }
    } catch {
      Alert.alert("", "Filtreler kaydedilemedi");
    } finally {
      setFilterSaving(false);
    }
  };

  const handlePassButton = () => {
    if (isSwiping || potentialMatches.length <= currentIndex) return;
    setIsSwiping(true);
    programmaticSwipe.value = 1;
    setTimeout(() => setIsSwiping(false), 300);
  };

  const handleLikeButton = () => {
    if (isSwiping || potentialMatches.length <= currentIndex) return;
    setIsSwiping(true);
    programmaticSwipe.value = 2;
    setTimeout(() => setIsSwiping(false), 300);
  };

  const renderStack = () => {
    return potentialMatches
      .slice(currentIndex, currentIndex + 2)
      .reverse()
      .map((profile, index, array) => {
        const isTopCard = index === array.length - 1;
        return (
          <SwipeWrapper
            key={profile.userId}
            profile={profile}
            isTopCard={isTopCard}
            onSwipe={handleSwipe}
            dragX={dragX}
            overlayDragX={overlayDragX}
            overlayOpacity={overlayOpacity}
            buttonDragX={buttonDragX}
            programmaticSwipe={programmaticSwipe}
            onPass={handlePassButton}
            onLike={handleLikeButton}
          />
        );
      });
  };

  return (
    <GestureHandlerRootView style={{ flex: 1, backgroundColor: "#121212" }}>
      {/* Header */}
      <View style={{ backgroundColor: "#121212", paddingTop: insets.top }}>
        <View
          style={{
            height: 50,
            paddingHorizontal: 21,
            flexDirection: "row",
            alignItems: "center",
          }}
        >
          {/* Rewind */}
          <View style={{ flex: 1, alignItems: "flex-start" }}>
            <TouchableOpacity
              onPress={handleRewind}
              activeOpacity={0.7}
              style={{ opacity: lastSwipeWasPass ? 1 : 0.3 }}
            >
              <View style={{ position: "relative" }} pointerEvents="none">
                <RotateCcw size={24} color="#fff" strokeWidth={2} />
                {remainingUndos !== null && (
                  <View
                    style={{
                      position: "absolute",
                      bottom: -4,
                      right: -6,
                      backgroundColor: "#121212",
                      borderRadius: 999,
                      minWidth: 16,
                      height: 16,
                      alignItems: "center",
                      justifyContent: "center",
                      paddingHorizontal: 3,
                    }}
                  >
                    <Text
                      style={{
                        color: "#fff",
                        fontSize: 15,
                        fontWeight: "700",
                      }}
                    >
                      {remainingUndos === -1 ? "∞" : remainingUndos}
                    </Text>
                  </View>
                )}
              </View>
            </TouchableOpacity>
          </View>

          {/* Logo */}
          <Image
            source={require("../../assets/lit_name_white.png")}
            style={{ height: 50, width: 120 }}
            resizeMode="contain"
          />

          {/* Filter */}
          <View style={{ flex: 1, alignItems: "flex-end" }}>
            <TouchableOpacity
              onPress={() => filterBottomSheetRef.current?.present()}
              activeOpacity={0.7}
            >
              <View pointerEvents="none">
                <SlidersHorizontal size={24} color="#fff" strokeWidth={2} />
              </View>
            </TouchableOpacity>
          </View>
        </View>
      </View>

      {/* Cards */}
      <View style={{ flex: 1, paddingTop: 1, paddingBottom: 1 }}>
        {loading && potentialMatches.length === 0 ? (
          <AnimatedFlameLoader />
        ) : potentialMatches.length > currentIndex ? (
          <Animated.View
            style={[{ flex: 1, position: "relative" }, stackEntryStyle]}
          >
            {renderStack()}
            <SwipeOverlay dragX={overlayDragX} opacity={overlayOpacity} />
          </Animated.View>
        ) : (
          <View
            style={{
              flex: 1,
              alignItems: "center",
              justifyContent: "center",
              marginBottom: 80,
            }}
          >
            <Flame size={80} color="#fff" strokeWidth={1.3} />
            <Text
              className="text-gray-400"
              style={{
                fontWeight: "700",
                fontSize: 13,
                marginTop: 8,
              }}
            >
              Yeni profiller için bekle.
            </Text>
          </View>
        )}
      </View>

      <FilterModal
        bottomSheetRef={filterBottomSheetRef}
        filters={filters}
        isPremium={filters.isPremium}
        onSave={handleSaveFilters}
        saving={filterSaving}
      />
      <PurchaseModal bottomSheetRef={purchaseBottomSheetRef} />
    </GestureHandlerRootView>
  );
}
