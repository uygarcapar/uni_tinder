import { getDateLocale } from "@/shared/i18n/dateLocale";
import { parseUtc } from "@/shared/utils/dateUtc";

/**
 * Liste satırlarındaki zaman etiketi (MessagesScreen / NotificationsScreen).
 *   bugün      → 14:32   (24 saat, AM/PM yok)
 *   dün        → "Dün"
 *   < 7 gün    → "Salı"
 *   daha eski  → 14.03  ·  longDate ile "14 Mart" / "March 14"
 */
export function formatRelativeTime(
  iso: string,
  t: (key: string) => string,
  { longDate = false }: { longDate?: boolean } = {},
) {
  if (!iso) return "";
  // Server damgaları Z'siz gelebiliyor → parseUtc olmadan TR'de 3 saat geri kayar
  // ve "Dün"/gün etiketleri yanlış çıkar (bkz. shared/utils/dateUtc.ts).
  const d = parseUtc(iso);
  const now = new Date();

  const startOfDay = (date: Date) =>
    new Date(date.getFullYear(), date.getMonth(), date.getDate());
  const dayDiff = Math.floor(
    (startOfDay(now).getTime() - startOfDay(d).getTime()) /
      (1000 * 60 * 60 * 24),
  );

  const locale = getDateLocale();
  if (dayDiff <= 0) {
    // Saat dilden bağımsız 24 saat formatında — AM/PM yok.
    return d.toLocaleTimeString("tr-TR", {
      hour: "2-digit",
      minute: "2-digit",
    });
  }
  if (dayDiff === 1) return t("chat.messages.yesterday");
  if (dayDiff < 7) {
    return d.toLocaleDateString(locale, { weekday: "long" });
  }
  return d.toLocaleDateString(
    locale,
    longDate
      ? { day: "numeric", month: "long" }
      : { day: "2-digit", month: "2-digit" },
  );
}

export default formatRelativeTime;
