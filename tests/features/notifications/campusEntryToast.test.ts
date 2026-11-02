/**
 * ÖNPLAN KAMPÜS PUSH'U → IN-APP TOAST.
 *
 * Önplanda OS banner'ı bilerek kapalı (`shouldShowBanner:false`,
 * setNotificationHandler) ve `CampusMomentsNearby` için in-app gösterim YOKTU —
 * kullanıcı önplandayken "kampüse girdin, moment at" push'unu HİÇ görmüyordu.
 * Bu süit üç saf parçayı çiviler: payload filtresi (metin SUNUCUNUN, istemci
 * üretmez), dedupe penceresi (Android'de FCM onMessage + expo re-dispatch aynı
 * push'u iki kez düşürebilir) ve dokunuş hedefi (harita; akış kapalıysa
 * Bildirimler).
 */
const mockOpenFeed = jest.fn();
jest.mock('@/features/feed/feedEntry', () => ({
  openFeed: (...a: any[]) => mockOpenFeed(...a),
}));
const mockNavigate = jest.fn();
jest.mock('@/shared/services/navigationRef', () => ({
  navigationRef: { navigate: (...a: any[]) => mockNavigate(...a), isReady: () => true },
}));

import {
  campusEntryToastPayload,
  campusToastDedupeKey,
  openCampusMomentsSurface,
  shouldShowCampusToast,
} from '@/features/notifications/pushService';

describe('campusEntryToastPayload', () => {
  it("CampusMomentsNearby push'unu toast payload'ına çeviriyor (metin sunucunun, ham)", () => {
    expect(
      campusEntryToastPayload({
        title: 'Kampüstesin',
        body: '3 an paylaşıldı',
        data: { type: 'CampusMomentsNearby' },
      }),
    ).toEqual({ title: 'Kampüstesin', message: '3 an paylaşıldı' });
  });

  it('yalnız gövde yoksa başlık mesaj oluyor', () => {
    expect(
      campusEntryToastPayload({
        title: 'Kampüstesin',
        body: '  ',
        data: { type: 'CampusMomentsNearby' },
      }),
    ).toEqual({ message: 'Kampüstesin' });
  });

  it("boş metinli push'ta toast payload'ı null (metin ÜRETME yasağı)", () => {
    expect(
      campusEntryToastPayload({
        title: ' ',
        body: '',
        data: { type: 'CampusMomentsNearby' },
      }),
    ).toBeNull();
  });

  it('başka tipte null', () => {
    expect(
      campusEntryToastPayload({ title: 'x', body: 'y', data: { type: 'Like' } }),
    ).toBeNull();
  });
});

describe('dedupe penceresi', () => {
  it('aynı anahtar 5 sn içinde ikinci kez gösterilmiyor, pencere dışı gösteriliyor', () => {
    const key = campusToastDedupeKey({
      type: 'CampusMomentsNearby',
      campusDomain: 'bilgiedu.net',
      timestamp: 't1',
    });
    expect(shouldShowCampusToast(key, 1_000)).toBe(true);
    expect(shouldShowCampusToast(key, 3_000)).toBe(false);
    expect(shouldShowCampusToast(key, 7_000)).toBe(true);
  });

  it('farklı anahtar pencereye takılmıyor', () => {
    const a = campusToastDedupeKey({ type: 'CampusMomentsNearby', campusDomain: 'a', timestamp: 'x' });
    const b = campusToastDedupeKey({ type: 'CampusMomentsNearby', campusDomain: 'b', timestamp: 'x' });
    expect(a).not.toBe(b);
    expect(shouldShowCampusToast(a, 10_000)).toBe(true);
    expect(shouldShowCampusToast(b, 10_001)).toBe(true);
  });
});

describe('openCampusMomentsSurface', () => {
  beforeEach(() => {
    mockOpenFeed.mockReset();
    mockNavigate.mockReset();
  });

  it('akış açıksa harita yüzeyine gidiyor, Bildirimler çağrılmıyor', () => {
    mockOpenFeed.mockReturnValue(true);
    openCampusMomentsSurface();
    expect(mockOpenFeed).toHaveBeenCalledWith('feed', { expandMap: true });
    expect(mockNavigate).not.toHaveBeenCalled();
  });

  it("akış bayrağı kapalıysa Bildirimler'e düşüyor — ölü dokunuş yok", () => {
    mockOpenFeed.mockReturnValue(false);
    openCampusMomentsSurface();
    expect(mockNavigate).toHaveBeenCalledWith('Notifications');
  });
});
