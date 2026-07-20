import { createSlice, PayloadAction } from '@reduxjs/toolkit';
import * as Localization from 'expo-localization';

type Language = 'tr' | 'en';

const systemLang: Language =
  Localization.getLocales()[0]?.languageCode === 'tr' ? 'tr' : 'en';

interface SettingsState {
  language: Language;
}

const settingsSlice = createSlice({
  name: 'settings',
  initialState: { language: systemLang } as SettingsState,
  reducers: {
    setLanguage: (state, action: PayloadAction<Language>) => {
      state.language = action.payload;
    },
  },
});

export const { setLanguage } = settingsSlice.actions;
export default settingsSlice.reducer;
