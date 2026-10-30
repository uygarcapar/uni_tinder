jest.mock('expo-sqlite');

import * as SQLite from 'expo-sqlite';
import {
  openChatDb,
  getChatDb,
  isFtsAvailable,
  __resetChatDbForTests,
} from '@/features/chat/db/chatDb';
import {
  backfillContentFolded,
  saveMessage,
  upsertMessage,
} from '@/features/chat/chatRepository';
import { ContentType } from '@/features/chat/contentType';
import { clear as clearMessageCache } from '@/features/chat/messageCache';
import type { MessageDto } from '@/shared/types';

const { __resetAllDatabases } = SQLite as unknown as { __resetAllDatabases: () => void };

const CONV = 'c1';

function msg(id: string, content: string, extra: Partial<MessageDto> = {}): MessageDto {
  return {
    id,
    conversationId: CONV,
    senderId: 'partner',
    content,
    contentType: ContentType.Text,
    sentAt: '2026-10-30T10:00:00.000Z',
    ...extra,
  } as MessageDto;
}

function readContentFolded(id: string): string | null {
  const row = getChatDb().getFirst<{ content_folded: string | null }>(
    'SELECT content_folded FROM messages WHERE id = ?',
    [id],
  );
  return row ? row.content_folded : null;
}

function ftsRowsFor(id: string): { content_folded: string }[] {
  return getChatDb().getAll<{ content_folded: string }>(
    'SELECT content_folded FROM messages_fts WHERE message_id = ?',
    [id],
  );
}

/** v10 ÖNCESİNDEN kalmış bir satırı taklit eder: `content_folded` hiç yazılmamış. */
function insertRawMessage(id: string, content: string, sentAtMs = 1_700_000_000_000): void {
  getChatDb().run(
    `INSERT INTO messages (id, conversation_id, content, content_type, sent_at, sent_at_ms)
     VALUES (?,?,?,0,?,?)`,
    [id, CONV, content, new Date(sentAtMs).toISOString(), sentAtMs],
  );
}

/**
 * FTS5'in DERLENMEMİŞ olduğu bir cihazı taklit eder: hem kapasite probe'u 0
 * döner hem de `fts5` içeren her DDL atar. İkincisi şart — yalnız probe'u
 * yalanlamak, sanal tablonun migration zincirine konulmuş olması durumunu
 * yakalayamazdı.
 */
function withoutFts5<T>(fn: () => T): T {
  const real = SQLite.openDatabaseSync;
  const spy = jest
    .spyOn(SQLite, 'openDatabaseSync')
    .mockImplementation((name: string) => {
      const target = real(name) as unknown as Record<
        string,
        (...args: unknown[]) => unknown
      >;
      return new Proxy(target, {
        get(_t, prop) {
          if (prop === 'getFirstSync') {
            return (sql: string, params?: unknown[]) =>
              /sqlite_compileoption_used/i.test(sql)
                ? { ok: 0 }
                : target.getFirstSync.call(target, sql, params);
          }
          if (prop === 'execSync') {
            return (sql: string) => {
              if (/fts5/i.test(sql)) throw new Error('no such module: fts5');
              return target.execSync.call(target, sql);
            };
          }
          const value = target[prop as string];
          return typeof value === 'function' ? value.bind(target) : value;
        },
      }) as unknown as SQLite.SQLiteDatabase;
    });
  try {
    return fn();
  } finally {
    spy.mockRestore();
  }
}

beforeEach(() => {
  __resetChatDbForTests();
  __resetAllDatabases();
  clearMessageCache();
  openChatDb();
});

describe('tek yazıcı kapısı', () => {
  // Review Focus 2
  it('metin olmayan mesaj indekslenmiyor', () => {
    saveMessage(msg('v1', '', { contentType: ContentType.Voice, durationMs: 4200 }), CONV);
    expect(ftsRowsFor('v1')).toHaveLength(0);
  });

  it('metin olmayan mesajın kolonu NULL DEĞİL boş — doldurma turu onu tekrar seçmiyor', () => {
    saveMessage(msg('v1', '', { contentType: ContentType.Voice }), CONV);
    // NULL bırakılsaydı `backfillContentFolded` bu satırı HER turda yeniden
    // seçer, hiç dolduramaz ve sayacı sıfıra düşmezdi: sonsuz tur.
    expect(readContentFolded('v1')).toBe('');
    expect(backfillContentFolded(100)).toBe(0);
  });

  it('sistem mesajı metin tipinde gelse de indekslenmiyor', () => {
    // İçerik tipi 0 olabiliyor — sistem olduğunu söyleyen `isSystemMessage`.
    saveMessage(
      msg('s1', 'Eşleştiniz', { isSystemMessage: true, localizationKey: 'system.match_created' }),
      CONV,
    );
    expect(readContentFolded('s1')).toBe('');
    expect(ftsRowsFor('s1')).toHaveLength(0);
  });

  it('metin mesajı katlanmış haliyle indeksleniyor', () => {
    saveMessage(msg('m1', 'IŞIK Çağrı'), CONV);
    expect(readContentFolded('m1')).toBe('isik cagri');
    expect(ftsRowsFor('m1')).toEqual([{ content_folded: 'isik cagri' }]);
  });

  // Tek kapı: dört yazma yolunun hepsi aynı sonucu vermeli.
  it('upsertMessage (delta yolu) da kolonu dolduruyor', () => {
    upsertMessage(getChatDb(), msg('d1', 'GÜNAYDIN'), CONV);
    expect(readContentFolded('d1')).toBe('gunaydin');
    expect(ftsRowsFor('d1')).toEqual([{ content_folded: 'gunaydin' }]);
  });

  it('düzenlenen mesajın katlanmış kolonu ve FTS satırı güncelleniyor', () => {
    saveMessage(msg('m1', 'eski'), CONV);
    saveMessage(msg('m1', 'YENİ'), CONV);
    expect(readContentFolded('m1')).toBe('yeni');
    expect(ftsRowsFor('m1')).toHaveLength(1); // çoğalmadı
    expect(ftsRowsFor('m1')[0].content_folded).toBe('yeni');
  });

  it('optimistik satır gerçek id ile rekey olunca eski id indekste KALMIYOR', () => {
    saveMessage(msg('temp-cm1', 'merhaba', { clientMessageId: 'cm1' }), CONV, 'pending');
    saveMessage(msg('real-1', 'merhaba', { clientMessageId: 'cm1' }), CONV);
    // Kalsaydı arama, `messages`ta artık olmayan bir id'ye işaret eden bir
    // indeks satırı taşırdı.
    expect(ftsRowsFor('temp-cm1')).toHaveLength(0);
    expect(ftsRowsFor('real-1')).toHaveLength(1);
  });
});

// Review Focus 3
describe('arşivin tek seferlik doldurulması', () => {
  it('backfillContentFolded arşivde duran NULL satırları dolduruyor', () => {
    insertRawMessage('eski-1', 'Çağrı');
    expect(backfillContentFolded(100)).toBe(1);
    expect(readContentFolded('eski-1')).toBe('cagri');
    expect(ftsRowsFor('eski-1')).toEqual([{ content_folded: 'cagri' }]);
  });

  it('backfillContentFolded tavanı aşmıyor ve doldurulmuş satırı tekrar saymıyor', () => {
    for (let i = 0; i < 5; i += 1) {
      insertRawMessage(`eski-${i}`, `mesaj ${i}`, 1_700_000_000_000 + i);
    }
    expect(backfillContentFolded(2)).toBe(2);
    expect(backfillContentFolded(2)).toBe(2);
    expect(backfillContentFolded(2)).toBe(1);
    expect(backfillContentFolded(2)).toBe(0);
    for (let i = 0; i < 5; i += 1) {
      expect(readContentFolded(`eski-${i}`)).toBe(`mesaj ${i}`);
    }
  });
});

// Review Focus 5
describe('FTS5 kapasitesi', () => {
  it('FTS5 varken sanal tablo açılışta kuruluyor', () => {
    expect(isFtsAvailable()).toBe(true);
    const table = getChatDb().getFirst<{ name: string }>(
      "SELECT name FROM sqlite_master WHERE name = 'messages_fts'",
    );
    expect(table?.name).toBe('messages_fts');
  });

  it('FTS5 yokken açılış PATLAMIYOR, isFtsAvailable false dönüyor', () => {
    // Ayırt edici: sanal tablo zincirin dışında olmasaydı migration geri alınır
    // ve openChatDb atardı — yani sohbet local-first'ü tamamen kaybederdi.
    __resetChatDbForTests();
    __resetAllDatabases();
    withoutFts5(() => {
      expect(() => openChatDb()).not.toThrow();
      expect(isFtsAvailable()).toBe(false);
      // Şema yine de yükseldi: kolon duruyor, yani Task 3'ün LIKE yolu çalışır.
      expect(() => saveMessage(msg('m1', 'IŞIK'), CONV)).not.toThrow();
      expect(readContentFolded('m1')).toBe('isik');
    });
  });
});
