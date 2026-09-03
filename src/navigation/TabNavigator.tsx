import { Platform } from "react-native";
import { useTranslation } from 'react-i18next';
import { createNativeBottomTabNavigator } from "@react-navigation/bottom-tabs/unstable";
import DiscoverScreen from "@/features/discover/screens/DiscoverScreen";
import LikesScreen from "@/features/discover/screens/LikesScreen";
import ProfileScreen from "@/features/profile/screens/ProfileScreen";
import MessagesScreen from "@/features/chat/screens/MessagesScreen";
import { useAppSelector } from "@/shared/hooks/redux";
import type { TabParamList } from "@/shared/types/navigation";
import { colors } from "../shared/theme/colors";
import { useProfileTabAvatarIcon } from "./profileTabAvatar";

const Tab = createNativeBottomTabNavigator<TabParamList>();

type TabIconArgs = { focused: boolean };

// focused → filled variant, idle → outlined. SF Symbols: `name` vs `name.fill`.
const tabIcon = (sfBase: string, materialFilled: string, materialOutlined: string) =>
  ({ focused }: TabIconArgs) =>
    Platform.select({
      ios: { type: "sfSymbol", name: focused ? `${sfBase}.fill` : sfBase },
      android: {
        type: "materialSymbol",
        name: focused ? materialFilled : materialOutlined,
      },
    });

// Discover, Likes ve Messages sekmeleri uygulamaya özel glyph kullanır: alev
// (premium rozetiyle aynı şekil, bkz. shared/components/icons/FlameGlyph),
// super-like kalbi (SuperLikeGlyph ile aynı, bkz. icons/HeartGlyph) ve mesaj
// balonu (not ürününün balonuyla aynı, bkz. icons/MessageGlyph). Native tab bar
// ikon olarak yalnız SF Symbol veya yerel resim kabul ediyor — React component /
// SVG geçilemiyor — o yüzden glyph'ler @1x/@2x/@3x PNG'ye rasterize edildi.
// PNG'ler beyaz+alpha: iOS'ta `tinted` varsayılanı true olduğu için template
// olarak aktif/pasif tint'i alır, Android'de tint uygulanmasa bile koyu tab
// bar üzerinde görünür kalır.
//
// Diğer sekmelerdeki `name` / `name.fill` davranışının karşılığı: idle →
// outline, focused → dolu. Outline elle çizilmedi, dolu siluetten mesafe
// alanıyla türetildi (inner stroke, 2pt) — dış siluet ikisinde de aynı,
// yani sekme değişince ikon zıplamaz.
//
// Boyutu/kalınlığı değiştirmek istersen PNG'leri üreten script'ten yeniden
// bas (`node scripts/gen-tab-icons.js`); asset'leri elle ölçekleme, hinting
// bozulur.
const FLAME_TAB_FILLED = {
  type: "image" as const,
  source: require("../../assets/icons/flame-tab.png"),
};
const FLAME_TAB_OUTLINE = {
  type: "image" as const,
  source: require("../../assets/icons/flame-tab-outline.png"),
};
const HEART_TAB_FILLED = {
  type: "image" as const,
  source: require("../../assets/icons/heart-tab.png"),
};
const HEART_TAB_OUTLINE = {
  type: "image" as const,
  source: require("../../assets/icons/heart-tab-outline.png"),
};
// ⚠️ Mesaj sekmesi SF `message`/`message.fill` DEĞİL ve bu bir tercih değil,
// HİZA ZORUNLULUĞU. Native tab bar'ın SF Symbol ikonuna isimden başka hiçbir şey
// geçilemiyor (bottom-tabs > types.d.ts, `IconIOSSfSymbol`: yalnız `name` —
// ne boyut, ne inset); UIKit sembolü kendi optik hizasına göre yerleştirdiği
// için ikon, 28pt'lik PNG kutusunu paylaşan üç kardeşinin (alev, kalp, profil
// avatarı) birkaç pt ÜSTÜNDE duruyordu ve sıra kayık okunuyordu. Nudge edecek
// bir kol olmadığından tek çözüm onu da aynı kutuya almak.
const MESSAGE_TAB_FILLED = {
  type: "image" as const,
  source: require("../../assets/icons/message-tab.png"),
};
const MESSAGE_TAB_OUTLINE = {
  type: "image" as const,
  source: require("../../assets/icons/message-tab-outline.png"),
};
// Android Material sembolünde KALIYOR: hiza sorunu iOS'a özgü (orada ikonu
// UIKit kendi optik kuralıyla yerleştiriyor), Material zaten kardeşleriyle aynı
// kutuya oturuyor — PNG'yi oraya da taşımak kazanç değil fazladan asset olurdu.
//
// ⚠️ `Platform.select` DEĞİL düz ternary, ve bu bilinçli: select'in spec'i
// jenerik ve TS onu İLK dalın tipine kilitliyor — iki dalın şekli farklı olduğu
// için (`image` vs `materialSymbol`) hiçbir overload'a oturmuyor (TS2769).
// Yukarıdaki `tabIcon`ın aynı derde düşmemesinin sebebi orada iki dalın da
// `type`ının genişleyen `string` olması; burada `type` literal (`as const`,
// require'lı asset nesnesi) ve genişlemiyor.
const messageTabIcon = ({ focused }: TabIconArgs) =>
  Platform.OS === "ios"
    ? focused
      ? MESSAGE_TAB_FILLED
      : MESSAGE_TAB_OUTLINE
    : {
        type: "materialSymbol",
        name: focused ? "chat_bubble" : "chat_bubble_outline",
      };

export default function TabNavigator() {
  const { t } = useTranslation();
  const unreadTotal = useAppSelector((s) => (s as any).chat.unreadTotal as number);
  const whoLikedMeCount = useAppSelector((s) => (s as any).swipe.whoLikedMeCount as number);

  const messagesBadge =
    unreadTotal > 0 ? (unreadTotal > 99 ? "99+" : String(unreadTotal)) : undefined;
  const likesBadge = whoLikedMeCount > 0 ? String(whoLikedMeCount) : undefined;

  // Profil sekmesi ikonu = kullanıcının ana fotoğrafı (yuvarlak + ince çerçeve).
  // Foto/Skia hazır olana kadar `null` → aşağıda `person` SF Symbol.
  // Seçili halka `colors.text` (açıkta siyah, koyuda beyaz) — diğer sekmelerin
  // `tabBarActiveTintColor`'ı ile AYNI token, seçili sekme aynı tonda okunsun.
  // Renkler BURADA okunuyor: palet mutable, modül seviyesinde okunsa koyu
  // değerde donardı (tema değişimi kökü remount ediyor → hook yeniden çalışır).
  const profileAvatarIcon = useProfileTabAvatarIcon(colors.hairlineMuted, colors.text);

  return (
    <Tab.Navigator
      id="MainTabs"
      screenOptions={{
        // lazy:true → açılışta sadece Discover mount olur; Messages/Profile (ve
        // onların fetch'leri: 10× history prefetch, tüm common/* option listeleri,
        // GetMyProfile) ilk kez sekmeye girilince mount olur. ÖNCESİ lazy:false idi
        // (WaveFillLogo'nun mask decode timing'i için); WaveFillLogo statiğe
        // çevrildiği için o kısıt kalktı. Bu, cold-boot istek selini ve eşzamanlı
        // ağır-mount fırtınasını (Fabric commit-storm / crash penceresi) keser.
        lazy: true,
        tabBarActiveTintColor: colors.text,
        // Explicit tint → iOS 26 liquid glass content'a göre BG adapt etse bile
        // ikonlar tema modunun tersinde kalmaz (koyuda beyaz, açıkta siyah).
        tabBarInactiveTintColor: colors.tabBarInactive,
        // Tab bar SADECE ikon — etiketler kapalı.
        // iOS: native tab bar'ın "etiketi gizle" anahtarı yok, boş başlık
        // veriliyor. `title`/`tabBarLabel` undefined bırakmak YETMEZ; elements'in
        // getLabel'ı sırayla label → title → route adına düşüyor, yani "Discover"
        // yazardı. Ekranların `title`'ı duruyor (başka tüketiciler için), tab
        // etiketini yalnız bu boş string eziyor.
        // Android: Material'ın kendi görünürlük modu var → etiket METNİ duruyor
        // (TalkBack okuyabilsin), sadece çizilmiyor. O yüzden boş string
        // Platform.select ile iOS'a özel.
        tabBarLabel: Platform.select({ ios: "" }),
        tabBarLabelVisibilityMode: "unlabeled",
        // Etiket puntosu ELLE veriliyor — boş bırakılırsa 14pt'ye kaçıyor.
        // Etiketler boş olsa da duruyor: UIKit boş başlık için de satır
        // yüksekliği kadar yer ayırdığından punto ikonun dikey konumunu
        // etkiliyor; 10pt en dar rezervi veriyor.
        // Zincir: tabBarLabelStyle boşken navigator fontFamily'yi tema
        // fontundan ("System") dolduruyor, fontSize'ı undefined bırakıyor;
        // screens'in RNSTabBarAppearanceCoordinator'ı "fontFamily geldi" diye
        // RCTFont'a gidiyor ve size nil olduğu için RCT'nin 14pt varsayılanını
        // basıyor — UIKit'in 10pt tab etiketinin yerine.
        // Üstelik bu appearance iOS'ta yalnız `normal` duruma uygulanıyor
        // (`selected` hiç set edilmiyor, seçili tint Tabs.Host'tan geliyor):
        // seçili sekme 10pt kalıp diğer üçü 14pt oluyordu → yazılar alta
        // kayıyor, "Mesajlar" kırpılıyordu.
        // Android'e dokunmuyoruz: orada aynı değer small/large label size'a
        // gidiyor ve Material varsayılanı (12sp) doğru olan.
        tabBarLabelStyle: Platform.select({ ios: { fontSize: 10 } }),
        // Legacy fixed-tone UIBlurEffectStyle: iOS 26 liquid glass'ın
        // content-adaptation davranışını override etmeye en yakın değer.
        tabBarBlurEffect: colors.blurTint,
        tabBarStyle: { backgroundColor: colors.tabBarBg },
      } as any}
    >
      <Tab.Screen
        name="Discover"
        component={DiscoverScreen}
        options={{
          title: t('discover.tabTitle'),
          tabBarIcon: ({ focused }: TabIconArgs) =>
            focused ? FLAME_TAB_FILLED : FLAME_TAB_OUTLINE,
        }}
      />
      <Tab.Screen
        name="Likes"
        component={LikesScreen}
        options={{
          title: t('likes.tabTitle'),
          // SF `heart`/`heart.fill` DEĞİL: beğeniler sekmesi de ürünün kendi
          // kalbini taşıyor (SwipeCard'ın super-like butonu, Likes kartları,
          // paket sheet'i hep aynı glyph). Discover'ın alevi gibi rasterize
          // PNG çifti — idle outline, focused dolu.
          tabBarIcon: ({ focused }: TabIconArgs) =>
            focused ? HEART_TAB_FILLED : HEART_TAB_OUTLINE,
          tabBarBadge: likesBadge,
        }}
      />
      <Tab.Screen
        name="Messages"
        component={MessagesScreen}
        options={{
          title: t('chat.tabTitle'),
          tabBarIcon: messageTabIcon as any,
          tabBarBadge: messagesBadge,
        }}
      />
      <Tab.Screen
        name="Profile"
        component={ProfileScreen}
        options={{
          title: t('profile.tabTitle'),
          // Foto `tinted:false` ile gidiyor (bkz. profileTabAvatar) — tab bar'ın
          // aktif/pasif tint'i ona DEĞMİYOR. Seçili olma hissini taşıyan tek şey
          // çerçeve rengi, o yüzden focused/idle iki ayrı rasterize varyant.
          tabBarIcon:
            profileAvatarIcon ?? (tabIcon("person", "person", "person_outline") as any),
        }}
      />
    </Tab.Navigator>
  );
}
