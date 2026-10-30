jest.mock('expo-sqlite');
jest.mock('@/features/chat/chatService', () => ({
  __esModule: true,
  default: { getMessageHistory: jest.fn() },
  HISTORY_PAGE_SIZE: 50,
}));
jest.mock('@/shared/services/networkStatus', () => ({ isOfflineNow: jest.fn(() => false) }));
// `chatFlags` burada AÇIK sabitleniyor — bayrağın KAPALI hâli AYRI dosyada
// (chatBackfill.killSwitch.test.ts): bayrak modül yüklenirken okunuyor, yani
// aynı dosyada hem açık hem kapalı hâli sınanamıyor (bkz. chatDeltaSync
// killSwitch.test.ts'teki aynı not).
jest.mock('@/shared/store/chatFlags', () => ({
  CHAT_PERSIST_ENABLED: false,
  CHAT_SQLITE_ENABLED: true,
  CHAT_DELTA_SYNC_ENABLED: true,
  CHAT_BACKFILL_ENABLED: true,
}));
// Hub, tetikleyicinin KİMLİK kapısı (bkz. chatBackfill.startBackfill). Gerçek
// servis `@/shared/services/api`yi ve SignalR'ı çekiyor; burada ihtiyaç duyulan
// tek şey bağlantının açık/kapalı olması. `mock` öneki şart: factory'ler
// hoist ediliyor.
const mockHub = { connected: true };
jest.mock('@/features/chat/realtimeService', () => ({
  __esModule: true,
  default: { isConnected: () => mockHub.connected },
}));

import * as SQLite from 'expo-sqlite';
import chatService from '@/features/chat/chatService';
import { openChatDb, __resetChatDbForTests } from '@/features/chat/db/chatDb';
import { clear as clearMessageCache } from '@/features/chat/messageCache';
import { readWindow } from '@/features/chat/chatRepository';
import {
  startBackfill,
  runBackfillRound,
  __resetBackfillForTests,
} from '@/features/chat/chatBackfill';
import { BACKFILL_BOOT_DELAY_MS } from '@/features/chat/backfillPolicy';
import type { MessageDto } from '@/shared/types';

/**
 * Boot tetiği: `startBackfill` açılıştan `BACKFILL_BOOT_DELAY_MS` sonra TEK
 * bir tur başlatıyor mu, söküldüğünde o turu gerçekten iptal ediyor mu.
 * Turun KENDİSİ (sayfalama, kota, offline, 429...) `chatBackfill.test.ts`'te
 * zaten doğrulandı — burada SADECE zamanlama/tetikleme.
 */

const { __resetAllDatabases } = SQLite as unknown as { __resetAllDatabases: () => void };
const getMessageHistory = (chatService as any).getMessageHistory as jest.Mock;

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

const page = (messages: MessageDto[]) => ({ messages, nextCursor: null, hasMore: false });

beforeEach(() => {
  __resetChatDbForTests();
  __resetAllDatabases();
  clearMessageCache();
  openChatDb();
  __resetBackfillForTests();
  getMessageHistory.mockReset();
  mockHub.connected = true;
  jest.useFakeTimers({ doNotFake: ['setImmediate'] });
});

afterEach(() => {
  jest.useRealTimers();
});

describe('startBackfill', () => {
  it('boot’ta SENKRON tur BAŞLATMIYOR — ilk kare gecikmez', () => {
    // Hedef VAR (conv-1) — boş bir DB'de bu iddia anlamsız kalırdı, çünkü
    // istek atacak hiçbir şey olmadan "atılmadı" tespiti hiçbir şey ispatlamaz.
    // Burada bir hedef varken ve `startBackfill` çağrıldığı TICK içinde hiç
    // mikro-görev/timer ilerletilmeden iddia ediliyor: senkron bir çağrı
    // olsaydı (setTimeout'u UNUTUP doğrudan `runBackfillRound` çağırmak gibi
    // bir regresyon) `chatService.getMessageHistory` bu satırdan ÖNCE zaten
    // tetiklenmiş olurdu — ilk istek `await`siz atıldığı için (bkz.
    // chatBackfill.ts `run()` — firstRequest'te delay yok) senkron bir çağrı
    // burada YAKALANIR.
    insertConversation('conv-1', 1_000);

    startBackfill({ getActiveConversationId: () => null });

    expect(getMessageHistory).not.toHaveBeenCalled();
  });

  it('hub BAĞLI DEĞİLKEN gecikme dolsa bile tur koşmuyor — kimlik kapısı', async () => {
    // `startDeltaSync`'in boot'ta doğrudan çekmeme gerekçesinin aynısı: bu
    // kod store modülü yüklenirken çalışıyor, token henüz yerinde
    // olmayabiliyor (bozuk/silinmiş token deposu, yarım refresh penceresi —
    // ikisi de bu projede yaşandı). Kapı olmadan tur t+10sn'de 30 isteğe
    // kadar kimlikli istek atıp her birinde 401/refresh makinesini
    // çalıştırabiliyordu. Hub yalnız kimlik doğrulandıktan sonra bağlanıyor,
    // yani bağlantının kendisi "token yerinde" demek.
    insertConversation('conv-1', 1_000);
    getMessageHistory.mockResolvedValueOnce(page([msg('m1', 'conv-1', '2026-10-20T10:00:00.000Z')]));
    mockHub.connected = false;

    startBackfill({ getActiveConversationId: () => null });
    await jest.advanceTimersByTimeAsync(BACKFILL_BOOT_DELAY_MS);

    expect(getMessageHistory).not.toHaveBeenCalled();
  });

  it('gecikme dolunca turu başlatıyor', async () => {
    insertConversation('conv-1', 1_000);
    getMessageHistory.mockResolvedValueOnce(page([msg('m1', 'conv-1', '2026-10-20T10:00:00.000Z')]));

    startBackfill({ getActiveConversationId: () => null });
    await jest.advanceTimersByTimeAsync(BACKFILL_BOOT_DELAY_MS);

    expect(getMessageHistory).toHaveBeenCalledTimes(1);
    // Diske de gerçekten yazdı — "zamanlayıcı ateşlendi" ile "tur koştu"yu
    // ayırt etmek için.
    expect(readWindow('conv-1', 10).map((r) => r.id)).toEqual(['m1']);
  });

  it('söken fonksiyon çağrılınca bekleyen turu iptal ediyor', async () => {
    insertConversation('conv-1', 1_000);
    getMessageHistory.mockResolvedValueOnce(page([msg('m1', 'conv-1', '2026-10-20T10:00:00.000Z')]));

    const stop = startBackfill({ getActiveConversationId: () => null });
    stop();
    await jest.advanceTimersByTimeAsync(BACKFILL_BOOT_DELAY_MS);

    expect(getMessageHistory).not.toHaveBeenCalled();
  });
});
