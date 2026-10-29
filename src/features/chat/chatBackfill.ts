import chatService from '@/features/chat/chatService';
import * as repo from '@/features/chat/chatRepository';
import { isOfflineNow } from '@/shared/services/networkStatus';
import { remainingNow } from '@/shared/services/rateLimitBudget';
import {
  BACKFILL_PAGE_SIZE,
  MAX_REQUESTS_PER_ROUND,
  MAX_PAGES_PER_CONVERSATION,
  PAGE_DELAY_MS,
  selectBackfillTargets,
  shouldStopRound,
  isConversationComplete,
} from '@/features/chat/backfillPolicy';

/**
 * Backfill TURU — arşivi arka planda geri dolduran yan etkili tarafın tek
 * yeri. Kararlar (hangi sohbet, ne zaman dur) `backfillPolicy.ts`'te saf
 * fonksiyonlar; burası yalnız onları çağırıp isteği atıyor ve diske yazıyor.
 *
 * REDUX'A DOKUNMUYOR: `fetchHistory` thunk'ı KULLANILMIYOR — onun
 * `fulfilled`'ı aynadan diske yazmanın yanında o sohbetin Redux bucket'ını da
 * dolduruyor; kullanıcının hiç açmadığı yüzlerce sohbet için bellekte mesaj
 * dizisi demek. Bunun yerine `chatService.getMessageHistory` doğrudan
 * çağrılıp `repo.applyHistoryPage(..., { append: true })` ile yazılıyor.
 * Ekran gerektiğinde diski zaten okuyor (loadOlderLocalFirst).
 */

export interface BackfillRoundResult {
  /** Tur gerçekten koştu mu. Bu dosyada tek kaynaktan çağrıldığında hep
   *  `true` — bayrak/gating kararı (CHAT_BACKFILL_ENABLED) `startBackfill`
   *  tetikleyicisinin işi, `chatDeltaSync.pullBeforeSend`'in `pullChanges`'i
   *  çağırmadan ÖNCE bayrağa bakması gibi. Alan `PullResult.ran` ile aynı
   *  şekli taşısın diye duruyor; bu turun kendisi hiçbir koşulda `false`
   *  dönmüyor. */
  ran: boolean;
  /** Bu turda gerçekten atılan (başarıyla cevaplanan) sayfa sayısı. */
  pages: number;
  /** Bu turda başarıyla cevaplanan sayfaların TOPLAM mesaj sayısı — "yeni
   *  eklenen" değil: `backfill_cursor` sıfırdan başladığından, ekranın zaten
   *  sayfaladığı bir sohbetin 1. sayfası burada da gelebilir ve o satırlar
   *  zaten diskte olsa da bu sayaca girer. */
  messages: number;
  /** Bu turda `backfill_done` işaretlenen sohbetler. */
  completed: string[];
}

function delay(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

/** 429 — kova paylaşımlı, bu kodu kullanıcının kendi isteği de üretebilir. */
function isRateLimited(error: unknown): boolean {
  return (error as { response?: { status?: number } } | undefined)?.response?.status === 429;
}

async function run(getActiveConversationId: () => string | null): Promise<BackfillRoundResult> {
  const result: BackfillRoundResult = { ran: true, pages: 0, messages: 0, completed: [] };

  // `readBackfillTargets`'a verilen tavan MAX_REQUESTS_PER_ROUND: bir turun en
  // çok bu kadar İSTEK atabileceği bilindiğinden, her hedef en az bir isteğe
  // karşılık geldiği için turun hiçbir zaman bundan fazla hedefe ihtiyacı
  // olmaz (aktif sohbet elenince bile pay kalır).
  const targets = selectBackfillTargets(
    repo.readBackfillTargets(MAX_REQUESTS_PER_ROUND),
    getActiveConversationId(),
  );

  // İki ardışık istek arasında PAGE_DELAY_MS bekleniyor — SOHBET SINIRINI
  // AŞAN bir kural: kovayı dolduran şey toplam istek hızı, hangi sohbete
  // gittiği değil. İlk istekten önce beklemiyoruz (gecikecek bir şey yok).
  let firstRequest = true;

  // `shouldStopRound`'a giden sayaç — DENEME sayısı, BAŞARILI sayfa sayısı
  // DEĞİL (bkz. backfillPolicy.shouldStopRound'daki `attemptsThisRound`
  // yorumu). `result.pages` kasıtlı AYRI kalıyor: o "kaç sayfa gerçekten
  // yazıldı" diye raporluyor, bu ise "kovadan kaç slot harcandı" diye
  // bütçeyi besliyor — ikisini aynı sayaçla ölçmek, art arda gelen genel
  // hatalarda (5xx fırtınası vb.) turu hiç durdurmazdı: her başarısız istek
  // bedava sayılırdı.
  let attempts = 0;

  for (const target of targets) {
    let cursor = target.cursor;

    for (let page = 0; page < MAX_PAGES_PER_CONVERSATION; page++) {
      // ÖNCE kontrol, SONRA istek — tam tersi (eski hâl) üç şeyi delerdi:
      // (1) offline, bir istek PATLAYIP `break`'e düştüğünde hiç görülmüyordu
      //     (okuma yalnız BAŞARILI sayfanın ardından yapılıyordu), yani
      //     bağlantı koptuğunda tur yine de kalan her hedefi tek tek
      //     deneyip hepsinde hata yiyordu; (2) turun İLK isteği hiç
      //     denetlenmiyordu — kota zaten rezervin altındaysa (kullanıcı o
      //     anda kendi sohbetini sayfalıyor) tur yine de bir slot harcardı;
      //     (3) bu da (2)'nin özel hâli: soğuk açılış probu bile BURADA,
      //     `attemptsThisRound: 0` ile değerlendiriliyor. Kontrol burada
      //     olunca probe kuralıyla ÇATIŞMIYOR: `remaining: null` ve
      //     `attemptsThisRound: 0` iken `shouldStopRound` false döner, yani
      //     ilk prob denemesi yine yapılır — sadece artık rezervin zaten
      //     altındaysa o ilk deneme de hiç yapılmaz. NOT: prob BAŞARISIZ
      //     olsa bile (ağ hatası/5xx) `attempts` yine 1'e çıkmış olacak ve
      //     bir sonraki döngüde `remaining` hâlâ null ise tur kapanacak —
      //     başarısız bir prob bütçe hakkında hiçbir şey öğretmedi, ikinci
      //     bir kör denemeye de izin verilmiyor (bkz. backfillPolicy.ts).
      if (
        shouldStopRound({
          attemptsThisRound: attempts,
          offline: isOfflineNow(),
          remaining: remainingNow(),
        })
      ) {
        return result;
      }

      if (!firstRequest) await delay(PAGE_DELAY_MS);
      firstRequest = false;
      attempts++; // İSTEK ATILIYOR — sonucu ne olursa olsun bir DENEME sayılır.

      let historyPage: repo.HistoryPage;
      try {
        historyPage = await chatService.getMessageHistory(target.conversationId, {
          cursor,
          pageSize: BACKFILL_PAGE_SIZE,
        });
      } catch (error) {
        if (isRateLimited(error)) {
          // Kova paylaşımlı: devam etmek kullanıcının kendi okumalarını da
          // 429'a sokar. Cursor'a DOKUNULMADI — bir sonraki tur burada
          // denemeye devam eder.
          return result;
        }
        // Bu sohbete özel geçici arıza (ağ/5xx/vb). Cursor'a DOKUNMA — bir
        // sonraki tur aynı yerden dener. Turu ÖLDÜRME, sıradaki hedefe geç.
        // NOT: bu catch'in dışına (applyHistoryPage/setBackfillCursor) hiçbir
        // şey SIZDIRILMAMALI — birkaç test (429, "istek patlarsa") unmock'lu
        // bir sonraki çağrının gürültüyle patlamasına güveniyor; try bloğunu
        // genişletmek o testleri sessizce köreltir.
        break;
      }

      repo.applyHistoryPage(target.conversationId, historyPage, { append: true });
      repo.setBackfillCursor(target.conversationId, historyPage.nextCursor);
      cursor = historyPage.nextCursor;
      result.pages++;
      // Bu turda SUNUCUDAN gelip diske yazılan mesaj sayısı — "backfill_cursor
      // sıfırdan başlıyor" yüzünden ekranın zaten sayfaladığı bir sohbetin
      // 1. sayfası burada da çekilebilir; o durumda bu sayaç "YENİ eklenen"
      // değil, "bu turda İŞLENEN" mesaj sayısını verir.
      result.messages += historyPage.messages?.length ?? 0;

      if (isConversationComplete(historyPage)) {
        repo.markBackfillDone(target.conversationId);
        result.completed.push(target.conversationId);
        break; // sıradaki hedefe geç
      }
    }
  }

  return result;
}

let inFlight: Promise<BackfillRoundResult> | null = null;

/**
 * Backfill turunu koşturur. `chatDeltaSync.pullChanges`'teki `inFlight`
 * kalıbının aynısı: aynı anda iki tur koşmaz — boot gecikmesi + reconnect +
 * manuel tetik aynı saniyede üst üste binebilir, ikinci çağrı birinciyi
 * BEKLEMEK yerine aynı promise'i döner.
 */
export function runBackfillRound(
  getActiveConversationId: () => string | null,
): Promise<BackfillRoundResult> {
  if (inFlight) return inFlight;
  inFlight = run(getActiveConversationId).finally(() => {
    inFlight = null;
  });
  return inFlight;
}

/** Yalnız test içindir. */
export function __resetBackfillForTests(): void {
  inFlight = null;
}
