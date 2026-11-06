/**
 * `/modes/{mode}/open` — artık HER ZAMAN multipart (kanonik content-type,
 * BE sözleşmesi §4). Alan adları sözleşme örneğinden: `PhotoIds[i]`,
 * `MainPhotoId`, `FriendshipIntents[i]`, `InterestedIn[i]`,
 * `RelationshipIntent`, `Prompts[i].PromptKey/.Answer`, `NewPhotos`
 * (tekrarlı dosya alanı).
 *
 * Eski JSON sözleşmesinin iki kuralı FormData'da da korunuyor:
 *  • Friends'te boş `interestedIn` alanı HİÇ eklenmez (kilitli kullanıcıda
 *    ölü yük / "hiçbirini seçmedi" yanlış okuması).
 *  • `photos` verilmemişse ne `PhotoIds` ne `NewPhotos` gider —
 *    havuz-güncelleme yolu açık profilin fotoğraflarına DOKUNMAZ
 *    ("gönderilmeyen alana dokunulmaz").
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

/**
 * Jest'in node ortamındaki FormData (undici) dosya objesini "[object Object]"e
 * eziyor — runtime'daki RN polyfill'i ise parçaları olduğu gibi tutuyor.
 * Append çağrılarını kaydeden RN-benzeri stub: test, servis gövdesinin
 * KURULUŞUNU (alan adı + sıra + değer) doğruluyor, taşıma katmanını değil.
 */
class FakeFormData {
  parts: Array<[string, unknown]> = [];
  append(name: string, value: unknown) {
    this.parts.push([name, value]);
  }
}
const realFormData = (global as any).FormData;
beforeAll(() => {
  (global as any).FormData = FakeFormData;
});
afterAll(() => {
  (global as any).FormData = realFormData;
});

beforeEach(() => {
  mockPost.mockClear();
});

const partsOf = (): Array<[string, unknown]> => {
  const fd = mockPost.mock.calls[0][1] as any;
  expect(fd).toBeInstanceOf(FakeFormData);
  return fd.parts;
};
const names = () => partsOf().map(([n]) => n);
const valueOf = (name: string) => partsOf().find(([n]) => n === name)?.[1];

describe('openProfileMode — Friends dalı', () => {
  it('interestedIn verilmişse FriendshipIntents ve InterestedIn alanları gidiyor', async () => {
    await profileService.openProfileMode('Friends', {
      intents: ['Hobby'],
      prompts: [{ promptKey: 'k1', answer: 'a1' }],
      interestedIn: ['Women', 'NonBinary'],
    });

    expect(valueOf('FriendshipIntents[0]')).toBe('Hobby');
    expect(valueOf('InterestedIn[0]')).toBe('Women');
    expect(valueOf('InterestedIn[1]')).toBe('NonBinary');
    expect(valueOf('Prompts[0].PromptKey')).toBe('k1');
    expect(valueOf('Prompts[0].Answer')).toBe('a1');
  });

  it('interestedIn verilmediyse alan HİÇ gönderilmiyor', async () => {
    await profileService.openProfileMode('Friends', {
      intents: ['Hobby'],
      prompts: [],
    });

    expect(names().some((n) => n.startsWith('InterestedIn'))).toBe(false);
  });

  it('interestedIn boş diziyse alan HİÇ gönderilmiyor', async () => {
    await profileService.openProfileMode('Friends', {
      intents: ['Hobby'],
      prompts: [],
      interestedIn: [],
    });

    expect(names().some((n) => n.startsWith('InterestedIn'))).toBe(false);
  });
});

describe('openProfileMode — Dating dalı', () => {
  it('InterestedIn ve RelationshipIntent birlikte gidiyor', async () => {
    await profileService.openProfileMode('Dating', {
      intents: ['LongTerm'],
      prompts: [],
      interestedIn: ['Men'],
    });

    expect(valueOf('InterestedIn[0]')).toBe('Men');
    expect(valueOf('RelationshipIntent')).toBe('LongTerm');
  });

  it('niyet yoksa RelationshipIntent alanı eklenmiyor (null form alanı olmaz)', async () => {
    await profileService.openProfileMode('Dating', {
      intents: [],
      prompts: [],
      interestedIn: ['Men'],
    });

    expect(names()).not.toContain('RelationshipIntent');
  });
});

describe('openProfileMode — foto seçimi', () => {
  it('kind:existing → PhotoIds sıralı + MainPhotoId, NewPhotos yok', async () => {
    await profileService.openProfileMode('Friends', {
      intents: ['Hobby'],
      prompts: [],
      photos: { kind: 'existing', photoIds: ['p1', 'p2'], mainPhotoId: 'p1' },
    });

    expect(valueOf('PhotoIds[0]')).toBe('p1');
    expect(valueOf('PhotoIds[1]')).toBe('p2');
    expect(valueOf('MainPhotoId')).toBe('p1');
    expect(names()).not.toContain('NewPhotos');
  });

  it('kind:new → her dosya NewPhotos adıyla, PhotoIds yok', async () => {
    const f1 = { uri: 'file:///a.jpg', name: 'a.jpg', type: 'image/jpeg' };
    const f2 = { uri: 'file:///b.jpg', name: 'b.jpg', type: 'image/jpeg' };
    await profileService.openProfileMode('Friends', {
      intents: ['Hobby'],
      prompts: [],
      photos: { kind: 'new', files: [f1, f2] },
    });

    expect(names().filter((n) => n === 'NewPhotos')).toHaveLength(2);
    expect(names().some((n) => n.startsWith('PhotoIds'))).toBe(false);
    expect(names()).not.toContain('MainPhotoId');
  });

  it('photos verilmemişse ne PhotoIds ne NewPhotos gidiyor', async () => {
    await profileService.openProfileMode('Friends', {
      intents: ['Hobby'],
      prompts: [],
    });

    const all = names();
    expect(all.some((n) => n.startsWith('PhotoIds'))).toBe(false);
    expect(all).not.toContain('NewPhotos');
    expect(all).not.toContain('MainPhotoId');
  });
});

describe('openProfileMode — dönüş sözleşmesi aynı', () => {
  it('yanıtın result haritasını döner', async () => {
    const out = await profileService.openProfileMode('Friends', {
      intents: ['Hobby'],
      prompts: [],
    });
    expect(out).toEqual({ friends: true });
  });
});
