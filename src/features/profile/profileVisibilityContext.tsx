import { createContext, useContext } from "react";
import type { ProfileVisibility } from "@/features/profile/photoModeration";

/**
 * Kendi profilinin keşif havuzundaki durumu — ekranların okuyabilmesi için.
 *
 * Kaynak AppNavigator: `getMyProfile` yanıtı ve `PhotoModerationChanged` hub
 * olayı. Redux'a YAZILMIYOR (bilinçli): `profile` slice'ı MMKV'ye persist
 * ediliyor, oraya konsa cold start'ta bayat bir "gizli" değeri taze veri
 * gelmeden okunur ve Discover bir an sebepsiz kapanırdı. Context oturum ömürlü.
 *
 * `visibility === null` = BİLİNMİYOR (cevap gelmedi ya da sunucu alanı hiç
 * göndermiyor). Bu durumda hiçbir ekran kısıtlama UYGULAMAMALI — aksi halde
 * backend deploy edilmeden önce herkesi engellerdik.
 */
export type ProfileVisibilityInfo = {
  visibility: ProfileVisibility | null;
  /** İncelemeyi bekleyen fotoğraf var mı (`null` = bilinmiyor). */
  awaitingReview: boolean | null;
};

const ProfileVisibilityContext = createContext<ProfileVisibilityInfo>({
  visibility: null,
  awaitingReview: null,
});

export const ProfileVisibilityProvider = ProfileVisibilityContext.Provider;

export const useProfileVisibility = (): ProfileVisibilityInfo =>
  useContext(ProfileVisibilityContext);
