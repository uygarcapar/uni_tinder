import type { AppMode } from "@/features/discover/modeTheme";
import type { PhotoModeration } from "@/features/profile/photoModeration";

/**
 * KAMPÜS ANLARI — wire tipleri.
 *
 * Yüzey: tam ekran kampüs haritasının üstünde, 24 saat yaşayan tek-fotoğraflık
 * anlar ve onlar üzerinden eşleşme. Sözleşmenin tamamı ve gerekçeleri repo
 * kökündeki `backend_campus_moments_2026-10.md` dosyasında.
 *
 * ⚠️ SÖZLEŞME HENÜZ CANLI DEĞİL. Bu dosya talebin şeklini kaydediyor; uçlar
 * geldiğinde alan alan doğrulanacak. Buradaki bir alanı "varmış gibi" kullanan
 * ekran yazmadan önce canlı yanıta bakın.
 *
 * ── Wire kuralları (uygulama geneli, bkz. feedTypes.ts) ─────────────────────
 *  • Id'ler STRING ("4471"), number DEĞİL → `parseInt` ETME.
 *  • Enum'lar PascalCase string ("Dating", "Enter").
 *  • Zamanlar UTC, ISO 8601 + `Z`.
 */

// ── Coğrafya ───────────────────────────────────────────────────────────────

/** GeoJSON sırası: [boylam, enlem]. ⚠️ Enlem/boylam TERS, karıştırması kolay. */
export type GeoPosition = [number, number];

/** Dış halka + (varsa) delikler. GeoJSON `Polygon.coordinates` ile aynı. */
export type GeoRing = GeoPosition[];

export interface GeoPolygon {
  type: "Polygon";
  /** `[0]` dış halka, kalanlar delik. */
  coordinates: GeoRing[];
}

export interface GeoMultiPolygon {
  type: "MultiPolygon";
  /** Çok kampüslü üniversite: her eleman bir Polygon'ın halka listesi. */
  coordinates: GeoRing[][];
}

export type CampusGeometry = GeoPolygon | GeoMultiPolygon;

/**
 * İşletim sistemi geofence'inin kabul ettiği TEK şekil: daire.
 *
 * ⚠️ Bu daire "kampüs" DEĞİL, yalnız uyandırma tetiği. Kararı poligon veriyor
 * (gerekçe `campusBoundary.ts` başında).
 */
export interface CampusCircle {
  lat: number;
  lon: number;
  radiusMeters: number;
}

export interface CampusBoundaryDto {
  /**
   * ⚠️ KANONİK domain — istediğinle AYNI OLMAYABİLİR. `bogazici.edu.tr`
   * sorana `boun.edu.tr` dönüyor (ikisi de aynı kampüs, ilki alias).
   *
   * Bu alanı kullanıcının e-posta domain'iyle STRING KARŞILAŞTIRMA; alias
   * domain'li kullanıcı kendi kampüsünü "başkasının kampüsü" sanırdı.
   * Eşitlik gerekiyorsa `/api/common/universities`teki `canonicalDomain`
   * üzerinden karşılaştır.
   */
  domain: string;
  /**
   * `true` = koordinat kampüs değil İL MERKEZİ. Özelliğin ANA KAPISI: bu
   * durumda sınır kontrolü hiç yapılmıyor, yüzey o kampüste kapalı.
   * (Haritadaki `isApproximate → şehir ölçeği` kapısıyla aynı felsefe.)
   */
  isApproximate: boolean;
  circle: CampusCircle | null;
  polygon: CampusGeometry | null;
  /** Monotonik sürüm — diskteki kopyanın bayatlığı bununla anlaşılıyor. */
  version: string | null;
  /**
   * Sunucunun kendi kapısı (sözleşmede yoktu, uygulamada eklendi).
   *
   * ⚠️ YÜZEYİN AÇILIP AÇILMAYACAĞI BURADAN DEĞİL `/campus/me`nin `enabled`
   * alanından okunuyor: o, özellik bayrağını ve kampüs verisini BİRLİKTE
   * özetliyor. Buradaki alan yalnız ikinci bir emniyet.
   */
  enabled: boolean | null;
}

// ── Yüzeyin durumu ─────────────────────────────────────────────────────────

export interface CampusQuotaDto {
  /** ⚠️ `-1` = SINIRSIZ (premium). `limits.ts > UNLIMITED` konvansiyonu. */
  decisionsRemaining: number;
  decisionLimit: number;
  /** Bir sonraki sıfırlama. İstemci saati SABİT YAZMIYOR. */
  nextResetAt: string | null;
}

export interface CampusMeDto {
  enabled: boolean;
  universityDomain: string | null;
  boundaryVersion: string | null;
  /** Bugün paylaşıldı mı — "+" butonunun kapılarından biri. */
  postedToday: boolean;
  /** Bugünün anı; `null` = henüz paylaşılmadı. */
  myMomentId: string | null;
  quota: CampusQuotaDto;
  photoMaxBytes: number | null;
}

// ── An ─────────────────────────────────────────────────────────────────────

export interface CampusMomentDto {
  id: string;
  /** Swipe hedefi — karar `/api/swipe/*`a BU id ile gidiyor. */
  userId: string;
  displayName: string;
  /** `null` = kullanıcı yaşını gizlemiş (kart yaşı hiç yazmıyor). */
  age: number | null;
  photoUrl: string;
  createdAt: string;
  /**
   * `createdAt + 24 saat`. ⚠️ Bitiş kararı `status` benzeri bir alandan DEĞİL
   * BURADAN türüyor (akıştaki `postPresentation` kuralının aynısı).
   */
  expiresAt: string;
  mode: AppMode;
  isMine: boolean;
  /**
   * Kanonik moderasyon bloğu — foto dönen her uçla aynı şekil.
   * Başkasının moderasyonda düşmüş anı zaten listeye gelmiyor; bu blok
   * pratikte KENDİ anım için dolu (neden görünmediğini söyleyen tek şey).
   */
  moderation?: PhotoModeration | null;
}

export interface CampusMomentsPage {
  items: CampusMomentDto[];
  /** Opak; istemci İÇİNE BAKMIYOR. */
  nextCursor: string | null;
  hasMore: boolean;
}

// ── Paylaşım ───────────────────────────────────────────────────────────────

/**
 * Paylaşım gövdesi — konum alanları DAHİL.
 *
 * ⚠️ Konumun burada olması bir formalite değil: "kampüsteyim" kararının
 * OTORİTESİ SUNUCU. İstemcideki kontrol yalnız "+" butonunu çizip çizmemek
 * için (gerekçe `campusBoundary.ts` başında ve sözleşme §5'te).
 */
export interface CreateCampusMomentBody {
  objectKey: string;
  mode: AppMode;
  latitude: number;
  longitude: number;
  accuracyMeters: number | null;
  /** Android veriyor, iOS VERMİYOR → tek başına güvence değil. */
  isMocked: boolean;
  capturedAt: string;
}

// ── Karar ──────────────────────────────────────────────────────────────────

/**
 * BEĞEN ve GEÇ AYNI UCA GİTMİYOR — kolay kaçırılan sözleşme ayrıntısı.
 *
 *  • **Beğen** → `POST /api/swipe/Like`, gövdede `source: "CampusMoment"` +
 *    `momentId`. Kartlardaki beğeninin BİREBİR AYNISI: aynı swipe satırı, aynı
 *    eşleşme, aynı `MatchNotification`. Hedef Keşif destesinden KALICI çıkıyor
 *    (istenen davranış).
 *
 *  • **Geç** → `POST /api/campus/moments/{id}/pass`. Swipe ucuna GİTMİYOR ve
 *    `SwipeAction` satırı YAZMIYOR; yalnız kampüs-yerel "karar verildi" satırı.
 *
 * ── Geçmek neden ayrı uçta ──────────────────────────────────────────────────
 * İlk sözleşmede ikisi de `/api/swipe/*`taydı. Swipe satırı
 * `UNIQUE(ActorId, TargetId, Mode)` olduğu için kampüste geçilen kişi Keşif
 * destesinden de 3 gün düşüyordu: geçmek sınırsız olduğundan kullanıcı anlara
 * hızlıca bakarak kendi Keşif havuzunu hiçbir kota harcamadan boşaltır, ertesi
 * gün boş destenin sebebini de göremezdi.
 *
 * Ayrıca `PassHandler`'ın yan etkileri bu yüzeyde ZARARLI: en görüneni
 * "bir eşleşmeyi kaçırdın" bildirimi — kullanıcıya olmayan bir kaybı duyurup
 * olmayan bir çözümü (geri al) gösterirdi, çünkü geri alınacak satır yok.
 *
 * ⚠️ KAMPÜS BEĞENİSİ GERİ ALINAMAZ. Sunucudaki `Rewind` yalnız `Discovery`
 * kaynaklı satırları seçiyor (`SwipeAction.Source`). Kampüs kartına rewind
 * affordance'ı KOYMA: buton çizilse Keşif'teki başka bir kartı geri alırdı.
 */
export interface CampusDecisionExtras {
  /** Sunucu kampüs kotasını bununla uyguluyor. */
  source: "CampusMoment";
  /** Denetim + idempotency: aynı `(actor, momentId)` kotayı iki kez yemiyor. */
  momentId: string;
}

/** Kampüse giriş/çıkış bildirimi — push kararını SUNUCU veriyor. */
export interface CampusPresenceBody {
  state: "Enter" | "Exit";
  latitude: number;
  longitude: number;
  accuracyMeters: number | null;
  isMocked: boolean;
  capturedAt: string;
}

export interface CampusPresenceResult {
  inCampus: boolean;
  /**
   * Bugün bu kampüste paylaşılan an sayısı.
   *
   * ⚠️ PUSH KARARI BUNDAN TÜRETİLEMEZ (2026-10-22'de değişti). Sunucu `0` iken
   * de bildirim atıyor: yüzey boşken ve kullanıcı bugün paylaşmamışken gerekçe
   * "ilk anı sen paylaş" oluyor — eski kapı yalnız `> 0` iken açıldığı için
   * kampüse ilk varan, yani paylaşımı başlatacak kişi hiç bildirim almıyordu.
   *
   * Sayı hâlâ bir şey söylüyor: `> 0` ise gerekçe KESİN "bakılacak an var"
   * (iki gerekçe çakışırsa o kazanıyor). `0` ise karar `postedToday`da.
   */
  momentCountToday: number;
}
