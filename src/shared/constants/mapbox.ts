export const MAPBOX_TOKEN =
  "pk.eyJ1IjoidXlnYXJjYXBhciIsImEiOiJjbW95YmI5bWowc2VyMnJzZXE4Z3Fvb3hpIn0.yNDhhRCxmX9SeP328d6xGg";

export const MAPBOX_STYLE = "uygarcapar/cmoydix5b000501sh01nchpmh";

// Style'ı her güncelleyip Publish ettiğinde bu sayıyı +1 yap.
export const MAPBOX_STYLE_VERSION = 1;

interface BuildMapboxStaticUrlArgs {
  latitude: number;
  longitude: number;
  zoom?: number;
  width?: number;
  height?: number;
  retina?: boolean;
}

export function buildMapboxStaticUrl({
  latitude,
  longitude,
  zoom = 14,
  width = 200,
  height = 200,
  retina = true,
}: BuildMapboxStaticUrlArgs): string {
  const scale = retina ? "@2x" : "";
  return `https://api.mapbox.com/styles/v1/${MAPBOX_STYLE}/static/${longitude},${latitude},${zoom}/${width}x${height}${scale}?access_token=${MAPBOX_TOKEN}&v=${MAPBOX_STYLE_VERSION}&attribution=false&logo=false`;
}
