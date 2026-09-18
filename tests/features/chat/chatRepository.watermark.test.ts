jest.mock('expo-sqlite');
jest.mock('react-native-mmkv');

import * as SQLite from 'expo-sqlite';
import { openChatDb, getChatDb, __resetChatDbForTests } from '@/features/chat/db/chatDb';
import {
  clearAllChatData,
  getSyncWatermark,
  setSyncWatermark,
  saveMessage,
} from '@/features/chat/chatRepository';
import { CHAT_DB_VERSION } from '@/features/chat/db/migrations';
import { clear as clearMessageCache } from '@/features/chat/messageCache';
import type { MessageDto } from '@/shared/types';

const { __resetAllDatabases } = SQLite as unknown as { __resetAllDatabases: () => void };

const CONV = 'conv-1';
const msg = (id: string): MessageDto =>
  ({
    id,
    conversationId: CONV,
    senderId: 'partner',
    content: id,
    contentType: 0,
    sentAt: '2026-09-18T10:00:00.000Z',
  }) as MessageDto;

beforeEach(() => {
  __resetChatDbForTests();
  __resetAllDatabases();
  clearMessageCache();
  openChatDb();
});

describe('şema v3 — meta tablosu', () => {
  it('migration uygulanmış', () => {
    // Sürüm numarası KASTEN iddia edilmiyor: her yeni migration'da bu testi
    // güncellemek gerekirdi ve sayının kendisi bir sözleşme değil. Önemli olan
    // tabloların varlığı.
    expect(CHAT_DB_VERSION).toBeGreaterThanOrEqual(3);
    const tables = getChatDb()
      .getAll<{ name: string }>(
        "SELECT name FROM sqlite_master WHERE type = 'table' AND name NOT LIKE 'sqlite_%' ORDER BY name",
      )
      .map((t) => t.name);
    expect(tables).toEqual(['conversations', 'messages', 'meta', 'outbox', 'sync_state']);
  });
});

describe('watermark', () => {
  it('başlangıçta null — ilk çağrıda sunucu taze watermark üretecek', () => {
    expect(getSyncWatermark()).toBeNull();
  });

  it('yazılıp okunuyor ve AYNEN korunuyor (opak — yorumlanmıyor)', () => {
    const opaque = 'AAAAAAAAB9k=';
    setSyncWatermark(opaque);
    expect(getSyncWatermark()).toBe(opaque);
  });

  it('üzerine yazılıyor', () => {
    setSyncWatermark('ilk');
    setSyncWatermark('ikinci');
    expect(getSyncWatermark()).toBe('ikinci');
  });

  it('null ile sıfırlanıyor — UT-6744 tam-senkron yolu', () => {
    setSyncWatermark('bayat');
    setSyncWatermark(null);
    expect(getSyncWatermark()).toBeNull();
  });

  it('yeniden açılışı ATLATIYOR — yoksa her boot tam senkron olurdu', () => {
    setSyncWatermark('kalici');
    __resetChatDbForTests();
    openChatDb();
    expect(getSyncWatermark()).toBe('kalici');
  });
});

describe('watermark ömrü arşivle AYNI olmalı', () => {
  it('clearAllChatData watermark\'ı da siler', () => {
    saveMessage(msg('m1'), CONV);
    setSyncWatermark('onceki-kullanici');

    clearAllChatData();

    // Kalsaydı yeni kullanıcı "her şeyi görmüşüm" sanıp baştaki
    // değişiklikleri hiç çekmezdi — sessiz ve kalıcı eksik veri.
    expect(getSyncWatermark()).toBeNull();
    expect(getChatDb().getAll('SELECT id FROM messages')).toEqual([]);
  });
});
