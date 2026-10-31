import { AppState } from 'react-native';
import chatService from '@/features/chat/chatService';
import realtimeService from '@/features/chat/realtimeService';
import * as repo from '@/features/chat/chatRepository';
import { normalizeMessage } from '@/features/chat/normalizeMessage';
import { dropCachedMedia } from '@/features/chat/mediaCache';
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

/**
 * Turun DİSKTE ne değiştirdiği — ekrana taşıma için (bkz.
 * chatHydrate.applyDeltaFromLocal).
 *
 * Mesaj gövdeleri KASTEN taşınmıyor, yalnız hangi sohbete dokunulduğu: ekrana
 * giden kopya diskten yeniden okunuyor çünkü sunucu kopyası `clientMessageId`
 * ve `_localUri` taşımıyor (gerekçe: chatSlice.applyLocalDelta).
 */
export interface AppliedChanges {
  /** Mesaj/sohbet satırı yazılan sohbetler — tekilleştirilmiş. */
  conversationIds: string[];
  /** Sıcak pencerenin DIŞINDA kalabilecek satırlar için silme olayları. */
  deletions: NonNullable<DeltaChange['deletions']>;
  removedConversationIds: string[];
}

export interface PullResult {
  ran: boolean;
  pages: number;
  messages: number;
  deletions: number;
  /** Watermark reddedildi → atıldı, çağıran tam senkron yapmalı. */
  needsFullResync: boolean;
  /** Diskte ne değişti — hiç tur koşmadıysa boş. */
  applied: AppliedChanges;
}

let inFlight: Promise<PullResult> | null = null;

function applyPage(
  page: DeltaChange,
  activeConversationId: string | null,
  touched: Set<string>,
  applied: AppliedChanges,
): void {
  // Sunucu retention politikasının TEK kaynağı; boş yanıtta da geliyor.
  repo.setRetentionWindowDays(page.retentionWindowDays);

  if (page.conversations?.length) {
    repo.upsertConversations(page.conversations, { activeConversationId });
    for (const c of page.conversations) {
      if (c?.conversationId) touched.add(c.conversationId);
    }
  }

  for (const raw of page.messages ?? []) {
    if (!raw?.id || !raw?.conversationId) continue;
    repo.saveMessage(normalizeMessage(raw, raw.conversationId), raw.conversationId);
    touched.add(raw.conversationId);
  }

  for (const d of page.deletions ?? []) {
    if (!d?.messageId) continue;
    repo.applyDeletionTombstone(d);
    // UT-6606: delta'dan gelen "herkesten silindi" de önbellek kopyasını
    // götürmek zorunda — aksi halde yalnız realtime (chatMirrorMiddleware)
    // yoldan geçen silmeler temizlenir, offline'dayken kaçırılan bir silme
    // delta'dan geldiğinde dosya diskte yetim kalır.
    if (d.deletedForEveryone) dropCachedMedia(d.messageId);
    if (d.conversationId) touched.add(d.conversationId);
    applied.deletions.push(d);
  }

  // Sözleşmede yer alıp almadığı netleşmedi; geldiğinde doğru davranış bu,
  // gelmediğinde kod sessizce atlanıyor.
  for (const r of page.removedConversations ?? []) {
    if (!r?.conversationId) continue;
    repo.removeConversationLocally(r.conversationId);
    applied.removedConversationIds.push(r.conversationId);
    touched.delete(r.conversationId);
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

/**
 * Uçuştaki tur varsa onu döndürür — YOKSA BAŞLATMAZ.
 *
 * MODÜL İÇİ: tek çağıranı aşağıdaki `pullBeforeSend` (outbox eskiden bunu
 * doğrudan kullanıyordu, artık `pullBeforeSend`ten geçiyor). Dışa açılırsa
 * "tur açmayan" bu dalın `pullBeforeSend`in taban kontrolünü atlamak için
 * kullanılması kolaylaşır.
 *
 * Ayrı bir fonksiyon olmasının sebebi `inFlight`in yalın okunmasının bir
 * ANLAMI olması: gönderim turu, aynı anda koşan bir yakalama turunu beklemek
 * zorunda. Sebebi somut — delta turu bizim mesajımızı geri getirdiğinde satır
 * `send_state='sent'`e dönüyor (UPSERT'in varsayılanı), yani "ack'i kaybolmuş
 * ama aslında gitmiş" mesaj kuyruktan KENDİLİĞİNDEN düşüyor. Önce beklemek,
 * gereksiz bir `send` isteğini ve dakikada 30'luk sınırdan bir hak harcamayı
 * önlüyor.
 */
function inFlightPull(): Promise<PullResult> | null {
  return inFlight;
}

async function run(getActiveConversationId: () => string | null): Promise<PullResult> {
  const result: PullResult = {
    ran: false,
    pages: 0,
    messages: 0,
    deletions: 0,
    needsFullResync: false,
    applied: { conversationIds: [], deletions: [], removedConversationIds: [] },
  };
  if (!CHAT_DELTA_SYNC_ENABLED) return result;

  result.ran = true;
  // Sohbet kimlikleri SAYFALAR BOYUNCA tekilleştiriliyor: aynı sohbet 50
  // sayfanın her birinde geçebilir, ekrana taşıma onu bir kez okumalı.
  const touched = new Set<string>();
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
        result.applied.conversationIds = [...touched];
        return result;
      }
      // Ağ hatası / endpoint yok (henüz deploy edilmemiş): sessizce vazgeç.
      // Watermark'a DOKUNMA — bir sonraki tur aynı yerden devam etsin.
      // Önceki sayfalar DİSKE YAZILDI: onları ekrana taşımaktan vazgeçmek
      // "diskte var, ekranda yok" durumunu geri getirirdi.
      result.applied.conversationIds = [...touched];
      return result;
    }

    applyPage(page, getActiveConversationId(), touched, result.applied);
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

  result.applied.conversationIds = [...touched];
  return result;
}

// ── Tetikleyiciler ──────────────────────────────────────────────────────────

/**
 * İki yakalama anı arasındaki en kısa süre. `inFlight` eşzamanlıyı kesiyor
 * ama ardışığı kesmiyor: foreground + reconnect aynı saniyede sırayla
 * gelebiliyor ve ikinci tur boş bir yanıt için bedava değil.
 */
export const MIN_PULL_INTERVAL_MS = 10_000;
let lastPullAt = 0;

/**
 * Foreground'da periyodik tazelik turunun aralığı. `MIN_PULL_INTERVAL_MS`ten
 * UZUN olmak zorunda (bkz. Review Focus 3): kısa olsaydı her atış `fire()`ın
 * kendi kısıtlayıcısına çarpıp sessizce yutulurdu — görünürde çalışan, aslında
 * hiçbir şey yapmayan bir zamanlayıcı.
 *
 * Paylaşımlı kova (`messaging_default` = 200 istek/60sn, TÜM
 * MessagesController, kullanıcı başına) zaten geçmiş sayfalama + backfill (80
 * rezerv) + mutasyon kuyruğu (20 rezerv) tarafından paylaşılıyor; bu tur
 * DÖRDÜNCÜ tüketici. 3 dakikalık bir periyot kovaya göre ihmal edilebilir
 * (dakikada en fazla 1/3 istek) ama hub bağlı kalıp bir event kaçırıldığında
 * ekranı dakikalar içinde taze tutmaya yetiyor — roadmap'in kendi ifadesiyle
 * "bugün bilinen bir şikâyet üretmeyen" bir deliği kapatmak için yeterince
 * seyrek. CİHAZDA HİÇ ÖLÇÜLMEDİ: pil etkisi bilinmiyor.
 */
export const PERIODIC_PULL_INTERVAL_MS = 180_000;

/**
 * Gönderimden önce yakalama turu garantiler. Tek çağıranı
 * `outbox.flushOutbox`.
 *
 * `inFlightPull()`in aksine burası tur AÇABİLİR: uçuşta tur yoksa ve
 * `fire()`in kullandığı AYNI `lastPullAt` tabanın (MIN_PULL_INTERVAL_MS)
 * dışındaysa yeni bir yakalama turu başlatıp onu döndürür — backend'in açık
 * ricası, çünkü delta turu bizim mesajımızı geri getirdiğinde satır
 * kendiliğinden `sent`e dönüyor (UPSERT'in varsayılanı) ve mükerrer `send`
 * isteği hem gereksiz hem de dakikada 30'luk sayaçtan bir hak harcıyor.
 * Taban içindeyse `null`: outbox her tetikte (ağ/foreground/reconnect/timer)
 * koşuyor, buradan koşulsuz tur açmak `/changes` çağrılarını da o sıklıkta
 * çoğaltırdı — tabanın kendisi tam bunu önlemek için var.
 */
export function pullBeforeSend(
  getActiveConversationId: () => string | null = () => null,
): Promise<PullResult | null> {
  const existing = inFlightPull();
  if (existing) return existing;

  // Kill-switch. Ağ tarafı `run()`ın ilk satırında zaten kapanıyor, yani bu
  // satır olmadan da bayrak kapalıyken `/changes`e istek GİTMİYORDU; kapı
  // burada da olsun, çünkü (a) kapalı bayrakla boşa bir tur açmanın
  // (promise + `lastPullAt` ilerletmesi) anlamı yok, (b) `startDeltaSync`
  // dışındaki TEK tur başlatan yol burası ve kill-switch'in burada görünür
  // olmaması okuyanı "demek ki gönderim yolu bayrağa tabi değil" sonucuna
  // götürüyordu. Uçuştaki tur yukarıda zaten döndürüldü: bayrak gönderim
  // turunun BEKLEME sözleşmesini bozmuyor, yalnız tur AÇMAYI kapılıyor.
  if (!CHAT_DELTA_SYNC_ENABLED) return Promise.resolve(null);

  const now = Date.now();
  if (now - lastPullAt < MIN_PULL_INTERVAL_MS) return Promise.resolve(null);

  lastPullAt = now;
  return pullChanges(getActiveConversationId);
}

export interface DeltaSyncDeps {
  getActiveConversationId: () => string | null;
  /**
   * UT-6744: watermark reddedildi, delta akışı hiçbir şey söyleyemiyor.
   * Çağıran mevcut yolla tam senkron yapmalı (sohbet listesi + açık sohbetin
   * sayfa-1'i) — burada dispatch etmiyoruz ki bu modül store'dan bağımsız kalsın.
   */
  onNeedsFullResync: () => void;
  /**
   * Tur diske yazdı — çağıran bunu ekrana taşıyor (chatHydrate
   * .applyDeltaFromLocal). Opsiyonel ve yine store'dan bağımsız: bu modül neyin
   * değiştiğini söylüyor, Redux'a dokunan taraf store'u olan taraf.
   *
   * Tam senkron gereken turda da çağrılıyor: o ana kadarki sayfalar DİSKE
   * yazılmış durumda, ekrana taşınmazsa yine ayrışırdı.
   */
  onApplied?: (applied: AppliedChanges) => void;
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
    // Ekrana taşıma, tam-senkron dalından ÖNCE: diske inen ne varsa görünür
    // olsun, ağ turunu beklemesin.
    if (result.applied.conversationIds.length || result.applied.removedConversationIds.length) {
      deps.onApplied?.(result.applied);
    }
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

  // ── Periyodik tazelik turu (Faz 6) ───────────────────────────────────────
  // Hub bağlı kalıp bir event kaçırırsa yeni bir 'connected' hiç gelmiyor;
  // kullanıcı uygulamayı arkaya atıp dönene kadar ekran bayat kalıyordu. Bu
  // zamanlayıcı o deliği kapatıyor — YENİ bir tur mantığı yok, yalnız `fire()`a
  // seyrek bir ek tetikleyici. Yaşam döngüsü foreground'a bağlı: 'active'te
  // kuruluyor, background/inactive'te temizleniyor (Review Focus 1).
  let periodicTimer: ReturnType<typeof setInterval> | null = null;

  const stopPeriodic = () => {
    if (periodicTimer) {
      clearInterval(periodicTimer);
      periodicTimer = null;
    }
  };

  const startPeriodic = () => {
    if (periodicTimer) return; // zaten kurulu — ikinci interval'a gerek yok
    periodicTimer = setInterval(() => {
      // Bağlantı kontrolü burada, `fire()`ın throttle'ının İÇİNDE DEĞİL: ikisi
      // ayrı kısıt. Kopuk hatta istek atmak paylaşımlı kovadan boşa bir slot
      // yakar; o hâli zaten 'connected' tetiği kapatıyor (Review Focus 4).
      if (!realtimeService.isConnected()) return;
      void fire('periodic');
    }, PERIODIC_PULL_INTERVAL_MS);
  };

  // Arka plandan dönüş. Hub kısa bir arka plandan sonra bağlı kalmış olabilir;
  // o durumda 'connected' hiç yayınlanmaz ve tek yakalama anı burasıdır.
  //
  // `isConnected()` kapısı yine KİMLİK için: bağlantı yoksa token durumu da
  // belirsiz, üstelik bağlantı birazdan kurulacaksa 'connected' zaten çekecek.
  const appStateSub = AppState.addEventListener('change', (next) => {
    if (next !== 'active') {
      stopPeriodic();
      return;
    }
    startPeriodic();
    if (!realtimeService.isConnected()) return;
    void fire('foreground');
  });

  return () => {
    offConnection();
    appStateSub.remove();
    stopPeriodic();
  };
}

/** Yalnız test içindir. */
export function __resetDeltaSyncForTests(): void {
  inFlight = null;
  lastPullAt = 0;
}
