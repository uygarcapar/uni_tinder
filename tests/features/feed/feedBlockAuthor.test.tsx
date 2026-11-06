/**
 * Akış üç nokta menüsü — ŞİKAYETSİZ engel (2026-11-06).
 *
 *  • Satır yalnız başkasının KİMLİKLİ gönderisinde çizilir (anonimde `author`
 *    null → kimi engelleyeceğimizi bilmiyoruz; kendi gönderinde yalnız "Sil").
 *  • Engel YALNIZ `blockUser` çağırır — şikayet ucu hiç çağrılmaz.
 *  • Başarıda yazarın gönderileri cache'ten düşer ve ilişki yüzeyleri tazelenir.
 */

jest.mock('lucide-react-native', () =>
  new Proxy({}, { get: () => () => null })
);
jest.mock('@/shared/components/AppModal');
jest.mock('@/shared/components/SFIcon', () => {
  const React = require('react');
  const { View } = require('react-native');
  return { __esModule: true, default: () => React.createElement(View) };
});

const mockBlockUser = jest.fn();
const mockReportUser = jest.fn();
jest.mock('@/shared/services/moderationService', () => ({
  __esModule: true,
  default: {
    blockUser: (...a: any[]) => mockBlockUser(...a),
    reportUser: (...a: any[]) => mockReportUser(...a),
  },
}));
const mockFeedReport = jest.fn();
jest.mock('@/features/feed/feedService', () => ({
  __esModule: true,
  default: { report: (...a: any[]) => mockFeedReport(...a) },
}));

import React from 'react';
import { act, fireEvent, render, renderHook } from '@testing-library/react-native';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import FeedPostOptionsSheet from '@/features/feed/components/FeedPostOptionsSheet';
import { feedKeys } from '@/features/feed/feedKeys';
import { useFeedBlockAuthor } from '@/features/feed/feedQueries';
import { RELATION_SURFACE_KEYS } from '@/shared/services/relationSurfaces';

// gcTime: Infinity + afterEach clear — varsayılan 5 dk'lık gc zamanlayıcısı
// tek dosya koşusunda jest sürecini açık tutuyordu.
const clients: QueryClient[] = [];
const trackClient = (c: QueryClient) => {
  clients.push(c);
  return c;
};
afterEach(() => {
  clients.splice(0).forEach((c) => c.clear());
});

const post = (over: any = {}) => ({
  id: 'p1',
  isAnonymous: false,
  isMine: false,
  author: { userId: 'author-1', name: 'Ayşe' },
  createdAt: '2026-11-06T10:00:00Z',
  ...over,
});

const BLOCK = 'Kullanıcıyı Engelle';
const REPORT = 'Şikayet Et';

describe('FeedPostOptionsSheet — engel satırı', () => {
  const renderSheet = (p: any, handlers: any = {}) =>
    render(
      <FeedPostOptionsSheet visible onClose={jest.fn()} post={p} {...handlers} />,
    );

  it('kimlikli gönderide şikayet VE engel satırı çizer', () => {
    const tree = renderSheet(post());
    expect(tree.getByText(REPORT)).toBeTruthy();
    expect(tree.getByText(BLOCK)).toBeTruthy();
  });

  it('anonim gönderide engel satırı YOK, şikayet var', () => {
    const tree = renderSheet(post({ isAnonymous: true, author: null }));
    expect(tree.getByText(REPORT)).toBeTruthy();
    expect(tree.queryByText(BLOCK)).toBeNull();
  });

  it('kendi gönderimde ne şikayet ne engel var', () => {
    const tree = renderSheet(post({ isMine: true }));
    expect(tree.queryByText(REPORT)).toBeNull();
    expect(tree.queryByText(BLOCK)).toBeNull();
  });

  it('engel satırı menüyü kapatıp onBlock çağırır, onReport çağırmaz', () => {
    const onClose = jest.fn();
    const onBlock = jest.fn();
    const onReport = jest.fn();
    const tree = render(
      <FeedPostOptionsSheet
        visible
        onClose={onClose}
        post={post() as any}
        onBlock={onBlock}
        onReport={onReport}
      />,
    );
    fireEvent.press(tree.getByText(BLOCK));
    expect(onClose).toHaveBeenCalled();
    expect(onBlock).toHaveBeenCalledTimes(1);
    expect(onReport).not.toHaveBeenCalled();
  });
});

describe('useFeedBlockAuthor', () => {
  const KEY = [...feedKeys.postsRoot, 'own', 'new'];

  beforeEach(() => {
    mockBlockUser.mockReset().mockResolvedValue(undefined);
    mockReportUser.mockReset();
    mockFeedReport.mockReset();
  });

  it('yalnız engeller (şikayet YOK), yazarın gönderilerini düşürür ve yüzeyleri tazeler', async () => {
    const qc = trackClient(new QueryClient({ defaultOptions: { queries: { gcTime: Infinity }, mutations: { gcTime: Infinity } } }));
    qc.setQueryData(KEY, {
      pages: [{
        items: [
          { id: 'p1', author: { userId: 'author-1' } },
          { id: 'p2', author: { userId: 'author-2' } },
          { id: 'p3', author: { userId: 'author-1' } },
          { id: 'p4', author: null, isAnonymous: true },
        ],
        nextCursor: null, page: null, hasMore: false,
      }],
      pageParams: [null],
    });
    const invalidate = jest.spyOn(qc, 'invalidateQueries');
    const wrapper = ({ children }: any) => (
      <QueryClientProvider client={qc}>{children}</QueryClientProvider>
    );
    const { result } = renderHook(() => useFeedBlockAuthor(), { wrapper });

    await act(async () => {
      await result.current.mutateAsync({ authorId: 'author-1' });
    });

    expect(mockBlockUser).toHaveBeenCalledWith('author-1');
    expect(mockReportUser).not.toHaveBeenCalled();
    expect(mockFeedReport).not.toHaveBeenCalled();
    expect((qc.getQueryData(KEY) as any).pages[0].items.map((i: any) => i.id))
      .toEqual(['p2', 'p4']);
    const keys = invalidate.mock.calls.map(([f]: any) => JSON.stringify(f?.queryKey));
    for (const k of RELATION_SURFACE_KEYS) {
      expect(keys).toContain(JSON.stringify(k));
    }
  });

  it('engel başarısızsa cache değişmez', async () => {
    mockBlockUser.mockRejectedValue(new Error('boom'));
    const qc = trackClient(new QueryClient({ defaultOptions: { queries: { gcTime: Infinity }, mutations: { gcTime: Infinity } } }));
    const data = {
      pages: [{ items: [{ id: 'p1', author: { userId: 'author-1' } }], nextCursor: null, page: null, hasMore: false }],
      pageParams: [null],
    };
    qc.setQueryData(KEY, data);
    const wrapper = ({ children }: any) => (
      <QueryClientProvider client={qc}>{children}</QueryClientProvider>
    );
    const { result } = renderHook(() => useFeedBlockAuthor(), { wrapper });

    await act(async () => {
      await expect(result.current.mutateAsync({ authorId: 'author-1' })).rejects.toThrow('boom');
    });
    expect(qc.getQueryData(KEY)).toBe(data);
  });
});
