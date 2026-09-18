import { AppState, Platform } from 'react-native';
import { appPrefs } from '@/shared/utils/appPrefs';
import { API_BASE_URL } from '@/shared/constants/api';

/**
 * Oturum yaşam döngüsünün TEK teşhis defteri — login'den atılmaya kadar.
 *
 * Neden ayrı bir modül: "durduk yere atıldım" şikâyetinin cevabı oturumu
 * bitiren BEŞ daldan hangisinin ateşlendiğine bağlı (REST 401'in üç şekli,
 * "refresh token diskte yok", hub ForceLogout, yaptırım 403, degrade açılış) ve
 * üçü kullanıcıya HİÇBİR iz bırakmıyor. Sebep şimdiye kadar yalnız
 * `console.warn`'daydı; cold start'ta — yani tam olarak semptomun görüldüğü
 * anda — o satıra ulaşmanın yolu yok (Metro bağlı değil, TestFlight'ta kablo
 * gerekiyor). Defter olmadan atılan her düzeltme kör atış, üstelik işe yarayıp
 * yaramadığı da ölçülemez.
 *
 * Üç şey yapar:
 *  1. Her adımı tek satır konsola yazar (release'de de — aşağıya bak).
 *  2. Aynı satırları MMKV'de dönen bir tampona yazar → COLD START'I ATLATIR.
 *  3. `buildAuthReport()` ile hepsini paylaşılabilir tek metne çevirir
 *     (Ayarlar → ortam satırına uzun bas → "Oturum raporu").
 *
 * DEPO SEÇİMİ KASITLI: `app-prefs` DÜZ METİN MMKV. Şifreli depolara (auth-tokens /
 * redux-app) yazsaydık, hipotezlerden biri tam da "Keychain okunamadı, depo
 * açılamadı" olduğu için teşhis kaydı tam ihtiyaç duyulan açılışta kaybolurdu.
 * Burada sır YOK: token, e-posta, kullanıcı adı yazılmaz — yalnız kod, gerekçe,
 * status ve zaman.
 *
 * Konsol seviyesi: dev'de `console.log` (LogBox sarı kutu seli olmasın),
 * release'de `console.warn` — purchaseDiagnostics ve api.ts'teki `[net]`
 * satırlarıyla aynı gerekçe.
 *
 * İMPORT KISITI: bu modül YALNIZ appPrefs + sabitleri import eder. api.ts,
 * tokenStorage ve mmkvStorage buraya yazıyor; ters yönde bir import döngü
 * yaratır (tokenStorage → authDiagnostics → tokenStorage).
 */

const EVENTS_KEY = 'authDiagEvents';
const FACTS_KEY = 'authDiagFacts';
/** Yarım kalmış refresh işareti — bkz. markRefreshStart. */
const INFLIGHT_KEY = 'authRefreshInflight';

/**
 * Tampon boyu. Bir açılış ~3 satır yazıyor (boot + refresh + sync); 80 satır
 * normal kullanımda haftalarca geriye bakmaya yetiyor. Tavan şart: appPrefs
 * senkron yazılıyor, sınırsız JSON her yazımda büyüyen bir stringify demek.
 */
const MAX_EVENTS = 80;
const MAX_DETAIL_CHARS = 300;

export interface AuthEvent {
  at: number;
  step: string;
  detail: string;
}

export type AuthFacts = Record<string, string | number | boolean | null>;

// ─── Depolama ────────────────────────────────────────────────────────────────

let cachedEvents: AuthEvent[] | null = null;

function loadEvents(): AuthEvent[] {
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

function persistEvents(list: AuthEvent[]) {
  cachedEvents = list;
  try {
    appPrefs.set(EVENTS_KEY, JSON.stringify(list));
  } catch {
    // MMKV yazamazsa (disk dolu) yalnız kalıcılık kaybolur; konsol satırı yazıldı.
  }
}

function loadFacts(): AuthFacts {
  try {
    const raw = appPrefs.getString(FACTS_KEY);
    const parsed = raw ? JSON.parse(raw) : {};
    return parsed && typeof parsed === 'object' ? parsed : {};
  } catch {
    return {};
  }
}

function saveFacts(partial: AuthFacts) {
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

// ─── Biçimlendirme ───────────────────────────────────────────────────────────

const truncate = (s: string) =>
  s.length > MAX_DETAIL_CHARS ? `${s.slice(0, MAX_DETAIL_CHARS)}…` : s;

function stringifyValue(v: unknown): string {
  if (v === null) return 'null';
  if (v === undefined) return 'yok';
  if (typeof v === 'string') return v;
  if (typeof v === 'number' || typeof v === 'boolean') return String(v);
  try {
    return JSON.stringify(v) ?? String(v);
  } catch {
    return '[serialize edilemedi]';
  }
}

/**
 * `undefined` alanlar düşer, `null` KORUNUR: "alan hiç gelmedi" ile "alan null
 * geldi" ayrımı bu akışta teşhisin yarısı (bkz. /refresh-token 401'inin üç
 * şekli — reason'ın null oluşu başlı başına bilgi).
 */
function formatDetail(detail: unknown): string {
  if (detail === undefined || detail === null) return '';
  if (typeof detail === 'string') return truncate(detail);
  if (detail instanceof Error) return truncate(`${detail.name}: ${detail.message}`);
  if (typeof detail !== 'object') return truncate(String(detail));
  const parts: string[] = [];
  for (const [k, v] of Object.entries(detail as Record<string, unknown>)) {
    if (v === undefined) continue;
    parts.push(`${k}=${stringifyValue(v)}`);
  }
  return truncate(parts.join(' · '));
}

const pad = (n: number) => String(n).padStart(2, '0');

/**
 * Gün + saat. Saat tek başına YETMEZ: bu defterin cevapladığı soru "iki gün
 * sonra açtım, atılmıştım" — olayların hangi güne düştüğü ayırt edici.
 */
function stampOf(at: number): string {
  const d = new Date(at);
  return `${pad(d.getMonth() + 1)}-${pad(d.getDate())} ${pad(d.getHours())}:${pad(
    d.getMinutes(),
  )}:${pad(d.getSeconds())}`;
}

/** "3dk", "2s 10dk", "4g" — rapordaki her süre alanı bunu kullanıyor. */
export function agoText(at: number | null | undefined): string {
  if (!at) return 'hiç';
  const ms = Date.now() - at;
  if (ms < 60_000) return `${Math.round(ms / 1000)}sn önce`;
  if (ms < 3_600_000) return `${Math.round(ms / 60_000)}dk önce`;
  if (ms < 86_400_000) {
    const h = Math.floor(ms / 3_600_000);
    return `${h}s ${Math.round((ms - h * 3_600_000) / 60_000)}dk önce`;
  }
  return `${Math.floor(ms / 86_400_000)}g önce`;
}

// ─── Yazma API'si ────────────────────────────────────────────────────────────

/** Throttle'lı adımların son yazım zamanı (step bazında). */
const lastWriteAt = new Map<string, number>();

/**
 * Defterdeki bir adım. `step` kısa ve SABİT tutulmalı (grep'lenebilsin):
 * `boot`, `refresh-ok`, `session-lost`, `store-degraded` gibi.
 *
 * `throttleMs`: tekrarlayabilen adımlar için (çevrimdışıyken düşen refresh).
 * Pencere içindeki tekrar DEFTERE YAZILMAZ — 80 satırlık tampon aynı satırla
 * dolup asıl kaydı dışarı itmesin; konsol satırı dev'de yine de çıkar.
 */
export function authDiag(
  step: string,
  detail?: unknown,
  opts?: { throttleMs?: number },
): void {
  const line = formatDetail(detail);
  const message = `[auth] ${step}${line ? ` — ${line}` : ''}`;
  // eslint-disable-next-line no-console
  if (__DEV__) console.log(message);

  if (opts?.throttleMs) {
    const prev = lastWriteAt.get(step) ?? 0;
    if (Date.now() - prev < opts.throttleMs) return;
    lastWriteAt.set(step, Date.now());
  }

  // eslint-disable-next-line no-console
  if (!__DEV__) console.warn(message);

  const next = [...loadEvents(), { at: Date.now(), step, detail: line }];
  persistEvents(next.slice(-MAX_EVENTS));
}

/**
 * Rotasyon başarılı. Ayrı bir fonksiyon çünkü zaman damgası raporun BAŞLIĞINDA
 * lazım: "son başarılı refresh 2 gün önce, ardından token_reuse" satırı 1
 * numaralı hipotezi (cevabı kaybolan refresh) tek başına ispatlıyor.
 */
export function markRefreshOk(attempts: number): void {
  saveFacts({ sonRefreshOkAt: Date.now() });
  clearRefreshInflight();
  authDiag('refresh-ok', { deneme: attempts });
}

export function markLoginOk(): void {
  saveFacts({ sonLoginOkAt: Date.now() });
  authDiag('login-ok');
}

/**
 * Oturum bitti — TERMİNAL. `trigger` hangi dal olduğunu söyler:
 *   rest-401      → sunucu refresh token'ı reddetti (gövde alanları da yazılır)
 *   token-yok     → refresh token diskte bulunamadı (istemci tarafı kayıp)
 *   forcelogout   → hub sinyali
 *   yaptırım      → 403 ban/askı/silme
 *   kullanıcı     → kullanıcı kendi çıktı (defterdeki gürültüyü ayıklamak şart:
 *                   "atıldım" şikâyetiyle "çıkış yaptım" aynı sona varıyor)
 */
export function markSessionLost(
  trigger: 'rest-401' | 'token-yok' | 'forcelogout' | 'yaptırım' | 'kullanıcı',
  detail?: Record<string, unknown>,
): void {
  const inflight = readRefreshInflight();
  // Rapor başlığındaki "son kayıp" GERÇEK gerekçeyi göstermeli. `logout()`
  // thunk'ı `onAuthLost` yolundan da çağrılıyor: api.ts sebebi yazdıktan
  // saniyeler sonra buraya 'kullanıcı' etiketiyle ikinci bir kayıt düşüyor ve
  // başlığı eziyordu. Taze bir kayıt varken kullanıcı etiketi başlığa
  // YAZILMAZ — olay satırı yine de defterde durur.
  const facts = loadFacts();
  const recentLoss =
    typeof facts.sonKayıpAt === 'number' && Date.now() - facts.sonKayıpAt < 30_000;
  if (!(trigger === 'kullanıcı' && recentLoss)) {
    saveFacts({
      sonKayıpAt: Date.now(),
      sonKayıpTrigger: trigger,
      sonKayıpReason: stringifyValue((detail as any)?.reason ?? null),
    });
  }
  authDiag('session-lost', {
    trigger,
    ...detail,
    // Kayıptan ÖNCE yarım kalmış bir refresh var mıydı? Varsa vaka neredeyse
    // kesin olarak rotasyon yarışı: sunucu eski token'ı iptal etti, cevap
    // istemciye hiç ulaşmadı, grace penceresi (60 sn) çoktan kapandı.
    yarımRefresh: inflight ? agoText(inflight) : 'yok',
    appState: AppState.currentState,
  });
  clearRefreshInflight();
}

// ─── Yarım kalmış refresh işareti ────────────────────────────────────────────

/**
 * Refresh POST'u UÇARKEN diske düşen işaret.
 *
 * Neden: rotasyon tek kullanımlık. iOS isteği uçarken uygulamayı askıya alırsa
 * sunucu eski token'ı iptal edip yeni çifti üretiyor ama cevap istemciye hiç
 * ulaşmıyor — elimizde ölü bir token kalıyor ve bunu 60 sn'lik grace penceresi
 * kapanmadan fark etmemiz gerekiyor. İşaret iki işe yarıyor:
 *   1. Uyanışta KOŞULSUZ refresh tetikler (bkz. AppNavigator AppState kapısı) —
 *      pencere içinde uyandıysak oturum kurtulur.
 *   2. Kayıt düşerse raporda "kayıptan önce yarım refresh vardı" satırı çıkar.
 *
 * MMKV senkron yazdığı için app o an öldürülse bile işaret diskte.
 */
export function markRefreshStart(): void {
  try {
    appPrefs.set(INFLIGHT_KEY, Date.now());
  } catch {
    // yut — yalnız teşhis/kurtarma ipucu kaybolur, akış etkilenmez.
  }
}

export function clearRefreshInflight(): void {
  try {
    appPrefs.remove(INFLIGHT_KEY);
  } catch {
    // yut
  }
}

/** Yarım kalmış refresh'in zaman damgası (yoksa null). */
export function readRefreshInflight(): number | null {
  try {
    const v = appPrefs.getNumber(INFLIGHT_KEY);
    return typeof v === 'number' && v > 0 ? v : null;
  } catch {
    return null;
  }
}

/**
 * Önceki turda refresh yarıda mı kaldı? Uyanış kapısı bunu okuyup token taze
 * görünse bile refresh deniyor.
 *
 * ÜST SINIR: 24 saatten eski bir işaret artık kurtarma değil gürültü — grace
 * penceresi çoktan kapandı, koşulsuz refresh yalnız fazladan bir 401 üretir.
 */
export function hasInterruptedRefresh(maxAgeMs = 86_400_000): boolean {
  const at = readRefreshInflight();
  return at != null && Date.now() - at < maxAgeMs;
}

// ─── Açılış kaydı ────────────────────────────────────────────────────────────

let bootLogged = false;

/**
 * Cold start'ta TEK satır: rehydrate sonrası oturum var mıydı, depolar normal
 * mi açıldı, yarım refresh var mı. Raporun ilk okunduğu yer burası — "login
 * ekranıyla açıldı" vakasında tokenDepo/appDepo alanları degrade açılışı
 * gerçek bir iptalden ayırıyor.
 */
export function logBoot(facts: AuthFacts): void {
  if (bootLogged) return;
  bootLogged = true;
  const inflight = readRefreshInflight();
  authDiag('boot', {
    ...facts,
    yarımRefresh: inflight ? agoText(inflight) : 'yok',
  });
}

// ─── Rapor ───────────────────────────────────────────────────────────────────

export function readAuthEvents(): AuthEvent[] {
  return [...loadEvents()];
}

export function clearAuthDiagnostics(): void {
  cachedEvents = [];
  try {
    appPrefs.remove(EVENTS_KEY);
    appPrefs.remove(FACTS_KEY);
  } catch {
    // yut
  }
}

/**
 * Paylaşılabilir tek metin. `extra` çağıranın o an okuduğu canlı durum (redux
 * oturum bayrağı, token son kullanma) — bu modül o dosyaları import etmiyor.
 */
export function buildAuthReport(extra?: AuthFacts): string {
  const facts = loadFacts();
  const events = loadEvents();
  const inflight = readRefreshInflight();

  const header = [
    '=== LIT oturum teşhis raporu ===',
    `oluşturuldu : ${new Date().toISOString()}`,
    `platform    : ${Platform.OS} ${String(Platform.Version)} · ${__DEV__ ? 'DEV BUILD' : 'RELEASE/TestFlight'}`,
    `api         : ${API_BASE_URL}`,
    `son login   : ${agoText(facts.sonLoginOkAt as number)}`,
    `son refresh : ${agoText(facts.sonRefreshOkAt as number)}`,
    `son kayıp   : ${
      facts.sonKayıpAt
        ? `${agoText(facts.sonKayıpAt as number)} · ${stringifyValue(facts.sonKayıpTrigger)} · ${stringifyValue(facts.sonKayıpReason)}`
        : 'hiç'
    }`,
    `yarım refresh: ${inflight ? agoText(inflight) : 'yok'}`,
  ];

  const extraLines = Object.entries(extra ?? {}).map(
    ([k, v]) => `${k}: ${stringifyValue(v)}`,
  );

  const eventLines = events.length
    ? events.map(
        (e) => `${stampOf(e.at)}  ${e.step.padEnd(18)}${e.detail ? ` ${e.detail}` : ''}`,
      )
    : ['(kayıt yok)'];

  return [
    ...header,
    ...extraLines,
    '',
    `--- olaylar (${events.length}, en yeni altta) ---`,
    ...eventLines,
  ].join('\n');
}
