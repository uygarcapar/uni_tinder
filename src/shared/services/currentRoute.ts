/**
 * Aktif ekran adının global tutamacı.
 *
 * api.ts'in doğrudan navigationRef'i (dolayısıyla @react-navigation/native'i)
 * import etmesi hem gereksiz coupling hem de test ortamında ESM transform
 * hatası demek. AppNavigator route değiştikçe buraya yazar; network hata
 * log'u buradan okur — böylece "hangi ekranda timeout aldık" bilgisi tek bir
 * string üzerinden akar.
 */
let currentRoute = 'boot';

export const setCurrentRouteName = (name: string): void => {
  currentRoute = name;
};

export const getCurrentRouteName = (): string => currentRoute;
