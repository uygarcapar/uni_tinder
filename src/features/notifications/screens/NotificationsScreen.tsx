import { memo, useEffect, useState, useCallback, useMemo } from 'react';
import { useTranslation } from 'react-i18next';
import {
  View,
  Text,
  TouchableOpacity,
  ActivityIndicator,
  RefreshControl,
  Platform,
} from 'react-native';
import { Image } from 'expo-image';
import { Host, Button as SwiftUIButton } from '@expo/ui/swift-ui';
import {
  buttonStyle,
  tint,
  labelStyle,
  font,
  frame,
  controlSize,
} from '@expo/ui/swift-ui/modifiers';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useNavigation } from '@react-navigation/native';
import Animated, {
  useSharedValue,
  useAnimatedScrollHandler,
} from 'react-native-reanimated';
import {
  Bell,
  BellOff,
  Heart,
  MessageCircle,
  Sparkles,
  ChevronLeft,
  ChevronRight,
  User,
} from 'lucide-react-native';
import SFIcon, { type SFSymbol } from '@/shared/components/SFIcon';
import notificationsService from '@/features/notifications/notificationsService';
import realtimeService from '@/features/chat/realtimeService';
import { fetchConversations } from '@/features/chat/chatSlice';
import { fetchSubscriptionStatus } from '@/features/profile/subscriptionSlice';
import { useAppDispatch, useAppSelector } from '@/shared/hooks/redux';
import ScreenHeader from '@/shared/components/ScreenHeader';
import EmptyState from '@/shared/components/EmptyState';
import SkeletonBox from '@/shared/components/SkeletonBox';
import { formatRelativeTime } from '@/shared/utils/formatRelativeTime';
import { colors } from '../../../shared/theme/colors';
import { useRenderCount } from '@/shared/debug/useRenderCount';

// Fotoğrafın sağ altına oturan tip rozeti. Burada olmayan tipler (System,
// TrialEndingSoon, PremiumExpiringSoon …) sistem bildirimi sayılır, rozet almaz.
const TYPE_BADGES = {
  Match: { Icon: Sparkles, sf: 'sparkles' as SFSymbol, color: colors.litPlus },
  Like: { Icon: Heart, sf: 'heart' as SFSymbol, color: colors.errorStrong },
  SuperLike: { Icon: Heart, sf: 'heart' as SFSymbol, color: colors.info },
  Message: { Icon: MessageCircle, sf: 'message.fill' as SFSymbol, color: colors.success },
  MissedMatch: { Icon: Sparkles, sf: 'sparkles' as SFSymbol, color: colors.warning },
};

// Tap hedefleri. Chat'e gidenler ayrıca sağda chevron gösteriyor; buradaki
// hiçbir listede olmayan tipler (System vb.) tıklanınca bir yere gitmiyor.
const GOES_TO_CHAT = { Match: true, Message: true };
const GOES_TO_LIKES = { Like: true, SuperLike: true, MissedMatch: true };

const keyExtractor = (n) => n.id;

// Zaman kovaları — feed createdAt'e göre azalan sırada geldiği için tek geçişte
// gruplanıyor, satırların arasına __section kaydı serpiştiriliyor.
const SECTION_LABEL_KEYS = {
  today: 'notifications.sections.today',
  last7Days: 'notifications.sections.last7Days',
  last30Days: 'notifications.sections.last30Days',
  older: 'notifications.sections.older',
};

function sectionOf(iso) {
  if (!iso) return 'older';
  const d = new Date(iso);
  const now = new Date();
  const startOfDay = (date) =>
    new Date(date.getFullYear(), date.getMonth(), date.getDate());
  const dayDiff = Math.floor(
    (startOfDay(now).getTime() - startOfDay(d).getTime()) / 86400000,
  );
  if (dayDiff <= 0) return 'today';
  if (dayDiff < 7) return 'last7Days';
  if (dayDiff < 30) return 'last30Days';
  return 'older';
}

function withSections(items) {
  const out = [];
  let current = null;
  for (const item of items) {
    const section = sectionOf(item.createdAt);
    if (section !== current) {
      current = section;
      out.push({ id: `__section-${section}`, __section: section });
    }
    out.push(item);
  }
  return out;
}

export default function NotificationsScreen() {
  useRenderCount("NotificationsScreen");
  const { t } = useTranslation();
  const navigation = useNavigation();
  const insets = useSafeAreaInsets();
  const dispatch = useAppDispatch();
  // Chat'e giderken partner adı/fotoğrafı buradan çözülüyor — bildirim payload'ında
  // sadece senderUserId + senderPhotoUrl var, displayName yok.
  const conversations = useAppSelector((s) => s.chat.conversations);
  const [items, setItems] = useState([]);
  const [page, setPage] = useState(1);
  const [hasMore, setHasMore] = useState(false);
  const [loading, setLoading] = useState(false);
  const [refreshing, setRefreshing] = useState(false);
  // Sadece ilk açılışta iskelet göster — pull-to-refresh / pagination'da değil.
  const [firstLoad, setFirstLoad] = useState(true);

  const scrollY = useSharedValue(0);
  const scrollHandler = useAnimatedScrollHandler({
    onScroll: (e) => {
      scrollY.value = e.contentOffset.y;
    },
  });

  const fetchPage = useCallback(async (p, append = false) => {
    if (loading) return;
    setLoading(true);
    try {
      const data = await notificationsService.getFeed({ page: p, pageSize: 30 });
      setItems((prev) => append ? [...prev, ...data.items] : data.items);
      setHasMore(data.hasMore);
      setPage(data.page);
      // Sayfayı açtıktan sonra hepsini okundu işaretle (UX standardı).
      if (!append) {
        notificationsService.markAllRead().catch(() => {});
      }
    } finally {
      setLoading(false);
      setRefreshing(false);
      setFirstLoad(false);
    }
  }, [loading]);

  useEffect(() => {
    fetchPage(1);
    // Chat'e deep-link ederken partner bilgisi hazır olsun (push'tan direkt bu
    // ekrana düşülmüş olabilir). Thunk kendi staleness guard'ı ile korunuyor.
    dispatch(fetchConversations({}));
    // NewNotification event'i geldikçe feed'i refresh et.
    const unsub = realtimeService.on('NewNotification', () => {
      fetchPage(1);
    });
    return unsub;
  }, []);

  const onRefresh = useCallback(() => {
    setRefreshing(true);
    fetchPage(1);
  }, [fetchPage]);

  const onEndReached = useCallback(() => {
    if (!hasMore || loading) return;
    fetchPage(page + 1, true);
  }, [hasMore, loading, page, fetchPage]);

  const handleTap = useCallback((item) => {
    if (!item.isRead) {
      notificationsService.markRead(item.id).catch(() => {});
    }

    if (GOES_TO_CHAT[item.type]) {
      if (!item.relatedEntityId) return;
      // Konuşma Redux'ta varsa isim/foto/isActive oradan; yoksa bildirimin kendi
      // sender alanlarına düşüyoruz (en azından fotoğraf ve userId geliyor).
      const conv = conversations.find(
        (c) => c.conversationId === item.relatedEntityId,
      );
      (navigation as any).navigate('Chat', {
        conversationId: item.relatedEntityId,
        partner: {
          userId: conv?.partnerUserId ?? item.senderUserId,
          displayName: conv?.partnerDisplayName,
          profileImageUrl: conv?.partnerProfileImageUrl ?? item.senderPhotoUrl,
        },
        isActive: conv?.isActive ?? true,
      });
      return;
    }

    if (GOES_TO_LIKES[item.type]) {
      (navigation as any).navigate('HomeTabs', { screen: 'Likes' });
      return;
    }

    // Abonelik hatırlatmaları (saatlik SubscriptionReminderJob) → Profil'deki
    // abonelik kartı. ÖNCE `/status`: kullanıcı bildirimi gördükten sonra
    // yenilemiş/iptal etmiş olabilir, bayat state'le yanlış CTA göstermeyelim.
    if (item.type === 'TrialEndingSoon' || item.type === 'PremiumExpiringSoon') {
      dispatch(fetchSubscriptionStatus());
      (navigation as any).navigate('HomeTabs', { screen: 'Profile' });
      return;
    }
    // System → hedef yok.
  }, [navigation, conversations, dispatch]);

  // Bölüm başlıkları veri içine serpiştiriliyor (FlatList'in sticky olmayan
  // basit section davranışı). items değişmedikçe yeniden hesaplanmıyor.
  const data = useMemo(() => withSections(items), [items]);

  // renderItem stabil kalsın: satır içi arrow function verilirse her render'da
  // yeni referans üretilir ve memo'lu NotificationRow'lar boşuna yeniden çizilir.
  const renderItem = useCallback(
    ({ item }) =>
      item.__section ? (
        <SectionHeader title={t(SECTION_LABEL_KEYS[item.__section])} />
      ) : (
        <NotificationRow item={item} onPress={handleTap} />
      ),
    [handleTap, t],
  );

  const contentContainerStyle = useMemo(
    () => ({
      flexGrow: 1,
      paddingTop: insets.top + 50 + 16,
      paddingBottom: insets.bottom + 16,
    }),
    [insets.top, insets.bottom],
  );

  return (
    <View className="flex-1 bg-bg">
      <Animated.FlatList
        data={data}
        onScroll={scrollHandler}
        scrollEventThrottle={16}
        showsVerticalScrollIndicator={false}
        keyExtractor={keyExtractor}
        renderItem={renderItem}
        refreshControl={
          <RefreshControl
            refreshing={refreshing}
            onRefresh={onRefresh}
            tintColor={colors.primary}
            // Spinner header blur'unun altında kaybolmasın — içeriğin başladığı yerde dönsün.
            progressViewOffset={insets.top + 50 + 16}
          />
        }
        onEndReached={onEndReached}
        onEndReachedThreshold={0.4}
        ListFooterComponent={
          loading && items.length > 0 ? (
            <View style={{ paddingVertical: 16 }}>
              <ActivityIndicator size="small" color={colors.primary} />
            </View>
          ) : null
        }
        ListEmptyComponent={
          firstLoad ? (
            <NotificationsSkeleton />
          ) : !loading ? (
            <View className="flex-1 items-center justify-center pb-[50%]">
              <EmptyState
                Icon={BellOff}
                sf="bell.slash"
                iconStrokeWidth={1}
                topOffset={0}
                text={t('notifications.empty')}
                subtitle={t('notifications.emptySubtitle')}
              />
            </View>
          ) : null
        }
        contentContainerStyle={contentContainerStyle}
      />

      <ScreenHeader
        scrollY={scrollY}
        title={t('common.notifications')}
        titleAlign="center"
        titleSize={26}
        showLogo={false}
        leftButton={
          Platform.OS === 'ios' ? (
            <Host matchContents>
              <SwiftUIButton
                label={t('common.back')}
                systemImage="chevron.left"
                onPress={() => navigation.goBack()}
                modifiers={[
                  buttonStyle('glass'),
                  tint(colors.text),
                  controlSize('large'),
                  labelStyle('iconOnly'),
                  font({ size: 22, weight: 'semibold' }),
                  frame({ width: 44, height: 44 }),
                ]}
              />
            </Host>
          ) : (
            <TouchableOpacity onPress={() => navigation.goBack()} hitSlop={10} activeOpacity={0.7}>
              <View pointerEvents="none">
                <SFIcon name="chevron.left" fallback={ChevronLeft} size={29} strokeWidth={2} color={colors.text} weight="semibold" />
              </View>
            </TouchableOpacity>
          )
        }
      />
    </View>
  );
}

const AVATAR_SIZE = 58;
const BADGE_SIZE = 18;
const BADGE_RING = 3; // rozetin arkasındaki ekran zemini halkası — "boşluk" hissi
const DOT_SIZE = 10;
const AVATAR_BORDER = { borderWidth: 0.1, borderColor: '#dee0ea' };

/**
 * Solda tetikleyen kişinin fotoğrafı, sağ altında tip rozeti. Fotoğraf yoksa
 * nötr placeholder: gönderen varsa kişi silueti, göndereni olmayan sistem
 * bildirimlerinde zil (o tiplerde rozet de yok).
 */
function NotificationAvatar({ item }) {
  const badge = TYPE_BADGES[item.type] || null;
  const placeholder = item.senderUserId
    ? { sf: 'person.fill' as SFSymbol, lucide: User }
    : { sf: 'bell.fill' as SFSymbol, lucide: Bell };

  return (
    <View style={{ width: AVATAR_SIZE, height: AVATAR_SIZE }}>
      {item.senderPhotoUrl ? (
        <Image
          source={{ uri: item.senderPhotoUrl }}
          style={{
            width: AVATAR_SIZE,
            height: AVATAR_SIZE,
            borderRadius: AVATAR_SIZE / 2,
            backgroundColor: colors.surface3,
            ...AVATAR_BORDER,
          }}
          cachePolicy="memory-disk"
          transition={350}
          contentFit="cover"
        />
      ) : (
        <View
          style={{
            width: AVATAR_SIZE,
            height: AVATAR_SIZE,
            borderRadius: AVATAR_SIZE / 2,
            backgroundColor: colors.surface3,
            alignItems: 'center',
            justifyContent: 'center',
            ...AVATAR_BORDER,
          }}
        >
          <SFIcon name={placeholder.sf} fallback={placeholder.lucide} size={28} color={colors.text} strokeWidth={2} weight="semibold" />
        </View>
      )}

      {badge && (
        // Halka border değil ayrı bir katman: border kullanınca altındaki renkli
        // zemin kenarlardan sızıp ince kırmızı/turuncu çizgi bırakıyordu.
        <View
          style={{
            position: 'absolute',
            bottom: -4,
            right: -4,
            padding: BADGE_RING,
            borderRadius: (BADGE_SIZE + BADGE_RING * 2) / 2,
            backgroundColor: colors.bg,
          }}
        >
          <View
            style={{
              width: BADGE_SIZE,
              height: BADGE_SIZE,
              borderRadius: BADGE_SIZE / 2,
              backgroundColor: badge.color,
              alignItems: 'center',
              justifyContent: 'center',
            }}
          >
            <SFIcon name={badge.sf} fallback={badge.Icon} size={11} color={colors.text} strokeWidth={2.5} weight="bold" />
          </View>
        </View>
      )}
    </View>
  );
}

// İlk açılış iskeleti — satır layout'unu birebir taklit ediyor (58pt avatar +
// iki metin çizgisi), böylece veri gelince zıplama olmuyor.
const SKELETON_WIDTHS = ['88%', '64%', '76%', '92%', '58%', '80%'];

function SectionHeader({ title }) {
  return (
    <Text
      className="text-white text-xl font-bold px-5 pt-4 pb-4"
      style={{ letterSpacing: 0.2 }}
    >
      {title}
    </Text>
  );
}

function NotificationsSkeleton() {
  return (
    <View>
      {SKELETON_WIDTHS.map((w, i) => (
        <View key={i} className="flex-row items-center px-4 py-3">
          <SkeletonBox
            width={AVATAR_SIZE}
            height={AVATAR_SIZE}
            borderRadius={AVATAR_SIZE / 2}
          />
          <View className="flex-1 ml-3">
            <SkeletonBox width={w} height={13} borderRadius={6} />
            <SkeletonBox
              width="38%"
              height={12}
              borderRadius={6}
              style={{ marginTop: 8 }}
            />
          </View>
        </View>
      ))}
    </View>
  );
}

/**
 * Satırın sağı — okunmadıysa nokta, okunduysa (chat'e giden tiplerde) chevron.
 * İkisi birden görünmüyor: nokta chevron'un yerini alıyor.
 * Hiçbiri yoksa metin sağ kenara yapışmasın diye küçük bir nefes payı kalıyor.
 */
function NotificationRowRight({ unread, chevron }) {
  if (!unread && !chevron) return <View style={{ width: 5 }} />;
  return (
    // Sabit genişlik: nokta chevron'dan dar, ortalanmasa okunmuş/okunmamış
    // satırların metin genişliği kayıyor.
    <View className="items-center justify-center ml-2" style={{ width: 20 }}>
      {unread ? (
        <View
          className="rounded-full"
          style={{
            width: DOT_SIZE,
            height: DOT_SIZE,
            backgroundColor: colors.messageOwn,
          }}
        />
      ) : (
        <SFIcon name="chevron.right" fallback={ChevronRight} size={20} color={colors.textSecondary} strokeWidth={2} weight="semibold" />
      )}
    </View>
  );
}

// memo: liste yeniden render olduğunda (yeni sayfa, refresh, loading flag)
// item referansı değişmeyen satırlar yeniden çizilmesin.
const NotificationRow = memo(function NotificationRow({ item, onPress }: any) {
  const { t } = useTranslation();
  const time = formatRelativeTime(item.createdAt, t, { longDate: true });
  const handlePress = useCallback(() => onPress(item), [onPress, item]);

  // Cümle tek satıra sığıyorsa tarih alt satıra iner; zaten alt satıra taşan
  // cümlelerde ayrıca kırmaya gerek yok, tarih metnin peşinden akar.
  // onTextLayout hep sadece cümleyi ölçer (tek satırken tarih Text'in dışında).
  const [wraps, setWraps] = useState(false);
  const onTextLayout = useCallback((e) => {
    setWraps(e.nativeEvent.lines.length > 1);
  }, []);

  return (
    <TouchableOpacity
      onPress={handlePress}
      activeOpacity={0.7}
      className="flex-row items-center px-4 py-3"
    >
      <NotificationAvatar item={item} />
      {/* Başlık + body tek paragraf — nested Text ile aynı satırda akıyor,
          satır atlarsa da araya boşluk girmeden bitişik devam ediyor. */}
      <View className="flex-1 ml-3">
        <Text
          className="text-[15px]"
          style={{ lineHeight: 21 }}
          numberOfLines={3}
          onTextLayout={onTextLayout}
        >
          <Text className="text-white font-medium">{item.title}</Text>
          {!!item.body && <Text className="text-white font-normal"> {item.body}</Text>}
          {wraps && <Text className="text-gray-400"> {time}</Text>}
        </Text>
        {!wraps && (
          <Text className="text-gray-400 text-[15px]" style={{ lineHeight: 21 }}>
            {time}
          </Text>
        )}
      </View>

      <NotificationRowRight
        unread={!item.isRead}
        chevron={!!GOES_TO_CHAT[item.type]}
      />
    </TouchableOpacity>
  );
});

