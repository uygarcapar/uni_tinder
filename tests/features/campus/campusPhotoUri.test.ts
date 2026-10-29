import { campusPhotoUri } from '@/features/campus/campusPhotoUri';
import type { CampusMomentDto } from '@/features/campus/campusTypes';

/**
 * FOTOĞRAF ADRESİNİN TEK ÇÖZÜCÜSÜ.
 *
 * Çözüm bir dönem YALNIZ şerit kartındaydı; büyüyen kart `photoUrl`i ham
 * kullanıyordu. Sonuç: göreli bir yol ya da reddedilmiş bir an şeritte doğru,
 * büyük kartta KOCA BİR GRİ DİKDÖRTGEN olarak çiziliyordu — üstelik orada
 * yüzeyin tamamı fotoğraf olduğu için gerileme toplam.
 */

const m = (over: Partial<CampusMomentDto>): CampusMomentDto =>
  ({
    id: '1',
    userId: 'u',
    displayName: 'Ada',
    age: 21,
    photoUrl: 'https://cdn.test/1.jpg',
    createdAt: '',
    expiresAt: '',
    mode: 'Dating',
    isMine: false,
    ...over,
  }) as CampusMomentDto;

it('mutlak adres olduğu gibi geçiyor', () => {
  expect(campusPhotoUri(m({}))).toBe('https://cdn.test/1.jpg');
});

it('göreli yol API tabanına bağlanıyor', () => {
  expect(campusPhotoUri(m({ photoUrl: '/uploads/a.jpg' }))).toMatch(
    /^https?:\/\/.+\/uploads\/a\.jpg$/,
  );
});

it('çıplak objectKey KULLANILMIYOR — uydurma yol 404 demek', () => {
  expect(campusPhotoUri(m({ photoUrl: 'campus/abc' }))).toBeNull();
});

it('REDDEDİLMİŞ anda istek hiç kurulmuyor — S3 nesnesi silinmiş', () => {
  expect(
    campusPhotoUri(m({ moderation: { status: 'Rejected' } as any })),
  ).toBeNull();
});
