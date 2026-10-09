import { useMemo } from "react";
import { RefreshControl, View, type ListRenderItem } from "react-native";
import Animated, { LinearTransition } from "react-native-reanimated";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { SCREEN_HEADER_TITLE_HEIGHT } from "@/shared/components/ScreenHeader";
import { colors } from "@/shared/theme/colors";
import FeedSkeletonList from "./FeedSkeletonList";

/**
 * Akış pager'ının üç sayfasının ORTAK gövdesi.
 *
 * Tek bileşen, üç kez kullanılıyor — `FeedScreen`in LikesScreen gibi 4000
 * satıra çıkmasını engellemek için (plan §8.6). Sayfaya özel olan her şey
 * (veri, satır çizimi, boş durum) prop.
 *
 * ⚠️ `onScroll` YALNIZ aktif sayfada bağlı. `ScreenHeader`ın küçük başlığı tek
 * bir `scrollY`ye bakıyor; üç sayfa birden yazsaydı arka plandakilerin (0'da
 * duran) offset'i öndekini ezer ve başlık rastgele belirip kaybolurdu
 * (LikesScreen.tsx:3850 civarındaki aynı not).
 */

const LIST_H_PADDING = 10;

/** Satır kaybolunca altındakiler boşluğa YAVAŞÇA kayar, yerlerine zıplamaz. */
const ROW_LAYOUT_TRANSITION = LinearTransition.duration(220);

export interface FeedListPageProps<T> {
  data: T[];
  renderItem: ListRenderItem<T>;
  keyExtractor: (item: T, index: number) => string;
  /** Bu sayfa önde mi — scrollY ve RefreshControl bağlanması buna bakıyor. */
  isActive: boolean;
  scrollHandler?: any;
  /** İskelet çizilsin mi (ilk yükleme, gecikme penceresinden sonra). */
  showSkeleton?: boolean;
  /**
   * Yükleniyor ama iskelet penceresi henüz açılmadı → `null` çiz.
   * "Hiçbir şey yok" deyip hemen geri almamak için (LikesScreen'in üç yollu
   * boş-durum makinesinin orta hali).
   */
  loading?: boolean;
  /** Dolu/boş makinesinin son hali. */
  empty?: React.ReactElement | null;
  listHeader?: React.ReactElement | null;
  onEndReached?: () => void;
  /** Verilmezse pull-to-refresh hiç takılmaz (Yanıtlar sayfası böyle). */
  onRefresh?: () => void;
  refreshing?: boolean;
}

export default function FeedListPage<T>({
  data,
  renderItem,
  keyExtractor,
  isActive,
  scrollHandler,
  showSkeleton = false,
  loading = false,
  empty = null,
  listHeader = null,
  onEndReached,
  onRefresh,
  refreshing = false,
}: FeedListPageProps<T>) {
  const insets = useSafeAreaInsets();

  // İki stil memoize — render'da kurulsaydı her çizimde yeni bir stil kimliği
  // doğar ve üç listenin içerik kabı boşuna yeniden commit edilirdi.
  // Üst pay HEADER SATIRININ kendisi: sekme şeridi orada, sabit duruyor.
  const listContentStyle = useMemo(
    () => ({
      flexGrow: 1,
      paddingHorizontal: LIST_H_PADDING,
      paddingTop: insets.top + SCREEN_HEADER_TITLE_HEIGHT + 14,
      // 120 = alttaki tab bar payı.
      paddingBottom: 120,
    }),
    [insets.top],
  );
  // Boş sayfada dip payı yok: içerik ekranı zaten doldurmuyor, 120'lik pay boş
  // durumu yukarı itiyordu.
  const emptyListContentStyle = useMemo(
    () => ({ ...listContentStyle, paddingBottom: 0 }),
    [listContentStyle],
  );

  const emptyComponent = showSkeleton ? (
    <FeedSkeletonList />
  ) : loading ? null : (
    empty
  );

  return (
    <Animated.FlatList
      data={data}
      renderItem={renderItem}
      keyExtractor={keyExtractor}
      onScroll={isActive ? scrollHandler : undefined}
      scrollEventThrottle={16}
      itemLayoutAnimation={ROW_LAYOUT_TRANSITION}
      ListHeaderComponent={listHeader}
      ListEmptyComponent={emptyComponent}
      contentContainerStyle={
        data.length === 0 && !showSkeleton
          ? emptyListContentStyle
          : listContentStyle
      }
      onEndReached={onEndReached}
      // 0.5 ≈ bir ekran boyu kala: cursor turu kullanıcı dibe varmadan dönsün.
      onEndReachedThreshold={0.5}
      showsVerticalScrollIndicator={false}
      refreshControl={
        // ⚠️ YALNIZ aktif sayfada ve yalnız onRefresh verilmişse. PagerView
        // içinde dikey çekme yatay sayfa jestiyle yarışabiliyor; arka plandaki
        // sayfalara da takmak yarışı üçe katlardı.
        onRefresh && isActive ? (
          <RefreshControl
            refreshing={refreshing}
            onRefresh={onRefresh}
            tintColor={colors.textSecondary}
            colors={[colors.text]}
            progressBackgroundColor={colors.bg}
            // ⚠️ contentContainerStyle'ın paddingTop'u spinner'ı KAPSAMIYOR:
            // spinner scroll 0'da doğuyor, yani bulanık header'ın ALTINDA
            // kalıyordu. Bu kod tabanındaki ilk modern RefreshControl —
            // cihazda doğrulanmalı.
            progressViewOffset={insets.top + SCREEN_HEADER_TITLE_HEIGHT}
          />
        ) : undefined
      }
    />
  );
}

/** Sayfa dışına da lazım olan pay (FAB konumu vb.). */
export { LIST_H_PADDING };

/** Boş durumun ortalanması için ortak sarmalayıcı (LikesScreen deseni). */
export function FeedEmptyWrap({ children }: { children: React.ReactNode }) {
  return (
    <View
      style={{
        flex: 1,
        alignItems: "center",
        justifyContent: "center",
        paddingBottom: "35%",
      }}
    >
      {children}
    </View>
  );
}
