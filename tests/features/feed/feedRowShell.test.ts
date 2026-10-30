import { feedRowShell } from '@/features/feed/feedRowShell';
import { applyPalette, colors } from '@/shared/theme/colors';

/**
 * AKIŞ SATIRININ GÖLGESİ.
 *
 * Tek bir değişmez korunuyor ve sebebi şikâyetle geldi: liste DURURKEN her
 * kartın gölgesi bir alttakinin üstüne biniyordu. Gölgenin alta taşan payı
 * (kayma + yarıçap) kartlar arası boşluğu (`marginBottom`) aşamaz.
 *
 * ⚠️ Şikâyet, hücrelerin bir tur TERS Z-SIRASINDA olduğu dönemde geldi (üstteki
 * kart önde → gölgesi alttakinin üzerine düşüyor). O sıra geri alındı, yani
 * bugün alttaki kart gölgeyi zaten örtüyor; değişmez buna rağmen duruyor —
 * boşluğu aşmayan gölge z-sırasından BAĞIMSIZ olarak komşuya taşmıyor.
 */
describe('feedRowShell — gölge', () => {
  afterEach(() => {
    // Palet MUTABLE ve modül düzeyinde paylaşılıyor: bırakılan mod sonraki
    // suite'e sızar (colors.ts mutasyon sözleşmesi).
    applyPalette('dark');
  });

  it.each(['dark', 'light'] as const)(
    '%s modda gölge satır boşluğunun İÇİNDE kalıyor',
    (mode) => {
      applyPalette(mode);
      const shell = feedRowShell();
      const drop = shell.shadowOffset.height + shell.shadowRadius;
      expect(drop).toBeLessThanOrEqual(shell.marginBottom);
      // Android karşılığı da aynı mertebede: elevation'ın taşması kabaca kendi
      // değeri kadar.
      expect(shell.elevation).toBeLessThanOrEqual(shell.marginBottom);
    },
  );

  it('gölge İKİ MODDA DA var ve siyah — moda göre değişen yalnız alfa', () => {
    applyPalette('light');
    const light = feedRowShell();
    applyPalette('dark');
    const dark = feedRowShell();

    expect(light.shadowColor).toBe(colors.shadow);
    expect(dark.shadowColor).toBe(colors.shadow);
    // Geometri aynı (binme sorunu moddan bağımsız).
    expect(light.shadowRadius).toBe(dark.shadowRadius);
    expect(light.shadowOffset).toEqual(dark.shadowOffset);
    // Koyu zeminde siyah gölge ancak yüksek alfada okunuyor.
    expect(dark.shadowOpacity).toBeGreaterThan(light.shadowOpacity);
    expect(light.shadowOpacity).toBeGreaterThan(0);
  });
});
