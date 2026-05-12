// Mapbox Static Images API yapılandırması.
// Public access token (pk.*) — client-side kullanım için tasarlanmış.
// Token rotasyonu / domain kısıtı için: https://account.mapbox.com/access-tokens
export const MAPBOX_TOKEN =
  "pk.eyJ1IjoidXlnYXJjYXBhciIsImEiOiJjbW95YmI5bWowc2VyMnJzZXE4Z3Fvb3hpIn0.yNDhhRCxmX9SeP328d6xGg";

// "mapbox://styles/{username}/{styleId}" → "{username}/{styleId}"
export const MAPBOX_STYLE = "uygarcapar/cmoydix5b000501sh01nchpmh";

// Style'ı her güncelleyip Publish ettiğinde bu sayıyı +1 yap.
// RN Image cache farklı URL gördüğü için yeni style'ı taze fetch eder.
export const MAPBOX_STYLE_VERSION = 1;

// Static Images API URL üretir.
// Doc: https://docs.mapbox.com/api/maps/static-images/
// `attribution=false` & `logo=false` → resim üzerindeki "© Mapbox © OpenStreetMap"
// yazısını ve Mapbox logosunu kaldırır. NOT: Mapbox TOS'a göre attribution'u
// uygulama içinde başka bir yerde (Ayarlar/Hakkında) görünür şekilde göstermek zorunlu.
export function buildMapboxStaticUrl({
  latitude,
  longitude,
  zoom = 14,
  width = 200,
  height = 200,
  retina = true,
}) {
  const scale = retina ? "@2x" : "";
  return `https://api.mapbox.com/styles/v1/${MAPBOX_STYLE}/static/${longitude},${latitude},${zoom}/${width}x${height}${scale}?access_token=${MAPBOX_TOKEN}&v=${MAPBOX_STYLE_VERSION}&attribution=false&logo=false`;
}
