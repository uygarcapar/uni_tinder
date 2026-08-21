import { memo, useEffect, useLayoutEffect, useMemo, useRef, useState } from "react";
import {
  View,
  Text,
  TouchableOpacity,
  Pressable,
  Dimensions,
  Animated,
  Easing,
} from "react-native";
import { useTranslation } from "react-i18next";
import { Check, CheckCheck, Clock, AlertCircle } from "lucide-react-native";
import SFIcon from "@/shared/components/SFIcon";
import ReplyPreview, {
  REPLY_CARD_GAP,
} from "@/features/chat/components/ReplyPreview";
import { REVEAL_MAX } from "@/features/chat/components/RevealContext";
import {
  BUBBLE_PAD_H,
  BUBBLE_PAD_V,
  BUBBLE_RADIUS,
  reactionChipBorder,
  bubbleCorners,
} from "@/features/chat/components/bubbleStyle";
import {
  HIGHLIGHT_DURATION,
  useMessageHighlight,
} from "@/features/chat/components/messageHighlight";
import { messageContentEqual } from "@/features/chat/messageEquality";
import { consumeMessageEntering } from "@/features/chat/enterAnimation";
import { parseUtc } from "@/shared/utils/dateUtc";
import { colors } from "../../../shared/theme/colors";

// Fonksiyon: modul seviyesinde sabitlenirse tema degisince bayat kalir.
const statusGray = () => colors.textSecondary;
// Satırlar liste genişliğinde (ekran + REVEAL_MAX) — balon max genişliği EKRANA
// göre hesaplanır, yoksa oran reveal şeridini de sayıp fazla geniş olurdu.
// Yanıt kartı da bu genişlikle sınırlıdır (kart balonun üstünde ayrı bir kutu).
const BUBBLE_MAX_WIDTH = Math.round(Dimensions.get("window").width * 0.6);

// Satırlar arası normal boşluk ve reaction kapsülü varken açılan boşluk.
// Kapsül balonun 15px altına taşar (bottom:-15), altındaki mesaja binmesin diye
// satırın marginBottom'u büyür. Bu büyüme ANİ OLMAMALI: liste dibe pinliyken
// 19px'lik ani yükseklik artışı tüm sohbeti bir anda yukarı zıplatıyordu —
// değer animasyonla açılınca liste her frame bir tık kayar (yumuşak itiş).
const ROW_SPACE = 1;
// Konuşmacı DEĞİŞTİĞİNDE satırın üstüne eklenen fazladan boşluk. Aynı kişinin
// ardışık mesajları sıkı bir blok gibi dursun, karşı tarafla aramızda görsel
// bir nefes olsun diye (WhatsApp'taki grup ayrımı). Toplam boşluk: ardışık
// mesajlarda ROW_SPACE×2 = 2, konuşmacı değişiminde +GROUP_GAP.
const GROUP_GAP = 10;
// Yanıt kartlı satırın ÜSTTEKİ mesaja fazladan boşluğu: kart balonun üstüne bir
// kutu daha eklediği için normal aralıkta bir önceki mesaja yapışık duruyor.
// marginTop (padding değil): satırın KENDİ yüksekliğine girmez, saat/okundu
// kolonunun (absolute top:0/bottom:0) dikey hizası kaymaz.
const REPLY_ROW_TOP_GAP = 5;
// Yanıt hedefine atlayınca yakılan vurgu perdesinin tepe opaklığı. KENDİ
// balonumuz doygun kırmızı: beyaz perde orada aynı oranda "yıkanmıyor", karşı
// tarafın koyu gri balonundan daha yükseğe çıkması gerekiyor ki fark edilsin.
const HIGHLIGHT_PEAK_OWN = 0.5;
const HIGHLIGHT_PEAK_OTHER = 0.35;
const REACTION_SPACE = 20;
const REACTION_SPACE_DURATION = 220;
// GÖNDERİM GİRİŞİ (yalnız bu cihazdan az önce gönderilen balon): balon kendi
// yerinin ENTER_RISE kadar altında, saydam doğar ve süzülerek yerine oturur —
// composer'ın arkasından çıkıyormuş gibi (WhatsApp hissi). 220ms: hareket
// görünür ama gönderimi geciktirmiyor; out-cubic sonunda yumuşak durur.
// SADECE transform + opacity: ikisi de LAYOUT'a dokunmaz, yani satır yüksekliği
// hiç değişmez → listede ölçüm/MVCP zinciri tetiklenmez (yükseklik animasyonu
// olsaydı her frame yeniden ölçüm = commit churn).
const ENTER_DURATION = 220;
const ENTER_RISE = 30;
// Opaklık yükselişten HIZLI biter: balon yolun yarısında tam görünür olur,
// kalan yol sadece yerine oturma hareketidir (yarı saydam sürüklenme olmaz).
const ENTER_FADE_END = 0.55;

/**
 * Tek mesaj baloncuğu — TEXT-ONLY ve TAMAMEN STATİK (reanimated YOK).
 *
 * NEDEN reanimated yok: per-balon useAnimatedStyle (press-scale + reveal
 * translateX) hızlı scroll'da yüzlerce mount/unmount'ta reanimated attach/detach
 * churn'ü yaratıp Fabric commit-storm'una (ShadowTree::commit SIGABRT) ve blank
 * balonlara yol açıyordu — teşhis anahtarıyla (CHAT_DIAG_MINIMAL_BUBBLES) kanıtlı.
 *
 * Reveal artık BURADA DEĞİL: ChatMessageList tüm listeyi TEK animated transform
 * ile kaydırır (görsel aynı — eski tasarımda da tüm satırlar aynı revealX ile
 * kayıyordu). Satır, ekran genişliğinden REVEAL_MAX kadar geniştir; saat/okundu
 * kolonu satırın SAĞ İÇİNDE (right:0, ekran dışında park), liste sola kayınca
 * ekrana girer. Out-of-bounds absolute hack'i de böylece kalktı.
 *
 * Press feedback: Pressable'ın pressed style'ı (anlık scale) — animasyon lib'i yok.
 */
function MessageBubble({
  message,
  isOwn,
  isGroupStart,
  onLongPress,
  onReplyTap,
  onRetryTap,
  i18nResolver,
}: any) {
  const { t } = useTranslation();
  const bubbleRef = useRef<any>(null);
  // Press feedback: state ile anlık shrink. Fonksiyon-style KULLANMA —
  // css-interop (className) + fonksiyon-style kombinasyonu style'ı düşürüyor
  // (balon arka planı kayboluyordu). Düz obje style şart.
  const [pressed, setPressed] = useState(false);
  // Uzun basma menüsü açıkken gerçek balon gizlenir — görünen, MessageActionSheet
  // içindeki klondur (yoksa balon "kopyalanmış" gibi ikili görünür).
  const [hiddenForMenu, setHiddenForMenu] = useState(false);
  // recycleItems açık: container başka mesaja geçince component REMOUNT EDİLMEZ,
  // in-place reconcile edilir → pressed/hidden state'i sızmasın diye id değişiminde sıfırla.
  useEffect(() => {
    setPressed(false);
    setHiddenForMenu(false);
  }, [message.id]);

  // Yanıt kartına dokunup bu mesaja atlandığında kısa bir yanıp sönme. Store
  // dışsal: liste/renderItem hiç değişmez, yalnız hedef balon render olur.
  const highlighted = useMessageHighlight(message.id);
  // Animated.Value TEMBEL: vurgu hiç almayan balonlarda (yani neredeyse hepsi)
  // tek bir obje bile ayrılmasın.
  const highlightAnimRef = useRef<Animated.Value | null>(null);
  if (highlighted && !highlightAnimRef.current) {
    highlightAnimRef.current = new Animated.Value(0);
  }
  const highlightAnim = highlightAnimRef.current;
  useEffect(() => {
    if (!highlighted || !highlightAnim) return;
    highlightAnim.setValue(0);
    const anim = Animated.sequence([
      Animated.timing(highlightAnim, {
        toValue: 1,
        duration: 130,
        easing: Easing.out(Easing.quad),
        useNativeDriver: true,
      }),
      Animated.delay(HIGHLIGHT_DURATION - 130 - 200),
      Animated.timing(highlightAnim, {
        toValue: 0,
        duration: 200,
        easing: Easing.in(Easing.quad),
        useNativeDriver: true,
      }),
    ]);
    anim.start();
    return () => anim.stop();
  }, [highlighted, highlightAnim]);

  const hasReactions = !!message.reactions?.length;
  const spaceTarget = hasReactions ? REACTION_SPACE : ROW_SPACE;
  // Reaction boşluğu marginBottom ile açılır: margin satırın KENDİ yüksekliğine
  // girmediği için saat/okundu kolonunun (absolute top:0/bottom:0) dikey hizası
  // kaymaz — spacer child kullanılsaydı saat animasyon boyunca aşağı sürüklenirdi.
  // Reanimated DEĞİL, RN Animated: balon başına reanimated hook'u commit-storm
  // teşhisinde suçlu çıkmıştı (bkz. component başlığı); burada JS-driven tek
  // değer sadece reaction değişen balonda ~220ms boyunca çalışır.
  const spaceAnimRef = useRef<Animated.Value | null>(null);
  if (!spaceAnimRef.current) spaceAnimRef.current = new Animated.Value(spaceTarget);
  const spaceAnim = spaceAnimRef.current;
  const spaceValue = useRef(spaceTarget);
  const prevMessageId = useRef(message.id);
  // Kapsül boşlukla birlikte belirsin — boşluk daha 0'ken tam opak çizilirse
  // alttaki mesajın üstüne binmiş görünür.
  const chipReveal = useMemo(() => {
    const inputRange = [ROW_SPACE, REACTION_SPACE];
    return {
      opacity: spaceAnim.interpolate({
        inputRange,
        outputRange: [0, 1],
        extrapolate: "clamp",
      }),
      transform: [
        {
          scale: spaceAnim.interpolate({
            inputRange,
            outputRange: [0.85, 1],
            extrapolate: "clamp",
          }),
        },
      ],
    };
  }, [spaceAnim]);

  // useLayoutEffect: recycle'da (aynı container, başka mesaj) değer boyanmadan
  // önce yerine otursun — useEffect ile bir frame yanlış boşlukla çizilirdi.
  useLayoutEffect(() => {
    const recycled = prevMessageId.current !== message.id;
    prevMessageId.current = message.id;
    if (spaceValue.current === spaceTarget) return;
    spaceValue.current = spaceTarget;
    // recycleItems: container başka mesaja geçtiyse ANİMASYON YOK — scroll
    // sırasında rastgele balonlar açılıp kapanmasın.
    if (recycled) {
      spaceAnim.stopAnimation();
      spaceAnim.setValue(spaceTarget);
      return;
    }
    Animated.timing(spaceAnim, {
      toValue: spaceTarget,
      duration: REACTION_SPACE_DURATION,
      easing: Easing.out(Easing.cubic),
      // marginBottom bir layout prop'u — native driver desteklemez.
      useNativeDriver: false,
    }).start();
  }, [message.id, spaceTarget, spaceAnim]);

  // ── Gönderim girişi ────────────────────────────────────────────────────
  // Kayıt handleSend'de bırakılır, burada satır başına TEK KEZ tüketilir (bkz.
  // enterAnimation.ts). Kimlik olarak clientMessageId kullanılır: hub echo'da id
  // temp-x → sunucu id'sine dönerken satır aynı satırdır, yeniden animasyona
  // GİRMEMELİ. Recycle'da (container başka mesaja geçince) anahtar değişir,
  // yeni mesajın kaydı yoksa anim null olur → hiçbir şey oynamaz.
  //
  // Reanimated DEĞİL, RN Animated (JS-driven): balon başına reanimated hook'u
  // commit-storm teşhisinde suçlu çıkmıştı (bkz. component başlığı). Buradaki
  // tek değer ömür boyu bir kez, ~300ms çalışıp biter.
  const rowKey = message.clientMessageId || message.id;
  const enterRef = useRef<{ key: string; anim: Animated.Value | null } | null>(null);
  if (enterRef.current?.key !== rowKey) {
    enterRef.current = {
      key: rowKey,
      anim: consumeMessageEntering(message.clientMessageId)
        ? new Animated.Value(0)
        : null,
    };
  }
  const enterAnim = enterRef.current.anim;
  // useLayoutEffect: animasyon ilk boyamadan ÖNCE başlasın — useEffect ile bir
  // frame boyunca balon yerinde ve tam opak çizilip sonra aşağı zıplardı.
  useLayoutEffect(() => {
    if (!enterAnim) return;
    const anim = Animated.timing(enterAnim, {
      toValue: 1,
      duration: ENTER_DURATION,
      easing: Easing.out(Easing.cubic),
      // marginBottom (spaceAnim) aynı görünümde JS-driven bir düğüm: native
      // driver'a geçilirse RN o görünümün TÜM animated prop'larını native'e
      // taşımaya kalkar ve layout prop'unda patlar.
      useNativeDriver: false,
    });
    anim.start();
    return () => anim.stop();
  }, [enterAnim]);
  const enterStyle = useMemo(() => {
    if (!enterAnim) return null;
    return {
      opacity: enterAnim.interpolate({
        inputRange: [0, ENTER_FADE_END],
        outputRange: [0, 1],
        extrapolate: "clamp" as const,
      }),
      transform: [
        {
          translateY: enterAnim.interpolate({
            inputRange: [0, 1],
            outputRange: [ENTER_RISE, 0],
          }),
        },
      ],
    };
  }, [enterAnim]);

  const handleLongPress = () => {
    if (!onLongPress) return;
    // Scale feedback SADECE uzun basışta — normal dokunuşta değil.
    setPressed(true);
    if (!bubbleRef.current?.measureInWindow) {
      onLongPress(null);
      return;
    }
    bubbleRef.current.measureInWindow((x: number, y: number, width: number, height: number) => {
      // setHidden: MessageActionSheet açılırken orijinali gizler, kapanış
      // animasyonu bitince geri gösterir.
      onLongPress({
        x,
        y,
        width,
        height,
        radius: BUBBLE_RADIUS,
        setHidden: setHiddenForMenu,
        // remeasure: kapanışta klonun döneceği konum taze ölçülür — menü
        // açılırken klavye kapandığından liste kayıyor, basış anındaki y bayat.
        remeasure: (
          cb: (
            rect: { x: number; y: number; width: number; height: number } | null,
          ) => void,
        ) => {
          if (!bubbleRef.current?.measureInWindow) {
            cb(null);
            return;
          }
          bubbleRef.current.measureInWindow(
            (fx: number, fy: number, fw: number, fh: number) =>
              cb({ x: fx, y: fy, width: fw, height: fh }),
          );
        },
      });
    });
  };

  // System mesajı — ortada gri kapsül (ekran alanında ortala: reveal şeridini sayma)
  if (message.isSystemMessage) {
    const text =
      (i18nResolver && message.localizationKey
        ? i18nResolver(message.localizationKey, message.content)
        : message.content) || "";
    return (
      <View
        className="items-center my-2 px-4"
        style={{ marginRight: REVEAL_MAX }}
      >
        <View
          className="px-3 py-2 border"
          style={{
            backgroundColor: colors.surface5,
            borderColor: colors.surface3,
            borderRadius: 24,
            borderCurve: "continuous",
          }}
        >
          <Text className="text-[15px]" style={{ color: colors.textPlaceholder }}>
            {text}
          </Text>
        </View>
      </View>
    );
  }

  const isPending = message._pending;
  const isFailed = message._failed;
  const isDeletedForEveryone = message.deletedAt && message.deletedForEveryone;
  const isDeletedSelf = message.deletedAt && !message.deletedForEveryone;

  if (isDeletedSelf) return null;
  if (isDeletedForEveryone) return renderDeletedBubble(isOwn, t);

  const bubbleBg = isOwn ? colors.messageOwn : colors.surface2;
  // Kendi balonum marka kırmızısı — iki modda da aynı, o yüzden üstündeki yazı
  // her zaman beyaz (onMedia). Karşı tarafınki surface2, yani modla dönüyor.
  const textColor = isOwn ? colors.onMedia : colors.text;
  const metaColor = isOwn ? colors.onMediaMuted : colors.textSecondary;

  return (
    <Animated.View
      style={{
        marginTop:
          (isGroupStart ? ROW_SPACE + GROUP_GAP : ROW_SPACE) +
          (message.replyTo ? REPLY_ROW_TOP_GAP : 0),
        marginBottom: spaceAnim,
        // Yalnız az önce gönderilen balonda dolu (bkz. ENTER_*): satır kendi
        // yerinin altından süzülerek gelir. Diğer tüm satırlarda null → stil
        // birebir eski haliyle kalır.
        ...enterStyle,
      }}
    >
      <View
        style={{
          flexDirection: "row",
          justifyContent: isOwn ? "flex-end" : "flex-start",
          paddingLeft: 12,
          // Balonlar EKRAN alanında kalsın; sağdaki REVEAL_MAX şeridi saat kolonuna ait.
          paddingRight: 12 + REVEAL_MAX,
        }}
      >
        {/* Yanıt kartı + balon TEK sütun: kart balonun İÇİNDE değil ÜSTÜNDEdir,
            bu yüzden balon yanıtsız haliyle birebir aynı kalır (kart kendi
            içeriği kadar genişler, balonu genişletmez). measureInWindow ref'i
            bu sütunda: uzun-bas klonu tüm yığını birebir kopyalar. */}
        <View
          ref={bubbleRef}
          style={{
            maxWidth: BUBBLE_MAX_WIDTH,
            alignItems: isOwn ? "flex-end" : "flex-start",
            opacity: hiddenForMenu ? 0 : 1,
          }}
        >
          {message.replyTo && (
            <TouchableOpacity
              // Sönme YOK: karta basınca kart soluklaşmasın, tek geri bildirim
              // hedef balonun vurgulanması olsun.
              activeOpacity={1}
              onPress={() => onReplyTap?.(message.replyTo)}
              // Kart balona BİNMEZ, üstünde ayrı bir kutu olarak durur.
              style={{ marginBottom: REPLY_CARD_GAP, maxWidth: BUBBLE_MAX_WIDTH }}
            >
              <ReplyPreview reply={message.replyTo} mode="bubble" isOwn={isOwn} />
            </TouchableOpacity>
          )}

          {/* Reaction kapsülü balonun KENDİ kutusuna göre konumlanır: yanıt kartı
              balondan geniş olduğunda dış sütunun sağ kenarı balonunkinden
              ayrılıyor, kapsül balonun dışına kayıyordu. */}
          <View style={{ position: "relative", maxWidth: BUBBLE_MAX_WIDTH }}>
            <Pressable
              onLongPress={handleLongPress}
              onPress={isFailed ? () => onRetryTap?.(message) : undefined}
              onPressOut={() => setPressed(false)}
              delayLongPress={300}
              style={{
                backgroundColor: bubbleBg,
                // Gönderen tarafın üst köşesi dar (bkz. bubbleCorners).
                ...bubbleCorners(isOwn),
                borderCurve: "continuous",
                paddingHorizontal: BUBBLE_PAD_H,
                paddingVertical: BUBBLE_PAD_V,
                minWidth: 48,
                // Balon içeriğe göre daralır, tek etkili durum minWidth'tir — "?"
                // gibi tek karakterlik mesaj 48pt'lik balonun solunda kalmasın diye
                // ortalanır. Uzun/sarmalı metinde balon zaten metin kadar geniş
                // olduğu için "center" hiçbir şeyi kaydırmaz. Yanıt kartı artık
                // balonun DIŞINDA olduğu için burada yanıta özel bir durum YOK.
                // DİKKAT: MessageActionSheet klonu da aynı — ayrışırsa uzun basışta
                // metin yana zıplar.
                alignItems: "center",
                opacity: isFailed ? 0.7 : 1,
                position: "relative",
                // Uzun basış feedback'i: anlık hafif shrink (animasyonsuz).
                // onPressIn'de DEĞİL — normal dokunuşta scale istenmiyor.
                transform: [{ scale: pressed ? 0.97 : 1 }],
              }}
            >
              {!!message.content && (
                <Text style={{ color: textColor, fontSize: 17 }}>
                  {message.content}
                  {message.editedAt && (
                    <Text className="text-xs" style={{ color: metaColor }}>
                      {"  "}
                      {t("chat.bubble.edited")}
                    </Text>
                  )}
                </Text>
              )}

              {isFailed && (
                <Text className="text-[10px] mt-1" style={{ color: colors.errorLight }}>
                  {t("chat.bubble.tapToRetry")}
                </Text>
              )}

              {/* Vurgu perdesi — YALNIZ vurgu sürerken var (steady-state'te ne
                  view ne animasyon). Balonda overflow:hidden yok, o yüzden
                  köşeler bubbleCorners'tan birebir kopyalanır. */}
              {highlighted && !!highlightAnim && (
                <Animated.View
                  pointerEvents="none"
                  style={{
                    position: "absolute",
                    top: 0,
                    left: 0,
                    right: 0,
                    bottom: 0,
                    ...bubbleCorners(isOwn),
                    borderCurve: "continuous",
                    backgroundColor: colors.inverseSurface,
                    opacity: highlightAnim.interpolate({
                      inputRange: [0, 1],
                      outputRange: [
                        0,
                        isOwn ? HIGHLIGHT_PEAK_OWN : HIGHLIGHT_PEAK_OTHER,
                      ],
                    }),
                  }}
                />
              )}
            </Pressable>

            {/* TEK kapsül: farklı kullanıcıların farklı emoji'leri ayrı kutucuk
                değil, aynı kapsülün içinde yan yana durur (MessageActionSheet
                klonu da birebir aynı şekilde çizer — ikisi ayrışmamalı). */}
            {hasReactions && (
              <Animated.View
                style={{
                  position: "absolute",
                  bottom: -15,
                  right: 6,
                  flexDirection: "row",
                  alignItems: "center",
                  paddingHorizontal: 8,
                  paddingVertical: 4,
                  borderRadius: 999,
                  backgroundColor: colors.surface2,
                  ...reactionChipBorder(),
                  gap: 6,
                  opacity: chipReveal.opacity,
                  transform: chipReveal.transform,
                }}
              >
                {message.reactions.map((r: any) => (
                  <View key={r.emoji} className="flex-row items-center">
                    <Text style={{ fontSize: 14 }}>{r.emoji}</Text>
                    {r.count > 1 && (
                      <Text className="text-[10px] ml-1" style={{ color: colors.neutral200 }}>
                        {r.count}
                      </Text>
                    )}
                  </View>
                ))}
              </Animated.View>
            )}
          </View>
        </View>
      </View>

      {/* Saat/okundu kolonu: satırın SAĞ İÇİNDE, ekranın hemen dışında park eder
          (satır genişliği = ekran + REVEAL_MAX). ChatMessageList tüm listeyi sola
          kaydırınca ekrana girer. Statik — animasyon yok. */}
      <View
        pointerEvents="none"
        style={{
          position: "absolute",
          right: 0,
          top: 0,
          bottom: 0,
          width: REVEAL_MAX,
          paddingLeft: 8,
          flexDirection: "row",
          justifyContent: "flex-start",
          alignItems: "center",
        }}
      >
        <Text className="text-[13px] font-normal" style={{ color: colors.textSecondary }}>
          {formatTime(message.sentAt)}
        </Text>
        {isOwn && (
          <View style={{ marginLeft: 4 }}>
            {renderStatus(message, isPending, isFailed)}
          </View>
        )}
      </View>
    </Animated.View>
  );
}

function renderDeletedBubble(isOwn: boolean, t: (key: string) => string) {
  return (
    <View
      style={{
        flexDirection: "row",
        justifyContent: isOwn ? "flex-end" : "flex-start",
        marginVertical: 2,
        paddingLeft: 12,
        paddingRight: 12 + REVEAL_MAX,
      }}
    >
      <View
        className="px-3 py-3.5"
        style={{
          // Silinmiş balon iki tarafta da KARŞI TARAF balonunun rengini alır:
          // silinen içerik artık kimseye ait değil, kendi kırmızımla vurgulanmaz.
          backgroundColor: colors.surface2,
          maxWidth: BUBBLE_MAX_WIDTH,
          // Silinmiş balon da bir balondur: aynı köşe kuralı (bkz. bubbleCorners).
          ...bubbleCorners(isOwn),
          borderCurve: "continuous",
        }}
      >
        <Text className="italic text-[14px]" style={{ color: colors.textMuted }}>
          {t("chat.bubble.deleted")}
        </Text>
      </View>
    </View>
  );
}

function renderStatus(message: any, isPending: boolean, isFailed: boolean) {
  if (isFailed) return <SFIcon name="exclamationmark.circle.fill" fallback={AlertCircle} size={12} color={colors.errorLight} />;
  if (isPending) return <SFIcon name="clock.fill" fallback={Clock} size={12} color={statusGray()} />;
  if (message.readAt) return <CheckCheck size={14} color={statusGray()} />;
  if (message.deliveredAt) return <CheckCheck size={14} color={statusGray()} />;
  return <SFIcon name="checkmark" fallback={Check} size={14} color={statusGray()} />;
}

function formatTime(iso: string) {
  if (!iso) return "";
  try {
    // parseUtc: Z'siz server damgası `new Date` ile yerel saat sayılıp TR'de
    // 3 saat geriye kayıyordu (00:03 mesajı 21:03 görünüyordu).
    return parseUtc(iso).toLocaleTimeString("tr-TR", { hour: "2-digit", minute: "2-digit" });
  } catch {
    return "";
  }
}

// Alan seti messageEquality.ts'te — ChatMessageList itemsAreEqual ve chatSlice
// reconcile merge'i AYNI fonksiyonu kullanır; drift bug üretir.
export default memo(
  MessageBubble,
  (prev, next) =>
    messageContentEqual(prev.message, next.message) &&
    prev.isOwn === next.isOwn &&
    // Grup boşluğu bir ÖNCEKİ satırın göndericisinden türüyor: mesajın kendi
    // içeriği değişmeden de değişebilir (prepend'de sayfanın ilk mesajı gibi).
    prev.isGroupStart === next.isGroupStart,
);
