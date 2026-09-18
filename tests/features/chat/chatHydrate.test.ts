jest.mock('expo-sqlite');

import * as SQLite from 'expo-sqlite';
import { openChatDb, getChatDb, __resetChatDbForTests } from '@/features/chat/db/chatDb';
import { applyHistoryPage, upsertMessage } from '@/features/chat/chatRepository';
import {
  hasLocalHistory,
  hydrateConversation,
  loadOlderLocalFirst,
  HOT_WINDOW,
} from '@/features/chat/chatHydrate';
import { clear as clearMessageCache } from '@/features/chat/messageCache';
import chatReducer, {
  hydrateWindow,
  prependOlderFromLocal,
  setHistoryExhausted,
} from '@/features/chat/chatSlice';
import type { MessageDto } from '@/shared/types';

const { __resetAllDatabases } = SQLite as unknown as { __resetAllDatabases: () => void };

const CONV = 'conv-1';
const BASE = Date.UTC(2026, 8, 16, 10, 0, 0);

const msg = (n: number, over: Partial<MessageDto> = {}): MessageDto =>
  ({
    id: `m${n}`,
    conversationId: CONV,
    senderId: 'partner',
    content: `mesaj ${n}`,
    contentType: 0,
    sentAt: new Date(BASE + n * 60_000).toISOString(),
    ...over,
  }) as MessageDto;

const seed = (ns: number[]) => {
  const db = getChatDb();
  db.transaction(() => {
    for (const n of ns) upsertMessage(db, msg(n), CONV);
  });
};

/** Dispatch'leri toplayan sahte store. */
const collector = () => {
  const actions: any[] = [];
  return { dispatch: (a: any) => actions.push(a), actions };
};

beforeEach(() => {
  __resetChatDbForTests();
  __resetAllDatabases();
  clearMessageCache();
  openChatDb();
});

describe('hasLocalHistory', () => {
  it('boş arşivde false, doluda true', () => {
    expect(hasLocalHistory(CONV)).toBe(false);
    seed([1]);
    expect(hasLocalHistory(CONV)).toBe(true);
  });

  it('render sırasında çağrılabilir — dispatch ETMEZ', () => {
    seed([1]);
    const { dispatch, actions } = collector();
    hasLocalHistory(CONV);
    expect(actions).toHaveLength(0);
    void dispatch;
  });
});

describe('hydrateConversation', () => {
  it('sıcak pencereyi store\'a yazar (newest-first)', () => {
    seed([1, 2, 3]);
    const { dispatch, actions } = collector();

    expect(hydrateConversation(dispatch, CONV)).toBe(true);
    expect(actions).toHaveLength(1);
    expect(actions[0].type).toBe('chat/hydrateWindow');
    expect(actions[0].payload.messages.map((m: MessageDto) => m.id)).toEqual(['m3', 'm2', 'm1']);
  });

  it('arşiv boşsa false döner ve HİÇ dispatch etmez', () => {
    const { dispatch, actions } = collector();
    expect(hydrateConversation(dispatch, CONV)).toBe(false);
    expect(actions).toHaveLength(0);
  });

  it('pencere doluysa hasMore true — yerel dipte daha var', () => {
    seed(Array.from({ length: HOT_WINDOW + 5 }, (_, i) => i + 1));
    const { dispatch, actions } = collector();

    hydrateConversation(dispatch, CONV);

    expect(actions[0].payload.messages).toHaveLength(HOT_WINDOW);
    expect(actions[0].payload.hasMore).toBe(true);
  });

  it('sync_state\'ten cursor ve rematch kapısını taşır', () => {
    applyHistoryPage(
      CONV,
      { messages: [msg(2), msg(1)], nextCursor: 'c-deep', hasMore: true, hasHiddenHistory: true },
      { append: false },
    );
    const { dispatch, actions } = collector();

    hydrateConversation(dispatch, CONV);

    expect(actions[0].payload.nextCursor).toBe('c-deep');
    expect(actions[0].payload.hasHiddenHistory).toBe(true);
  });
});

describe('loadOlderLocalFirst', () => {
  it('yerelde eski satır varsa prependOlderFromLocal atar', () => {
    seed([1, 2, 3, 4]);
    const { dispatch, actions } = collector();

    const outcome = loadOlderLocalFirst(dispatch, CONV, msg(3), 10);

    expect(outcome).toBe('local');
    expect(actions[0].type).toBe('chat/prependOlderFromLocal');
    expect(actions[0].payload.messages.map((m: MessageDto) => m.id)).toEqual(['m2', 'm1']);
  });

  it('daha eski satır yoksa exhausted — dispatch YOK', () => {
    seed([1, 2]);
    const { dispatch, actions } = collector();

    expect(loadOlderLocalFirst(dispatch, CONV, msg(1), 10)).toBe('exhausted');
    expect(actions).toHaveLength(0);
  });

  it('gösterilen mesaj yoksa unavailable', () => {
    const { dispatch } = collector();
    expect(loadOlderLocalFirst(dispatch, CONV, undefined, 10)).toBe('unavailable');
  });

  it('nesne kimliği hydrate ile PAYLAŞILIR (projectRows aynı identity map)', () => {
    seed([1, 2, 3]);
    const hyd = collector();
    hydrateConversation(hyd.dispatch, CONV, 2); // yalnız m3, m2
    const m2FromWindow = hyd.actions[0].payload.messages.find((m: MessageDto) => m.id === 'm2');

    const older = collector();
    loadOlderLocalFirst(older.dispatch, CONV, msg(3), 10); // m2, m1
    const m2FromOlder = older.actions[0].payload.messages.find((m: MessageDto) => m.id === 'm2');

    // Aynı mesaj iki ayrı nesne olsaydı LegendList onu yapısal değişim sayardı.
    expect(m2FromOlder).toBe(m2FromWindow);
  });
});

describe('reducer: hydrateWindow', () => {
  const base = () => chatReducer(undefined, { type: '@@INIT' });

  it('bucket\'ı kurar', () => {
    const next = chatReducer(
      base(),
      hydrateWindow({
        conversationId: CONV,
        messages: [msg(2), msg(1)],
        nextCursor: 'c1',
        hasMore: true,
        hasHiddenHistory: false,
      }),
    );
    const bucket = next.messagesByConv[CONV];
    expect(bucket.messages.map((m) => m.id)).toEqual(['m2', 'm1']);
    expect(bucket.nextCursor).toBe('c1');
    expect(bucket.loading).toBe(false);
  });

  it('AYNI dizi referansıyla ikinci hydrate state\'i DEĞİŞTİRMEZ', () => {
    // projectWindow hiçbir şey değişmediyse aynı diziyi döndürüyor; Immer de
    // aynı değerin atanmasını değişiklik saymıyor. Zincirin sonucu: no-op
    // hydrate → messagesWithSeparators useMemo'su çalışmaz → LegendList uyumaya
    // devam eder.
    const messages = [msg(2), msg(1)];
    const action = hydrateWindow({
      conversationId: CONV,
      messages,
      nextCursor: 'c1',
      hasMore: true,
      hasHiddenHistory: false,
    });

    const first = chatReducer(base(), action);
    const second = chatReducer(first, action);

    expect(second).toBe(first);
    expect(second.messagesByConv[CONV].messages).toBe(messages);
  });
});

describe('reducer: prependOlderFromLocal', () => {
  const withWindow = () =>
    chatReducer(
      chatReducer(undefined, { type: '@@INIT' }),
      hydrateWindow({
        conversationId: CONV,
        messages: [msg(4), msg(3)],
        nextCursor: null,
        hasMore: true,
        hasHiddenHistory: false,
      }),
    );

  it('eskileri KUYRUĞA ekler (liste newest-first)', () => {
    const next = chatReducer(
      withWindow(),
      prependOlderFromLocal({ conversationId: CONV, messages: [msg(2), msg(1)] }),
    );
    expect(next.messagesByConv[CONV].messages.map((m) => m.id)).toEqual(['m4', 'm3', 'm2', 'm1']);
  });

  it('id ile dedupe eder', () => {
    const next = chatReducer(
      withWindow(),
      prependOlderFromLocal({ conversationId: CONV, messages: [msg(3), msg(2)] }),
    );
    expect(next.messagesByConv[CONV].messages.map((m) => m.id)).toEqual(['m4', 'm3', 'm2']);
  });

  it('loading bayrağına DOKUNMAZ', () => {
    const before = withWindow();
    const next = chatReducer(
      before,
      prependOlderFromLocal({ conversationId: CONV, messages: [msg(2)] }),
    );
    expect(next.messagesByConv[CONV].loading).toBe(false);
  });

  it('hepsi mükerrer ise state değişmez', () => {
    const before = withWindow();
    const next = chatReducer(
      before,
      prependOlderFromLocal({ conversationId: CONV, messages: [msg(4)] }),
    );
    expect(next).toBe(before);
  });
});

describe('reducer: setHistoryExhausted', () => {
  it('hasMore ve cursor\'ı indirir — sonsuz retry timer\'ını durduran şey bu', () => {
    const withWindow = chatReducer(
      chatReducer(undefined, { type: '@@INIT' }),
      hydrateWindow({
        conversationId: CONV,
        messages: [msg(1)],
        nextCursor: null,
        hasMore: true,
        hasHiddenHistory: false,
      }),
    );

    const next = chatReducer(withWindow, setHistoryExhausted(CONV));

    expect(next.messagesByConv[CONV].hasMore).toBe(false);
    expect(next.messagesByConv[CONV].nextCursor).toBeNull();
  });
});
