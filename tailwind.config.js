const withOpacity = (variable) => `rgb(var(${variable}) / <alpha-value>)`;

/** @type {import('tailwindcss').Config} */
module.exports = {
  content: [
    "./App.{js,jsx,ts,tsx}",
    "./src/**/*.{js,jsx,ts,tsx}",
    "./components/**/*.{js,jsx,ts,tsx}",
  ],
  presets: [require("nativewind/preset")],
  theme: {
    extend: {
      colors: {
        primary: withOpacity("--color-primary"),
        "primary-warm": withOpacity("--color-primary-warm"),
        "primary-hot": withOpacity("--color-primary-hot"),
        "message-own": withOpacity("--color-message-own"),

        success: withOpacity("--color-success"),
        error: withOpacity("--color-error"),
        "error-strong": withOpacity("--color-error-strong"),
        warning: withOpacity("--color-warning"),
        info: withOpacity("--color-info"),

        bg: withOpacity("--color-bg"),
        "bg-deep": withOpacity("--color-bg-deep"),
        surface: withOpacity("--color-surface"),
        "surface-2": withOpacity("--color-surface-2"),
        "surface-3": withOpacity("--color-surface-3"),
        "surface-4": withOpacity("--color-surface-4"),
        "surface-5": withOpacity("--color-surface-5"),
        border: withOpacity("--color-border"),
        "border-2": withOpacity("--color-border-2"),

        text: withOpacity("--color-text"),
        "text-secondary": withOpacity("--color-text-secondary"),
        "text-muted": withOpacity("--color-text-muted"),
        "text-disabled": withOpacity("--color-text-disabled"),
        "text-placeholder": withOpacity("--color-text-placeholder"),

        "neutral-100": withOpacity("--color-neutral-100"),
        "neutral-200": withOpacity("--color-neutral-200"),
        "neutral-500": withOpacity("--color-neutral-500"),
        "neutral-700": withOpacity("--color-neutral-700"),

        "like-pink": withOpacity("--color-like-pink"),
        "error-light": withOpacity("--color-error-light"),
        "error-deep": withOpacity("--color-error-deep"),
        "success-ios": withOpacity("--color-success-ios"),

        "neon-orange": withOpacity("--color-primary-hot"),
        "neon-red": "#FF3838",
      },
    },
  },
  plugins: [],
};
