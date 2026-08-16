/**
 * Kapının görünür sözleşmesi: **blokajda çıkış yolu yok.**
 *
 * `force` / `maintenance` durumunda "Sonra" butonu render EDİLMEZ, aşağı
 * sürükleme kapalıdır ve sheet'e dismiss handler'ı bağlanmaz. `soft`ta üçü de
 * serbesttir. Bu üç kilidin herhangi biri sessizce gevşerse, kırıcı bir
 * değişiklikte eski istemciler uygulamayı kullanmaya devam eder.
 */

jest.mock('lucide-react-native', () => new Proxy({}, { get: () => () => null }));

const sheetProps: any[] = [];
jest.mock('@/shared/components/AppBottomSheet', () => {
  const React = require('react');
  const { View } = require('react-native');
  return {
    __esModule: true,
    default: ({ children, ...rest }: any) => {
      sheetProps.push(rest);
      return React.createElement(View, { testID: 'app-bottom-sheet' }, children);
    },
  };
});

import React from 'react';
import { Linking } from 'react-native';
import { fireEvent, render, screen } from '@testing-library/react-native';
import UpdateGateSheet from '@/features/appVersion/UpdateGateSheet';
import type { VersionCheckResult } from '@/features/appVersion/versionService';

const result = (over: Partial<VersionCheckResult>): VersionCheckResult => ({
  action: 'soft',
  isBlocking: false,
  latestVersion: '1.5.0',
  minSupportedVersion: '1.0.0',
  storeUrl: 'https://apps.apple.com/app/id1',
  message: null,
  ...over,
});

const renderGate = (over: Partial<VersionCheckResult>, handlers: any = {}) => {
  const onDismiss = handlers.onDismiss ?? jest.fn();
  const onRetry = handlers.onRetry ?? jest.fn();
  render(
    <UpdateGateSheet
      result={result(over)}
      visible
      onDismiss={onDismiss}
      onRetry={onRetry}
      rechecking={handlers.rechecking ?? false}
    />,
  );
  return { onDismiss, onRetry, props: sheetProps[sheetProps.length - 1] };
};

beforeEach(() => {
  sheetProps.length = 0;
  jest.restoreAllMocks();
  jest.spyOn(Linking, 'openURL').mockResolvedValue(true as any);
});

describe('blokaj', () => {
  it.each(['force', 'maintenance'] as const)(
    '%s: "Sonra" yok, aşağı sürükleme kapalı, dismiss bağlanmamış',
    (action) => {
      const { props } = renderGate({ action, isBlocking: true });

      expect(screen.queryByText('Sonra')).toBeNull();
      expect(props.enablePanDownToClose).toBe(false);
      expect(props.onClose).toBeUndefined();
      // Drag handle da yok — kapatılabilir izlenimi vermesin.
      expect(props.handleComponent).toBeNull();
    },
  );

  it('force: store linki yoksa ölü buton göstermez', () => {
    renderGate({ action: 'force', isBlocking: true, storeUrl: null });
    expect(screen.queryByText('Güncelle')).toBeNull();
    // Mesaj yine okunabilir olmalı — kullanıcı neden kilitlendiğini bilsin.
    expect(screen.getByText(/desteklenmiyor/i)).toBeTruthy();
  });

  it('maintenance: store yerine "tekrar dene" gösterir', () => {
    const { onRetry } = renderGate({ action: 'maintenance', isBlocking: true });
    expect(screen.queryByText('Güncelle')).toBeNull();

    fireEvent.press(screen.getByText('Tekrar dene'));
    expect(onRetry).toHaveBeenCalled();
  });
});

describe('soft', () => {
  it('"Sonra" ile kapanır ve aşağı sürükleme açıktır', () => {
    const { onDismiss, props } = renderGate({ action: 'soft' });

    expect(props.enablePanDownToClose).toBe(true);
    // Swipe-down da "Sonra" ile aynı anlama gelir.
    expect(props.onClose).toBe(onDismiss);

    fireEvent.press(screen.getByText('Sonra'));
    expect(onDismiss).toHaveBeenCalled();
  });

  it('güncelle butonu backend’in verdiği store linkini açar', () => {
    renderGate({ action: 'soft', storeUrl: 'https://apps.apple.com/app/id42' });
    fireEvent.press(screen.getByText('Güncelle'));
    expect(Linking.openURL).toHaveBeenCalledWith('https://apps.apple.com/app/id42');
  });
});

describe('metin', () => {
  it('backend mesajını gösterir', () => {
    renderGate({ action: 'force', isBlocking: true, message: 'Sunucudan gelen gerekçe.' });
    expect(screen.getByText('Sunucudan gelen gerekçe.')).toBeTruthy();
  });

  it('mesaj boş gelirse karar tipine göre yerel metne düşer', () => {
    renderGate({ action: 'maintenance', isBlocking: true, message: '' });
    expect(screen.getByText(/bakım yapıyoruz/i)).toBeTruthy();
  });
});
