import { isLight } from "@/shared/theme/colors";

/**
 * Mapbox Static Images API — kartın konum bölümündeki haritayı üretir.
 *
 * Token PUBLIC (`pk.`) bir istemci token'ı, gizli değil: URL'in içinde
 * gidiyor ve zaten uygulama paketine gömülü. Yine de env'den geçersiz
 * kılınabilsin diye önce EXPO_PUBLIC_MAPBOX_TOKEN okunuyor.
 */
export const MAPBOX_TOKEN =
  process.env.EXPO_PUBLIC_MAPBOX_TOKEN ||
  "pk.eyJ1IjoidXlnYXJjYXBhciIsImEiOiJjbW95YmI5bWowc2VyMnJzZXE4Z3Fvb3hpIn0.yNDhhRCxmX9SeP328d6xGg";

/** Koyu tema haritası — Studio'daki özel stil (kart zeminiyle uyumlu). */
export const MAPBOX_STYLE_DARK = "uygarcapar/cmoydix5b000501sh01nchpmh";

/**
 * Açık tema haritası. Özel stilin koyu zemini açık kartın içinde delik gibi
 * duruyordu; şimdilik Mapbox'ın hazır açık stili kullanılıyor. Studio'da açık
 * bir kardeş stil yayınlanınca burayı "uygarcapar/<styleId>" ile değiştir —
 * başka hiçbir yeri değiştirmen gerekmiyor.
 */
export const MAPBOX_STYLE_LIGHT = "mapbox/light-v11";

// Style'ı her güncelleyip Publish ettiğinde bu sayıyı +1 yap: URL cache
// anahtarı olduğu için (expo-image disk cache + Mapbox CDN) sürüm artmadan
// eski görsel dönmeye devam eder.
export const MAPBOX_STYLE_VERSION = 1;

interface BuildMapboxStaticUrlArgs {
  latitude: number;
  longitude: number;
  zoom?: number;
  width?: number;
  height?: number;
  retina?: boolean;
  /** Verilmezse aktif temaya göre seçilir. */
  style?: string;
}

/**
 * RENDER SIRASINDA ÇAĞIR (colors.ts mutasyon sözleşmesi): stil seçimi
 * isLight() okuyor, modül seviyesinde sabite alınırsa tema değişince bayat
 * kalır.
 */
export function buildMapboxStaticUrl({
  latitude,
  longitude,
  zoom = 6,
  width = 600,
  height = 320,
  retina = true,
  style,
}: BuildMapboxStaticUrlArgs): string {
  const resolvedStyle =
    style ?? (isLight() ? MAPBOX_STYLE_LIGHT : MAPBOX_STYLE_DARK);
  const scale = retina ? "@2x" : "";
  return `https://api.mapbox.com/styles/v1/${resolvedStyle}/static/${longitude},${latitude},${zoom}/${width}x${height}${scale}?access_token=${MAPBOX_TOKEN}&v=${MAPBOX_STYLE_VERSION}&attribution=false&logo=false`;
}
