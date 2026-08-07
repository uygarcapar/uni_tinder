/**
 * React Query anahtarları — `swipeQueries.ts`ten AYRI dosyada: o modül
 * react-redux/react-query hook'ları çekiyor, oysa anahtarlara ihtiyaç duyan
 * bazı tüketiciler (ör. superlikeRedeem) saf mantık. Sabit için tüm hook
 * zincirini import ettirmek gereksiz bağ (ve testte ESM transform derdi).
 */
export const swipeKeys = {
  matches: ["swipe", "matches"] as const,
  filters: ["swipe", "filters"] as const,
  stats: ["swipe", "stats"] as const,
};
