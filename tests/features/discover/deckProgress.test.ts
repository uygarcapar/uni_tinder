/**
 * "20 kart swipe edip çıktım, geri döndüğümde destenin başındaydım."
 *
 * Backend deste sırasını artık deterministik üretiyor; kaldığı yerden devam
 * etmek istemcinin işi. Buradaki testler sözleşmenin tuzaklarını koruyor:
 * (1) gün dönünce dünkü ilerleme UYGULANMAMALI — deste tazelendiği için yanlış
 * karta atlatır, (2) BAYAT swipe kaydı elemamalı: koruma yalnız commit yarışı
 * içindir, süresiz elerken tek bir uyuşmazlık desteyi gün boyu öldürüyordu,
 * (3) küme sınırsız büyümemeli, (4) bozuk kayıt çökmemeli.
 */

import {
  loadDeckProgress,
  saveDeckProgress,
  clearDeckProgress,
  dayStamp,
  SWIPE_GUARD_MS,
} from '@/features/discover/deckProgress';
import { appPrefs } from '@/shared/utils/appPrefs';

const USER = 'user-1';
const KEY = `discoverDeck:${USER}`;

beforeEach(() => {
  appPrefs.clearAll();
});

describe('deckProgress', () => {
  it('aynı gün içinde demiri ve TAZE swipe kayıtlarını geri verir', () => {
    const now = Date.now();
    saveDeckProgress(USER, {
      anchorUserId: 'top-card',
      swipes: [
        ['a', now],
        ['b', now],
      ],
    });
    expect(loadDeckProgress(USER)).toEqual({
      anchorUserId: 'top-card',
      swipes: [
        ['a', now],
        ['b', now],
      ],
    });
  });

  // Asıl regresyon: backend bir profili yeniden sunduğunda (test verisi, havuz
  // tazeleme, swipe POST'unun düşmesi) bayat ID onu sessizce gizliyordu. Aday
  // kalmayınca deste boşalıp radar ekranı gün boyu kilitleniyordu.
  it('pencere dışındaki swipe kaydını YÜKLEMEZ — bayat ID eleme yapmasın', () => {
    const stale = Date.now() - SWIPE_GUARD_MS - 1;
    saveDeckProgress(USER, {
      anchorUserId: 'top-card',
      swipes: [['eski', stale]],
    });
    // Demir korunur (kaldığı yeri o taşır), eleme kümesi düşer.
    expect(loadDeckProgress(USER)).toEqual({
      anchorUserId: 'top-card',
      swipes: [],
    });
  });

  it('taze ve bayat karışıkken yalnız tazeyi tutar', () => {
    const now = Date.now();
    saveDeckProgress(USER, {
      anchorUserId: 'x',
      swipes: [
        ['eski', now - SWIPE_GUARD_MS - 1],
        ['yeni', now],
      ],
    });
    expect(loadDeckProgress(USER).swipes).toEqual([['yeni', now]]);
  });

  it('eski şema (düz string dizisi) sessizce boşa düşer', () => {
    appPrefs.set(
      KEY,
      JSON.stringify({
        day: dayStamp(),
        anchorUserId: 'top-card',
        swipedUserIds: ['a', 'b'],
      }),
    );
    expect(loadDeckProgress(USER)).toEqual({
      anchorUserId: 'top-card',
      swipes: [],
    });
  });

  it('gün dönünce kaydı düşürür — dünkü demir bugünkü desteye uygulanmaz', () => {
    appPrefs.set(
      KEY,
      JSON.stringify({
        day: '2000-01-01',
        anchorUserId: 'dun-ki-kart',
        swipes: [['a', Date.now()]],
      }),
    );
    expect(loadDeckProgress(USER)).toEqual({
      anchorUserId: null,
      swipes: [],
    });
    // Kayıt bir daha parse edilmesin diye silinmiş olmalı.
    expect(appPrefs.getString(KEY)).toBeUndefined();
  });

  it('swipe kümesini 500 ile sınırlar ve EN SON swipe edilenleri tutar', () => {
    const now = Date.now();
    const swipes = Array.from(
      { length: 600 },
      (_, i) => [`u${i}`, now] as [string, number],
    );
    saveDeckProgress(USER, { anchorUserId: 'x', swipes });
    const loaded = loadDeckProgress(USER).swipes;
    expect(loaded).toHaveLength(500);
    expect(loaded[0][0]).toBe('u100');
    expect(loaded[499][0]).toBe('u599');
  });

  it('bozuk kayıtta çökmez, sıfırdan başlar', () => {
    appPrefs.set(KEY, '{bozuk json');
    expect(loadDeckProgress(USER)).toEqual({
      anchorUserId: null,
      swipes: [],
    });
  });

  it('userId yoksa ne okur ne yazar (oturum henüz oturmamış olabilir)', () => {
    saveDeckProgress(null, { anchorUserId: 'x', swipes: [['a', Date.now()]] });
    expect(appPrefs.getAllKeys()).toHaveLength(0);
    expect(loadDeckProgress(null)).toEqual({
      anchorUserId: null,
      swipes: [],
    });
  });

  it('kayıt hesap bazlı — başka kullanıcının ilerlemesi sızmaz', () => {
    saveDeckProgress(USER, { anchorUserId: 'a', swipes: [] });
    expect(loadDeckProgress('user-2').anchorUserId).toBeNull();
  });

  it('clearDeckProgress kaydı siler', () => {
    saveDeckProgress(USER, { anchorUserId: 'a', swipes: [] });
    clearDeckProgress(USER);
    expect(loadDeckProgress(USER).anchorUserId).toBeNull();
  });

  it('dayStamp yerel günü YYYY-MM-DD verir (UTC kaymasız)', () => {
    // Yerel saatle 1 Ocak 00:30 — UTC'de hâlâ 31 Aralık olabilir. Kova
    // kullanıcının günü olduğu için yerel tarih doğru cevap.
    expect(dayStamp(new Date(2026, 0, 1, 0, 30))).toBe('2026-01-01');
    expect(dayStamp(new Date(2026, 11, 9, 23, 45))).toBe('2026-12-09');
  });
});
