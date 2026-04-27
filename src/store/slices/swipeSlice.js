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
  },
  reducers: {
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

export const { nextCard, rewindCard } = swipeSlice.actions;
export default swipeSlice.reducer;
