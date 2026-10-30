/**
 * Kayıt sihirbazının Page Object'leri — ekran başına bir sınıf.
 *
 * Tek dosyada duruyorlar çünkü hepsi aynı iskeleti paylaşıyor (kök işaretçi +
 * `reg-btn-next`) ve 16 ayrı dosya, aralarındaki akış ilişkisini okunmaz hale
 * getiriyordu. Gerçekten mantığı olanlar (OTP, boy cetveli) ayrı dosyada.
 *
 * KATMAN KURALI: burada ASSERTION YOK. Beklemek serbest, doğrulamak değil.
 */
import { BaseScreen } from '../base.screen';
import { Keyboard } from '../../support/driver';
import { byText, els, idsWithPrefix } from '../../support/selectors';

/** Ortak "İleri" butonunu taşıyan taban — 14 ekran bunu kullanıyor. */
abstract class StepScreen extends BaseScreen {
  async next(): Promise<void> {
    await this.tap('reg-btn-next');
  }

  async back(): Promise<void> {
    // RegisterBackButton'ın testID'si Tur 2'de geliyor; o ana kadar
    // navigator'ın geri jesti yerine ekranın kendi butonu kullanılmıyor.
    await browser.back();
  }
}

// ── Step1 · üniversite e-postası ───────────────────────────────────────────
export class RegisterStep1Screen extends StepScreen {
  readonly root = 'reg-step1-screen';
  readonly name = 'Kayıt · E-posta';

  async enterEmail(email: string): Promise<void> {
    await this.type('reg-step1-email', email);
  }
}

// ── Referral · davet kodu (akışın İLK adımı, opsiyonel) ────────────────────
export class RegisterReferralScreen extends BaseScreen {
  readonly root = 'reg-referral-screen';
  readonly name = 'Kayıt · Davet kodu';

  /**
   * ÇIKIŞ TEK BUTONDA: ayrı bir "Atla" bağlantısı yok. Kod eksikken buton
   * "Atla", 5 hane dolunca "Devam Et" yazıyor — ikisi de aynı testID.
   */
  async skip(): Promise<void> {
    await this.tap('referral-continue');
  }

  async enterAndContinue(code: string): Promise<void> {
    // Kod alanının testID'si Tur 2'de; şu an alan tek metin girişi.
    const fields = await els('-ios class chain:**/XCUIElementTypeTextField');
    const first = fields[0];
    if (!first) throw new Error('Davet kodu alanı bulunamadı');
    await first.setValue(code);
    await Keyboard.dismissIfOpen();
    await this.tap('referral-continue');
  }
}

// ── Step3 · şifre ──────────────────────────────────────────────────────────
export class RegisterStep3Screen extends StepScreen {
  readonly root = 'reg-step3-screen';
  readonly name = 'Kayıt · Şifre';

  async enterPasswords(password: string, confirm = password): Promise<void> {
    await this.type('reg-step3-password', password, { hideKeyboard: false });
    await this.type('reg-step3-password-confirm', confirm);
  }
}

// ── Step5 · ad ─────────────────────────────────────────────────────────────
export class RegisterStep5Screen extends StepScreen {
  readonly root = 'reg-step5-screen';
  readonly name = 'Kayıt · Ad';

  async enterName(name: string): Promise<void> {
    await this.type('reg-step5-name', name);
  }
}

// ── Step6 · doğum tarihi ───────────────────────────────────────────────────
export class RegisterStep6Screen extends StepScreen {
  readonly root = 'reg-step6-screen';
  readonly name = 'Kayıt · Doğum tarihi';

  /**
   * ⚠️ ODAK KENDİLİĞİNDEN İLERLİYOR: gün 2 haneye dolunca ekran `monthRef`e,
   * ay dolunca `yearRef`e odaklanıyor (RegisterStep6Screen.tsx). Yine de her
   * alana açıkça dokunuluyor — odak zaten oradaysa dokunmak zararsız, ama
   * otomatik ilerleme bir gün kaldırılırsa test sessizce kırılmasın.
   */
  async enterDob(d: { day: number; month: number; year: number }): Promise<void> {
    await this.type('reg-step6-day', String(d.day).padStart(2, '0'), { hideKeyboard: false });
    await this.type('reg-step6-month', String(d.month).padStart(2, '0'), { hideKeyboard: false });
    await this.type('reg-step6-year', String(d.year));
  }
}

// ── Step7 · cinsiyet ───────────────────────────────────────────────────────
export class RegisterStep7Screen extends StepScreen {
  readonly root = 'reg-step7-screen';
  readonly name = 'Kayıt · Cinsiyet';

  /** `enumName` ile — etiket iki dilli ve alt seçime göre değişiyor. */
  async pickCategory(categoryEnumName: string): Promise<void> {
    await this.tap(`gender-cat-${categoryEnumName}`);
  }

  async pickSubGender(enumName: string): Promise<void> {
    await this.tap(`gender-sub-${enumName}`);
  }

  /** Sunucudan gelen ilk kategori — spec'in sabit bir enum'a bağlanmaması için. */
  async pickFirstAvailable(): Promise<string> {
    const pills = await idsWithPrefix('gender-cat-');
    const first = pills[0];
    if (!first) throw new Error('Cinsiyet kategorisi gelmedi (/api/common/genders boş?)');
    const name = (await first.getAttribute('name')) ?? '';
    await first.click();
    return name.replace('gender-cat-', '');
  }
}

// ── Step8 · bölüm + sınıf ──────────────────────────────────────────────────
export class RegisterStep8Screen extends StepScreen {
  readonly root = 'reg-step8-screen';
  readonly name = 'Kayıt · Eğitim';

  async openDepartmentSheet(): Promise<void> {
    await this.tap('reg-step8-department-trigger');
    await this.el('sheet-searchable-list').waitForDisplayed({ timeout: 15_000 });
  }

  /**
   * Listedeki İLK satırı seçer.
   *
   * Arama alanı BİLEREK kullanılmıyor: gorhom sheet'in pan tanıyıcısı açılma
   * animasyonu sırasında dokunuşu yutabiliyor (bkz. SheetSearchInput'un kendi
   * notu). Aramanın kendisi ayrı bir spec'in konusu, kayıt akışının bağımlılığı
   * değil.
   */
  async pickFirstDepartment(): Promise<void> {
    await this.openDepartmentSheet();
    const rows = await idsWithPrefix('sheet-row-');
    const first = rows[0];
    if (!first) throw new Error('Bölüm listesi boş (/api/common/departments?)');
    await first.click();
  }

  /** Sınıf: 0 = Hazırlık, 1-6. */
  async pickClass(year: number): Promise<void> {
    await this.tap(`reg-step8-class-${year}`);
  }
}

// ── Step9 · konum izni (ZORUNLU adım) ──────────────────────────────────────
export class RegisterStep9Screen extends StepScreen {
  readonly root = 'reg-step9-screen';
  readonly name = 'Kayıt · Konum';

  /**
   * ⚠️ Bu ekranda "İleri" yok — buton `reopenSheetAndRequest` çağırıyor ve
   * `LocationPermissionSheet` odakta OTOMATİK açılıyor. İzin verilmeden akış
   * ilerlemiyor.
   *
   * ⚠️⚠️ Konum ayarlanmamış bir simülatörde `getCurrentPositionAsync`
   * TIMEOUT'SUZ çağrıldığı için promise hiç çözülmüyor ve spinner sonsuza
   * dönüyor. `simctl location set` ön koşul (support/simctl.ts).
   */
  async requestPermission(): Promise<void> {
    await this.tap('reg-btn-next');
  }
}

// ── Step10 · kiminle ilgileniyorsun (YALNIZ Flört) ─────────────────────────
export class RegisterStep10Screen extends StepScreen {
  readonly root = 'reg-step10-screen';
  readonly name = 'Kayıt · İlgi alanı';

  async toggle(enumName: string): Promise<void> {
    await this.tap(`reg-step10-${enumName}`);
  }

  async pickAll(): Promise<number> {
    const options = await idsWithPrefix('reg-step10-');
    for (const option of options) await option.click();
    return options.length;
  }
}

// ── StepMode · Flört / Arkadaş (ZORUNLU, ön seçim YOK) ─────────────────────
export class RegisterStepModeScreen extends StepScreen {
  readonly root = 'reg-stepmode-screen';
  readonly name = 'Kayıt · Mod';

  /** Seçim + "İleri" — mod kartına dokunmak tek başına ilerletmiyor. */
  async pick(mode: 'Dating' | 'Friends'): Promise<void> {
    await this.tap(`reg-mode-${mode}`);
    await this.next();
  }
}

// ── Step13 · hobiler (1-10) ────────────────────────────────────────────────
export class RegisterStep13Screen extends StepScreen {
  readonly root = 'reg-step13-screen';
  readonly name = 'Kayıt · Hobiler';

  async pickHobbies(count: number): Promise<string[]> {
    const picked: string[] = [];
    const pills = await idsWithPrefix('reg-hobby-');
    if (pills.length === 0) throw new Error('Hobi listesi boş (/api/common/hobbies?)');
    for (const pill of pills.slice(0, count)) {
      picked.push(((await pill.getAttribute('name')) ?? '').replace('reg-hobby-', ''));
      await pill.click();
    }
    return picked;
  }
}

// ── Step14 · niyet (tek seçim, zorunlu) ────────────────────────────────────
export class RegisterStep14Screen extends StepScreen {
  readonly root = 'reg-step14-screen';
  readonly name = 'Kayıt · Niyet';

  async pickFirstIntent(): Promise<string> {
    const options = await idsWithPrefix('reg-intent-');
    const first = options[0];
    if (!first) throw new Error('Niyet listesi boş (/api/common/*-intents?)');
    const name = ((await first.getAttribute('name')) ?? '').replace('reg-intent-', '');
    await first.click();
    return name;
  }
}

// ── Step16 · yaşam tarzı (HEPSİ opsiyonel) ─────────────────────────────────
export class RegisterStep16Screen extends StepScreen {
  readonly root = 'reg-step16-screen';
  readonly name = 'Kayıt · Yaşam tarzı';

  /** Başlıktaki "Atla" — alttaki CTA da boşken aynı metni yazıyor. */
  async skip(): Promise<void> {
    await this.tap('reg-step16-skip');
  }
}

// ── Step17 · prompt'lar (1-3) ──────────────────────────────────────────────
export class RegisterStep17Screen extends StepScreen {
  readonly root = 'reg-step17-screen';
  readonly name = 'Kayıt · Sorular';

  /**
   * Bir yuvayı doldurur: soruyu seç → cevabı yaz → kaydet.
   *
   * ⚠️ CEVAP UZUNLUĞU: ürün RN `maxLength` KULLANMIYOR (UTF-16 birimi sayıyor,
   * backend ise code point). Kısa ASCII cevap yazıyoruz — sınır davranışı
   * ayrı bir spec'in konusu (`UT-2205`).
   *
   * ⚠️ Prompt kimliği `enumName`den (`modal-prompt-<enumName>`): katalog iki
   * dilli ve `isActive:false` olanlar listeden düşebiliyor, o yüzden indeksle
   * değil LİSTEDEN SEÇEREK ilerliyoruz.
   */
  async fillSlot(index: number, answer: string): Promise<string> {
    await this.tap(`prompt-slot-${index}-pick`);

    const options = await idsWithPrefix('modal-prompt-');
    const option = options[0];
    if (!option) {
      throw new Error('Prompt seçici boş (/api/common/prompts katalogu?)');
    }
    const picked = ((await option.getAttribute('name')) ?? '').replace('modal-prompt-', '');
    await option.click();

    // Seçimden sonra yuva düzenleme kipine geçiyor; metin alanı o zaman var.
    await this.type(`prompt-slot-${index}-answer`, answer, { hideKeyboard: true });
    // Odak kaybında da commit ediliyor ama açık commit daha deterministik.
    await this.tap(`prompt-slot-${index}-commit`);
    return picked;
  }

  async fillPrompts(count: number): Promise<string[]> {
    if (count < 1 || count > 3) {
      throw new Error(`Prompt sayısı 1-3 olmalı (MAX_PROFILE_PROMPTS), verilen: ${count}`);
    }
    const picked: string[] = [];
    for (let i = 0; i < count; i += 1) {
      // İlk yuva hazır geliyor; sonrakiler için "ekle" butonu.
      if (i > 0) await this.tap('prompt-add');
      picked.push(await this.fillSlot(i, `e2e cevap ${i + 1}`));
    }
    return picked;
  }
}

// ── Step15 · fotoğraflar (min 2, max 6) ────────────────────────────────────
export class RegisterStep15Screen extends BaseScreen {
  readonly root = 'reg-step15-screen';
  readonly name = 'Kayıt · Fotoğraflar';

  async tapAdd(): Promise<void> {
    await this.tap('reg-step15-add');
  }

  /**
   * ⚠️ `PhotoSourceSheet` ve PHPicker instrumentation Tur 2'ye ait; ayrıca
   * PHPicker'ın XCUITest ağacında görünüp görünmediği HENÜZ ÖLÇÜLMEDİ
   * (00-tree-dump, Soru 4 — oturum gerektiriyor).
   */
  async addFromGallery(_count: 2 | 3 | 4 | 5 | 6): Promise<void> {
    throw new Error(
      'Step15 Page Object eksik: PhotoSourceSheet + PHPicker yolu ölçülmedi. ' +
        '00-tree-dump Soru 4 cevaplanmadan yazılmayacak (plan kuralı).'
    );
  }

  async submit(): Promise<void> {
    await this.tap('reg-step15-submit');
  }

  /** "Profili Tamamla" pasif mi — 2'den az fotoğrafta öyle olmalı. */
  submitButton() {
    return this.el('reg-step15-submit');
  }
}

// ── Konum izni sheet'i (Step9 odakta OTOMATİK açıyor) ──────────────────────
export class LocationPermissionSheetScreen extends BaseScreen {
  readonly root = 'sheet-location';
  readonly name = 'Konum izni sheet';

  /** Sheet'in testID'si Tur 2'de; şu an metin köprüsü. */
  override async isOpen(timeout = 1_000): Promise<boolean> {
    if (await super.isOpen(timeout)) return true;
    return byText('auth.step9.allowButton')
      .waitForDisplayed({ timeout })
      .then(
        () => true,
        () => false
      );
  }

  async tapAllow(): Promise<void> {
    await byText('auth.step9.allowButton').click();
  }
}

export const step1 = new RegisterStep1Screen();
export const referral = new RegisterReferralScreen();
export const step3 = new RegisterStep3Screen();
export const step5 = new RegisterStep5Screen();
export const step6 = new RegisterStep6Screen();
export const step7 = new RegisterStep7Screen();
export const step8 = new RegisterStep8Screen();
export const step9 = new RegisterStep9Screen();
export const step10 = new RegisterStep10Screen();
export const stepMode = new RegisterStepModeScreen();
export const step13 = new RegisterStep13Screen();
export const step14 = new RegisterStep14Screen();
export const step15 = new RegisterStep15Screen();
export const step16 = new RegisterStep16Screen();
export const step17 = new RegisterStep17Screen();
export const locationSheet = new LocationPermissionSheetScreen();
