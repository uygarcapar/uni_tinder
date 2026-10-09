import { createSlice, createAsyncThunk, PayloadAction } from "@reduxjs/toolkit";
import swipeService from "@/features/discover/swipeService";
import type { SwipeState } from "@/shared/types";

/**
 * NOT: Deste (potentialMatches / currentIndex / sayfalama) ve kota sayaçları
 * artık BU SLICE'TA DEĞİL. Deste React Query'de (`usePotentialMatches`),
 * kotalar `swipeKeys.stats` cache'inde yaşıyor. Redux → React Query geçişinden
 * kalan `fetchPotentialMatches`, `loadMoreProfiles`, `performLike/Pass/
 * Fire`, `nextCard`, `rewindCard`, `updateSwipeStats` thunk/reducer'ları
 * ve karşılık gelen state alanları hiçbir yerden okunmuyordu; kaldırıldı.
 * Geriye yalnız "beni beğenenler" rozeti kaldı — o gerçekten global, çünkü
 * Discover, Likes ekranı ve tab rozeti aynı kümeyi paylaşıyor.
 */

/**
 * Rozet sayısı + liker id kümesini Likes sekmesi MOUNT OLMADAN doldurur.
 * Tab'lar lazy: kullanıcı Beğeniler'e hiç girmediyse ne rozet doğruydu ne de
 * Discover'da "bu kişi beni beğenmişti" bilinebiliyordu.
 * Hata sessiz — rozet kozmetik, boot'u bloklamaz.
 */
export const fetchWhoLikedMe = createAsyncThunk(
  "swipe/fetchWhoLikedMe",
  async (_: void, { rejectWithValue }) => {
    const res = (await swipeService.getWhoLikedMe()) as any;
    if (!res?.isSuccess || !res?.result) return rejectWithValue(null);
    const r = res.result;
    return {
      count: (r.superLikes?.totalProfiles || 0) + (r.likes?.totalProfiles || 0),
      ids: [
        ...(r.superLikes?.profiles ?? []),
        ...(r.likes?.profiles ?? []),
      ].map((p: any) => p?.userId),
      // Lit Akışı bekleyen yanıtları (2026-09-29 sözleşmesi) — rozet artık
      // bu üçünün toplamı. Alan eski backend'de yoksa 0, rozet bozulmaz.
      // ⚠️ `count`a EKLENMİYOR: aşağıdaki gerekçeye bak.
      pendingFeedReplyCount: r.pendingFeedReplyCount ?? 0,
    };
  },
);

const initialState: SwipeState = {
  whoLikedMeCount: 0,
  whoLikedMeIds: [],
  pendingFeedReplyCount: 0,
};

// GUID'ler endpoint'e göre farklı case gelebiliyor — küme karşılaştırması
// bunun üzerinden yapıldığı için tek normalize noktası.
const normalizeId = (id: unknown): string | null =>
  typeof id === "string" && id.length > 0 ? id.toLowerCase() : null;

// Sayaç TOPLAM'dan (sayfalanmamış), id kümesi yalnız çekilen sayfadan gelir —
// setWhoLikedMe reducer'ı ile fetchWhoLikedMe thunk'ı aynı yazımı paylaşsın.
function applyWhoLikedMe(
  state: SwipeState,
  payload: {
    count: number;
    ids: (string | null | undefined)[];
    pendingFeedReplyCount?: number;
  },
) {
  state.whoLikedMeCount = Math.max(0, payload.count || 0);
  state.whoLikedMeIds = Array.from(
    new Set(payload.ids.map(normalizeId).filter(Boolean) as string[]),
  );
  if (typeof payload.pendingFeedReplyCount === "number") {
    state.pendingFeedReplyCount = Math.max(0, payload.pendingFeedReplyCount);
  }
}

const swipeSlice = createSlice({
  name: "swipe",
  initialState,
  reducers: {
    /** WhoLikedMe fetch'i — sayaç toplam (sayfalanmamış), id'ler yüklenen sayfa. */
    setWhoLikedMe: (
      state,
      action: PayloadAction<{ count: number; ids: (string | null | undefined)[] }>,
    ) => {
      applyWhoLikedMe(state, action.payload);
    },
    /** Canlı IncomingLike — id zaten kümedeyse (reconnect tekrarı) sayacı şişirme. */
    addWhoLikedMe: (state, action: PayloadAction<string>) => {
      const id = normalizeId(action.payload);
      if (!id || state.whoLikedMeIds.includes(id)) return;
      state.whoLikedMeIds.push(id);
      state.whoLikedMeCount = (state.whoLikedMeCount || 0) + 1;
    },
    /**
     * Bu liker handle edildi (pass/like/match) → rozet ANINDA düşsün.
     * Id kümede yoksa sayaca dokunulmaz: kaynağı bilinmeyen bir düşüş,
     * sayfalanmamış toplamı sessizce bozardı.
     */
    removeWhoLikedMe: (state, action: PayloadAction<string>) => {
      const id = normalizeId(action.payload);
      if (!id) return;
      const idx = state.whoLikedMeIds.indexOf(id);
      if (idx === -1) return;
      state.whoLikedMeIds.splice(idx, 1);
      state.whoLikedMeCount = Math.max(0, (state.whoLikedMeCount || 0) - 1);
    },
    /**
     * ── Lit Akışı bekleyen yanıtları ────────────────────────────────────────
     * AYRI sayaç, `whoLikedMeCount`a karıştırılmıyor: o sayaç id kümesinden
     * türüyor ve add/removeWhoLikedMe ona göre oynuyor. Yanıt sayısı oraya
     * yazılsa bir beğeniyi işlemek (pass/like/match) yanıt sayısını da
     * düşürürdü. Rozet TabNavigator'da toplanıyor.
     */
    /** `/replies/received/count` ya da WhoLikedMe'den gelen OTORİTER sayı. */
    setPendingFeedReplyCount: (state, action: PayloadAction<number>) => {
      state.pendingFeedReplyCount = Math.max(0, action.payload || 0);
    },
    /** Canlı `FeedReplyReceived` — hub replay yapmadığı için sayım sonradan
     *  `/count` ile mutabakata giriyor (drift düzeltmesi). */
    incrementPendingFeedReply: (state) => {
      state.pendingFeedReplyCount = (state.pendingFeedReplyCount || 0) + 1;
    },
    /** Kabul/red işlendi → rozet ANINDA düşsün (removeWhoLikedMe mantığı). */
    decrementPendingFeedReply: (state) => {
      state.pendingFeedReplyCount = Math.max(
        0,
        (state.pendingFeedReplyCount || 0) - 1,
      );
    },
  },
  extraReducers: (builder) => {
    builder.addCase(fetchWhoLikedMe.fulfilled, (state, action) => {
      applyWhoLikedMe(state, action.payload);
    });
  },
});

/**
 * "Bu kullanıcı beni beğenmiş miydi?" — abone OLMADAN okunmalı (store.getState()).
 * Discover'ın swipe handler'ı bu bilgiyi selector'la alsaydı her yeni beğenide
 * deste yeniden render olurdu; render churn'ü artırmanın bedeli biliniyor.
 */
export const hasLikedMe = (state: any, userId?: string | null): boolean => {
  if (!userId) return false;
  return (state?.swipe?.whoLikedMeIds ?? []).includes(userId.toLowerCase());
};

export const {
  setWhoLikedMe,
  addWhoLikedMe,
  removeWhoLikedMe,
  setPendingFeedReplyCount,
  incrementPendingFeedReply,
  decrementPendingFeedReply,
} = swipeSlice.actions;
export default swipeSlice.reducer;
