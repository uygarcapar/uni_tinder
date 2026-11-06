/**
 * "Filtreyi gevşettim ama uygulamayı kapatıp açana kadar yeni profil gelmedi."
 *
 * Kullanıcının vakası: `interestedIn` yalnız Kadın → deste boş (bu doğru),
 * sonra Erkek de eklendi → PUT 200 döndü ama ekranda hâlâ boş deste.
 *
 * Sebep tek satırda saklı: deste sorgusunun anahtarı MOD BAŞINA ayrıldığında
 * (`["swipe","deck",mode]`) filtre kaydetme yolundaki invalidate eski
 * `["swipe","matches"]` anahtarında kaldı. İkisi prefix bile değil, yani
 * invalidate HİÇBİR sorguya değmiyor. Üstüne boş deste yoklaması da susuyor
 * (FiltersTooStrict/AllCandidatesSeen autoRetry taşımıyor → pollBlocked),
 * `staleTime` 60sn + `refetchOnMount:false` olduğu için tek kurtarıcı
 * uygulamayı yeniden başlatmak kalıyor.
 *
 * Bu yüzden test ANAHTAR ADINI değil DAVRANIŞI kilitliyor: canlı deste
 * cache'i gerçekten invalidated işaretlenmiş mi. Anahtar şeması bir daha
 * değişirse (ör. moda ek bir boyut) bu test yine yakalar.
 */
const mockPut = jest.fn();
jest.mock('@/shared/services/api', () => ({
  __esModule: true,
  default: {
    get: jest.fn(),
    put: (...args: any[]) => mockPut(...args),
  },
}));

jest.mock('react-redux', () => ({
  useSelector: () => false,
}));

import React from 'react';
import { renderHook, waitFor } from '@testing-library/react-native';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import {
  useSaveFilters,
  useSetIgnoreDistanceFilter,
} from '@/features/discover/swipeQueries';
import { swipeKeys } from '@/features/discover/swipeKeys';

const wrapper = (client: QueryClient) => {
  const Wrapper = ({ children }: { children: React.ReactNode }) =>
    React.createElement(QueryClientProvider, { client }, children);
  return Wrapper;
};

/** DiscoverScreen'in canlı destesini taklit eder: mod anahtarın İÇİNDE. */
const seedDecks = (client: QueryClient) => {
  client.setQueryData(swipeKeys.deck('Dating'), {
    pages: [{ profiles: [], hasNextPage: false, emptyReason: 'FiltersTooStrict' }],
    pageParams: [1],
  });
  client.setQueryData(swipeKeys.deck('Friends'), {
    pages: [{ profiles: [], hasNextPage: false }],
    pageParams: [1],
  });
};

const isInvalidated = (client: QueryClient, mode: string) =>
  client.getQueryState(swipeKeys.deck(mode))?.isInvalidated === true;

describe('filtre yazımı canlı desteyi bayatlatıyor', () => {
  let client: QueryClient;

  beforeEach(() => {
    mockPut.mockReset().mockResolvedValue({
      isSuccess: true,
      result: { maxDistance: 50 },
    });
    client = new QueryClient({
      defaultOptions: { queries: { retry: false }, mutations: { retry: false } },
    });
  });

  it('useSaveFilters: kaydetmeden sonra MOD BAŞINA deste invalidate olur', async () => {
    seedDecks(client);
    const { result } = renderHook(() => useSaveFilters(), {
      wrapper: wrapper(client),
    });

    // Kullanıcının yaptığı hamle: Kadın'a Erkek'i ekle (Men=0, Women=1).
    result.current.mutate({ interestedIn: [0, 1] });
    await waitFor(() => expect(result.current.isSuccess).toBe(true));

    // Filtre ucu MOD TAŞIMIYOR (PUT /swipe/Filters hesap geneli) — yani
    // kaydedilen tercih her iki destenin de havuzunu değiştiriyor, ikisi de
    // bayatlamalı. Yalnız aktif modu tazelemek, kullanıcı moda geçtiğinde
    // yine eski havuzu gösterirdi.
    expect(isInvalidated(client, 'Dating')).toBe(true);
    expect(isInvalidated(client, 'Friends')).toBe(true);
  });

  it('useSetIgnoreDistanceFilter: anahtar da aynı yoldan desteyi tazeler', async () => {
    // Boş deste kartındaki "Mesafe Sınırını Kaldır" butonunun tek işi bu;
    // invalidate düşerse buton görsel olarak çalışır ama deste değişmez.
    seedDecks(client);
    const { result } = renderHook(() => useSetIgnoreDistanceFilter(), {
      wrapper: wrapper(client),
    });

    result.current.mutate(true);
    await waitFor(() => expect(result.current.isSuccess).toBe(true));

    expect(isInvalidated(client, 'Dating')).toBe(true);
    expect(isInvalidated(client, 'Friends')).toBe(true);
  });
});
