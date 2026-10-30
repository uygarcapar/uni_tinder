/**
 * HASHTAG KAPSÜLÜNÜN ORTAK ÖLÇÜLERİ — akış kartı, filtre sheet'i, composer.
 *
 * Kapsülün kaynağı AKIŞ KARTI (`FeedPostCard`): orada etiket gövdenin bir
 * parçası değil, satırın künyesi — punto ve renk tarihin ölçüsünden geliyor,
 * ağırlık ondan bir kademe yukarıda (uzun gerekçe kartın kendi yorumunda).
 * Filtre ve composer çipleri istek üzerine o görünüşe bağlandı: kullanıcı aynı
 * kataloğu üç yüzeyde görüyor, üçü ayrı yazılırsa üç ayrı liste gibi okunuyor.
 *
 * ⚠️ RENK BURADA YOK, BİLEREK: palet mutable (bkz. colors.ts) ve modül
 * sabitine alınan bir renk tema çevrildiğinde eskisinde kalıyor. Çağıran
 * `colors.textMuted` / `ink(TOPIC_FILL_ALPHA)` ifadelerini RENDER SIRASINDA
 * okuyor. Burada yalnız temadan bağımsız sayılar duruyor.
 *
 * ⚠️🔴 GEOMETRİ (pay, yarıçap, satır açıklığı) BURADA YOK VE OLMAYACAK.
 * Bir tur ortaklandı ve GERİ ALINDI (istek). Paylaşılan şey kapsülün DERİSİ —
 * dolgu, mürekkep, tipografi; kutunun ölçüsü her yüzeyin kendi işi: kartta
 * satır içi bir etiket (4/1.5, yarıçap 12), filtre ve composer'da DOKUNMA
 * HEDEFİ (14/8, kapsül). Kartın sayıları çiplere konduğunda kutu ~24pt'ye
 * iniyor; `hitSlop`la basılabilir kalıyor ama görünüş istenmedi.
 */

import { colors } from "@/shared/theme/colors";

/** Kapsül dolgusunun alfası — `ink()` ile okunuyor, yani temanın TERSİ. */
export const TOPIC_FILL_ALPHA = 0.08;

/**
 * Etiketin mürekkebi — TARİHİN token'ı (`textMuted`).
 *
 * ⚠️ FONKSİYON, SABİT DEĞİL: palet mutable, render sırasında okunmalı.
 * ⚠️ `textSecondary` DEĞİL: ikisi şu an aynı değer (iki palette de #8E8E93)
 * ama bir gün ayrışırlarsa etiket tarihle BİRLİKTE ayrışmak zorunda.
 */
export const topicPillInk = () => colors.textMuted;

/**
 * Yazının ölçüsü. `lineHeight` orandan: 15 × 1.36 ≈ 20.5 (kartın gövde oranı).
 * Ağırlık 500 — 15pt'lik gri yazı dolgunun içinde 400'de silik okunuyordu,
 * 600 ise etiketi gövdeyle rekabet eder hâle getiriyordu.
 */
export const TOPIC_TEXT = {
  fontSize: 15,
  lineHeight: 20.5,
  fontWeight: "500",
} as const;
