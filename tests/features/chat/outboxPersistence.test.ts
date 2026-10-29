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
jest.mock('@/features/chat/chatDeltaSync', () => ({ pullBeforeSend: jest.fn(() => null) }));
jest.mock('@/shared/services/analytics', () => ({ analytics: { capture: jest.fn() } }));
jest.mock('@/shared/services/networkStatus', () => ({ isOfflineNow: jest.fn(() => false) }));
jest.mock('@/shared/services/toaster', () => ({ showInfoToast: jest.fn() }));
// i18n MOCK'LANMIYOR — jest.setup.ts gerçek sözlüğü (tr) yüklüyor, bu dosyadaki
// geç-gönderim bildirim testleri gerçek `chat.send.lateDelivered` metnini
// doğruluyor (bkz. aşağıdaki describe bloğu).
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
  isLateDelivery,
  LATE_SEND_NOTICE_MS,
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
import { showInfoToast } from '@/shared/services/toaster';

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
  (showInfoToast as jest.Mock).mockClear();
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

describe('cold start — retryFailedMessage hiçbir round koşmadan kotayı ikinci kez düşürmüyor', () => {
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
   * Bu test NE'yi KANITLIYOR: cold start'ta (hiçbir flush turu koşmadı —
   * online/foreground/reconnect hepsi geçiş bazlı, scheduleWake zaten koşmuş
   * bir turu gerektiriyor) kullanıcı doğrudan "tekrar dene"ye basarsa
   * `retryFailedMessage` kotayı İKİNCİ KEZ DÜŞÜRMÜYOR.
   *
   * NE'yi KANITLAMIYOR: `retryFailedMessage`'ın KENDİ `loadAttemptsFromDisk`
   * çağrısı VAR (round 2'nin fix'i) — bu test o çağrıyı `sendOutgoing`'in
   * kendi çağrısından AYIRAMAZ, ikisi de bu senaryoda Map'i doldurur. Aynı
   * garanti `sendOutgoing`'in kendi çağrısı için AYRICA ve DOĞRUDAN
   * pin'leniyor (bkz. altta "sendOutgoing kendi loadAttemptsFromDisk'ini
   * yapıyor" describe bloğu — `ChatScreen`'in composer gönderim yolu
   * `retryFailedMessage`'dan hiç geçmeden `sendOutgoing`'i DOĞRUDAN çağırıyor).
   *
   * Senaryo: önceki process'te hub'dan giden mesajın ack'i hiç gelmedi,
   * `armAckWatchdog` kotayı düşürüp diske `quota_charged = 1` yazdı, balon
   * `failed`/`permanent` kaldı. Bu testte `loadAttemptsFromDisk()` ELLE
   * ÇAĞRILMIYOR (diğer tüm testlerin yaptığının TERSİ) — asıl cold start bu:
   * `resetOutbox()` Map'i ve bayrağı sıfırlıyor, hiçbir şey onu yeniden
   * doldurmuyor.
   */
  it('kota ikinci kez düşmüyor, muhasebe Map’e de geri yüklenmiş oluyor', async () => {
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
    // iddia tek başına BİR `loadAttemptsFromDisk` çağrısının BU akışta gerçekten
    // çalıştığını KANITLAMAZ. Yalnız `loadAttemptsFromDisk` Map'e yazar;
    // read-through yazmaz — ama bu akışta HEM `retryFailedMessage`'ın HEM
    // `sendOutgoing`'in kendi çağrısı var, bu iddia ikisini AYIRT ETMEZ.
    expect(peekAttempt(CMID)?.quotaCharged).toBe(true);
  });
});

describe('sendOutgoing kendi loadAttemptsFromDisk’ini yapıyor (composer yolu, retryFailedMessage’dan GEÇMİYOR)', () => {
  /**
   * `ChatScreen`'in composer gönderim yolu (`ChatScreen.tsx:1111`, `:1158`)
   * `sendOutgoing`'i DOĞRUDAN çağırıyor, `retryFailedMessage`'dan hiç
   * geçmiyor — yani `retryFailedMessage`'ın kendi `loadAttemptsFromDisk`
   * çağrısı bu yolu HİÇ kapsamıyor. `sendOutgoing`'in kendi çağrısı, üstteki
   * "cold start" testinin pin'leyemediği, gerçek ve bağımsız bir sözleşme.
   *
   * `decrementQuotaLocally` çağrılmadı iddiası TEK BAŞINA bunu KANITLAMAZ:
   * `chargeQuotaOnce`'ın kendi Map-miss read-through'u (Important 2) da aynı
   * disk satırını AYRICA ve BAĞIMSIZ okuyup aynı sonucu verir — bu TAM OLARAK
   * üstteki "cold start" testinde düzeltilen aynı maskeleme. Ayırt edici iddia
   * `peekAttempt(...)?.quotaCharged === true`: bunu yalnız Map'i YAZAN
   * `loadAttemptsFromDisk` sağlayabilir, read-through yalnız yerel bir
   * değişken kurup `rememberAttempt` ÇAĞIRMADAN döner.
   */
  it('Map boş/yüklenmemişken bile quota_charged’ı görür, kotayı ikinci kez düşürmez', async () => {
    upsertSendAttempt(
      attemptRowFromEntry('cmid-composer', entry({ quotaCharged: true })),
    );
    expect(peekAttempt('cmid-composer')).toBeUndefined(); // Map boş — kayıt YALNIZ diskte

    await sendOutgoing(
      { kind: 'text', conversationId: 'conv-1', clientMessageId: 'cmid-composer', content: 'x' },
      { mode: 'interactive' },
    );

    expect(decrementQuotaLocally).not.toHaveBeenCalled();
    expect(peekAttempt('cmid-composer')?.quotaCharged).toBe(true);
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

describe('isLateDelivery', () => {
  it('1 saatten eski sentAt -> true', () => {
    const now = Date.now();
    expect(isLateDelivery(now - LATE_SEND_NOTICE_MS - 1, now)).toBe(true);
  });

  it('10 dakikalık sentAt -> false', () => {
    const now = Date.now();
    expect(isLateDelivery(now - 10 * 60_000, now)).toBe(false);
  });

  it('tam sınırda (=== LATE_SEND_NOTICE_MS) -> false, sınır KATI', () => {
    const now = Date.now();
    expect(isLateDelivery(now - LATE_SEND_NOTICE_MS, now)).toBe(false);
  });
});

describe('sendOutgoing başarı dalı — geç gönderim bildirimi', () => {
  /**
   * Yaş sınırı kalktı (bkz. outboxPolicy.LATE_SEND_NOTICE_MS yorumu) — bu
   * dört test onun yerine konan şeyi kilitliyor: sessiz turda BAŞARIYLA giden
   * eski bir mesaj kullanıcıya söyleniyor, ama yalnız sessiz modda ve tur
   * başına en fazla bir kez.
   */
  const CONV = 'conv-1';
  const late = () => new Date(Date.now() - LATE_SEND_NOTICE_MS - 60_000).toISOString();
  const fresh = () => new Date(Date.now() - 60_000).toISOString();

  it('silent + geç mesaj başarıyla gidince bildirim gösteriliyor', async () => {
    await sendOutgoing(
      {
        kind: 'text',
        conversationId: CONV,
        clientMessageId: 'cmid-late-1',
        content: 'x',
        sentAt: late(),
      },
      { mode: 'silent' },
    );

    expect(showInfoToast).toHaveBeenCalledWith({
      message: 'Bekleyen mesajın gönderildi',
      variant: 'info',
    });
  });

  it('silent + taze mesaj -> bildirim YOK (her başarılı sessiz gönderim toast açmasın)', async () => {
    await sendOutgoing(
      {
        kind: 'text',
        conversationId: CONV,
        clientMessageId: 'cmid-fresh',
        content: 'x',
        sentAt: fresh(),
      },
      { mode: 'silent' },
    );

    expect(showInfoToast).not.toHaveBeenCalled();
  });

  it('interactive + geç mesaj -> bildirim YOK (kullanıcı zaten ekranda, "tekrar dene"nin sonucunu görüyor)', async () => {
    await sendOutgoing(
      {
        kind: 'text',
        conversationId: CONV,
        clientMessageId: 'cmid-late-interactive',
        content: 'x',
        sentAt: late(),
      },
      { mode: 'interactive' },
    );

    expect(showInfoToast).not.toHaveBeenCalled();
  });

  it('tur başına en fazla bir bildirim — ikinci geç mesaj ikinci toast açmıyor', async () => {
    await sendOutgoing(
      {
        kind: 'text',
        conversationId: CONV,
        clientMessageId: 'cmid-late-a',
        content: 'x',
        sentAt: late(),
      },
      { mode: 'silent' },
    );
    await sendOutgoing(
      {
        kind: 'text',
        conversationId: CONV,
        clientMessageId: 'cmid-late-b',
        content: 'x',
        sentAt: late(),
      },
      { mode: 'silent' },
    );

    expect(showInfoToast).toHaveBeenCalledTimes(1);
  });
});
