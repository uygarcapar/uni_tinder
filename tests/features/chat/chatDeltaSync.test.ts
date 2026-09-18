jest.mock('expo-sqlite');
jest.mock('react-native-mmkv');
jest.mock('@/features/chat/chatService', () => ({
  __esModule: true,
  default: { getChanges: jest.fn() },
  HISTORY_PAGE_SIZE: 50,
  CHANGES_PAGE_SIZE: 200,
}));
jest.mock('@/shared/store/chatFlags', () => ({
  CHAT_PERSIST_ENABLED: false,
  CHAT_SQLITE_ENABLED: true,
  CHAT_DELTA_SYNC_ENABLED: true,
}));

import * as SQLite from 'expo-sqlite';
import chatService from '@/features/chat/chatService';
import { openChatDb, getChatDb, __resetChatDbForTests } from '@/features/chat/db/chatDb';
import {
  getRetentionWindowDays,
  getSyncWatermark,
  saveMessage,
  setSyncWatermark,
} from '@/features/chat/chatRepository';
import { pullChanges, __resetDeltaSyncForTests } from '@/features/chat/chatDeltaSync';
import { clear as clearMessageCache } from '@/features/chat/messageCache';
import { CHAT_ERROR_CODES } from '@/shared/constants/responseCodes';
import type { MessageDto } from '@/shared/types';

const { __resetAllDatabases } = SQLite as unknown as { __resetAllDatabases: () => void };
const getChanges = (chatService as any).getChanges as jest.Mock;

const CONV = 'conv-1';
const msg = (id: string, over: Partial<MessageDto> = {}): MessageDto =>
  ({
    id,
    conversationId: CONV,
    senderId: 'partner',
    content: `içerik ${id}`,
    contentType: 0,
    sentAt: '2026-09-18T10:00:00.000Z',
    ...over,
  }) as MessageDto;

const rowOf = (id: string) =>
  getChatDb().getFirst<any>('SELECT * FROM messages WHERE id = ?', [id]);
const ids = () =>
  getChatDb()
    .getAll<{ id: string }>('SELECT id FROM messages ORDER BY id')
    .map((r) => r.id);

/** Sunucunun UT kodlu hata yanıtı. */
const apiError = (code: string) => ({ response: { status: 400, data: { code } } });

beforeEach(() => {
  __resetChatDbForTests();
  __resetAllDatabases();
  __resetDeltaSyncForTests();
  clearMessageCache();
  openChatDb();
  getChanges.mockReset();
});

describe('temel akış', () => {
  it('mesajları ve sohbetleri uygular, watermark\'ı ilerletir', async () => {
    getChanges.mockResolvedValueOnce({
      watermark: 'wm-2',
      hasMore: false,
      messages: [msg('m1')],
      conversations: [
        {
          conversationId: CONV,
          partnerUserId: 'p1',
          partnerDisplayName: 'Ada',
          unreadCount: 1,
          isActive: true,
          partnerIsOnline: false,
        },
      ],
      deletions: [],
    });

    const result = await pullChanges();

    expect(result.messages).toBe(1);
    expect(ids()).toEqual(['m1']);
    expect(getSyncWatermark()).toBe('wm-2');
    expect(getChanges).toHaveBeenCalledWith({ watermark: null });
  });

  it('kayıtlı watermark\'ı gönderiyor', async () => {
    setSyncWatermark('wm-1');
    getChanges.mockResolvedValueOnce({ watermark: 'wm-2', hasMore: false });

    await pullChanges();

    expect(getChanges).toHaveBeenCalledWith({ watermark: 'wm-1' });
  });

  it('hasMore ile sayfalıyor', async () => {
    getChanges
      .mockResolvedValueOnce({ watermark: 'wm-2', hasMore: true, messages: [msg('m1')] })
      .mockResolvedValueOnce({ watermark: 'wm-3', hasMore: false, messages: [msg('m2')] });

    const result = await pullChanges();

    expect(result.pages).toBe(2);
    expect(ids()).toEqual(['m1', 'm2']);
    expect(getSyncWatermark()).toBe('wm-3');
  });
});

describe('deletions[] — messages[] ile KARŞILIKLI DIŞLAYAN', () => {
  it('elimizdeki mesajı tombstone ile işaretler ve İÇERİĞİ SİLER', async () => {
    saveMessage(msg('m1', { content: 'gizli metin', mediaUrl: 'media-1' }), CONV);
    getChanges.mockResolvedValueOnce({
      watermark: 'wm-2',
      hasMore: false,
      messages: [],
      deletions: [
        {
          messageId: 'm1',
          conversationId: CONV,
          deletedAt: '2026-09-18T12:00:00.000Z',
          deletedForEveryone: true,
        },
      ],
    });

    const result = await pullChanges();

    expect(result.deletions).toBe(1);
    const row = rowOf('m1');
    expect(row.deleted_at).toBe('2026-09-18T12:00:00.000Z');
    expect(row.deleted_for_everyone).toBe(1);
    expect(row.content).toBe('');
    expect(row.media_url).toBeNull();
  });

  it('deletedForEveryone:false OLSA BİLE içeriği siler', async () => {
    // Sunucu delta'da metni hiç göndermiyor; yerelde tutmaya devam etmek o
    // kararı boşa çıkarırdı.
    saveMessage(msg('m1', { content: 'bende sil' }), CONV);
    getChanges.mockResolvedValueOnce({
      watermark: 'wm-2',
      hasMore: false,
      deletions: [
        {
          messageId: 'm1',
          conversationId: CONV,
          deletedAt: '2026-09-18T12:00:00.000Z',
          deletedForEveryone: false,
        },
      ],
    });

    await pullChanges();

    expect(rowOf('m1').content).toBe('');
    expect(rowOf('m1').deleted_for_everyone).toBe(0);
  });

  it('hiç görmediğimiz mesajın tombstone\'u SATIR YARATMAZ', async () => {
    // Offline'dayken hem yaratılıp hem silinmiş olabilir. Tombstone içerik
    // taşımıyor; satır yaratsaydık boş bir balon çizerdik.
    getChanges.mockResolvedValueOnce({
      watermark: 'wm-2',
      hasMore: false,
      deletions: [
        {
          messageId: 'hic-gormedik',
          conversationId: CONV,
          deletedAt: '2026-09-18T12:00:00.000Z',
          deletedForEveryone: true,
        },
      ],
    });

    await pullChanges();

    expect(ids()).toEqual([]);
  });

  it('aynı tombstone iki kez gelince row_version ARTMAZ', async () => {
    saveMessage(msg('m1'), CONV);
    const tombstone = {
      messageId: 'm1',
      conversationId: CONV,
      deletedAt: '2026-09-18T12:00:00.000Z',
      deletedForEveryone: true,
    };
    getChanges
      .mockResolvedValueOnce({ watermark: 'wm-2', hasMore: false, deletions: [tombstone] })
      .mockResolvedValueOnce({ watermark: 'wm-3', hasMore: false, deletions: [tombstone] });

    await pullChanges();
    const v = rowOf('m1').row_version;
    __resetDeltaSyncForTests();
    await pullChanges();

    expect(rowOf('m1').row_version).toBe(v);
  });
});

describe('UT-6744 — watermark eskimesi', () => {
  it('watermark atılıyor ve tam senkron isteniyor', async () => {
    setSyncWatermark('cok-eski');
    getChanges.mockRejectedValueOnce(apiError(CHAT_ERROR_CODES.INVALID_WATERMARK));

    const result = await pullChanges();

    expect(result.needsFullResync).toBe(true);
    expect(getSyncWatermark()).toBeNull();
  });

  it('SIRADAN ağ hatasında watermark KORUNUYOR', async () => {
    setSyncWatermark('wm-1');
    getChanges.mockRejectedValueOnce(new Error('Network Error'));

    const result = await pullChanges();

    expect(result.needsFullResync).toBe(false);
    // Atsaydık her offline anında tam senkrona düşerdik.
    expect(getSyncWatermark()).toBe('wm-1');
  });

  it('uç henüz deploy edilmemişse (404) sessizce vazgeçiyor', async () => {
    setSyncWatermark('wm-1');
    getChanges.mockRejectedValueOnce({ response: { status: 404 } });

    await expect(pullChanges()).resolves.toMatchObject({ needsFullResync: false });
    expect(getSyncWatermark()).toBe('wm-1');
  });
});

describe('watermark ilerletme sırası', () => {
  it('sayfa UYGULANDIKTAN SONRA ilerliyor — yarıda ölürse sayfa tekrar gelir', async () => {
    // İkinci sayfa patlıyor: ilk sayfanın watermark'ı yazılmış olmalı ki
    // yeniden başlarken baştan değil oradan devam edelim.
    getChanges
      .mockResolvedValueOnce({ watermark: 'wm-2', hasMore: true, messages: [msg('m1')] })
      .mockRejectedValueOnce(new Error('koptu'));

    await pullChanges();

    expect(getSyncWatermark()).toBe('wm-2');
    expect(ids()).toEqual(['m1']);
  });

  it('watermark ilerlemezse döngü kırılıyor', async () => {
    getChanges.mockResolvedValue({ watermark: null, hasMore: true, messages: [] });

    const result = await pullChanges();

    expect(result.pages).toBe(1);
  });
});

describe('eşzamanlılık', () => {
  it('paralel çağrılar TEK tura iniyor', async () => {
    getChanges.mockResolvedValue({ watermark: 'wm-2', hasMore: false });

    await Promise.all([pullChanges(), pullChanges(), pullChanges()]);

    expect(getChanges).toHaveBeenCalledTimes(1);
  });
});

describe('retentionWindowDays', () => {
  it('sunucudan gelen değer kaydediliyor — iki yerde sabit tutulmuyor', async () => {
    getChanges.mockResolvedValueOnce({ watermark: 'wm-2', hasMore: false, retentionWindowDays: 365 });

    await pullChanges();

    expect(getRetentionWindowDays()).toBe(365);
  });

  it('gelmezse varsayılan 730 kalıyor', async () => {
    getChanges.mockResolvedValueOnce({ watermark: 'wm-2', hasMore: false });

    await pullChanges();

    expect(getRetentionWindowDays()).toBe(730);
  });
});
