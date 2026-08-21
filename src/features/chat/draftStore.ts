/**
 * Gönderilmemiş composer metni (taslak) — sohbet başına, MMKV'de.
 *
 * ── Neden Redux değil ──────────────────────────────────────────────────────
 * Taslak her tuş vuruşunda değişen bir değer; chat bucket'ına yazmak her
 * karakterde tüm chat slice'ının referansını tazeler ve MessagesScreen dahil
 * abone olan her ekranı rerender ederdi (bkz. MessagesScreen'deki alan-bazlı
 * seçim notu). Bunun yerine küçük bir dış store: yazımlar debounce'lu,
 * aboneler yalnız useDrafts() çağıranlar.
 *
 * ── Neden chat-cache instance'ı ────────────────────────────────────────────
 * Taslak da mesaj kadar kişisel veri: logout'ta clearChatCache() ile aynı
 * dosyada silinsin istiyoruz. Anahtar öneki 'draft:' — redux-persist'in
 * 'persist:*' anahtarlarıyla çakışmaz.
 */
import { useSyncExternalStore } from "react";
import { chatCacheStorage } from "@/shared/store/mmkvStorage";

const KEY_PREFIX = "draft:";

// Composer'ın maxLength'i ile aynı — diske ondan uzunu düşemez.
const MAX_DRAFT_LEN = 2000;

const EMPTY: Record<string, string> = {};

// Snapshot: useSyncExternalStore getSnapshot'ın DEĞİŞMEDİKÇE aynı referansı
// döndürmesi şart, yoksa sonsuz rerender. Her mutasyonda yeni nesne üretilir.
let cache: Record<string, string> | null = null;
const listeners = new Set<() => void>();

function read(): Record<string, string> {
  if (cache) return cache;
  const map: Record<string, string> = {};
  try {
    for (const key of chatCacheStorage.getAllKeys()) {
      if (!key.startsWith(KEY_PREFIX)) continue;
      const value = chatCacheStorage.getString(key);
      if (value) map[key.slice(KEY_PREFIX.length)] = value;
    }
  } catch {
    // MMKV okunamıyorsa taslak yokmuş gibi devam — sohbet açılışı bloklanmaz.
  }
  cache = map;
  return map;
}

function emit() {
  for (const listener of listeners) listener();
}

export function getDraft(conversationId?: string | null): string {
  if (!conversationId) return "";
  return read()[conversationId] ?? "";
}

/**
 * Taslağı yaz. Boş / yalnız boşluk olan metin taslağı SİLER — "Taslak: " diye
 * boş bir satır göstermenin anlamı yok. Metin ham saklanır (trim'lenmez):
 * kullanıcı geri döndüğünde imleç bıraktığı yerdeki boşluktan devam etsin.
 */
export function setDraft(conversationId?: string | null, text?: string): void {
  if (!conversationId) return;
  const map = read();
  const value = (text ?? "").slice(0, MAX_DRAFT_LEN);
  const next = value.trim() ? value : "";
  const prev = map[conversationId] ?? "";
  if (prev === next) return;

  const updated = { ...map };
  try {
    if (next) {
      updated[conversationId] = next;
      chatCacheStorage.set(KEY_PREFIX + conversationId, next);
    } else {
      delete updated[conversationId];
      chatCacheStorage.remove(KEY_PREFIX + conversationId);
    }
  } catch {
    // Disk yazımı düşse bile bellek içi snapshot güncellenir: bu oturumda
    // taslak doğru görünür, yalnız cold start'a taşınmaz.
  }
  cache = updated;
  emit();
}

export function clearDraft(conversationId?: string | null): void {
  setDraft(conversationId, "");
}

/**
 * Logout choke-point'i için. clearChatCache() diski zaten boşaltıyor; burası
 * bellek içi snapshot'ı da sıfırlar — aynı process'te başka hesaba girilirse
 * önceki kullanıcının taslakları listede görünmesin.
 */
export function clearAllDrafts(): void {
  const map = read();
  const ids = Object.keys(map);
  if (!ids.length) return;
  try {
    for (const id of ids) chatCacheStorage.remove(KEY_PREFIX + id);
  } catch {
    // Yoksayılır — clearChatCache() zaten clearAll() yapmış olabilir.
  }
  cache = EMPTY;
  emit();
}

function subscribe(listener: () => void) {
  listeners.add(listener);
  return () => {
    listeners.delete(listener);
  };
}

/** conversationId → taslak metni. Referans yalnız taslak değişince değişir. */
export function useDrafts(): Record<string, string> {
  return useSyncExternalStore(subscribe, read, read);
}
