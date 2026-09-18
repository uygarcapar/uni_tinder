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
// önekliyseler erişebiliyorlar.
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
import { startDeltaSync, __resetDeltaSyncForTests } from '@/features/chat/chatDeltaSync';
import { CHAT_ERROR_CODES } from '@/shared/constants/responseCodes';
import { clear as clearMessageCache } from '@/features/chat/messageCache';

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

describe('tetikleyiciler', () => {
  it('KURULUMDA çekmiyor — token henüz yerinde olmayabilir', async () => {
    // startDeltaSync store modülü yüklenirken çalışıyor: rehydrate bitmemiş.
    // Buradan atılan istek 401 ile oturum yollarını tetikleyebilirdi.
    startDeltaSync(deps());
    await flush();
    expect(getChanges).not.toHaveBeenCalled();
  });

  it('İLK bağlantı açılış turunu çekiyor — hub bağlıysa kimlik doğrulanmıştır', async () => {
    startDeltaSync(deps());
    await flush();

    emitConnection('connected');
    await flush();

    expect(getChanges).toHaveBeenCalledTimes(1);
  });

  it('yeniden bağlanmada çekiyor', async () => {
    startDeltaSync(deps());
    emitConnection('connected');
    await flush();
    jest.setSystemTime(new Date('2026-09-18T10:01:00Z'));

    emitConnection('disconnected');
    emitConnection('connected');
    await flush();

    expect(getChanges).toHaveBeenCalledTimes(2);
  });

  it('arka plandan dönüşte çekiyor (hub bağlıyken)', async () => {
    startDeltaSync(deps());
    emitConnection('connected');
    await flush();
    jest.setSystemTime(new Date('2026-09-18T10:01:00Z'));

    mockAppState.handler?.('active');
    await flush();

    expect(getChanges).toHaveBeenCalledTimes(2);
  });

  it('hub BAĞLI DEĞİLKEN foreground çekmiyor — kimlik belirsiz', async () => {
    startDeltaSync(deps());
    emitConnection('connected');
    await flush();
    jest.setSystemTime(new Date('2026-09-18T10:01:00Z'));

    mockHub.connected = false;
    mockAppState.handler?.('active');
    await flush();

    // Bağlantı birazdan kurulacaksa 'connected' zaten çekecek.
    expect(getChanges).toHaveBeenCalledTimes(1);
  });

  it('arka plana GEÇİŞTE çekmiyor', async () => {
    startDeltaSync(deps());
    emitConnection('connected');
    await flush();
    jest.setSystemTime(new Date('2026-09-18T10:01:00Z'));

    mockAppState.handler?.('background');
    await flush();

    expect(getChanges).toHaveBeenCalledTimes(1);
  });
});

describe('debounce', () => {
  it('10sn içinde ardışık tetikler TEK çekime iniyor', async () => {
    startDeltaSync(deps());

    // foreground + reconnect aynı saniyede sırayla gelebiliyor.
    emitConnection('connected');
    mockAppState.handler?.('active');
    emitConnection('disconnected');
    emitConnection('connected');
    await flush();

    expect(getChanges).toHaveBeenCalledTimes(1);
  });

  it('pencere geçince yeniden çekiyor', async () => {
    startDeltaSync(deps());
    emitConnection('connected');
    await flush();
    jest.setSystemTime(new Date('2026-09-18T10:00:11Z'));

    mockAppState.handler?.('active');
    await flush();

    expect(getChanges).toHaveBeenCalledTimes(2);
  });
});

describe('UT-6744 → tam senkron', () => {
  it('onNeedsFullResync çağrılıyor', async () => {
    const d = deps();
    getChanges.mockRejectedValueOnce({
      response: { status: 400, data: { code: CHAT_ERROR_CODES.INVALID_WATERMARK } },
    });

    startDeltaSync(d);
    emitConnection('connected');
    await flush();

    expect(d.onNeedsFullResync).toHaveBeenCalledTimes(1);
  });

  it('normal turda çağrılmıyor', async () => {
    const d = deps();
    startDeltaSync(d);
    emitConnection('connected');
    await flush();
    expect(d.onNeedsFullResync).not.toHaveBeenCalled();
  });
});

describe('teardown', () => {
  it('söküldükten sonra tetikleyiciler susuyor', async () => {
    const stop = startDeltaSync(deps());
    emitConnection('connected');
    await flush();
    stop();
    jest.setSystemTime(new Date('2026-09-18T10:01:00Z'));

    emitConnection('disconnected');
    emitConnection('connected');
    await flush();

    expect(getChanges).toHaveBeenCalledTimes(1);
    expect(mockAppState.remove).toHaveBeenCalled();
  });
});
