jest.mock('expo-sqlite');

import * as SQLite from 'expo-sqlite';
import { openChatDb, getChatDb, __resetChatDbForTests } from '@/features/chat/db/chatDb';
import {
  bumpConversationUnread,
  clearConversationUnread,
  failStalePendingSends,
  messageExists,
  readConversations,
  readFailedSends,
  saveMessage,
  touchConversationFromMessage,
  upsertConversations,
} from '@/features/chat/chatRepository';
import { ContentType } from '@/features/chat/contentType';
import type { ConversationListItemDto, MessageDto } from '@/shared/types';

const { __resetAllDatabases } = SQLite as unknown as { __resetAllDatabases: () => void };

const CONV = 'conv-1';
const OTHER = 'conv-2';
const T1 = '2026-10-10T10:00:00.000Z';
const T2 = '2026-10-10T11:00:00.000Z';
const T3 = '2026-10-10T12:00:00.000Z';

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

const row = (id = CONV) =>
  getChatDb().getFirst<any>('SELECT * FROM conversations WHERE conversation_id = ?', [id])!;

beforeEach(() => {
  __resetChatDbForTests();
  __resetAllDatabases();
  openChatDb();
});

describe('touchConversationFromMessage', () => {
  it('önizleme, damga ve tip yazılır', () => {
    upsertConversations([conv({ lastMessageAt: T1, lastMessagePreview: 'eski' })]);

    touchConversationFromMessage({
      conversationId: CONV,
      content: 'yeni mesaj',
      sentAt: T2,
      contentType: 0,
    });

    const r = row();
    expect(r.last_message_preview).toBe('yeni mesaj');
    expect(r.last_message_at).toBe(T2);
    expect(r.last_message_at_ms).toBe(Date.parse(T2));
    expect(r.last_message_content_type).toBe(ContentType.Text);
  });

  it('sesli mesajın tipi sayıya iner (sunucu "Voice" diye yollasa da)', () => {
    upsertConversations([conv()]);

    touchConversationFromMessage({
      conversationId: CONV,
      content: '',
      sentAt: T2,
      contentType: 'Voice' as any,
    });

    expect(row().last_message_content_type).toBe(ContentType.Voice);
  });

  it('damga GERİYE GİTMEZ — sıra dışı gelen eski mesaj satıra dokunmaz', () => {
    upsertConversations([conv({ lastMessageAt: T2, lastMessagePreview: 'yeni' })]);

    touchConversationFromMessage({
      conversationId: CONV,
      content: 'eski',
      sentAt: T1,
      contentType: 0,
    });

    expect(row().last_message_preview).toBe('yeni');
    expect(row().last_message_at).toBe(T2);
  });

  it('AYNI damga yazılabilir — sunucu echo\'su optimistic balonu düzeltebilsin', () => {
    upsertConversations([conv()]);
    touchConversationFromMessage({ conversationId: CONV, content: 'taslak', sentAt: T2 });

    touchConversationFromMessage({ conversationId: CONV, content: 'sunucu hâli', sentAt: T2 });

    expect(row().last_message_preview).toBe('sunucu hâli');
  });

  it('satır yoksa sessizce hiçbir şey yapmaz', () => {
    expect(() =>
      touchConversationFromMessage({ conversationId: 'yok', content: 'x', sentAt: T2 }),
    ).not.toThrow();
    expect(readConversations()).toHaveLength(0);
  });

  it('damgasız çağrı satıra dokunmaz', () => {
    upsertConversations([conv({ lastMessageAt: T1, lastMessagePreview: 'eski' })]);
    touchConversationFromMessage({ conversationId: CONV, content: 'x', sentAt: null });
    expect(row().last_message_preview).toBe('eski');
  });

  it('LİSTE SIRASI yerel yazımla değişir — soğuk açılışın asıl kazancı', () => {
    upsertConversations([
      conv({ lastMessageAt: T2 }),
      conv({ conversationId: OTHER, lastMessageAt: T3 }),
    ]);
    expect(readConversations().map((c) => c.conversationId)).toEqual([OTHER, CONV]);

    // CONV'e realtime mesaj geldi; ağ cevabı yok.
    touchConversationFromMessage({
      conversationId: CONV,
      content: 'en yeni',
      sentAt: '2026-10-10T13:00:00.000Z',
    });

    expect(readConversations().map((c) => c.conversationId)).toEqual([CONV, OTHER]);
  });
});

describe('unread sayacı', () => {
  it('bump ilerletir, clear sıfırlar', () => {
    upsertConversations([conv({ unreadCount: 0 })]);

    bumpConversationUnread(CONV);
    bumpConversationUnread(CONV);
    expect(row().unread_count).toBe(2);

    clearConversationUnread(CONV);
    expect(row().unread_count).toBe(0);
  });

  it('sıfırlanmış sayaç, bayat bir /conversations yanıtıyla GERİ GELMEZ', () => {
    // Sunucu 3 okunmamış diyordu; biz sohbete girip okuduk.
    upsertConversations([conv({ unreadCount: 3, lastMessageAt: T2 })]);
    clearConversationUnread(CONV);

    // Uçuşta olan (daha yeni mesaj taşımayan) yanıt geri döndü.
    upsertConversations([conv({ unreadCount: 3, lastMessageAt: T2 })]);

    expect(row().unread_count).toBe(0);
  });

  it('okunmamış sayacı readConversations projeksiyonuna düşer', () => {
    upsertConversations([conv({ unreadCount: 0 })]);
    bumpConversationUnread(CONV);
    expect(readConversations()[0].unreadCount).toBe(1);
  });
});

describe('last_message_content_type TEK FORMAT (sayı)', () => {
  it('wire PascalCase enum\'u sayıya iner — ağ yazıcısı', () => {
    upsertConversations([
      conv({ lastMessageAt: T2, lastMessageContentType: 'Voice' as any }),
    ]);

    expect(row().last_message_content_type).toBe(ContentType.Voice);
    expect(readConversations()[0].lastMessageContentType).toBe(ContentType.Voice);
  });

  it('realtime yazıcısı ile AYNI formatta — satırın kaynağı davranışı değiştirmez', () => {
    upsertConversations([conv({ lastMessageAt: T1, lastMessageContentType: 'Voice' as any })]);
    const fromNetwork = row().last_message_content_type;

    touchConversationFromMessage({
      conversationId: CONV,
      content: '',
      sentAt: T2,
      contentType: 'Voice' as any,
    });

    expect(row().last_message_content_type).toBe(fromNetwork);
  });

  it('alan hiç gelmediyse NULL kalır ("bilmiyoruz" ≠ Text)', () => {
    upsertConversations([conv({ lastMessageAt: T1 })]);
    expect(row().last_message_content_type).toBeNull();
    expect(readConversations()[0].lastMessageContentType).toBeUndefined();
  });
});

describe('messageExists', () => {
  it('yazılmış mesajı bulur, bilinmeyeni bulmaz', () => {
    saveMessage(
      { id: 'm1', conversationId: CONV, senderId: 'partner-1', content: 'a', sentAt: T1 } as MessageDto,
      CONV,
    );
    expect(messageExists('m1')).toBe(true);
    expect(messageExists('m2')).toBe(false);
    expect(messageExists('')).toBe(false);
  });
});

/**
 * v5 indeksi — sorgu planı testi.
 *
 * Bunlar "çalışıyor mu" değil "indeksi KULLANIYOR mu" testleri. Kısmi indeksin
 * sorgudaki fazlalık terime bağlı olması (bkz. migrations V5) sessizce
 * bozulabilen bir şey: terimi silen biri hiçbir testi kırmaz ama her açılış
 * tüm arşivi taramaya döner. Plan assertion'ı o sessizliği bozuyor.
 */
describe('idx_messages_unsent', () => {
  const plan = (sql: string, params: any[] = []) =>
    getChatDb()
      .getAll<{ detail: string }>(`EXPLAIN QUERY PLAN ${sql}`, params)
      .map((r) => r.detail)
      .join(' | ');

  it('kısmi indeks kuruldu', () => {
    const idx = getChatDb().getAll<{ name: string }>(
      "SELECT name FROM sqlite_master WHERE type = 'index' AND tbl_name = 'messages' ORDER BY name",
    );
    expect(idx.map((i) => i.name)).toContain('idx_messages_unsent');
  });

  it('asılı pending taraması indeksten geçer', () => {
    expect(
      plan("SELECT COUNT(*) AS n FROM messages WHERE send_state = 'pending' AND send_state <> 'sent'"),
    ).toContain('idx_messages_unsent');
  });

  it('başarısız gönderim okuması indeksten geçer (sıralama dahil)', () => {
    const p = plan(
      `SELECT * FROM messages
        WHERE send_state = 'failed' AND send_state <> 'sent' AND sent_at_ms >= ?
        ORDER BY sent_at_ms ASC, id ASC LIMIT ?`,
      [0, 50],
    );
    expect(p).toContain('idx_messages_unsent');
    expect(p).not.toContain('TEMP B-TREE');
  });

  it('indeks davranışı değiştirmiyor: iki okuma yolu da doğru satırları veriyor', () => {
    saveMessage(
      {
        id: 'temp-c1',
        conversationId: CONV,
        clientMessageId: 'c1',
        senderId: 'me',
        content: 'gidemedi',
        sentAt: T1,
      } as MessageDto,
      CONV,
      'pending',
    );
    saveMessage(
      { id: 'm-sent', conversationId: CONV, senderId: 'me', content: 'gitti', sentAt: T2 } as MessageDto,
      CONV,
    );

    expect(failStalePendingSends()).toBe(1);
    expect(readFailedSends().map((r) => r.id)).toEqual(['temp-c1']);
  });
});
