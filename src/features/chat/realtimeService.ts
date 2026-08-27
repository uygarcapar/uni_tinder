import {
  HubConnection,
  HubConnectionBuilder,
  HubConnectionState,
  LogLevel,
  HttpTransportType,
} from '@microsoft/signalr';
import { HUB_URL } from '@/shared/constants/api';
import { getCurrentAccessToken, refreshAccessToken } from '@/shared/services/api';
import { isTokenExpiringSoon } from '@/shared/utils/jwt';
import { devLog } from '@/shared/utils/devLog';
import { shortNetError } from '@/shared/utils/netError';
import { normalizeUtcFields } from '@/shared/utils/dateUtc';

type EventCallback = (...args: any[]) => void;

/**
 * SignalR /hubs/match singleton manager.
 *
 * Backend kontrat (MatchHub.cs):
 *   CLIENT → SERVER:
 *     SendMessage(convId, content, clientMessageId?)
 *     MarkMessagesAsRead(convId) / MarkMessageDelivered(messageId)
 *     StartTyping(convId) / StopTyping(convId)
 *     JoinConversation(convId) / CheckUserOnline(targetUserId)
 *
 *   SERVER → CLIENT events:
 *     MatchNotification, IncomingLike, ReceiveMessage, MessageSent, MessageDelivered,
 *     MessageEdited, MessageDeleted, MessagesRead, ReactionsChanged,
 *     UserStartedTyping, UserStoppedTyping, UserStatusChanged, UserStatusResponse,
 *     ConversationDeactivated, ConversationRestored, ConversationHistoryRevealed,
 *     NewNotification, Error, ForceLogout, SubscriptionChanged,
 *     PhotoModerationChanged
 */
class RealtimeService {
  private connection: HubConnection | null = null;
  private listeners: Map<string, Set<EventCallback>> = new Map();
  private _connectingPromise: Promise<HubConnection> | null = null;
  private _intentionalDisconnect = false;

  async connect(): Promise<HubConnection> {
    this._intentionalDisconnect = false;
    // Canlı YA DA kendini toparlamakta olan bir bağlantı varsa yenisini KURMA.
    //
    // Eskiden guard yalnız `Connected`'ı kapsıyordu. Arka plandan dönüşte soket
    // tipik olarak `Reconnecting` durumunda oluyor ve `_connectingPromise` ilk
    // start'tan sonra null'a çekildiği için AppState 'active' bloğundaki
    // connect() çağrısı İKİNCİ bir HubConnection kuruyordu. Terk edilen
    // bağlantı stop() edilmediği gibi, aşağıdaki retry programı hiç null
    // dönmediğinden (sonsuz otomatik reconnect) kendiliğinden de ölmüyordu:
    // her foreground bir bağlantı daha sızdırıyor, hepsi aynı listener
    // haritasına yazdığı için ForceLogout dahil her event birden çok kez
    // işleniyordu.
    if (this.connection) {
      const state = this.connection.state;
      if (
        state === HubConnectionState.Connected ||
        state === HubConnectionState.Connecting ||
        state === HubConnectionState.Reconnecting
      ) {
        return this.connection;
      }
    }
    if (this._connectingPromise) return this._connectingPromise;

    const conn = new HubConnectionBuilder()
      .withUrl(HUB_URL, {
        // Token expiry check + single-flight refresh: reconnect anında expired
        // token'la WS handshake yapmayı engeller.
        accessTokenFactory: async () => {
          let token = getCurrentAccessToken();
          if (!token || isTokenExpiringSoon(token, 30)) {
            const fresh = await refreshAccessToken();
            if (fresh) token = fresh;
          }
          return token || '';
        },
        transport: HttpTransportType.WebSockets | HttpTransportType.LongPolling,
        skipNegotiation: false,
      })
      .withAutomaticReconnect({
        nextRetryDelayInMilliseconds: (ctx) => {
          const schedule = [0, 2000, 5000, 10000, 30000];
          return ctx.previousRetryCount < schedule.length
            ? schedule[ctx.previousRetryCount]
            : 30000;
        },
      })
      .withServerTimeout(60000)
      .withKeepAliveInterval(15000)
      .configureLogging(LogLevel.Warning)
      .build();

    this._registerHubEvents(conn);
    this.connection = conn;

    this._connectingPromise = (async () => {
      try {
        await conn.start();
        devLog('🟢 SignalR connected');
        // Otomatik reconnect tükenip bağlantı KAPANDIYSA (onclose → 5 sn sonra
        // yeni bir HubConnection) `onreconnected` bir daha hiç çalışmıyor: o
        // callback yalnız aynı bağlantının kendini toparlamasında ateşleniyor.
        // Bu durumda kopukluk penceresinde kaçan her şey (mesaj, okundu bilgisi,
        // SubscriptionChanged) sessizce kayıp kalıyordu. Durum yayını burada da
        // yapılıyor; ilk açılışta zararsız — dinleyici yalnız ÖNCESİNDE bir
        // kopukluk gördüyse telafi turunu çalıştırıyor.
        if (this.connection === conn) {
          this._emit('__connectionStateChanged', 'connected');
        }
        return conn;
      } catch (err: any) {
        console.warn('⚠️ SignalR connect failed:', shortNetError(err));
        this.connection = null;
        throw err;
      } finally {
        this._connectingPromise = null;
      }
    })();

    return this._connectingPromise;
  }

  async disconnect(): Promise<void> {
    this._intentionalDisconnect = true;
    if (!this.connection) return;
    try {
      await this.connection.stop();
      devLog('🔴 SignalR disconnected');
    } catch (err: any) {
      console.warn('disconnect err:', err?.message);
    } finally {
      this.connection = null;
      this._connectingPromise = null;
    }
  }

  isConnected(): boolean {
    return this.connection?.state === HubConnectionState.Connected;
  }

  on(eventName: string, callback: EventCallback): () => void {
    if (!this.listeners.has(eventName)) this.listeners.set(eventName, new Set());
    this.listeners.get(eventName)!.add(callback);
    return () => this.off(eventName, callback);
  }

  off(eventName: string, callback: EventCallback): void {
    const set = this.listeners.get(eventName);
    if (set) set.delete(callback);
  }

  private _emit(eventName: string, ...args: any[]): void {
    const set = this.listeners.get(eventName);
    if (!set) return;
    set.forEach((cb) => {
      try { cb(...args); }
      catch (err) { console.warn(`Hub listener "${eventName}" threw:`, err); }
    });
  }

  private _registerHubEvents(conn: HubConnection): void {
    const events = [
      'MatchNotification', 'IncomingLike', 'ReceiveMessage', 'MessageSent',
      'MessageDelivered', 'MessageEdited', 'MessageDeleted', 'MessagesRead',
      'ReactionsChanged', 'UserStartedTyping', 'UserStoppedTyping',
      'UserStatusChanged', 'UserStatusResponse',
      // Unmatch/rematch kapıları: sohbet kapandı / geri alma penceresinde geri
      // alındı / rematch sonrası eski mesajlar çift için açıldı.
      'ConversationDeactivated', 'ConversationRestored', 'ConversationHistoryRevealed',
      'NewNotification', 'Error',
      'ForceLogout',
      // Premium durumu değişti (admin grant/revoke, mağaza webhook'u, /sync
      // upgrade/downgrade). Gövde `/api/subscription/status` ile birebir aynı,
      // ek olarak `reason` + `at` taşıyor — ek fetch gerektirmiyor.
      // Kullanıcının TÜM cihazlarına gidiyor (Clients.User).
      'SubscriptionChanged',
      // Bir fotoğrafın moderasyon kararı değişti (admin onay/red, rescan,
      // itiraz sonucu). Gövde GET'in döndürdüğü kanonik `moderation` +
      // `profileVisibility` bloklarıyla BİREBİR aynı → ek fetch gerekmiyor.
      // Öncesinde bu kanal hiç yoktu: admin bir fotoğrafı reddettiğinde audit
      // log yazılıyor ama kullanıcıya hiçbir şey ulaşmıyordu.
      'PhotoModerationChanged',
    ];
    // Bu handler'lar `conn`'u closure'da tutuyor; `this.connection` ise zamanla
    // BAŞKA bir bağlantıya işaret edebiliyor. Aktif olmayan bir bağlantıdan
    // gelen hiçbir şey dışarı sızmamalı — yoksa geçmişte sızmış bir soket
    // event'leri ikinci kez yayınlar, durum değişimini yanlış raporlar veya
    // (en kötüsü) kapanırken CANLI bağlantının referansını null'lar.
    const isActive = () => this.connection === conn;

    events.forEach((evt) => {
      // Hub payload'ları da REST gibi Z'siz UTC gönderebiliyor (kontrat §8.3).
      // Normalizasyon BURADA yapılır: tüm dinleyiciler (AppNavigator dispatch'leri,
      // ChatScreen, NotificationsScreen) tek ve doğru formatı görür.
      conn.on(evt, (...args) => {
        if (!isActive()) return;
        this._emit(evt, ...args.map((a) => normalizeUtcFields(a)));
      });
    });

    conn.onreconnecting((err) => {
      devLog('🟡 SignalR reconnecting:', err?.message);
      if (!isActive()) return;
      this._emit('__connectionStateChanged', 'reconnecting');
    });
    conn.onreconnected((connId) => {
      devLog('🟢 SignalR reconnected, connId:', connId);
      if (!isActive()) return;
      this._emit('__connectionStateChanged', 'connected');
    });
    conn.onclose((err) => {
      devLog('🔴 SignalR closed:', err?.message);
      // Bayat bağlantının kapanışı aktif oturumu etkilemez: ne durum yayınlar,
      // ne `this.connection`'ı siler, ne de yeniden bağlanma tetikler.
      if (!isActive()) return;
      this._emit('__connectionStateChanged', 'disconnected');
      const wasIntentional = this._intentionalDisconnect;
      this.connection = null;
      this._connectingPromise = null;
      if (wasIntentional) return;
      setTimeout(() => {
        if (!this._intentionalDisconnect && getCurrentAccessToken()) {
          this.connect().catch((e) =>
            console.warn('Hub restart after close failed:', e?.message),
          );
        }
      }, 5000);
    });
  }

  private async _safeInvoke(method: string, ...args: any[]): Promise<any> {
    if (!this.isConnected()) {
      console.warn(`⚠️ Hub.${method} skipped: not connected`);
      return null;
    }
    try {
      return await this.connection!.invoke(method, ...args);
    } catch (err: any) {
      console.warn(`Hub.${method} error:`, err?.message);
      throw err;
    }
  }

  sendMessage(conversationId: string, content: string, clientMessageId?: string | null) {
    return this._safeInvoke('SendMessage', conversationId, content, clientMessageId || null);
  }

  markMessagesAsRead(conversationId: string) {
    return this._safeInvoke('MarkMessagesAsRead', conversationId);
  }

  markMessageDelivered(messageId: string) {
    return this._safeInvoke('MarkMessageDelivered', messageId);
  }

  startTyping(conversationId: string) {
    return this._safeInvoke('StartTyping', conversationId);
  }

  stopTyping(conversationId: string) {
    return this._safeInvoke('StopTyping', conversationId);
  }

  joinConversation(conversationId: string) {
    return this._safeInvoke('JoinConversation', conversationId);
  }

  checkUserOnline(targetUserId: string) {
    return this._safeInvoke('CheckUserOnline', targetUserId);
  }
}

const realtimeService = new RealtimeService();
export default realtimeService;
