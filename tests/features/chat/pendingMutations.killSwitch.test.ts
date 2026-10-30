jest.mock('expo-sqlite');
jest.mock('react-native-mmkv');

jest.mock('@/features/chat/chatService', () => ({
  __esModule: true,
  default: {
    addReaction: jest.fn(() => Promise.resolve([])),
    removeReaction: jest.fn(() => Promise.resolve([])),
    deleteMessage: jest.fn(() => Promise.resolve({})),
  },
}));
jest.mock('@/shared/services/networkStatus', () => ({ isOfflineNow: jest.fn(() => false) }));
jest.mock('@/shared/services/rateLimitBudget', () => ({ remainingNow: jest.fn(() => null) }));
jest.mock('@/shared/services/toaster', () => ({ showInfoToast: jest.fn() }));
jest.mock('@/shared/store', () => ({
  __esModule: true,
  store: {
    dispatch: jest.fn(),
    getState: jest.fn(() => ({ auth: { user: { userId: 'me' } }, chat: { messagesByConv: {} } })),
  },
}));
// AYRI DOSYA olmasının sebebi bu blok: bayrak modül yüklenirken okunuyor, yani
// aynı dosyada hem açık hem kapalı hâli sınanamıyor (açık hâli pendingMutations.test.ts'te).
jest.mock('@/shared/store/chatFlags', () => ({
  CHAT_PERSIST_ENABLED: false,
  CHAT_SQLITE_ENABLED: true,
  CHAT_DELTA_SYNC_ENABLED: true,
  CHAT_BACKFILL_ENABLED: true,
  CHAT_MUTATION_QUEUE_ENABLED: false,
}));

import * as SQLite from 'expo-sqlite';
import { openChatDb, __resetChatDbForTests } from '@/features/chat/db/chatDb';
import { readPendingMutations, saveMessage, upsertPendingMutation } from '@/features/chat/chatRepository';
import { clear as clearMessageCache } from '@/features/chat/messageCache';
import chatService from '@/features/chat/chatService';
import {
  flushPendingMutations,
  __resetPendingMutationsForTests,
} from '@/features/chat/pendingMutations';
import type { PendingMutationRow } from '@/features/chat/db/rows';
import type { MessageDto } from '@/shared/types';
import type { SendState } from '@/features/chat/db/rows';

/**
 * `CHAT_MUTATION_QUEUE_ENABLED` — bu kapı turun İÇİNDE, `flushPendingMutations`'ın
 * başında. AppNavigator'daki dört tetik (boot/online/reconnect/foreground) bu
 * fonksiyonu KOŞULSUZ çağırıyor, bayrağa bakmıyor. Bugün ağ tarafını kapalı
 * tutan şey bu satır DEĞİL, Task 4'ün ÇAĞRI NOKTASI kapısı (ChatScreen'in
 * handler'ları): bayrak kapalıyken kuyruğa hiç satır YAZILMIYOR, yani dört
 * tetik her çalıştığında boş bir kuyruğu tur'a sokuyor — atılacak istek
 * zaten yok. Bu ikinci kapı o yüzden TEKRARLIDIR. Kazandırdığı şey, ileride
 * ChatScreen'in kapısından geçmeyen bir enqueue yolu (ya da bayrağa bakmayı
 * unutan başka bir çağıran) eklenirse ağ tarafının yine burada kapanmış
 * olması (bkz. chatBackfill.ts'teki `runBackfillRound` kapısı, aynı
 * gerekçe).
 *
 * Boş kuyrukta "istek atılmadı" iddiası hiçbir şey ispatlamaz — bayrak açık
 * olsa da atılacak istek olmazdı. Bu yüzden önce bir satır yazılıyor ve
 * ayrıca o satırın KORUNDUĞU (silinmediği) de doğrulanıyor: bayrağı kapatmak
 * veri kaybettirmemeli. Ama KORUNMAK ≠ uygulanmak: kapı draining'den ÖNCE
 * döndüğü için o satırlar MAHSUR kalır (ne sunucuya gider ne ekranda geri
 * alınır) — bkz. chatFlags.ts'teki not.
 */

const { __resetAllDatabases } = SQLite as unknown as { __resetAllDatabases: () => void };
const addReaction = chatService.addReaction as jest.Mock;

const CONV = 'conv-1';

const msg = (id: string): MessageDto =>
  ({
    id,
    conversationId: CONV,
    senderId: 'me',
    content: `içerik ${id}`,
    contentType: 0,
    sentAt: '2026-10-29T10:00:00.000Z',
  }) as MessageDto;

const insertMessage = (id: string, sendState: SendState = 'sent') => {
  saveMessage(msg(id), CONV, sendState);
};

const row = (over: Partial<PendingMutationRow> = {}): PendingMutationRow => ({
  message_id: 'msg-1',
  kind: 'reaction',
  conversation_id: CONV,
  payload_json: '{"desired":"😀","base":null}',
  attempts: 0,
  first_seen_at_ms: 1_000,
  next_eligible_at_ms: 0,
  last_error: null,
  ...over,
});

beforeEach(() => {
  __resetChatDbForTests();
  __resetAllDatabases();
  clearMessageCache();
  openChatDb();
  __resetPendingMutationsForTests();
  addReaction.mockReset().mockResolvedValue([]);
});

describe('bayrak kapalı', () => {
  it('bayrak kapalıyken flushPendingMutations ran:false ve hiçbir uca istek gitmiyor', async () => {
    insertMessage('msg-1', 'sent');
    upsertPendingMutation(row({ message_id: 'msg-1' })); // boş kuyrukta iddia hiçbir şey ispatlamaz

    const r = await flushPendingMutations('test');

    // Ayırt edici iddia: kapı olmasaydı tur gerçekten koşar, `addReaction`
    // çağrılır ve `ran: true` dönerdi.
    expect(r.ran).toBe(false);
    expect(addReaction).not.toHaveBeenCalled();
    expect(readPendingMutations()).toHaveLength(1); // satır KORUNUYOR — geri almak veri kaybettirmiyor
  });
});
