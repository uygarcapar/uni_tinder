import * as StoreReview from 'expo-store-review';
import { appPrefs } from '../utils/appPrefs';

const MATCH_COUNT_KEY = 'review_match_count';
const LAST_PROMPT_TS_KEY = 'review_last_prompt_ts';
const COOLDOWN_MS = 90 * 24 * 60 * 60 * 1000; // 90 gün

/** Match sayacını artırır, prompt göstermez (modaldan "mesaj gönder" ile
 *  çıkışta çağrılır — kullanıcının mesaj yazma niyetini kesme). */
export const recordMatchForReview = (): void => {
  try {
    appPrefs.set(MATCH_COUNT_KEY, (appPrefs.getNumber(MATCH_COUNT_KEY) ?? 0) + 1);
  } catch {
    // yut
  }
};

/**
 * Match kutlaması kapanınca çağrılır — "peak dopamine" anında rating iste.
 * Gate'ler: ilk match'te asla (2.+ match), 90 gün cooldown. Apple zaten
 * 3/kullanıcı/365 gün ile native olarak sınırlar; asıl değer bizim gate'lerde.
 * Android launcher'ları desteklemiyorsa isAvailableAsync false döner, sessiz geçer.
 */
export const maybeRequestReviewAfterMatch = async (): Promise<void> => {
  try {
    const count = (appPrefs.getNumber(MATCH_COUNT_KEY) ?? 0) + 1;
    appPrefs.set(MATCH_COUNT_KEY, count);
    if (count < 2) return;

    const lastPrompt = appPrefs.getNumber(LAST_PROMPT_TS_KEY) ?? 0;
    if (Date.now() - lastPrompt < COOLDOWN_MS) return;

    if (!(await StoreReview.isAvailableAsync())) return;
    appPrefs.set(LAST_PROMPT_TS_KEY, Date.now()); // önce yaz — çifte prompt yarışını kapat
    await StoreReview.requestReview();
  } catch {
    // Rating isteği hiçbir akışı bozamaz — yut.
  }
};
