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
 * LikesScreen'in KİLİTLİ kart örtüsü bu kaptaki bir istisna ama TERS yönde:
 * her iki modda da BEYAZ (`tint="light"`), placeholder kutuları da bu yüzden
 * koyu (`scrimAt`). Aynı kartın isim/üniversite satırının arkasındaki alt
 * progressive blur ise KOYU kalır — orası normal foto scrim'i.
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
