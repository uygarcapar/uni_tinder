/**
 * Sekme listesi × akış bayrağı latch'i × SEÇİLİ MOD.
 *
 * Bu suite'in varlık sebebi bir kör nokta: dev'de `devForceFeedEnabled()` sekmeyi
 * HER ZAMAN açtığı için "latch 'on' ama sekme çizilmiyor" sınıfı hatalar dev'de
 * hiç görünmüyordu (probe açılışa bağlı değilken kimsenin sekmeyi görememesi tam
 * bu yüzden fark edilmedi). Burada kanca KAPALI mock'lanıyor — yani __DEV__'in
 * jest'te true olmasına rağmen ÜRETİM davranışı test ediliyor.
 *
 * ⚠️ İKİ AYRI KAPI var ve ikisi de geçilmeden sekme çizilmiyor:
 *   • LATCH  — "backend'de bu özellik açık mı" (feedFlag, UT-7301).
 *   • MOD    — "bu modda bu özellik var mı" (Akış ARKADAŞ'a özel, 2026-11-05).
 * Ayrı tutulmaları kasıtlı: mod seçimi latch'in disk değerini KİRLETMEMELİ,
 * yoksa Dating'de geçirilen bir oturum özelliği kalıcı olarak "kapalı"
 * damgalardı.
 */

jest.mock('@/features/feed/feedDevFlag', () => ({
  devForceFeedEnabled: jest.fn(() => false),
}));

// Native tab bar jest'te yok; navigator mock'u ekranları düz View olarak
// sıralıyor — test edilen şey liste İÇERİĞİ ve SIRASI, native çizim değil.
jest.mock('@react-navigation/bottom-tabs/unstable', () => {
  const React = require('react');
  const { View } = require('react-native');
  return {
    createNativeBottomTabNavigator: () => ({
      Navigator: ({ children }: any) =>
        React.createElement(View, { testID: 'tab-list' }, children),
      Screen: ({ name }: any) =>
        React.createElement(View, { testID: `tab-${name}` }),
    }),
  };
});

// Ekranlar yalnız `component` prop'u olarak geçiyor, mount EDİLMİYORLAR —
// mock'lar ağır import ağaçlarını (Skia, reanimated, sqlite…) suite dışında
// tutmak için.
jest.mock('@/features/discover/screens/DiscoverScreen', () => () => null);
jest.mock('@/features/discover/screens/LikesScreen', () => () => null);
jest.mock('@/features/profile/screens/ProfileScreen', () => () => null);
jest.mock('@/features/chat/screens/MessagesScreen', () => () => null);
jest.mock('@/features/feed/screens/FeedScreen', () => () => null);
// Skia'ya iniyor; sekme ikonunun içeriği bu testin konusu değil.
jest.mock('@/navigation/profileTabAvatar', () => ({
  useProfileTabAvatarIcon: () => null,
}));

jest.mock('@/shared/hooks/redux', () => ({
  useAppSelector: (fn: any) => fn({ swipe: { whoLikedMeCount: 0 } }),
}));
jest.mock('@/features/chat/chatSlice', () => ({
  selectUnreadForMode: () => 0,
}));
// Seçili mod testten testle değişiyor — gerçek hook diske/uiBus'a bağlı.
let mockMode = 'Friends';
jest.mock('@/features/discover/useAppMode', () => ({
  useAppMode: () => ({ mode: mockMode }),
}));
jest.mock('react-i18next', () => ({
  useTranslation: () => ({ t: (k: string) => k }),
}));

import React from 'react';
import { act, render } from '@testing-library/react-native';
import TabNavigator from '@/navigation/TabNavigator';
import { appPrefs } from '@/shared/utils/appPrefs';
import {
  initFeedFlag,
  recordFeedFlag,
  resetFeedFlagSession,
} from '@/features/feed/feedFlag';

const USER = 'user-1';

const tabOrder = (toJSON: () => any): string[] =>
  (toJSON()?.children ?? []).map((c: any) => c?.props?.testID);

beforeEach(() => {
  appPrefs.clearAll?.();
  resetFeedFlagSession();
  mockMode = 'Friends';
});

it('latch "on" ise Akış sekmesi çizilir — dev kancası kapalıyken de', () => {
  recordFeedFlag(USER, true);
  initFeedFlag(USER);
  const { getByTestId } = render(<TabNavigator />);
  expect(getByTestId('tab-Feed')).toBeTruthy();
});

it('Akış sekmesi yerinde: Beğeniler ile Mesajlar arasında', () => {
  // Canlı ekleme sekmenin SONDA olmasını gerektirmiyor: TabRouter route listesi
  // değişince odaklı sekmeyi İSMİYLE yeniden çözüyor, native taraf da seçimi
  // pozisyonla değil route KEY'iyle taşıyor (NativeBottomTabView >
  // selectedScreenKey). Ürün sırası bu yüzden korunuyor.
  recordFeedFlag(USER, true);
  initFeedFlag(USER);
  const { toJSON } = render(<TabNavigator />);
  expect(tabOrder(toJSON)).toEqual([
    'tab-Discover',
    'tab-Likes',
    'tab-Feed',
    'tab-Messages',
    'tab-Profile',
  ]);
});

it('latch "unknown" iken sekme çizilmez (bilmediğimizde gizli taraf doğru)', () => {
  initFeedFlag(USER);
  const { queryByTestId } = render(<TabNavigator />);
  expect(queryByTestId('tab-Feed')).toBeNull();
});

it('oturum ortasında gelen "on" sekmeyi ANINDA ekler (restart beklenmez)', () => {
  initFeedFlag(USER);
  const { queryByTestId, getByTestId } = render(<TabNavigator />);
  expect(queryByTestId('tab-Feed')).toBeNull();

  act(() => {
    recordFeedFlag(USER, true); // probe başarı yolu bunu çağırıyor
  });
  expect(getByTestId('tab-Feed')).toBeTruthy();
});

/**
 * ── MOD KAPISI ──────────────────────────────────────────────────────────────
 * Akış ARKADAŞ modunun yüzeyi. Flört'te sekme HİÇ olmamalı: çizilip içeride
 * "burası Arkadaş'a özel" demek, kullanıcıya girip çıkacağı boş bir sekme
 * vermek olurdu.
 */
it('Flört modunda latch "on" olsa bile Akış sekmesi çizilmez', () => {
  mockMode = 'Dating';
  recordFeedFlag(USER, true);
  initFeedFlag(USER);
  const { queryByTestId } = render(<TabNavigator />);
  expect(queryByTestId('tab-Feed')).toBeNull();
});

it('Flört modunda diğer sekmeler olduğu gibi duruyor', () => {
  mockMode = 'Dating';
  recordFeedFlag(USER, true);
  initFeedFlag(USER);
  const { toJSON } = render(<TabNavigator />);
  expect(tabOrder(toJSON)).toEqual([
    'tab-Discover',
    'tab-Likes',
    'tab-Messages',
    'tab-Profile',
  ]);
});

/**
 * Mod anahtarı Keşif başlığında ve Profil avatarında — yani kullanıcı modu
 * DEĞİŞTİRİRKEN Akış sekmesinde durmuyor. Sekmenin canlı gelip gitmesi bu
 * yüzden güvenli: route listesi değiştiğinde TabRouter odaklı sekmeyi İSMİYLE
 * yeniden çözüyor ve kaldırılan route zaten odakta değil.
 */
it('Arkadaş → Flört geçişinde sekme CANLI kalkıyor', () => {
  recordFeedFlag(USER, true);
  initFeedFlag(USER);
  const { queryByTestId, rerender } = render(<TabNavigator />);
  expect(queryByTestId('tab-Feed')).toBeTruthy();

  mockMode = 'Dating';
  rerender(<TabNavigator />);
  expect(queryByTestId('tab-Feed')).toBeNull();
});

it('Flört → Arkadaş geçişinde sekme CANLI geri geliyor', () => {
  mockMode = 'Dating';
  recordFeedFlag(USER, true);
  initFeedFlag(USER);
  const { queryByTestId, rerender } = render(<TabNavigator />);
  expect(queryByTestId('tab-Feed')).toBeNull();

  mockMode = 'Friends';
  rerender(<TabNavigator />);
  expect(queryByTestId('tab-Feed')).toBeTruthy();
});
