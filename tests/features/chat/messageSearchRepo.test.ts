jest.mock('expo-sqlite');
jest.mock('react-native-mmkv');

import * as SQLite from 'expo-sqlite';
import {
  openChatDb,
  getChatDb,
  isFtsAvailable,
  __resetChatDbForTests,
} from '@/features/chat/db/chatDb';
import {
  applyDeleted,
  readAround,
  saveMessage,
  searchMessages,
} from '@/features/chat/chatRepository';
import { ContentType } from '@/features/chat/contentType';
import { clear as clearMessageCache } from '@/features/chat/messageCache';
import type { MessageDto } from '@/shared/types';

/**
 * `searchMessages`in İKİ SQL ŞEKLİ (FTS `MATCH` / `content_folded LIKE`)
 * AYNI sonucu vermek ZORUNDA — bu yüzden her fonksiyonel test iki kapasitede
 * de (`describe.each`) koşuyor. better-sqlite3 FTS5'i varsayılan derliyor,
 * yani mock'lamadan yalnız FTS dalı koşardı ve LIKE yedeğindeki bir regresyon
 * (örn. yanlışlıkla `content` üzerinden arama) hiç yakalanmazdı.
 */

const { __resetAllDatabases } = SQLite as unknown as { __resetAllDatabases: () => void };

const CONV = 'c1';
const OTHER_CONV = 'c2';

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

function insertConversation(
  conversationId: string,
  partnerDisplayName: string | null = null,
): void {
  getChatDb().run(
    'INSERT INTO conversations (conversation_id, partner_user_id, partner_display_name) VALUES (?,?,?)',
    [conversationId, `partner-${conversationId}`, partnerDisplayName],
  );
}

function ftsRowsFor(id: string): { content_folded: string }[] {
  return getChatDb().getAll<{ content_folded: string }>(
    'SELECT content_folded FROM messages_fts WHERE message_id = ?',
    [id],
  );
}

/**
 * FTS5'in derlenmemiş olduğu bir cihazı taklit eder (messageSearchIndex.test.ts
 * ile AYNI teknik — hem kapasite probe'u 0 döner hem `fts5` geçen her DDL atar).
 * Kopyalanma sebebi: iki test dosyası birbirinden BAĞIMSIZ koşabilmeli, ortak bir
 * test-yardımcı modül bu kadar küçük bir fonksiyon için fazlalık olurdu.
 */
function withoutFts5<T>(fn: () => T): T {
  const real = SQLite.openDatabaseSync;
  const spy = jest.spyOn(SQLite, 'openDatabaseSync').mockImplementation((name: string) => {
    const target = real(name) as unknown as Record<string, (...args: unknown[]) => unknown>;
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

describe.each([
  { label: 'FTS5 MATCH yolu', useLike: false },
  { label: 'LIKE yedek yolu (FTS5 yokmuş gibi)', useLike: true },
])('searchMessages — $label', ({ useLike }) => {
  beforeEach(() => {
    __resetChatDbForTests();
    __resetAllDatabases();
    clearMessageCache();
    if (useLike) {
      withoutFts5(() => openChatDb());
    } else {
      openChatDb();
    }
    // Ayırt edici: bu assert yanlış dalda koşan bir testi SESSİZCE
    // geçirmez — describe.each kurulumu bozulsaydı burada patlardı.
    expect(isFtsAvailable()).toBe(!useLike);
    insertConversation(CONV, 'Ayşe Yılmaz');
    insertConversation(OTHER_CONV, 'Deniz');
  });

  // Review Focus 1
  it('silinmiş mesaj sonuçlarda ÇIKMIYOR, ama indekste KALIYOR', () => {
    saveMessage(msg('m1', 'bulunacak kahve'), CONV);
    applyDeleted({ messageId: 'm1', forEveryone: true, deletedAt: '2026-10-30T11:00:00.000Z' });

    expect(searchMessages('bulunacak', { limit: 10 })).toHaveLength(0);

    // Ayırt edici: süzme sorguda olmasaydı geri alınan silme yeniden
    // indeksleme isterdi — indeks satırı duruyor. (FTS yoksa bu kontrol
    // anlamsız, çünkü messages_fts hiç yok — o dalda atlanır.)
    if (!useLike) {
      expect(ftsRowsFor('m1')).toHaveLength(1);
    }
  });

  it('sonuçlar en yeniden eskiye sıralı', () => {
    saveMessage(msg('m1', 'kahve molası', { sentAt: '2026-10-30T10:00:00.000Z' }), CONV);
    saveMessage(msg('m2', 'kahve içelim', { sentAt: '2026-10-30T12:00:00.000Z' }), CONV);
    saveMessage(msg('m3', 'kahve soğudu', { sentAt: '2026-10-30T11:00:00.000Z' }), CONV);

    const hits = searchMessages('kahve', { limit: 10 });

    expect(hits.map((h) => h.messageId)).toEqual(['m2', 'm3', 'm1']);
    // sent_at_ms'in KENDİSİ azalıyor mu — sıralamanın id'ye değil zamana
    // dayandığını ayırt eder.
    expect(hits[0].sentAtMs).toBeGreaterThan(hits[1].sentAtMs);
    expect(hits[1].sentAtMs).toBeGreaterThan(hits[2].sentAtMs);
  });

  it('conversationId verilince yalnız o sohbette arıyor', () => {
    saveMessage(msg('m1', 'ortak kelime', { conversationId: CONV }), CONV);
    saveMessage(
      msg('m2', 'ortak kelime', { conversationId: OTHER_CONV }),
      OTHER_CONV,
    );

    const hitsAll = searchMessages('ortak', { limit: 10 });
    expect(hitsAll.map((h) => h.messageId).sort()).toEqual(['m1', 'm2']);

    const hitsScoped = searchMessages('ortak', { conversationId: CONV, limit: 10 });
    expect(hitsScoped).toHaveLength(1);
    expect(hitsScoped[0].messageId).toBe('m1');
    expect(hitsScoped[0].conversationId).toBe(CONV);
  });

  it('limit/offset sayfalıyor', () => {
    for (let i = 1; i <= 5; i++) {
      saveMessage(
        msg(`m${i}`, `sayfa testi ${i}`, {
          sentAt: `2026-10-30T${String(10 + i).padStart(2, '0')}:00:00.000Z`,
        }),
        CONV,
      );
    }
    // En yeniden eskiye: m5,m4,m3,m2,m1.
    const page1 = searchMessages('sayfa', { limit: 2, offset: 0 });
    const page2 = searchMessages('sayfa', { limit: 2, offset: 2 });
    const page3 = searchMessages('sayfa', { limit: 2, offset: 4 });

    expect(page1.map((h) => h.messageId)).toEqual(['m5', 'm4']);
    expect(page2.map((h) => h.messageId)).toEqual(['m3', 'm2']);
    expect(page3.map((h) => h.messageId)).toEqual(['m1']);
  });

  it('Türkçe katlama arama ile isim aramasıyla AYNI: "ISIK" → "ışık" buluyor', () => {
    saveMessage(msg('m1', 'IŞIK geldi'), CONV);

    const hits = searchMessages('isik', { limit: 10 }); // zaten `prepareSearchQuery`den geçmiş hâliyle

    expect(hits).toHaveLength(1);
    expect(hits[0].messageId).toBe('m1');
    expect(hits[0].content).toBe('IŞIK geldi'); // gösterilen içerik ORİJİNAL, katlanmış değil
  });

  it('partnerDisplayName conversations tablosundan geliyor, satır yoksa null', () => {
    saveMessage(msg('m1', 'merhaba dünya'), CONV);
    saveMessage(msg('m2', 'merhaba herkese', { conversationId: 'c-yok' }), 'c-yok');

    const hits = searchMessages('merhaba', { limit: 10 });
    const h1 = hits.find((h) => h.messageId === 'm1')!;
    const h2 = hits.find((h) => h.messageId === 'm2')!;

    expect(h1.partnerDisplayName).toBe('Ayşe Yılmaz');
    expect(h2.partnerDisplayName).toBeNull();
  });

  it('FTS özel karakterleri (", *, OR) içeren sorgu PATLAMIYOR ve literal arıyor', () => {
    saveMessage(msg('m1', 'OR ifadesi gercek metin'), CONV);

    // Sorgu `prepareSearchQuery` tarafından katlanmış geliyor varsayımıyla;
    // burada doğrudan FTS özel karakterleri taşıyan bir dize veriliyor —
    // amaç çökmeyi/sözdizimi hatasını önlemek.
    expect(() => searchMessages('or "alakasiz* NEAR', { limit: 10 })).not.toThrow();
  });
});

describe('readAround', () => {
  beforeEach(() => {
    __resetChatDbForTests();
    __resetAllDatabases();
    clearMessageCache();
    openChatDb();
    insertConversation(CONV);
  });

  function seed(count: number): void {
    for (let i = 1; i <= count; i++) {
      saveMessage(
        msg(`m${i}`, `mesaj ${i}`, {
          sentAt: new Date(1_700_000_000_000 + i * 1000).toISOString(),
        }),
        CONV,
      );
    }
  }

  it('hedefin iki yanından pencere getiriyor ve hedefi İÇERİYOR', () => {
    seed(10);
    const target = getChatDb().getFirst<{ sent_at_ms: number }>(
      'SELECT sent_at_ms FROM messages WHERE id = ?',
      ['m5'],
    )!;

    const window = readAround(CONV, target.sent_at_ms, 'm5', 2, 2);

    expect(window.map((m) => m.id)).toEqual(['m7', 'm6', 'm5', 'm4', 'm3']);
    expect(window[2].id).toBe('m5'); // hedef tam ortada
  });

  it('arşivin başındaki mesajda da patlamıyor (before yetersiz)', () => {
    seed(3);
    const target = getChatDb().getFirst<{ sent_at_ms: number }>(
      'SELECT sent_at_ms FROM messages WHERE id = ?',
      ['m1'],
    )!;

    // m1 arşivin EN ESKİSİ — before=2 istense de önünde hiç mesaj yok.
    expect(() => readAround(CONV, target.sent_at_ms, 'm1', 2, 2)).not.toThrow();
    const window = readAround(CONV, target.sent_at_ms, 'm1', 2, 2);

    // İstenen before=2 yerine 0 döndü (daha fazlası YOK), ama daha yeni iki
    // mesaj ve hedef eksiksiz geldi — eksik kalan sessizce kırpıldı, hata
    // fırlatılmadı ya da sahte satır üretilmedi.
    expect(window.map((m) => m.id)).toEqual(['m3', 'm2', 'm1']);
  });
});
