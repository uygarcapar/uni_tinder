/**
 * Bayrak kapalıyken giriş noktasının davranışı.
 *
 * Backend'de özellik `SelfieVerification:Enabled` arkasında ve bunu SORACAK bir
 * uç yok — tek sinyal `/start`'ın `UT-6505` (404) yanıtı. Buradaki iki söz:
 *
 *   • `UT-6505` sonrası giriş gizlenir ama KALICI DEĞİL: 24 saat sonra
 *     kendiliğinden geri gelir, yoksa bayrak açıldığında kullanıcı özelliği
 *     ancak uygulamayı silip kurarak görebilirdi.
 *   • "bir kez doğrulanmıştı" bayrağı userId ile anahtarlanır: appPrefs
 *     logout'ta bilerek silinmiyor, aynı cihazda başka hesap açan kişi
 *     "doğrulaman sıfırlandı" satırını GÖRMEMELİ.
 */

const mockStore = new Map<string, string | number | boolean>();

jest.mock('react-native-mmkv', () => ({
  createMMKV: () => ({
    set: (k: string, v: string | number | boolean) => mockStore.set(k, v),
    getString: (k: string) => {
      const v = mockStore.get(k);
      return typeof v === 'string' ? v : undefined;
    },
    getNumber: (k: string) => {
      const v = mockStore.get(k);
      return typeof v === 'number' ? v : undefined;
    },
    getBoolean: (k: string) => {
      const v = mockStore.get(k);
      return typeof v === 'boolean' ? v : undefined;
    },
    remove: (k: string) => mockStore.delete(k),
    clearAll: () => mockStore.clear(),
  }),
}));

import {
  clearSelfieUnavailable,
  isSelfieFeatureAvailable,
  markSelfieFeatureUnavailable,
  markSelfieWasVerified,
  wasSelfieVerifiedBefore,
} from '@/features/profile/selfie/selfieAvailability';
import { SELFIE_AVAILABILITY_EVENT } from '@/features/profile/selfie/selfieEvents';
import uiBus from '@/shared/services/uiBus';

beforeEach(() => {
  mockStore.clear();
  jest.restoreAllMocks();
});

describe('özellik erişilebilirliği', () => {
  it('hiç UT-6505 alınmadıysa açık', () => {
    expect(isSelfieFeatureAvailable()).toBe(true);
  });

  it('UT-6505 sonrası kapanır ve satırı tazelemek için olay yayınlanır', () => {
    const emit = jest.spyOn(uiBus, 'emit');
    markSelfieFeatureUnavailable();

    expect(isSelfieFeatureAvailable()).toBe(false);
    expect(emit).toHaveBeenCalledWith(SELFIE_AVAILABILITY_EVENT);
  });

  it('24 saat dolunca KENDİLİĞİNDEN geri gelir — kalıcı kilit yok', () => {
    markSelfieFeatureUnavailable();
    expect(isSelfieFeatureAvailable()).toBe(false);

    const dayLater = Date.now() + 24 * 60 * 60 * 1000 + 1;
    jest.spyOn(Date, 'now').mockReturnValue(dayLater);

    expect(isSelfieFeatureAvailable()).toBe(true);
  });

  it('clearSelfieUnavailable pencereyi hemen düşürür', () => {
    markSelfieFeatureUnavailable();
    clearSelfieUnavailable();
    expect(isSelfieFeatureAvailable()).toBe(true);
  });
});

describe('"bir kez doğrulanmıştı" bayrağı', () => {
  it('userId ile anahtarlanır — başka hesap bunu görmez', () => {
    markSelfieWasVerified('user-1');

    expect(wasSelfieVerifiedBefore('user-1')).toBe(true);
    expect(wasSelfieVerifiedBefore('user-2')).toBe(false);
  });

  it('userId yoksa ne yazar ne okur', () => {
    markSelfieWasVerified(null);
    expect(wasSelfieVerifiedBefore(null)).toBe(false);
    expect(wasSelfieVerifiedBefore(undefined)).toBe(false);
  });
});
