/**
 * `register-and-complete` FormData'sının davet alanları.
 *
 * Sayım anı TAM BU İSTEK (plan §1.2): davet edilen profilini bitirdiği anda
 * davet "qualified" oluyor. İki alan da opsiyonel ve `put()` boş değeri
 * atlıyor — bu suite hem "kod varsa gider" hem de "kod yoksa alan HİÇ eklenmez"
 * tarafını kilitliyor (boş bir `ReferralCode` sunucuda doğrulama hatası olurdu).
 */

const mockPost = jest.fn();
// `axios.create` de mock'lanmalı: profileSlice dolaylı olarak shared/services/api'yi
// çekiyor ve o modül import anında bir instance kuruyor.
jest.mock('axios', () => ({
  __esModule: true,
  default: {
    post: (...a: any[]) => mockPost(...a),
    create: () => ({
      interceptors: {
        request: { use: jest.fn() },
        response: { use: jest.fn() },
      },
      get: jest.fn(),
      post: jest.fn(),
      put: jest.fn(),
      delete: jest.fn(),
    }),
  },
}));

jest.mock('@/shared/utils/installationId', () => ({
  getInstallationId: jest.fn(async () => 'install-123'),
}));

import { registerAndComplete } from '@/features/profile/profileSlice';

/**
 * FormData'yı `{ ad: [değerler] }` sözlüğüne çevirir.
 *
 * Jest ortamında global `FormData` web (undici) implementasyonu — RN'in
 * `_parts` dizisi YOK, `entries()` var.
 */
const fieldsOf = (formData: FormData): Record<string, string[]> => {
  const out: Record<string, string[]> = {};
  for (const [name, value] of formData.entries()) {
    (out[name] ??= []).push(String(value));
  }
  return out;
};

const baseState = (referralCode: string | null) => ({
  auth: {
    emailVerifiedToken: 'tok',
    registrationEmail: 'a@b.com',
    registrationForm: {
      firstName: 'Mert',
      gender: 'Male',
      dateOfBirth: '2000-01-01',
      password: 'pw',
      referralCode,
    },
  },
  profile: {
    height: '180',
    department: 'CS',
    yearOfStudy: '2',
    interestedIn: [],
    hobbies: [],
    prompts: [],
    ageRangeMin: 18,
    ageRangeMax: 30,
  },
});

const run = async (referralCode: string | null) => {
  const thunk = registerAndComplete({
    photos: [],
    mainPhotoIndex: 0,
    latitude: 41,
    longitude: 29,
  });
  await thunk(
    jest.fn(),
    () => baseState(referralCode) as any,
    undefined,
  );
  return fieldsOf(mockPost.mock.calls[0][1]);
};

beforeEach(() => {
  mockPost.mockReset();
  mockPost.mockResolvedValue({ status: 200, data: { isSuccess: true, result: {} } });
});

it('kod varken ReferralCode ve InstallationId gönderiyor', async () => {
  const fields = await run('AK7M2');
  expect(fields.ReferralCode).toEqual(['AK7M2']);
  expect(fields.InstallationId).toEqual(['install-123']);
});

it('kod yokken ReferralCode alanını HİÇ eklemiyor', async () => {
  const fields = await run(null);
  expect(fields.ReferralCode).toBeUndefined();
  // Kurulum kimliği yine gidiyor: kötüye kullanım freni koda bağlı değil,
  // "bu cihazdan daha önce davetli kayıt oldu mu" sorusuna bakıyor.
  expect(fields.InstallationId).toEqual(['install-123']);
});
