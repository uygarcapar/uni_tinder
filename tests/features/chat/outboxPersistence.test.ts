jest.mock('expo-sqlite');
jest.mock('react-native-mmkv');

// outbox.ts ekranın dışında yaşayan gönderim servisi; store/hub/ağ/toast gibi
// bu testin ilgilenmediği yan etkileri sürüklüyor. Burada yalnız disk muhasebesi
// (rememberAttempt/peekAttempt/loadAttemptsFromDisk/pruneAttempts/resetOutbox)
// test ediliyor, o yüzden ilgisiz modüller stub'lanıyor — ConnectionBanner.test.tsx
// ile aynı yaklaşım.
jest.mock('@/features/chat/chatSlice', () => ({
  conversationDeactivated: jest.fn(),
  decrementQuotaLocally: jest.fn(),
  failOptimisticMessage: jest.fn(),
  fetchChatQuota: jest.fn(),
  fetchConversations: jest.fn(),
  messageSent: jest.fn(),
  removeOptimisticMessage: jest.fn(),
  retryOptimisticMessage: jest.fn(),
}));
jest.mock('@/features/chat/chatService', () => ({
  __esModule: true,
  // `sendMessage` KASITLI OLARAK hiç çözülmeyen bir promise döner: "tekrar
  // dene" testinde gönderimin tam ortasında uygulamanın öldüğünü taklit etmek
  // için — gerçek ağ çağrısı asla senkron bitmez, mock de bitmemeli.
  default: { sendMessage: jest.fn(() => new Promise(() => {})) },
}));
jest.mock('@/features/chat/quotaPaywall', () => ({ openQuotaPaywall: jest.fn() }));
jest.mock('@/features/chat/realtimeService', () => ({
  __esModule: true,
  default: { isConnected: jest.fn(() => false), sendMessage: jest.fn() },
}));
jest.mock('@/features/chat/sendQueue', () => ({ enqueueSend: (fn: () => unknown) => fn() }));
jest.mock('@/features/chat/voiceSend', () => ({
  sendVoiceMessage: jest.fn(),
  VoiceTooLargeError: class VoiceTooLargeError extends Error {},
}));
jest.mock('@/features/chat/chatDeltaSync', () => ({ inFlightPull: jest.fn(() => null) }));
jest.mock('@/shared/services/analytics', () => ({ analytics: { capture: jest.fn() } }));
jest.mock('@/shared/services/networkStatus', () => ({ isOfflineNow: jest.fn(() => false) }));
jest.mock('@/shared/services/toaster', () => ({ showInfoToast: jest.fn() }));
jest.mock('@/shared/store', () => ({
  store: { getState: jest.fn(() => ({})), dispatch: jest.fn() },
}));

import * as SQLite from 'expo-sqlite';
import { openChatDb, __resetChatDbForTests } from '@/features/chat/db/chatDb';
import { readSendAttempts } from '@/features/chat/chatRepository';
import type { SendAttemptRow } from '@/features/chat/db/rows';
import {
  attemptEntryFromRow,
  attemptRowFromEntry,
  isEligible,
  type AttemptEntry,
} from '@/features/chat/outboxPolicy';
import {
  loadAttemptsFromDisk,
  peekAttempt,
  pruneAttempts,
  rememberAttempt,
  resetOutbox,
  retryFailedMessage,
} from '@/features/chat/outbox';

/**
 * Outbox muhasebesinin (deneme sayısı/backoff/permanent/quota_charged) diske
 * bağlanması. Asıl kazanç `quotaCharged`: bugüne kadar in-memory Map'teydi ve
 * process ölünce kayboluyordu — ack'i görülmemiş ama sunucuya ulaşmış bir
 * mesaj restart sonrası başarıyla tekrar denenip kotayı İKİNCİ kez düşürebiliyordu.
 */

const { __resetAllDatabases } = SQLite as unknown as { __resetAllDatabases: () => void };

const CMID = 'cmid-1';

const entry = (over: Partial<AttemptEntry> = {}): AttemptEntry => ({
  attempts: 1,
  firstSeenAt: Date.now(),
  nextEligibleAt: 0,
  origin: 'throw',
  permanent: false,
  quotaCharged: false,
  ...over,
});

beforeEach(() => {
  __resetChatDbForTests();
  __resetAllDatabases();
  openChatDb();
  resetOutbox();
});

describe('attemptRowFromEntry / attemptEntryFromRow', () => {
  it('gidiş-dönüş kaydı birebir koruyor (permanent/quotaCharged boolean <-> 0/1 dahil)', () => {
    const e = entry({ attempts: 3, nextEligibleAt: 5_000, permanent: true, quotaCharged: true });
    const row = attemptRowFromEntry(CMID, e);

    expect(row.permanent).toBe(1);
    expect(row.quota_charged).toBe(1);
    expect(attemptEntryFromRow(row)).toEqual(e);
  });

  it('false bayraklar 0 olarak yazılıyor, geri dönüşte false kalıyor', () => {
    const e = entry({ permanent: false, quotaCharged: false });
    const row = attemptRowFromEntry(CMID, e);

    expect(row.permanent).toBe(0);
    expect(row.quota_charged).toBe(0);
    expect(attemptEntryFromRow(row)).toEqual(e);
  });

  it('bilinmeyen origin değeri "throw"a düşüyor (ileri uyumluluk)', () => {
    const row: SendAttemptRow = {
      client_message_id: CMID,
      attempts: 0,
      first_seen_at_ms: 0,
      next_eligible_at_ms: 0,
      permanent: 0,
      quota_charged: 0,
      origin: 'gelecekte-eklenecek-bilinmeyen-deger',
      last_error: null,
    };

    expect(attemptEntryFromRow(row).origin).toBe('throw');
  });
});

describe('disk round trip — process ölümünü resetOutbox taklit ediyor', () => {
  it('quotaCharged restart sonrası hayatta kalıyor (Review Focus: kota iki kez düşmesin)', () => {
    // İlk "tur": disk henüz boş, bayrak artık true. Sonra Map + disk'e yazılıyor.
    loadAttemptsFromDisk();
    rememberAttempt(CMID, entry({ quotaCharged: true }));

    resetOutbox(); // process ölümü — Map VE "yüklendi" bayrağı sıfırlanmalı
    expect(peekAttempt(CMID)).toBeUndefined(); // Map gerçekten boşaldı, disk üstünden okunacak

    loadAttemptsFromDisk(); // ikinci tur — bayrak sıfırlanmadıysa bu no-op kalırdı
    expect(peekAttempt(CMID)?.quotaCharged).toBe(true);
  });

  it('nextEligibleAt (backoff) restart sonrası isEligible’ı hâlâ bloke ediyor', () => {
    const now = Date.now();
    loadAttemptsFromDisk();
    rememberAttempt(
      CMID,
      entry({ attempts: 1, firstSeenAt: now, nextEligibleAt: now + 30_000 }),
    );

    resetOutbox();
    loadAttemptsFromDisk();

    expect(isEligible(peekAttempt(CMID), now, 'silent')).toBe(false);
  });
});

describe('pruneAttempts', () => {
  it('Map’ten düşen kaydı diskten de siliyor', () => {
    rememberAttempt('cmid-alive', entry());
    rememberAttempt('cmid-dead', entry());

    pruneAttempts([{ clientMessageId: 'cmid-alive' }]);

    expect(peekAttempt('cmid-dead')).toBeUndefined();
    expect(readSendAttempts().map((r) => r.client_message_id)).toEqual(['cmid-alive']);
  });
});

describe('retryFailedMessage interactive — EZİLMİŞ muhasebe diske de yazılmalı', () => {
  const CONV = 'conv-1';

  const failedMessage = (over: Record<string, unknown> = {}) => ({
    conversationId: CONV,
    clientMessageId: CMID,
    content: 'tekrar deniyorum',
    contentType: 0,
    _failed: true,
    ...over,
  });

  /**
   * Senaryo: balon kalıcı (`permanent`) olarak işaretlenmiş, kullanıcı "tekrar
   * dene"ye basıyor. `retryFailedMessage`'ın interactive dalı Map'teki kaydı
   * EZER (attempts→0, permanent→false) ama gönderim ASENKRON — bu test gönderim
   * TAM O SIRADA kesilip uygulamanın öldüğünü taklit ediyor (chatService.sendMessage
   * mock'u hiç çözülmeyen bir promise döndürüyor, tıpkı gerçek bir ağ isteğinin
   * sonucu hiç gelmemiş hâli gibi).
   *
   * Reset'in DİSKE de yazılmadığı sürümde: disk eski `permanent: 1` satırını
   * taşımaya devam eder, restart sonrası `isEligible` onu görür ve kullanıcının
   * açıkça "tekrar dene" dediği mesaj BİR DAHA HİÇ denenmez — persistence'tan
   * ÖNCEki hâlden (kayıt yokken isEligible(undefined) hep true dönerdi) daha
   * kötü bir sonuç. Bu test tam bunu kilitliyor.
   */
  it('kalıcı/yüksek-deneme kaydı reset sırasında diske de yazılıyor — restart sonrası sessiz tur engellenmiyor', () => {
    rememberAttempt(CMID, entry({ attempts: 5, permanent: true, quotaCharged: false }));

    void retryFailedMessage(failedMessage(), { mode: 'interactive' });
    // `retryFailedMessage` await EDİLMİYOR: sendOutgoing'in ağ çağrısı (mock)
    // hiç çözülmediği için bu noktada hâlâ "gönderim uçuşta" durumundayız —
    // tam da "uygulama bu sırada öldü" anının senkron karşılığı.

    resetOutbox(); // process ölümü
    loadAttemptsFromDisk();

    expect(isEligible(peekAttempt(CMID), Date.now(), 'silent')).toBe(true);
  });

  it('quotaCharged daha önce düşmüşse "tekrar dene" onu GERİ VERMİYOR', () => {
    rememberAttempt(CMID, entry({ attempts: 5, permanent: true, quotaCharged: true }));

    void retryFailedMessage(failedMessage(), { mode: 'interactive' });

    resetOutbox();
    loadAttemptsFromDisk();

    expect(peekAttempt(CMID)?.quotaCharged).toBe(true);
  });
});
