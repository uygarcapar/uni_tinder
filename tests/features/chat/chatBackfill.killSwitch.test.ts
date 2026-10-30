jest.mock('expo-sqlite');
jest.mock('react-native-mmkv');
jest.mock('@/features/chat/chatService', () => ({
  __esModule: true,
  default: { getMessageHistory: jest.fn() },
  HISTORY_PAGE_SIZE: 50,
}));
jest.mock('@/shared/services/networkStatus', () => ({ isOfflineNow: jest.fn(() => false) }));
// AYRI DOSYA olmasının sebebi bu blok: bayrak modül yüklenirken okunuyor, yani
// aynı dosyada hem açık hem kapalı hâli sınanamıyor (açık hâli
// chatBackfill.triggers.test.ts ve chatBackfill.test.ts'te).
jest.mock('@/shared/store/chatFlags', () => ({
  CHAT_PERSIST_ENABLED: false,
  CHAT_SQLITE_ENABLED: true,
  CHAT_DELTA_SYNC_ENABLED: true,
  CHAT_BACKFILL_ENABLED: false,
}));

import * as SQLite from 'expo-sqlite';
import chatService from '@/features/chat/chatService';
import { openChatDb, __resetChatDbForTests } from '@/features/chat/db/chatDb';
import { clear as clearMessageCache } from '@/features/chat/messageCache';
import {
  runBackfillRound,
  startBackfill,
  __resetBackfillForTests,
} from '@/features/chat/chatBackfill';
import { BACKFILL_BOOT_DELAY_MS } from '@/features/chat/backfillPolicy';

/**
 * `CHAT_BACKFILL_ENABLED` — chatFlags.ts'in OTA geri dönüşü olarak belgelediği
 * anahtar. Kapalıyken geçmiş sayfalama ucuna HİÇ istek gitmediğini pin'liyor.
 *
 * Kapsam konusunda dürüst olmak gerekiyor: iki kapı var ve ikisi AYNI şeyi
 * ispatlamıyor.
 *  • `startBackfill` kapısı — timer hiç kurulmuyor. Ayırt edici iddia
 *    "gecikme dolsa bile istek yok"; kapı olmasaydı tur ateşlenirdi.
 *  • `runBackfillRound` kapısı — TEKRARLI (defense-in-depth). Bugün tek
 *    üretim çağıranı `startBackfill` olduğu için bu satır olmadan da ağa
 *    istek gitmezdi; kazandırdığı şey, fonksiyon export edilmiş olduğu için
 *    ileride bayrağa bakmayı unutan bir çağıran eklenirse ağ tarafının yine
 *    kapalı kalması. Ayırt edici iddia `ran: false` — kapı olmasaydı tur
 *    gerçekten koşar ve `ran: true` dönerdi.
 *
 * Her iki testte de önce bir SOHBET satırı yazılıyor: boş bir veritabanında
 * "istek atılmadı" iddiası hiçbir şey ispatlamaz, çünkü bayrak açık olsa da
 * atılacak istek olmazdı.
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

beforeEach(() => {
  __resetChatDbForTests();
  __resetAllDatabases();
  clearMessageCache();
  openChatDb();
  __resetBackfillForTests();
  getMessageHistory.mockReset();
});

describe('bayrak kapalı', () => {
  it('runBackfillRound ran:false dönüyor ve hiç geçmiş isteği atmıyor', async () => {
    insertConversation('conv-1', 1_000);

    const result = await runBackfillRound(() => null);

    // Ayırt edici iddia: kapı olmasaydı hedef bulunur, tur koşar ve
    // `ran: true` dönerdi.
    expect(result.ran).toBe(false);
    expect(result.pages).toBe(0);
    expect(getMessageHistory).not.toHaveBeenCalled();
  });

  it('startBackfill no-op söker döndürüyor, gecikme dolsa bile tur koşmuyor', async () => {
    jest.useFakeTimers({ doNotFake: ['setImmediate'] });
    try {
      insertConversation('conv-1', 1_000);

      const stop = startBackfill({ getActiveConversationId: () => null });
      expect(typeof stop).toBe('function');

      // Ayırt edici kısım: timer'ı ilerletmek. Kapı olmasaydı tur tam burada
      // ateşlenirdi (bkz. chatBackfill.triggers.test.ts'teki açık-bayrak hâli).
      await jest.advanceTimersByTimeAsync(BACKFILL_BOOT_DELAY_MS);

      expect(getMessageHistory).not.toHaveBeenCalled();
      // Söker çağrılabilir olmalı — çağıran (stopChatMirror) bayrağa bakmıyor.
      expect(() => stop()).not.toThrow();
    } finally {
      jest.useRealTimers();
    }
  });
});
