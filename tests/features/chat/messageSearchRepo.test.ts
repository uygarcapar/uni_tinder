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

  // Review turu 1, Önemli 3: eski hâli yalnız `not.toThrow()`du — "literal
  // arıyor" iddiasını hiçbir satır karşılaştırması DOĞRULAMIYORDU. Burada
  // hem NEGATİF kanıt (FTS5'in BOOLEAN `OR`u sızmıyor) hem POZİTİF kanıt
  // (kullanıcı GERÇEKTEN "or" kelimesini ararsa bulunuyor) var.
  it('FTS özel karakteri "OR" LİTERAL bir kelime olarak aranıyor, BOOLEAN operatöre YORUMLANMIYOR', () => {
    saveMessage(msg('m1', 'elma'), CONV);
    saveMessage(msg('m2', 'armut'), CONV);

    // Tırnaksız FTS5'te `OR` boolean operatördür: 'elma OR armut' HEM m1 HEM
    // m2'yi bulurdu. Quoting bunu üç bağımsız tokene (elma, or, armut)
    // indirgiyor ve AND'liyor — TEK mesaj üçünü BİRDEN taşımadığı için (ne
    // m1 ne m2) sonuç BOŞ olmalı. Boş OLMASAYDI 'OR' hâlâ operatör gibi
    // okunuyor demektir.
    expect(() => searchMessages('elma OR armut', { limit: 10 })).not.toThrow();
    expect(searchMessages('elma OR armut', { limit: 10 })).toHaveLength(0);

    // Kullanıcı GERÇEKTEN "or" kelimesini arıyorsa (üçü de TEK mesajda)
    // bulunmalı — literal okumanın pozitif kanıtı, yalnız "patlamadı" değil.
    saveMessage(msg('m3', 'elma or armut salatasi'), CONV);
    expect(searchMessages('elma or armut', { limit: 10 }).map((h) => h.messageId)).toEqual([
      'm3',
    ]);
  });

  // Review turu 1, Kritik — ölçülen regresyon: tırnaklı ama ÖN EKSİZ bir FTS
  // sorgusu yarım yazılmış kelimeyi HİÇ bulamıyordu (`"isi"` tam kelime
  // arar, `isik`i değil), bu da kullanıcının yazarken gördüğü HER ara
  // durumda arama sonucunun boş görünmesi demekti — LIKE yedeği ise substring
  // olduğu için buluyordu, iki şekil ayrışıyordu. Çözüm: `"tok"*` (bkz.
  // `toFtsMatchQuery`). Bu test HER İKİ kapasitede de aynı satırları
  // dönmeliler.
  it('ön ek (yarım yazılmış kelime) ile eşleşiyor — iki şekil de AYNI satırı buluyor', () => {
    saveMessage(msg('m1', 'IŞIK geldi'), CONV);
    saveMessage(msg('m2', 'kahvehane güzel'), CONV);

    expect(searchMessages('isi', { limit: 10 }).map((h) => h.messageId)).toEqual(['m1']);
    expect(searchMessages('kahve', { limit: 10 }).map((h) => h.messageId)).toEqual(['m2']);
  });

  // Review turu 1, Kritik — ölçülen ikinci ayrışma: FTS bağımsız tokenları
  // AND'lerken (bitişik olmaları gerekmez), eski LIKE yedeği TEK bitişik alt
  // dize arıyordu — "kelime var" sorgusu "iki kelime arasi dolgu var"da
  // aralarında başka kelime olduğu için LIKE'ta hiç bulunmuyordu, FTS'te
  // buluyordu. Çözüm: LIKE de artık token-başına ön ek arayıp AND'liyor
  // (bkz. `buildLikePredicate`).
  it('bitişik olmayan iki kelime AND\'li buluyor — tokenlar metinde ayrı yerlerde olabilir', () => {
    saveMessage(msg('m1', 'iki kelime arasi dolgu var'), CONV);

    expect(searchMessages('kelime var', { limit: 10 }).map((h) => h.messageId)).toEqual(['m1']);
    expect(searchMessages('iki dolgu', { limit: 10 }).map((h) => h.messageId)).toEqual(['m1']);
  });

  // Review turu 1, Önemli 4 — ORİJİNAL TESTİN TARİHÇESİ: burada önceden
  // 'a_b' sorgusunun 'axb'yi eşleştirmediğini kontrol eden bir test vardı.
  // Review turu 2'nin `tokenizeFolded`ı (sorguyu `\p{L}\p{N}` sınırında
  // bölme) devreye girince o senaryo ARTIK ULAŞILAMAZ hâle geldi: 'a_b'
  // sorgusu SQL'e varmadan ['a','b'] tokenlarına bölünüyor, yani tek bir
  // LIKE desenin İÇİNDE `_` hiç OLUŞAMIYOR — `escapeLikeToken` artık
  // SAVUNMA amaçlı (bkz. oradaki yorum), gerçek bir girdi onu hiç
  // tetiklemiyor. Eski testi KORUMAK (doc'u 'a_b test' tutup) onu yeni
  // tokenizasyonun KASITLI, belgelenen residual'ına (sembol kelimenin
  // İÇİNDE → belge tarafı FTS/LIKE'ta farklı tokenize oluyor, bkz.
  // `searchMessages` yorumundaki "RESIDUAL" bölümü) çarptırıp YANLIŞ
  // sebeple kırılırdı; o yüzden kaldırıldı, escape mekanizması
  // `escapeLikeToken`'ın kendi yorumunda gerekçelendi.

  // Review turu 2 ruling — ÇEKİRDEK istek: SORGU tarafı iki yolda da AYNI
  // sınırda (unicode61'inkiyle) tokenize ediliyor. "100%" kullanıcının
  // GERÇEKTEN yazabileceği bir girdi (fiyat/indirim) — `%` ayraç sayılıp
  // ATILIYOR, kalan tek token "100" HER İKİ yolda da AYNI. Review turu 1'de
  // LIKE tarafı ham sorguyu yalnız BOŞLUĞA göre bölüyordu, yani "100%" LIKE'ta
  // kaçırılmış LİTERAL "100%" arıyordu ve "100 indirim" gibi mesajı ASLA
  // bulamazdı — FTS ise kendi tokenizer'ıyla zaten "100"a iniyordu. Bu test
  // o ayrışmanın KAPANDIĞINI iki kapasitede de pinliyor.
  it('sorgu tarafı unicode61 sınırında tokenize ediliyor — "100%" tek token "100"a iniyor, iki yolda da AYNI', () => {
    saveMessage(msg('m1', '100 indirim'), CONV);

    expect(searchMessages('100%', { limit: 10 }).map((h) => h.messageId)).toEqual(['m1']);
  });

  // Review turu 1, Minör 1: eski kod yalnız `foldedQuery === ''`i reddediyordu
  // — "  " (yalnız boşluk) LIKE dalında `LIKE '%  %'`ye düşüp çift boşluk
  // içeren HER ŞEYİ eşleştirirdi (FTS dalı ise zaten `[]` dönüyordu, iki
  // şekil ayrışırdı). Tokenizasyon tabanlı guard bunu simetrik kapatıyor.
  it('yalnız boşluktan oluşan sorgu iki yolda da boş sonuç veriyor', () => {
    saveMessage(msg('m1', 'cift  bosluk icerir'), CONV); // içerikte de ÇİFT boşluk var
    expect(searchMessages('   ', { limit: 10 })).toHaveLength(0);
  });

  // Review turu 3, Önemli — ölçülen regresyon: çok satırlı bir mesajda
  // ikinci satırdaki kelime LIKE yolunda ASLA bulunmuyordu, çünkü
  // `searchableFolded` boşluk SINIFI karakterlere (`\n`, `\r\n`, sekme, NBSP)
  // dokunmuyordu ve `buildLikePredicate`in "kelime başı = BOŞLUKTAN sonra"
  // varsayımı satır sonlarında YANLIŞ çıkıyordu. Çok satırlı mesaj sohbette
  // NADİR DEĞİL — bu, önceki round'un "residual" diye bıraktığı şeyin asıl
  // (ve artık kapanan) örneğiydi. `searchableFolded`deki
  // `.replace(/\s+/g, ' ')` tüm bu karakterleri TEK boşluğa indiriyor.
  it('çok satırlı / sekmeli / NBSP\'li mesajlar iki yolda da AYNI şekilde bulunuyor', () => {
    saveMessage(msg('m1', 'merhaba\ndunya'), CONV);
    saveMessage(msg('m2', 'satir1\r\nsatir2'), CONV);
    saveMessage(msg('m3', 'proje\tplani'), CONV);
    saveMessage(msg('m4', 'ali veli'), CONV); // NBSP (U+00A0)

    expect(searchMessages('dunya', { limit: 10 }).map((h) => h.messageId)).toEqual(['m1']);
    expect(searchMessages('satir2', { limit: 10 }).map((h) => h.messageId)).toEqual(['m2']);
    expect(searchMessages('plani', { limit: 10 }).map((h) => h.messageId)).toEqual(['m3']);
    expect(searchMessages('veli', { limit: 10 }).map((h) => h.messageId)).toEqual(['m4']);
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

    // Hedef tam ortada OLMASI dahil tüm diziliş tek `toEqual` ile pinleniyor
    // — ayrı bir `window[2].id` kontrolü FAZLALIK olurdu (review turu 1, Minör 4).
    expect(window.messages.map((m) => m.id)).toEqual(['m7', 'm6', 'm5', 'm4', 'm3']);
    // Arşivde m8..m10 DURUYOR — bu pencere "şu an"a değmiyor.
    expect(window.reachesNewest).toBe(false);
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
    expect(window.messages.map((m) => m.id)).toEqual(['m3', 'm2', 'm1']);
  });

  // Review turu 1, Minör 3: yalnız ESKİ uç (before yetersiz) test edilmişti;
  // `.reverse()`li YENİ uç dalı (after yetersiz) hiç koşulmamıştı.
  it('arşivin sonundaki (en yeni) mesajda da patlamıyor (after yetersiz)', () => {
    seed(3);
    const target = getChatDb().getFirst<{ sent_at_ms: number }>(
      'SELECT sent_at_ms FROM messages WHERE id = ?',
      ['m3'],
    )!;

    // m3 arşivin EN YENİSİ — after=2 istense de ardında hiç mesaj yok.
    expect(() => readAround(CONV, target.sent_at_ms, 'm3', 2, 2)).not.toThrow();
    const window = readAround(CONV, target.sent_at_ms, 'm3', 2, 2);

    expect(window.messages.map((m) => m.id)).toEqual(['m3', 'm2', 'm1']);
  });

  // Review turu 1, Önemli: `sentAtMs` parametresi çağıranın elindeki (BAYAT
  // olabilen) damga — hedefin kendi `sent_at_ms`'inden DAHA ESKİ bir değer
  // geçilirse, çapa o bayat değere göre kurulsaydı hedef kendi
  // `sent_at_ms > ?` koşulunu SAĞLAR ve hem `newer` içinde hem `target`
  // olarak İKİ KEZ dönerdi (aynı `id` iki satırda — Task 5'in liste
  // anahtarlamasını kırar). Pencere hedefin VERİTABANINDAN TAZE okunan
  // damgasına çapalanmak ZORUNDA.
  it('çağıranın BAYAT sentAtMs değeri hedefi İKİ KEZ döndürmüyor', () => {
    seed(5); // m1..m5, sent_at_ms artan sırada
    const staleAnchor = 1_700_000_000_000; // tüm satırların GERÇEK damgasından daha ESKİ

    const window = readAround(CONV, staleAnchor, 'm3', 0, 3);
    const ids = window.messages.map((m) => m.id);

    expect(new Set(ids).size).toBe(ids.length); // hiçbir id YİNELENMİYOR
    // Pencere hedefin GERÇEK damgasına göre kuruldu (m3'ten sonraki iki satır
    // + hedef), BAYAT parametreye göre DEĞİL — bayat olsaydı m1/m2/m3 üçü de
    // "daha yeni" sayılır, m3 hem oradan hem hedeften gelirdi.
    expect(ids).toEqual(['m5', 'm4', 'm3']);
  });

  // Review turu 4, Önemli 2: `isWindowed` bayrağı ARTIK bu alandan türüyor.
  // Yalnız dizilişi test etmek buna KÖR kalırdı — `reachesNewest` sabit
  // `false` dönen bir mutasyon (eski davranışın aynısı) tüm diğer readAround
  // testlerinden GEÇİYOR.
  it('pencere arşivin DİBİNE değiyorsa reachesNewest TRUE', () => {
    seed(5);
    const target = getChatDb().getFirst<{ sent_at_ms: number }>(
      'SELECT sent_at_ms FROM messages WHERE id = ?',
      ['m4'],
    )!;

    // m4'ten daha yeni YALNIZ m5 var, after=3 istendi → 3'ten AZ satır döndü,
    // yani pencerenin YENİ ucunda başka satır KALMADI: bu pencere "şu an"ı
    // kapsıyor ve bucket PENCERELİ sayılmamalı.
    const window = readAround(CONV, target.sent_at_ms, 'm4', 2, 3);

    expect(window.messages.map((m) => m.id)).toEqual(['m5', 'm4', 'm3', 'm2']);
    expect(window.reachesNewest).toBe(true);
  });

  it('en yeni mesajın KENDİSİ hedefse reachesNewest TRUE', () => {
    seed(5);
    const target = getChatDb().getFirst<{ sent_at_ms: number }>(
      'SELECT sent_at_ms FROM messages WHERE id = ?',
      ['m5'],
    )!;

    const window = readAround(CONV, target.sent_at_ms, 'm5', 2, 2);

    expect(window.reachesNewest).toBe(true);
  });
});
