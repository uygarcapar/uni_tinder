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
} from '@/features/auth/authSlice';
import {
  FIRST_REGISTRATION_STEP,
  REGISTRATION_FLOW,
  REGISTRATION_STEP_NUMBERS,
  isRegistrationStep,
  registrationResumeStack,
} from '@/features/auth/registrationFlow';

describe('REGISTRATION_FLOW', () => {
  // Sıra AKIŞ sırasında, sayısal sırada değil: Step16 fotoğraflardan (15)
  // önce, Step17 (sorular) ise hobilerden (13) sonra — serbest metin adımıyla
  // fotoğraf adımı arka arkaya gelmesin diye araya konuldu.
  it('akış sırasında tutulur — Step17 hobilerden sonra, Step16 fotoğraflardan önce', () => {
    expect(REGISTRATION_STEP_NUMBERS).toEqual([3, 5, 6, 7, 8, 9, 10, 12, 13, 17, 14, 16, 15]);
  });

  it('ilk adım Step3', () => {
    expect(FIRST_REGISTRATION_STEP).toBe('RegisterStep3');
    expect(REGISTRATION_FLOW[0]).toBe('RegisterStep3');
  });
});

describe('isRegistrationStep', () => {
  it('sihirbaz ekranlarını tanır', () => {
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
      'RegisterStep3',
      'RegisterStep5',
      'RegisterStep6',
      'RegisterStep7',
      'RegisterStep8',
      'RegisterStep9',
      'RegisterStep10',
      'RegisterStep12',
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
    expect(registrationResumeStack('RegisterStep3')).toEqual(['RegisterStep3']);
  });

  it('bilinmeyen/boş adımda başa düşer', () => {
    // Eski sürümden gelen state veya akıştan çıkarılmış ekran (Step4/Step11).
    expect(registrationResumeStack('RegisterStep11')).toEqual(['RegisterStep3']);
    expect(registrationResumeStack(null)).toEqual(['RegisterStep3']);
    expect(registrationResumeStack(undefined)).toEqual(['RegisterStep3']);
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
