/**
 * Botların UI kullanıcısına ve ortama yaptığı etkiler.
 *
 * Bunlar olmadan test edilemeyen akışlar: eşleşme, sohbet, Beğeniler sekmesi,
 * akış gönderisi kartı, kampüs anı şeridi. Hepsi "karşı tarafta biri olmalı"
 * diyor ve tek UI kullanıcısıyla kurulamaz.
 */
import { API_ENDPOINTS } from '@/shared/constants/api';
import { ApiError, getJson, post, rawPut } from './client';
import { singlePhoto } from './photos';
import type { Bot } from './createBot';
import type { RegMode } from '../flows/types';

/** Bot, UI kullanıcısını beğenir → karşılıklı olunca EŞLEŞME + sohbet. */
export async function botLikesUser(bot: Bot, targetUserId: string, mode: RegMode): Promise<void> {
  await post(API_ENDPOINTS.SWIPE_LIKE, { targetUserId, mode }, bot.token);
}

/**
 * Kampüs anı üzerinden beğeni — AYRI varyant.
 * Geçme `/api/swipe/Pass`e YAZILMIYOR (kampüste geçilen kişi Keşif destesinden
 * düşmesin diye), ama beğeni `/api/swipe/Like`ta kalıyor: `source` + `momentId`.
 */
export async function botLikesViaMoment(
  bot: Bot,
  targetUserId: string,
  momentId: string,
  mode: RegMode
): Promise<void> {
  await post(
    API_ENDPOINTS.SWIPE_LIKE,
    { targetUserId, momentId, source: 'CampusMoment', mode },
    bot.token
  );
}

export type SeedOutcome<T> = { ok: true; value: T } | { ok: false; skipped: string };

/**
 * Akış gönderisi.
 *
 * ⚠️ `UT-7301` + 403 = özellik bayrağı KAPALI. Bu bir HATA DEĞİL, "akış yok"
 * demek — çağıran taraf akış spec'lerini atlıyor. `UT-7315` de 403 ama BAŞKA
 * bir şey (profil tamamlanmamış / hesap pasif); ayrım `code` üzerinden,
 * HTTP status üzerinden ASLA.
 */
export async function seedFeedPost(
  bot: Bot,
  content: string,
  topic: string
): Promise<SeedOutcome<{ postId: string }>> {
  try {
    const res = await post<{ id?: string }>(
      API_ENDPOINTS.FEED_POSTS,
      { content, topic, isAnonymous: false },
      bot.token
    );
    const postId = res.result?.id;
    if (!postId) return { ok: false, skipped: 'feed-post-id-yok' };
    return { ok: true, value: { postId: String(postId) } };
  } catch (err) {
    if (err instanceof ApiError && err.code === 'UT-7301') {
      return { ok: false, skipped: 'akış bayrağı kapalı (UT-7301)' };
    }
    if (err instanceof ApiError && err.code === 'UT-7315') {
      return { ok: false, skipped: 'bot profili akışa uygun değil (UT-7315)' };
    }
    throw err;
  }
}

/**
 * Kampüs anı — register-and-complete'ten FARKLI olarak PRESIGNED S3 yolu.
 *
 * Sıra kritik:
 *   0. `/campus/presence` — botun SUNUCUDAKİ konumu kampüse girsin, yoksa
 *      moment POST'u makullük kontrolüne (UT-7415) takılır.
 *   1. `/campus/moments/upload-url` — imza 5 dk geçerli.
 *   2. S3'e ham PUT (bot token'ı GİTMİYOR).
 *   3. `/campus/moments` — koordinat gövdede; "kampüsteyim" kararının
 *      OTORİTESİ sunucu, istemci kapısı yalnız UX.
 */
export async function seedCampusMoment(
  bot: Bot,
  at: { lat: number; lon: number }
): Promise<SeedOutcome<{ momentId: string }>> {
  const me = await getJson<{ enabled?: boolean }>(API_ENDPOINTS.CAMPUS_ME, bot.token);
  if (me.result?.enabled === false) {
    return { ok: false, skipped: 'kampüs bu okulda kapalı (enabled:false)' };
  }

  await post(
    API_ENDPOINTS.CAMPUS_PRESENCE,
    { event: 'Enter', latitude: at.lat, longitude: at.lon },
    bot.token
  ).catch(() => {
    // Presence başarısızlığı anı engellemiyor; yalnız UT-7415 riskini artırıyor.
  });

  const upload = await post<{ uploadUrl?: string; key?: string }>(
    API_ENDPOINTS.CAMPUS_MOMENTS_UPLOAD_URL,
    { contentType: 'image/jpeg' },
    bot.token
  );
  const uploadUrl = upload.result?.uploadUrl;
  const key = upload.result?.key;
  if (!uploadUrl || !key) return { ok: false, skipped: 'upload-url eksik' };

  await rawPut(uploadUrl, singlePhoto(bot.spec.slot).buffer, 'image/jpeg');

  try {
    const moment = await post<{ id?: string }>(
      API_ENDPOINTS.CAMPUS_MOMENTS,
      { photoKey: key, latitude: at.lat, longitude: at.lon },
      bot.token
    );
    const momentId = moment.result?.id;
    if (!momentId) return { ok: false, skipped: 'moment id yok' };
    return { ok: true, value: { momentId: String(momentId) } };
  } catch (err) {
    if (err instanceof ApiError && err.code === 'UT-7410') {
      throw new Error(
        'Bot kampüs dışında (UT-7410): E2E_LAT/E2E_LON kampüs poligonunda değil.\n' +
          '  npm run e2e:setup → .artifacts/campus-fix.json içindeki noktayı kullan.'
      );
    }
    if (err instanceof ApiError && err.code === 'UT-7415') {
      return {
        ok: false,
        skipped:
          'makul olmayan hareket (UT-7415) — bot id\'leri backend\'in ' +
          'Campus__TestUserIds listesine eklenmeli',
      };
    }
    throw err;
  }
}

/**
 * Kampüs noktasını BOT TOKEN'IYLA çözer.
 *
 * `/api/campus/boundary` anonim değil (401) — bu yüzden `e2e:setup` onu
 * çözemiyor ve iş buraya düşüyor. Nokta hem `simctl location set`e hem
 * botların `Latitude/Longitude`una gidiyor: ayrışırlarsa moment POST'u
 * UT-7410 (kampüs dışı) alır.
 *
 * Merkez DAİREDEN değil POLİGONDAN türetiliyor: dairenin merkezi altı kampüste
 * poligonun DIŞINDA kalıyor (bkz. campusDevLocation).
 */
export async function resolveCampusFix(
  bot: Bot,
  domain: string
): Promise<SeedOutcome<{ lat: number; lon: number; vertices: number }>> {
  try {
    const res = await getJson<{ polygon?: Array<{ latitude: number; longitude: number }> | null }>(
      API_ENDPOINTS.CAMPUS_BOUNDARY(domain),
      bot.token
    );
    const polygon = res.result?.polygon;
    if (!polygon || polygon.length < 3) {
      return { ok: false, skipped: `${domain} için poligon yok` };
    }
    const lat = polygon.reduce((s, p) => s + p.latitude, 0) / polygon.length;
    const lon = polygon.reduce((s, p) => s + p.longitude, 0) / polygon.length;
    return { ok: true, value: { lat, lon, vertices: polygon.length } };
  } catch (err) {
    return { ok: false, skipped: `kampüs sınırı alınamadı: ${String(err)}` };
  }
}
