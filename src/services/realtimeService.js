import {
  HubConnectionBuilder,
  HubConnectionState,
  LogLevel,
  HttpTransportType,
} from '@microsoft/signalr';
import { HUB_URL } from '../constants/api';
import { getCurrentAccessToken, refreshAccessToken } from './api';
import { isTokenExpiringSoon } from '../utils/jwt';

/**
 * SignalR /hubs/match singleton manager.
 *
 * Backend kontrat (MatchHub.cs):
 *   CLIENT → SERVER:
 *     SendMessage(convId, content, clientMessageId?)
 *     MarkMessagesAsRead(convId)
 *     MarkMessageDelivered(messageId)
 *     StartTyping(convId) / StopTyping(convId)
 *     JoinConversation(convId)
 *     CheckUserOnline(targetUserId)
 *
 *   SERVER → CLIENT events:
 *     MatchNotification, IncomingLike, ReceiveMessage, MessageSent, MessageDelivered, MessageEdited,
 *     MessageDeleted, MessagesRead, ReactionsChanged, UserStartedTyping, UserStoppedTyping,
 *     UserStatusChanged, UserStatusResponse, NewNotification, Error
 *
 *   IncomingLike payload: { likerUserId, likerDisplayName, likerPhotoUrl, isSuperLike, likedAt }
 *   — match OLUŞMADAN tek-yönlü like alındığında. Mutual like'ta gönderilmez
 *     (MatchNotification yeterli — backend dedup).
 *
 * Authentication: JWT querystring (?access_token=...) çünkü WebSocket transport
 * Authorization header taşıyamaz. accessTokenFactory her reconnect'te taze token okur.
 */
class RealtimeService {
  constructor() {
    this.connection = null;
    // Event listener registry — UI bileşenleri subscribe eder, lifecycle'da unsubscribe.
    this.listeners = new Map(); // eventName -> Set<callback>
    this._connectingPromise = null;
    // Logout/explicit disconnect'te onclose otomatik restart'ı bastırmak için.
    this._intentionalDisconnect = false;
  }

  // ======== Connection lifecycle ========

  async connect() {
    // Yeni bir bağlantı talebi — disconnect flag'ini temizle ki onclose restart'ı tekrar çalışsın.
    this._intentionalDisconnect = false;
    // Zaten bağlanıyor / bağlı → mevcut promise'i döndür.
    if (this.connection && this.connection.state === HubConnectionState.Connected) {
      return this.connection;
    }
    if (this._connectingPromise) return this._connectingPromise;

    const conn = new HubConnectionBuilder()
      .withUrl(HUB_URL, {
        // Token expiry check + single-flight refresh: reconnect anında expired
        // token'la WS handshake yapmayı engeller (aksi halde 401 → reconnect
        // loop → kalıcı disconnect). axios 401 interceptor ile aynı in-flight
        // promise'i paylaşır (api.js).
        accessTokenFactory: async () => {
          let token = getCurrentAccessToken();
          if (!token || isTokenExpiringSoon(token, 30)) {
            const fresh = await refreshAccessToken();
            if (fresh) token = fresh;
          }
          return token || '';
        },
        // Mobile genelde WebSocket; LongPolling fallback için bırakıyoruz.
        transport: HttpTransportType.WebSockets | HttpTransportType.LongPolling,
        skipNegotiation: false,
      })
      // Indefinite reconnect — array formu 5 deneme sonrası vazgeçip onclose
      // tetikliyordu, mobil network outage'da kullanıcı geri dönse de WS dead kalıyordu.
      // Callback formu: ilk birkaç deneme exponential, sonra 30s cap'te sürekli dener.
      // Cihaz suspended iken network OS tarafından dondurulur, retry no-op; foreground'a
      // dönünce bir sonraki retry tick bağlanır (token expired ise accessTokenFactory refresh'ler).
      .withAutomaticReconnect({
        nextRetryDelayInMilliseconds: (ctx) => {
          const schedule = [0, 2000, 5000, 10000, 30000];
          return ctx.previousRetryCount < schedule.length
            ? schedule[ctx.previousRetryCount]
            : 30000;
        },
      })
      // Server-side KeepAliveInterval=15s + ClientTimeoutInterval=60s.
      // Default client serverTimeout 30s — mobile network jitter'da tek gecikmiş ping
      // bağlantıyı boş yere kapatıyordu. 60s'e çıkarınca server timeout'u ile aligned.
      // KeepAliveInterval 15s — backend ile aynı, client tarafından da düzenli ping.
      .withServerTimeout(60000)
      .withKeepAliveInterval(15000)
      .configureLogging(LogLevel.Warning)
      .build();

    // Connection-level event'leri kayıt et.
    this._registerHubEvents(conn);

    this.connection = conn;
    this._connectingPromise = (async () => {
      try {
        await conn.start();
        console.log('🟢 SignalR connected');
        return conn;
      } catch (err) {
        console.warn('⚠️ SignalR connect failed:', err?.message);
        // Tek-shot retry: bağlanamazsak null'la, callsite tekrar deneyecek.
        this.connection = null;
        throw err;
      } finally {
        this._connectingPromise = null;
      }
    })();

    return this._connectingPromise;
  }

  async disconnect() {
    // Intentional flag → onclose auto-restart'ı bastır (logout / auth lost senaryoları).
    this._intentionalDisconnect = true;
    if (!this.connection) return;
    try {
      await this.connection.stop();
      console.log('🔴 SignalR disconnected');
    } catch (err) {
      console.warn('disconnect err:', err?.message);
    } finally {
      this.connection = null;
      this._connectingPromise = null;
      // Listener'ları temizleme: app içinden tekrar connect edilirse aynı handler'lar tekrar eklenmeli.
      // Burada listener registry'yi koruyoruz; _registerHubEvents her connect'te yeniden bağlar.
    }
  }

  isConnected() {
    return this.connection?.state === HubConnectionState.Connected;
  }

  // ======== Subscription API (UI bileşenleri için) ========

  on(eventName, callback) {
    if (!this.listeners.has(eventName)) this.listeners.set(eventName, new Set());
    this.listeners.get(eventName).add(callback);
    return () => this.off(eventName, callback);
  }

  off(eventName, callback) {
    const set = this.listeners.get(eventName);
    if (set) set.delete(callback);
  }

  _emit(eventName, ...args) {
    const set = this.listeners.get(eventName);
    if (!set) return;
    set.forEach((cb) => {
      try { cb(...args); }
      catch (err) { console.warn(`Hub listener "${eventName}" threw:`, err); }
    });
  }

  _registerHubEvents(conn) {
    // Backend SERVER → CLIENT event'lerini fan-out et.
    const events = [
      'MatchNotification',
      'IncomingLike',
      'ReceiveMessage',
      'MessageSent',
      'MessageDelivered',
      'MessageEdited',
      'MessageDeleted',
      'MessagesRead',
      'ReactionsChanged',
      'UserStartedTyping',
      'UserStoppedTyping',
      'UserStatusChanged',
      'UserStatusResponse',
      'NewNotification',
      'Error',
    ];
    events.forEach((evt) => {
      conn.on(evt, (...args) => this._emit(evt, ...args));
    });

    // Connection-level events
    conn.onreconnecting((err) => {
      console.log('🟡 SignalR reconnecting:', err?.message);
      this._emit('__connectionStateChanged', 'reconnecting');
    });
    conn.onreconnected((connId) => {
      console.log('🟢 SignalR reconnected, connId:', connId);
      this._emit('__connectionStateChanged', 'connected');
    });
    conn.onclose((err) => {
      console.log('🔴 SignalR closed:', err?.message);
      this._emit('__connectionStateChanged', 'disconnected');
      const wasIntentional = this._intentionalDisconnect;
      this.connection = null;
      this._connectingPromise = null;
      // automaticReconnect indefinite olarak tasarlandı; buraya yine de düşersek
      // (handshake-level fatal hata vb.) ve disconnect intentional değilse +
      // hâlâ authenticated isek kısa bir delay sonra manuel restart dene.
      // Token geçersizse refreshAccessToken() onAuthLost() tetikleyip token'ı
      // boşaltır → ikinci try'da getCurrentAccessToken() null gelir, dururuz.
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

  // ======== Hub method invocations ========

  async _safeInvoke(method, ...args) {
    if (!this.isConnected()) {
      // UI fallback olarak HTTP yolunu kullanabilir; burada sessizce drop.
      console.warn(`⚠️ Hub.${method} skipped: not connected`);
      return null;
    }
    try {
      return await this.connection.invoke(method, ...args);
    } catch (err) {
      console.warn(`Hub.${method} error:`, err?.message);
      throw err;
    }
  }

  sendMessage(conversationId, content, clientMessageId) {
    return this._safeInvoke('SendMessage', conversationId, content, clientMessageId || null);
  }

  markMessagesAsRead(conversationId) {
    return this._safeInvoke('MarkMessagesAsRead', conversationId);
  }

  markMessageDelivered(messageId) {
    return this._safeInvoke('MarkMessageDelivered', messageId);
  }

  startTyping(conversationId) {
    return this._safeInvoke('StartTyping', conversationId);
  }

  stopTyping(conversationId) {
    return this._safeInvoke('StopTyping', conversationId);
  }

  joinConversation(conversationId) {
    return this._safeInvoke('JoinConversation', conversationId);
  }

  checkUserOnline(targetUserId) {
    return this._safeInvoke('CheckUserOnline', targetUserId);
  }
}

// Tek instance — RealtimeService process boyunca tek connection tutsun.
const realtimeService = new RealtimeService();
export default realtimeService;
