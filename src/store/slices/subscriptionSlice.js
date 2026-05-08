import { createSlice, createAsyncThunk } from "@reduxjs/toolkit";
import api from "../../services/api";
import { API_ENDPOINTS } from "../../constants/api";

export const fetchSubscriptionStatus = createAsyncThunk(
  "subscription/fetchStatus",
  async (_, { rejectWithValue }) => {
    try {
      const res = await api.get(API_ENDPOINTS.SUBSCRIPTION_STATUS);
      return res.result;
    } catch (e) {
      return rejectWithValue(e.message);
    }
  }
);

const subscriptionSlice = createSlice({
  name: "subscription",
  initialState: {
    isPremium: false,
    expiresAt: null,
    loading: false,
  },
  reducers: {
    setPremium: (state, action) => {
      state.isPremium = action.payload.isPremium ?? false;
      state.expiresAt = action.payload.expiresAt ?? null;
    },
  },
  extraReducers: (builder) => {
    builder
      .addCase(fetchSubscriptionStatus.pending, (state) => {
        state.loading = true;
      })
      .addCase(fetchSubscriptionStatus.fulfilled, (state, action) => {
        state.loading = false;
        if (action.payload) {
          state.isPremium = action.payload.isPremium ?? false;
          state.expiresAt = action.payload.expiresAt ?? null;
        }
      })
      .addCase(fetchSubscriptionStatus.rejected, (state) => {
        state.loading = false;
      });
  },
});

export const { setPremium } = subscriptionSlice.actions;
export default subscriptionSlice.reducer;
