jest.mock('expo-sqlite');
jest.mock('react-native-mmkv');

import * as SQLite from 'expo-sqlite';
import { openChatDb, __resetChatDbForTests } from '@/features/chat/db/chatDb';
import { readFailedSends, saveMessage } from '@/features/chat/chatRepository';
import { readFailedOutboxFromLocal } from '@/features/chat/chatHydrate';
import { clear as clearMessageCache, projectWindow } from '@/features/chat/messageCache';
import { mergeFailedOutbox, messageToDescriptor } from '@/features/chat/outboxPolicy';
import { readWindow } from '@/features/chat/chatRepository';
import type { MessageDto } from '@/shared/types';

/**
 * Gönderilememiş mesajların TÜM ARŞİVDEN bulunması.
 *
 * Eski davranış: sessiz tur yalnız Redux bucket'larına bakıyordu, bucket da
 * yalnız AÇILMIŞ sohbetler için vardı. Uygulama yeniden başladıktan sonra,
 * kullanıcı o sohbete girmedikçe başarısız mesaj hiçbir tura görünmüyordu.
 */

const { __resetAllDatabases } = SQLite as unknown as { __resetAllDatabases: () => void };

const CONV = 'conv-1';
const NOW = Date.parse('2026-10-06T12:00:00.000Z');
const iso = (ms: number) => new Date(ms).toISOString();

const msg = (id: string, over: Partial<MessageDto> = {}): MessageDto =>
  ({
    id,
    conversationId: CONV,
    senderId: 'me',
    content: `içerik ${id}`,
    contentType: 0,
    sentAt: iso(NOW - 60_000),
    clientMessageId: `cmid-${id}`,
    ...over,
  }) as MessageDto;

beforeEach(() => {
  __resetChatDbForTests();
  __resetAllDatabases();
  clearMessageCache();
  openChatDb();
});

describe('readFailedSends', () => {
  it('yalnız failed satırları döndürüyor', () => {
    saveMessage(msg('m-failed'), CONV, 'failed');
    saveMessage(msg('m-pending'), CONV, 'pending');
    saveMessage(msg('m-sent'), CONV);

    expect(readFailedSends().map((r) => r.id)).toEqual(['m-failed']);
  });

  it('sohbet AÇILMAMIŞ olsa da buluyor — kaynak bucket değil arşiv', () => {
    saveMessage(msg('m1', { conversationId: 'hiç-açılmamış' }), 'hiç-açılmamış', 'failed');

    expect(readFailedSends().map((r) => r.conversation_id)).toEqual(['hiç-açılmamış']);
  });

  it('eskiden yeniye sıralıyor', () => {
    saveMessage(msg('m-yeni', { sentAt: iso(NOW - 10_000) }), CONV, 'failed');
    saveMessage(msg('m-eski', { sentAt: iso(NOW - 600_000) }), CONV, 'failed');

    expect(readFailedSends().map((r) => r.id)).toEqual(['m-eski', 'm-yeni']);
  });

  it('tur başına tavanı var', () => {
    for (let i = 0; i < 5; i++) {
      saveMessage(msg(`m${i}`, { sentAt: iso(NOW - (10 - i) * 1_000) }), CONV, 'failed');
    }

    expect(readFailedSends({ limit: 2 })).toHaveLength(2);
  });
});

describe('readFailedOutboxFromLocal', () => {
  it('yeniden gönderilebilir tanıma dönüşüyor (sesli mesajın yerel dosyası dahil)', () => {
    saveMessage(
      msg('m-voice', {
        contentType: 2,
        content: '',
        durationMs: 4200,
        _localUri: 'file:///voice/1.m4a',
      }),
      CONV,
      'failed',
    );

    const [m] = readFailedOutboxFromLocal();
    expect(m._failed).toBe(true);
    expect(messageToDescriptor(m)).toMatchObject({
      kind: 'voice',
      clientMessageId: 'cmid-m-voice',
      localUri: 'file:///voice/1.m4a',
      durationMs: 4200,
    });
  });

  it('kimlik haritasından geçiyor — ekrandaki nesneyle AYNI referans', () => {
    saveMessage(msg('m1'), CONV, 'failed');
    // Ekranın gördüğü hâl (hydrateConversation'ın kullandığı projeksiyon).
    const onScreen = projectWindow(CONV, readWindow(CONV));

    expect(readFailedOutboxFromLocal()[0]).toBe(onScreen[0]);
  });

  it('iki gün önceki başarısız mesaj da arşivden dönüyor — yaş sınırı kalktı', () => {
    // Eskiden (OUTBOX_DISK_MAX_AGE_MS = 2 saat) bu mesaj burada hiç görünmezdi.
    // Sınır kalktı (bkz. outboxPolicy.LATE_SEND_NOTICE_MS): backend aynı
    // clientMessageId'yi mesaj satırı yaşadığı sürece (730 gün) idempotent
    // kabul ediyor, yani artık "çok eski" diye bir mesajı arşivden hiç
    // çıkarmamak için teknik bir sebep yok.
    saveMessage(
      msg('m-iki-gün-önce', { sentAt: iso(NOW - 2 * 24 * 60 * 60_000) }),
      CONV,
      'failed',
    );

    const ids = readFailedOutboxFromLocal().map((m) => m.id);
    expect(ids).toEqual(['m-iki-gün-önce']);
  });
});

describe('mergeFailedOutbox', () => {
  const r = (cmid: string, atMs: number) => ({ clientMessageId: cmid, sentAt: iso(atMs) });

  it('clientMessageId ile tekilleştiriyor', () => {
    const fromRedux = [r('a', NOW - 1_000)];
    const fromDisk = [r('a', NOW - 1_000), r('b', NOW - 2_000)];

    expect(mergeFailedOutbox(fromRedux, fromDisk).map((m) => m.clientMessageId)).toEqual([
      'b',
      'a',
    ]);
  });

  it('çakışmada Redux nesnesi kazanıyor (oturum içi alanları taze)', () => {
    const live = { ...r('a', NOW), _pending: true };
    const stale = { ...r('a', NOW), _pending: false };

    expect(mergeFailedOutbox([live], [stale])[0]).toBe(live);
  });

  it('eskiden yeniye sıralıyor — sohbet içi sıra bozulmasın', () => {
    const merged = mergeFailedOutbox(
      [r('yeni', NOW), r('orta', NOW - 5_000)],
      [r('eski', NOW - 10_000)],
    );

    expect(merged.map((m) => m.clientMessageId)).toEqual(['eski', 'orta', 'yeni']);
  });

  it('clientMessageId taşımayan satırı atıyor — yeniden gönderilemez', () => {
    expect(mergeFailedOutbox([{ sentAt: iso(NOW) }], [])).toHaveLength(0);
  });
});

// ── Yakalama turunun gönderim turunu beklemesi ──────────────────────────────
describe('delta turu önce (pullBeforeSend)', () => {
  it('delta mesajı geri getirip satırı sent yaptıysa kuyrukta görünmüyor', () => {
    // Ack kaybolmuş gönderim: diskte failed duruyor.
    saveMessage(msg('m1'), CONV, 'failed');
    expect(readFailedSends()).toHaveLength(1);

    // Delta turu aynı mesajı sunucudan geri getiriyor — UPSERT'in varsayılan
    // send_state'i 'sent', yani satır kendiliğinden kuyruktan düşüyor. Gönderim
    // turunun bunu beklemesinin sebebi tam olarak bu (bkz. outbox.flushOutbox).
    saveMessage({ ...msg('m1'), id: 'real-id' }, CONV);

    expect(readFailedSends()).toHaveLength(0);
  });
});
