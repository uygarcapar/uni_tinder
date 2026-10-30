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
// store SAHTE: gerçek modül redux-persist + MMKV + tüm slice'ları yükler.
// dispatch'i izleyip chatSlice'ın ÜRETTİĞİ gerçek action'ları (reactionsChanged/
// messageEdited) görmek için chatSlice GERÇEK kalıyor, yalnız store sahte.
jest.mock('@/shared/store', () => ({
  __esModule: true,
  store: {
    dispatch: jest.fn(),
    getState: jest.fn(() => ({ auth: { user: { userId: 'me' } }, chat: { messagesByConv: {} } })),
  },
}));

import * as SQLite from 'expo-sqlite';
import { openChatDb, __resetChatDbForTests } from '@/features/chat/db/chatDb';
import { readPendingMutations, saveMessage } from '@/features/chat/chatRepository';
import { clear as clearMessageCache } from '@/features/chat/messageCache';
import chatService from '@/features/chat/chatService';
import { isOfflineNow } from '@/shared/services/networkStatus';
import { remainingNow } from '@/shared/services/rateLimitBudget';
import { showInfoToast } from '@/shared/services/toaster';
import { store } from '@/shared/store';
import { MUTATION_RATE_RESERVE } from '@/features/chat/pendingMutationPolicy';
import type { MessageDto } from '@/shared/types';
import type { SendState } from '@/features/chat/db/rows';
import {
  enqueueReaction,
  enqueueDelete,
  flushPendingMutations,
  __resetPendingMutationsForTests,
} from '@/features/chat/pendingMutations';

/**
 * Mutasyon kuyruğu TURU — reaksiyon/silme emirlerinin AĞA bir kez taşınması.
 *
 * Depo (Task 1, pendingMutationsRepo.test.ts) ve politika (Task 2,
 * pendingMutationPolicy.test.ts) ayrı dosyalarda saf/izole doğrulandı; burada
 * hepsi birlikte GERÇEK çalışıyor mu bakılıyor — SQLite gerçek (better-sqlite3),
 * chatService/store/network/toast sahte.
 */

const { __resetAllDatabases } = SQLite as unknown as { __resetAllDatabases: () => void };

const CONV = 'c1';

const msg = (id: string, over: Partial<MessageDto> = {}): MessageDto =>
  ({
    id,
    conversationId: CONV,
    senderId: 'me',
    content: `içerik ${id}`,
    contentType: 0,
    sentAt: '2026-10-29T10:00:00.000Z',
    ...over,
  }) as MessageDto;

/** `messages`'a gerçek bir satır yazar — `readMessageSendState` buna bakıyor. */
const insertMessage = (id: string, sendState: SendState = 'sent') => {
  saveMessage(msg(id), CONV, sendState);
};

/** Store'un döndüreceği mesaj listesini (reaksiyonlar dahil) ayarlar. */
function setStoreMessages(messages: any[]): void {
  (store.getState as jest.Mock).mockReturnValue({
    auth: { user: { userId: 'me' } },
    chat: { messagesByConv: { [CONV]: { messages } } },
  });
}

/** `dispatch` çağrılarından SON `reactionsChanged` payload'ının reaksiyon listesi. */
function lastReactionsDispatched(): any[] | undefined {
  const calls = (store.dispatch as jest.Mock).mock.calls;
  for (let i = calls.length - 1; i >= 0; i--) {
    const action = calls[i][0];
    if (action?.type === 'chat/reactionsChanged') return action.payload.reactions;
  }
  return undefined;
}

const addReaction = chatService.addReaction as jest.Mock;
const removeReaction = chatService.removeReaction as jest.Mock;
const deleteMessage = chatService.deleteMessage as jest.Mock;

beforeEach(() => {
  __resetChatDbForTests();
  __resetAllDatabases();
  clearMessageCache();
  openChatDb();
  __resetPendingMutationsForTests();
  addReaction.mockReset().mockResolvedValue([]);
  removeReaction.mockReset().mockResolvedValue([]);
  deleteMessage.mockReset().mockResolvedValue({});
  (isOfflineNow as jest.Mock).mockReturnValue(false);
  (remainingNow as jest.Mock).mockReturnValue(null);
  (showInfoToast as jest.Mock).mockReset();
  (store.dispatch as jest.Mock).mockReset();
  setStoreMessages([]);
});

describe('pendingMutations: tur', () => {
  // Review Focus 3
  it('gönderilmemiş mesajın mutasyonu AĞA ÇIKMIYOR ve satır diskte KALIYOR', async () => {
    insertMessage('cmid-1', 'pending');
    enqueueReaction({ messageId: 'cmid-1', conversationId: CONV, desired: '😀', serverBase: null });

    const r = await flushPendingMutations('test');

    expect(addReaction).not.toHaveBeenCalled();
    expect(r.done).toBe(0);
    // Ayırt edici: satır SİLİNMEDİ — mesaj gönderilince emir hâlâ uygulanacak.
    expect(readPendingMutations()).toHaveLength(1);
  });

  it('mesaj gönderildikten sonra aynı satır uygulanıyor', async () => {
    insertMessage('msg-1', 'pending');
    enqueueReaction({ messageId: 'msg-1', conversationId: CONV, desired: '😀', serverBase: null });

    // ilk turda pending, satır ağa çıkmıyor
    await flushPendingMutations('test');
    expect(addReaction).not.toHaveBeenCalled();

    // mesaj gönderildi, sonra ikinci tur (upsert aynı id'yi günceller)
    insertMessage('msg-1', 'sent');
    await flushPendingMutations('test');

    expect(addReaction).toHaveBeenCalledWith('msg-1', '😀');
    expect(readPendingMutations()).toHaveLength(0);
  });

  it('base varsa önce remove sonra add çağrılıyor', async () => {
    insertMessage('msg-1', 'sent');
    enqueueReaction({ messageId: 'msg-1', conversationId: CONV, desired: '❤️', serverBase: '😀' });

    await flushPendingMutations('test');

    expect(removeReaction).toHaveBeenCalledWith('msg-1', '😀');
    expect(addReaction).toHaveBeenCalledWith('msg-1', '❤️');
    // Sıra: remove ÖNCE add'den.
    const removeOrder = removeReaction.mock.invocationCallOrder[0];
    const addOrder = addReaction.mock.invocationCallOrder[0];
    expect(removeOrder).toBeLessThan(addOrder);
  });

  it('desired null iken yalnız remove çağrılıyor, add HİÇ çağrılmıyor', async () => {
    insertMessage('msg-1', 'sent');
    enqueueReaction({ messageId: 'msg-1', conversationId: CONV, desired: null, serverBase: '😀' });

    await flushPendingMutations('test');

    expect(removeReaction).toHaveBeenCalledWith('msg-1', '😀');
    expect(addReaction).not.toHaveBeenCalled();
  });

  it('sunucunun döndüğü liste kanonik hale geliyor', async () => {
    insertMessage('msg-1', 'sent');
    enqueueReaction({ messageId: 'msg-1', conversationId: CONV, desired: '😀', serverBase: null });
    addReaction.mockResolvedValue([{ emoji: '😀', count: 2, userIds: ['me', 'other'] }]);

    await flushPendingMutations('test');

    expect(store.dispatch).toHaveBeenCalledWith(
      expect.objectContaining({
        type: 'chat/reactionsChanged',
        payload: expect.objectContaining({
          reactions: [{ emoji: '😀', count: 2, userIds: ['me', 'other'] }],
        }),
      }),
    );
  });

  // Review Focus 4
  it('kalıcı ret: satır silinip tepki geri alınıyor VE sebep söyleniyor', async () => {
    insertMessage('msg-1', 'sent');
    enqueueReaction({ messageId: 'msg-1', conversationId: CONV, desired: '😀', serverBase: null });
    setStoreMessages([{ id: 'msg-1', conversationId: CONV, reactions: [{ emoji: '😀', count: 1, userIds: ['me'] }] }]);
    addReaction.mockRejectedValue({ response: { data: { errorCode: 'UT-6731' } } });

    const r = await flushPendingMutations('test');

    expect(r.rejected).toBe(1);
    expect(readPendingMutations()).toHaveLength(0); // ebediyen denenmiyor
    expect(showInfoToast).toHaveBeenCalledWith(expect.objectContaining({ variant: 'error' }));
    // Ayırt edici: geri alma gerçekten listeden ÇIKARIYOR.
    expect(lastReactionsDispatched()).toEqual([]);
  });

  it('ağ hatası: satır KALIYOR, attempts artıyor, backoff yazılıyor, toast YOK', async () => {
    insertMessage('msg-1', 'sent');
    enqueueReaction({ messageId: 'msg-1', conversationId: CONV, desired: '😀', serverBase: null });
    addReaction.mockRejectedValue(new Error('Network Error'));

    await flushPendingMutations('test');

    const [row] = readPendingMutations();
    expect(row.attempts).toBe(1);
    expect(row.next_eligible_at_ms).toBeGreaterThan(Date.now());
    expect(showInfoToast).not.toHaveBeenCalled();
  });

  it('backoff dolmamış satır atlanıyor', async () => {
    insertMessage('msg-1', 'sent');
    enqueueReaction({ messageId: 'msg-1', conversationId: CONV, desired: '😀', serverBase: null });
    addReaction.mockRejectedValue(new Error('Network Error'));

    // İlk tur: ağ hatası, backoff kurulur.
    await flushPendingMutations('test');
    expect(addReaction).toHaveBeenCalledTimes(1);
    const [afterFirst] = readPendingMutations();
    expect(afterFirst.next_eligible_at_ms).toBeGreaterThan(Date.now());

    // İkinci tur: backoff hâlâ gelecekte — satır ATLANIYOR, ikinci çağrı YOK.
    const r = await flushPendingMutations('test');
    expect(addReaction).toHaveBeenCalledTimes(1);
    expect(r.done + r.retried + r.rejected).toBe(0);
    expect(readPendingMutations()).toHaveLength(1);
  });

  it('silmede UT-6720 BAŞARI sayılıyor: satır siliniyor, geri alma YOK', async () => {
    insertMessage('msg-1', 'sent');
    enqueueDelete({ messageId: 'msg-1', conversationId: CONV, forEveryone: false });
    deleteMessage.mockRejectedValue({ response: { data: { errorCode: 'UT-6720' } } });

    const r = await flushPendingMutations('test');

    expect(r.done).toBe(1);
    expect(readPendingMutations()).toHaveLength(0);
    expect(store.dispatch).not.toHaveBeenCalledWith(
      expect.objectContaining({ type: 'chat/messageEdited' }),
    );
  });

  // Review Focus 5
  it('başarıdan sonra ikinci tur aynı emri TEKRAR göndermiyor', async () => {
    insertMessage('msg-1', 'sent');
    enqueueReaction({ messageId: 'msg-1', conversationId: CONV, desired: '😀', serverBase: null });

    await flushPendingMutations('test');
    await flushPendingMutations('test');

    expect(addReaction).toHaveBeenCalledTimes(1);
  });

  it('offline iken tur koşmuyor ve hiçbir satıra dokunmuyor', async () => {
    insertMessage('msg-1', 'sent');
    enqueueReaction({ messageId: 'msg-1', conversationId: CONV, desired: '😀', serverBase: null });
    (isOfflineNow as jest.Mock).mockReturnValue(true);

    const r = await flushPendingMutations('test');

    expect(r.ran).toBe(false);
    expect(addReaction).not.toHaveBeenCalled();
    expect(readPendingMutations()[0].attempts).toBe(0);
  });

  it('bütçe rezervin altındayken tur KISILIYOR, kalan satırlar diskte duruyor', async () => {
    insertMessage('msg-1', 'sent');
    insertMessage('msg-2', 'sent');
    enqueueReaction({ messageId: 'msg-1', conversationId: CONV, desired: '😀', serverBase: null });
    enqueueReaction({ messageId: 'msg-2', conversationId: CONV, desired: '😀', serverBase: null });
    (remainingNow as jest.Mock).mockReturnValue(MUTATION_RATE_RESERVE - 1);

    await flushPendingMutations('test');

    expect(addReaction).not.toHaveBeenCalled();
    expect(readPendingMutations()).toHaveLength(2);
  });

  it('MAX_OPS_PER_FLUSH tavanı aşılmıyor', async () => {
    for (let i = 0; i < 25; i++) {
      const id = `msg-${i}`;
      insertMessage(id, 'sent');
      enqueueReaction({ messageId: id, conversationId: CONV, desired: '😀', serverBase: null });
    }

    await flushPendingMutations('test');

    expect(addReaction).toHaveBeenCalledTimes(20);
    expect(readPendingMutations()).toHaveLength(5);
  });

  it('eşzamanlı iki flush çağrısı emri iki kez göndermiyor', async () => {
    insertMessage('msg-1', 'sent');
    enqueueReaction({ messageId: 'msg-1', conversationId: CONV, desired: '😀', serverBase: null });

    await Promise.all([flushPendingMutations('a'), flushPendingMutations('b')]);

    expect(addReaction).toHaveBeenCalledTimes(1);
  });

  it('tur başında yetim satırlar budanıyor', async () => {
    insertMessage('msg-1', 'sent');
    enqueueReaction({ messageId: 'msg-1', conversationId: CONV, desired: '😀', serverBase: null });
    // Mesajı olmayan bir satır: doğrudan enqueue ile (mesaj hiç yok).
    enqueueReaction({ messageId: 'msg-yok', conversationId: CONV, desired: '😀', serverBase: null });

    await flushPendingMutations('test');

    expect(readPendingMutations().map((r) => r.message_id)).toEqual([]);
  });
});
