/**
 * Mutasyon kuyruğu KARARLARI — saf fonksiyonlar, yan etki YOK.
 *
 * Ayrı dosya olmasının tek sebebi test edilebilirlik: `pending_mutations`
 * tablosunu okuyan/yazan, isteği atan ve zamanlayan turdan (Faz 3'ün işi)
 * ayrıldığında geriye kalan her şey "girdi → çıktı" hâline geliyor ve jest'te
 * gerçek store/ağ/SQL zinciri kurmadan doğrulanabiliyor (bkz. backfillPolicy.ts
 * — aynı ayrımın backfill tarafındaki ikizi, outboxPolicy.ts — gönderim tarafı).
 *
 * Bu dosya store, ağ, timer ve SQL'e DOKUNMUYOR; `MutationKind` tipi dışında
 * `src/features/chat/` içinden hiçbir şey içe almıyor. `payload_json`'ın ne
 * anlama geldiğini (`ReactionPayload`/`DeletePayload`) BİLEREK yalnız burası
 * biliyor — disk katmanı (Task 1, `db/rows.ts`) onu opak bir string olarak
 * taşıyor.
 */
import { chatErrorCodeOf, chatErrorEffect } from "@/shared/constants/responseCodes";
import type { MutationKind } from "@/features/chat/db/rows";

/**
 * Bir reaksiyon emrinin yükü.
 *
 * `base`: emrin İLK verildiği anda sunucuda duran değer (flush bunu "kaldır"
 * isteğinde hangi emojiyi sileceğini söylemek için kullanır). `desired`:
 * kullanıcının şu an görmek istediği son değer, `null` = kaldırma.
 */
export interface ReactionPayload {
  desired: string | null;
  base: string | null;
}

export interface DeletePayload {
  forEveryone: boolean;
}

/**
 * Mevcut satır varsa onunla birleştirir; `base` HER ZAMAN eskisinden korunur.
 *
 * `serverBase` çağıranın o anki ekranda GÖSTERDİĞİ değer — bu zaten optimistik
 * olabilir (kullanıcı art arda iki kez dokundu, ikinci çağrıda "sunucu" diye
 * geçirilen şey birincinin optimistik sonucu). Bu yüzden `serverBase` yalnız
 * hiç bekleyen satır YOKKEN (`existing === null`) kullanılır: o an gerçekten
 * sunucunun son bilinen değeri. Bekleyen satır VARSA onun `base`'i zaten
 * emrin ilk verildiği andaki gerçek sunucu değerini taşıyor ve flush'ın
 * "kaldır" isteğinde doğru emojiyi silmesi için ARA DEĞERE kaymadan sabit
 * kalmalı.
 */
export function coalesceReaction(
  existing: ReactionPayload | null,
  desired: string | null,
  serverBase: string | null,
): ReactionPayload {
  return {
    desired,
    base: existing ? existing.base : serverBase,
  };
}

/**
 * `forEveryone` yalnız TIRMANIR — "herkesten sil" emri verildikten sonra
 * "benden sil"e geri düşmez (ikinci emir ilkini zayıflatmamalı; kullanıcı
 * aynı mesajı iki kez silmeye çalışırsa en güçlü niyet kazanır).
 */
export function coalesceDelete(existing: DeletePayload | null, forEveryone: boolean): DeletePayload {
  return { forEveryone: existing ? existing.forEveryone || forEveryone : forEveryone };
}

export type MutationOutcome = "done" | "retry" | "rejected";

/**
 * Hata → bu emrin kaderi. Sınıflandırmayı kendi başına yapmıyor,
 * `chatErrorEffect`e devrediyor (kod kataloğunun TEK sahibi orası):
 *
 *   conversationGone | messageGone | actionRejected | inputInvalid | clientBug
 *     → 'rejected' (tek istisna aşağıda)
 *   null (bilinmeyen/yabancı kod, kodsuz ağ hatası, 5xx, 429)
 *     → 'retry'
 *
 * TEK İSTİSNA — `kind === 'delete' && effect === 'messageGone'` → 'done':
 * UT-6720 (mesaj sunucuda zaten yok) silme emri için BAŞARI, çünkü silinmiş
 * göstermek gerçeği yansıtıyor (bkz. ChatScreen.tsx'teki silme dalı — aynı
 * UT-6720'yi aynı sebeple "done" sayıyor). Reaksiyon için aynı kod bir ret:
 * var olmayan bir mesaja tepki eklenemez, geri alınacak bir şey yok.
 *
 * `staleCursor`/`staleWatermark` burada hiç dönmez (reaksiyon/silme uçları
 * onları üretmiyor) — kasıtlı eksik, yeni bir kod ailesi eklenirse bu switch
 * genişletilmeli.
 */
export function classifyMutationError(err: unknown, kind: MutationKind): MutationOutcome {
  const code = chatErrorCodeOf(err);
  const effect = chatErrorEffect(code);
  if (effect === "messageGone" && kind === "delete") return "done";
  if (
    effect === "conversationGone" ||
    effect === "messageGone" ||
    effect === "actionRejected" ||
    effect === "inputInvalid" ||
    effect === "clientBug"
  ) {
    return "rejected";
  }
  return "retry";
}

const NEXT_ELIGIBLE_BASE_MS = 2_000;
const NEXT_ELIGIBLE_MAX_MS = 300_000;

/**
 * Bir sonraki deneme ne zaman uygun — `send`in eğrisiyle aynı aile: 2sn
 * tabanlı üstel, 5 dakikada tavanlanıyor.
 *
 * ÇAĞRI SÖZLEŞMESİ: `attempts` ARTIRILMIŞ sayaçtır (tur başarısızlıktan sonra
 * `row.attempts + 1` ile çağırıyor). Yani pratikte görülen bekleme dizisi
 * 4 / 8 / 16 / ... / 300 saniye — ilk tekrar 2sn DEĞİL 4sn sonra. Burada
 * `attempts`'i bir azaltıp "2sn"yi geri getirmedim: 2sn, kullanıcının aynı
 * mesaja ikinci bir emir vermesine bile yetmeyecek kadar kısa ve paylaşımlı
 * `messaging_default` kovasına ilk saniyelerde en çok yükü bindiren değer.
 * Düzeltilen şey eğri değil, onu yanlış anlatan cümleydi.
 */
export function nextEligibleAt(attempts: number, nowMs: number): number {
  return nowMs + Math.min(NEXT_ELIGIBLE_BASE_MS * 2 ** attempts, NEXT_ELIGIBLE_MAX_MS);
}

/**
 * Sessiz denemenin TAVANI. `classifyMutationError` bilinmeyen/kodsuz her
 * hatada 'retry' döndüğü için bu tavan olmadan bir satır SONSUZA DEK
 * denenirdi (tek mesajda ısrarlı 500, tanınmayan yeni bir kod, bozuk bir
 * gateway cevabı): paylaşımlı kovaya ömürlük bir arka plan isteği, kullanıcıya
 * da hiçbir haber. Tavana varan satır KALICI RET gibi bitirilir — silinir,
 * geri alınır, sebebi söylenir.
 *
 * Sayılar `outboxPolicy`'nin (MAX_ATTEMPTS = 5, MAX_AGE_MS = 30 dk)
 * AYNISI DEĞİL ve ikisi de bilerek daha cömert:
 *
 *  - Deneme sayısı 10: `attempts` yalnız gerçekten ağa çıkıp başarısız olan
 *    turlarda artıyor (offline tur erken dönüyor). Backoff 5 dakikada
 *    tavanlandığı için 10 deneme ~45 dakikalık ısrarlı bir arıza penceresi
 *    demek. 5'te kesmek bir deploy penceresinde (iki-üç dakika 5xx) saniyeler
 *    içinde tükenir ve kullanıcının tepkisini geri alırdı — tam olarak bu
 *    fazın engellemek için var olduğu kayıp.
 *  - Yaş 24 saat: outbox'ın 30 dakikası OTURUM İÇİ ölçülüyor
 *    (`rebaseAttemptOnLoad` `firstSeenAt`'i her açılışta "şimdi"ye çekiyor);
 *    burada öyle bir rebase YOK, `first_seen_at_ms` emrin verildiği gerçek
 *    anı taşıyor ve ölçü ÖMÜRLÜK. Kanonik senaryo (uçakta tepki, saatler
 *    sonra iniş) 30 dakikada DÜŞERDİ. 24 saat sonra ise ekranda duran iddiayı
 *    sürdürmek yanlış: o kadar eski bir emir artık kullanıcının beklediği şey
 *    değil, ekranı gerçeğe döndürmek daha dürüst.
 */
export const MUTATION_MAX_ATTEMPTS = 10;
export const MUTATION_MAX_AGE_MS = 24 * 60 * 60_000;

/**
 * Bu emir bitti mi — deneme hakkı ya da yaşı doldu mu?
 *
 * Saf karar; turun `rejected` dalını (sil + geri al + toast) tetikler.
 * `first_seen_at_ms` kolonunun TEK yaş okuyucusu burası — kolonun diğer
 * kullanımı `ORDER BY` (bkz. readPendingMutations).
 */
export function isMutationExpired(
  attempts: number,
  firstSeenAtMs: number,
  nowMs: number,
): boolean {
  if (attempts >= MUTATION_MAX_ATTEMPTS) return true;
  return nowMs - firstSeenAtMs >= MUTATION_MAX_AGE_MS;
}

/** Bir turda flush edilecek en çok emir sayısı. */
export const MAX_OPS_PER_FLUSH = 20;

/**
 * `MessagesController`'ın paylaşımlı kovasından bu kuyruğa ayrılan pay —
 * kalan kota bu sayının altına inince flush turu kapanır (bkz.
 * backfillPolicy.RATE_LIMIT_RESERVE — aynı fikrin backfill tarafındaki
 * ikizi, ama rezerv sayısı bilerek farklı: bu kuyruk kullanıcının kendi
 * etkileşimi, ayrı bir bütçe payı istiyor).
 *
 * YAKLAŞIK bir taban, kesin değil: turun saydığı `opsDone` SATIR sayısı, İSTEK
 * sayısı değil — `base !== desired` olan bir reaksiyon emri iki çağrı atıyor
 * (remove + add), yani 20 satırlık bir tur en kötü hâlde 40 istek harcayıp
 * kalan kotayı bu sayının altına (~18) indirebilir. Bilerek böyle: backfill
 * tarafı 80 rezerv ettiği için paylaşımlı kovada soğurulacak pay var ve satır
 * başına istek sayısını önceden saymak turu, kazandırdığından fazla
 * karmaşıklaştırırdı.
 */
export const MUTATION_RATE_RESERVE = 20;

/**
 * Tur burada mı bitiyor?
 *
 * `remaining === null` kalan kotanın BİLİNMEDİĞİ anlamına gelir (sunucu
 * header'ı hiç gelmedi), TÜKENDİĞİ anlamına GELMEZ — bu yüzden `null` iken
 * DEVAM edilir. Faz 3'te bu tam tersi yazılmıştı ve arka plan turu hiçbir
 * zaman çalışmazdı: soğuk açılışta `remainingNow()` henüz hiçbir API yanıtı
 * görmeden `null` kalıyor.
 */
export function shouldStopFlush(remaining: number | null, opsDone: number): boolean {
  if (opsDone >= MAX_OPS_PER_FLUSH) return true;
  if (remaining === null) return false;
  return remaining < MUTATION_RATE_RESERVE;
}
