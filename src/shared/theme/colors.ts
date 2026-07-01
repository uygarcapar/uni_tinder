export const colors = {
  primary: "#F57656",
  primaryWarm: "#FC803D",
  primaryHot: "#FF6B35",
  messageOwn: "#FF4229",

  success: "#34D399",
  error: "#EF4444",
  errorStrong: "#D10D27",
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
  textMuted: "#6B7280",
  textDisabled: "#4B5563",
  textPlaceholder: "#8B93A2",

  neutral100: "#E5E7EB",
  neutral200: "#D1D5DB",
  neutral500: "#808080",
  neutral700: "#595959",

  likePink: "#E0457B",
  errorLight: "#FCA5A5",
  errorDeep: "#DC2626",
  successIos: "#34C759",

  overlay: {
    whiteFaint: "rgba(255,255,255,0.1)",
    whiteSoft: "rgba(255,255,255,0.3)",
    whiteMedium: "rgba(255,255,255,0.5)",
    black: "rgba(0,0,0,0.99)",
    bgSoft: "rgba(18,18,18,0.8)",
  },
} as const;

export const gradients = {
  swipeLike: ["#009DBD", "#57FAB6", "#046602"] as const,
  swipeNope: ["#FC0341", "#FF4D4D", "#FFEF42"] as const,
  premium: ["#FF3D3D", "#FF8F17", "#FFC259"] as const,
  premiumAlt: ["#FF173A", "#FF4D4D", "#FC803D"] as const,
  neutralFade: ["#FFFFFF", "#E5E7EB", "#9CA3AF"] as const,
} as const;

export type ColorToken = keyof typeof colors;
