import { useCallback, useContext } from "react";
import { AppModalScrollContext } from "@/shared/components/AppModal";

// Ref zinciri: Animated wrapper → BottomSheetScrollView (imperative handle) →
// RN ScrollView. Normalde doğrudan scrollTo çıkar; sarmalayıcı sürüm
// farklarına karşı iki yaygın fallback de deneniyor.
export function resolveScroller(candidate: any) {
  if (!candidate) return null;
  if (typeof candidate.scrollTo === "function") return candidate;
  const responder = candidate.getScrollResponder?.();
  if (typeof responder?.scrollTo === "function") return responder;
  const node = candidate.getNode?.();
  if (typeof node?.scrollTo === "function") return node;
  return null;
}

/**
 * AppModal'ın scroll view'ına içerik tarafından erişim. İçerideki bir bölümü
 * programatik olarak görünür kılmak isteyen componentler kullanır:
 *
 *   const { scrollToOffset } = useAppModalScroll();
 *   scrollToOffset(sectionY - 12);
 *
 * `offset` content koordinatındadır (AppModal'ın paddingTop'u dahil değil —
 * children'ın kendi içindeki y'yi verirken header yüksekliği ile scroll hedefi
 * birbirini götürür, bkz. EditProfileForm'daki bölüm scroll'u).
 */
export function useAppModalScroll() {
  const ctx = useContext(AppModalScrollContext);

  const scrollToOffset = useCallback(
    (y: number, animated = true) => {
      const scroller = resolveScroller(ctx?.scrollRef.current);
      if (!scroller) return false;
      scroller.scrollTo({ y: Math.max(0, y), animated });
      return true;
    },
    [ctx],
  );

  return { scrollToOffset, scrollY: ctx?.scrollY };
}
