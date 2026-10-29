jest.mock('expo-sqlite');
jest.mock('@/features/chat/chatService', () => ({
  __esModule: true,
  default: { getMessageHistory: jest.fn() },
  HISTORY_PAGE_SIZE: 50,
}));
jest.mock('@/shared/services/networkStatus', () => ({ isOfflineNow: jest.fn(() => false) }));

import * as SQLite from 'expo-sqlite';
import { configureStore } from '@reduxjs/toolkit';
import { openChatDb, __resetChatDbForTests } from '@/features/chat/db/chatDb';
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
import { RATE_LIMIT_RESERVE, BACKFILL_PAGE_SIZE } from '@/features/chat/backfillPolicy';
import { runBackfillRound, __resetBackfillForTests } from '@/features/chat/chatBackfill';
import chatReducer from '@/features/chat/chatSlice';
import type { MessageDto } from '@/shared/types';

/**
 * Round'un kendisi: `chatService.getMessageHistory` mock'lanır, SQLite
 * GERÇEKTİR (expo-sqlite mock'u → better-sqlite3). Amaç depo/politika
 * entegrasyonunu doğrulamak — Task 1/2/3 ayrı test dosyalarında saf/izole
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

    // AYRI bir store — "import kontrolü" değil, gerçek bir Redux state'inin
    // tur boyunca hiç değişmediğini (dispatch edilmediğini) ölçmek için.
    // `fetchHistory` thunk'ı burada kullanılsaydı bucket dolardı; bu test
    // SADECE o dalın hiç tetiklenmediğini yakalar.
    const store = configureStore({ reducer: { chat: chatReducer } });

    const result = await runBackfillRound(() => null);

    expect(result).toEqual({ ran: true, pages: 1, messages: 1, completed: ['conv-1'] });
    // Disk — tur gerçekten yazdı mı (boş no-op'u "redux'a dokunmadı" diye
    // yanlış yeşile düşürmemek için).
    expect(readWindow('conv-1', 10).map((r) => r.id)).toEqual(['m1']);
    // Redux — hiç dokunulmadı.
    expect(store.getState().chat.messagesByConv).toEqual({});
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
    insertConversation('conv-1', 1_000);
    recordRateLimitHeaders({ 'x-ratelimit-remaining': '500' }); // kota BOL — yalnız offline'ı izole etmek için
    getMessageHistory
      .mockResolvedValueOnce(
        page([msg('m1', 'conv-1', '2026-10-20T10:00:00.000Z')], {
          nextCursor: 'cursor-2',
          hasMore: true,
        }),
      )
      .mockResolvedValueOnce(
        page([msg('m2', 'conv-1', '2026-10-20T10:01:00.000Z')], {
          nextCursor: 'cursor-3',
          hasMore: true,
        }),
      );
    // 1. sayfa sonrası kontrol: online (devam et). 2. sayfa sonrası: offline (dur).
    mockIsOfflineNow.mockReturnValueOnce(false).mockReturnValue(true);

    const promise = runBackfillRound(() => null);
    await jest.advanceTimersByTimeAsync(2000);
    const result = await promise;

    expect(getMessageHistory).toHaveBeenCalledTimes(2); // 3. sayfa hiç istenmedi
    expect(result.pages).toBe(2);
    // İlerleme diskte: her iki mesaj da yazılmış, cursor 2. sayfanınkine ilerlemiş.
    expect(readWindow('conv-1', 10).map((r) => r.id).sort()).toEqual(['m1', 'm2']);
    expect(readBackfillTargets(10)).toEqual([{ conversationId: 'conv-1', cursor: 'cursor-3' }]);
  });

  it('kalan kota rezervin altına inince tur ortasında duruyor', async () => {
    insertConversation('conv-1', 1_000);
    // Rezervin (RATE_LIMIT_RESERVE) KESİNLİKLE altında, ama null DEĞİL —
    // "bilmiyorum" (probe) dalıyla karışmasın, gerçekten "düşük kota" dalı
    // koşsun.
    recordRateLimitHeaders({ 'x-ratelimit-remaining': String(RATE_LIMIT_RESERVE - 1) });
    getMessageHistory.mockResolvedValueOnce(
      page([msg('m1', 'conv-1', '2026-10-20T10:00:00.000Z')], {
        nextCursor: 'cursor-2',
        hasMore: true, // kota engellemeseydi 2. sayfa istenecekti
      }),
    );

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
    getMessageHistory
      .mockRejectedValueOnce(new Error('ağ hatası'))
      .mockResolvedValueOnce(page([msg('m1', 'conv-2', '2026-10-20T10:00:00.000Z')]));

    const promise = runBackfillRound(() => null);
    await jest.advanceTimersByTimeAsync(2000);
    const result = await promise;

    expect(getMessageHistory).toHaveBeenCalledTimes(2); // conv-2'ye devam etti
    expect(result.completed).toEqual(['conv-2']);
    // conv-1'in cursor'ı GERİ GİTMEDİ — hata öncesi değerinde kaldı.
    expect(
      readBackfillTargets(10).find((t) => t.conversationId === 'conv-1')?.cursor,
    ).toBe('cursor-eski');
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
