jest.mock('expo-sqlite');

import * as SQLite from 'expo-sqlite';
import { openChatDb, __resetChatDbForTests } from '@/features/chat/db/chatDb';
import {
  applyDeleted,
  readLastVoiceDurations,
  saveMessage,
} from '@/features/chat/chatRepository';
import { clear as clearMessageCache } from '@/features/chat/messageCache';
import type { MessageDto } from '@/shared/types';

/**
 * Sohbet listesinin süre kaynağı — "sesli mesaj önizlemesinde süre yazmıyor,
 * ancak sohbete girip çıkınca yazıyor" hatasının kilidi.
 *
 * Kural: arşivin tepesi ile sohbetin SON mesajı aynı olmak zorunda (±1sn).
 * Tutmuyorsa cevap "bilmiyorum" — yanlış süre yazmaktansa hiç yazmamak.
 */

const { __resetAllDatabases } = SQLite as unknown as { __resetAllDatabases: () => void };

const CONV = 'conv-1';
const T_OLD = '2026-09-16T10:00:00.000Z';
const T_NEW = '2026-09-16T11:00:00.000Z';

const msg = (over: Partial<MessageDto> = {}): MessageDto =>
  ({
    id: 'm1',
    conversationId: CONV,
    senderId: 'partner',
    content: '',
    contentType: 2,
    sentAt: T_NEW,
    durationMs: 7200,
    ...over,
  }) as MessageDto;

const ms = (iso: string) => new Date(iso).getTime();

beforeEach(() => {
  __resetChatDbForTests();
  __resetAllDatabases();
  clearMessageCache();
  openChatDb();
});

it('sohbet hiç açılmamışken bile süreyi diskten çözüyor', () => {
  // Delta-sync / realtime yazımı: bucket'tan geçmiyor, doğrudan arşive iniyor.
  saveMessage(msg(), CONV);

  expect(
    readLastVoiceDurations([{ conversationId: CONV, lastMessageAtMs: ms(T_NEW) }]),
  ).toEqual({ [CONV]: 7200 });
});

it('optimistic balonun yerel damgası 1sn kayabiliyor — tolerans içinde eşleşiyor', () => {
  saveMessage(msg({ sentAt: '2026-09-16T11:00:00.700Z' }), CONV);

  expect(
    readLastVoiceDurations([{ conversationId: CONV, lastMessageAtMs: ms(T_NEW) }]),
  ).toEqual({ [CONV]: 7200 });
});

it('son mesaj arşivde yoksa (henüz inmemiş metin) ESKİ sesli mesajın süresini YAZMIYOR', () => {
  saveMessage(msg({ sentAt: T_OLD }), CONV);

  // Liste DTO'su bir saat sonraki metin mesajını gösteriyor; arşivin tepesi
  // hâlâ sesli mesaj. Süre yazılırsa satır metin önizlemesi yerine
  // "🎤 Sesli mesaj (0:07)" gösterirdi.
  expect(
    readLastVoiceDurations([{ conversationId: CONV, lastMessageAtMs: ms(T_NEW) }]),
  ).toEqual({});
});

it('son mesaj metinse süre dönmüyor', () => {
  saveMessage(msg({ contentType: 0, content: 'merhaba', durationMs: null }), CONV);

  expect(
    readLastVoiceDurations([{ conversationId: CONV, lastMessageAtMs: ms(T_NEW) }]),
  ).toEqual({});
});

it('silinmiş mesaj sayılmıyor', () => {
  saveMessage(msg(), CONV);
  applyDeleted({ messageId: 'm1', deletedAt: T_NEW, forEveryone: true });

  expect(
    readLastVoiceDurations([{ conversationId: CONV, lastMessageAtMs: ms(T_NEW) }]),
  ).toEqual({});
});

it('süresi bilinmeyen (null) sesli satır "bilmiyorum" olarak dönüyor — 0 yazılmıyor', () => {
  saveMessage(msg({ durationMs: null }), CONV);

  expect(
    readLastVoiceDurations([{ conversationId: CONV, lastMessageAtMs: ms(T_NEW) }]),
  ).toEqual({});
});

it('damga bilinmiyorsa en yeni satıra düşüyor', () => {
  saveMessage(msg({ id: 'm-old', sentAt: T_OLD, durationMs: 1000 }), CONV);
  saveMessage(msg({ id: 'm-new', sentAt: T_NEW, durationMs: 9000 }), CONV);

  expect(readLastVoiceDurations([{ conversationId: CONV }])).toEqual({ [CONV]: 9000 });
});

it('birden fazla sohbeti tek geçişte çözüyor, bilinmeyeni hiç yazmıyor', () => {
  saveMessage(msg({ id: 'a1', conversationId: 'conv-a' }), 'conv-a');
  saveMessage(msg({ id: 'b1', conversationId: 'conv-b', contentType: 0 }), 'conv-b');

  expect(
    readLastVoiceDurations([
      { conversationId: 'conv-a', lastMessageAtMs: ms(T_NEW) },
      { conversationId: 'conv-b', lastMessageAtMs: ms(T_NEW) },
      { conversationId: 'conv-bos', lastMessageAtMs: ms(T_NEW) },
    ]),
  ).toEqual({ 'conv-a': 7200 });
});
