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

  it('stopChatMirror söken fonksiyonu çağırıyor — bekleyen tur iptal ediliyor', () => {
    const teardown = jest.fn();
    mockStartBackfill.mockReturnValue(teardown);

    startChatMirror(storeStub(null));
    expect(teardown).not.toHaveBeenCalled();

    stopChatMirror();

    expect(teardown).toHaveBeenCalledTimes(1);
  });
});
