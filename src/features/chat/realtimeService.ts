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
 *     NewNotification, Error, ForceLogout
 */
class RealtimeService {
  private connection: HubConnection | null = null;
  private listeners: Map<string, Set<EventCallback>> = new Map();
  private _connectingPromise: Promise<HubConnection> | null = null;
  private _intentionalDisconnect = false;

  async connect(): Promise<HubConnection> {
    this._intentionalDisconnect = false;
    if (this.connection && this.connection.state === HubConnectionState.Connected) {
      return this.connection;
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
        console.log('🟢 SignalR connected');
        return conn;
      } catch (err: any) {
        console.warn('⚠️ SignalR connect failed:', err?.message);
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
      console.log('🔴 SignalR disconnected');
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
      'UserStatusChanged', 'UserStatusResponse', 'NewNotification', 'Error',
      'ForceLogout',
    ];
    events.forEach((evt) => {
      conn.on(evt, (...args) => this._emit(evt, ...args));
    });

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
