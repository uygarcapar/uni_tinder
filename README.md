# Lit

Lit, üniversite öğrencilerine yönelik bir sosyal eşleşme (dating) mobil uygulamasıdır. Expo tabanlı bir React Native projesi olarak geliştirilmiştir.

## Teknoloji

- **Runtime:** Expo SDK 56, React Native 0.85, React 19
- **Navigasyon:** React Navigation (native stack + bottom tabs)
- **State:** Redux Toolkit + redux-persist, TanStack Query
- **Realtime:** SignalR (`@microsoft/signalr`)
- **Ödeme:** RevenueCat (`react-native-purchases`)
- **UI:** NativeWind (Tailwind), Reanimated 4, Gesture Handler, Skia, Bottom Sheet
- **Formlar:** react-hook-form + Zod
- **Test:** Jest + React Native Testing Library

## Proje yapısı

```
src/
  features/           # domain modülleri (auth, chat, discover, notifications, profile)
    <feature>/
      components/
      screens/
      <feature>Slice.ts
      <feature>Service.ts
  navigation/         # stack ve tab navigator'lar
  shared/             # ortak component'ler, servisler, tipler, theme
tests/                # Jest testleri (features/ ve shared/ yapısını izler)
```

## Başlangıç

```bash
npm install
npm run ios      # iOS (dev client gerekli)
npm run android  # Android
npm start        # Metro (dev client)
```

### Ortam değişkenleri

Proje kök dizininde `.env` dosyası oluşturun:

```
EXPO_PUBLIC_REVENUECAT_IOS_API_KEY=...
EXPO_PUBLIC_REVENUECAT_ANDROID_API_KEY=...
EXPO_PUBLIC_REVENUECAT_ENTITLEMENT_ID=...
```

`.env` dosyası `.gitignore`'a alınmıştır ve commit edilmez.

## Komutlar

| Komut | Açıklama |
| --- | --- |
| `npm start` | Metro'yu dev client modda başlatır |
| `npm run ios` / `npm run android` | Native build ve run |
| `npm run clean` | Cache temizleyerek başlat |
| `npm test` | Jest testlerini çalıştır |
| `npm run test:watch` | Watch modda test |
| `npm run test:ci` | CI için coverage ile test |
| `npm run lint` | ESLint |
| `npm run type-check` | `tsc --noEmit` (test config ile) |

## Native

`ios/` ve `android/` klasörleri repo'ya dahil değildir; `expo prebuild` veya `expo run:*` ile üretilir. Patch'ler `patches/` altında `patch-package` ile uygulanır (`postinstall` scripti).
