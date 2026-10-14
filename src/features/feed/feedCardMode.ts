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
