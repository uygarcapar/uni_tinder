import {
  useState,
  useRef,
  useEffect,
  useMemo,
  Children,
  Fragment,
  isValidElement,
} from "react";
import {
  View,
  Text,
  TouchableOpacity,
  ActivityIndicator,
  Alert,
  BackHandler,
  Linking,
  Platform,
  Share,
  Switch,
  Pressable,
  StyleSheet,
  useWindowDimensions,
} from "react-native";
import Animated, {
  Easing,
  runOnJS,
  useAnimatedScrollHandler,
  useAnimatedStyle,
  useDerivedValue,
  useSharedValue,
  withTiming,
} from "react-native-reanimated";
import { Gesture, GestureDetector } from "react-native-gesture-handler";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { useNavigation } from "@react-navigation/native";
import * as Clipboard from "expo-clipboard";
import { useSelector } from "react-redux";
import { useAppDispatch } from "@/shared/hooks/redux";
import { useTranslation } from "react-i18next";
import { Host, Button as SwiftUIButton, Image as SwiftUIImage } from "@expo/ui/swift-ui";
import {
  buttonStyle,
  tint,
  frame,
  accessibilityLabel,
} from "@expo/ui/swift-ui/modifiers";
import ScreenHeader, {
  SCREEN_HEADER_TITLE_HEIGHT,
} from "@/shared/components/ScreenHeader";
import { glassFallback, glassIconClearGlyph, GLASS_ICON_CLEAR_SIZE } from "@/shared/theme/glass";
import GlassFallbackSurface from "@/shared/components/GlassFallbackSurface";
import {
  Download,
  Trash2,
  Eye,
  BellOff,
  InfoIcon,
  ChevronLeft,
  ChevronRight,
  KeyRound,
  Mail,
  LogOut,
  Sun,
  Moon,
  SunMoon,
  Camera,
  MessageSquareText,
  MessageCircle,
  ShieldCheck,
  Globe,
  CircleUser,
} from "@/shared/icons";
import SFIcon from "@/shared/components/SFIcon";
import {
  useThemePreference,
  setThemePreference,
  onBeforeThemeSwap,
  type ThemePreference,
} from "@/shared/theme/themeMode";
import BlockedUsersModal from "@/features/profile/components/BlockedUsersModal";
import { openLitPlus } from "@/features/profile/litPlusEntry";
import { usePremiumTier } from "@/features/profile/premiumTier";
import api from "@/shared/services/api";
import { API_ENDPOINTS } from "@/shared/constants/api";
import {
  MAPBOX_ATTRIBUTION_URL,
  OSM_COPYRIGHT_URL,
} from "@/shared/constants/mapbox";
import chatService from "@/features/chat/chatService";
import profileService from "@/features/profile/profileService";
import { logout } from "@/features/auth/authSlice";
import { shortNetError } from "@/shared/utils/netError";
import {
  buildIapReport,
  clearIapDiagnostics,
} from "@/features/profile/purchaseDiagnostics";
import {
  premiumSyncUserKey,
  readPendingPremiumSync,
} from "@/features/profile/pendingPremiumSync";
import { readPendingRedeems } from "@/features/discover/superlikeRedeem";
import { colors, ink, scrimAt } from "../../../shared/theme/colors";
import {
  setLanguage,
  resolveLanguage,
  type LanguagePreference,
} from "@/shared/store/settingsSlice";
import i18n from "@/shared/i18n";
import { getDateLocale } from "@/shared/i18n/dateLocale";
import {
  noteServerLanguage,
  refreshLocalizedCaches,
} from "@/shared/i18n/serverLanguage";
import type { RootState } from "@/shared/store";

// ── Veri export'u: gövde okuma yardımcıları ─────────────────────────────────
//
// Export uçları ResponseDto sarmalayıcısını ve alan isimlerini tutarlı
// kullanmıyor: status değeri PascalCase ("Completed"), dosya bağlantısı
// sürüme göre fileUrl/downloadUrl/url olabiliyor, gövde bazen `result`
// altında bazen düz geliyor. Sabit `result.status` + `result.fileUrl` okuması
// bunlardan biri kaydığında HİÇBİR turu "tamamlandı" saymıyordu: dosya hazır
// olup bildirim merkezine düşmesine rağmen ekran 5 dakika dönüp
// "veri hazırlanamadı" hatasıyla bitiriyordu. Bu yüzden okuma esnek.

/** Alanı kasadan bağımsız oku — camelCase ↔ PascalCase ikisi de tutar. */
const readField = (obj: any, ...names: string[]) => {
  if (!obj || typeof obj !== "object") return undefined;
  const byLower = new Map(Object.keys(obj).map((k) => [k.toLowerCase(), k]));
  for (const name of names) {
    const key = byLower.get(name.toLowerCase());
    if (key !== undefined && obj[key] !== undefined && obj[key] !== null) {
      return obj[key];
    }
  }
  return undefined;
};

/** ResponseDto sarmalayıcısını soy; düz gövde gelirse olduğu gibi bırak. */
const exportBody = (res: any) => readField(res, "result", "data") ?? res ?? {};

const EXPORT_DONE = ["completed", "complete", "ready", "done", "success", "succeeded", "finished"];
const EXPORT_FAILED = ["failed", "failure", "error", "cancelled", "canceled", "expired"];

const exportFileUrl = (body: any): string | null => {
  const raw = readField(body, "fileUrl", "downloadUrl", "url", "fileUri", "exportUrl", "link");
  return typeof raw === "string" && /^https?:\/\//i.test(raw) ? raw : null;
};

// Kök listedeki kategoriler ve sıraları. Metinler zaten var:
// `settings.<key>.title` / `settings.<key>.subtitle` — bölüm başlıkları
// eskiden de bu anahtarlardan çiziliyordu.
const SECTION_KEYS = ["messaging", "privacy", "theme", "language", "account"] as const;
type SectionKey = (typeof SECTION_KEYS)[number];

/** Kategori sayfası giriş/çıkış eğrisi — girişte 260ms, çıkışta 240ms. */
const PAGE_EASING = Easing.out(Easing.cubic);
/** Sol kenardan geri çekişin kabul edildiği bant (pt). */
const EDGE_HIT = 44;

/**
 * Kategori sayfası tam açıkken alttaki kök listenin üstündeki karartmanın
 * en koyu hâli. iOS'un push/pop perdesiyle aynı iş: parallax tek başına
 * "hangisi üstte" sorusunu tam söylemiyor, alttaki kademe geri çekilirken
 * ışığını da kaybetmeli.
 */
const ROOT_DIM_MAX = 0.25;

/**
 * Kök listedeki kategori ikonları — tema chip'leriyle aynı SF + lucide çifti.
 *
 * Tamamı ÇİZGİSEL (outline) varyant, dolu değil: dolu gliflerin siluetleri
 * satır etiketinin yanında birer mürekkep lekesi gibi ağır basıyordu. Çizgi
 * varyantı hem Android'deki lucide fallback'iyle (lucide zaten yalnız outline)
 * aynı ağırlıkta okunuyor hem de sağdaki chevron'un ince çizgisiyle uyumlu.
 * Yeni bir kategori eklerken `.fill` sonekli sembol SEÇME.
 */
const SECTION_ICONS: Record<
  SectionKey,
  { sf: React.ComponentProps<typeof SFIcon>["name"]; lucide: typeof Globe }
> = {
  // Mesajlar sekmesiyle AYNI glif (bkz. navigation/TabNavigator, SF `message`):
  // ayarlardaki kategori ile sekme aynı kavramı gösteriyor, iki farklı baloncuk
  // çizmesin.
  messaging: { sf: "message", lucide: MessageCircle },
  privacy: { sf: "lock.shield", lucide: ShieldCheck },
  // Görünüm sembolünün çizgisel karşılığı YOK — `circle.lefthalf.filled` zaten
  // çizili bir çemberin yarısını boyuyor, dolu bir siluet değil. iOS'un kendi
  // "Görünüm" glifi de bu.
  theme: { sf: "circle.lefthalf.filled", lucide: SunMoon },
  language: { sf: "globe", lucide: Globe },
  account: { sf: "person.crop.circle", lucide: CircleUser },
};

/**
 * Tema takasında ağacın tamamı remount ediliyor (App.tsx `key={mode}`), yani bu
 * ekranın state'i de sıfırlanıyor — Görünüm sayfasından tema değiştiren
 * kullanıcı kök listeye düşüyordu. Navigasyon YIĞINI aynı kancayla zaten
 * korunuyor (bkz. AppNavigator/themeSwapNavState); ekranın İÇİNDEKİ kademe de
 * korunmalı, aksi halde yığın doğru ekrana dönse bile kullanıcı bir kademe
 * geriye atılmış oluyor.
 *
 * TEK KULLANIMLIK ve yalnız tema takasında yazılıyor: ekrandan normal çıkışta
 * (pop) dokunulmadığı için "Ayarlar'ı yeniden aç, kategori açık gelsin" gibi bir
 * yan etki doğmuyor.
 */
let themeSwapSection: SectionKey | null = null;

export default function SettingsScreen() {
  const { t } = useTranslation();
  const dispatch = useAppDispatch();
  const navigation = useNavigation<any>();
  const insets = useSafeAreaInsets();
  // `languagePreference` yeni bir alan: persist'te bu anahtarı taşımayan eski
  // kullanıcılarda undefined gelir. O durumda çözülmüş dile düşüyoruz — daha
  // önce Türkçe/English seçmiş kullanıcı chip'i "Sistem" işaretli görmesin.
  const languagePreference = useSelector(
    (s: RootState) =>
      s.settings?.languagePreference ?? s.settings?.language ?? 'tr',
  );
  const authUser = useSelector((s: RootState) => s.auth?.user);
  const subscription = useSelector((s: RootState) => s.subscription);
  // Gating YALNIZ buradan (bkz. premiumTier.ts) — `subscription.isPremium`i
  // doğrudan okumak aşağıdaki kilit için yeterli değil, `resolved` penceresi de
  // gerekiyor.
  const { isPremium, resolved: premiumResolved } = usePremiumTier();

  const [downloadLoading, setDownloadLoading] = useState(false);
  const [deleteLoading, setDeleteLoading] = useState(false);
  const [blockedVisible, setBlockedVisible] = useState(false);
  /**
   * null = kök liste (5 kategori); dolu = o kategorinin satırları.
   *
   * Başlangıç değeri tema takası snapshot'ından geliyor (bkz. themeSwapSection):
   * normal açılışta her zaman null, yalnız tema değişimi remount'unda açık
   * kategori geri yükleniyor.
   */
  const [section, setSection] = useState<SectionKey | null>(
    () => themeSwapSection,
  );
  const sectionRef = useRef<SectionKey | null>(section);
  useEffect(() => {
    sectionRef.current = section;
  }, [section]);
  // Snapshot'ı mount'tan hemen sonra tüket: initializer'da silmek StrictMode'un
  // çift render'ında değeri ikinci çağrıdan önce yok ederdi.
  useEffect(() => {
    themeSwapSection = null;
    return onBeforeThemeSwap(() => {
      themeSwapSection = sectionRef.current;
    });
  }, []);
  const [prefs, setPrefs] = useState(null);
  const pollingRef = useRef(null);
  /** Her yeni export turu nesli ilerletir; eski tur cevabı dönerse yok sayılır. */
  const pollGenRef = useRef(0);

  // Notification preferences — mount'ta bir kez. Ayarlar artık kalıcı mount
  // edilen bir modal DEĞİL, stack'e itilen bir ekran: mount'un kendisi zaten
  // "kullanıcı ayarları açtı" demek. (Modal hâlindeyken iki yerde — ProfileScreen
  // + AppNavigator — gizli mount edildiği için cold-boot'ta bu istek ×2
  // atılıyordu; `visible` gate'i onun içindi, artık gereksiz.)
  useEffect(() => {
    let cancelled = false;
    chatService.getNotificationPreferences()
      .then((p) => { if (!cancelled) setPrefs(p); })
      .catch(() => {});
    return () => { cancelled = true; };
  }, []);

  // Poll'u durdurmanın TEK yolu: timer'ı temizle + nesli ilerlet. Nesil sayacı
  // olmadan uçuşta olan bir status isteği durdurulduktan sonra geri dönüp
  // spinner'ı yeniden kapatabiliyor ya da yeni turu iptal edebiliyordu.
  const stopExportPolling = () => {
    pollGenRef.current++;
    if (pollingRef.current) {
      clearTimeout(pollingRef.current);
      pollingRef.current = null;
    }
  };

  // Export polling'i unmount'ta durdur — ekrandan çıkılınca timer arkada
  // dönmeye devam ediyordu. Ekran pop'lanınca component gerçekten düşüyor, yani
  // "kapanınca ayrıca durdur" + "her açılışta kök listeye dön" kancalarına artık
  // gerek yok: her giriş taze mount, state zaten başlangıç değerinde.
  useEffect(() => () => stopExportPolling(), []);

  // ── Header ────────────────────────────────────────────────────────────────
  // Başlık ve progressive blur scroll'a bağlı beliriyor (bkz. ScreenHeader) —
  // modal hâlindeyken bu iş AppModal'ın içindeydi, sayfada scroll'u biz sürmek
  // zorundayız.
  // İki kademenin kendi scroll'u var (ayrı liste, ayrı yükseklik, ayrı konum) —
  // header'ın blur'u hangisi ekrandaysa onu izlemeli. Seçim `pageX`ten türüyor:
  // kategori sayfası ekranın yarısından fazlasını kapladıysa o kademedeyiz.
  // Sürükleme sırasında da doğru: blur, elin bıraktığı yere göre değil, gözün
  // gördüğü sayfaya göre karar veriyor.
  const rootScrollY = useSharedValue(0);
  const sectionScrollY = useSharedValue(0);
  const rootScrollHandler = useAnimatedScrollHandler({
    onScroll: (e) => {
      rootScrollY.value = e.contentOffset.y;
    },
  });
  const sectionScrollHandler = useAnimatedScrollHandler({
    onScroll: (e) => {
      sectionScrollY.value = e.contentOffset.y;
    },
  });

  // ── Kategori sayfası geçişi ───────────────────────────────────────────────
  // Native stack'in push/pop'unun aynısı, ekranın İÇİNDE: iki kademe de aynı
  // anda ekranda duruyor ve BİRLİKTE kayıyor — kategori sayfası sağdan gelir,
  // kök liste altında %30 parallax'la sola çekilir. Sol kenardan çekişte de
  // ikisi parmakla beraber hareket ediyor.
  //
  // ÖNCESİ kök listeyi unmount ediyordu: kategori düz zemin üzerinde kayıyordu,
  // geri çekerken solda gelen sayfa görünmüyor, ancak jest bitince beliriyordu.
  // Bu yüzden iki kademe artık AYRI, tam ekran, kendi scroll'u olan iki kutu
  // (bkz. rootScrollY / sectionScrollY) — tek bir listenin içeriğini takas
  // etmekle bu görüntü elde edilemiyor.
  //
  // Tek bir shared value (`pageX`) hem animasyonu hem sürüklemeyi taşıyor, o
  // yüzden yarım kalan bir çekiş kesintisiz olarak animasyona devrediliyor.
  // `screenW` = kategori sayfası tam ekran dışında (kök kademe).
  //
  // Başlangıç değeri `section`e bakıyor: tema takasından geri yüklenen açık
  // kategori YERİNDE açılmalı (0), sağdan tekrar kaymamalı — mount'taki giriş
  // efekti (aşağıdaki useEffect) o durumda 0'dan 0'a gidip görsel olarak
  // sessiz kalıyor.
  const { width: screenW } = useWindowDimensions();
  const pageX = useSharedValue(section ? 0 : screenW);
  /** Çekiş ekranın sol kenarından mı başladı — yalnız o zaman geri götürür. */
  const fromEdge = useSharedValue(0);

  const headerScrollY = useDerivedValue(() =>
    pageX.value < screenW / 2 ? sectionScrollY.value : rootScrollY.value,
  );

  const openSection = (key: SectionKey) => {
    // State'ten ÖNCE: mount anındaki ilk stil hesabı bu değeri okuyor, yoksa
    // sayfa bir kare yerinde görünüp sonra sağa zıplardı.
    pageX.value = screenW;
    setSection(key);
  };

  useEffect(() => {
    if (section) pageX.value = withTiming(0, { duration: 260, easing: PAGE_EASING });
  }, [section]);

  const closeSection = () => {
    pageX.value = withTiming(
      screenW,
      { duration: 240, easing: PAGE_EASING },
      (finished) => {
        // Unmount animasyon BİTİNCE: state hemen sıfırlansaydı sayfa ekranda
        // dururken header "Geri"yi kaybeder, kök liste altında belirirdi.
        if (finished) runOnJS(setSection)(null);
      },
    );
  };

  const pageStyle = useAnimatedStyle(() => ({
    transform: [{ translateX: pageX.value }],
  }));

  // Alttaki kademe: üsttekinin katettiği yolun %30'u kadar sola. iOS'un
  // push/pop parallax oranı — iki sayfa aynı hızda kaysaydı tek bir uzun şerit
  // gibi okunur, hangisinin üstte olduğu kaybolurdu.
  const rootStyle = useAnimatedStyle(() => ({
    transform: [{ translateX: -(screenW - pageX.value) * 0.3 }],
  }));

  // Karartma da parallax'la AYNI kaynaktan (`pageX`) türüyor: girişte 260ms
  // boyunca koyulaşıyor, çıkışta 240ms boyunca açılıyor, kenardan çekerken de
  // parmağın katettiği yola birebir bağlı — üç davranışı ayrı ayrı yazmaya
  // gerek yok, hepsi tek değerin sonucu. Yarım bırakılan bir çekiş de bu
  // yüzden kesintisiz devam ediyor.
  //
  // Clamp ŞART: çekiş ekran genişliğini aşabiliyor (`translationX` sınırsız),
  // clamp'siz opacity negatife düşerdi.
  const rootDimStyle = useAnimatedStyle(() => ({
    opacity:
      Math.min(1, Math.max(0, (screenW - pageX.value) / screenW)) * ROOT_DIM_MAX,
  }));

  // failOffsetY: dikey hareket bunu düşürür → liste scroll'u önceliğini korur.
  // activeOffsetX yalnız sağa (geri yönü).
  //
  // ⚠️ Yalnız kategori içinde AÇIK. Kökte kapalı olmalı: orada kenardan çekiş
  // native stack'in kendi pop'u (bkz. gestureEnabled), ikisi aynı anda açıkken
  // aynı parmak hareketini paylaşırlardı.
  const backGesture = useMemo(
    () =>
      Gesture.Pan()
        .enabled(section !== null)
        .activeOffsetX(16)
        .failOffsetY([-14, 14])
        .onBegin((e) => {
          fromEdge.value = e.x <= EDGE_HIT ? 1 : 0;
        })
        .onUpdate((e) => {
          if (!fromEdge.value) return;
          // Sola çekiş yok: sayfa yerinden ileri gitmez.
          pageX.value = Math.max(0, e.translationX);
        })
        .onEnd((e) => {
          if (!fromEdge.value) return;
          const commit = e.translationX > screenW * 0.32 || e.velocityX > 700;
          if (commit) {
            pageX.value = withTiming(
              screenW,
              { duration: 200, easing: PAGE_EASING },
              (finished) => {
                if (finished) runOnJS(setSection)(null);
              },
            );
          } else {
            pageX.value = withTiming(0, { duration: 180, easing: PAGE_EASING });
          }
        }),
    [screenW, section],
  );

  // Geri = bir kademe. Kategori açıkken kök listeye, kökte ekrandan çıkışa.
  const goBack = () => {
    if (section) closeSection();
    else navigation.goBack();
  };

  // ⚠️ Kategori açıkken native stack'in KENDİ kenar jesti kapatılıyor: iki pan
  // da ekranın sol kenarında başlıyor ve native olan öncelikli — kategori içinde
  // kenardan çekiş, bir kademe yukarı çıkmak yerine Ayarlar'ı tümden pop'luyordu.
  useEffect(() => {
    navigation.setOptions({ gestureEnabled: !section });
  }, [navigation, section]);

  // Android donanım tuşu da aynı kademeyi izlesin — aksi halde kategori
  // içindeyken tek basışta ekranın tamamı kapanırdı.
  useEffect(() => {
    if (!section) return;
    const sub = BackHandler.addEventListener("hardwareBackPress", () => {
      closeSection();
      return true;
    });
    return () => sub.remove();
  }, [section]);

  const togglePref = async (field) => {
    if (!prefs) return;
    const next = { ...prefs, [field]: !prefs[field] };
    setPrefs(next); // optimistic
    try {
      await chatService.updateNotificationPreferences(next);
    } catch {
      setPrefs(prefs);
      Alert.alert(t('errors.generic'), t('errors.prefUpdate'));
    }
  };

  // Arayüz dili i18n ile ANINDA değişiyor. Sunucudan gelen metinler (kartlardaki
  // hobiler, `*Display` alanları, prompt başlıkları, ortak nokta etiketleri) ise
  // ÇEKİLDİĞİ ANDAKİ dile göre sunucuda çözülmüş tek dilli string — yeniden
  // çekilmedikçe eski dilde kalıyor ve kart yarı Türkçe yarı İngilizce görünüyor.
  //
  // TAZELEME İKİYE BÖLÜNDÜ. Header'ı güncellemek ve `["common"]` + statik
  // listeleri boşaltmak dil değişir değişmez oluyor (App.tsx `LanguageSyncer`),
  // ama DESTE tazelemesi aşağıdaki `updateProfile`den SONRAYA bağlı: sunucunun
  // dil önceliği `Accept-Language` DEĞİL, DB'deki `profile.language`
  // (bkz. serverLanguage.ts). Yazma inmeden atılan refetch desteyi eski dille
  // yeniden dolduruyordu ve deste anahtarında dil olmadığı + `refetchOnMount`
  // kapalı olduğu için kart uygulama kapanıp açılana kadar öyle kalıyordu.
  //
  // Yani `updateProfile` yalnız push/e-posta metinleri için değil, kartların
  // dili için de ŞART.
  //
  // TOKEN YENİLENMİYOR (eskiden burada zorla `refreshAccessToken()` vardı ve
  // "dil değiştirince atıyor" şikayetinin kaynağı oydu). Gerekçe:
  //   • Rotasyon TEK KULLANIMLIK. Zorla yenileme, sağlıklı bir oturumda hiç
  //     gerekmeyen bir rotasyonu ateşliyor; refresh 4xx alırsa (ölü/eski token,
  //     grace penceresi kapalı) ya da token diskte yoksa api.ts clearAllTokens +
  //     onAuthLost işletiyor → AppNavigator dispatch(logout()). `session_expired`
  //     dalı TOAST'SIZ olduğu için kullanıcı sebepsiz login ekranında buluyordu.
  //   • Kazanç yok: istemci JWT'den yalnız `exp` okuyor (jwt.ts), sunucu da
  //     metinleri claim'den değil DB'deki `profile.language`tan çözüyor — az
  //     önceki `updateProfile` onu zaten yazdı.
  //   • Zaten kuralımız: serverLanguage.ts açılış eşitlemesinde de bilerek
  //     token'a dokunmuyor, EditProfileForm de ad değişince claim'i bayat
  //     bırakıyor. Claim bir sonraki normal yenilemede güncelleniyor.
  //
  // Zincir await EDİLMİYOR: dil seçimi UI'da beklemesin, ağ hatası da seçimi
  // geri almasın.
  // "system" yalnız bir TERCİH — i18n'e ve backend'e her zaman çözülmüş dil
  // ("tr"/"en") gidiyor, aksi halde Language alanı binder'da düşerdi.
  const handleLanguageSelect = (pref: LanguagePreference) => {
    const lang = resolveLanguage(pref);
    dispatch(setLanguage(pref));
    i18n.changeLanguage(lang);
    profileService
      .updateProfile({ Language: lang })
      .then(() => {
        // Açılıştaki eşitleyici bu yazmayı bilmezse ya boşuna aynı isteği atar
        // ya da (başarısızlıkta) düzeltmeyi atlar — bkz. serverLanguage.ts.
        noteServerLanguage(lang);
        // ASIL TAZELEME BURADA. Dil değişir değişmez atılan tazeleme desteyi
        // yalnız bayat işaretliyor (bkz. App.tsx LanguageSyncer): sunucu
        // `*Display` alanlarını Accept-Language'a değil DB'deki `Language`
        // alanına göre çözdüğü için, yazma inmeden çekilen deste eski dilde
        // geliyordu ve uygulama kapanana kadar öyle kalıyordu.
        refreshLocalizedCaches();
      })
      .catch(() => noteServerLanguage(null));
  };

  // ── Satın alma teşhis raporu (gizli) ───────────────────────────────────────
  //
  // Alttaki ortam satırına UZUN BASINCA açılır. Ürün özelliği değil, teşhis
  // aracı: "premium aldım gitti / superlike hiç gelmiyor" akışında cihazdan
  // kanıt çıkarmanın tek pratik yolu. TestFlight'ta Metro konsolu yok ve
  // Console.app için kablo gerekiyor; rapor panoya kopyalanıp doğrudan
  // yapıştırılabiliyor.
  //
  // Metinler i18n'e taşınmadı (bilinçli): buradan yalnız geliştirici geçiyor,
  // çıktının tamamı zaten TR teşhis metni.
  const handleDiagnostics = async () => {
    const uid = premiumSyncUserKey(authUser);
    const pending = readPendingPremiumSync(uid);
    const queue = uid ? readPendingRedeems(uid) : [];
    const report = buildIapReport({
      backendUserId: uid,
      reduxPremium: subscription?.isPremium ?? null,
      reduxSyncPending: subscription?.syncPending ?? null,
      sonSyncReason: subscription?.lastSyncReason ?? null,
      // "`/status` HİÇ cevap verdi mi" — `reduxPremium:false` iki tamamen farklı
      // şeyi anlatabiliyor: backend "premium değil" dedi ya da cevap hiç
      // ulaşmadı (401/429/ağ). Ayırt eden tek satır bu.
      statusCevabı: subscription?.statusResolvedAt
        ? `${Math.round((Date.now() - subscription.statusResolvedAt) / 1000)}sn önce`
        : "HİÇ GELMEDİ",
      // Hub'dan gelen son değişim gerekçesi. "Premium bir anda gitti"
      // şikâyetinde `admin_revoke` ile `store_expired`i ayıran tek satır.
      sonHubOlayı: subscription?.lastChangeReason ?? null,
      bekleyenPremium: pending
        ? `${pending.productId ?? "?"} · ${pending.attempts} deneme · ${Math.round(
            (Date.now() - pending.at) / 60000,
          )}dk`
        : "yok",
      bekleyenRedeem: queue.length
        ? queue.map((q) => `${q.productId}#${q.transactionId}@${q.attempts ?? 0}`).join(", ")
        : "yok",
    });
    await Clipboard.setStringAsync(report).catch(() => {});
    Alert.alert(
      "Satın alma teşhis raporu",
      "Rapor panoya kopyalandı.\n\n" + report.slice(0, 500) + "\n…",
      [
        { text: "Paylaş", onPress: () => { Share.share({ message: report }).catch(() => {}); } },
        {
          text: "Kaydı sıfırla",
          style: "destructive",
          onPress: () => clearIapDiagnostics(),
        },
        { text: "Kapat", style: "cancel" },
      ],
    );
  };

  // ── Şifre Değiştir ────────────────────────────────────────────────────────
  //
  // Ayarlar artık stack'in içinde bir ekran: hedef ekran ÜSTÜNE itiliyor ve
  // geri dönünce Ayarlar bıraktığı yerde duruyor. (Modal hâlindeyken önce
  // kendini kapatmak zorundaydı — açık kalan sheet ekranın üstünde durur, klavye
  // de onun altında açılırdı.)
  const handleChangePassword = () => navigation.navigate('ChangePassword');

  // ── E-posta Değiştir ──────────────────────────────────────────────────────
  //
  // Şifre değiştirmeyle aynı: üste itiliyor. Satırın altında mevcut adres
  // gösteriliyor — kullanıcı hangi adresten hangisine geçtiğini görmeden bu
  // akışa girmemeli.
  const handleChangeEmail = () => navigation.navigate('ChangeEmail');

  // ── Çıkış Yap ─────────────────────────────────────────────────────────────
  const handleLogout = () =>
    Alert.alert(t('profile.logout.title'), t('profile.logout.message'), [
      { text: t('common.cancel'), style: "cancel" },
      {
        text: t('profile.logout.confirmButton'),
        style: "destructive",
        // Ayrıca geri dönmeye gerek yok: oturum düşünce MainNavigator'ın
        // tamamı (bu ekran dahil) unmount olup yerini AuthNavigator alıyor.
        onPress: () => dispatch(logout()),
      },
    ]);

  // ── Verilerimi İndir ────────────────────────────────────────────────────────
  //
  // Backend export'u ASENKRON hazırlıyor: POST talebi kuyruğa atıyor, dosya
  // bitince hem status ucu "tamamlandı" diyor hem de bildirim merkezine
  // düşüyor. Poll yalnız o bittiği anı yakalayıp dosyayı hemen açmak için —
  // yakalayamazsa da veri KAYBOLMUYOR, bildirimden ulaşılıyor. Bu yüzden
  // vazgeçme mesajı "hata" değil "hazırlanıyor, bildirimlere düşecek".
  const handleDownloadData = async () => {
    if (downloadLoading) return;
    // Yeni tur eskisini devralır: önceki timer temizlenmezse ortada sahipsiz
    // bir poll kalıyor ve kendi turunu bitirirken YENİ turun timer'ını
    // temizliyordu.
    stopExportPolling();
    const generation = pollGenRef.current;
    setDownloadLoading(true);

    try {
      const res = await api.post(API_ENDPOINTS.PRIVACY_MY_DATA);
      // İstek uçarken ekrandan çıkıldıysa (veya yeni bir tur başladıysa) burada
      // dur: talep backend'e ulaştı, sonucu bildirim merkezinden gelecek.
      if (pollGenRef.current !== generation) return;
      if (res?.isSuccess === false) throw new Error(res?.message);

      const body = exportBody(res);
      const requestId = readField(body, "requestId", "id", "exportId");
      if (requestId === undefined) {
        console.warn(`[export] requestId yok — gövde: ${JSON.stringify(res)?.slice(0, 300)}`);
        throw new Error(t('errors.requestFailed'));
      }

      // Talep anında hazır dönmüş olabilir (yeniden istenen, hâlâ geçerli bir
      // export) — poll'u beklemeden aç.
      const readyNow = exportFileUrl(body);
      if (readyNow) {
        setDownloadLoading(false);
        Linking.openURL(readyNow).catch(() => {});
        return;
      }

      // Poll: 5 sn arayla max 60 tur (~5 dk). setInterval DEĞİL, zincirlenmiş
      // setTimeout — yavaş bir status isteği bir sonrakinin üstüne binmesin.
      const POLL_INTERVAL_MS = 5000;
      const POLL_MAX_ATTEMPTS = 60;
      /** Ard arda bu kadar hata = pes et. Tek bir 404/ağ hıçkırığı turu bitirmesin. */
      const POLL_MAX_CONSECUTIVE_ERRORS = 3;

      let attempts = 0;
      let consecutiveErrors = 0;

      const alive = () => pollGenRef.current === generation;

      const finish = (title?: string, message?: string) => {
        stopExportPolling();
        setDownloadLoading(false);
        if (title && message) Alert.alert(title, message);
      };

      // Beklenmedik bir hata turu düşürürse spinner sonsuza kilitlenmesin:
      // her tur kendi catch'iyle zamanlanır.
      const schedule = (delayMs: number) => {
        pollingRef.current = setTimeout(() => {
          tick().catch((err: any) => {
            console.warn(`[export] poll turu beklenmedik hatayla düştü: ${err?.message}`);
            finish(t('common.info'), t('errors.dataStillPreparing'));
          });
        }, delayMs);
      };

      const tick = async () => {
        if (!alive()) return;
        attempts++;
        let statusRes: any;
        try {
          statusRes = await api.get(API_ENDPOINTS.PRIVACY_MY_DATA_STATUS(requestId));
          consecutiveErrors = 0;
        } catch (err: any) {
          if (!alive()) return;
          consecutiveErrors++;
          if (consecutiveErrors >= POLL_MAX_CONSECUTIVE_ERRORS || attempts >= POLL_MAX_ATTEMPTS) {
            console.warn(`[export] status ucu ${consecutiveErrors} kez düştü: ${shortNetError(err)}`);
            finish(t('common.info'), t('errors.dataStillPreparing'));
            return;
          }
          schedule(POLL_INTERVAL_MS);
          return;
        }
        if (!alive()) return;

        const statusBody = exportBody(statusRes);
        const status = String(readField(statusBody, "status", "state", "exportStatus") ?? "").toLowerCase();
        const fileUrl = exportFileUrl(statusBody);

        // Bağlantı geldiyse tamam — status kelimesinin ne olduğuna bakma.
        // Sözleşme tarafında asıl kırılgan olan status sözlüğüydü.
        if (fileUrl && !EXPORT_FAILED.includes(status)) {
          finish();
          Linking.openURL(fileUrl).catch(() => {
            Alert.alert(t('errors.generic'), t('errors.dataLinkFailed'));
          });
          return;
        }

        if (EXPORT_FAILED.includes(status)) {
          finish(t('errors.generic'), t('errors.dataNotReady'));
          return;
        }

        // "Tamamlandı" ama bağlantı yok: bekleyerek düzelmez, gövdeyi logla ve
        // kullanıcıyı bildirim merkezine yolla.
        if (EXPORT_DONE.includes(status)) {
          console.warn(
            `[export] status "${status}" ama dosya bağlantısı yok — gövde: ${JSON.stringify(statusRes)?.slice(0, 300)}`,
          );
          finish(t('common.info'), t('errors.dataLinkMissing'));
          return;
        }

        if (attempts >= POLL_MAX_ATTEMPTS) {
          // Alan isimleri kaymışsa teşhis edilebilsin: son gövdeyi yaz.
          console.warn(
            `[export] ${attempts} turda tamamlanmadı (son status "${status}") — gövde: ${JSON.stringify(statusRes)?.slice(0, 300)}`,
          );
          finish(t('common.info'), t('errors.dataStillPreparing'));
          return;
        }

        schedule(POLL_INTERVAL_MS);
      };

      // İlk turu hemen at: hazır bir export'ta 5 sn boşuna beklenmesin.
      schedule(0);
    } catch (e: any) {
      if (pollGenRef.current !== generation) return;
      stopExportPolling();
      setDownloadLoading(false);
      // Axios hatasında `e.message` "Request failed with status code 400" gibi
      // teknik bir metin — backend'in kendi mesajı varsa o gösterilir.
      const backendMessage =
        readField(e?.response?.data, "message", "errorMessage") ?? e?.message;
      Alert.alert(t('errors.generic'), backendMessage || t('errors.requestFailed'));
    }
  };

  // ── Hesabı Sil ──────────────────────────────────────────────────────────────
  const handleDeleteAccount = () => {
    Alert.alert(
      t('deleteAccount.alertTitle'),
      t('deleteAccount.alertMsg'),
      [
        { text: t('deleteAccount.cancel'), style: "cancel" },
        {
          text: t('deleteAccount.confirm'),
          style: "destructive",
          onPress: confirmDelete,
        },
      ],
    );
  };

  const confirmDelete = async () => {
    setDeleteLoading(true);
    try {
      const res = await api.post(API_ENDPOINTS.PRIVACY_DELETE_ACCOUNT, {});
      if (!res.isSuccess) throw new Error(res.message);
      // Backend gerçek silinme tarihini + kalan gün sayısını dönüyor; sabit
      // "30 gün" metni yerine onu göster.
      const scheduledAt = res.result?.scheduledDeletionAt;
      const daysRemaining = res.result?.daysRemaining;
      const message = scheduledAt
        ? t('deleteAccount.successMsgDated', {
            date: new Date(scheduledAt).toLocaleDateString(getDateLocale(), {
              day: 'numeric',
              month: 'long',
              year: 'numeric',
            }),
            days: daysRemaining ?? 30,
          })
        : t('deleteAccount.successMsg');
      Alert.alert(
        t('deleteAccount.successTitle'),
        message,
        [{ text: t('common.ok'), onPress: () => navigation.goBack() }],
      );
    } catch (e) {
      Alert.alert(t('errors.generic'), e.message || t('errors.operationFailed'));
    } finally {
      setDeleteLoading(false);
    }
  };

  // ── Kategori içerikleri ────────────────────────────────────────────────────
  //
  // Modal iki kademeli: kök listede 5 kategori, kategoriye girince YALNIZ onun
  // satırları. Satırların kendisi bire bir eskisi — tasarım değişmedi, içerik
  // gruplara ayrıldı.
  const messagingRows = (
    <SettingsList>
      {/* Read receipt opt-out */}
      <SettingsToggleRow
        icon={<SFIcon name="eye.fill" fallback={Eye} size={18} color={colors.text} strokeWidth={1.5} />}
        title={t('settings.readReceipts.title')}
        subtitle={t('settings.readReceipts.subtitle')}
        value={prefs?.showReadReceipts ?? true}
        disabled={!prefs}
        onToggle={() => togglePref('showReadReceipts')}
      />

      {/* Skip push when online */}
      <SettingsToggleRow
        icon={<SFIcon name="bell.slash.fill" fallback={BellOff} size={18} color={colors.text} strokeWidth={1.5} />}
        title={t('settings.muteOnline.title')}
        subtitle={t('settings.muteOnline.subtitle')}
        value={prefs?.skipPushWhenOnline ?? false}
        disabled={!prefs}
        onToggle={() => togglePref('skipPushWhenOnline')}
      />

      {/* Bildirimde mesaj önizlemesi (2026-08-28).
          Açıkken push WhatsApp desenine geçiyor: başlık gönderenin adı, gövde
          mesajın kendisi (foto/ses/video'da sabit etiket, 120 karakterde kırpma).
          Kapalıyken eski genel metin.

          İKİ koşul birlikte: alıcı AKTİF PREMIUM olmalı VE bu anahtar açık
          olmalı. Gönderen adı zaten premium özelliğiydi; içeriği gösterip adı
          gizlemek ("Biri: naber") tutarsız olurdu, ikisi aynı karara bağlandı.

          Free'de satır diğer ayarlarla BİREBİR aynı görünüyor, yalnız switch
          soluk ve dokunuş paywall'ı açıyor — `showPremiumBadge`ın (bkz.
          EditProfileForm) aksine satır GİZLENMİYOR: orada free kullanıcının
          gizleyeceği bir rozet yoktu, burada gerçek bir upsell var.

          Kilit `premiumResolved` bekliyor: slice persist edilmiyor, reload'da
          premium kullanıcı da bir an `isPremium:false` doğuyor — o pencerede
          kilidi çizmek parasını ödemiş kullanıcıya paywall göstermek olurdu.

          `messageAlerts` kapalıysa satır anlamsız (push zaten hiç gelmiyor) →
          disabled. Bu anahtarın kendi satırı UI'da yok, değer GET'ten geliyor. */}
      <SettingsToggleRow
        icon={<SFIcon name="text.bubble.fill" fallback={MessageSquareText} size={18} color={colors.text} strokeWidth={1.5} />}
        title={t('settings.messagePreview.title')}
        subtitle={t('settings.messagePreview.subtitle')}
        value={prefs?.showMessagePreview ?? true}
        disabled={!prefs || prefs?.messageAlerts === false}
        locked={premiumResolved && !isPremium}
        // Paywall bir sheet DEĞİL, Profil'in "plus" sayfası: openLitPlus
        // "HomeTabs"e navigate ediyor, o da stack'te ALTTA olduğu için Ayarlar
        // ekranını kendiliğinden pop'luyor — ayrıca kapatmaya gerek yok.
        onLockedPress={() => openLitPlus()}
        onToggle={() => togglePref('showMessagePreview')}
      />

      {/* Fotoğraf moderasyonu bildirimleri. `ProfileHiddenInsufficientPhotos`
          bu anahtardan MUAF (hesap durumu bildirimi, pazarlama değil) — metin
          bunu söylüyor ki kullanıcı kapatınca yanlış beklentiye girmesin. */}
      <SettingsToggleRow
        icon={<SFIcon name="camera.fill" fallback={Camera} size={18} color={colors.text} strokeWidth={1.5} />}
        title={t('settings.photoModerationAlerts.title')}
        subtitle={t('settings.photoModerationAlerts.subtitle')}
        value={prefs?.photoModerationAlerts ?? true}
        disabled={!prefs}
        onToggle={() => togglePref('photoModerationAlerts')}
      />
    </SettingsList>
  );

  const privacyRows = (
    <SettingsList>
      {/* Verilerimi İndir */}
      <SettingsActionRow
        title={t('settings.downloadData')}
        onPress={handleDownloadData}
        disabled={downloadLoading}
        trailing={
          downloadLoading ? (
            <ActivityIndicator
              size="small"
              color={colors.textSecondary}
              style={{ width: 18, height: 18 }}
            />
          ) : (
            <SFIcon name="square.and.arrow.down" fallback={Download} size={18} color={colors.text} strokeWidth={2} weight="semibold" style={{ pointerEvents: "none" }} />
          )
        }
      />

      {/* Engellenenler */}
      <SettingsActionRow
        title={t('settings.blockedUsers')}
        onPress={() => setBlockedVisible(true)}
        trailing={
          <SFIcon name="chevron.right" fallback={ChevronRight} size={18} color={colors.textSecondary} strokeWidth={1.5} style={{ pointerEvents: "none" }} />
        }
      />
    </SettingsList>
  );

  const accountRows = (
    <SettingsList>
      {/* E-posta Değiştir */}
      <SettingsActionRow
        title={t('settings.changeEmail')}
        onPress={handleChangeEmail}
        trailing={
          <SFIcon name="envelope" fallback={Mail} size={18} color={colors.text} strokeWidth={1.5} style={{ pointerEvents: "none" }} />
        }
      />

      {/* Şifre Değiştir */}
      <SettingsActionRow
        title={t('settings.changePassword')}
        onPress={handleChangePassword}
        trailing={
          <SFIcon name="lock.rotation" fallback={KeyRound} size={18} color={colors.text} strokeWidth={1.5} style={{ pointerEvents: "none" }} />
        }
      />

      {/* Çıkış Yap */}
      <SettingsActionRow
        title={t('profile.logout.button')}
        onPress={handleLogout}
        trailing={
          <SFIcon name="rectangle.portrait.and.arrow.right" fallback={LogOut} size={18} color={colors.text} strokeWidth={1.5} style={{ pointerEvents: "none" }} />
        }
      />

      {/* Hesabı Sil — dolu kırmızı kapsül DEĞİL artık: bölünmüş listede tek
          bir satırın zemini boyanınca liste ikiye bölünüyor, ayırıcılar o
          satırın etrafında anlamını kaybediyordu. Yıkıcılığı iOS'un kendi
          dilinde taşıyor: kırmızı metin + kırmızı glif, satır düzeni diğer
          satırlarla birebir aynı. Onay yine alert'te. */}
      <SettingsActionRow
        title={t('settings.deleteAccount')}
        onPress={handleDeleteAccount}
        disabled={deleteLoading}
        destructive
        trailing={
          deleteLoading ? (
            <ActivityIndicator
              size="small"
              color={colors.errorStrong}
              style={{ width: 18, height: 18 }}
            />
          ) : (
            <SFIcon name="trash.fill" fallback={Trash2} size={18} color={colors.errorStrong} strokeWidth={1.5} style={{ pointerEvents: "none" }} />
          )
        }
      />
    </SettingsList>
  );

  // Header'ın sol butonu — Bildirimler ekranıyla birebir aynı cam chevron
  // (bkz. NotificationsScreen). Kategori içindeyken de AYNI buton kalıyor,
  // yalnız hedefi değişiyor (bkz. goBack): iki kademe arasında butonun kılığı
  // değişseydi geri gitmenin "aynı şey" olduğu hissi kaybolurdu.
  const backButton =
    Platform.OS === "ios" ? (
      /* matchContents YOK — bkz. GLASS_ICON_BUTTON: Host ölçüyü İLK
         commit'te bilmezse buton sol kenardan içeri ışınlanıyor. Sarmalayıcı
         iOS 26 ALTINDA zemini veriyor, 26+'da hiç render olmuyor. */
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
            onPress={goBack}
            modifiers={[
              // Kabuk YOK, berrak cam glifin üstünde — Bildirimler ekranıyla
              // birebir aynı; bkz. glassIconClearGlyph.
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
      <TouchableOpacity onPress={goBack} hitSlop={10} activeOpacity={0.7} testID="settings-back">
        <View pointerEvents="none">
          <SFIcon name="chevron.left" fallback={ChevronLeft} size={29} strokeWidth={2} color={colors.text} weight="semibold" />
        </View>
      </TouchableOpacity>
    );

  return (
    <View style={{ flex: 1, backgroundColor: colors.bg }}>
    {/* Kenar çekişi EKRANIN TAMAMINI kaplıyor, kayan kutuyu değil: kutu yalnız
        kendi içeriği kadar yükseliyor, kısa kategorilerde (Tema, Dil) sayfanın
        alt yarısı boş kalıyor ve orada başlayan çekiş hiçbir şeye denk
        gelmiyordu. Header bunun ÜSTÜNDE ama `box-none` — geri butonuna
        değmeyen dokunuşlar buraya iniyor. */}
    <GestureDetector gesture={backGesture}>
    <View style={{ flex: 1 }}>
      {/* ── Alt kademe: kök liste ──────────────────────────────────────────
          Kategoriye girince UNMOUNT EDİLMİYOR, altta durup parallax'la sola
          kayıyor — geri çekerken solda gelen sayfanın görünmesinin tek yolu
          bu. `pointerEvents` kapanıyor: görünmez satırlara basılmasın. */}
      <Animated.View
        testID="settings-root-pane"
        style={[StyleSheet.absoluteFill, rootStyle]}
        pointerEvents={section ? "none" : "auto"}
      >
        <Animated.ScrollView
          onScroll={rootScrollHandler}
          scrollEventThrottle={16}
          showsVerticalScrollIndicator={false}
          keyboardShouldPersistTaps="handled"
          contentContainerStyle={{
            // İçerik header'ın başlık satırının ALTINDAN başlıyor: sayfa adını
            // yazan tek yer header (ortalanmış, hep görünür), içerikte başlık
            // ya da açıklama yok — ilk satır doğrudan listenin kendisi.
            paddingTop: insets.top + SCREEN_HEADER_TITLE_HEIGHT + 16,
            paddingBottom: insets.bottom + 60,
            paddingHorizontal: 26,
          }}
        >
          {/* Kök liste: yalnız kategori başlığı + sağında chevron. Açıklamalar
              burada YOK — bölüm açıklaması kategoriye girince görünüyor.
              Ayırıcılar kategori sayfalarındakiyle AYNI (bkz. SettingsList):
              iki kademe de liste, ikisi de aynı dili konuşmalı. */}
          <SettingsList>
          {SECTION_KEYS.map((key, i) => (
            <SettingsSection
              key={key}
              icon={
                <SFIcon
                  name={SECTION_ICONS[key].sf}
                  fallback={SECTION_ICONS[key].lucide}
                  size={20}
                  color={colors.text}
                  strokeWidth={1.5}
                  style={{ pointerEvents: "none" }}
                />
              }
              title={t(`settings.${key}.title`)}
              // Kategori sayfalarındaki satır etiketleriyle BİREBİR tipografi:
              // iki kademe de aynı listenin devamı, kademe atlarken metin
              // ne büyüyor ne kalınlaşıyor.
              titleSize={ROW_TEXT_SIZE}
              titleWeight="500"
              marginTop={i === 0 ? 8 : 0}
              // Açık kategorinin satırı gri kalıyor: geri çekişinde solda
              // beliren kök listede hangi satırdan gelindiği görünüyor.
              active={section === key}
              onPress={() => openSection(key)}
            />
          ))}
          </SettingsList>

          {/* Ortam satırı — normal basışta hiçbir şey yapmaz, UZUN BASINCA
              satın alma teşhis raporunu panoya kopyalar (bkz.
              handleDiagnostics). Kök listede duruyor: bir kategoriye ait
              değil ve tek elle ulaşılabilir yer burası. */}
          <TouchableOpacity
            activeOpacity={1}
            onLongPress={handleDiagnostics}
            delayLongPress={1200}
            style={{ marginTop: 24, paddingVertical: 8, alignItems: "center" }}
          >
            <Text style={{ color: ink(0.25), fontSize: 11 }}>
              {`LIT · ${__DEV__ ? "dev" : "release"}`}
            </Text>
          </TouchableOpacity>

          {/* Harita atfı — ZORUNLU, dekoratif değil. Kartlardaki harita
              Mapbox Static Images API'sinden `attribution=false&logo=false`
              ile geliyor (bkz. buildMapboxStaticUrl); Mapbox bunu ancak atıf
              uygulamanın başka bir yerinde METİN olarak dururken kabul
              ediyor. Gösterildiği tek yer burası — kaldırmadan önce oradaki
              iki parametreyi de kaldır.

              Kategori değil, alt bilgi: bir ayar sunmuyor, yalnız künye.
              Sağlayıcı adları tıklanabilir (Mapbox atıf yönergesi bağlantı
              tercih ediyor), "©" ve isimler ÇEVRİLMİYOR — marka adları. */}
          <Text
            style={{
              color: ink(0.25),
              fontSize: 11,
              textAlign: "center",
              marginTop: 6,
            }}
          >
            {t('settings.mapAttribution')}{' '}
            <Text
              style={{ color: ink(0.45) }}
              onPress={() => {
                Linking.openURL(MAPBOX_ATTRIBUTION_URL).catch(() => {});
              }}
            >
              © Mapbox
            </Text>
            {'  '}
            <Text
              style={{ color: ink(0.45) }}
              onPress={() => {
                Linking.openURL(OSM_COPYRIGHT_URL).catch(() => {});
              }}
            >
              © OpenStreetMap
            </Text>
          </Text>
        </Animated.ScrollView>

        {/* Karartma perdesi kök kademenin İÇİNDE, listenin ÜSTÜNDE: dışarıda
            dursaydı parallax'la kaymaz, kayan listeyle perde arasında ekranın
            solunda bir şerit açılırdı. Kardeş olarak duruyor, ata değil —
            `opacity` bir ata katmanına binseydi altındaki her şey offscreen
            pass'e girerdi. `box-none` değil, tümden geçirgen: kök kademe zaten
            kategori açıkken pointer'ları kapatıyor, perde onun üstüne ikinci
            bir engel koymamalı. */}
        <Animated.View
          pointerEvents="none"
          style={[
            StyleSheet.absoluteFill,
            // Sabit siyah (bkz. scrimAt): perde iki temada da karartır —
            // açık modda "beyazlatmak" geri çekilme hissini vermiyor.
            { backgroundColor: scrimAt(1) },
            rootDimStyle,
          ]}
        />
      </Animated.View>

      {/* ── Üst kademe: kategori sayfası ──────────────────────────────────
          Kök listenin ÜSTÜNE biniyor, o yüzden kendi opak zemini şart —
          şeffaf olsaydı altındaki kök liste boyunca görünürdü. `key`
          kategoriye bağlı: içerik takas edilmesin, gerçekten yeni sayfa
          mount olsun. */}
      {section !== null ? (
        <Animated.View
          key={section}
          style={[StyleSheet.absoluteFill, { backgroundColor: colors.bg }, pageStyle]}
        >
          <Animated.ScrollView
            onScroll={sectionScrollHandler}
            scrollEventThrottle={16}
            showsVerticalScrollIndicator={false}
            keyboardShouldPersistTaps="handled"
            contentContainerStyle={{
              paddingTop: insets.top + SCREEN_HEADER_TITLE_HEIGHT + 16,
              paddingBottom: insets.bottom + 60,
              paddingHorizontal: 20,
            }}
          >
            {/* Satırların üstünde başlık + info ikonu + gri açıklama — kök
                listedeki kategori satırıyla AYNI bileşen, aynı hiza; iki
                kademe tek dil konuşuyor. Tek fark punto: burası sayfanın
                kendi başlığı, kök listede ise seçenek satırlarından biri —
                bir tık büyük (22) durması hiyerarşiyi doğru kuruyor.

                Başlık header'daki adın kopyası DEĞİL (`heading` ≠ `title`):
                aynı kelime iki kez üst üste yazılsaydı ekranın en üstündeki
                iki satır birbirini tekrar ederdi. `heading` sayfadaki içeriği
                adlandırıyor ("Tema" → "Görünüm"), açıklama da onun altında
                ne seçildiğini anlatıyor. */}
            <SettingsSection
              title={t(`settings.${section}.heading`)}
              subtitle={t(`settings.${section}.subtitle`)}
              titleSize={22}
              marginTop={16}
            />
            {section === 'messaging' && messagingRows}
            {section === 'privacy' && privacyRows}
            {section === 'theme' && <SettingsThemeRow />}
            {section === 'language' && (
              <SettingsLanguageRow
                preference={languagePreference}
                onSelect={handleLanguageSelect}
              />
            )}
            {section === 'account' && accountRows}
          </Animated.ScrollView>
        </Animated.View>
      ) : null}
    </View>
    </GestureDetector>

    {/* Header içeriğin ÜSTÜNDE: progressive blur listeyi altından geçiriyor
        (bkz. ScreenHeader). Başlık kökte scroll'la beliriyor — büyük başlık
        zaten içerikte; kategori içinde ise sabit duruyor, çünkü orada sayfa
        adını yazan başka bir şey yok. */}
    <ScreenHeader
      scrollY={headerScrollY}
      title={section ? t(`settings.${section}.title`) : t('settings.title')}
      // Ortalanmış ve HEP görünür: sayfa adını yazan tek yer burası. Scroll'a
      // bağlanamaz — içerikte artık büyük başlık yok, beklerken ekranın hangi
      // sayfa olduğunu söyleyen hiçbir şey kalmazdı.
      titleAlign="center"
      titleSize={26}
      showLogo={false}
      titleOnScroll={false}
      leftButton={backButton}
    />

    <BlockedUsersModal
      visible={blockedVisible}
      onClose={() => setBlockedVisible(false)}
    />
    </View>
  );
}

// Section header — EditModal/EditProfileForm patterniyle aynı: büyük beyaz başlık + InfoIcon + gri açıklama.
// Bölümler arası boşluk da oradan geliyor: EditProfileForm'da dış sarmalayıcının
// marginTop'u (28) ile başlık bloğunun marginTop'u (12) toplanıp 40 ediyor.
// Burada tek View olduğu için toplam doğrudan yazılı (FilterSection'la aynı).
//
// `onPress`: kök listede aynı blok BASILABİLİR bir kategori satırına dönüşür —
// metin ölçüleri değişmez, sağa chevron eklenir. Bölüm başlığı ve kategori
// satırı bilerek tek bileşen: iki kademe arasında tipografi kaymasın.
// Basılı zeminin satır hizasından iki yana taştığı pay. Kök listenin sayfa
// boşluğundan (26) küçük: vurgu ekran kenarına yapışmasın.
const PRESS_INSET = 12;

// `titleWeight`: sayfa başlığı (600) ile kategori SATIRI (500) aynı bileşenden
// çiziliyor ama aynı ağırlıkta olmamalı — biri sayfanın adı, diğeri listedeki
// bir seçenek.
function SettingsSection({
  title,
  subtitle,
  marginTop = 40,
  onPress,
  icon,
  active,
  titleSize = 20,
  titleWeight = "600",
}: any) {
  // Basılı hâl STATE'te, `Pressable`ın `pressed` argümanında değil — gerekçe
  // aşağıdaki style prop'unda.
  const [pressed, setPressed] = useState(false);
  const block = (
    <View style={{ flexDirection: "column", alignItems: "flex-start", flex: 1 }}>
      {/* Başlıksız çağrı: kategori sayfasında başlık header'da duruyor, burada
          yalnız açıklama kalıyor. */}
      {title ? (
        <Text
          style={{
            color: colors.text,
            fontSize: titleSize,
            fontWeight: titleWeight,
            marginBottom: subtitle ? 6 : 0,
          }}
        >
          {title}
        </Text>
      ) : null}
      {subtitle ? (
        <View
          style={{
            flexDirection: "row",
            alignItems: "center",
            gap: 8,
            paddingRight: 16,
          }}
        >
          <SFIcon name="info.circle" fallback={InfoIcon} size={19} color={colors.textSecondary} strokeWidth={2} weight="semibold" />
          {/* Açıklama satır etiketleriyle AYNI punto (ROW_TEXT_SIZE): bir tık
              büyük denendi (18) ve kategori sayfasının içi kök listeye göre
              şişkin okundu — sayfadaki her metin tek ölçüde. Ayrımı punto değil
              renk/ağırlık taşıyor: bu gri ve 400, satırlar ise `colors.text` ve
              500. Satır puntosu değişirse bu da birlikte kaymalı. */}
          <Text
            style={{
              color: colors.textSecondary,
              fontSize: ROW_TEXT_SIZE,
              lineHeight: 23,
              fontWeight: "400",
              flex: 1,
            }}
          >
            {subtitle}
          </Text>
        </View>
      ) : null}
    </View>
  );

  return onPress ? (
    // Pressable YALNIZ vurguyu taşıyor (dış boşluk + basılı hâl); satır düzeni
    // içerideki View'da. Layout'u Pressable'ın fonksiyon-style'ına bağlamak
    // ikon/başlık/chevron'u alt alta düşürüyordu — dosyadaki diğer satırlar da
    // düzeni hep iç View'da tutuyor.
    //
    // Basılı hâl gri ZEMİN: satır iOS ayarlarındaki gibi altına vurgu alıyor.
    // Vurgunun yatay payı ŞART — ilk denemede padding'siz bir kapsül çizilmiş,
    // yuvarlak uçlar ikonun/chevron'un içine girip metnin arkasında kirli bir
    // blok gibi durmuştu. Çözüm: negatif margin + eşit padding (satır içeriği
    // hizasını korur, zemin iki yana taşar) ve kapsül yerine ölçülü köşe.
    //
    // ⚠️ `style` FONKSİYON OLARAK VERİLEMEZ — bu dosyada denendi ve satır
    // stilsiz kaldı: babel'deki `jsxImportSource: "nativewind"` her RN
    // bileşenini interop sürümüyle değiştiriyor, interop da inline stilde
    // yalnız dizi/nesne tanıyor; fonksiyon bir stil kuralı sanılıp
    // düzleştiriliyor ve HİÇ ÇAĞRILMIYOR. Hata/uyarı yok, o yüzden vurgunun
    // hiç çizilmediği (üstelik marginTop/inset'in de düştüğü) fark edilmemişti.
    // Bu yüzden basılı hâl `pressed` argümanından değil, onPressIn/Out ile
    // tutulan state'ten geliyor ve stil düz bir dizi.
    //
    // Vurgu YALNIZ basışa da bağlanamıyor: dokunuş kategoriyi açar açmaz kök
    // panelin pointerEvents'i kapanıyor, RN basışı iptal edip onPressOut'u tek
    // karede tetikliyor — gri zemin gözle görülmeden kaybolurdu. `active` (bu
    // satırın kategorisi açık mı) vurguyu geçiş animasyonu boyunca ve sayfa
    // açık kaldığı sürece tutuyor.
    // Renk `ink()`: tema dönünce koyuda beyaz, açıkta siyah katman.
    <Pressable
      onPress={onPress}
      onPressIn={() => setPressed(true)}
      onPressOut={() => setPressed(false)}
      style={[
        {
          marginTop,
          marginHorizontal: -PRESS_INSET,
          paddingHorizontal: PRESS_INSET,
          borderRadius: 16,
          borderCurve: "continuous",
        },
        (pressed || active) && { backgroundColor: ink(0.12) },
      ]}
    >
      {/* Yatay padding dıştaki Pressable'da: satırın içeriği yine sayfanın
          kendi yan boşluğunda başlayıp bitiyor — başlık/açıklama ile birebir
          aynı hizada, zemin ise iki yandan taşıyor. */}
      <View
        style={{
          flexDirection: "row",
          alignItems: "center",
          gap: 12,
          // Kategori sayfalarındaki satırlarla AYNI dikey ritim (bkz.
          // listRowStyle): iki kademe de ayırıcılı liste, kademeler arasında
          // geçerken satır yükseklikleri zıplamamalı.
          minHeight: ROW_MIN_HEIGHT,
          paddingVertical: ROW_PAD_V,
        }}
      >
        {icon}
        {block}
        <SFIcon name="chevron.right" fallback={ChevronRight} size={15} color={colors.textSecondary} strokeWidth={1.5} style={{ pointerEvents: "none" }} />
      </View>
    </Pressable>
  ) : (
    <View
      style={{
        flexDirection: "row",
        alignItems: "center",
        gap: 12,
        marginTop,
        // Başlık bloğu ile altındaki satırlar arasındaki nefes payı. Bu
        // varyant YALNIZ kategori sayfasında kullanılıyor (kök listede
        // Pressable dalı çalışıyor), o yüzden buradaki artış kök listenin
        // satır aralığını etkilemiyor.
        marginBottom: 16,
      }}
    >
      {block}
    </View>
  );
}

// ── Bölünmüş liste (Mesajlaşma / Gizlilik / Hesap) ──────────────────────────
//
// Bu üç kategori kapsül DEĞİL: her satıra ayrı bir çerçeve çizmek yerine
// satırlar tek bir sütun olarak akıyor ve aralarına saç teli kalınlığında bir
// çizgi giriyor. Kapsül dizisi 4-5 satırda "aynı listenin parçaları" gibi
// değil, üst üste dizilmiş ayrı kartlar gibi okunuyordu; ayırıcı hem daha az
// mürekkep harcıyor hem de grubu tek bir blok yapıyor.
//
// Tema/Dil sayfaları bunun DIŞINDA: oradaki chip'ler bir liste değil, tek bir
// seçimin şıkları — kapsül orada anlamı taşıyor (bkz. SettingsThemeRow).

/**
 * Liste gövdesinin puntosu. Kök listedeki kategori satırları (bkz.
 * `titleSize`), kategori sayfalarındaki liste satırları ve kategori açıklaması
 * — üçü de buradan besleniyor, iki kademe tek yerden büyüyüp küçülüyor.
 *
 * Açıklama bir ara satırlardan büyüktü (18); kategori sayfası kök listeye göre
 * şişkin okunuyordu. Ayrımı artık punto değil renk + ağırlık taşıyor: açıklama
 * gri ve 400, satırlar `colors.text` ve 500.
 *
 * Sayfa başlığı (`titleSize={22}`) bunun DIŞINDA: o satır değil, sayfanın adı.
 */
const ROW_TEXT_SIZE = 16;
/**
 * Tema/Dil chip'lerinin puntosu — satır etiketinin bir tık ALTINDA, bilerek
 * ayrı sabit: chip bir liste satırı değil, dolgusu ve kapsülü metne göre
 * ölçülmüş bir şık. Satırla aynı puntoya çıkarıldığında kapsüller şişip
 * sayfanın tek içeriği olarak fazla ağır duruyordu.
 */
const CHIP_TEXT_SIZE = 15;
/**
 * Satırların ortak yüksekliği. Sabitlenmesi ŞART: switch'li satır (31pt) ile
 * ikon'lu satır (18pt) yalnız dolguyla hizalandığında ayırıcılar eşit
 * aralıklarla düşmüyor, liste hafifçe titrek okunuyordu.
 *
 * Tek satırlık etiketlerde satır yüksekliğini FİİLEN bu belirliyor (dolgu her
 * iki tipte de bunun altında kalıyor) — aralığı buradan aç/kapat.
 */
const ROW_MIN_HEIGHT = 60;
/**
 * Satır içi dikey dolgu. Etiket iki satıra taştığında `minHeight` devre dışı
 * kalıyor, nefes payını o zaman bu veriyor — tek satırlık hâlle aynı hissi
 * versin diye yüksek. Kök listedeki kategori satırları da bunu kullanıyor.
 */
const ROW_PAD_V = 12;

function SettingsList({ children }: { children: React.ReactNode }) {
  // `Children.toArray` fragment'ları DÜZLEMİYOR — satırlar bu bileşenin
  // doğrudan çocuğu olmalı, araya `<>…</>` girerse tek çocuk sayılıp hiç
  // ayırıcı çizilmez.
  const rows = Children.toArray(children).filter(isValidElement);
  return (
    <View>
      {rows.map((row, i) => (
        <Fragment key={i}>
          {i > 0 ? (
            <View
              style={{
                height: StyleSheet.hairlineWidth,
                backgroundColor: colors.hairlineStrong,
              }}
            />
          ) : null}
          {row}
        </Fragment>
      ))}
    </View>
  );
}

/** Liste satırlarının ortak düzeni: solda etiket, sağda ikon/gösterge. */
const listRowStyle = {
  flexDirection: "row" as const,
  alignItems: "center" as const,
  justifyContent: "space-between" as const,
  gap: 12,
  minHeight: ROW_MIN_HEIGHT,
  paddingVertical: ROW_PAD_V,
};

/**
 * Basılabilir liste satırı. `destructive`: yıkıcı eylem kırmızı METİNLE
 * anlatılıyor (dolu kırmızı zeminle değil) — bölünmüş listede boyalı tek satır
 * grubu ortadan ikiye bölerdi.
 */
function SettingsActionRow({ title, trailing, onPress, disabled, destructive }: any) {
  return (
    <TouchableOpacity
      onPress={onPress}
      disabled={disabled}
      activeOpacity={0.6}
      style={listRowStyle}
    >
      <Text
        style={{
          color: destructive ? colors.errorStrong : colors.text,
          fontSize: ROW_TEXT_SIZE,
          fontWeight: "500",
          flex: 1,
        }}
      >
        {title}
      </Text>
      {trailing}
    </TouchableOpacity>
  );
}

// Reusable toggle row — title + Switch.
// Optimistic toggle pattern: parent state'i hemen değişir, fail durumunda rollback.
//
// `locked`: ayar premium'a bağlıysa satır görsel olarak diğer switch'li
// satırlarla aynı kalır — switch soluk çizilir ve satırın tamamı paywall'a
// basar. Rozet/kilit ikonu yok: satırı ayrıksı gösteriyordu.
function SettingsToggleRow({
  icon: _icon,
  title,
  subtitle: _subtitle,
  value,
  disabled,
  onToggle,
  locked,
  onLockedPress,
}: any) {
  const rowStyle = listRowStyle;

  // Etiket ve switch KARDEŞ — araya sarmalayıcı girmiyor. Öncesinde metin iki
  // ayrı View'ın içindeydi: dıştaki `flex: 1` yüzünden satırın boş yüksekliğini
  // de kaplıyor, kendi `alignItems`'ı metni o kutunun ortasına alıyordu; switch
  // ise satırın ortasına hizalanıyordu. İki farklı kutunun ortası çakışmayınca
  // switch metne göre kayık duruyordu. Tek kutu = tek orta.
  const body = (
    <>
      <Text
        style={{
          color: colors.text,
          fontSize: ROW_TEXT_SIZE,
          fontWeight: "500",
          flex: 1,
        }}
      >
        {title}
      </Text>
      {locked ? (
        // Aynı switch, soluk. Dokunuş switch'e DEĞİL satıra gitmeli
        // (pointerEvents: "none") — aksi halde basış paywall'ı açmadan
        // switch'te yutulurdu. `value={false}`: premium olmadan önizleme
        // fiilen kapalı, açık bir switch yanlış beklenti yaratırdı.
        <View style={{ opacity: 0.4, pointerEvents: "none", alignSelf: "center" }}>
          <Switch
            value={false}
            trackColor={{ false: colors.hairlineStrong, true: colors.errorStrong }}
            thumbColor={colors.text}
            ios_backgroundColor={colors.border}
          />
        </View>
      ) : (
        <Switch
          value={value}
          onValueChange={onToggle}
          disabled={disabled}
          style={{ alignSelf: "center" }}
          trackColor={{ false: colors.hairlineStrong, true: colors.errorStrong }}
          thumbColor={colors.text}
          ios_backgroundColor={colors.border}
        />
      )}
    </>
  );

  return locked ? (
    <TouchableOpacity onPress={onLockedPress} activeOpacity={0.8} style={rowStyle}>
      {body}
    </TouchableOpacity>
  ) : (
    <View style={rowStyle}>{body}</View>
  );
}

const THEME_OPTIONS: {
  value: ThemePreference;
  sf: React.ComponentProps<typeof SFIcon>["name"];
  lucide: typeof Sun;
}[] = [
  { value: "system", sf: "circle.lefthalf.filled", lucide: SunMoon },
  { value: "light", sf: "sun.max.fill", lucide: Sun },
  { value: "dark", sf: "moon.fill", lucide: Moon },
];

/**
 * Tema seçici — SettingsLanguageRow ile BİREBİR aynı chip deseni.
 *
 * Değer redux'ta değil MMKV'de (bkz. shared/theme/themeMode.ts): paletin ilk
 * frame'den önce basılması gerekiyor, PersistGate bunun için çok geç kalıyor.
 * setThemePreference paleti değiştirip abonelere haber veriyor; App.tsx'teki
 * `key={mode}` de ağacı bir kez taze mount ediyor.
 *
 * Seçili chip TERCİHİ gösteriyor (çözülen modu değil): "Sistem" seçiliyken
 * palet koyu olsa bile işaretli olan Sistem'dir.
 */
function SettingsThemeRow() {
  const { t } = useTranslation();
  const preference = useThemePreference();
  return (
    <View style={{ flexDirection: "row", flexWrap: "wrap", gap: 8 }}>
      {THEME_OPTIONS.map(({ value: option, sf, lucide }) => {
        const isSelected = preference === option;
        return (
          <TouchableOpacity
            key={option}
            onPress={() => setThemePreference(option)}
            activeOpacity={1}
            style={{
              borderRadius: 999,
              borderCurve: "continuous",
              overflow: "hidden",
              paddingHorizontal: 14,
              paddingVertical: 11,
              borderWidth: 0.5,
              flexDirection: "row",
              alignItems: "center",
              gap: 6,
              backgroundColor: isSelected ? colors.inverseSurface : "transparent",
              borderColor: isSelected ? colors.inverseSurface : colors.hairline,
            }}
          >
            {/* Chip puntosu (CHIP_TEXT_SIZE) satır etiketinden bağımsız —
                gerekçe sabitin başında. İkon etiketten bir tık büyük: aynı
                puntoda glif optik olarak metnin altında kalıyor. */}
            <SFIcon
              name={sf}
              fallback={lucide}
              size={CHIP_TEXT_SIZE + 1}
              color={isSelected ? colors.onInverseSurface : colors.textSecondary}
              strokeWidth={1.5}
              style={{ pointerEvents: "none" }}
            />
            <Text
              style={{
                color: isSelected ? colors.onInverseSurface : colors.textSecondary,
                fontSize: CHIP_TEXT_SIZE,
                fontWeight: "500",
              }}
            >
              {t(`settings.theme.${option}`)}
            </Text>
          </TouchableOpacity>
        );
      })}
    </View>
  );
}

/**
 * Dil seçici — SettingsThemeRow ile aynı desen: seçili chip TERCİHİ gösterir,
 * "Sistem" seçiliyken cihaz dili çözülür ama işaretli olan Sistem'dir.
 */
function SettingsLanguageRow({
  preference,
  onSelect,
}: {
  preference: LanguagePreference;
  onSelect: (pref: LanguagePreference) => void;
}) {
  const { t } = useTranslation();
  return (
    <View style={{ flexDirection: "row", flexWrap: "wrap", gap: 8 }}>
      {(['system', 'tr', 'en'] as const).map((lang) => {
        const isSelected = preference === lang;
        return (
          <TouchableOpacity
            key={lang}
            onPress={() => onSelect(lang)}
            activeOpacity={1}
            style={{
              borderRadius: 999,
              borderCurve: "continuous",
              overflow: "hidden",
              paddingHorizontal: 14,
              paddingVertical: 11,
              borderWidth: 0.5,
              flexDirection: "row",
              alignItems: "center",
              gap: 6,
              backgroundColor: isSelected ? colors.inverseSurface : "transparent",
              borderColor: isSelected ? colors.inverseSurface : colors.hairline,
            }}
          >
            {/* Punto tema chip'leriyle BİREBİR (CHIP_TEXT_SIZE): iki sayfa aynı
                deseni kullanıyor, ayrı puntolar olsaydı kategoriler arası
                geçişte metin zıplardı. */}
            <Text
              style={{
                color: isSelected ? colors.onInverseSurface : colors.textSecondary,
                fontSize: CHIP_TEXT_SIZE,
                fontWeight: "500",
              }}
            >
              {lang === 'system'
                ? t('settings.language.system')
                : lang === 'tr'
                  ? 'Türkçe'
                  : 'English'}
            </Text>
          </TouchableOpacity>
        );
      })}
    </View>
  );
}
