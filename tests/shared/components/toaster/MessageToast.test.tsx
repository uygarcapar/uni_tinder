/**
 * Mesaj toast'ı — çapraz-mod etiketi.
 *
 * Test edilen şey ETİKETİN AD SATIRINDA VE ÖNDE olması: konuşmanın modu
 * seçili moddan farklıysa `[<mod adı>] <ad>` tek Text'te basılır; etiket
 * yoksa bugünkü çizim birebir korunur. Parantezi bileşen basar — metin
 * `discover.mode.title.*`ten gelir (karar showMessageToast'ta).
 */

// Kabuk cam efekti (expo-glass-effect / BlurView) testte gereksiz — çocukları
// aynen geçir.
jest.mock('@/shared/components/toaster/ToastShell', () => ({
  __esModule: true,
  default: ({ children }: { children: React.ReactNode }) => children,
}));

import type React from 'react';
import { render, screen } from '@testing-library/react-native';
import MessageToast from '@/shared/components/toaster/MessageToast';

it('modeLabel doluysa adın önüne köşeli parantezle basar', () => {
  render(<MessageToast senderName="Ayşe" preview="selam" modeLabel="Arkadaş" />);
  expect(screen.getByText('[Arkadaş] Ayşe')).toBeTruthy();
});

it('modeLabel yoksa yalnız adı basar', () => {
  render(<MessageToast senderName="Ayşe" preview="selam" />);
  expect(screen.getByText('Ayşe')).toBeTruthy();
  expect(screen.queryByText(/\[/)).toBeNull();
});

it('sesli mesajda da etiket ad satırında durur', () => {
  render(
    <MessageToast senderName="Ayşe" preview="Sesli mesaj" voiceDuration="0:12" modeLabel="Flört" />,
  );
  expect(screen.getByText('[Flört] Ayşe')).toBeTruthy();
  expect(screen.getByText('(0:12)')).toBeTruthy();
});
