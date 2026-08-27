import { memo, useEffect, useState, useCallback, useMemo } from 'react';
import { useTranslation } from 'react-i18next';
import {
  View,
  Text,
  TouchableOpacity,
  Platform,
  StyleSheet,
} from 'react-native';
import { Image } from 'expo-image';
import { BlurView } from 'expo-blur';
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
  Camera,
  EyeOff,
  Check,
  AlertTriangle,
} from 'lucide-react-native';
import SFIcon, { type SFSymbol } from '@/shared/components/SFIcon';
import notificationsService from '@/features/notifications/notificationsService';
import profileService from '@/features/profile/profileService';
import { requestPhotoHighlight } from '@/shared/services/uiBus';
import realtimeService from '@/features/chat/realtimeService';
import { fetchConversations } from '@/features/chat/chatSlice';
import {
  fetchSubscriptionStatus,
  selectIsPremium,
} from '@/features/profile/subscriptionSlice';
import { useAppDispatch, useAppSelector } from '@/shared/hooks/redux';
import ScreenHeader, {
  SCREEN_HEADER_ACTION_SIZE,
} from '@/shared/components/ScreenHeader';
import EmptyState from '@/shared/components/EmptyState';
import SkeletonBox from '@/shared/components/SkeletonBox';
import { formatRelativeTime } from '@/shared/utils/formatRelativeTime';
import { parseUtc } from '@/shared/utils/dateUtc';
import { colors } from '../../../shared/theme/colors';
import { glassFallback } from '../../../shared/theme/glass';
import { useRenderCount } from '@/shared/debug/useRenderCount';
import { plainBlurTint } from "@/shared/theme/blur";

// Fotoğrafın sağ altına oturan tip rozeti. Burada olmayan tipler (System,
// TrialEndingSoon, PremiumExpiringSoon …) sistem bildirimi sayılır, rozet almaz.
const TYPE_BADGES = {
  Match: { Icon: Sparkles, sf: 'sparkles' as SFSymbol, color: colors.litPlus },
  Like: { Icon: Heart, sf: 'heart' as SFSymbol, color: colors.errorStrong },
  SuperLike: { Icon: Heart, sf: 'heart' as SFSymbol, color: colors.info },
  Note: { Icon: MessageCircle, sf: 'bubble.left.fill' as SFSymbol, color: colors.litPlus },
  Message: { Icon: MessageCircle, sf: 'message.fill' as SFSymbol, color: colors.success },
  MissedMatch: { Icon: Sparkles, sf: 'sparkles' as SFSymbol, color: colors.warning },
  // Fotoğraf moderasyonu. Red/gizlenme kullanıcıdan aksiyon istiyor → uyarı
  // tonu; onay yalnızca iyi haber → nötr yeşil.
  PhotoRejected: { Icon: AlertTriangle, sf: 'exclamationmark.triangle.fill' as SFSymbol, color: colors.errorStrong },
  PhotoApproved: { Icon: Check, sf: 'checkmark' as SFSymbol, color: colors.success },
  ProfileHiddenInsufficientPhotos: { Icon: EyeOff, sf: 'eye.slash.fill' as SFSymbol, color: colors.errorStrong },
  PhotoAppealResolved: { Icon: Camera, sf: 'camera.fill' as SFSymbol, color: colors.info },
};

// Tap hedefleri. Chat'e gidenler ayrıca sağda chevron gösteriyor; buradaki
// hiçbir listede olmayan tipler (System vb.) tıklanınca bir yere gitmiyor.
const GOES_TO_CHAT = { Match: true, Message: true };
const GOES_TO_LIKES = { Like: true, SuperLike: true, Note: true, MissedMatch: true };
// Fotoğraf moderasyonu → Profil sekmesi (foto ızgarası orada).
const GOES_TO_PROFILE = {
  PhotoRejected: true,
  PhotoApproved: true,
  ProfileHiddenInsufficientPhotos: true,
  PhotoAppealResolved: true,
};

// Premium olmayan kullanıcı düz beğenilerde beğenenin kimliğini göremez —
// LikesScreen'deki kilitle aynı kural. SuperLike orada da açık gösterildiği
// için burada da açık kalıyor; Match/MissedMatch'te kimlik zaten serbest.
// Not da MUAF (sözleşme §6): gönderenin adı free alıcıya da açık.
const IDENTITY_GATED = { Like: true };

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
  // Chat'teki gün ayracıyla aynı hata sınıfı: Z'siz damga yerel sayılınca
  // gece yarısı sonrası bildirimler "Bugün" yerine dünkü kovaya düşüyordu.
  const d = parseUtc(iso);
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
  const isPremium = useAppSelector(selectIsPremium);
  const [items, setItems] = useState([]);
  const [page, setPage] = useState(1);
  const [hasMore, setHasMore] = useState(false);
  const [loading, setLoading] = useState(false);
  // Sadece ilk açılışta iskelet göster — pagination'da / realtime yenilemede değil.
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

    // Moderasyon kararı değişti → Profil. Cache bust ediliyor ki ekran 10 sn'lik
    // TTL yüzünden bildirimden ÖNCEKİ hâli göstermesin.
    if (GOES_TO_PROFILE[item.type]) {
      profileService.bustProfileCache();
      (navigation as any).navigate('HomeTabs', { screen: 'Profile' });
      // Tek bir fotoğrafın kararıysa (`relatedEntityId` = photoId) düzenleme
      // modalı fotoğraflar bölümüne açılıp O foto vurgulanıyor — kullanıcı
      // hangisi olduğunu altı kutu arasında aramasın.
      // ProfileHiddenInsufficientPhotos hariç: o, tek bir fotoğrafa değil
      // profilin bütününe dair, vurgulanacak hedefi yok.
      if (
        item.relatedEntityId &&
        item.type !== 'ProfileHiddenInsufficientPhotos'
      ) {
        requestPhotoHighlight(item.relatedEntityId);
      }
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
        <NotificationRow
          item={item}
          locked={!isPremium && !!IDENTITY_GATED[item.type]}
          onPress={handleTap}
        />
      ),
    [handleTap, t, isPremium],
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
    <View className="flex-1" style={{ backgroundColor: colors.bg }}>
      <Animated.FlatList
        data={data}
        onScroll={scrollHandler}
        scrollEventThrottle={16}
        showsVerticalScrollIndicator={false}
        keyExtractor={keyExtractor}
        renderItem={renderItem}
        onEndReached={onEndReached}
        onEndReachedThreshold={0.4}
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
            /* matchContents YOK — bkz. SCREEN_HEADER_ACTION_SIZE: frame() zaten
               44x44 diyor, Host'un da aynı boyutu İLK commit'te bilmesi gerek;
               yoksa buton sol kenardan içeri ışınlanıyor. */
            <Host
              style={{
                width: SCREEN_HEADER_ACTION_SIZE,
                height: SCREEN_HEADER_ACTION_SIZE,
              }}
            >
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
                  frame({
                    width: SCREEN_HEADER_ACTION_SIZE,
                    height: SCREEN_HEADER_ACTION_SIZE,
                  }),
                  ...glassFallback({ shape: 'circle' }),
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
// Fonksiyon: modul seviyesinde sabitlenirse tema degisince bayat kalir.
const avatarBorder = () => ({ borderWidth: 0.1, borderColor: colors.hairline });

// Kilitli avatarda İKİ katman birden gerekiyor, ikisi de tek başına yetmiyor:
//
// - iOS: expo-image'in `blurRadius`'ü SDWebImage transformer'ı olarak TAM
//   çözünürlükteki fotoğrafa uygulanıyor (ImageView.swift: reload → transformer,
//   sonra processImage → downscale). 1000px'lik fotoya 6px blur atıp 58pt'ye
//   küçültünce blur pratikte kayboluyor. Üste BlurView koyuyoruz — o, ekrana
//   çizilen piksellere uygulanıyor, kaynak çözünürlüğünden bağımsız.
// - Android: expo-blur'da `blurMethod` varsayılanı 'none', yani BlurView orada
//   sadece yarı saydam bir katman. Buna karşılık Glide blur'u view boyutunda
//   çalıştığı için `blurRadius` Android'de gerçekten bulanıklaştırıyor.
const LOCKED_BLUR_RADIUS = 12;
const LOCKED_BLUR_INTENSITY = 55;

/**
 * Solda tetikleyen kişinin fotoğrafı, sağ altında tip rozeti. Fotoğraf yoksa
 * nötr placeholder: gönderen varsa kişi silueti, göndereni olmayan sistem
 * bildirimlerinde zil (o tiplerde rozet de yok).
 * `locked` → premium olmayan kullanıcıya beğenenin yüzü blur'lu gösteriliyor.
 */
function NotificationAvatar({ item, locked = false }) {
  const badge = TYPE_BADGES[item.type] || null;
  const placeholder = item.senderUserId
    ? { sf: 'person.fill' as SFSymbol, lucide: User }
    : { sf: 'bell.fill' as SFSymbol, lucide: Bell };

  return (
    <View style={{ width: AVATAR_SIZE, height: AVATAR_SIZE }}>
      {/* Kırpma katmanı: BlurView'a doğrudan borderRadius vermek yerine daireye
          maskeleyen bir kap — rozet bu kabın DIŞINDA kalmalı, o yüzden
          overflow:'hidden' en dıştaki View'a konmuyor. */}
      <View
        style={{
          width: AVATAR_SIZE,
          height: AVATAR_SIZE,
          borderRadius: AVATAR_SIZE / 2,
          overflow: 'hidden',
        }}
      >
        {item.senderPhotoUrl ? (
          <Image
            source={{ uri: item.senderPhotoUrl }}
            style={{
              width: AVATAR_SIZE,
              height: AVATAR_SIZE,
              borderRadius: AVATAR_SIZE / 2,
              backgroundColor: colors.surface3,
              ...avatarBorder(),
            }}
            cachePolicy="memory-disk"
            transition={350}
            contentFit="cover"
            blurRadius={locked ? LOCKED_BLUR_RADIUS : 0}
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
              ...avatarBorder(),
            }}
          >
            <SFIcon name={placeholder.sf} fallback={placeholder.lucide} size={28} color={colors.text} strokeWidth={2} weight="semibold" />
          </View>
        )}

        {locked && !!item.senderPhotoUrl && (
          <BlurView
            intensity={LOCKED_BLUR_INTENSITY}
            tint={plainBlurTint()}
            style={StyleSheet.absoluteFill}
            pointerEvents="none"
          />
        )}
      </View>

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
      className="text-xl font-bold px-5 pt-4 pb-4"
      style={{ color: colors.text, letterSpacing: 0.2 }}
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
const NotificationRow = memo(function NotificationRow({ item, locked, onPress }: any) {
  const { t } = useTranslation();
  const time = formatRelativeTime(item.createdAt, t, { longDate: true });
  const handlePress = useCallback(() => onPress(item), [onPress, item]);

  // Kilitliyken sunucudan gelen metni HİÇ basmıyoruz: beğenenin adı title/body
  // içine gömülü geliyor, tek tek maskelemek mümkün değil. Yerine jenerik
  // cümle + Lit Plus yönlendirmesi.
  const title = locked ? t('notifications.hiddenLike.title') : item.title;
  const body = locked ? t('notifications.hiddenLike.body') : item.body;

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
      <NotificationAvatar item={item} locked={locked} />
      {/* Başlık + body tek paragraf — nested Text ile aynı satırda akıyor,
          satır atlarsa da araya boşluk girmeden bitişik devam ediyor. */}
      <View className="flex-1 ml-3">
        <Text
          className="text-[15px]"
          style={{ lineHeight: 21 }}
          numberOfLines={3}
          onTextLayout={onTextLayout}
        >
          <Text className="font-medium" style={{ color: colors.text }}>{title}</Text>
          {!!body && <Text className="font-normal" style={{ color: colors.text }}> {body}</Text>}
          {wraps && <Text style={{ color: colors.textSecondary }}> {time}</Text>}
        </Text>
        {!wraps && (
          <Text className="text-[15px]" style={{ color: colors.textSecondary, lineHeight: 21 }}>
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

