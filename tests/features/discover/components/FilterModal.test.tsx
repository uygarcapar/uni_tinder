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
    withTiming: (v: any) => v,
    withSequence: (...v: any[]) => v[v.length - 1],
    runOnJS: (fn: any) => fn,
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
// Apply butonu AppModal'ın header'ında — kaydetme payload'ını doğrulayabilmek
// için mock'ta da bir tetikleyici olarak render ediliyor.
jest.mock('@/shared/components/AppModal', () => {
  const React = require('react');
  const { View, Text, TouchableOpacity } = require('react-native');
  return {
    __esModule: true,
    default: ({ visible, children, actionLabel, onAction }: any) =>
      visible
        ? React.createElement(View, { testID: 'app-modal' }, [
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
    useUsagePurposes: () => ({
      data: [opt(1, 'Friendship', 'Arkadaşlık')],
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

const ALL_CAPABLE = [
  'YearOfStudy', 'Height', 'Zodiac', 'Smoking', 'Pets', 'UsagePurpose',
];

// Backend GET /api/swipe/Filters yanıtının bu ekranı ilgilendiren iskeleti.
const baseFilters = {
  maxDistance: 50,
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
    'UsagePurposes', 'RelationshipIntents', 'HairColors', 'HairStyles',
    'EyeColors', 'FacialHairs', 'HasGlasses', 'PreferredHobbies',
  ],
  heightMin: 175,
  heightMax: 190,
  hasPets: true,
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
  it('grup başlığını ve altı filtreyi render eder', () => {
    renderModal(baseFilters);

    expect(screen.getByText('Premium Filtreler')).toBeTruthy();
    ['Boy', 'Sınıf', 'Burç', 'Sigara', 'Evcil Hayvan', 'Kullanım Amacı'].forEach(
      (title) => expect(screen.getByText(title)).toBeTruthy(),
    );
    // Enum seçenekleri aktif dile çözülmüş gelmeli (resolveLocalized).
    expect(screen.getByText('Koç')).toBeTruthy();
    expect(screen.getByText('Kullanmıyorum')).toBeTruthy();
  });

  it('pill ikonları Register/EditProfileForm ile aynı sembolleri kullanır', () => {
    // Aynı burcu/amacı üç ekranda da aynı ikonla görmek gerekiyor; semboller
    // RegisterStep14Screen ZODIAC_MAP ve EditProfileForm PURPOSE_META'dan.
    renderModal(baseFilters);
    expect(screen.getByTestId('sficon-flame.fill')).toBeTruthy(); // Koç
    expect(screen.getByTestId('sficon-sun.max.fill')).toBeTruthy(); // Aslan
    expect(screen.getByTestId('sficon-smoke.fill')).toBeTruthy(); // sigara
    // person.2.fill "İlgi Alanı"ndaki Non-Binary pill'inde de geçiyor.
    expect(screen.getAllByTestId('sficon-person.2.fill').length).toBe(2); // + Arkadaşlık
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

  it('hasPets 3 durumlu bool olarak render edilir (enum listesi değil)', () => {
    renderModal(baseFilters);
    // /api/common/pets bu filtrede kullanılmıyor.
    expect(screen.getByText('Evcil hayvanı var')).toBeTruthy();
    expect(screen.getByText('Evcil hayvanı yok')).toBeTruthy();
  });

  it('aynı evcil hayvan seçeneğine tekrar basınca "farketmez"e döner', () => {
    const { onSave } = renderModal(baseFilters);

    fireEvent.press(screen.getByText('Evcil hayvanı var')); // zaten seçili
    fireEvent.press(screen.getByTestId('apply'));

    expect(onSave.mock.calls[0][0].premiumFilters.hasPets).toBeNull();
  });

  it('enum değerini int olarak gelse de seçili gösterir ve kaldırabilir', () => {
    // Telde enum'lar string ("Aries") ya da int (ZodiacType=0) gelebiliyor;
    // int gelen seçim eşleşmezse kullanıcının kayıtlı tercihi sessizce kaybolur.
    const { onSave } = renderModal({ ...baseFilters, zodiacSigns: [0] });

    fireEvent.press(screen.getByText('Koç')); // seçiliyi kaldır
    fireEvent.press(screen.getByTestId('apply'));

    expect(onSave.mock.calls[0][0].premiumFilters.zodiacSigns).toEqual([]);
  });

  it('filters.isPremium true ise prop false olsa da kilit göstermez', () => {
    // isPremium prop'u swipe Stats'tan geliyor ve o sorgu oturumda bir kez
    // çekiliyor (staleTime:Infinity); açılışta patlarsa ya da premium sonradan
    // aktifleşirse false'ta çakılı kalıyordu. Filtre yanıtının kendi alanı
    // tazedir ve backend gating'i oradan bildiriyor.
    renderModal(
      { ...baseFilters, isPremium: true },
      { isPremium: false },
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

    // Altı capable alan → altı toggle. Sadece Height işaretli.
    expect(toggleCount()).toBe(6);
    expect(screen.queryAllByText(DB_ON)).toHaveLength(1);
    expect(screen.queryAllByText(DB_OFF)).toHaveLength(5);
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
      hasPets: true,
      usagePurposes: [],
      yearsOfStudy: [],
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
      hasPets: null,
      usagePurposes: [],
      yearsOfStudy: [],
    });
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
