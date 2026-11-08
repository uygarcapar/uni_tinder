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
  // Davet kodu — sihirbazın İLK adımı. Kodu 6 haneli mail doğrulamasından
  // (Step2) hemen sonra sormak ürün kararı: kullanıcı daveti hatırlarken
  // soruluyor, dokuz adım sonra değil. Adım opsiyonel, "Atla" belirgin.
  'RegisterReferral',
  'RegisterStep3',
  'RegisterStep5',
  'RegisterStep6',
  'RegisterStep7',
  'RegisterStep8',
  'RegisterStep9',
  'RegisterStep12',
  // Mod adımı yok: kayıt hep Arkadaş modunda, Flört profili uygulamadan açılıyor
  // (bkz. DiscoverModeCoach).
  // Kiminle ilgilendiğin — flörtte HER ZAMAN, arkadaşta YALNIZ Non-Binary
  // kullanıcıda (orada soru "arkadaş modunda kimleri görmek istersin" hâline
  // geliyor). Arkadaşta ikili kategorilerde adım atlanıyor ve değeri sunucu
  // kendi cinsiyetinden türetip kilitliyor; kullanıcı sonradan flört profilini
  // açarsa soru o akışta soruluyor.
  'RegisterStep10',
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

/**
 * Arkadaş modunda ELENEBİLİR adımlar.
 *
 * Eleme KOŞULLU: Arkadaş seçen kullanıcı bunları normalde hiç görmüyor, ama
 * Non-Binary kullanıcıda `RegisterStep10` havuz sorusu olarak akışta kalıyor
 * (bkz. `stepsForMode`un `asksFriendsPool` parametresi).
 *
 * Set olarak duruyor çünkü iki yer okuyor: ilerleme çubuğunun payda hesabı ve
 * resume yığını. İkisi ayrışırsa Arkadaş kullanıcısının barı 14/15'te takılır
 * ya da geri tuşu ona ait olmayan bir soruya düşer.
 */
export const DATING_ONLY_STEPS: ReadonlySet<string> = new Set(['RegisterStep10']);

/**
 * Seçilen moda göre gerçekten gösterilecek adımlar.
 *
 * `mode` henüz yoksa (kullanıcı mod adımına gelmemiş) HİÇBİR ŞEY elenmiyor:
 * o noktada barın paydası tam akış, ve mod seçilince payda bir adım kısalıyor.
 * Arkadaş'ta barın bir tık ilerlemesi doğru olan — adım gerçekten azaldı.
 */
export function stepsForMode(
  mode?: string | null,
  asksFriendsPool = false,
): RegistrationStepRoute[] {
  if (mode !== 'Friends') return [...REGISTRATION_FLOW];
  // Arkadaş'ta InterestedIn adımı KOŞULLU elenir. Non-Binary kullanıcıya
  // "arkadaş modunda kimleri görmek istersin" sorusu bu adımın kendisi:
  // onlarda "yalnız kendi kategorin" kuralı kampüs ölçeğinde boş deste
  // demekti. İkili kategorilerde değeri sunucu türetip kilitlediği için adım
  // orada hâlâ elenmeli.
  //
  // Karar BURADA TÜRETİLMİYOR, çağırandan geliyor (bkz. useAsksFriendsPool):
  // bu modülün cinsiyet kataloğuna erişimi yok ve olmamalı.
  if (asksFriendsPool) return [...REGISTRATION_FLOW];
  return REGISTRATION_FLOW.filter((r) => !DATING_ONLY_STEPS.has(r));
}

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
  mode?: string | null,
  asksFriendsPool = false,
): RegistrationStepRoute[] {
  // ⚠️ Eleme ÖNCE yapılıyor, slice SONRA: tam akıştan dilimleyip sonra elemek
  // Arkadaş kullanıcısında yığını bir adım kısa bırakır (elenen adım dilimin
  // İÇİNDEyse). Eleme sonrası dizide index de kaydığı için `indexOf` de bu
  // dizide aranmalı.
  const steps = stepsForMode(mode, asksFriendsPool);
  const at = (steps as readonly string[]).indexOf(route ?? '');
  if (at <= 0) return [FIRST_REGISTRATION_STEP];
  return steps.slice(0, at + 1);
}

/**
 * Numarasız adımların progress bar karşılığı.
 *
 * Bar bir SAYI alıyor (`RegisterProgressBar step={13}`) ve sayı bugüne kadar
 * rota adından türetiliyordu. "RegisterReferral"da o türetme NaN üretir ve adım
 * bardaki yerini kaybeder — bu yüzden akışın başındaki adıma açık bir 0
 * veriliyor. Yeni bir numarasız adım eklenirse burada da bir sayı almalı.
 */
export const REFERRAL_STEP_NUMBER = 0;

/**
 * Mod adımının bar numarası. 18, "numara ekranın eklenme sırasını gösterir"
 * konvansiyonunun devamı (Step17 de öyleydi) — akıştaki YERİ bu sayıdan değil
 * REGISTRATION_FLOW dizisinden okunuyor.
 */
export const MODE_STEP_NUMBER = 18;

const STEP_NUMBER_OVERRIDES: Record<string, number> = {
  RegisterReferral: REFERRAL_STEP_NUMBER,
  RegisterStepMode: MODE_STEP_NUMBER,
};

const numberFor = (route: string): number =>
  STEP_NUMBER_OVERRIDES[route] ?? Number(route.replace('RegisterStep', ''));

/** "RegisterStep13" → 13. Progress bar numarayla çalışıyor. */
export const REGISTRATION_STEP_NUMBERS: number[] =
  REGISTRATION_FLOW.map(numberFor);

/**
 * Barın moda göre payda listesi. Arkadaş modunda flörte özel adım çıkınca
 * payda da kısalıyor — yoksa bar son adımda %100'e varmaz.
 */
export function stepNumbersForMode(
  mode?: string | null,
  asksFriendsPool = false,
): number[] {
  return stepsForMode(mode, asksFriendsPool).map(numberFor);
}
