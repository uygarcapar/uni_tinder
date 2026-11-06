/**
 * Akış şikayeti — 2026-11-06 sözleşmesi: şikayet tek başına HİÇBİR şeyi
 * gizlemez; yalnız engel seçildiyse gönderi düşer ve liste tazelenir (sunucu
 * engellenen yazarın diğer gönderilerini süzüyor).
 *
 * Eskiden şikayet edilen gönderi koşulsuz cache'ten siliniyordu ve sunucu da
 * kalıcı gizliyordu → engel kaldırılsa bile gönderi bir daha dönmüyordu.
 */

const mockReport = jest.fn();
jest.mock('@/features/feed/feedService', () => ({
  __esModule: true,
  default: { report: (...a: any[]) => mockReport(...a) },
}));

import React from 'react';
import { act, renderHook } from '@testing-library/react-native';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { feedKeys } from '@/features/feed/feedKeys';
import { useFeedReport } from '@/features/feed/feedQueries';

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

const KEY = [...feedKeys.postsRoot, 'own', 'new'];
const page = (ids: string[]) => ({
  pages: [{ items: ids.map((id) => ({ id })), nextCursor: null, page: null, hasMore: false }],
  pageParams: [null],
});
const idsIn = (qc: QueryClient) =>
  (qc.getQueryData(KEY) as any).pages[0].items.map((i: any) => i.id);

const setup = () => {
  const qc = trackClient(new QueryClient({ defaultOptions: { queries: { gcTime: Infinity }, mutations: { gcTime: Infinity } } }));
  qc.setQueryData(KEY, page(['p1', 'p2']));
  const invalidate = jest.spyOn(qc, 'invalidateQueries');
  const wrapper = ({ children }: any) => (
    <QueryClientProvider client={qc}>{children}</QueryClientProvider>
  );
  const { result } = renderHook(() => useFeedReport(), { wrapper });
  return { qc, invalidate, result };
};

beforeEach(() => {
  mockReport.mockReset();
  mockReport.mockResolvedValue(undefined);
});

it('engelsiz şikayet gönderiyi listede bırakır ve listeyi tazelemez', async () => {
  const { qc, invalidate, result } = setup();
  await act(async () => {
    await result.current.mutateAsync({
      targetType: 'Post', postId: 'p1', reason: 'Spam', alsoBlock: false,
    } as any);
  });

  expect(idsIn(qc)).toEqual(['p1', 'p2']);
  expect(invalidate).not.toHaveBeenCalled();
});

it('engelli şikayet gönderiyi hemen düşürür ve akışı tazeler', async () => {
  const { qc, invalidate, result } = setup();
  await act(async () => {
    await result.current.mutateAsync({
      targetType: 'Post', postId: 'p1', reason: 'Spam', alsoBlock: true,
    } as any);
  });

  expect(idsIn(qc)).toEqual(['p2']);
  expect(invalidate).toHaveBeenCalledWith({ queryKey: feedKeys.postsRoot });
});
