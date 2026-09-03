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
import chatService from "@/features/chat/chatService";
import { useDrafts } from "@/features/chat/draftStore";
import {
  formatVoiceDuration,
  isVoiceMessage,
} from "@/features/chat/voiceMessage";
import {
  formatRestoreWindow,
  shouldOfferRestore,
} from "@/features/chat/restoreWindow";
import ConversationOptionsSheet from "@/features/chat/components/ConversationOptionsSheet";
import ReportModal from "@/shared/components/ReportModal";
import moderationService from "@/shared/services/moderationService";
import { showInfoToast } from "@/shared/services/toaster";
import { parseUtc } from "@/shared/utils/dateUtc";
import { store } from "@/shared/store";
import EmptyState from "@/shared/components/EmptyState";
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
import { openLitPlus } from "@/features/profile/litPlusEntry";
import { usePremiumTier } from "@/features/profile/premiumTier";
import { colors, ink, veil } from "../../../shared/theme/colors";
import { chromeBlurTint } from "@/shared/theme/blur";

// Native bottom tab bar ölçüleri — DiscoverScreen ile aynı değerler.
const TAB_BAR_HEIGHT = 64;
const TAB_BAR_BOTTOM_GAP = -10;
const LIST_BOTTOM_GAP = 16;

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

export default function MessagesScreen() {
  const { t } = useTranslation();
  const dispatch = useAppDispatch();
  const navigation = useNavigation();
  const insets = useSafeAreaInsets();
  // Başlık/arama şeridinin bir sayfası tam ekran genişliğinde — kayma miktarı
  // pager'ın sayfa genişliğiyle BİREBİR olmalı, yoksa üstteki blok sayfalardan
  // hızlı/yavaş kayar. Sabit değil hook: dönme ve iPad split view'da değişiyor.
  const { width: SCREEN_W } = useWindowDimensions();

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
  const conversationsSettled = useAppSelector(
    (s) =>
      ((s as any).chat._conversationsFetchedAt ?? 0) > 0 ||
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
  // taşıyor). Kaynak yerel mesaj bucket'ı: canlı mesajla (receiveMessage
  // unshift ediyor), history fetch'iyle doluyor ve persist ediliyor
  // (chatPersistTransform) → soğuk açılışta da dolu.
  const messagesByConv = useAppSelector((s) => (s as any).chat.messagesByConv);
  // typingByConv ile aynı gerekçe: satırlara PRIMITIVE iniyor (yalnız süre),
  // böylece memo'lu ConversationRow alakasız değişimde render etmiyor. Kutu
  // referansı her mesaj dispatch'inde değişiyor ama zaten `conversations` da
  // değişiyor — ekran o yüzden fazladan render almıyor.
  const voiceDurationByConvId = useMemo(() => {
    const m: Record<string, number> = {};
    for (const c of conversations || []) {
      // ⚠️ `lastMessageContentType`e BAKILMIYOR — bilerek. Süre yalnız sesli
      // mesajda dolduğu için mesajın kendi tipi zaten yeterli kanıt, üstelik
      // liste DTO'sundaki alan (satırın ikon/etiket seçiminde kullandığı)
      // eksik ya da isim ("Voice") olarak gelebiliyor; ona kapı yapmak süreyi
      // sessizce hiç çözmemek demekti.
      //
      // Sunucu bir gün süreyi liste DTO'sunda gönderirse hiçbir yerel çıkarıma
      // gerek kalmaz — geldiği gün bu satır devreye girer.
      if (c.lastMessageDurationMs > 0) {
        m[c.conversationId] = c.lastMessageDurationMs;
        continue;
      }
      const msgs = messagesByConv?.[c.conversationId]?.messages;
      if (!msgs?.length) continue;
      // Mesajı DAMGADAN buluyoruz, "bucket'ın ilk elemanı" varsayımıyla değil:
      // ilk sırada silinmiş bir satır olabiliyor ve bucket satırdan eski
      // olabiliyor (uygulama kapalıyken gelen mesaj — liste DTO'su güncel,
      // history değil). Damga tutmuyorsa süre ÇÖZÜLMEMİŞ sayılır: başka bir
      // sesli mesajın süresini yazmak yanlış bilgi olur, aşağıdaki tazeleme
      // onu düzeltir.
      const convAt = c.lastMessageAt ? parseUtc(c.lastMessageAt).getTime() : 0;
      const last = convAt
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
      if (!last) continue;
      if (!isVoiceMessage(last.contentType)) continue;
      if (!(last.durationMs > 0)) continue;
      m[c.conversationId] = last.durationMs;
    }
    return m;
  }, [conversations, messagesByConv]);

  // Süresi çözülemeyen sesli sohbetler için HEDEFLİ history tazelemesi —
  // "süre her zaman yazsın" ancak böyle garanti oluyor.
  //
  // Neden ayrı bir geçiş, neden aşağıdaki genel prefetch yetmiyor: o prefetch
  // yalnız BOŞ bucket'ları dolduruyor (boot fan-out'u küçük tutmak için
  // bilinçli) ve ilk 15 sohbetle sınırlı. Uygulama kapalıyken gelen sesli
  // mesajda bucket dolu ama bayat → prefetch atlıyor, süre hiç gelmiyordu.
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
          pageSize: 30,
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
  const DESC_LINE_HEIGHT = 22;
  const DESC_MARGIN_TOP = 2;
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
  // spacer'ı buradan türüyor — ayrıca elle düşürülmemeli.
  const SEARCH_BAR_HEIGHT = 40;
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
  // pt-0.5 (2) + bar + altında 12 nefes. Üst pay başlığa yaklaşmak için
  // pt-3'ten (12) 2'ye indi; satır da onunla birlikte 10 kısaldı.
  const SEARCH_ROW_INTRINSIC = 14 + SEARCH_BAR_HEIGHT;
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
  const HEADER_TOP_ACTIVE = insets.top + 8;
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
  // sekme değiştirmek aramayı sıfırlamıyor.
  const conversationsByTab = useMemo(() => {
    const q = searchQuery.trim().toLowerCase();
    const matches = (c: any) =>
      !q || (c.partnerDisplayName || "").toLowerCase().includes(q);
    const all = [];
    const unread = [];
    const closed = [];
    for (const c of conversations) {
      if (!matches(c)) continue;
      if (!c.isActive) {
        closed.push(c);
        continue;
      }
      all.push(c);
      if (c.unreadCount > 0) unread.push(c);
    }
    return { all, unread, closed };
  }, [conversations, searchQuery]);

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
    for (const c of conversations) {
      if (!c.isActive) {
        closed += 1;
        continue;
      }
      all += 1;
      if (c.unreadCount > 0) unread += 1;
    }
    return { all, unread, closed };
  }, [conversations]);

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

  // WhatsApp davranışı — chat'e girince mesajlar anında gelsin.
  // Conversations yüklenir yüklenmez ilk N sohbetin mesaj history'sini
  // arka planda Redux'a doldur. ChatScreen mount olduğunda bucket dolu
  // → blank ekran/spinner yok. Her conversationId için tek seferlik
  // prefetch (ref ile dedup) — yeni mesaj geldikçe re-trigger olmasın.
  const prefetchedHistoryRef = useRef(new Set());
  useEffect(() => {
    if (!conversations?.length) return;
    conversations.slice(0, 15).forEach((conv) => {
      if (prefetchedHistoryRef.current.has(conv.conversationId)) return;
      // MMKV hydrate sonrası bucket zaten doluysa network'e GEREK YOK —
      // ChatScreen açılışta kendi arka plan reconcile fetch'ini yapıyor.
      // store.getState() ile oku (subscribe etme → messagesByConv değişimleri
      // bu effect'i re-trigger etmesin). Net: boot fan-out 15 istekten yalnız
      // gerçekten boş sohbetlere (tipik: yeni match) düşer.
      const bucket = (store.getState() as any).chat.messagesByConv[
        conv.conversationId
      ];
      if (bucket?.messages?.length) {
        prefetchedHistoryRef.current.add(conv.conversationId);
        return;
      }
      prefetchedHistoryRef.current.add(conv.conversationId);
      dispatch(
        fetchHistory({
          conversationId: conv.conversationId,
          cursor: null,
          pageSize: 30,
        }),
      );
    });
  }, [conversations, dispatch]);

  const openChat = useCallback(
    (conv) => {
      dispatch(setActiveConversation(conv.conversationId));
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
      } catch {
        Alert.alert(t("common.error"), t("chat.unmatch.error"));
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
      } catch {
        Alert.alert(t("common.error"), t("chat.unmatch.restoreFailed"));
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
        Alert.alert(
          t("common.error"),
          err?.response?.data?.message || t("chat.block.error"),
        );
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
      />
    ),
    [
      isTypingByConvId,
      isLimitedByConvId,
      drafts,
      voiceDurationByConvId,
      handleRowOpen,
      handleRowLongPress,
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
          isSearchActive && searchQuery.trim().length > 0 ? (
            <View className="flex-1 items-center justify-center pb-[60%] px-8">
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
                  onButtonPress={() => navigation.navigate("Discover")}
                />
              </View>
            )
          ) : null
        }
      />
    );
  };

  return (
    <View className="flex-1" style={{ backgroundColor: colors.bg }}>
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
                    // Beğeniler'deki pill'le AYNI (litPlus + onMediaInverse):
                    // uygulamada "bu premium'a bakıyor" dili tek. Yazı `text`
                    // olamaz — açık modda beyaza döner ve dolgunun üstünde
                    // kaybolur.
                    <AnimatedPressable
                      pressScale={0.96}
                      onPress={() => openLitPlus()}
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
                    fontSize: 16,
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
          // pt-0.5 (2) — başlıkla çubuk arası: 14 (pt-3) → 10 (pt-2) → 6
          // (pt-1) → 4. Toplam pay bu sayı + TITLE_HEIGHT'in yazı üstündeki
          // 2'lik artığı. Daha da kısaltmak için TITLE_HEIGHT'e girmek gerekir
          // ki orada `overflow: hidden` var — büyük yazı ölçeğinde kırpar.
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
                  className="px-4 pt-0.5 flex-row items-center"
                  style={{ width: SCREEN_W, height: "100%" }}
                >
                  {/* Chevron YALNIZ aktif hücrede: yalnız arama açıkken
                      görünüyor ve o sırada sayfa değiştirilmiyor. */}
                  {isActiveCell && (
                    <Animated.View
                      style={chevronAnimStyle}
                      pointerEvents={isSearchActive ? "auto" : "none"}
                    >
                      <TouchableOpacity
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
            optionsConv.deactivatedByMe,
          )
        }
        restorableUntil={optionsConv?.restorableUntil}
        // Kapatan biz değilsek "geri alma süresi doldu" YALAN olurdu (o uçta
        // pencere hiç açılmadı) — nötr "sohbet sonlandırıldı" metnine düşülür.
        closedByMe={optionsConv?.deactivatedByMe === true}
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
    const ct = conv.lastMessageContentType;
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
                  AYNI (litPlus + onMediaInverse) — uygulamada "bu premium'a
                  bakıyor" dili tek. */}
              {isLimited && conv.isActive && (
                <View
                  style={{
                    flexShrink: 0,
                    borderRadius: 999,
                    borderCurve: "continuous",
                    backgroundColor: colors.litPlus,
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

function formatRelativeTime(iso, t) {
  if (!iso) return "";
  // Server damgası Z'siz gelebiliyor (kontrat §8.3) — bkz. shared/utils/dateUtc.ts.
  const d = parseUtc(iso);
  const now = new Date();

  const startOfDay = (date) =>
    new Date(date.getFullYear(), date.getMonth(), date.getDate());
  const dayDiff = Math.floor(
    (startOfDay(now).getTime() - startOfDay(d).getTime()) /
      (1000 * 60 * 60 * 24),
  );

  if (dayDiff <= 0) {
    return d.toLocaleTimeString("tr-TR", {
      hour: "2-digit",
      minute: "2-digit",
    });
  }
  if (dayDiff === 1) return t("chat.messages.yesterday");
  if (dayDiff < 7) {
    return d.toLocaleDateString("tr-TR", { weekday: "long" });
  }
  return d.toLocaleDateString("tr-TR", { day: "2-digit", month: "2-digit" });
}
