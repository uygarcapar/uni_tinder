import { memo, useEffect, useRef, useState, useCallback, useMemo } from 'react';
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
import { Host, Button as SwiftUIButton, Image as SwiftUIImage } from '@expo/ui/swift-ui';
import {
  buttonStyle,
  tint,
  frame,
  accessibilityLabel,
} from '@expo/ui/swift-ui/modifiers';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useNavigation, useFocusEffect } from '@react-navigation/native';
import Animated, {
  useSharedValue,
  useAnimatedScrollHandler,
} from 'react-native-reanimated';
import {
  Bell,
  BellOff,
  Heart,
  MessageCircle,
  RotateCcw,
  ChevronLeft,
  ChevronRight,
  User,
  Camera,
  EyeOff,
  Check,
  AlertTriangle,
} from '@/shared/icons';
import SFIcon, { type SFSymbol } from '@/shared/components/SFIcon';
import NoteGlyph from '@/shared/components/NoteGlyph';
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
import ScreenHeader from '@/shared/components/ScreenHeader';
import EmptyState from '@/shared/components/EmptyState';
import SkeletonBox from '@/shared/components/SkeletonBox';
import { formatRelativeTime } from '@/shared/utils/formatRelativeTime';
import { parseUtc } from '@/shared/utils/dateUtc';
import { colors, isLight } from '../../../shared/theme/colors';
import { glassFallback, glassIconClearGlyph, GLASS_ICON_CLEAR_SIZE } from '../../../shared/theme/glass';
import GlassFallbackSurface from '@/shared/components/GlassFallbackSurface';
import { useRenderCount } from '@/shared/debug/useRenderCount';
import { plainBlurTint } from "@/shared/theme/blur";

// Nötr (renk taşımayan) rozetlerin zemini POLARİTE çevirmiyor — iki modda da
// koyu disk + beyaz glyph. `colors.bg`/`colors.text` kullanılsaydı açık modda
// beyaz disk beyaz zeminin içinde kaybolurdu. Tek fark ton: koyu modda tam
// siyah disk, altındaki #121212 liste zemininden ve rozetin kendi `colors.bg`
// halkasından ayrışmıyordu → koyuda griye çekiliyor, açıkta siyah kalıyor
// (beyaz zeminde kontrast zaten fazlasıyla var).
// Modül seviyesinde SABİTLENEMEZ (colors.ts mutasyon sözleşmesi §1) — fonksiyon.
const badgeNeutralBg = () => (isLight() ? '#000000' : '#3A3A3C');
// Renkli/koyu diskin üstündeki işaretin beyazı da temadan gelmiyor: `colors.text`
// açık modda koyuya döndüğü için kırmızı disk üstünde okunmuyordu.
const BADGE_FG = '#FFFFFF';

// Fotoğrafın sağ altına oturan tip rozeti. Burada olmayan tipler (System,
// TrialEndingSoon, PremiumExpiringSoon …) sistem bildirimi sayılır, rozet almaz.
// Match burada YOK: eşleşme bildiriminde fotoğrafın sağ altına rozet
// çizilmiyor (metin zaten eşleşmeyi söylüyor).
const TYPE_BADGES = {
  // İki beğeni tipi hem işaret hem renkle ayrışıyor: düz beğeni nötr siyah
  // diskte tik, süper beğeni kırmızı diskte kalp — kalp yalnızca vurgulu olanda
  // kalıyor. Süper beğeninin kalbi İÇİ DOLU beyaz: 18pt diskin üstünde 11pt ince
  // konturlu kalp kayboluyor. `filled` Android/lucide fallback'e de dolgu
  // geçiriyor; tik zaten kontur glyph'i, dolgu istemiyor.
  Like: { Icon: Check, sf: 'checkmark' as SFSymbol, neutral: true, iconColor: BADGE_FG },
  SuperLike: { Icon: Heart, sf: 'heart.fill' as SFSymbol, color: colors.errorStrong, iconColor: BADGE_FG, filled: true },
  // Not'un işareti SF `bubble.left.fill` DEĞİL: ürünün kendi glyph'i
  // (NoteGlyph — SwipeCard'daki not kutusu, Likes rozeti, paket modalı ve toast
  // hep aynı şekli kullanıyor). Rozet zemini de tip renginden değil sabit
  // siyah/beyaz: glyph'in içindeki kalp DELİK, altındaki dolgu oradan görünüyor
  // — renkli zeminde şekil dağılıyordu.
  Note: { Glyph: NoteGlyph, neutral: true, iconColor: BADGE_FG },
  Message: { Icon: MessageCircle, sf: 'message.fill' as SFSymbol, color: colors.success },
  // Kaçırılan eşleşme = kurtarma aksiyonu → Discover'daki kurtar butonuyla aynı
  // işaret (arrow.counterclockwise), siyah disk üstünde beyaz.
  MissedMatch: {
    Icon: RotateCcw,
    sf: 'arrow.counterclockwise' as SFSymbol,
    neutral: true,
    iconColor: BADGE_FG,
  },
  // Fotoğraf moderasyonu. Red/gizlenme kullanıcıdan aksiyon istiyor → uyarı
  // tonu; onay yalnızca iyi haber → nötr yeşil. Renkli diskin üstündeki işaret
  // TEMADAN GELMİYOR (`colors.text` açık modda koyuya dönüp kırmızı/yeşil
  // zeminde okunmaz hâle geliyordu) — hepsi sabit beyaz.
  PhotoRejected: { Icon: AlertTriangle, sf: 'exclamationmark.triangle.fill' as SFSymbol, color: colors.errorStrong, iconColor: BADGE_FG },
  PhotoApproved: { Icon: Check, sf: 'checkmark' as SFSymbol, color: colors.success, iconColor: BADGE_FG },
  ProfileHiddenInsufficientPhotos: { Icon: EyeOff, sf: 'eye.slash.fill' as SFSymbol, color: colors.errorStrong, iconColor: BADGE_FG },
  // İtiraz sonucu tek başına iyi/kötü haber değil (kabul de red de bu tiple
  // geliyor) → renk taşımayan nötr rozet: Not/MissedMatch ile aynı siyah disk,
  // üstünde beyaz kamera.
  PhotoAppealResolved: { Icon: Camera, sf: 'camera.fill' as SFSymbol, neutral: true, iconColor: BADGE_FG },
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

// İskelet yalnız istek gerçekten "bekleniyor" hissi verecek kadar sürerse
// görünür (LikesScreen ile aynı makine). Feed tipik olarak bu eşiğin altında
// dönüyor ve iskeleti gösterip hemen listeye atlamak ekranda yanıp sönme olarak
// okunuyordu: önce gecikme (bu süre içinde biterse shimmer hiç çizilmez), bir
// kez çizildiyse de minimum süre ekranda kalır.
const SKELETON_DELAY_MS = 220;
const SKELETON_MIN_VISIBLE_MS = 450;

// Liste boşken ListEmptyComponent'e düşmek için sabit referans — her render'da
// yeni [] üretmek FlatList'i boşuna yeniden çizdirir.
const EMPTY_DATA = [];

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
  // Elde son bilinen sayfa varsa ekran ONUNLA açılıyor: iskelet yok, boş ekran
  // yok, altındaki tazeleme sessizce üstüne yazıyor.
  const [items, setItems] = useState(
    () => notificationsService.getFeedSnapshot() ?? [],
  );
  const [page, setPage] = useState(1);
  const [hasMore, setHasMore] = useState(false);
  const [loading, setLoading] = useState(false);

  const scrollY = useSharedValue(0);
  const scrollHandler = useAnimatedScrollHandler({
    onScroll: (e) => {
      scrollY.value = e.contentOffset.y;
    },
  });

  // Guard state değil ref: `loading` state'ine bakan sürüm realtime dinleyicisinde
  // ÇALIŞMIYORDU — dinleyici mount'taki fetchPage closure'ını tutuyor, oradaki
  // `loading` sonsuza dek false. Mount fetch'i ile üstüne gelen NewNotification
  // aynı anda iki kez sayfa 1 çekip listeyi arka arkaya iki kez takas ediyordu.
  const loadingRef = useRef(false);
  // Sunucu gerçekten okundu'ya çekildi mi? Çıkışta yerel kopyayı okundu'ya
  // çekmenin ön koşulu (aşağıdaki useFocusEffect): istek düşmüşse yerelde
  // okundu göstermek yalan olurdu — o durumda noktalar kalsın, bir sonraki
  // açılışta sunucudan yine unread gelecek zaten.
  const allReadRef = useRef(false);
  const fetchPage = useCallback(async (p, append = false) => {
    if (loadingRef.current) return;
    loadingRef.current = true;
    setLoading(true);
    try {
      const data = await notificationsService.getFeed({ page: p, pageSize: 30 });
      if (!append) notificationsService.setFeedSnapshot(data.items);
      setItems((prev) => append ? [...prev, ...data.items] : data.items);
      setHasMore(data.hasMore);
      setPage(data.page);
      // Sayfayı açtıktan sonra hepsini okundu işaretle (UX standardı).
      if (!append) {
        notificationsService
          .markAllRead()
          .then(() => {
            allReadRef.current = true;
          })
          .catch(() => {});
      }
    } finally {
      loadingRef.current = false;
      setLoading(false);
    }
  }, []);

  // İskelet görünürlüğü — `loading`'in kendisi değil, geciktirilmiş/asgari süreli
  // türevi. Ayrıca elde snapshot varken HİÇ açılmıyor: yeniden girişte zaten
  // dolu bir liste var, üstüne shimmer basmak geriye gidiş olurdu.
  const pending = loading && items.length === 0;
  const [showSkeleton, setShowSkeleton] = useState(false);
  const skeletonShownAtRef = useRef(0);
  useEffect(() => {
    if (pending) {
      const id = setTimeout(() => {
        skeletonShownAtRef.current = Date.now();
        setShowSkeleton(true);
      }, SKELETON_DELAY_MS);
      return () => clearTimeout(id);
    }
    if (!showSkeleton) return;
    const rest =
      SKELETON_MIN_VISIBLE_MS - (Date.now() - skeletonShownAtRef.current);
    if (rest <= 0) {
      setShowSkeleton(false);
      return;
    }
    const id = setTimeout(() => setShowSkeleton(false), rest);
    return () => clearTimeout(id);
  }, [pending, showSkeleton]);

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

  // Ekrandan çıkarken satırlar yerelde de okundu'ya geçiyor. Satırlar EKRANDA
  // kasten unread duruyor (kullanıcı neyin yeni olduğunu görsün); bedeli ikinci
  // girişteki titremeydi: snapshot unread çizilip hemen arkasından gelen taze —
  // ve artık okunmuş — sayfa noktaları söndürüyordu. Çıkışta hem state hem
  // snapshot okundu'ya alınınca sonraki giriş baştan noktasız açılıyor.
  useFocusEffect(
    useCallback(
      () => () => {
        if (!allReadRef.current) return;
        notificationsService.markSnapshotRead();
        setItems((prev) =>
          prev.some((n) => !n.isRead)
            ? prev.map((n) => (n.isRead ? n : { ...n, isRead: true }))
            : prev,
        );
      },
      [],
    ),
  );

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
        /* İskelet asgari süresini doldurmadan veri gelirse liste bir an için
           shimmer'ı kesip satırları basardı; o pencerede listeyi boş tutup
           ListEmptyComponent'te kalıyoruz. */
        data={showSkeleton ? EMPTY_DATA : data}
        onScroll={scrollHandler}
        scrollEventThrottle={16}
        showsVerticalScrollIndicator={false}
        keyExtractor={keyExtractor}
        renderItem={renderItem}
        onEndReached={onEndReached}
        onEndReachedThreshold={0.4}
        ListEmptyComponent={
          showSkeleton ? (
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
            /* matchContents YOK — bkz. GLASS_ICON_BUTTON: frame() ölçüyü zaten
               veriyor, Host'un da aynı boyutu İLK commit'te bilmesi gerek;
               yoksa buton sol kenardan içeri ışınlanıyor. Sarmalayıcı iOS 26
               ALTINDA zemini veriyor, 26+'da hiç render olmuyor. */
            <GlassFallbackSurface
              shape="circle"
              width={GLASS_ICON_CLEAR_SIZE}
              height={GLASS_ICON_CLEAR_SIZE}
            >
              <Host
                style={{
                  width: GLASS_ICON_CLEAR_SIZE,
                  height: GLASS_ICON_CLEAR_SIZE,
                }}
              >
                <SwiftUIButton
                  onPress={() => navigation.goBack()}
                  modifiers={[
                    // Kabuk YOK, berrak cam glifin üstünde — profil başlığındaki
                    // çan/ayarlar ile birebir aynı; bkz. glassIconClearGlyph.
                    buttonStyle('plain'),
                    tint(colors.text),
                    frame({
                      width: GLASS_ICON_CLEAR_SIZE,
                      height: GLASS_ICON_CLEAR_SIZE,
                    }),
                    accessibilityLabel(t('common.back')),
                    ...glassFallback({ shape: 'circle' }),
                  ]}
                >
                  <SwiftUIImage
                    systemName="chevron.left"
                    color={colors.text}
                    modifiers={glassIconClearGlyph()}
                  />
                </SwiftUIButton>
              </Host>
            </GlassFallbackSurface>
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
              backgroundColor: badge.neutral ? badgeNeutralBg() : badge.color,
              alignItems: 'center',
              justifyContent: 'center',
            }}
          >
            {badge.Glyph ? (
              // Ürünün kendi vektör işareti — SF sembolü değil, o yüzden
              // SFIcon'dan geçmiyor. Ölçü Likes'taki not rozetiyle aynı oran
              // (glyph ≈ diskin 0.62'si), kendi optik payı da cabası.
              <badge.Glyph size={11} color={badge.iconColor} />
            ) : (
              <SFIcon
                name={badge.sf}
                fallback={badge.Icon}
                size={11}
                color={badge.iconColor || colors.text}
                fill={badge.filled ? badge.iconColor || colors.text : undefined}
                strokeWidth={2.5}
                weight="bold"
              />
            )}
          </View>
        </View>
      )}
    </View>
  );
}

// İlk açılış iskeleti — satır layout'unu birebir taklit ediyor (58pt avatar +
// iki metin çizgisi), böylece veri gelince zıplama olmuyor.
const SKELETON_WIDTHS = ['88%', '64%', '76%', '92%', '58%', '80%'];

// Bölüm başlığının yüksekliği iki yerden de aynı sabitlerle türetiliyor:
// iskelette başlık yeri BOŞ bırakılınca veri gelince ilk satır bir başlık boyu
// (28 + 2×16 = 60pt) aşağı kayıyordu — "ekran ufak kaydı" dedirten şey buydu.
// lineHeight açıkça veriliyor ki iskelet, NativeWind'ın text-xl varsayılanına
// bağlı kalmasın.
const SECTION_HEADER_LINE = 28;
const SECTION_HEADER_PAD = 16;

function SectionHeader({ title }) {
  return (
    <Text
      className="text-xl font-bold px-5"
      style={{
        color: colors.text,
        letterSpacing: 0.2,
        lineHeight: SECTION_HEADER_LINE,
        paddingTop: SECTION_HEADER_PAD,
        paddingBottom: SECTION_HEADER_PAD,
      }}
    >
      {title}
    </Text>
  );
}

function NotificationsSkeleton() {
  return (
    <View>
      {/* Gerçek feed HER ZAMAN bir bölüm başlığıyla başlıyor (en azından
          "Bugün"/"Daha eski") — iskelette de yerini tutuyoruz. */}
      <View
        style={{
          paddingHorizontal: 20,
          height: SECTION_HEADER_LINE + SECTION_HEADER_PAD * 2,
          justifyContent: 'center',
        }}
      >
        <SkeletonBox width={84} height={18} borderRadius={6} />
      </View>
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

