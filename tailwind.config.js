/** @type {import('tailwindcss').Config} */
module.exports = {
  content: [
    "./App.{js,jsx,ts,tsx}",
    "./src/**/*.{js,jsx,ts,tsx}",
    "./components/**/*.{js,jsx,ts,tsx}",
  ],
  presets: [require("nativewind/preset")],
  // RENK PALETİ TANIMLI DEĞİL — bilinçli. Tek renk kaynağı
  // src/shared/theme/colors.ts; gerekçe için bkz. global.css.
  // className yalnız layout/spacing/typography, renk her zaman inline.
  theme: {},
  plugins: [],
};
