export type RegMode = 'Dating' | 'Friends';

export interface NewUserSpec {
  /** Her şeyin türediği tohum — koşunun ilk satırına basılıyor. */
  readonly seed: number;
  /** Taze, kullanılmamış `@bilgiedu.net` adresi. */
  readonly email: string;
  readonly password: string;
  readonly firstName: string;
  readonly dob: { day: number; month: number; year: number };
  readonly mode: RegMode;
  /** 0 = Hazırlık, 1-6. */
  readonly yearOfStudy: number;
  /** Verilmezse cetvel sürüklenmiyor; varsayılan 170 zaten geçerli. */
  readonly heightCm?: number;
  readonly hobbyCount: number;
  readonly promptCount: number;
  readonly photoCount: 2 | 3 | 4 | 5 | 6;
  readonly referralCode?: string;
  /** Step16 tamamen opsiyonel — varsayılan davranış "Atla". */
  readonly skipLifestyle: boolean;
}

export interface RegisteredUser {
  readonly spec: NewUserSpec;
  readonly email: string;
  readonly password: string;
  /**
   * TEMİZLİK DEFTERİ için. UI'dan okunmuyor: tohumlayıcı `/api/user/Login` ile
   * alıyor (botla aynı yol).
   *
   * ⚠️ E-posta DEĞİŞTİREN spec'ler (39-account-email) burayı güncellemek
   * zorunda — yoksa temizlik eski adresle silmeye çalışır ve hesap kalır.
   */
  userId?: string;
}
