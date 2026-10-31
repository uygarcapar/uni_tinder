import api from "@/shared/services/api";
import { API_ENDPOINTS } from "@/shared/constants/api";
import { File, UploadType } from "expo-file-system";
import type { AppMode } from "@/features/discover/modeTheme";
import { CAMPUS_CODES } from "./campusCodes";
import { normalizeCampusBoundary } from "./campusBoundary";
import type {
  CampusBoundaryDto,
  CampusMeDto,
  CampusMomentDto,
  CampusMomentsPage,
  CampusPresenceBody,
  CampusPresenceResult,
  CreateCampusMomentBody,
} from "./campusTypes";

/**
 * KAMPÜS ANLARI servis katmanı.
 *
 * `api.ts`'in başarı interceptor'ı `response.data` döndürüyor, yani buradaki
 * `res` doğrudan backend'in `ResponseDto` zarfı — AxiosResponse DEĞİL.
 *
 * ── `guard()` ne yapıyor ────────────────────────────────────────────────────
 * Soft-fail'i (200 + `isSuccess:false`) axios hatası şekline çeviriyor ki
 * çağıranlar tek bir `catch` ile hem `code` hem `message` hem `result`a
 * bakabilsin. `feedService.guard`ın aynısı, FARKI: burada feature-flag latch'i
 * YOK. Akışta UT-7301 sekmeyi tamamen gizliyor; burada "kapalı" bir durum
 * (UT-7401 / `enabled:false`) kampüs başına değişiyor ve `/me` zaten söylüyor,
 * yani oturum boyu dondurulacak bir latch yanlış olurdu — kullanıcı poligonu
 * yeni inmiş bir kampüse girdiğinde özellik açılmalı.
 *
 * ⚠️ Dallanma HER ZAMAN `code` üzerinden. 403 burada beş ayrı şey:
 * UT-7401 kapalı · UT-7407 kısıtlı · UT-7410 kampüs dışı · UT-7412 sahte konum ·
 * UT-7420 kota.
 */

const DEFAULT_PAGE_SIZE = 20;

/** Zarftan hata kodunu çek — hem soft-fail hem throw yolundan. */
export const campusCodeOf = (node: any): string | null =>
  node?.code ?? node?.response?.data?.code ?? null;

/** Sunucu mesajı — kullanıcının dilinde ve gösterime hazır geliyor. */
export const campusMessageOf = (node: any): string | null =>
  node?.response?.data?.message ?? node?.message ?? null;

/** Hata gövdesindeki `result` — kota/paywall alanları burada. */
export const campusResultOf = (node: any): any =>
  node?.response?.data?.result ?? null;

async function guard<T>(
  run: () => Promise<any>,
  unwrap: (res: any) => T,
): Promise<T> {
  const res = await run();
  if (!res?.isSuccess) {
    const err: any = new Error(res?.message || "Campus request failed");
    err.response = { data: res, status: res?.statusCode ?? 200 };
    throw err;
  }
  return unwrap(res);
}

/** `result` beklenen bir uçta eksikse bu bir sözleşme ihlali — patlat. */
function requireResult<T>(res: any, what: string): T {
  const result = res?.result;
  if (result == null) throw new Error(`Campus: ${what} result eksik`);
  return result as T;
}

/**
 * Liste sayfasını güvenli şekle sok.
 *
 * ⚠️ `hasMore` SUNUCUDAN, `items.length`ten TÜRETİLMİYOR: son sayfa tam dolu
 * gelebilir ve o durumda "devam var" demek doğru. Alan yoksa `nextCursor`a
 * düşüyoruz — ikisi de yoksa liste biter (yanlış taraf: fazladan sayfa
 * çekmektense erken durmak).
 */
function normalizeMomentsPage(raw: any): CampusMomentsPage {
  const items: CampusMomentDto[] = Array.isArray(raw?.items) ? raw.items : [];
  const nextCursor =
    typeof raw?.nextCursor === "string" && raw.nextCursor ? raw.nextCursor : null;
  const hasMore =
    typeof raw?.hasMore === "boolean" ? raw.hasMore : Boolean(nextCursor);
  return { items, nextCursor, hasMore };
}

class CampusService {
  /**
   * Kampüs sınırı.
   *
   * ⚠️ Yanıt NORMALİZE EDİLEREK dönüyor (`normalizeCampusBoundary`): bozuk ya
   * da yarım bir geometride `polygon: null` oluyor ve özellik kapanıyor.
   * "Elimden geleni yapayım" yolu kullanıcıyı kampüste olmadığı hâlde kampüste
   * sayma riskini taşırdı.
   */
  getBoundary(domain?: string | null): Promise<CampusBoundaryDto | null> {
    return guard(
      () => api.get(API_ENDPOINTS.CAMPUS_BOUNDARY(domain)),
      (res) => normalizeCampusBoundary(res?.result),
    );
  }

  /**
   * Yüzeyin durumu — MOD'LU.
   *
   * `mode` BOŞSA parametre HİÇ gönderilmiyor (`getMoments` ile aynı kural):
   * boş string sunucuda enum çözümlemesini patlatıyor. Parametresiz çağrı
   * sunucuda `Dating` sayılıyor, diğer mod'lu uçlarla aynı varsayılan.
   */
  getMe(mode?: AppMode | null): Promise<CampusMeDto> {
    const query = mode ? `?mode=${encodeURIComponent(mode)}` : "";
    return guard(
      () => api.get(`${API_ENDPOINTS.CAMPUS_ME}${query}`),
      (res) => requireResult<CampusMeDto>(res, "me"),
    );
  }

  /**
   * An listesi — cursor sayfalama.
   *
   * `mode` BOŞSA parametre HİÇ gönderilmiyor: boş string sunucuda enum
   * çözümlemesini patlatıyor (`swipeService.modeParam` ile aynı kural).
   */
  getMoments(args: {
    mode?: AppMode | null;
    cursor?: string | null;
    pageSize?: number;
  }): Promise<CampusMomentsPage> {
    const params = new URLSearchParams();
    if (args.mode) params.set("mode", args.mode);
    if (args.cursor) params.set("cursor", args.cursor);
    params.set("pageSize", String(args.pageSize ?? DEFAULT_PAGE_SIZE));
    return guard(
      () => api.get(`${API_ENDPOINTS.CAMPUS_MOMENTS}?${params.toString()}`),
      (res) => normalizeMomentsPage(res?.result),
    );
  }

  /** Presigned yükleme adresi. `UT-7405` boyut sınırını YÜKLEMEDEN ÖNCE söylüyor. */
  createUploadUrl(args: {
    contentType: string;
    sizeBytes: number;
  }): Promise<{ uploadUrl: string; objectKey: string }> {
    return guard(
      () => api.post(API_ENDPOINTS.CAMPUS_MOMENTS_UPLOAD_URL, args),
      (res) => requireResult(res, "upload-url"),
    );
  }

  /**
   * Dosyayı DOĞRUDAN S3'e yükle.
   *
   * ⚠️ `api` İSTEMCİSİ KULLANILMIYOR: presigned URL imzayı query'de taşıyor,
   * üstüne `Authorization` başlığı eklemek imzayı geçersiz kılıyor. Sesli
   * mesajdaki (`chatService.uploadFileToS3`) kalıbın aynısı; dosya JS'e
   * okunmuyor, native tarafta aktarılıyor.
   */
  async uploadToS3(
    uploadUrl: string,
    fileUri: string,
    contentType: string,
  ): Promise<void> {
    const file = new File(fileUri);
    const res = await file.upload(uploadUrl, {
      httpMethod: "PUT",
      uploadType: UploadType.BINARY_CONTENT,
      // ⚠️ İmzaya DAHİL: adım 1'de bildirilen `contentType` ile birebir aynı
      // olmalı, farklıysa S3 403 döner.
      headers: { "Content-Type": contentType },
    });
    if (res.status < 200 || res.status >= 300) {
      throw new Error(`S3 upload failed: ${res.status}`);
    }
  }

  /**
   * Anı yayınla.
   *
   * Konum alanları gövdede ve bu bir formalite DEĞİL: sunucu poligon
   * kontrolünü, hassasiyeti, sahte konum bayrağını ve okuma tazeliğini
   * burada doğruluyor (UT-7410/7411/7412/7413/7415).
   */
  createMoment(body: CreateCampusMomentBody): Promise<CampusMomentDto> {
    return guard(
      () => api.post(API_ENDPOINTS.CAMPUS_MOMENTS, body),
      (res) => requireResult<CampusMomentDto>(res, "moment"),
    );
  }

  /** Kaldır. Günün hakkı GERİ GELMİYOR — metin bunu söylemek zorunda. */
  /**
   * Anı kaldır — ⚠️ YANIT SİLİNEN ANIN MODUNU TAŞIYOR ve taşımak zorunda.
   *
   * Çağıran `/me`yi o modun anahtarıyla tazeliyor. Mod istemci cache'inden
   * TÜRETİLEMİYOR: türetmenin tek yolu silinen anı geri okumak, o da
   * `UT-7421 MOMENT_GONE` dönüyor (⚠️ `UT-7420` DEĞİL — o beğeni kotası).
   * Yani kart cache'ten düşmüş bir yolda (süre dolması, başka cihazdan silme)
   * modu öğrenebileceğimiz başka uç yok.
   *
   * Alan gelmezse `null` — çağıran köke düşüyor (iki modu da tazelemek,
   * yanlış modu tazelemekten iyi).
   */
  deleteMoment(id: string): Promise<{ mode: AppMode | null }> {
    return guard(
      () => api.delete(API_ENDPOINTS.CAMPUS_MOMENT(id)),
      (res) => ({ mode: (res?.result?.mode as AppMode) ?? null }),
    );
  }

  /**
   * GEÇ — kampüs-yerel karar. `/api/swipe/Pass`'e GİTMİYOR (gerekçe
   * api.ts > CAMPUS_MOMENT_PASS ve campusTypes > CampusDecisionExtras).
   *
   * Kotasız ama rate limit'li: `UT-7430` görülürse sessizce geri çekil,
   * kullanıcıya gösterilecek bir sınır değil.
   */
  passMoment(id: string, mode?: AppMode | null): Promise<void> {
    // ⚠️ `mode` ANIN MODUYLA AYNI olmak zorunda (sözleşme §7). Boşsa parametre
    // HİÇ gönderilmiyor — boş string sunucuda enum çözümlemesini patlatıyor.
    const query = mode ? `?mode=${encodeURIComponent(mode)}` : "";
    return guard(
      () => api.post(`${API_ENDPOINTS.CAMPUS_MOMENT_PASS(id)}${query}`, {}),
      () => undefined,
    );
  }

  /**
   * Kampüse giriş/çıkış bildirimi. Push kararı tamamen SUNUCUNUN — istemci
   * yerel bildirim kurmuyor ve yanıttan bir karar TÜRETMİYOR.
   *
   * ⚠️ `momentCountToday === 0` "bildirim gitmeyecek" DEMİYOR (bkz.
   * `CampusPresenceResult`): boş yüzeyde gerekçe "ilk anı sen paylaş"a
   * dönüyor.
   */
  reportPresence(body: CampusPresenceBody): Promise<CampusPresenceResult> {
    return guard(
      () => api.post(API_ENDPOINTS.CAMPUS_PRESENCE, body),
      (res) => requireResult<CampusPresenceResult>(res, "presence"),
    );
  }
}

/** Kod bu kümede mi — `includes` çağıranlarda tekrar etmesin diye. */
export const isCampusCodeIn = (
  code: string | null | undefined,
  codes: readonly string[],
): boolean => !!code && codes.includes(code);

/** Kota reddi mi — paywall dalı buna bakıyor. */
export const isCampusQuotaError = (err: unknown): boolean =>
  campusCodeOf(err) === CAMPUS_CODES.DECISION_QUOTA;

export const campusService = new CampusService();
export default campusService;
