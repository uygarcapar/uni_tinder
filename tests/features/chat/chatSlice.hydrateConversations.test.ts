// chatSlice → chatService → api → tokenStorage zinciri native storage'a iniyor;
// reducer testinde ikisi de mock'lanır (davranışları burada konu değil).
jest.mock('@react-native-async-storage/async-storage', () =>
  require('@react-native-async-storage/async-storage/jest/async-storage-mock'),
);
jest.mock('react-native-mmkv'); // <rootDir>/__mocks__/react-native-mmkv.ts

import reducer, { hydrateConversations } from '@/features/chat/chatSlice';
import type { ConversationListItemDto } from '@/shared/types';

/**
 * Diskten gelen liste bir PRIMER'dır: boşken doldurur, doluyken susar.
 *
 * İki kural ayrı ayrı kilitleniyor çünkü ikisinin de bozulması sessiz:
 *  - doluyken yazarsa bayat disk satırı az önce gelen mesajı ezer
 *  - `_conversationsFetchedAt` yazarsa 15sn staleness guard'ı odak
 *    tazelemesini yutar ve AppNavigator ağ hiç cevap vermeden boot'u
 *    "oturdu" sayar
 */

const fromDisk = (over: Partial<ConversationListItemDto> = {}): ConversationListItemDto =>
  ({
    conversationId: 'conv-1',
    partnerUserId: 'partner-1',
    partnerDisplayName: 'Ada',
    unreadCount: 2,
    isActive: true,
    partnerIsOnline: false,
    lastMessageAt: '2026-09-16T10:00:00.000Z',
    ...over,
  }) as ConversationListItemDto;

const initial = () => reducer(undefined, { type: '@@INIT' });

it('boş listeyi diskten dolduruyor', () => {
  const state = reducer(initial(), hydrateConversations([fromDisk()]));

  expect(state.conversations).toHaveLength(1);
  expect(state.conversations[0].conversationId).toBe('conv-1');
});

it('sekme rozeti de ağı beklemiyor', () => {
  const state = reducer(
    initial(),
    hydrateConversations([fromDisk(), fromDisk({ conversationId: 'conv-2', unreadCount: 3 })]),
  );

  expect(state.unreadTotal).toBe(5);
});

it('presence diskten "online" doğmuyor', () => {
  const state = reducer(initial(), hydrateConversations([fromDisk()]));

  expect(state.presenceByUser['partner-1']).toEqual({ isOnline: false, lastSeen: null });
});

it('liste DOLUYSA hiçbir şey yazmıyor (ağ/realtime kazanır)', () => {
  const live = reducer(initial(), hydrateConversations([fromDisk({ unreadCount: 0 })]));
  const after = reducer(
    live,
    hydrateConversations([fromDisk({ lastMessagePreview: 'bayat', unreadCount: 9 })]),
  );

  expect(after.conversations).toBe(live.conversations);
  expect(after.unreadTotal).toBe(live.unreadTotal);
});

it('taze-fetch damgasına DOKUNMUYOR — staleness guard ve boot-settle etkilenmiyor', () => {
  const state = reducer(initial(), hydrateConversations([fromDisk()]));

  expect(state._conversationsFetchedAt).toBeUndefined();
  expect(state._conversationsHydratedAt).toBeGreaterThan(0);
});

it('boş disk de "okudum" damgası bırakıyor — boş durum ağı beklemiyor', () => {
  const state = reducer(initial(), hydrateConversations([]));

  expect(state.conversations).toHaveLength(0);
  expect(state._conversationsHydratedAt).toBeGreaterThan(0);
});
