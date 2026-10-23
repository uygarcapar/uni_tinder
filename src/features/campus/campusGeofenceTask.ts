import { LocationGeofencingEventType } from "expo-location";
import { API_BASE_URL, API_ENDPOINTS } from "@/shared/constants/api";
import { getAccessToken, getRefreshToken } from "@/shared/utils/tokenStorage";
import { devLog } from "@/shared/utils/devLog";
import { CAMPUS_GEOFENCE_TASK } from "./campusGeofence";
import { getTaskManager } from "./campusTaskManager";
import { isInsideCampus, readCachedBoundary } from "./campusBoundary";
import { readCampusFix } from "./campusPresence";

/**
 * KAMPÜS GEOFENCE GÖREVİ — uygulama KAPALIYKEN de çalışan kod.
 *
 * 🔴 BU DOSYA ÇIPLAK OLMAK ZORUNDA. Görev tetiklendiğinde işletim sistemi
 * YENİ bir JS context açıyor: React ağacı yok, Redux store yok, React Query
 * yok, i18n yok, boot zinciri hiç koşmadı. Buraya o modüllerden birini import
 * etmek hem cold-boot maliyeti hem de "undefined" hatası demek.
 *
 * 🔴 `api.ts` DE KULLANILMIYOR ve bu en kolay kaçırılan şey: o istemci
 * Authorization başlığını MODÜL SEVİYESİNDEKİ `getCurrentAccessToken()`tan
 * okuyor ve taze context'te o değişken BOŞ. İstek 401 döner, sessizce hiçbir
 * şey olmaz — yani en kötü hata türü: başarısızlığın izi bile kalmaz.
 * Token burada DEPODAN okunuyor ve istek düz `fetch` ile atılıyor.
 *
 * ── Görev ne yapıyor ───────────────────────────────────────────────────────
 * 1. Olayı oku (Enter/Exit).
 * 2. Girişse: diskteki poligonla GERÇEKTEN içeride miyiz diye bak. Daire
 *    kampüsün yanındaki mahalleyi de kapsıyor; dairenin tek işi uyandırmak.
 * 3. Sunucuya bildir. Push kararını SUNUCU veriyor (kaç an var, günde kaç kez
 *    bildirim, kullanıcının tercihi) — cihazda yerel bildirim kurmuyoruz.
 *
 * ⚠️ `defineTask` MODÜL YAN ETKİSİ ve `index.js`ten import ediliyor:
 * `App.tsx` yeterli DEĞİL, çünkü headless başlatmada React ağacı hiç mount
 * edilmiyor ve o dosya çalışmıyor.
 */

/** Oturum yoksa sessizce çık — kullanıcı çıkış yapmış olabilir. */
async function resolveAccessToken(): Promise<string | null> {
  try {
    const stored = await getAccessToken();
    if (stored) return stored;

    // Erişim token'ı yoksa refresh ile bir tane al. `api.ts`in refresh
    // akışı KULLANILMIYOR: o, interceptor/logout/diagnostik zincirinin
    // tamamını bu çıplak context'e taşırdı.
    const refreshToken = await getRefreshToken();
    if (!refreshToken) return null;

    const res = await fetch(`${API_BASE_URL}${API_ENDPOINTS.REFRESH_TOKEN}`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ refreshToken }),
    });
    if (!res.ok) return null;
    const json: any = await res.json();
    return json?.result?.accessToken ?? json?.result?.token ?? null;
  } catch {
    return null;
  }
}

async function reportPresence(
  state: "Enter" | "Exit",
  fix: {
    latitude: number;
    longitude: number;
    accuracyMeters: number | null;
    isMocked: boolean;
    capturedAt: string;
  },
): Promise<void> {
  const token = await resolveAccessToken();
  if (!token) {
    devLog("[campus] geofence: token yok, bildirim atlandı");
    return;
  }
  try {
    await fetch(`${API_BASE_URL}${API_ENDPOINTS.CAMPUS_PRESENCE}`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${token}`,
      },
      body: JSON.stringify({ state, ...fix }),
    });
  } catch (err) {
    devLog("[campus] geofence: presence failed", err);
  }
}

/**
 * 🔴 BU DOSYA `index.js`TEN, UYGULAMANIN İLK SATIRLARINDA ÇALIŞIYOR —
 * buradan fırlayan bir hata `registerRootComponent`e hiç ulaşılmaması demek.
 *
 * `expo-task-manager` STATİK IMPORT EDİLMİYOR (bkz. campusTaskManager.ts):
 * native modül binary'de yoksa import ANINDA fırlıyor, bundle değerlendirmesi
 * patlıyor, RN yeniden yüklüyor ve o reload yarışı reanimated'ın
 * `installTurboModule`'ünü surface presenter hazır değilken yakalayıp
 * SIGABRT üretiyor. Belirti "reanimated çöküyor" gibi görünüyor; suçlu bu
 * dosyanın import satırıydı.
 *
 * Tanım ayrıca try/catch içinde: modül var ama başka bir sebeple patlarsa da
 * uygulama ayakta kalsın.
 */
function defineCampusGeofenceTask(): void {
  const taskManager = getTaskManager();
  // Native modül yok → tanım da yok. Kademe B çalışmaya devam ediyor.
  if (!taskManager) return;

  taskManager.defineTask(CAMPUS_GEOFENCE_TASK, async ({ data, error }: any) => {
    if (error) {
      devLog("[campus] geofence task error:", error);
      return;
    }

    const eventType = data?.eventType;
    const region = data?.region;
    const identifier: string = region?.identifier ?? "";
    // `campus:<domain>` — sınırı diskten bu domain'le çözüyoruz.
    const domain = identifier.startsWith("campus:")
      ? identifier.slice("campus:".length)
      : null;

    if (eventType === LocationGeofencingEventType.Exit) {
      const exitFix = await readCampusFix({ force: true });
      if (exitFix) await reportPresence("Exit", exitFix);
      return;
    }

    if (eventType !== LocationGeofencingEventType.Enter) return;

    const fix = await readCampusFix({ force: true });
    if (!fix) return;

    /**
     * DAİRE UYANDIRDI, KARARI POLİGON VERİYOR.
     *
     * Boğaziçi'ni çevreleyen daire Bebek'in yarısını içine alıyor; burada
     * poligonla doğrulamasaydık kampüsün yanından geçen herkese "kampüse
     * vardın" bildirimi giderdi.
     *
     * Poligon diskte yoksa bildirim ATILMIYOR: sunucu zaten reddederdi ve
     * doğrulanmamış bir "kampüsteyim" iddiası göndermenin anlamı yok.
     */
    const boundary = domain ? readCachedBoundary(domain) : null;
    if (!isInsideCampus(fix.latitude, fix.longitude, boundary)) return;

    await reportPresence("Enter", fix);
  });
}

try {
  defineCampusGeofenceTask();
} catch (err) {
  // Native modül yok (build alınmamış) → geofence yok, uygulama ayakta.
  devLog("[campus] geofence task tanımlanamadı:", err);
}

/** Import edilmesi yeterli; bu export yalnız "yan etki bilerek" demek için. */
export const CAMPUS_GEOFENCE_TASK_REGISTERED = true;
