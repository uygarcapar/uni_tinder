import { AppState } from 'react-native';
import chatService from '@/features/chat/chatService';
import realtimeService from '@/features/chat/realtimeService';
import * as repo from '@/features/chat/chatRepository';
import { normalizeMessage } from '@/features/chat/normalizeMessage';
import { CHAT_DELTA_SYNC_ENABLED } from '@/shared/store/chatFlags';
import { chatErrorCodeOf, chatErrorEffect } from '@/shared/constants/responseCodes';
import type { ConversationListItemDto, MessageDto } from '@/shared/types';

/**
 * Delta-sync — "ben yokken ne değişti?"
 *
 * Bağlantı koptuktan ya da arka plandan dönüşte tek kaynak. Eskiden yakalama
 * "sohbet listesini + açık sohbetin sayfa-1'ini yeniden çek" idi; o yalnızca
 * ŞU ANKİ DURUMU söylüyordu, aradaki olayları değil. Kalıcı arşivde en acı
 * sonucu silmelerdi: silinen kayıt yanıtta hiç olmadığı için istemci mesajı
 * "hâlâ duruyor" sanıp süresiz tutuyordu.
 *
 * ── Karşılıklı dışlama (kritik) ─────────────────────────────────────────────
 * Silinmiş mesaj `messages[]`'a HİÇ girmiyor, `deletions[]`'a giriyor. Yani
 * bu iki dizi ek değil, alternatif. `deletions` handler'ı olmadan silmeler
 * tamamen görünmez olur.
 *
 * Buna karşılık `reactions`/`receipts` ayrı dizi DEĞİL ve olmamalı: ikisi de
 * mesaj satırına dokunduğu için mesaj zaten akışa giriyor ve güncel hâliyle
 * geliyor. Yerel model de mesaj-bazlı (read_at/reactions_json mesaj kolonu),
 * yani `messages[]`'ı uygulayan tek yol hepsini kapsıyor.
 */

/** Tek turda uygulanacak sayfa üst sınırı — sonsuz döngüye karşı emniyet. */
const MAX_PAGES = 50;

export interface DeltaChange {
  watermark: string | null;
  hasMore?: boolean;
  messages?: MessageDto[];
  conversations?: ConversationListItemDto[];
  deletions?: {
    messageId: string;
    conversationId: string;
    deletedAt: string;
    deletedForEveryone: boolean;
  }[];
  removedConversations?: { conversationId: string; reason?: string }[];
  retentionWindowDays?: number;
}

export interface PullResult {
  ran: boolean;
  pages: number;
  messages: number;
  deletions: number;
  /** Watermark reddedildi → atıldı, çağıran tam senkron yapmalı. */
  needsFullResync: boolean;
}

let inFlight: Promise<PullResult> | null = null;

function applyPage(page: DeltaChange, activeConversationId: string | null): void {
  // Sunucu retention politikasının TEK kaynağı; boş yanıtta da geliyor.
  repo.setRetentionWindowDays(page.retentionWindowDays);

  if (page.conversations?.length) {
    repo.upsertConversations(page.conversations, { activeConversationId });
  }

  for (const raw of page.messages ?? []) {
    if (!raw?.id || !raw?.conversationId) continue;
    repo.saveMessage(normalizeMessage(raw, raw.conversationId), raw.conversationId);
  }

  for (const d of page.deletions ?? []) {
    if (!d?.messageId) continue;
    repo.applyDeletionTombstone(d);
  }

  // Sözleşmede yer alıp almadığı netleşmedi; geldiğinde doğru davranış bu,
  // gelmediğinde kod sessizce atlanıyor.
  for (const r of page.removedConversations ?? []) {
    if (r?.conversationId) repo.removeConversationLocally(r.conversationId);
  }
}

/**
 * Watermark'tan bu yana her şeyi çeker ve uygular.
 *
 * Aynı anda yalnız bir tur: foreground + reconnect + boot aynı saniyede
 * tetiklenebiliyor ve üç paralel tur hem sunucuyu hem watermark'ı yarıştırırdı.
 */
export function pullChanges(
  getActiveConversationId: () => string | null = () => null,
): Promise<PullResult> {
  if (inFlight) return inFlight;
  inFlight = run(getActiveConversationId).finally(() => {
    inFlight = null;
  });
  return inFlight;
}

async function run(getActiveConversationId: () => string | null): Promise<PullResult> {
  const result: PullResult = {
    ran: false,
    pages: 0,
    messages: 0,
    deletions: 0,
    needsFullResync: false,
  };
  if (!CHAT_DELTA_SYNC_ENABLED) return result;

  result.ran = true;
  let watermark = repo.getSyncWatermark();

  for (let i = 0; i < MAX_PAGES; i++) {
    let page: DeltaChange;
    try {
      page = (await chatService.getChanges({ watermark })) as DeltaChange;
    } catch (error) {
      if (chatErrorEffect(chatErrorCodeOf(error)) === 'staleWatermark') {
        // Cursor'un aksine watermark GERÇEKTEN eskiyebiliyor (sunucu değişiklik
        // günlüğünü temizliyor). Telafisi tam senkron; watermark'ı atıyoruz ki
        // bir sonraki tur sıfırdan başlasın.
        repo.setSyncWatermark(null);
        result.needsFullResync = true;
        return result;
      }
      // Ağ hatası / endpoint yok (henüz deploy edilmemiş): sessizce vazgeç.
      // Watermark'a DOKUNMA — bir sonraki tur aynı yerden devam etsin.
      return result;
    }

    applyPage(page, getActiveConversationId());
    result.pages++;
    result.messages += page.messages?.length ?? 0;
    result.deletions += page.deletions?.length ?? 0;

    // Watermark SAYFA UYGULANDIKTAN SONRA ilerliyor: arada uygulama ölürse
    // aynı sayfa tekrar gelir (tüm yazımlar idempotent), atlanmaz.
    if (page.watermark) {
      watermark = page.watermark;
      repo.setSyncWatermark(page.watermark);
    }

    if (!page.hasMore) break;
    if (!page.watermark) break; // ilerlemeyen watermark → sonsuz döngü koruması
  }

  return result;
}

// ── Tetikleyiciler ──────────────────────────────────────────────────────────

/**
 * İki yakalama anı arasındaki en kısa süre. `inFlight` eşzamanlıyı kesiyor
 * ama ardışığı kesmiyor: foreground + reconnect aynı saniyede sırayla
 * gelebiliyor ve ikinci tur boş bir yanıt için bedava değil.
 */
const MIN_PULL_INTERVAL_MS = 10_000;
let lastPullAt = 0;

export interface DeltaSyncDeps {
  getActiveConversationId: () => string | null;
  /**
   * UT-6744: watermark reddedildi, delta akışı hiçbir şey söyleyemiyor.
   * Çağıran mevcut yolla tam senkron yapmalı (sohbet listesi + açık sohbetin
   * sayfa-1'i) — burada dispatch etmiyoruz ki bu modül store'dan bağımsız kalsın.
   */
  onNeedsFullResync: () => void;
}

/**
 * Yakalama tetikleyicilerini kurar; söken fonksiyonu döner.
 *
 * ── Neden AppNavigator'da değil ─────────────────────────────────────────────
 * Hub handler'ları orada yaşıyor ama abone olmak için oraya dokunmak
 * gerekmiyor: `realtimeService.on` zaten herkese açık ve unsubscribe döndürüyor.
 * Chat kendi senkronunu kendi sahipleniyor.
 */
export function startDeltaSync(deps: DeltaSyncDeps): () => void {
  if (!CHAT_DELTA_SYNC_ENABLED) return () => {};

  const fire = async (reason: string) => {
    const now = Date.now();
    if (now - lastPullAt < MIN_PULL_INTERVAL_MS) return;
    lastPullAt = now;
    const result = await pullChanges(deps.getActiveConversationId);
    if (result.needsFullResync) deps.onNeedsFullResync();
    if (__DEV__ && result.pages > 0) {
      console.log(
        `[deltaSync] ${reason}: ${result.pages} sayfa · ${result.messages} mesaj · ${result.deletions} silme`,
      );
    }
  };

  // ── Boot'ta DOĞRUDAN çekmiyoruz ─────────────────────────────────────────
  // Bu fonksiyon store modülü yüklenirken çalışıyor: redux-persist rehydrate
  // bitmemiş, token henüz yerinde olmayabilir. Oradan atılan istek en iyi
  // ihtimalle boşa gider, kötü ihtimalle 401 ile oturum yollarını tetikler.
  //
  // Bunun yerine ilk 'connected' AÇILIŞ turu sayılıyor: hub yalnız kimlik
  // doğrulandıktan sonra bağlanıyor, yani bağlantının kendisi "token yerinde"
  // demek. Boot ve reconnect'i ayırmaya gerek yok — ikisi de aynı şey:
  // "bağlantı (yeniden) kuruldu, ne kaçırdım?"
  const offConnection = realtimeService.on('__connectionStateChanged', (state: string) => {
    if (state === 'connected') void fire('connected');
  });

  // Arka plandan dönüş. Hub kısa bir arka plandan sonra bağlı kalmış olabilir;
  // o durumda 'connected' hiç yayınlanmaz ve tek yakalama anı burasıdır.
  //
  // `isConnected()` kapısı yine KİMLİK için: bağlantı yoksa token durumu da
  // belirsiz, üstelik bağlantı birazdan kurulacaksa 'connected' zaten çekecek.
  const appStateSub = AppState.addEventListener('change', (next) => {
    if (next !== 'active') return;
    if (!realtimeService.isConnected()) return;
    void fire('foreground');
  });

  return () => {
    offConnection();
    appStateSub.remove();
  };
}

/** Yalnız test içindir. */
export function __resetDeltaSyncForTests(): void {
  inFlight = null;
  lastPullAt = 0;
}
