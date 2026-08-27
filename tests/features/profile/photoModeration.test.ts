import {
  normalizePhotoModeration,
  normalizeProfileVisibility,
  getModerationTone,
  isBlockingPhoto,
  isProfileHidden,
  requiresUserAction,
  resolveRequiredPhotoCount,
  extractModerationPhotos,
  moderationReasonText,
  summarizeModeration,
} from '@/features/profile/photoModeration';

describe('normalizePhotoModeration', () => {
  it('kanonik moderation bloğunu okur', () => {
    const p = normalizePhotoModeration({
      photoId: 123,
      order: 1,
      moderation: {
        status: 'Rejected',
        reasonCode: 'explicit_content',
        severity: 'Hidden',
        isVisibleToOthers: false,
        isAppealable: true,
        appealState: 'None',
        decidedAt: '2026-08-24T09:12:00Z',
        policyVersion: 1,
        reasonText: '3. fotoğraf topluluk kurallarımıza uymuyor…',
      },
    });
    expect(p.status).toBe('Rejected');
    expect(p.severity).toBe('Hidden');
    expect(p.isVisibleToOthers).toBe(false);
    expect(p.isAppealable).toBe(true);
    expect(p.appealState).toBe('None');
    expect(p.policyVersion).toBe(1);
  });

  it('görünürlüğü statustan TÜRETMEZ — sunucu ne diyorsa o', () => {
    // Approved ama gizli (ör. profil askıya alınmış): türetseydik yanlış olurdu.
    const p = normalizePhotoModeration({
      photoId: 5,
      moderation: { status: 'Approved', isVisibleToOthers: false },
    });
    expect(p.status).toBe('Approved');
    expect(p.isVisibleToOthers).toBe(false);
  });

  it('legacy düz alanlardan severity türetir (deploy öncesi pencere)', () => {
    const blocking = normalizePhotoModeration({
      photoId: 1,
      moderationStatus: 'Rejected',
      rejectionReasonCode: 'main_photo_no_face',
    });
    expect(blocking.severity).toBe('Blocking');

    const hidden = normalizePhotoModeration({
      photoId: 2,
      moderationStatus: 'Rejected',
      rejectionReasonCode: 'explicit_content',
    });
    expect(hidden.severity).toBe('Hidden');
  });

  it('bloğu göndermeyen backend için itiraz butonunu KAPALI tutar', () => {
    const p = normalizePhotoModeration({
      photoId: 3,
      moderationStatus: 'Rejected',
      rejectionReasonCode: 'violence',
    });
    expect(p.isAppealable).toBe(false);
  });

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

  it('legacy GetMyPhotos şeklini okur (moderationStatus/rejectionReason*)', () => {
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

  it('akışı bloke eden kararı SUNUCU işaretler — istemcide kod listesi yok', () => {
    const blocking = normalizePhotoModeration({
      moderation: { status: 'Rejected', severity: 'Blocking', reasonCode: 'main_photo_no_face' },
    });
    // Backend yarın yeni bir kodu Blocking yaparsa istemci kendiliğinden uyar.
    const newBlockingCode = normalizePhotoModeration({
      moderation: { status: 'Rejected', severity: 'Blocking', reasonCode: 'brand_new_code' },
    });
    const hidden = normalizePhotoModeration({
      moderation: { status: 'Rejected', severity: 'Hidden', reasonCode: 'explicit_content' },
    });
    expect(isBlockingPhoto(blocking)).toBe(true);
    expect(isBlockingPhoto(newBlockingCode)).toBe(true);
    expect(isBlockingPhoto(hidden)).toBe(false);
    expect(isBlockingPhoto(null)).toBe(false);
  });
});

describe('normalizeProfileVisibility', () => {
  it('bloğu çözer', () => {
    const v = normalizeProfileVisibility({
      profileVisibility: {
        state: 'HiddenInsufficientPhotos',
        visiblePhotoCount: 1,
        requiredPhotoCount: 2,
        reasonCode: 'insufficient_visible_photos',
      },
    });
    expect(v!.state).toBe('HiddenInsufficientPhotos');
    expect(v!.requiredPhotoCount).toBe(2);
    expect(isProfileHidden(v)).toBe(true);
  });

  it('alan gelmezse null döner — BİLİNMİYOR, "gizli" DEĞİL', () => {
    // Deploy öncesi pencerede engelleyici kapı herkese açılmamalı.
    expect(normalizeProfileVisibility({ displayName: 'Ada' })).toBeNull();
    expect(isProfileHidden(null)).toBe(false);
  });

  it('bilinmeyen state’i yok sayar', () => {
    expect(
      normalizeProfileVisibility({ profileVisibility: { state: 'SomethingNew' } }),
    ).toBeNull();
  });

  it('silme tabanını sunucudan alır, alan yoksa bugünkü kurala düşer', () => {
    expect(
      resolveRequiredPhotoCount({
        state: 'Visible',
        visiblePhotoCount: 4,
        requiredPhotoCount: 3,
        reasonCode: null,
      }),
    ).toBe(3);
    expect(resolveRequiredPhotoCount(null)).toBe(2);
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

  it('bilinmeyen kodda backend’in yerelleştirilmiş metni varsa onu tercih eder', () => {
    // reasonText artık resx’ten ve Accept-Language’a göre geliyor → gösterilebilir.
    const text = moderationReasonText(
      'Rejected',
      'brand_new_code_from_backend',
      'Sunucunun anlattığı sebep.',
    );
    expect(text).toBe('Sunucunun anlattığı sebep.');
  });

  it('BİLİNEN kodda backend metnini DEĞİL kendi metnini kullanır', () => {
    const text = moderationReasonText(
      'Rejected',
      'main_photo_no_face',
      'sunucu metni',
    );
    expect(text).not.toBe('sunucu metni');
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
