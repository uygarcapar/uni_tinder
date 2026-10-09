import { memo } from "react";
import { View } from "react-native";
import { colors } from "@/shared/theme/colors";

/**
 * Akış yükleme iskeleti.
 *
 * Üç yollu boş-durum makinesinin ilk hali (iskelet → gecikme penceresinde
 * `null` → EmptyState). Hepsi AYNI FlatList'in `ListEmptyComponent`'inde
 * duruyor ki ağaç şekil değiştirmesin — LikesScreen'de ayrı container'a
 * alınmış bir iskelet sekmelerin yeniden mount olmasına yol açmıştı.
 */
function Row({ lines }: { lines: number }) {
  return (
    <View
      style={{
        backgroundColor: colors.surface,
        borderRadius: 22,
        borderCurve: "continuous",
        padding: 16,
        marginBottom: 10,
      }}
    >
      <View style={{ flexDirection: "row", alignItems: "center" }}>
        <View
          style={{
            width: 34,
            height: 34,
            borderRadius: 17,
            backgroundColor: colors.shimmer,
          }}
        />
        <View style={{ marginLeft: 10 }}>
          <View
            style={{
              width: 110,
              height: 11,
              borderRadius: 6,
              backgroundColor: colors.shimmer,
            }}
          />
          <View
            style={{
              width: 70,
              height: 9,
              borderRadius: 5,
              backgroundColor: colors.shimmer,
              marginTop: 6,
            }}
          />
        </View>
      </View>
      {Array.from({ length: lines }).map((_, i) => (
        <View
          key={i}
          style={{
            height: 11,
            borderRadius: 6,
            backgroundColor: colors.shimmer,
            marginTop: i === 0 ? 14 : 8,
            // Son satır kısa — gerçek metin gibi okunsun.
            width: i === lines - 1 ? "55%" : "100%",
          }}
        />
      ))}
    </View>
  );
}

function FeedSkeletonListBase({ count = 3 }: { count?: number }) {
  return (
    <View>
      {Array.from({ length: count }).map((_, i) => (
        // Satır uzunlukları sabit ama DEĞİŞKEN: hepsi aynı olsaydı liste
        // "yükleniyor" yerine "bozuk" okunurdu.
        <Row key={i} lines={i % 2 === 0 ? 3 : 2} />
      ))}
    </View>
  );
}

export default memo(FeedSkeletonListBase);
