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
  // Varsayılan: BAŞARILI gönderim (bir sonraki mikro-görevde çözülür). Tekil
  // testler `mockImplementationOnce`/`mockRejectedValueOnce` ile ezer — "hiç
  // çözülmeyen" ya da "reddeden" davranış yalnız onu gerektiren testte.
  default: {
    sendMessage: jest.fn(() =>
      Promise.resolve({
        id: 'server-id',
        conversationId: 'conv-1',
        clientMessageId: 'cmid-1',
        content: 'ok',
        contentType: 0,
        sentAt: new Date().toISOString(),
      }),
    ),
  },
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
import { readSendAttempts, upsertSendAttempt } from '@/features/chat/chatRepository';
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
  sendOutgoing,
} from '@/features/chat/outbox';
import chatServiceMock from '@/features/chat/chatService';
import { decrementQuotaLocally } from '@/features/chat/chatSlice';

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
  // Çağrı geçmişini sıfırla ama varsayılan implementasyonu KORU (mockReset
  // implementasyonu da silerdi) — tekil testler Once-ezmesini kendi içinde
  // kullanıp tüketiyor, bir testten kalan bir "Once" bir sonrakine sızmaz.
  (chatServiceMock.sendMessage as jest.Mock).mockClear();
  (decrementQuotaLocally as unknown as jest.Mock).mockClear();
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
    // Bu TEK çağrıda ağ cevabı hiç gelmesin — "gönderim uçuşta" anını taklit.
    (chatServiceMock.sendMessage as jest.Mock).mockImplementationOnce(
      () => new Promise(() => {}),
    );

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
    (chatServiceMock.sendMessage as jest.Mock).mockImplementationOnce(
      () => new Promise(() => {}),
    );

    void retryFailedMessage(failedMessage(), { mode: 'interactive' });

    resetOutbox();
    loadAttemptsFromDisk();

    expect(peekAttempt(CMID)?.quotaCharged).toBe(true);
  });
});

describe('cold start — hiçbir round koşmadan ilk çağrı sendOutgoing', () => {
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
   * CRITICAL (review bulgusu): `loadAttemptsFromDisk`'in tek üretim çağrı
   * noktası `flushOutbox`'ın turuydu. O turun ÜÇ tetikleyicisi de (online,
   * foreground, reconnect) GEÇİŞ bazlı — cold start'ta ateşlenecek önceki bir
   * durum yok; `scheduleWake` de zaten koşmuş bir turu gerektiriyor. Yani
   * kullanıcı uygulamayı açıp DOĞRUDAN "tekrar dene"ye bastığında
   * `retryFailedMessage` → `sendOutgoing` hiçbir round'u BEKLEMEDEN çalışıyor
   * ve Map'i hiç kimse doldurmamış oluyordu.
   *
   * Senaryo: önceki process'te hub'dan giden mesajın ack'i hiç gelmedi,
   * `armAckWatchdog` kotayı düşürüp diske `quota_charged = 1` yazdı, balon
   * `failed`/`permanent` kaldı. Bu testte `loadAttemptsFromDisk()` ELLE
   * ÇAĞRILMIYOR (diğer tüm testlerin yaptığının TERSİ) — asıl cold start bu:
   * `resetOutbox()` Map'i ve bayrağı sıfırlıyor, hiçbir şey onu yeniden
   * doldurmuyor, TEK giriş noktası `sendOutgoing`'in KENDİ çağrısı.
   */
  it('retryFailedMessage → sendOutgoing kendi loadAttemptsFromDisk’ini yapmazsa kota ikinci kez düşerdi', async () => {
    rememberAttempt(CMID, entry({ attempts: 5, permanent: true, quotaCharged: true }));
    resetOutbox(); // process ölümü
    expect(peekAttempt(CMID)).toBeUndefined(); // Map boş, disk HİÇ okunmadı

    await retryFailedMessage(failedMessage(), { mode: 'interactive' });
    // Bu çağrı BEKLENİYOR: varsayılan mock gönderimi başarıyla çözüyor,
    // `sendOutgoing` → `chargeQuotaOnce`'a kadar TAM akış işliyor.

    expect(decrementQuotaLocally).not.toHaveBeenCalled();
    // İKİNCİ iddia ŞART: `chargeQuotaOnce`'ın Map-miss read-through'u (Important 2)
    // da TEK BAŞINA `decrementQuotaLocally`'i engelleyebilir — disk satırını okur,
    // `quotaCharged`i görür, `rememberAttempt` ÇAĞIRMADAN döner. Yani üstteki
    // iddia tek başına `loadAttemptsFromDisk`'in BU çağrıda gerçekten çalıştığını
    // KANITLAMAZ. Yalnız `loadAttemptsFromDisk` Map'e yazar; read-through yazmaz.
    expect(peekAttempt(CMID)?.quotaCharged).toBe(true);
  });
});

describe('retryFailedMessage interactive — DİSK TEK KAYNAKKEN override çalışmalı', () => {
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
   * IMPORTANT (review bulgusu, 2. tur): interactive override `const prev =
   * attempts.get(...)` ile başlıyor — `sendOutgoing`'in kendi
   * `loadAttemptsFromDisk` çağrısı bundan SONRA gelir. Cold start'ta
   * (hiçbir flush turu koşmadı, Map'e hiçbir şey yüklenmedi) bu satır
   * olmadan `prev` HEP `undefined` bulunur, override TAMAMEN atlanır ve
   * disk'teki eski `permanent: 1`/yüksek `attempts` satırı AYNEN kalır —
   * bir sonraki başarısız denemede `touchEntry` o eski kaydı büyütüp
   * kalıcıya çevirebilir (round 1'in düzelttiği senaryo geri gelir).
   *
   * Yukarıdaki iki "retryFailedMessage interactive" testi Map'i
   * `rememberAttempt` ile dolduruyor — `prev` ORADA HER ZAMAN bulunur, bu
   * yüzden bu regresyonu YAKALAYAMAZLAR. Burada kayıt YALNIZ diske
   * `upsertSendAttempt` ile yazılıyor, Map'e hiç dokunulmuyor.
   */
  it('Map hiç yüklenmemişken bile override diske yazılıyor, quotaCharged korunuyor', () => {
    upsertSendAttempt(
      attemptRowFromEntry(CMID, entry({ attempts: 5, permanent: true, quotaCharged: true })),
    );
    expect(peekAttempt(CMID)).toBeUndefined(); // Map boş — kayıt YALNIZ diskte

    // Ağ cevabı hiç gelmesin — bu testin ilgilendiği şey override'ın SENKRON
    // kısmı, `sendOutgoing`'in await'ine kadar bile gitmeden.
    (chatServiceMock.sendMessage as jest.Mock).mockImplementationOnce(
      () => new Promise(() => {}),
    );
    void retryFailedMessage(failedMessage(), { mode: 'interactive' });

    const rows = readSendAttempts();
    expect(rows).toHaveLength(1);
    expect(rows[0]).toMatchObject({
      client_message_id: CMID,
      attempts: 0,
      permanent: 0,
      quota_charged: 1, // kullanıcının "tekrar dene"si daha önce düşmüş kotayı GERİ VERMEZ
    });
  });
});

describe('MAX_TRACKED tahliyesi Map’ten düşürür, DİSKTEN DÜŞÜRMEZ', () => {
  /**
   * Controller ruling: `MAX_TRACKED` sınırı yalnız Map için — disk sınırını
   * `pruneOrphanSendAttempts` çiziyor. Bu test şimdiye kadar hiçbir şey
   * KİLİTLEMİYORDU: `touchEntry`'nin tahliyesi zaten Map'ten siliyordu ama
   * diskin HÂLÂ sahip olduğunu doğrulayan bir test yoktu.
   */
  it('tahliye edilen en eski kayıt send_attempts tablosunda kalıyor', async () => {
    const OLDEST = 'cmid-oldest';
    const base = Date.now() - 1_000_000;
    rememberAttempt(OLDEST, entry({ firstSeenAt: base }));
    for (let i = 1; i < 200; i++) {
      rememberAttempt(`cmid-${i}`, entry({ firstSeenAt: base + i }));
    }
    expect(readSendAttempts()).toHaveLength(200);

    // Bu TEK çağrı reddediyor: `noteFailure` → `touchEntry` 201. kaydı (yeni
    // bir clientMessageId) açarken MAX_TRACKED'ı aşıyor ve `firstSeenAt`'i en
    // küçük olan (OLDEST) kaydı Map'ten düşürüyor.
    (chatServiceMock.sendMessage as jest.Mock).mockRejectedValueOnce(new Error('ağ hatası'));
    await sendOutgoing(
      { kind: 'text', conversationId: 'conv-1', clientMessageId: 'cmid-yeni', content: 'x' },
      { mode: 'silent' },
    );

    expect(peekAttempt(OLDEST)).toBeUndefined(); // Map'ten düştü
    // Disk hâlâ taşıyor — MAX_TRACKED diski BAĞLAMIYOR.
    expect(readSendAttempts().map((r) => r.client_message_id)).toContain(OLDEST);
  });
});
