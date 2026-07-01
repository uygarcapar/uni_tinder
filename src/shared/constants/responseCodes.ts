// Frontend code → {metin, aksiyon, davranış} sözlüğü.
// Kaynak: ClickUp "Frontend: Discovery & Response" → "API Contract — Master" task'ı.
// Backend Errors.cs canonical katalog; bu dosya o kataloğun frontend ayna kopyası.
//
// Kural (Task 🔤): UI metni backend message'ına değil code'a bağlanır. message
// yalnızca bilinmeyen code geldiğinde fallback. Yeni kod eklendiğinde önce
// backend Errors.cs, sonra burası güncellenir.

import type {
  EmptyReason,
  PaywallType,
  ResponseCode,
} from "@/shared/types";

// Aksiyon tipleri — empty-state action butonu ya da paywall CTA'sının nereye
// gideceğini soyut bir intent olarak ifade eder. UI tarafı switch'le ele alır.
// Ekran-bağımsız tutuldu (DiscoverScreen, ChatScreen, ProfileScreen aynı code
// ile farklı navigasyon yapabilsin).
export type CodeAction =
  | { kind: "openFilters" }
  | { kind: "expandRadius" }
  | { kind: "completeProfile" }
  | { kind: "openPaywall"; paywallType?: PaywallType }
  | { kind: "contactSupport" }
  | { kind: "retry" }
  | { kind: "dismiss" };

export interface CodeEntry {
  code: ResponseCode;
  emptyReason?: EmptyReason;
  // Kısa, kullanıcıya gösterilecek TR başlık. Backend
  // emptyReasonMessage daha uzun gelirse onu fallback olarak kullan.
  title: string;
  // Buton etiketi (TR). Backend emptyReasonAction varsa onu tercih et;
  // boşsa burası fallback.
  actionLabel: string;
  action: CodeAction;
  // PoolWarming gibi geçici durumlar için: empty-state polling
  // tetiklensin mi. Diğer kodlarda blind retry yapılmamalı.
  autoRetry?: boolean;
}

// Master tablosu — Task 📚 + 🗺️ birleştirilmiş hâli.
// Object literal yerine sıralı array: yeni kod sonuna eklenir, lookup map
// aşağıda türetilir.
const CODE_ENTRIES: CodeEntry[] = [
  {
    code: "UT-6001",
    emptyReason: "NoCandidatesInRadius",
    title: "Yakınında şu an gösterecek kimse yok",
    actionLabel: "Mesafeyi Genişlet",
    action: { kind: "expandRadius" },
  },
  {
    code: "UT-6002",
    emptyReason: "AllCandidatesSeen",
    title: "Görebileceklerinin hepsini gördün",
    actionLabel: "Daha Sonra Bak",
    action: { kind: "dismiss" },
  },
  {
    code: "UT-6003",
    emptyReason: "FiltersTooStrict",
    title: "Filtrelerin çok dar",
    actionLabel: "Filtreleri Düzenle",
    action: { kind: "openFilters" },
  },
  {
    code: "UT-6004",
    emptyReason: "ProfileIncomplete",
    title: "Önce profilini tamamla",
    actionLabel: "Profili Tamamla",
    action: { kind: "completeProfile" },
  },
  {
    code: "UT-6005",
    emptyReason: "AccountRestricted",
    title: "Hesabın geçici olarak kısıtlı",
    actionLabel: "Destek",
    action: { kind: "contactSupport" },
  },
  {
    code: "UT-6006",
    emptyReason: "PoolWarming",
    title: "Aday havuzu hazırlanıyor",
    actionLabel: "Tekrar Dene",
    action: { kind: "retry" },
    autoRetry: true,
  },
  {
    code: "UT-3001",
    emptyReason: "SwipeLimitReached",
    title: "Günlük swipe limitin doldu",
    actionLabel: "Premium'u İncele",
    action: { kind: "openPaywall", paywallType: "SWIPE_LIMIT" },
  },
];

const CODE_MAP: Record<string, CodeEntry> = Object.fromEntries(
  CODE_ENTRIES.map((e) => [e.code, e]),
);

// emptyReason enum → entry (UT-xxxx kodu null gelirse fallback).
const EMPTY_REASON_MAP: Partial<Record<EmptyReason, CodeEntry>> =
  Object.fromEntries(
    CODE_ENTRIES.filter((e) => e.emptyReason).map((e) => [e.emptyReason!, e]),
  );

// Resolver — code önce, emptyReason fallback. İkisi de yoksa null.
// Bilinmeyen code geldiğinde de null döner; çağıran taraf backend message'ını
// fallback olarak göstermeli (Task 🔤 kabul kriteri).
export function resolveCode(
  code: string | null | undefined,
  emptyReason?: EmptyReason | null,
): CodeEntry | null {
  if (code && CODE_MAP[code]) return CODE_MAP[code];
  if (emptyReason && emptyReason !== "None" && EMPTY_REASON_MAP[emptyReason]) {
    return EMPTY_REASON_MAP[emptyReason]!;
  }
  return null;
}

// Paywall tip sabitleri (Task 💳). Backend bu 6 string'i döner; frontend
// switch yaparken `as const` literal'larla kontrol eder.
export const PAYWALL_TYPES = {
  SWIPE_LIMIT: "SWIPE_LIMIT",
  SUPER_LIKE_LIMIT: "SUPER_LIKE_LIMIT",
  UNDO_LIMIT: "UNDO_LIMIT",
  MISSED_MATCH_RECOVERY_LIMIT: "MISSED_MATCH_RECOVERY_LIMIT",
  PREMIUM_FILTERS: "PREMIUM_FILTERS",
  CHAT_QUOTA_EXHAUSTED: "CHAT_QUOTA_EXHAUSTED",
} as const satisfies Record<PaywallType, PaywallType>;
