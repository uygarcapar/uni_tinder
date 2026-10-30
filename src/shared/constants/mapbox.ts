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

/** Açık tema haritası — Studio'daki açık kardeş stil. */
export const MAPBOX_STYLE_LIGHT = "uygarcapar/cmt75ib0000as01sgh2auhnfd";

/**
 * KAMPÜS HARİTASI — akışın bandındaki (ve tam ekrandaki) yüzeyin stili.
 *
 * Kartın arkasındaki Studio stilleri bilinçli olarak neredeyse boş: orada bir
 * dokuya ihtiyaç vardı, yol adı ya da park okunmasına değil. Kampüs yüzeyinde
 * soru değişiyor — kullanıcı "kampüsüm neresi" diye bakıyor ve orada yolların,
 * yeşil alanların, kampüs lekesinin görünmesi işin kendisi.
 *
 * Stil etiketsiz ve monokrom: zemin bir ZEMİN, üstünde poligon, figür ve an
 * kartları duruyor. Yer adları okunursa göz onlara kayıyor.
 *
 * ⚠️ KLASİK STİL ZORUNLU — Static Images API'nin sınırı, bu dosyanın en
 * pahalı tuzağı. Mapbox Standard tabanlı (yani `imports` ile
 * `mapbox://styles/mapbox/standard` çeken, `layers: []` olan v3) stiller
 * Static Images API'de RENDER EDİLMİYOR. Üstelik hata da vermiyor: HTTP 200
 * döndürüyor ve içi bomboş, tek renkli bir PNG veriyor — yani "yüklenemedi"
 * dalına hiç girmiyoruz, yüzey sessizce bembeyaz kalıyor.
 *
 * Bu yanlışa iki kez düşüldü (önce `cmvmw1lhm008s01sb7sptdrgc` "Satellite",
 * sonra Studio'nun "Dark 2D"/"Light 2D" şablonları). Studio'da stil kurarken
 * şablon seçicide **Classic** sekmesinden başla; Standard'dan başlayıp
 * label kapatmak stili klasikleştirmiyor.
 *
 * Teşhis — stil takmadan ÖNCE çalıştır:
 *   curl -s ".../styles/v1/<stil>?access_token=..." | python3 -c \
 *     "import json,sys;d=json.load(sys.stdin);print(d.get('imports'),len(d['layers']))"
 *   → `imports` DOLU ve layers 0 ise static'te çizilmez.
 * Ya da dönen PNG'ye bak: birkaç yüz bayt + 1-bit colormap = boş.
 *
 * ⚠️ TEMAYA GÖRE AYRIŞIYOR (2026-10-27). Önceden tek uydu stili vardı ve
 * "temadan bağımsız" olması bilinçliydi; artık zemin her iki temada da
 * uygulamanın paletine uyuyor. Stil değişince MAP_DIM_ALPHA'nın gerekçesi de
 * değişti — bkz. FeedMapStrip > MAP_DIM_ALPHA.
 */
export const MAPBOX_STYLE_CAMPUS_LIGHT =
  "uygarcapar/cmvqklcct010s01pl39706dj7";
export const MAPBOX_STYLE_CAMPUS_DARK = "uygarcapar/cmvqknrmg010t01pl89z37nab";

/**
 * RENDER SIRASINDA ÇAĞIR (colors.ts mutasyon sözleşmesi) — modül seviyesinde
 * sabite alınırsa tema değişince bayat kalır.
 */
export function campusMapStyle(): string {
  return isLight() ? MAPBOX_STYLE_CAMPUS_LIGHT : MAPBOX_STYLE_CAMPUS_DARK;
}

// Style'ı her güncelleyip Publish ettiğinde bu sayıyı +1 yap: URL cache
// anahtarı olduğu için (expo-image disk cache + Mapbox CDN) sürüm artmadan
// eski görsel dönmeye devam eder.
export const MAPBOX_STYLE_VERSION = 3;

/**
 * ATIF — SİLİNEMEZ BAĞ. Static URL `attribution=false&logo=false` ile
 * kuruluyor (bkz. buildMapboxStaticUrl): Mapbox buna izin veriyor AMA şartı,
 * atfın uygulamanın başka bir yerinde metin olarak durması. Tek gösterildiği
 * yer Ayarlar'ın alt bilgisi (SettingsScreen → `settings.mapAttribution`).
 * O satırı kaldırırsan buradaki iki parametreyi de kaldırmak ZORUNDASIN,
 * yoksa Mapbox şartları ihlal ediliyor.
 */
export const MAPBOX_ATTRIBUTION_URL = "https://www.mapbox.com/about/maps/";
export const OSM_COPYRIGHT_URL = "https://www.openstreetmap.org/copyright";

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
  // `attribution=false&logo=false` → atıf Ayarlar'ın alt bilgisinde metin
  // olarak duruyor; bkz. MAPBOX_ATTRIBUTION_URL üstündeki not.
  return `https://api.mapbox.com/styles/v1/${resolvedStyle}/static/${longitude},${latitude},${zoom}/${width}x${height}${scale}?access_token=${MAPBOX_TOKEN}&v=${MAPBOX_STYLE_VERSION}&attribution=false&logo=false`;
}
