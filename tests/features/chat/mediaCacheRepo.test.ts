jest.mock('expo-sqlite');
jest.mock('react-native-mmkv');

import * as SQLite from 'expo-sqlite';
import { openChatDb, getChatDb, __resetChatDbForTests } from '@/features/chat/db/chatDb';
import {
  saveMessage,
  setMediaCache,
  readMediaCache,
  readCacheEntriesOldestFirst,
  touchMediaCache,
  clearMediaCache,
  readAllCachedUris,
} from '@/features/chat/chatRepository';
import { clear as clearMessageCache } from '@/features/chat/messageCache';
import type { MessageDto } from '@/shared/types';

const { __resetAllDatabases } = SQLite as unknown as { __resetAllDatabases: () => void };

const CONV = 'conv-1';
const msg = (id: string, over: Partial<MessageDto> = {}): MessageDto =>
  ({
    id,
    conversationId: CONV,
    senderId: 'partner',
    content: '',
    contentType: 2, // voice
    sentAt: '2026-10-31T10:00:00.000Z',
    ...over,
  }) as MessageDto;

beforeEach(() => {
  __resetChatDbForTests();
  __resetAllDatabases();
  clearMessageCache();
  openChatDb();
});

describe('setMediaCache / readMediaCache', () => {
  it('setMediaCache yolu, damgayı ve boyutu yazıyor; local_uri okunabiliyor', () => {
    saveMessage(msg('m1'), CONV);
    setMediaCache('m1', 'file:///cache/m1.m4a', 4096, 1000);

    const row = readMediaCache('m1');
    expect(row).toEqual({
      message_id: 'm1',
      local_uri: 'file:///cache/m1.m4a',
      media_cached_at_ms: 1000,
      size_bytes: 4096,
    });
  });
});

describe('readCacheEntriesOldestFirst — AYIRT EDİCİ', () => {
  it('gönderilmemiş kendi kaydımız ÇIKMIYOR (media_cached_at_ms NULL)', () => {
    saveMessage(msg('temp-cmid-1', { _localUri: 'file:///rec.m4a' }), CONV, 'pending');

    expect(readCacheEntriesOldestFirst()).toHaveLength(0);
    expect(readMediaCache('temp-cmid-1')).toBeNull();
  });

  it('EN ESKİ erişimi önce veriyor', () => {
    saveMessage(msg('m1'), CONV);
    saveMessage(msg('m2'), CONV);
    saveMessage(msg('m3'), CONV);

    setMediaCache('m2', 'file:///m2.m4a', 10, 500);
    setMediaCache('m3', 'file:///m3.m4a', 10, 100);
    setMediaCache('m1', 'file:///m1.m4a', 10, 900);

    const ids = readCacheEntriesOldestFirst().map((r) => r.message_id);
    expect(ids).toEqual(['m3', 'm2', 'm1']);
  });
});

describe('touchMediaCache', () => {
  it('damgayı tazeliyor, sıralamayı değiştiriyor', () => {
    saveMessage(msg('m1'), CONV);
    saveMessage(msg('m2'), CONV);

    setMediaCache('m1', 'file:///m1.m4a', 10, 100);
    setMediaCache('m2', 'file:///m2.m4a', 10, 200);
    expect(readCacheEntriesOldestFirst().map((r) => r.message_id)).toEqual(['m1', 'm2']);

    touchMediaCache('m1', 300);
    expect(readCacheEntriesOldestFirst().map((r) => r.message_id)).toEqual(['m2', 'm1']);
  });
});

describe('clearMediaCache — karar: yalnız önbellek kolonlarını nullluyor, local_uri DOKUNULMUYOR', () => {
  it('satır readCacheEntriesOldestFirst\'ten düşüyor ama local_uri okunabilir kalıyor', () => {
    saveMessage(msg('m1'), CONV);
    setMediaCache('m1', 'file:///m1.m4a', 10, 100);

    clearMediaCache(['m1']);

    // Önbellek satırı artık yok — tahliye edilebilir listede görünmez.
    expect(readCacheEntriesOldestFirst()).toHaveLength(0);
    expect(readMediaCache('m1')).toBeNull();

    // Ama dosya yolunun kendisi KORUNUYOR: çağıran dosyayı silmeden önce
    // satırı düşürürse, yol hâlâ oradan okunabilmeli (silme başarısız olursa
    // yetim bir referans bile bu iz olmadan daha kötüdür).
    const raw = getChatDb().getFirst<{ local_uri: string | null }>(
      'SELECT local_uri FROM messages WHERE id = ?',
      ['m1'],
    )!;
    expect(raw.local_uri).toBe('file:///m1.m4a');
  });
});

describe('readAllCachedUris', () => {
  it('yalnız önbellek kopyalarını döndürüyor, kendi kaydımızı DEĞİL', () => {
    saveMessage(msg('m1'), CONV);
    setMediaCache('m1', 'file:///cache/m1.m4a', 10, 100);
    saveMessage(msg('temp-cmid-2', { _localUri: 'file:///rec.m4a' }), CONV, 'pending');

    expect(readAllCachedUris()).toEqual(['file:///cache/m1.m4a']);
  });
});

describe('sunucu upsert local_uri ve önbellek damgasını EZMİYOR', () => {
  it('aynı mesajın sunucudan tekrar gelişi önbellek alanlarını korur', () => {
    saveMessage(msg('m1'), CONV);
    setMediaCache('m1', 'file:///cache/m1.m4a', 4096, 1000);

    // Sunucudan "aynı mesaj" tekrar geliyor (ör. /changes, reconcile).
    saveMessage(msg('m1', { content: 'degisti' }), CONV);

    expect(readMediaCache('m1')).toEqual({
      message_id: 'm1',
      local_uri: 'file:///cache/m1.m4a',
      media_cached_at_ms: 1000,
      size_bytes: 4096,
    });
  });
});
