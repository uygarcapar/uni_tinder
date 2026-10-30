import { memo, useEffect, useCallback, useMemo, useRef, useState } from "react";
import { useTranslation } from "react-i18next";
import {
  View,
  Text,
  TouchableOpacity,
  TouchableHighlight,
  TextInput,
  Alert,
  StyleSheet,
  InteractionManager,
  useWindowDimensions,
} from "react-native";
import { Image } from "expo-image";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import Animated, {
  ZoomIn,
  ZoomOut,
  useSharedValue,
  useAnimatedScrollHandler,
  useAnimatedStyle,
  withTiming,
  type SharedValue,
} from "react-native-reanimated";
import { BlurView } from "expo-blur";
import MaskedView from "@react-native-masked-view/masked-view";
import { LinearGradient } from "expo-linear-gradient";
import { easeGradient } from "react-native-easing-gradient";
import { useAppDispatch, useAppSelector } from "@/shared/hooks/redux";
import { useNavigation, useFocusEffect } from "@react-navigation/native";
import {
  MessageCircle,
  Camera as CameraIcon,
  Mic,
  Video,
  Search,
  X,
  ChevronLeft,
} from "@/shared/icons";
import SFIcon, { type SFSymbol } from "@/shared/components/SFIcon";
import {
  fetchConversations,
  setActiveConversation,
  fetchHistory,
  conversationDeactivated,
  conversationRestored,
} from "@/features/chat/chatSlice";
import chatService, { HISTORY_PAGE_SIZE } from "@/features/chat/chatService";
import { useDrafts } from "@/features/chat/draftStore";
import {
  formatVoiceDuration,
  isVoiceMessage,
} from "@/features/chat/voiceMessage";
import { contentTypeToNumber } from "@/features/chat/contentType";
import { conversationMatchesQuery } from "@/features/chat/conversationSearch";
import { foldTr } from "@/shared/utils/foldTr";
import {
  formatRestoreWindow,
  resolveClosedByMe,
  shouldOfferRestore,
} from "@/features/chat/restoreWindow";
import ConversationOptionsSheet from "@/features/chat/components/ConversationOptionsSheet";
import ReportModal from "@/shared/components/ReportModal";
import moderationService from "@/shared/services/moderationService";
import { showInfoToast } from "@/shared/services/toaster";
import { chatErrorText } from "@/shared/constants/responseCodes";
import { parseUtc } from "@/shared/utils/dateUtc";
import formatRelativeTime from "@/shared/utils/formatRelativeTime";
import {
  hydrateConversation,
  readVoiceDurationsFromLocal,
} from "@/features/chat/chatHydrate";
import { debugLastMessageRows, searchMessages } from "@/features/chat/chatRepository";
import {
  prepareSearchQuery,
  highlightSegments,
  SEARCH_DEBOUNCE_MS,
  type MessageSearchHit,
} from "@/features/chat/messageSearch";
import EmptyState from "@/shared/components/EmptyState";
// Ekran kromunun mod vurgusu (gerekçe `accent`in yanında).
import { useAppMode } from "@/features/discover/useAppMode";
import { modeAccent } from "@/features/discover/modeTheme";
import type PagerView from "react-native-pager-view";
import PagerTabBar, {
  AnimatedPagerView,
  usePagerScrollHandler,
  usePagerTabCommit,
} from "@/shared/components/PagerTabBar";
import ScreenHeader, {
  SCREEN_HEADER_TITLE_HEIGHT,
} from "@/shared/components/ScreenHeader";
import AnimatedPressable from "@/shared/components/AnimatedPressable";
// Çubuğun yüksekliği seçici sheet'lerinin arama kapsülüyle ORTAK sabitten
// geliyor (bkz. SheetSearchInput): o kapsül bu çubuğun kopyası, iki yerde ayrı
// sayı tutulduğunda modalla sohbet arası geçişte çubuk görünür şekilde zıplıyor.
import { SEARCH_BAR_HEIGHT } from "@/shared/components/SheetSearchInput";
import { openLitPlus } from "@/features/profile/litPlusEntry";
import { usePremiumTier } from "@/features/profile/premiumTier";
import { colors, ink, veil } from "../../../shared/theme/colors";
import { chromeBlurTint } from "@/shared/theme/blur";

// Native bottom tab bar ölçüleri — DiscoverScreen ile aynı değerler.
const TAB_BAR_HEIGHT = 64;
const TAB_BAR_BOTTOM_GAP = -10;
const LIST_BOTTOM_GAP = 16;

/**
 * Mesaj sonuçları — Task 4. Sabit tavan (top-N), SAYFALANMIYOR: `searchMessages`
 * `limit`/`offset` destekliyor ama global arşiv araması pratikte ilk ekrana
 * sığan sonuç kadarıyla ilgilenir (kullanıcı daha dar bir sonuç istiyorsa
 * sorguyu daraltır) — ikinci bir "daha fazla yükle" UI'ı bu fazın kapsamı
 * DIŞINDA (YAGNI). Sayı sohbet listesinin görünür satır sayısıyla aynı
 * mertebede, ekranı doldurmaya yeter.
 */
const MESSAGE_SEARCH_LIMIT = 20;

/**
 * `searchMessages` SQLite'a vuran, tüm arşivi tarayan senkron bir sorgu (bkz.
 * chatRepository.searchMessages'ın FTS/LIKE yorumu) — `conversationsByTab`ın
 * bellek-içi `includes`ı gibi HER TUŞ VURUŞUNDA çalıştırılamaz. `SEARCH_DEBOUNCE_MS`
 * (messageSearch.ts — ChatScreen'in sohbet-içi aramasıyla PAYLAŞILAN tek
 * kaynak, bkz. orada "review turu 1" yorumu) 220ms yazı temposunun arasına
 * sığacak kadar kısa (art arda tuşlarda SQL hiç tetiklenmez), kullanıcının
 * "yazmayı bıraktım" anını kaçıracak kadar uzun değil.
 */
const MESSAGE_SEARCH_DEBOUNCE_MS = SEARCH_DEBOUNCE_MS;

/**
 * Pager'ın anlık konumundan sürülen yatay kayma — üç sayfalık bir şeridi
 * sayfalarla birlikte taşır (`offset` tam sayı değil: 0.0 → 0.42 → 1.0).
 *
 * Saf `transform`: her karede çalıştığı için layout'a dokunan hiçbir şey
 * kullanılmıyor (bkz. PagerTabBar'daki alt çizginin aynı gerekçesi).
 *
 * Hook olmasının sebebi bir `useAnimatedStyle` sonucunun TEK view'e bağlanması:
 * başlık şeridi ile arama şeridi ayrı çağrılar olmak zorunda.
 */
function usePagerSlide(offset: SharedValue<number>, pageWidth: number) {
  return useAnimatedStyle(
    () => ({ transform: [{ translateX: -offset.value * pageWidth }] }),
    [pageWidth],
  );
}

/**
 * Diskten süre okuması "bilmiyorum" dediğinde tekrar denemeden önceki bekleme.
 *
 * Amacı tek: "bilmiyorum" cevabını KALICI yapmamak (gerekçe
 * localVoiceCacheRef). Süre kısa, çünkü bu değeri diske yazan şey (delta turu)
 * genelde ilk render'dan bir-iki saniye sonra tamamlanıyor; uzun tutmak sürenin
 * görünmesini o kadar geciktirirdi. Kısa tutmanın bedeli de sınırlı: tur başına
 * yalnız SÜRESİ BİLİNMEYEN sohbet kadar, indeksli tek satırlık okuma.
 */
const VOICE_MISS_RETRY_MS = 1500;

/**
 * Yalnız `__DEV__`: süre çözülemediğinde arşivin o sohbet için ne tuttuğunu
 * yazar — anahtar başına BİR kez (yoksa her dispatch'te konuşur).
 *
 * Dört olası sebebi ayırmak için var (bkz. debugLastMessageRows): satır yok /
 * damga uzak / tip yanlış / süre null. Cihazda tek koşumda cevap veriyor.
 */
const voiceMissLogged = new Set<string>();
function logVoiceDurationMiss(conversationId: string, lastMessageAtMs: number) {
  const key = `${conversationId}:${lastMessageAtMs}`;
  if (voiceMissLogged.has(key)) return;
  voiceMissLogged.add(key);
  try {
    const rows = debugLastMessageRows(conversationId);
    console.log(
      `[messages] ses süresi çözülemedi · conv=${conversationId} · convAt=${lastMessageAtMs} · ` +
        `arşiv=${JSON.stringify(rows)}`,
    );
  } catch (error) {
    console.log(`[messages] ses süresi çözülemedi · conv=${conversationId} · arşiv okunamadı:`, error);
  }
}

export default function MessagesScreen() {
  const { t } = useTranslation();
  const dispatch = useAppDispatch();
  const navigation = useNavigation();
  const insets = useSafeAreaInsets();
  // Başlık/arama şeridinin bir sayfası tam ekran genişliğinde — kayma miktarı
  // pager'ın sayfa genişliğiyle BİREBİR olmalı, yoksa üstteki blok sayfalardan
  // hızlı/yavaş kayar. Sabit değil hook: dönme ve iPad split view'da değişiyor.
  const { width: SCREEN_W } = useWindowDimensions();

  /**
   * Ekrandaki dolgulu yüzeylerin rengi — başlıktaki Plus pill'i, satırdaki
   * "Sınırlı" rozeti ve boş durumun "Eşleşme bul" CTA'sı.
   *
   * Liste 2026-10-21'den beri SEÇİLİ MODUN sohbetlerini gösteriyor (eşleşme
   * mod başına, bkz. `modeConversations`), yani ekrandaki her satır zaten bu
   * modun — rengin satır başına çözülmesine gerek yok. Modu BİLİNMEYEN satır
   * (eski sunucu / yerel olarak açılmış) iki modda da görünüyor ve o modun
   * rengini alıyor; alternatifi satır başına iki ayrı renk taşımaktı, ki
   * "Sınırlı" rozeti bir KOTA işareti, mod işareti değil.
   */
  const { mode: selectedMode } = useAppMode();
  const accent = modeAccent(selectedMode);

  // Alan-bazlı seç: chat bucket'ı olarak seçince Immer her chat dispatch'inde
  // yeni bucket referansı üretiyor ve MessagesScreen alakasız her mesaj/typing/
  // quota olayında rerender oluyordu.
  const conversations = useAppSelector((s) => (s as any).chat.conversations);
  // Boş durumun kapısı "yükleniyor mu" DEĞİL, "en az bir sonuç aldık mı".
  // conversationsLoading başlangıçta false ve fetch useFocusEffect'ten (commit
  // sonrası) dispatch ediliyor → ilk frame boş liste + loading:false ile boyanıp
  // boş durumu bir anlığına parlatıyordu. Damga/hata ölçütü AppNavigator'ın
  // boot-settle ölçütüyle aynı: fetch reddedilirse ekran sonsuza kadar boş
  // kalmasın. Bir kez settle olduktan sonra loading'e BAKMIYORUZ — her odak
  // tazelemesinde boş durumun sönüp yanması ikinci bir flash olurdu.
  //
  // YEREL damga da settle sayılıyor (açılışta diskten okunan liste — bkz.
  // chatSlice.hydrateConversations): gerçekten hiç sohbeti olmayan kullanıcı
  // boş durumu ağ beklemeden görüyor. Ters yönde yanılma riski yok, çünkü
  // satırı olan kullanıcıda liste zaten dolu geliyor ve boş durum hiç çizilmiyor.
  const conversationsSettled = useAppSelector(
    (s) =>
      ((s as any).chat._conversationsFetchedAt ?? 0) > 0 ||
      ((s as any).chat._conversationsHydratedAt ?? 0) > 0 ||
      !!(s as any).chat.conversationsError,
  );
  const typingByConv = useAppSelector((s) => (s as any).chat.typingByConv);
  // typingByConv referansı herhangi bir konuşmada typing on/off olduğunda değişir.
  // Bunu primitive boolean map'e indirgeyerek satırlara primitive prop geçiriyoruz
  // → React.memo default shallowEqual, isTyping değişmemişse satırı skip eder.
  const isTypingByConvId = useMemo(() => {
    const m: Record<string, boolean> = {};
    for (const cid in typingByConv || {}) {
      m[cid] = Object.keys(typingByConv[cid] || {}).length > 0;
    }
    return m;
  }, [typingByConv]);

  // "Sınırlı" rozetinin TEK kaynağı: liste satırının kendi `isUnlimited`i
  // (bkz. ConversationListItemDto) — /quota uçundakiyle aynı anlam, artık her
  // satırda geliyor. Bu yüzden ekranın ayrı bir kota çağrısı ya da
  // `quotaByConv` yedeği YOK: orası yalnız AÇILMIŞ sohbetler için dolan,
  // persist edilmeyen kısmi bir kaynaktı (ChatScreen girişte doldurur) ve her
  // kota fetch'i/yerel düşümünde referansı değiştiği için tüm listeyi boşuna
  // yeniden hesaplatıyordu.
  //
  // Üç durumlu okunuyor: `false` → rozet, `true` → yok, `undefined` →
  // BİLMİYORUZ → rozet ÇİZİLMEZ. Alanı taşımayan bayat bir yanıtta sessiz
  // kalmak doğru yön: yanlış negatif (sınırlı sohbete rozet basmamak) sadece
  // bilgi eksiği, yanlış pozitif (premium sohbete "Sınırlı" demek) hata.
  //
  // Kendimiz premium'sak kural gereği (bkz. chatSlice.normalizeQuota) hiçbir
  // sohbet sınırlı olamaz → hiç dolaşmıyoruz. Bu aynı zamanda bayat bir
  // `isUnlimited: false`ın satın alma sonrası rozeti asılı bırakmasını da
  // engelliyor.
  // `resolved` ROZET için değil, başlığın yanındaki upsell pill'i için gerekli:
  // slice persist edilmediğinden reload'da premium kullanıcı da bir an
  // `isPremium:false` doğuyor ve o pencerede pill çizilip hemen kaybolurdu —
  // premium'a premium satmak en pahalı yanılma yönü (bkz. premiumTier).
  const { isPremium, resolved: premiumResolved } = usePremiumTier();
  // typingByConv ile aynı gerekçe: satırlara primitive boolean iniyor ki memo'lu
  // ConversationRow'lar alakasız değişimlerde render etmesin.
  const isLimitedByConvId = useMemo(() => {
    const m: Record<string, boolean> = {};
    if (isPremium) return m;
    for (const c of conversations || []) {
      if (c.isUnlimited === false) m[c.conversationId] = true;
    }
    return m;
  }, [conversations, isPremium]);

  // Son mesaj sesliyse satırda süresi de yazıyor — ama süre sohbet listesi
  // DTO'sunda YOK (ConversationListItemDto yalnız preview/at/contentType
  // taşıyor). Kaynak sırası (ilk tutan kazanır):
  //   1. liste DTO'su — sunucu bir gün gönderirse hiçbir çıkarıma gerek kalmaz
  //   2. Redux bucket'ı — oturum içinde en taze (optimistic balon, canlı mesaj)
  //   3. YEREL ARŞİV (SQLite) — soğuk açılışın tek kaynağı
  //   4. hedefli history tazelemesi (aşağıdaki effect) — son çare, ağ
  const messagesByConv = useAppSelector((s) => (s as any).chat.messagesByConv);
  // (3) için küçük bir not defteri: anahtar `conversationId:lastMessageAt`,
  // değer diskten okunan süre. Amacı tekrar tekrar SQL koşmamak — memo her chat
  // dispatch'inde (typing, receipt, reaction) yeniden hesaplanıyor; sohbetin son
  // mesajı değişmedikçe cevap da değişmez. Render sırasında yazılıyor ama saf:
  // aynı anahtar her zaman aynı değeri taşır.
  //
  // ── KAÇIRILAN OKUMA (0) KALICI OLAMAZ ──────────────────────────────────────
  // "Disk de bilmiyor" cevabını süresiz saklamak, süreyi KALICI olarak boş
  // bırakıyordu. Senaryo soğuk açılışta olağan:
  //   1. liste diskten doğuyor → eski son mesajın damgası
  //   2. /conversations dönüyor → damga sesli mesaja kayıyor, satır "🎤 Sesli
  //      mesaj" oluyor. Ama arşivde o mesaj HENÜZ YOK: onu getiren delta turu
  //      (`/messages/changes`) hub bağlandıktan sonra tamamlanıyor.
  //   3. memo yeni anahtarla diski okuyor → bulamıyor → 0'ı yazıyor
  //   4. delta turu mesajı diske yazıyor, `conversations` tazeleniyor ama
  //      ANAHTAR AYNI (son mesaj değişmedi) → bir daha okunmuyor
  // Kullanıcının gördüğü: sohbete girip çıkana kadar süre gelmiyor — çünkü
  // sohbete girmek bucket'ı dolduruyor ve (2) bu defteri hiç sormuyor.
  //
  // Çözüm: POZİTİF cevap kalıcı (bir mesajın süresi değişmez), KAÇIRILAN cevap
  // kısa ömürlü. Böylece hem SQL her dispatch'te koşmuyor hem de arşiv dolunca
  // sonraki dispatch'te (delta/fetch zaten bir tane üretiyor) süre kendiliğinden
  // yerine oturuyor.
  const localVoiceCacheRef = useRef(new Map<string, { ms: number; at: number }>());
  // typingByConv ile aynı gerekçe: satırlara PRIMITIVE iniyor (yalnız süre),
  // böylece memo'lu ConversationRow alakasız değişimde render etmiyor. Kutu
  // referansı her mesaj dispatch'inde değişiyor ama zaten `conversations` da
  // değişiyor — ekran o yüzden fazladan render almıyor.
  const voiceDurationByConvId = useMemo(() => {
    const m: Record<string, number> = {};
    const cache = localVoiceCacheRef.current;
    const now = Date.now();
    const fromDisk: { conversationId: string; lastMessageAtMs: number; key: string }[] =
      [];

    for (const c of conversations || []) {
      // ⚠️ `lastMessageContentType`e BAKILMIYOR — bilerek. Süre yalnız sesli
      // mesajda dolduğu için mesajın kendi tipi zaten yeterli kanıt, üstelik
      // liste DTO'sundaki alan (satırın ikon/etiket seçiminde kullandığı)
      // eksik ya da isim ("Voice") olarak gelebiliyor; ona kapı yapmak süreyi
      // sessizce hiç çözmemek demekti.
      if (c.lastMessageDurationMs > 0) {
        m[c.conversationId] = c.lastMessageDurationMs;
        continue;
      }
      const convAt = c.lastMessageAt ? parseUtc(c.lastMessageAt).getTime() : 0;
      const msgs = messagesByConv?.[c.conversationId]?.messages;
      // Mesajı DAMGADAN buluyoruz, "bucket'ın ilk elemanı" varsayımıyla değil:
      // ilk sırada silinmiş bir satır olabiliyor ve bucket satırdan eski
      // olabiliyor (uygulama kapalıyken gelen mesaj — liste DTO'su güncel,
      // bucket değil). Damga tutmuyorsa süre ÇÖZÜLMEMİŞ sayılır: başka bir
      // sesli mesajın süresini yazmak yanlış bilgi olur.
      const last = !msgs?.length
        ? undefined
        : convAt
          ? msgs.find((msg: any) => {
              if (msg.deletedAt) return false;
              const at = msg.sentAt ? parseUtc(msg.sentAt).getTime() : 0;
              // 1sn tolerans: optimistic balonun yerel damgası ile sunucununki
              // birebir aynı olmayabiliyor.
              return at > 0 && Math.abs(at - convAt) <= 1000;
            })
          : // Damga yoksa (eski/eksik satır) en yeni mesaja düş: bucket
            // newest-first (bkz. ChatScreen'in `.reverse()`i).
            msgs.find((msg: any) => !msg.deletedAt);
      if (last && isVoiceMessage(last.contentType) && last.durationMs > 0) {
        m[c.conversationId] = last.durationMs;
        continue;
      }

      // (3) Yerel arşiv. Bucket boş olmak kuraldışı DEĞİL, KURAL: bucket artık
      // persist edilmiyor (CHAT_PERSIST_ENABLED=false), yani soğuk açılışta
      // hiçbir sohbetin mesajı bellekte yok. Süre ise diskte duruyor — her
      // mesaj yazımı (realtime, delta-sync) duration_ms kolonuna düşüyor.
      const key = `${c.conversationId}:${c.lastMessageAt ?? ""}`;
      const cached = cache.get(key);
      if (cached) {
        if (cached.ms > 0) {
          m[c.conversationId] = cached.ms;
          continue;
        }
        // Kaçırılan okuma: TTL dolmadıysa tekrar sorma, dolduysa yeniden dene.
        if (now - cached.at < VOICE_MISS_RETRY_MS) continue;
      }
      fromDisk.push({
        conversationId: c.conversationId,
        lastMessageAtMs: convAt,
        key,
      });
    }

    if (fromDisk.length) {
      const read = readVoiceDurationsFromLocal(fromDisk);
      for (const q of fromDisk) {
        const ms = read[q.conversationId] ?? 0;
        cache.set(q.key, { ms, at: now });
        if (ms > 0) m[q.conversationId] = ms;
        else if (__DEV__) logVoiceDurationMiss(q.conversationId, q.lastMessageAtMs);
      }
    }
    return m;
    // `now` KASTEN bağımlılık değil: TTL'in amacı yeniden hesaplamayı TETİKLEMEK
    // değil, bir sonraki hesaplamada tekrar denemeye izin vermek. Tetikleyici
    // zaten var — delta turu ve /conversations ikisi de dispatch üretiyor.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [conversations, messagesByConv]);

  // SON ÇARE: süresi ne listeden, ne bellekten, ne de diskten çözülemeyen
  // sesli sohbetler için HEDEFLİ history tazelemesi.
  //
  // Yerel arşiv geldikten sonra bu dal neredeyse hiç çalışmıyor; kaldığı tek
  // senaryo "mesaj arşive HİÇ girmemiş" olması: yeni kurulum / logout sonrası
  // (delta-sync watermark'ı sıfırdan başlıyor, eski mesajlar hiç inmiyor) ya da
  // sohbet hiç açılmamışken watermark'ın reddedilmesi.
  //
  // Ölçek: yalnız SON MESAJI SESLİ ve süresi bilinmeyen sohbetler; her sohbet
  // için (conversationId + lastMessageAt) başına TEK istek — sunucu süreyi
  // döndürmese bile tekrar denenmiyor. Geçiş başına 8'le sınırlı: kalanları
  // bir sonraki geçiş alıyor (bucket değişince bu effect yeniden koşuyor),
  // böylece 40 sohbetlik listede tek karede 40 istek atılmıyor.
  const voiceProbedRef = useRef(new Set<string>());
  useEffect(() => {
    if (!conversations?.length) return;
    let started = 0;
    for (const c of conversations) {
      if (started >= 8) break;
      if (!isVoiceMessage(c.lastMessageContentType)) continue;
      if (voiceDurationByConvId[c.conversationId]) continue;
      const key = `${c.conversationId}:${c.lastMessageAt ?? ""}`;
      if (voiceProbedRef.current.has(key)) continue;
      voiceProbedRef.current.add(key);
      started += 1;
      dispatch(
        fetchHistory({
          conversationId: c.conversationId,
          cursor: null,
          pageSize: HISTORY_PAGE_SIZE,
        }),
      )
        // İstek thunk'ın in-flight guard'ına takıldıysa (aynı sohbete başka bir
        // history fetch'i uçuşta) HİÇ gitmemiştir — damgayı geri al ki bir
        // sonraki geçiş yeniden denesin. Guard'a takılan çağrı store'a hiçbir
        // şey yazmadığı için bu effect kendiliğinden tekrar koşmaz; damga
        // kalsaydı o sohbetin süresi kalıcı olarak boş kalırdı.
        .then((res: any) => {
          if (res?.meta?.condition) voiceProbedRef.current.delete(key);
        })
        .catch(() => voiceProbedRef.current.delete(key));
    }
  }, [conversations, voiceDurationByConvId, messagesByConv, dispatch]);

  // Gönderilmemiş composer metinleri (conversationId → taslak). Redux dışı küçük
  // store'dan geliyor; referansı YALNIZ taslak değişince değişir, satırlara
  // primitive string olarak indiği için memo'lu ConversationRow'lar etkilenmez.
  const drafts = useDrafts();

  const [activeTab, setActiveTab] = useState("all");
  // Satıra basılı tutunca açılan sohbet menüsü — ChatScreen'deki 3 nokta
  // menüsünün AYNISI (ConversationOptionsSheet). Seçili sohbet snapshot olarak
  // tutuluyor: sheet aksiyondan ÖNCE kapandığı için bayatlama penceresi yok.
  const [optionsConv, setOptionsConv] = useState<any>(null);
  // Şikayet sheet'i ayrı state: ConversationOptionsSheet kapanırken açılıyor,
  // iki bottom sheet üst üste binmesin (ChatScreen'deki desenin aynısı).
  const [reportConv, setReportConv] = useState<any>(null);
  // Başlığın yanındaki "Sınırsız mesajlaş" pill'inin açtığı premium sheet'i.
  const [searchQuery, setSearchQuery] = useState("");
  const [isSearchActive, setIsSearchActive] = useState(false);
  // UNCONTROLLED input — value prop'u BİLEREK bağlamıyoruz. Kontrollü TextInput'ta
  // native metin her render'da JS'teki value ile geri yazılır; search açılışında
  // isSearchActive re-render'ı + 280ms açılış animasyonu + scrollToOffset aynı
  // frame'e denk geldiğinde ilk tuş vuruşu bayat value ile eziliyordu ("1 karakter
  // kayıyor"). Native metin tek kaynak; searchQuery yalnız filtre/UI için tutulur,
  // programatik temizleme ref.clear() ile yapılır.
  const searchInputRef = useRef<TextInput>(null);
  // scroll-to-top için FlatList ref'i — search aç/kapa anında listeyi tepeye getirip
  // bar'ın animasyonu ile içeriği aynı yönde hareket ettiriyoruz (mismatch yok).
  const listRef = useRef<any>(null);
  const pagerRef = useRef<PagerView>(null);

  // ⚠️ Aşağıdaki ölçüler `useAnimatedStyle` worklet'lerinden okunuyor; worklet
  // closure'ı OLUŞTURULDUĞU anda yakalanıyor, yani bu sabitler hook'lardan
  // ÖNCE tanımlı olmak zorunda (sonra tanımlanırsa TDZ hatası).
  const CHEVRON_WIDTH = 26;
  const CHEVRON_GAP = 8;
  // Bölüm başlığı satırı — arama çubuğunun ÜSTÜNDE (Beğeniler'de de başlık
  // sekmelerin üstünde duruyor; buradaki fark yalnız arada bir arama çubuğu
  // olması). 33px/700 yazının satırı ~40 + 2.
  // Altındaki boşluğun TAMAMI bu sayı değil: arama satırının kendi üst payı
  // (pt-2 = 8) de ekleniyor → 10.
  // ⚠️ Yazı ölçüsü değişirse (bkz. başlığın fontSize'ı) burası da değişmeli:
  // kutu `overflow: hidden`, dar kalırsa başlığı kırpar.
  // Başlığın kutusu. Yazının DOĞAL satır kutusundan (33 punto ≈ 40) biraz
  // dar: 33/700'ün üstünde ve altında kalan doğal leading, başlıkla arama
  // çubuğu arasını olduğundan geniş gösteriyordu. Metne açık `lineHeight`
  // verilip kutu ona göre kısaldı — `overflow: hidden` burada, o yüzden ikisi
  // BİRLİKTE değişmeli.
  const TITLE_LINE_HEIGHT = 37;
  const TITLE_HEIGHT = TITLE_LINE_HEIGHT + 2;
  // Başlığın altındaki açıklama satırı (Beğeniler'deki `tabDescriptionFor` ile
  // aynı kalıp: 16/22, marginTop 2).
  // ⚠️ TEK SATIR (`numberOfLines={1}`) ve metinler ona göre kısa yazıldı: bu
  // blok sabit yükseklikli ve `overflow: hidden` — sarmasına izin verilseydi
  // ikinci satır kırpılır, spacer da eksik kalırdı. Beğeniler'de kutu serbest
  // yükseklikli olduğu için orada böyle bir kısıt yok.
  const DESC_FONT_SIZE = 16;
  const DESC_LINE_HEIGHT = 22;
  const DESC_MARGIN_TOP = 2;
  // Açıklamanın HARFLERİNİN ALTINDA kalan ölü boşluk: `lineHeight` (22)
  // `fontSize`tan (16) büyük, fark satırın altına ve üstüne dağılıyor. Yani
  // açıklamayla altındaki şey arasındaki GÖRÜNEN boşluk, yazılan payın üstüne
  // bir de bunu alıyor. (Akış ekranındaki `DESC_TRAILING_LEADING` ile aynı
  // hesap — iki ekranın boşlukları o sayı üzerinden eşitleniyor.)
  const DESC_TRAILING_LEADING = (DESC_LINE_HEIGHT - DESC_FONT_SIZE) / 2;
  // Başlık bloğunun TAMAMI (başlık satırı + açıklama) — hem kapanma
  // animasyonunun yüksekliği hem spacer'ın payı bunu okuyor, ikisi ayrışırsa
  // liste başlığın altından başlamaz.
  const TITLE_BLOCK_HEIGHT = TITLE_HEIGHT + DESC_MARGIN_TOP + DESC_LINE_HEIGHT;

  // Arama çubuğu SCROLL'DAN ETKİLENMİYOR: ölçüsü, dolgusu, içeriği sabit.
  // Önce yüksekliği sıfıra inip soluyordu (yerinde eriyordu), sonra bir daireye
  // daralıyordu — ikisi de kaydırma sırasında çubuğu DEĞİŞTİRİYORDU. Artık
  // sayfanın herhangi bir başlık öğesi gibi davranıyor: içerikle birlikte
  // yukarı kayar, biçimi hiç değişmez.
  // (Aramaya girildiğinde hâlâ hareket ediyor — o scroll değil, arama
  // koreografisi: bkz. searchActiveProgress.)
  // 44 → 40: çubuğun dikey payı bir tık kısaldı. Yazının kendi satırı (18pt ≈
  // 22) hâlâ rahat sığıyor; kısalan yalnız üstündeki/altındaki boşluk.
  // Satırın toplam yüksekliği (SEARCH_ROW_INTRINSIC) ve dolayısıyla listenin
  // spacer'ı buradan türüyor — ayrıca elle düşürülmemeli. Sayının kendisi
  // SheetSearchInput'tan geliyor (yukarıdaki import notu).
  const scrollY = useSharedValue(0);
  const onListScroll = useAnimatedScrollHandler({
    onScroll: (e) => {
      scrollY.value = e.contentOffset.y;
    },
  });
  // searchActiveProgress'i compress style'lardan önce tanımlıyoruz çünkü
  // bar aktifken scroll-compress disable edilecek.
  const searchActiveProgress = useSharedValue(0);

  // Search aktif olunca:
  //   • search row yukarı kayıyor (paddingTop azalıyor) — bar tepeye yapışıyor
  //   • chevron yavaşça beliriyor (width + opacity)
  //   • bölüm başlığı ve piller yumuşakça eriyor (opacity + height collapse) →
  //     chat listesi yukarı kayıyor
  //   • header (Lit logo / "Mesajlar") opacity 0 olup gizleniyor
  // Hepsini tek bir shared progress driver'dan besliyoruz → birlikte koreografi.
  // (CHEVRON_* ve TITLE_HEIGHT yukarıda — worklet'ler onları okuyor.)
  // pt-3 (12) + pill (~37: 9+9 pay + 1+1 kenar + 14px yazının satırı) + pb-2 (8).
  // Bir piksellik bolluk kasıtlı: kutu `overflow: hidden` ve pill'in yüksekliği
  // kullanıcının yazı tipi ölçeğine göre oynayabiliyor — dar tutulursa kırpar.
  // Pill bu kutuya GERİLMİYOR (bkz. FilterPills `alignItems: center`), yani
  // buradaki sayı yalnız satırın kapladığı yeri anlatır, pill'in boyunu DEĞİL.
  // Sekme şeridi artık ScreenHeader'ın KENDİ satırında (bkz. `centerSlot`),
  // yani overlay'in içinde değil — buradaki blok o satır kadar BOŞ yer bırakan
  // bir spacer. Ölçü elle yazılmıyor: header'ın satır yüksekliği değiştiği gün
  // büyük başlık şeridin altına girerdi.
  // ⚠️ Sondaki 14 Beğeniler ekranıyla AYNI sayı: orada liste
  // `insets.top + SCREEN_HEADER_TITLE_HEIGHT + 14` payıyla başlıyor, yani
  // şeritle büyük başlık arasındaki nefes 14. İki ekranın tepesi tek kalıp.
  const HEADER_ROW_BLOCK_HEIGHT = SCREEN_HEADER_TITLE_HEIGHT + 14;
  // Başlık bloğunun ALTINDA kalan ölü boşluk. Akış'ta blok serbest yükseklikli
  // (açıklamanın kutusu bloğun alt kenarı), burada ise blok SABİT
  // (TITLE_BLOCK_HEIGHT, `overflow: hidden`) ve TITLE_HEIGHT başlık satırından
  // bu kadar uzun — yani açıklama bloğun dibinde bitmiyor, altında bu pay var.
  const TITLE_BLOCK_TRAILING_DEAD = TITLE_HEIGHT - TITLE_LINE_HEIGHT;
  // Açıklamayla arama çubuğu arasındaki pay.
  // Yolu: 2 (çubuk açıklamaya yapışıyordu) → 18 (Akış'ın ham marjı; oradan 2
  // fazla göründü, çünkü yukarıdaki ölü pay üstüne biniyor) → 16 (Akış'la
  // GÖRÜNEN eşitlik: 16 + 2 + 3 = 21) → 12. Son adım bilerek Akış'ın altında:
  // orada açıklamanın altındaki şey ince bir pill satırı, burada satırın
  // tamamını kaplayan dolu bir yüzey — aynı boşluk burada daha geniş okunuyor.
  // GÖRÜNEN boşluk = bu sayı + iki ölü pay (2 + 3), yani 14.
  // Son iki adım: 12 (görünen 17) → 10 (görünen 15) → 9.
  const SEARCH_ROW_TOP_GAP = 9;
  // Sohbet satırının KENDİ üst payı (`py-2`) — çubuğun altındaki boşluğun bir
  // parçası: satırın kutusu görünmez, gözle görülen ilk şey avatarın üst kenarı
  // ve o, kutunun 8 altında başlıyor. ⚠️ Satırdaki `py-2` değişirse burası da.
  const CHAT_ROW_TOP_PADDING = 8;
  // Çubuğun altındaki nefes — çubuğun ÜSTÜNDEKİ görünen boşluğun eşi:
  //   üstte: SEARCH_ROW_TOP_GAP + başlık bloğunun ölü payı + açıklamanın ölü payı
  //   altta:  bu sayı + satırın kendi 8'i
  // İkisi eşitlenince çubuk iki boşluğun tam ortasında duruyor. Eskiden 6'ydı
  // (aslında yazılı bile değildi: satır `items-center` olduğu için artan pay
  // kendiliğinden 6/6 bölünüyordu) — çubuk üstteki boşluğa yapışık görünüyordu.
  const SEARCH_ROW_BOTTOM_GAP =
    SEARCH_ROW_TOP_GAP +
    TITLE_BLOCK_TRAILING_DEAD +
    DESC_TRAILING_LEADING -
    CHAT_ROW_TOP_PADDING;
  const SEARCH_ROW_INTRINSIC =
    SEARCH_ROW_TOP_GAP + SEARCH_BAR_HEIGHT + SEARCH_ROW_BOTTOM_GAP;
  const HEADER_BOTTOM_PADDING_ACTIVE = 0; // aktifken bar altı nefes alanı
  // Eskiden `+ 50`ydi: o 50, ScreenHeader'ın LOGO satırının yüksekliğiydi
  // (SCREEN_HEADER_LOGO_HEIGHT) ve içerik onun altından başlasın diye
  // ayrılıyordu. Logo kalktı, ayrılan yer de kalktı — büyük başlık artık durum
  // çubuğunun hemen altında. Kalan 16 yalnız nefes payı.
  // (Header'ın küçük başlığı hâlâ `insets.top`tan 50px'lik bir satırda duruyor
  // ama o ancak kaydırınca beliriyor, o noktada büyük başlık çoktan yukarı
  // çıkmış oluyor — çakışmıyorlar.)
  // Üstte pay YOK: overlay doğrudan `insets.top`tan başlıyor ve ilk blok
  // header satırının spacer'ı — Beğeniler'de de liste payı aynı hattan
  // hesaplanıyor.
  const HEADER_TOP_INACTIVE = insets.top;
  // Arama AKTİFken çubuğun durum çubuğundan uzaklığı 16'da kalsın: o uzaklık
  // overlay'in payı + satırın KENDİ üst payı. Satırın payı açıklamayla hizalanmak
  // için büyüdü (bkz. SEARCH_ROW_TOP_GAP), overlay'in payı da aynı kadar küçülüyor
  // — yoksa aramaya girince çubuk olduğu yerden aşağı kayardı.
  const SEARCH_ACTIVE_TOP_GAP = 16;
  const HEADER_TOP_ACTIVE =
    insets.top + SEARCH_ACTIVE_TOP_GAP - SEARCH_ROW_TOP_GAP;
  // Spacer (ListHeaderComponent) — search overlay'in işgal ettiği yer kadar boş alan
  // bırakır, böylece ilk chat overlay'in altından başlar. Aktifken pills kaybolduğu için
  // toplam yükseklik düşer → chat listesi otomatik yukarı kayar.
  // Başlık da (piller gibi) arama açılınca eriyip yer bırakmıyor → aktif toplama
  // GİRMİYOR, yalnız inaktif toplama ekleniyor.
  const INACTIVE_TOTAL =
    HEADER_TOP_INACTIVE +
    HEADER_ROW_BLOCK_HEIGHT +
    TITLE_BLOCK_HEIGHT +
    SEARCH_ROW_INTRINSIC;
  const ACTIVE_TOTAL =
    HEADER_TOP_ACTIVE + SEARCH_ROW_INTRINSIC + HEADER_BOTTOM_PADDING_ACTIVE;
  useEffect(() => {
    searchActiveProgress.value = withTiming(isSearchActive ? 1 : 0, {
      duration: 280,
    });
  }, [isSearchActive, searchActiveProgress]);

  const chevronAnimStyle = useAnimatedStyle(() => ({
    width: searchActiveProgress.value * CHEVRON_WIDTH,
    marginRight: searchActiveProgress.value * CHEVRON_GAP,
    opacity: searchActiveProgress.value,
    overflow: "hidden",
  }));

  const listHeaderPaddingStyle = useAnimatedStyle(() => ({
    paddingTop:
      HEADER_TOP_INACTIVE +
      (HEADER_TOP_ACTIVE - HEADER_TOP_INACTIVE) * searchActiveProgress.value,
    paddingBottom: HEADER_BOTTOM_PADDING_ACTIVE * searchActiveProgress.value,
  }));

  // Search inactive iken overlay scroll ile birlikte yukarı kayar (content gibi
  // davranır). Active iken translateY = 0 → tepeye yapışır (sticky header).
  const overlayTransformStyle = useAnimatedStyle(() => ({
    transform: [
      { translateY: -scrollY.value * (1 - searchActiveProgress.value) },
    ],
  }));

  // Progressive blur backdrop — sadece search aktifken görünür. ScreenHeader'la
  // aynı ease-gradient + BlurView yapısı; mask altta yumuşakça fade eder.
  const blurBackdropStyle = useAnimatedStyle(() => ({
    opacity: searchActiveProgress.value,
  }));
  const { colors: blurMaskColors, locations: blurMaskLocations } = useMemo(
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

  // ListHeader spacer — overlay'in işgal ettiği yükseklik kadar boş alan.
  const listHeaderSpacerStyle = useAnimatedStyle(() => ({
    height:
      INACTIVE_TOTAL +
      (ACTIVE_TOTAL - INACTIVE_TOTAL) * searchActiveProgress.value,
  }));

  // Header satırının spacer'ı — başlıkla AYNI eğride kapanıyor: arama açılınca
  // header (ve içindeki şerit) eriyor, o bandı boş tutmanın anlamı kalmıyor ve
  // arama çubuğu tepeye yapışıyor.
  const headerRowSpacerStyle = useAnimatedStyle(() => ({
    height: HEADER_ROW_BLOCK_HEIGHT * (1 - searchActiveProgress.value),
  }));

  // Başlık pill'lerle AYNI eğride eriyor — ikisi de aynı driver'dan besleniyor,
  // yani arama açılırken satırlar birlikte kapanıyor. Ayrı bir zamanlama olsaydı
  // biri diğerinden önce kapanıp arama çubuğu iki adımda yerine oturmuş gibi
  // görünürdü.
  const titleAnimStyle = useAnimatedStyle(() => ({
    opacity: 1 - searchActiveProgress.value,
    height: TITLE_BLOCK_HEIGHT * (1 - searchActiveProgress.value),
    overflow: "hidden",
  }));

  const screenHeaderAnimStyle = useAnimatedStyle(() => ({
    opacity: 1 - searchActiveProgress.value,
  }));

  const closeSearch = useCallback(() => {
    searchInputRef.current?.blur();
    searchInputRef.current?.clear();
    setSearchQuery("");
    setIsSearchActive(false);
    // Bar tepeye dönerken içeriği de tepeye al → animasyonlar paralel ilerler,
    // bar off-screen kayarken chat'ler yerinde kalmaz, "fark" oluşmaz.
    listRef.current?.scrollToOffset({ offset: 0, animated: true });
  }, []);

  // Filtrelenmiş conversation listesi — önce tab filtresi, sonra partner display
  // name içinde arama. Kapanmış (isActive=false) sohbetler SADECE "Kapalı"
  // tabında görünür; "Tümü" ve "Okunmamış" yalnız aktif sohbetleri listeler.
  // ÜÇ SEKMENİN HEPSİ birden süzülüyor, yalnız aktif olan değil: pager'da üç
  // sayfa da aynı anda canlı ve her biri kendi dizisini istiyor. Kapanmış
  // (isActive=false) sohbetler SADECE "Kapalı"da görünür; "Tümü" ve
  // "Okunmamış" yalnız aktifleri listeler. Arama sorgusu üçüne de uygulanıyor —
  /**
   * ── MOD SÜZGECİ ───────────────────────────────────────────────────────────
   * Eşleşme 2026-10-21'den beri MOD BAŞINA: aynı çiftin Flört ve Arkadaş
   * sohbeti AYRI iki satır (bu yüzden liste anahtarı `conversationId`).
   *
   * Süzme SUNUCUDA DEĞİL BURADA, bilinçli bir sapma (sunucunun önerisi
   * "`?mode=` ile çek, mod değişince listeyi boşalt"tı):
   *   • delta-sync ucu (`/messages/changes`) mod süzgeci TAŞIMIYOR — tüm
   *     modların satırları zaten geliyor ve SQLite aynası hepsini tutmak
   *     zorunda (soğuk açılışta okuma yolu diskten besleniyor),
   *   • liste sayfalanmıyor, yani tam liste elimizde; moda göre çekmek ikinci
   *     bir mekanizma + mod geçişinde boş liste + bayat watermark riski
   *     demekti,
   *   • bu hâliyle mod geçişi AĞA HİÇ ÇIKMIYOR — liste anında dönüyor.
   *
   * ⚠️ MODU OLMAYAN satır ELENMİYOR (`!c.mode`): alanı göndermeyen bir sunucu
   * sürümünde ya da yerel olarak (MatchNotification'dan) modsuz açılmış bir
   * satırda elemek, kullanıcının sohbetlerini kaybettirirdi. Sekme rozeti de
   * AYNI kuralı uyguluyor (bkz. chatSlice > selectUnreadForMode) — ayrışırsa
   * rozet listede olmayan bir mesajı sayar.
   */
  const modeConversations = useMemo(
    () =>
      (conversations || []).filter(
        (c: any) => !c.mode || c.mode === selectedMode,
      ),
    [conversations, selectedMode],
  );

  // sekme değiştirmek aramayı sıfırlamıyor.
  const conversationsByTab = useMemo(() => {
    // Katlama bir kez burada, for döngüsünden önce — her satırda tekrar
    // katlamak yerine tek sorgu stringini katlayıp aynen geçiyoruz.
    const q = foldTr(searchQuery);
    const all = [];
    const unread = [];
    const closed = [];
    for (const c of modeConversations) {
      if (!conversationMatchesQuery(c, q)) continue;
      if (!c.isActive) {
        closed.push(c);
        continue;
      }
      all.push(c);
      if (c.unreadCount > 0) unread.push(c);
    }
    return { all, unread, closed };
  }, [modeConversations, searchQuery]);

  // ── Mesaj araması (Task 4) ────────────────────────────────────────────────
  // `searchQuery` conversationsByTab'ı HER TUŞ VURUŞUNDA süzüyor — o bellek-içi
  // bir `includes`, ucuz. `searchMessages` ise SQLite'a vuran, TÜM ARŞİVİ
  // tarayan senkron bir sorgu (bkz. MESSAGE_SEARCH_DEBOUNCE_MS yorumu); onu
  // aynı undebounced yolda çağırmak her tuş vuruşunu bir tam-arşiv taramasına
  // çevirirdi. Çözüm: SQL'e giden değer AYRI bir state'te, DEBOUNCE'LU.
  //
  // ⚠️ Geçersiz sorguda (`prepareSearchQuery` → `null`) debounce BEKLENMİYOR,
  // ANINDA temizleniyor: bölüm "sessizce kaybolmalı" (eşik altı ya da arama
  // kapandı) ve bunu bir sonraki debounce turuna bağlamak bayat sonuçları bir
  // kare daha ekranda tutardı.
  const [messageSearchQuery, setMessageSearchQuery] = useState<string | null>(
    null,
  );
  useEffect(() => {
    const prepared = prepareSearchQuery(searchQuery);
    if (prepared === null) {
      setMessageSearchQuery(null);
      return;
    }
    const timer = setTimeout(
      () => setMessageSearchQuery(prepared),
      MESSAGE_SEARCH_DEBOUNCE_MS,
    );
    return () => clearTimeout(timer);
  }, [searchQuery]);

  // `isSearchActive` AYRICA okunuyor (yalnız `messageSearchQuery`ye güvenmek
  // yerine): bugün `closeSearch` searchQuery'yi de temizlediği için ikisi
  // birlikte düşüyor, ama bu ikinci kilit gelecekte ayrışmalarına karşı ucuz
  // bir sigorta — arama KAPALIYKEN bölüm asla görünmemeli.
  const messageHits: MessageSearchHit[] = useMemo(() => {
    if (!isSearchActive || !messageSearchQuery) return [];
    try {
      // `mode` ŞART (review turu 4, Önemli 4): sohbet listesi
      // `modeConversations` ile mod başına süzülüyor ve bu uygulamanın
      // değişmezi Flört/Arkadaş'ın AYRI DÜNYALAR olması. Mod geçilmezse
      // Flört modundayken bu bölüm Arkadaş mesajlarını listeler ve dokunmak
      // öteki modun sohbetine navigasyon yapardı. Modsuz satırlar
      // ELENMİYOR — `modeConversations`'ın `!c.mode ||` toleransının aynısı,
      // kuralın tek kaynağı `searchMessages` (bkz. oradaki yorum).
      return searchMessages(messageSearchQuery, {
        mode: selectedMode,
        limit: MESSAGE_SEARCH_LIMIT,
      });
    } catch (error) {
      console.error("[messages] mesaj araması başarısız:", error);
      return [];
    }
  }, [isSearchActive, messageSearchQuery, selectedMode]);

  // Bölümün KENDİSİ (başlık + satırlar/"bulunamadı") bu bayrağa bağlı —
  // `prepareSearchQuery` `null` döndüğü sürece (eşik altı sorgu) bölüm HİÇ
  // render edilmiyor; bugünkü sohbet süzgeci (`conversationsByTab`) ise boş
  // sorguda hepsini göstermeye AYNEN devam ediyor (iki kural bilerek farklı,
  // bkz. messageSearch.ts > MIN_SEARCH_LENGTH yorumu).
  const showMessageSection = isSearchActive && !!messageSearchQuery;

  // Arama çubuğunun üstündeki bölüm başlığı — aktif sekmeye göre. Beğeniler
  // ekranındaki `sectionTitle` ile aynı kalıp: pill filtrenin adı, başlık
  // listenin ne olduğu.
  const sectionTitleFor = useCallback(
    (tabKey: string) =>
      tabKey === "unread"
        ? t("chat.messages.headerUnread")
        : tabKey === "closed"
          ? t("chat.messages.headerClosed")
          : t("chat.messages.headerAll"),
    [t],
  );
  // Başlığın altındaki tek cümle — sekmenin ne listelediğini söylüyor
  // (Beğeniler'deki `tabDescriptionFor` ile aynı görev). Başlık gibi tek ve
  // aktif sekmeye bağlı: üç sayfa aynı overlay'i paylaşıyor.
  const tabDescriptionFor = useCallback(
    (tabKey: string) =>
      tabKey === "unread"
        ? t("chat.messages.descUnread")
        : tabKey === "closed"
          ? t("chat.messages.descClosed")
          : t("chat.messages.descAll"),
    [t],
  );
  // Başlığın SAĞINDAKİ pill — Beğeniler'deki `headerAction`ın karşılığı ve tek
  // görevi premium sheet'ini açmak. Burada satılan bir consumable yok: ücretsiz
  // tarafta sayılan şey mesaj hakkı (bkz. satırlardaki "Sınırlı" rozeti,
  // chatSlice.normalizeQuota) ve onu kaldıran tek şey abonelik.
  // Sekmeye göre DEĞİŞMİYOR (Beğeniler'de değişiyor, çünkü orada her sekmenin
  // kilidi başka bir ürün): üç listede de aynı kota geçerli.
  const showUnlimitedUpsell = premiumResolved && !isPremium;

  // Şerideki adetler — `conversationsByTab` ile AYNI koşullar ama arama
  // sorgusu KASITLI olarak girmiyor: sayı "bu sekmede kaç sohbet var" demeli,
  // "aramanla kaç tanesi eşleşti" değil (zaten arama açıkken header'la birlikte
  // şerit de eriyip kayboluyor, bkz. screenHeaderAnimStyle).
  const tabCounts = useMemo(() => {
    let all = 0;
    let unread = 0;
    let closed = 0;
    for (const c of modeConversations) {
      if (!c.isActive) {
        closed += 1;
        continue;
      }
      all += 1;
      if (c.unreadCount > 0) unread += 1;
    }
    return { all, unread, closed };
  }, [modeConversations]);

  // ⚠️ Sıra pager sayfalarının sırasıyla BİREBİR: alt çizginin interpolasyonu
  // sayfa indeksinden besleniyor, iki liste ayrışırsa çizgi yanlış sekmeye
  // gider.
  const tabs = useMemo(
    () => [
      { key: "all", label: t("chat.messages.tabAll"), count: tabCounts.all },
      {
        key: "unread",
        label: t("chat.messages.tabUnread"),
        count: tabCounts.unread,
      },
      {
        key: "closed",
        label: t("chat.messages.tabClosed"),
        count: tabCounts.closed,
      },
    ],
    [t, tabCounts],
  );

  // Pager'ın anlık konumu — alt çizgiyi bu sürüyor (tam sayı değil, kaydırma
  // sürerken 0.0 → 0.42 → 1.0 diye akıyor).
  const pagerOffset = useSharedValue(0);
  const pagerScrollHandler = usePagerScrollHandler({
    onPageScroll: (e: any) => {
      "worklet";
      pagerOffset.value = e.position + e.offset;
    },
  });
  // Büyük başlık ve arama çubuğu artık sayfalarla BİRLİKTE kayıyor: ikisi de
  // üç kopyalı yatay bir şerit ve şerit pager'ın anlık konumundan sürülüyor.
  // Eskiden ikisi de sabitti, metin `onPageSelected`'da (yani parmak kalkınca)
  // anlık değişiyordu — sayfa yandan gelirken başlığı hâlâ eskisiydi.
  //
  // İKİ AYRI hook çağrısı: bir `useAnimatedStyle` sonucunu birden çok
  // component'e vermek desteklenmiyor (tek view descriptor'a bağlanıyor).
  const titleSlideStyle = usePagerSlide(pagerOffset, SCREEN_W);
  const searchSlideStyle = usePagerSlide(pagerOffset, SCREEN_W);
  // ⚠️ Şeridin OTURMUŞ konumu taban stile de yazılıyor. Sebep Reanimated'ın
  // re-render davranışı: `PropsFilter` her render'da animasyonlu stilin yerine
  // İLK render'da yakalanan değeri (burada `translateX: 0`, yani 0. sayfa)
  // basıyor, doğru değeri ancak `componentDidUpdate` bir kare sonra geri
  // yazıyor. Fabric'te bu bir karelik commit görünüyor: sayfa oturur oturmaz
  // gelen `setActiveTab` render'ı şeridi 0. sayfaya fırlatıp geri getiriyordu
  // ("kayıp düzeliyor"). Taban değer doğru olunca o kare de doğru.
  //
  // ⚠️ Taban değerin DOĞRU olması `activeTab`ın ancak pager DURUNCA yazılmasına
  // bağlı (bkz. usePagerTabCommit): sekme kaymanın ortasında yazıldığında bu
  // stil şeridi daha yolun yarısındayken varış sayfasına fırlatıyordu ve bir
  // kare sonra animasyon geri çekiyordu — başlık/alt yazı kayarken görülen
  // takılma buydu.
  //
  // SIRA ÖNEMLİ: animasyon stilinden SONRA gelmeli — flatten'da son yazan
  // kazanıyor. Sürükleme sırasında ise React commit'i olmadığı için animasyon
  // değeri tek başına sürüyor.
  const activeIndex = useMemo(() => {
    const i = tabs.findIndex((tb) => tb.key === activeTab);
    return i < 0 ? 0 : i;
  }, [tabs, activeTab]);
  const settledSlideStyle = useMemo(
    () => ({ transform: [{ translateX: -activeIndex * SCREEN_W }] }),
    [activeIndex, SCREEN_W],
  );
  // Şeride basmak doğrudan setState ETMİYOR: pager'a sayfa değiştirmesini
  // söylüyor, sekme state'i pager'ın kendi olaylarından dönüyor. İki kaynak
  // olsaydı parmakla çevirmede biri diğerini ezerdi.
  const handleTabChange = useCallback(
    (key: string) => {
      const index = tabs.findIndex((tb) => tb.key === key);
      if (index >= 0) pagerRef.current?.setPage(index);
    },
    [tabs],
  );

  // Sekme state'i pager DURUNCA yazılıyor — gerekçe usePagerTabCommit'te.
  const commitPage = useCallback(
    (index: number) => {
      const key = tabs[index]?.key;
      if (key) setActiveTab(key);
    },
    [tabs],
  );
  const pagerCommitHandlers = usePagerTabCommit(commitPage);

  // Her odaklanışta tazele — SADECE mount'ta çekmek listeyi bayat bırakıyordu:
  // karşı taraf unmatch ettiğinde backend hiçbir event yayınlamadığı için sohbet
  // (uygulama arka plana atılıp geri gelene kadar) aktif görünmeye devam ediyordu.
  // Thunk'ın 15sn staleness + in-flight guard'ı sekme gidip gelmelerini yutar.
  useFocusEffect(
    useCallback(() => {
      dispatch(fetchConversations());
    }, [dispatch]),
  );

  // BOOT PREFETCH KALDIRILDI (local-first geçişi).
  //
  // Burada ilk 15 sohbetin history'si arka planda çekiliyordu — tek amacı
  // Redux'ı ısıtmaktı ki ChatScreen dolu açılsın. Artık geçmiş SQLite'ta
  // duruyor ve açılışta diskten senkron okunuyor (chatHydrate), yani bu
  // fan-out saf maliyetti: cold boot'ta 15 HTTP isteği.
  //
  // Tazelik kaybı yok: ChatScreen girişte kendi page-1 reconcile fetch'ini
  // zaten atıyor; sohbet listesinin kendisi de fetchConversations ile geliyor.

  const openChat = useCallback(
    (conv) => {
      dispatch(setActiveConversation(conv.conversationId));
      // Diski BASIŞ ANINDA oku — aşağıdaki runAfterInteractions zaten basış
      // animasyonunu bekliyor, 1-3 ms'lik okuma o pencereye sığıyor ve
      // ChatScreen DOLU bucket'la mount oluyor (layout effect'i no-op'a düşer).
      hydrateConversation(dispatch, conv.conversationId);
      // Bir chatten çıkıp hemen başka chate girmeye çalışınca navigate çağrısı
      // bazen düşüyor (TouchableHighlight highlight'ı görünse de ekran açılmıyor,
      // ikinci tap'te açılıyor). Root cause: önceki ChatScreen exit transition'ı
      // devam ederken stack navigator busy oluyor → dispatch drop. Interaction
      // sonuna kadar defer edip clean state'te navigate ediyoruz.
      InteractionManager.runAfterInteractions(() => {
        (navigation as any).navigate("Chat", {
          conversationId: conv.conversationId,
          partner: {
            userId: conv.partnerUserId,
            displayName: conv.partnerDisplayName,
            profileImageUrl: conv.partnerProfileImageUrl,
          },
          isActive: conv.isActive,
        });
      });
    },
    [dispatch, navigation],
  );

  /**
   * Mesaj arama sonucuna dokununca — Task 5. `openChat`tan BİLEREK FARKLI:
   * burada `hydrateConversation` (hot window'u EN YENİDEN okuyan) ÇAĞRILMIYOR.
   * ChatScreen mount olduğunda `messages.length === 0` kontrolüyle normal
   * hot-window'u mu yoksa `hydrateAroundMessage`in hedef-etrafı penceresini mi
   * yazacağına karar veriyor (bkz. ChatScreen'in birleşik layout effect'i) —
   * burada ÖNCEDEN hot window'u yazsaydık bucket DOLU gelirdi ve o karar hiç
   * çalışmazdı, kullanıcı "hedefe atla" dediği hâlde sohbetin EN ÜSTÜNDE
   * açılırdı.
   */
  const openMessageHit = useCallback(
    (hit: MessageSearchHit) => {
      const conv = (conversations || []).find(
        (c: any) => c.conversationId === hit.conversationId,
      );
      dispatch(setActiveConversation(hit.conversationId));
      InteractionManager.runAfterInteractions(() => {
        (navigation as any).navigate("Chat", {
          conversationId: hit.conversationId,
          partner: {
            userId: conv?.partnerUserId,
            displayName: conv?.partnerDisplayName ?? hit.partnerDisplayName ?? undefined,
            profileImageUrl: conv?.partnerProfileImageUrl,
          },
          isActive: conv?.isActive,
          targetMessageId: hit.messageId,
          targetSentAtMs: hit.sentAtMs,
        });
      });
    },
    [conversations, dispatch, navigation],
  );

  // Basılı tutma artık Alert AÇMIYOR: ChatScreen'deki 3 nokta menüsünün
  // birebir aynısı (ConversationOptionsSheet) açılıyor — aktif/kapalı ayrımını,
  // geri alma penceresini ve şikayet/engelle bölümünü sheet'in kendisi
  // gösteriyor. Onaylar da sheet'in içinde (unmatch/block) soruluyor.
  const handleLongPress = useCallback((conv) => {
    setOptionsConv(conv);
  }, []);

  // Aşağıdaki üç aksiyon sheet ONAYINDAN SONRA çağrılır — burada tekrar
  // sormuyoruz (ChatScreen'de de sormuyor).
  const handleSheetUnmatch = useCallback(
    async (conv: any) => {
      // Mesajlar SİLİNMEZ, sohbet kapalıya düşer; geri alma penceresi olup
      // olmadığı ancak sunucu yanıtında belli olur.
      try {
        const res = await chatService.deactivateConversation(
          conv.conversationId,
        );
        dispatch(
          conversationDeactivated({
            conversationId: conv.conversationId,
            restorableUntil: res?.restorableUntil ?? null,
            byMe: true,
          }),
        );
        // Mutasyon-sonrası tazeleme — staleness gate'ini bypass et.
        dispatch(fetchConversations({ force: true }));
        const removedWindow = formatRestoreWindow(res?.restorableUntil, t);
        showInfoToast({
          title: t("chat.unmatch.removedTitle"),
          message: removedWindow
            ? t("chat.unmatch.removedRestorable", { time: removedWindow })
            : t("chat.unmatch.removedPermanent"),
        });
      } catch (err: any) {
        Alert.alert(t("common.error"), chatErrorText(err, t, "chat.unmatch.error"));
      }
    },
    [dispatch, t],
  );

  const handleSheetRestore = useCallback(
    async (conv: any) => {
      try {
        const ok = await chatService.restoreConversation(conv.conversationId);
        if (ok) {
          dispatch(
            conversationRestored({ conversationId: conv.conversationId }),
          );
        } else {
          Alert.alert(
            t("chat.unmatch.restoreError"),
            t("chat.unmatch.restoreExpiredMessage"),
          );
          // Pencere kapanmış — yerel bayrağı düzelt, buton kaybolsun.
          dispatch(
            conversationDeactivated({
              conversationId: conv.conversationId,
              restorableUntil: null,
            }),
          );
        }
        // Mutasyon-sonrası tazeleme — staleness gate'ini bypass et.
        dispatch(fetchConversations({ force: true }));
      } catch (err: any) {
        // UT-6743: geri alma yalnız unmatch edene açık (bkz. ChatScreen).
        Alert.alert(t("common.error"), chatErrorText(err, t, "chat.unmatch.restoreFailed"));
      }
    },
    [dispatch, t],
  );

  const handleSheetBlock = useCallback(
    async (conv: any) => {
      if (!conv?.partnerUserId) return;
      try {
        await moderationService.blockUser(conv.partnerUserId);
        Alert.alert(t("chat.block.title"), t("chat.block.message"));
        // Engelleme eşleşmeyi KALICI kapatır — satır listede aktif kalmasın.
        dispatch(
          conversationDeactivated({
            conversationId: conv.conversationId,
            restorableUntil: null,
          }),
        );
        dispatch(fetchConversations({ force: true }));
      } catch (err: any) {
        Alert.alert(t("common.error"), chatErrorText(err, t, "chat.block.error"));
      }
    },
    [dispatch, t],
  );

  // ConversationRow'a conv'i argüman alan STABIL callback'ler geçir — böylece
  // renderItem içinde inline arrow'a gerek kalmaz, satır prop identity'si korunur.
  const handleRowOpen = useCallback((c: any) => openChat(c), [openChat]);
  const handleRowLongPress = useCallback(
    (c: any) => handleLongPress(c),
    [handleLongPress],
  );

  const renderItem = useCallback(
    ({ item }: any) => (
      <ConversationRow
        conv={item}
        isTyping={!!isTypingByConvId[item.conversationId]}
        isLimited={!!isLimitedByConvId[item.conversationId]}
        draft={drafts[item.conversationId]}
        voiceDurationMs={voiceDurationByConvId[item.conversationId]}
        onOpen={handleRowOpen}
        onLongPress={handleRowLongPress}
        accent={accent}
      />
    ),
    [
      isTypingByConvId,
      isLimitedByConvId,
      drafts,
      voiceDurationByConvId,
      handleRowOpen,
      handleRowLongPress,
      accent,
    ],
  );

  /**
   * Bir sekmenin sayfası. Üç sayfa AYNI ANDA canlı — pager'ın örtüşen geçişi
   * ancak böyle mümkün.
   *
   * ⚠️ `onScroll` ve `ref` YALNIZ aktif sayfada. Overlay'in kayması, header'ın
   * belirmesi ve aramayı kapatınca tepeye dönme tek bir `scrollY`/`listRef`
   * üzerinden yürüyor; üç sayfa birden yazsaydı arka plandakilerin (0'da duran)
   * offset'i öndekini ezer, overlay rastgele yerinde zıplardı.
   */
  const renderPage = (tabKey: string) => {
    const data = conversationsByTab[tabKey];
    const isActivePage = tabKey === activeTab;
    return (
      <Animated.FlatList
        ref={isActivePage ? listRef : undefined}
        data={data}
        keyExtractor={(c) => c.conversationId}
        renderItem={renderItem}
        onScroll={isActivePage ? onListScroll : undefined}
        scrollEventThrottle={16}
        keyboardShouldPersistTaps="handled"
        removeClippedSubviews
        maxToRenderPerBatch={8}
        updateCellsBatchingPeriod={50}
        initialNumToRender={10}
        windowSize={7}
        ListHeaderComponent={
          // Sadece animasyonlu spacer — search row absolute overlay olarak ayrıca
          // render ediliyor (sticky). Spacer'ın yüksekliği overlay'in işgal ettiği
          // alana eşit, böylece ilk chat overlay'in altından başlar.
          <Animated.View style={listHeaderSpacerStyle} />
        }
        contentContainerStyle={{
          flexGrow: 1,
          // Native tab bar (liquid glass) listenin ÜSTÜNE biniyor — insets.bottom
          // sadece home indicator'ı kapsıyor. DiscoverScreen ile aynı ölçüleri
          // kullanıp son sohbetin bar altında kalmasını engelliyoruz.
          paddingBottom:
            insets.bottom +
            TAB_BAR_HEIGHT +
            TAB_BAR_BOTTOM_GAP +
            LIST_BOTTOM_GAP,
        }}
        ListEmptyComponent={
          // `!showMessageSection` EKLENDİ (review turu 1, Önemli 3): mesaj
          // bölümü dolu/boş fark etmez, GÖRÜNÜYORSA bu tam-ekran "sohbet
          // bulunamadı" durumu BASILMIYOR. Önceden bu ikisi AYNI ANDA
          // çizilebiliyordu: aranan kelime yalnız mesaj İÇERİĞİNDE geçip
          // hiçbir partner adında geçmediğinde (ki bu bölümün VAR OLMA
          // sebebinin TAM KENDİSİ) `conversationsByTab` boş kalıyor, bu dal
          // `pb-[60%]` ile ekranı dolduruyor ve asıl istenen mesaj sonuçları
          // bir tam ekran AŞAĞIDA, kaydırılmadan görünmeyen bir yere düşüyordu.
          isSearchActive && searchQuery.trim().length > 0 && !showMessageSection ? (
            <View testID="msgs-conv-notfound" className="flex-1 items-center justify-center pb-[60%] px-8">
              <SFIcon
                name="magnifyingglass"
                fallback={Search}
                size={48}
                color={colors.text}
                strokeWidth={1.3}
              />
              <Text
                className="text-center mt-3"
                style={{ color: colors.text, fontSize: 14, fontWeight: "500" }}
              >
                {t("chat.messages.notFound", { query: searchQuery })}
              </Text>
            </View>
          ) : !isSearchActive && conversationsSettled ? (
            tabKey === "unread" || tabKey === "closed" ? (
              <View className="flex-1 items-center justify-center pb-[40%]">
                <EmptyState
                  Icon={MessageCircle}
                  sf="message"
                  iconStrokeWidth={1.3}
                  text={
                    tabKey === "closed"
                      ? t("chat.messages.noClosed")
                      : t("chat.messages.noUnread")
                  }
                  topOffset={0}
                />
              </View>
            ) : (
              <View className="flex-1 items-center justify-center pb-[40%]">
                <EmptyState
                  Icon={MessageCircle}
                  sf="message"
                  iconStrokeWidth={1.3}
                  text={t("chat.messages.empty")}
                  topOffset={0}
                  buttonLabel={t("chat.messages.findMatch")}
                  buttonLabelColor={colors.onMediaInverse}
                  // CTA kullanıcıyı Keşif'e gönderiyor ve Keşif SEÇİLİ MODDA
                  // açılıyor — butonun gideceği yerin rengini taşıması doğru
                  // olan (EmptyState'in varsayılanı sabit litPlus).
                  buttonColor={accent}
                  onButtonPress={() => navigation.navigate("Discover")}
                />
              </View>
            )
          ) : null
        }
        ListFooterComponent={
          // `showMessageSection` zaten `prepareSearchQuery` `null`ken (eşik
          // altı sorgu) ya da arama kapalıyken `false` — bölüm o durumlarda
          // HİÇ RENDER EDİLMİYOR, ekran sohbet listesinden fazlasını göstermez.
          showMessageSection ? (
            <View testID="msgs-message-section" className="px-4 pt-4">
              <Text
                style={{
                  color: colors.textSecondary,
                  fontSize: 13,
                  fontWeight: "700",
                }}
              >
                {t("chat.messages.searchMessagesTitle")}
              </Text>
              {messageHits.length > 0 ? (
                messageHits.map((hit) => (
                  <TouchableOpacity
                    key={hit.messageId}
                    testID={`msgs-message-hit-${hit.messageId}`}
                    activeOpacity={0.7}
                    onPress={() => openMessageHit(hit)}
                    style={{ paddingVertical: 10 }}
                  >
                    <View
                      style={{
                        flexDirection: "row",
                        justifyContent: "space-between",
                        alignItems: "center",
                      }}
                    >
                      <Text
                        numberOfLines={1}
                        style={{ color: colors.text, fontWeight: "600", fontSize: 15, flexShrink: 1 }}
                      >
                        {hit.partnerDisplayName || t("chat.defaultUserName")}
                      </Text>
                      <Text style={{ color: colors.textSecondary, fontSize: 12, marginLeft: 8 }}>
                        {formatRelativeTime(new Date(hit.sentAtMs).toISOString(), t)}
                      </Text>
                    </View>
                    <Text
                      numberOfLines={2}
                      style={{ color: colors.textSecondary, fontSize: 14, marginTop: 2 }}
                    >
                      {highlightSegments(hit.content, messageSearchQuery ?? "").map((seg, i) => (
                        <Text
                          key={i}
                          style={
                            seg.match
                              ? { color: colors.text, fontWeight: "700" }
                              : undefined
                          }
                        >
                          {seg.text}
                        </Text>
                      ))}
                    </Text>
                  </TouchableOpacity>
                ))
              ) : (
                <Text
                  testID="msgs-message-section-empty"
                  style={{ color: colors.textSecondary, fontSize: 14, paddingVertical: 10 }}
                >
                  {t("chat.messages.searchMessagesEmpty")}
                </Text>
              )}
            </View>
          ) : null
        }
      />
    );
  };

  return (
    <View testID="msgs-screen" className="flex-1" style={{ backgroundColor: colors.bg }}>
      {/* Sekmeler bir pager: eski sayfa çıkarken yeni sayfa giriyor, ikisi de
          ekranda. Alt çizgi de bu kaydırmanın anlık konumundan sürülüyor.
          ⚠️ Sohbet satırlarındaki sağa kaydırma jesti (ReanimatedSwipeable)
          KALDIRILDI: aynı parmak hareketini istiyordu. Unmatch/geri alma
          erişilebilir kalıyor — uzun basış zaten aynı akışı tetikliyor. */}
      <AnimatedPagerView
        ref={pagerRef}
        style={{ flex: 1 }}
        initialPage={0}
        onPageScroll={pagerScrollHandler}
        // Sekme state'inin TEK kaynağı bu ikili: seçim ref'e yazılıyor, React
        // state'i ancak kayma bitince (idle) değişiyor — bkz. usePagerTabCommit.
        onPageSelected={pagerCommitHandlers.onPageSelected}
        onPageScrollStateChanged={pagerCommitHandlers.onPageScrollStateChanged}
      >
        {tabs.map((tab) => (
          <View key={tab.key} style={{ flex: 1 }} collapsable={false}>
            {renderPage(tab.key)}
          </View>
        ))}
      </AnimatedPagerView>

      <Animated.View
        pointerEvents={isSearchActive ? "none" : "box-none"}
        style={[
          // zIndex 10 → search overlay'in (zIndex 5) ÜSTÜNDE durur, böylece
          // inactive + scroll'da piller/bar ScreenHeader'ın progressive blur'unun
          // ARKASINA giriyormuş gibi görünür (blur onları kaplar).
          //
          // ⚠️ YÜKSEKLİK AÇIK: içindeki ScreenHeader mutlak konumlu, yani kabın
          // layout yüksekliği 0 kalırdı ve sekme şeridi kabın SINIRLARININ
          // DIŞINDA kalıp dokunuş almazdı (başlık `pointerEvents: none`
          // olduğu için eskiden sorun değildi). Ölçü şeridin durduğu bant
          // kadar; altındaki bulanık zemin zaten etkileşimsiz ve `box-none`
          // olduğu için bu bantta boşa dokunuşlar alttaki listeye geçiyor.
          {
            position: "absolute",
            top: 0,
            left: 0,
            right: 0,
            height: insets.top + SCREEN_HEADER_TITLE_HEIGHT,
            zIndex: 10,
          },
          screenHeaderAnimStyle,
        ]}
      >
        {/* Logo YOK ve BAŞLIK DA YOK: header satırının yerini sekme şeridi aldı
            (Profil ve Beğeniler ekranlarındaki kurulumun aynısı). Scroll'la
            beliren küçük başlık tam onun üstüne binerdi; sayfanın adı zaten
            arama çubuğunun üstündeki büyük başlık.
            ⚠️ Logo gidince swipe kotası göstergesi de gitti (WaveFillLogo'nun
            dolgusu `fillRatio`dan geliyordu), o yüzden prop da kaldırıldı.

            Şerit BURADA, overlay'de değil: arama açılınca header'la birlikte
            eriyor (screenHeaderAnimStyle) ve `pointerEvents` de oradan
            geliyor — aramada sekmeye basılamıyor. */}
        <ScreenHeader
          scrollY={scrollY}
          showLogo={false}
          centerSlot={
            // Şerit ORTALANMIYOR (Profil'de iki sekme var, burada üç ve
            // yanlarında adetler): kaydırılabilir şerit tam genişlikte duruyor
            // ve büyük başlıkla aynı sol hattan başlıyor.
            //
            // `width: "100%"` ŞART: slot `alignItems: "center"` ile hizalıyor,
            // kap içeriği kadar daralır ve şerit ortalanmış bir blok olurdu.
            <View style={{ width: "100%" }}>
              <PagerTabBar
                testIDPrefix="msgs-tab"
                tabs={tabs}
                activeTab={activeTab}
                offset={pagerOffset}
                onPress={handleTabChange}
                // Beğeniler'deki HEADER_LEFT_INSET ile aynı: iki ekranın şeridi
                // ve büyük başlığı aynı sol hattan başlıyor.
                inset={16}
              />
            </View>
          }
        />
      </Animated.View>

      {/* Search row + pills overlay.
          - Inactive: translateY = -scrollY → content gibi scroll'la kayar; blur backdrop
            opacity 0 → transparan; ScreenHeader (Lit logo) page header'ı sağlar.
          - Active: translateY = 0 → tepeye yapışır; blur backdrop opacity 1 → progressive
            blurlu siyahlık çıkar (ScreenHeader ile aynı ease-gradient); ScreenHeader fade. */}
      <Animated.View
        style={[
          { position: "absolute", top: 0, left: 0, right: 0, zIndex: 5 },
          listHeaderPaddingStyle,
          overlayTransformStyle,
        ]}
      >
        {/* Progressive blur backdrop — opacity = searchActiveProgress. */}
        <Animated.View
          pointerEvents="none"
          style={[
            { position: "absolute", top: 0, left: 0, right: 0, bottom: 0 },
            blurBackdropStyle,
          ]}
        >
          <MaskedView
            maskElement={
              <LinearGradient
                locations={blurMaskLocations as any}
                colors={blurMaskColors as any}
                style={StyleSheet.absoluteFill}
              />
            }
            style={StyleSheet.absoluteFill}
          >
            {/* Derinlik perdesi — koyuda karartır, açıkta AYNI oranlarla
                beyazlatır (veil). Maske siyah/şeffaf kalır: alfa maskesi. */}
            <LinearGradient
              colors={[veil(1), veil(0.2)]}
              style={StyleSheet.absoluteFill}
            />
            <BlurView
              intensity={15}
              tint={chromeBlurTint()}
              style={StyleSheet.absoluteFill}
            />
          </MaskedView>
        </Animated.View>

        {/* Header satırının yeri — BOŞ spacer. Şerit oraya (ScreenHeader'ın
            `centerSlot`una) taşındı ve sabit duruyor; overlay ise kaydırınca
            yukarı kayıyor, dolayısıyla büyük başlığın şeridin altından
            başlaması için bu kadar yer bırakılıyor. Arama açılınca başlıkla
            aynı eğride kapanıyor. */}
        <Animated.View pointerEvents="none" style={headerRowSpacerStyle} />

        {/* Bölüm başlığı — arama çubuğunun ÜSTÜNDE, sayfanın büyük başlığı.
            Beğeniler ekranındaki başlıkla aynı ölçü/ağırlık (30/700).
            Arama açılınca pill satırıyla AYNI eğride eriyip yer bırakmıyor
            (bkz. titleAnimStyle): aramada ekranın tek konusu sorgu, sabit bir
            "Tüm sohbetler" başlığı orada yalnız yer kaplardı. */}
        {/* Yan pay `px-4` (16) — sohbet satırlarıyla AYNI hat (bkz. satırın
            kendi `px-4`ü). Önce px-6 (24) idi ve başlık/arama/pill üçlüsü
            listeden 8px içeride başlıyordu: aynı ekranda iki farklı sol kenar
            görünüyordu. Beğeniler ekranı da 16'da (LIST_H_PADDING).
            Ek marj YOK: Beğeniler'in büyük başlığı da 16'da duruyor (orada
            liste payı 10 + blok marjı 6). İki ekranın büyük başlığı ve sekme
            şeridi tek hattan başlamalı. */}
        {/* ŞERİT — üç sayfanın başlığı yan yana, pager'la birlikte kayıyor.
            Dış kap `overflow: hidden` (titleAnimStyle'dan geliyor) hem dikey
            kapanmayı hem de yandaki sayfaların başlığının ekrana taşmasını
            hallediyor: giren başlık sağ kenardan doğuyor, çıkan sol kenarda
            kesiliyor. */}
        <Animated.View
          // "none" DEĞİL "box-none": blok kendisi dokunuş yakalamıyor ama
          // içindeki pill'in basılabilmesi gerekiyor. Arama açıkken blok zaten
          // eriyor, o hâlde tümden geçirgen.
          pointerEvents={isSearchActive ? "none" : "box-none"}
          style={titleAnimStyle}
        >
          <Animated.View
            pointerEvents="box-none"
            style={[
              { flexDirection: "row", width: SCREEN_W * tabs.length },
              titleSlideStyle,
              settledSlideStyle,
            ]}
          >
            {tabs.map((tab) => (
              <View
                key={tab.key}
                pointerEvents="box-none"
                // Sayfa genişliği TAM ekran: şerit `-offset * SCREEN_W` ile
                // kayıyor, hücre daha dar/geniş olsaydı başlık sayfasından
                // ayrı hızda giderdi.
                // Yan pay `px-4` (16) — sohbet satırlarıyla AYNI hat.
                // 3'lük ek marj OPTİK hizalama: şeridin 16 puntoluk etiketleri
                // ile 33 puntoluk başlık aynı `16` payından başlasa da, büyük
                // yazının sol kenar boşluğu daha dar göründüğü için başlık sola
                // taşmış gibi okunuyordu.
                // ⚠️ Sol pay MARJ DEĞİL padding (16 + 3): marj hücreyi
                // SCREEN_W'den geniş yapar, fark her sayfada birikir ve şerit
                // pager'ın gerisine düşerdi (3px, 6px…). Padding genişliğin
                // İÇİNDE kalıyor.
                style={{ width: SCREEN_W, paddingLeft: 19, paddingRight: 16 }}
              >
                {/* Başlık satırı — metin ve (varsa) hemen SAĞINDA upsell
                    pill'i. Beğeniler'deki başlık satırının birebir kalıbı. */}
                <View
                  style={{
                    flexDirection: "row",
                    alignItems: "center",
                    gap: 10,
                  }}
                >
                  <Text
                    numberOfLines={1}
                    // 33/700 — Beğeniler'deki büyük başlıkla AYNI. İki ekranın
                    // büyük başlığı tek bir kalıp; biri değişirse diğeri de
                    // değişmeli.
                    // `flexShrink: 1` — uzun başlık pill'i satır dışına
                    // itmesin, kırpılacak olan başlık.
                    style={{
                      flexShrink: 1,
                      color: colors.text,
                      fontSize: 33,
                      fontWeight: "700",
                      lineHeight: TITLE_LINE_HEIGHT,
                    }}
                  >
                    {sectionTitleFor(tab.key)}
                  </Text>
                  {showUnlimitedUpsell && (
                    // Pill HER sayfada var (sekmeye bağlı değil, bkz.
                    // showUnlimitedUpsell) — kaydırırken başlıkla birlikte
                    // girip çıkması için hücrenin içinde duruyor.
                    // Dolgu/mürekkep satırlardaki "Sınırlı" rozetiyle ve
                    // Beğeniler'deki pill'le AYNI (mod vurgusu +
                    // onMediaInverse): uygulamada "bu premium'a bakıyor" dili
                    // tek. Yazı `text` olamaz — açık modda beyaza döner ve
                    // dolgunun üstünde kaybolur.
                    <AnimatedPressable
                      pressScale={0.96}
                      onPress={() => openLitPlus()}
                      accessibilityRole="button"
                      hitSlop={8}
                      style={{
                        flexShrink: 0,
                        borderRadius: 999,
                        borderCurve: "continuous",
                        backgroundColor: accent,
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
                        {t("chat.messages.unlimitedAction")}
                      </Text>
                    </AnimatedPressable>
                  )}
                </View>
                {/* Başlığın alt yazısı — başlığın devamı, bağımsız bir paragraf
                    değil: 33 puntonun kendi satır boşluğu zaten aşağı pay
                    bırakıyor, üstüne eklenen her px ikisini ayrı blok gibi
                    gösteriyor. */}
                <Text
                  numberOfLines={1}
                  style={{
                    marginTop: DESC_MARGIN_TOP,
                    color: colors.textSecondary,
                    fontSize: DESC_FONT_SIZE,
                    lineHeight: DESC_LINE_HEIGHT,
                    paddingRight: 8,
                  }}
                >
                  {tabDescriptionFor(tab.key)}
                </Text>
              </View>
            ))}
          </Animated.View>
        </Animated.View>

        {/* Arama çubuğu da AYNI şerit mantığında: üç kopya, pager'la kayıyor.
            Kopyalar birbirinin aynısı olduğu için kaydırırken görünen şey
            "çubuk sola çıkıyor, yenisi sağdan geliyor" — başlıkla aynı hareket.
            ⚠️ GERÇEK `TextInput` yalnız AKTİF hücrede: üç canlı input olsaydı
            ref/focus/uncontrolled-metin kurgusu (bkz. searchInputRef) üç kaynağa
            bölünürdü. Diğer hücrelerdeki çubuk yalnız görsel kopya — zaten boş
            bir input'la birebir aynı görünüyor. */}
        <View
          pointerEvents="box-none"
          // Üst pay SEARCH_ROW_TOP_GAP (açıklamayla çubuk arası, Akış'taki
          // TITLE_BLOCK_GAP'in eşi) — hücrelerin paddingTop'u da oradan okuyor,
          // ikisi ayrışırsa kutu çubuğu kırpar (`overflow: hidden`).
          style={{ height: SEARCH_ROW_INTRINSIC, overflow: "hidden" }}
        >
          <Animated.View
            pointerEvents="box-none"
            style={[
              {
                flexDirection: "row",
                width: SCREEN_W * tabs.length,
                height: "100%",
              },
              searchSlideStyle,
              settledSlideStyle,
            ]}
          >
            {tabs.map((tab) => {
              const isActiveCell = tab.key === activeTab;
              return (
                <View
                  key={tab.key}
                  // Pasif hücrenin çubuğu tıklanamaz: ekran dışındayken zaten
                  // ulaşılamıyor, kaydırmanın ortasında yarım görünen komşuya
                  // basılması ise yanlış sayfanın aramasını açardı.
                  pointerEvents={isActiveCell ? "box-none" : "none"}
                  className="px-4 flex-row items-center"
                  style={{
                    width: SCREEN_W,
                    height: "100%",
                    paddingTop: SEARCH_ROW_TOP_GAP,
                    paddingBottom: SEARCH_ROW_BOTTOM_GAP,
                  }}
                >
                  {/* Chevron YALNIZ aktif hücrede: yalnız arama açıkken
                      görünüyor ve o sırada sayfa değiştirilmiyor. */}
                  {isActiveCell && (
                    <Animated.View
                      style={chevronAnimStyle}
                      pointerEvents={isSearchActive ? "auto" : "none"}
                    >
                      <TouchableOpacity
                        testID="msgs-search-close"
                        onPress={closeSearch}
                        hitSlop={10}
                        activeOpacity={0.7}
                      >
                        <View pointerEvents="none">
                          <SFIcon
                            name="chevron.left"
                            fallback={ChevronLeft}
                            size={26}
                            color={colors.text}
                            strokeWidth={2.5}
                            weight="bold"
                          />
                        </View>
                      </TouchableOpacity>
                    </Animated.View>
                  )}
                  {/* Çubuk satırın kalanını doldurur ve HEP o ölçüde kalır —
                      scroll'a bağlı hiçbir stili yok. Aktifken solda beliren
                      chevron'a yer açmasını `flex: 1` kendiliğinden
                      hallediyor. */}
                  <View
                    style={{
                      flex: 1,
                      height: SEARCH_BAR_HEIGHT,
                      justifyContent: "center",
                    }}
                  >
                    <TouchableOpacity
                      activeOpacity={1}
                      onPress={() => searchInputRef.current?.focus()}
                      style={{
                        flexDirection: "row",
                        alignItems: "center",
                        backgroundColor: colors.surface,
                        borderRadius: 999,
                        borderCurve: "continuous",
                        overflow: "hidden",
                        paddingHorizontal: 16,
                        height: "100%",
                        gap: 8,
                      }}
                    >
                      {/* Büyüteç sabit — eskiden 20px scroll'da soluyordu
                          (çubuk da yok olduğu için), artık çubuğun hiçbir
                          parçası scroll'a tepki vermiyor. */}
                      <View style={{ flexShrink: 0 }}>
                        <SFIcon
                          name="magnifyingglass"
                          fallback={Search}
                          size={18}
                          color={colors.text}
                          strokeWidth={2}
                          weight="semibold"
                        />
                      </View>
                      {isActiveCell ? (
                        <TextInput
                          testID="msgs-search-input"
                          ref={searchInputRef}
                          defaultValue=""
                          onChangeText={setSearchQuery}
                          onFocus={() => {
                            setIsSearchActive(true);
                            // Aktivasyon anında da tepeye al — bar üst
                            // pozisyonuna giderken chat'ler de paralel olarak
                            // tepeye scroll'lansın.
                            listRef.current?.scrollToOffset({
                              offset: 0,
                              animated: true,
                            });
                          }}
                          placeholder=""
                          placeholderTextColor={colors.neutral500}
                          selectionColor={colors.text}
                          cursorColor={colors.text}
                          style={{
                            flex: 1,
                            color: colors.text,
                            fontSize: 18,
                            padding: 0,
                          }}
                        />
                      ) : (
                        // Görsel kopyanın boşluğu — gerçek input'un kapladığı
                        // yeri birebir tutuyor.
                        <View style={{ flex: 1 }} />
                      )}
                      {isActiveCell && searchQuery.length > 0 && (
                        <Animated.View
                          entering={ZoomIn.duration(180)}
                          exiting={ZoomOut.duration(150)}
                          style={{
                            position: "absolute",
                            right: 12,
                            top: 0,
                            bottom: 0,
                            justifyContent: "center",
                          }}
                        >
                          <TouchableOpacity
                            onPress={() => {
                              searchInputRef.current?.clear();
                              setSearchQuery("");
                            }}
                            hitSlop={10}
                            activeOpacity={1}
                            style={{
                              width: 22,
                              height: 22,
                              borderRadius: 11,
                              backgroundColor: ink(0.2),
                              alignItems: "center",
                              justifyContent: "center",
                            }}
                          >
                            <View pointerEvents="none">
                              <SFIcon
                                name="xmark"
                                fallback={X}
                                size={14}
                                color={colors.textSecondary}
                                strokeWidth={2}
                                weight="semibold"
                              />
                            </View>
                          </TouchableOpacity>
                        </Animated.View>
                      )}
                    </TouchableOpacity>
                  </View>
                </View>
              );
            })}
          </Animated.View>
        </View>
      </Animated.View>

      {/* Başlığın yanındaki pill'in hedefi. Satın alma sonrası ekranda elle
          tazelenecek bir şey yok: pill `usePremiumTier`ı okuyor, slice satın
          almada optimistic yükseliyor ve "Sınırlı" rozetleri de aynı bayrakla
          düşüyor. */}

      {/* Satıra basılı tutunca açılan menü — ChatScreen'deki 3 nokta menüsüyle
          AYNI bileşen, aynı proplar. Aksiyonlar sheet kapandıktan sonra
          `optionsConv` snapshot'ıyla çalışır (state o an null'a düşüyor). */}
      <ConversationOptionsSheet
        visible={!!optionsConv}
        onClose={() => setOptionsConv(null)}
        isActive={!!optionsConv?.isActive}
        // "Geri Al" YALNIZ eşleşmeyi kaldıran uçta çıkar; kapatan biz olsak
        // bile pencere KESİN yoksa çağrı reddedilirdi — ölü buton göstermiyoruz.
        canRestore={
          !!optionsConv &&
          !optionsConv.isActive &&
          shouldOfferRestore(
            optionsConv.restorableUntil,
            resolveClosedByMe(optionsConv),
          )
        }
        restorableUntil={optionsConv?.restorableUntil}
        // Kapatan biz değilsek "geri alma süresi doldu" YALAN olurdu (o uçta
        // pencere hiç açılmadı) — nötr "sohbet sonlandırıldı" metnine düşülür.
        closedByMe={resolveClosedByMe(optionsConv) === true}
        onUnmatch={() => optionsConv && handleSheetUnmatch(optionsConv)}
        onRestore={() => optionsConv && handleSheetRestore(optionsConv)}
        onReport={() => setReportConv(optionsConv)}
        onBlock={() => optionsConv && handleSheetBlock(optionsConv)}
      />
      <ReportModal
        visible={!!reportConv}
        onClose={() => setReportConv(null)}
        reportedUserId={reportConv?.partnerUserId}
        conversationId={reportConv?.conversationId}
        // Şikayet + engelleme aynı akışta yapıldıysa eşleşme KALICI kapanır.
        onSuccess={(result: any) => {
          if (!result?.blocked || !reportConv) return;
          dispatch(
            conversationDeactivated({
              conversationId: reportConv.conversationId,
              restorableUntil: null,
            }),
          );
          dispatch(fetchConversations({ force: true }));
        }}
      />
    </View>
  );
}

const ConversationRow = memo(function ConversationRow({
  conv,
  isTyping,
  isLimited,
  draft,
  voiceDurationMs,
  onOpen,
  onLongPress,
  // "Sınırlı" rozetinin dolgusu — SEÇİLİ MODUN vurgusu. Rozet bir MOD işareti
  // DEĞİL (kota işareti), ama ekranda duran yüzey kullanıcının içinde olduğu
  // modu yansıtmalı; gerekçe ekranın `accent` notunda.
  accent,
}: any) {
  const { t } = useTranslation();
  const isUnread = conv.unreadCount > 0;
  // Stabil parent callback'lerini conv'a bind ediyoruz — memo default shallowEqual
  // prop identity'sini onOpen/onLongPress üzerinden koruyabilsin diye.
  const handlePress = useCallback(() => onOpen(conv), [onOpen, conv]);
  const handleLongPress = useCallback(
    () => onLongPress(conv),
    [onLongPress, conv],
  );

  const subtitle = useMemo(() => {
    // className artık YALNIZ ağırlık taşıyor; renk `color` alanından geliyor
    // (tema ile döndüğü için className'de sabitlenemez).
    if (isTyping)
      return {
        kind: "text",
        text: t("chat.messages.typing"),
        className: "font-semibold",
        color: colors.text,
      };
    if (!conv.isActive)
      return {
        kind: "text",
        text: t("chat.messages.closedChat"),
        className: "",
        color: colors.textSecondary,
      };

    // Yazılıp gönderilmemiş metin son mesajın ÖNÜNE geçer (WhatsApp deseni):
    // kullanıcının bıraktığı iş, gelen mesajdan daha güncel bir bilgi.
    // Karşı taraf yazıyorsa (yukarıdaki dal) typing öncelikli kalır.
    if (draft)
      return {
        kind: "draft",
        text: draft.replace(/\s+/g, " ").trim(),
        className: "",
        color: colors.textSecondary,
      };

    const readClass = isUnread ? "font-semibold" : "";
    const readColor = isUnread ? colors.text : colors.textSecondary;
    const iconColor = isUnread ? colors.text : colors.textSecondary;

    // Sesli mesaj — "🎤 Sesli mesaj (1:21)". İkon composer'ın kayıt tuşuyla
    // AYNI sembol ("mic", dolgusuz): sohbette sesi başlatan simge ile listede
    // onu anlatan simge tek olsun.
    //
    // Kapı SÜRENİN KENDİSİ, `lastMessageContentType` DEĞİL: süre yalnız sesli
    // mesajda dolduruluyor (bkz. voiceDurationByConvId), yani dolu olması
    // zaten "son mesaj sesli" demek. Aşağıdaki `ct` dallarının önünde durması
    // da bilinçli — süreyi biliyorsak sunucunun hazır önizleme metni
    // ("Sesli mesaj") yerine süreli hâli yazılmalı.
    if (voiceDurationMs > 0)
      return {
        kind: "media",
        sf: "mic" as SFSymbol,
        icon: Mic,
        text: `${t("chat.messages.mediaVoice")} (${formatVoiceDuration(voiceDurationMs)})`,
        className: readClass,
        color: readColor,
        iconColor,
      };

    // Media (no text content) — icon + label
    //
    // SAYIYA ÇEVİRİLİYOR: aşağıdaki dallar `=== 2` diye soruyor ama bu alan
    // satırın KAYNAĞINA göre iki formatta gelebiliyordu — realtime yolu sayı
    // yazıyor (chatSlice.updateConversationLastMessage), /conversations yanıtı
    // ise wire enum'unu ("Voice") olduğu gibi taşıyor. Çevirmeden sorulunca
    // ağdan gelen sesli satır hiçbir dala girmiyor ve mikrofon etiketi yerine
    // düz metin önizlemesi çiziliyordu — süre de o satırda zaten yok.
    const ct = contentTypeToNumber(conv.lastMessageContentType);
    if (ct === 1)
      return {
        kind: "media",
        sf: "camera.fill" as SFSymbol,
        icon: CameraIcon,
        text: t("chat.messages.mediaPhoto"),
        className: readClass,
        color: readColor,
        iconColor,
      };
    // Süresi henüz çözülememiş sesli mesaj (bucket'ı olmayan sohbet): süre
    // yerine yalnız etiket, tazeleme dönünce yukarıdaki dala geçiyor.
    if (ct === 2)
      return {
        kind: "media",
        sf: "mic" as SFSymbol,
        icon: Mic,
        text: t("chat.messages.mediaVoice"),
        className: readClass,
        color: readColor,
        iconColor,
      };
    if (ct === 3)
      return {
        kind: "media",
        sf: "video.fill" as SFSymbol,
        icon: Video,
        text: t("chat.messages.mediaVideo"),
        className: readClass,
        color: readColor,
        iconColor,
      };

    if (!conv.lastMessagePreview) {
      return {
        kind: "text",
        text: t("chat.messages.startConversation"),
        className: "",
        color: colors.textSecondary,
      };
    }
    return {
      kind: "text",
      text: conv.lastMessagePreview,
      className: readClass,
      color: readColor,
    };
  }, [
    t,
    isTyping,
    draft,
    conv.lastMessagePreview,
    conv.lastMessageContentType,
    conv.isActive,
    isUnread,
    voiceDurationMs,
  ]);

  return (
    // ⚠️ SAĞA KAYDIRMA JESTİ KALDIRILDI. Satır sola çekilince unmatch / geri
    // alma şeridi çıkıyordu; o jest sekmeler arası yatay kaydırmayla (bkz.
    // PagerView) aynı parmak hareketini istiyor, ikisi bir arada yaşayamıyor.
    // Aksiyon KAYBOLMUYOR: şerit zaten kendi onayını atlamıyordu, `onLongPress`
    // akışını tetikliyordu — uzun basış aynı işi yapmaya devam ediyor.
    <TouchableHighlight
      // Kimlik conversationId'den: liste sırası okunmamışa ve son mesaja
      // göre değişiyor, indeks kararsız.
      testID={`msgs-row-${conv.conversationId ?? conv.id}`}
      onPress={handlePress}
      onLongPress={handleLongPress}
      underlayColor={colors.surface3}
      activeOpacity={1}
      style={{ backgroundColor: colors.bg }}
    >
      <View className="flex-row items-center px-4 py-2">
        <View>
          {conv.partnerProfileImageUrl ? (
            <Image
              source={{ uri: conv.partnerProfileImageUrl }}
              style={{ width: 56, height: 56, borderRadius: 28 }}
              cachePolicy="memory-disk"
              transition={350}
              contentFit="cover"
            />
          ) : (
            <View
              style={{
                width: 56,
                height: 56,
                borderRadius: 28,
                backgroundColor: colors.surface3,
                alignItems: "center",
                justifyContent: "center",
              }}
            >
              <Text
                className="text-xl font-bold"
                style={{ color: colors.text }}
              >
                {(conv.partnerDisplayName || "?").charAt(0).toUpperCase()}
              </Text>
            </View>
          )}
          {/* Online dot — yeşil noktanın altında sayfa arkaplanı renginde bir tık
              daha büyük ikinci bir daire: avatarla nokta arasında boşluk hissi
              verir (satır zemini de colors.bg olduğu için oyulmuş gibi durur). */}
          {conv.partnerIsOnline && (
            <View
              style={{
                position: "absolute",
                bottom: -2,
                right: -2,
                width: 18,
                height: 18,
                borderRadius: 9,
                backgroundColor: colors.bg,
                alignItems: "center",
                justifyContent: "center",
              }}
            >
              <View
                style={{
                  width: 12,
                  height: 12,
                  borderRadius: 6,
                  backgroundColor: colors.success,
                }}
              />
            </View>
          )}
        </View>

        <View className="flex-1 ml-3">
          <View className="flex-row items-center justify-between">
            {/* İsim + (varsa) kota rozeti tek bir daralabilir kolon: uzun isim
                rozeti satır dışına itmesin, kırpılacak olan isim olsun. */}
            <View
              style={{
                flexDirection: "row",
                alignItems: "center",
                flexShrink: 1,
                gap: 6,
              }}
            >
              <Text
                // Kapalı sohbette isim, "Sohbet kapatıldı" alt metniyle aynı tonda.
                className="text-[16px] font-semibold"
                style={{
                  flexShrink: 1,
                  color: conv.isActive ? colors.text : colors.textSecondary,
                }}
                numberOfLines={1}
              >
                {conv.partnerDisplayName || t("chat.defaultUserName")}
              </Text>
              {/* Kapalı sohbette çizilmiyor: oraya zaten mesaj atılamıyor,
                  rozet yalnız gürültü olurdu.
                  Dolgu/mürekkep Beğeniler'deki "Beğenenleri gör" pill'iyle
                  AYNI (mod vurgusu + onMediaInverse) — uygulamada "bu premium'a
                  bakıyor" dili tek. */}
              {isLimited && conv.isActive && (
                <View
                  style={{
                    flexShrink: 0,
                    borderRadius: 999,
                    borderCurve: "continuous",
                    backgroundColor: accent,
                    paddingHorizontal: 8,
                    paddingVertical: 2,
                  }}
                >
                  <Text
                    style={{
                      color: colors.onMediaInverse,
                      fontSize: 11,
                      fontWeight: "700",
                    }}
                  >
                    {t("chat.messages.limitedQuota")}
                  </Text>
                </View>
              )}
            </View>
            {conv.lastMessageAt && (
              <Text
                className="text-[16px] font-normal ml-2"
                style={{ color: colors.textMuted }}
              >
                {formatRelativeTime(conv.lastMessageAt, t)}
              </Text>
            )}
          </View>

          <View className="flex-row items-center justify-between mt-1">
            {subtitle.kind === "media" ? (
              <View
                className="flex-row items-center"
                style={{ flex: 1, gap: 4 }}
              >
                <SFIcon
                  name={subtitle.sf}
                  fallback={subtitle.icon}
                  size={14}
                  color={subtitle.iconColor}
                  strokeWidth={2}
                  weight="semibold"
                />
                <Text
                  className={`text-[14px] ${subtitle.className}`}
                  numberOfLines={1}
                  style={{ flex: 1, color: subtitle.color }}
                >
                  {subtitle.text}
                </Text>
              </View>
            ) : subtitle.kind === "draft" ? (
              // "Taslak:" etiketi accent renkte, metin normal tonda — iç içe Text,
              // tek satırda kesilme (numberOfLines) etikete de uygulanır.
              // Renk primary (#ff4d3d) DEĞİL messageOwn (#ff3d3d): bir tık daha
              // kırmızı ve satırın sağındaki okunmamış noktasıyla aynı ton.
              <Text
                className="text-[14px]"
                numberOfLines={1}
                style={{ flex: 1, color: subtitle.color }}
              >
                <Text style={{ color: colors.messageOwn, fontWeight: "600" }}>
                  {t("chat.messages.draft")}
                </Text>{" "}
                {subtitle.text}
              </Text>
            ) : (
              <Text
                className={`text-[14px] ${subtitle.className}`}
                numberOfLines={1}
                style={{ flex: 1, color: subtitle.color }}
              >
                {subtitle.text}
              </Text>
            )}

            {conv.unreadCount > 0 && (
              <View
                className="ml-2 rounded-full self-center"
                style={{
                  backgroundColor: colors.messageOwn,
                  width: 10,
                  height: 10,
                }}
              />
            )}
          </View>
        </View>
      </View>
    </TouchableHighlight>
  );
});

// `formatRelativeTime`ın YEREL KOPYASI SİLİNDİ → @/shared/utils (üstteki
// import). Kopya, util çıkarıldığında geride kalmıştı ve kuralları birebir
// aynıydı; tek farkı gün adı/tarih locale'ini `"tr-TR"` sabitlemesiydi, yani
// İngilizce'de sohbet satırları "Salı"/"Tuesday" yerine hep Türkçe gün adı
// basıyordu (bkz. i18n/dateLocale.ts'in kendi uyarısı). Util `getDateLocale()`
// kullanıyor. Saat dalı DEĞİŞMEDİ: o kasıtlı olarak dilden bağımsız 24 saat,
// yani TR'de davranış birebir aynı kalıyor.
