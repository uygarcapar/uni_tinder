/**
 * Backfill KARARLARI — saf fonksiyonlar, yan etki YOK.
 *
 * Ayrı dosya olmasının tek sebebi test edilebilirlik: isteği atan, zamanlayan
 * ve diske yazan turdan (henüz yazılmamış `backfillRound.ts`) ayrıldığında
 * geriye kalan her şey "girdi → çıktı" hâline geliyor ve jest'te gerçek
 * store/SQL/timer zinciri kurmadan doğrulanabiliyor (bkz. outboxPolicy.ts —
 * aynı ayrımın gönderim tarafındaki ikizi).
 *
 * Bu dosya store, ağ, timer ve SQL'e DOKUNMUYOR; `BackfillTarget` tipi
 * dışında `src/features/chat/` içinden hiçbir şey içe almıyor.
 */
import type { BackfillTarget } from "@/features/chat/chatRepository";

/** Sunucudan tek seferde istenecek mesaj sayısı. */
export const BACKFILL_PAGE_SIZE = 50;

/** Bir turda toplam en çok kaç sayfa çekilir — sohbet sayısı ne olursa olsun. */
export const MAX_PAGES_PER_ROUND = 30;

/**
 * Tek sohbet için bir turda en çok kaç sayfa çekilir. Tavan olmadan tek bir
 * çok uzun sohbet MAX_PAGES_PER_ROUND'ın tamamını yiyip diğer sohbetleri
 * turdan dışlardı.
 */
export const MAX_PAGES_PER_CONVERSATION = 6;

/** Art arda iki sayfa isteği arasındaki bekleme. */
export const PAGE_DELAY_MS = 1000;

/**
 * `MessagesController`'ın paylaşımlı kovasından (200/60sn) kullanıcının kendi
 * etkileşimi (geçmiş sayfalama, `/changes`, reveal-history, silme, reaksiyon)
 * için ayrılmış pay — backfill `shouldStopRound`'da kalan kota bu sayının
 * altına inince turu kapatır. Bu sayı yalnız bir eşik: eşikten sonra ne
 * olacağı (istek atılır mı, ne zaman) bu dosyanın bilgisi dışında, o yüzden
 * burada "429 yemez" gibi bir sonuç iddia edilmiyor.
 */
export const RATE_LIMIT_RESERVE = 80;

/** Uygulama açılışından backfill'in ilk turuna kadar beklenecek süre (Task 5 kullanıyor). */
export const BACKFILL_BOOT_DELAY_MS = 10_000;

/**
 * Turda ziyaret edilecek hedefler — aktif sohbet ELENİR, kalanların SIRASI
 * korunur.
 *
 * Aktif sohbeti elemenin sebebi: kullanıcı o sohbeti zaten açıp canlı
 * sayfalıyor, backfill'in aynı sohbete arkadan sayfa istemesi hem gereksiz
 * (kullanıcının kendi isteği zaten geçmişi indiriyor) hem de aynı kovadan
 * ikinci kez harcama demek.
 */
export function selectBackfillTargets(
  targets: BackfillTarget[],
  activeConversationId: string | null,
): BackfillTarget[] {
  if (!activeConversationId) return targets;
  return targets.filter((t) => t.conversationId !== activeConversationId);
}

/**
 * Tur burada mı bitiyor?
 *
 * Kontroller KOD SIRASIYLA (üçü de birbirini dışlar, en fazla biri gerçek
 * "dur" kararını verir):
 *  1. Tur tavanı (MAX_PAGES_PER_ROUND) doldu mu.
 *  2. Cihaz offline mı — ağ yokken istek denemenin anlamı yok.
 *  3. Kalan kota BİLİNMİYOR (`remainingNow()` henüz hiçbir yanıt görmediği
 *     için `null`) ama bu turda ZATEN bir sayfa çekildiyse.
 *  4. (yalnız kota BİLİNİYORSA değerlendirilir) kalan kota rezervin altına
 *     indi mi — tam rezerve EŞİT kalan henüz "altında" sayılmaz, `<` katı.
 *
 * Üçüncü kontrol kasıtlı: "bilinmiyorsa hiç başlama" tek başına backfill'i
 * SOĞUK AÇILIŞTA asla çalıştırmazdı — `remainingNow()` uygulama hiçbir API
 * yanıtı görmeden `null` kalır, ve Discover'da gezip Mesajlar'a hiç
 * girmeyen bir kullanıcı o yanıtı asla üretmeyebilir. Bunun yerine bütçe
 * bilinmediğinde turun TEK bir sayfaya ("prob") izin verilir: o sayfanın
 * yanıtı bütçeyi doldurur, sonraki her sayfa rezerve göre karar verir. Prob
 * sonrası kota hâlâ bilinmiyorsa (başlık hiç gelmiyor — eski sunucu ya da
 * proxy siliyor) tur bir sayfada kapanır: backfill sürünerek ilerler, ölmez,
 * ve turun ikinci sayfaya geçmesi bu fonksiyon seviyesinde engellenir (asıl
 * ağ isteğini kimin, nasıl attığı bu dosyanın bilgisi dışında).
 *
 * `pagesThisRound` parametresi zaten vardı — probun "en fazla bir sayfa"
 * kuralı ekstra bir alan gerektirmiyor.
 */
export function shouldStopRound(opts: {
  pagesThisRound: number;
  offline: boolean;
  remaining: number | null;
}): boolean {
  const { pagesThisRound, offline, remaining } = opts;
  if (pagesThisRound >= MAX_PAGES_PER_ROUND) return true;
  if (offline) return true;
  if (remaining === null) return pagesThisRound >= 1;
  return remaining < RATE_LIMIT_RESERVE;
}

/**
 * Bir sohbetin geçmişi tamamen indi mi?
 *
 * `hasMore === false` sunucunun "bitti" demesi; `nextCursor === null` ise
 * ayrı bir durum — sunucu `hasMore: true` deyip cursor vermeyebilir (örn.
 * tutarsız bir yanıt) ve cursor olmadan bir sonraki sayfayı isteyemeyiz.
 * Böyle bir sohbeti sonsuza dek "devam ediyor" sayıp her turda yeniden
 * denemek yerine TAMAM say — asıl düzeltme bir sonraki tam senkronda gelir.
 */
export function isConversationComplete(page: {
  hasMore: boolean;
  nextCursor: string | null;
}): boolean {
  return page.hasMore === false || page.nextCursor === null;
}
