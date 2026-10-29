import chatService from '@/features/chat/chatService';
import * as repo from '@/features/chat/chatRepository';
import { isOfflineNow } from '@/shared/services/networkStatus';
import { remainingNow } from '@/shared/services/rateLimitBudget';
import {
  BACKFILL_PAGE_SIZE,
  MAX_PAGES_PER_ROUND,
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
  /** Bu turda diske yazılan toplam mesaj sayısı. */
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

  // `readBackfillTargets`'a verilen tavan MAX_PAGES_PER_ROUND: bir turun en
  // çok bu kadar sayfa isteyebileceği bilindiğinden, her hedef en az bir
  // sayfaya karşılık geldiği için turun hiçbir zaman bundan fazla hedefe
  // ihtiyacı olmaz (aktif sohbet elenince bile pay kalır).
  const targets = selectBackfillTargets(
    repo.readBackfillTargets(MAX_PAGES_PER_ROUND),
    getActiveConversationId(),
  );

  // İki ardışık sayfa isteği arasında PAGE_DELAY_MS bekleniyor — SOHBET
  // SINIRINI AŞAN bir kural: kovayı dolduran şey toplam istek hızı, hangi
  // sohbete gittiği değil. İlk istekten önce beklemiyoruz (gecikecek bir şey
  // yok).
  let firstRequest = true;

  for (const target of targets) {
    let cursor = target.cursor;

    for (let page = 0; page < MAX_PAGES_PER_CONVERSATION; page++) {
      if (!firstRequest) await delay(PAGE_DELAY_MS);
      firstRequest = false;

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
        break;
      }

      repo.applyHistoryPage(target.conversationId, historyPage, { append: true });
      repo.setBackfillCursor(target.conversationId, historyPage.nextCursor);
      cursor = historyPage.nextCursor;
      result.pages++;
      result.messages += historyPage.messages?.length ?? 0;

      let conversationDone = false;
      if (isConversationComplete(historyPage)) {
        repo.markBackfillDone(target.conversationId);
        result.completed.push(target.conversationId);
        conversationDone = true;
      }

      if (
        shouldStopRound({
          pagesThisRound: result.pages,
          offline: isOfflineNow(),
          remaining: remainingNow(),
        })
      ) {
        return result;
      }

      if (conversationDone) break; // sıradaki hedefe geç
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
