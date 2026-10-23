import * as Location from "expo-location";
import { devLog } from "@/shared/utils/devLog";
// ⚠️ `expo-task-manager` STATİK IMPORT EDİLMİYOR — native modül binary'de
// yoksa import anında fırlıyor ve uygulamayı açılışta çökertiyor
// (gerekçe: campusTaskManager.ts).
import { getTaskManager } from "./campusTaskManager";
import { campusGeofenceRegion } from "./campusBoundary";
import type { CampusBoundaryDto } from "./campusTypes";

/**
 * KAMPÜS GEOFENCE'İ — kurulum/sökme.
 *
 * ── Kademe A ───────────────────────────────────────────────────────────────
 * "Her zaman" izni verildiyse işletim sistemine TEK bir daire kaydediyoruz;
 * kullanıcı kampüse girdiğinde uygulama kapalı olsa bile uyanıyor ve
 * `campusGeofenceTask` çalışıyor.
 *
 * İzin yoksa hiçbir şey kurulmuyor ve özellik ÖLMÜYOR: Kademe B (uygulama öne
 * geldiğinde / harita açıldığında tek atımlık okuma) her hâlükârda çalışıyor.
 * Buradaki her `return` sessiz, çünkü bu yolun başarısızlığı kullanıcıya
 * gösterilecek bir şey değil.
 *
 * ── Neden daire, poligon değil ─────────────────────────────────────────────
 * İşletim sistemi geofence'i YALNIZ daire kabul ediyor (iOS `CLCircularRegion`,
 * Android `setCircularRegion`). Daire bizi UYANDIRIYOR; "gerçekten kampüste
 * miyim" kararını poligon veriyor (task'ın içinde) ve son sözü sunucu
 * söylüyor.
 *
 * ⚠️ iOS AYNI ANDA EN FAZLA 20 BÖLGE izliyor. Bu uygulama TAM OLARAK 1
 * kullanıyor (kullanıcının kendi kampüsü) ve `startGeofencingAsync` her
 * çağrıda listeyi DEĞİŞTİRİYOR, eklemiyor. "207 üniversiteyi kaydedelim"
 * fikri o sınıra çarpar — ve zaten yanlış olurdu: kullanıcı yalnız kendi
 * kampüsünde paylaşabiliyor.
 */

export const CAMPUS_GEOFENCE_TASK = "campus-geofence";

/** Arka plan izni var mı — sessiz. */
async function hasAlwaysPermission(): Promise<boolean> {
  try {
    const perm = await Location.getBackgroundPermissionsAsync();
    return perm.status === "granted";
  } catch {
    return false;
  }
}

/**
 * Bölgeyi sınırla eşitle. İzin yoksa, sınır yoksa ya da kampüs kapalıysa
 * kayıtlı bölgeyi SÖKÜYOR — boşuna uyanma olmasın.
 *
 * İdempotent: `hasStartedGeofencingAsync` ile aynı durumda tekrar
 * çağrılabilir.
 */
export async function syncCampusGeofence(
  boundary: CampusBoundaryDto | null | undefined,
): Promise<void> {
  // ⚠️ Native modül yoksa (build bekliyor) ya da task tanımlı değilse
  // `startGeofencingAsync` patlıyor. Tanım `campusGeofenceTask` modülünün yan
  // etkisi; burada yalnız doğruluyoruz.
  const taskManager = getTaskManager();
  if (!taskManager?.isTaskDefined(CAMPUS_GEOFENCE_TASK)) {
    devLog("[campus] geofence task tanımlı değil — kurulum atlandı");
    return;
  }

  const region = campusGeofenceRegion(boundary);
  const allowed = region ? await hasAlwaysPermission() : false;

  try {
    const running = await Location.hasStartedGeofencingAsync(
      CAMPUS_GEOFENCE_TASK,
    );

    if (!allowed || !region) {
      if (running) await Location.stopGeofencingAsync(CAMPUS_GEOFENCE_TASK);
      return;
    }

    // Liste DEĞİŞTİRİLİYOR (eklenmiyor): yeniden start etmek önceki bölgeyi
    // düşürüyor, yani kampüs değişince eski kampüs izlenmeye devam etmiyor.
    await Location.startGeofencingAsync(CAMPUS_GEOFENCE_TASK, [
      {
        identifier: `campus:${boundary?.domain ?? "self"}`,
        latitude: region.latitude,
        longitude: region.longitude,
        radius: region.radius,
        notifyOnEnter: true,
        // Çıkışı da izliyoruz: sunucu "artık kampüste değil" bilgisini
        // bilmeden günde bir kez kuralını doğru uygulayamaz.
        notifyOnExit: true,
      },
    ]);
  } catch (err) {
    devLog("[campus] geofence sync failed:", err);
  }
}

/** Logout / kampüs kaybı — bölgeyi bırak. */
export async function stopCampusGeofence(): Promise<void> {
  try {
    const taskManager = getTaskManager();
    if (!taskManager?.isTaskDefined(CAMPUS_GEOFENCE_TASK)) return;
    const running = await Location.hasStartedGeofencingAsync(
      CAMPUS_GEOFENCE_TASK,
    );
    if (running) await Location.stopGeofencingAsync(CAMPUS_GEOFENCE_TASK);
  } catch {
    /* no-op */
  }
}
