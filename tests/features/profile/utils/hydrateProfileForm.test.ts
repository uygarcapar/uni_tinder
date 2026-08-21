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
});
