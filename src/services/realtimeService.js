import {
  HubConnectionBuilder,
  HubConnectionState,
  LogLevel,
  HttpTransportType,
} from '@microsoft/signalr';
import { HUB_URL } from '../constants/api';
import { getCurrentAccessToken } from './api';

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
 *     MatchNotification, ReceiveMessage, MessageSent, MessageDelivered, MessageEdited,
 *     MessageDeleted, MessagesRead, ReactionsChanged, UserStartedTyping, UserStoppedTyping,
 *     UserStatusChanged, UserStatusResponse, NewNotification, Error
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
  }

  // ======== Connection lifecycle ========

  async connect() {
    // Zaten bağlanıyor / bağlı → mevcut promise'i döndür.
    if (this.connection && this.connection.state === HubConnectionState.Connected) {
      return this.connection;
    }
    if (this._connectingPromise) return this._connectingPromise;

    const conn = new HubConnectionBuilder()
      .withUrl(HUB_URL, {
        // Token her reconnect denemesinde fresh okunur (axios refresh ile sync).
        accessTokenFactory: () => getCurrentAccessToken() || '',
        // Mobile genelde WebSocket; LongPolling fallback için bırakıyoruz.
        transport: HttpTransportType.WebSockets | HttpTransportType.LongPolling,
        skipNegotiation: false,
      })
      // Default reconnect aralıkları: 0, 2s, 10s, 30s. Sonra retryContext ile özelleştir.
      .withAutomaticReconnect([0, 2000, 5000, 10000, 30000])
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
