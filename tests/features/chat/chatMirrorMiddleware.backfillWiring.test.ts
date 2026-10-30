jest.mock('expo-sqlite');
jest.mock('react-native-mmkv');
// Her ikisi de `startChatMirror`'ın SON iki satırı: gerçeklerini koşturmak bu
// dosyada hiçbir şey ispatlamaz (biri hub'a abone olur, diğeri timer kurar) —
// sorulan tek şey ÇAĞRILIYOR mu ve hangi bağımlılıkla.
jest.mock('@/features/chat/chatDeltaSync', () => ({
  __esModule: true,
  startDeltaSync: jest.fn(() => jest.fn()),
}));
jest.mock('@/features/chat/chatBackfill', () => ({
  __esModule: true,
  startBackfill: jest.fn(() => jest.fn()),
}));

import * as SQLite from 'expo-sqlite';
import { openChatDb, __resetChatDbForTests } from '@/features/chat/db/chatDb';
import {
  startChatMirror,
  stopChatMirror,
  __resetChatMirrorForTests,
} from '@/features/chat/chatMirrorMiddleware';
import { startBackfill } from '@/features/chat/chatBackfill';
import { bumpBackfillFailure, readBackfillTargets } from '@/features/chat/chatRepository';
import { BACKFILL_MAX_FAILURES } from '@/features/chat/backfillPolicy';
import { clear as clearMessageCache } from '@/features/chat/messageCache';

/**
 * `startChatMirror`'ın backfill'i BAĞLADIĞINI pin'liyor.
 *
 * Neden ayrı dosya: `chatMirrorMiddleware.test.ts`'teki tek `startChatMirror(`
 * çağrısı store'SUZ — o yol `if (!store) return` ile bu satırlardan ÖNCE
 * dönüyor, yani `startBackfill` çağrısı silinse o suite'te hiçbir test
 * kızarmıyordu. Burada store VERİLİYOR, çünkü ayırt edici olan tam o dal.
 */

const { __resetAllDatabases } = SQLite as unknown as { __resetAllDatabases: () => void };
const mockStartBackfill = startBackfill as jest.Mock;

const storeStub = (activeConversationId: string | null) => ({
  getState: () => ({ chat: { activeConversationId } }),
  dispatch: jest.fn(),
});

beforeEach(() => {
  __resetChatDbForTests();
  __resetAllDatabases();
  __resetChatMirrorForTests();
  clearMessageCache();
  openChatDb();
  mockStartBackfill.mockClear();
  mockStartBackfill.mockReturnValue(jest.fn());
});

describe('startChatMirror → backfill bağlantısı', () => {
  it('store verildiğinde startBackfill çağrılıyor ve aktif sohbeti STORE\'dan okuyor', () => {
    startChatMirror(storeStub('conv-acik'));

    expect(mockStartBackfill).toHaveBeenCalledTimes(1);
    // Bağımlılığın kendisi de ayırt edici: aktif sohbet turdan ELENİYOR
    // (`selectBackfillTargets`), yani sabit `null` geçen bir bağlama ekranın
    // açtığı sohbete backfill sayfası isterdi.
    const deps = mockStartBackfill.mock.calls[0][0];
    expect(deps.getActiveConversationId()).toBe('conv-acik');
  });

  /**
   * Review turu 4, Kritik — RAFI SÖKEN YOL. Bu testten önce hiç yoktu:
   * `backfillPolicy.test.ts` ve `chatBackfill.test.ts` rafın KURULMASINI ve
   * başarılı sayfada sıfırlanmasını pinliyordu, ama rafa kalkmış bir sohbet
   * `readBackfillTargets`ın WHERE'inde ELENDİĞİ için bir daha HİÇ denenmiyor,
   * dolayısıyla o "başarılı sayfa" hiç gerçekleşemiyordu — raf kurulumun
   * ömrü boyunca kalıyordu ve arama o sohbetin mesajları için "yok" diyordu.
   */
  it('AÇILIŞ, rafa kalkmış sohbeti geri alıyor (hata sayacı sıfırlanıyor)', () => {
    openChatDb().run(
      `INSERT INTO conversations (conversation_id, partner_user_id, last_message_at_ms)
       VALUES (?, ?, ?)`,
      ['conv-rafa', 'partner-1', 1_000],
    );
    for (let i = 0; i < BACKFILL_MAX_FAILURES; i += 1) bumpBackfillFailure('conv-rafa');
    // Rafa kalktı: hedef listesinde YOK (bu satır olmadan testin ikinci
    // yarısı hiçbir şey ispatlamazdı).
    expect(readBackfillTargets(10)).toEqual([]);

    // YENİ AÇILIŞ.
    startChatMirror(storeStub(null));

    expect(readBackfillTargets(10)).toEqual([
      { conversationId: 'conv-rafa', cursor: null, failures: 0 },
    ]);
  });

  it('stopChatMirror söken fonksiyonu çağırıyor — bekleyen tur iptal ediliyor', () => {
    const teardown = jest.fn();
    mockStartBackfill.mockReturnValue(teardown);

    startChatMirror(storeStub(null));
    expect(teardown).not.toHaveBeenCalled();

    stopChatMirror();

    expect(teardown).toHaveBeenCalledTimes(1);
  });
});
