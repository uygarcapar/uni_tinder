import { Platform } from "react-native";
import { colors, isLight } from "./colors";

/**
 * BlurView tint'leri — TEK KAYNAK.
 *
 * HEPSI FONKSIYON, sabit DEĞİL: tema modu değişince yeni değeri döndürmeleri
 * gerekiyor (bkz. shared/theme/colors.ts mutasyon sözleşmesi).
 *
 * ── Ne zaman KULLANILMAZ ───────────────────────────────────────────────────
 * Fotoğraf ya da sabit marka gradyanı ÜSTÜNDEKİ blur'lar (SwipeCard'ın foto
 * blur'u, MatchModal'ın foto paneli) açık modda da KOYU kalmalı — oralarda
 * `tint="dark"` doğrudan yazılı ve öyle kalmalı.
 *
 * SwipeCard'ın AÇIK PANEL ZEMİNİ (CardGlassBackdrop) bu kuralın DIŞINDA ve
 * `ultraThinBlurTint()` kullanıyor: orada blur bir foto perdesi değil, panelin
 * zemini — üstündeki bölüm kutuları ve yazıları tema mürekkebini okuyor,
 * dolayısıyla zeminin de modla dönmesi gerekiyor. Sabit `dark` bir tur denendi
 * ve geri alındı. Kalın kademeler (chrome) de denendi ve geri alındı: açık modda
 * fotoğrafı beyazlatıyorlardı. Gerekçenin tamamı o dosyada.
 *
 * LikesScreen'in KİLİTLİ kart örtüsü foto üstünde ama yine de `chromeBlurTint()`
 * kullanıyor. Sebebi kalınlığı: kimliği
 * gizlemek için üst üste iki katman + tam intensity gerekiyor ve o kalınlıkta
 * SABİT bir tint kartı düz bir pula çeviriyor (beyaz denendi → sütlü, siyah
 * denendi → kömür; ikisinde de altında fotoğraf olduğu okunmuyor). Sistem
 * malzemesi aynı kalınlıkta bile fotoğrafın rengini geçiriyor. Bedeli: örtü
 * modla döndüğü için üstündeki placeholder kutuları da dönmek zorunda (açık
 * modda `scrimAt`, koyu modda `onMediaAt`) — kutu her zaman perdenin TERSİ.
 * Aynı kartın isim/üniversite satırının arkasındaki alt progressive blur ise
 * KOYU kalır: orası kimlik perdesi değil, normal foto scrim'i.
 *
 * Aynı kartın NOT KUTUSU da fotoğrafın üstünde ama `chromeBlurTint()`
 * kullanıyor: o bir foto örtüsü değil, üstüne oturmuş bir panel ve zemini
 * (veilSurface) başından beri modla dönüyor — lit shop sheet'leriyle aynı
 * gerekçe.
 *
 * lit shop sheet'leri (PurchaseModal / SuperLikePurchaseModal) BU İSTİSNADA
 * DEĞİL: zeminleri (shopSurface / shopBackdrop) modla döndüğü için panelleri
 * de `plainBlurTint()` kullanır.
 */

type Tint = "dark" | "light" | "default";

/** Sade tint — uygulama chrome'undaki genel amaçlı blur'lar. */
export const plainBlurTint = (): Tint => colors.blurTint;

/** iOS'taki en kaliteli cam; Android'de en yakın karşılığı. Chrome için. */
export function chromeBlurTint() {
  const dark = !isLight();
  if (Platform.OS === "ios")
    return dark ? "systemChromeMaterialDark" : "systemChromeMaterialLight";
  return dark ? "systemMaterialDark" : "systemMaterialLight";
}

/** Daha ince/şeffaf cam — mesaj menüsü paneli ve yanıt önizlemesi. */
export function thinBlurTint() {
  const dark = !isLight();
  if (Platform.OS === "ios")
    return dark ? "systemThinMaterialDark" : "systemThinMaterialLight";
  return dark ? "dark" : "light";
}

/**
 * EN İNCE malzeme — altındaki şeyin RENGİNİ korumak istendiğinde.
 *
 * Sistem malzemeleri kalınlaştıkça kendi tülünü de kalınlaştırıyor: chrome açık
 * modda sütlü beyaz bir katman gibi davranıyor ve altındaki fotoğrafın rengini
 * yutuyor. Ultra-thin bulanıklığı bırakıp tülü en aza indiriyor — "bulanık ama
 * hâlâ o fotoğraf" istendiğinde doğru kademe.
 *
 * BEDELİ KONTRAST: üstüne yazı/glif koyacaksan onların okunurluğunu artık bu
 * katman TAŞIMIYOR, kendi zeminlerini bulmaları gerekiyor. Okunurluk sorunu
 * çıkarsa kademeyi kalınlaştırmadan önce yazının kendi yüzeyine bak.
 *
 * Okuyucuları: SwipeCard'ın açık panel zemini (CardGlassBackdrop) ve
 * LikesScreen'in kilitli kart örtüsünün AÇIK MOD hâli (orada literal yazılı,
 * koyu mod chrome'da kalıyor — gerekçe lockedVeilTint'in yanında).
 */
export function ultraThinBlurTint() {
  const dark = !isLight();
  if (Platform.OS === "ios")
    return dark ? "systemUltraThinMaterialDark" : "systemUltraThinMaterialLight";
  return dark ? "dark" : "light";
}
