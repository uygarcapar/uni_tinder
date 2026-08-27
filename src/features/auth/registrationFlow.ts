/**
 * Kayıt sihirbazının AKIŞ SIRASI — tek kaynak.
 *
 * DİKKAT: dizi akış sırasında, sayısal sırada DEĞİL. Step4 (telefon) ve Step11
 * (yaş aralığı) akıştan çıkarıldı ama kalan ekranların adları korundu; Step16
 * (alkol + dini görüş) fotoğraf adımından (15) ÖNCE geliyor.
 *
 * Hem ilerleme çubuğu (RegisterProgressBar) hem de "kaldığın yerden devam et"
 * (AppNavigator resume) buradan okur — bir adım eklenir/çıkarılırsa değişecek
 * tek yer burasıdır.
 */
export const REGISTRATION_FLOW = [
  'RegisterStep3',
  'RegisterStep5',
  'RegisterStep6',
  'RegisterStep7',
  'RegisterStep8',
  'RegisterStep9',
  'RegisterStep10',
  'RegisterStep12',
  'RegisterStep13',
  // Sorular (prompt'lar) — bio'nun yerini alan adım. Hobilerden SONRA, yaşam
  // tarzından ÖNCE: serbest metin akışın en yüksek terk riski, fotoğraf adımı
  // (Step15) da öyle. İkisini arka arkaya koymamak için araya yerleştirildi.
  // Numara 17 tarihsel bir devam, sıra bu diziden okunuyor.
  'RegisterStep17',
  'RegisterStep14',
  'RegisterStep16',
  'RegisterStep15',
] as const;

export type RegistrationStepRoute = (typeof REGISTRATION_FLOW)[number];

/** Akışın ilk adımı — resume doğrulanamazsa buraya düşülür. */
export const FIRST_REGISTRATION_STEP: RegistrationStepRoute = REGISTRATION_FLOW[0];

/** Rota adı kayıt sihirbazına ait mi? (Welcome/Login/Step1/Step2 hariç.) */
export function isRegistrationStep(name?: string | null): name is RegistrationStepRoute {
  return !!name && (REGISTRATION_FLOW as readonly string[]).includes(name);
}

/**
 * Kaldığı adıma kadar olan yığın — soğuk açılışta NavigationContainer'a
 * initialState olarak verilir.
 *
 * Yalnız `initialRouteName` verilseydi yığında tek ekran olurdu ve geri butonu
 * (goBack) ölü kalırdı: kullanıcı 13'te devam edip 12'yi düzeltemezdi. Bu yüzden
 * önceki adımlar da yığına diziliyor. Ekranlar native-stack'te tembel mount
 * olduğu için alttakiler açılış maliyetine binmez.
 */
export function registrationResumeStack(
  route?: string | null,
): RegistrationStepRoute[] {
  const at = (REGISTRATION_FLOW as readonly string[]).indexOf(route ?? '');
  if (at <= 0) return [FIRST_REGISTRATION_STEP];
  return REGISTRATION_FLOW.slice(0, at + 1);
}

/** "RegisterStep13" → 13. Progress bar numarayla çalışıyor. */
export const REGISTRATION_STEP_NUMBERS: number[] = REGISTRATION_FLOW.map((r) =>
  Number(r.replace('RegisterStep', '')),
);
