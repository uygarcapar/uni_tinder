jest.mock('expo-sqlite');

import * as SQLite from 'expo-sqlite';
import { openChatDb, getChatDb, __resetChatDbForTests } from '@/features/chat/db/chatDb';
import { upsertConversations } from '@/features/chat/chatRepository';
import type { ConversationListItemDto } from '@/shared/types';

const { __resetAllDatabases } = SQLite as unknown as { __resetAllDatabases: () => void };

const CONV = 'conv-1';
const T1 = '2026-09-16T10:00:00.000Z';
const T2 = '2026-09-16T11:00:00.000Z';

const conv = (over: Partial<ConversationListItemDto> = {}): ConversationListItemDto =>
  ({
    conversationId: CONV,
    partnerUserId: 'partner-1',
    partnerDisplayName: 'Ada',
    unreadCount: 0,
    isActive: true,
    partnerIsOnline: false,
    ...over,
  }) as ConversationListItemDto;

const read = () =>
  getChatDb().getFirst<any>('SELECT * FROM conversations WHERE conversation_id = ?', [CONV])!;

beforeEach(() => {
  __resetChatDbForTests();
  __resetAllDatabases();
  openChatDb();
});

describe('(1) lastMessage — yerel kesin daha yeniyse yerel kazanır', () => {
  it('bayat sunucu yanıtı taze yerel önizlemeyi EZMEZ', () => {
    upsertConversations([conv({ lastMessageAt: T2, lastMessagePreview: 'yeni', lastMessageContentType: 0 })]);
    // /conversations bizden önceki hâli taşıyor (yarış).
    upsertConversations([conv({ lastMessageAt: T1, lastMessagePreview: 'eski' })]);

    const row = read();
    expect(row.last_message_preview).toBe('yeni');
    expect(row.last_message_at).toBe(T2);
  });

  it('sunucu gerçekten daha yeniyse sunucu kazanır', () => {
    upsertConversations([conv({ lastMessageAt: T1, lastMessagePreview: 'eski' })]);
    upsertConversations([conv({ lastMessageAt: T2, lastMessagePreview: 'yeni' })]);

    expect(read().last_message_preview).toBe('yeni');
  });
});

describe('(2) unreadCount — yerel 0 körlemesine ezilmez', () => {
  it('sunucu bayat sayaç taşıyorsa yerel 0 korunur', () => {
    upsertConversations([conv({ lastMessageAt: T2, unreadCount: 0 })]);
    // markRead ile yarışan yanıt: daha ESKİ mesaj + okunmamış sayacı.
    upsertConversations([conv({ lastMessageAt: T1, unreadCount: 3 })]);

    expect(read().unread_count).toBe(0);
  });

  it('açık olan sohbet her hâlükârda okunmuş sayılır', () => {
    upsertConversations([conv({ lastMessageAt: T1, unreadCount: 0 })]);
    upsertConversations([conv({ lastMessageAt: T2, unreadCount: 5 })], {
      activeConversationId: CONV,
    });

    expect(read().unread_count).toBe(0);
  });

  it('sunucu BİZİM BİLMEDİĞİMİZ daha yeni mesaj taşıyorsa sayaç kabul edilir', () => {
    upsertConversations([conv({ lastMessageAt: T1, unreadCount: 0 })]);
    upsertConversations([conv({ lastMessageAt: T2, unreadCount: 5 })]);

    expect(read().unread_count).toBe(5);
  });
});

describe('(3) restorableUntil — "alan gelmedi" ≠ "null geldi"', () => {
  it('alan hiç gelmezse yerel pencere korunur', () => {
    upsertConversations([conv({ isActive: false, restorableUntil: T2 })]);
    // Liste DTO'su bu alanı taşımıyor — unmatch sonrası force refetch.
    upsertConversations([conv({ isActive: false })]);

    expect(read().restorable_until).toBe(T2);
  });

  it('sunucu AÇIKÇA null derse pencere kapanır', () => {
    upsertConversations([conv({ isActive: false, restorableUntil: T2 })]);
    upsertConversations([conv({ isActive: false, restorableUntil: null })]);

    expect(read().restorable_until).toBeNull();
  });
});

describe('(4) deactivatedByMe — sunucuda YOK, client-only', () => {
  it('sohbet kapalıyken bayrak her fetch\'te silinmez', () => {
    upsertConversations([conv({ isActive: false })]);
    // Yerel aksiyon (unmatch) bayrağı koyar.
    getChatDb().run('UPDATE conversations SET deactivated_by_me = 1 WHERE conversation_id = ?', [CONV]);

    upsertConversations([conv({ isActive: false })]);

    expect(read().deactivated_by_me).toBe(1);
  });

  it('sohbet yeniden aktifse (restore/rematch) bayrak anlamını yitirir', () => {
    upsertConversations([conv({ isActive: false })]);
    getChatDb().run('UPDATE conversations SET deactivated_by_me = 1 WHERE conversation_id = ?', [CONV]);

    upsertConversations([conv({ isActive: true })]);

    expect(read().deactivated_by_me).toBeNull();
  });
});

describe('(5) closedByMe / closedReason — SUNUCUNUN cevabı', () => {
  it('sunucu değeri yazılıyor', () => {
    upsertConversations([
      conv({ isActive: false, closedByMe: true, closedReason: 'Unmatched' } as any),
    ]);

    const row = read();
    expect(row.closed_by_me).toBe(1);
    expect(row.closed_reason).toBe('Unmatched');
  });

  it('closedByMe:false "local wins" kuralına TABİ DEĞİL — tahmin değil bilgi', () => {
    upsertConversations([conv({ isActive: false, closedByMe: true } as any)]);
    upsertConversations([conv({ isActive: false, closedByMe: false } as any)]);

    expect(read().closed_by_me).toBe(0);
  });

  it('sunucu SUSUYORSA elimizdeki değer silinmiyor', () => {
    upsertConversations([
      conv({ isActive: false, closedByMe: true, closedReason: 'Blocked' } as any),
    ]);
    // Alanı taşımayan bir yanıt (eski sürüm / uç deploy edilmemiş).
    upsertConversations([conv({ isActive: false })]);

    expect(read().closed_by_me).toBe(1);
    expect(read().closed_reason).toBe('Blocked');
  });

  it('sohbet yeniden aktifse temizleniyor — anlamını yitirdi', () => {
    upsertConversations([
      conv({ isActive: false, closedByMe: true, closedReason: 'Unmatched' } as any),
    ]);
    upsertConversations([conv({ isActive: true })]);

    expect(read().closed_by_me).toBeNull();
    expect(read().closed_reason).toBeNull();
  });
});

describe('presence şemada YOK', () => {
  it('conversations tablosunda partner_is_online kolonu bulunmaz', () => {
    const cols = getChatDb()
      .getAll<{ name: string }>('PRAGMA table_info(conversations)')
      .map((c) => c.name);
    expect(cols).not.toContain('partner_is_online');
  });
});

describe('sıra', () => {
  it('sunucu listesinin sırası sort_order olarak saklanır', () => {
    upsertConversations([
      conv({ conversationId: 'a', partnerUserId: 'p-a' }),
      conv({ conversationId: 'b', partnerUserId: 'p-b' }),
      conv({ conversationId: 'c', partnerUserId: 'p-c' }),
    ]);

    const rows = getChatDb().getAll<{ conversation_id: string; sort_order: number }>(
      'SELECT conversation_id, sort_order FROM conversations ORDER BY sort_order',
    );
    expect(rows.map((r) => r.conversation_id)).toEqual(['a', 'b', 'c']);
  });
});
