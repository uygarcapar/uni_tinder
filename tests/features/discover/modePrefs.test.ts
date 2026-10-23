/**
 * Mod tercihi (Flört / Arkadaş) — kalıcılık ve "SEÇİM VAR MI" ayrımı.
 *
 * Test edilen asıl şey `peekAppMode`in `loadAppMode`ten farkı: ikisi de
 * Dating döndürebiliyor ama anlamları ayrı — biri "kullanıcı Flört seçti",
 * öbürü "hiç seçim yok, varsayılan Flört". Keşif'in açık mod uzlaştırması tam
 * bu ayrıma dayanıyor: seçim yoksa kullanıcının sahip olmadığı modda açmamak
 * için açık moda kayıyor, seçim VARSA dokunmuyor.
 *
 * Arkadaş olarak kaydolan kullanıcının Keşif'i "Flört" başlığıyla açması tam
 * olarak bu seçimin hiç yazılmamasıydı (kayıt adımı redux'a yazıp diske
 * yazmıyordu).
 */

import { appPrefs } from '@/shared/utils/appPrefs';
import { loadAppMode, peekAppMode, saveAppMode } from '@/features/discover/modePrefs';
import { APP_MODE_EVENT, writeAppMode } from '@/features/discover/useAppMode';
import uiBus from '@/shared/services/uiBus';

const USER = 'user-1';
const KEY = `appMode:${USER}`;

beforeEach(() => {
  appPrefs.clearAll?.();
});

describe('modePrefs', () => {
  it('yazılan mod aynı kullanıcı için geri okunuyor', () => {
    saveAppMode(USER, 'Friends');
    expect(loadAppMode(USER)).toBe('Friends');
    expect(peekAppMode(USER)).toBe('Friends');
  });

  it('anahtar userId ile scope’lu — başka kullanıcıya sızmıyor', () => {
    saveAppMode(USER, 'Friends');
    expect(peekAppMode('user-2')).toBeNull();
    expect(loadAppMode('user-2')).toBe('Dating');
  });

  it('yazılmamışken load Dating, peek null', () => {
    expect(loadAppMode(USER)).toBe('Dating');
    expect(peekAppMode(USER)).toBeNull();
  });

  it('userId yokken yazma no-op, okuma varsayılan', () => {
    saveAppMode(undefined, 'Friends');
    expect(peekAppMode(undefined)).toBeNull();
    expect(loadAppMode(undefined)).toBe('Dating');
  });

  it('bozuk JSON / eski şema / bilinmeyen değer = seçim yok', () => {
    appPrefs.set(KEY, '{bozuk');
    expect(peekAppMode(USER)).toBeNull();

    appPrefs.set(KEY, JSON.stringify({ v: 0, mode: 'Friends' }));
    expect(peekAppMode(USER)).toBeNull();

    // Bilinmeyen değer sorgu parametresine girmemeli (sunucu 400 döner).
    appPrefs.set(KEY, JSON.stringify({ v: 1, mode: 'Hookup' }));
    expect(peekAppMode(USER)).toBeNull();
    expect(loadAppMode(USER)).toBe('Dating');
  });
});

/**
 * Hook'suz yazma — bildirimden mod devri bu yolu kullanıyor
 * (`AppNavigator > routeFromNotification`).
 *
 * Kritik olan DÖNÜŞ DEĞERİ: çağıran buna bakıp ikinci bir tazeleme atıp
 * atmayacağına karar veriyor. "Aynı moda geç" olayı atarsa Beğeniler iki
 * listesini boşuna boşaltıp yeniden çeker.
 */
describe('writeAppMode', () => {
  it('mod değişince diske yazıp olay atıyor ve true dönüyor', () => {
    const seen: unknown[] = [];
    const off = uiBus.on(APP_MODE_EVENT, (p: unknown) => seen.push(p));
    try {
      expect(writeAppMode(USER, 'Friends')).toBe(true);
      expect(peekAppMode(USER)).toBe('Friends');
      expect(seen).toEqual([{ mode: 'Friends' }]);
    } finally {
      off();
    }
  });

  it('değer AYNIysa olay ATMIYOR ve false dönüyor', () => {
    saveAppMode(USER, 'Friends');
    const seen: unknown[] = [];
    const off = uiBus.on(APP_MODE_EVENT, (p: unknown) => seen.push(p));
    try {
      expect(writeAppMode(USER, 'Friends')).toBe(false);
      expect(seen).toEqual([]);
    } finally {
      off();
    }
  });

  it('seçim HİÇ yokken varsayılan moda yazmak da bir değişim', () => {
    // Disk boş + "Dating" yazımı: peek null olduğu için gerçek bir seçim
    // kaydediliyor, olay da atılıyor.
    expect(writeAppMode(USER, 'Dating')).toBe(true);
    expect(peekAppMode(USER)).toBe('Dating');
  });

  it('bilinmeyen değer yazılmıyor', () => {
    expect(writeAppMode(USER, 'Hookup' as any)).toBe(false);
    expect(peekAppMode(USER)).toBeNull();
  });
});
