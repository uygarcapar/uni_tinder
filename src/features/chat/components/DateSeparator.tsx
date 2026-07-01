import { View, Text } from "react-native";
import { colors } from "../../../shared/theme/colors";

/**
 * Inverted FlatList içinde mesaj grupları arasında tarih ayraç.
 * Bugün / Dün / DD MMM YYYY formatları.
 */
export default function DateSeparator({ label }: any) {
  if (!label) return null;
  return (
    <View className="items-center my-3">
      <View className="">
        <Text style={{ color: colors.textPlaceholder, fontSize: 13, fontWeight: "500" }}>
          {label}
        </Text>
      </View>
    </View>
  );
}

// ChatScreen useMemo ile messages'a iliştirir.
const TR_MONTHS = [
  "Oca",
  "Şub",
  "Mar",
  "Nis",
  "May",
  "Haz",
  "Tem",
  "Ağu",
  "Eyl",
  "Eki",
  "Kas",
  "Ara",
];

export function dateLabel(iso) {
  if (!iso) return "";
  const d = new Date(iso);
  if (isNaN(d.getTime())) return "";

  const now = new Date();
  const startOfToday = new Date(
    now.getFullYear(),
    now.getMonth(),
    now.getDate(),
  );
  const startOfDay = new Date(d.getFullYear(), d.getMonth(), d.getDate());
  const diffDays = Math.floor((startOfToday.getTime() - startOfDay.getTime()) / 86400000);

  if (diffDays === 0) return "Bugün";
  if (diffDays === 1) return "Dün";
  if (diffDays < 7) {
    return d.toLocaleDateString("tr-TR", { weekday: "long" });
  }
  if (d.getFullYear() === now.getFullYear()) {
    return `${d.getDate()} ${TR_MONTHS[d.getMonth()]}`;
  }
  return `${d.getDate()} ${TR_MONTHS[d.getMonth()]} ${d.getFullYear()}`;
}

/**
 * Inverted FlatList için: messages list'inde gün geçişlerinde virtual separator item üretir.
 * Returns yeni list — type='separator' itemları araya eklenir.
 *
 * Inverted: ilk item EN YENİ, son item EN ESKİ. Separator messages[i] ile messages[i+1] arasındaki
 * tarih farkına bakar; messages[i+1] (daha eski) ile aynı günde değilse "messages[i] gününün label'ı"
 * olarak araya yerleştirilir.
 */
export function withDateSeparators(messages: any) {
  if (!messages?.length) return [];
  const result = [];
  for (let i = 0; i < messages.length; i++) {
    const cur = messages[i];
    result.push(cur);
    const next = messages[i + 1]; // daha eski (inverted)
    const curDay = dayKey(cur.sentAt);
    const nextDay = next ? dayKey(next.sentAt) : null;
    // Gün değişimi varsa veya en eski mesaja geldiysek separator ekle.
    if (!nextDay || curDay !== nextDay) {
      result.push({
        id: `__sep__${curDay}_${i}`,
        __separator: true,
        label: dateLabel(cur.sentAt),
      });
    }
  }
  return result;
}

function dayKey(iso) {
  if (!iso) return "";
  const d = new Date(iso);
  if (isNaN(d.getTime())) return "";
  return `${d.getFullYear()}-${d.getMonth()}-${d.getDate()}`;
}
