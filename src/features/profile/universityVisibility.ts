import { MAX_ALLOW_DOMAINS, MAX_BLOCK_DOMAINS } from '@/shared/constants/limits';

/**
 * "Beni kimler görsün / görmesin" — SAF MANTIK.
 *
 * Bileşenden (UniversityVisibilitySheet) ayrı bir modül, çünkü buradaki kurallar
 * sessizce bozulabilecek cinsten ve test edilebilir kalmalı; bileşeni import
 * etmek jest'te expo-blur/gorhom/api zincirinin tamamını çekiyor.
 *
 * 🔴 TEK MOD (2026-09-10, backend commit `f61d4c0`): iki liste artık BİRBİRİNİ
 * DIŞLIYOR. Eskiden ikisi bağımsız doldurulabiliyordu; backend bunu kapattı ve
 * ikisi birden dolu gelen isteğe 400 dönüyor.
 *
 * Neden: Allow ("sadece şunlar görsün") zaten bir whitelist — 3 üniversite
 * seçildiği an geri kalan ~204 okul göremiyor. Üstüne Block eklemek ya hiçbir
 * şey yapmıyordu (zaten göremeyen okulu bir daha engellemek) ya da aynı domain
 * iki listedeyse kullanıcının kendi Allow seçimini iptal ediyordu. Yani
 * kullanıcıya etkisiz ya da kendini sabote eden bir ayar kurduruyorduk.
 *
 * Arayüz karşılığı: iki checkbox DEĞİL, üç şıklı bir radio. Backend'in 400'ü
 * tam olarak "FE radio yerine checkbox gösteriyor" bug'ını görünür kılmak için
 * konuldu — sessizce birini kazandırmıyor.
 */

/**
 * Boş listeyi FormData ile anlatmanın yolu.
 *
 * `profileService.updateProfile` diziyi `forEach(append)` ile yazıyor: boş dizi
 * HİÇBİR alan üretmiyor, sunucu da alanı `null` (=değiştirme) görüyor — yani
 * "temizle" isteği sessizce kayboluyordu. Tek boş string gönderince alan
 * geliyor ve backend'in `Normalize`'ı boş/whitespace girdileri atıyor
 * (UniversityVisibilityService.Normalize) → sunucuda boş liste = temizle.
 */
export const CLEAR_SENTINEL = [''];

/**
 * Aynı anda yalnız biri açık olabilir.
 *   everyone → iki liste de boş, kısıtlama yok
 *   allow    → "beni sadece şu üniversiteler görsün"  (en fazla 3)
 *   block    → "beni şu üniversiteler görmesin"       (en fazla 5)
 */
export type VisibilityMode = 'everyone' | 'allow' | 'block';

export const FIELD_BY_MODE = {
  allow: 'VisibleOnlyToUniversityDomains',
  block: 'HiddenFromUniversityDomains',
} as const;

export interface VisibilityDraft {
  mode: VisibilityMode;
  domains: string[];
}

/**
 * Mod başına tavan. İkisinin FARKLI olması bilinçli (backend
 * `UniversityVisibilityService.MaxBlockDomains`): Allow daraltıcı bir seçim,
 * 3 yeterli; Block ise saklanma niyeti (eski sevgili, akraba, aynı sınıftan
 * biri) ve orada 3 pratikte az kalıyor.
 */
export const maxDomainsFor = (mode: VisibilityMode): number =>
  mode === 'block' ? MAX_BLOCK_DOMAINS : MAX_ALLOW_DOMAINS;

/**
 * Sunucudaki iki listeden tek modu çıkar.
 *
 * ⚠️ İKİSİ BİRDEN DOLU olabilir: XOR kuralından önce kaydedilmiş profiller.
 * Backend migration'ı bunları ALLOW lehine temizliyor — biz de aynı yönü
 * seçiyoruz. Ters yön (Block'u kazandırmak) kullanıcıyı bir anda yüzlerce
 * üniversiteye görünür kılardı ve bu bir gizlilik ayarında kabul edilemez.
 */
export function resolveVisibilityDraft(profile: any): VisibilityDraft {
  const allow = toDomainList(profile?.visibleOnlyToUniversityDomains, 'allow');
  const block = toDomainList(profile?.hiddenFromUniversityDomains, 'block');

  if (allow.length > 0) return { mode: 'allow', domains: allow };
  if (block.length > 0) return { mode: 'block', domains: block };
  return { mode: 'everyone', domains: [] };
}

/**
 * Kaydedilecek alanlar. Bileşenden AYRI ve saf, çünkü buradaki kurallar
 * sessizce bozulabilecek cinsten ve testle sabitlenmeleri gerekiyor:
 *
 *   1. DEĞİŞİKLİK YOKSA BOŞ PAYLOAD. Dokunulmamış bir listeyi yeniden
 *      göndermek, premium'u biten kullanıcıda gereksiz 403 demek.
 *   2. KARŞI MOD HER ZAMAN AÇIKÇA TEMİZLENİR. Backend gönderilmeyen alanı da
 *      boş liste sayıp karşı modu siliyor (TryApplyExclusiveVisibility), yani
 *      teknik olarak şart değil — ama niyeti isteğin kendisinde görünür kılmak
 *      hem logda hem ileride sözleşme gevşerse doğru tarafta bırakıyor.
 *   3. TEMİZLEME `CLEAR_SENTINEL` ile gider. Boş dizi FormData'da hiçbir alan
 *      üretmiyor → sunucu "değiştirme" anlıyor → kullanıcı listesini silemiyordu.
 *
 * 🔴 İki alan ASLA aynı anda dolu gönderilmez: backend 400 döner.
 */
export function buildVisibilityUpdates(
  initial: VisibilityDraft,
  draft: VisibilityDraft,
): Record<string, string[]> {
  if (!isDirty(initial, draft)) return {};

  const domains = draft.mode === 'everyone' ? [] : draft.domains.slice(0, maxDomainsFor(draft.mode));

  return {
    [FIELD_BY_MODE.allow]:
      draft.mode === 'allow' && domains.length > 0 ? domains : CLEAR_SENTINEL,
    [FIELD_BY_MODE.block]:
      draft.mode === 'block' && domains.length > 0 ? domains : CLEAR_SENTINEL,
  };
}

/**
 * "Kaydet" gerekiyor mu.
 *
 * Mod aynı ama liste boşaldıysa da kirli sayılır: `everyone`e geçmeden listeyi
 * temizleyen kullanıcı da bir değişiklik yapmıştır. Boş listeli `allow`/`block`
 * kaydedilirken zaten `everyone`e denk düşüyor (yukarıda ikisi de sentinel).
 */
export function isDirty(initial: VisibilityDraft, draft: VisibilityDraft): boolean {
  const normalize = (d: VisibilityDraft) =>
    d.mode === 'everyone' || d.domains.length === 0
      ? { mode: 'everyone' as VisibilityMode, domains: [] as string[] }
      : d;

  const a = normalize(initial);
  const b = normalize(draft);
  return a.mode !== b.mode || !sameList(a.domains, b.domains);
}

export const toDomainList = (raw: any, mode: VisibilityMode = 'allow'): string[] => {
  if (!Array.isArray(raw)) return [];
  const seen = new Set<string>();
  for (const item of raw) {
    if (typeof item !== 'string') continue;
    const domain = item.trim().toLowerCase();
    if (domain) seen.add(domain);
  }
  return Array.from(seen).slice(0, maxDomainsFor(mode));
};

export const sameList = (a: string[], b: string[]) =>
  a.length === b.length && a.every((d, i) => d === b[i]);
