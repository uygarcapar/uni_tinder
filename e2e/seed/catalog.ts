/**
 * Anonim `/api/common/*` kataloglarını bir kez çeker ve bot üretimi boyunca
 * paylaşır.
 *
 * Neden tek yerde: bir koşuda 6 bot yaratılıyor ve her biri cinsiyet, bölüm,
 * hobi, prompt, niyet listelerine ihtiyaç duyuyor. Bot başına çekmek 30+
 * gereksiz istek ve `send-verification` cooldown'una yaklaşan bir gürültü.
 *
 * ⚠️ Enum adları SABİT KODLANMIYOR: backend listeye yeni değer eklediğinde ya
 * da birini `isActive:false` yaptığında test kırılmasın diye hep listenin
 * başından seçiliyor.
 */
import { API_ENDPOINTS } from '@/shared/constants/api';
import { getJson, unwrapList } from './client';

export interface CatalogEntry {
  enumName: string;
  name?: string;
  id?: number | string;
}

export interface Catalogs {
  genders: CatalogEntry[];
  departments: CatalogEntry[];
  hobbies: CatalogEntry[];
  prompts: CatalogEntry[];
  relationshipIntents: CatalogEntry[];
  friendshipIntents: CatalogEntry[];
  interestedIn: CatalogEntry[];
}

/**
 * ⚠️ ÜÇ KATALOG DA KATEGORİ GRUPLU GELİYOR — düz liste DEĞİL.
 *
 * `genders` → `subGenders[]`, `hobbies` → `hobbies[]`, `prompts` → `prompts[]`.
 * İlk yazımda düz liste varsayılmıştı ve katalog boş görünüyordu (bot üretimi
 * "Boş katalog" ile duruyordu). Düzleştirici çocuk dizinin ADINI bilmiyor,
 * nesnedeki İLK dizi alanına iniyor — backend yeni bir grup ucu eklerse de
 * çalışsın.
 */
function flatten(raw: unknown[]): CatalogEntry[] {
  const out: CatalogEntry[] = [];
  for (const item of raw) {
    const node = item as Record<string, unknown>;
    if (typeof node?.enumName === 'string') {
      out.push(node as unknown as CatalogEntry);
      continue;
    }
    const childArray = Object.values(node ?? {}).find(Array.isArray) as unknown[] | undefined;
    if (!childArray) continue;
    for (const child of childArray) {
      const c = child as CatalogEntry;
      if (typeof c?.enumName === 'string') out.push(c);
    }
  }
  return out;
}

/**
 * Prompt katalogu ek olarak `isActive` ve `modes` taşıyor.
 *
 * ⚠️ `isActive:false` bir prompt'u seçmek sunucuda `UT-2202` üretiyor
 * (bayat katalog kodu) — tohumlayıcı onları baştan eliyor.
 *
 * ⚠️ Multipart alanı `Prompts[i].PromptKey` — `PromptId` DEĞİL
 * (bkz. features/profile/promptPayload.ts:44). Anahtar `enumName`.
 */
function toPrompts(raw: unknown[], mode: string): CatalogEntry[] {
  return flatten(raw).filter((entry) => {
    const p = entry as unknown as { isActive?: boolean; modes?: string[] };
    if (p.isActive === false) return false;
    if (Array.isArray(p.modes) && p.modes.length > 0 && !p.modes.includes(mode)) return false;
    return true;
  });
}

let cached: Catalogs | null = null;

export async function loadCatalogs(mode = 'Dating'): Promise<Catalogs> {
  if (cached) return cached;

  const [g, d, h, p, ri, fi, ii] = await Promise.all([
    getJson(API_ENDPOINTS.GET_GENDERS),
    getJson(API_ENDPOINTS.GET_DEPARTMENTS),
    getJson(API_ENDPOINTS.GET_HOBBIES),
    getJson(API_ENDPOINTS.GET_PROMPTS),
    getJson(API_ENDPOINTS.GET_RELATIONSHIP_INTENTS),
    getJson(API_ENDPOINTS.GET_FRIENDSHIP_INTENTS),
    getJson(API_ENDPOINTS.GET_INTERESTED_IN),
  ]);

  cached = {
    genders: flatten(unwrapList(g)),
    departments: flatten(unwrapList(d)),
    hobbies: flatten(unwrapList(h)),
    prompts: toPrompts(unwrapList(p), mode),
    relationshipIntents: flatten(unwrapList(ri)),
    friendshipIntents: flatten(unwrapList(fi)),
    interestedIn: flatten(unwrapList(ii)),
  };

  const empty = (Object.entries(cached) as Array<[string, CatalogEntry[]]>)
    .filter(([, v]) => v.length === 0)
    .map(([k]) => k);
  if (empty.length > 0) {
    throw new Error(
      `Boş katalog(lar): ${empty.join(', ')}.\n` +
        `  Bot üretimi bu listelerden enum seçiyor; boşken kayıt sunucuda reddedilir.`
    );
  }
  return cached;
}

/** Testler arası sızıntıyı engellemek için (cli tek process, yine de). */
export function resetCatalogs(): void {
  cached = null;
}
