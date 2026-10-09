jest.mock('expo-sqlite');

import * as SQLite from 'expo-sqlite';
import { openChatDb, __resetChatDbForTests } from '@/features/chat/db/chatDb';
import {
  failStalePendingSends,
  insertConversationFromMatch,
  readConversations,
  readWindow,
  saveMessage,
  upsertConversations,
} from '@/features/chat/chatRepository';
import { clear as clearMessageCache } from '@/features/chat/messageCache';
import type { ConversationListItemDto, MessageDto } from '@/shared/types';

/**
 * Sohbet listesinin DİSKTEN okunması (local-first açılış).
 *
 * Kilitlenen asıl şey ÜÇ DURUMLU alanlar: diskten dönüş `undefined` ile
 * `false`/`null` ayrımını korumak zorunda — rozet, "Geri Al" kapısı ve
 * resolveClosedByMe üçü de bu ayrımdan besleniyor.
 */

const { __resetAllDatabases } = SQLite as unknown as { __resetAllDatabases: () => void };

const T1 = '2026-09-16T10:00:00.000Z';
const T2 = '2026-09-16T11:00:00.000Z';

const conv = (over: Partial<ConversationListItemDto> = {}): ConversationListItemDto =>
  ({
    conversationId: 'conv-1',
    partnerUserId: 'partner-1',
    partnerDisplayName: 'Ada',
    unreadCount: 0,
    isActive: true,
    partnerIsOnline: true,
    ...over,
  }) as ConversationListItemDto;

beforeEach(() => {
  __resetChatDbForTests();
  __resetAllDatabases();
  clearMessageCache();
  openChatDb();
});

describe('alanların diskten dönüşü', () => {
  it('temel alanlar korunuyor', () => {
    upsertConversations([
      conv({
        matchId: 'match-1',
        partnerProfileImageUrl: 'https://cdn/a.jpg',
        lastMessagePreview: 'merhaba',
        lastMessageAt: T1,
        lastMessageContentType: 2,
        unreadCount: 3,
        isUnlimited: false,
        remainingMessages: 7,
        requiresPremium: true,
      }),
    ]);

    expect(readConversations()[0]).toMatchObject({
      conversationId: 'conv-1',
      matchId: 'match-1',
      partnerUserId: 'partner-1',
      partnerDisplayName: 'Ada',
      partnerProfileImageUrl: 'https://cdn/a.jpg',
      lastMessagePreview: 'merhaba',
      lastMessageAt: T1,
      lastMessageContentType: 2,
      unreadCount: 3,
      isActive: true,
      isUnlimited: false,
      remainingMessages: 7,
      requiresPremium: true,
    });
  });

  it('presence diskten GELMİYOR — herkes offline doğuyor', () => {
    upsertConversations([conv({ partnerIsOnline: true })]);

    expect(readConversations()[0].partnerIsOnline).toBe(false);
  });

  it('sunucunun söylemediği alanlar undefined kalıyor (false DEĞİL)', () => {
    // isUnlimited/requiresPremium/closedByMe hiç gönderilmemiş bir satır.
    upsertConversations([conv({ lastMessageAt: T1 })]);

    const row = readConversations()[0];
    expect(row.isUnlimited).toBeUndefined();
    expect(row.requiresPremium).toBeUndefined();
    expect(row.closedByMe).toBeUndefined();
    expect(row.deactivatedByMe).toBeUndefined();
  });

  it('restorableUntil üç durumlu: alan gelmedi → undefined', () => {
    upsertConversations([conv({ isActive: false })]);

    expect(readConversations()[0].restorableUntil).toBeUndefined();
  });

  it('restorableUntil: sunucu AÇIKÇA null dedi → null (pencere YOK)', () => {
    upsertConversations([conv({ isActive: false, restorableUntil: null })]);

    expect(readConversations()[0].restorableUntil).toBeNull();
  });

  it('restorableUntil: pencere varsa damga dönüyor', () => {
    upsertConversations([conv({ isActive: false, restorableUntil: T2 })]);

    expect(readConversations()[0].restorableUntil).toBe(T2);
  });

  it('kapalı sohbette closedByMe/closedReason dönüyor', () => {
    upsertConversations([
      conv({ isActive: false, closedByMe: true, closedReason: 'Blocked' }),
    ]);

    expect(readConversations()[0]).toMatchObject({
      isActive: false,
      closedByMe: true,
      closedReason: 'Blocked',
    });
  });
});

describe('sıra', () => {
  it('en yeni mesaj en üstte — sort_order DEĞİL damga', () => {
    // Sunucu sırası A, B (index 0, 1) ama B daha yeni: yerel bir mesaj B'nin
    // damgasını güncelledi, index bayat kaldı.
    upsertConversations([
      conv({ conversationId: 'A', lastMessageAt: T1 }),
      conv({ conversationId: 'B', lastMessageAt: T1 }),
    ]);
    upsertConversations([conv({ conversationId: 'B', lastMessageAt: T2 })]);

    expect(readConversations().map((c) => c.conversationId)).toEqual(['B', 'A']);
  });

  it('hiç mesajlaşılmamış yeni eşleşme listenin başında', () => {
    upsertConversations([conv({ conversationId: 'A', lastMessageAt: T1 })]);
    insertConversationFromMatch({
      conversationId: 'YENI',
      partnerUserId: 'partner-2',
      partnerDisplayName: 'Bora',
      matchedAt: T2,
    });

    expect(readConversations().map((c) => c.conversationId)).toEqual(['YENI', 'A']);
  });
});

describe('açılışta asılı gönderimler', () => {
  const pending: MessageDto = {
    id: 'temp-cmid-1',
    conversationId: 'conv-1',
    senderId: 'me',
    content: 'gidemedi',
    contentType: 0,
    sentAt: T1,
    clientMessageId: 'cmid-1',
  } as MessageDto;

  it('pending satır failed oluyor → balonda "tekrar dene" çıkabiliyor', () => {
    saveMessage(pending, 'conv-1', 'pending');

    expect(failStalePendingSends()).toBe(1);
    const row = readWindow('conv-1')[0];
    expect(row.send_state).toBe('failed');
  });

  it('gönderilmiş satırlara DOKUNMUYOR', () => {
    saveMessage({ ...pending, id: 'm-sent', clientMessageId: 'cmid-2' }, 'conv-1');

    expect(failStalePendingSends()).toBe(0);
    expect(readWindow('conv-1')[0].send_state).toBe('sent');
  });
});
