import { Platform } from "react-native";
import { appPrefs } from "@/shared/utils/appPrefs";
import { API_BASE_URL } from "@/shared/constants/api";

/**
 * Satın alma zincirinin TEK teşhis kaydı — RC SDK'dan backend cevabına kadar.
 *
 * Neden ayrı bir modül: "premium aldım, reload'da gitti" ve "superlike hiç
 * gelmiyor" şikâyetlerinin cevabı zincirin HANGİ halkasında koptuğuna bağlı
 * (RC configure → appUserID eşleşmesi → StoreKit satın alma → webhook →
 * backend `/sync` / `/Redeem`). Bu halkalar beş ayrı dosyaya dağılmış durumda
 * ve loglarının çoğu `devLog` (yalnız __DEV__) idi: TestFlight'ta hiçbir iz
 * kalmıyordu, tam da sorunun tekrar üretildiği yerde.
 *
 * Üç şey yapar:
 *  1. Her adımı tek satır halinde konsola yazar (release'de de — aşağıya bak).
 *  2. Aynı satırları MMKV'de dönen bir tampona yazar → RELOAD'U ATLATIR.
 *     "Reload edene kadar premium görünüyor" semptomunda kanıt tam olarak
 *     reload'dan önceki satırlarda duruyor.
 *  3. `buildIapReport()` ile hepsini paylaşılabilir tek metne çevirir
 *     (Ayarlar → sürüm satırına uzun bas). Kablo/Xcode olmadan TestFlight'tan
 *     rapor çıkarmanın tek yolu.
 *
 * Konsol seviyesi: dev'de `console.log` (LogBox sarı kutu seli olmasın), release'de
 * `console.warn` — api.ts'teki `[net]` satırlarıyla aynı gerekçe: Console.app /
 * Xcode device log'unda görünmesi gereken tek şey bu.
 */

const EVENTS_KEY = "iapDiagEvents";
const FACTS_KEY = "iapDiagFacts";

/** Tampon boyu — bir satın alma turu ~15 satır, birkaç tur geriye bakabilelim. */
const MAX_EVENTS = 200;
/** Tek satırın tavanı; ham gövdeler raporu okunmaz hale getirmesin. */
const MAX_DETAIL_CHARS = 400;

export interface IapEvent {
  at: number;
  step: string;
  detail: string;
}

/** Kimlik/ortam bilgileri — append edilmez, ÜZERİNE yazılır (son bilinen değer). */
export type IapFacts = Record<string, string | number | boolean | null>;

// ─── Depolama ────────────────────────────────────────────────────────────────

let cachedEvents: IapEvent[] | null = null;

function loadEvents(): IapEvent[] {
  if (cachedEvents) return cachedEvents;
  try {
    const raw = appPrefs.getString(EVENTS_KEY);
    const parsed = raw ? JSON.parse(raw) : [];
    cachedEvents = Array.isArray(parsed) ? parsed : [];
  } catch {
    cachedEvents = [];
  }
  return cachedEvents;
}

function persistEvents(list: IapEvent[]) {
  cachedEvents = list;
  try {
    appPrefs.set(EVENTS_KEY, JSON.stringify(list));
  } catch {
    // MMKV yazamazsa (disk dolu) yalnız kalıcılık kaybolur; konsol satırı yazıldı.
  }
}

function loadFacts(): IapFacts {
  try {
    const raw = appPrefs.getString(FACTS_KEY);
    const parsed = raw ? JSON.parse(raw) : {};
    return parsed && typeof parsed === "object" ? parsed : {};
  } catch {
    return {};
  }
}

// ─── Biçimlendirme ───────────────────────────────────────────────────────────

const truncate = (s: string) =>
  s.length > MAX_DETAIL_CHARS ? `${s.slice(0, MAX_DETAIL_CHARS)}…` : s;

function stringifyValue(v: unknown): string {
  if (v === null) return "null";
  if (v === undefined) return "yok";
  if (typeof v === "string") return v;
  if (typeof v === "number" || typeof v === "boolean") return String(v);
  try {
    return JSON.stringify(v) ?? String(v);
  } catch {
    return "[serialize edilemedi]";
  }
}

/**
 * Detay ya düz metin ya da `{ anahtar: değer }` — ikincisi `k=v · k=v` olarak
 * yazılır. `undefined` alanlar düşer, `null` KORUNUR: "alan hiç gelmedi" ile
 * "alan null geldi" ayrımı bu akışta teşhisin yarısı.
 */
function formatDetail(detail: unknown): string {
  if (detail === undefined || detail === null) return "";
  if (typeof detail === "string") return truncate(detail);
  if (detail instanceof Error) {
    return truncate(`${detail.name}: ${detail.message}`);
  }
  if (typeof detail !== "object") return truncate(String(detail));
  const parts: string[] = [];
  for (const [k, v] of Object.entries(detail as Record<string, unknown>)) {
    if (v === undefined) continue;
    parts.push(`${k}=${stringifyValue(v)}`);
  }
  return truncate(parts.join(" · "));
}

const pad = (n: number) => String(n).padStart(2, "0");

function clockOf(at: number): string {
  const d = new Date(at);
  return `${pad(d.getHours())}:${pad(d.getMinutes())}:${pad(d.getSeconds())}`;
}

// ─── Yazma API'si ────────────────────────────────────────────────────────────

/**
 * Zincirdeki bir adımı kaydet. `step` kısa ve sabit tutulmalı (grep'lenebilsin):
 * `rc-configure`, `sync-attempt`, `redeem-http` gibi.
 */
export function iapLog(step: string, detail?: unknown): void {
  const line = formatDetail(detail);
  const message = `[iap] ${step}${line ? ` — ${line}` : ""}`;
  // eslint-disable-next-line no-console
  if (__DEV__) console.log(message);
  // eslint-disable-next-line no-console
  else console.warn(message);

  const next = [...loadEvents(), { at: Date.now(), step, detail: line }];
  persistEvents(next.slice(-MAX_EVENTS));
}

/**
 * Kimlik/ortam bilgisi yaz (üzerine yazar). Olay akışında değil raporun
 * başlığında görünür — "bu cihazda RC hangi kimlikle configure edildi, backend
 * userId neydi, satın alma sandbox mıydı" soruları tek bakışta cevaplansın.
 */
export function setIapFacts(partial: IapFacts): void {
  const merged = { ...loadFacts() };
  for (const [k, v] of Object.entries(partial)) {
    if (v === undefined) continue;
    merged[k] = v;
  }
  try {
    appPrefs.set(FACTS_KEY, JSON.stringify(merged));
  } catch {
    // yut — rapor başlığı eksik kalır, olay akışı yerinde durur.
  }
}

export function readIapEvents(): IapEvent[] {
  return [...loadEvents()];
}

export function readIapFacts(): IapFacts {
  return loadFacts();
}

export function clearIapDiagnostics(): void {
  cachedEvents = [];
  try {
    appPrefs.remove(EVENTS_KEY);
    appPrefs.remove(FACTS_KEY);
  } catch {
    // yut
  }
}

// ─── Rapor ───────────────────────────────────────────────────────────────────

/**
 * Paylaşılabilir tek metin. `extra` çağıranın o an okuduğu canlı durum
 * (bekleyen redeem kuyruğu, redux premium bayrağı) — bu modül o dosyaları
 * import etmiyor, aksi halde superlikeRedeem ↔ diagnostics döngüsü oluşurdu.
 */
export function buildIapReport(extra?: IapFacts): string {
  const facts = { ...loadFacts(), ...(extra ?? {}) };
  const events = loadEvents();

  const header = [
    "=== LIT satın alma teşhis raporu ===",
    `oluşturuldu : ${new Date().toISOString()}`,
    `platform    : ${Platform.OS} ${String(Platform.Version)} · ${__DEV__ ? "DEV BUILD" : "RELEASE/TestFlight"}`,
    `api         : ${API_BASE_URL}`,
  ];

  // Hizalama/kırpma YOK: alan adları raporu okuyanın (ve backend'e yapıştıran
  // kişinin) grep'leyeceği anahtarlar, birebir yazılmalı.
  const factLines = Object.entries(facts).map(
    ([k, v]) => `${k}: ${stringifyValue(v)}`,
  );

  const eventLines = events.length
    ? events.map(
        (e) => `${clockOf(e.at)}  ${e.step.padEnd(22)}${e.detail ? ` ${e.detail}` : ""}`,
      )
    : ["(kayıt yok)"];

  return [
    ...header,
    ...factLines,
    "",
    `--- olaylar (${events.length}, en yeni altta) ---`,
    ...eventLines,
  ].join("\n");
}
