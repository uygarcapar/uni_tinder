// Sürücü GLOBAL bir paylaşılan değer (uiBus > cardPullProgress). Testte onu
// elle kurabilmek için modülü sadeleştiriyoruz: gerçek `makeMutable` reanimated
// mock'unda yok ve olsa da çekiş oranını dışarıdan yazmanın yolu bu.
const pull = { value: 0 };
jest.mock('@/shared/services/uiBus', () => ({
  __esModule: true,
  default: { on: () => () => {}, emit: () => {} },
  cardPullProgress: pull,
  FIRE_PULL_THRESHOLD: 50,
}));

// `useAnimatedStyle` worklet'i render sırasında BİR KEZ çalıştırıyor, yani
// çıkan stil o anki `pull.value` ile hesaplanmış oluyor — animasyonu değil,
// oranın stile çevrilişini ölçüyoruz.
jest.mock('react-native-reanimated', () => {
  const React = require('react');
  const { View, Text } = require('react-native');
  return {
    __esModule: true,
    default: {
      View: ({ children, style }: any) =>
        React.createElement(View, { style }, children),
      // İki ipucu satırı `Animated.Text` — mock'ta yoksa ağaç `undefined`
      // bileşenle patlıyor.
      Text: ({ children, style }: any) =>
        React.createElement(Text, { style }, children),
    },
    useAnimatedStyle: (fn: any) => fn(),
    useSharedValue: (v: any) => ({ value: v }),
    // Reaction'ı render sırasında BİR KEZ çalıştırıyoruz; `wasReady` olarak
    // `undefined` geçiliyor ki koşul her zaman "geçiş" sayılsın ve devir o
    // render'ın oranına göre yerleşsin.
    useAnimatedReaction: (prepare: any, react: any) =>
      react(prepare(), undefined),
    // Devir kendi saatinde akıyor; testte hedefe anında oturuyor.
    withTiming: (v: any) => v,
    Easing: { out: (f: any) => f, quad: (t: number) => t },
    interpolate: (v: number, input: number[], output: number[]) => {
      const t = (v - input[0]) / (input[1] - input[0]);
      const c = t < 0 ? 0 : t > 1 ? 1 : t;
      return output[0] + (output[1] - output[0]) * c;
    },
    Extrapolate: { CLAMP: 'clamp' },
  };
});

import { render } from '@testing-library/react-native';
import { StyleSheet } from 'react-native';
import FirePullHint, {
  FIRE_PULL_SCRIM_ALPHA,
} from '@/features/discover/components/FirePullHint';
import { colors } from '@/shared/theme/colors';
import { DISCOVER_CARD_TOP_GAP } from '@/features/discover/components/discoverHeaderMetrics';
import tr from '@/shared/i18n/translations/tr';
import en from '@/shared/i18n/translations/en';

/** Ağaçtaki tüm `Animated.View` stillerini düzleştirip döndürür. */
function layerStyles(tree: ReturnType<typeof render>) {
  return tree.UNSAFE_root
    .findAllByType('View' as never)
    .map((n: any) => StyleSheet.flatten(n.props.style) ?? {});
}

/** Perde: destenin tamamını kaplayan, siyah dolgulu katman. */
function scrimOpacity(tree: ReturnType<typeof render>) {
  const layer = layerStyles(tree).find(
    (s: any) => s.backgroundColor === 'rgba(0,0,0,1)',
  );
  return (layer as any)?.opacity;
}

describe('FirePullHint', () => {
  afterEach(() => {
    pull.value = 0;
  });

  /**
   * İki metni saran, opaklığı + konumu taşıyan blok.
   *
   * Ağaçta ebeveyn ZİNCİRİNDEN değil ŞEKLİNDEN bulunuyor: `transform` taşıyan
   * tek katman o. Ebeveyn adımlamak `Animated.Text`in mock'taki sarmalayıcı
   * katmanına bağımlı olurdu.
   */
  function textBlockStyle(tree: ReturnType<typeof render>) {
    return (
      layerStyles(tree).find((s: any) => Array.isArray(s.transform)) ?? {}
    );
  }

  /** Tek bir satırın kendi opaklığı (çapraz sönme). */
  function lineOpacity(tree: ReturnType<typeof render>, label: string) {
    return StyleSheet.flatten(tree.getByText(label).props.style)?.opacity;
  }

  it('çekiş yokken görünmüyor', () => {
    // Deste boştayken ekranda hiçbir izi olmamalı: perde de yazı da 0.
    pull.value = 0;
    const tree = render(<FirePullHint />);
    expect(scrimOpacity(tree)).toBe(0);
    expect((textBlockStyle(tree) as any).opacity).toBe(0);
  });

  it('eşiğe kadar "aşağı kaydır", eşikte "bırak" yazıyor', () => {
    // DOĞRULUK meselesi: eşiğin altında bırakmak Fire göndermiyor,
    // kartı geri yaylandırıyor. Tek metin gösterilseydi çekişin başında yalan
    // söylerdi.
    pull.value = 0.5;
    let tree = render(<FirePullHint />);
    expect(lineOpacity(tree, tr.discover.swipe.firePullHint)).toBe(1);
    expect(lineOpacity(tree, tr.discover.swipe.fireReleaseHint)).toBe(0);

    pull.value = 1;
    tree = render(<FirePullHint />);
    expect(lineOpacity(tree, tr.discover.swipe.firePullHint)).toBe(0);
    expect(lineOpacity(tree, tr.discover.swipe.fireReleaseHint)).toBe(1);
  });

  it('devir SADECE eşiğe bağlı — çekişle scrub edilemiyor', () => {
    // Bir tur devir bir oran bandıyla (0.85→1) sürülüyordu ve yazı parmakla
    // geri sarılabiliyordu: birkaç piksel oynayınca iki metin arasında
    // sallanıyor, yarı yolda donunca ikisi birden yarı saydam kalıyordu. Eşiğin
    // ALTINDA hiçbir oran devri kısmen bile açmamalı.
    for (const v of [0.5, 0.8, 0.9, 0.95, 0.999]) {
      pull.value = v;
      const tree = render(<FirePullHint />);
      expect(lineOpacity(tree, tr.discover.swipe.fireReleaseHint)).toBe(0);
      expect(lineOpacity(tree, tr.discover.swipe.firePullHint)).toBe(1);
    }
    // Eşikte TAM devir — ara değer yok.
    pull.value = 1;
    const tree = render(<FirePullHint />);
    expect(lineOpacity(tree, tr.discover.swipe.fireReleaseHint)).toBe(1);
    expect(lineOpacity(tree, tr.discover.swipe.firePullHint)).toBe(0);
  });

  it('yazı şeritle birlikte iniyor — ilk açılan piksellerde de ortada', () => {
    // Şeridin yüksekliği oran × THRESHOLD; yazı onun YARISINDA duruyor. Sabit
    // bir `top` çekişin başında yazıyı kartın altında bırakıyordu.
    const centerAt = (v: number) => {
      pull.value = v;
      const tf = (textBlockStyle(render(<FirePullHint />)) as any).transform;
      return tf[0].translateY;
    };
    // 50 px eşik: yarı çekişte şerit 25 px, merkez 12.5 (satır yarısı düşülmüş).
    expect(centerAt(0.5)).toBeCloseTo(0.5 * 25 - 9, 5);
    expect(centerAt(1)).toBeCloseTo(25 - 9, 5);
    expect(centerAt(0.2)).toBeLessThan(centerAt(1));
  });

  it('perde çekişle birlikte kararıyor ama opak olmuyor', () => {
    // Arkadaki kart seçilebilir kalmalı — bu bir kapatma perdesi değil.
    pull.value = 0.5;
    const half = scrimOpacity(render(<FirePullHint />));
    pull.value = 1;
    const full = scrimOpacity(render(<FirePullHint />));
    expect(half).toBeGreaterThan(0);
    expect(half).toBeLessThan(full as number);
    expect(full).toBeLessThan(0.7);
    // Tam çekişte tam olarak EXPORT EDİLEN oran. Header perdesi (bkz.
    // DiscoverScreen) aynı sabiti okuyor; buradaki kullanım ondan ayrılırsa
    // şerit ile üst bant farklı tonda kararır ve aradaki çizgi ortaya çıkar.
    expect(full).toBe(FIRE_PULL_SCRIM_ALPHA);
  });

  it('yazının rengi kapaktaki "yukarı kaydır" ipucuyla aynı', () => {
    // İkisi de aynı cins jest fısıltısı; farklı tonda olmaları onları ayrı
    // diller gibi gösteriyordu (bkz. SwipeCard > expandHint).
    pull.value = 1;
    const tree = render(<FirePullHint />);
    for (const line of [
      tr.discover.swipe.firePullHint,
      tr.discover.swipe.fireReleaseHint,
    ]) {
      expect(StyleSheet.flatten(tree.getByText(line).props.style)?.color).toBe(
        colors.onMediaMuted,
      );
    }
  });

  it('dokunmayı yutmuyor ve kartın ALTINDA duruyor', () => {
    // Perde desteyi tamamen kaplıyor: dokunmayı geçirmezse kart sürüklenemez.
    // zIndex de kartınkinden (10) küçük olmak zorunda, yoksa çekiş boyunca
    // kartın kendisini karartır.
    const tree = render(<FirePullHint />);
    const root = tree.UNSAFE_root.findAllByType('View' as never)[0] as any;
    expect(root.props.pointerEvents).toBe('none');
    const style = StyleSheet.flatten(root.props.style);
    expect(style.zIndex).toBeGreaterThan(1);
    expect(style.zIndex).toBeLessThan(10);
    // Kırpma BURADA: destenin kabına konamıyor, açık kart oradan taşıyor.
    expect(style.overflow).toBe('hidden');
  });

  it('perde destenin üst payına TAŞIYOR — header ile arada çizgi kalmıyor', () => {
    // Deste kabının paddingTop'u kadarlık şerit kabın İÇİNDE değil. Perde
    // oraya uzanmazsa, header de kararınca iki koyu alanın arasında zemin
    // renginde bir tel kalıyor (koyu modda açık bir çizgi, gölge gibi).
    const tree = render(<FirePullHint />);
    const root = tree.UNSAFE_root.findAllByType('View' as never)[0] as any;
    expect(StyleSheet.flatten(root.props.style).top).toBe(-DISCOVER_CARD_TOP_GAP);

    // Yazının sıfır noktası DESTENİN TEPESİ olmalı: kap yukarı taştı diye
    // ipucu da yukarı kaymamalı, şeridin yüksekliği desteden ölçülüyor.
    pull.value = 1;
    const block = textBlockStyle(render(<FirePullHint />)) as any;
    expect(block.top).toBe(DISCOVER_CARD_TOP_GAP);
  });

  it('her iki metin de iki dilde tanımlı', () => {
    // Anahtar tek dilde kalırsa diğer dilde ham anahtar yazıyor.
    for (const key of ['firePullHint', 'fireReleaseHint'] as const) {
      expect(tr.discover.swipe[key]).toBeTruthy();
      expect(en.discover.swipe[key]).toBeTruthy();
      expect(tr.discover.swipe[key]).not.toBe(en.discover.swipe[key]);
    }
    // İki hâl birbirinden de farklı olmalı — devir görünmezse anlamsız.
    expect(tr.discover.swipe.firePullHint).not.toBe(
      tr.discover.swipe.fireReleaseHint,
    );
  });

  it('metin küçük harfle başlıyor — ipucu kaydı, cümle değil', () => {
    // Kapaktaki "yukarı kaydır" ipucuyla aynı kayıt (profile.card.expandHint):
    // ikisi de tamamen küçük harf. Uyarı/başlık metinlerinin cümle yazımı
    // buraya uymuyor.
    for (const dict of [tr, en]) {
      for (const key of ['firePullHint', 'fireReleaseHint'] as const) {
        const line = dict.discover.swipe[key];
        expect(line[0]).toBe(line[0].toLowerCase());
        expect(line).toBe(line.toLowerCase());
      }
    }
  });
});
