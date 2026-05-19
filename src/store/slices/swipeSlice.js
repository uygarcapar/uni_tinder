import { createSlice, createAsyncThunk } from "@reduxjs/toolkit";
import swipeService from "../../services/swipeService";

export const fetchPotentialMatches = createAsyncThunk(
  "swipe/fetchPotentialMatches",
  async (pageNumber = 1, { getState, rejectWithValue }) => {
    try {
      const state = getState();
      const token = state.auth.token;
      console.log('fetchPotentialMatches - Token:', token ? 'Token mevcut' : 'Token YOK!');
      console.log('fetchPotentialMatches - Page:', pageNumber);
      const response = await swipeService.getPotentialMatches(token, pageNumber, 10);
      console.log('fetchPotentialMatches - Response:', JSON.stringify(response, null, 2));
      return response;
    } catch (error) {
      console.log('fetchPotentialMatches - ERROR:', error);
      return rejectWithValue(error.message || "Failed to fetch matches");
    }
  },
);

export const loadMoreProfiles = createAsyncThunk(
  "swipe/loadMoreProfiles",
  async (_, { getState, rejectWithValue }) => {
    try {
      const state = getState();
      const token = state.auth.token;
      const nextPage = state.swipe.currentPage + 1;
      const response = await swipeService.getPotentialMatches(token, nextPage, 10);
      return response;
    } catch (error) {
      return rejectWithValue(error.message || "Failed to load more matches");
    }
  },
);

export const performLike = createAsyncThunk(
  "swipe/performLike",
  async (targetUserId, { getState }) => {
    const state = getState();
    return await swipeService.likeUser(targetUserId, state.auth.token);
  },
);

export const performPass = createAsyncThunk(
  "swipe/performPass",
  async (targetUserId, { getState }) => {
    const state = getState();
    return await swipeService.passUser(targetUserId, state.auth.token);
  },
);

export const performSuperLike = createAsyncThunk(
  "swipe/performSuperLike",
  async (targetUserId, { getState }) => {
    const state = getState();
    return await swipeService.superLikeUser(targetUserId, state.auth.token);
  },
);

const swipeSlice = createSlice({
  name: "swipe",
  initialState: {
    potentialMatches: [],
    currentIndex: 0,
    currentPage: 1,
    hasNextPage: false,
    loading: false,
    loadingMore: false,
    error: null,
    remainingSwipes: null,
    superLikesRemaining: null,
    swipeCountResetAt: null,
    superLikeCountResetAt: null,
    premiumExpiresAt: null,
    isPremium: false,
    totalSwipesToday: 0,
    likesToday: 0,
    passesToday: 0,
    superLikesToday: 0,
    matchesToday: 0,
    remainingUndos: null,
    undoCountResetAt: null,
    remainingMissedMatchRecovery: null,
    missedMatchRecoveryResetAt: null,
    whoLikedMeCount: 0,
  },
  reducers: {
    setWhoLikedMeCount: (state, action) => {
      state.whoLikedMeCount = action.payload || 0;
    },
    nextCard: (state) => {
      if (state.currentIndex < state.potentialMatches.length) {
        state.currentIndex += 1;
      }
    },
    rewindCard: (state) => {
      if (state.currentIndex > 0) {
        state.currentIndex -= 1;
      }
    },
    updateSwipeStats: (state, action) => {
      const p = action.payload;
      if (p.remainingSwipes !== undefined) state.remainingSwipes = p.remainingSwipes;
      if (p.superLikesRemaining !== undefined) state.superLikesRemaining = p.superLikesRemaining;
      if (p.swipeCountResetAt !== undefined) state.swipeCountResetAt = p.swipeCountResetAt;
      if (p.superLikeCountResetAt !== undefined) state.superLikeCountResetAt = p.superLikeCountResetAt;
      if (p.premiumExpiresAt !== undefined) state.premiumExpiresAt = p.premiumExpiresAt;
      if (p.isPremium !== undefined) state.isPremium = p.isPremium;
      if (p.totalSwipesToday !== undefined) state.totalSwipesToday = p.totalSwipesToday;
      if (p.likesToday !== undefined) state.likesToday = p.likesToday;
      if (p.passesToday !== undefined) state.passesToday = p.passesToday;
      if (p.superLikesToday !== undefined) state.superLikesToday = p.superLikesToday;
      if (p.matchesToday !== undefined) state.matchesToday = p.matchesToday;
      if (p.remainingUndos !== undefined) state.remainingUndos = p.remainingUndos;
      if (p.undoCountResetAt !== undefined) state.undoCountResetAt = p.undoCountResetAt;
      if (p.remainingMissedMatchRecovery !== undefined) state.remainingMissedMatchRecovery = p.remainingMissedMatchRecovery;
      if (p.missedMatchRecoveryResetAt !== undefined) state.missedMatchRecoveryResetAt = p.missedMatchRecoveryResetAt;
    },
  },
  extraReducers: (builder) => {
    builder
      // İlk yükleme
      .addCase(fetchPotentialMatches.pending, (state) => {
        state.loading = true;
      })
      .addCase(fetchPotentialMatches.fulfilled, (state, action) => {
        state.potentialMatches = action.payload.profiles;
        state.currentIndex = 0;
        state.currentPage = action.payload.currentPage;
        state.hasNextPage = action.payload.hasNextPage;
        state.loading = false;
      })
      .addCase(fetchPotentialMatches.rejected, (state, action) => {
        state.loading = false;
        state.error = action.payload;
      })
      // Daha fazla yükleme (pagination)
      .addCase(loadMoreProfiles.pending, (state) => {
        state.loadingMore = true;
      })
      .addCase(loadMoreProfiles.fulfilled, (state, action) => {
        state.potentialMatches = [...state.potentialMatches, ...action.payload.profiles];
        state.currentPage = action.payload.currentPage;
        state.hasNextPage = action.payload.hasNextPage;
        state.loadingMore = false;
      })
      .addCase(loadMoreProfiles.rejected, (state, action) => {
        state.loadingMore = false;
        state.error = action.payload;
      });
  },
});

export const {
  nextCard,
  rewindCard,
  updateSwipeStats,
  setWhoLikedMeCount,
} = swipeSlice.actions;
export default swipeSlice.reducer;
