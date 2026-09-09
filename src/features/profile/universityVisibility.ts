import { MAX_UNIVERSITY_DOMAINS } from '@/shared/constants/limits';

/**
 * "Beni kimler görsün / görmesin" — SAF MANTIK.
 *
 * Bileşenden (UniversityVisibilitySheet) ayrı bir modül, çünkü buradaki iki
 * kural da sessizce bozulabilecek cinsten ve test edilebilir kalmalı; bileşeni
 * import etmek jest'te expo-blur/gorhom/api zincirinin tamamını çekiyor.
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
export const CLEAR_SENTINEL = [""];

export type Target = "visibleOnly" | "hiddenFrom";

export const FIELD_BY_TARGET = {
  visibleOnly: "VisibleOnlyToUniversityDomains",
  hiddenFrom: "HiddenFromUniversityDomains",
} as const;

export interface VisibilityDraft {
  visibleOnly: string[];
  hiddenFrom: string[];
}

/**
 * Kaydedilecek alanlar. Bileşenden AYRI ve saf, çünkü buradaki iki kural
 * sessizce bozulabilecek cinsten ve testle sabitlenmeleri gerekiyor:
 *
 *   1. DEĞİŞMEYEN ALAN GÖNDERİLMEZ. Gönderilirse premium'u biten kullanıcı,
 *      dokunmadığı bir listeyi yeniden yazmaya çalışıp 403 yer.
 *   2. BOŞALTMA `CLEAR_SENTINEL` ile gider. Boş dizi FormData'da hiçbir alan
 *      üretmiyor → sunucu "değiştirme" anlıyor → kullanıcı listesini silemiyordu.
 */
export function buildVisibilityUpdates(
  initial: VisibilityDraft,
  draft: VisibilityDraft,
): Record<string, string[]> {
  const updates: Record<string, string[]> = {};
  (Object.keys(FIELD_BY_TARGET) as Target[]).forEach((target) => {
    if (sameList(draft[target], initial[target])) return;
    updates[FIELD_BY_TARGET[target]] =
      draft[target].length > 0 ? draft[target] : CLEAR_SENTINEL;
  });
  return updates;
}

export const toDomainList = (raw: any): string[] => {
  if (!Array.isArray(raw)) return [];
  const seen = new Set<string>();
  for (const item of raw) {
    if (typeof item !== "string") continue;
    const domain = item.trim().toLowerCase();
    if (domain) seen.add(domain);
  }
  return Array.from(seen).slice(0, MAX_UNIVERSITY_DOMAINS);
};

export const sameList = (a: string[], b: string[]) =>
  a.length === b.length && a.every((d, i) => d === b[i]);
