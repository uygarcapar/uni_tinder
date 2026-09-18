jest.mock('expo-sqlite');
jest.mock('react-native-mmkv');

import * as SQLite from 'expo-sqlite';
import { openChatDb, getChatDb, __resetChatDbForTests } from '@/features/chat/db/chatDb';
import {
  importLegacyChatCache,
  __resetImportMarker,
} from '@/features/chat/db/importLegacyCache';
import { readSyncState } from '@/features/chat/chatRepository';
import { chatCacheStorage } from '@/shared/store/mmkvStorage';

const { __resetAllDatabases } = SQLite as unknown as { __resetAllDatabases: () => void };

const CONV = 'conv-1';
const BASE = Date.UTC(2026, 8, 16, 10, 0, 0);

const msg = (n: number, over: Record<string, any> = {}) => ({
  id: `m${n}`,
  conversationId: CONV,
  senderId: 'partner',
  content: `mesaj ${n}`,
  contentType: 0,
  sentAt: new Date(BASE + n * 60_000).toISOString(),
  ...over,
});

/**
 * redux-persist zarfı: DIŞ nesne JSON, ama her anahtarın DEĞERİ ayrıca
 * JSON string'lenmiş. Tek parse yetmiyor — import bunu bilmek zorunda.
 */
function writeLegacyBlob(payload: {
  conversations?: any[];
  messagesByConv?: Record<string, any>;
  unreadTotal?: number;
}) {
  chatCacheStorage.set(
    'persist:chat',
    JSON.stringify({
      conversations: JSON.stringify(payload.conversations ?? []),
      messagesByConv: JSON.stringify(payload.messagesByConv ?? {}),
      unreadTotal: JSON.stringify(payload.unreadTotal ?? 0),
    }),
  );
}

const ids = () =>
  getChatDb()
    .getAll<{ id: string }>('SELECT id FROM messages ORDER BY sent_at_ms DESC')
    .map((r) => r.id);

beforeEach(() => {
  __resetChatDbForTests();
  __resetAllDatabases();
  chatCacheStorage.clearAll();
  __resetImportMarker();
  openChatDb();
});

describe('importLegacyChatCache', () => {
  it('zarfı çözer, mesajları ve sync_state\'i kurar', () => {
    writeLegacyBlob({
      conversations: [
        {
          conversationId: CONV,
          partnerUserId: 'p1',
          partnerDisplayName: 'Ada',
          unreadCount: 2,
          isActive: true,
          partnerIsOnline: false,
        },
      ],
      messagesByConv: {
        [CONV]: { messages: [msg(3), msg(2), msg(1)], nextCursor: 'c1', hasMore: true },
      },
    });

    const result = importLegacyChatCache();

    expect(result).toEqual({ ran: true, conversations: 1, messages: 3 });
    expect(ids()).toEqual(['m3', 'm2', 'm1']);

    const sync = readSyncState(CONV)!;
    expect(sync.oldest_loaded_sent_at_ms).toBe(BASE + 60_000);
    expect(sync.next_cursor).toBe('c1');
    expect(sync.has_more).toBe(1);
  });

  it('optimistic artıkları (temp- / _pending / _failed) taşımaz', () => {
    writeLegacyBlob({
      messagesByConv: {
        [CONV]: {
          messages: [
            msg(4, { id: 'temp-x', clientMessageId: 'cmid-x' }),
            msg(3, { _pending: true }),
            msg(2, { _failed: true }),
            msg(1),
          ],
          nextCursor: null,
          hasMore: false,
        },
      },
    });

    const result = importLegacyChatCache();

    expect(result.messages).toBe(1);
    expect(ids()).toEqual(['m1']);
  });

  it('İKİNCİ çağrıda hiçbir şey yapmaz (işaret appKv\'de)', () => {
    writeLegacyBlob({
      messagesByConv: { [CONV]: { messages: [msg(1)], nextCursor: null, hasMore: false } },
    });

    expect(importLegacyChatCache().ran).toBe(true);
    expect(importLegacyChatCache()).toEqual({ ran: false, conversations: 0, messages: 0 });
    expect(ids()).toEqual(['m1']);
  });

  it('DRAFT ANAHTARLARI SAĞ KALIR — aynı MMKV dosyasında yaşıyorlar', () => {
    chatCacheStorage.set('draft:conv-1', 'yarım kalan mesaj');
    chatCacheStorage.set('draft:conv-2', 'başka taslak');
    writeLegacyBlob({
      messagesByConv: { [CONV]: { messages: [msg(1)], nextCursor: null, hasMore: false } },
    });

    importLegacyChatCache();

    expect(chatCacheStorage.getString('draft:conv-1')).toBe('yarım kalan mesaj');
    expect(chatCacheStorage.getString('draft:conv-2')).toBe('başka taslak');
  });

  it('blob AYNI RELEASE\'TE silinmez — kill-switch geri dönüşü için durmalı', () => {
    writeLegacyBlob({
      messagesByConv: { [CONV]: { messages: [msg(1)], nextCursor: null, hasMore: false } },
    });

    importLegacyChatCache();

    expect(chatCacheStorage.getString('persist:chat')).toBeDefined();
  });

  it('blob yoksa (temiz kurulum) sessizce işaretler', () => {
    const result = importLegacyChatCache();
    expect(result.ran).toBe(false);
    expect(importLegacyChatCache().ran).toBe(false);
  });

  it('bozuk blob uygulamayı açılmaz hale GETİRMEZ', () => {
    jest.spyOn(console, 'error').mockImplementation(() => {});
    chatCacheStorage.set('persist:chat', '{bu json değil');

    expect(() => importLegacyChatCache()).not.toThrow();
    expect(ids()).toEqual([]);
    // İşaret yine konur: aynı bozuk blob'u her açılışta denemenin faydası yok.
    expect(importLegacyChatCache().ran).toBe(false);

    (console.error as jest.Mock).mockRestore();
  });

  it('zarfın içindeki anahtar bozuksa o anahtar atlanır, diğerleri gelir', () => {
    chatCacheStorage.set(
      'persist:chat',
      JSON.stringify({
        conversations: '[[bozuk',
        messagesByConv: JSON.stringify({
          [CONV]: { messages: [msg(1)], nextCursor: null, hasMore: false },
        }),
      }),
    );

    const result = importLegacyChatCache();

    expect(result.conversations).toBe(0);
    expect(ids()).toEqual(['m1']);
  });
});
