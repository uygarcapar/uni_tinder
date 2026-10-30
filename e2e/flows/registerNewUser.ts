/**
 * Sıfırdan kayıt: Welcome → Step1 → OTP → REGISTRATION_FLOW'un tamamı.
 *
 * AKIŞ SIRASI BURADA TUTULMUYOR. Ürünün tek kaynağı olan `REGISTRATION_FLOW`
 * dizisinden geçiliyor ve adımlar `Record<RegistrationStepRoute, Handler>`
 * olarak tipleniyor:
 *
 *   • Ürün akışa YENİ bir adım eklerse → bu Record eksik kalır → DERLEME
 *     HATASI. Yani e2e sessizce bir adımı atlamıyor, `npm run e2e:type-check`
 *     CI'da (Linux, simülatörsüz, ücretsiz) bunu yakalıyor.
 *   • Bir adım akıştan ÇIKARSA → fazlalık anahtar yine derleme hatası.
 *
 * `stepsForMode` Arkadaş modunda `RegisterStep10`u eliyor; o adımın handler'ı
 * tanımlı kalıyor ama hiç çağrılmıyor — ürünle aynı mantık.
 */
import {
  REGISTRATION_FLOW,
  stepsForMode,
  type RegistrationStepRoute,
} from '@/features/auth/registrationFlow';
import { Alerts } from '../support/alerts';
import { enterApp } from '../support/devClient';
import { gates } from './gates';
import { welcome } from '../screens/auth/welcome.screen';
import { otp } from '../screens/auth/otp.screen';
import { heightRuler } from '../screens/auth/heightRuler.screen';
import {
  locationSheet,
  referral,
  step1,
  step3,
  step5,
  step6,
  step7,
  step8,
  step9,
  step10,
  step13,
  step14,
  step15,
  step16,
  step17,
  stepMode,
} from '../screens/auth/registerSteps.screen';
import type { NewUserSpec, RegisteredUser } from './types';

type StepHandler = (spec: NewUserSpec) => Promise<void>;

/**
 * Akıştaki HER rota için bir işleyici olmak ZORUNDA (derleyici dayatıyor).
 * `satisfies` yerine açık `Record` tipi: eksik anahtar hatası `satisfies`te de
 * çıkıyor ama fazlalık anahtar sessizce geçiyordu.
 */
const STEP_HANDLERS: Record<RegistrationStepRoute, StepHandler> = {
  RegisterReferral: async (spec) =>
    spec.referralCode ? referral.enterAndContinue(spec.referralCode) : referral.skip(),

  RegisterStep3: async (spec) => {
    await step3.waitUntilOpen();
    await step3.enterPasswords(spec.password);
    await step3.next();
  },

  RegisterStep5: async (spec) => {
    await step5.waitUntilOpen();
    await step5.enterName(spec.firstName);
    await step5.next();
  },

  RegisterStep6: async (spec) => {
    await step6.waitUntilOpen();
    await step6.enterDob(spec.dob);
    await step6.next();
  },

  RegisterStep7: async () => {
    await step7.waitUntilOpen();
    await step7.pickFirstAvailable();
    await step7.next();
  },

  RegisterStep8: async (spec) => {
    await step8.waitUntilOpen();
    await step8.pickFirstDepartment();
    await step8.pickClass(spec.yearOfStudy);
    await step8.next();
  },

  // ZORUNLU adım: izin verilmeden ilerlemiyor.
  // ⚠️ Simülatörün konumu ayarlanmamışsa `getCurrentPositionAsync` hiç
  // çözülmüyor (timeout'suz) → spinner sonsuza döner. `simctl location set`
  // ön koşul; wdio.conf.ts `onPrepare` bunu yapıyor.
  RegisterStep9: async () => {
    await step9.waitUntilOpen();
    if (await locationSheet.isOpen(3_000)) {
      await locationSheet.tapAllow();
    } else {
      await step9.requestPermission();
      await locationSheet.isOpen(5_000).then((open) => (open ? locationSheet.tapAllow() : null));
    }
    // İzin profili `virgin` ise iOS diyaloğu çıkıyor; `granted` ise hiç çıkmaz.
    await Alerts.permissionIfPresent('allow-while-using');
  },

  RegisterStep12: async (spec) => {
    await heightRuler.waitUntilOpen();
    if (spec.heightCm) await heightRuler.dragTo(spec.heightCm);
    await heightRuler.next();
  },

  // Ön seçim YOK: kart seçilmeden "İleri" ilerletmiyor.
  RegisterStepMode: async (spec) => {
    await stepMode.waitUntilOpen();
    await stepMode.pick(spec.mode);
  },

  // YALNIZ Flört — Arkadaş modunda `stepsForMode` bunu zaten eliyor.
  RegisterStep10: async () => {
    await step10.waitUntilOpen();
    await step10.pickAll();
    await step10.next();
  },

  RegisterStep13: async (spec) => {
    await step13.waitUntilOpen();
    await step13.pickHobbies(spec.hobbyCount);
    await step13.next();
  },

  RegisterStep17: async (spec) => {
    await step17.waitUntilOpen();
    await step17.fillPrompts(spec.promptCount);
    await step17.next();
  },

  RegisterStep14: async () => {
    await step14.waitUntilOpen();
    await step14.pickFirstIntent();
    await step14.next();
  },

  RegisterStep16: async (spec) => {
    await step16.waitUntilOpen();
    if (spec.skipLifestyle) await step16.skip();
    else await step16.next();
  },

  RegisterStep15: async (spec) => {
    await step15.waitUntilOpen();
    await step15.addFromGallery(spec.photoCount);
    await step15.submit();
  },
};

/** Akış dizisi ile handler kümesi ayrışırsa koşmadan önce patla. */
function assertHandlersCoverFlow(): void {
  const missing = REGISTRATION_FLOW.filter((route) => !(route in STEP_HANDLERS));
  if (missing.length > 0) {
    throw new Error(
      `registerNewUser: akışta işleyicisi olmayan adım(lar): ${missing.join(', ')}`
    );
  }
}

export interface RegisterOptions {
  /** Adım başına ne kadar beklensin (ağır ekranlarda uzat). */
  stepTimeoutMs?: number;
}

export async function registerNewUser(
  spec: NewUserSpec,
  _options: RegisterOptions = {}
): Promise<RegisteredUser> {
  assertHandlersCoverFlow();

  await enterApp();

  await welcome.waitUntilOpen(60_000);
  await welcome.startRegister();

  await step1.waitUntilOpen();
  await step1.enterEmail(spec.email);
  await step1.next();

  // ⚠️ Burada alert çıkması bir AKIŞ HATASI değil, bir VERİ hatası:
  // ACCOUNT_EXISTS (e-posta üreticisi çakıştı / önceki koşunun temizliği
  // koşmadı), INVALID_DOMAIN ya da UNSUPPORTED_UNIVERSITY. Sessizce
  // yutulmuyor — mesajı hata metnine giriyor.
  await Alerts.expectNone('send-verification sonrası');

  await otp.waitUntilOpen();
  // Butona BASILMIYOR: 6 hane dolunca `onFilled` doğruluyor.
  await otp.enterCode();

  for (const route of stepsForMode(spec.mode)) {
    const handler = STEP_HANDLERS[route];
    await handler(spec);
  }

  // Kayıt sonrası kapılar: KVKK → LocationAccessGate → (bildirim izni
  // simülatörde HİÇ sorulmuyor: pushService.ts:91 `!Device.isDevice`).
  await gates.settleAfterLogin();

  return { spec, email: spec.email, password: spec.password };
}
