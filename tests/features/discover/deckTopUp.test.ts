/**
 * "10 kişiyi beğendim, radar ekranı açıldı, yeni kartlar ancak birkaç saniye
 * sonra geldi."
 *
 * Takviye kararının sözleşmesi: deste BİTMEDEN yeni profil iste, ama isteği
 * kendi sonucuyla tetikleyip döngüye girme. Testler dört tuzağı koruyor:
 * (1) sonraki sayfa yokken de takviye olmalı (asıl yaşanan senaryo),
 * (2) aynı kuyrukla ikinci deneme yapılmamalı — sonsuz fetch döngüsü,
 * (3) uzunluk değil KİMLİK karşılaştırılmalı: refetch sayfayı değiştirir,
 *     yeni profil gelse de uzunluk aynı kalabilir,
 * (4) yapısal sebep / cooldown reddi imzayı yakmamalı, engel kalkınca tekrar
 *     denenebilmeli.
 */

import {
  decideTopUp,
  deckTailSignature,
  TOP_UP_COOLDOWN_MS,
  TOP_UP_THRESHOLD,
} from '@/features/discover/deckTopUp';

const ids = (n: number, offset = 0) =>
  Array.from({ length: n }, (_, i) => `u${i + offset}`);

const base = {
  isFetching: false,
  hasNextPage: false,
  refetchBlocked: false,
  lastSignature: null as string | null,
  msSinceLastRefetch: TOP_UP_COOLDOWN_MS,
};

describe('decideTopUp', () => {
  it('kuyruk doluyken denemeyi sıfırlar, istek atmaz', () => {
    expect(
      decideTopUp({ ...base, tailIds: ids(TOP_UP_THRESHOLD + 1) }),
    ).toEqual({ action: 'reset', signature: null });
  });

  it('sonraki sayfa varsa onu ekler', () => {
    const d = decideTopUp({
      ...base,
      tailIds: ids(TOP_UP_THRESHOLD),
      hasNextPage: true,
    });
    expect(d.action).toBe('next-page');
    expect(d.signature).toBe(deckTailSignature(ids(TOP_UP_THRESHOLD), true));
  });

  it('sonraki sayfa YOKKEN 1. sayfayı yeniden çeker — asıl kaçırılan durum', () => {
    expect(decideTopUp({ ...base, tailIds: ids(3) }).action).toBe('refetch');
  });

  it('deste boşalınca beklemeden takviye ister (5sn yoklamasını beklemez)', () => {
    expect(decideTopUp({ ...base, tailIds: [] }).action).toBe('refetch');
  });

  it('kuyruk 0 iken cooldown UYGULANMAZ — havuzu yeniden ürettiren istek bu', () => {
    // 5 kartı 4sn'den kısa sürede bitirmek olağan; asıl işe yarayan istek
    // (havuz boş → cache-miss → taze havuz) frene takılırsa radar geri gelir.
    expect(
      decideTopUp({ ...base, tailIds: [], msSinceLastRefetch: 0 }).action,
    ).toBe('refetch');
  });

  it('uçan istek varken araya girmez', () => {
    expect(
      decideTopUp({ ...base, tailIds: ids(2), isFetching: true }).action,
    ).toBe('none');
  });

  it('aynı kuyrukla ikinci kez denemez — sonsuz fetch döngüsü guard\'ı', () => {
    const first = decideTopUp({ ...base, tailIds: ids(3) });
    expect(first.action).toBe('refetch');
    expect(
      decideTopUp({ ...base, tailIds: ids(3), lastSignature: first.signature })
        .action,
    ).toBe('none');
  });

  it('uzunluk aynı kalsa da YENİ profil geldiyse tekrar takviye eder', () => {
    // Refetch sayfayı eklemez, DEĞİŞTİRİR: 3 kart yine 3 kart ama kimlikler
    // farklı. Uzunluk guard'ı burada yanlış negatif verirdi.
    const first = decideTopUp({ ...base, tailIds: ids(3) });
    expect(
      decideTopUp({
        ...base,
        tailIds: ids(3, 10),
        lastSignature: first.signature,
      }).action,
    ).toBe('refetch');
  });

  it('yapısal sebep varken refetch etmez ve imzayı yakmaz', () => {
    const d = decideTopUp({ ...base, tailIds: ids(2), refetchBlocked: true });
    expect(d).toEqual({ action: 'none', signature: null });
    // Sebep çözülünce aynı kuyruk için yeniden denenebilmeli.
    expect(decideTopUp({ ...base, tailIds: ids(2) }).action).toBe('refetch');
  });

  it('kuyrukta kart VARKEN cooldown dolmadan refetch tekrarlamaz, dolunca izin verir', () => {
    expect(
      decideTopUp({ ...base, tailIds: ids(2), msSinceLastRefetch: 100 }),
    ).toEqual({ action: 'none', signature: null });
    expect(
      decideTopUp({
        ...base,
        tailIds: ids(2),
        msSinceLastRefetch: TOP_UP_COOLDOWN_MS,
      }).action,
    ).toBe('refetch');
  });

  it('cooldown sonraki SAYFA yolunu engellemez — o ucuz ve sayfayı sona ekler', () => {
    expect(
      decideTopUp({
        ...base,
        tailIds: ids(2),
        hasNextPage: true,
        msSinceLastRefetch: 0,
      }).action,
    ).toBe('next-page');
  });
});
