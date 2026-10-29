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
  const raw = moment.photoUrl;
  if (typeof raw !== "string" || !raw.trim()) return null;
  const url = raw.trim();
  if (/^(https?:|file:|data:|asset:)/i.test(url)) return url;
  if (url.startsWith("/")) return `${API_BASE_URL}${url}`;
  return null;
}
