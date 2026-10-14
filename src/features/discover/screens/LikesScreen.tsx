import { memo, useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useTranslation } from "react-i18next";
import type PagerView from "react-native-pager-view";
import PagerTabBar, {
  AnimatedPagerView,
  usePagerScrollHandler,
  usePagerTabCommit,
} from "@/shared/components/PagerTabBar";
import { View, Text, AppState } from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import * as Haptics from "expo-haptics";
import { RotateCcw } from "@/shared/icons";
import FireGlyph from "@/shared/components/FireGlyph";
import NoteGlyph from "@/shared/components/NoteGlyph";
import { useNavigation } from "@react-navigation/native";
import Animated, {
  Easing,
  LinearTransition,
  useSharedValue,
  useAnimatedScrollHandler,
} from "react-native-reanimated";
import { useAppDispatch } from "@/shared/hooks/redux";
import { feedEnabledForSession } from "@/features/feed/feedFlag";
import {
} from "@/features/feed/feedQueries";
// Kart ARTIK BURADA DEĞİL (2026-10-10): akış yanıtları da aynı kartı çizdiği
// için ortak bir bileşene taşındı — gerekçe LikeCard.tsx'in başında.
import {
  MemoLikeCard,
  isUnlockedLike,
  CARD_EXIT_MS,
  CARD_HEIGHT,
  CARD_ROW_GAP,
  CARD_WIDTH,
  LIST_H_PADDING,
} from "@/features/discover/components/LikeCard";
import { refreshEntitlementsForPaywall } from "@/features/profile/subscriptionSlice";
import { usePremiumTier } from "@/features/profile/premiumTier";
import profileService from "@/features/profile/profileService";
import AnimatedPressable from "@/shared/components/AnimatedPressable";
import EmptyState from "@/shared/components/EmptyState";
import LikerSwipeModal from "@/features/discover/components/LikerSwipeModal";
import { openLitPlus } from "@/features/profile/litPlusEntry";
import FirePurchaseModal from "@/features/discover/components/FirePurchaseModal";
import NotePurchaseModal from "@/features/discover/components/NotePurchaseModal";
import ScreenHeader, {
  SCREEN_HEADER_TITLE_HEIGHT,
} from "@/shared/components/ScreenHeader";
import SkeletonBox from "@/shared/components/SkeletonBox";
import swipeService from "@/features/discover/swipeService";
import { resolveCardAge } from "@/features/discover/cardPrivacy";
import {
  useSwipeMutation,
  useSwipeStats,
} from "@/features/discover/swipeQueries";
import { useAppMode } from "@/features/discover/useAppMode";
import {
  fetchMissedMatches,
  recoverMissedMatch,
} from "@/features/discover/missedMatchRecovery";
import { normalizeLikerNote } from "@/features/discover/likerNote";
import { relationshipIntentLabel } from "@/features/discover/likerCardTeaser";
import { resolveRecoveryAccess } from "@/features/discover/recoveryQuota";
import {
  setWhoLikedMe,
  removeWhoLikedMe,
} from "@/features/discover/swipeSlice";
import { fetchConversations } from "@/features/chat/chatSlice";
import { showInfoToast, showMissedMatchToast } from "@/shared/services/toaster";

import uiBus from "@/shared/services/uiBus";
import { colors } from "../../../shared/theme/colors";
import { useRenderCount } from "@/shared/debug/useRenderCount";

// ── Boş durum ikonları ──────────────────────────────────────────────────────
// Lucide `HeartCrack` / SF `heart.slash` DEĞİL: bu ekranın konusu Fire
// ve not, ikisinin de uygulamaya özel kendi glyph'i var (FireGlyph /
// NoteGlyph — SwipeCard'daki kalp ve not kutusuyla birebir aynı şekil).
//
// DOLGU YOK, sadece kontur: dolu glif boş sayfada bir ürün rozeti gibi
// okunuyor, "burada henüz bir şey yok" demiyordu. EmptyState `Icon`'a
// (size, color, strokeWidth) geçiriyor; `color` burada dolguya değil KONTURA
// bağlanıyor (glyph'lerin `stroke` prop'u), o yüzden bu iki sarmalayıcı var.
//
// Modül seviyesinde — render içinde tanımlansalar her render'da yeni bir tip
// olur, EmptyState'in ikonu boş yere yeniden mount ederdi.
type EmptyGlyphProps = {
  size?: number;
  color?: string;
  strokeWidth?: number;
};
const EmptyHeartIcon = ({ size, color, strokeWidth }: EmptyGlyphProps) => (
  <FireGlyph size={size} stroke={color} strokeWidth={strokeWidth} />
);
// Balonun içindeki kalp burada da delik (fillRule evenodd) — konturlu çizimde
// ikisi de ayrı ayrı çizilir, yani balonun içinde ince bir kalp kalır.
const EmptyNoteIcon = ({ size, color, strokeWidth }: EmptyGlyphProps) => (
  <NoteGlyph size={size} stroke={color} strokeWidth={strokeWidth} />
);

// Sayfa başlığı + filtre satırı KARTLARLA DEĞİL, birbirleriyle hizalı. Kartın
// yan payı kabuk payı (fotoğraf kenara yaklaşsın diye dar); başlık ve sekmeler
// ise yazı — o dar payda ekranın kenarına yapışıyorlardı. İkisi de tek sayıdan
// besleniyor ki header bloğu kendi içinde tek bir sol hatta otursun.
const HEADER_LEFT_INSET = 16;
// Kart düştükten sonra boşluğun kapanması. Çıkıştan biraz daha yavaş ve
// yumuşak: kart önce uçar, alttakiler sonra sakince yukarı kayar. İkisi eşit
// hızda olsaydı tek bir sıçrama gibi okunurdu.
const LIST_SHIFT_MS = 320;
// TEK örnek, render'da kurulmuyor: builder her çizimde yeniden üretildiğinde
// hücrelerin `layout` prop'u değişiyor ve mount'lu her kartın layout animasyonu
// baştan kaydediliyordu. Ekran sık çiziliyor; o iş sekme kayarken düşen bir
// commit'e denk geldiğinde geçiş takılıyordu.
const CARD_LAYOUT_TRANSITION = LinearTransition.duration(LIST_SHIFT_MS).easing(
  Easing.out(Easing.cubic),
);

// Ekran görünür olduğunda listenin bu yaştan eskiyse tazelenmesi. Tab'lar arası
// gidip gelmeyi her seferinde isteğe çevirmeyecek kadar uzun, "bildirime basıp
// girdim, beğeni orada olsun" beklentisini karşılayacak kadar kısa.
const LIKES_STALE_MS = 30 * 1000;

// Kurtarma 200 döndükten sonra `MatchNotification` için beklenen süre. Backend
// eşleşmeyi asenkron yazıyor ve sinyali SignalR taşıyor; bağlantı kopmuşsa
// sohbet backend'de vardır ama uygulama görmez. Süre dolduğunda sohbet listesi
// BİR KEZ tazeleniyor (döngü değil). Backend önerisi: 10 sn.
const MATCH_SIGNAL_TIMEOUT_MS = 10 * 1000;

// Skeleton yalnız istek gerçekten "bekleniyor" hissi verecek kadar sürerse
// görünür. Boş liste cevabı tipik olarak 200ms'nin altında dönüyor ve grid'i
// gösterip hemen boş duruma atlamak ekranda yanıp sönme olarak okunuyordu:
// önce gecikme (bu süre içinde biterse shimmer hiç çizilmez), bir kez çizildiyse
// de minimum süre ekranda kalır (30ms'lik shimmer yerine kasıtlı bir bekleme).
const SKELETON_DELAY_MS = 220;
const SKELETON_MIN_VISIBLE_MS = 450;

// Yatay padding + üst boşluk YOK: bu liste FlatList'in ListEmptyComponent'i
// olarak contentContainer'ın içinde çiziliyor, hizayı oradan alır. Böylece
// skeleton satırları gerçek kartlarla birebir aynı yerde durur.
// Aksiyon kolonu ÇİZİLMİYOR: gerçek kartta da görünmüyor (kart çekilince
// çıkıyor), iskelette göstermek veri gelince kaybolan bir kolon demek olurdu.
function LikesSkeletonList() {
  const placeholders = Array.from({ length: 3 });
  return (
    <View>
      {placeholders.map((_, i) => (
        <View key={i} style={{ marginBottom: CARD_ROW_GAP }}>
          <SkeletonBox
            width={CARD_WIDTH}
            height={CARD_HEIGHT}
            borderRadius={40}
          />
        </View>
      ))}
    </View>
  );
}


/**
 * Sayfanın büyük başlığı + alt yazısı — her sekmenin KENDİ liste başlığı olarak
 * çiziliyor (blok listenin içinde olduğu için kaydırınca yukarı çıkıp
 * ScreenHeader'a devrediyor, sekme kayarken de sayfayla birlikte native olarak
 * kayıyor).
 *
 * ⚠️ `memo` ve prop'ları PRİMİTİF: ekranın kendisi sık çiziliyor (kota, /Stats,
 * hub olayları, sekme commit'i) ve blok her çizimde yeniden commit edildiğinde
 * — pager kayarken düşen bir commit'te — başlıkla alt yazı bir kare takılıyordu.
 * Bu yüzden `onActionPress` de çağıran tarafta SABİT referans olmalı, yoksa memo
 * hiç tutmaz.
 */
const LikesListHeader = memo(function LikesListHeader({
  title,
  description,
  actionLabel,
  onActionPress,
}: {
  title: string;
  description: string;
  actionLabel: string | null;
  onActionPress: (() => void) | null;
}) {
  if (!title) return null;
  return (
    // Üstte pay YOK — blok listenin en başında ve listenin kendi paddingTop'u
    // zaten başlığı header satırının (sekme şeridi) altından başlatıyor (o
    // payın sonundaki sayı başlığın üstündeki nefes).
    <View
      style={{
        // Blok iki satır (başlık + alt yazı); altındaki pay doğrudan ilk kartla
        // arasındaki nefes.
        marginBottom: 26,
        // Listenin kendi payının ÜSTÜNE eklenen fark — başlık ekran kenarından
        // HEADER_LEFT_INSET kadar içeride başlasın diye.
        marginLeft: HEADER_LEFT_INSET - LIST_H_PADDING,
      }}
    >
      {/* Başlık satırı — metin ve (varsa) hemen SAĞINDA satın alma pill'i.
          Aksiyon eskiden alttaki açıklama satırının sonunda düz bir bağlantıydı;
          başlığın yanındaki dolgulu pill hem daha erken görülüyor hem de
          tıklanabilir olduğunu kendi söylüyor. */}
      <View style={{ flexDirection: "row", alignItems: "center", gap: 10 }}>
        {/* Ana metin `colors.text` — açık modda siyah (#0B0B0C), koyu modda
            beyaz. textSecondary açık modda gri kalıyordu ve bu satır sayfanın
            başlığı, ikincil bir dipnot değil.
            `flexShrink: 1` — uzun başlık (ör. bakiye metni) pill'i satır dışına
            itmesin, kırpılacak olan başlık. */}
        <Text
          style={{
            flexShrink: 1,
            color: colors.text,
            fontSize: 33,
            fontWeight: "700",
          }}
        >
          {title}
        </Text>
        {!!actionLabel && !!onActionPress && (
          // Zemin `litPlus` — "Seni beğenenleri gör" CTA'sıyla AYNI dolgu;
          // ekranda tek bir "bu satın almalı" dili olsun (hangi sheet'e gittiği
          // sekmeye göre değişse de, bkz. headerActionFor).
          // Yazı `text` olamaz (açık modda beyaza döner, dolgunun üstünde
          // kaybolur); sabit dolguların mürekkebi `onMediaInverse`.
          <AnimatedPressable
            pressScale={0.96}
            onPress={onActionPress}
            accessibilityRole="button"
            hitSlop={8}
            style={{
              flexShrink: 0,
              borderRadius: 999,
              borderCurve: "continuous",
              backgroundColor: colors.litPlus,
              paddingHorizontal: 12,
              paddingVertical: 6,
            }}
          >
            <Text
              style={{
                color: colors.onMediaInverse,
                fontSize: 13,
                fontWeight: "700",
              }}
            >
              {actionLabel}
            </Text>
          </AnimatedPressable>
        )}
      </View>
      {/* Bakiyenin altında bir zamanlar info glifi + gri açıklama satırı vardı
          ("kurtarma hakkı ne işe yarar"). KALDIRILDI: aynı bilgi zaten sekmenin
          kendi açıklama satırında duruyor ve iki gri satır üst üste gelince
          başlık bloğu üç katmanlı bir metin yığınına dönüyordu. Hakkın nasıl
          alınacağı da burada değil, başlığın yanındaki pill'de. */}
      {/* Başlığın alt yazısı — tek cümle, glifsiz. Eskiden bu bilgi
          kapatılabilir bir kartta (LikesInfoCard) ve daha uzun duruyordu; kart
          kaldırıldı, satır kalıcı hâle geldi. Kaçırdıkların sekmesinde cümlenin
          sonuna kurtarma bakiyesi ekleniyor (bkz. tabDescriptionFor). */}
      <Text
        style={{
          // 33 punto başlığın kendi satır boşluğu zaten aşağı doğru bir pay
          // bırakıyor; üstüne eklenen her px ikisini ayrı iki blok gibi
          // gösteriyor. Alt yazı başlığın devamı, bağımsız bir paragraf değil —
          // bu yüzden pay neredeyse sıfır.
          marginTop: 2,
          color: colors.textSecondary,
          fontSize: 16,
          lineHeight: 22,
          paddingRight: 8,
        }}
      >
        {description}
      </Text>
    </View>
  );
});

export default function LikesScreen() {
  useRenderCount("LikesScreen");
  const { t } = useTranslation();
  const [likes, setLikes] = useState([]);
  // Kilitli kartın "ne arıyor" pili — kart `t` tutmuyor, çözücü buradan
  // gidiyor. `t`'ye bağlı sabit referans: memo'lu kart dil değişmedikçe bu
  // yüzden yeniden çizilmiyor.
  const resolveIntentLabel = useCallback(
    (item) =>
      relationshipIntentLabel(
        t,
        item?.relationshipIntent,
        item?.relationshipIntentDisplay,
      ),
    [t],
  );
  // Event handler'larda güncel listeye erişmek için — setLikes updater'ının
  // içinde dispatch etmek render sırasında TabNavigator'ı güncelliyordu.
  const likesRef = useRef([]);
  const whoLikedMeInFlightRef = useRef(false);
  // İlk çekim tamamlandı mı — skeleton'ın tek yetkisi bu. Sonraki hiçbir çekim
  // (premium geçişi, 404 sonrası reload, görünürlük tazelemesi) ekranı skeleton'a
  // geri döndüremez; oturmuş bir ekranı shimmer'a çevirmek yanıp sönme demekti.
  const hasLoadedOnceRef = useRef(false);
  // Son BAŞARILI çekimin damgası + AppState geçişini ayırt etmek için önceki durum.
  const lastLikesFetchRef = useRef(0);
  const appStateRef = useRef(AppState.currentState);
  likesRef.current = likes;
  const [loading, setLoading] = useState(true);
  const [_currentPage, setCurrentPage] = useState(1);
  const [_hasNextPage, setHasNextPage] = useState(false);
  const [profilePremium, setProfilePremium] = useState(false);
  // Tier'ın kaynağı abonelik slice'ı (bkz. features/profile/premiumTier) —
  // satın almada anında true, hub `SubscriptionChanged`/`admin_revoke` ile
  // anında false. `profilePremium` YALNIZ backend henüz konuşmamışken vekil:
  // ÖNCESİ ikisi OR'lanıyordu ve OR tek yönlü çalıştığı için (profil bayrağı
  // true kaldığı sürece redux'ın false'ı geçmiyordu) düşüş yönü ayrı bir
  // effect'le elle yamanmak zorundaydı.
  const { isPremium: reduxPremium, resolved: premiumResolved } =
    usePremiumTier();
  const isPremium = premiumResolved
    ? reduxPremium
    : profilePremium || reduxPremium;
  // Premium durumu HENÜZ bilinmiyor mu — sticky satın alma butonunun tek kapısı.
  // `profilePremium` ve redux'ın ikisi de false'tan başlıyor, dolayısıyla ilk
  // karelerde premium kullanıcıya da "beğenenleri gör" butonu çiziliyor ve
  // profil cevabı gelince kayboluyordu (yanıp sönme + yanlış upsell). Bayrak
  // yalnız getMyProfile GERÇEKTEN cevap verince kalkar; hata dönerse bilmiyoruz
  // sayılır ve buton çizilmez (premium'a satış göstermektense hiç göstermemek).
  const premiumCheckedRef = useRef(false);
  const [premiumChecked, setPremiumChecked] = useState(false);
  const [activeTab, setActiveTab] = useState("all");

  // ── MOD ──────────────────────────────────────────────────────────────────
  // Keşif'le PAYLAŞILAN tek kaynak (bkz. useAppMode): Keşif'te Arkadaş'a
  // geçmek bu ekranı da arkadaş beğenilerine kapsıyor. Beğeni listesi,
  // kaçırdıklar, liker profili ve kurtarma — hepsi mod başına.
  const { mode } = useAppMode();
  const pagerRef = useRef<PagerView>(null);
  // Pager'ın ANLIK konumu — tam sayı değil, kaydırma sürerken 1.0 → 1.37 → 2.0
  // diye akıyor. Alt çizgi bunu okuyor, dolayısıyla parmakla yarım sayfa çekip
  // bırakıldığında da doğru yerde duruyor.
  const pagerOffset = useSharedValue(0);
  const pagerScrollHandler = usePagerScrollHandler({
    onPageScroll: (e: any) => {
      "worklet";
      pagerOffset.value = e.position + e.offset;
    },
  });
  const insets = useSafeAreaInsets();
  const dispatch = useAppDispatch();
  const navigation = useNavigation();

  // ── Lit Akışı yanıtları (6. sekme) ──────────────────────────────────────
  // ⚠️ Sorgu `visited` kapısının arkasında ve bu pazarlık konusu DEĞİL: bu
  // ekran boot'ta `navigation.preload("Likes")` ile mount olup hiç unmount
  // olmuyor, yani kapı olmasa 6. liste + sorgusu hiç girilmeyen bir sekme için
  // de doğardı. Kapı sekmeye BASILDIĞINDA açılıyor (bkz. handleTabChange).
  //
  // AKIŞ YANITLARI SEKMESİ KALDIRILDI (iki modlu yapı): yanıt yazarak
  // eşleşme kanalı kapandı. Buradaki 6. liste, kendi lazy kapısı
  // (`feedRepliesVisited`), kabul/geç mutasyonları, yanıtlayan profili modalı
  // ve `feedRepliesDirty` tazelemesi birlikte düştü. Sunucu uçları eski
  // istemciler için ayakta; bu sürüm hiç çağırmıyor.
  //
  // Sekme rozeti de sadeleşti: artık yalnız `whoLikedMeCount` (bkz.
  // TabNavigator) — iki sayacı toplama ihtiyacı kalmadı.

  const statsQuery = useSwipeStats();
  // /Stats'ı ekranın kendi tazelik damgasından tetikleyebilmek için ref'te:
  // deps'e konsa `loadMissed` her render'da yeniden yaratılırdı.
  const refetchStatsRef = useRef(statsQuery.refetch);
  refetchStatsRef.current = statsQuery.refetch;
  // `mutate` TanStack Query'de referans olarak stabil — mutation nesnesinin
  // kendisi her render'da değişiyor, onu bağımlılığa koymak handleQuickSwipe'ı
  // her karede tazelerdi (bu ekran uygulama ömrü boyunca mount kalıyor).
  const { mutate: swipeMutate } = useSwipeMutation();
  // ⚠️ Kurtarma paketi sheet'i (`RecoveryPurchaseModal`) KALDIRILDI: kurtarma
  // 2026-08-31'de consumable olmaktan çıkıp premium ayrıcalığı oldu. Paywall
  // artık yalnız free'ye dönüyor ve hedefi doğrudan abonelik (openLitPlus).
  // Fire / not paketi sheet'leri — başlığın yanındaki "Nasıl alırım?"
  // pill'inden açılıyor (bkz. headerAction). İkisi de DiscoverScreen'dekiyle
  // aynı bileşen ve aynı ürün; buradan açılmaları yalnız ikinci bir giriş
  // kapısı, ayrı bir akış değil.
  const [firePurchaseVisible, setFirePurchaseVisible] =
    useState(false);
  const [notePurchaseVisible, setNotePurchaseVisible] = useState(false);
  // Şikayet edilen kullanıcı — ReportModal'ın hem görünürlüğü hem hedefi.

  // Aksiyon kilidi — aynı anda iki karta basılmasını engelliyor.
  //
  // State DEĞİL ref, ve karttaki butona SPINNER OLARAK BAĞLI DEĞİL: bu bayrak
  // yalnız paywall öncesi canonical entitlement tazelemesi sürerken doluyor.
  // Free kullanıcı tik'e bastığında kartın köşesinde bir loader dönüyor, sonra
  // paywall açılıyordu — dönen şey kullanıcının istediği aksiyon değil, ona
  // GÖSTERİLMEYECEK bir kontroldü; "beğenin gidiyor" gibi okunup paywall'ı
  // sürpriz yapıyordu. Premium kullanıcıda zaten hiç görünmüyordu: istek
  // fire-and-forget, kart aynı karede düşüyor.
  const actingRef = useRef(false);
  // Aksiyon kolonu açık olan satır. Tek bir kimlik: ikinci bir kart çekilince
  // ilki kendiliğinden kapanıyor (bkz. LikeCard'daki `isRevealed` etkisi).

  // ── Kart çıkışı ───────────────────────────────────────────────────────────
  // Aksiyon alınan kart veriden ANINDA düşmüyor: önce `exitingIds`e giriyor,
  // düşüş sonra oluyor. Ağdan bağımsız — istek zaten yola çıkmış durumda, bu
  // yalnız görsel sıra. Tek tür var: runCardExit — kart uçup söner (bkz.
  // LikeCard), CARD_EXIT_MS sonra düşer.
  //
  // ⚠️ BU EKRANDA KUTLAMA YOK (2026-09-03). Onaylama ve kurtarma bir zamanlar
  // Keşfet'teki alev süpürmesini oynatıyor, kart da dalganın altında düşüyordu
  // (runCardFlameExit). Ama bu listedeki HERKES seni zaten beğenmiş: iki aksiyon
  // da kesin bir eşleşme, yani hemen ardından MatchModal aynı ateşin perde
  // hâliyle açılıyordu — tek bir basışa iki alev. Eşleşme kutlaması MatchModal'ın
  // işi (bkz. flameSweep'teki kural); kart burada yalnız beğeni yönüne uçuyor.
  //
  // Boşluğun kapanması BURADA değil: kart veriden çıkınca FlatList'in
  // `itemLayoutAnimation`ı alttaki hücreleri yukarı kaydırıyor.
  const [exitingIds, setExitingIds] = useState({});
  // userId → çıkışı İPTAL eden fonksiyon. "Bu kart zaten gidiyor" kontrolü ile
  // unmount temizliği tek yerden okunsun.
  const exitTimersRef = useRef(new Map());
  const finishCardExit = useCallback((userId, remove) => {
    exitTimersRef.current.delete(userId);
    setExitingIds((prev) => {
      if (!(userId in prev)) return prev;
      const next = { ...prev };
      delete next[userId];
      return next;
    });
    remove();
  }, []);
  const runCardExit = useCallback(
    (userId, direction, remove) => {
      if (!userId) {
        remove();
        return;
      }
      // Aynı kart için ikinci bir çıkış başlatma — animasyon baştan oynar ve
      // `remove` iki kez çağrılırdı.
      if (exitTimersRef.current.has(userId)) return;
      setExitingIds((prev) => ({ ...prev, [userId]: direction }));
      const timer = setTimeout(
        () => finishCardExit(userId, remove),
        CARD_EXIT_MS,
      );
      exitTimersRef.current.set(userId, () => clearTimeout(timer));
    },
    [finishCardExit],
  );

  // Ekran uygulama ömrü boyunca mount kalıyor ama yine de: bekleyen çıkışlar
  // unmount'ta iptal edilir (timer/dinleyici, kapanmış bir ekranın state'ine
  // yazmasın).
  useEffect(() => {
    const timers = exitTimersRef.current;
    return () => {
      timers.forEach((cancel) => cancel());
      timers.clear();
    };
  }, []);

  // ── Kaçırılan eşleşmeler ("Kaçırdıkların" sekmesi) ────────────────────────
  // Beğeni listesinden tamamen ayrı: farklı uç (`/MissedMatches`), farklı kota
  // ve sekme açılana kadar HİÇ istenmiyor. Bu ekran boot'ta preload edildiği
  // için koşulsuz çekmek her açılışa bir istek eklerdi.
  const [missed, setMissed] = useState([]);
  const missedRef = useRef([]);
  missedRef.current = missed;
  const [missedLoading, setMissedLoading] = useState(false);
  // İLK TURUN BİTTİĞİ — "liste boş" ile "liste henüz çekilmedi" ayrı şeyler ve
  // `missed.length === 0` ikisini de aynı gösteriyordu. Sekmeye ilk girişte
  // sayfa bir kare "Kaçırdığın kimse yok" yazıyor, sonra iskelete düşüp veri
  // gelince yeniden boş duruma dönüyordu — görünen flash buydu.
  // Ref + state ikizi: ref'i `loadMissed` senkron okuyor (deps'i boş, state'i
  // göremez), state'i render kullanıyor.
  const missedLoadedRef = useRef(false);
  const [missedLoaded, setMissedLoaded] = useState(false);
  // ⚠️ `recoveringId` KALDIRILDI (2026-09-02). Kurtarma isteği uçarken karttaki
  // butonu spinner'a çeviren state'ti; artık istek fire-and-forget gidiyor ve
  // kart aynı karede uçuyor, yani gösterilecek bir bekleme yok. Tekrar
  // basmayı da o engellemiyor: kart basılır basılmaz çıkışa giriyor ve
  // `exitTimersRef` guard'ı beğeniyle aynı kapıyı kuruyor (bkz. handleRecover /
  // handleQuickSwipe).
  const lastMissedFetchRef = useRef(0);
  const missedInFlightRef = useRef(false);
  // Sekmedeki adet — LİSTEDEN AYRI tutuluyor, iki sebeple:
  //   1) Sayı, sekmeye girmenin sebebi: "Kaçırdıkların"da bir şey yoksa oraya
  //      hiç girilmemeli. `missed.length` ancak sekme açıldıktan sonra dolduğu
  //      için pill o ana kadar sayısız kalıyordu.
  //   2) `missed` yalnız İLK SAYFA (20 kayıt); toplam ondan büyük olabilir.
  //      Kanonik sayı zarfın `totalProfiles` alanı.
  // `null` = HENÜZ BİLİNMİYOR (0 değil) — pill sayıyı ancak bilince yazıyor,
  // bilinmeyeni "0" diye göstermek yanlış bilgi olurdu (bkz. FilterPills).
  const [missedTotal, setMissedTotal] = useState(null);
  const lastMissedCountFetchRef = useRef(0);
  const missedCountInFlightRef = useRef(false);
  // Kurtarma sonrası SignalR emniyeti (bkz. handleRecover). Unmount'ta iptal
  // ediliyor: ekran kapandıktan sonra istek atmak boşuna.
  const matchSignalTimerRef = useRef(null);
  useEffect(
    () => () => {
      if (matchSignalTimerRef.current)
        clearTimeout(matchSignalTimerRef.current);
    },
    [],
  );

  const loadMissed = useCallback(async ({ force = false } = {}) => {
    if (missedInFlightRef.current) return;
    if (!force && Date.now() - lastMissedFetchRef.current < LIKES_STALE_MS) {
      return;
    }
    missedInFlightRef.current = true;
    // Liste tazelenirken BAKİYE de tazelensin. /Stats `staleTime: Infinity` ile
    // oturumda bir kez çekiliyor; bu ekranın kota satırı onun dışında hiçbir
    // yerden yenilenmiyordu, yani başka bir cihazdan (ya da bu oturumdan önce)
    // harcanmış hak ekranda hep eski değeriyle duruyordu — kullanıcının
    // "5/5 yazıyor ve hiç azalmıyor" dediği durumun ikinci yarısı bu.
    //
    // Ayrı bir damga tutmuyoruz: yukarıdaki `LIKES_STALE_MS` guard'ının arkasında
    // olduğu için sekmeye her girişte değil, en fazla 30 sn'de bir istek çıkar.
    refetchStatsRef.current?.()?.catch?.(() => {});
    // Dolu listeyi skeleton'a çevirme — beğeni listesindeki `silent` kuralının
    // aynısı. Kapı "liste boş mu" DEĞİL "ilk tur bitti mi": boş bir liste
    // eskiden HER tazelemede iskelete düşüp geri dönüyordu (boş → iskelet →
    // boş), oysa ekranda zaten bir cevap duruyor.
    if (!missedLoadedRef.current) setMissedLoading(true);
    try {
      const page = await fetchMissedMatches(1, 20, mode);
      setMissed(page.profiles);
      // Adet listenin uzunluğundan DEĞİL zarftan: `profiles` ilk sayfa, sayı
      // tüm kümeyi anlatmalı.
      setMissedTotal(page.totalProfiles);
      // Damga YALNIZ başarıda: hatada 0'da kalır, bir sonraki girişte koşulsuz
      // yeniden denenir.
      lastMissedFetchRef.current = Date.now();
    } catch {
      // yut
    } finally {
      // Hatada da işaretleniyor: yoksa istek düşen kullanıcı sonsuza kadar
      // iskelete bakardı. Tazelik damgası (lastMissedFetchRef) yalnız başarıda
      // yazıldığı için bir sonraki girişte istek koşulsuz yineleniyor.
      missedLoadedRef.current = true;
      setMissedLoaded(true);
      setMissedLoading(false);
      missedInFlightRef.current = false;
    }
  }, []);

  /**
   * Yalnız ADEDİ çeken hafif tur — sekmeye GİRMEDEN pill'de sayı görünsün diye.
   *
   * `pageSize: 1`: bize `totalProfiles` lazım, 20 kartlık gövde değil. Sekme
   * açıldığında listeyi `loadMissed` ayrıca çekiyor.
   *
   * Tazelik damgası listeninkinden AYRI (`lastMissedCountFetchRef`) — bu tur
   * listeyi doldurmadığı için onun damgasına yazsaydı, sekmeye girildiğinde
   * liste "az önce çekildi" sayılıp boş kalırdı. Ters yön ise geçerli: liste
   * taze çekildiyse sayı da onunla gelmiştir, ikinci istek boşuna.
   */
  const loadMissedCount = useCallback(async () => {
    if (missedCountInFlightRef.current || missedInFlightRef.current) return;
    const now = Date.now();
    if (now - lastMissedFetchRef.current < LIKES_STALE_MS) return;
    if (now - lastMissedCountFetchRef.current < LIKES_STALE_MS) return;
    missedCountInFlightRef.current = true;
    try {
      const page = await fetchMissedMatches(1, 1, mode);
      setMissedTotal(page.totalProfiles);
      lastMissedCountFetchRef.current = Date.now();
    } catch {
      // yut — sayı "bilinmiyor" kalır, pill sayısız çizilir. Uydurma bir rakam
      // (ör. 0) göstermek sekmeyi yanlışlıkla "boş" ilan ederdi.
    } finally {
      missedCountInFlightRef.current = false;
    }
  }, []);

  /**
   * Kaçırdıkların listesinden tek kart düşürme — TEK giriş noktası.
   *
   * Adet listeden ayrı tutulduğu için (sekmeye girmeden de biliniyor) düşüş
   * İKİSİNE birden uygulanmalı; yoksa kurtardığın kart gittiği hâlde pill eski
   * sayıda kalırdı.
   *
   * Sayaç yalnız GERÇEKTEN düşen kart için iniyor. Liste hiç çekilmemişse
   * (sekmeye girilmediyse) burada eşleşme olmaz ve sayı olduğu gibi kalır —
   * bir sonraki odaklanmada kanonik değerine döner.
   */
  const dropMissed = useCallback((userId) => {
    if (!userId) return;
    const prev = missedRef.current;
    const next = prev.filter((it) => it.userId !== userId);
    if (next.length === prev.length) return;
    missedRef.current = next;
    setMissed(next);
    setMissedTotal((n) => (typeof n === "number" ? Math.max(0, n - 1) : n));
  }, []);

  useEffect(() => {
    if (activeTab !== "missed") return;
    loadMissed();
  }, [activeTab, loadMissed]);

  // Ekran ODAKTAYKEN adet turu. `isFocused` kapısı şart: bu ekran boot'ta
  // `navigation.preload("Likes")` ile mount oluyor ve koşulsuz bir mount
  // effect'i her açılışa bir istek eklerdi (bkz. yukarıdaki not). Odak
  // Discover'dayken burada istek ÇIKMAZ; sayı ancak kullanıcı gerçekten
  // Beğeniler'e geldiğinde isteniyor.
  useEffect(() => {
    if (activeTab === "missed") return;
    if (!navigation.isFocused()) return;
    loadMissedCount();
  }, [activeTab, navigation, loadMissedCount]);

  // Ekrana geri dönüldüğünde tazele. Beğeni listesindeki görünürlük kuralının
  // aynısı ama KENDİ damgasıyla: iki liste ayrı uçlardan geliyor, birinin
  // tazeliği diğerininkini söylemiyor.
  //
  // Sekme açıksa TÜM liste, değilse yalnız adet tazeleniyor — pill başka bir
  // sekmedeyken de doğru sayıyı göstermeli.
  useEffect(() => {
    const unsub = navigation.addListener("focus", () => {
      if (activeTab === "missed") loadMissed();
      else loadMissedCount();
    });
    return unsub;
  }, [activeTab, navigation, loadMissed, loadMissedCount]);

  // Arka plandan dönüş — Likes ZATEN odaktayken 'focus' çıkmıyor (bkz. aşağıdaki
  // görünürlük tazelemesi notu). Ref'te tutuluyor ki AppState aboneliği sekme
  // her değiştiğinde yeniden kurulmasın.
  const resumeMissedRef = useRef(() => {});
  resumeMissedRef.current = () => {
    if (activeTab === "missed") loadMissed();
    else loadMissedCount();
  };

  const scrollY = useSharedValue(0);
  const scrollHandler = useAnimatedScrollHandler({
    onScroll: (e) => {
      scrollY.value = e.contentOffset.y;
    },
  });
  // Şerit ARTIK KAYMIYOR: header'ın kendi satırında duruyor (bkz. ScreenHeader
  // `centerSlot`, Profil ekranındaki kurulumun aynısı). Eskiden içerikle
  // birlikte yukarı çıkıp yerini header'ın küçük başlığına bırakıyordu; sekmeler
  // etkileşimli olduğu için kaydırınca erişilemez hâle geliyorlardı.
  // `scrollY` yalnız header'ın bulanık zeminini besliyor.

  // Detay preview state — karta tıklayınca LikerProfile detayını çekip
  // PreviewModal'da SwipeCard layout'unu reuse ederek gösteriyoruz.
  const [previewVisible, setPreviewVisible] = useState(false);
  const [previewProfile, setPreviewProfile] = useState(null);
  // Açılan kartın SWIPE'sız olup olmadığı — "kaçırdıkların" sekmesinde kart
  // yalnız okunur açılır (bkz. LikerSwipeModal `swipeDisabled`).
  //
  // Sekmeye render anında bakmak yerine AÇILIŞTA dondurmasının sebebi kapanış:
  // `previewVisible` false olduktan sonra sheet hâlâ ekranda kayıyor ve o sırada
  // bayrak değişirse aksiyon satırı bir an belirip kartla birlikte aşağı iniyor.
  // Bu yüzden kapanışta da SIFIRLANMIYOR; bir sonraki açılış üzerine yazar.
  const [previewSwipeDisabled, setPreviewSwipeDisabled] = useState(false);
  const [_previewLoading, setPreviewLoading] = useState(false);

  // Sekmeler AYRIK kümeler: bir kart tek bir sekmeye ait. Not bir beğeninin
  // üstüne binen ayrı ürün olduğu için "Beğeni" sekmesinden de çıkarılıyor —
  // yoksa aynı kart hem orada hem "Notlar"da görünürdü. Önceliği not alıyor,
  // kartın rozetindeki sırayla aynı (bkz. LikeCard'ın sağ üst rozeti).
  //
  // Bayrak İÇERİĞE değil `isNote`e DE bakıyor: realtime gelen kartta önizleme
  // boş olabiliyor (`notePreview` yok) — o kart notluğunu kaybetmemeli.
  //
  // ⚠️ BEŞ SEKMENİN HEPSİ birden hesaplanıyor, yalnız aktif olan değil: pager'da
  // beş sayfa da aynı anda canlı ve her biri kendi dizisini istiyor.
  //
  // ⚠️ useMemo ŞART, kozmetik değil: bu her çizimde yeni diziler üretiyordu ve
  // FlatList `data` referansına bakıyor — sekmeyle ilgisi olmayan her state
  // değişiminde (kota, hub olayı) liste kendini baştan çizdiriyordu. Tek bir
  // memo'da toplanması da bilinçli: `likes` değişince beşi birden tazelenir,
  // ayrı memo'lar aynı diziyi beş kez gezerdi.
  const likesByTab = useMemo(() => {
    const note = [];
    const like = [];
    const fire = [];
    for (const l of likes) {
      if (l.note || l.isNote) note.push(l);
      else if (l.isSuperLike) fire.push(l);
      else like.push(l);
    }
    return {
      all: likes,
      like,
      fire: fire,
      note,
    };
  }, [likes]);

  // Pill'lerin yanındaki adetler. Sınıflandırma `likesByTab` ile AYNI sırayı
  // izliyor (önce not, sonra Fire) — sekmeler ayrık kümeler, bir kart
  // tek bir sayıya girer.
  const likeCounts = useMemo(
    () => ({
      all: likes.length,
      like: likesByTab.like.length,
      fire: likesByTab.fire.length,
      note: likesByTab.note.length,
    }),
    [likes, likesByTab],
  );

  // Kaçırdıkların sekmesi AYRI bir veri kaynağı (beğeni listesinin filtresi
  // değil): farklı uç, farklı sayfalama, farklı boş durum.
  const isMissedTab = activeTab === "missed";
  const listDataFor = useCallback(
    (tabKey: string) =>
      tabKey === "missed" ? missed : likesByTab[tabKey],
    [missed, likesByTab],
  );

  // Başlığın yanındaki "Beğenenleri gör" pill'inin GÖRÜNÜRLÜK kapısı (bkz.
  // headerActionFor). Premium upsell'in ekrandaki tek yeri o pill; alttaki
  // sticky buton kaldırıldı.
  //   tier bilindi     → premium durumu bilinmeden çizme, sonra geri alma
  //   !isPremium       → premium'a satış yapma
  //   liste dolu       → boş durumda EmptyState'in kendi CTA'sı var; kilitli
  //                      kart yokken açılacak bir şey de yok
  //
  // Kaçırdıkların ARTIK DAHİL (2026-08-31): o sekmenin kartları da blur'lu ve
  // kilidi açan şey aynı abonelik. Sekme eskiden istisnaydı ("liste gating'e
  // tabi değil") — kartlar blur'suz çizildiği sürece doğruydu, artık değil.
  // Listesi ayrı bir kaynaktan geldiği için uzunluğu `listDataFor` üzerinden
  // okunuyor (`likesByTab` bu sekmeyi tanımıyor).
  const showPremiumUpsellFor = useCallback(
    (tabKey: string) =>
      (premiumResolved || premiumChecked) &&
      !isPremium &&
      (listDataFor(tabKey)?.length ?? 0) > 0,
    [premiumResolved, premiumChecked, isPremium, listDataFor],
  );

  // Kurtarma artık bir BAKİYE değil (2026-08-31): premium'da sınırsız, free'de
  // hiç yok. Sayı, payda, "kalan hak" kavramı ve satın alınabilir paket kalktı.
  // Tek yorumlama noktası recoveryQuota.ts.
  const recoveryAccess = useMemo(
    () => resolveRecoveryAccess(statsQuery.data),
    [statsQuery.data],
  );
  // Açıklama satırına eklenen kurtarma cümlesi.
  //
  // Free'de SAYAÇ GÖSTERİLMİYOR ("0 hakkın kaldı" yerine hiçbir şey): kazanılıp
  // yenilenecek bir hak yok, sayaç yanıltıcı olurdu — satış başlıktaki pill'de
  // (bkz. headerActionFor). Sinyal hiç okunamadıysa da yazmıyoruz; "Sınırsız"
  // demek olmayan bir hakkı vaat etmek olurdu.
  const recoveryAccessText = useMemo(
    () =>
      recoveryAccess.unlimited && !recoveryAccess.unknown
        ? t("likes.recoverUnlimited")
        : null,
    [recoveryAccess, t],
  );

  // Bölüm başlığı — HER sekmede listenin ne olduğunu söyleyen sabit bir metin,
  // kaçırdıkların sekmesi DAHİL. Orada eskiden başlık bakiyenin kendisiydi
  // ("Kurtarma hakkın: 3/5"): sayfanın büyük başlığı sekmenin adını hiç
  // söylemiyordu ve bakiye bilinmediğinde blok tümden kaybolduğu için açıklama
  // satırı da gidiyordu. Bakiye artık açıklamanın içinde (bkz.
  // tabDescriptionFor) — başlık her sekmede aynı işi yapıyor.
  const sectionTitleFor = useCallback(
    (tabKey: string) =>
      tabKey === "missed"
          ? t("likes.headerMissed")
          : tabKey === "like"
          ? t("likes.headerLike")
          : tabKey === "fire"
            ? t("likes.headerFire")
            : tabKey === "note"
              ? t("likes.headerNote")
              : t("likes.headerAll"),
    [t],
  );

  // Başlığın SAĞINDAKİ pill. Her sekmede aynı görev: bu sekmede kilidi/eksiği
  // açan sheet'i açmak. Metin sekmeye göre değişiyor, çünkü satılan şey de
  // değişiyor.
  //   • Fire / not → kendi consumable paket sheet'leri, "Nasıl alırım?".
  //     KOŞULSUZ çiziliyor: ikisi de tükenen ürün, elinde kaç tane olduğu bu
  //     ekrandan görünmüyor ve daha fazlası her zaman satın alınabilir.
  //   • Tümü / Beğeni / Kaçırdıkların → "Beğenenleri gör", premium sheet'i.
  //     Satılan bir consumable yok ama kartlar kilitli: bu sekmelerde upsell
  //     artık alttaki sticky butonda değil BURADA (bkz. showPremiumUpsell).
  //     Buton listenin üstüne biniyordu ve kilidin ne olduğunu ancak sayfanın
  //     dibinde söylüyordu; pill kilitli kartların hemen üstünde duruyor.
  //     Kaçırdıkların bu üçlüye 2026-08-31'de KATILDI: kartları artık blur'lu
  //     ve kurtarma premium ayrıcalığı oldu, yani orada da satılan şey abonelik.
  //     Eski kapı bakiyenin sıfır olmasıydı (`recoveryEmpty`) ve satılan şey
  //     kurtarma paketiydi — ikisi de kalktı.
  //
  // ⚠️ `onPress`ler SABİT referans (aşağıdaki üç useCallback): pill başlık
  // bloğunun içinde ve blok memo'lu (bkz. LikesListHeader) — her çağrıda yeni
  // bir kapanış üretilseydi memo hiç tutmaz, blok ekranın her render'ında
  // yeniden commit edilirdi.
  const openFirePurchase = useCallback(
    () => setFirePurchaseVisible(true),
    [],
  );
  const openNotePurchase = useCallback(() => setNotePurchaseVisible(true), []);
  const openPremiumPurchase = useCallback(() => openLitPlus(), []);
  const headerActionFor = useCallback(
    (tabKey: string) => {
      if (tabKey === "fire") {
        return {
          label: t("likes.howToGetAction"),
          onPress: openFirePurchase,
        };
      }
      if (tabKey === "note") {
        return {
          label: t("likes.howToGetAction"),
          onPress: openNotePurchase,
        };
      }
      if (
        (tabKey === "all" || tabKey === "like" || tabKey === "missed") &&
        showPremiumUpsellFor(tabKey)
      ) {
        return {
          label: t("likes.viewLikersAction"),
          onPress: openPremiumPurchase,
        };
      }
      return null;
    },
    [
      showPremiumUpsellFor,
      t,
      openFirePurchase,
      openNotePurchase,
      openPremiumPurchase,
    ],
  );

  // Boş durum alt metni: pencere uzunluğu backend'den geldiyse sayıyla, yoksa
  // sayısız varyantla. Sabit "30 gün" yazmak, config değiştiği gün yalan olurdu.
  const missedEmptySubtitle = useMemo(() => {
    const days = statsQuery.data?.missedMatchLookbackDays;
    return typeof days === "number" && days > 0
      ? t("likes.emptyMissedSubtitleDays", { days })
      : t("likes.emptyMissedSubtitle");
  }, [statsQuery.data?.missedMatchLookbackDays, t]);

  // Sekme pill'i kaçırdıkların ADEDİNİ liste isteğinden ÖNCE biliyor
  // (loadMissedCount — ekran odaklanınca uçuyor). Sayı sıfırsa cevabı zaten
  // biliyoruz: liste isteğini beklemeye, yani iskelet göstermeye gerek yok,
  // sayfa doğrudan boş durumla açılıyor. Aksi hâlde "boş sayfa → iskelet → boş
  // durum" üçlemesi çıkıyordu ve istek pager'ın kayması bitmeden döndüğü için
  // üçü de geçişin ortasında görünüyordu.
  // `null` (adet BİLİNMİYOR) sıfır değil — o hâlde iskelet doğru cevap.
  const missedKnownEmpty = missedTotal === 0;
  // Kaçırdıkların sayfasında iskelet mi çiziliyor — yalnız gerçekten kart
  // beklerken: istek uçuyorken (pill'e basınca başlıyor, sayfa daha kaymadan)
  // ya da sekme AÇIKKEN ilk tur hiç yapılmamışsa (parmakla gelme / odak).
  // Sekme kapalı ve istek yoksa iskelet YOK: shimmer sonsuz bir döngü,
  // görünmeyen sayfada boşuna dönerdi (bu ekran boot'ta preload ediliyor).
  const missedSkeletonVisible =
    !missedKnownEmpty && (missedLoading || (isMissedTab && !missedLoaded));

  // Büyük başlığın ALTINDAKİ tek cümlelik açıklama. Kaçırdıkların penceresi
  // backend'den geliyor (/Stats → missedMatchLookbackDays); sayı henüz yoksa
  // sayısız varyanta düşüyor — gömülü bir "30 gün" config değiştiği gün yalan
  // söylerdi.
  //
  // Kaçırdıkların sekmesinde cümlenin SONUNA kurtarma cümlesi ekleniyor —
  // ama YALNIZ premium'da ("Kurtarma sınırsız."). Free'de eklenmiyor: eskiden
  // burada bakiye yazıyordu, artık kazanılabilecek bir hak olmadığı için "0
  // hakkın kaldı" demek yanıltıcı olurdu. Free'ye teklif başlığın yanındaki
  // pill'den geliyor (bkz. headerActionFor).
  const tabDescriptionFor = useCallback(
    (tabKey: string) => {
      if (tabKey === "missed") {
        const days = statsQuery.data?.missedMatchLookbackDays;
        const desc =
          typeof days === "number" && days > 0
            ? t("likes.descMissedDays", { days })
            : t("likes.descMissed");
        return recoveryAccessText ? `${desc} ${recoveryAccessText}` : desc;
      }
      if (tabKey === "like") return t("likes.descLike");
      if (tabKey === "fire") return t("likes.descFire");
      if (tabKey === "note") return t("likes.descNote");
      return t("likes.descAll");
    },
    [statsQuery.data?.missedMatchLookbackDays, recoveryAccessText, t],
  );

  // `silent`: listeyi ekranda tutarak tazele. Görünürlük tazelemesinde (focus /
  // foreground) setLoading(true) tüm grid'i skeleton'a çeviriyordu — kullanıcı
  // zaten dolu bir listeye bakarken ekranın yanıp sönmesi anlamsız.
  const fetchWhoLikedMe = useCallback(
    async (page = 1, { silent = false } = {}) => {
      // In-flight dedupe: preload mount'u + kullanıcı navigasyonu/premium-transition
      // aynı anda tetikleyince istek çiftleniyordu (Sentry trace kanıtlı). State
      // (loading) async güncellendiği için guard ref ile senkron tutulur.
      if (whoLikedMeInFlightRef.current) return;
      whoLikedMeInFlightRef.current = true;
      try {
        // `hasLoadedOnceRef` ikinci bir kilit: çağıran `silent` demeyi unutsa bile
        // ilk yüklemeden sonrası asla skeleton'a düşmez.
        if (!silent && !hasLoadedOnceRef.current) setLoading(true);
        // Yeni API: superLikes ve likes ayrı paginated bölümler.
        // Şimdilik ikisini de tek sayfa olarak çekiyoruz, ileride ayrı paginate edebiliriz.
        // getMyProfile YALNIZ ilk yüklemede: tek işi `profilePremium`'u kurmak ve
        // sonraki değişimler redux'tan geliyor (satın alma + hub
        // `SubscriptionChanged`). Sessiz tazeleme her focus/foreground'da bunu da
        // çekseydi görünürlük tazelemesinin istek maliyeti iki katına çıkardı.
        // Premium daha hiç doğrulanamadıysa (ilk çekim hata aldı) sessiz tazeleme
        // de profili dener — yoksa buton, ekran remount olana kadar gizli kalırdı.
        const [data, profile] = await Promise.all([
          swipeService.getWhoLikedMe(page),
          silent && premiumCheckedRef.current
            ? Promise.resolve(null)
            : profileService.getMyProfile().catch(() => null),
        ]);

        if (profile) {
          premiumCheckedRef.current = true;
          setPremiumChecked(true);
          // İKİ YÖNLÜ yazılıyor: eskiden yalnız true'ya çekiliyordu ve bayrak bir
          // kez kalktıktan sonra hiçbir şey onu indiremiyordu.
          setProfilePremium(!!profile.isPremium);
        }

        if (data.isSuccess && data.result) {
          const fireProfiles = (
            data.result.superLikes?.profiles || []
          ).map((p) => ({
            id: `sl_${p.profileId}`,
            userId: p.userId, // LikerProfile detay endpoint'i için lazım
            name: p.displayName,
            // Gizli yaş `null` değil `0` geliyor (DTO'da non-nullable int) —
            // normalize burada, kart `age != null` kontrolüne güvenebilsin.
            age: resolveCardAge(p),
            universityName: p.universityNameDisplay || p.universityName || "",
            mainPhoto: p.photos?.[0] || "",
            likedAt: p.likedMeAt,
            isSuperLike: true,
            isPremium: p.isPremium ?? false,
            // `isNote` sunucunun bayrağı, `note` içeriği. İkisi ayrı: bayrak
            // true iken içerik boş gelirse (beklenmiyor ama) blur yine açılır.
            isNote: !!p.isNote,
            note: normalizeLikerNote(p),
            // ⚠️ KİLİT KURALINA GİRMİYOR (bkz. isUnlockedLike): bu listede
            // bayrak her kart için `true` geliyor, çünkü liste zaten "seni
            // beğenenler". Alan yalnız taşınıyor.
            hasLikedMe: p.hasLikedMe === true,
            // Kilitli kartın ipucu katmanı (bkz. likerCardTeaser) + açık
            // karttaki foto doğrulama rozeti. İkisi de sunucunun zaten taşıdığı
            // alanlar; ipucunun üniversitesi yukarıdaki `universityName`'den
            // geliyor — kilitli kart da açık kart da AYNI alanı okuyor.
            isSelfieVerified: p.isSelfieVerified ?? null,
            relationshipIntent: p.relationshipIntent ?? null,
            relationshipIntentDisplay: p.relationshipIntentDisplay ?? null,
          }));
          const likeProfiles = (data.result.likes?.profiles || []).map((p) => ({
            id: `l_${p.profileId}`,
            userId: p.userId,
            name: p.displayName,
            age: resolveCardAge(p),
            universityName: p.universityNameDisplay || p.universityName || "",
            mainPhoto: p.photos?.[0] || "",
            likedAt: p.likedMeAt,
            isSuperLike: false,
            isPremium: p.isPremium ?? false,
            isNote: !!p.isNote,
            note: normalizeLikerNote(p),
            hasLikedMe: p.hasLikedMe === true,
            // Kilitli kartın ipucu katmanı (bkz. likerCardTeaser) + açık
            // karttaki foto doğrulama rozeti. İkisi de sunucunun zaten taşıdığı
            // alanlar; ipucunun üniversitesi yukarıdaki `universityName`'den
            // geliyor — kilitli kart da açık kart da AYNI alanı okuyor.
            isSelfieVerified: p.isSelfieVerified ?? null,
            relationshipIntent: p.relationshipIntent ?? null,
            relationshipIntentDisplay: p.relationshipIntentDisplay ?? null,
          }));

          // Fire'lar her zaman üstte (vurgulu bölüm).
          const merged = [...fireProfiles, ...likeProfiles];
          setLikes(merged);
          const slTotal = data.result.superLikes?.totalProfiles || 0;
          const lTotal = data.result.likes?.totalProfiles || 0;
          // Sayaç TOPLAM'dan, id kümesi yüklenen sayfadan — ikisi kasten ayrı
          // (bkz. SwipeState.whoLikedMeIds).
          dispatch(
            setWhoLikedMe({
              count: slTotal + lTotal,
              ids: merged.map((it) => it.userId),
            }),
          );
          setHasNextPage(data.result.likes?.hasNextPage || false);
          setCurrentPage(data.result.likes?.currentPage || 1);
          // Tazelik damgası YALNIZ başarıda. Hata yutulduğu için (aşağıdaki boş
          // catch) başarısız bir çekim ekranı "hiç beğenin yok" boş durumuna
          // düşürüyordu; damga 0'da kaldığı sürece bir sonraki görünürlükte
          // koşulsuz yeniden denenir.
          lastLikesFetchRef.current = Date.now();
        }
      } catch {
        // yut
      } finally {
        // Hata da olsa "ilk yükleme bitti": başarısız çekim ekranı boş duruma
        // düşürür, bir sonraki tazeleme onu sessizce doldurur (bkz.
        // lastLikesFetchRef damgası — hatada 0'da kalır, koşulsuz yeniden denenir).
        hasLoadedOnceRef.current = true;
        setLoading(false);
        whoLikedMeInFlightRef.current = false;
      }
    },
    [dispatch],
  );

  // Skeleton görünürlüğü — `loading`'in kendisi değil, geciktirilmiş/asgari
  // süreli türevi. Hızlı cevapta hiç açılmaz, açıldıysa da yanıp sönmeyecek
  // kadar kalır.
  const [showSkeleton, setShowSkeleton] = useState(false);
  const skeletonShownAtRef = useRef(0);
  useEffect(() => {
    if (loading) {
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
  }, [loading, showSkeleton]);

  useEffect(() => {
    fetchWhoLikedMe();
  }, [fetchWhoLikedMe]);

  // ============ Görünürlük tazelemesi ============
  // Bu ekran DiscoverScreen'in `navigation.preload("Likes")` çağrısıyla boot'ta
  // mount olup uygulama ömrü boyunca mount kalıyor → mount effect'i bir kez
  // çalışıyor ve liste `useState`'te donuyor. Sonuç: arka planda gelen beğeniyi
  // bildirimden açtığında rozet (redux, AppNavigator foreground turundan) artıyor
  // ama grid bayat/boş kalıyordu — ekranın local state'ine kimse dokunmuyor.
  // İki tetikleyici birlikte tüm vakaları kapsıyor:
  //   focus     → başka bir tab'dan (veya bildirim tap'iyle) Likes'a girildi
  //   foreground→ Likes ZATEN odaktayken arka plana atılıp geri dönüldü; bu
  //               durumda ekran hiç blur olmadığı için 'focus' event'i çıkmıyor
  const refreshLikesIfStale = useCallback(() => {
    if (Date.now() - lastLikesFetchRef.current < LIKES_STALE_MS) return;
    fetchWhoLikedMe(1, { silent: true });
  }, [fetchWhoLikedMe]);

  // Beğeni bildirimine basılarak girildi → eşiğe bakma, koşulsuz tazele
  // (bkz. AppNavigator routeFromNotification 'Like'/'SuperLike').
  useEffect(() => {
    return uiBus.on("likesDirty", () => {
      lastLikesFetchRef.current = 0;
      fetchWhoLikedMe(1, { silent: true });
    });
  }, [fetchWhoLikedMe]);

  useEffect(() => {
    const unsubFocus = navigation.addListener("focus", refreshLikesIfStale);
    const sub = AppState.addEventListener("change", (next) => {
      const prev = appStateRef.current;
      appStateRef.current = next;
      if (!prev.match(/inactive|background/) || next !== "active") return;
      // Odakta değilsek boşuna istek atma — Likes'a geçildiğinde 'focus' zaten
      // aynı kontrolü yapacak.
      if (!navigation.isFocused()) return;
      refreshLikesIfStale();
      // Kaçırdıkların da bayatlıyor: sekme açıksa liste, değilse yalnız pill'in
      // adedi. İkisi de kendi 30 sn eşiğinin arkasında.
      resumeMissedRef.current?.();
    });
    return () => {
      unsubFocus();
      sub.remove();
    };
  }, [navigation, refreshLikesIfStale]);

  // NOT: burada `profilePremium`'u elle indiren bir effect vardı. Tek işi
  // tek yönlü OR'u telafi etmekti (redux false'a düşse bile profil bayrağı
  // ekranı premium tutuyordu). Tier artık kanonik kaynaktan okunduğu için o
  // telafiye gerek yok — bir bayrağı iki yerden yönetmek de bu ekranın asıl
  // sorunuydu.

  // Premium geçişinde listeyi tazele — İKİ YÖNDE de. Bu ekran react-query
  // kullanmadığı için PurchaseModal'ın refetchPremiumScoped'u buraya dokunmuyor.
  //
  //   false→true: liste free scope'ta çekilmiş olabiliyor (backend free
  //               kullanıcıya kısıtlı alan dönerse foto/isim eksik kalırdı).
  //               PurchaseModal'ın onSuccess callback'inin yerini tutar ve
  //               premium'un başka bir ekrandan (Discover/Profile) veya restore
  //               ile alındığı durumu da kapsar.
  //   true→false: TERSİ — bellekteki liste premium scope'ta çekilmiş net
  //               fotoğrafları taşıyor. Yalnız `isPremium`i false yapmak blur'u
  //               geri getirir ama veriyi free scope'a döndürmez; kart açıldığında
  //               premium-scoped alanlar hâlâ elimizde olurdu.
  const prevIsPremiumRef = useRef(isPremium);
  useEffect(() => {
    if (prevIsPremiumRef.current === isPremium) return;
    prevIsPremiumRef.current = isPremium;
    fetchWhoLikedMe();
  }, [isPremium, fetchWhoLikedMe]);

  // Karta tıklayınca:
  //   - Premium DEĞİL ve normal like → PurchaseModal aç (upsell).
  //   - Premium ise VEYA beğeni zaten açıksa (Fire / NOT — bkz.
  //     `isUnlockedLike`) → LikerProfile detayını çek + interactive
  //     SwipeWrapper'lı LikerSwipeModal'ı aç. Kullanıcı sağa/sola kaydırıp
  //     like/pass yapabilir; mutual like ise backend match yaratır, global
  //     MatchModal açılır.
  // İstisna kartın görselindekiyle AYNI kaptan geliyor: kart blur'suz
  // gösterilip dokununca paywall açmak, gönderenin satın aldığı şeyi teslim
  // etmemek olurdu.
  // 404 → liker silinmiş/banlanmış/like'ını geri çekmiş → modal'ı kapat ve
  // listeyi yenile.
  // useCallback: karta prop olarak gidiyor ve kart memo'lu — her çizimde yeni
  // bir referans üretseydi memo hiçbir zaman tutmazdı.
  const openLikerProfile = useCallback(
    async (item) => {
      if (!isPremium && !isUnlockedLike(item)) {
        // §11: paywall'dan önce canonical tazeleme — başka cihazda premium
        // olunmuşsa kullanıcıyı satış ekranına düşürmek yerine doğrudan profili
        // açıyoruz (bu ekranın premium transition effect'i listeyi de tazeler).
        const premium = await dispatch(refreshEntitlementsForPaywall())
          .unwrap()
          .catch(() => false);
        if (!premium) {
          openLitPlus();
          return;
        }
      }
      const likerUserId = item?.userId || item?.likerUserId;
      if (!likerUserId) return;
      setPreviewProfile(null);
      setPreviewLoading(true);
      try {
        const res = await swipeService.getLikerProfileDetail(likerUserId, mode);
        if (res?.isSuccess && res?.result) {
          setPreviewProfile(res.result);
          // Kaçırılan eşleşmede yanıt yolu TEK: kurtarma. Detayda swipe açık
          // kalsaydı listede olmayan bir aksiyon (pas/beğen) kotasız bir arka
          // kapıdan sunulmuş olurdu.
          setPreviewSwipeDisabled(isMissedTab);
          setPreviewVisible(true);
        } else {
          fetchWhoLikedMe();
        }
      } catch (e) {
        const status = e?.response?.status ?? e?.status;
        if (status === 404) {
          fetchWhoLikedMe();
        } else if (status === 401 || status === 403) {
          // Backend LikerProfile'ı premium'a kilitliyorsa free kullanıcının açık
          // bir karta (Fire / NOT) dokunuşu sessizce ölmesin: paywall'a düş.
          // Bu dal ancak backend bu istisnaları tanımıyorsa çalışır — kalıcı
          // çözüm orada, burası sadece ölü dokunuşa karşı emniyet.
          openLitPlus();
        }
      } finally {
        setPreviewLoading(false);
      }
      // ⚠️ `isMissedTab` bağımlılıkta OLMAK ZORUNDA: önizlemenin swipe'ı ona göre
      // kapanıyor (kaçırılan eşleşmede tek yanıt kurtarma). Kapanış bayat bir
      // sekme değeri yakalasaydı kaçırdıkların detayında pas/beğen açık kalırdı.
      // `isUnlockedLike` modül seviyesinde saf bir fonksiyon, bağımlılık değil.
    },
    [isPremium, isMissedTab, dispatch, fetchWhoLikedMe],
  );

  const handleClosePreview = () => {
    setPreviewVisible(false);
    setPreviewProfile(null);
  };

  /**
   * "Kurtar" — pass'i like'a çevirir, karşı taraf zaten beğendiği için sonuç
   * gerçek bir eşleşmedir.
   *
   * Akış ONAY BUTONUYLA BİREBİR AYNI (bkz. handleQuickSwipe) ve bu bilinçli:
   * köşedeki cam buton sekmeye göre "beğen" ya da "kurtar" oluyor, ikisi aynı
   * köşenin iki hâli — basışa verdikleri cevap ayrışmamalı. Değişen üç şey:
   *   • SPINNER YOK. Eskiden yanıt beklenirken butonun glifi loader'a dönüyor
   *     (`recoveringId` + `busy`), kart da yerinde donuyordu; kutlama ancak
   *     cevap gelince başlıyordu. Free kullanıcıda dönen şey daha da
   *     yanıltıcıydı — bekleyen aksiyon değil, sonunda paywall'a çıkacak bir
   *     kontroldü (aynı gerekçe: actingRef).
   *   • Paywall kapısı istekten ÖNCE: free kullanıcı 403'ü beklemeden satış
   *     ekranını görüyor ve kart hiç kıpırdamıyor.
   *   • İstek fire-and-forget; kutlama AYNI KAREDE başlıyor, yanıt yalnız
   *     sonucu bildiriyor (toast + hata yolunda listeyi sunucudan doğrulatma).
   *
   * Yanıt `matchId` TAŞIMIYOR: backend `Match` ve `Conversation` satırlarını
   * asenkron yazıyor, sohbete yönlendirme SignalR `MatchNotification`ından
   * geliyor (AppNavigator global MatchModal'ı açıyor, bu ekran da `uiBus`
   * "match" ile kartı zaten düşürüyor).
   */
  const handleRecover = useCallback(
    async (item) => {
      const userId = item?.userId;
      // Guard beğeniyle aynı: uçmakta olan kart hâlâ veride duruyor, ikinci
      // basış aynı kişiye ikinci bir istek göndermesin. Kartlar birbirini
      // BLOKLAMIYOR — çıkışlar bağımsız, ekranı kaplayan ortak bir kutlama yok.
      if (!userId || actingRef.current || exitTimersRef.current.has(userId)) {
        return;
      }

      // Kurtarma 2026-08-31'den beri premium ayrıcalığı: tükenebilecek bir kota
      // yok, sunucunun 403'ü TEK bir şey demek — kullanıcı free. O yüzden kapı
      // istekten önce burada: satılacak şey de zaten aboneliğin kendisi.
      //
      // §11: paywall'dan ÖNCE canonical tazeleme — başka cihazda ABONE OLUNMUŞSA
      // doğru cevap satış ekranı değil, kartların kilidini açmak. Tazeleme
      // SESSİZ (actingRef): kartta hiçbir iz bırakmıyor.
      if (!isPremium) {
        actingRef.current = true;
        const premium = await dispatch(refreshEntitlementsForPaywall())
          .unwrap()
          .catch(() => false);
        actingRef.current = false;
        if (!premium) {
          openLitPlus();
          return;
        }
        statsQuery.refetch?.();
      }

      Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
      // İstek ANINDA gidiyor, kartın veriden düşmesi animasyon kadar gecikiyor.
      // Kurtarma = geri alınmış bir "geç", yani KESİN bir eşleşme: kutlamayı
      // MatchModal yapıyor (bkz. flameSweep'teki kural), kart burada yalnız
      // beğeni yönüne uçuyor — pas yönünün aynadaki hâli.
      //
      // Bakiye HİZALAMASI YOK ve gerekmiyor: kurtarma premium'da sınırsız,
      // free bu satıra hiç gelmiyor. Harcanan bir sayı olmadığı için ne iyimser
      // düşüş ne kanonik tazeleme kaldı (ikisi birlikte 2026-08-24'teki "kota
      // 5/5'te takılı kalıyor" bug'ı içindi).
      const request = recoverMissedMatch(userId, mode);
      // Hata yolundaki doğrulama çekimi kartın düşmesinden SONRA olmalı: kart
      // uçarken gelen taze liste onu yerinde tutar, uçuş yarıda kalırdı. Yanıt
      // çıkıştan önce de sonra da gelebildiği için iki yön de bu iki bayrakla
      // bağlanıyor.
      let exited = false;
      let needsResync = false;
      runCardExit(userId, "right", () => {
        exited = true;
        dropMissed(userId);
        if (needsResync) loadMissed({ force: true });
      });

      const outcome = await request;
      if (outcome.kind === "recovered") {
        showInfoToast({
          title: t("likes.recoverSuccessTitle"),
          message: t("likes.recoverSuccessMessage"),
          icon: "recovery",
        });
        // SignalR kopmuş olabilir: `MatchNotification` gelmezse sohbet
        // backend'de VARDIR ama uygulama haberdar olmaz. Tek seferlik emniyet —
        // sinyal geldiyse zaten AppNavigator tazeliyor, bu istek fazladan ama
        // zararsız. (Backend'in "eşleşme yok" durumu buraya HİÇ düşmüyor:
        // engelli/uygunsuz çift 400 ile ayrı dalda dönüyor.)
        if (matchSignalTimerRef.current) {
          clearTimeout(matchSignalTimerRef.current);
        }
        matchSignalTimerRef.current = setTimeout(() => {
          dispatch(fetchConversations({ force: true }));
        }, MATCH_SIGNAL_TIMEOUT_MS);
        return;
      }

      // Buradan aşağısı KART ZATEN GİTMİŞKEN çalışıyor — iyimser akışın bedeli.
      // Üç ihtimal kaldı: 400 (zaten kurtarılmış, pas penceresi geçmiş, çift
      // uygun değil), geçici hata (401/5xx/ağ) ve yerel tier bayatken gelen 403.
      // Hiçbirinde kurtarma gerçekleşmedi, yani son söz sunucunun: listeyi
      // tazeliyoruz ve kart hâlâ oradaysa geri geliyor.
      if (outcome.kind === "paywall") {
        // Yukarıdaki kapı `isPremium`e bakıyor; sunucu yine de 403 dediyse
        // yerel tier BAYAT (abonelik arada düşmüş olabilir). Canonical'i
        // tazele, hâlâ free ise satış ekranını aç — hata toast'ı YOK, paywall
        // mesajın kendisi.
        const premium = await dispatch(refreshEntitlementsForPaywall())
          .unwrap()
          .catch(() => false);
        if (premium) statsQuery.refetch?.();
        else openLitPlus();
      } else {
        showInfoToast({
          title: t("likes.recoverFailed"),
          message: outcome.message ?? "",
          icon: "recovery",
        });
      }
      if (exited) loadMissed({ force: true });
      else needsResync = true;
    },
    [dispatch, dropMissed, isPremium, loadMissed, runCardExit, statsQuery, t],
  );

  // LikerSwipeModal'dan dönen swipe sonrası — like/pass/fire/block fark
  // etmez,
  // kullanıcı bu liker'ı handle etti → listeden anında çıkar (backend
  // MatchNotification gelene kadar bekleme). Rozet de aynı karede düşer:
  // sayacı `next.length`e eşitlemiyoruz, o yalnızca YÜKLENEN sayfanın boyutu —
  // toplam daha büyükse rozeti sessizce yanlışa çekerdi.
  const handleLikerSwiped = (likerUserId, direction) => {
    if (!likerUserId) return;
    const passed = likesRef.current.find(
      (it) => it.userId === likerUserId || it.likerUserId === likerUserId,
    );
    const next = likesRef.current.filter(
      (it) => it.userId !== likerUserId && it.likerUserId !== likerUserId,
    );
    likesRef.current = next;
    setLikes(next);
    dispatch(removeWhoLikedMe(likerUserId));
    // Pass = kesin kaçırılmış eşleşme; bu kişi zaten seni beğenmişti.
    if (direction === "left") {
      showMissedMatchToast({
        name: passed?.name,
        photoUrl: passed?.mainPhoto,
      });
    }
  };

  /**
   * Karttaki yuvarlak X / ✓ butonları — LikerSwipeModal'ı açmadan doğrudan
   * pas/beğeni. Sonuç tarafı modal'daki jestle BİREBİR aynı yolu kullanıyor
   * (`useSwipeMutation` + `handleLikerSwiped`): liste/rozet düşmesi, kaçırılan
   * eşleşme toast'ı ve mutual like'ta MatchNotification akışı tek yerden gelir.
   *
   * Kilit, kart dokunuşundakiyle AYNI (bkz. openLikerProfile): free kullanıcı
   * blur'lu bir kartı butonla da "harcayamaz" — kim olduğunu görmeden pas
   * geçmek de beğenmek de premium'un sattığı bilgiyi bedava tüketirdi.
   * Açık beğeniler (Fire / NOT) burada da istisna: zaten blur'suz
   * gösteriliyorlar, yanıtlanabilmeleri ürünün kendisi (bkz. isUnlockedLike).
   */
  const handleQuickSwipe = useCallback(
    async (item, direction) => {
      const likerUserId = item?.userId || item?.likerUserId;
      // Uçmakta olan kart hâlâ veride duruyor: ikinci bir basış aynı kişiye
      // ikinci bir swipe göndermesin. Kartlar birbirini BLOKLAMIYOR — çıkışlar
      // bağımsız, ekranı kaplayan ortak bir kutlama yok.
      if (
        !likerUserId ||
        actingRef.current ||
        exitTimersRef.current.has(likerUserId)
      ) {
        return;
      }

      if (!isPremium && !isUnlockedLike(item)) {
        // §11: paywall'dan önce canonical tazeleme — başka cihazda premium
        // olunmuşsa kullanıcıyı satış ekranına düşürmek yanlış olur.
        // Bayrak SESSİZ: tazeleme kartta hiçbir iz bırakmıyor, kullanıcı ya
        // paywall'ı ya da (başka cihazda premium olunmuşsa) aksiyonun kendisini
        // görüyor (bkz. actingRef).
        actingRef.current = true;
        const premium = await dispatch(refreshEntitlementsForPaywall())
          .unwrap()
          .catch(() => false);
        actingRef.current = false;
        if (!premium) {
          openLitPlus();
          return;
        }
      }

      Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
      // İstek ANINDA gidiyor, kartın veriden düşmesi animasyon kadar gecikiyor:
      // görsel yumuşama ağı bekletmesin.
      swipeMutate({ direction, userId: likerUserId });
      if (direction === "right") {
        // ONAY: bu kişi seni zaten beğenmişti, yani sonuç KESİN eşleşme —
        // kutlama MatchModal'ın (bkz. flameSweep'teki kural), kart burada pas
        // yönünün aynası olarak sağa uçuyor.
        // Uçuşun altındaki temizlik HER İKİ listeyi de kapsıyor: eşleşme
        // sinyali kart uçarken geldiğinde `pruneBoth` bu kartı atlıyor (bkz.
        // aşağıdaki prune guard'ı), yani kaçırdıkların tarafını da buranın
        // düşürmesi gerek.
        runCardExit(likerUserId, "right", () => {
          handleLikerSwiped(likerUserId, direction);
          dropMissed(likerUserId);
        });
        return;
      }
      runCardExit(likerUserId, "left", () =>
        handleLikerSwiped(likerUserId, direction),
      );
    },
    // handleLikerSwiped her render'da yeniden yaratılıyor ama yalnızca ref +
    // dispatch okuyor; bağımlılığa eklemek callback'i her render'da tazelerdi.
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [dispatch, dropMissed, isPremium, runCardExit, swipeMutate],
  );

  /**
   * Kişiyi HER İKİ listeden birden düşürür — engelleme ve "engelle" kutusu
   * işaretli şikayet buradan geçer.
   *
   * ⚠️ Tek çağıran artık profil modalı (bkz. handleModalSwipe). Karttaki
   * bayrak/engelle butonları çekme jestiyle birlikte kalktı, moderasyon
   * tamamen modalın kendi satırında.
   *
   * `handleLikerSwiped` tek başına YETMİYOR: o yalnız `likes` dizisine
   * dokunuyor, kaçırdıkların listesi ayrı bir dizi. Modal doğrudan ona
   * bağlansaydı Kaçırdıklarım sekmesinde engellenen kart listede kalırdı.
   */
  const dropFromLists = useCallback(
    (userId) => {
      // Yönsüz çıkış: engelleme/şikayet bir "geç" ya da "beğen" değil, kart
      // yana uçmak yerine yerinde söner.
      runCardExit(userId, "out", () => {
        handleLikerSwiped(userId, "block");
        // Kaçırdıkların listesi ayrı bir dizi — `handleLikerSwiped` ona dokunmaz.
        dropMissed(userId);
      });
    },
    // handleLikerSwiped ref + dispatch okuyor (bkz. handleQuickSwipe notu).
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [runCardExit, dropMissed],
  );

  /**
   * Modalın swipe/engelleme sonucu. "block" yönü AYRI bir yol izliyor:
   * engelleme her iki listeden de düşmeli, düz swipe ise yalnız beğeni
   * listesinden. Modal iki durumu da aynı `onSwipe` ile bildiriyor (engelleme
   * de "block" yönüyle geliyor), ayrımı burada yapıyoruz.
   */
  const handleModalSwipe = useCallback(
    (userId, direction) => {
      if (direction === "block") {
        dropFromLists(userId);
        return;
      }
      handleLikerSwiped(userId, direction);
    },
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [dropFromLists],
  );

  // Karta giden prop'ların SABİT sürümleri. Hepsi kartı parametre alıyor;
  // eskiden bunlar `renderItem` içinde her çizimde yeniden üretilen kapanışlardı
  // (`() => handleQuickSwipe(item, "left")` gibi) ve kartın memo'sunu her
  // seferinde geçersiz kılıyorlardı.
  const handleLikeCard = useCallback(
    (item) => handleQuickSwipe(item, "right"),
    [handleQuickSwipe],
  );

  // Bu ekran dışında handle edilen liker'lar (match, ya da Discover destesinde
  // pass'lenmiş bir liker) listeden düşsün. Ekran lazy mount olup açık kaldığı
  // için kendi kendine tazelenmiyor; bu olmadan liste bayat kalıyordu.
  // Rozet sayacı iki olayda da kaynağında düşürülüyor (AppNavigator /
  // DiscoverScreen) — burada TEKRAR dispatch etmiyoruz, çift düşerdi.
  // Fetch'ten gelen item'lar `userId`, realtime eklenenler `likerUserId`
  // alanı taşıyor; iki ihtimali de kontrol et.
  useEffect(() => {
    const prune = (userId) => {
      if (!userId) return;
      const prev = likesRef.current;
      const next = prev.filter(
        (it) => it.userId !== userId && it.likerUserId !== userId,
      );
      if (next.length === prev.length) return;
      likesRef.current = next;
      setLikes(next);
    };
    // Kaçırdıkların listesi de aynı olaylardan etkileniyor: bir kişiyle
    // eşleştiysen (kurtarma ya da başka yoldan) artık "kaçırılmış" değil.
    // Düşürme `dropMissed` üzerinden — sekme pill'indeki adet de onunla iniyor.
    const pruneBoth = (userId) => {
      // Kart ZATEN bir çıkışın içindeyse dokunma. Kritik olan onay/kurtarma:
      // ikisi de eşleşme yaratıyor, yani `MatchNotification` kart daha uçarken
      // gelebiliyor ve buradan düşürülseydi kart uçuşun ortasında bir anda yok
      // olurdu. Çıkışın kendi `remove`'u aynı temizliği uçuş bitince zaten
      // yapıyor (bkz. handleQuickSwipe / handleRecover: her ikisi de hem beğeni
      // listesini hem kaçırdıkları düşürüyor).
      if (userId && exitTimersRef.current.has(userId)) return;
      prune(userId);
      dropMissed(userId);
    };
    const unsubMatch = uiBus.on("match", (m) => pruneBoth(m?.matchedUserId));
    const unsubHandled = uiBus.on("likerHandled", (p) => pruneBoth(p?.userId));
    return () => {
      unsubMatch();
      unsubHandled();
    };
    // `dropMissed` referansı sabit (useCallback []) — abonelik yeniden kurulmaz.
  }, [dropMissed]);

  // Realtime: socket'ten yeni IncomingLike geldiğinde listeyi reload etmeden prepend et.
  // AppNavigator IncomingLike SignalR event'ini yakalayıp uiBus.emit('incomingLike', payload)
  // çağırır; payload backend IncomingLikeDto = { likerUserId, likerDisplayName,
  // likerPhotoUrl, isSuperLike, isNote, notePreview, likedAt }. Mutual like'ta
  // backend bu event'i göndermez (MatchNotification akışı çalışır) — burada
  // dedup gerekmiyor.
  //
  // ⚠️ Not için AYRI bir event YOK (sözleşme §6): aynı olaya `isNote` +
  // `notePreview` eklendi. Önizleme ~60 karakter, yani KIRPIK — canlı kart
  // `noteId` de taşımıyor. İkisi de reconcile'da (scheduleLikesReconcile) tam
  // kayıtla değişiyor; o yüzden bu kartta şikayet not id'siz gider.
  useEffect(() => {
    const unsub = uiBus.on("incomingLike", (payload) => {
      if (!payload?.likerUserId) return;
      setLikes((prev) => {
        // Aynı liker zaten listedeyse (ör. reconnect race) ekleme.
        const isSuper = !!payload.isSuperLike;
        const dupId = `${isSuper ? "sl" : "l"}_live_${payload.likerUserId}`;
        const existingByUser = prev.some(
          (it) => it.id === dupId || it.likerUserId === payload.likerUserId,
        );
        if (existingByUser) return prev;

        const notePreview =
          typeof payload.notePreview === "string"
            ? payload.notePreview.trim()
            : "";
        const card = {
          // profileId yok (DTO sadece userId döner) — live kart için sentetik id.
          id: dupId,
          likerUserId: payload.likerUserId,
          name: payload.likerDisplayName || "",
          age: null, // backend payload'da age yok; kart "İsim, " olarak görünür — kabul
          mainPhoto: payload.likerPhotoUrl || "",
          likedAt: payload.likedAt,
          isSuperLike: isSuper,
          isNote: !!payload.isNote,
          // Önizleme boşsa `note` hiç kurulmuyor: kart `!!item.note`a bakıp
          // yorum bloğunu çiziyor, boş bir yorum kutusu çizmenin anlamı yok.
          // Blur yine açık kalır — onu `isNote` taşıyor.
          note: notePreview ? { comment: notePreview } : null,
        };

        // Yeni Fire → listenin en başına (en yeni en üstte).
        if (isSuper) return [card, ...prev];

        // Yeni normal Like → Fire bloğunun hemen altına, normal like'ların başına.
        const firstNonSuper = prev.findIndex((it) => !it.isSuperLike);
        if (firstNonSuper === -1) return [...prev, card];
        return [
          ...prev.slice(0, firstNonSuper),
          card,
          ...prev.slice(firstNonSuper),
        ];
      });
    });
    return unsub;
  }, []);

  // Sekmeler pill satırının İÇİNDE tanımlıydı; geçiş yönü (yeni sekme eskisinin
  // sağında mı solunda mı) bu sıraya bakmak zorunda, dolayısıyla sıra tek yerde
  // durmalı — iki ayrı liste tutulsaydı biri değişip diğeri unutulduğunda
  // animasyon sessizce ters yöne kayardı.
  //
  // Adetler: dolu sekmenin etiketinin yanında bir sayı (bkz. FilterPills
  // `count`). Kaçırdıkların sayısı LİSTEDEN gelmiyor — o liste ancak sekmeye
  // basılınca çekiliyor ve sayı sekmeye girmenin sebebi. Ekran odağa gelince
  // hafif bir sayı turu atılıyor (bkz. loadMissedCount) ve sonuç `missedTotal`e
  // yazılıyor; `missed.length` kullanılsaydı hem sekmeye girmeden 0 görünürdü
  // hem de girildiğinde ilk sayfayla (20) sınırlı kalırdı. Sayı hâlâ
  // bilinmiyorsa `null` gidiyor — pill onu çizmiyor, "0" yazmıyor.
  const tabs = useMemo(
    () => [
      { key: "all", label: t("likes.tabAll"), count: likeCounts.all },
      { key: "like", label: t("likes.tabLike"), count: likeCounts.like },
      {
        key: "fire",
        label: t("likes.tabFire"),
        count: likeCounts.fire,
      },
      { key: "note", label: t("likes.tabNote"), count: likeCounts.note },
      { key: "missed", label: t("likes.tabMissed"), count: missedTotal },
      // Lit Akışı yanıtları — Akış sekmesindeki Yanıtlar sayfasıyla AYNI query
      // key'i paylaşıyor (feedKeys.repliesReceived), yani iki cache değil bir
      // tane var. Sekmeye girilmediyse sayı BİLİNMİYOR → `null`, pill "0"
      // yazmıyor (missedTotal ile aynı kural).
      // AKIŞ YANITLARI SEKMESİ KALDIRILDI — yanıt kanalı üründen çıktı.
      // `feedEnabledForSession()` kapısı da gereksizleşti: ekranda akışa ait
      // hiçbir şey kalmadı.
    ],
    [t, likeCounts, missedTotal],
  );

  // Pill'e basınca pager'a sayfa değiştirmesini söylüyoruz; `activeTab` state'i
  // pager'ın kendi olaylarından dönüyor. Doğrudan setState edilseydi sekme
  // state'inin iki kaynağı olurdu (pill ve parmak jesti) ve ikisi birbirini
  // ezerdi — özellikle jest yarıda bırakılıp geri dönüldüğünde.
  const handleTabChange = useCallback(
    (key: string) => {
      const index = tabs.findIndex((tb) => tb.key === key);
      if (index < 0) return;
      // Yükleme pill'e BASILDIĞI anda başlıyor, `activeTab` değişince değil:
      // state pager oturunca dönüyor (bkz. usePagerTabCommit), ona bağlı
      // kalsaydı sayfa boş kayıp gelir, yerine oturduktan sonra iskelet
      // belirirdi. Guard'lar (in-flight + tazelik) mükerrer isteği zaten
      // yutuyor — `activeTab` effect'i birazdan aynı çağrıyı yapacak.
      if (key === "missed") loadMissed();
      pagerRef.current?.setPage(index);
    },
    [tabs, loadMissed],
  );

  // Sekme state'i pager DURUNCA yazılıyor. Kaymanın ortasında yazıldığında bu
  // ekranın render'ı (beş sayfa + liste başlıkları) geçişin tam ortasında bir
  // Fabric commit'i doğuruyor ve ana thread'de mount işi yapıldığı için sayfayla
  // birlikte kayan büyük başlık/alt yazı bir kare takılıyordu. Ayrıntı:
  // usePagerTabCommit.
  const commitPage = useCallback(
    (index: number) => {
      const key = tabs[index]?.key;
      if (key) setActiveTab(key);
    },
    [tabs],
  );
  const pagerCommitHandlers = usePagerTabCommit(commitPage);

  // Listenin içerik payı — beş sayfa da AYNI iki nesneden birini kullanıyor.
  // Render'da kurulsaydı her çizimde yeni bir stil kimliği doğar ve beş
  // listenin içerik kabı boşuna yeniden commit edilirdi; sekme kayarken düşen
  // bir commit'te bu iş doğrudan geçişin üstüne biniyor.
  //
  // Ayrılan pay HEADER SATIRININ kendisi: sekme şeridi orada duruyor (sabit,
  // kaymıyor), dolayısıyla liste onun altından başlamalı. Sabit elle
  // kopyalanmıyor — ölçü değiştiği gün büyük başlık şeridin altına girerdi.
  // Sondaki 14 yalnız nefes payı.
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
  // Boş sayfada dip payı yok: içerik zaten ekranı doldurmuyor, 120'lik pay boş
  // durumu yukarı itiyordu.
  const emptyListContentStyle = useMemo(
    () => ({ ...listContentStyle, paddingBottom: 0 }),
    [listContentStyle],
  );

  // Header her sayfanın KENDİ liste başlığında: büyük başlık sayfayla birlikte
  // native olarak kayıyor (pager'ın dışına alınsaydı hiç kaymazdı). Sekme
  // şeridi artık ekranın header'ında ve sabit — büyük başlık onun altından
  // başlayıp kaydırınca üstünden geçiyor.
  const renderListHeader = (tabKey: string) => {
    const headerAction = headerActionFor(tabKey);
    return (
      // Bölüm başlığı — HER sekmede var ve sekme şeridinin ALTINDA: sayfanın
      // "büyük başlığı" o, şerit onun üstündeki filtre satırı.
      // Kaçırdıkların sekmesinde başlık da sekmenin adı; kurtarma bakiyesi
      // (sayıyı ve tavanı /Stats veriyor, tier tavanları backend config'inden
      // geldiği için burada YAZILMIYOR) altındaki açıklama satırının sonunda.
      // Sağdaki "Nasıl alırım?" pill'i üç sekmede (bkz. headerActionFor).
      <LikesListHeader
        title={sectionTitleFor(tabKey)}
        description={tabDescriptionFor(tabKey)}
        actionLabel={headerAction?.label ?? null}
        onActionPress={headerAction?.onPress ?? null}
      />
    );
  };

  // Liste HER ZAMAN mount — yükleme/boş/dolu üç durumu da aynı FlatList'in
  // içinde geçiyor. Önce ayrı bir `loading ?` dalı vardı: skeleton kendi
  // container'ında, boş durum listenin içinde çiziliyordu; aradaki geçiş
  // ağaç değişimi olduğu için sekmeler bile yeniden mount oluyordu.
  const renderListEmpty = (tabKey: string) => {
    if (tabKey === "missed") {
      // Kaçırdıkların kendi yükleme durumunu taşıyor (ayrı uç, ayrı istek).
      // Skeleton gecikme/asgari-süre makinesine bağlanmıyor: bu liste yalnız
      // sekmeye basınca çekiliyor, yani kullanıcı zaten bir bekleme bekliyor.
      if (missedSkeletonVisible) return <LikesSkeletonList />;
      // İlk tur BİTMEDEN boş durum çizilmiyor: "Kaçırdığın kimse yok" henüz
      // bilinmeyen bir şeyi söylerdi (bkz. missedLoaded). Tek istisna adedin
      // SIFIR bilinmesi (missedKnownEmpty) — orada cevap zaten elimizde ve
      // sayfa iskelete hiç uğramadan boş durumla açılıyor.
      if (!missedLoaded && !missedKnownEmpty) return null;
      return (
        <View className="flex-1 items-center justify-center pb-[50%]">
          <EmptyState
            // Bu sekmenin konusu Fire DEĞİL kurtarma: eksik olan şey
            // bir beğeni değil, geri alınacak bir kaçırma. Glif kurtarma
            // butonuyla (RecoverGlassButton) ve kolondaki kurtar aksiyonuyla
            // aynı — boş sayfa hangi aksiyonun burayı dolduracağını söylesin.
            //
            // `sf` GEÇİLMİYOR, iOS'ta da lucide çiziliyor: SF sembolü kendi
            // en-boy oranıyla geliyor (kutusu 100×100 değil) ve gövdesi
            // "regular" ağırlıkta kalın — diğer sekmelerin boş durumunda ise
            // ikon 24'lük viewBox'lı konturlu bir SVG. Yan yana konduğunda
            // hem başlık farklı yükseklikten başlıyor hem de glif daha ağır
            // okunuyordu. Lucide de 24 viewBox'ta olduğu için kutu tam
            // 100×100 ve `iconStrokeWidth={1}` ekranda diğer gliflerle AYNI
            // kalınlığa (100/24 ≈ 4.2px) düşüyor.
            Icon={RotateCcw}
            iconStrokeWidth={1}
            topOffset={0}
            text={t("likes.emptyMissed")}
            subtitle={missedEmptySubtitle}
            buttonLabel={t("likes.startSwipingButton")}
            // Etiket koyuda da SİYAH: `text` koyu modda beyaza dönüp litPlus
            // dolgunun üstünde duruyordu, burada sabit mürekkep isteniyor.
            buttonLabelColor={colors.onMediaInverse}
            onButtonPress={() => navigation.navigate("Discover")}
          />
        </View>
      );
    }
    if (showSkeleton) return <LikesSkeletonList />;
    // Skeleton gecikmesi penceresi: boş durumu ERKEN göstermek de bir flash —
    // istek daha sürüyorken "hiç beğenin yok" yazıp sonra geri almak yerine
    // sadece sekmeler dursun.
    if (loading) return null;
    return (
      <View className="flex-1 items-center justify-center pb-[50%]">
        <EmptyState
          // Not sekmesi kendi ürününün glif'ini alıyor: o listede eksik olan
          // şey beğeni değil NOT — boş sayfa hangi ürünü beklediğini söylesin.
          Icon={tabKey === "note" ? EmptyNoteIcon : EmptyHeartIcon}
          iconStrokeWidth={1}
          topOffset={0}
          text={
            tabKey === "fire"
              ? t("likes.emptyFire")
              : tabKey === "note"
                ? t("likes.emptyNote")
                : tabKey === "like"
                  ? t("likes.emptyLike")
                  : t("likes.emptyAll")
          }
          subtitle={
            tabKey === "fire"
              ? t("likes.emptyFireSubtitle")
              : tabKey === "note"
                ? t("likes.emptyNoteSubtitle")
                : tabKey === "like"
                  ? t("likes.emptyLikeSubtitle")
                  : t("likes.emptyAllSubtitle")
          }
          // Üç filtrenin boş durumu da aynı yere çıkar: beğeni beklemek yerine
          // kaydırmaya dön. Sekmeye göre değişen etiketler (Fire gönder
          // / profilimi geliştir) tek bir "kaydırmaya başla" aksiyonuna indi.
          buttonLabel={t("likes.startSwipingButton")}
          buttonLabelColor={colors.onMediaInverse}
          onButtonPress={() => navigation.navigate("Discover")}
        />
      </View>
    );
  };

  /**
   * Bir sekmenin tam sayfası: kendi header'ı (büyük başlık + pill satırı +
   * açıklama kartı) ve kendi listesi. Beş sayfanın hepsi AYNI ANDA canlı —
   * pager'ın örtüşen geçişi ancak böyle mümkün: eski sayfa sola çıkarken yeni
   * sayfa sağdan giriyor, ikisi de ekranda.
   *
   * ⚠️ `onScroll` YALNIZ aktif sayfada bağlı. ScreenHeader'ın küçük başlığı tek
   * bir `scrollY`ye bakıyor; beş sayfa birden yazsaydı arka plandaki sayfaların
   * (0'da duran) offset'i öndekini ezer, başlık rastgele belirip kaybolurdu.
   */
  const renderPage = (tabKey: string) => {
    const data = listDataFor(tabKey);
    const isMissed = tabKey === "missed";
    const empty = renderListEmpty(tabKey);
    // Bu SEKMEDE iskelet mi çiziliyor — dip payı buna bakıyor. İki sekme
    // ailesinin yükleme bayrağı ayrı (kaçırdıkların ayrı uçtan geliyor);
    // eskiden ikisi tek ifadede AND'leniyordu, yani beğeni listesi yüklenirken
    // kaçırdıkların boş sayfası da 120 pay alıyordu.
    const showsSkeleton = isMissed ? missedSkeletonVisible : showSkeleton;
    return (
      <Animated.FlatList
        data={data}
        onScroll={tabKey === activeTab ? scrollHandler : undefined}
        scrollEventThrottle={16}
        // Bir kart veriden düştüğünde altındaki hücreler boşluğa YAVAŞÇA kayar
        // (yerlerine zıplamak yerine). Kartın kendi çıkışı ayrı iş: o
        // transform/opacity ile LikeCard içinde oynuyor.
        //
        // Sekme geçişinde artık KAPATILMASI GEREKMİYOR: her sekmenin kendi
        // listesi var, bir sekmeden diğerine geçerken hiçbir satır yer
        // değiştirmiyor — dikey sürüklenme sorunu (eski skipItemLayoutRef)
        // tek listeyi paylaşmaktan doğuyordu.
        itemLayoutAnimation={CARD_LAYOUT_TRANSITION}
        renderItem={({ item }) => (
          <MemoLikeCard
            item={item}
            isPremium={isPremium}
            onPress={openLikerProfile}
            onRecover={isMissed ? handleRecover : undefined}
            onLike={handleLikeCard}
            likeLabel={t("likes.likeButton")}
            recoverLabel={t("likes.recoverButton")}
            fireLabel={t("likes.firePill")}
            resolveIntentLabel={resolveIntentLabel}
            exitDirection={exitingIds[item.userId || item.likerUserId] ?? null}
          />
          )
        }
        keyExtractor={(item) => item.id}
        ListHeaderComponent={renderListHeader(tabKey)}
        ListEmptyComponent={empty}
        // Skeleton da 3 kart yüksekliğinde — boş durum gibi 0 padding verirsek
        // son satır tab bar'ın altında kalıyor (bkz. iki stil).
        contentContainerStyle={
          data.length === 0 && !showsSkeleton
            ? emptyListContentStyle
            : listContentStyle
        }
        showsVerticalScrollIndicator={false}
      />
    );
  };

  return (
    <View className="flex-1" style={{ backgroundColor: colors.bg }}>
      {/* Sekmeler bir pager — geçişi native yapıyor: eski sayfa çıkarken yeni
          sayfa giriyor, ikisi aynı anda ekranda. Elle yazılmış çıkış/giriş
          animasyonu bunu veremiyordu (tek liste vardı, iki içerik aynı anda
          çizilemiyordu) ve arada eski içeriğin ekranda kaldığı bir pencere
          bırakıyordu.
          ⚠️ Kartlardaki sağdan-sola çekme jesti bu kaydırmayla aynı parmak
          hareketini istiyordu; jest kaldırıldı (bkz. LikeCard). */}
      <AnimatedPagerView
        ref={pagerRef}
        style={{ flex: 1 }}
        initialPage={0}
        onPageScroll={pagerScrollHandler}
        // Sekme state'inin TEK kaynağı bu ikili: pill'e basmak da parmakla
        // çevirmek de önce pager'ı hareket ettiriyor, state buradan dönüyor.
        // Pill'den doğrudan setState edilseydi parmakla çevirmede iki kaynak
        // olurdu. Seçim ref'te bekliyor, React state'i kayma bitince (idle)
        // değişiyor — bkz. usePagerTabCommit.
        onPageSelected={pagerCommitHandlers.onPageSelected}
        onPageScrollStateChanged={pagerCommitHandlers.onPageScrollStateChanged}
      >
        {tabs.map((tab) => (
          <View key={tab.key} style={{ flex: 1 }} collapsable={false}>
            {renderPage(tab.key)}
          </View>
        ))}
      </AnimatedPagerView>

      {/* Logo YOK ve BAŞLIK DA YOK: header satırının yerini sekme şeridi aldı
          (Profil ekranındaki kurulumun aynısı). Scroll'la beliren başlık tam
          onun üstüne binerdi; sayfanın adı zaten listenin içindeki büyük
          başlık.
          ⚠️ Logo gidince swipe kotası göstergesi de gitti (WaveFillLogo'nun
          dolgusu `fillRatio`dan geliyordu), o yüzden prop da kaldırıldı —
          header'a gelen tek şey scroll konumu (bulanık zemin onu okuyor). */}
      <ScreenHeader
        scrollY={scrollY}
        showLogo={false}
        centerSlot={
          // Şerit ORTALANMIYOR (Profil'de iki sekme var, burada beş): sığmaz.
          // Kaydırılabilir şerit tam genişlikte duruyor ve büyük başlıkla aynı
          // sol hattan (HEADER_LEFT_INSET) başlıyor.
          //
          // `width: "100%"` ŞART: slot `alignItems: "center"` ile hizalıyor,
          // kap içeriği kadar daralır ve şerit ortalanmış bir blok olurdu.
          <View style={{ width: "100%" }}>
            <PagerTabBar
              tabs={tabs}
              activeTab={activeTab}
              offset={pagerOffset}
              onPress={(key) => handleTabChange(key)}
              inset={HEADER_LEFT_INSET}
            />
          </View>
        }
      />

      {/* Alttaki sticky "Seni beğenenleri gör" butonu KALDIRILDI: premium
          upsell'in tek yeri artık başlığın yanındaki pill (bkz. headerAction).
          Buton listenin üstüne biniyor, son kartı kapatıyor ve kilidin ne
          olduğunu ancak sayfanın dibinde söylüyordu. */}

      {/* Satın alma sonrası liste tazelemesi onSuccess'te değil, isPremium
          false→true transition effect'inde (yukarıda) yapılıyor. */}

      {/* Kurtarma paketi sheet'i KALDIRILDI (2026-08-31): kurtarma consumable
          olmaktan çıkıp premium ayrıcalığı oldu, satılacak bir paket kalmadı.
          Free'nin paywall'ı artık doğrudan abonelik (bkz. handleRecover). */}

      {/* Fire / not paketleri — başlığın yanındaki "Nasıl alırım?"
          pill'inden açılıyor. DiscoverScreen'dekiyle aynı sheet'ler ve aynı
          kapanış davranışı: satın alma sonrası kapan + /Stats'ı tazele (bakiye
          bu ekranda görünmese de kota sayıları oradan besleniyor). */}
      <FirePurchaseModal
        visible={firePurchaseVisible}
        onClose={() => setFirePurchaseVisible(false)}
        onPurchased={() => {
          setFirePurchaseVisible(false);
          statsQuery.refetch?.();
        }}
      />

      <NotePurchaseModal
        visible={notePurchaseVisible}
        onClose={() => setNotePurchaseVisible(false)}
        onPurchased={() => {
          setNotePurchaseVisible(false);
          statsQuery.refetch?.();
        }}
      />

      {/* YANITLAYAN PROFİLİ MODALI KALDIRILDI: akış yanıtları sekmesiyle
          birlikte düştü. Aşağıdaki ikiz (beğeni kartlarının açtığı) duruyor —
          eskiden ikisini karıştırmamak gerekiyordu, artık tek tane var. */}

      <LikerSwipeModal
        visible={previewVisible}
        profile={previewProfile}
        onClose={handleClosePreview}
        // Doğrudan `handleLikerSwiped` DEĞİL: engelleme yönü kaçırdıkların
        // listesinden de düşmeli (bkz. handleModalSwipe).
        onSwipe={handleModalSwipe}
        swipeDisabled={previewSwipeDisabled}
      />
    </View>
  );
}
