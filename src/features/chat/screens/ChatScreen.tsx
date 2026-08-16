import { useEffect, useState, useCallback, useRef, useMemo } from "react";
import { useTranslation } from "react-i18next";
import {
  View,
  Text,
  TouchableOpacity,
  Alert,
  Modal,
  TextInput,
  Pressable,
  Platform,
  StyleSheet,
  Keyboard,
} from "react-native";
import { Image } from "expo-image";
import type { MessageDto } from "@/shared/types";
import { BlurView } from "expo-blur";
import MaskedView from "@react-native-masked-view/masked-view";
import { LinearGradient } from "expo-linear-gradient";
import { easeGradient } from "react-native-easing-gradient";
import {
  Host,
  Button as SwiftUIButton,
  Text as SwiftUIText,
} from "@expo/ui/swift-ui";
import {
  buttonStyle,
  tint,
  labelStyle,
  font,
  glassEffect,
  foregroundStyle,
  padding,
  frame,
  controlSize,
} from "@expo/ui/swift-ui/modifiers";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { useSharedValue } from "react-native-reanimated";
import {
  KeyboardStickyView,
  KeyboardGestureArea,
  KeyboardEvents,
} from "react-native-keyboard-controller";
import { useKeyboardChatComposerInset } from "@legendapp/list/keyboard";
import { NativeStackScreenProps } from "@react-navigation/native-stack";
import { useFocusEffect } from "@react-navigation/native";
import type { RootStackParamList } from "@/shared/types/navigation";
import { useAppDispatch, useAppSelector } from "@/shared/hooks/redux";
import { ChevronLeft, MoreVertical, X } from "lucide-react-native";
import SFIcon from "@/shared/components/SFIcon";
import * as Haptics from "expo-haptics";
import {
  fetchHistory,
  fetchConversations,
  setActiveConversation,
  appendOptimisticMessage,
  failOptimisticMessage,
  removeOptimisticMessage,
  clearUnreadForConversation,
  conversationDeactivated,
  fetchChatQuota,
  decrementQuotaLocally,
  reactionsChanged,
  messageDeleted,
  messageEdited,
  messageSent,
} from "@/features/chat/chatSlice";
import { refreshEntitlementsForPaywall } from "@/features/profile/subscriptionSlice";
import chatService from "@/features/chat/chatService";
import { applyReactionPick } from "@/features/chat/reactionPick";
import realtimeService from "@/features/chat/realtimeService";
import MessageBubble from "@/features/chat/components/MessageBubble";
import ReplySwipeRow from "@/features/chat/components/ReplySwipeRow";
import MessageComposer from "@/features/chat/components/MessageComposer";
import ChatMessageList from "@/features/chat/components/ChatMessageList";
import { useRevealGesture } from "@/features/chat/components/useRevealGesture";
import { REVEAL_MAX } from "@/features/chat/components/RevealContext";
import { highlightMessage } from "@/features/chat/components/messageHighlight";
import { ChatTypingRow } from "@/features/chat/components/ChatBottomSpacer";
import MessageSkeleton from "@/features/chat/components/MessageSkeleton";
import MessageActionSheet from "@/features/chat/components/MessageActionSheet";
import ConversationOptionsSheet from "@/features/chat/components/ConversationOptionsSheet";
import ReportModal from "@/shared/components/ReportModal";
import DateSeparator, {
  withDateSeparators,
} from "@/features/chat/components/DateSeparator";
import moderationService from "@/shared/services/moderationService";
import { utcTime } from "@/shared/utils/dateUtc";
import PurchaseModal from "@/features/discover/components/PurchaseModal";
import PreviewModal from "@/features/profile/components/PreviewModal";
import swipeService from "@/features/discover/swipeService";
import { showInfoToast } from "@/shared/services/toaster";
import uiBus from "@/shared/services/uiBus";
import { analytics } from "@/shared/services/analytics";
import { colors } from "../../../shared/theme/colors";
import { glassFallback } from "../../../shared/theme/glass";
import { devLog } from '@/shared/utils/devLog';

const ContentType = { Text: 0, System: 99 };
const INPUT_BAR_OPAQUE = 66; // composer opak gövde tahmini (inset başlangıç değeri)
// Hub `SendMessage` hata durumunda invoke'u REDDETMİYOR — ayrı bir `Error`
// event'i yayınlıyor (kontrat §17). O event kaçarsa balon sonsuza dek
// "gönderiliyor"da asılı kalıyordu; bu pencere dolunca başarısıza çeviriyoruz.
const SEND_ACK_TIMEOUT_MS = 12_000;
// İsim pill'inin sabit yüksekliği: SwiftUI ölçümünü beklemeden header'ın dikey
// geometrisi İLK frame'de kesinleşsin (13pt metin + 4pt dikey padding ≈ 24, +2 pay).
const PILL_H = 26;
// Header satırının TAM yüksekliği: paddingVertical 8×2 + avatar 65 + boşluk 6 + pill.
// Liste paddingTop'u ve header row height'ı AYNI sabitten beslenir — ikisi ayrışırsa
// balonlar header'ın altına girer ya da fazla boşluk kalır.
const HEADER_CONTENT = 8 + 65 + 6 + PILL_H + 8;

// ── TEŞHİS ANAHTARI ─────────────────────────────────────────────────────────
// true yap → balonlar reanimated'siz/ref'siz/reveal'siz DÜZ View+Text çizilir.
// Amaç: "kaybolan balon / render storm / crash" LİSTEDE mi BALONDA mı, tek testte
// kesin ayırmak:
//   • true iken belirtiler KAYBOLURSA → sorun MessageBubble'ın stateful katmanları
//     (per-item useAnimatedStyle / reveal kolonu / ref'ler) → balonu hafifletiriz.
//   • true iken belirtiler SÜRERSE → sorun liste/virtualization/config → LegendList
//     tarafına iner ya da inverted FlatList'e döneriz.
// Test bitince false'a geri al.
const CHAT_DIAG_MINIMAL_BUBBLES = false;

function DiagMinimalBubble({ message, isOwn }: any) {
  if (message.isSystemMessage) {
    return (
      <View style={{ alignItems: "center", marginVertical: 8 }}>
        <Text style={{ color: "#8B93A2", fontSize: 13 }}>{message.content}</Text>
      </View>
    );
  }
  return (
    <View
      style={{
        flexDirection: "row",
        justifyContent: isOwn ? "flex-end" : "flex-start",
        paddingHorizontal: 12,
        marginVertical: 1,
      }}
    >
      <View
        style={{
          maxWidth: "78%",
          backgroundColor: isOwn ? colors.messageOwn : colors.surface2,
          borderRadius: 24,
          paddingHorizontal: 14,
          paddingVertical: 12,
        }}
      >
        <Text style={{ color: "#fff", fontSize: 17 }}>{message.content}</Text>
      </View>
    </View>
  );
}

// Stabil referanslar (modül seviyesi → her render'da yeni obje üretilmez).
const EMPTY_MESSAGES: MessageDto[] = [];
const keyExtractor = (m: any) => m.clientMessageId || m.id;

function latestPartnerSentAt(messages: MessageDto[], myUserId?: string): number {
  if (!myUserId) return 0;
  let latest = 0;
  for (const m of messages) {
    if (m.senderId && m.senderId !== myUserId && !m.isSystemMessage) {
      const t = utcTime(m.sentAt);
      if (t > latest) latest = t;
    }
  }
  return latest;
}

function buildReplyPreview(messages: MessageDto[], replyToId: string) {
  const original = messages.find((m) => m.id === replyToId);
  if (!original) return null;
  return {
    id: original.id,
    senderId: original.senderId,
    senderDisplayName: (original as any).senderDisplayName,
    contentPreview: (original.content || "").slice(0, 120),
    contentType: original.contentType ?? 0,
    isDeleted: !!original.deletedAt,
  };
}

// Composer'ın yanıt şeridine (replyTo state) yazılan taslak. Hem uzun-bas
// menüsündeki "Yanıtla" hem sola-çekme jesti AYNI kaynaktan beslenir.
function buildReplyDraft(message: any) {
  return {
    id: message.id,
    senderId: message.senderId,
    senderDisplayName: message.senderDisplayName,
    contentPreview: (message.content || "").slice(0, 120),
    contentType: message.contentType,
    isDeleted: !!message.deletedAt,
  };
}

function ChatScreen({
  route,
  navigation,
}: NativeStackScreenProps<RootStackParamList, "Chat">) {
  const { t } = useTranslation();
  const i18nResolver = useCallback(
    (key: string, fallback: string) => {
      if (key === "system.match_created") return t("chat.system.matchCreated");
      if (key === "system.conversation_deleted")
        return t("chat.system.conversationDeleted");
      return fallback;
    },
    [t],
  );
  const {
    conversationId,
    partner: routePartner,
    isActive: routeIsActive,
  } = route.params;
  const dispatch = useAppDispatch();
  const insets = useSafeAreaInsets();

  // Partner bilgisi SADECE route param'ından okunursa, param'ın eksik geldiği
  // girişlerde (push tap → AppNavigator.routeFromNotification) header kalıcı
  // olarak "Kullanıcı" + boş avatar kalıyordu: cold start'ta boot gate ~120ms'de
  // açılıp navigate ediliyor, /conversations yanıtı ise saniyeler sonra düşüyor;
  // param bir kez yazıldığı için liste gelince de güncellenmiyordu. Store'dan
  // türetip route param'ı yalnızca fallback olarak kullanıyoruz — liste ne zaman
  // gelirse header o an doluyor.
  const convPartnerUserId = useAppSelector((s: any) =>
    s.chat.conversations.find(
      (c: any) => c.conversationId === conversationId,
    )?.partnerUserId,
  );
  const convPartnerName = useAppSelector((s: any) =>
    s.chat.conversations.find(
      (c: any) => c.conversationId === conversationId,
    )?.partnerDisplayName,
  );
  const convPartnerPhoto = useAppSelector((s: any) =>
    s.chat.conversations.find(
      (c: any) => c.conversationId === conversationId,
    )?.partnerProfileImageUrl,
  );

  // Alan bazında birleştiriyoruz: NotificationsScreen gibi bazı çağrılar partner
  // nesnesini kısmi gönderiyor (foto var, isim yok) — nesneyi komple seçmek o
  // boşlukları taşırdı.
  const partner = useMemo(() => {
    const userId = convPartnerUserId ?? routePartner?.userId;
    const displayName = convPartnerName ?? routePartner?.displayName;
    const profileImageUrl = convPartnerPhoto ?? routePartner?.profileImageUrl;
    if (!userId && !displayName && !profileImageUrl) return undefined;
    return { userId, displayName, profileImageUrl };
  }, [
    convPartnerUserId,
    convPartnerName,
    convPartnerPhoto,
    routePartner?.userId,
    routePartner?.displayName,
    routePartner?.profileImageUrl,
  ]);

  // Konuşma listede yoksa (push ile doğrudan bu ekrana düşüldü) bir kez çek.
  // Thunk'ın kendi in-flight + 15sn staleness guard'ı var; boot'taki fetch
  // uçuşuyorsa bu çağrı ikinci istek atmadan düşüyor.
  const convFetchRequestedRef = useRef(false);
  useEffect(() => {
    if (convPartnerUserId || convFetchRequestedRef.current) return;
    convFetchRequestedRef.current = true;
    dispatch(fetchConversations({}));
  }, [convPartnerUserId, dispatch]);

  // Odaklanışta sohbet listesini doğrula: `isActive` bu listeden türüyor ve
  // karşı taraf unmatch ettiğinde backend event yayınlamıyor — tazelemezsek
  // kapanmış sohbet açık görünür, composer yazılabilir kalır. Thunk'ın 15sn
  // staleness gate'i, listeden gelip giden girişlerde ek istek attırmaz.
  useFocusEffect(
    useCallback(() => {
      dispatch(fetchConversations({}));
    }, [dispatch]),
  );

  const myUserId = useAppSelector(
    (s: any) => s.auth.user?.userId || s.auth.user?.id,
  );
  const messages = useAppSelector(
    (s: any) => s.chat.messagesByConv[conversationId]?.messages ?? EMPTY_MESSAGES,
  ) as MessageDto[];
  const hasMore = useAppSelector(
    (s: any) => s.chat.messagesByConv[conversationId]?.hasMore ?? false,
  );
  const nextCursor = useAppSelector(
    (s: any) => s.chat.messagesByConv[conversationId]?.nextCursor ?? null,
  );
  const loadingHistory = useAppSelector(
    (s: any) => s.chat.messagesByConv[conversationId]?.loading ?? false,
  );
  const isActive = useAppSelector((s: any) => {
    const c = s.chat.conversations.find(
      (cc: any) => cc.conversationId === conversationId,
    );
    return c ? c.isActive : routeIsActive ?? true;
  });
  const quota = useAppSelector((s: any) => s.chat.quotaByConv?.[conversationId]);

  const [replyTo, setReplyTo] = useState<any>(null);
  const [actionTarget, setActionTarget] = useState<any>(null);
  const [actionLayout, setActionLayout] = useState<any>(null);
  const [editTarget, setEditTarget] = useState<any>(null);
  const [editText, setEditText] = useState("");
  const [optionsOpen, setOptionsOpen] = useState(false);
  const [reportOpen, setReportOpen] = useState(false);
  const [purchaseVisible, setPurchaseVisible] = useState(false);
  const [profileVisible, setProfileVisible] = useState(false);
  const [profileDetail, setProfileDetail] = useState<any>(null);

  // Kota dolduğunda TEK çıkış: Premium modalı (consumable "sohbeti aç" akışı
  // 2026-08-02'de kaldırıldı). Huni: chat_quota_exhausted →
  // chat_quota_paywall_viewed → subscription_initial_purchase.
  const openQuotaPaywall = useCallback(
    (source: string) => {
      // §11: modalı açmadan önce canonical premium state'i tazele — kullanıcı
      // başka bir cihazdan premium olmuş olabilir. Premium çıkarsa kotayı
      // yeniliyoruz (sohbet zaten sınırsıza dönmüştür) ve paywall açılmıyor;
      // huni eventi de o durumda yazılmıyor, "görüntülendi" sayısı şişmesin.
      dispatch(refreshEntitlementsForPaywall())
        .unwrap()
        .then((premium: boolean) => {
          if (premium) {
            dispatch(fetchChatQuota({ conversationId, force: true }));
            return;
          }
          analytics.capture("chat_quota_paywall_viewed", { conversationId, source });
          setPurchaseVisible(true);
        })
        .catch(() => {
          // Tazeleme başarısız → eski davranış: paywall'ı yine aç.
          analytics.capture("chat_quota_paywall_viewed", { conversationId, source });
          setPurchaseVisible(true);
        });
    },
    [conversationId, dispatch],
  );

  const listRef = useRef<any>(null);
  const composerRef = useRef<any>(null);
  // Composer TextInput'unun kendisi — uzun-bas menüsü kapanınca klavyeyi geri
  // açmak için odak buraya verilir (composerRef dış kapsayıcı, ölçüm içindir).
  const composerInputRef = useRef<any>(null);
  const deliveredAckedRef = useRef(new Set<string>());
  const renderedDataRef = useRef<any[]>([]);
  const messagesRef = useRef<MessageDto[]>(messages);
  const quotaRef = useRef(quota);
  const lastReadSentAtRef = useRef(0);
  useEffect(() => {
    messagesRef.current = messages;
  }, [messages]);
  useEffect(() => {
    quotaRef.current = quota;
  }, [quota]);
  // Menü kapanış callback'i "düzenle mi seçildi" bilgisini state'e bakmadan
  // okuyabilsin diye (callback stabil kalsın).
  const editTargetRef = useRef<any>(null);
  useEffect(() => {
    editTargetRef.current = editTarget;
  }, [editTarget]);

  // ── Reveal + keyboard (LegendList chat hooks) ──────────────────────────
  const { revealX, listGesture } = useRevealGesture();
  // Composer inset: opak composer + safe-area başlangıç değeri (ölçüm gelince
  // gerçek yükseklik yazılır). Fade bandı BİLEREK dahil değil — dahil edilirse
  // son balon bandın tamamı kadar yukarı kalkıyor ve aşağıda fazla boşluk
  // kalıyor. Balon bandın altına girmesin diye bandın kendisi kısaltıldı
  // (MessageComposer'daki COMPOSER_FADE_BAND).
  // NOT: useKeyboardScrollToEnd'in OTOMATİK freeze'i BİLEREK YOK — o freeze,
  // animated scrollToEnd promise'i resolve olmayınca TRUE'da kilitlenip tüm
  // klavye handler'larını susturuyordu ("parmağımla donuyor" bug'ı). Aşağıdaki
  // kbFreeze bambaşka: yalnız uzun-bas menüsü açıkken elle set edilen, menü
  // kapanınca (ve unmount'ta) kesin çözülen kısa ömürlü bir kilit.
  const { contentInsetEndAdjustment, onComposerLayout } =
    useKeyboardChatComposerInset(
      listRef,
      composerRef,
      INPUT_BAR_OPAQUE + insets.bottom,
    );

  // Liste oturur oturmaz 1px'lik SAHTE SCROLL at — görünmez ama şart.
  //
  // NEDEN: KeyboardChatScrollView'in tüm klavye/inset matematiği scroll offset'ini
  // (useScrollState) YALNIZCA native scroll olaylarından öğreniyor; başlangıç
  // değeri 0. LegendList ise girişte listeyi dibe ScrollView'in `contentOffset`
  // PROP'uyla konumlandırıyor — prop'la gelen konum scroll olayı ÜRETMEZ. Sonuç:
  // sohbete girip hiç kaydırmadan yanıt verirsen kütüphane "offset 0'dayız" sanıp
  // klavye/şerit telafisini sıfırdan hesaplıyor ve listeyi yukarı fırlatıyor.
  // Kullanıcı bir kez (nerede olursa olsun) kaydırınca sorun kayboluyordu —
  // çünkü ilk gerçek olay değeri tohumluyor. Teşhis bizzat bu gözlemden çıktı.
  //
  // 1px gidip geri dönmek iki gerçek onScroll olayı üretir; konum değişmez, gözle
  // görülmez. Sürükleme olayı (onScrollBeginDrag) ÜRETMEZ → sayfalama kapısı
  // (userScrolledRef) etkilenmez.
  // Jest biterken verilen odak DÜŞEBİLİYOR: RNGH dokunuşu native tarafta hâlâ
  // kapatırken first-responder değişimi iOS'ta yutulabiliyor ya da klavye,
  // keyboard-controller'ın "will show" gözlemi dışında açılıyor — klavye geliyor
  // ama KeyboardStickyView yükselmiyor, composer klavyenin ALTINDA kalıyor.
  // Çözüm, uzun-bas menüsü kapanışında zaten kanıtlanmış desen: bir frame sonra
  // odakla, klavye hâlâ gelmediyse 250ms'de bir kez daha dene.
  const focusRetryRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const focusComposerSoon = useCallback(() => {
    const focus = () => composerInputRef.current?.focus();
    requestAnimationFrame(focus);
    if (focusRetryRef.current) clearTimeout(focusRetryRef.current);
    focusRetryRef.current = setTimeout(() => {
      focusRetryRef.current = null;
      if (!Keyboard.isVisible()) focus();
    }, 250);
  }, []);

  // KISA SOHBET DÜZELTMESİ (içerik ekranı doldurmuyorsa).
  //
  // Yanıt şeridi composer'ı ~59px uzatınca bu değişim İKİ KERE telafi ediliyor:
  //   1) LegendList: alignItemsAtEnd dolgusu = scrollLength − içerik − contentInset
  //      formülünden geliyor; inset büyüyünce dolgu 59 küçülüyor ve içerik
  //      LAYOUT olarak 59 yukarı kayıyor (react-native.js → getAlignItemsAtEndPadding).
  //   2) keyboard-controller: useExtraContentPadding aynı 59 için ayrıca SCROLL atıyor.
  // Uzun sohbette dolgu 0 olduğu için tek telafi var, doğru çalışıyor; kısa
  // sohbette çift sayılıyor → şerit kapanınca içerik ~bir balon boyu aşağı kalıp
  // son balonu input'un/klavyenin altına sokuyor.
  //
  // Düzeltme MUTLAK ve fikir bağımsız: native scrollToEnd. Hedefi gerçek
  // contentInset'ten hesapladığı için (klavye + composer) kısa listede tam
  // "içeriğin dibi composer'ın üstünde" konumuna oturur; iki kez çağrılsa da
  // aynı yere gider. JS tabanlı göreli kaydırma KULLANILMAZ — kütüphanenin scroll
  // değeri kendi yazdığı contentOffset'lerde bayat kalabiliyor.
  const shortPinSubRef = useRef<{ remove: () => void } | null>(null);
  const shortPinTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const pinShortListToEnd = useCallback((waitForKeyboard: boolean) => {
    const clear = () => {
      shortPinSubRef.current?.remove();
      shortPinSubRef.current = null;
      if (shortPinTimerRef.current) clearTimeout(shortPinTimerRef.current);
      shortPinTimerRef.current = null;
    };
    clear();
    const run = () => {
      clear();
      const st = listRef.current?.getState?.();
      // contentLength composer inset'ini de içerir; kısa sohbette dolgu sayesinde
      // scrollLength'e eşitlenir. Uzun sohbette büyüktür → dokunma (orada zaten
      // doğru ve elle kaydırmak listeyi bozuyor).
      if (!st || st.contentLength > st.scrollLength + 1) return;
      const native = listRef.current?.getNativeScrollRef?.();
      if (typeof native?.scrollToEnd === "function") {
        native.scrollToEnd({ animated: true });
        return;
      }
      listRef.current
        ?.getScrollResponder?.()
        ?.scrollResponderScrollToEnd?.({ animated: true });
    };
    if (waitForKeyboard) {
      shortPinSubRef.current = KeyboardEvents.addListener("keyboardDidShow", run);
      shortPinTimerRef.current = setTimeout(run, 700);
    } else {
      shortPinTimerRef.current = setTimeout(run, 120);
    }
  }, []);

  const seedScrollStateRef = useRef(false);
  const seedTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const seedNativeScrollState = useCallback(() => {
    if (seedScrollStateRef.current) return;
    const native = listRef.current?.getNativeScrollRef?.();
    if (typeof native?.scrollTo !== "function") return;
    const y = listRef.current?.getState?.()?.scroll ?? 0;
    seedScrollStateRef.current = true;
    native.scrollTo({ y: y + 1, animated: false });
    // İkinci adım BİR FRAME SONRA: aynı tick'te üst üste iki contentOffset
    // yazarsak scrollEventThrottle (16ms) ikinciyi yutabiliyor ve tohum 1px
    // şaşık kalıyordu. Bir frame arayla ikisi de gerçek olay üretir, konum da
    // tam yerine döner.
    requestAnimationFrame(() => {
      listRef.current?.getNativeScrollRef?.()?.scrollTo?.({ y, animated: false });
    });
  }, []);

  // Soldan sağa çekip bırakınca yanıtla: jest satırın kendisinde (ReplySwipeRow),
  // UI-thread'de yalnız mesaj id'si taşınır; mesaj nesnesi burada, EKRANDA RENDER
  // EDİLEN listeden çözülür. Callback STABİL kalmalı — jest kimliği ona bağlı.
  //
  // BURADA LİSTEYİ ELLE KAYDIRMIYORUZ. Şerit açılıp kapanınca composer boyu
  // değişiyor ve bunun telafisini KeyboardChatScrollView'in useExtraContentPadding
  // reaksiyonu ZATEN yapıyor (keyboardLiftBehavior varsayılanı "always"): UI
  // thread'de, gerçek scroll offset'iyle. JS'ten scrollToEnd/scrollToOffset ile
  // yardım etmeye çalışmak listeyi BOZUYOR — LegendList'in getState().scroll'u
  // klavye/inset animasyonu sırasında bayat kalıyor ve liste bir anda ~klavye
  // boyu YUKARI zıplıyor (14:00 videosunda kare 25→26 tam olarak bu).
  const handleReplyBySwipe = useCallback(
    (messageId: string) => {
      const target = renderedDataRef.current.find(
        (m: any) => !m.__separator && m.id === messageId,
      );
      if (!target || target.deletedAt || target.isSystemMessage) return;
      // Sunucu id'si yoksa yanıt referansı kurulamaz (uzun-bas menüsündeki kural).
      if (target._pending || target._failed) return;
      // onLoad hiç gelmediyse tohumlama burada garantiye alınır (bkz.
      // seedNativeScrollState); zaten tohumlandıysa no-op. Şeridi açmadan ÖNCE
      // olmalı — kütüphane inset değişimini gerçek offset'le hesaplasın.
      seedNativeScrollState();
      setReplyTo(buildReplyDraft(target));
      // Klavye kapalıysa doğrudan aç (WhatsApp): yanıt şeridi belirir belirmez
      // yazmaya başlanabilsin. Sohbet pasif/kota kilitliyken input editable
      // olmadığı için focus() no-op'tur — ayrı bir koşula gerek yok (koşul
      // eklenirse callback kimliği kotayla değişip tüm satır jestlerini yeniden
      // kurdurur).
      const kbClosed = !Keyboard.isVisible();
      if (kbClosed) focusComposerSoon();
      // Kısa sohbette şeridin çift telafisini düzelt (bkz. pinShortListToEnd).
      // Klavye de açılacaksa oturmasını bekler.
      pinShortListToEnd(kbClosed);
    },
    [seedNativeScrollState, focusComposerSoon, pinShortListToEnd],
  );

  // Uzun-bas menüsü açılırken klavye kapanıyor, kapanınca geri açılıyor. Bu iki
  // klavye hareketi listeye YANSIMAMALI: yansırsa liste ~klavye yüksekliği kadar
  // aşağı/yukarı kayıyor, menü klonu da bayat konuma uçuyordu. freeze=true iken
  // KeyboardChatScrollView tüm klavye kaynaklı padding/contentOffset işlerini
  // atlar → liste tek piksel oynamaz. Klavye geri açıldığında (aynı yükseklik)
  // geometri zaten tutarlı olduğu için freeze çözülür.
  const kbFreeze = useSharedValue(false);
  // Menü kapanınca klavye geri açılsın mı (uzun basışta açıktı ise).
  const restoreKbRef = useRef(false);
  const kbUnfreezeRef = useRef<(() => void) | null>(null);

  const inputKbOffset = useMemo(
    () => ({ closed: 0, opened: insets.bottom }),
    [insets.bottom],
  );
  const listContentContainerStyle = useMemo(
    () => ({ paddingTop: insets.top + HEADER_CONTENT }),
    [insets.top],
  );

  // ── Quota toast'ları ───────────────────────────────────────────────────
  const quotaEntryToastShownRef = useRef(false);
  const quotaHadRemainingRef = useRef(false);
  const quotaExhaustedToastShownRef = useRef(false);
  useEffect(() => {
    if (quotaEntryToastShownRef.current || !isActive) return;
    if (!quota || quota.isUnlimited) return;
    const remaining = quota.remainingMessages;
    if (remaining == null || remaining <= 0) return;
    quotaEntryToastShownRef.current = true;
    quotaHadRemainingRef.current = true;
    showInfoToast({
      title: t("chat.quota.title"),
      message: t("chat.quota.message", { remaining }),
    });
  }, [quota, isActive, t]);
  useEffect(() => {
    if (quotaExhaustedToastShownRef.current || !quotaHadRemainingRef.current) return;
    if (!isActive || !quota || quota.isUnlimited) return;
    if (quota.remainingMessages == null || quota.remainingMessages > 0) return;
    quotaExhaustedToastShownRef.current = true;
    analytics.capture("chat_quota_exhausted", { conversationId });
    showInfoToast({
      title: t("chat.quota.exhausted"),
      message: t("chat.quota.exhaustedMessage"),
    });
  }, [quota, isActive, t, conversationId]);

  useEffect(() => {
    const unsub = uiBus.on("chatQuotaExhausted", (payload: any) => {
      if (payload?.conversationId !== conversationId) return;
      analytics.capture("chat_quota_exhausted", { conversationId });
      dispatch(fetchChatQuota({ conversationId, force: true }));
      openQuotaPaywall("hub_error");
    });
    return unsub;
  }, [conversationId, dispatch, openQuotaPaywall]);

  // ── Aktif sohbet + init (history, join, mark-read, quota) ───────────────
  useEffect(() => {
    dispatch(setActiveConversation(conversationId));
    return () => {
      dispatch(setActiveConversation(null));
    };
  }, [conversationId, dispatch]);

  const hadInitialMessagesRef = useRef<boolean | null>(null);
  if (hadInitialMessagesRef.current === null) {
    hadInitialMessagesRef.current = messages.length > 0;
  }

  // ── Giriş skeleton'ı ───────────────────────────────────────────────────
  // LegendList ilk yerleşim oturana kadar içeriği KENDİ İÇİNDE gizliyor
  // (readyToRender opacity gate) — bucket dolu girişte ListEmptyComponent
  // render edilmediğinden kullanıcı o süre boyunca BOŞ arkaplan görüyordu
  // ("cache yok" hissi). onLoad = listenin "oturdum" sinyali; gelene kadar
  // listeyi skeleton örter. Boş bucket girişinde overlay YOK — orada skeleton
  // zaten ListEmptyComponent'ten geliyor.
  const [listSettled, setListSettled] = useState(false);
  const handleListLoad = useCallback(() => {
    setListSettled(true);
    // Tohumlama giriş yerleşiminin BİR TIK SONRASINA bırakılır: LegendList
    // initialScrollAtEnd hedefini item'lar ölçüldükçe hâlâ düzeltiyor olabilir ve
    // erken bir scroll olayı "kullanıcı kaydırdı" sayılıp o düzeltmeyi kesebilir.
    // Bu gecikmeden önce yanıt verilirse handleReplyBySwipe zaten kendisi tohumlar.
    if (seedTimerRef.current) clearTimeout(seedTimerRef.current);
    seedTimerRef.current = setTimeout(seedNativeScrollState, 400);
  }, [seedNativeScrollState]);
  useEffect(
    () => () => {
      if (seedTimerRef.current) clearTimeout(seedTimerRef.current);
      if (focusRetryRef.current) clearTimeout(focusRetryRef.current);
      shortPinSubRef.current?.remove();
      if (shortPinTimerRef.current) clearTimeout(shortPinTimerRef.current);
    },
    [],
  );
  useEffect(() => {
    if (listSettled) return;
    // Güvenlik: onLoad hiç gelmezse (edge-case) overlay takılı kalmasın.
    const t = setTimeout(() => setListSettled(true), 1200);
    return () => clearTimeout(t);
  }, [listSettled]);
  const showEntrySkeleton = !!hadInitialMessagesRef.current && !listSettled;

  useEffect(() => {
    let mounted = true;
    (async () => {
      try {
        if (!hadInitialMessagesRef.current) {
          await dispatch(fetchHistory({ conversationId, cursor: null, pageSize: 30 }));
        } else {
          // Bucket dolu = MMKV hydrate'i ya da önceki oturum — anında render edildi
          // ama tazeliği garanti değil. Fire-and-forget reconcile: fulfilled'da
          // bucket server-authoritative REPLACE edilir (_pending korunur; kaçan
          // edit/delete/receipt düzelir, transform'un null'ladığı cursor onarılır).
          // Rejected'da (offline) cache aynen kalır.
          dispatch(fetchHistory({ conversationId, cursor: null, pageSize: 30 }));
        }
        if (!mounted) return;
        await realtimeService.joinConversation(conversationId).catch(() => {});
        dispatch(clearUnreadForConversation(conversationId));
        dispatch(fetchChatQuota(conversationId));
      } catch (err: any) {
        console.warn("chat init err:", err?.message);
      }
    })();
    return () => {
      mounted = false;
    };
  }, [conversationId, dispatch]);

  // Delivered-ack: yeni mesaj geldiğinde partner'ın undelivered mesajlarını işaretle.
  useEffect(() => {
    if (!myUserId) return;
    const undelivered = messagesRef.current.filter(
      (m: any) =>
        m.senderId &&
        m.senderId !== myUserId &&
        !m.deliveredAt &&
        !m.isSystemMessage &&
        !deliveredAckedRef.current.has(m.id),
    );
    if (undelivered.length === 0) return;
    const raf = requestAnimationFrame(() => {
      undelivered.forEach((m: any) => {
        deliveredAckedRef.current.add(m.id);
        realtimeService.markMessageDelivered(m.id).catch(() => {});
      });
    });
    return () => cancelAnimationFrame(raf);
  }, [messages.length, myUserId]);

  // Mark-read: karşı tarafın yeni mesajı geldiğinde (sentAt ilerleyince) bir kez.
  useEffect(() => {
    if (!isActive || !myUserId) return;
    const latest = latestPartnerSentAt(messages, myUserId);
    if (latest > lastReadSentAtRef.current) {
      lastReadSentAtRef.current = latest;
      chatService.markRead(conversationId).catch(() => {});
    }
  }, [messages, conversationId, isActive, myUserId]);

  // ── Pagination ─────────────────────────────────────────────────────────
  const userScrolledRef = useRef(false);
  const pendingLoadOlderRef = useRef(false);
  const loadOlderInFlightRef = useRef(false);
  useEffect(() => {
    if (!loadingHistory) loadOlderInFlightRef.current = false;
  }, [loadingHistory]);

  // Sayfalar arası kısa cooldown: prepend sonrası MVCP çapası bir frame geç
  // oturduğunda liste kendini hâlâ "tepede" sanıp onStartReached'i tekrar
  // ateşliyor → 5 sayfa zincirleme çekiliyordu (cihaz logu). In-flight guard
  // eşzamanlıyı, cooldown zinciri keser; kullanıcı gerçekten tepede beklerse
  // 400ms sonra sıradaki sayfa yine gelir (akıcılık bozulmaz).
  const lastLoadOlderAtRef = useRef(0);
  // Momentum (fling) sürerken PREPEND YAPMA: erken tetik (threshold 1.5) fling
  // ortasında sayfa düşürünce MVCP çapa düzeltmesi aktif scroll'la yarışıp
  // balonları boşluğa düşürüyordu. Fling bitince bekleyen fetch hemen çalışır.
  const momentumActiveRef = useRef(false);

  const fetchOlderPage = useCallback(() => {
    if (loadingHistory || loadOlderInFlightRef.current || !hasMore || !nextCursor)
      return false;
    if (momentumActiveRef.current) return false;
    const now = Date.now();
    if (now - lastLoadOlderAtRef.current < 400) return false;
    lastLoadOlderAtRef.current = now;
    loadOlderInFlightRef.current = true;
    dispatch(fetchHistory({ conversationId, cursor: nextCursor, pageSize: 30 }));
    return true;
  }, [conversationId, dispatch, hasMore, loadingHistory, nextCursor]);

  // Bekleyen (bloklanmış) prepend'i kendiliğinden tekrar dene: onStartReached
  // zone'a girişte BİR KEZ ateşlenir; cooldown/momentum o anı bloklarsa ve
  // kullanıcı tepede hareketsiz beklerse hiçbir olay fetch'i tekrar tetiklemiyordu
  // ("tepeye varıp beklemek gerekiyor" şikâyeti). Timer, cooldown geçince dener;
  // hâlâ bloklu ise (yükleme sürüyor vs.) tekrar kurar; hasMore bitince susar.
  const retryTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const scheduleOlderRetry = useCallback(() => {
    if (retryTimerRef.current) return;
    retryTimerRef.current = setTimeout(() => {
      retryTimerRef.current = null;
      if (!pendingLoadOlderRef.current || !userScrolledRef.current) return;
      if (!hasMore) {
        pendingLoadOlderRef.current = false;
        return;
      }
      if (fetchOlderPage()) {
        pendingLoadOlderRef.current = false;
      } else if (!momentumActiveRef.current) {
        scheduleOlderRetry();
      }
      // momentum sürüyorsa handleMomentumEnd zaten flush edecek.
    }, 450);
  }, [fetchOlderPage, hasMore]);
  useEffect(
    () => () => {
      if (retryTimerRef.current) clearTimeout(retryTimerRef.current);
    },
    [],
  );

  const loadMoreOlder = useCallback(() => {
    if (!hasMore) return;
    if (
      !userScrolledRef.current ||
      loadingHistory ||
      !nextCursor ||
      momentumActiveRef.current
    ) {
      pendingLoadOlderRef.current = true;
      scheduleOlderRetry();
      return;
    }
    if (!fetchOlderPage()) {
      // Cooldown'a takıldı — kaybetme, süresi dolunca dene.
      pendingLoadOlderRef.current = true;
      scheduleOlderRetry();
    }
  }, [fetchOlderPage, hasMore, loadingHistory, nextCursor, scheduleOlderRetry]);

  const handleMomentumBegin = useCallback(() => {
    momentumActiveRef.current = true;
  }, []);
  const handleMomentumEnd = useCallback(() => {
    momentumActiveRef.current = false;
    // Fling bitti — liste hareketsiz; bekleyen prepend hemen ya da cooldown
    // dolunca (retry timer) çalışır.
    if (pendingLoadOlderRef.current) {
      if (fetchOlderPage()) pendingLoadOlderRef.current = false;
      else scheduleOlderRetry();
    }
  }, [fetchOlderPage, scheduleOlderRetry]);

  const handleScrollBeginDrag = useCallback(() => {
    userScrolledRef.current = true;
    if (pendingLoadOlderRef.current && fetchOlderPage()) {
      pendingLoadOlderRef.current = false;
    }
  }, [fetchOlderPage]);

  useEffect(() => {
    if (!pendingLoadOlderRef.current || !userScrolledRef.current) return;
    if (fetchOlderPage()) pendingLoadOlderRef.current = false;
  }, [fetchOlderPage]);

  useEffect(() => {
    userScrolledRef.current = false;
    pendingLoadOlderRef.current = false;
  }, [conversationId]);

  // DEV: estimatedItemSize'ı gerçek ölçümle doğrula — mount'tan 4sn sonra
  // LegendList'in tip-bazlı ortalama item boyutlarını logla. (msg ortalaması
  // ChatMessageList'teki estimatedItemSize'dan belirgin sapıyorsa onu güncelle.)
  useEffect(() => {
    if (!__DEV__) return;
    const timer = setTimeout(() => {
      try {
        const avgs = listRef.current?.getState?.()?.getAverageItemSizes?.();
        if (avgs) devLog("[chat] avg item sizes:", JSON.stringify(avgs));
      } catch {}
    }, 4000);
    return () => clearTimeout(timer);
  }, [conversationId]);

  // ── Send ───────────────────────────────────────────────────────────────
  // Ack bekleyen hub gönderimlerinin sayaçları; unmount'ta temizlenir.
  const ackTimersRef = useRef<Set<ReturnType<typeof setTimeout>>>(new Set());
  useEffect(
    () => () => {
      ackTimersRef.current.forEach(clearTimeout);
      ackTimersRef.current.clear();
    },
    [],
  );

  const handleSend = useCallback(
    async ({ content, replyToMessageId, clientMessageId }: any) => {
      const q = quotaRef.current;
      if (q && !q.isUnlimited && q.requiresPremium) {
        openQuotaPaywall("composer_send");
        return;
      }
      const optimistic: any = {
        id: `temp-${clientMessageId}`,
        conversationId,
        senderId: myUserId,
        content,
        sentAt: new Date().toISOString(),
        readAt: null,
        deliveredAt: null,
        isSystemMessage: false,
        clientMessageId,
        contentType: ContentType.Text,
        replyTo: replyToMessageId
          ? buildReplyPreview(messagesRef.current, replyToMessageId)
          : null,
        reactions: [],
        _pending: true,
      };
      dispatch(appendOptimisticMessage({ conversationId, message: optimistic }));
      // Dipteyken scroll işini maintainScrollAtEnd(dataChange) yapar: o yol NATIVE
      // scrollToEnd kullanır ve klavyenin contentInset'ini bilir. Buradaki manuel
      // scrollToEnd ise LegendList'in JS hedef hesabına düşer; keyboard-controller
      // 1.21.6 klavye inset'ini listeye raporlamadığından (onContentInsetChange
      // 1.21.7+) hedef klavye açıkken ~klavye yüksekliği kadar KISA kalıyor →
      // "gönderince yukarı zıpla, hub echo'da dibe dön" glitch'i. Bu yüzden manuel
      // scroll yalnız YEDEK: kullanıcı dip eşiğinin dışındayken (yukarı scroll
      // edilmiş halde gönderim) çalışır; eşikteyse hiç dokunma.
      setTimeout(() => {
        const listState = listRef.current?.getState?.();
        if (listState?.isWithinMaintainScrollAtEndThreshold) return;
        listRef.current?.scrollToEnd({ animated: true });
      }, 100);

      try {
        const useHub = realtimeService.isConnected() && !replyToMessageId;
        let httpResult: MessageDto | null = null;
        if (useHub) {
          await realtimeService.sendMessage(conversationId, content, clientMessageId);
          // invoke resolve olsa bile mesajın gittiği garanti değil (hata ayrı
          // `Error` event'iyle gelir, sohbet kapandıysa ack hiç gelmez).
          const timer = setTimeout(() => {
            ackTimersRef.current.delete(timer);
            const msg = messagesRef.current.find(
              (m: any) => m.clientMessageId === clientMessageId,
            ) as any;
            if (msg?._pending) {
              dispatch(failOptimisticMessage({ conversationId, clientMessageId }));
            }
          }, SEND_ACK_TIMEOUT_MS);
          ackTimersRef.current.add(timer);
        } else {
          httpResult = await chatService.sendMessage({
            conversationId,
            content,
            clientMessageId,
            replyToMessageId,
          } as any);
        }
        if (httpResult) dispatch(messageSent(httpResult));
        dispatch(decrementQuotaLocally({ conversationId }));
      } catch (err: any) {
        const status = err?.response?.status;
        const paywallType = err?.response?.data?.result?.paywallType;
        if (status === 402 || paywallType === "CHAT_QUOTA_EXHAUSTED") {
          dispatch(removeOptimisticMessage({ conversationId, clientMessageId }));
          analytics.capture("chat_quota_exhausted", { conversationId });
          // isUnlimited her mesajda değil, girişte ve 402'de tazelenir.
          dispatch(fetchChatQuota({ conversationId, force: true }));
          openQuotaPaywall("send_402");
          return;
        }
        dispatch(failOptimisticMessage({ conversationId, clientMessageId }));
        // Sohbet kapanmış olabilir (karşı taraf unmatch etti / engelledi):
        // REST yolunda 403/404 kesin, 400 CONVERSATION_ERROR olabilir ama
        // validasyon da olabilir — 400'de yerel bayrağı çevirmeyip listeyi
        // sunucudan doğrulatıyoruz, isActive oradan düzeliyor.
        if (status === 403 || status === 404) {
          dispatch(conversationDeactivated({ conversationId }));
        }
        if (status === 400 || status === 403 || status === 404) {
          dispatch(fetchConversations({ force: true }));
        }
      }
    },
    [conversationId, dispatch, myUserId, openQuotaPaywall],
  );

  const handleInputSend = useCallback(
    (payload: any) => {
      handleSend(payload);
      setReplyTo(null);
    },
    [handleSend],
  );
  // Uzun sohbette kapanış telafisi KeyboardChatScrollView'in işi (elle kaydırma
  // orayı bozuyor). Kısa sohbette ise telafi çift sayıldığı için son balon
  // input'un altında kalıyor — pinShortListToEnd yalnız o durumda devreye girer.
  const handleCancelReply = useCallback(() => {
    setReplyTo(null);
    pinShortListToEnd(false);
  }, [pinShortListToEnd]);
  const handleLockedPress = useCallback(
    () => openQuotaPaywall("composer_locked"),
    [openQuotaPaywall],
  );
  const handleTypingChange = useCallback(
    (isTyping: boolean) => {
      if (isTyping) realtimeService.startTyping(conversationId).catch(() => {});
      else realtimeService.stopTyping(conversationId).catch(() => {});
    },
    [conversationId],
  );

  // ── Mesaj aksiyonları ────────────────────────────────────────────────────
  const handleLongPressMessage = useCallback(
    (message: any, layout: any) => {
      if (message._pending || message._failed) return;
      Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium).catch(() => {});

      // Klavye açıkken: listeyi klavye telafisine karşı DONDUR, sonra klavyeyi
      // kapat ve menüyü BEKLETMEDEN aç. Modal klavyeyi zaten kapatıyor ama
      // odak inputta kalırsa iOS modal kapanınca klavyeyi kendi kafasına göre
      // geri açıyor — açıkça dismiss ediyoruz, geri açmayı biz yönetiyoruz.
      // freeze sayesinde ne bu kapanış ne de menü kapanınca yapacağımız geri
      // açılış listeyi oynatır; balon yerinde kalır, klon da doğru konuma döner.
      if (Keyboard.isVisible()) {
        // Askıda kalmış bir çözülme varsa (art arda uzun basış) önce onu kapat.
        kbUnfreezeRef.current?.();
        kbFreeze.value = true;
        restoreKbRef.current = true;
        // dismiss BİR TİK GECİKMELİ: freeze JS'te yazılıp UI thread'e geçiyor
        // (üstüne kütüphane onu bir useDerivedValue ile tüketiyor). Hemen
        // dismiss edersek klavye "will hide" worklet'i freeze daha inmeden
        // çalışıp listeyi klavye boyu AŞAĞI kaydırıyor; sonra geri açılış
        // (artık donuk) o kaymayı geri almadığı için liste klavyenin altında
        // kalıyordu. Bir-iki frame beklemek gözle görülmüyor.
        setTimeout(() => Keyboard.dismiss(), 50);
      } else {
        restoreKbRef.current = false;
      }
      setActionLayout(layout || null);
      setActionTarget(message);
    },
    [kbFreeze],
  );

  // Menü kapandı: klavye uzun basış anında açıksa geri getir. Liste hâlâ donuk
  // olduğu için klavye yükselirken mesajlar oynamaz; klavye tamamen açılınca
  // (didShow) freeze çözülür — geometri o an zaten "klavye açık" haliyle
  // tutarlıdır. Emniyet: olay gelmezse süre sonunda yine çözülür.
  const handleActionSheetClose = useCallback(() => {
    setActionTarget(null);
    if (!restoreKbRef.current) return;
    restoreKbRef.current = false;

    let done = false;
    const release = () => {
      if (done) return;
      done = true;
      sub.remove();
      clearTimeout(timer);
      clearTimeout(retry);
      kbUnfreezeRef.current = null;
      kbFreeze.value = false;
    };
    kbUnfreezeRef.current = release;
    const sub = Keyboard.addListener("keyboardDidShow", release);
    const timer = setTimeout(release, 900);

    const focusComposer = () => {
      // "Düzenle" seçildiyse edit modalının kendi input'u autoFocus ile klavyeyi
      // açıyor — composer'a odak vermek onunla çakışır, sadece didShow'u bekleriz.
      if (done || editTargetRef.current) return;
      composerInputRef.current?.focus();
    };
    // Modal native tarafta kapanmadan verilen odak düşebiliyor → bir frame sonra
    // dene, klavye hâlâ gelmediyse bir kez daha.
    requestAnimationFrame(focusComposer);
    const retry = setTimeout(() => {
      if (!Keyboard.isVisible()) focusComposer();
    }, 250);
  }, [kbFreeze]);

  // Ekrandan çıkılırsa kilit askıda kalmasın.
  useEffect(
    () => () => {
      kbUnfreezeRef.current?.();
    },
    [],
  );

  // Bir mesaja kullanıcı başına TEK reaction: yeni emoji seçilirse eskisi
  // DEĞİŞTİRİLİR (önce remove, sonra add), aynı emoji tekrar seçilirse kaldırılır.
  // "Benim" reaction'ım userIds ile bulunur (MessageReactionDto: emoji/count/userIds).
  const handlePickReaction = useCallback(
    async (target: any, emoji: string) => {
      if (!target) return;
      // actionTarget uzun-basış anındaki kopya — o sırada gelen hub event'i
      // reaction'ları değiştirmiş olabilir, taze kaydı store'dan al.
      const message =
        messagesRef.current.find((m) => m.id === target.id) || target;
      const prev = message.reactions || [];
      const { next, removeEmoji, addEmoji } = applyReactionPick(
        prev,
        emoji,
        myUserId,
      );

      dispatch(
        reactionsChanged({
          messageId: message.id,
          conversationId: message.conversationId,
          reactions: next,
        }),
      );
      try {
        let server: any;
        if (removeEmoji) {
          server = await chatService.removeReaction(message.id, removeEmoji);
        }
        if (addEmoji) {
          server = await chatService.addReaction(message.id, addEmoji);
        }
        // Server tüm listeyi döner — count/userIds kanonik hale gelsin.
        if (Array.isArray(server)) {
          dispatch(
            reactionsChanged({
              messageId: message.id,
              conversationId: message.conversationId,
              reactions: server,
            }),
          );
        }
      } catch {
        dispatch(
          reactionsChanged({
            messageId: message.id,
            conversationId: message.conversationId,
            reactions: prev,
          }),
        );
      }
    },
    [dispatch, myUserId],
  );

  const handleReply = useCallback((message: any) => {
    if (!message) return;
    setReplyTo(buildReplyDraft(message));
  }, []);

  const handleEditStart = useCallback((message: any) => {
    if (!message) return;
    setEditTarget(message);
    setEditText(message.content || "");
  }, []);

  const handleEditSave = useCallback(async () => {
    if (!editTarget) return;
    const trimmed = editText.trim();
    if (!trimmed || trimmed === editTarget.content) {
      setEditTarget(null);
      return;
    }
    const prevContent = editTarget.content;
    dispatch(
      messageEdited({
        id: editTarget.id,
        conversationId: editTarget.conversationId,
        content: trimmed,
        editedAt: new Date().toISOString(),
      } as any),
    );
    setEditTarget(null);
    setEditText("");
    try {
      await chatService.editMessage(editTarget.id, trimmed);
    } catch (err: any) {
      dispatch(
        messageEdited({
          id: editTarget.id,
          conversationId: editTarget.conversationId,
          content: prevContent,
        } as any),
      );
      Alert.alert(
        t("common.error"),
        err?.response?.data?.message || t("chat.editMessage.error"),
      );
    }
  }, [editTarget, editText, dispatch, t]);

  const handleDelete = useCallback(
    async (message: any, forEveryone: boolean) => {
      if (!message) return;
      const snapshot = {
        content: message.content,
        deletedAt: message.deletedAt ?? null,
        deletedForEveryone: message.deletedForEveryone ?? false,
      };
      dispatch(
        messageDeleted({
          messageId: message.id,
          conversationId: message.conversationId,
          forEveryone,
          deletedAt: new Date().toISOString(),
        }),
      );
      try {
        await chatService.deleteMessage(message.id, forEveryone);
      } catch (err: any) {
        dispatch(
          messageEdited({
            id: message.id,
            conversationId: message.conversationId,
            ...snapshot,
          } as any),
        );
        Alert.alert(
          t("common.error"),
          err?.response?.data?.message || t("chat.deleteMessage.error"),
        );
      }
    },
    [dispatch, t],
  );

  const handleRetrySend = useCallback(
    (failedMsg: any) => {
      if (!failedMsg?._failed) return;
      dispatch(
        removeOptimisticMessage({
          conversationId,
          clientMessageId: failedMsg.clientMessageId,
        }),
      );
      handleSend({
        content: failedMsg.content,
        replyToMessageId: failedMsg.replyTo?.id,
        clientMessageId: failedMsg.clientMessageId,
      });
    },
    [conversationId, dispatch, handleSend],
  );

  const handleScrollToReplyTarget = useCallback((reply: any) => {
    if (!reply?.id) return;
    const idx = renderedDataRef.current.findIndex((m: any) => m.id === reply.id);
    if (idx >= 0) {
      try {
        listRef.current?.scrollToIndex({ index: idx, animated: true, viewPosition: 0.5 });
      } catch {}
      // Hedef balon yerine otururken kısa süre yanıp söner — hangi mesaja
      // gelindiği belli olsun. Vurgu dışsal store'dan yürür (bkz.
      // messageHighlight): burada state tutmak renderItem'ı değiştirip tüm
      // listeyi yeniden render ettirirdi.
      highlightMessage(reply.id);
    }
  }, []);

  const handleUnmatch = useCallback(async () => {
    try {
      await chatService.deactivateConversation(conversationId);
      // Yerel bayrak + mutasyon-sonrası tazeleme: aksi halde geri dönülen
      // sohbet listesi (15sn staleness gate'i yüzünden) sohbeti hâlâ aktif
      // gösteriyordu. MessagesScreen'deki unmatch akışı ile aynı desen.
      dispatch(conversationDeactivated({ conversationId }));
      dispatch(fetchConversations({ force: true }));
      navigation.goBack();
    } catch {
      Alert.alert(t("common.error"), t("chat.unmatch.error"));
    }
  }, [conversationId, dispatch, navigation, t]);

  const handleRestore = useCallback(async () => {
    try {
      const ok = await chatService.restoreConversation(conversationId);
      if (!ok)
        Alert.alert(t("chat.restore.error"), t("chat.unmatch.restoreExpiredMessage"));
      else dispatch(fetchConversations({ force: true }));
    } catch {
      Alert.alert(t("common.error"), t("chat.unmatch.restoreFailed"));
    }
  }, [conversationId, dispatch, t]);

  const handleBlock = useCallback(async () => {
    if (!partner?.userId) return;
    try {
      await moderationService.blockUser(partner.userId);
      Alert.alert(t("chat.block.title"), t("chat.block.message"));
      navigation.goBack();
    } catch (err: any) {
      Alert.alert(
        t("common.error"),
        err?.response?.data?.message || t("chat.block.error"),
      );
    }
  }, [partner?.userId, navigation, t]);

  // Header avatarına dokunuş → ProfileScreen'deki PreviewModal'ın aynısı
  // (SwipeCard'ın expanded hali). Sheet ÖNCE açılır (profile=null iken spinner
  // gösterir), detay arkadan dolar — tap ile açılış arasında beklemesin.
  //
  // Endpoint: LikerProfile. Eşleşme = karşılıklı like olduğu için satır hâlâ
  // duruyor; yine de gate'e takılırsa (403/404) route param'lardan minimal bir
  // profil kurup kartı isim+fotoğrafla açıyoruz — dokunuş ölü kalmasın.
  const openPartnerProfile = useCallback(async () => {
    if (!partner?.userId) return;
    Keyboard.dismiss();
    setProfileDetail(null);
    setProfileVisible(true);
    const fallback = {
      userId: partner.userId,
      displayName: partner.displayName,
      photos: partner.profileImageUrl ? [partner.profileImageUrl] : [],
    };
    try {
      const res: any = await swipeService.getLikerProfileDetail(partner.userId);
      setProfileDetail(res?.isSuccess && res?.result ? res.result : fallback);
    } catch {
      setProfileDetail(fallback);
    }
  }, [partner?.userId, partner?.displayName, partner?.profileImageUrl]);

  // ── Data (kronolojik + separator) ────────────────────────────────────────
  const messagesWithSeparators = useMemo(() => {
    // "Sadece benden sil" mesajı state'ten SİLMİYOR, deletedAt + deletedForEveryone:false
    // işaretliyor (MessageBubble onu null render eder). Listede tutulursa gün
    // separator'ı o mesaj yüzünden üretilmeye devam eder ve ekranda hiç balon
    // olmadığı halde "Bugün"/"Dün" yazısı asılı kalır — o yüzden BURADA eliyoruz.
    const visible = messages.filter(
      (m) => !(m.deletedAt && !m.deletedForEveryone),
    );
    const hasRealMessage = visible.some((m) => !m.isSystemMessage);
    const filtered = hasRealMessage
      ? visible.filter(
          (m) =>
            !(m.isSystemMessage && (m as any).localizationKey === "system.match_created"),
        )
      : visible;
    const chronological = filtered.slice().reverse();
    const withSeparators = withDateSeparators(chronological);
    renderedDataRef.current = withSeparators;
    return withSeparators;
  }, [messages]);

  const renderItem = useCallback(
    ({ item, index, data: rows }: any) => {
      // Satırlar liste genişliğinde (ekran + REVEAL_MAX) — separator EKRANDA
      // ortalansın diye sağdaki reveal şeridini marginle düş.
      if (item.__separator)
        return (
          <View style={{ marginRight: REVEAL_MAX }}>
            <DateSeparator label={item.label} />
          </View>
        );
      if (CHAT_DIAG_MINIMAL_BUBBLES)
        return (
          <DiagMinimalBubble message={item} isOwn={item.senderId === myUserId} />
        );
      // Konuşmacı değişiminde balonun üstüne fazladan boşluk (bkz. GROUP_GAP).
      // Üstteki satır LegendList'in kendi render prop'undan (data) okunur —
      // veriyi useCallback deps'ine koymak callback kimliğini her mesajda
      // değiştirip tüm görünür satırları yeniden render ettirirdi.
      const prevRow = index > 0 ? rows?.[index - 1] : null;
      const isGroupStart =
        !prevRow || !!prevRow.__separator || prevRow.senderId !== item.senderId;
      // ReplySwipeRow: soldan-sağa çekip-yanıtla jesti + satırın kaydırma stili.
      // Satırın TÜM genişliğini kaplar → çekiş balonun dışından da başlatılabilir.
      // Yanıtlanamaz satırlarda (sistem / silinmiş / henüz sunucuya gitmemiş) id
      // yerine "" geçilir: jest atıl kalır, balon kımıldamaz. Sarmalayıcı HER
      // durumda var — gönderim onaylanınca (_pending düşünce) ağaç yapısı değişip
      // balonu remount ETMESİN diye (key aynı kalıyor, bkz. keyExtractor).
      const replyable =
        !item.isSystemMessage && !item.deletedAt && !item._pending && !item._failed;
      return (
        <ReplySwipeRow
          messageId={replyable ? item.id : ""}
          onReply={handleReplyBySwipe}
        >
          <MessageBubble
            message={item}
            isOwn={item.senderId === myUserId}
            isGroupStart={isGroupStart}
            onLongPress={(layout: any) => handleLongPressMessage(item, layout)}
            onReplyTap={handleScrollToReplyTarget}
            onRetryTap={() => handleRetrySend(item)}
            i18nResolver={i18nResolver}
          />
        </ReplySwipeRow>
      );
    },
    [
      myUserId,
      i18nResolver,
      handleReplyBySwipe,
      handleLongPressMessage,
      handleScrollToReplyTarget,
      handleRetrySend,
    ],
  );

  const isEmptyList = messagesWithSeparators.length === 0;
  // marginRight REVEAL_MAX: satırlar liste genişliğinde (ekran + reveal şeridi) —
  // footer/empty içerikleri EKRAN alanında hizalansın.
  const listTyping = useMemo(
    () =>
      isEmptyList ? null : (
        <View style={{ marginRight: REVEAL_MAX }}>
          <ChatTypingRow conversationId={conversationId} myUserId={myUserId} />
        </View>
      ),
    [isEmptyList, conversationId, myUserId],
  );
  const listEmpty = useMemo(
    () => (
      <View style={{ marginRight: REVEAL_MAX }}>
        {loadingHistory ? (
          <MessageSkeleton />
        ) : (
          <ChatEmptyState partnerName={partner?.displayName} isActive={isActive} />
        )}
      </View>
    ),
    [loadingHistory, partner?.displayName, isActive],
  );

  const quotaLocked =
    !quota?.isUnlimited &&
    (quota?.requiresPremium ||
      (quota?.remainingMessages != null && quota.remainingMessages <= 0));

  const { colors: headerMaskColors, locations: headerMaskLocations } = useMemo(
    () =>
      easeGradient({
        colorStops: {
          0: { color: "rgba(0,0,0,0.99)" },
          0.5: { color: "black" },
          1: { color: "transparent" },
        },
      }),
    [],
  );

  return (
    <View className="flex-1 bg-bg">
      {/* Header overlay (progressive blur) */}
      <View
        pointerEvents="box-none"
        style={{ position: "absolute", top: 0, left: 0, right: 0, zIndex: 10 }}
      >
        <View style={StyleSheet.absoluteFill} pointerEvents="none">
          <MaskedView
            maskElement={
              <LinearGradient
                locations={headerMaskLocations as any}
                colors={headerMaskColors as any}
                style={StyleSheet.absoluteFill}
              />
            }
            style={StyleSheet.absoluteFill}
          >
            <LinearGradient
              colors={["black", "rgba(0, 0, 0, 0.2)"]}
              style={StyleSheet.absoluteFill}
            />
            <BlurView
              intensity={15}
              tint={
                Platform.OS === "ios"
                  ? "systemChromeMaterialDark"
                  : "systemMaterialDark"
              }
              style={StyleSheet.absoluteFill}
            />
          </MaskedView>
        </View>

        <View style={{ paddingTop: insets.top, paddingBottom: 30 }}>
          <ChatHeader
            partner={partner}
            onAvatarPress={openPartnerProfile}
            onBack={() => navigation.goBack()}
            onMenu={() => {
              Keyboard.dismiss();
              setOptionsOpen(true);
            }}
          />
        </View>
      </View>

      {/* iOS'ta KeyboardGestureArea YOK (çalışan eski build'deki gibi): 1.22.x'in
          iOS tarafındaki InvisibleInputAccessoryView makinesi (statik 66pt offset,
          responder swizzle, event-drop pencereleri) interactive dismiss'i parmaktan
          koparıp donduruyordu. iOS'ta interactive dismiss zaten native
          (keyboardDismissMode="interactive"). Android'de KGA gerekli — orada kalır. */}
      {Platform.OS === "android" ? (
        <KeyboardGestureArea
          interpolator="ios"
          offset={INPUT_BAR_OPAQUE}
          textInputNativeID="chat-input"
          style={{ flex: 1 }}
        >
          <ChatMessageList
            listRef={listRef}
            data={messagesWithSeparators}
            keyExtractor={keyExtractor}
            renderItem={renderItem}
            revealX={revealX}
            listGesture={listGesture}
            contentInsetEndAdjustment={contentInsetEndAdjustment}
            freeze={kbFreeze}
            keyboardOffset={insets.bottom}
            contentContainerStyle={listContentContainerStyle}
            onScrollBeginDrag={handleScrollBeginDrag}
            onMomentumScrollBegin={handleMomentumBegin}
            onMomentumScrollEnd={handleMomentumEnd}
            onStartReached={loadMoreOlder}
            onLoad={handleListLoad}
            ListEmptyComponent={listEmpty}
            ListFooterComponent={listTyping}
          />
          {/* box-none: composer'ın şeffaf gradient bandı dokunuşu yutmasın —
              altındaki son balon basılı-tutmayı alsın (MessageComposer'da eş çift). */}
          <KeyboardStickyView
            offset={inputKbOffset}
            pointerEvents="box-none"
            style={{ position: "absolute", bottom: 0, left: 0, right: 0 }}
          >
            <MessageComposer
              composerRef={composerRef}
              inputRef={composerInputRef}
              onComposerLayout={onComposerLayout}
              replyTo={replyTo}
              onCancelReply={handleCancelReply}
              onSend={handleInputSend}
              onTypingChange={handleTypingChange}
              disabled={!isActive}
              quotaLocked={quotaLocked}
              onLockedPress={handleLockedPress}
            />
          </KeyboardStickyView>
        </KeyboardGestureArea>
      ) : (
        <View style={{ flex: 1 }}>
          <ChatMessageList
            listRef={listRef}
            data={messagesWithSeparators}
            keyExtractor={keyExtractor}
            renderItem={renderItem}
            revealX={revealX}
            listGesture={listGesture}
            contentInsetEndAdjustment={contentInsetEndAdjustment}
            freeze={kbFreeze}
            keyboardOffset={insets.bottom}
            contentContainerStyle={listContentContainerStyle}
            onScrollBeginDrag={handleScrollBeginDrag}
            onMomentumScrollBegin={handleMomentumBegin}
            onMomentumScrollEnd={handleMomentumEnd}
            onStartReached={loadMoreOlder}
            onLoad={handleListLoad}
            ListEmptyComponent={listEmpty}
            ListFooterComponent={listTyping}
          />
          {/* box-none: bkz. Android dalı — şeffaf gradient bandı dokunuşu geçirir. */}
          <KeyboardStickyView
            offset={inputKbOffset}
            pointerEvents="box-none"
            style={{ position: "absolute", bottom: 0, left: 0, right: 0 }}
          >
            <MessageComposer
              composerRef={composerRef}
              inputRef={composerInputRef}
              onComposerLayout={onComposerLayout}
              replyTo={replyTo}
              onCancelReply={handleCancelReply}
              onSend={handleInputSend}
              onTypingChange={handleTypingChange}
              disabled={!isActive}
              quotaLocked={quotaLocked}
              onLockedPress={handleLockedPress}
            />
          </KeyboardStickyView>
        </View>
      )}

      {/* Giriş skeleton overlay'i: LegendList yerleşimi oturana (onLoad) kadar
          listenin gizli fazını örter. Header overlay'in (zIndex 10) ALTINDA kalır
          ki progressive blur skeleton üstünde de görünsün. */}
      {showEntrySkeleton && (
        <View
          pointerEvents="none"
          className="bg-bg"
          style={{
            position: "absolute",
            top: 0,
            left: 0,
            right: 0,
            bottom: 0,
            zIndex: 5,
            paddingTop: insets.top + HEADER_CONTENT,
            paddingBottom: INPUT_BAR_OPAQUE + insets.bottom + 8,
            justifyContent: "flex-end",
          }}
        >
          <MessageSkeleton count={8} />
        </View>
      )}

      <MessageActionSheet
        visible={!!actionTarget}
        message={actionTarget}
        layout={actionLayout}
        isOwn={actionTarget?.senderId === myUserId}
        onClose={handleActionSheetClose}
        onPickReaction={(emoji: string) => handlePickReaction(actionTarget, emoji)}
        onReply={() => handleReply(actionTarget)}
        onEdit={() => handleEditStart(actionTarget)}
        onDelete={(forEveryone: boolean) => handleDelete(actionTarget, forEveryone)}
      />
      <ConversationOptionsSheet
        visible={optionsOpen}
        onClose={() => setOptionsOpen(false)}
        isActive={isActive}
        canRestore={!isActive}
        onUnmatch={handleUnmatch}
        onRestore={handleRestore}
        onReport={() => setReportOpen(true)}
        onBlock={handleBlock}
      />
      <ReportModal
        visible={reportOpen}
        onClose={() => setReportOpen(false)}
        reportedUserId={partner?.userId}
        conversationId={conversationId}
      />
      <EditMessageModal
        target={editTarget}
        text={editText}
        onChangeText={setEditText}
        onCancel={() => setEditTarget(null)}
        onSave={handleEditSave}
      />
      <PreviewModal
        visible={profileVisible}
        onClose={() => {
          setProfileVisible(false);
          setProfileDetail(null);
        }}
        profile={profileDetail}
      />
      <PurchaseModal
        visible={purchaseVisible}
        onClose={() => {
          setPurchaseVisible(false);
          // Premium alınmış olabilir — kota durumunu authoritative tazele.
          dispatch(fetchChatQuota({ conversationId, force: true }));
        }}
      />
    </View>
  );
}

function ChatHeader({ partner, onBack, onMenu, onAvatarPress }: any) {
  const { t } = useTranslation();
  const displayName = partner?.displayName || t("chat.defaultUserName");
  return (
    <View
      style={{
        position: "relative",
        flexDirection: "row",
        alignItems: "center",
        justifyContent: "center",
        paddingHorizontal: 12,
        paddingVertical: 8,
        // Sabit yükseklik (minHeight DEĞİL): pill/buton ölçümleri asenkron
        // geldiğinde satır büyüyüp blur bölgesini ve avatarı oynatmasın.
        height: HEADER_CONTENT,
      }}
    >
      {/* Host'larda matchContents YOK: SwiftUI ölçümü ikinci Fabric commit'inde
          geldiği için butonlar ilk frame'de 0x0 anchor'dan taşarak yanlış yerde
          çiziliyordu ("kenardan ışınlanma"). Sabit 44x44 → Yoga boyutu İLK
          commit'te bilir; içerideki frame(44,44) modifier'ı birebir dolduruyor. */}
      <View style={{ position: "absolute", left: 24, top: 8 }}>
        {Platform.OS === "ios" ? (
          <Host style={{ width: 44, height: 44 }}>
            <SwiftUIButton
              label={t("common.back")}
              systemImage="chevron.left"
              onPress={onBack}
              modifiers={[
                buttonStyle("glass"),
                tint(colors.text),
                controlSize("large"),
                labelStyle("iconOnly"),
                font({ size: 22, weight: "semibold" }),
                frame({ width: 44, height: 44 }),
                ...glassFallback({ shape: "circle" }),
              ]}
            />
          </Host>
        ) : (
          <TouchableOpacity onPress={onBack} hitSlop={10} className="p-2">
            <SFIcon name="chevron.left" fallback={ChevronLeft} size={26} color={colors.text} />
          </TouchableOpacity>
        )}
      </View>

      <View style={{ alignItems: "center", maxWidth: "60%" }}>
        {/* entering animasyonu YOK: ZoomIn spring her girişte ~450ms boyunca
            "elemanlar sonradan yerine oturuyor" algısını besliyordu; header ilk
            frame'den nihai geometrisinde durmalı. */}
        <TouchableOpacity
          activeOpacity={0.85}
          onPress={onAvatarPress}
          disabled={!onAvatarPress}
          accessibilityRole="button"
          accessibilityLabel={displayName}
        >
          {partner?.profileImageUrl ? (
            <Image
              source={{ uri: partner.profileImageUrl }}
              style={{ width: 65, height: 65, borderRadius: 999 }}
              cachePolicy="memory-disk"
              transition={100}
              contentFit="cover"
            />
          ) : (
            <View
              style={{
                width: 65,
                height: 65,
                borderRadius: 999,
                backgroundColor: colors.surface3,
                alignItems: "center",
                justifyContent: "center",
              }}
            >
              <Text className="text-white font-bold">
                {displayName.charAt(0).toUpperCase()}
              </Text>
            </View>
          )}
        </TouchableOpacity>

        <View style={{ marginTop: 6 }}>
          {Platform.OS === "ios" ? (
            /* Yükseklik SABİT (dikey matchContents kapalı): pill'in asenkron ölçümü
               header yüksekliğini ilk paint'ten sonra büyütüp (~88→113) blur bölgesini
               oynatıyordu. Genişlik içerikten gelir (yatay matchContents) ve ortalanmış
               kolonda merkezden simetrik büyür — kenardan kayma görüntüsü vermez. */
            <Host style={{ height: PILL_H }} matchContents={{ horizontal: true }}>
              <SwiftUIText
                modifiers={[
                  padding({ horizontal: 10, vertical: 4 }),
                  glassEffect({ glass: { variant: "regular" }, shape: "capsule" }),
                  foregroundStyle(colors.text),
                  font({ size: 13, weight: "semibold" }),
                ]}
              >
                {displayName}
              </SwiftUIText>
            </Host>
          ) : (
            <BlurView
              intensity={50}
              tint="dark"
              style={{
                borderRadius: 999,
                overflow: "hidden",
                paddingHorizontal: 12,
                paddingVertical: 4,
              }}
            >
              <Text
                numberOfLines={1}
                style={{
                  color: colors.text,
                  fontSize: 13,
                  fontWeight: "600",
                  maxWidth: 140,
                }}
              >
                {displayName}
              </Text>
            </BlurView>
          )}
        </View>
      </View>

      <View style={{ position: "absolute", right: 24, top: 8 }}>
        {Platform.OS === "ios" ? (
          <Host style={{ width: 44, height: 44 }}>
            <SwiftUIButton
              label={t("common.menu")}
              systemImage="ellipsis"
              onPress={onMenu}
              modifiers={[
                buttonStyle("glass"),
                controlSize("large"),
                tint(colors.text),
                labelStyle("iconOnly"),
                font({ size: 20, weight: "semibold" }),
                frame({ width: 44, height: 44 }),
                ...glassFallback({ shape: "circle" }),
              ]}
            />
          </Host>
        ) : (
          <TouchableOpacity hitSlop={10} className="p-2" onPress={onMenu}>
            <SFIcon name="ellipsis" fallback={MoreVertical} size={22} color={colors.textSecondary} />
          </TouchableOpacity>
        )}
      </View>
    </View>
  );
}

function EditMessageModal({ target, text, onChangeText, onCancel, onSave }: any) {
  const { t } = useTranslation();
  if (!target) return null;
  return (
    <Modal visible transparent animationType="fade" onRequestClose={onCancel}>
      <Pressable
        onPress={onCancel}
        style={{
          flex: 1,
          backgroundColor: "rgba(0,0,0,0.6)",
          justifyContent: "center",
          paddingHorizontal: 24,
        }}
      >
        <Pressable onPress={() => {}} className="bg-surface-2 rounded-2xl p-4">
          <View className="flex-row items-center justify-between mb-3">
            <Text className="text-white font-semibold text-base">
              {t("chat.editMessage.title")}
            </Text>
            <TouchableOpacity onPress={onCancel} hitSlop={6}>
              <SFIcon name="xmark" fallback={X} size={20} color={colors.textSecondary} />
            </TouchableOpacity>
          </View>
          <TextInput
            value={text}
            onChangeText={onChangeText}
            multiline
            autoFocus
            maxLength={2000}
            className="text-white text-base bg-bg-deep rounded-xl p-3"
            style={{ minHeight: 80, maxHeight: 160, textAlignVertical: "top" }}
            placeholderTextColor={colors.textMuted}
          />
          <Text className="text-gray-500 text-xs mt-2">
            {t("chat.editMessage.info")}
          </Text>
          <View className="flex-row justify-end mt-3">
            <TouchableOpacity onPress={onCancel} className="px-4 py-2 mr-2">
              <Text className="text-gray-400">{t("common.cancel")}</Text>
            </TouchableOpacity>
            <TouchableOpacity
              onPress={onSave}
              className="px-4 py-2 rounded-full"
              style={{ backgroundColor: colors.primary }}
            >
              <Text className="text-white font-semibold">{t("common.save")}</Text>
            </TouchableOpacity>
          </View>
        </Pressable>
      </Pressable>
    </Modal>
  );
}

function ChatEmptyState({ partnerName, isActive }: any) {
  const { t } = useTranslation();
  return (
    <View
      style={{
        alignItems: "center",
        justifyContent: "center",
        paddingVertical: 60,
        paddingHorizontal: 32,
      }}
    >
      <Text style={{ fontSize: 36, marginBottom: 12 }}>👋</Text>
      <Text className="text-white text-lg font-bold text-center">
        {isActive
          ? t("chat.emptyState.activeTitle", {
              partnerName: partnerName || t("chat.defaultUserName"),
            })
          : t("chat.emptyState.closedTitle")}
      </Text>
      <Text className="text-gray-400 text-sm text-center mt-2">
        {isActive
          ? t("chat.emptyState.activeDescription")
          : t("chat.emptyState.closedDescription")}
      </Text>
    </View>
  );
}

export default ChatScreen;
