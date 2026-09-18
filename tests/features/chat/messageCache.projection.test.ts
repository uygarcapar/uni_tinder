import {
  projectRow,
  projectWindow,
  rekey,
  clear,
  clearConversation,
} from '@/features/chat/messageCache';
import type { MessageRow } from '@/features/chat/db/rows';

const CONV = 'conv-1';

const row = (over: Partial<MessageRow> = {}): MessageRow => ({
  id: 'm1',
  conversation_id: CONV,
  client_message_id: null,
  sender_id: 'partner',
  content: 'merhaba',
  content_type: 0,
  sent_at: '2026-09-16T10:00:00.000Z',
  sent_at_ms: Date.UTC(2026, 8, 16, 10, 0, 0),
  read_at: null,
  delivered_at: null,
  edited_at: null,
  deleted_at: null,
  deleted_for_everyone: 0,
  media_url: null,
  duration_ms: null,
  waveform_peaks: null,
  reply_to_message_id: null,
  reply_to_json: null,
  reactions_json: null,
  is_system_message: 0,
  is_sender_deleted: 0,
  localization_key: null,
  send_state: 'sent',
  local_uri: null,
  row_version: 1,
  ...over,
});

const window = (n: number) =>
  Array.from({ length: n }, (_, i) =>
    row({ id: `m${i}`, sent_at_ms: Date.UTC(2026, 8, 16, 10, 0, 0) + i * 1000 }),
  );

beforeEach(() => clear());

describe('projectRow — row_version hızlı yolu', () => {
  it('aynı sürümde AYNI nesneyi döndürür', () => {
    const first = projectRow(CONV, row());
    const second = projectRow(CONV, row());
    expect(second).toBe(first);
  });

  it('sürüm aynıyken satır içeriği değişse bile YENİDEN KURMAZ', () => {
    // Hızlı yolun gerçekten sürüme baktığının kanıtı: içerik farklı ama
    // row_version aynı → eski nesne döner. Üretimde bu durum oluşamaz, çünkü
    // her UPDATE row_version'ı artırmak ZORUNDA.
    const first = projectRow(CONV, row({ content: 'merhaba' }));
    const second = projectRow(CONV, row({ content: 'BAŞKA ŞEY' }));
    expect(second).toBe(first);
    expect(second.content).toBe('merhaba');
  });

  it('sürüm artıp içerik değişince YENİ nesne üretir', () => {
    const first = projectRow(CONV, row());
    const second = projectRow(CONV, row({ content: 'düzeltildi', row_version: 2 }));
    expect(second).not.toBe(first);
    expect(second.content).toBe('düzeltildi');
  });

  it('sürüm arttı ama gözlenebilir hiçbir şey değişmediyse ESKİ nesneyi korur', () => {
    const first = projectRow(CONV, row());
    const second = projectRow(CONV, row({ row_version: 2 }));
    expect(second).toBe(first);
  });
});

describe('projectRow — iç referansların geri takılması', () => {
  it('reactions içeriği aynıysa DİZİ referansı korunur', () => {
    const reactions_json = JSON.stringify([{ emoji: '🔥', count: 1, userIds: ['u1'] }]);
    const first = projectRow(CONV, row({ reactions_json }));
    // İçerik değişti (sürüm arttı) ama reactions aynı → yeni nesne, eski dizi.
    const second = projectRow(CONV, row({ reactions_json, content: 'yeni', row_version: 2 }));

    expect(second).not.toBe(first);
    expect(second.reactions).toBe(first.reactions);
  });

  it('reactions gerçekten değişince yeni dizi gelir', () => {
    const first = projectRow(
      CONV,
      row({ reactions_json: JSON.stringify([{ emoji: '🔥', count: 1, userIds: ['u1'] }]) }),
    );
    const second = projectRow(
      CONV,
      row({
        reactions_json: JSON.stringify([{ emoji: '🔥', count: 2, userIds: ['u1', 'u2'] }]),
        row_version: 2,
      }),
    );
    expect(second.reactions).not.toBe(first.reactions);
    expect(second.reactions?.[0].count).toBe(2);
  });

  it('replyTo içeriği aynıysa nesne referansı korunur', () => {
    const reply_to_json = JSON.stringify({ id: 'm0', senderDisplayName: 'Ada' });
    const first = projectRow(CONV, row({ reply_to_json, reply_to_message_id: 'm0' }));
    const second = projectRow(
      CONV,
      row({ reply_to_json, reply_to_message_id: 'm0', content: 'yeni', row_version: 2 }),
    );
    expect(second.replyTo).toBe(first.replyTo);
  });

  it('bozuk JSON sohbeti patlatmaz', () => {
    expect(() => projectRow(CONV, row({ reactions_json: '{bozuk', reply_to_json: ']['}))).not.toThrow();
    const projected = projectRow(CONV, row({ reactions_json: '{bozuk', row_version: 9 }));
    expect(projected.reactions).toBeUndefined();
  });
});

describe('projectWindow — dizi kimliği', () => {
  it('hiçbir şey değişmediyse ÖNCEKİ DİZİYİ döndürür', () => {
    const rows = window(5);
    const first = projectWindow(CONV, rows);
    const second = projectWindow(CONV, window(5));

    expect(second).toBe(first);
    second.forEach((m, i) => expect(m).toBe(first[i]));
  });

  it('tek alan değişince TAM BİR eleman kimlik değiştirir, diğerleri durur', () => {
    const first = projectWindow(CONV, window(5));

    const changed = window(5);
    changed[2] = { ...changed[2], read_at: '2026-09-16T11:00:00.000Z', row_version: 2 };
    const second = projectWindow(CONV, changed);

    expect(second).not.toBe(first);
    const moved = second.filter((m, i) => m !== first[i]);
    expect(moved).toHaveLength(1);
    expect(second[2].readAt).toBe('2026-09-16T11:00:00.000Z');
  });

  it('uzunluk değişince yeni dizi döner ama ortak elemanlar korunur', () => {
    const first = projectWindow(CONV, window(3));
    const second = projectWindow(CONV, window(4));

    expect(second).not.toBe(first);
    expect(second[0]).toBe(first[0]);
    expect(second[1]).toBe(first[1]);
    expect(second[2]).toBe(first[2]);
  });
});

describe('rekey — temp id → server id', () => {
  const keyExtractor = (m: { clientMessageId?: string; id: string }) => m.clientMessageId || m.id;

  it('nesne taşınır ve sonraki projeksiyon GERÇEK id ile gelir', () => {
    const temp = projectRow(
      CONV,
      row({ id: 'temp-x', client_message_id: 'cmid-x', send_state: 'pending' }),
    );
    expect(temp.id).toBe('temp-x');

    rekey(CONV, 'temp-x', 'srv-1');

    // Sürüm taşınmadığı için yeniden kurulur — bayat `temp-` id'si dönmez.
    const acked = projectRow(CONV, row({ id: 'srv-1', client_message_id: 'cmid-x' }));
    expect(acked.id).toBe('srv-1');
    expect(acked._pending).toBe(false);
  });

  it('liste anahtarı değişmez (keyExtractor cmid\'e bakıyor)', () => {
    const temp = projectRow(
      CONV,
      row({ id: 'temp-x', client_message_id: 'cmid-x', send_state: 'pending' }),
    );
    rekey(CONV, 'temp-x', 'srv-1');
    const acked = projectRow(CONV, row({ id: 'srv-1', client_message_id: 'cmid-x' }));

    expect(keyExtractor(acked)).toBe(keyExtractor(temp));
    expect(keyExtractor(acked)).toBe('cmid-x');
  });

  it('bilinmeyen id\'de sessizce hiçbir şey yapmaz', () => {
    expect(() => rekey(CONV, 'yok', 'srv-9')).not.toThrow();
  });
});

describe('temizlik', () => {
  it('clearConversation yalnız o sohbeti düşürür', () => {
    const a = projectRow('conv-a', row());
    const b = projectRow('conv-b', row());

    clearConversation('conv-a');

    expect(projectRow('conv-a', row())).not.toBe(a);
    expect(projectRow('conv-b', row())).toBe(b);
  });

  it('clear() her şeyi düşürür — logout\'ta önceki kullanıcının mesajları heap\'te kalmamalı', () => {
    const first = projectRow(CONV, row());
    clear();
    expect(projectRow(CONV, row())).not.toBe(first);
  });
});
