/**
 * Backend zaman damgalarını GÜVENLE ayrıştırılabilir hâle getirir.
 *
 * DURUM (2026-08-22): backend artık TÜM `DateTime` alanlarını `Z` ekiyle
 * yolluyor (EF `DateTimeKind` normalizasyonu). Yani bu katman bugün pratikte
 * NO-OP — ama silinmedi: girdi ağır ve sözleşme dışı damgalar (üçüncü parti
 * payload, cache'ten okunan eski kayıt, yeni endpoint) hâlâ offset'siz
 * gelebiliyor ve maliyeti sessiz.
 *
 * Neden vardı: .NET tarafında SQL Server `datetime2` `Kind` saklamıyor, EF
 * `Unspecified` materialize ediyor, System.Text.Json da `Z` basmıyordu —
 * `"2026-08-21T12:06:16"`. Değer UTC ama string bunu söylemiyor ve JS
 * spesifikasyonu offset TAŞIMAYAN date-time formlarını YEREL SAAT sayıyor
 * (offset'siz TARİH formu — `"2026-08-21"` — ise UTC sayılır; tutarsızlık
 * dilin kendisinde). UTC+3'te sonuç 3 saatlik sessiz kayma.
 *
 * Sahadaki bedeli: `selectIsPremium`, aktif aboneliğin `expiresAt`'ini 3 saat
 * GEÇMİŞ okuyup premium'u kapatıyordu. `/status` "isPremium: true" derken
 * uygulamanın premium'a bakan her yeri "hayır" diyordu; teşhis raporunda
 * `status isPremium=true` satırının hemen altındaki `reconcile-uyuşmazlık
 * rc=true · backend=false` satırı buydu (ve her turda gereksiz `/reconcile`).
 *
 * Kural: offset yoksa UTC kabul et ve `Z` ekle. Offset varsa DOKUNMA — bu
 * koşul kalkarsa (koşulsuz `x + "Z"`, elle `+3 saat`) kayma ters yöne döner.
 */

/** `Z`, `+03:00` veya `+0300` ile biten damgalar zaten kesin. */
const HAS_OFFSET = /(?:Z|[+-]\d{2}:?\d{2})$/i;

/**
 * .NET `DateTime` saniyenin altında 7 haneye kadar basabiliyor
 * (`...:27.0950694Z`). Spesifikasyon 3 hane tanımlıyor; motorların fazlasına
 * toleransı garanti değil, 3'e kırpıyoruz (kaybedilen hassasiyetin UI'da
 * karşılığı yok).
 */
const LONG_FRACTION = /(\.\d{3})\d+/;

export function normalizeBackendIso(
  raw: string | null | undefined,
): string | null {
  if (typeof raw !== "string") return null;
  const s = raw.trim();
  if (!s) return null;
  // Saat kısmı yoksa ("2026-08-21") JS zaten UTC sayıyor — dokunma.
  if (!s.includes("T")) return s;
  if (HAS_OFFSET.test(s)) return s.replace(LONG_FRACTION, "$1");
  return `${s.replace(LONG_FRACTION, "$1")}Z`;
}

/** `normalizeBackendIso` + `Date`. Ayrıştırılamayan değerde `null`. */
export function parseBackendDate(
  raw: string | null | undefined,
): Date | null {
  const iso = normalizeBackendIso(raw);
  if (!iso) return null;
  const d = new Date(iso);
  return Number.isNaN(d.getTime()) ? null : d;
}
