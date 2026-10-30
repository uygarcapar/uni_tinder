jest.mock('expo-sqlite');
jest.mock('@/features/chat/chatService', () => ({
  __esModule: true,
  default: { getMessageHistory: jest.fn() },
  HISTORY_PAGE_SIZE: 50,
}));
jest.mock('@/shared/services/networkStatus', () => ({ isOfflineNow: jest.fn(() => false) }));
// Bayrak AÇIK sabitleniyor. Bu dosya `runBackfillRound`u 17 yerde çağırıyor ve
// bayrağı GERÇEK sabitten okursa `CHAT_BACKFILL_ENABLED = false` yapmak —
// chatFlags.ts'in OTA geri dönüşü olarak BELGELEDİĞİ hamle — bu suite'i
// kırmızıya çevirir. Kullandığında suite'i kızartan bir kill-switch'i operatör
// çevirmeye çekinir, yani anahtarın değeri testlerin kırılganlığına feda
// edilmiş olur. Kapalı hâlin kapı testi chatBackfill.killSwitch.test.ts'te.
// (Aynı gerekçe ve aynı kalıp: chatDeltaSync.test.ts.)
jest.mock('@/shared/store/chatFlags', () => ({
  CHAT_PERSIST_ENABLED: false,
  CHAT_SQLITE_ENABLED: true,
  CHAT_DELTA_SYNC_ENABLED: true,
  CHAT_BACKFILL_ENABLED: true,
}));
// `@/shared/store` tek Redux singleton'ı — modülü GERÇEK kurarsak redux-persist
// + MMKV + bütün diğer slice'lar da yüklenir (gereksiz ve yan etkili). Sahte
// `dispatch`'i buradan izlemek, bu dosyanın importu olmayan bir fonksiyonun
// `fetchHistory` thunk'ını GLOBAL store'a dispatch etmesi gibi gerçek bir
// sızıntıyı yakalar — ayrı/yerel bir store'un boş kalması hiçbir şey ispatlamaz
// (round'un imzasında dispatch/store parametresi yok, kendi store'unu
// oluşturamaz; sızabileceği TEK yer bu singleton).
jest.mock('@/shared/store', () => ({
  __esModule: true,
  store: { dispatch: jest.fn(), getState: jest.fn(() => ({})) },
}));

import * as SQLite from 'expo-sqlite';
import { store } from '@/shared/store';
import { openChatDb, __resetChatDbForTests } from '@/features/chat/db/chatDb';
import * as repo from '@/features/chat/chatRepository';
import {
  readBackfillTargets,
  setBackfillCursor,
  readWindow,
} from '@/features/chat/chatRepository';
import { clear as clearMessageCache } from '@/features/chat/messageCache';
import chatService from '@/features/chat/chatService';
import { isOfflineNow } from '@/shared/services/networkStatus';
import {
  recordRateLimitHeaders,
  __resetRateLimitBudgetForTests,
} from '@/shared/services/rateLimitBudget';
import {
  RATE_LIMIT_RESERVE,
  BACKFILL_PAGE_SIZE,
  PAGE_DELAY_MS,
  MAX_REQUESTS_PER_ROUND,
} from '@/features/chat/backfillPolicy';
import { runBackfillRound, __resetBackfillForTests } from '@/features/chat/chatBackfill';
import type { MessageDto } from '@/shared/types';

/**
 * Round'un kendisi: `chatService.getMessageHistory` mock'lanır, SQLite
 * GERÇEKTİR (expo-sqlite mock'u → better-sqlite3). Amaç depo/politika
 * entegrasyonunu doğrulamak — depo/defter/politika ayrı test dosyalarında saf/izole
 * doğrulandı, burada hepsi birlikte GERÇEK çalışıyor mu bakılıyor.
 */

const { __resetAllDatabases } = SQLite as unknown as { __resetAllDatabases: () => void };
const getMessageHistory = (chatService as any).getMessageHistory as jest.Mock;
const mockIsOfflineNow = isOfflineNow as jest.Mock;

const insertConversation = (conversationId: string, lastMessageAtMs: number): void => {
  openChatDb().run(
    `INSERT INTO conversations (conversation_id, partner_user_id, last_message_at_ms)
     VALUES (?, ?, ?)`,
    [conversationId, `partner-${conversationId}`, lastMessageAtMs],
  );
};

const msg = (id: string, conversationId: string, sentAtIso: string): MessageDto =>
  ({
    id,
    conversationId,
    senderId: 'partner',
    content: id,
    contentType: 0,
    sentAt: sentAtIso,
  }) as MessageDto;

/** Sunucu sayfası — hasMore/nextCursor varsayılanları en çok kullanılan hâl (tamamlanmış sohbet). */
const page = (
  messages: MessageDto[],
  opts: { nextCursor?: string | null; hasMore?: boolean } = {},
) => ({
  messages,
  nextCursor: opts.nextCursor ?? null,
  hasMore: opts.hasMore ?? false,
});

beforeEach(() => {
  __resetChatDbForTests();
  __resetAllDatabases();
  clearMessageCache();
  openChatDb();
  __resetBackfillForTests();
  __resetRateLimitBudgetForTests();
  getMessageHistory.mockReset();
  mockIsOfflineNow.mockReset();
  mockIsOfflineNow.mockReturnValue(false);
  (store.dispatch as jest.Mock).mockClear();
  jest.useFakeTimers();
});

afterEach(() => {
  jest.useRealTimers();
});

describe('runBackfillRound', () => {
  it('sayfayı DİSKE yazıyor ve Redux bucket\'ı BOŞ kalıyor', async () => {
    insertConversation('conv-1', 1_000);
    getMessageHistory.mockResolvedValueOnce(
      page([msg('m1', 'conv-1', '2026-10-20T10:00:00.000Z')]),
    );

    const result = await runBackfillRound(() => null);

    expect(result).toEqual({ ran: true, pages: 1, messages: 1, completed: ['conv-1'] });
    // Disk — tur gerçekten yazdı mı (boş no-op'u "redux'a dokunmadı" diye
    // yanlış yeşile düşürmemek için).
    expect(readWindow('conv-1', 10).map((r) => r.id)).toEqual(['m1']);
    // Redux — GLOBAL store singleton'ına HİÇ dispatch edilmedi. `fetchHistory`
    // thunk'ı (ya da başka bir action) burada çağrılsaydı — round'un tek
    // ulaşabileceği store bu olduğundan — bu iddia kırılırdı.
    expect(store.dispatch).not.toHaveBeenCalled();
  });

  it('cursor ilerliyor, bir sonraki tur kaldığı yerden devam ediyor', async () => {
    insertConversation('conv-1', 1_000);
    // İlk tur: kota BİLİNMİYOR (henüz hiçbir yanıt görülmedi) — probe kuralı
    // bir sayfadan sonra turu kapatır, ikinci sayfa hiç istenmez.
    getMessageHistory.mockResolvedValueOnce(
      page([msg('m1', 'conv-1', '2026-10-20T10:00:00.000Z')], {
        nextCursor: 'cursor-2',
        hasMore: true,
      }),
    );

    const round1 = await runBackfillRound(() => null);
    expect(round1.pages).toBe(1);
    expect(getMessageHistory).toHaveBeenCalledTimes(1);
    expect(readBackfillTargets(10)).toEqual([{ conversationId: 'conv-1', cursor: 'cursor-2' }]);

    // İkinci tur: artık bol kota biliniyor — kaldığı cursor'dan devam eder.
    recordRateLimitHeaders({ 'x-ratelimit-remaining': '500' });
    getMessageHistory.mockResolvedValueOnce(
      page([msg('m2', 'conv-1', '2026-10-20T10:01:00.000Z')]),
    );

    const round2 = await runBackfillRound(() => null);

    expect(getMessageHistory).toHaveBeenLastCalledWith('conv-1', {
      cursor: 'cursor-2',
      pageSize: BACKFILL_PAGE_SIZE,
      skip429Retry: true,
    });
    expect(round2.completed).toEqual(['conv-1']);
  });

  it('hasMore false gelince sohbeti tamam işaretliyor ve bir daha istemiyor', async () => {
    insertConversation('conv-1', 1_000);
    getMessageHistory.mockResolvedValueOnce(
      page([msg('m1', 'conv-1', '2026-10-20T10:00:00.000Z')], { hasMore: false }),
    );

    const round1 = await runBackfillRound(() => null);
    expect(round1.completed).toEqual(['conv-1']);

    // Bir daha istemiyor: readBackfillTargets onu artık döndürmüyor, o yüzden
    // round2 hiçbir istek atmaz.
    const round2 = await runBackfillRound(() => null);

    expect(getMessageHistory).toHaveBeenCalledTimes(1);
    expect(round2).toEqual({ ran: true, pages: 0, messages: 0, completed: [] });
  });

  it('AKTİF sohbeti atlıyor', async () => {
    insertConversation('conv-active', 2_000);
    insertConversation('conv-passive', 1_000);
    getMessageHistory.mockResolvedValueOnce(
      page([msg('m1', 'conv-passive', '2026-10-20T10:00:00.000Z')]),
    );

    const result = await runBackfillRound(() => 'conv-active');

    expect(getMessageHistory).toHaveBeenCalledTimes(1);
    expect(getMessageHistory).toHaveBeenCalledWith('conv-passive', expect.anything());
    expect(result.completed).toEqual(['conv-passive']);
  });

  it('tur ortasında offline olursa duruyor ve ilerleme diskte kalıyor', async () => {
    // GERÇEKÇİ şekil: bağlantı koptuğunda devam eden istek BAŞARIYLA
    // dönmez, PATLAR (ağ hatası) — "istekler hâlâ başarıyla dönüyor ama
    // isOfflineNow() true diyor" senaryosu gerçekte olmaz ve tam da bu
    // yanlış şekil yüzünden (önceki sürümde) istek PATLADIĞINDA offline
    // kontrolünün hiç çalışmadığı fark edilmemişti.
    insertConversation('conv-1', 2_000);
    insertConversation('conv-2', 1_000);
    recordRateLimitHeaders({ 'x-ratelimit-remaining': '500' }); // kota BOL — yalnız offline'ı izole etmek için
    getMessageHistory
      .mockResolvedValueOnce(
        page([msg('m1', 'conv-1', '2026-10-20T10:00:00.000Z')], {
          nextCursor: 'cursor-2',
          hasMore: true,
        }),
      )
      .mockRejectedValueOnce(new Error('bağlantı koptu')); // conv-1'in 2. sayfası
    // 1. ve 2. istekten ÖNCEKİ kontrol: online (ikisi de denensin). 2. istek
    // PATLADIKTAN SONRA, conv-2'ye geçmeden ÖNCEKİ kontrol: offline.
    mockIsOfflineNow.mockReturnValueOnce(false).mockReturnValueOnce(false).mockReturnValue(true);

    const promise = runBackfillRound(() => null);
    await jest.advanceTimersByTimeAsync(2000);
    const result = await promise;

    // conv-2'ye HİÇ sıra gelmedi — 3. çağrı yok.
    expect(getMessageHistory).toHaveBeenCalledTimes(2);
    expect(getMessageHistory).not.toHaveBeenCalledWith('conv-2', expect.anything());
    expect(result.pages).toBe(1);
    // İlerleme diskte: başarılı 1. sayfanın mesajı yazılmış, cursor onun
    // nextCursor'ına ilerlemiş — patlayan 2. sayfa cursor'ı GERİ ALMADI.
    expect(readWindow('conv-1', 10).map((r) => r.id)).toEqual(['m1']);
    expect(
      readBackfillTargets(10).find((t) => t.conversationId === 'conv-1')?.cursor,
    ).toBe('cursor-2');
    // conv-2 dokunulmadan kaldı — bir sonraki tur baştan deneyecek.
    expect(
      readBackfillTargets(10).find((t) => t.conversationId === 'conv-2')?.cursor,
    ).toBeNull();
  });

  it('tur başlarken bile kalan kota rezervin altındaysa hiç istek atmıyor', async () => {
    // Turun İLK isteği de kontrole tabi: kullanıcı o anda kendi sohbetini
    // sayfalıyor olabilir, backfill bir slot daha harcayıp onu 429'a
    // yaklaştırmamalı.
    insertConversation('conv-1', 1_000);
    recordRateLimitHeaders({ 'x-ratelimit-remaining': String(RATE_LIMIT_RESERVE - 1) });

    const result = await runBackfillRound(() => null);

    expect(getMessageHistory).not.toHaveBeenCalled();
    expect(result).toEqual({ ran: true, pages: 0, messages: 0, completed: [] });
  });

  it('kalan kota rezervin altına inince tur ortasında duruyor', async () => {
    insertConversation('conv-1', 1_000);
    // Başlangıçta BOL — turun İLK isteği serbest geçsin (bu "tur başlarken
    // bile..." testinin bir TEKRARI olmasın, oradan ayıran şey tam bu).
    recordRateLimitHeaders({ 'x-ratelimit-remaining': '500' });
    // chatService tamamen mock'lu, GERÇEK interceptor'dan geçmiyor — 1.
    // sayfanın YANITI kotayı rezervin altına düşürdüğünü burada kendi
    // elimizle taklit ediyoruz (gerçekte bunu api.ts'teki
    // `recordRateLimitHeaders(response.headers)` yapardı).
    getMessageHistory.mockImplementationOnce(async () => {
      recordRateLimitHeaders({ 'x-ratelimit-remaining': String(RATE_LIMIT_RESERVE - 1) });
      return page([msg('m1', 'conv-1', '2026-10-20T10:00:00.000Z')], {
        nextCursor: 'cursor-2',
        hasMore: true, // kota engellemeseydi 2. sayfa istenecekti
      });
    });

    const result = await runBackfillRound(() => null);

    expect(getMessageHistory).toHaveBeenCalledTimes(1);
    expect(result.pages).toBe(1);
    expect(result.completed).toEqual([]);
    // İlerleme KORUNDU — bir sonraki tur burada devam edecek.
    expect(readBackfillTargets(10)).toEqual([{ conversationId: 'conv-1', cursor: 'cursor-2' }]);
  });

  it('istek patlarsa o sohbeti bırakıp tura devam ediyor, cursor GERİ GİTMİYOR', async () => {
    insertConversation('conv-1', 2_000);
    insertConversation('conv-2', 1_000);
    setBackfillCursor('conv-1', 'cursor-eski');
    // Kota BOL VE BİLİNİYOR — bu testin konusu hata-sonrası devam etmek,
    // probe kuralı DEĞİL. Kota null kalsaydı conv-1'in BAŞARISIZ denemesi
    // bile `attempts`'i 1'e çıkarır ve probe kuralı conv-2'den önce turu
    // kapatırdı (bkz. backfillPolicy.ts — kasıtlı, ayrı test bunu kilitliyor).
    recordRateLimitHeaders({ 'x-ratelimit-remaining': '500' });
    getMessageHistory
      .mockRejectedValueOnce(new Error('ağ hatası'))
      .mockResolvedValueOnce(page([msg('m1', 'conv-2', '2026-10-20T10:00:00.000Z')]));

    const promise = runBackfillRound(() => null);
    // conv-1'in isteği reddedildi ama PAGE_DELAY_MS henüz dolmadı — conv-2
    // SOHBET SINIRINI AŞAN gecikmede beklemede, hemen denenmiyor.
    await jest.advanceTimersByTimeAsync(0);
    expect(getMessageHistory).toHaveBeenCalledTimes(1);

    await jest.advanceTimersByTimeAsync(PAGE_DELAY_MS);
    const result = await promise;

    expect(getMessageHistory).toHaveBeenCalledTimes(2); // conv-2'ye devam etti
    expect(result.completed).toEqual(['conv-2']);
    // conv-1'in cursor'ı GERİ GİTMEDİ — hata öncesi değerinde kaldı.
    expect(
      readBackfillTargets(10).find((t) => t.conversationId === 'conv-1')?.cursor,
    ).toBe('cursor-eski');
  });

  it('BAŞARISIZ prob da hakkı tüketir — ikinci bir isteğe izin vermeden turu kapatıyor', async () => {
    // Kota hiç BİLİNMİYOR (cold start, `recordRateLimitHeaders` hiç
    // çağrılmadı) — probe kuralı en çok BİR DENEMEYE izin verir. Bu deneme
    // BAŞARISIZ olsa bile (burada genel bir ağ hatası, 429 DEĞİL) hak
    // tükenmiş sayılır: başarısız bir prob bütçe hakkında hiçbir şey
    // öğretmedi, ikinci bir kör isteğe de izin verilmiyor (bkz.
    // backfillPolicy.shouldStopRound'daki prob yorumu). Yukarıdaki "istek
    // patlarsa" testi bunun TAM TERSİNİ (kota bilinirken devam ediyor)
    // kilitliyor; bu test probun kendisini.
    insertConversation('conv-1', 2_000);
    insertConversation('conv-2', 1_000);
    getMessageHistory.mockRejectedValueOnce(new Error('ağ hatası')); // conv-1'in probu

    const result = await runBackfillRound(() => null);

    expect(getMessageHistory).toHaveBeenCalledTimes(1); // conv-2'ye HİÇ sıra gelmedi
    expect(result.pages).toBe(0);
    expect(result.completed).toEqual([]);
  });

  it('429 alınca turu kesiyor ve cursor\'a dokunmuyor', async () => {
    insertConversation('conv-1', 2_000);
    insertConversation('conv-2', 1_000);
    setBackfillCursor('conv-1', 'cursor-eski');
    getMessageHistory.mockRejectedValueOnce({ response: { status: 429 } });
    // conv-2'ye hiç sıra gelmemeli — mock bilerek tanımlı DEĞİL, çağrılırsa
    // jest zaten undefined döner ve test `.messages` okurken patlar.

    const result = await runBackfillRound(() => null);

    expect(getMessageHistory).toHaveBeenCalledTimes(1); // conv-2 hiç denenmedi
    expect(result.pages).toBe(0);
    expect(
      readBackfillTargets(10).find((t) => t.conversationId === 'conv-1')?.cursor,
    ).toBe('cursor-eski');
  });

  it('art arda gelen GENEL hatalarda (5xx fırtınası) turu MAX_REQUESTS_PER_ROUND İSTEĞİNDE durduruyor — hedef sayısı fazla olsa bile', async () => {
    // `readBackfillTargets`'ı DOĞRUDAN sahteliyoruz. Gerçek SQL yoluyla 35
    // sohbet eklesek bu test HİÇBİR ŞEY kanıtlamazdı: chatBackfill.ts zaten
    // `repo.readBackfillTargets(MAX_REQUESTS_PER_ROUND)` çağırıyor, yani
    // sorgunun KENDİSİ hedef listesini 30'da keser — `shouldStopRound`'un
    // DENEME sayısını doğru sayıp saymadığından BAĞIMSIZ olarak çağrı sayısı
    // 30 çıkardı (doğrulandı: `attemptsThisRound`'u `result.pages`'e
    // indiren bir mutasyonla bu test, okuma katmanı sahtelenmeden, YANLIŞLIKLA
    // YEŞİL kalıyordu). Tavanın üstünde hedef üretmenin tek yolu okuma
    // katmanını bypass etmek.
    const TARGET_COUNT = MAX_REQUESTS_PER_ROUND + 5;
    const manyTargets = Array.from({ length: TARGET_COUNT }, (_, i) => ({
      conversationId: `conv-${i}`,
      cursor: null,
    }));
    const readTargetsSpy = jest
      .spyOn(repo, 'readBackfillTargets')
      .mockReturnValue(manyTargets);

    try {
      // Offline DEĞİL, kota SAĞLIKLI — bu ikisi turu durdurmasın, yalnız
      // "istek sayısı" tavanı izole edilsin.
      recordRateLimitHeaders({ 'x-ratelimit-remaining': '500' });
      getMessageHistory.mockRejectedValue(new Error('5xx fırtınası')); // HER istek patlıyor, hiçbiri 429 değil

      const promise = runBackfillRound(() => null);
      await jest.advanceTimersByTimeAsync(TARGET_COUNT * PAGE_DELAY_MS);
      const result = await promise;

      // Tavan DENEME sayısında duruyor, başarı sayısında DEĞİL. Yalnız
      // `expect(result.pages).toBe(0)` bu mutasyona KÖR — hiçbir istek
      // zaten başarıya ulaşmadığından o iddia her hâlükârda doğru. Sayacı
      // yakalayan asıl iddia çağrı SAYISI: `attemptsThisRound`'u
      // `result.pages`'e indiren bir mutasyonla bu sayı 35'e çıkıyor
      // (doğrulandı) — tavan hiç tutmuyor.
      expect(getMessageHistory).toHaveBeenCalledTimes(MAX_REQUESTS_PER_ROUND);
      expect(result.pages).toBe(0);
      expect(result.completed).toEqual([]);
    } finally {
      // `finally`: yukarıdaki `await`lerden biri beklenmedik şekilde
      // reddetse bile spy dosyanın geri kalanına SIZMASIN.
      readTargetsSpy.mockRestore();
    }
  });

  it('aynı anda iki tur koşmuyor (in-flight)', async () => {
    insertConversation('conv-1', 1_000);
    let resolvePage!: (v: unknown) => void;
    getMessageHistory.mockImplementationOnce(
      () =>
        new Promise((resolve) => {
          resolvePage = resolve;
        }),
    );

    const p1 = runBackfillRound(() => null);
    const p2 = runBackfillRound(() => null); // uçuştaki turu döner, YENİ tur AÇMAZ

    resolvePage(page([msg('m1', 'conv-1', '2026-10-20T10:00:00.000Z')]));
    const [r1, r2] = await Promise.all([p1, p2]);

    expect(getMessageHistory).toHaveBeenCalledTimes(1);
    expect(r2).toBe(r1);
  });
});
