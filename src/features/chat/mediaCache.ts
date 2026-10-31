import { Directory, File, Paths, type DirectoryCreateOptions, type DownloadOptions } from 'expo-file-system';
import {
  clearMediaCache,
  readAllOwnRecordingUris,
  readCacheEntriesOldestFirst,
  readCachedMessageIds,
  readMediaCache,
  readOwnRecordingUri,
  setMediaCache,
  touchMediaCache,
  type MediaCacheRow,
} from '@/features/chat/chatRepository';
import { MEDIA_CACHE_MAX_BYTES, selectEvictions } from '@/features/chat/mediaCachePolicy';
import chatService from '@/features/chat/chatService';
import { devLog } from '@/shared/utils/devLog';

/** Log satırını kısaltır — tam stack yerine yalnız mesaj (gürültüsüz dev konsolu). */
function errMessage(err: unknown): string {
  return err instanceof Error ? err.message : String(err);
}

/**
 * Medya önbelleği YÜRÜTÜCÜSÜ — indirme, diskten silme ve Task 1/2'yi
 * birleştiren yan etkili taraf. Burada SQL YOK: satır okuma/yazma hep
 * chatRepository'nin kapılarından geçiyor; bu dosyanın tek işi dosya
 * sistemi + ağ.
 *
 * ── Dizin seçimi: Paths.document, cache DEĞİL ───────────────────────────────
 * `Paths.cache` OS tarafından disk baskısı altında habersiz silinebiliyor —
 * bu zaten `ensureCachedMedia`nın var-mı kontrolüyle idare ediliyor, ama
 * "dinlenen sesli mesaj uçakta da çalsın" vaadini cache dizininde tutmak
 * garantiyi OS'in keyfine bırakırdı (rehberin "kalıcı dizin" talebi de bu).
 * `Paths.document` iOS'ta uygulama GÜNCELLEMESİNDE sabit kalıyor (aynı
 * container), ama YENİDEN KURULUMDA/konteyner taşımalarında mutlak yol
 * değişebiliyor — bu durumda `new File(uri).exists` zaten false döner ve
 * `ensureCachedMedia` yeniden indirmeye düşer, yani güvenlik ağı tam burada.
 *
 * ── Dosya adı: `<messageId><uzantı>` ────────────────────────────────────────
 * `messageId` zaten mesaj başına TEK ve BENZERSİZ (bir mesajın en fazla bir
 * medyası var) — çakışma riski yok, ayrıca ayrı bir eşleme tablosu tutmaya
 * gerek kalmıyor: yol zaten `local_uri` kolonunda duruyor, dosya adının
 * kendisinden de messageId okunabiliyor (teşhis/log kolaylığı). Uzantı imzalı
 * URL'in yolundan çıkarılıyor, bulunamazsa `.bin`.
 */
const CACHE_DIR_NAME = 'chat-media-cache';

function cacheDirectory(): Directory {
  return new Directory(Paths.document, CACHE_DIR_NAME);
}

function extensionFromUrl(url: string): string {
  try {
    const pathname = new URL(url).pathname;
    const match = /\.[a-zA-Z0-9]+$/.exec(pathname);
    return match ? match[0] : '.bin';
  } catch {
    return '.bin';
  }
}

/** `<messageId><uzantı>` → `messageId`. Uzantısı yoksa adın kendisi. */
function messageIdFromFileName(name: string): string {
  const dot = name.lastIndexOf('.');
  return dot > 0 ? name.slice(0, dot) : name;
}

function deleteIfExists(uri: string): void {
  try {
    const file = new File(uri);
    if (file.exists) file.delete();
  } catch (err) {
    // Silme başarısız olabilir (izin, dosya zaten yok) — çağıran yine de
    // satırı düşürüyor; aşağıdaki fonksiyonlardaki yorumlara bakın.
    devLog('🎧 [mediaCache] dosya silinemedi', uri, errMessage(err));
  }
}

/**
 * İnen dosyanın baytı — `null` = ÖLÇÜLEMEDİ (0 DEĞİL, bkz. çağıran).
 *
 * `downloadFileAsync` dönüşündeki `size` bazı platformlarda null gelebiliyor
 * (stat hatası); o durumda yolun kendisinden bir kez daha deneniyor.
 */
function resolveSizeBytes(downloaded: File): number | null {
  const candidates = [downloaded.size, safeFileSize(downloaded.uri)];
  for (const value of candidates) {
    const n = Number(value);
    if (Number.isFinite(n) && n > 0) return n;
  }
  return null;
}

function safeFileSize(uri: string): number | null {
  try {
    return new File(uri).size ?? null;
  } catch {
    return null;
  }
}

/**
 * Oynatılabilir bir kaynak döndürür; `null` = şu an elde edilemiyor.
 *
 * Dönen değer ÇOĞUNLUKLA yerel bir `file://` yolu, ama HER ZAMAN DEĞİL: iki
 * kenar durumda (boyut ölçülemedi / inen dosya aynı turda tahliye edildi)
 * imzalı UZAK URL dönüyor. Oynatıcı ikisini de kabul ediyor —
 * `voicePlayback.ts` `downloadFirst`'ü `file:` ön ekine bakarak seçiyor.
 *
 * Sıra (brief'in sözleşmesi): satırı oku → dosya GERÇEKTEN var mı → varsa
 * `touchMediaCache` + yol dön → yoksa satırı düşür ve indirmeye geç →
 * `getMediaUrl` → indir → `setMediaCache` → `evictOverCap`.
 *
 * Var-mı kontrolü savunma amaçlı dolgu DEĞİL: iOS disk baskısında dosyayı
 * geri alabiliyor, kullanıcı uygulama verisini temizleyebiliyor — satır
 * dosyadan uzun yaşayabiliyor. Bu kontrol olmasaydı bir kez önbelleğe alınmış
 * mesaj KALICI olarak çalınamaz hale gelirdi (bugünkünden daha kötü).
 */
export async function ensureCachedMedia(messageId: string): Promise<string | null> {
  const row = readMediaCache(messageId);
  if (row) {
    if (new File(row.local_uri).exists) {
      touchMediaCache(messageId, Date.now());
      return row.local_uri;
    }
    // Satır var ama dosya yok — yetim referansı düşür, indirmeye devam et.
    clearMediaCache([messageId]);
  } else {
    // Önbellek satırı yok — ama bu kendi gönderdiğimiz kaydın dosyası olabilir
    // (outbox'ın mülkü, `media_cached_at_ms` hiç yazılmadı; bkz. Review
    // Important 3). Bu durumda ALTTAKİ indirme yoluna HİÇ girilmemeli:
    // `setMediaCache` çağrılırsa outbox'ın TEK referansı olan `local_uri`
    // üstüne yazılır ve o dosya bir daha hiçbir koddan — `wipeMediaCache`
    // dahil — erişilemez hale gelir.
    const ownUri = readOwnRecordingUri(messageId);
    if (ownUri && new File(ownUri).exists) return ownUri;
    // ownUri varken dosya gitmişse outbox'ın koruyacağı bir şey kalmadı —
    // normal indirme yoluna düşülüyor (aşağısı), bu satır o düşüşü
    // engellemiyor.
  }

  let mediaUrl: string;
  try {
    const result = await chatService.getMediaUrl(messageId);
    mediaUrl = result.url;
  } catch (err) {
    devLog('🎧 [mediaCache] getMediaUrl patladı', messageId, errMessage(err));
    return null;
  }
  if (!mediaUrl) return null;

  const dir = cacheDirectory();
  const destination = new File(dir, `${messageId}${extensionFromUrl(mediaUrl)}`);
  try {
    const createOptions: DirectoryCreateOptions = { intermediates: true, idempotent: true };
    if (!dir.exists) dir.create(createOptions);
    const downloadOptions: DownloadOptions = { idempotent: true };
    const downloaded = await File.downloadFileAsync(mediaUrl, destination, downloadOptions);

    // Boyut BİLİNMİYORSA satır YAZILMIYOR (review Minor 6). Eski hâl
    // `Number(downloaded.size ?? 0)` idi: tavanın HİÇBİR ZAMAN göremeyeceği,
    // 0 bayt iddia eden bir girdi — her biri tavanı gerçek kullanımın altında
    // ölçtürür ve sınırsız sayıda birikebilir. `downloaded.size` null gelirse
    // yolun kendisinden bir kez daha `stat` deneniyor; o da sonuç vermezse
    // kopya diskte BIRAKILMIYOR ve imzalı URL doğrudan oynatıcıya veriliyor —
    // bu mesaj için çevrimdışı vaadi bu turda gerçekleşmiyor (bir sonraki
    // oynatma yeniden dener), ama ne yetim dosya ne sahte bir muhasebe kalıyor.
    const sizeBytes = resolveSizeBytes(downloaded);
    if (sizeBytes == null) {
      devLog('🎧 [mediaCache] boyut okunamadı, önbelleğe alınmıyor', messageId);
      deleteIfExists(downloaded.uri);
      return mediaUrl;
    }

    setMediaCache(messageId, downloaded.uri, sizeBytes, Date.now());
    // Tavanı aşan tahliye İNDİRMEDEN SONRA çalışır: az önce inen dosyanın
    // kendisi de tavanı tek başına aşabilir ve o da meşru bir aday (bkz.
    // mediaCachePolicy.ts'in "istisnasız siliniyor" gerekçesi).
    evictOverCap();
    // …ve tam o durumda az önce SİLDİĞİMİZ yolu oynatıcıya veremeyiz (review
    // Minor 7). Satır hâlâ duruyorsa dosya da duruyor; düşmüşse tahliye bizi
    // seçti, uzak kaynağa düşüyoruz. 200 MB tavanda sesli mesaj için pratikte
    // ulaşılmaz, ama kod artık sildiği bir yolu döndürmüyor.
    if (!readMediaCache(messageId)) return mediaUrl;
    return downloaded.uri;
  } catch (err) {
    // Yarım kalan indirme defter DIŞI bir dosya bırakabilir (ör. Android'de
    // gövde akışı hedefe yazılırken bağlantı kopması) — satırsız bir dosya,
    // `wipeMediaCache`'in ASLA bulamayacağı bir yetim demek (tam bu task'ın
    // kapatmaya çalıştığı gizlilik şekli). `setMediaCache` hiç çağrılmadıysa
    // ya da sonrasında bir şey patladıysa bile hedefte kalan her şeyi burada
    // temizliyoruz.
    deleteIfExists(destination.uri);
    devLog('🎧 [mediaCache] indirme patladı', messageId, errMessage(err));
    return null;
  }
}

/**
 * Tavanı aşan kopyaları siler (dosya + satır). Silinen sayısını döndürür.
 *
 * Silme BAŞARISIZ olursa (izin, dosya zaten yok) satır yine de düşürülüyor:
 * alternatif — satırı tavanın üstünde bırakmak — `totalBytes`in o girdiyi
 * SONSUZA DEK saymasına yol açardı, yani tavan kalıcı olarak yanlış ölçülür
 * ve bir daha hiç düzelmezdi. Olası sonuç diskte yetim bir dosya (kötü ama
 * kurtarılabilir — bir sonraki `wipeMediaCache` ya da manuel temizlik
 * giderir), satırın donması ise kurtarılamaz bir sızıntı.
 */
export function evictOverCap(): number {
  const entries: MediaCacheRow[] = readCacheEntriesOldestFirst();
  const toEvict = selectEvictions(entries, MEDIA_CACHE_MAX_BYTES);
  if (!toEvict.length) return 0;

  const byId = new Map(entries.map((e) => [e.message_id, e]));
  for (const messageId of toEvict) {
    const entry = byId.get(messageId);
    if (entry) deleteIfExists(entry.local_uri);
  }
  clearMediaCache(toEvict);
  return toEvict.length;
}

/**
 * Logout/wipe: önceki kullanıcının TÜM sesini diskten siler.
 *
 * ── Önbellek: DİZİNİN KENDİSİ siliniyor (Faz 5 review, Kritik 2) ───────────
 * Eskiden `readAllCachedUris()` ile satır satır dolaşılıyordu, yani garanti
 * "defterde kaydı olan dosyalar" kadardı. Oysa satır silen DÖRT yol var —
 * `pruneExpiredMessages`, `removeConversationLocally`, geçmiş sayfasının gap
 * dalı ve `removeByClientMessageId` — ve hiçbiri `mediaCache`'e
 * ulaşamıyor (Task 3'ün çevrimsel import'tan kaçınmak için kurduğu seam).
 * Satır gidince dosya defter dışında kalıyordu: ne tahliye görüyordu ne de
 * logout. Dizini topluca silmek garantiyi TOPLAM yapıyor ve gelecekte
 * eklenecek her satır-silen yola karşı bağışık — "bu yol da mediaCache'i
 * çağırmalı" kuralını hiç kimsenin hatırlaması gerekmiyor.
 *
 * ── Kendi kayıtlarımız: AYRI dizin, o yüzden ayrı tur (Önemli 3) ───────────
 * Gönderdiğimiz sesin dosyası recorder'ın (OS cache) dizininde duruyor ve
 * `discardVoiceTake` yalnız İPTAL yollarında koşuyor — bir kez gönderilmiş
 * kaydın dosyası hiçbir yolda silinmiyordu. Yollar `messages.local_uri`de
 * duruyor, o yüzden tabloyu HÂLÂ okuyabiliyorken tek tek siliniyorlar.
 *
 * SIRA KRİTİK: bu fonksiyon `clearAllChatData`'dan ÖNCE çağrılmalı — kendi
 * kayıtlarımızın yolları yalnız tablodan okunabiliyor (dizin adını bilmiyoruz,
 * expo-audio seçiyor), tablo boşaldıktan sonra o liste boş gelirdi.
 */
export function wipeMediaCache(): void {
  for (const uri of readAllOwnRecordingUris()) {
    deleteIfExists(uri);
  }
  try {
    const dir = cacheDirectory();
    if (dir.exists) dir.delete();
  } catch (err) {
    devLog('🎧 [mediaCache] önbellek dizini silinemedi', errMessage(err));
  }
}

/**
 * Açılış uzlaştırması: defterde karşılığı OLMAYAN önbellek dosyalarını siler.
 *
 * `wipeMediaCache`'in dizin silmesi logout'u tamamen kapatıyor ama STEADY
 * STATE sızıntısını kapatmıyor (Faz 5 review, Kritik 2'nin ikinci yarısı):
 * satır silen dört yol (başta her açılışta koşan ve tam olarak "eski, çalınmış
 * sesli mesaj" satırlarını hedefleyen `pruneExpiredMessages`) dosyayı diskte
 * bırakıp satırı götürüyor. Defterdeki toplam KÜÇÜLÜRKEN dizin BÜYÜYOR, yani
 * 200 MB tavanı gerçek disk kullanımını bir süre sonra hiç sınırlamıyor.
 *
 * Eşleme dosya ADINDAN kuruluyor — `<messageId><uzantı>` tasarım gereği
 * (bkz. yukarıdaki dizin/ad notu), ayrı bir eşleme tablosu yok. Satırı olan
 * her dosya korunuyor; geri kalan her şey yetim.
 *
 * `pruneExpiredMessages`'ten SONRA koşmalı: aynı turda yetim ettiği dosyalar
 * da bu turda gitsin, bir sonraki açılışa kalmasın.
 *
 * @returns silinen yetim dosya sayısı
 */
export function reconcileMediaCacheDirectory(): number {
  let removed = 0;
  try {
    const dir = cacheDirectory();
    if (!dir.exists) return 0;
    const tracked = new Set(readCachedMessageIds());
    for (const entry of dir.list()) {
      if (entry instanceof Directory) continue;
      const name = entry.uri.slice(entry.uri.lastIndexOf('/') + 1);
      if (tracked.has(messageIdFromFileName(name))) continue;
      deleteIfExists(entry.uri);
      removed++;
    }
  } catch (err) {
    // Dizin listelenemiyorsa (izin, yarış) sessizce geç: bu bir bakım turu,
    // açılışı düşürmeye değmez — bir sonraki açılış tekrar dener.
    devLog('🎧 [mediaCache] yetim süpürmesi patladı', errMessage(err));
  }
  return removed;
}

/** Tek mesajın kopyasını siler (UT-6606, herkesten silme). */
export function dropCachedMedia(messageId: string): void {
  const row = readMediaCache(messageId);
  if (!row) return;
  deleteIfExists(row.local_uri);
  clearMediaCache([messageId]);
}
