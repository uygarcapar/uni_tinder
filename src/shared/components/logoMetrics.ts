/**
 * Lit logosunun ÖLÇÜLEBİLİR geometrisi. Ayrı dosyada çünkü hem WaveFillLogo
 * hem de yanına bir şey koyan bileşenler (OfflineIndicator) buna ihtiyaç
 * duyuyor; tek dosyada tutulsa döngüsel import olurdu.
 *
 * DİKKAT — kutu ölçüsü ≠ görünen logo. Asset (lit_name_white.png) 500x500
 * KARE ve `resizeMode: contain` ile 120x50'lik kutuya oturuyor:
 *
 *   scale       = min(120/500, 50/500) = 0.1  → gerçekte 50x50 render ediliyor
 *   yatay ofset = (120 - 50) / 2       = 35   → kutunun ortasında
 *
 * Üstüne, 50x50'lik alanın tamamı da dolu değil; alfa kanalının sınırları
 * (ölçüldü) x: 0.15–0.89, y: 0.13–0.76. Sonuç:
 *
 *   görünür sol kenar   = 35 + 0.15*50 = 42.5
 *   görünür sağ kenar   = 35 + 0.89*50 = 79.5   ← kutunun sağında 40pt boşluk
 *   görünür dikey merkez= (0.13+0.76)/2*50 = 22.25  (kutunun merkezi olan 25 DEĞİL)
 *
 * Yani logonun yanına konan ikon 120'lik kutunun İÇİNDE kalıyor: kutu
 * büyümüyor, logo ortalanmış hâlde kalıyor, gösterge açılıp kapandığında
 * hiçbir şey kaymıyor.
 */

export const LOGO_W = 120;
export const LOGO_H = 50;

/** Görünür logonun sağ kenarı (120pt'lik kutu içinde). */
export const LOGO_INK_RIGHT = 79.5;

/** Görünür logonun dikey merkezi (50pt'lik kutu içinde). */
export const LOGO_INK_CENTER_Y = 22.25;
