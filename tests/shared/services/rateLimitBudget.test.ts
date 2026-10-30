/**
 * Rate limit bütçesi yan kanalı.
 *
 * `MessagesController` tüm uçlarda tek bir 200 istek/60 sn kovasını paylaşıyor
 * ve sunucu kalanı `X-RateLimit-Remaining` header'ıyla bildiriyor. Bu modül
 * o değeri okuyup saklayan tek kaynak — backfill turunun "ne kadar kotam
 * kaldı" diye sorduğu yer burası.
 *
 * `remainingNow()` testlerinin odağı: değer bilinmiyorsa `null` dönmeli,
 * ASLA bir sayı (200 vb.) ya da `Infinity` varsayılmamalı — aksi halde
 * "bilmiyorum" ile "bol var" ayrımı kaybolur ve temkinli davranması gereken
 * taraf (`backfillPolicy.shouldStopRound`) güveniyormuş gibi davranır.
 */

import {
  recordRateLimitHeaders,
  remainingNow,
  __resetRateLimitBudgetForTests,
} from '@/shared/services/rateLimitBudget';

beforeEach(() => {
  __resetRateLimitBudgetForTests();
});

test('header’dan kalan kotayı okuyup saklıyor', () => {
  recordRateLimitHeaders({ 'x-ratelimit-remaining': '147' });

  expect(remainingNow()).toBe(147);
});

test('header yoksa null kalıyor — "bilmiyorum" ile "bol var" KARIŞMIYOR', () => {
  // Henüz hiçbir yanıt gelmedi — recordRateLimitHeaders hiç çağrılmadı.
  expect(remainingNow()).toBeNull();

  // Header'lar nesnesi var ama ilgili alan yok (ör. 404 yanıtı).
  recordRateLimitHeaders({ 'content-type': 'application/json' });
  expect(remainingNow()).toBeNull();

  // headers tamamen undefined (bazı mock'larda / network error yanıtlarında olur).
  recordRateLimitHeaders(undefined);
  expect(remainingNow()).toBeNull();
});

test('sayıya çevrilemeyen değeri null sayıyor', () => {
  recordRateLimitHeaders({ 'x-ratelimit-remaining': 'bol' });

  expect(remainingNow()).toBeNull();
});

test('boş string değeri 0 DEĞİL null sayıyor — Number(\'\') sessizce 0 verir', () => {
  recordRateLimitHeaders({ 'x-ratelimit-remaining': '' });

  expect(remainingNow()).toBeNull();
});

test('her yanıtta değeri GÜNCELLİYOR (en taze olan geçerli)', () => {
  recordRateLimitHeaders({ 'x-ratelimit-remaining': '150' });
  expect(remainingNow()).toBe(150);

  recordRateLimitHeaders({ 'x-ratelimit-remaining': '12' });
  expect(remainingNow()).toBe(12);
});

test('x-ratelimit-remaining büyük/küçük harf farkına dayanıklı', () => {
  // axios header'ları normalde lowercase verir ama mock'lar/başka istemciler
  // orijinal casing'i koruyabilir (ör. sunucu yanıtının ham hali).
  recordRateLimitHeaders({ 'X-RateLimit-Remaining': '42' });

  expect(remainingNow()).toBe(42);
});
