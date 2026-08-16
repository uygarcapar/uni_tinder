export const colors = {
  primary: "#ff4d3d",
  primaryWarm: "#ff4d3d",
  primaryHot: "#ff4d3d",
  messageOwn: "#ff3d3d",
  litPlus: "#ff3d3d",
  // lit shop / SuperLike sheet'lerinin zemini (gradients.shopBackdrop ile eşleşir).
  shopSurface: "#a83220",

  success: "#34D399",
  error: "#EF4444",
  errorStrong: "#fc213e",
  warning: "#F59E0B",
  info: "#3B82F6",

  bg: "#121212",
  bgDeep: "#0A0A0A",
  surface: "#1E1E1E",
  surface2: "#1F1F1F",
  surface3: "#262626",
  surface4: "#2A2A2A",
  surface5: "#1A1A1A",
  border: "#3A3A3A",
  border2: "#3E3E3E",

  text: "#FFFFFF",
  textSecondary: "#9CA3AF",
  textMuted: "#878787",
  textDisabled: "#4B5563",
  textPlaceholder: "#8B93A2",

  neutral100: "#E5E7EB",
  neutral200: "#D1D5DB",
  neutral500: "#808080",
  neutral700: "#595959",

  likePink: "#E0457B",
  // SwipeCard super-like kalbi — buradan ayarla (gradient: gradients.swipeHeart).
  swipeHeartBorder: "#ff8e7a",
  errorLight: "#FCA5A5",
  errorDeep: "#ff2b2b",
  // Context menü'deki yıkıcı aksiyonlar (sil / herkesten sil). errorLight'tan
  // ayrı bir token: o soluk pembe (#FCA5A5) hâlâ MessageBubble'ın "gönderilemedi"
  // ikonunda kullanılıyor ve orada kalması gerekiyor.
  destructive: "#FF5C5C",
  successIos: "#34C759",

  overlay: {
    whiteFaint: "rgba(255,255,255,0.1)",
    whiteSoft: "rgba(255,255,255,0.3)",
    whiteMedium: "rgba(255,255,255,0.5)",
    black: "rgba(0,0,0,0.99)",
    bgSoft: "rgba(18,18,18,0.8)",
    // bgSoft'un bir ton açığı (surface #1E1E1E tabanlı) — foto üstündeki
    // rozetlerde bgSoft zeminle fazla kaynaşıyor.
    surfaceSoft: "rgba(30,30,30,0.8)",
  },
} as const;

export const gradients = {
  swipeLike: ["#009DBD", "#57FAB6", "#046602"] as const,
  swipeNope: ["#FC0341", "#FF4D4D", "#FFEF42"] as const,
  premium: ["#FF3D3D", "#FF8F17", "#ff9a17"] as const,
  premiumAlt: ["#FF173A", "#FF4D4D", "#FC803D"] as const,
  neutralFade: ["#FFFFFF", "#E5E7EB", "#9CA3AF"] as const,
  // PurchaseModal / SuperLikePurchaseModal: yukarıdan gri → aşağıda shopSurface.
  // locations={[0, 0.4, 1]} ile kullanılır.
  shopBackdrop: ["#2e2e2e", "#2e2e2e", "#a83220"] as const,
  // WelcomeScreen zemini: upsell kartının litPlus tonundan shopSurface koyusuna geçiş.
  welcomeBackdrop: ["#ff4d3d", "#ff5d3d", "#ff7e3d"] as const,
  // ProfileScreen premium kartları (aktif üyelik + upsell): litPlus'tan
  // çapraz olarak biraz daha turuncu bir tona geçiş.
  litPlusCard: ["#ff4d3d", "#ff6038"] as const,
  // SwipeCard super-like kalbi dolgusu — buradan ayarla.
  swipeHeart: ["#fc1919", "#fc1e1e", "#ff5c33"] as const,
  // ProfileScreen SuperLike kartı: beyazdan griye. Kartın dolgusu YOK — bu
  // gradyan yalnız 2px'lik çerçevede ve kalbin yuvarlak rozetinde görünür.
  // Kart zemini sayfanınkiyle aynı (colors.bg) olduğu için metin AÇIK
  // (colors.text), rozetin içindeki kalp ise KOYU (colors.bg) çizilir.
  superLikeCard: ["#fff", "#9c9c9c"] as const,
} as const;

export type ColorToken = keyof typeof colors;
