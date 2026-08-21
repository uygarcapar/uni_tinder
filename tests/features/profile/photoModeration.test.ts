import {
  normalizePhotoModeration,
  getModerationTone,
  isFatalReasonCode,
  requiresUserAction,
  unwrapProfileResult,
  extractModerationPhotos,
  moderationReasonText,
  summarizeModeration,
} from '@/features/profile/photoModeration';

describe('normalizePhotoModeration', () => {
  it('CompleteProfile şeklini okur (status/reasonCode/reasonText)', () => {
    const p = normalizePhotoModeration({
      photoId: 360,
      order: 2,
      status: 'Review',
      reasonCode: 'face_mismatch',
      reasonText: '2. fotoğrafı inceliyoruz.',
    });
    expect(p.status).toBe('Review');
    expect(p.reasonCode).toBe('face_mismatch');
    expect(p.photoId).toBe(360);
  });

  it('GetMyPhotos şeklini okur (moderationStatus/rejectionReason*)', () => {
    const p = normalizePhotoModeration({
      photoId: 42,
      moderationStatus: 'Rejected',
      rejectionReasonCode: 'explicit_content',
      rejectionReasonText: 'uygunsuz',
      isVisibleToOthers: false,
    });
    expect(p.status).toBe('Rejected');
    expect(p.reasonCode).toBe('explicit_content');
    expect(p.isVisibleToOthers).toBe(false);
  });

  it('legacy imageStatus alanını YOK SAYAR — Review ile Pending onda ayırt edilemiyor', () => {
    const p = normalizePhotoModeration({ photoId: 1, imageStatus: 'pending' });
    // moderationStatus yok → eski backend varsayımı: rozet çizilmesin.
    expect(p.status).toBe('Approved');
  });

  it('moderasyon alanı hiç gelmeyen fotoğrafı yayında sayar', () => {
    const p = normalizePhotoModeration({ photoId: 7, photoImageUrl: 'x' });
    expect(p.status).toBe('Approved');
    expect(p.isVisibleToOthers).toBe(true);
    expect(p.reasonCode).toBeNull();
  });

  it('isVisibleToOthers gelmezse yalnızca Approved görünür kabul edilir', () => {
    expect(normalizePhotoModeration({ status: 'Review' }).isVisibleToOthers).toBe(false);
    expect(normalizePhotoModeration({ status: 'Pending' }).isVisibleToOthers).toBe(false);
    expect(normalizePhotoModeration({ status: 'Approved' }).isVisibleToOthers).toBe(true);
  });
});

describe('ton ve aksiyon', () => {
  it('Review/Pending hata DEĞİL — nötr ton taşır', () => {
    expect(getModerationTone('Review')).toBe('info');
    expect(getModerationTone('Pending')).toBe('info');
    expect(getModerationTone('Rejected')).toBe('error');
    expect(getModerationTone('Approved')).toBe('ok');
  });

  it('yalnızca Rejected kullanıcıdan aksiyon ister', () => {
    expect(requiresUserAction('Rejected')).toBe(true);
    expect(requiresUserAction('Review')).toBe(false);
    expect(requiresUserAction('Pending')).toBe(false);
  });

  it('yalnızca ana fotoğraf kodları akışı bloke eder', () => {
    expect(isFatalReasonCode('main_photo_multiple_faces')).toBe(true);
    expect(isFatalReasonCode('main_photo_no_face')).toBe(true);
    expect(isFatalReasonCode('face_mismatch')).toBe(false);
    expect(isFatalReasonCode('explicit_content')).toBe(false);
    expect(isFatalReasonCode(null)).toBe(false);
  });
});

describe('unwrapProfileResult', () => {
  it('yeni şekli çözer: result.profile', () => {
    const dto = { displayName: 'Ada' };
    expect(unwrapProfileResult({ profile: dto, photos: [] })).toBe(dto);
  });

  it('foto gönderilmeyen UpdateProfile’ın düz profileDto şeklini de karşılar', () => {
    const dto = { displayName: 'Ada' };
    expect(unwrapProfileResult(dto)).toBe(dto);
  });
});

describe('extractModerationPhotos', () => {
  it('photos yoksa boş dizi döner', () => {
    expect(extractModerationPhotos({ displayName: 'Ada' })).toEqual([]);
    expect(extractModerationPhotos(null)).toEqual([]);
  });

  it('her fotoğrafı normalize eder', () => {
    const photos = extractModerationPhotos({
      photos: [
        { photoId: 1, status: 'Approved' },
        { photoId: 2, status: 'Rejected', reasonCode: 'violence' },
      ],
    });
    expect(photos).toHaveLength(2);
    expect(photos[1].reasonCode).toBe('violence');
  });
});

describe('moderationReasonText', () => {
  it('metni reasonCode’dan üretir, backend’in reasonText’inden DEĞİL', () => {
    const text = moderationReasonText('Rejected', 'main_photo_multiple_faces');
    // Ana fotoğraf/diğerleri ayrımı metinde geçmeli — kullanıcı "her fotoğrafta
    // yalnız olmalıyım" sanarsa grup fotoğrafı hiç yüklemez.
    expect(text).toContain('yalnız');
    expect(text).toContain('arkadaş');
  });

  it('bilinmeyen kodda duruma uygun nötr metne düşer', () => {
    const text = moderationReasonText('Review', 'brand_new_code_from_backend');
    expect(text).toBe(moderationReasonText('Review', null));
    expect(text).not.toContain('brand_new_code');
  });
});

describe('summarizeModeration', () => {
  it('hepsi Approved ise sessiz kalır', () => {
    expect(
      summarizeModeration([
        normalizePhotoModeration({ photoId: 1, status: 'Approved' }),
        normalizePhotoModeration({ photoId: 2, status: 'Approved' }),
      ]),
    ).toBeNull();
  });

  it('Review’ı hata olarak işaretlemez', () => {
    const s = summarizeModeration([
      normalizePhotoModeration({ photoId: 1, status: 'Review' }),
    ]);
    expect(s).not.toBeNull();
    expect(s!.hasRejected).toBe(false);
    // Kullanıcı yeniden yüklemek zorunda değil, beklemesi yeterli.
    expect(s!.message).toContain('yeniden yüklemene gerek yok');
  });

  it('Rejected varsa onu öne alır', () => {
    const s = summarizeModeration([
      normalizePhotoModeration({ photoId: 1, status: 'Review' }),
      normalizePhotoModeration({ photoId: 2, status: 'Rejected', reasonCode: 'violence' }),
    ]);
    expect(s!.hasRejected).toBe(true);
  });
});
