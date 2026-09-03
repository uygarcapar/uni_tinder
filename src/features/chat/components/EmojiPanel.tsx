import { memo, useCallback, useEffect, useMemo, useRef, useState } from "react";
import {
  View,
  Text,
  ScrollView,
  Pressable,
  StyleSheet,
  useWindowDimensions,
} from "react-native";
import * as Haptics from "expo-haptics";
import { Delete } from "@/shared/icons";
import { useTranslation } from "react-i18next";
import SFIcon from "@/shared/components/SFIcon";
import { colors } from "@/shared/theme/colors";
import {
  EMOJI_CATEGORIES,
  RECENT_CATEGORY,
  readRecentEmojis,
  type EmojiCategoryKey,
} from "@/features/chat/components/emojiCatalog";

// Sekme şeridi (kategori ikonları + geri silme). Izgara alanı = panel − bu.
const TAB_BAR_H = 44;
const GRID_PAD_H = 6;
// Hedef hücre kenarı — sütun sayısı ekran genişliğinden buna göre türetilir,
// hücre sonra kalan genişliğe TAM bölünerek büyür (sağda boşluk kalmasın).
const TARGET_CELL = 44;
// Geri silme: ilk basıştan sonra bu gecikmeyle tekrar etmeye başlar.
const BACKSPACE_DELAY_MS = 450;
const BACKSPACE_REPEAT_MS = 90;

type Props = {
  // Panelin İÇ yüksekliği (safe-area hariç) — composer klavye yüksekliğinden
  // hesaplayıp geçirir, panel kendi başına ölçüm yapmaz.
  height: number;
  onSelect: (emoji: string) => void;
  onBackspace: () => void;
};

const EmojiCell = memo(function EmojiCell({
  emoji,
  cell,
  onPick,
}: {
  emoji: string;
  cell: number;
  onPick: (emoji: string) => void;
}) {
  // Pressable/Touchable DEĞİL: kategori başına ~300 hücre var, her biri fazladan
  // bir host view + pressability örneği demek olurdu. Text.onPress ek düğüm
  // açmadan aynı işi görüyor.
  return (
    <Text
      suppressHighlighting
      onPress={() => onPick(emoji)}
      style={{
        width: cell,
        height: cell,
        lineHeight: cell,
        fontSize: Math.round(cell * 0.62),
        textAlign: "center",
      }}
    >
      {emoji}
    </Text>
  );
});

/**
 * Sistem klavyesinin yerine geçen emoji paneli.
 *
 * Kategoriler SAYFA sayfa: tek uzun listede bütün gliflerin aynı anda mount
 * olması giriş anını uzatıyordu — aktif kategori dışındakiler hiç çizilmiyor.
 */
function EmojiPanel({ height, onSelect, onBackspace }: Props) {
  const { t } = useTranslation();
  const { width } = useWindowDimensions();
  // Son kullanılanlar MOUNT'ta bir kez okunur: seçim yaptıkça listenin parmağın
  // altında yeniden dizilmesi (ve panelin rerender'ı) istenmiyor.
  const [recent] = useState(readRecentEmojis);
  const [active, setActive] = useState<EmojiCategoryKey>(
    recent.length > 0 ? "recent" : "smileys",
  );
  const scrollRef = useRef<ScrollView>(null);

  // Hücre, kalan genişliğe tam bölünür: satır sonunda artık boşluk kalmaz.
  const cell = useMemo(() => {
    const usable = width - GRID_PAD_H * 2;
    return usable / Math.max(6, Math.floor(usable / TARGET_CELL));
  }, [width]);

  const tabs = useMemo(
    () => (recent.length > 0 ? [RECENT_CATEGORY, ...EMOJI_CATEGORIES] : EMOJI_CATEGORIES),
    [recent.length],
  );

  const emojis = useMemo(() => {
    if (active === "recent") return recent;
    return EMOJI_CATEGORIES.find((c) => c.key === active)?.emojis ?? [];
  }, [active, recent]);

  const handlePick = useCallback(
    (emoji: string) => {
      Haptics.selectionAsync().catch(() => {});
      onSelect(emoji);
    },
    [onSelect],
  );

  const selectCategory = useCallback((key: EmojiCategoryKey) => {
    setActive(key);
    scrollRef.current?.scrollTo({ y: 0, animated: false });
  }, []);

  // Geri silme basılı tutulunca tekrarlar (klavye ekranda olmadığı için tek tek
  // dokunarak silmek eziyet). Timer'lar bırakınca ve unmount'ta kesin temizlenir.
  const delayRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const repeatRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const stopBackspace = useCallback(() => {
    if (delayRef.current) {
      clearTimeout(delayRef.current);
      delayRef.current = null;
    }
    if (repeatRef.current) {
      clearInterval(repeatRef.current);
      repeatRef.current = null;
    }
  }, []);
  const startBackspace = useCallback(() => {
    onBackspace();
    stopBackspace();
    delayRef.current = setTimeout(() => {
      delayRef.current = null;
      repeatRef.current = setInterval(onBackspace, BACKSPACE_REPEAT_MS);
    }, BACKSPACE_DELAY_MS);
  }, [onBackspace, stopBackspace]);
  useEffect(() => stopBackspace, [stopBackspace]);

  return (
    <View style={{ height, backgroundColor: colors.bg }}>
      <ScrollView
        ref={scrollRef}
        style={{ flex: 1 }}
        contentContainerStyle={{ paddingHorizontal: GRID_PAD_H, paddingBottom: 8 }}
        keyboardShouldPersistTaps="always"
        showsVerticalScrollIndicator={false}
      >
        <Text
          style={{
            color: colors.textMuted,
            fontSize: 12,
            fontWeight: "600",
            paddingTop: 8,
            paddingBottom: 4,
            paddingHorizontal: 4,
          }}
        >
          {t(`chat.emoji.categories.${active}`)}
        </Text>
        {emojis.length === 0 ? (
          <Text
            style={{
              color: colors.textMuted,
              fontSize: 14,
              paddingHorizontal: 4,
              paddingTop: 12,
            }}
          >
            {t("chat.emoji.noRecent")}
          </Text>
        ) : (
          <View style={{ flexDirection: "row", flexWrap: "wrap" }}>
            {emojis.map((emoji) => (
              <EmojiCell key={emoji} emoji={emoji} cell={cell} onPick={handlePick} />
            ))}
          </View>
        )}
      </ScrollView>

      <View
        style={{
          height: TAB_BAR_H,
          flexDirection: "row",
          alignItems: "center",
          borderTopWidth: StyleSheet.hairlineWidth,
          borderTopColor: colors.hairline,
        }}
      >
        {tabs.map((c) => (
          <Pressable
            key={c.key}
            onPress={() => selectCategory(c.key)}
            accessibilityRole="tab"
            accessibilityLabel={t(`chat.emoji.categories.${c.key}`)}
            accessibilityState={{ selected: active === c.key }}
            style={{
              flex: 1,
              height: TAB_BAR_H,
              alignItems: "center",
              justifyContent: "center",
            }}
          >
            <SFIcon
              name={c.symbol}
              fallback={c.icon}
              size={20}
              strokeWidth={2}
              weight="semibold"
              color={active === c.key ? colors.text : colors.textMuted}
            />
          </Pressable>
        ))}
        <Pressable
          onPressIn={startBackspace}
          onPressOut={stopBackspace}
          accessibilityRole="button"
          accessibilityLabel={t("chat.emoji.backspace")}
          style={{
            width: 46,
            height: TAB_BAR_H,
            alignItems: "center",
            justifyContent: "center",
          }}
        >
          <SFIcon
            name="delete.left"
            fallback={Delete}
            size={22}
            strokeWidth={2}
            weight="semibold"
            color={colors.text}
          />
        </Pressable>
      </View>
    </View>
  );
}

export default memo(EmojiPanel);
