import { useMemo } from "react";
import { Text, View, type StyleProp, type ViewStyle } from "react-native";
import { colors } from "@/shared/theme/colors";

/**
 * Sunucudan gelen aydınlatma metinlerini basan MİNİ markdown renderer.
 *
 * NEDEN KÜTÜPHANE DEĞİL: metinleri biz yazıyoruz ve markdown'ın çok dar bir
 * alt kümesini kullanıyorlar (başlık, kalın, madde, paragraf). Tek ekran için
 * tam bir markdown motoru + onun bağımlılık ağacı taşımanın karşılığı yok
 * (2026-07 kütüphane denetiminde 14 paket bu gerekçeyle sökülmüştü).
 *
 * TANINMAYAN İŞARETLEME DÜZ METİN OLARAK BASILIR — asla kaybolmaz. Hukuki bir
 * metinde bir satırın sessizce yutulması, çirkin görünmesinden çok daha kötü.
 *
 * Desteklenen:
 *   #, ##, ###   başlık
 *   -, *, •      madde
 *   **kalın**    satır içi kalın
 *   boş satır    paragraf ayracı
 */

type Block =
  | { kind: "heading"; level: 1 | 2 | 3; text: string }
  | { kind: "bullet"; text: string }
  | { kind: "paragraph"; text: string };

const HEADING = /^(#{1,3})\s+(.*)$/;
const BULLET = /^[-*•]\s+(.*)$/;

export function parsePolicyMarkdown(source: string): Block[] {
  const blocks: Block[] = [];
  // Paragraf birleştirme tamponu: markdown'da tek satır sonu paragrafı
  // BÖLMEZ, iki satır sonu böler.
  let paragraph: string[] = [];

  const flush = () => {
    if (paragraph.length === 0) return;
    blocks.push({ kind: "paragraph", text: paragraph.join(" ").trim() });
    paragraph = [];
  };

  source.split(/\r?\n/).forEach((raw) => {
    const line = raw.trim();

    if (line.length === 0) {
      flush();
      return;
    }

    const heading = HEADING.exec(line);
    if (heading) {
      flush();
      blocks.push({
        kind: "heading",
        level: heading[1].length as 1 | 2 | 3,
        text: heading[2].trim(),
      });
      return;
    }

    const bullet = BULLET.exec(line);
    if (bullet) {
      flush();
      blocks.push({ kind: "bullet", text: bullet[1].trim() });
      return;
    }

    paragraph.push(line);
  });

  flush();
  return blocks;
}

/**
 * `**kalın**` parçalarını ayırır. Eşleşmeyen `**` düz metin kalır.
 *
 * Kalın OLMAYAN parça ham string döner, `<Text>` ile SARILMAZ: iç içe Text
 * hem gereksiz düğüm hem de testte `getByText` aynı metni iki kez bulup
 * "multiple elements" hatası veriyor.
 */
function renderInline(text: string, color: string) {
  const parts = text.split(/(\*\*[^*]+\*\*)/g).filter(Boolean);
  return parts.map((part, i) => {
    const bold = part.startsWith("**") && part.endsWith("**") && part.length > 4;
    if (!bold) return part;
    return (
      <Text key={i} style={{ color, fontWeight: "600" }}>
        {part.slice(2, -2)}
      </Text>
    );
  });
}

const HEADING_SIZE: Record<1 | 2 | 3, number> = { 1: 20, 2: 17, 3: 15 };

export default function PolicyMarkdown({
  source,
  style,
}: {
  source: string;
  style?: StyleProp<ViewStyle>;
}) {
  const blocks = useMemo(() => parsePolicyMarkdown(source), [source]);

  // Renkler RENDER ANINDA okunuyor — `colors` mutable bir singleton, modül
  // seviyesinde türetilen değer tema değişiminde bayat kalır.
  const text = colors.text;
  const secondary = colors.textSecondary;

  return (
    <View style={[{ gap: 12 }, style]}>
      {blocks.map((block, i) => {
        if (block.kind === "heading") {
          return (
            <Text
              key={i}
              style={{
                color: text,
                fontSize: HEADING_SIZE[block.level],
                fontWeight: "600",
                marginTop: i === 0 ? 0 : 8,
              }}
            >
              {block.text}
            </Text>
          );
        }

        if (block.kind === "bullet") {
          return (
            <View key={i} style={{ flexDirection: "row", gap: 8 }}>
              <Text style={{ color: secondary, fontSize: 14, lineHeight: 20 }}>
                •
              </Text>
              <Text
                style={{ flex: 1, color: secondary, fontSize: 14, lineHeight: 20 }}
              >
                {renderInline(block.text, secondary)}
              </Text>
            </View>
          );
        }

        return (
          <Text
            key={i}
            style={{ color: secondary, fontSize: 14, lineHeight: 20 }}
          >
            {renderInline(block.text, secondary)}
          </Text>
        );
      })}
    </View>
  );
}
