// chatSlice → chatService → api → tokenStorage zinciri native storage'a iniyor;
// reducer testinde ikisi de mock'lanır (davranışları burada konu değil, bkz.
// chatSlice.unread.test.ts'teki aynı not).
jest.mock('@react-native-async-storage/async-storage', () =>
  require('@react-native-async-storage/async-storage/jest/async-storage-mock'),
);
jest.mock('react-native-mmkv'); // <rootDir>/__mocks__/react-native-mmkv.ts

import reducer, { hydrateWindow, receiveMessage } from '@/features/chat/chatSlice';

/**
 * Faz 4 / Task 5 review turu 1, Önemli 4 — "pencereli" (jump) bucket.
 *
 * `hydrateAroundMessage` bir sohbeti arşivin DİBİNDE değil, arama
 * sonucundan atlanan bir HEDEFİN ETRAFINDA açtığında bucket `isWindowed:true`
 * ile işaretleniyor. Bu bayrak açıkken `receiveMessage` (realtime'dan gelen
 * canlı mesaj) bucket'a BİTİŞTİRİLMİYOR — mesaj zaten diske indi (mirror
 * middleware ayrı yoldan yazıyor), onu iki yıl önceki bir pencerenin hemen
 * yanına "son mesaj" gibi yapıştırmak, hiç göstermemekten daha yanıltıcı.
 */
const CONV = 'conv-1';

function baseMessage(id: string, overrides: Partial<any> = {}) {
  return {
    id,
    conversationId: CONV,
    senderId: 'partner-1',
    content: `mesaj ${id}`,
    contentType: 0,
    sentAt: new Date().toISOString(),
    ...overrides,
  };
}

describe('hydrateWindow — isWindowed bayrağı', () => {
  it('isWindowed:true verilince bucket PENCERELİ işaretlenir', () => {
    const state = reducer(
      undefined,
      hydrateWindow({
        conversationId: CONV,
        messages: [baseMessage('m1')],
        nextCursor: null,
        hasMore: true,
        hasHiddenHistory: false,
        isWindowed: true,
      }),
    );
    expect(state.messagesByConv[CONV].isWindowed).toBe(true);
  });

  it('isWindowed verilmeyince (normal hot-window) false\'a DÜŞER — önceki pencereli bayrak TEMİZLENİR', () => {
    const windowed = reducer(
      undefined,
      hydrateWindow({
        conversationId: CONV,
        messages: [baseMessage('m1')],
        nextCursor: null,
        hasMore: true,
        hasHiddenHistory: false,
        isWindowed: true,
      }),
    );
    expect(windowed.messagesByConv[CONV].isWindowed).toBe(true);

    // Sohbete TAZE girmek (hydrateConversation'ın gerçek çağrısı `isWindowed`i
    // hiç geçmiyor) — ayrı bir "clear" action'ı YOK, bu dispatch'in kendisi
    // temizliyor.
    const fresh = reducer(
      windowed,
      hydrateWindow({
        conversationId: CONV,
        messages: [baseMessage('m2'), baseMessage('m1')],
        nextCursor: null,
        hasMore: true,
        hasHiddenHistory: false,
      }),
    );
    expect(fresh.messagesByConv[CONV].isWindowed).toBe(false);
  });
});

describe('receiveMessage — pencereli bucket canlı mesajı BİTİŞTİRMİYOR', () => {
  function windowedState() {
    return reducer(
      undefined,
      hydrateWindow({
        conversationId: CONV,
        messages: [baseMessage('old-1'), baseMessage('old-2')],
        nextCursor: null,
        hasMore: true,
        hasHiddenHistory: false,
        isWindowed: true,
      }),
    );
  }

  it('pencereli bucket\'a canlı mesaj geldiğinde dizi DEĞİŞMİYOR', () => {
    const before = windowedState();
    const after = reducer(
      before,
      receiveMessage(baseMessage('live-1', { _selfUserId: 'me' }) as any),
    );
    expect(after.messagesByConv[CONV].messages.map((m) => m.id)).toEqual(['old-1', 'old-2']);
    expect(after.messagesByConv[CONV].messages.some((m) => m.id === 'live-1')).toBe(false);
  });

  it('pencereli OLMAYAN bucket\'ta receiveMessage eski davranışı sürdürüyor — BİTİŞTİRİYOR', () => {
    // Kontrol grubu: aynı senaryo isWindowed OLMADAN — bu test fix'in yanlışlıkla
    // TÜM bitiştirmeyi kapatmadığını, yalnız pencereli bucket'ı etkilediğini
    // kanıtlıyor.
    const normal = reducer(
      undefined,
      hydrateWindow({
        conversationId: CONV,
        messages: [baseMessage('old-1')],
        nextCursor: null,
        hasMore: true,
        hasHiddenHistory: false,
      }),
    );
    const after = reducer(
      normal,
      receiveMessage(baseMessage('live-1', { _selfUserId: 'me' }) as any),
    );
    expect(after.messagesByConv[CONV].messages.map((m) => m.id)).toEqual(['live-1', 'old-1']);
  });

  it('pencereliyken bile sohbet listesinin son mesajı/okunmuşluğu GÜNCELLENİR — yalnız bucket dizisi atlanıyor', () => {
    // `updateConversationLastMessage`/`markConversationReadLocally` global state
    // (liste önizlemesi, rozet) — pencereli görünüme BİTİŞTİRME sorunuyla
    // ilgisiz, bu yüzden hâlâ çalışmalı.
    const before = {
      ...windowedState(),
      conversations: [
        {
          conversationId: CONV,
          partnerUserId: 'partner-1',
          partnerDisplayName: 'Partner',
          isActive: true,
          unreadCount: 0,
          lastMessageAt: new Date(0).toISOString(),
          lastMessagePreview: 'eski',
        } as any,
      ],
    };
    const after = reducer(
      before,
      receiveMessage(baseMessage('live-1', { _selfUserId: 'me' }) as any),
    );
    const conv = after.conversations.find((c) => c.conversationId === CONV);
    expect(conv?.lastMessagePreview).toBe('mesaj live-1');
  });
});
