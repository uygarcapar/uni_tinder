/**
 * SEÇİCİ KATMANI — iki eksen bilerek ayrı tutuluyor:
 *
 *   • ETKİLEŞİM daima `~id` ile (accessibility id).
 *   • DOĞRULAMA daima i18n metniyle.
 *
 * Sebebi: "ekranda doğru şey yazıyor mu" sorusunun cevabı bir testID olamaz,
 * ve "şu butona bas" komutunun hedefi bir çeviri metni olmamalı (metin
 * değişince 40 spec kırılır).
 *
 * SEÇİCİ HİYERARŞİSİ (kural, tercih değil):
 *   1. `~id`                  — varsayılan. RN testID → iOS accessibilityIdentifier.
 *   2. `-ios predicate string:` — dinamik/çoklu eleman, metin eşleşmesi.
 *   3. `-ios class chain:`      — native tab bar ve Alert; başka yol yok.
 *   4. XPath                    — YASAK. XCUITest'te tüm sayfa kaynağı XML'e
 *      serialize edilip XPath motoruna veriliyor; bu ekranlar derin
 *      (SwipeCard.tsx 287 KB) ve tek sorgu 3-8 sn sürüyor, snapshotMaxDepth
 *      kırpınca da sessizce BOŞ dönüyor. `~` ise WDA'da doğrudan
 *      XCUIElement.identifier eşleşmesi — 50-200 ms.
 */
import tr from '@/shared/i18n/translations/tr';
import en from '@/shared/i18n/translations/en';
import { LANG } from './env';

type Dict = typeof tr;

/**
 * Sözlüğün tüm yaprak yollarının birleşimi: 'auth.step1.title' gibi.
 * Yazım hatası DERLEME HATASI — `npm run e2e:type-check` bunu CI'da Linux'ta
 * ücretsiz yakalıyor, simülatör gerekmiyor.
 */
type LeafPaths<T, P extends string = ''> = {
  [K in keyof T & string]: T[K] extends string ? `${P}${K}` : LeafPaths<T[K], `${P}${K}.`>;
}[keyof T & string];

export type I18nKey = LeafPaths<Dict>;

const DICTS: Record<'tr' | 'en', unknown> = { tr, en };

/** i18n anahtarını metne çevirir; `{{var}}` yer tutucularını doldurur. */
export function tx(key: I18nKey, vars?: Record<string, string | number>): string {
  let node: unknown = DICTS[LANG];
  for (const part of key.split('.')) {
    if (typeof node !== 'object' || node === null) {
      throw new Error(`i18n anahtarı çözülemedi: ${key} (${LANG})`);
    }
    node = (node as Record<string, unknown>)[part];
  }
  if (typeof node !== 'string') {
    throw new Error(`i18n anahtarı metin değil: ${key} (${LANG})`);
  }
  if (!vars) return node;
  return node.replace(/\{\{(\w+)\}\}/g, (whole, name: string) =>
    name in vars ? String(vars[name]) : whole
  );
}

/** `~discover-btn-like` — accessibility id seçicisi. */
export const id = (value: string): string => `~${value}`;

/** Tek eleman, accessibility id ile. */
export const idOf = (value: string) => browser.$(id(value));

/**
 * Çoklu eleman — GERÇEK dizi olarak.
 *
 * ⚠️ `await browser.$$(sel)` bir `ChainablePromiseArray` döndürüyor ve onun
 * `length`i `Promise<number>` (webdriverio/build/types.d.ts:168). Yani
 * `(await browser.$$(sel)).length === 0` sessizce DAİMA false olur — await
 * edilmemiş bir promise'i sayıyla karşılaştırmak. Tek doğru yol
 * `.getElements()`; bütün e2e kodu bu yardımcıdan geçiyor.
 */
export const els = (selector: string): Promise<WebdriverIO.ElementArray> =>
  browser.$$(selector).getElements();

/** Önek paylaşan elemanlar (`feed-card-0`, `feed-card-1`, …) — predicate, XPath değil. */
export const idsWithPrefix = (prefix: string) =>
  els(`-ios predicate string: name BEGINSWITH '${esc(prefix)}'`);

/** iOS predicate string'inde tek tırnak kaçışı. */
export function esc(value: string): string {
  return value.replace(/\\/g, '\\\\').replace(/'/g, "\\'");
}

/**
 * Metinle eleman bul. `name`, `label` ve `value` birlikte aranıyor çünkü
 * WDA metni elemanın tipine göre farklı attribute'a koyuyor:
 * StaticText'te label, TextField'da value, Button'da name.
 */
export function byText(key: I18nKey, vars?: Record<string, string | number>) {
  const v = esc(tx(key, vars));
  return browser.$(`-ios predicate string: name == '${v}' OR label == '${v}' OR value == '${v}'`);
}

/** Ham metinle (i18n'den geçmeyen DEV menüsü gibi yerler için). */
export function byRawText(value: string) {
  const v = esc(value);
  return browser.$(`-ios predicate string: name == '${v}' OR label == '${v}' OR value == '${v}'`);
}

/** Metni İÇEREN eleman — sayı/tarih gibi değişken kuyruklu etiketler için. */
export function byTextContaining(key: I18nKey, vars?: Record<string, string | number>) {
  const v = esc(tx(key, vars));
  return browser.$(
    `-ios predicate string: name CONTAINS '${v}' OR label CONTAINS '${v}' OR value CONTAINS '${v}'`
  );
}

/** Doğrulama kısayolu — spec'lerde assertion'ların tek yolu. */
export async function seeText(
  key: I18nKey,
  vars?: Record<string, string | number>
): Promise<void> {
  await expect(byText(key, vars)).toBeDisplayed();
}
