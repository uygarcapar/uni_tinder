import type { QueryClient } from "@tanstack/react-query";
import { feedKeys } from "@/features/feed/feedKeys";
import { swipeKeys } from "@/features/discover/swipeKeys";
import { campusKeys } from "@/features/campus/campusKeys";

/**
 * Bir kişiyle İLİŞKİ değişince (engel kuruldu / kaldırıldı) o kişinin
 * görünebileceği TÜM yüzeylerin cache'lerini bayatlatır.
 *
 * Engel iki yönlü ve her yüzeyde sunucuda süzülüyor (2026-11-06 sözleşmesi:
 * şikayet gizlemez, engel gizler ve geri alınabilir). Sunucu aday havuzlarını
 * düşürüyor ama istemci cache'leri `staleTime` boyunca eski listeyi tutar —
 * kullanıcı elle yenilemek zorunda kalmasın diye tek noktadan tazelenir.
 *
 * Anahtar modülleri bilerek hafif (hook zinciri import etmiyor), bu yüzden
 * paylaşılan katmandan import edilmeleri güvenli.
 */
export const RELATION_SURFACE_KEYS = [
  feedKeys.postsRoot,
  feedKeys.repliesReceived,
  swipeKeys.deckRoot,
  swipeKeys.whoLikedMeRoot,
  campusKeys.momentsRoot,
] as const;

export function invalidateRelationSurfaces(qc: QueryClient): void {
  for (const queryKey of RELATION_SURFACE_KEYS) {
    qc.invalidateQueries({ queryKey });
  }
}
