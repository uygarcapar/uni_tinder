/**
 * MOD KURULUM SHEET'İ — "kiminle ilgileniyorsun" bölümünün iki yüzü.
 *
 * Bölüm bugüne kadar YALNIZ Dating'indi: Arkadaş'ta eşleşme kuralı aynı
 * cinsiyet olduğu için tercih sorusunun karşılığı yoktu. Artık bir karşılığı
 * var ama yalnız Non-Binary kullanıcıda: onlarda "yalnız kendi kategorin"
 * kampüs ölçeğinde boş deste demek, o yüzden havuzlarını soruyoruz. İkili
 * kategorilerde değeri sunucu türetip kilitlediği için bölüm hâlâ çizilmiyor
 * ve alan payload'a HİÇ girmiyor (ölü yük).
 *
 * Kararı sheet vermiyor — `asksFriendsPool` dışarıdan geliyor (sunucunun
 * `friendsInterestedInLocked` bayrağından, bkz. friendsPoolPrompt).
 */

jest.mock('@/shared/components/AppModal');

jest.mock('react-i18next', () => ({
  useTranslation: () => ({ t: (k: string) => k }),
}));
jest.mock('@/shared/i18n', () => ({ __esModule: true, default: { language: 'tr' } }));

jest.mock('@gorhom/bottom-sheet', () => {
  const { TextInput } = require('react-native');
  return { BottomSheetTextInput: TextInput };
});

jest.mock('@/shared/queries/commonQueries', () => ({
  resolveLocalized: (_d: any, _l: any, fallback: string) => fallback,
  useFriendshipIntents: () => ({
    data: [{ enumName: 'Hobby', name: 'Hobi arkadaşı' }],
    isLoading: false,
  }),
  useRelationshipIntents: () => ({
    data: [{ enumName: 'LongTerm', name: 'Uzun süreli' }],
    isLoading: false,
  }),
}));

// Prompt editörü bu testin konusu değil; gönderime yetecek tek bir cevap
// üreten iskelet. `flush()` gerçek bileşendeki gibi açık taslağı döndürüyor.
jest.mock('@/shared/components/PromptsEditor', () => {
  const React = require('react');
  const { Text } = require('react-native');
  const PROMPT = [{ promptKey: 'p1', answer: 'cevap' }];
  return {
    __esModule: true,
    default: React.forwardRef((props: any, ref: any) => {
      React.useImperativeHandle(ref, () => ({ flush: () => PROMPT }));
      React.useEffect(() => props.onChange?.(PROMPT), []);
      return <Text>prompts</Text>;
    }),
  };
});

jest.mock('@/shared/hooks/useKeyboardAwareField', () => ({
  useKeyboardAwareField: () => ({
    onFocus: jest.fn(),
    onBlur: jest.fn(),
    scrollToField: jest.fn(),
  }),
}));

// Foto bölümünün kendi davranışı kendi testinde (ModeSetupPhotoSection.test) —
// burada yalnız sheet'in kablolaması: bölümün çizilme koşulu, doğrulama ve
// payload. Stub, `onChange`i dışarıdan sürülebilir butonlara bağlıyor.
const NEW_PHOTO = (i: number) => ({
  uri: `file:///n${i}.jpg`,
  name: `n${i}.jpg`,
  type: 'image/jpeg',
});
jest.mock('@/features/discover/components/ModeSetupPhotoSection', () => {
  const React = require('react');
  const { Pressable, Text } = require('react-native');
  return {
    __esModule: true,
    SETUP_MIN_PHOTOS: 2,
    default: ({ value, onChange }: any) => (
      <>
        <Text testID="photo-section">{value.kind}</Text>
        <Pressable
          testID="photo-set-new-1"
          onPress={() => onChange({ kind: 'new', photos: [NEW_PHOTO(1)] })}
        >
          <Text>new1</Text>
        </Pressable>
        <Pressable
          testID="photo-set-new-2"
          onPress={() =>
            onChange({ kind: 'new', photos: [NEW_PHOTO(1), NEW_PHOTO(2)] })
          }
        >
          <Text>new2</Text>
        </Pressable>
      </>
    ),
  };
});

import { render, fireEvent, screen } from '@testing-library/react-native';
import ModeSetupSheet from '@/features/discover/components/ModeSetupSheet';

const SOURCE = [
  { photoId: 'p1', photoImageUrl: 'https://x/1.jpg' },
  { photoId: 'p2', photoImageUrl: 'https://x/2.jpg' },
];

const setup = (props: any = {}) => {
  const onSubmit = jest.fn();
  const view = render(
    <ModeSetupSheet
      visible
      onClose={jest.fn()}
      mode={props.mode ?? 'Friends'}
      onSubmit={onSubmit}
      asksFriendsPool={props.asksFriendsPool}
      photoSetup={props.photoSetup}
    />,
  );
  return { onSubmit, view };
};

/**
 * Niyet + havuz seçip gönder.
 *
 * `t` mock'u anahtarı döndürüyor, yani etiketler anahtar metinleri. Gönderim
 * butonu AppModal'ın header'ında DEĞİL, sheet'in dibinde — bu sheet
 * `actionLabel` geçmiyor (mock'un `modal-header-action`ı hiç çizilmiyor).
 */
const pickIntent = () =>
  fireEvent.press(screen.getByText('discover.friendshipIntents.Hobby'));
const submit = () =>
  fireEvent.press(screen.getByText('discover.mode.openSubmit'));

const POOL_TITLE = 'discover.mode.friendsPoolTitle';
const DATING_TITLE = 'discover.mode.interestedInTitle';

describe('ModeSetupSheet — Friends havuz bölümü', () => {
  it('asksFriendsPool açıkken havuz bölümü çiziliyor', () => {
    setup({ mode: 'Friends', asksFriendsPool: true });

    expect(screen.queryByText(POOL_TITLE)).not.toBeNull();
    // Dating'in başlığı DEĞİL: aynı liste, farklı soru.
    expect(screen.queryByText(DATING_TITLE)).toBeNull();
  });

  it('asksFriendsPool yokken bölüm hiç çizilmiyor', () => {
    setup({ mode: 'Friends' });

    expect(screen.queryByText(POOL_TITLE)).toBeNull();
    expect(screen.queryByText(DATING_TITLE)).toBeNull();
  });

  it('havuz boşken gönderim engelleniyor', () => {
    const { onSubmit } = setup({ mode: 'Friends', asksFriendsPool: true });
    pickIntent();

    submit();

    expect(onSubmit).not.toHaveBeenCalled();
    expect(screen.queryByText('discover.mode.friendsPoolRequired')).not.toBeNull();
  });

  it('havuz seçiliyken payload interestedIn taşıyor', () => {
    const { onSubmit } = setup({ mode: 'Friends', asksFriendsPool: true });
    pickIntent();
    fireEvent.press(screen.getByText('auth.step10.female'));

    submit();

    expect(onSubmit).toHaveBeenCalledWith(
      expect.objectContaining({ interestedIn: ['Women'] }),
    );
  });

  it('asksFriendsPool yokken payload interestedIn TAŞIMIYOR', () => {
    const { onSubmit } = setup({ mode: 'Friends' });
    pickIntent();

    submit();

    expect(onSubmit).toHaveBeenCalled();
    expect(onSubmit.mock.calls[0][0]).not.toHaveProperty('interestedIn');
  });
});

describe('ModeSetupSheet — fotoğraf adımı', () => {
  const PHOTO_SETUP = { sourcePhotos: SOURCE, sourceModeLabel: 'Flört' };

  it('photoSetup doluyken bölüm çizilir ve varsayılan payload kind:existing', () => {
    const { onSubmit } = setup({ mode: 'Friends', photoSetup: PHOTO_SETUP });
    pickIntent();

    submit();

    expect(onSubmit).toHaveBeenCalledWith(
      expect.objectContaining({ photos: { kind: 'existing' } }),
    );
  });

  it('photoSetup verilmemişse bölüm YOK ve payload photos TAŞIMIYOR', () => {
    const { onSubmit } = setup({ mode: 'Friends' });
    pickIntent();

    submit();

    expect(screen.queryByTestId('photo-section')).toBeNull();
    expect(onSubmit).toHaveBeenCalled();
    expect(onSubmit.mock.calls[0][0]).not.toHaveProperty('photos');
  });

  it('kaynakta <2 foto varken varsayılan yeni-kare hâli', () => {
    setup({
      mode: 'Friends',
      photoSetup: { sourcePhotos: [SOURCE[0]], sourceModeLabel: 'Flört' },
    });

    expect(screen.getByTestId('photo-section').children[0]).toBe('new');
  });

  it('yeni-kare yolunda 2\'den az fotoyla gönderim engellenir', () => {
    const { onSubmit } = setup({ mode: 'Friends', photoSetup: PHOTO_SETUP });
    pickIntent();
    fireEvent.press(screen.getByTestId('photo-set-new-1'));

    submit();

    expect(onSubmit).not.toHaveBeenCalled();
    expect(screen.queryByText('discover.mode.photos.minHint')).not.toBeNull();
  });

  it('2 fotoyla payload kind:new taşır', () => {
    const { onSubmit } = setup({ mode: 'Friends', photoSetup: PHOTO_SETUP });
    pickIntent();
    fireEvent.press(screen.getByTestId('photo-set-new-2'));

    submit();

    expect(onSubmit).toHaveBeenCalledWith(
      expect.objectContaining({
        photos: { kind: 'new', photos: [NEW_PHOTO(1), NEW_PHOTO(2)] },
      }),
    );
  });
});

describe('ModeSetupSheet — Dating davranışı değişmedi', () => {
  it('bölüm kendi başlığıyla çiziliyor', () => {
    setup({ mode: 'Dating' });

    expect(screen.queryByText(DATING_TITLE)).not.toBeNull();
    expect(screen.queryByText(POOL_TITLE)).toBeNull();
  });

  it('tercih boşken gönderim engelleniyor (UT-2308)', () => {
    const { onSubmit } = setup({ mode: 'Dating' });
    fireEvent.press(screen.getByText('auth.step14.intents.LongTerm'));

    submit();

    expect(onSubmit).not.toHaveBeenCalled();
    expect(
      screen.queryByText('discover.mode.interestedInRequired'),
    ).not.toBeNull();
  });

  it('tercih seçiliyken payload interestedIn taşıyor', () => {
    const { onSubmit } = setup({ mode: 'Dating' });
    fireEvent.press(screen.getByText('auth.step14.intents.LongTerm'));
    fireEvent.press(screen.getByText('auth.step10.male'));

    submit();

    expect(onSubmit).toHaveBeenCalledWith(
      expect.objectContaining({ interestedIn: ['Men'] }),
    );
  });
});
