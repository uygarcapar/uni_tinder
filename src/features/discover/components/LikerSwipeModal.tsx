import { useEffect } from "react";
import { Modal, View, TouchableOpacity, StatusBar } from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { GestureHandlerRootView } from "react-native-gesture-handler";
import { useSharedValue } from "react-native-reanimated";
import { X } from "lucide-react-native";
import SwipeWrapper from "@/features/discover/components/SwipeWrapper";
import { useSwipeMutation } from "@/features/discover/swipeQueries";
import {
  cardExpandAnim,
  cardPullProgress,
  containerExpand,
} from "@/shared/services/uiBus";
import { colors } from "../../../shared/theme/colors";

/**
 * Premium kullanıcının LikesScreen'de bir karta tıkladığında açılan
 * tam ekran interactive SwipeWrapper. Sağa kaydırma = Like (match
 * tetikleyebilir, global MatchModal SignalR üzerinden gelir), sola
 * kaydırma = Pass, yukarı = SuperLike. Swipe tamamlanınca modal kapanır.
 */
export default function LikerSwipeModal({ visible, profile, onClose, onSwipe }: any) {
  const swipeMutation = useSwipeMutation();
  const insets = useSafeAreaInsets();

  const dragX = useSharedValue(0);
  const overlayDragX = useSharedValue(0);
  const overlayOpacity = useSharedValue(1);
  const buttonDragX = useSharedValue(0);
  const programmaticSwipe = useSharedValue(0);

  // Modal kapanırken (veya yeni profile için açılırken) tüm shared value'ları
  // resetle. uiBus globalleri de Discover ile paylaşıldığı için temizliyoruz.
  useEffect(() => {
    if (!visible) {
      dragX.value = 0;
      overlayDragX.value = 0;
      overlayOpacity.value = 1;
      buttonDragX.value = 0;
      programmaticSwipe.value = 0;
      cardExpandAnim.value = 0;
      cardPullProgress.value = 0;
      containerExpand.value = 0;
    }
  }, [
    visible,
    dragX,
    overlayDragX,
    overlayOpacity,
    buttonDragX,
    programmaticSwipe,
  ]);

  const handleSwipe = (direction, userId) => {
    if (userId) {
      // useSwipeMutation: optimistic stats decrement + paywall handling.
      // Mutual like ise backend match yaratır, global MatchModal açılır.
      swipeMutation.mutate({ direction, userId });
      // LikesScreen'in listeden anında kaldırması için bilgi ver — match
      // event'ini beklemeden UX akıcı kalsın.
      onSwipe?.(userId, direction);
    }
    onClose?.();
  };

  if (!profile) return null;

  return (
    <Modal
      visible={visible}
      animationType="slide"
      transparent={false}
      onRequestClose={onClose}
      statusBarTranslucent
    >
      <GestureHandlerRootView style={{ flex: 1, backgroundColor: colors.bg }}>
        <StatusBar barStyle="light-content" />
        <View
          style={{
            flex: 1,
            paddingTop: insets.top + 60,
            paddingBottom: insets.bottom + 20,
            paddingHorizontal: 16,
          }}
        >
          <View style={{ flex: 1, position: "relative" }}>
            <SwipeWrapper
              profile={profile}
              isTopCard
              onSwipe={handleSwipe}
              dragX={dragX}
              overlayDragX={overlayDragX}
              overlayOpacity={overlayOpacity}
              buttonDragX={buttonDragX}
              programmaticSwipe={programmaticSwipe}
            />
          </View>
        </View>

        {/* Close button — sol üstte */}
        <TouchableOpacity
          onPress={onClose}
          hitSlop={10}
          activeOpacity={0.7}
          style={{
            position: "absolute",
            top: insets.top + 8,
            left: 16,
            width: 38,
            height: 38,
            borderRadius: 19,
            backgroundColor: "rgba(0,0,0,0.55)",
            alignItems: "center",
            justifyContent: "center",
            zIndex: 30,
          }}
        >
          <View pointerEvents="none">
            <X size={22} color={colors.text} strokeWidth={2.2} />
          </View>
        </TouchableOpacity>
      </GestureHandlerRootView>
    </Modal>
  );
}
