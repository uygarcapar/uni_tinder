/**
 * Akış post gövdesi — link render'ı, onay kapısı ve kopyalama.
 *
 * Test edilen asıl şey GÖSTERİLEN METİNLE AÇILAN HEDEFİN AYRILMASI. Kartta
 * kısaltılmış bir adres yazıyor ("ornek.com/cok/uzun…") ama açılan şey her
 * zaman tam URL olmak zorunda; ikisi karışırsa kullanıcı dokunduğu yerden
 * başka bir yere gider.
 *
 * İkinci nokta ONAY KAPISININ ATLANAMAMASI: linke dokunmak tek başına hiçbir
 * şey açmıyor, önce alan adını gösteren diyalog geliyor. Vazgeçen kullanıcı
 * için `Linking.openURL` HİÇ çağrılmamalı — bu kapı phishing yüzeyini daraltan
 * tek şey, ve "nasılsa diyalog var" diye gevşetilirse politikadan geriye
 * mavi altı çizili bir yazı kalır.
 */

jest.mock('expo-haptics', () => ({
  selectionAsync: jest.fn(() => Promise.resolve()),
}));
jest.mock('expo-clipboard', () => ({
  setStringAsync: jest.fn(() => Promise.resolve()),
}));
jest.mock('@/shared/services/toaster', () => ({
  showInfoToast: jest.fn(),
}));

import * as Clipboard from 'expo-clipboard';
import { Alert, Linking } from 'react-native';
import { fireEvent, render, screen } from '@testing-library/react-native';
import FeedPostBody from '@/features/feed/components/FeedPostBody';
import { BLOCK_GAP } from '@/features/feed/feedPostMetrics';
import { showInfoToast } from '@/shared/services/toaster';
import tr from '@/shared/i18n/translations/tr';

type AlertButton = { text?: string; onPress?: () => void; style?: string };

const alertSpy = () => jest.spyOn(Alert, 'alert').mockImplementation(() => {});

/** Diyaloğun son çağrısındaki butonu metnine göre bul ve bas. */
const pressDialogButton = (text: string) => {
  const calls = (Alert.alert as jest.Mock).mock.calls;
  const buttons = (calls[calls.length - 1][2] ?? []) as AlertButton[];
  const button = buttons.find((b) => b.text === text);
  expect(button).toBeTruthy();
  button!.onPress?.();
};

beforeEach(() => {
  jest.restoreAllMocks();
  jest.clearAllMocks();
  jest.spyOn(Linking, 'openURL').mockResolvedValue(true as any);
});

describe('düz metin', () => {
  it('linksiz gövde olduğu gibi çizilir', () => {
    render(<FeedPostBody body="Yarın kütüphane kaçta açılıyor?" />);
    expect(screen.getByText('Yarın kütüphane kaçta açılıyor?')).toBeTruthy();
  });

  it('satır sonları korunur', () => {
    // Sunucu en fazla 2 boş satıra normalize ediyor; gövde olduğu gibi basılıyor.
    render(<FeedPostBody body={'bir\n\niki'} />);
    expect(screen.getByText('bir\n\niki')).toBeTruthy();
  });

  it('çıplak alan adı dokunulabilir DEĞİL', () => {
    alertSpy();
    render(<FeedPostBody body="ornek.com adresine bak" />);
    fireEvent.press(screen.getByText('ornek.com adresine bak'));
    expect(Alert.alert).not.toHaveBeenCalled();
    expect(Linking.openURL).not.toHaveBeenCalled();
  });
});

describe('link gösterimi', () => {
  it('şema ve www. atılmış hâliyle çizilir', () => {
    render(<FeedPostBody body="bak https://www.ornek.com/a" />);
    expect(screen.getByText('ornek.com/a')).toBeTruthy();
    // Ham URL ekranda YAZMIYOR.
    expect(screen.queryByText('https://www.ornek.com/a')).toBeNull();
  });

  it('uzun adres kısaltılmış çizilir ama TAM URL açılır', () => {
    // Kısaltma bir görüntü kararı; hedefi değiştirmesi kabul edilemez.
    const url = `https://ornek.com/${'yol/'.repeat(40)}son`;
    alertSpy();
    render(<FeedPostBody body={url} />);

    const label = screen.getByText(/^ornek\.com\/.*…$/);
    fireEvent.press(label);
    pressDialogButton(tr.feed.link.open);

    expect(Linking.openURL).toHaveBeenCalledWith(url);
  });
});

describe('onay kapısı', () => {
  it('dokunmak tek başına hiçbir şey AÇMAZ', () => {
    alertSpy();
    render(<FeedPostBody body="https://ornek.com" />);
    fireEvent.press(screen.getByText('ornek.com'));

    expect(Alert.alert).toHaveBeenCalled();
    expect(Linking.openURL).not.toHaveBeenCalled();
  });

  it('diyalogda ALAN ADI yazar (tam URL değil)', () => {
    // Phishing'i açığa çıkaran tek bilgi bu: uzun bir adresin kuyruğuna
    // gömülmüş host, diyalogda başlı başına görünüyor.
    alertSpy();
    render(<FeedPostBody body="https://giris.ornek.com/bankacilik/giris?x=1" />);
    fireEvent.press(screen.getByText(/^giris\.ornek\.com/));

    expect(Alert.alert).toHaveBeenCalledWith(
      tr.feed.link.confirmTitle,
      'giris.ornek.com',
      expect.any(Array),
    );
  });

  it('onaylayınca açılır', () => {
    alertSpy();
    render(<FeedPostBody body="https://ornek.com/a?x=1" />);
    fireEvent.press(screen.getByText('ornek.com/a?x=1'));
    pressDialogButton(tr.feed.link.open);

    expect(Linking.openURL).toHaveBeenCalledWith('https://ornek.com/a?x=1');
  });

  it('vazgeçince açılmaz', () => {
    alertSpy();
    render(<FeedPostBody body="https://ornek.com" />);
    fireEvent.press(screen.getByText('ornek.com'));
    pressDialogButton(tr.common.cancel);

    expect(Linking.openURL).not.toHaveBeenCalled();
  });

  it('açma başarısızsa SESSİZ KALMAZ', async () => {
    // Açık bir dokunuşun hiçbir şey yapmaması, kullanıcıya uygulamanın
    // donduğunu söyler. (Sabit `tel:` butonlarındaki sessiz `.catch` kalıbı
    // burada geçerli değil.)
    alertSpy();
    jest.spyOn(Linking, 'openURL').mockRejectedValue(new Error('no handler'));
    render(<FeedPostBody body="https://ornek.com" />);
    fireEvent.press(screen.getByText('ornek.com'));
    pressDialogButton(tr.feed.link.open);

    await Promise.resolve();
    await Promise.resolve();
    expect(showInfoToast).toHaveBeenCalled();
  });
});

describe('taşma kapısı', () => {
  /**
   * ⚠️ RN kırılmasız uzun bir token'ı (400 karakterlik tek kelime) satır
   * sonunda KIRMIYOR, kart kabuğunda da `overflow: hidden` bilerek yok (gölge
   * oradan çiziliyor, gerekçe feedRowShell'de). Kapı gövdenin kendi sarmalında
   * olmak zorunda; kalkarsa belirti "kart biraz bozuk duruyor" diye okunur ve
   * sebebi gövdede aranmaz.
   */
  it('gövde sarmalı içeriği kırpar', () => {
    render(<FeedPostBody body={'a'.repeat(400)} />);
    expect(screen.getByText('a'.repeat(400))).toBeTruthy();

    /**
     * ⚠️ SARMAL `text.parent` DEĞİL: RNTL'in ağacında Text ile sarmalayıcı
     * View'ın arasında ara düğümler var (FeedPostCard testindeki `findRow`
     * aynı tuzağa düşmüştü). Aranan şey sarmalın KENDİ imzası.
     */
    const findClipper = (node: any): any => {
      if (!node) return null;
      const s = Array.isArray(node.props?.style)
        ? Object.assign({}, ...node.props.style)
        : node.props?.style;
      if (s?.overflow === 'hidden' && s?.marginTop === BLOCK_GAP) return s;
      const kids = Array.isArray(node.children) ? node.children : [];
      for (const kid of kids) {
        const hit = findClipper(kid);
        if (hit) return hit;
      }
      return null;
    };

    expect(findClipper(screen.toJSON())).toBeTruthy();
  });
});

describe('kopyalama', () => {
  it('gövdeye uzun basmak HAM metni kopyalar', () => {
    // Kopyalanan şey kartta görünen kısaltılmış adres DEĞİL, kullanıcının
    // yazdığı gövde — yapıştırıldığında adres çalışmak zorunda.
    const body = 'bak https://www.ornek.com/cok/uzun/yol';
    render(<FeedPostBody body={body} />);
    fireEvent(screen.getByText(/bak/), 'longPress');

    expect(Clipboard.setStringAsync).toHaveBeenCalledWith(body);
  });

  it('kopyalama onayı gösterilir', () => {
    render(<FeedPostBody body="merhaba" />);
    fireEvent(screen.getByText('merhaba'), 'longPress');
    expect(showInfoToast).toHaveBeenCalled();
  });
});
