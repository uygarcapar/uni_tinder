import { hydrateProfileForm } from '@/features/profile/utils/hydrateProfileForm';

// Backend'in /api/common/* listelerinin şekli: `enumName` stabil anahtar,
// `name`/`display` lokalize metin.
const opt = (id: number, enumName: string, name: string) => ({
  id,
  enumName,
  name,
  display: { tr: name, en: enumName },
});

const ALCOHOL = [
  opt(0, 'None', 'Kullanmıyorum'),
  opt(1, 'Socially', 'Sosyal İçici'),
  opt(2, 'Regularly', 'Düzenli'),
];

const RELIGIOUS = [
  opt(0, 'Muslim', 'Müslüman'),
  opt(7, 'PreferNotToSay', 'Belirtmek istemiyorum'),
];

const PETS = [opt(0, 'Dog', 'Köpek'), opt(1, 'Cat', 'Kedi')];

const base = {
  myProfile: {},
  hobbyGroups: [],
  smokingOptions: [],
  zodiacOptions: [],
  relationshipIntentOptions: [],
  languageOptions: [],
  petOptions: PETS,
  alcoholOptions: ALCOHOL,
  religiousViewOptions: RELIGIOUS,
};

const hydrate = (myProfile: any, overrides: any = {}) =>
  hydrateProfileForm({ ...base, myProfile, ...overrides } as any);

describe('hydrateProfileForm — alkol ve dini görüş', () => {
  it('enumName ile gelen alkol tercihini option objesine çözer', () => {
    // GetMyProfile `alcoholUsage: "Socially"` döndürüyor; form option OBJESİ
    // tutuyor (submit'te enumOf ile geri çevriliyor).
    const values = hydrate({ alcoholUsage: 'Socially' });
    expect(values.alcohol).toEqual(ALCOHOL[1]);
  });

  it('alkol yalnızca display metniyle gelse de eşleşir', () => {
    // enumName gelmezse lokalize metne düşülüyor — aksi halde kullanıcının
    // kayıtlı tercihi formda boş görünür ve kaydettiğinde SESSİZCE silinirdi
    // (boş alan submit'te ClearAlcoholUsage=true gönderiyor).
    const values = hydrate({ alcoholUsageDisplay: 'Düzenli' });
    expect(values.alcohol).toEqual(ALCOHOL[2]);
  });

  it('alkol tercihi yoksa null döner (form boş açılır)', () => {
    expect(hydrate({}).alcohol).toBeNull();
  });

  it('liste henüz yüklenmemişse null döner, patlamaz', () => {
    // Enum listeleri staticGet ile asenkron geliyor; hydrate ondan önce
    // çalışabilir.
    const values = hydrate({ alcoholUsage: 'Socially' }, { alcoholOptions: [] });
    expect(values.alcohol).toBeNull();
  });

  it('dini görüşü enumName ile çözer', () => {
    const values = hydrate({ religiousView: 'PreferNotToSay' });
    expect(values.religiousView).toEqual(RELIGIOUS[1]);
  });

  it('dini görüş yoksa null döner', () => {
    expect(hydrate({}).religiousView).toBeNull();
  });

  it('tanınmayan enum değerinde null döner (uydurma option üretmez)', () => {
    // Backend enum'a yeni değer eklerse eski client onu tanımaz; null kalması
    // doğru — sahte bir option submit'te geçersiz enumName gönderirdi.
    expect(hydrate({ alcoholUsage: 'Occasionally' }).alcohol).toBeNull();
  });

  it('evcil hayvan çoklu seçimi bozulmadan hidrate olur', () => {
    // Alkol/din eklenirken mevcut alanların kırılmadığının kontrolü.
    const values = hydrate({ pets: ['Dog', 'Cat'] });
    expect(values.pets).toEqual(PETS);
  });
});

describe('hydrateProfileForm — görünürlük bayrakları', () => {
  it('showPremiumBadge alanı hiç gelmezse açık kabul edilir', () => {
    // Backend opt-out: varsayılan true. Alan yokken (eski yanıt / migration
    // öncesi) false'a düşersek kullanıcının rozeti ilk kaydetmede SESSİZCE
    // kapanırdı — submit bu değeri her seferinde geri yazıyor.
    expect(hydrate({}).showPremiumBadge).toBe(true);
  });

  it('showPremiumBadge: false kapalı olarak hidrate olur', () => {
    expect(hydrate({ showPremiumBadge: false }).showPremiumBadge).toBe(false);
  });

  it('diğer görünürlük bayrakları da aynı varsayılan-açık kuralına uyar', () => {
    const values = hydrate({ showAge: false });
    expect(values.showAge).toBe(false);
    expect(values.showMyUniversity).toBe(true);
    expect(values.showMeOnApp).toBe(true);
  });

  it('showLocation alanı hiç gelmezse açık kabul edilir', () => {
    // AddShowLocation migration'ı uygulanmamış bir backend'e karşı çalışırken
    // alan yanıtta yok. false'a düşersek submit bunu geri yazıp kullanıcının
    // konumunu kendi isteği olmadan gizlerdi.
    expect(hydrate({}).showLocation).toBe(true);
  });

  it('showLocation: false kapalı olarak hidrate olur', () => {
    expect(hydrate({ showLocation: false }).showLocation).toBe(false);
  });
});

describe('hydrateProfileForm — isim ve sınıf', () => {
  it('profil adını displayName alanına hidrate eder', () => {
    expect(hydrate({ displayName: 'Eren' }).displayName).toBe('Eren');
  });

  it('profil adı yoksa Identity tarafındaki ada düşer', () => {
    // UpdateProfile ikisini senkronluyor ama senkron YENİ: daha önce profil adı
    // değişip Identity'deki ad eski kalmış hesaplarda tek dolu alan bu olabilir.
    // Boş string'le açılırsa kullanıcı adını sıfırdan yazmak zorunda kalırdı.
    expect(hydrate({ user: { displayName: 'Eren' } }).displayName).toBe('Eren');
    expect(hydrate({ user: { name: 'Eren' } }).displayName).toBe('Eren');
  });

  it('hiç isim yoksa boş string döner (undefined değil)', () => {
    // TextInput'a undefined verirsek RN alanı uncontrolled'a çevirir.
    expect(hydrate({}).displayName).toBe('');
  });

  it('sınıfı olduğu gibi hidrate eder, hazırlık (0) dahil', () => {
    expect(hydrate({ yearOfStudy: 3 }).yearOfStudy).toBe(3);
    // 0 = Hazırlık: GEÇERLİ bir değer, "seçilmedi" değil.
    expect(hydrate({ yearOfStudy: 0 }).yearOfStudy).toBe(0);
    expect(hydrate({ yearOfStudy: 6 }).yearOfStudy).toBe(6);
  });

  it('sınıf yoksa null döner', () => {
    expect(hydrate({}).yearOfStudy).toBeNull();
  });

  it('aralık dışı sınıfı (eski Range(0,8) ile yazılmış 7/8) null yapar', () => {
    // Backend bu değerlerde yearOfStudyDisplay üretemiyor — sınıf hiçbir yerde
    // görünmüyor. Formda seçili göstermek "kayıtlı ve çalışıyor" yalanı olurdu.
    expect(hydrate({ yearOfStudy: 7 }).yearOfStudy).toBeNull();
    expect(hydrate({ yearOfStudy: 8 }).yearOfStudy).toBeNull();
    expect(hydrate({ yearOfStudy: -1 }).yearOfStudy).toBeNull();
  });

  it('sayı olmayan sınıf değerini null yapar', () => {
    expect(hydrate({ yearOfStudy: '3' }).yearOfStudy).toBeNull();
  });
});
