import { lonLatToWorld } from "@/features/campus/campusProjection";

/**
 * KAMPÜS DEĞİŞİMİNDE GEÇİŞ — yön ve mesafe hesabı.
 *
 * ── Önce bir sınır: bu bir "fly-to" DEĞİL ──────────────────────────────────
 * Harita STATİK bir görüntü. İki kampüs arasındaki coğrafyayı render edemiyoruz
 * — İstanbul'dan Ankara'ya gerçek bir uçuş için aradaki 350 km'nin karolarını
 * çizmek gerekir ve bu ancak canlı bir harita (`@rnmapbox/maps`) ile olur.
 * Eski görüntüyü o mesafe kadar ötelemek ekranda birkaç kare görüntü kenarı,
 * sonra boşluk gösterirdi.
 *
 * Yapılan şey: ESKİ kadraj gidilecek yönde süzülerek çıkıyor, YENİ kadraj aynı
 * yönden geliyor. Yani hareket coğrafi olarak DOĞRU YÖNDE ama mesafe
 * sembolik — "oraya gidiyoruz" diyor, "arası şöyle" demiyor. Kullanıcı
 * doğudaki bir kampüse geçtiğinde harita batıya kayıyor; yön yanlış olsaydı
 * hareket rastgele görünürdü.
 *
 * ── Mesafe neden sabit ─────────────────────────────────────────────────────
 * Gerçek mesafeyle ölçeklenseydi aynı şehirdeki iki kampüs arasında hiç
 * kıpırdamaz, şehirlerarasında ise ekranı onlarca kez geçerdi. Sabit bir
 * süzülme payı iki uçta da aynı okunuyor.
 */

/** Ekran genişliğinin bu kadarı kadar süzülüyor. */
const SLIDE_RATIO = 0.3;

/** Çıkan/giren kadrajın ölçek payı — "geri çekilip yaklaşma" hissi. */
export const TRANSITION_SCALE = 0.92;

/**
 * Geçiş süresi.
 *
 * 900ms: istenen eğri (yavaş başla, hızlan, varmaya yakın yavaşla) 500ms'de
 * aceleci, 1300ms'de kullanıcıyı bekletiyor. Kampüs değişimi nadir ve
 * bilinçli bir aksiyon, hareketin görülmesi gereken bir şey.
 */
export const TRANSITION_MS = 900;

export interface TransitionVector {
  /** Birim vektör: yeni kampüs eskisine göre hangi yönde. */
  dx: number;
  dy: number;
  /** Ekranda süzülme payı (pt). */
  distance: number;
}

/**
 * Eski kampüsten yenisine YÖN.
 *
 * Mercator üzerinden: ekranın x/y eksenleriyle birebir aynı uzay, yani
 * `dy > 0` aşağı demek (yeni kampüs güneyde). Koordinatlardan biri yoksa ya da
 * ikisi aynı noktadaysa yön üretilmiyor — `null` dönüşte çağıran yalnız
 * çapraz geçiş yapıyor.
 */
export function campusTransitionVector(
  from: { lat: number; lon: number } | null | undefined,
  to: { lat: number; lon: number } | null | undefined,
  screenWidth: number,
): TransitionVector | null {
  if (!from || !to) return null;

  // Zoom 0 yeterli: yalnız YÖN aranıyor, ölçek değil.
  const a = lonLatToWorld(from.lon, from.lat, 0);
  const b = lonLatToWorld(to.lon, to.lat, 0);
  const dx = b.x - a.x;
  const dy = b.y - a.y;
  const length = Math.hypot(dx, dy);

  // Aynı nokta (ör. aynı kampüsün yeniden seçilmesi) → yön yok.
  if (!Number.isFinite(length) || length < 1e-9) return null;

  return {
    dx: dx / length,
    dy: dy / length,
    distance: screenWidth * SLIDE_RATIO,
  };
}
