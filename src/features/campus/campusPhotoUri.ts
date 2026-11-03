import { API_BASE_URL } from "@/shared/constants/api";
import type { CampusMomentDto } from "./campusTypes";

/**
 * ══════════════════════════════════════════════════════════════════════════
 * AN FOTOĞRAFININ GÖSTERİLEBİLİR ADRESİ — TEK ÇÖZÜCÜ.
 * ══════════════════════════════════════════════════════════════════════════
 * Sözleşme `photoUrl`i MUTLAK bekliyor (backend_campus_moments_2026-10 §4) ve
 * uygulamanın başka hiçbir yerinde foto adresi istemcide kurulmuyor. Buradaki
 * iş iki YEDEK dal:
 *
 *   • göreli yol (`/uploads/…`) → API tabanına bağlanıyor. `expo-image` şemasız
 *     bir kaynakta isteği hiç kurmuyor ve kutu sessizce boş kalıyor.
 *   • REDDEDİLMİŞ an → `null`. Red kararında S3 nesnesi SİLİNİYOR ama DTO yine
 *     URL üretiyor (backend teyidi 2026-10-29): adres okunabilir, nesne ölü.
 *     İstek kurulsa her açılışta kesin bir 404 ve yeniden deneme turu olurdu.
 *
 * ⚠️ ÇIPLAK `objectKey` İÇİN TAHMİN ÜRETİLMİYOR: ne şema ne `/` varsa `null`.
 * Uydurma bir yol kurup 404'e düşmek, boş kalmaktan kötü — teşhisi de gizler.
 *
 * ⚠️ ORTAK MODÜL OLMASININ SEBEBİ BİR GERİLEMEYDİ: çözüm bir dönem yalnız şerit
 * kartındaydı, büyüyen kart `photoUrl`i ham kullanıyordu. Aynı an şeritte
 * doğru, büyük kartta boş bir dikdörtgen olarak çiziliyordu.
 */
export function campusPhotoUri(moment: CampusMomentDto): string | null {
  if (moment.moderation?.status === "Rejected") return null;
  return toDisplayableUri(moment.photoUrl);
}

/** İki çözücünün ORTAK gövdesi — yedek dalların tek kopyası. */
function toDisplayableUri(raw: string | null | undefined): string | null {
  if (typeof raw !== "string" || !raw.trim()) return null;
  const url = raw.trim();
  if (/^(https?:|file:|data:|asset:)/i.test(url)) return url;
  if (url.startsWith("/")) return `${API_BASE_URL}${url}`;
  return null;
}

/**
 * ══════════════════════════════════════════════════════════════════════════
 * ADIN SOLUNDAKİ AVATAR — PROFİLİN ANA FOTOĞRAFI.
 * ══════════════════════════════════════════════════════════════════════════
 * `mainPhotoUrl` (backend 2026-10-31) kampüs anının SAHİBİNİN profil ana
 * fotoğrafı; anın fotoğrafından bağımsız ve kuralı sunucuda
 * (`PhotoVisibility.VisibleMainUrl`): yalnız onaylı foto, ana foto onaylı
 * değilse ilk onaylıya düşüyor, hiçbiri yoksa `null`.
 *
 * ⚠️🔴 ÜÇ DURUM, İKİSİ BİRBİRİNE BENZİYOR AMA AYNI DEĞİL:
 *   • dize  → avatar o adresten,
 *   • null  → kullanıcının GÖSTERİLEBİLİR fotoğrafı yok → avatar HİÇ
 *             çizilmiyor. Anın fotoğrafına DÜŞÜLMÜYOR: sunucu o fotoğrafı
 *             bilerek saklıyor (onaysız/düşmüş), istemci arka kapıdan geri
 *             getirirse moderasyon kararını delerdi,
 *   • undefined (alanı taşımayan ESKİ yanıt — disk/bellek cache) → anın
 *             fotoğrafına düşülüyor; eski kartların avatarını kaybetmemek
 *             için, `canLike`taki `=== false` kontrolüyle aynı gerekçe.
 *
 * ⚠️ ANIN MODERASYONU AVATARI BAĞLAMIYOR: reddedilmiş bir anın sahibinin
 * profil fotoğrafı pekâlâ onaylı olabilir (kendi anım hâlâ listede ve neden
 * görünmediğini söylüyor). İki alan ayrı yaşıyor.
 */
export function campusAvatarUri(moment: CampusMomentDto): string | null {
  const main = moment.mainPhotoUrl;
  if (main === undefined) return campusPhotoUri(moment);
  return toDisplayableUri(main);
}
