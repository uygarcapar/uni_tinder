/**
 * React Query anahtarları — `referralQueries.ts`ten AYRI dosyada (konvansiyon:
 * `discover/swipeKeys.ts`). Anahtarı isteyen tüketicilerin bir kısmı saf mantık
 * (AppNavigator'ın bildirim invalidation'ı, paylaşım yardımcıları); onlara
 * react-query + api zincirinin tamamını import ettirmek gereksiz bağ.
 */
export const referralKeys = {
  me: ["referral", "me"] as const,
};
