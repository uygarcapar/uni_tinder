import * as Location from 'expo-location';
import api from '@/shared/services/api';
import { API_ENDPOINTS } from '@/shared/constants/api';
import { appKv } from '@/shared/store/mmkvStorage';
import { devLog } from '@/shared/utils/devLog';

/**
 * Şehir/ilçe artık kullanıcı seçimi DEĞİL — backend'in cihaz konumundan
 * türettiği sonuç. Bu servis tek işi yapar: app açılışında ve
 * background→active geçişinde bir kez koordinat gönderir.
 *
 * Tüm hata yolları SESSİZ: izin yok, GPS fix alınamadı, network hatası,
 * throttle (`applied:false`) — hiçbiri kullanıcıya gösterilmez, bir sonraki
 * tetiklemede kendiliğinden tekrar denenir.
 */

const LAST_SENT_KEY = 'location:lastSent';
// Backend throttle penceresi 10dk; üstüne pay bırakıp gereksiz isteği hiç atmıyoruz.
const MIN_INTERVAL_MS = 15 * 60 * 1000;
const MIN_MOVE_KM = 1;

export type LocationHeartbeatResult = {
  applied: boolean;
  city: number | null;
  cityDisplay: string | null;
  district: number | null;
  districtDisplay: string | null;
  cityChanged: boolean;
  minIntervalSeconds: number;
};

type LastSent = { lat: number; lon: number; ts: number };

const readLastSent = (): LastSent | null => {
  try {
    const raw = appKv.getString(LAST_SENT_KEY);
    if (!raw) return null;
    const parsed = JSON.parse(raw);
    if (typeof parsed?.lat !== 'number' || typeof parsed?.lon !== 'number' || typeof parsed?.ts !== 'number') {
      return null;
    }
    return parsed as LastSent;
  } catch {
    return null;
  }
};

const haversineKm = (lat1: number, lon1: number, lat2: number, lon2: number) => {
  const R = 6371;
  const dLat = ((lat2 - lat1) * Math.PI) / 180;
  const dLon = ((lon2 - lon1) * Math.PI) / 180;
  const a =
    Math.sin(dLat / 2) ** 2 +
    Math.cos((lat1 * Math.PI) / 180) * Math.cos((lat2 * Math.PI) / 180) * Math.sin(dLon / 2) ** 2;
  return 2 * R * Math.asin(Math.sqrt(a));
};

/** Foreground izni ver(dir)meden tek atımlık koordinat okur. */
export const readCurrentPosition = async () => {
  const position = await Location.getCurrentPositionAsync({
    accuracy: Location.Accuracy.Balanced,
  });
  return position;
};

/** Onboarding: izni ister, verilirse koordinatı döner. Reddedilirse null. */
export const requestOnboardingLocation = async (): Promise<{ latitude: number; longitude: number } | null> => {
  try {
    const { status } = await Location.requestForegroundPermissionsAsync();
    if (status !== 'granted') return null;
    const position = await readCurrentPosition();
    return { latitude: position.coords.latitude, longitude: position.coords.longitude };
  } catch (err) {
    devLog('[location] onboarding read failed:', err);
    return null;
  }
};

// Aynı foreground geçişinde iki kez tetiklenirse (cold start + AppState 'active'
// bazı cihazlarda arka arkaya gelir) ikinci çağrı in-flight isteğe binmesin.
let inFlight: Promise<LocationHeartbeatResult | null> | null = null;

export const sendLocationHeartbeat = async (): Promise<LocationHeartbeatResult | null> => {
  if (inFlight) return inFlight;
  inFlight = (async () => {
    try {
      const { status } = await Location.getForegroundPermissionsAsync();
      if (status !== 'granted') return null;

      let position: Location.LocationObject;
      try {
        position = await readCurrentPosition();
      } catch {
        return null; // GPS fix yok — bir sonraki açılışta tekrar denenir.
      }

      const { latitude, longitude, accuracy } = position.coords;

      // Client-side debounce: sunucu throttle'ının ilk savunma hattı.
      const last = readLastSent();
      if (last) {
        const elapsedMs = Date.now() - last.ts;
        const movedKm = haversineKm(last.lat, last.lon, latitude, longitude);
        if (elapsedMs < MIN_INTERVAL_MS && movedKm < MIN_MOVE_KM) return null;
      }

      const res: any = await api.post(API_ENDPOINTS.UPDATE_LOCATION, {
        latitude,
        longitude,
        accuracyMeters: accuracy ?? undefined,
        isMocked: (position as any).mocked ?? false,
      });

      appKv.set(LAST_SENT_KEY, JSON.stringify({ lat: latitude, lon: longitude, ts: Date.now() }));

      const result = (res?.result ?? null) as LocationHeartbeatResult | null;
      devLog('[location] heartbeat', result?.applied ? 'applied' : 'throttled', result?.cityDisplay ?? '—');
      return result;
    } catch (err) {
      // 400/401/404/429 dahil her şey sessiz — kullanıcıya asla hata gösterme.
      devLog('[location] heartbeat failed:', err);
      return null;
    } finally {
      inFlight = null;
    }
  })();
  return inFlight;
};

/** Logout'ta debounce damgasını temizle — sonraki kullanıcı ilk açılışta yollasın. */
export const clearLocationHeartbeatState = () => {
  try {
    appKv.remove(LAST_SENT_KEY);
  } catch {
    /* no-op */
  }
};
