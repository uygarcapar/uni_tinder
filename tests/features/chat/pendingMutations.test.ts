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
import * as chatRepo from '@/features/chat/chatRepository';
import { readPendingMutations, saveMessage, upsertPendingMutation } from '@/features/chat/chatRepository';
import { clear as clearMessageCache } from '@/features/chat/messageCache';
import chatService from '@/features/chat/chatService';
import { isOfflineNow } from '@/shared/services/networkStatus';
import { remainingNow } from '@/shared/services/rateLimitBudget';
import { showInfoToast } from '@/shared/services/toaster';
import { store } from '@/shared/store';
import {
  MUTATION_MAX_AGE_MS,
  MUTATION_MAX_ATTEMPTS,
  MUTATION_RATE_RESERVE,
} from '@/features/chat/pendingMutationPolicy';
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

  // Review Focus 3 (düzeltilmiş): gerçek senaryo optimistik TEMP id'den
  // sunucu id'sine REKEY'i de kapsıyor — `MessageActionSheet`'in gönderim
  // durumu gate'i yok, yani kullanıcı mesaj hâlâ `pending`ken (temp id)
  // reaksiyon verebiliyor. Önceki taslak `insertMessage('msg-1','sent')`
  // (id-koruyan upsert) kullanıyordu ve bu, ack'in id'yi DEĞİŞTİRDİĞİ gerçek
  // yolu hiç test ETMİYORDU — `upsertMessage`'daki rekey satırı silinse bile
  // bu taslak yeşil kalırdı. Şimdi id değişiyor; `chatRepository.upsertMessage`
  // `pending_mutations.message_id`'yi REKEY ETMEZSE bu test KIRMIZI olur.
  it('mesaj gönderildikten sonra aynı satır uygulanıyor (temp id → sunucu id rekey)', async () => {
    const cmid = 'cmid-1';
    saveMessage(msg('temp-cmid-1', { clientMessageId: cmid }), CONV, 'pending');
    enqueueReaction({ messageId: 'temp-cmid-1', conversationId: CONV, desired: '😀', serverBase: null });

    // ilk turda pending, satır ağa çıkmıyor
    await flushPendingMutations('test');
    expect(addReaction).not.toHaveBeenCalled();

    // ACK: sunucu gerçek id ile geldi — upsertMessage id'yi (ve pending_mutations
    // satırını) REKEY eder.
    saveMessage(msg('msg-1', { clientMessageId: cmid }), CONV, 'sent');
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
    expect(row.last_error).toBe('Network Error');
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

  // ── Review round 1 fixes ────────────────────────────────────────────────

  describe('enqueue* sözleşmesi', () => {
    it('yeni emir attempts/next_eligible_at_ms SIFIRLAR, first_seen_at_ms KORUR', () => {
      insertMessage('msg-1', 'sent');
      enqueueReaction({ messageId: 'msg-1', conversationId: CONV, desired: '😀', serverBase: null });
      const [firstRow] = readPendingMutations();
      const originalFirstSeen = firstRow.first_seen_at_ms;

      // Satırı eski bir backoff'a sahipmiş gibi işaretle (başarısız bir
      // turdan kalmış gibi) — gerçek dünyada `run()`'ın 'retry' dalı yazar.
      upsertPendingMutation({
        ...firstRow,
        attempts: 3,
        next_eligible_at_ms: Date.now() + 60_000,
        last_error: 'önceki hata',
      });

      // Kullanıcı YENİ bir emoji seçti — yeni niyet eski backoff'u miras
      // ALMAMALI, ama satırın yaşı (first_seen_at_ms) korunmalı.
      enqueueReaction({ messageId: 'msg-1', conversationId: CONV, desired: '❤️', serverBase: null });

      const [row] = readPendingMutations();
      expect(row.attempts).toBe(0);
      expect(row.next_eligible_at_ms).toBe(0);
      expect(row.first_seen_at_ms).toBe(originalFirstSeen);
    });

    it('enqueueDelete de aynı kuralı izliyor: attempts SIFIRLANIR, first_seen_at_ms KORUNUR', () => {
      insertMessage('msg-1', 'sent');
      enqueueDelete({ messageId: 'msg-1', conversationId: CONV, forEveryone: false });
      const [firstRow] = readPendingMutations();
      const originalFirstSeen = firstRow.first_seen_at_ms;

      upsertPendingMutation({ ...firstRow, attempts: 2, next_eligible_at_ms: Date.now() + 30_000 });
      enqueueDelete({ messageId: 'msg-1', conversationId: CONV, forEveryone: true });

      const [row] = readPendingMutations();
      expect(row.attempts).toBe(0);
      expect(row.next_eligible_at_ms).toBe(0);
      expect(row.first_seen_at_ms).toBe(originalFirstSeen);
    });
  });

  describe('geri alma — Important 1/2 (reviewer düzeltmeleri)', () => {
    it('mesaj Redux\'ta YÜKLÜ DEĞİLKEN kalıcı ret, reactionsChanged HİÇ dispatch ETMİYOR', async () => {
      // Bütçe/diğer testlerden farklı olarak store BOŞ bırakılıyor (beforeEach
      // zaten setStoreMessages([]) yapıyor) — bucket yok, findMessage null döner.
      insertMessage('msg-1', 'sent');
      enqueueReaction({ messageId: 'msg-1', conversationId: CONV, desired: '😀', serverBase: null });
      addReaction.mockRejectedValue({ response: { data: { errorCode: 'UT-6731' } } });

      const r = await flushPendingMutations('test');

      expect(r.rejected).toBe(1);
      // Ayırt edici: eski davranış boş bir `prev`den türetilmiş `reactions: []`
      // dispatch ederdi — mirror bunu KOŞULSUZ yazar ve diskteki (başka
      // kullanıcılara ait olabilecek) TÜM reaksiyonları silerdi. Düzeltme
      // sonrası bucket yokken dispatch HİÇ yapılmıyor.
      expect(store.dispatch).not.toHaveBeenCalledWith(
        expect.objectContaining({ type: 'chat/reactionsChanged' }),
      );
    });

    it('silmede kalıcı ret VE mesaj Redux\'ta yüklüyken, TAM mesaj nesnesiyle messageEdited dispatch ediliyor', async () => {
      insertMessage('msg-1', 'sent');
      enqueueDelete({ messageId: 'msg-1', conversationId: CONV, forEveryone: false });
      const loaded = {
        id: 'msg-1',
        conversationId: CONV,
        senderId: 'me',
        content: 'merhaba',
        contentType: 0,
        sentAt: '2026-10-29T10:00:00.000Z',
        deletedAt: '2026-10-29T10:05:00.000Z',
        deletedForEveryone: false,
      };
      setStoreMessages([loaded]);
      deleteMessage.mockRejectedValue({ response: { data: { errorCode: 'UT-6725' } } }); // DELETE_SYSTEM → actionRejected

      await flushPendingMutations('test');

      // Ayırt edici: eksik alanlı (yalnız id/conversationId/bayraklar) bir
      // payload DEĞİL — mirror'ın `saveMessage`'ı (tüm kolon upsert'i,
      // `sent_at` NOT NULL dahil) bunu kabul edebilsin diye TÜM alanlar
      // (content, senderId, sentAt...) korunuyor, yalnız iki bayrak eziliyor.
      expect(store.dispatch).toHaveBeenCalledWith(
        expect.objectContaining({
          type: 'chat/messageEdited',
          payload: expect.objectContaining({
            id: 'msg-1',
            content: 'merhaba',
            senderId: 'me',
            sentAt: '2026-10-29T10:00:00.000Z',
            deletedAt: null,
            deletedForEveryone: false,
          }),
        }),
      );
    });

    it('silmede kalıcı ret VE mesaj Redux\'ta YÜKLÜ DEĞİLKEN, messageEdited HİÇ dispatch EDİLMİYOR', async () => {
      insertMessage('msg-1', 'sent');
      enqueueDelete({ messageId: 'msg-1', conversationId: CONV, forEveryone: false });
      deleteMessage.mockRejectedValue({ response: { data: { errorCode: 'UT-6725' } } });

      await flushPendingMutations('test');

      expect(store.dispatch).not.toHaveBeenCalledWith(
        expect.objectContaining({ type: 'chat/messageEdited' }),
      );
    });

    it('kalıcı ret: remove BAŞARMIŞSA base GERİ KONMUYOR (minör 6) — sunucuda artık yok', async () => {
      insertMessage('msg-1', 'sent');
      enqueueReaction({ messageId: 'msg-1', conversationId: CONV, desired: '❤️', serverBase: '😀' });
      setStoreMessages([
        { id: 'msg-1', conversationId: CONV, reactions: [{ emoji: '😀', count: 2, userIds: ['me', 'other'] }] },
      ]);
      removeReaction.mockResolvedValue([{ emoji: '😀', count: 1, userIds: ['other'] }]); // GEÇTİ
      addReaction.mockRejectedValue({ response: { data: { errorCode: 'UT-6731' } } }); // kalıcı ret

      await flushPendingMutations('test');

      // Ayırt edici: eski kod `base`i ('😀') yerel listeye GERİ EKLİYORDU —
      // oysa remove sunucuda GEÇMİŞTİ, yani yerel durum sunucunun bilmediği
      // bir reaksiyonu iddia ediyordu. Doğru sonuç: yalnız benim payım silinir
      // (count 2→1, userIds→['other']), base geri KONMAZ.
      expect(lastReactionsDispatched()).toEqual([{ emoji: '😀', count: 1, userIds: ['other'] }]);
    });

    it('kalıcı ret remove\'un KENDİSİNDEN gelirse base GERİ KONUYOR — var olan chip\'e ekleniyor', async () => {
      insertMessage('msg-1', 'sent');
      enqueueReaction({ messageId: 'msg-1', conversationId: CONV, desired: '❤️', serverBase: '😀' });
      setStoreMessages([
        { id: 'msg-1', conversationId: CONV, reactions: [{ emoji: '😀', count: 2, userIds: ['me', 'other'] }] },
      ]);
      // Remove HİÇ geçmedi → base sunucuda DURUYOR, geri konması doğru.
      removeReaction.mockRejectedValue({ response: { data: { errorCode: 'UT-6740' } } });

      await flushPendingMutations('test');

      expect(addReaction).not.toHaveBeenCalled();
      // base ('😀') var olan chip'e eklenir (increment dalı), YENİ chip AÇILMAZ.
      expect(lastReactionsDispatched()).toEqual([{ emoji: '😀', count: 2, userIds: ['other', 'me'] }]);
    });

    it('kalıcı ret remove\'dan gelir ve o emojiye yalnız BEN basmışsam, strip sonrası YENİ chip AÇILIYOR', async () => {
      insertMessage('msg-1', 'sent');
      enqueueReaction({ messageId: 'msg-1', conversationId: CONV, desired: '❤️', serverBase: '😀' });
      setStoreMessages([
        { id: 'msg-1', conversationId: CONV, reactions: [{ emoji: '😀', count: 1, userIds: ['me'] }] },
      ]);
      removeReaction.mockRejectedValue({ response: { data: { errorCode: 'UT-6740' } } });

      await flushPendingMutations('test');

      // strip sonrası liste BOŞ (count 0 → filtrelendi) — base'in restore'u
      // "var olana ekle" dalını DEĞİL, "yeni chip ekle" dalını kullanmak
      // zorunda.
      expect(lastReactionsDispatched()).toEqual([{ emoji: '😀', count: 1, userIds: ['me'] }]);
    });

    // Minör 7
    it('mesaj YÜKLÜ DEĞİLKEN kalıcı ret TOAST GÖSTERMİYOR — referansı olmayan hata metni yok', async () => {
      insertMessage('msg-1', 'sent');
      enqueueReaction({ messageId: 'msg-1', conversationId: CONV, desired: '😀', serverBase: null });
      addReaction.mockRejectedValue({ response: { data: { errorCode: 'UT-6731' } } });

      const r = await flushPendingMutations('test');

      // Ayırt edici: geri alma tasarımla no-op (bucket yok), yani ekranda da
      // diskte de hiçbir şey değişmiyor — toast da atılmamalı. Satır yine
      // silinmiş olmalı (kalıcı ret).
      expect(r.rejected).toBe(1);
      expect(showInfoToast).not.toHaveBeenCalled();
      expect(readPendingMutations()).toHaveLength(0);
    });
  });

  /**
   * KRİTİK 1 — tur UÇARKEN verilen yeni niyet.
   *
   * Tur satırı okuyup ağı bekliyor; o pencerede kullanıcı aynı mesaja ikinci
   * bir emoji seçiyor (`enqueue*` PK üzerinden satırı EZİYOR). Eski kod her iki
   * sonuç dalında da BAYAT anlık görüntüyle yazıyordu:
   *   • done   → anahtarla koşulsuz DELETE, yeni yükü yok ederdi
   *   • retry  → tam upsert, eski yükü geri yazıp üstüne backoff bindirirdi
   * Üstüne, eşzamanlı `flushPendingMutations` uçuştaki tura KATILDIĞI için
   * hayatta kalan niyet için hiç tur kalmıyordu.
   */
  describe('uçuştaki tur ile yarışan yeni niyet (Kritik 1)', () => {
    /** `addReaction`ın ilk çağrısını ASKIDA bırakır; çözümü/ret'i test verir. */
    function suspendFirstAddReaction(): { resolve: (v: any) => void; reject: (e: any) => void } {
      let resolve!: (v: any) => void;
      let reject!: (e: any) => void;
      addReaction.mockImplementationOnce(
        () =>
          new Promise((res, rej) => {
            resolve = res;
            reject = rej;
          }),
      );
      return {
        resolve: (v) => resolve(v),
        reject: (e) => reject(e),
      };
    }

    it('done dalı: bekleme sırasında gelen emir diskte KALIYOR ve AYNI flush içinde gönderiliyor', async () => {
      insertMessage('msg-1', 'sent');
      enqueueReaction({ messageId: 'msg-1', conversationId: CONV, desired: '😀', serverBase: null });
      const first = suspendFirstAddReaction();

      const flush = flushPendingMutations('test');
      // Tur 😀 ile ağda askıda. Kullanıcı ikinci emojiyi seçiyor.
      enqueueReaction({ messageId: 'msg-1', conversationId: CONV, desired: '❤️', serverBase: null });
      first.resolve([]);
      await flush;

      // Ayırt edici: eski kod `deletePendingMutation(msg-1, reaction)` ile ❤️
      // satırını SİLİYOR, ikinci çağrı HİÇ yapılmıyordu (kuyruk boş, ekranda
      // sunucunun kanonikleştirdiği 😀 kalıyordu).
      expect(addReaction.mock.calls).toEqual([
        ['msg-1', '😀'],
        ['msg-1', '❤️'],
      ]);
      expect(readPendingMutations()).toHaveLength(0);
    });

    it('retry dalı: bekleme sırasında gelen emir eski yükle VE eski backoff\'la EZİLMİYOR', async () => {
      insertMessage('msg-1', 'sent');
      enqueueReaction({ messageId: 'msg-1', conversationId: CONV, desired: '😀', serverBase: null });
      const first = suspendFirstAddReaction();

      const flush = flushPendingMutations('test');
      enqueueReaction({ messageId: 'msg-1', conversationId: CONV, desired: '❤️', serverBase: null });
      // Takip turunu BİLEREK kısıyoruz (bütçe rezervin altına indi): böylece
      // diskte kalan satırın hâli ölçülebiliyor — yeni niyetin kendisi mi
      // yoksa turun geri yazdığı bayat kopya mı?
      (remainingNow as jest.Mock).mockReturnValue(MUTATION_RATE_RESERVE - 1);
      first.reject(new Error('Network Error'));
      await flush;

      const [row] = readPendingMutations();
      // Ayırt edici: eski kod payload_json'ı 😀'ya geri çevirip attempts=1 ve
      // ~4sn'lik bir backoff yazıyordu — kullanıcının ekranda gördüğü ❤️
      // niyeti hem diskten hem ağdan siliniyordu.
      expect(JSON.parse(row.payload_json)).toEqual({ desired: '❤️', base: null });
      expect(row.attempts).toBe(0);
      expect(row.next_eligible_at_ms).toBe(0);
      expect(row.last_error).toBeNull();
    });

    it('uçuştaki tura KATILAN çağıran da kendi niyetinin gönderildiği turu görüyor', async () => {
      insertMessage('msg-1', 'sent');
      enqueueReaction({ messageId: 'msg-1', conversationId: CONV, desired: '😀', serverBase: null });
      const first = suspendFirstAddReaction();

      const flush = flushPendingMutations('a');
      // ChatScreen'in ikinci dokunuşta yaptığının aynısı: enqueue + flush.
      // İkinci flush uçuştaki tura KATILIR (inFlight döner) — eski kodda bu,
      // yeni niyet için hiç tur koşulmaması demekti.
      enqueueReaction({ messageId: 'msg-1', conversationId: CONV, desired: '❤️', serverBase: null });
      const joined = flushPendingMutations('b');
      first.resolve([]);
      await Promise.all([flush, joined]);

      expect(addReaction).toHaveBeenCalledWith('msg-1', '❤️');
      expect(readPendingMutations()).toHaveLength(0);
    });

    it('zincir TAVANLI: her turda yeni emir gelse bile flush sonsuza dek koşmuyor', async () => {
      insertMessage('msg-1', 'sent');
      enqueueReaction({ messageId: 'msg-1', conversationId: CONV, desired: '😀', serverBase: null });
      // Her gönderim, gönderim ANINDA yeni bir niyet yazıyor → `dirty` her tur
      // sonunda yine kalkmış. Tavan olmasaydı bu döngü hiç bitmezdi.
      addReaction.mockImplementation(async (_id: string, emoji: string) => {
        enqueueReaction({
          messageId: 'msg-1',
          conversationId: CONV,
          desired: `${emoji}+`,
          serverBase: null,
        });
        return [];
      });

      await flushPendingMutations('test');

      // MAX_ROUNDS_PER_FLUSH = 3 → en çok 3 istek; satır diskte KALIR (emir
      // kaybolmuyor, bir sonraki tetiği bekler).
      expect(addReaction).toHaveBeenCalledTimes(3);
      expect(readPendingMutations()).toHaveLength(1);
    });
  });

  /**
   * ÖNEMLİ 3 — sonsuz tekrarın tavanı. `classifyMutationError` bilinmeyen her
   * hatada 'retry' döndüğü için tavan olmadan satır ömürlük bir arka plan
   * isteğine dönüşüyordu ve kullanıcıya hiçbir şey söylenmiyordu.
   */
  describe('deneme/yaş tavanı (Önemli 3)', () => {
    const loadedStore = () =>
      setStoreMessages([
        { id: 'msg-1', conversationId: CONV, reactions: [{ emoji: '😀', count: 1, userIds: ['me'] }] },
      ]);

    it('deneme tavanına varan satır AĞA ÇIKMADAN bitiyor: silinir, geri alınır, sebebi söylenir', async () => {
      insertMessage('msg-1', 'sent');
      loadedStore();
      upsertPendingMutation({
        message_id: 'msg-1',
        kind: 'reaction',
        conversation_id: CONV,
        payload_json: JSON.stringify({ desired: '😀', base: null }),
        attempts: MUTATION_MAX_ATTEMPTS,
        first_seen_at_ms: Date.now(),
        next_eligible_at_ms: 0,
        last_error: 'Network Error',
      });

      const r = await flushPendingMutations('test');

      // Ayırt edici: tavan olmasaydı satır bir kez DAHA ağa çıkar (retry) ve
      // diskte kalırdı.
      expect(addReaction).not.toHaveBeenCalled();
      expect(r.rejected).toBe(1);
      expect(readPendingMutations()).toHaveLength(0);
      expect(lastReactionsDispatched()).toEqual([]); // geri alındı
      expect(showInfoToast).toHaveBeenCalledWith(expect.objectContaining({ variant: 'error' }));
    });

    it('yaş tavanını dolduran satır da aynı şekilde bitiyor (attempts düşük olsa bile)', async () => {
      insertMessage('msg-1', 'sent');
      loadedStore();
      upsertPendingMutation({
        message_id: 'msg-1',
        kind: 'reaction',
        conversation_id: CONV,
        payload_json: JSON.stringify({ desired: '😀', base: null }),
        attempts: 1,
        first_seen_at_ms: Date.now() - MUTATION_MAX_AGE_MS - 1,
        next_eligible_at_ms: 0,
        last_error: null,
      });

      const r = await flushPendingMutations('test');

      expect(addReaction).not.toHaveBeenCalled();
      expect(r.rejected).toBe(1);
      expect(readPendingMutations()).toHaveLength(0);
    });

    it('tavanın ALTINDAKİ satır normal şekilde gönderiliyor', async () => {
      insertMessage('msg-1', 'sent');
      upsertPendingMutation({
        message_id: 'msg-1',
        kind: 'reaction',
        conversation_id: CONV,
        payload_json: JSON.stringify({ desired: '😀', base: null }),
        attempts: MUTATION_MAX_ATTEMPTS - 1,
        first_seen_at_ms: Date.now() - MUTATION_MAX_AGE_MS + 60_000,
        next_eligible_at_ms: 0,
        last_error: null,
      });

      await flushPendingMutations('test');

      expect(addReaction).toHaveBeenCalledWith('msg-1', '😀');
    });
  });

  describe('bozuk payload ve satır-seviyeli dayanıklılık (minörler)', () => {
    it('bozuk payload_json KALICI sayılır: satır silinir, SONSUZA DEK retry YAPILMAZ', async () => {
      insertMessage('msg-1', 'sent');
      // Mesaj Redux'ta YÜKLÜ: toast iddiası ancak böyle anlamlı (yüklü
      // değilken toast bilerek bastırılıyor, bkz. minör 7 testi).
      setStoreMessages([{ id: 'msg-1', conversationId: CONV, reactions: [] }]);
      upsertPendingMutation({
        message_id: 'msg-1',
        kind: 'reaction',
        conversation_id: CONV,
        payload_json: '{bozuk json',
        attempts: 0,
        first_seen_at_ms: Date.now(),
        next_eligible_at_ms: 0,
        last_error: null,
      });

      const r = await flushPendingMutations('test');

      // Ayırt edici: `classifyMutationError` kodsuz bir hatada 'retry' döner
      // — parse hatası ÖZEL OLARAK ele alınmazsa bu satır 'retry' sayılır,
      // attempts artar ve backoff'la SONSUZA DEK aynı parse hatasıyla
      // yeniden denenirdi (zehir hap). Burada 'rejected' olmalı.
      expect(r.rejected).toBe(1);
      expect(r.retried).toBe(0);
      expect(readPendingMutations()).toHaveLength(0);
      expect(addReaction).not.toHaveBeenCalled();
      expect(showInfoToast).toHaveBeenCalledWith(expect.objectContaining({ variant: 'error' }));
    });

    it('bir satırın defter yazımı (deletePendingMutationIfPayload) patlarsa TUR ÇÖKMÜYOR, diğer satır işleniyor', async () => {
      insertMessage('msg-1', 'sent');
      insertMessage('msg-2', 'sent');
      enqueueReaction({ messageId: 'msg-1', conversationId: CONV, desired: '😀', serverBase: null });
      enqueueReaction({ messageId: 'msg-2', conversationId: CONV, desired: '😀', serverBase: null });

      const spy = jest
        .spyOn(chatRepo, 'deletePendingMutationIfPayload')
        .mockImplementationOnce(() => {
          throw new Error('disk patladı');
        });

      try {
        const r = await flushPendingMutations('test');

        // Ayırt edici: eski kod bir satırın defter yazımı patlarsa TÜM
        // promise'i reject ederdi — ikinci satır hiç işlenmezdi. Burada
        // ikisi de AĞA gitmiş olmalı (network çağrısı defterden ÖNCE).
        expect(addReaction).toHaveBeenCalledTimes(2);
        // İlk satırın muhasebesi patladı (sayılmadı), ikincisi normal bitti.
        expect(r.done).toBe(1);
        // msg-1 satırı disk yazımı patladığı için HÂLÂ kuyrukta.
        expect(readPendingMutations().map((row) => row.message_id)).toEqual(['msg-1']);
      } finally {
        spy.mockRestore();
      }
    });
  });
});
