// jest.setup.ts'in reanimated mock'u (`react-native-reanimated/src/mock`)
// gerçek index'i çekip worklets'in native tarafını arıyor ve test ortamında
// patlıyor. Bu ekran için animasyon davranışı test edilmiyor — yerel, iskelet
// bir mock yeterli (sonradan kaydedilen factory kazanır).
jest.mock('react-native-reanimated', () => {
  const { View, Text } = require('react-native');
  return {
    __esModule: true,
    default: { View, Text },
    useSharedValue: (v: any) => ({ value: v }),
    useAnimatedStyle: (fn: any) => fn(),
    // Callback'i ÇAĞIRMASI şart: bazı geçişler bitince stili durağan hale
    // döndürüyor (free tavan şeridi `auto` yüksekliğe dönüyor). Yutulursa
    // bileşen testte kalıcı "animasyonda" sanılır.
    withTiming: (v: any, _cfg?: any, cb?: any) => {
      cb?.(true);
      return v;
    },
    withSequence: (...v: any[]) => v[v.length - 1],
    runOnJS: (fn: any) => fn,
    // withTiming hedef değeri döndürüyor; easing yalnız çağrılabilir olmalı.
    Easing: { out: (fn: any) => fn, quad: (t: any) => t },
  };
});
// GestureDetector reanimated'ın worklet API'sini (useEvent) istiyor; yukarıdaki
// iskelet mock'ta yok. Mesafe/boy slider'larının jesti bu testin konusu değil —
// detector passthrough, Gesture zincirlenebilir no-op.
jest.mock('react-native-gesture-handler', () => {
  const React = require('react');
  const { View } = require('react-native');
  const chainable: any = new Proxy({}, { get: () => () => chainable });
  return {
    Gesture: { Pan: () => chainable },
    GestureDetector: ({ children }: any) =>
      React.createElement(View, null, children),
  };
});
jest.mock('lucide-react-native', () =>
  new Proxy({}, { get: () => () => null })
);
jest.mock('expo-haptics', () => ({
  selectionAsync: jest.fn(() => Promise.resolve()),
  notificationAsync: jest.fn(() => Promise.resolve()),
  NotificationFeedbackType: { Warning: 'warning' },
}));
jest.mock('react-native-svg', () => {
  const React = require('react');
  const { View } = require('react-native');
  return {
    __esModule: true,
    default: ({ children }: any) => React.createElement(View, null, children),
    Circle: () => null,
  };
});
// SF sembol adını testID olarak sızdırıyor — pill ikonlarının hangi sembolü
// kullandığı ancak böyle assert edilebiliyor.
jest.mock('@/shared/components/SFIcon', () => {
  const React = require('react');
  const { View } = require('react-native');
  return {
    __esModule: true,
    default: ({ name }: any) =>
      React.createElement(View, { testID: `sficon-${name}` }),
  };
});
jest.mock('@/shared/components/HobbyIcon', () => ({
  __esModule: true,
  default: () => null,
}));
// Apply ve Sıfırla butonları AppModal'ın header'ında — kaydetme payload'ını
// doğrulayabilmek için mock'ta da birer tetikleyici olarak render ediliyorlar.
jest.mock('@/shared/components/AppModal', () => {
  const React = require('react');
  const { View, Text, TouchableOpacity } = require('react-native');
  return {
    __esModule: true,
    default: ({
      visible,
      children,
      actionLabel,
      onAction,
      leftLabel,
      onLeftPress,
    }: any) =>
      visible
        ? React.createElement(View, { testID: 'app-modal' }, [
            React.createElement(
              TouchableOpacity,
              { key: 'left', testID: 'reset', onPress: onLeftPress },
              React.createElement(Text, null, leftLabel),
            ),
            React.createElement(
              TouchableOpacity,
              { key: 'action', testID: 'apply', onPress: onAction },
              React.createElement(Text, null, actionLabel),
            ),
            React.createElement(View, { key: 'body' }, children),
          ])
        : null,
  };
});
jest.mock('@/features/discover/components/CityPickerModal', () => ({
  __esModule: true,
  default: () => null,
}));
jest.mock('@/features/discover/components/UniversityPickerModal', () => ({
  __esModule: true,
  default: () => null,
}));
jest.mock('@/shared/services/toaster', () => ({ showInfoToast: jest.fn() }));
jest.mock('@/shared/services/uiBus', () => ({
  __esModule: true,
  default: { emit: jest.fn() },
}));

// Enum listeleri factory İÇİNDE kuruluyor: jest.mock hoist edildiği için
// dışarıdaki değişkenlere (mock* öneki olmadıkça) erişemiyor.
jest.mock('@/shared/queries/commonQueries', () => {
  // `id` gerçek enum int değeri (dokümandaki tablolar) — int biçiminde gelen
  // seçimlerin eşleşmesi buna bağlı.
  const opt = (id: number, enumName: string, tr: string) => ({
    id,
    name: enumName,
    enumName,
    display: { tr, en: enumName },
  });
  return {
    useCities: () => ({ data: [], isLoading: false }),
    useUniversities: () => ({
      data: [
        { domain: 'itu.edu.tr', name: 'İstanbul Teknik Üniversitesi' },
        { domain: 'boun.edu.tr', name: 'Boğaziçi Üniversitesi' },
        { domain: 'ogr.deu.edu.tr', name: 'Dokuz Eylül Üniversitesi' },
      ],
      isLoading: false,
    }),
    useHobbies: () => ({ data: [], isLoading: false }),
    useRelationshipIntents: () => ({ data: [], isLoading: false }),
    useZodiacs: () => ({
      data: [opt(0, 'Aries', 'Koç'), opt(4, 'Leo', 'Aslan')],
      isLoading: false,
    }),
    useSmokingStatuses: () => ({
      data: [opt(0, 'None', 'Kullanmıyorum')],
      isLoading: false,
    }),
    useAlcoholUsages: () => ({
      data: [
        opt(0, 'None', 'İçmiyorum'),
        opt(1, 'Socially', 'Sosyal İçici'),
        opt(2, 'Regularly', 'Düzenli'),
      ],
      isLoading: false,
    }),
    // Backend'in gerçek sırası: önce türler, sonra None → Allergic → Other.
    // Filtre listesi bu üçünü elemeli, sırayı ise korumalı.
    usePets: () => ({
      data: [
        opt(0, 'Dog', 'Köpek'),
        opt(1, 'Cat', 'Kedi'),
        opt(2, 'Bird', 'Kuş'),
        opt(9, 'None', 'Yok'),
        opt(10, 'Allergic', 'Hayvan sevmiyorum'),
        opt(11, 'Other', 'Diğer'),
      ],
      isLoading: false,
    }),
    // PreferNotToSay backend listesinde DÖNÜYOR; filtre onu elemeli
    // (bkz. FILTER_HIDDEN_RELIGIOUS_VIEWS).
    useReligiousViews: () => ({
      data: [
        opt(0, 'Muslim', 'Müslüman'),
        opt(5, 'Agnostic', 'Agnostik'),
        opt(8, 'PreferNotToSay', 'Belirtmek istemiyorum'),
      ],
      isLoading: false,
    }),
    useLanguages: () => ({
      data: [
        opt(0, 'Turkish', 'Türkçe'),
        opt(1, 'English', 'İngilizce'),
        opt(2, 'German', 'Almanca'),
      ],
      isLoading: false,
    }),
    normalizeDomain: (v: any) => String(v ?? '').trim().toLowerCase(),
    resolveLocalized: (display: any, lang: string, fallback: string) =>
      display?.[lang] ?? fallback,
  };
});

import React from 'react';
import { render, screen, fireEvent } from '@testing-library/react-native';
import FilterModal from '@/features/discover/components/FilterModal';

// Backend'in dealbreakerCapableFields listesi (2026-08-17 sözleşmesi).
// Dil ve dini görüş bu sürümle eklendi; `UsagePurpose` ise "kullanım amacı"
// alanı üründen çıkınca listeden düştü.
const ALL_CAPABLE = [
  'YearOfStudy', 'Height', 'Zodiac', 'Smoking', 'Pets',
  'Alcohol', 'Language', 'Religion',
];

// Backend GET /api/swipe/Filters yanıtının bu ekranı ilgilendiren iskeleti.
const baseFilters = {
  maxDistance: 50,
  // Slider sınırları 2026-08-21'den beri yanıttan geliyor (free 75 / premium
  // 150). Fixture'da olmaları önemli: eksikse bileşen tier sabitlerine düşer
  // ve test, üretimde ARTIK KULLANILMAYAN yolu doğrulamış olur.
  minSelectableDistanceKm: 5,
  maxSelectableDistanceKm: 75,
  interestedIn: ['Women'],
  preferredCity: null,
  preferredUniversityDomain: 'boun.edu.tr',
  visibleOnlyToUniversityDomains: ['itu.edu.tr', 'boun.edu.tr'],
  hiddenFromUniversityDomains: ['ogr.deu.edu.tr'],
  preferredHobbies: [],
  relationshipIntents: [],
  // Backend'in gerçek listesi — PUT alan adlarını kullanıyor (GET'teki
  // Preferred* adlarını değil).
  premiumOnlyFields: [
    'UniversityDomain', 'VisibleOnlyToUniversityDomains',
    'HiddenFromUniversityDomains', 'City', 'Department', 'YearsOfStudy',
    'HeightMin', 'HeightMax', 'ZodiacSigns', 'SmokingStatuses', 'HasPets',
    'RelationshipIntents', 'HairColors', 'HairStyles',
    'EyeColors', 'FacialHairs', 'HasGlasses', 'PreferredHobbies',
    'AlcoholUsages', 'Pets', 'SpokenLanguages', 'ReligiousViews',
  ],
  heightMin: 175,
  heightMax: 190,
  hasPets: true,
  pets: [],
  alcoholUsages: [],
  spokenLanguages: [],
  religiousViews: [],
  zodiacSigns: ['Aries'],
  dealbreakers: ['Height'],
  dealbreakerCapableFields: ALL_CAPABLE,
  rankingOnlyFields: ['PreferredHobbies', 'RelationshipIntents'],
};

const renderModal = (filters: any, opts: any = {}) => {
  const onSave = jest.fn();
  render(
    <FilterModal
      visible
      onClose={jest.fn()}
      filters={filters}
      isPremium={opts.isPremium ?? true}
      onSave={onSave}
      saving={false}
    />,
  );
  return { onSave };
};

// i18n gerçek sözlükle 'tr' başlatılıyor (jest.setup.ts) — assert'ler
// kullanıcı-görünür Türkçe metin üzerinden.
const DB_ON = 'Bu filtreye uymayanları hiç gösterme';
const DB_OFF = 'Kişiler tükenirse bu filtre dışındakileri de göster';

// Toggle sayısı = iki durum etiketinin toplamı (her toggle birini gösterir).
const toggleCount = () =>
  screen.queryAllByText(DB_ON).length + screen.queryAllByText(DB_OFF).length;

describe('FilterModal — premium filtreler', () => {
  it('grup başlığını ve sekiz filtreyi render eder', () => {
    renderModal(baseFilters);

    expect(screen.getByText('Premium Filtreler')).toBeTruthy();
    // "Kullanım Amacı" listede YOK: alan üründen çıktı.
    [
      'Boy', 'Sınıf', 'Burç', 'Sigara', 'Alkol', 'Evcil Hayvan',
      'Konuştuğu diller', 'Dini görüş',
    ].forEach((title) => expect(screen.getByText(title)).toBeTruthy());
    expect(screen.queryByText('Kullanım Amacı')).toBeNull();
    // Enum seçenekleri aktif dile çözülmüş gelmeli (resolveLocalized).
    expect(screen.getByText('Koç')).toBeTruthy();
    expect(screen.getByText('Kullanmıyorum')).toBeTruthy();
    expect(screen.getByText('Sosyal İçici')).toBeTruthy();
  });

  it('pill ikonları Register/EditProfileForm ile aynı sembolleri kullanır', () => {
    // Aynı burcu üç ekranda da aynı ikonla görmek gerekiyor; semboller
    // RegisterStep14Screen ZODIAC_MAP'ten.
    renderModal(baseFilters);
    expect(screen.getByTestId('sficon-flame.fill')).toBeTruthy(); // Koç
    expect(screen.getByTestId('sficon-sun.max.fill')).toBeTruthy(); // Aslan
    expect(screen.getByTestId('sficon-smoke.fill')).toBeTruthy(); // sigara
    // person.2.fill artık yalnız "İlgi Alanı"ndaki Non-Binary pill'inde:
    // "Arkadaşlık" amaç pill'i kalktı.
    expect(screen.getAllByTestId('sficon-person.2.fill').length).toBe(1);
    expect(screen.getByTestId('sficon-pawprint.fill')).toBeTruthy(); // hayvanı var
  });

  it('boy aralığını iki ucu da doluyken aralık olarak gösterir', () => {
    renderModal(baseFilters);
    expect(screen.getByText('175 – 190 cm')).toBeTruthy();
  });

  it('boyun serbest ucunu tek taraflı etiketler', () => {
    renderModal({ ...baseFilters, heightMax: null });
    expect(screen.getByText('175 cm ve üzeri')).toBeTruthy();
  });

  it('boy filtresi kapalıyken "Farketmez" gösterir', () => {
    renderModal({ ...baseFilters, heightMin: null, heightMax: null });
    // "Farketmez" evcil hayvan bölümünde de geçiyor — burada asıl kanıt
    // aralık etiketinin hiç çizilmemesi.
    expect(screen.queryByText('175 – 190 cm')).toBeNull();
    expect(screen.getAllByText('Farketmez').length).toBeGreaterThan(0);
  });

  it('boyu boş profillerin elendiği uyarısını bölüm açıklamasında tutar', () => {
    // Uyarı slider'ın altında değil, info ikonunun yanında — o yüzden filtre
    // kapalıyken de görünür.
    renderModal({ ...baseFilters, heightMin: null, heightMax: null });
    expect(
      screen.getByText(
        'Aradığın boy aralığını seç; iki ucu da serbest bırakabilirsin. Filtre açıkken boyunu girmemiş profiller gösterilmez.',
      ),
    ).toBeTruthy();
  });

  it('slider uçlarındaki 120/230 cm etiketlerini çizmez', () => {
    renderModal(baseFilters);
    expect(screen.queryByText('120 cm')).toBeNull();
    expect(screen.queryByText('230 cm')).toBeNull();
  });

  it('evcil hayvanı tek seçim grubunda dört modla render eder', () => {
    renderModal(baseFilters);
    // Legacy üç mod + tür bazlı seçim; hepsi TEK grup, ayrı iki kontrol değil.
    expect(screen.getByText('Evcil hayvanı var')).toBeTruthy();
    expect(screen.getByText('Evcil hayvanı yok')).toBeTruthy();
    expect(screen.getByText('Belirli türler')).toBeTruthy();
    // Mod "var" olduğu için tür chip'leri kapalı.
    expect(screen.queryByText('Kedi')).toBeNull();
  });

  it('"Farketmez" moduna geçince hasPets temizlenir', () => {
    const { onSave } = renderModal(baseFilters);

    fireEvent.press(screen.getAllByText('Farketmez')[0]);
    fireEvent.press(screen.getByTestId('apply'));

    expect(onSave.mock.calls[0][0].premiumFilters.hasPets).toBeNull();
  });

  it('"Belirli türler" modunda tür chip\'lerini açar ve None/Allergic/Other\'ı gizler', () => {
    renderModal(baseFilters);

    fireEvent.press(screen.getByText('Belirli türler'));

    // Gerçek türler geldiği sırada; profil ekranına özgü üç seçenek yok.
    expect(screen.getByText('Köpek')).toBeTruthy();
    expect(screen.getByText('Kedi')).toBeTruthy();
    expect(screen.getByText('Kuş')).toBeTruthy();
    expect(screen.queryByText('Yok')).toBeNull();
    expect(screen.queryByText('Hayvan sevmiyorum')).toBeNull();
    expect(screen.queryByText('Diğer')).toBeNull();
    // OR semantiği yazılı olmalı — yoksa "kedi+köpek seçtim" bug sanılıyor.
    expect(
      screen.getByText(
        'Seçtiğin türlerden en az birine sahip olan profiller gösterilir.',
      ),
    ).toBeTruthy();
  });

  it('tür seçimi legacy hasPets\'i ezer (çelişkili çift gönderilmez)', () => {
    // Backend `pets` doluyken `hasPets`i zaten yok sayıyor; ikisini birden
    // göndermek "gönderdim ama uygulanmadı" belirsizliği yaratırdı.
    const { onSave } = renderModal(baseFilters); // hasPets: true

    fireEvent.press(screen.getByText('Belirli türler'));
    fireEvent.press(screen.getByText('Kedi'));
    fireEvent.press(screen.getByText('Kuş'));
    fireEvent.press(screen.getByTestId('apply'));

    const { pets, hasPets } = onSave.mock.calls[0][0].premiumFilters;
    expect(pets).toEqual(['Cat', 'Bird']);
    expect(hasPets).toBeNull();
  });

  it('kayıtlı tür seçimiyle açılır ve legacy modu göstermez', () => {
    renderModal({ ...baseFilters, pets: ['Cat'], hasPets: true });

    // `pets` dolu → mod "Belirli türler", chip'ler açık, hasPets yok sayılmış.
    expect(screen.getByText('Kedi')).toBeTruthy();
  });

  it('tür seçiminden legacy moda dönünce tür listesi temizlenir', () => {
    const { onSave } = renderModal({ ...baseFilters, pets: ['Cat'] });

    fireEvent.press(screen.getByText('Evcil hayvanı yok'));
    fireEvent.press(screen.getByTestId('apply'));

    const { pets, hasPets } = onSave.mock.calls[0][0].premiumFilters;
    expect(pets).toEqual([]);
    expect(hasPets).toBe(false);
  });

  it('alkol seçimini enumName listesi olarak gönderir', () => {
    const { onSave } = renderModal(baseFilters);

    fireEvent.press(screen.getByText('İçmiyorum'));
    fireEvent.press(screen.getByText('Sosyal İçici'));
    fireEvent.press(screen.getByTestId('apply'));

    expect(onSave.mock.calls[0][0].premiumFilters.alcoholUsages).toEqual([
      'None', 'Socially',
    ]);
  });

  it('alkol filtresinin daraltma uyarısını bölüm açıklamasında tutar', () => {
    // Alan profilde zorunlu değil: filtre açıkken boş bırakanlar eleniyor.
    // Uyarı seçim yokken de görünmeli, o yüzden açıklamada.
    renderModal(baseFilters);
    expect(
      screen.getByText(
        'Yalnızca seçtiğin alkol tercihine sahip kişileri gör. Filtre açıkken bu tercihi belirtmemiş profiller gösterilmez.',
      ),
    ).toBeTruthy();
  });

  it('boş alkol filtresinde dealbreaker anahtarı KAPALI başlar', () => {
    // Migration mevcut kullanıcılarda `Alcohol` bitini açıyor ama herkesin
    // alkol tercihi boş — anahtar açık görünürse kullanıcı ilk pill'e
    // dokunduğunda filtre habersizce katı hale gelirdi.
    const { onSave } = renderModal({
      ...baseFilters,
      dealbreakers: ['Height', 'Alcohol'],
    });

    fireEvent.press(screen.getByTestId('apply'));

    expect(onSave.mock.calls[0][0].dealbreakers).toEqual(['Height']);
  });

  // ─── Dini görüş (2026-08-17 sözleşmesi) ───────────────────────────────────

  it('dini görüş seçimini enumName listesi olarak gönderir', () => {
    const { onSave } = renderModal(baseFilters);

    fireEvent.press(screen.getByText('Müslüman'));
    fireEvent.press(screen.getByText('Agnostik'));
    fireEvent.press(screen.getByTestId('apply'));

    expect(onSave.mock.calls[0][0].premiumFilters.religiousViews).toEqual([
      'Muslim', 'Agnostic',
    ]);
  });

  it('dini görüş listesinden "Belirtmek istemiyorum" seçeneğini eler', () => {
    // Backend enum listesinde dönüyor ama filtre olarak anlamsız: bu filtre
    // açıkken görüşünü paylaşmayanlar zaten eleniyor, yani seçenek hiçbir
    // zaman sonuç üretmezdi.
    renderModal(baseFilters);

    expect(screen.getByText('Müslüman')).toBeTruthy();
    expect(screen.queryByText('Belirtmek istemiyorum')).toBeNull();
  });

  it('dini görüş uyarısını yalnızca seçim varken gösterir', () => {
    const HIDDEN_NOTE =
      'Bu filtre açıkken dini görüşünü belirtmemiş ve "Belirtmek istemiyorum" seçmiş profiller gösterilmez. Anahtarı kapalı bırakırsan kişiler tükendiğinde filtre otomatik gevşer.';

    renderModal(baseFilters);
    // Seçim yokken filtrenin yan etkisi de yok — uyarı gürültü olurdu.
    expect(screen.queryByText(HIDDEN_NOTE)).toBeNull();

    fireEvent.press(screen.getByText('Müslüman'));
    expect(screen.getByText(HIDDEN_NOTE)).toBeTruthy();
  });

  it('dini görüşü int olarak gelse de seçili okur', () => {
    const { onSave } = renderModal({ ...baseFilters, religiousViews: [0] });

    fireEvent.press(screen.getByText('Müslüman')); // seçiliyi kaldır
    fireEvent.press(screen.getByTestId('apply'));

    expect(onSave.mock.calls[0][0].premiumFilters.religiousViews).toEqual([]);
  });

  // ─── Dil (2026-08-17 sözleşmesi) ──────────────────────────────────────────

  it('kayıtlı dilleri sayaç satırı ve pill olarak gösterir', () => {
    renderModal({ ...baseFilters, spokenLanguages: ['English', 'German'] });

    expect(screen.getByText('2 dil seçildi')).toBeTruthy();
    expect(screen.getByText('İngilizce')).toBeTruthy();
    expect(screen.getByText('Almanca')).toBeTruthy();
    // OR semantiği yazılı olmazsa "ikisini birden bilen" sanılıyor.
    expect(
      screen.getByText(
        'En az biri yeterli, hepsini birden konuşması gerekmez. Filtre açıkken dilini belirtmemiş profiller gösterilmez.',
      ),
    ).toBeTruthy();
  });

  it('dil pill\'ine dokununca seçimden düşürür', () => {
    const { onSave } = renderModal({
      ...baseFilters,
      spokenLanguages: ['English', 'German'],
    });

    fireEvent.press(screen.getByText('Almanca'));
    fireEvent.press(screen.getByTestId('apply'));

    expect(onSave.mock.calls[0][0].premiumFilters.spokenLanguages).toEqual([
      'English',
    ]);
  });

  it('dili int olarak gelse de seçili okur', () => {
    // Diğer enum alanlarıyla aynı biçim belirsizliği (bkz. toEnumList).
    renderModal({ ...baseFilters, spokenLanguages: [1] });
    expect(screen.getByText('İngilizce')).toBeTruthy();
  });

  it('dil seçimi yokken pill ve uyarı çizilmez', () => {
    renderModal(baseFilters);
    expect(screen.getByText('Dil seç')).toBeTruthy();
    expect(screen.queryByText('İngilizce')).toBeNull();
  });

  it('enum değerini int olarak gelse de seçili gösterir ve kaldırabilir', () => {
    // Telde enum'lar string ("Aries") ya da int (ZodiacType=0) gelebiliyor;
    // int gelen seçim eşleşmezse kullanıcının kayıtlı tercihi sessizce kaybolur.
    const { onSave } = renderModal({ ...baseFilters, zodiacSigns: [0] });

    fireEvent.press(screen.getByText('Koç')); // seçiliyi kaldır
    fireEvent.press(screen.getByTestId('apply'));

    expect(onSave.mock.calls[0][0].premiumFilters.zodiacSigns).toEqual([]);
  });

  it('sınıf filtresini enumName olarak gelse de seçili gösterir', () => {
    // Sınıf ASİMETRİK: PUT'a int gönderiyoruz ama yanıt enumName döndürüyor
    // (wire: [4,2] gitti → ["Second","Fourth"] geldi). Ham parseInt bunu NaN
    // yapıp seçimi düşürüyordu — kullanıcıya "kaydolmadı" gibi görünüyordu.
    const { onSave } = renderModal({
      ...baseFilters,
      yearsOfStudy: ['Second', 'Fourth'],
    });

    fireEvent.press(screen.getByTestId('apply'));

    // Ekranda ne varsa o geri gitmeli: seçim kaybolmadan, int'e indirgenmiş.
    expect(onSave.mock.calls[0][0].premiumFilters.yearsOfStudy).toEqual([2, 4]);
  });

  it('sınıf seçimini enumName gelen listeden kaldırabilir', () => {
    const { onSave } = renderModal({
      ...baseFilters,
      yearsOfStudy: ['Preparatory', 'First'],
    });

    fireEvent.press(screen.getByText('Hazırlık')); // seçiliyi kaldır
    fireEvent.press(screen.getByTestId('apply'));

    expect(onSave.mock.calls[0][0].premiumFilters.yearsOfStudy).toEqual([1]);
  });

  it('sınıf int olarak gelirse de okur (biçim değişirse kırılmasın)', () => {
    const { onSave } = renderModal({ ...baseFilters, yearsOfStudy: [0, 3] });

    fireEvent.press(screen.getByTestId('apply'));

    expect(onSave.mock.calls[0][0].premiumFilters.yearsOfStudy).toEqual([0, 3]);
  });

  it('prop tier kararını verir — filtre yanıtındaki bayat isPremium kilidi açmaz', () => {
    // Prop'un kaynağı artık kanonik premium (abonelik slice'ı), `/stats` değil.
    // Filtre yanıtı ise modal açılışında dondurulmuş bir kopya: premium bitince
    // içindeki `isPremium:true` bir süre daha duruyor. Eskiden ikisi OR'lanıyordu
    // ve o bayat alan kilitleri açık tutuyordu.
    renderModal(
      { ...baseFilters, isPremium: true },
      { isPremium: false },
    );
    expect(screen.queryAllByTestId('sficon-lock.fill').length).toBeGreaterThan(0);
  });

  it('prop verilmemişse filtre yanıtının kendi alanına düşer', () => {
    // Bileşen tek başına (prop'suz) kullanılırsa elde kalan tek bilgi bu.
    render(
      <FilterModal
        visible
        onClose={jest.fn()}
        filters={{ ...baseFilters, isPremium: true }}
        onSave={jest.fn()}
        saving={false}
      />,
    );
    expect(screen.queryAllByTestId('sficon-lock.fill')).toHaveLength(0);
  });

  it('gerçekten free kullanıcıda kilit gösterir', () => {
    renderModal({ ...baseFilters, isPremium: false }, { isPremium: false });
    expect(screen.queryAllByTestId('sficon-lock.fill').length).toBeGreaterThan(0);
  });

  it('üniversite filtresini seçili üniversitenin adıyla gösterir', () => {
    renderModal(baseFilters);
    expect(screen.getByText('Boğaziçi Üniversitesi')).toBeTruthy();
    // Artık "Yakında" değil, çalışan bir filtre.
    expect(screen.queryByText('Yakında')).toBeNull();
  });

  it('üniversiteyi GET adıyla okuyup PUT adıyla gönderir', () => {
    // Backend'in bilinen tuzağı: GET `preferredUniversityDomain` döner,
    // PUT `universityDomain` bekler. Doğrudan geri gönderilirse SESSİZCE düşer.
    const { onSave } = renderModal(baseFilters);

    fireEvent.press(screen.getByTestId('apply'));

    expect(onSave.mock.calls[0][0].preferredUniversityDomain).toBe(
      'boun.edu.tr',
    );
  });

  it('free kullanıcıda üniversite tercihi temizlenir', () => {
    const { onSave } = renderModal(baseFilters, { isPremium: false });

    fireEvent.press(screen.getByTestId('apply'));

    expect(onSave.mock.calls[0][0].preferredUniversityDomain).toBeNull();
  });

  it('premium bölümlerin tamamını "Premium Filtreler" başlığından SONRA çizer', () => {
    // Başlık "buradan aşağısı premium" diyor; üstünde premium bir bölüm
    // kalırsa söz ile ekran çelişir.
    renderModal(baseFilters);

    const order = screen.root.findAll(() => true);
    const at = (text: string) => order.indexOf(screen.getByText(text));
    const header = at('Premium Filtreler');

    ['Şehir', 'Üniversite', 'Boy', 'Görünürlük'].forEach((title) =>
      expect(at(title)).toBeGreaterThan(header),
    );
    // Ücretsiz alanlar başlığın ÜSTÜNDE kalmalı.
    ['Maksimum Mesafe', 'İlgi Alanı'].forEach((title) =>
      expect(at(title)).toBeLessThan(header),
    );
  });

  it('premium bölümleri önem sırasına göre çizer', () => {
    // Sıra ürün kararı, kaza değil: eleme yapan (hard) filtreler önem sırasında,
    // sonra eleme YAPMAYAN boost bölümleri ard arda, en sonda görünürlük —
    // görünürlük metni "yukarıdaki filtrelerden farklı olarak" dediği için
    // konumu kopyaya bağlı. Bölüm eklerken sıra sessizce bozulmasın.
    renderModal(baseFilters);

    const order = screen.root.findAll(() => true);
    const at = (text: string) => order.indexOf(screen.getByText(text));

    const expected = [
      // hard filtreler — en önemliden en önemsize
      'Üniversite',
      // Dil en üstte: ortak dil diğer her uyumun ön koşulu. (Eskiden burada
      // "Kullanım Amacı" vardı; alan üründen çıktı.)
      'Konuştuğu diller',
      'Şehir',
      'Boy',
      'Sınıf',
      'Sigara',
      'Alkol',
      // Dini görüş sigara/alkolün devamında — aynı sınıf, aynı yan etki.
      'Dini görüş',
      'Evcil Hayvan',
      'Burç',
      // eleme yapmayanlar (skor boost'u) — ard arda, hard filtrelerden sonra
      'Karşımda görmek istediğim hobiler',
      'Karşımda görmek istediğim niyetler',
      // "beni kim görsün" — kavramsal olarak ayrı, en sonda
      'Görünürlük',
    ];

    const positions = expected.map(at);
    expect(positions).toEqual([...positions].sort((a, b) => a - b));
    expect(positions).not.toContain(-1);
  });

  it('görünürlük listelerini üniversite adıyla özetler ve sayacı gösterir', () => {
    renderModal(baseFilters);

    // Listede domain tutuluyor, satırda isim gösteriliyor ("İTÜ +1").
    expect(screen.getByText('İstanbul Teknik Üniversitesi +1')).toBeTruthy();
    expect(screen.getByText('Dokuz Eylül Üniversitesi')).toBeTruthy();
    // Backend 100'de sessizce kırpıyor — doluluk görünür olmalı.
    expect(screen.getByText('2/100')).toBeTruthy();
    expect(screen.getByText('1/100')).toBeTruthy();
  });

  it('görünürlük listelerini normalize edip her kaydetmede TAM gönderir', () => {
    // Overwrite semantiği: alan gönderilmezse liste temizlenir, o yüzden
    // ekrandaki state'in tamamı her seferinde gitmeli. Domain'ler trim +
    // lowercase + tekilleştirilmiş olmalı.
    const { onSave } = renderModal({
      ...baseFilters,
      visibleOnlyToUniversityDomains: [' ITU.edu.TR ', 'itu.edu.tr'],
    });

    fireEvent.press(screen.getByTestId('apply'));

    const payload = onSave.mock.calls[0][0];
    expect(payload.visibleOnlyToUniversityDomains).toEqual(['itu.edu.tr']);
    expect(payload.hiddenFromUniversityDomains).toEqual(['ogr.deu.edu.tr']);
  });

  it('free kullanıcıda görünürlük listeleri temizlenir (403 önlemi)', () => {
    // Premium alan dolu giderse backend TÜM isteği 403 ile reddediyor.
    const { onSave } = renderModal(baseFilters, { isPremium: false });

    fireEvent.press(screen.getByTestId('apply'));

    const payload = onSave.mock.calls[0][0];
    expect(payload.visibleOnlyToUniversityDomains).toEqual([]);
    expect(payload.hiddenFromUniversityDomains).toEqual([]);
  });

  it('aynı domain iki listedeyse block önceliği uyarısını gösterir', () => {
    renderModal({
      ...baseFilters,
      hiddenFromUniversityDomains: ['itu.edu.tr'],
    });
    expect(
      screen.getByText(
        'İki listede birden olan üniversite seni göremez — engelleme önceliklidir.',
      ),
    ).toBeTruthy();
  });

  it('toggle durumunu dealbreakers listesinden türetir', () => {
    renderModal(baseFilters);

    // Sekiz capable alan → sekiz toggle. Sadece Height işaretli.
    // Evcil hayvan TEK toggle: legacy `hasPets` ve tür listesi aynı bit.
    expect(toggleCount()).toBe(8);
    expect(screen.queryAllByText(DB_ON)).toHaveLength(1);
    expect(screen.queryAllByText(DB_OFF)).toHaveLength(7);
  });

  it("toggle'ı yalnızca dealbreakerCapableFields'taki alanlara çizer", () => {
    renderModal({ ...baseFilters, dealbreakerCapableFields: ['Height'] });
    expect(toggleCount()).toBe(1);
  });

  it('dealbreakerCapableFields hiç gelmezse toggle çizmez', () => {
    // Eski backend sürümü: alan yok. Uydurma ad göndermek 400 döndürdüğü için
    // toggle göstermek yerine hiç çizmiyoruz.
    const { dealbreakerCapableFields: _omitted, ...withoutField } = baseFilters;
    renderModal(withoutField);
    expect(toggleCount()).toBe(0);
  });

  it("kaydederken premium filtreleri API adlarıyla ve dealbreakers'ı TAM liste gönderir", () => {
    const { onSave } = renderModal(baseFilters);

    fireEvent.press(screen.getByTestId('apply'));

    const payload = onSave.mock.calls[0][0];
    expect(payload.premiumFilters).toEqual({
      heightMin: 175,
      heightMax: 190,
      zodiacSigns: ['Aries'],
      smokingStatuses: [],
      alcoholUsages: [],
      pets: [],
      hasPets: true,
      yearsOfStudy: [],
      spokenLanguages: [],
      religiousViews: [],
    });
    // Kısmi güncelleme yok: liste her zaman tam gider.
    expect(payload.dealbreakers).toEqual(['Height']);
  });

  it('toggle kapatıldığında alan listeden düşer', () => {
    const { onSave } = renderModal(baseFilters);

    fireEvent(screen.getByTestId('dealbreaker-Height'), 'valueChange', false);
    fireEvent.press(screen.getByTestId('apply'));

    expect(onSave.mock.calls[0][0].dealbreakers).toEqual([]);
  });

  it('free kullanıcıda dealbreakers HİÇ gönderilmez ve premium değerler temizlenir', () => {
    // dealbreakers premium alan: free kullanıcı gönderirse 403 + ShowPaywall.
    // Boş dizi göndermek de kayıtlı ayarı sıfırlardı — alan hiç olmamalı.
    const { onSave } = renderModal(baseFilters, { isPremium: false });

    fireEvent.press(screen.getByTestId('apply'));

    const payload = onSave.mock.calls[0][0];
    expect(payload).not.toHaveProperty('dealbreakers');
    expect(payload.premiumFilters).toEqual({
      heightMin: null,
      heightMax: null,
      zodiacSigns: [],
      smokingStatuses: [],
      alcoholUsages: [],
      pets: [],
      hasPets: null,
      yearsOfStudy: [],
      spokenLanguages: [],
      religiousViews: [],
    });
  });

  // Premium biten kullanıcı: backend seçimleri SİLMİYOR, yalnız uygulamıyor
  // (free kullanıcıda premium bloğu hiç yazılmıyor). Ekranda boş göstermek
  // "filtrelerim uçmuş" yanılgısı üretiyordu — değerler durur, şerit durumu
  // söyler, payload yine temiz gider.
  it('premium bitince kayıtlı seçimleri gösterir ve "duraklatıldı" şeridini çizer', () => {
    renderModal(baseFilters, { isPremium: false });

    // Kayıtlı boy aralığı ekranda duruyor (temizlenmiş değil).
    expect(screen.getByText('175 – 190 cm')).toBeTruthy();
    expect(
      screen.getByText(
        'Premium filtrelerin duraklatıldı. Seçimlerin duruyor ama desteye uygulanmıyor — Premium\'a dönersen kaldığı yerden devam eder.',
      ),
    ).toBeTruthy();
  });

  it('premium kullanıcıda "duraklatıldı" şeridi çizilmez', () => {
    renderModal(baseFilters);
    expect(screen.queryByText(/duraklatıldı/)).toBeNull();
  });

  it('dolu premium filtresi olmayan free kullanıcıda şerit çizilmez', () => {
    // Şerit "kaybettiğin bir şey var" diyor; hiç seçim yoksa söyleyecek şey yok.
    renderModal(
      {
        ...baseFilters,
        heightMin: null,
        heightMax: null,
        hasPets: null,
        zodiacSigns: [],
        dealbreakers: [],
        preferredUniversityDomain: null,
        visibleOnlyToUniversityDomains: [],
        hiddenFromUniversityDomains: [],
      },
      { isPremium: false },
    );
    expect(screen.queryByText(/duraklatıldı/)).toBeNull();
  });

  it("bilinmeyen dealbreaker adını payload'a geçirmez", () => {
    // Geçersiz ad backend'de 400 döndürüyor ("Geçersiz dealbreaker alanı: X").
    const { onSave } = renderModal({
      ...baseFilters,
      dealbreakers: ['Height', 'Bogus'],
    });

    fireEvent.press(screen.getByTestId('apply'));

    expect(onSave.mock.calls[0][0].dealbreakers).toEqual(['Height']);
  });
});

// "Mesafe sınırı olmasın" anahtarı (2026-08-22). Az kullanıcılı şehirlerde
// desteyi boşaltan katı mesafe filtresinin kaçış yolu.
describe('FilterModal — mesafe sınırı anahtarı', () => {
  const SWITCH = 'ignore-distance-switch';

  it('kayıtlı durumu okur ve kaydettiğinde geri yollar', () => {
    const { onSave } = renderModal({
      ...baseFilters,
      ignoreDistanceFilter: true,
    });

    expect(screen.getByTestId(SWITCH).props.value).toBe(true);

    fireEvent.press(screen.getByTestId('apply'));
    const payload = onSave.mock.calls[0][0];
    expect(payload.ignoreDistanceFilter).toBe(true);
    // Anahtar açıkken de kullanıcının seçtiği yarıçap SAKLANIYOR — iki alan
    // bağımsız, kapatınca eski değere dönülmeli.
    expect(payload.maxDistance).toBe(50);
  });

  it('alan hiç gelmediğinde KAPALI başlar (varsayılan)', () => {
    // Tercih belirtilmemişken kullanıcının seçtiği yarıçap uygulanır; sınırı
    // kaldırmak bilinçli bir tercih (boş destede ekranın kendi butonu var).
    renderModal(baseFilters);
    expect(screen.getByTestId(SWITCH).props.value).toBe(false);
  });

  it('açıkça true gelen kayıtta AÇIK başlar', () => {
    // Varsayılan kapalı olsa da kullanıcının kendi "sınır olmasın" tercihi
    // ezilmemeli — yoksa açıp çıkan kullanıcı ekranı her açtığında anahtarı
    // yeniden kapalı bulurdu.
    renderModal({ ...baseFilters, ignoreDistanceFilter: true });
    expect(screen.getByTestId(SWITCH).props.value).toBe(true);
  });

  it('anahtar açılınca payload’a true gider', () => {
    const { onSave } = renderModal({
      ...baseFilters,
      ignoreDistanceFilter: false,
    });

    fireEvent(screen.getByTestId(SWITCH), 'valueChange', true);
    fireEvent.press(screen.getByTestId('apply'));

    expect(onSave.mock.calls[0][0].ignoreDistanceFilter).toBe(true);
  });

  it('free kullanıcıda kilit/paywall YOK', () => {
    // Şikâyet free kullanıcıdan geliyor ve backend free'den de kabul ediyor;
    // premium'a bağlanması ürün kararının tersi olurdu.
    const { onSave } = renderModal(
      { ...baseFilters, ignoreDistanceFilter: false },
      { isPremium: false },
    );

    const toggle = screen.getByTestId(SWITCH);
    expect(toggle.props.disabled).toBeFalsy();

    fireEvent(toggle, 'valueChange', true);
    fireEvent.press(screen.getByTestId('apply'));

    expect(onSave.mock.calls[0][0].ignoreDistanceFilter).toBe(true);
  });

  it('free kullanıcıda tavanı bölüm açıklamasının sonuna ekler', () => {
    // Tavan artık ayrı şerit DEĞİL — "Maksimum Mesafe" açıklamasının devamı.
    // Aynı Text içinde olmalı: ayrı bir satır/kutu olsaydı anahtar açılınca
    // yine unmount olup altındaki bölümü zıplatırdı.
    renderModal(
      { ...baseFilters, ignoreDistanceFilter: false },
      { isPremium: false },
    );

    // Sayılar SABİT DEĞİL: free tavanı backend'den, premium tavanı görsel
    // tavan — ikisi de metne o an geçerli değerlerle giriyor.
    expect(
      screen.getByText(/daireyi sürükle\. Ücretsiz hesapta sınır 75 km/i),
    ).toBeTruthy();
  });

  it('anahtar açıkken tavan cümlesini açıklamadan çıkarır', () => {
    // "Sınır 75 km" o an fiilen uygulanmıyor — yazmak yanlış bilgi olurdu.
    // Açıklamanın kendisi duruyor, yalnız son cümle düşüyor.
    renderModal(
      { ...baseFilters, ignoreDistanceFilter: true },
      { isPremium: false },
    );

    expect(screen.queryByText(/Ücretsiz hesapta sınır/)).toBeNull();
    expect(screen.getByText(/daireyi sürükle/i)).toBeTruthy();
  });

  it('premium kullanıcıda tavan cümlesi hiç geçmez', () => {
    renderModal(
      { ...baseFilters, ignoreDistanceFilter: false },
      { isPremium: true },
    );

    expect(screen.queryByText(/Ücretsiz hesapta sınır/)).toBeNull();
    expect(screen.getByText(/daireyi sürükle/i)).toBeTruthy();
  });

  it('"Sıfırla" anahtarı KAPATIR (varsayılan)', () => {
    // Sıfırla varsayılana döndürür; varsayılan artık kapalı, yani sıfırlanan
    // filtre tier tavanındaki yarıçapla çalışır. AÇIK kayıttan başlayıp test
    // ediyoruz — kapalı kayıtta "korunuyor mu" ile ayırt edilemez.
    const { onSave } = renderModal({
      ...baseFilters,
      ignoreDistanceFilter: true,
    });

    fireEvent.press(screen.getByTestId('reset'));

    expect(onSave.mock.calls[0][0].ignoreDistanceFilter).toBe(false);
    // Ekran da anında güncellenmeli: sıfırlama başarısız olursa modal açık
    // kalıyor ve kullanıcı anahtarı yeni haliyle görmeli.
    expect(screen.getByTestId(SWITCH).props.value).toBe(false);
  });
});
