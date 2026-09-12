jest.mock('lucide-react-native', () =>
  new Proxy({}, { get: () => () => null })
);

// Satırın ikonu SFIcon'dan geliyor; native sembol katmanı testte gereksiz.
jest.mock('@/shared/components/SFIcon', () => ({
  __esModule: true,
  default: () => null,
}));

const mockWasSelfieVerifiedBefore = jest.fn();
let mockAvailable = true;
jest.mock('@/features/profile/selfie/selfieAvailability', () => ({
  isSelfieFeatureAvailable: () => mockAvailable,
  wasSelfieVerifiedBefore: (...a: any[]) => mockWasSelfieVerifiedBefore(...a),
}));

jest.mock('@/shared/services/uiBus', () => ({
  __esModule: true,
  default: { on: () => () => {}, emit: jest.fn() },
}));

import { render, screen } from '@testing-library/react-native';
import SelfieVerificationRow from '@/features/profile/components/SelfieVerificationRow';

const RESET_AT = '2026-09-10T08:12:00Z';

beforeEach(() => {
  jest.clearAllMocks();
  mockAvailable = true;
  // Yerel bayrak BİLEREK "doğrulanmıştı" diyor: sunucu konuştuğunda bu
  // tahminin ezildiğini görebilelim.
  mockWasSelfieVerifiedBefore.mockReturnValue(true);
});

const renderRow = (profile: any) =>
  render(<SelfieVerificationRow profile={profile} userId="u1" />);

describe('SelfieVerificationRow — sıfırlanma kararı', () => {
  it('🔴 doğrulama yeni geçti ama profil bayat: "sıfırlandı" DEĞİL, idle', () => {
    // Sahadaki bug: `isSelfieVerified` henüz false (profil tazelenmedi) ama
    // sunucu sıfırlama OLMADIĞINI açıkça söylüyor. Eskiden yerel bayrak
    // devreye girip "ana fotoğrafın değişti" yazıyordu.
    renderRow({ user: { isSelfieVerified: false, selfieResetAt: null } });

    expect(screen.getByText('Fotoğrafını Doğrula')).toBeTruthy();
    expect(screen.queryByText('Doğrulaman sıfırlandı')).toBeNull();
  });

  it('sunucu tarih verdiyse "sıfırlandı" gösterilir', () => {
    renderRow({ user: { isSelfieVerified: false, selfieResetAt: RESET_AT } });

    expect(screen.getByText('Doğrulaman sıfırlandı')).toBeTruthy();
  });

  it('sunucu tarih verdiyse yerel bayrak "hayır" dese bile sunucu kazanır', () => {
    mockWasSelfieVerifiedBefore.mockReturnValue(false);
    renderRow({ user: { isSelfieVerified: false, selfieResetAt: RESET_AT } });

    expect(screen.getByText('Doğrulaman sıfırlandı')).toBeTruthy();
  });

  it('alan hiç gelmediyse (eski backend) yerel bayrağa düşer', () => {
    renderRow({ user: { isSelfieVerified: false } });

    expect(mockWasSelfieVerifiedBefore).toHaveBeenCalledWith('u1');
    expect(screen.getByText('Doğrulaman sıfırlandı')).toBeTruthy();
  });

  it('alan yok + yerel bayrak da yoksa idle', () => {
    mockWasSelfieVerifiedBefore.mockReturnValue(false);
    renderRow({ user: { isSelfieVerified: false } });

    expect(screen.getByText('Fotoğrafını Doğrula')).toBeTruthy();
  });

  it('doğrulanmışsa satır HİÇ çizilmez — rozet ismin yanında zaten var', () => {
    // Durum satırı kaldırıldı: kullanıcıya yapacak iş vermiyordu ve aynı bilgiyi
    // hero'daki rozetle ikinci kez söylüyordu.
    const tree = renderRow({ user: { isSelfieVerified: true, selfieResetAt: null } });

    expect(tree.toJSON()).toBeNull();
    expect(screen.queryByText('Fotoğrafın doğrulandı')).toBeNull();
  });

  it('doğrulanmışsa yerel "sıfırlanmıştı" bayrağına bakılmaz', () => {
    mockWasSelfieVerifiedBefore.mockReturnValue(true);
    const tree = renderRow({ user: { isSelfieVerified: true } });

    expect(tree.toJSON()).toBeNull();
  });
});

describe('SelfieVerificationRow — görünürlük kapıları', () => {
  it('isSelfieVerified alanı hiç yoksa satır çizilmez', () => {
    const tree = renderRow({ user: {} });
    expect(tree.toJSON()).toBeNull();
  });

  it('UT-6505 penceresi açıkken satır çizilmez', () => {
    mockAvailable = false;
    const tree = renderRow({ user: { isSelfieVerified: false, selfieResetAt: null } });
    expect(tree.toJSON()).toBeNull();
  });
});
