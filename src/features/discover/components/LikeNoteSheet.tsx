/**
 * Beğeniler kartındaki not pill'ine basınca açılan sheet — notun METNİ, neye
 * yazıldığı ve yanıtı (tik / X).
 *
 * 2026-11-06'ya kadar not kartın alt bloğunda cam bir kutuda (LikeNoteBox)
 * açılıp kapanıyordu. Kart artık yalnız Fire pill'iyle aynı yapıda bir not
 * pill'i taşıyor (bkz. LikeCard > LikeProductPill); okuma burada.
 *
 * YERLEŞİM (istek):
 *   • Header KENDİMİZİN: solda yuvarlak avatar, yanında dikeyde ortalı
 *     "İsim, yaş"; sağda tam yuvarlak cam X. Alt satır ("Fotoğrafına not
 *     bıraktı · zaman") KALKTI: cümle not glifinin yanına taşındı, zaman
 *     hiç gösterilmiyor (istek).
 *     AppModal'ın kendi header'ı bu satırı kuramıyor (başlık düz string),
 *     o yüzden `closeButton={false}` + boş başlık.
 *   • Fotoğrafa yazılmış notta fotoğraf solda, not (hedef cümlesi + tırnaklı
 *     metin) SAĞINDA ve dikeyde ortalı. Zemin/cam YOK (bir tur liquid glass
 *     balon denendi, istekle kaldırıldı).
 *   • İsim header'da kaydırınca beliriyor (`title`), diğer modallar gibi.
 *   • Altta ORTALI, yan yana iki TAM YUVARLAK cam buton: X (berrak) ve tik
 *     (mod rengine boyalı — Flört kırmızı, Arkadaş yeşil). Yazı YOK.
 *
 * YUVARLAK CAM BUTON kalıbı ProfileScreen header'ının çan/ayarlarıyla AYNI:
 * `buttonStyle("plain")` + SF glifine `glassIconClearGlyph` (cam glifin
 * kutusunda, daire şekli). `buttonStyle("glass")` kabuğu label + kontrol payı
 * kadar doğuyor ve tam daire vermiyordu.
 *
 * ⚠️ Kart bilgisi bir SNAPSHOT: sheet kapanırken (animasyon sürerken) çağıran
 * `item`ı null'a çekebiliyor; içerik boşalmasın diye son dolu kart tutuluyor.
 */
import { useLayoutEffect, useRef } from "react";
import { useTranslation } from "react-i18next";
import {
  Dimensions,
  Platform,
  Text,
  TouchableOpacity,
  View,
} from "react-native";
import { Image } from "expo-image";
import {
  Host,
  Button as SwiftUIButton,
  Image as SwiftUIImage,
} from "@expo/ui/swift-ui";
import {
  accessibilityLabel as a11yLabel,
  buttonStyle,
  frame,
  tint,
} from "@expo/ui/swift-ui/modifiers";
import { Check, Pen, X, type LucideIcon } from "@/shared/icons";
import AppModal from "@/shared/components/AppModal";
import GlassFallbackSurface from "@/shared/components/GlassFallbackSurface";
import SFIcon, { type SFSymbol } from "@/shared/components/SFIcon";
import { colors } from "@/shared/theme/colors";
import {
  GLASS_ICON_CLEAR_SIZE,
  glassFallback,
  glassIconClearGlyph,
} from "@/shared/theme/glass";
import { modeAccent, type AppMode } from "../modeTheme";
import { likerNoteTargetView } from "../noteTarget";

const { height: windowHeight } = Dimensions.get("window");

// Header
const SHEET_PAD_TOP = 22;
const AVATAR_SIZE = 48;
const AVATAR_GAP = 12;

// Hedef önizlemesi — kartın kendi oranında (3:4).
const TARGET_PHOTO_W = 96;
const TARGET_PHOTO_H = 128;

// 19 → 21 (istek: "bir tık büyüt"); tırnak da oranıyla büyüdü.
const NOTE_TEXT_SIZE = 21;
const NOTE_TEXT_LINE = 28;
// "Not" etiketi — bir kademe büyüdü (istek). Glif modaldan kaldırıldı (istek).
const NOTE_TAG_SIZE = 15;
// "Not" etiketinin (ve prompt kartının üstündeki "Sen dedin" etiketinin) mürekkebi — `textSecondary`ten (#8E8E93) bir tık
// AÇIK gri (istek). İki modda aynı: iOS systemGray2.
const NOTE_TAG_INK = "#AEAEB2";
// Notun başındaki açılış tırnağı — SwipeCard'daki prompt cevabıyla aynı işaret
// (`quote.opening`), yazının puntosunda iri. Tavan satır yüksekliği; dikey
// hiza türetiliyor: (satır − ikon) / 2.
const NOTE_QUOTE_SIZE = 24;
const NOTE_QUOTE_GAP = 8;

// Alttaki yuvarlak aksiyonlar.
const ACTION_SIZE = 64;
const ACTION_ICON = 24;
const ACTION_GAP = 20;

type Props = {
  visible: boolean;
  /** Notu açılan kart (LikesScreen'in liste öğesi). */
  item: any | null;
  mode: AppMode;
  onClose: () => void;
  /** Sheet tamamen indiğinde — bekleyen aksiyon burada koşuyor (bkz. LikesScreen). */
  onDismissed?: () => void;
  onAccept: () => void;
  /** Verilmezse X çizilmiyor (Kaçırdıkların: kişi zaten geçilmiş). */
  onReject?: () => void;
  acceptLabel: string;
  rejectLabel?: string;
  closeLabel: string;
};

/**
 * TAM YUVARLAK cam ikon butonu — ProfileScreen header'ının çan/ayarlarıyla
 * aynı zincir. `surfaceTint` verilirse cam o renge boyanıyor (tik), verilmezse
 * berrak (X'ler). Host'a sabit ölçü şart (matchContents ilk karede 0×0).
 */
function RoundGlassButton({
  symbol,
  fallback,
  size,
  iconSize,
  glyphColor,
  surfaceTint,
  label,
  onPress,
}: {
  symbol: SFSymbol;
  fallback: LucideIcon;
  size: number;
  iconSize?: number;
  glyphColor: string;
  surfaceTint?: string;
  label: string;
  onPress: () => void;
}) {
  if (Platform.OS === "ios") {
    return (
      // iOS 26 ALTINDA zemini bu sarmalayıcı veriyor, 26+'da hiç render olmuyor.
      <GlassFallbackSurface shape="circle" width={size} height={size}>
        <Host style={{ width: size, height: size }}>
          <SwiftUIButton
            onPress={onPress}
            modifiers={[
              buttonStyle("plain"),
              tint(glyphColor),
              frame({ width: size, height: size }),
              a11yLabel(label),
              ...glassFallback({
                shape: "circle",
                ...(surfaceTint
                  ? { backgroundColor: surfaceTint, borderColor: surfaceTint }
                  : {}),
              }),
            ]}
          >
            <SwiftUIImage
              systemName={symbol}
              color={glyphColor}
              modifiers={glassIconClearGlyph(size, { iconSize, surfaceTint })}
            />
          </SwiftUIButton>
        </Host>
      </GlassFallbackSurface>
    );
  }
  return (
    <TouchableOpacity
      onPress={onPress}
      activeOpacity={0.75}
      hitSlop={8}
      accessibilityRole="button"
      accessibilityLabel={label}
      style={{
        width: size,
        height: size,
        borderRadius: size / 2,
        backgroundColor: surfaceTint ?? colors.hairlineSoft,
        alignItems: "center",
        justifyContent: "center",
      }}
    >
      <SFIcon
        name={symbol}
        fallback={fallback}
        size={iconSize ?? 20}
        color={glyphColor}
        strokeWidth={2.6}
      />
    </TouchableOpacity>
  );
}

export default function LikeNoteSheet({
  visible,
  item,
  mode,
  onClose,
  onDismissed,
  onAccept,
  onReject,
  acceptLabel,
  rejectLabel,
  closeLabel,
}: Props) {
  const { t } = useTranslation();

  // Kapanış animasyonu sürerken içerik boşalmasın (bkz. dosya başı).
  const lastItemRef = useRef(item);
  useLayoutEffect(() => {
    if (item) lastItemRef.current = item;
  }, [item]);
  const shownItem = item ?? lastItemRef.current;

  const note = shownItem?.note ?? null;
  const target = note?.target ?? null;
  const view = likerNoteTargetView(target, t);
  const promptQuestion =
    target?.kind === "Prompt" ? target.promptDisplay || null : null;
  // Etiket hedefin cümlesi ("Fotoğrafına not bıraktı" vb.) — eskiden isim
  // satırının altında zamanla birlikte duruyordu; şimdi not glifinin yanında,
  // eski "Not" etiketinin yerinde (istek). Zaman tamamen kalktı.
  const noteTagLabel = view.label || t("likes.noteTag");
  const name =
    shownItem?.age != null && shownItem?.name
      ? `${shownItem.name}, ${shownItem.age}`
      : shownItem?.name || "";
  const avatarUri = shownItem?.mainPhoto || null;

  const secondaryInk = colors.textSecondary;
  const hasPhoto = !!view.photoUrl;
  const hasQuote = !!view.quote;
  // Notun kendisi: "Not" etiketi + tırnaklı metin. Fotoğraflı notta
  // fotoğrafın SAĞINDA, ona göre dikeyde ortalı; diğerlerinde tam genişlik.
  const noteBlock = (
    <View style={{ flex: 1, minWidth: 0, gap: 8 }}>
      <Text
        numberOfLines={1}
        style={{
          color: NOTE_TAG_INK,
          fontSize: NOTE_TAG_SIZE,
          lineHeight: 20,
          fontWeight: "600",
        }}
      >
        {noteTagLabel}
      </Text>
      <View
        style={{
          flexDirection: "row",
          alignItems: "flex-start",
          gap: NOTE_QUOTE_GAP,
        }}
      >
        <SFIcon
          name="quote.opening"
          fallback={Pen}
          size={NOTE_QUOTE_SIZE}
          color={colors.text}
          style={{ marginTop: (NOTE_TEXT_LINE - NOTE_QUOTE_SIZE) / 2 }}
        />
        <Text
          selectable
          style={{
            flex: 1,
            color: colors.text,
            fontSize: NOTE_TEXT_SIZE,
            lineHeight: NOTE_TEXT_LINE,
            fontWeight: "500",
          }}
        >
          {note?.comment ?? ""}
        </Text>
      </View>
    </View>
  );
  return (
    <AppModal
      visible={visible}
      onClose={onClose}
      onDismissed={onDismissed}
      // Başlık kaydırınca header'da beliriyor (diğer modallar gibi); dinlenme
      // hâlinde içerikteki satır zaten adı gösteriyor.
      title={name}
      closeButton={false}
      dynamicSizing
      maxDynamicContentSize={windowHeight * 0.85}
      contentContainerStyle={{ paddingTop: SHEET_PAD_TOP }}
    >
      {/* ─── Header: avatar · isim/yaş (avatara göre dikeyde ortalı) · X ─── */}
      <View style={{ flexDirection: "row", alignItems: "center" }}>
        {avatarUri ? (
          <Image
            source={{ uri: avatarUri }}
            style={{
              width: AVATAR_SIZE,
              height: AVATAR_SIZE,
              borderRadius: AVATAR_SIZE / 2,
              backgroundColor: colors.surface3,
            }}
            contentFit="cover"
            cachePolicy="memory-disk"
            recyclingKey={avatarUri}
          />
        ) : (
          <View
            style={{
              width: AVATAR_SIZE,
              height: AVATAR_SIZE,
              borderRadius: AVATAR_SIZE / 2,
              backgroundColor: colors.surface3,
            }}
          />
        )}
        <View
          style={{
            flex: 1,
            minWidth: 0,
            marginLeft: AVATAR_GAP,
            marginRight: 12,
          }}
        >
          <Text
            numberOfLines={1}
            style={{
              color: colors.text,
              fontSize: 18,
              lineHeight: 22,
              fontWeight: "700",
            }}
          >
            {name}
          </Text>
        </View>
        <RoundGlassButton
          symbol="xmark"
          fallback={X}
          size={GLASS_ICON_CLEAR_SIZE}
          glyphColor={colors.text}
          label={closeLabel}
          onPress={onClose}
        />
      </View>

      {/* ─── Hedef + not ───
          Fotoğraflı not: fotoğraf solda, not SAĞINDA ve ona göre dikeyde
          ortalı. Prompt'a yazılmış not: cevap kartı üstte, not altında.
          Hedefsiz not: yalnız not. Zemin YOK — not doğrudan sheet'in üstünde. */}
      <View style={{ marginTop: 20 }}>
        {hasPhoto ? (
          <View style={{ flexDirection: "row", alignItems: "center", gap: 16 }}>
            <Image
              source={{ uri: view.photoUrl }}
              style={{
                width: TARGET_PHOTO_W,
                height: TARGET_PHOTO_H,
                borderRadius: 16,
                backgroundColor: colors.surfaceTranslucent,
              }}
              contentFit="cover"
              cachePolicy="memory-disk"
              recyclingKey={view.photoUrl}
              transition={150}
            />
            {noteBlock}
          </View>
        ) : (
          <View style={{ gap: 16 }}>
            {hasQuote && (
              <View style={{ gap: 6 }}>
                {/* "Sen dedin" — gri kartın DIŞINDA, üst solda: kartın senin
                  cevabın olduğunu söylüyor (istek). */}
                <Text
                  numberOfLines={1}
                  style={{
                    color: NOTE_TAG_INK,
                    fontSize: NOTE_TAG_SIZE,
                    lineHeight: 20,
                    fontWeight: "600",
                  }}
                >
                  {t("likes.noteYouSaid")}
                </Text>
                <View
                  style={{
                    // Tam genişlik (istek) — eskiden içeriğe sarılıyordu.
                    alignSelf: "stretch",
                    borderRadius: 18,
                    borderCurve: "continuous",
                    paddingVertical: 12,
                    paddingHorizontal: 14,
                    backgroundColor: colors.surface3,
                    gap: 3,
                  }}
                >
                  {!!promptQuestion && (
                    <Text
                      style={{
                        color: secondaryInk,
                        fontSize: 13,
                        lineHeight: 17,
                        // Soru başlığı kalın (istek): cevabın neye ait olduğu
                        // ilk bakışta seçilsin.
                        fontWeight: "600",
                      }}
                    >
                      {promptQuestion}
                    </Text>
                  )}
                  <Text
                    style={{
                      color: colors.text,
                      fontSize: 16,
                      lineHeight: 21,
                      fontWeight: "600",
                    }}
                  >
                    {view.quote}
                  </Text>
                </View>
              </View>
            )}
            {noteBlock}
          </View>
        )}

        {!!view.removedNotice && (
          <Text
            style={{
              marginTop: 8,
              color: secondaryInk,
              fontSize: 13,
              lineHeight: 17,
            }}
          >
            {view.removedNotice}
          </Text>
        )}
      </View>

      {/* ─── Aksiyonlar: ortalı, yan yana, tam yuvarlak ─── */}
      <View
        style={{
          flexDirection: "row",
          justifyContent: "center",
          alignItems: "center",
          gap: ACTION_GAP,
          marginTop: 28,
        }}
      >
        {!!onReject && (
          <RoundGlassButton
            symbol="xmark"
            fallback={X}
            size={ACTION_SIZE}
            iconSize={ACTION_ICON}
            glyphColor={colors.text}
            label={rejectLabel ?? ""}
            onPress={onReject}
          />
        )}
        <RoundGlassButton
          symbol="checkmark"
          fallback={Check}
          size={ACTION_SIZE}
          iconSize={ACTION_ICON}
          glyphColor={colors.onMedia}
          surfaceTint={modeAccent(mode)}
          label={acceptLabel}
          onPress={onAccept}
        />
      </View>
    </AppModal>
  );
}
