import {
  withPhotoVersion,
  resolvePhotoUri,
  resolveMainPhotoUri,
} from '@/shared/utils/photoUri';

describe('withPhotoVersion', () => {
  it('appends the version as the first query param', () => {
    expect(withPhotoVersion('https://cdn/u/1.jpg', 'abc')).toBe(
      'https://cdn/u/1.jpg?v=abc',
    );
  });

  it('appends with & when the url already has a query', () => {
    expect(withPhotoVersion('https://cdn/u/1.jpg?sig=x', 'abc')).toBe(
      'https://cdn/u/1.jpg?sig=x&v=abc',
    );
  });

  it('is idempotent — sürüm zaten varsa ikinci kez eklemez', () => {
    const once = withPhotoVersion('https://cdn/u/1.jpg', 'abc');
    expect(withPhotoVersion(once, 'abc')).toBe(once);
  });

  it('gives different cache keys to two photos sharing one slot url', () => {
    const slot = 'https://cdn/u/2.jpg';
    expect(withPhotoVersion(slot, 'old-id')).not.toBe(
      withPhotoVersion(slot, 'new-id'),
    );
  });

  it('leaves non-http uris untouched (local crop output)', () => {
    const local = 'file:///tmp/crop/abc.jpg';
    expect(withPhotoVersion(local, 'abc')).toBe(local);
  });

  it('returns the url unchanged when there is no version', () => {
    expect(withPhotoVersion('https://cdn/u/1.jpg', null)).toBe(
      'https://cdn/u/1.jpg',
    );
  });

  it('returns undefined for a missing url', () => {
    expect(withPhotoVersion(null, 'abc')).toBeUndefined();
  });
});

describe('resolveMainPhotoUri', () => {
  const photos = [
    { photoId: 'p1', photoImageUrl: 'https://cdn/u/1.jpg', order: 0 },
    { photoId: 'p2', photoImageUrl: 'https://cdn/u/2.jpg', isMainPhoto: true, order: 1 },
  ];

  it('prefers the main photo and versions it', () => {
    expect(resolveMainPhotoUri({ photosList: photos })).toBe(
      'https://cdn/u/2.jpg?v=p2',
    );
  });

  it('falls back to the first photo when none is flagged main', () => {
    expect(resolveMainPhotoUri({ photosList: [photos[0]] })).toBe(
      'https://cdn/u/1.jpg?v=p1',
    );
  });

  it('falls back to profileImageUrl when there are no photos', () => {
    expect(
      resolveMainPhotoUri({ photosList: [], profileImageUrl: 'https://cdn/legacy.jpg' }),
    ).toBe('https://cdn/legacy.jpg');
  });

  it('folds a record timestamp into the version when the payload has one', () => {
    const withStamp = resolvePhotoUri({
      photoId: 'p1',
      photoImageUrl: 'https://cdn/u/1.jpg',
      updatedAt: '2026-08-11T09:00:00Z',
    });
    const replacedInPlace = resolvePhotoUri({
      photoId: 'p1',
      photoImageUrl: 'https://cdn/u/1.jpg',
      updatedAt: '2026-08-11T10:00:00Z',
    });
    expect(withStamp).not.toBe(replacedInPlace);
  });

  it('returns undefined for a missing profile', () => {
    expect(resolveMainPhotoUri(null)).toBeUndefined();
    expect(resolvePhotoUri(undefined)).toBeUndefined();
  });
});
