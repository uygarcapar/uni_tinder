import api from "@/shared/services/api";
import { API_ENDPOINTS } from "@/shared/constants/api";
import { showInfoToast } from "@/shared/services/toaster";
import { navigationRef } from "@/shared/services/navigationRef";
import uiBus from "@/shared/services/uiBus";
import { queryClient } from "@/shared/queries/queryClient";
import { swipeKeys } from "@/features/discover/swipeQueries";
import { referralKeys } from "@/features/profile/referralKeys";
import profileService from "@/features/profile/profileService";
import { openLitPlus } from "@/features/profile/litPlusEntry";
import { createPendingNotices, noticeToastIcon } from "@/features/notifications/pendingNotices";

/**
 * `pendingNotices.ts`in gerçek bağlantısı — modül seviyesinde TEK örnek:
 * "bu oturumda gösterildi" kümesi soğuk açılış, ön plana gelme ve push yolu
 * arasında paylaşılmalı.
 */
const notices = createPendingNotices({
  fetchUnseen: () => api.get(API_ENDPOINTS.NOTICES_UNSEEN),
  markSeen: (items) => api.post(API_ENDPOINTS.NOTICES_SEEN, { items }),
  show: (notice, onPress) =>
    showInfoToast({
      title: notice.title,
      message: notice.body,
      icon: noticeToastIcon(notice),
      onPress,
    }),
  open: (notice) => {
    if (notice.kind === "PremiumGift") {
      // Lit Plus'ın tek giriş kapısı — sekme lazy mount olsa da doğru sayfada açılır.
      openLitPlus();
      return;
    }
    // Davet ödülü: ödül push'una dokunmayla AYNI hedef (AppNavigator.routeFromNotification).
    if (!navigationRef.isReady()) return;
    (navigationRef as any).navigate("HomeTabs", { screen: "Profile" });
    uiBus.emit("openReferral");
  },
  refresh: () => {
    queryClient.invalidateQueries({ queryKey: referralKeys.me });
    // Premium ve SuperLike/not bakiyesi stats cevabında.
    queryClient.invalidateQueries({ queryKey: swipeKeys.stats });
    profileService.bustProfileCache();
    uiBus.emit("profileDirty");
  },
  schedule: (fn, ms) => {
    setTimeout(fn, ms);
  },
});

/** Bekleyen "hakkın geldi" haberi var mı; varsa bir kez göster ve işaretle. */
export const checkPendingNotices = notices.check;

/** Push'tan açılan haber: işaretle ki açılış kontrolü tekrar göstermesin. */
export const markNoticeSeen = notices.markSeen;
