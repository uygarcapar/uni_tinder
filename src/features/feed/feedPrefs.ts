import { appPrefs } from "@/shared/utils/appPrefs";
import { normalizeTopicSelection } from "./feedTopics";
import type {
  FeedInterest,
  FeedKind,
  FeedListParams,
  FeedSort,
  FeedTopicFilter,
} from "./feedTypes";

/**
 * Akış filtre tercihlerinin oturumlar arası kalıcılığı (MMKV, `app-prefs`).
 *
 * Şema/sürümleme deseni `deckProgress.ts`ten. Anahtar userId ile scope'lu ve
 * logout'ta bilerek silinmiyor — aynı kullanıcı dönünce filtresi yerinde olsun.
 *
 * ⚠️ PLUS'TAN DÜŞME DURUMU. `university` ve `kind` Plus gerektiriyor. Kullanıcı
 * aboneliğini bıraktıysa diskte kalmış bir "başka kampüs" tercihi her açılışta
 * UT-7310 üretir ve akış boş görünür. Bu yüzden okuma `canPickUniversity` /
 * `canUseKindFilter` ile SÜZÜLÜYOR (bkz. sanitizeFeedParams): hak yoksa o iki
 * alan varsayılana döner. Diske DOKUNULMAZ — abonelik geri gelirse tercih de
 * geri gelsin.
 */

const KEY_PREFIX = "feedFilters:";
// v1 → v2: `topic` alanı eklendi.
// v2 → v3: `topic` (tek) → `topics` (çoklu). SÜRÜM ATLAMALARI BİLİNÇLİ OLARAK
// GÖÇÜRÜLÜYOR (varsayılana düşmek yerine): kullanıcının kampüs/sıralama
// tercihi onun kurduğu bir şey, konu alanının şekli değişti diye sıfırlanması
// kazanılmış bir ayarı kaybetmek olurdu.
//  • v1 kaydı `topics: []` ile tamamlanıyor,
//  • v2 kaydının `topic`i tek elemanlı diziye çevriliyor ("all" → boş dizi).
const SCHEMA_VERSION = 3;

export const DEFAULT_FEED_PARAMS: FeedListParams = {
  university: null,
  sort: "new",
  interest: "all",
  kind: "all",
  topics: [],
};

interface StoredPrefs {
  v: number;
  university: string | null;
  sort: FeedSort;
  interest: FeedInterest;
  kind: FeedKind;
  /** v2'de eklendi, v3'te `topics`e devredildi — okuma tarafı göçürüyor. */
  topic?: FeedTopicFilter;
  /** v3'te eklendi. Boş dizi / alan yok = konu filtresi yok. */
  topics?: string[];
}

const SORTS: FeedSort[] = ["new", "popular", "top"];
const INTERESTS: FeedInterest[] = ["all", "mine"];
const KINDS: FeedKind[] = ["all", "anonymous", "normal"];

const keyFor = (userId: string) => `${KEY_PREFIX}${userId}`;

/** Diskten oku. Bozuk/eski şemada varsayılanlara düşer. */
export function loadFeedParams(userId?: string | null): FeedListParams {
  if (!userId) return DEFAULT_FEED_PARAMS;
  const raw = appPrefs.getString(keyFor(userId));
  if (!raw) return DEFAULT_FEED_PARAMS;
  try {
    const parsed = JSON.parse(raw) as StoredPrefs;
    if (!parsed) return DEFAULT_FEED_PARAMS;
    // v1 ve v2 OKUNABİLİR: ikisinin de tek farkı konu alanının şekli ve o alan
    // aşağıda göçürülüyor. Bilinmeyen/gelecek bir sürümde ise varsayılana
    // düşülüyor — o şekli yorumlamaya çalışmak yanlış bir filtre üretebilir.
    if (parsed.v !== SCHEMA_VERSION && parsed.v !== 1 && parsed.v !== 2) {
      return DEFAULT_FEED_PARAMS;
    }
    return {
      university:
        typeof parsed.university === "string" && parsed.university
          ? parsed.university
          : null,
      // Bilinmeyen enum değeri (eski sürüm / kurcalanmış disk) sorgu
      // parametresine girmemeli: sunucu 400 döndürür.
      sort: SORTS.includes(parsed.sort) ? parsed.sort : DEFAULT_FEED_PARAMS.sort,
      interest: INTERESTS.includes(parsed.interest)
        ? parsed.interest
        : DEFAULT_FEED_PARAMS.interest,
      kind: KINDS.includes(parsed.kind) ? parsed.kind : DEFAULT_FEED_PARAMS.kind,
      // Konu anahtarları sunucunun kapalı kümesinden geliyor ve istemci onları
      // DOĞRULAMIYOR: yeni bir konu eklendiğinde (uygulama sürümü çıkmadan)
      // diskteki tercih geçersiz sayılıp sıfırlanmamalı. Tek kural tip —
      // string olmayan değerler `normalizeTopicSelection`da ayıklanıyor.
      //
      // v3 `topics`i DOLUYSA o kazanıyor; boş ya da yoksa v2'nin tek `topic`i
      // göçürülüyor ("all" boş diziye düşüyor, normalize'ın işi).
      //
      // ⚠️ Kapı "dizi mi" DEĞİL "dolu mu": boş bir `topics` zaten seçim yok
      // demek, yani `topic`e düşmek bir şeyi bozmuyor — ama iki alanı birden
      // taşıyan bir kayıtta (göç yarısında yazılmış, elle kurcalanmış disk)
      // kullanıcının gerçek tercihini sessizce silmekten kurtarıyor.
      topics: parsed.topics?.length
        ? normalizeTopicSelection(parsed.topics)
        : normalizeTopicSelection([parsed.topic as string]),
    };
  } catch {
    return DEFAULT_FEED_PARAMS;
  }
}

export function saveFeedParams(
  userId: string | null | undefined,
  params: FeedListParams,
): void {
  if (!userId) return;
  const payload: StoredPrefs = { v: SCHEMA_VERSION, ...params };
  try {
    appPrefs.set(keyFor(userId), JSON.stringify(payload));
  } catch {
    // Yazılamadıysa tercih bu oturumla sınırlı kalır — kozmetik.
  }
}

/**
 * Yetkiye göre süz. Diske DOKUNMAZ, yalnız sorguya giden değeri düzeltir.
 *
 * `/me` henüz gelmediyse (`undefined`) süzme YAPILMIYOR: o anda "hakkı yok"
 * varsaymak, Plus'lı kullanıcının kampüs tercihini her açılışta bir kare
 * sıfırlardı.
 */
export function sanitizeFeedParams(
  params: FeedListParams,
  caps: { canPickUniversity: boolean; canUseKindFilter: boolean } | undefined | null,
): FeedListParams {
  if (!caps) return params;
  return {
    ...params,
    university: caps.canPickUniversity ? params.university : null,
    kind: caps.canUseKindFilter ? params.kind : "all",
  };
}

/** Varsayılandan sapan filtre sayısı — "Filtre" pill'inin rozeti. */
export function activeFilterCount(params: FeedListParams): number {
  let n = 0;
  if (params.sort !== DEFAULT_FEED_PARAMS.sort) n += 1;
  if (params.interest !== DEFAULT_FEED_PARAMS.interest) n += 1;
  if (params.kind !== DEFAULT_FEED_PARAMS.kind) n += 1;
  // Konu KAÇ TANE seçilmiş olursa olsun rozete 1 ekliyor: rozet "kaç FİLTRE
  // varsayılandan sapmış" diyor, "kaç konu seçili" demiyor. Üç konu seçince
  // rozetin 3 artması, yanındaki sıralama/kind filtreleriyle aynı ölçekte
  // konuşmamak olurdu — hangi konular seçili bilgisini konu pill'i veriyor.
  if (params.topics.length > 0) n += 1;
  return n;
}
