import { isAppMode, type AppMode } from "@/features/discover/modeTheme";

/**
 * Akış kartının HANGİ MODDA açılacağının kararı — saf fonksiyon.
 *
 * Ekrandan ayrı dosyada çünkü üç girdili bir seçim ve yanlış dalı sessizce
 * yanlış modda beğeni atıyor: kullanıcı arkadaş olmak isterken flört beğenisi
 * gitmiş olur (ya da tersi) ve geri alınamaz.
 *
 * ── Kural ───────────────────────────────────────────────────────────────────
 * 1. Keşif'te seçili mod uygunsa O. Kullanıcı az önce "Arkadaş"ı seçtiyse
 *    akışta da arkadaş aradığını varsaymak doğru taraf.
 * 2. Değilse listedeki İLK uygun mod. Tek mod uygunsa kart o modda açılıyor
 *    ve kullanıcı ne yaptığını kartın renginden/etiketinden görüyor.
 * 3. Hiçbiri uygun değilse `null` → kart SALT OKUNUR.
 *
 * ⚠️ Liste SUNUCUDAN. İstemci karşı tarafın tercihlerini ve açık modlarını
 * bilmiyor (bilmemeli de), o yüzden burada bir "uygunluk hesabı" YOK — yalnız
 * sunucunun verdiği listeden seçim var.
 *
 * ⚠️ TOCTOU: liste kart ÇEKİLDİĞİNDE hesaplanıyor; hedef o arada modunu
 * kapatabilir. Sunucu aksiyon anında yeniden doğruluyor ve reddediyor —
 * istemci o hatayı zarif bir toast'a çevirip kartı salt okunura düşürüyor,
 * retry döngüsüne GİRMİYOR.
 */
export function resolveCardMode(
  availableModes: unknown,
  selectedMode: AppMode,
): AppMode | null {
  const modes = normalizeModes(availableModes);
  if (modes.length === 0) return null;
  if (modes.includes(selectedMode)) return selectedMode;
  return modes[0];
}

/**
 * Kartta HANGİ AKSİYONLAR çizilecek — moda göre, saf fonksiyonda.
 *
 * ── Kural (istek) ───────────────────────────────────────────────────────────
 * • FLÖRT'te DÜZ BEĞENİ YOK. Sinyal ya Fire ya da not olmak zorunda: ikisi de
 *   bir bedel taşıyor (Fire kotadan/krediden, not ayrı consumable'dan) ve ikisi
 *   de karşı tarafa NEDEN'i gösteriyor — not yorumuyla, Fire alevle. Akış
 *   kampüsün açık meydanı; oradan tek dokunuşla dağıtılan bedelsiz beğeni
 *   flörtü gürültüye çeviriyordu.
 * • ARKADAŞ'ta HER ŞEY SERBEST, not da dahil. Arkadaşlıkta "kendini kanıtla"
 *   kapısı yok: düz beğeni de, Spark da, not da açık.
 * • Mod YOKSA (`resolveCardMode` null döndü) hiçbiri — kart salt okunur.
 *
 * ⚠️ Karar `cardMode` ile veriliyor, Keşif'te SEÇİLİ modla değil: aksiyon hangi
 * modda GİDİYORSA kuralı o mod koyuyor. Yazar yalnız Flört'te açıkken kullanıcı
 * Arkadaş sekmesinde olsa bile gidecek şey bir flört beğenisidir.
 *
 * ⚠️ Bu yalnız İSTEMCİ KAPISI. Sunucu düz beğeniyi Flört'te de kabul ediyor
 * (Keşif'teki deste aynı ucu kullanıyor) — buradaki iş butonu hiç çizmemek,
 * "gönder ama reddedilsin" değil.
 */
export type FeedCardActions = {
  /** Düz beğeni (tik butonu) çizilsin mi. */
  like: boolean;
  /** Fire/Spark butonu çizilsin mi. */
  fire: boolean;
  /** Fotoğraf/prompt altındaki not kutuları çizilsin mi. */
  note: boolean;
};

export function feedCardActions(mode: AppMode | null): FeedCardActions {
  if (mode === "Friends") return { like: true, fire: true, note: true };
  if (mode === "Dating") return { like: false, fire: true, note: true };
  return { like: false, fire: false, note: false };
}

/**
 * Sunucudan gelen listeyi temizler: bilinmeyen değerler ELENİYOR.
 *
 * Tanınmayan bir mod sorgu parametresine girerse sunucu 400 döner; ayrıca
 * ileride eklenecek üçüncü bir mod, onu desteklemeyen bu sürümde sessizce
 * "uygun" sayılıp kart o modda açılırdı.
 */
export function normalizeModes(value: unknown): AppMode[] {
  if (!Array.isArray(value)) return [];
  const out: AppMode[] = [];
  for (const raw of value) {
    if (isAppMode(raw) && !out.includes(raw)) out.push(raw);
  }
  return out;
}
