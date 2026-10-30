/**
 * Backfill KARARLARI — saf fonksiyonlar, yan etki YOK.
 *
 * Ayrı dosya olmasının tek sebebi test edilebilirlik: isteği atan, zamanlayan
 * ve diske yazan turdan (`chatBackfill.ts`) ayrıldığında geriye kalan her şey
 * "girdi → çıktı" hâline geliyor ve jest'te gerçek
 * store/SQL/timer zinciri kurmadan doğrulanabiliyor (bkz. outboxPolicy.ts —
 * aynı ayrımın gönderim tarafındaki ikizi).
 *
 * Bu dosya store, ağ, timer ve SQL'e DOKUNMUYOR; `BackfillTarget` tipi
 * dışında `src/features/chat/` içinden hiçbir şey içe almıyor.
 */
import type { BackfillTarget } from "@/features/chat/chatRepository";

/** Sunucudan tek seferde istenecek mesaj sayısı. */
export const BACKFILL_PAGE_SIZE = 50;

/**
 * Bir turda toplam en çok kaç İSTEK atılır — sohbet sayısı ne olursa olsun.
 *
 * Birim bilerek "istek", "başarılı sayfa" DEĞİL: backend'in kovası (200/60sn)
 * DENEMEYİ sayıyor, sonucunu değil — 5xx/ağ hatası da bir slot yakıyor. Bu
 * tavanı başarı sayısıyla ölçmek, art arda gelen genel hatalarda (ör. bir 5xx
 * fırtınası — ki tam o anda sunucuyu 30 istek daha dövmek en kötü zaman)
 * turu hiç durdurmazdı: her başarısız istek "bedava" sayılır, round toplam
 * istek hacmi bakımından sınırsız kalırdı.
 */
export const MAX_REQUESTS_PER_ROUND = 30;

/**
 * Tek sohbet için bir turda en çok kaç sayfa çekilir. Tavan olmadan tek bir
 * çok uzun sohbet MAX_REQUESTS_PER_ROUND'ın tamamını yiyip diğer sohbetleri
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

/** Uygulama açılışından backfill'in ilk turuna kadar beklenecek süre (`chatBackfill.startBackfill` kullanıyor). */
export const BACKFILL_BOOT_DELAY_MS = 10_000;

/**
 * Üst üste bu kadar KALICI hata (429 hariç) alan bir sohbet `isConversationShelved`
 * ile raftan sayılır — bkz. aşağıdaki fonksiyon ve migrations.ts V10 yorumu.
 */
export const BACKFILL_MAX_FAILURES = 3;

/**
 * Bir sohbet turdan DÜŞMELİ mi?
 *
 * `failures` 429 SAYMAZ (kova paylaşımlı, bu kodu sohbetin kendisi değil
 * kullanıcının kendi trafiği de üretebilir — bkz. chatBackfill.ts'teki 429
 * dalı, orada sayaç hiç artırılmıyor). Sayaç yalnız o sohbete özgü kalıcı
 * hatalarda (ağ/5xx, bkz. chatBackfill.ts'teki catch) artıyor ve başarılı bir
 * sayfada sıfırlanıyor (`chatRepository.clearBackfillFailures`) — yani eşiğe
 * ulaşmak "üst üste" olmak zorunda, toplamda değil.
 */
export function isConversationShelved(failures: number): boolean {
  return failures >= BACKFILL_MAX_FAILURES;
}

/**
 * Turda ziyaret edilecek hedefler — aktif sohbet VE rafa kalkmış sohbetler
 * ELENİR, kalanların SIRASI korunur.
 *
 * Aktif sohbeti elemenin sebebi: kullanıcı o sohbeti zaten açıp canlı
 * sayfalıyor, backfill'in aynı sohbete arkadan sayfa istemesi hem gereksiz
 * (kullanıcının kendi isteği zaten geçmişi indiriyor) hem de aynı kovadan
 * ikinci kez harcama demek. Bu eleme SQL'e TAŞINAMAZ:
 * `getActiveConversationId()` çağrı anında belli oluyor, sorgu zamanında değil.
 *
 * Rafa kalkmış sohbetleri elemek ise burada İKİNCİL bir güvenlik ağı —
 * ASIL eleme artık `readBackfillTargets`'ın WHERE'inde, LIMIT'TEN ÖNCE
 * (bkz. chatRepository.ts'teki o fonksiyonun yorumu: eleme LIMIT'ten SONRA
 * olsaydı pencere rafa kalkmış satırlarla dolup canlı sohbetleri dışarıda
 * bırakabilirdi — tam da bu muhasebenin önlemesi gereken "crowd out"
 * hatası). Buradaki filtre o garantiye GÜVENMİYOR: `selectBackfillTargets`
 * saf bir fonksiyon, `readBackfillTargets` dışındaki bir kaynaktan (ör. test,
 * ileride başka bir okuma yolu) gelen hedef listesinde de aynı kuralı
 * uyguluyor — eşiğin TEK sayısal kaynağı yine `BACKFILL_MAX_FAILURES`.
 */
export function selectBackfillTargets(
  targets: BackfillTarget[],
  activeConversationId: string | null,
): BackfillTarget[] {
  return targets.filter(
    (t) => t.conversationId !== activeConversationId && !isConversationShelved(t.failures),
  );
}

/**
 * Tur burada mı bitiyor?
 *
 * Kontroller KOD SIRASIYLA — sıra kısa devre: hangisi önce doğru çıkarsa "dur"
 * kararını o verir (koşullar birbirini DIŞLAMIYOR; ör. offline ile tavanın
 * dolması aynı anda doğru olabilir):
 *  1. Tur tavanı (MAX_REQUESTS_PER_ROUND) doldu mu.
 *  2. Cihaz offline mı — ağ yokken istek denemenin anlamı yok.
 *  3. Kalan kota BİLİNMİYOR (`remainingNow()` henüz hiçbir yanıt görmediği
 *     için `null`) ama bu turda ZATEN bir istek YAPILDIYSA.
 *  4. (yalnız kota BİLİNİYORSA değerlendirilir) kalan kota rezervin altına
 *     indi mi — tam rezerve EŞİT kalan henüz "altında" sayılmaz, `<` katı.
 *
 * `attemptsThisRound` DENEME sayısı, BAŞARILI sayfa sayısı DEĞİL — çağıran
 * bunu her istekten ÖNCE artırmalı (bkz. chatBackfill.ts). Birim burada
 * kasıtlı: kovayı dolduran şey sunucunun saydığı istek sayısı, bizim "işe
 * yaradı mı" hükmümüz değil; başarıyla ölçseydik art arda gelen genel
 * hatalar (5xx fırtınası vb.) turu hiç durdurmazdı.
 *
 * Üçüncü kontrol kasıtlı: "bilinmiyorsa hiç başlama" tek başına backfill'i
 * SOĞUK AÇILIŞTA asla çalıştırmazdı — `remainingNow()` uygulama hiçbir API
 * yanıtı görmeden `null` kalır, ve Discover'da gezip Mesajlar'a hiç
 * girmeyen bir kullanıcı o yanıtı asla üretmeyebilir. Bunun yerine bütçe
 * bilinmediğinde turun TEK bir DENEMEYE ("prob") izin verilir: o denemenin
 * yanıtı (başarılıysa) bütçeyi doldurur, sonraki her istek rezerve göre
 * karar verir. Prob BAŞARISIZ olsa bile (ağ hatası, 5xx — hiçbir header
 * gelmez) `attemptsThisRound` yine 1'e çıkar ve tur yine kapanır: başarısız
 * bir prob bütçe hakkında hiçbir şey öğretmedi, bu YÜZDEN ikinci bir kör
 * denemeye de izin vermemeli — "prob başarısız olursa tekrar dene" YANLIŞ
 * okuma, kasıtlı olarak daha SIKI: bilmediğimiz kotaya karşı ikinci bir
 * deneme de kör harcama. Prob (başarılı ama) sonrası kota hâlâ bilinmiyorsa
 * (başlık hiç gelmiyor — eski sunucu ya da proxy siliyor) tur yine bir
 * denemede kapanır: backfill sürünerek ilerler, ölmez, ve turun ikinci
 * denemeye geçmesi bu fonksiyon seviyesinde engellenir (asıl ağ isteğini
 * kimin, nasıl attığı bu dosyanın bilgisi dışında).
 */
export function shouldStopRound(opts: {
  attemptsThisRound: number;
  offline: boolean;
  remaining: number | null;
}): boolean {
  const { attemptsThisRound, offline, remaining } = opts;
  if (attemptsThisRound >= MAX_REQUESTS_PER_ROUND) return true;
  if (offline) return true;
  if (remaining === null) return attemptsThisRound >= 1;
  return remaining < RATE_LIMIT_RESERVE;
}

/**
 * Bir sohbetin geçmişi tamamen indi mi?
 *
 * `hasMore === false` sunucunun "bitti" demesi; `nextCursor === null` ise
 * ayrı bir durum — sunucu `hasMore: true` deyip cursor vermeyebilir (örn.
 * tutarsız bir yanıt) ve cursor olmadan bir sonraki sayfayı isteyemeyiz.
 * Böyle bir sohbeti sonsuza dek "devam ediyor" sayıp her turda yeniden
 * denemek yerine TAMAM say.
 *
 * Bedeli AÇIK OLSUN: bu karar `backfill_done`u yazdırıyor ve o mandal KALICI
 * — tam senkron yollarının HİÇBİRİ (`onNeedsFullResync`,
 * `fetchConversations({force:true})`, delta resync) ona dokunmuyor. Mandalı
 * söken iki yol var: `clearAllChatData()` (logout) ve gizli arşiv açılınca
 * `chat/historyRevealed` → `repo.clearBackfillDone` (bkz.
 * chatMirrorMiddleware.ts). Yani tutarsız yanıt veren bir sohbetin geçmişi o
 * oturumdan sonra kendiliğinden tamamlanmaz; Faz 4'ün aramasının kapsamını
 * dürüstçe söylemesi gerekirse okunacak yer `backfill_done` sayısı.
 */
export function isConversationComplete(page: {
  hasMore: boolean;
  nextCursor: string | null;
}): boolean {
  return page.hasMore === false || page.nextCursor === null;
}
