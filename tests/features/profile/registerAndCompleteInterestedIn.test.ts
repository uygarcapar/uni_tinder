/**
 * `register-and-complete` — Arkadaş kaydında `InterestedIn` ne zaman gidiyor.
 *
 * Kural eskiden basitti: "Arkadaş'ta HİÇ gitmez", çünkü o adım akışta yoktu ve
 * sunucu `InterestedInFlags`i varsayılan bırakıyordu. Artık adım Non-Binary
 * kullanıcıda havuz sorusu olarak akışta KALIYOR — ve koşulsuz düşürme,
 * kullanıcının verdiği cevabın sunucuya hiç ulaşmaması demek: soru sorulur,
 * cevaplanır, sessizce kaybolur.
 *
 * Boş dizi göndermemek hâlâ şart: sunucu "zorunlu alan boş" hatası üretir.
 */

const mockPost = jest.fn();
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

const fieldsOf = (formData: FormData): Record<string, string[]> => {
  const out: Record<string, string[]> = {};
  for (const [name, value] of formData.entries()) {
    (out[name] ??= []).push(String(value));
  }
  return out;
};

const stateFor = (
  mode: string,
  asksFriendsPool: boolean,
  interestedIn: number[],
) => ({
  auth: {
    emailVerifiedToken: 'tok',
    registrationEmail: 'a@b.com',
    registrationForm: {
      firstName: 'Mert',
      gender: 'Agender',
      dateOfBirth: '2000-01-01',
      password: 'pw',
      referralCode: null,
      mode,
      asksFriendsPool,
    },
  },
  profile: {
    height: '180',
    department: 'CS',
    yearOfStudy: '2',
    interestedIn,
    hobbies: [],
    prompts: [],
    ageRangeMin: 18,
    ageRangeMax: 30,
  },
});

const run = async (
  mode: string,
  asksFriendsPool: boolean,
  interestedIn: number[],
) => {
  const thunk = registerAndComplete({
    photos: [],
    mainPhotoIndex: 0,
    latitude: 41,
    longitude: 29,
  });
  await thunk(
    jest.fn(),
    () => stateFor(mode, asksFriendsPool, interestedIn) as any,
    undefined,
  );
  return fieldsOf(mockPost.mock.calls[0][1]);
};

beforeEach(() => {
  mockPost.mockReset();
  mockPost.mockResolvedValue({ status: 200, data: { isSuccess: true, result: {} } });
});

it('Arkadaş + havuz sorusu sorulduysa InterestedIn gidiyor', async () => {
  const fields = await run('Friends', true, [1, 2]);
  expect(fields.InterestedIn).toEqual(['1', '2']);
});

it('Arkadaş + havuz sorusu sorulmadıysa InterestedIn HİÇ gitmiyor', async () => {
  const fields = await run('Friends', false, [1]);
  expect(fields.InterestedIn).toBeUndefined();
});

it('Arkadaş + havuz sorusu sorulsa da seçim boşsa alan HİÇ gitmiyor', async () => {
  const fields = await run('Friends', true, []);
  expect(fields.InterestedIn).toBeUndefined();
});

it('Flört kaydında InterestedIn her zaman gidiyor', async () => {
  const fields = await run('Dating', false, [0]);
  expect(fields.InterestedIn).toEqual(['0']);
});
