jest.mock('expo-sqlite');
jest.mock('react-native-mmkv');

import * as SQLite from 'expo-sqlite';
import { openChatDb, __resetChatDbForTests } from '@/features/chat/db/chatDb';
import {
  readPendingMutations,
  upsertPendingMutation,
  deletePendingMutation,
  pruneOrphanPendingMutations,
  readMessageSendState,
  saveMessage,
  upsertMessage,
} from '@/features/chat/chatRepository';
import { getChatDb } from '@/features/chat/db/chatDb';
import type { PendingMutationRow } from '@/features/chat/db/rows';
import { clear as clearMessageCache } from '@/features/chat/messageCache';
import type { MessageDto } from '@/shared/types';
import type { SendState } from '@/features/chat/db/rows';

/**
 * `pending_mutations` (v9) — tepki/silme emirlerinin disk muhasebesi.
 *
 * Bugüne kadar bu emirler yalnız optimistik olarak uygulanıyordu ve ağ
 * çağrısı başarısız olunca GERİ ALINIYORDU (bkz. görev metni) — uçakta
 * verilen bir tepki inince kaybolurdu. Burada yalnız depo katmanı test
 * ediliyor; policy/flush/ekran kablolaması sonraki görevlerin işi.
 */

const { __resetAllDatabases } = SQLite as unknown as { __resetAllDatabases: () => void };

const CONV = 'conv-1';

const msg = (id: string, over: Partial<MessageDto> = {}): MessageDto =>
  ({
    id,
    conversationId: CONV,
    senderId: 'me',
    content: `içerik ${id}`,
    contentType: 0,
    sentAt: '2026-10-29T10:00:00.000Z',
    clientMessageId: `cmid-${id}`,
    ...over,
  }) as MessageDto;

/** `messages`'a gerçek bir satır yazar — prune testleri "mesaj var mı" sorusunu buna bakarak cevaplıyor. */
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
});

describe('pending_mutations: yazıp geri okuma', () => {
  it('upsert aynı (message_id, kind) için satır ÇOĞALTMIYOR, ezip güncelliyor', () => {
    upsertPendingMutation(row({ payload_json: '{"desired":"😀","base":null}' }));
    upsertPendingMutation(row({ payload_json: '{"desired":"❤️","base":null}', attempts: 3 }));

    const all = readPendingMutations();
    expect(all).toHaveLength(1);
    expect(all[0].payload_json).toBe('{"desired":"❤️","base":null}');
    expect(all[0].attempts).toBe(3);
  });

  it('aynı mesajın tepki ve silme emirleri AYRI satırlar', () => {
    upsertPendingMutation(row({ kind: 'reaction' }));
    upsertPendingMutation(row({ kind: 'delete', payload_json: '{"forEveryone":true}' }));

    expect(readPendingMutations()).toHaveLength(2);
  });

  it('readPendingMutations first_seen_at_ms ASC sıralı dönüyor', () => {
    upsertPendingMutation(row({ message_id: 'msg-c', first_seen_at_ms: 3_000 }));
    upsertPendingMutation(row({ message_id: 'msg-a', first_seen_at_ms: 1_000 }));
    upsertPendingMutation(row({ message_id: 'msg-b', first_seen_at_ms: 2_000 }));

    expect(readPendingMutations().map((r) => r.message_id)).toEqual([
      'msg-a',
      'msg-b',
      'msg-c',
    ]);
  });

  // Review Focus 5: flush ortasında ölüm — satır diskte kalıyor.
  it('satır yeni bir bağlantıda da okunuyor (kalıcı, process ömürlü değil)', () => {
    upsertPendingMutation(row({}));

    __resetChatDbForTests(); // aynı dosyaya yeniden bağlan; migration'lar tekrar koşar

    expect(readPendingMutations()).toHaveLength(1);
  });

  it('deletePendingMutation yalnız verilen (message_id, kind) çiftini siliyor', () => {
    upsertPendingMutation(row({ message_id: 'msg-a', kind: 'reaction' }));
    upsertPendingMutation(row({ message_id: 'msg-a', kind: 'delete', payload_json: '{"forEveryone":true}' }));
    upsertPendingMutation(row({ message_id: 'msg-b', kind: 'reaction' }));

    deletePendingMutation('msg-a', 'reaction');

    const remaining = readPendingMutations().map((r) => `${r.message_id}:${r.kind}`);
    expect(remaining).toEqual(['msg-a:delete', 'msg-b:reaction']);
  });

  it('pruneOrphanPendingMutations mesajı OLMAYAN satırı siliyor, olanı bırakıyor', () => {
    insertMessage('msg-var');
    upsertPendingMutation(row({ message_id: 'msg-var' }));
    upsertPendingMutation(row({ message_id: 'msg-yok' }));

    expect(pruneOrphanPendingMutations()).toBe(1);
    expect(readPendingMutations().map((r) => r.message_id)).toEqual(['msg-var']);
  });

  // Ayırt edici: prune yalnız YOKLUĞA bakıyor, gönderim durumuna BAKMIYOR.
  // (`send_attempts`'in aksine — orada 'sent' olmak satırı yetim yapıyor,
  // burada gönderilmiş olmak mutasyonun ÖN KOŞULU.)
  it('pruneOrphanPendingMutations gönderilmiş mesajın satırını SİLMİYOR', () => {
    insertMessage('msg-1', 'sent');
    upsertPendingMutation(row({ message_id: 'msg-1' }));

    expect(pruneOrphanPendingMutations()).toBe(0);
  });

  it('readMessageSendState pending mesajı pending, olmayanı null döndürüyor', () => {
    insertMessage('msg-1', 'pending');

    expect(readMessageSendState('msg-1')).toBe('pending');
    expect(readMessageSendState('msg-yok')).toBeNull();
  });

  // Review round 1, Important 3: `upsertMessage` cmid→server-id rewrite'ında
  // `messages.id`'yi yerinde değiştiriyor (bkz. chatRepository.ts). Bir
  // reaksiyon/silme emri mesaj hâlâ `pending`ken (temp id) kuyruğa girmiş
  // olabilir — `pending_mutations`'ın FK/cascade'i yok, rekey edilmezse emir
  // eski id'ye bağlı kalıp bir sonraki turda `pruneOrphanPendingMutations`
  // tarafından YETİM sayılıp sessizce silinir (kullanıcının emri hiç ağa
  // çıkmadan kaybolur).
  it('upsertMessage cmid rekey\'inde pending_mutations.message_id da REKEY EDİLİYOR', () => {
    const cmid = 'cmid-rekey';
    // Optimistik satır: temp id + clientMessageId, henüz `pending`.
    upsertMessage(getChatDb(), msg('temp-1', { clientMessageId: cmid }), CONV, 'pending');
    upsertPendingMutation(row({ message_id: 'temp-1', kind: 'reaction' }));
    upsertPendingMutation(row({ message_id: 'temp-1', kind: 'delete', payload_json: '{"forEveryone":false}' }));

    // ACK: sunucu gerçek id ile geldi.
    upsertMessage(getChatDb(), msg('msg-real', { clientMessageId: cmid }), CONV, 'sent');

    const rows = readPendingMutations();
    expect(rows).toHaveLength(2); // çoğalmadı, ikisi de taşındı
    expect(rows.map((r) => r.message_id)).toEqual(['msg-real', 'msg-real']);
    expect(rows.map((r) => r.kind).sort()).toEqual(['delete', 'reaction']);
    // Eski id ADINA artık hiçbir satır yok — orphan olarak silinmeyi
    // beklemiyor, taşınmış.
    expect(readPendingMutations().some((r) => r.message_id === 'temp-1')).toBe(false);
  });

  // Review round 2: hedefte (sunucu id'sinde) AYNI `kind`'dan ÇAKIŞAN bir satır
  // zaten varsa çıplak `UPDATE` PK'yi (`message_id`, `kind`) çiftler ve UNIQUE
  // hatası fırlatırdı — `upsertMessage` HER mesajın geçtiği yol olduğu için bu,
  // mirror'ın catch-all'ında sessizce yutulup mesajın DİSKE HİÇ YAZILMAMASI
  // anlamına gelirdi. Taşınan (eski id'deki) emir KAZANMALI — bkz.
  // chatRepository.ts'teki "Rekey'in PK çatışması" notu.
  it('rekey hedefte ÇAKIŞAN (aynı kind) bir satır varsa PATLAMAZ; TAŞINAN emir KAZANIR', () => {
    const cmid = 'cmid-collide';
    upsertMessage(getChatDb(), msg('temp-1', { clientMessageId: cmid }), CONV, 'pending');
    // Taşınacak (eski id'deki) emir: TAZE niyet.
    upsertPendingMutation(
      row({
        message_id: 'temp-1',
        kind: 'reaction',
        payload_json: '{"desired":"😀","base":null}',
        attempts: 5,
        first_seen_at_ms: 1_000,
      }),
    );
    // Hedefte (sunucu id'sinde) ZATEN duran ÇAKIŞAN satır: ESKİ niyet.
    upsertPendingMutation(
      row({
        message_id: 'msg-real',
        kind: 'reaction',
        payload_json: '{"desired":"❤️","base":null}',
        attempts: 9,
        first_seen_at_ms: 500,
      }),
    );

    expect(() => {
      upsertMessage(getChatDb(), msg('msg-real', { clientMessageId: cmid }), CONV, 'sent');
    }).not.toThrow();

    const rows = readPendingMutations();
    // Çoğalma YOK: çakışan hedef satırı silinip taşınanın yerine geçti.
    expect(rows).toHaveLength(1);
    expect(rows[0].message_id).toBe('msg-real');
    expect(rows[0].kind).toBe('reaction');
    // TAŞINAN (eski id'deki, "taze niyet") kazandı — hedefte duran ESKİ
    // satırın verileri değil.
    expect(rows[0].payload_json).toBe('{"desired":"😀","base":null}');
    expect(rows[0].attempts).toBe(5);
    expect(rows[0].first_seen_at_ms).toBe(1_000);
  });

  it('rekey hedefte FARKLI kind\'tan bir satır varsa İKİSİNİ de korur (çakışma yok)', () => {
    const cmid = 'cmid-no-collide';
    upsertMessage(getChatDb(), msg('temp-1', { clientMessageId: cmid }), CONV, 'pending');
    upsertPendingMutation(row({ message_id: 'temp-1', kind: 'reaction' }));
    upsertPendingMutation(
      row({ message_id: 'msg-real', kind: 'delete', payload_json: '{"forEveryone":true}' }),
    );

    upsertMessage(getChatDb(), msg('msg-real', { clientMessageId: cmid }), CONV, 'sent');

    const rows = readPendingMutations();
    expect(rows).toHaveLength(2);
    expect(rows.map((r) => `${r.message_id}:${r.kind}`).sort()).toEqual([
      'msg-real:delete',
      'msg-real:reaction',
    ]);
  });

  it('upsertMessage rekey YOKKEN (aynı id) pending_mutations satırına DOKUNMUYOR', () => {
    insertMessage('msg-1', 'sent');
    upsertPendingMutation(row({ message_id: 'msg-1' }));

    upsertMessage(getChatDb(), msg('msg-1'), CONV, 'sent');

    expect(readPendingMutations()).toHaveLength(1);
    expect(readPendingMutations()[0].message_id).toBe('msg-1');
  });
});
