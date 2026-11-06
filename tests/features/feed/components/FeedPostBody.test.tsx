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
import { BLOCK_GAP, BODY_LINE_HEIGHT } from '@/features/feed/feedPostMetrics';
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

/**
 * KONU ETİKETLERİ — GÖVDENİN DEVAMINDA (istek: "hashtagler yazılan textin
 * altında değil devamında olsun direkt").
 *
 * Etiketler karttan HAZIR ("#küçük harf") geliyor ve gövdeyle AYNI <Text>
 * paragrafının kuyruğuna ekleniyor: son kelimenin peşinden akıyorlar ve
 * yazıyla birlikte sarıyorlar. Segmentleri ayrı bir kaba koymak satır akışını
 * bitirirdi (dosyanın başındaki iç içe <Text> notu).
 */
describe('konu etiketleri', () => {
  /** Düğümün altındaki metin yapraklarını render sırasıyla topla. */
  const textLeaves = (node: any): string[] => {
    if (node == null) return [];
    if (typeof node === 'string') return [node];
    const kids = Array.isArray(node.children) ? node.children : [];
    return kids.flatMap(textLeaves);
  };

  it('etiketler SON KELİMENİN PEŞİNDE, aynı paragrafta', () => {
    render(
      <FeedPostBody
        body="Ders notu arıyorum"
        topicLabels={['#tavsiye', '#etkinlik']}
      />,
    );
    // Paragrafın bileşik metni: gövde + boşlukla ayrılmış etiketler.
    expect(textLeaves(screen.toJSON()).join('')).toBe(
      'Ders notu arıyorum #tavsiye #etkinlik',
    );
  });

  /**
   * ── KAPSÜL SATIR İÇİNDE DE DURUYOR (istek: "pillden çıkarma ama
   * hashtagi") ──────────────────────────────────────────────────────────────
   *
   * iOS iç içe <Text>'te pay/köşe yarıçapı ÇİZMEDİĞİ için kapsül satır içi
   * bir <View> olarak gömülü: paragrafın akışında duruyor, dolgusu ve
   * yarıçapı gerçek. Dolgu temanın tersi (`ink`) — testler koyu palette
   * koşuyor, beklenen BEYAZ; alfa feedTopicPill > TOPIC_FILL_ALPHA.
   */
  it('etiket kapsülün İÇİNDE: satır içi kutuda dolgu + yarıçap + pay', () => {
    render(<FeedPostBody body="merhaba" topicLabels={['#tavsiye']} />);

    // Etiketi saran, yaprakları YALNIZ etiket olan kutuyu bul.
    const findPillBox = (node: any): any => {
      if (!node || typeof node === 'string') return null;
      const s = Array.isArray(node.props?.style)
        ? Object.assign({}, ...node.props.style)
        : node.props?.style;
      if (
        node.type === 'View' &&
        textLeaves(node).join('') === '#tavsiye' &&
        s?.backgroundColor
      ) {
        return s;
      }
      const kids = Array.isArray(node.children) ? node.children : [];
      for (const kid of kids) {
        const hit = findPillBox(kid);
        if (hit) return hit;
      }
      return null;
    };

    const pill = findPillBox(screen.toJSON());
    expect(pill).toBeTruthy();
    expect(pill.backgroundColor).toMatch(/^rgba\(255,255,255,0\.0[0-9]\)$/);
    expect(pill.borderRadius).toBeGreaterThan(0);
    expect(pill.paddingHorizontal).toBeGreaterThan(0);

    /**
     * ── DİKEY HİZA (istek: "ortadan hizala ama textle bozuluyo üsttü") ─────
     *
     * iOS satır içi View'ın TABANINI metnin taban çizgisine oturtuyor —
     * kapsül bu yüzden yukarı biniyordu. İki kural birlikte:
     *
     * 1. Kapsül SATIRA SIĞMALI: iç yazının satırı + dikey paylar gövdenin
     *    satır kutusunu (BODY_LINE_HEIGHT) aşarsa TextKit satırı
     *    büyütmüyor (maximumLineHeight), kutu kırpılıp "bozuk" görünüyor.
     * 2. Taban çizgisinden metnin optik ortasına GÖRSEL translateY — layout'a
     *    dokunmuyor, yalnız boyama kayıyor.
     */
    const inner = screen.getByText('#tavsiye');
    const innerStyle = Array.isArray(inner.props.style)
      ? Object.assign({}, ...inner.props.style)
      : inner.props.style;
    expect(innerStyle.lineHeight + 2 * pill.paddingVertical).toBeLessThanOrEqual(
      BODY_LINE_HEIGHT,
    );

    const nudge = (pill.transform ?? []).find(
      (part: Record<string, number>) => 'translateY' in part,
    );
    expect(nudge?.translateY).toBeGreaterThan(0);
  });

  it('etiket verilmezse gövde olduğu gibi', () => {
    render(<FeedPostBody body="merhaba" />);
    expect(textLeaves(screen.toJSON()).join('')).toBe('merhaba');
  });

  it('uzun basınca kopyalanan YALNIZ gövde — etiketler değil', () => {
    // Etiket kullanıcının yazdığı metnin parçası değil, gönderinin künyesi;
    // yapıştırılan şeye "#tavsiye" sızarsa gövde bozulmuş olur.
    render(<FeedPostBody body="merhaba" topicLabels={['#tavsiye']} />);
    fireEvent(screen.getByText(/merhaba/), 'longPress');
    expect(Clipboard.setStringAsync).toHaveBeenCalledWith('merhaba');
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
