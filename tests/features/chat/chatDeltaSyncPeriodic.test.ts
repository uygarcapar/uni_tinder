jest.mock('expo-sqlite');
jest.mock('react-native-mmkv');
jest.mock('@/features/chat/chatService', () => ({
  __esModule: true,
  default: { getChanges: jest.fn() },
  HISTORY_PAGE_SIZE: 50,
  CHANGES_PAGE_SIZE: 200,
}));
jest.mock('@/shared/store/chatFlags', () => ({
  CHAT_PERSIST_ENABLED: false,
  CHAT_SQLITE_ENABLED: true,
  CHAT_DELTA_SYNC_ENABLED: true,
}));

// jest.mock factory'leri hoist ediliyor: dışarıdaki değişkenlere ancak `mock`
// önekliyseler erişebiliyorlar. Desen chatDeltaSync.triggers.test.ts'ten.
const mockRealtimeHandlers: Record<string, ((...a: any[]) => void)[]> = {};
const mockHub = { connected: true };
jest.mock('@/features/chat/realtimeService', () => ({
  __esModule: true,
  default: {
    on: (event: string, cb: (...a: any[]) => void) => {
      (mockRealtimeHandlers[event] ??= []).push(cb);
      return () => {
        mockRealtimeHandlers[event] = (mockRealtimeHandlers[event] ?? []).filter((c) => c !== cb);
      };
    },
    isConnected: () => mockHub.connected,
  },
}));

const mockAppState: { handler: ((s: string) => void) | null; remove: jest.Mock } = {
  handler: null,
  remove: jest.fn(),
};
jest.mock('react-native', () => ({
  AppState: {
    addEventListener: (_e: string, cb: (s: string) => void) => {
      mockAppState.handler = cb;
      return { remove: mockAppState.remove };
    },
  },
}));

import * as SQLite from 'expo-sqlite';
import chatService from '@/features/chat/chatService';
import { openChatDb, __resetChatDbForTests } from '@/features/chat/db/chatDb';
import {
  startDeltaSync,
  __resetDeltaSyncForTests,
  PERIODIC_PULL_INTERVAL_MS,
  MIN_PULL_INTERVAL_MS,
} from '@/features/chat/chatDeltaSync';
import { clear as clearMessageCache } from '@/features/chat/messageCache';

/**
 * Foreground'da seyrek periyodik tazelik turu (Faz 6).
 *
 * Delta turu bugüne kadar yalnız hub 'connected' olayında koşuyordu. Hub
 * bağlı kalıp bir event kaçırırsa yeni bir 'connected' hiç gelmiyor ve ekran
 * arka plana atılıp geri dönene kadar bayat kalıyordu. Bu dosya o deliği
 * kapatan zamanlayıcıyı sınıyor — YENİ bir tur mantığı yok, yalnız `fire()`a
 * ek bir tetikleyici (bkz. chatDeltaSync.ts).
 */
const { __resetAllDatabases } = SQLite as unknown as { __resetAllDatabases: () => void };
const getChanges = (chatService as any).getChanges as jest.Mock;

const emitConnection = (state: string) =>
  (mockRealtimeHandlers['__connectionStateChanged'] ?? []).forEach((cb) => cb(state));

const flush = () => new Promise<void>((r) => setImmediate(r));

const deps = () => ({
  getActiveConversationId: () => null,
  onNeedsFullResync: jest.fn(),
});

beforeEach(() => {
  __resetChatDbForTests();
  __resetAllDatabases();
  __resetDeltaSyncForTests();
  clearMessageCache();
  openChatDb();
  getChanges.mockReset();
  getChanges.mockResolvedValue({ watermark: 'wm', hasMore: false });
  for (const k of Object.keys(mockRealtimeHandlers)) delete mockRealtimeHandlers[k];
  mockAppState.handler = null;
  mockAppState.remove.mockReset();
  jest.useFakeTimers({ doNotFake: ['setImmediate'] });
  jest.setSystemTime(new Date('2026-09-18T10:00:00Z'));
  mockHub.connected = true;
});

afterEach(() => jest.useRealTimers());

describe('sabit ilişkisi', () => {
  // Review Focus 3 — AYIRT EDİCİ: sabitin kendisi, davranışın ön koşulu. Periyot
  // throttle'dan kısa/eşit olsaydı her atış `fire()`ın kendi kısıtlayıcısına
  // çarpıp sessizce yutulurdu: görünürde çalışan, aslında hiçbir şey yapmayan
  // bir zamanlayıcı.
  it("PERIODIC_PULL_INTERVAL_MS, MIN_PULL_INTERVAL_MS'ten UZUN", () => {
    expect(PERIODIC_PULL_INTERVAL_MS).toBeGreaterThan(MIN_PULL_INTERVAL_MS);
  });
});

describe('periyodik tetik', () => {
  it('foreground + hub bağlıyken periyot dolunca tur koşuyor', async () => {
    startDeltaSync(deps());

    // İlk 'active' geçişi hem mevcut foreground-tetiğini (anlık) hem de
    // periyodik zamanlayıcıyı kuruyor.
    mockAppState.handler?.('active');
    await flush();
    expect(getChanges).toHaveBeenCalledTimes(1);

    // Ayırt edici kısım: periyodu ilerletmek. Zamanlayıcı kurulmasaydı bu
    // ileri saat hiçbir şey tetiklemezdi.
    await jest.advanceTimersByTimeAsync(PERIODIC_PULL_INTERVAL_MS);

    expect(getChanges).toHaveBeenCalledTimes(2);
  });

  it('hub kopukken periyot dolsa da tur koşmuyor', async () => {
    startDeltaSync(deps());

    mockAppState.handler?.('active');
    await flush();
    expect(getChanges).toHaveBeenCalledTimes(1);

    // Review Focus 4 — ayırt edici kısım: bağlantı burada kopuyor. Kapı
    // olmasaydı periyot yine ateşler ve çağrı sayısı artardı.
    mockHub.connected = false;
    await jest.advanceTimersByTimeAsync(PERIODIC_PULL_INTERVAL_MS);

    expect(getChanges).toHaveBeenCalledTimes(1);
  });

  it('arka plana geçince zamanlayıcı DURUYOR, öne dönünce yeniden kuruluyor', async () => {
    startDeltaSync(deps());

    mockAppState.handler?.('active');
    await flush();
    expect(getChanges).toHaveBeenCalledTimes(1);

    // Review Focus 1 — ayırt edici kısım: arka plana geçiş. Zamanlayıcı
    // durmasaydı aşağıdaki iki periyotluk ileri saat bir çağrı üretirdi.
    mockAppState.handler?.('background');
    await jest.advanceTimersByTimeAsync(PERIODIC_PULL_INTERVAL_MS * 2);
    expect(getChanges).toHaveBeenCalledTimes(1);

    // Öne dönüş: mevcut foreground-tetiği hemen bir tur daha açıyor (zaman
    // zaten MIN_PULL_INTERVAL_MS'i aştı) — bu, periyottan BAĞIMSIZ bir çağrı.
    mockAppState.handler?.('active');
    await flush();
    expect(getChanges).toHaveBeenCalledTimes(2);

    // Ayırt edici kısım burada: zamanlayıcının kendisi yeniden kurulmuş mu?
    // Kurulmasaydı bir periyot daha ilerletmek hiçbir şey üretmezdi.
    await jest.advanceTimersByTimeAsync(PERIODIC_PULL_INTERVAL_MS);
    expect(getChanges).toHaveBeenCalledTimes(3);
  });

  it('stop() zamanlayıcıyı temizliyor — sökümden sonra periyot boşa geçiyor', async () => {
    const stop = startDeltaSync(deps());

    mockAppState.handler?.('active');
    await flush();
    expect(getChanges).toHaveBeenCalledTimes(1);

    stop();

    // Review Focus 2 — ayırt edici kısım: söküm. Zamanlayıcı temizlenmeseydi
    // iki periyotluk ileri saat yine çağrı üretirdi (logout sonrası 401 riski).
    await jest.advanceTimersByTimeAsync(PERIODIC_PULL_INTERVAL_MS * 2);

    expect(getChanges).toHaveBeenCalledTimes(1);
  });
});
