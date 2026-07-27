import { memo } from "react";
import { View, Text } from "react-native";
import { colors } from "../../../shared/theme/colors";
import i18n from "../../../shared/i18n";
import { getDateLocale } from "../../../shared/i18n/dateLocale";

/**
 * Mesaj grupları arasında tarih ayracı.
 * Bugün / Dün / hafta içi günü / D MMM (YYYY) formatları — locale-farkında.
 */
/**
 * Yükseklik SABİT 42 — ChatMessageList.getFixedItemSize separator'a 42 bildirir
 * ve LegendList fixed-size item'ları HİÇ ölçmez: gerçek yükseklik 42'den saparsa
 * (eski my-3 + metin ≈ 37 idi) fark hiçbir MVCP telafisine girmez ve her yeni
 * gün separator'ı içeren sayfa prepend'inde scroll birkaç px kayardı. Bu değeri
 * değiştirirsen getFixedItemSize'daki 42'yi de değiştir.
 */
export const DATE_SEPARATOR_HEIGHT = 42;

const DateSeparator = memo(function DateSeparator({ label }: any) {
  if (!label) return null;
  return (
    <View
      style={{
        height: DATE_SEPARATOR_HEIGHT,
        alignItems: "center",
        justifyContent: "center",
      }}
    >
      <Text style={{ color: colors.textPlaceholder, fontSize: 13, fontWeight: "500" }}>
        {label}
      </Text>
    </View>
  );
});

export default DateSeparator;

// ChatScreen useMemo ile messages'a iliştirir. Hook dışından çağrıldığı için
// (withDateSeparators veri kurarken) locale'i i18n'den okuyoruz — hardcoded
// "tr-TR"/TR_MONTHS İngilizce'de de Türkçe basıyordu.
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

  if (diffDays === 0) return i18n.t("chat.messages.today");
  if (diffDays === 1) return i18n.t("chat.messages.yesterday");

  const locale = getDateLocale();
  if (diffDays < 7) {
    return d.toLocaleDateString(locale, { weekday: "long" });
  }
  if (d.getFullYear() === now.getFullYear()) {
    return d.toLocaleDateString(locale, { day: "numeric", month: "short" });
  }
  return d.toLocaleDateString(locale, {
    day: "numeric",
    month: "short",
    year: "numeric",
  });
}

/**
 * Kronolojik (eskiden yeniye) mesaj listesinde gün geçişlerinde virtual separator
 * item üretir. Returns yeni list — __separator itemları o günün ilk mesajının
 * önüne eklenir. Liste NON-inverted (LegendList, alignItemsAtEnd).
 */
export function withDateSeparators(messages: any) {
  if (!messages?.length) return [];
  const result = [];
  // KRONOLOJİK (eskiden yeniye) liste: separator, o güne ait İLK mesajın ÖNÜNE
  // konur (ekranda mesajların üstünde görünür). Liste NON-inverted.
  //
  // ÖNEMLİ: separator id'si index İÇERMEZ. LegendList,
  // maintainVisibleContentPosition düzeltmesini "ekrandaki item'ın key'ini yeni
  // veride bul, layout farkı kadar kaydır" diye yapar ve boyut/pozisyon cache'leri
  // key'e bağlıdır. Id'ye index katılırsa yukarı eski sayfa prepend edildiğinde tüm
  // indexler kayar, her separator YENİ key alır → çapa bulunamaz, cache'ler atılır
  // → scroll zıplar, aşağıdaki item'lar blank kalır. Gün başına tek separator
  // olduğu için dayKey tek başına yeterli ve stabildir.
  const seenDays = new Set<string>();
  for (let i = 0; i < messages.length; i++) {
    const cur = messages[i];
    const curDay = dayKey(cur.sentAt);
    if (!seenDays.has(curDay)) {
      seenDays.add(curDay);
      result.push({
        id: `__sep__${curDay}`,
        __separator: true,
        label: dateLabel(cur.sentAt),
      });
    }
    result.push(cur);
  }
  return result;
}

function dayKey(iso) {
  if (!iso) return "";
  const d = new Date(iso);
  if (isNaN(d.getTime())) return "";
  return `${d.getFullYear()}-${d.getMonth()}-${d.getDate()}`;
}
