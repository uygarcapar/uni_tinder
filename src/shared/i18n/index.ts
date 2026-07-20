import i18n from 'i18next';
import { initReactI18next } from 'react-i18next';
import tr from './translations/tr';
import en from './translations/en';

i18n.use(initReactI18next).init({
  resources: {
    tr: { translation: tr },
    en: { translation: en },
  },
  lng: 'tr',
  fallbackLng: 'tr',
  interpolation: {
    escapeValue: false,
  },
});

export default i18n;
