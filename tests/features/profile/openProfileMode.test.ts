/**
 * "Arkadaş modu aynı cinsiyet olacaksa, tercihin gideceği bir yol olmalı."
 *
 * `/modes/{mode}/open` ucu `interestedIn`i zaten kabul ediyor ama Friends
 * dalı alanı GÖVDEYE HİÇ KOYMUYORDU — sunucu da yok sayıyordu. Non-Binary
 * kullanıcının havuz seçimi bu yoldan gidecek; ikili kategorilerde sunucu
 * kendi türetmesini yazdığı için istemci alanı boş bırakır ve o zaman alan
 * hiç gönderilmemeli (ölü yük).
 *
 * Dating dalı bu değişiklikten etkilenmiyor: orada `interestedIn` zaten
 * zorunlu (UT-2308) ve boş dizi olarak da gidiyor.
 */

const mockPost = jest.fn().mockResolvedValue({ result: { friends: true } });

jest.mock('@/shared/services/api', () => ({
  __esModule: true,
  default: {
    post: (...args: unknown[]) => mockPost(...args),
    get: jest.fn(),
    put: jest.fn(),
  },
}));

import profileService from '@/features/profile/profileService';

beforeEach(() => {
  mockPost.mockClear();
});

const bodyOf = () => mockPost.mock.calls[0][1] as Record<string, unknown>;

describe('openProfileMode — Friends dalı', () => {
  it('interestedIn verilmişse gövdeye giriyor', async () => {
    await profileService.openProfileMode('Friends', {
      intents: ['Hobby'],
      prompts: [],
      interestedIn: ['Women', 'NonBinary'],
    });

    expect(bodyOf()).toMatchObject({
      friendshipIntents: ['Hobby'],
      interestedIn: ['Women', 'NonBinary'],
    });
  });

  it('interestedIn verilmediyse alan HİÇ gönderilmiyor', async () => {
    await profileService.openProfileMode('Friends', {
      intents: ['Hobby'],
      prompts: [],
    });

    expect(bodyOf()).not.toHaveProperty('interestedIn');
  });

  it('interestedIn boş diziyse alan HİÇ gönderilmiyor', async () => {
    await profileService.openProfileMode('Friends', {
      intents: ['Hobby'],
      prompts: [],
      interestedIn: [],
    });

    expect(bodyOf()).not.toHaveProperty('interestedIn');
  });
});

describe('openProfileMode — Dating dalı değişmedi', () => {
  it('interestedIn ve relationshipIntent birlikte gidiyor', async () => {
    await profileService.openProfileMode('Dating', {
      intents: ['LongTerm'],
      prompts: [],
      interestedIn: ['Men'],
    });

    expect(bodyOf()).toMatchObject({
      interestedIn: ['Men'],
      relationshipIntent: 'LongTerm',
    });
  });

  it('interestedIn verilmediyse boş dizi olarak gidiyor', async () => {
    await profileService.openProfileMode('Dating', {
      intents: [],
      prompts: [],
    });

    expect(bodyOf()).toMatchObject({
      interestedIn: [],
      relationshipIntent: null,
    });
  });
});
