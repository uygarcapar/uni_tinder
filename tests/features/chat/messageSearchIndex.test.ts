jest.mock('expo-sqlite');
jest.mock('react-native-mmkv');
// Açılış sürücüsü testi `startChatMirror`ı çağırıyor; bu ikisi store'lu dalda
// yaşıyor ve burada hiçbir şey ispatlamıyor (biri hub'a abone olur, diğeri
// timer kurar).
jest.mock('@/features/chat/chatDeltaSync', () => ({
  __esModule: true,
  startDeltaSync: jest.fn(() => jest.fn()),
}));
jest.mock('@/features/chat/chatBackfill', () => ({
  __esModule: true,
  startBackfill: jest.fn(() => jest.fn()),
}));

import * as SQLite from 'expo-sqlite';
import {
  openChatDb,
  getChatDb,
  isFtsAvailable,
  __resetChatDbForTests,
} from '@/features/chat/db/chatDb';
import * as repo from '@/features/chat/chatRepository';
import {
  backfillContentFolded,
  pruneOrphanSearchIndex,
  saveMessage,
  upsertMessage,
} from '@/features/chat/chatRepository';
import { startBackfill } from '@/features/chat/chatBackfill';
import {
  startChatMirror,
  __resetChatMirrorForTests,
} from '@/features/chat/chatMirrorMiddleware';
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

const storeStub = () => ({
  getState: () => ({ chat: { activeConversationId: null } }),
  dispatch: jest.fn(),
});

function rowidOf(id: string): number {
  return getChatDb().getFirst<{ rowid: number }>('SELECT rowid FROM messages WHERE id = ?', [
    id,
  ])!.rowid;
}

beforeEach(() => {
  __resetChatDbForTests();
  __resetAllDatabases();
  __resetChatMirrorForTests();
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

  it('indeks satırı mesajın ROWID’sine çapalı — message_id ile aranmıyor', () => {
    // İlk mesaj indekslenmeyen bir ses: `messages.rowid` 1'de, indeks boş.
    // Böylece metin mesajının rowid'si (2) ile fts5'in kendi vereceği otomatik
    // rowid (1) AYRIŞIYOR; satır rowid'siz yazılsaydı bu test kızarırdı.
    saveMessage(msg('v1', '', { contentType: ContentType.Voice }), CONV);
    saveMessage(msg('m1', 'merhaba'), CONV);
    expect(
      getChatDb().getAll<{ message_id: string }>(
        'SELECT message_id FROM messages_fts WHERE rowid = ?',
        [rowidOf('m1')],
      ),
    ).toEqual([{ message_id: 'm1' }]);
  });

  it('doldurma turunun seçimi KISMİ İNDEKSTEN geçiyor — tam tarama değil', () => {
    const plan = getChatDb()
      .getAll<{ detail: string }>(
        `EXPLAIN QUERY PLAN
         SELECT rowid, id, content, content_type, is_system_message FROM messages
          WHERE content_folded IS NULL
          ORDER BY sent_at_ms DESC
          LIMIT 1`,
      )
      .map((r) => r.detail)
      .join(' | ');
    // Taranan şey TABLO değil kısmi indeks — yani "yapılacak iş" kümesi; ve
    // sıralama indeksten geldiği için geçici B-tree kurulmuyor.
    expect(plan).toContain('idx_messages_unfolded');
    expect(plan).not.toContain('TEMP B-TREE');
  });

  it('v10 öncesi satır AYNI içerikle yeniden yazılınca kolon NULL kalmıyor', () => {
    // Ayırt edici: UPSERT'ün "gerçekten değişti mi" WHERE'inde `content_folded`
    // terimi olmasaydı UPDATE düşer, kolon NULL kalır ama FTS satırı yazılırdı
    // — FTS mesajı bulur, LIKE yedeği bulamazdı.
    const sentAtMs = 1_700_000_000_000;
    insertRawMessage('eski-1', 'merhaba', sentAtMs);
    // Satırın KARŞILAŞTIRILAN her alanıyla birebir aynı DTO — tek fark
    // `content_folded`. Aksi hâlde WHERE başka bir terimden tutar ve test
    // pinlediğini sandığı şeyi pinlemez.
    saveMessage(
      {
        id: 'eski-1',
        conversationId: CONV,
        senderId: null,
        content: 'merhaba',
        contentType: ContentType.Text,
        sentAt: new Date(sentAtMs).toISOString(),
      } as unknown as MessageDto,
      CONV,
    );
    expect(readContentFolded('eski-1')).toBe('merhaba');
    expect(ftsRowsFor('eski-1')).toHaveLength(1);
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

describe('yetim indeks satırları', () => {
  it('mesajı silinmiş indeks satırı gidiyor, duranlar kalıyor', () => {
    saveMessage(msg('m1', 'kalacak'), CONV);
    saveMessage(msg('m2', 'gidecek'), CONV);
    const goneRowid = rowidOf('m2');
    // Mesajı silen yolların hiçbiri indekse dokunmuyor (bilerek — tek yerde
    // toplanıyor): engelleme/hesap silme, retention budaması, boşluk değiştirme.
    getChatDb().run('DELETE FROM messages WHERE id = ?', ['m2']);

    expect(pruneOrphanSearchIndex()).toBe(1);
    expect(
      getChatDb().getAll('SELECT rowid FROM messages_fts WHERE rowid = ?', [goneRowid]),
    ).toEqual([]);
    expect(ftsRowsFor('m1')).toHaveLength(1);
  });

  it('çapası kaymış satır da gidiyor — yalnız "mesaj var mı" denmiyor', () => {
    saveMessage(msg('m1', 'dogru'), CONV);
    // Yaşayan bir mesajın rowid'sinde BAŞKA bir mesaja ait indeks satırı:
    // yüklem yalnız varlığa baksaydı bu satır kalır ve 'm1' aratıldığında
    // başkasının metni eşleşirdi.
    getChatDb().run('DELETE FROM messages_fts WHERE rowid = ?', [rowidOf('m1')]);
    getChatDb().run(
      'INSERT INTO messages_fts (rowid, content_folded, message_id) VALUES (?,?,?)',
      [rowidOf('m1'), 'baskasinin metni', 'bambaska'],
    );

    expect(pruneOrphanSearchIndex()).toBe(1);
    expect(getChatDb().getAll('SELECT rowid FROM messages_fts')).toEqual([]);
  });
});

describe('açılış sürücüsü', () => {
  it('startChatMirror arşivi doldurma turundan geçiriyor', () => {
    // Ayırt edici: sürücü olmasaydı kolon NULL kalır, arama bu mesajları hiç
    // bulamaz ve bu kullanıcıya "o mesaj yok" diye görünürdü.
    // Tarihler TAZE: `startChatMirror` önce `pruneExpiredMessages` koşuyor ve
    // saklama penceresinin dışındaki satırlar doldurulmadan önce silinirdi.
    insertRawMessage('eski-1', 'Çağrı', Date.now() - 2000);
    insertRawMessage('eski-2', 'IŞIK', Date.now() - 1000);

    startChatMirror();

    expect(readContentFolded('eski-1')).toBe('cagri');
    expect(readContentFolded('eski-2')).toBe('isik');
    expect(ftsRowsFor('eski-2')).toEqual([{ content_folded: 'isik' }]);
  });

  it('indeks bakımı patlasa bile ayna AYAKTA kalıyor', () => {
    // Ayırt edici: kendi try'ı olmasaydı dıştaki catch `started = false` deyip
    // ERKEN dönerdi — yani bozuk bir arama indeksi sohbetin local-first
    // yolunu tamamen kapatırdı.
    const spy = jest
      .spyOn(repo, 'pruneOrphanSearchIndex')
      .mockImplementation(() => {
        throw new Error('indeks bozuk');
      });
    // Beklenen hata; test çıktısını kirletmesin.
    const logged = jest.spyOn(console, 'error').mockImplementation(() => {});
    try {
      startChatMirror(storeStub());
      expect(startBackfill).toHaveBeenCalled();
      expect(logged).toHaveBeenCalled();
    } finally {
      spy.mockRestore();
      logged.mockRestore();
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
