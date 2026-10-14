/**
 * "Son girilen hesabın maili" — login ekranının önden dolu gelmesinin diski.
 *
 * Kritik nokta trim/boş davranışı: yazma yalnız DOLU bir adresle yapılıyor.
 * Boş string yazılabilseydi, adresi silip çıkan bir kullanıcıda diskteki
 * geçerli adres boşla ezilirdi; okuma da `defaultValue` olarak kullanıldığı
 * için her durumda string dönmek zorunda (undefined, react-hook-form'da
 * kontrolsüz alan demek).
 */

import { appPrefs } from '@/shared/utils/appPrefs';
import {
  clearLastLoginEmail,
  loadLastLoginEmail,
  saveLastLoginEmail,
} from '@/features/auth/lastEmail';

beforeEach(() => {
  appPrefs.clearAll?.();
});

describe('lastEmail', () => {
  it('hiç yazılmadıysa boş string döner', () => {
    expect(loadLastLoginEmail()).toBe('');
  });

  it('yazılan adresi geri verir', () => {
    saveLastLoginEmail('ali@uni.edu.tr');
    expect(loadLastLoginEmail()).toBe('ali@uni.edu.tr');
  });

  it('boşlukları kırpar — kullanıcı yapıştırırken sağına boşluk alıyor', () => {
    saveLastLoginEmail('  ali@uni.edu.tr \n');
    expect(loadLastLoginEmail()).toBe('ali@uni.edu.tr');
  });

  it('boş/yoklukta diskteki geçerli adresi EZMEZ', () => {
    saveLastLoginEmail('ali@uni.edu.tr');
    saveLastLoginEmail('');
    saveLastLoginEmail('   ');
    saveLastLoginEmail(null);
    saveLastLoginEmail(undefined);
    expect(loadLastLoginEmail()).toBe('ali@uni.edu.tr');
  });

  it('yeni adres eskisinin yerine geçer (e-posta değişimi)', () => {
    saveLastLoginEmail('ali@uni.edu.tr');
    saveLastLoginEmail('veli@uni.edu.tr');
    expect(loadLastLoginEmail()).toBe('veli@uni.edu.tr');
  });

  it('temizlendikten sonra boş string döner (hesap kalıcı silindi)', () => {
    saveLastLoginEmail('ali@uni.edu.tr');
    clearLastLoginEmail();
    expect(loadLastLoginEmail()).toBe('');
  });
});
