jest.mock('expo-sqlite');

import * as SQLite from 'expo-sqlite';
import { openChatDb, getChatDb, __resetChatDbForTests } from '@/features/chat/db/chatDb';
import { readWindow, saveMessage } from '@/features/chat/chatRepository';
import { rowToMessage } from '@/features/chat/db/rows';
import { clear as clearMessageCache, projectWindow } from '@/features/chat/messageCache';
import { messageContentEqual } from '@/features/chat/messageEquality';
import { CHAT_DB_VERSION } from '@/features/chat/db/migrations';
import type { MessageDto } from '@/shared/types';

const { __resetAllDatabases } = SQLite as unknown as { __resetAllDatabases: () => void };

const CONV = 'conv-1';

/** Sunucunun gönderdiği her alanı taşıyan tam bir mesaj. */
const full: MessageDto = {
  id: 'm1',
  conversationId: CONV,
  senderId: 'partner',
  content: 'merhaba',
  contentType: 2,
  sentAt: '2026-09-16T10:00:00.000Z',
  readAt: '2026-09-16T10:05:00.000Z',
  deliveredAt: '2026-09-16T10:01:00.000Z',
  editedAt: '2026-09-16T10:02:00.000Z',
  deletedAt: null,
  deletedForEveryone: false,
  clientMessageId: 'cmid-1',
  reactions: [{ emoji: '🔥', count: 2, userIds: ['u1', 'u2'] }],
  isSystemMessage: false,
  isSenderDeleted: true,
  localizationKey: undefined,
  mediaUrl: 'media-key-1',
  durationMs: 4200,
  waveformPeaks: '0,12,47,99',
  replyToMessageId: 'm0',
  replyTo: { id: 'm0', senderDisplayName: 'Ada', contentPreview: 'önceki' },
  _localUri: 'file:///voice/1.m4a',
};

beforeEach(() => {
  __resetChatDbForTests();
  __resetAllDatabases();
  clearMessageCache();
  openChatDb();
});

describe('şema sürümü', () => {
  it('is_sender_deleted kolonu var', () => {
    const cols = getChatDb()
      .getAll<{ name: string }>('PRAGMA table_info(messages)')
      .map((c) => c.name);
    expect(cols).toContain('is_sender_deleted');
  });

  it('v1 veritabanı veri kaybetmeden EN SON sürüme yükselir', () => {
    // GERÇEK bir v1 veritabanını taklit et: v2'nin kolonunu ve v3'ün tablosunu
    // düşür, sürümü 1'e al. (Yalnız user_version'ı geri almak yetmez — o,
    // hiçbir zaman oluşmayan "yarı uygulanmış" bir durum yaratıp migration'ları
    // kendi ürettikleri şemayla çarpıştırır.)
    const db = getChatDb();
    saveMessage({ ...full, isSenderDeleted: false }, CONV);
    db.exec('ALTER TABLE messages DROP COLUMN is_sender_deleted'); // v2
    db.exec('DROP TABLE meta'); // v3
    db.exec('ALTER TABLE conversations DROP COLUMN closed_by_me'); // v4
    db.exec('ALTER TABLE conversations DROP COLUMN closed_reason');
    db.exec('PRAGMA user_version = 1');

    __resetChatDbForTests();
    const upgraded = openChatDb();

    expect(
      upgraded.getFirst<{ user_version: number }>('PRAGMA user_version')?.user_version,
    ).toBe(CHAT_DB_VERSION);
    // Veri duruyor, yeni kolon güvenli varsayılanla dolmuş.
    expect(upgraded.getAll<any>('SELECT id, is_sender_deleted FROM messages')).toEqual([
      { id: 'm1', is_sender_deleted: 0 },
    ]);
    // v3 de uygulanmış.
    expect(upgraded.getAll('SELECT key FROM meta')).toEqual([]);
  });
});

describe('gidiş-dönüş: sunucu alanları diskte kaybolmamalı', () => {
  it('tam mesaj yazılıp okunduğunda her alan korunuyor', () => {
    saveMessage(full, CONV);
    const back = rowToMessage(readWindow(CONV, 10)[0]);

    expect(back.id).toBe('m1');
    expect(back.content).toBe('merhaba');
    expect(back.contentType).toBe(2);
    expect(back.sentAt).toBe(full.sentAt);
    expect(back.readAt).toBe(full.readAt);
    expect(back.deliveredAt).toBe(full.deliveredAt);
    expect(back.editedAt).toBe(full.editedAt);
    expect(back.clientMessageId).toBe('cmid-1');
    expect(back.reactions).toEqual(full.reactions);
    expect(back.mediaUrl).toBe('media-key-1');
    expect(back.durationMs).toBe(4200);
    expect(back.waveformPeaks).toBe('0,12,47,99');
    expect(back.replyToMessageId).toBe('m0');
    expect(back.replyTo).toEqual(full.replyTo);
    expect(back._localUri).toBe('file:///voice/1.m4a');
    // Faz 3'ten önce sessizce düşen alan — okuma yolu diske döndüğü için
    // "taşınmıyor" artık "kalıcı olarak kayboluyor" demekti.
    expect(back.isSenderDeleted).toBe(true);
  });

  it('sentAt METİN olarak aynen saklanıyor — yeniden serialize edilmiyor', () => {
    saveMessage(full, CONV);
    const row = getChatDb().getFirst<any>('SELECT sent_at FROM messages WHERE id = ?', ['m1']);
    expect(row.sent_at).toBe('2026-09-16T10:00:00.000Z');
  });
});

describe('isSenderDeleted değişimi balonu tazeliyor', () => {
  it('messageContentEqual farkı görüyor', () => {
    const a = { ...full, isSenderDeleted: false };
    const b = { ...full, isSenderDeleted: true };
    expect(messageContentEqual(a, b)).toBe(false);
  });

  it('sunucu alanı çevirince projeksiyon YENİ nesne üretiyor', () => {
    saveMessage({ ...full, isSenderDeleted: false }, CONV);
    const before = projectWindow(CONV, readWindow(CONV, 10))[0];
    expect(before.isSenderDeleted).toBe(false);

    // Hesap silindi — aynı mesaj, değişen alan.
    saveMessage({ ...full, isSenderDeleted: true }, CONV);
    const after = projectWindow(CONV, readWindow(CONV, 10))[0];

    expect(after).not.toBe(before);
    expect(after.isSenderDeleted).toBe(true);
  });

  it('alan aynı kalınca satır HİÇ güncellenmiyor (row_version sabit)', () => {
    saveMessage(full, CONV);
    const v1 = getChatDb().getFirst<any>('SELECT row_version FROM messages')?.row_version;

    saveMessage(full, CONV);

    expect(getChatDb().getFirst<any>('SELECT row_version FROM messages')?.row_version).toBe(v1);
  });
});
