import { createSlice, createAsyncThunk, PayloadAction } from "@reduxjs/toolkit";
import api from "@/shared/services/api";
import { API_ENDPOINTS } from "@/shared/constants/api";
import { getRevenueCatPremiumStatus } from "@/features/profile/subscriptionService";
import type { SubscriptionState } from "@/shared/types";

interface NormalizedStatus {
  isPremium: boolean;
  expiresAt: string | null;
}

// Backend SubscriptionStatusDto: { isActivelyPremium, premiumExpiresAt, productId, status, autoRenewEnabled, ... }
const normalizeStatus = (raw: any): NormalizedStatus => {
  if (!raw) return { isPremium: false, expiresAt: null };
  return {
    isPremium: raw.isActivelyPremium ?? raw.isPremium ?? false,
    expiresAt: raw.premiumExpiresAt ?? raw.expiresAt ?? null,
  };
};

export const fetchSubscriptionStatus = createAsyncThunk(
  "subscription/fetchStatus",
  async (_, { rejectWithValue }) => {
    try {
      const backendRes = await api.get(API_ENDPOINTS.SUBSCRIPTION_STATUS) as any;
      return normalizeStatus(backendRes.result);
    } catch (e: any) {
      const rcPremium = await getRevenueCatPremiumStatus().catch(() => false);
      if (rcPremium) {
        return { isPremium: true, expiresAt: null };
      }
      return rejectWithValue(e.message);
    }
  }
);

export const syncSubscriptionWithRetry = createAsyncThunk(
  "subscription/syncWithRetry",
  async (
    { maxAttempts = 3, delayMs = 1500 }: { maxAttempts?: number; delayMs?: number } = {},
    { rejectWithValue }
  ) => {
    let lastResult: any = null;
    for (let attempt = 1; attempt <= maxAttempts; attempt++) {
      try {
        const res = await api.post(API_ENDPOINTS.SUBSCRIPTION_SYNC) as any;
        const result = res.result ?? {};
        lastResult = result.status;
        const synced = result.synced === true || result.status?.isActivelyPremium === true;
        if (synced) {
          return { ...normalizeStatus(result.status), synced: true, attempts: attempt };
        }
      } catch (e: any) {
        if (attempt === maxAttempts) {
          return rejectWithValue(e.message || "Sync failed");
        }
      }
      if (attempt < maxAttempts) {
        await new Promise((r) => setTimeout(r, delayMs));
      }
    }
    return {
      ...normalizeStatus(lastResult),
      synced: false,
      attempts: maxAttempts,
    };
  }
);

const initialState: SubscriptionState = {
  isPremium: false,
  expiresAt: null,
  loading: false,
  syncing: false,
  lastSyncedAt: null,
};

const subscriptionSlice = createSlice({
  name: "subscription",
  initialState,
  reducers: {
    setPremium: (state, action: PayloadAction<{ isPremium: boolean; expiresAt?: string | null }>) => {
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
          state.isPremium = action.payload.isPremium;
          state.expiresAt = action.payload.expiresAt;
        }
      })
      .addCase(fetchSubscriptionStatus.rejected, (state) => {
        state.loading = false;
      })
      .addCase(syncSubscriptionWithRetry.pending, (state) => {
        state.syncing = true;
      })
      .addCase(syncSubscriptionWithRetry.fulfilled, (state, action) => {
        state.syncing = false;
        state.lastSyncedAt = Date.now();
        if (action.payload) {
          state.isPremium = action.payload.isPremium;
          state.expiresAt = action.payload.expiresAt;
        }
      })
      .addCase(syncSubscriptionWithRetry.rejected, (state) => {
        state.syncing = false;
      });
  },
});

export const { setPremium } = subscriptionSlice.actions;
export default subscriptionSlice.reducer;
