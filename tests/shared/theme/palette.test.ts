import {
  applyPalette,
  colors,
  gradients,
  ink,
  onMediaAt,
  scrimAt,
  withAlpha,
} from '@/shared/theme/colors';

/**
 * Tema sisteminin dayandığı İKİ sözleşmeyi korur:
 *
 *  1. MUTASYON — applyPalette `colors`/`gradients` nesnelerini YERİNDE
 *     değiştirir, referansı değiştirmez. 73 dosyadaki ~600 `colors.x` çağrısının
 *     çalışmasının tek sebebi bu. Referans değişirse hiçbiri güncellenmez.
 *  2. PARİTE — iki paletin anahtar kümesi birebir aynı. Biri eksik kalırsa o
 *     token bir modda `undefined` olur ve RN sessizce rengi düşürür.
 */

afterEach(() => applyPalette('dark'));

describe('applyPalette', () => {
  it('nesne referansını KORUR (mutasyon sözleşmesi)', () => {
    const colorsRef = colors;
    const gradientsRef = gradients;
    applyPalette('light');
    expect(colors).toBe(colorsRef);
    expect(gradients).toBe(gradientsRef);
  });

  it('iki palet de aynı anahtarlara sahip (parite)', () => {
    applyPalette('dark');
    const darkKeys = Object.keys(colors).sort();
    const darkGradientKeys = Object.keys(gradients).sort();
    applyPalette('light');
    expect(Object.keys(colors).sort()).toEqual(darkKeys);
    expect(Object.keys(gradients).sort()).toEqual(darkGradientKeys);
  });

  it('hiçbir token undefined/boş bırakılmaz', () => {
    for (const mode of ['dark', 'light'] as const) {
      applyPalette(mode);
      const bad = Object.entries(colors)
        .filter(([, v]) => typeof v !== 'string' || v.length === 0)
        .map(([k]) => `${mode}.${k}`);
      expect(bad).toEqual([]);
    }
  });
});

describe("mod ile DÖNEN tokenlar", () => {
  it('zemin ve metin polariteyi çevirir', () => {
    applyPalette('dark');
    expect(colors.bg).toBe('#121212');
    expect(colors.text).toBe('#FFFFFF');
    expect(colors.hairline).toBe('rgba(255,255,255,0.1)');
    expect(colors.onInverseSurface).toBe('#000000');

    applyPalette('light');
    expect(colors.bg).toBe('#FFFFFF');
    expect(colors.text).toBe('#0B0B0C');
    expect(colors.hairline).toBe('rgba(0,0,0,0.1)');
    expect(colors.onInverseSurface).toBe('#FFFFFF');
  });

  it('yüzey merdiveni her modda aynı sırayı korur', () => {
    // Koyuda yükseklik = açılmak, açıkta = koyulaşmak; ama SIRA aynı:
    // surface5 en hafif → surface4 en belirgin. Paletlerden biri elle
    // düzenlenirken bu bozulursa yükseklik hiyerarşisi görsel olarak ters döner.
    const lum = (hex: string) => {
      const n = parseInt(hex.slice(1), 16);
      return ((n >> 16) & 255) * 0.299 + ((n >> 8) & 255) * 0.587 + (n & 255) * 0.114;
    };
    const ladder = ['surface5', 'surface', 'surface2', 'surface3', 'surface4'] as const;

    applyPalette('dark');
    const darkLum = ladder.map((k) => lum(colors[k]));
    expect(darkLum).toEqual([...darkLum].sort((a, b) => a - b)); // koyuda artan

    applyPalette('light');
    const lightLum = ladder.map((k) => lum(colors[k]));
    expect(lightLum).toEqual([...lightLum].sort((a, b) => b - a)); // açıkta azalan
  });

  it('lit shop zemini modla döner ve gradyanının son durağıyla eşleşir', () => {
    // shopSurface bir dönem "sabit marka" sayılıyordu; iki satın alma sheet'i
    // açık modda koyu kalıyordu. Artık zemin: son gradyan durağı = sheet'in
    // backgroundStyle'ı, ikisi ayrışırsa 700px'lik gradyanın altında renk atlar.
    applyPalette('dark');
    const darkSurface = colors.shopSurface;
    expect(gradients.shopBackdrop.at(-1)).toBe(darkSurface);

    applyPalette('light');
    expect(colors.shopSurface).not.toBe(darkSurface);
    expect(gradients.shopBackdrop.at(-1)).toBe(colors.shopSurface);
  });

  it('ters yüzey çifti her modda kontrast üretir', () => {
    for (const mode of ['dark', 'light'] as const) {
      applyPalette(mode);
      expect(colors.inverseSurface).not.toBe(colors.onInverseSurface);
      // Dolgu sayfa zemininin tersi olmalı, yoksa "seçili" pill kaybolur.
      expect(colors.inverseSurface).not.toBe(colors.bg);
    }
  });
});

describe("SABİT tokenlar", () => {
  it('marka, durum ve medya renkleri modla DEĞİŞMEZ', () => {
    applyPalette('dark');
    const fixed = [
      'primary', 'messageOwn', 'litPlus',
      'success', 'error', 'warning', 'info', 'destructive',
      'onMedia', 'onMediaMuted', 'mediaScrim', 'mediaChipBg',
      'mediaHairline', 'onMediaInverse', 'shadow', 'scrim',
    ] as const;
    const before = fixed.map((k) => colors[k]);
    applyPalette('light');
    expect(fixed.map((k) => colors[k])).toEqual(before);
  });

  it('foto/gradyan üstü metin açık modda da beyaz kalır', () => {
    applyPalette('light');
    expect(colors.onMedia).toBe('#FFFFFF');
    expect(onMediaAt(0.7)).toBe('rgba(255,255,255,0.7)');
    expect(scrimAt(0.5)).toBe('rgba(0,0,0,0.5)');
  });
});

describe('ink()', () => {
  it('aktif moda göre polarite çevirir', () => {
    applyPalette('dark');
    expect(ink(0.2)).toBe('rgba(255,255,255,0.2)');
    applyPalette('light');
    expect(ink(0.2)).toBe('rgba(0,0,0,0.2)');
  });
});

describe('withAlpha()', () => {
  it('hex\'i rgba\'ya çevirir', () => {
    expect(withAlpha('#1F1F1F', 0.55)).toBe('rgba(31,31,31,0.55)');
    expect(withAlpha('#fff', 0.5)).toBe('rgba(255,255,255,0.5)');
  });

  it('zaten rgba olanı olduğu gibi bırakır', () => {
    expect(withAlpha('rgba(1,2,3,0.4)', 0.9)).toBe('rgba(1,2,3,0.4)');
  });
});

describe('gradyanlar', () => {
  it('marka gradyanları sabit, zemine eriyenler döner', () => {
    applyPalette('dark');
    const brandBefore = gradients.litPlusCard;
    const fadeBefore = gradients.neutralFade;
    applyPalette('light');
    expect(gradients.litPlusCard).toEqual(brandBefore);
    expect(gradients.neutralFade).not.toEqual(fadeBefore);
  });

  it('LinearGradient için en az iki durak taşır', () => {
    for (const mode of ['dark', 'light'] as const) {
      applyPalette(mode);
      for (const stops of Object.values(gradients)) {
        expect(stops.length).toBeGreaterThanOrEqual(2);
      }
    }
  });
});
