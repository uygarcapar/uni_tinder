import { createSlice, createAsyncThunk } from "@reduxjs/toolkit";
import api from "../../services/api";
import { API_ENDPOINTS } from "../../constants/api";

// Backend SubscriptionStatusDto: { isActivelyPremium, premiumExpiresAt, productId, status, autoRenewEnabled, ... }
// Eski kod isPremium/expiresAt okuyordu — backend ile uyumsuzdu. İkisini de fallback olarak tutuyoruz
// (kısa süreli eski deploy'larla geriye dönük uyum için), kanonik isActivelyPremium / premiumExpiresAt.
const normalizeStatus = (raw) => {
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
      const res = await api.get(API_ENDPOINTS.SUBSCRIPTION_STATUS);
      return normalizeStatus(res.result);
    } catch (e) {
      return rejectWithValue(e.message);
    }
  }
);

// Post-purchase doğrulama: RevenueCat purchase başarılı olunca backend webhook hemen
// gelmeyebilir. Bu thunk birkaç kez retry ile /sync'i çağırıp backend'in canonical
// state'i premium gösterene kadar bekler. synced=true gelene kadar / max retry'a kadar.
//
// Kullanım: dispatch(syncSubscriptionWithRetry()) — döndürdüğü payload Redux state'ine yansır.
export const syncSubscriptionWithRetry = createAsyncThunk(
  "subscription/syncWithRetry",
  async ({ maxAttempts = 3, delayMs = 1500 } = {}, { rejectWithValue }) => {
    let lastResult = null;
    for (let attempt = 1; attempt <= maxAttempts; attempt++) {
      try {
        const res = await api.post(API_ENDPOINTS.SUBSCRIPTION_SYNC);
        const result = res.result ?? {};
        lastResult = result.status;
        const synced = result.synced === true || result.status?.isActivelyPremium === true;
        if (synced) {
          return { ...normalizeStatus(result.status), synced: true, attempts: attempt };
        }
      } catch (e) {
        // Network / 5xx — sonraki attempt'te tekrar dene; son hatadan sonra reject.
        if (attempt === maxAttempts) {
          return rejectWithValue(e.message || "Sync failed");
        }
      }
      // synced=false → bekle ve tekrar dene
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

const subscriptionSlice = createSlice({
  name: "subscription",
  initialState: {
    isPremium: false,
    expiresAt: null,
    loading: false,
    syncing: false,
    lastSyncedAt: null,
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
