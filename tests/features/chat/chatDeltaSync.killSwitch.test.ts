jest.mock('expo-sqlite');
jest.mock('react-native-mmkv');
jest.mock('@/features/chat/chatService', () => ({
  __esModule: true,
  default: { getChanges: jest.fn() },
  HISTORY_PAGE_SIZE: 50,
  CHANGES_PAGE_SIZE: 200,
}));
// AYRI DOSYA olmasının sebebi bu blok: bayrak modül yüklenirken okunuyor, yani
// aynı dosyada hem açık hem kapalı hâli sınanamıyor.
jest.mock('@/shared/store/chatFlags', () => ({
  CHAT_PERSIST_ENABLED: false,
  CHAT_SQLITE_ENABLED: true,
  CHAT_DELTA_SYNC_ENABLED: false,
}));

// Faz 6 periyodik tetiğinin "bayrak kapalı" hâli de BURADA sınanıyor —
// aynı modül-yükleme kısıtı: `CHAT_DELTA_SYNC_ENABLED` bir kez okunuyor, aynı
// dosyada açık/kapalı hâl bir arada test edilemiyor.
const mockAppState: { addEventListener: jest.Mock } = {
  addEventListener: jest.fn(() => ({ remove: jest.fn() })),
};
jest.mock('react-native', () => ({
  AppState: { addEventListener: (...args: unknown[]) => mockAppState.addEventListener(...args) },
}));
jest.mock('@/features/chat/realtimeService', () => ({
  __esModule: true,
  default: { on: jest.fn(() => () => {}), isConnected: () => true },
}));

import * as SQLite from 'expo-sqlite';
import chatService from '@/features/chat/chatService';
import { openChatDb, __resetChatDbForTests } from '@/features/chat/db/chatDb';
import {
  pullChanges,
  pullBeforeSend,
  startDeltaSync,
  __resetDeltaSyncForTests,
} from '@/features/chat/chatDeltaSync';
import { clear as clearMessageCache } from '@/features/chat/messageCache';

/**
 * `CHAT_DELTA_SYNC_ENABLED` — chatFlags.ts'in GÜVENLİ OTA GERİ DÖNÜŞ olarak
 * belgelediği anahtar. Kapalıyken `/api/messages/changes`e HİÇ istek
 * gitmediğini pin'liyor.
 *
 * Bu dosyanın kapsamı hakkında dürüst olmak gerekiyor: istek atılmaması
 * `pullBeforeSend`e kapı eklenmeden ÖNCE de doğruydu, çünkü asıl kapı
 * `run()`ın ilk satırında — yani ağ tarafı hiçbir zaman açık kalmadı.
 * `pullBeforeSend`e eklenen kapının kazandırdığı şey farklı ve daha
 * mütevazı: bayrak kapalıyken artık boşa bir tur AÇILMIYOR (promise +
 * `lastPullAt` ilerletmesi) ve kill-switch `pullBeforeSend`i okuyan birinin
 * başka bir fonksiyonun gövdesine gitmesine gerek kalmadan YERELDE görünür
 * oluyor. Ayırt edici iddia `result === null`; `getChanges` iddiası
 * bayrağın ağ tarafını gerçekten kapattığının regresyon koruması.
 */
const { __resetAllDatabases } = SQLite as unknown as { __resetAllDatabases: () => void };
const getChanges = (chatService as any).getChanges as jest.Mock;

beforeEach(() => {
  __resetChatDbForTests();
  __resetAllDatabases();
  __resetDeltaSyncForTests();
  clearMessageCache();
  openChatDb();
  getChanges.mockReset();
  mockAppState.addEventListener.mockClear();
});

describe('bayrak kapalı', () => {
  it('pullBeforeSend tur AÇMIYOR ve hiç /changes isteği atmıyor', async () => {
    const result = await pullBeforeSend();

    // Ayırt edici iddia: kapı eklenmeden önce burası `ran: false` taşıyan bir
    // PullResult döndürüyordu, yani boşa bir tur açılmıştı.
    expect(result).toBeNull();
    expect(getChanges).not.toHaveBeenCalled();
  });

  it('uçuşta tur varsa onu döndürüyor — bekleme sözleşmesi bozulmuyor', async () => {
    // Bayrak kapalıyken `pullChanges` ağa çıkmıyor ama uçuş kaydı yine kuruluyor
    // (run() bayrağı kendi içinde kontrol ediyor). `pullBeforeSend`in "varsa
    // bekle" sözleşmesi bayraktan BAĞIMSIZ: kapılanan şey tur AÇMAK.
    const inFlight = pullChanges();

    expect(pullBeforeSend()).toBe(inFlight);
    await inFlight;
    expect(getChanges).not.toHaveBeenCalled();
  });

  it('startDeltaSync no-op söker döndürüyor (mevcut davranış)', () => {
    expect(typeof startDeltaSync({ getActiveConversationId: () => null, onNeedsFullResync: () => {} })).toBe(
      'function',
    );
    expect(getChanges).not.toHaveBeenCalled();
  });

  // Review Focus 5 — kapı `startDeltaSync`in ilk satırında, periyodik
  // zamanlayıcının kurulumundan ÖNCE. Ayırt edici iddia `AppState` aboneliğinin
  // HİÇ açılmaması: kapı olmasaydı `AppState.addEventListener` çağrılır ve
  // zamanlayıcı kurulurdu — bayrak kapalıyken bile arka planda tur koşardı.
  it('bayrak kapalıyken zamanlayıcı HİÇ kurulmuyor — AppState aboneliği açılmıyor', () => {
    startDeltaSync({ getActiveConversationId: () => null, onNeedsFullResync: () => {} });

    expect(mockAppState.addEventListener).not.toHaveBeenCalled();
  });
});
