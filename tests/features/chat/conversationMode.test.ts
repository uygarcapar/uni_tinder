jest.mock('expo-sqlite');

/**
 * Sohbetlerin MOD AYRIMI (backend 2026-10-21: eşleşme mod başına).
 *
 * Aynı çiftin Flört ve Arkadaş sohbeti AYRI iki satır. Süzme sunucuda değil
 * İSTEMCİDE: delta-sync ucu mod süzgeci taşımıyor ve SQLite aynası tüm modları
 * tutmak zorunda (soğuk açılışta okuma yolu diskten besleniyor).
 *
 * Buradaki testlerin koruduğu üç kural:
 *   1. Mod DİSKE yazılıyor ve geri okunuyor — yoksa soğuk açılışta liste iki
 *      modu karışık gösterir (ağ cevabı gelene kadar).
 *   2. Sunucu SUSARSA eldeki mod silinmiyor (COALESCE) — modsuz tek bir yazım
 *      sohbeti iki sekmede birden görünür hâle getirirdi.
 *   3. Rozet ile liste AYNI kuralı uyguluyor: modu bilinmeyen satır İKİSİNDE
 *      de sayılıyor/görünüyor. Ayrışsalardı rozet listede olmayan bir mesajı
 *      sayardı.
 */

import * as SQLite from 'expo-sqlite';
import { openChatDb, getChatDb, __resetChatDbForTests } from '@/features/chat/db/chatDb';
import {
  insertConversationFromMatch,
  readConversations,
  upsertConversations,
} from '@/features/chat/chatRepository';
import { selectUnreadForMode } from '@/features/chat/chatSlice';
import type { ConversationListItemDto } from '@/shared/types';

const { __resetAllDatabases } = SQLite as unknown as { __resetAllDatabases: () => void };

const conv = (
  conversationId: string,
  over: Partial<ConversationListItemDto> = {},
): ConversationListItemDto =>
  ({
    conversationId,
    partnerUserId: 'partner-1',
    partnerDisplayName: 'Ada',
    unreadCount: 0,
    isActive: true,
    partnerIsOnline: false,
    ...over,
  }) as ConversationListItemDto;

beforeEach(() => {
  __resetChatDbForTests();
  __resetAllDatabases();
  openChatDb();
});

describe('mod diskte', () => {
  it('aynı partnerin iki modlu sohbeti AYRI satır olarak duruyor', () => {
    upsertConversations([
      conv('c-dating', { mode: 'Dating' }),
      conv('c-friends', { mode: 'Friends' }),
    ]);

    const rows = readConversations();
    expect(rows).toHaveLength(2);
    expect(rows.map((r) => r.mode).sort()).toEqual(['Dating', 'Friends']);
    // Anahtar `conversationId`: partner ikisinde de aynı kişi.
    expect(new Set(rows.map((r) => r.partnerUserId)).size).toBe(1);
  });

  it('sunucu modu SÖYLEMEZSE eldeki mod korunuyor', () => {
    upsertConversations([conv('c-1', { mode: 'Friends' })]);
    // Alanı taşımayan bir yazım (eski sürüm / başka bir yol).
    upsertConversations([conv('c-1', { lastMessagePreview: 'selam' })]);

    expect(readConversations()[0].mode).toBe('Friends');
  });

  it('sunucu modu DEĞİŞTİRİRSE sunucu kazanıyor', () => {
    upsertConversations([conv('c-1', { mode: 'Dating' })]);
    upsertConversations([conv('c-1', { mode: 'Friends' })]);

    expect(readConversations()[0].mode).toBe('Friends');
  });

  it('hiç yazılmamış mod `undefined` okunuyor — "Dating" DEĞİL', () => {
    upsertConversations([conv('c-1')]);
    expect(readConversations()[0].mode).toBeUndefined();
  });

  it('eşleşmeden doğan satır modu payload’dan alıyor', () => {
    insertConversationFromMatch({
      conversationId: 'c-new',
      partnerUserId: 'partner-9',
      partnerDisplayName: 'Zoe',
      matchedAt: '2026-10-21T10:00:00.000Z',
      mode: 'Friends',
    });
    expect(readConversations()[0].mode).toBe('Friends');
  });

  it('eşleşme payload’ı mod taşımıyorsa satır modsuz açılıyor', () => {
    insertConversationFromMatch({
      conversationId: 'c-new',
      partnerUserId: 'partner-9',
      partnerDisplayName: 'Zoe',
      matchedAt: '2026-10-21T10:00:00.000Z',
    });
    expect(readConversations()[0].mode).toBeUndefined();
  });
});

describe('sekme rozeti — selectUnreadForMode', () => {
  const stateWith = (rows: Partial<ConversationListItemDto>[], unreadTotal = 0) => ({
    chat: {
      conversations: rows.map((r, i) => conv(`c-${i}`, r)),
      unreadTotal,
    },
  });

  it('yalnız SEÇİLİ modun okunmamışlarını sayıyor', () => {
    const state = stateWith([
      { mode: 'Dating', unreadCount: 3 },
      { mode: 'Friends', unreadCount: 2 },
    ]);
    expect(selectUnreadForMode(state, 'Friends')).toBe(2);
    expect(selectUnreadForMode(state, 'Dating')).toBe(3);
  });

  it('modu BİLİNMEYEN satır iki modda da sayılıyor (liste ile aynı kural)', () => {
    const state = stateWith([
      { unreadCount: 4 },
      { mode: 'Dating', unreadCount: 1 },
    ]);
    expect(selectUnreadForMode(state, 'Friends')).toBe(4);
    expect(selectUnreadForMode(state, 'Dating')).toBe(5);
  });

  it('liste HENÜZ YOKKEN sunucunun mod kapsamlı toplamına düşüyor', () => {
    // Soğuk açılış: hydrate olmadan önce tek sinyal `/unread-count?mode=`.
    expect(selectUnreadForMode(stateWith([], 7), 'Friends')).toBe(7);
  });

  it('satır varken sunucu toplamına BAKMIYOR', () => {
    // Liste sayfalanmıyor: satırlar tamsa toplam da tam. Bayat bir sunucu
    // sayısı rozeti listedeki gerçekten koparmamalı.
    const state = stateWith([{ mode: 'Friends', unreadCount: 1 }], 99);
    expect(selectUnreadForMode(state, 'Friends')).toBe(1);
  });
});
