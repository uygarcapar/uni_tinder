import { Image } from "react-native";

const LOGO_W = 120;
const LOGO_H = 50;

// Statik beyaz Lit logosu. ÖNCESİ: dalgalı gradient dolgu — SVG Path'in `d`'sini
// her frame `useAnimatedProps` ile değiştiren sonsuz reanimated animasyonuydu.
// `d` bir şekil prop'u olduğu için her frame full ShadowTree commit zorluyordu
// (main-thread'de kalıcı rakip-committer → Fabric commit-storm / SIGABRT'nin
// yakıtı, [[project_shadowtree_commit_crash]]). Ayrıca MaskedView + Svg native
// maliyeti + mask decode timing'i tab lazy:false'ı zorluyordu. Statik logo bu
// yakıtı tamamen kaldırır; fillRatio prop'u API uyumu için tutuldu ama yok sayılır.
export default function WaveFillLogo(_props: { fillRatio?: number }) {
  return (
    <Image
      source={require("../../../assets/lit_name_white.png")}
      style={{ width: LOGO_W, height: LOGO_H }}
      resizeMode="contain"
    />
  );
}
