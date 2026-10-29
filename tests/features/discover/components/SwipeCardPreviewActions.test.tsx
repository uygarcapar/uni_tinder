// Önizleme kartının (Beğeniler · Sohbet · Akış) ANA FOTOĞRAFI ÜSTÜNDEKİ
// tik/X kolonu — jest kalktıktan sonra kararın TEK girişi burası, yani
// çizilmemesi sessiz bir ürün kaybı. Kolon bir dönem Keşif'in tam ekran kapak
// dalının içindeydi ve önizlemede o dal hiç render edilmiyor: buton "kodda
// var" ama ekranda yok. Bu suite tam o tuzağı tutuyor.
import { fireEvent, render } from '@testing-library/react-native';
import { SafeAreaProvider } from 'react-native-safe-area-context';
import SwipeCard from '@/features/discover/components/SwipeCard';

// ÇÖZÜLMEYEN promise, bilerek: çözülürse kapak rengi state'i test bittikten
// sonra güncellenip act() uyarısı bırakıyor. Rengin kendisi bu suite'in konusu
// değil.
jest.mock('react-native-image-colors', () => ({
  getColors: jest.fn(() => new Promise(() => {})),
}));
jest.mock('react-i18next', () => ({
  useTranslation: () => ({ t: (k: string) => k }),
}));
// iOS dalında etiket SwiftUI modifier'ında duruyor (sorgulanamaz) → düz bir
// Text'e indir.
jest.mock('@/features/discover/components/CardChromeGlassButton', () => {
  const { Text } = require('react-native');
  return {
    __esModule: true,
    default: ({ label }: any) => <Text>{`chrome:${label}`}</Text>,
    CARD_CHROME_GLASS_SIZE: 48,
  };
});

// Not kutusunun kabuğu da SwiftUI modifier'ında etiket taşıyor → düz Text.
jest.mock('@/features/discover/components/CardGlyphGlassButton', () => {
  const { Text } = require('react-native');
  return {
    __esModule: true,
    // `onPress` KORUNUYOR: hedefin doğru taşındığı ancak basarak görülüyor.
    default: ({ label, onPress }: any) => (
      <Text onPress={onPress}>{`glyph:${label}`}</Text>
    ),
  };
});

const frame = { x: 0, y: 0, width: 390, height: 844 };
const insets = { top: 47, left: 0, right: 0, bottom: 34 };

const profile = {
  userId: 'u1',
  displayName: 'Ada',
  age: 22,
  photos: ['https://example.com/a.jpg'],
  prompts: [],
  hobbies: [],
};

function renderCard(props: any) {
  return render(
    <SafeAreaProvider initialMetrics={{ frame, insets }}>
      <SwipeCard profile={profile} previewMode expanded={false} {...props} />
    </SafeAreaProvider>,
  );
}

describe('SwipeCard previewMode cover actions', () => {
  it('draws tick and X over the main photo', () => {
    const tree = renderCard({ onPass: () => {}, onLike: () => {} });
    expect(tree.getByText('chrome:likes.likeButton')).toBeTruthy();
    expect(tree.getByText('chrome:likes.passButton')).toBeTruthy();
  });

  it('hides them when hideActions', () => {
    const tree = renderCard({
      hideActions: true,
      onPass: () => {},
      onLike: () => {},
    });
    expect(tree.queryByText('chrome:likes.likeButton')).toBeNull();
  });

  /**
   * DÜZ BEĞENİ OPT-OUT — akışın Flört kartı (bkz. feedCardActions): `onLike`
   * verilmiyor ve tik HİÇBİR yerde çizilmiyor. X aynen duruyor; onu da
   * kaybetmek kartı okunura düşürürdü.
   */
  it('onLike verilmezse tik çizilmiyor, X duruyor', () => {
    const tree = renderCard({ onPass: () => {} });
    expect(tree.queryByText('chrome:likes.likeButton')).toBeNull();
    expect(tree.getByText('chrome:likes.passButton')).toBeTruthy();
  });

  /**
   * X OPT-OUT — akışın NORMAL kartı (bkz. feedCardActions): `onPass`
   * verilmiyor ve X HİÇBİR yerde çizilmiyor. Akışta kart karşı taraftan gelen
   * bir sinyale cevap değil; reddedilecek bir şey yok.
   */
  it('onPass verilmezse X çizilmiyor', () => {
    const tree = renderCard({ onFire: () => {} });
    expect(tree.queryByText('chrome:likes.passButton')).toBeNull();
  });

  /**
   * Review Focus #4: `onPass` gidince panelin dibindeki X/tik satırı da
   * düşüyor (`showActionsRow` ikisine bağlı) — ŞİKAYET ve ENGELLE onunla
   * birlikte kaybolmamalı, kartın en alttaki moderasyon girişi orası.
   * `showModerationRow = showModeration && !showActionsRow` (SwipeCard:2888)
   * bunu zaten çözüyor; bu test o davranışı KİLİTLİYOR.
   */
  it('X gitse de şikayet/engelle duruyor', () => {
    const tree = renderCard({
      onFire: () => {},
      onReport: () => {},
      onBlock: () => {},
    });
    expect(tree.getByLabelText('profile.card.reportAccount')).toBeTruthy();
    expect(tree.getByLabelText('profile.card.blockAccount')).toBeTruthy();
  });
});

/**
 * NOT KUTUSU ÖNİZLEME KARTINDA — akış kartı `previewMode` ile açılıyor ama not
 * GÖNDEREBİLİYOR. Kutular bir dönem `previewMode`a bağlıydı: `onNote` veriliyor,
 * hiçbir kutu çizilmiyordu ve Flört'te zorunlu iki yoldan biri sessizce yoktu.
 */
describe('SwipeCard previewMode note boxes', () => {
  it('onNote verildiğinde ana fotoğrafın üstünde kutu var', () => {
    const tree = renderCard({ onNote: () => {} });
    expect(tree.getAllByText('glyph:note.boxLabel').length).toBeGreaterThan(0);
  });

  it('onNote verilmediğinde kutu yok (Profil önizlemesi, Beğeniler)', () => {
    const tree = renderCard({ onPass: () => {}, onLike: () => {} });
    expect(tree.queryByText('glyph:note.boxLabel')).toBeNull();
  });

  /**
   * Hedef `photoNoteTarget(0)` — Keşif'te KAPAĞIN kutusunun hedefiyle aynı
   * fotoğraf. Önizlemede kapak hiç çizilmiyor ve "kapak" burada akışın ilk
   * fotoğrafı; index kaydırılırsa not, bahsi geçmeyen bir fotoğrafın altına
   * yazılır (bkz. NoteTarget'ın notu — backend anlık görüntü tutuyor).
   */
  it('kutuya basmak ana fotoğrafın hedefiyle çağırıyor (index 0)', () => {
    const onNote = jest.fn();
    const tree = renderCard({ onNote });
    fireEvent.press(tree.getAllByText('glyph:note.boxLabel')[0]);
    expect(onNote).toHaveBeenCalledWith({
      kind: 'Photo',
      photoIndex: 0,
      promptKey: null,
    });
  });

  /**
   * Review Focus #5: kutu artık AKSİYON KOLONUNUN İÇİNDE (Keşif kapağıyla aynı
   * dizilim: tik · X · Fire · not). Ana fotoğrafın kendi kutusu `hideNote` ile
   * bırakılmazsa index 0'ı hedefleyen İKİ kutu çıkar — ve o iki daire aynı
   * köşede üst üste biner (bu işin düzelttiği hata).
   *
   * Fixture'da tek fotoğraf, prompt yok → doğru sayı TAM 1.
   */
  it('Fire ile birlikte TEK not kutusu var (mükerrer yok)', () => {
    const tree = renderCard({ onNote: () => {}, onFire: () => {} });
    expect(tree.getAllByText('glyph:note.boxLabel')).toHaveLength(1);
  });

  /**
   * Kolon not İÇİN de doğuyor: Keşif'teki koşulun (`!!onNote &&
   * allPhotos.length > 0`) aynısı. `hideActions` yalnız karar butonlarını
   * kaldırıyor, notu değil — yoksa kutu taşındığı yerle birlikte kaybolurdu.
   */
  it('hideActions iken kutu hâlâ çiziliyor', () => {
    const tree = renderCard({ hideActions: true, onNote: () => {} });
    expect(tree.getAllByText('glyph:note.boxLabel')).toHaveLength(1);
  });

  /**
   * Review (2. tur) Important #1: dış kapı artık saf `&&` değil — not dalı
   * (`!!onNote && allPhotos.length > 0`) `hideActions=true` olsa bile kolonu
   * AÇIYOR. O açılış kararın butonlarını da birlikte sızdırmamalı: tik/X
   * kendi içinde AYRICA `!hideActions &&` taşımak zorunda (Keşif'in kapak
   * kolonundaki kalıbın aynısı). `onLike`/`onPass` bağımsız bayraklarla hâlâ
   * veriliyor — bu senaryo "okunur kart" prodüksiyonda da mümkün (örn. bir
   * üst ekran `hideActions` ile kararları kapatırken handler'ları olduğu gibi
   * geçirmeyi unutursa).
   *
   * Fire'ın kendi kapısı aynı satırda (`!hideActions && !hideFire && onFire`)
   * ama burada AYRI bir test yok: `FireGlassButton` SwiftUI tarafında
   * `label`i modifier zincirinden alıyor ve bu dosyanın jest.setup.ts tabanı
   * o zinciri gerçek bir RN düğümüne bağlamıyor (yalnız "patlamasın" diyor,
   * bkz. oradaki not) — ne metin ne testID yüzeye çıkıyor, yani varlığını/
   * yokluğunu RTL'den sorgulamak bu mock katmanında kontrollü değil, şans
   * eseri geçerdi. Tik/X ile aynı kod yolunu (aynı outer/inner kapı kalıbı)
   * paylaştığı için bu ikisinin kilitlenmesi Fire dalını da fiilen koruyor.
   */
  it('hideActions + onNote birlikteyken tik/X kolonda sızmıyor', () => {
    const tree = renderCard({
      hideActions: true,
      onNote: () => {},
      onLike: () => {},
      onPass: () => {},
    });
    expect(tree.queryByText('chrome:likes.likeButton')).toBeNull();
    expect(tree.queryByText('chrome:likes.passButton')).toBeNull();
    // Not kutusu bu senaryoda hâlâ çizilmeli — sadece karar butonları gitmeli.
    expect(tree.getAllByText('glyph:note.boxLabel')).toHaveLength(1);
  });
});
