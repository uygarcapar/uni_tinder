/**
 * "Kaldığın yerden devam et" akışının çekirdeği. Alan verileri zaten persist
 * ediliyordu; kaybolan tek şey kullanıcının hangi adımda olduğuydu — soğuk
 * açılış her seferinde ilk adıma düşüyordu.
 *
 * Yığın (yalnız hedef ekran değil) önemli: tek ekranlı yığında geri butonu ölü
 * kalır, kullanıcı 13'ten devam edip 12'yi düzeltemez.
 */

import authReducer, {
  setRegistrationStep,
  setEmailVerifiedToken,
  clearRegistrationForm,
  updateRegistrationField,
} from '@/features/auth/authSlice';
import {
  DATING_ONLY_STEPS,
  FIRST_REGISTRATION_STEP,
  MODE_STEP_NUMBER,
  REGISTRATION_FLOW,
  REGISTRATION_STEP_NUMBERS,
  isRegistrationStep,
  registrationResumeStack,
  stepNumbersForMode,
  stepsForMode,
} from '@/features/auth/registrationFlow';

describe('REGISTRATION_FLOW', () => {
  // Sıra AKIŞ sırasında, sayısal sırada değil: Step16 fotoğraflardan (15)
  // önce, Step17 (sorular) ise hobilerden (13) sonra — serbest metin adımıyla
  // fotoğraf adımı arka arkaya gelmesin diye araya konuldu.
  it('akış sırasında tutulur — Step17 hobilerden sonra, Step16 fotoğraflardan önce', () => {
    // Baştaki 0 davet kodu adımı: rota adı numarasız olduğu için progress bar'a
    // açık bir sayı veriliyor (bkz. REFERRAL_STEP_NUMBER).
    expect(REGISTRATION_STEP_NUMBERS).toEqual([
      0, 3, 5, 6, 7, 8, 9, 12, 10, 13, 17, 14, 16, 15,
    ]);
  });

  it('numarasız adım progress bar dizisini BOZMUYOR — NaN yok', () => {
    // `Number('RegisterReferral'.replace('RegisterStep',''))` NaN üretiyordu ve
    // NaN hiçbir indexOf'ta bulunmadığı için adım bardaki yerini kaybediyordu.
    expect(REGISTRATION_STEP_NUMBERS.every((n) => Number.isFinite(n))).toBe(true);
  });

  it('ilk adım davet kodu', () => {
    expect(FIRST_REGISTRATION_STEP).toBe('RegisterReferral');
    expect(REGISTRATION_FLOW[0]).toBe('RegisterReferral');
    // Kod adımı doğrulamadan (Step2) HEMEN sonra geliyor; şifre adımı ikinci.
    expect(REGISTRATION_FLOW[1]).toBe('RegisterStep3');
  });
});

describe('isRegistrationStep', () => {
  it('sihirbaz ekranlarını tanır', () => {
    expect(isRegistrationStep('RegisterReferral')).toBe(true);
    expect(isRegistrationStep('RegisterStep13')).toBe(true);
    expect(isRegistrationStep('RegisterStep15')).toBe(true);
  });

  it('sihirbaz dışındaki rotaları reddeder', () => {
    // Step1/Step2 e-posta + doğrulama adımı: emailVerifiedToken henüz yok,
    // resume oraya değil Welcome'a düşmeli.
    expect(isRegistrationStep('RegisterStep1')).toBe(false);
    expect(isRegistrationStep('RegisterStep2')).toBe(false);
    expect(isRegistrationStep('Welcome')).toBe(false);
    expect(isRegistrationStep('Discover')).toBe(false);
    expect(isRegistrationStep(null)).toBe(false);
    expect(isRegistrationStep(undefined)).toBe(false);
  });
});

describe('registrationResumeStack', () => {
  it('kaldığı adıma kadar olan tüm ekranları dizer (geri butonu için)', () => {
    expect(registrationResumeStack('RegisterStep13')).toEqual([
      'RegisterReferral',
      'RegisterStep3',
      'RegisterStep5',
      'RegisterStep6',
      'RegisterStep7',
      'RegisterStep8',
      'RegisterStep9',
      'RegisterStep12',
      'RegisterStep10',
      'RegisterStep13',
    ]);
  });

  it('akış sırasını izler — Step15 yığınında Step16 da vardır', () => {
    const stack = registrationResumeStack('RegisterStep15');
    expect(stack).toHaveLength(REGISTRATION_FLOW.length);
    expect(stack[stack.length - 1]).toBe('RegisterStep15');
    expect(stack[stack.length - 2]).toBe('RegisterStep16');
  });

  it('ilk adımda tek ekranlı yığın döndürür', () => {
    expect(registrationResumeStack('RegisterReferral')).toEqual(['RegisterReferral']);
  });

  it('ikinci adımda davet kodu da yığında', () => {
    expect(registrationResumeStack('RegisterStep3')).toEqual([
      'RegisterReferral',
      'RegisterStep3',
    ]);
  });

  it('bilinmeyen/boş adımda başa düşer', () => {
    // Eski sürümden gelen state veya akıştan çıkarılmış ekran (Step4/Step11).
    expect(registrationResumeStack('RegisterStep11')).toEqual(['RegisterReferral']);
    expect(registrationResumeStack(null)).toEqual(['RegisterReferral']);
    expect(registrationResumeStack(undefined)).toEqual(['RegisterReferral']);
  });

  /**
   * ⚠️ ELEME SLICE'TAN ÖNCE. Tam akıştan dilimleyip sonra elemek, elenen adım
   * dilimin İÇİNDEyse yığını bir adım kısa bırakırdı — Arkadaş kullanıcısı
   * Step13'te devam ederken geri tuşu ona ait olmayan bir soruya düşerdi.
   */
  it('Arkadaş modunda flörte özel adımı yığından eliyor', () => {
    const stack = registrationResumeStack('RegisterStep13', 'Friends');
    expect(stack).not.toContain('RegisterStep10');
    expect(stack).toEqual([
      'RegisterReferral',
      'RegisterStep3',
      'RegisterStep5',
      'RegisterStep6',
      'RegisterStep7',
      'RegisterStep8',
      'RegisterStep9',
      'RegisterStep12',
      'RegisterStep13',
    ]);
  });

  it('Flört modunda tam akış korunuyor', () => {
    expect(registrationResumeStack('RegisterStep13', 'Dating')).toContain(
      'RegisterStep10',
    );
    // Mod bilinmiyorsa da eleme YOK: o noktada kullanıcı mod adımına gelmemiş.
    expect(registrationResumeStack('RegisterStep13', '')).toContain('RegisterStep10');
    expect(registrationResumeStack('RegisterStep13', null)).toContain('RegisterStep10');
  });
});

describe('stepsForMode / stepNumbersForMode', () => {
  it('mod yoksa tam akış', () => {
    expect(stepsForMode(undefined)).toEqual([...REGISTRATION_FLOW]);
    expect(stepsForMode('')).toHaveLength(REGISTRATION_FLOW.length);
    expect(stepsForMode('Dating')).toHaveLength(REGISTRATION_FLOW.length);
  });

  it('Arkadaş modunda akış tam bir adım kısalıyor', () => {
    const friends = stepsForMode('Friends');
    expect(friends).toHaveLength(REGISTRATION_FLOW.length - DATING_ONLY_STEPS.size);
    expect(friends).not.toContain('RegisterStep10');
    // Mod adımı kalktı: kayıt hep Arkadaş modunda.
    expect(friends).not.toContain('RegisterStepMode');
  });

  /**
   * Barın paydası da kısalmak zorunda: sabit paydayla Arkadaş kullanıcısı son
   * adımda %100'e varmaz, barda bir dilim boş kalır.
   */
  it('bar paydası moda göre', () => {
    expect(stepNumbersForMode('Friends')).not.toContain(10);
    expect(stepNumbersForMode('Friends')).not.toContain(MODE_STEP_NUMBER);
    expect(stepNumbersForMode('Dating').length).toBeGreaterThan(
      stepNumbersForMode('Friends').length,
    );
  });
});

describe('authSlice.registrationStep', () => {
  it('başlangıçta boş', () => {
    const state = authReducer(undefined, { type: '@@INIT' });
    expect(state.registrationStep).toBeNull();
  });

  it('adım imlecini ilerletir', () => {
    const state = authReducer(undefined, setRegistrationStep('RegisterStep13'));
    expect(state.registrationStep).toBe('RegisterStep13');
  });

  it('geri gidilirse imleç de geriler', () => {
    let state = authReducer(undefined, setRegistrationStep('RegisterStep13'));
    state = authReducer(state, setRegistrationStep('RegisterStep12'));
    expect(state.registrationStep).toBe('RegisterStep12');
  });

  it('aynı adımda referansı değiştirmez — gereksiz render/persist yazımı olmasın', () => {
    const state = authReducer(undefined, setRegistrationStep('RegisterStep13'));
    const again = authReducer(state, setRegistrationStep('RegisterStep13'));
    expect(again).toBe(state);
  });

  it('kayıt tamamlanınca/iptal olunca imleç temizlenir', () => {
    // Aksi halde profil oluşturmayı bitiren kullanıcı, bir sonraki kayıtta
    // (veya token doğrulaması düşünce) Step15'e düşerdi.
    const state = authReducer(undefined, setRegistrationStep('RegisterStep15'));
    expect(authReducer(state, clearRegistrationForm()).registrationStep).toBeNull();
  });

  it('yeni e-posta doğrulaması imleci sıfırlar — baştan başlayan tur eskisini devralmasın', () => {
    const state = authReducer(undefined, setRegistrationStep('RegisterStep13'));
    const fresh = authReducer(state, setEmailVerifiedToken('tok-123'));
    expect(fresh.registrationStep).toBeNull();
    expect(fresh.emailVerifiedToken).toBe('tok-123');
  });
});

describe('authSlice.registrationForm.referralCode', () => {
  it('başlangıçta boş — kod ancak kullanıcı girerse doluyor', () => {
    const state = authReducer(undefined, { type: '@@INIT' });
    expect(state.registrationForm.referralCode).toBeNull();
  });

  it('updateRegistrationField ile yazılıyor ve persist edilen alanla aynı yerde', () => {
    const state = authReducer(
      undefined,
      updateRegistrationField({ field: 'referralCode', value: 'AK7M2' }),
    );
    expect(state.registrationForm.referralCode).toBe('AK7M2');
  });

  it('kayıt bitince/iptal olunca temizleniyor', () => {
    // Aksi halde bir sonraki kayıt, önceki turun kodunu sessizce devralırdı.
    const withCode = authReducer(
      undefined,
      updateRegistrationField({ field: 'referralCode', value: 'AK7M2' }),
    );
    expect(
      authReducer(withCode, clearRegistrationForm()).registrationForm.referralCode,
    ).toBeNull();
    // `keepEmail` yalnız e-postayı koruyor; kod her hâlükârda gidiyor.
    expect(
      authReducer(withCode, clearRegistrationForm({ keepEmail: true })).registrationForm
        .referralCode,
    ).toBeNull();
  });
});

/**
 * NON-BINARY DALI — "Friends'te InterestedIn adımı hep elenir" ARTIK DOĞRU DEĞİL.
 *
 * Friends'te eşleşme kuralı aynı cinsiyet ve değeri ikili kategorilerde sunucu
 * türetip kilitliyor; o kullanıcılarda adım hâlâ elenmeli. Ama Non-Binary
 * kullanıcıda "yalnız Non-Binary gör" kampüs ölçeğinde boş deste demek, o
 * yüzden havuzu soruyoruz — ve soru bu adımın kendisi.
 *
 * Karar istemcide TÜRETİLMİYOR: çağıran `isNonBinaryOnlyGender(...)` sonucunu
 * geçiyor. Katalog yüklenmemişken o fonksiyon `false` döndüğü için adım
 * gösterilmez ve sunucunun türetmesi geçerli kalır — yanlış tarafa düşmektense
 * soruyu hiç sormamak.
 *
 * İlerleme çubuğunun paydası (stepNumbersForMode) ile resume yığını AYNI
 * kaynaktan okumalı: ayrışırsa Arkadaş kullanıcısının barı takılır ya da geri
 * tuşu ona ait olmayan bir soruya düşer.
 */
describe('Friends + Non-Binary havuz adımı', () => {
  it('havuz sorusu YOKken RegisterStep10 eleniyor', () => {
    expect(stepsForMode('Friends')).not.toContain('RegisterStep10');
    expect(stepsForMode('Friends', false)).not.toContain('RegisterStep10');
  });

  it('havuz sorusu VARken RegisterStep10 akışta kalıyor', () => {
    const steps = stepsForMode('Friends', true);
    expect(steps).toContain('RegisterStep10');
    expect(steps).toHaveLength(REGISTRATION_FLOW.length);
  });

  it('Dating her hâlde RegisterStep10 taşıyor', () => {
    expect(stepsForMode('Dating', false)).toContain('RegisterStep10');
    expect(stepsForMode('Dating', true)).toContain('RegisterStep10');
    expect(stepsForMode(null, false)).toContain('RegisterStep10');
  });

  it('barın paydası akışla aynı kaynaktan okuyor', () => {
    expect(stepNumbersForMode('Friends', true)).toHaveLength(
      stepsForMode('Friends', true).length,
    );
    expect(stepNumbersForMode('Friends', false)).toHaveLength(
      stepsForMode('Friends', false).length,
    );
    // Havuz sorusu açıkken payda Arkadaş'ta da tam akış kadar.
    expect(stepNumbersForMode('Friends', true)).toEqual(
      stepNumbersForMode('Dating'),
    );
  });

  it('resume yığını da aynı kaynaktan okuyor', () => {
    expect(
      registrationResumeStack('RegisterStep13', 'Friends', true),
    ).toContain('RegisterStep10');
    expect(
      registrationResumeStack('RegisterStep13', 'Friends', false),
    ).not.toContain('RegisterStep10');
    // Üçüncü parametre verilmezse bugünkü davranış: Arkadaş'ta eleniyor.
    expect(registrationResumeStack('RegisterStep13', 'Friends')).not.toContain(
      'RegisterStep10',
    );
  });
});
