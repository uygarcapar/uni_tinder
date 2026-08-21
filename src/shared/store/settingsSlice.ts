import { createSlice, PayloadAction } from '@reduxjs/toolkit';
import * as Localization from 'expo-localization';

type Language = 'tr' | 'en';

/**
 * Dil tercihi — Sistem/Türkçe/English. themeMode.ts'teki desenin aynısı:
 * TERCİH (`languagePreference`) ile ÇÖZÜLEN dil (`language`) ayrı tutuluyor.
 *
 * Ayarlar'daki seçili chip tercihi gösteriyor; i18n, Accept-Language ve backend'e
 * giden `Language` alanı ise hep çözülen dili kullanıyor — "system" hiçbir zaman
 * ağa çıkmıyor.
 */
export type LanguagePreference = 'system' | Language;

/** Cihazın o anki dili. iOS'ta dil değişimi uygulamayı yeniden başlatır. */
export const deviceLanguage = (): Language =>
  Localization.getLocales()[0]?.languageCode === 'tr' ? 'tr' : 'en';

export const resolveLanguage = (pref: LanguagePreference): Language =>
  pref === 'system' ? deviceLanguage() : pref;

interface SettingsState {
  /** Çözülen dil — i18n ve API bunu okur. */
  language: Language;
  /** Kullanıcının seçtiği tercih — yalnız Ayarlar chip'i bunu okur. */
  languagePreference: LanguagePreference;
}

const settingsSlice = createSlice({
  name: 'settings',
  initialState: {
    language: deviceLanguage(),
    languagePreference: 'system',
  } as SettingsState,
  reducers: {
    setLanguage: (state, action: PayloadAction<LanguagePreference>) => {
      state.languagePreference = action.payload;
      state.language = resolveLanguage(action.payload);
    },
  },
});

export const { setLanguage } = settingsSlice.actions;
export default settingsSlice.reducer;
