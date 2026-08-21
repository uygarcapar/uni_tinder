import { Image, View } from "react-native";
import OfflineIndicator from "@/shared/components/OfflineIndicator";
import { LOGO_H, LOGO_W } from "@/shared/components/logoMetrics";
import { isLight } from "@/shared/theme/colors";

// require() Metro'da statik olmak zorunda → iki varlık da modül seviyesinde
// çözülür, seçim render'da yapılır. tintColor yerine ayrı varlık: logonun
// kenar yumuşatması tint'te bozuluyor ve siyah sürüm zaten mevcut.
const LOGO_DARK_BG = require("../../../assets/lit_name_white.png");
const LOGO_LIGHT_BG = require("../../../assets/lit_name_black.png");

// Statik beyaz Lit logosu. ÖNCESİ: dalgalı gradient dolgu — SVG Path'in `d`'sini
// her frame `useAnimatedProps` ile değiştiren sonsuz reanimated animasyonuydu.
// `d` bir şekil prop'u olduğu için her frame full ShadowTree commit zorluyordu
// (main-thread'de kalıcı rakip-committer → Fabric commit-storm / SIGABRT'nin
// yakıtı, [[project_shadowtree_commit_crash]]). Ayrıca MaskedView + Svg native
// maliyeti + mask decode timing'i tab lazy:false'ı zorluyordu. Statik logo bu
// yakıtı tamamen kaldırır; fillRatio prop'u API uyumu için tutuldu ama yok sayılır.
//
// Offline göstergesi BURADA: logo iki ayrı yerde render ediliyor (ScreenHeader
// ve DiscoverScreen'in kendi header'ı), tek kaynak burası olduğu için gösterge
// de her ikisinde otomatik çıkıyor. Sarmalayıcı View'ın ölçüsü logonun kutusuyla
// birebir aynı — gösterge absolute ve kutunun içindeki boşluğa oturuyor, yani
// açılıp kapanması logonun ortalanmasını hiç etkilemiyor.
export default function WaveFillLogo(_props: { fillRatio?: number }) {
  return (
    <View style={{ width: LOGO_W, height: LOGO_H }}>
      <Image
        source={isLight() ? LOGO_LIGHT_BG : LOGO_DARK_BG}
        style={{ width: LOGO_W, height: LOGO_H }}
        resizeMode="contain"
      />
      <OfflineIndicator />
    </View>
  );
}
