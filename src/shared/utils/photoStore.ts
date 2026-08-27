import { Directory, File, Paths } from "expo-file-system";
import { devLog } from "./devLog";

/**
 * Kırpılmış profil fotoğraflarının YEREL deposu.
 *
 * NEDEN: hem picker hem de image-manipulator çıktıyı `Library/Caches` altına
 * yazıyor — OS bunu uygulama kapalıyken silebiliyor (depolama baskısı, sürüm
 * güncellemesi). Kayıt akışı fotoğraf YOLLARINI redux-persist'te tutup submit'e
 * kadar bekletiyor; yol ölünce tile boş kalıyor ve gönderim native tarafta
 * anlaşılmaz bir hatayla patlıyordu. Bu yüzden onay anında dosyayı
 * `Documents/profile-photos` altına taşıyoruz — burayı OS temizlemiyor.
 *
 * KARŞILIĞI: burayı KENDİMİZ temizlemek zorundayız (bkz. pruneOrphanPhotos),
 * yoksa yarım kalan kayıtlar dizini kalıcı olarak şişirir ve iCloud yedeğine
 * sayılır.
 */

const DIR_NAME = "profile-photos";

const photosDir = () => new Directory(Paths.document, DIR_NAME);

const ensureDir = () => {
  const dir = photosDir();
  dir.create({ intermediates: true, idempotent: true });
  return dir;
};

/** `/path` ve `file:///path` yazımlarını tek biçime indirger. */
const normalize = (uri: string) => (uri.startsWith("/") ? `file://${uri}` : uri);

/**
 * Kırpma çıktısını kalıcı dizine taşır ve yeni URI'yi döndürür.
 *
 * FAIL-SOFT: taşıma patlarsa (disk dolu, izin) kaynak URI olduğu gibi döner.
 * Aynı oturumda yükleme yine çalışır; yalnız yeniden başlatma dayanıklılığı
 * kaybolur — bu, akışı hata ile kesmekten iyi.
 */
export async function persistPickedPhoto(sourceUri: string, fileName: string): Promise<string> {
  try {
    const dir = ensureDir();
    const source = new File(normalize(sourceUri));
    const destination = new File(dir, fileName);
    await source.move(destination, { overwrite: true });
    return source.uri;
  } catch (error) {
    devLog("🗂️ [photoStore] kalıcı dizine taşınamadı, geçici yol kullanılıyor", error);
    return sourceUri;
  }
}

/** Tek dosyayı sil. Best-effort — asla fırlatmaz. */
export function forgetPhoto(uri: string): void {
  try {
    const file = new File(normalize(uri));
    if (file.exists) file.delete();
  } catch {
    // Dosya zaten yok ya da erişilemiyor; yapacak bir şey yok.
  }
}

/**
 * `keep` listesinde OLMAYAN her şeyi depodan sil.
 *
 * Kayıt yarıda bırakıldığında (kullanıcı vazgeçti, uygulama silinip yeniden
 * kuruldu değil ama akış terk edildi) dosyalar burada asılı kalıyor. Mount'ta
 * ve kayıt başarıyla bittiğinde çağrılıyor.
 */
export function pruneOrphanPhotos(keep: readonly string[]): void {
  try {
    const dir = photosDir();
    if (!dir.exists) return;
    const kept = new Set(keep.map(normalize));
    dir.list().forEach((entry) => {
      if (entry instanceof Directory) return;
      if (kept.has(entry.uri)) return;
      try {
        entry.delete();
      } catch {
        // Tek bir dosyanın silinememesi temizliği durdurmasın.
      }
    });
  } catch (error) {
    devLog("🗂️ [photoStore] temizlik atlandı", error);
  }
}

/**
 * Yerel dosya hâlâ diskte mi? EMİN OLAMADIĞIMIZDA `true` döner (fail-open):
 * yanlış negatif, kullanıcının duran fotoğrafını silmek demek olurdu.
 * file:// dışı şemalar (ph://, content://) burada doğrulanamaz, dokunulmaz.
 */
export function photoExists(uri: string): boolean {
  const normalized = normalize(uri);
  if (!normalized.startsWith("file://")) return true;
  try {
    return new File(normalized).exists;
  } catch {
    return true;
  }
}
