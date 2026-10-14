import { appPrefs } from "@/shared/utils/appPrefs";
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
// v1 → v2: `topic` alanı eklendi. SÜRÜM ATLAMA BİLİNÇLİ OLARAK GÖÇÜRÜLÜYOR
// (varsayılana düşmek yerine): kullanıcının kampüs/sıralama tercihi onun
// kurduğu bir şey, konu alanı eklendi diye sıfırlanması kazanılmış bir ayarı
// kaybetmek olurdu. Eski kayıt okunup `topic: "all"` ile tamamlanıyor.
const SCHEMA_VERSION = 2;

export const DEFAULT_FEED_PARAMS: FeedListParams = {
  university: null,
  sort: "new",
  interest: "all",
  kind: "all",
  topic: "all",
};

interface StoredPrefs {
  v: number;
  university: string | null;
  sort: FeedSort;
  interest: FeedInterest;
  kind: FeedKind;
  /** v2'de eklendi — v1 kayıtlarında YOK, okuma tarafı "all"a tamamlıyor. */
  topic?: FeedTopicFilter;
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
    // v1 OKUNABİLİR: tek fark `topic`in yokluğu ve o alan aşağıda "all"a
    // tamamlanıyor. Bilinmeyen/gelecek bir sürümde ise varsayılana düşülüyor —
    // o şekli yorumlamaya çalışmak yanlış bir filtre üretebilir.
    if (parsed.v !== SCHEMA_VERSION && parsed.v !== 1) return DEFAULT_FEED_PARAMS;
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
      // Konu anahtarı sunucunun kapalı kümesinden geliyor ve istemci onu
      // DOĞRULAMIYOR: yeni bir konu eklendiğinde (uygulama sürümü çıkmadan)
      // diskteki tercih geçersiz sayılıp sıfırlanmamalı. Tek kural tip:
      // string olmayan değer "all"a düşüyor.
      topic:
        typeof parsed.topic === "string" && parsed.topic
          ? (parsed.topic as FeedTopicFilter)
          : DEFAULT_FEED_PARAMS.topic,
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
  if (params.topic !== DEFAULT_FEED_PARAMS.topic) n += 1;
  return n;
}
