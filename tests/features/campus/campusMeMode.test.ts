/**
 * `/campus/me` MOD BAŞINA — günlük an hakkı mod'lu, beğeni kotası küresel.
 *
 * Backend kararı (2026-10-30): an hakkı iki modun izleyicisi ayrık olduğu için
 * mod başına sayılıyor; beğeni kotası `DailySwipeCount` emsaliyle KÜRESEL
 * kalıyor ve `?mode=` ne olursa olsun aynı sayıyı döndürüyor.
 *
 * Bu ikisi aynı yanıtın içinde olduğu için istemcide iki ayrı tazeleme yolu
 * doğuyor ve test edilen asıl şey bu ayrım:
 *   • paylaşım / silme → YALNIZ o modun anahtarı (öbür modun `postedToday`si
 *     hâlâ doğru, gereksiz bir GET açılmasın),
 *   • beğeni → KÖK (iki modun kopyasındaki `decisionsRemaining` birden
 *     bayatlıyor; tek modu düşürmek öbür moda geçen kullanıcıya harcanmış
 *     hakkı duruyormuş gibi gösterirdi).
 *
 * Silmenin modu SUNUCUDAN geliyor, anın cache'inden türetilmiyor: silinmiş
 * satır `UT-7420` ile geri okunamıyor, yani kart cache'ten düşmüş bir yolda
 * (süre dolması, başka cihaz) istemcinin modu öğrenebileceği başka uç yok.
 */

const mockGet = jest.fn();
const mockDelete = jest.fn();

jest.mock('@/shared/services/api', () => ({
  __esModule: true,
  default: {
    get: (...args: unknown[]) => mockGet(...args),
    delete: (...args: unknown[]) => mockDelete(...args),
  },
}));
// `campusService` → `expo-file-system` (S3 yüklemesi). Bu testin ona işi yok
// ve modül çıplak jest ortamında açılmıyor.
jest.mock('expo-file-system', () => ({
  __esModule: true,
  File: class {},
  UploadType: { BINARY_CONTENT: 'BINARY_CONTENT' },
}));

import { QueryClient } from '@tanstack/react-query';
import { campusKeys } from '@/features/campus/campusKeys';
import { invalidateCampusMe } from '@/features/campus/campusQueries';
import { campusService } from '@/features/campus/campusService';

const urlOf = (call: unknown[]) => String(call[0]);

/** İki modun `/me` kopyasını da cache'e koy ve bayatlamayanları ölç. */
const seedBothModes = () => {
  // `gcTime: Infinity` → cache girdisi için zamanlayıcı KURULMUYOR. Varsayılan
  // 5 dakikalık gc, test bittikten sonra da açık bir handle bırakıyor ve jest
  // "did not exit" diye asılı kalıyor.
  const qc = new QueryClient({
    defaultOptions: { queries: { gcTime: Infinity } },
  });
  qc.setQueryData(campusKeys.me('Dating'), { postedToday: true });
  qc.setQueryData(campusKeys.me('Friends'), { postedToday: false });
  return qc;
};

const isStale = (qc: QueryClient, mode: string) =>
  qc.getQueryState(campusKeys.me(mode))?.isInvalidated === true;

beforeEach(() => {
  mockGet.mockReset();
  mockGet.mockResolvedValue({ isSuccess: true, result: { postedToday: false } });
  mockDelete.mockReset();
  mockDelete.mockResolvedValue({ isSuccess: true, result: { mode: 'Dating' } });
});

describe('campusKeys.me — mod anahtarın içinde', () => {
  it('iki mod ayrı anahtar', () => {
    expect(campusKeys.me('Dating')).not.toEqual(campusKeys.me('Friends'));
  });

  it('kök ikisinin de ön eki — toptan tazeleme tek çağrıyla', () => {
    const qc = seedBothModes();
    qc.invalidateQueries({ queryKey: campusKeys.meRoot });
    expect(isStale(qc, 'Dating')).toBe(true);
    expect(isStale(qc, 'Friends')).toBe(true);
  });
});

describe('invalidateCampusMe', () => {
  it('mod verilince YALNIZ o modu tazeler', () => {
    const qc = seedBothModes();
    invalidateCampusMe(qc, 'Dating');
    expect(isStale(qc, 'Dating')).toBe(true);
    // Friends'in `postedToday`si bu paylaşımdan etkilenmedi: an hakkı mod
    // başına, yani onu da düşürmek bedava bir GET demek olurdu.
    expect(isStale(qc, 'Friends')).toBe(false);
  });

  it('mod yoksa iki modu birden tazeler — beğeni kotası KÜRESEL', () => {
    const qc = seedBothModes();
    invalidateCampusMe(qc, null);
    expect(isStale(qc, 'Dating')).toBe(true);
    expect(isStale(qc, 'Friends')).toBe(true);
  });
});

describe('campusService.getMe — mod parametresi', () => {
  it('modu query string olarak gönderir', async () => {
    await campusService.getMe('Friends');
    expect(urlOf(mockGet.mock.calls[0])).toContain('mode=Friends');
  });

  it('mod boşsa parametre HİÇ gitmiyor', async () => {
    // Boş string sunucuda enum çözümlemesini patlatıyor (`getMoments` ve
    // `passMoment` ile aynı kural); parametresiz çağrı sunucuda Dating.
    await campusService.getMe(null);
    expect(urlOf(mockGet.mock.calls[0])).not.toContain('mode');
  });
});

describe('campusService.deleteMoment — silinen anın modu', () => {
  it('yanıttaki modu döndürür', async () => {
    await expect(campusService.deleteMoment('9381')).resolves.toEqual({
      mode: 'Dating',
    });
  });

  it('eski sunucu modu dönmezse `null` — çağıran köke düşsün', async () => {
    mockDelete.mockResolvedValue({ isSuccess: true, result: null });
    await expect(campusService.deleteMoment('9381')).resolves.toEqual({
      mode: null,
    });
  });
});
