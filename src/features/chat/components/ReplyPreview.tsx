import { useState } from "react";
import { View, Text, TouchableOpacity } from "react-native";
import { BlurView } from "expo-blur";
import { GlassView } from "expo-glass-effect";
import { X, MessageSquareReply, Mic } from "@/shared/icons";
import SFIcon from "@/shared/components/SFIcon";
import { useTranslation } from "react-i18next";
import { colors, ink } from "../../../shared/theme/colors";
import { useAppSelector } from "@/shared/hooks/redux";
import {
  formatVoiceDuration,
  isVoiceMessage,
} from "@/features/chat/voiceMessage";
import {
  BUBBLE_PAD_H,
  BUBBLE_PAD_V,
  BUBBLE_RADIUS,
  BUBBLE_TIGHT_RADIUS,
} from "@/features/chat/components/bubbleStyle";
import {
  COMPOSER_ACTION_W,
  composerBarBg,
  COMPOSER_BAR_GAP,
  COMPOSER_BAR_PAD_H,
  COMPOSER_BAR_PAD_V,
  COMPOSER_BLUR_INTENSITY,
  composerBlurTint,
  composerGlassTint,
  COMPOSER_GAP,
} from "@/features/chat/components/composerStyle";
import { glassColorScheme, hasLiquidGlassSurface } from "@/shared/theme/glass";

/**
 * Alıntı kartı ile balon arasındaki boşluk. Kart balonun İÇİNDE değil ÜSTÜNDE
 * durur (bkz. mode="bubble" notu) ve balona BİNMEZ — bindirme denendi, kart
 * balonun içine gömülmüş gibi görünüyordu. Çağıran taraf (MessageBubble ve
 * MessageActionSheet klonu) AYNI sabitten beslenir.
 */
export const REPLY_CARD_GAP = 4;
// Kartın kesimi balonunkiyle AYNI: aynı köşe yarıçapı, aynı iç boşluk
// (bubbleStyle tek kaynak). TEK fark ALT köşe: balonda gönderen tarafın ÜST
// köşesi daralırken kartta bunun ayna görüntüsü olan ALT köşe daralır — kendi
// mesajımda sağ alt, karşı tarafınkinde sol alt. İkisi karşılıklı daralınca
// kart ile balon aynı konuşma yönünü gösteren tek bir yığın gibi okunur.
function replyCardCorners(isOwn: boolean) {
  return isOwn
    ? {
        borderRadius: BUBBLE_RADIUS,
        borderBottomRightRadius: BUBBLE_TIGHT_RADIUS,
      }
    : {
        borderRadius: BUBBLE_RADIUS,
        borderBottomLeftRadius: BUBBLE_TIGHT_RADIUS,
      };
}
// Kart zemini: BALONUN grisi (colors.surface2) — karşı taraf balonuyla aynı
// token, o yüzden kart + balon tek bir yığın gibi okunur ve aradaki 4px'lik
// sayfa zemini şeridi ikisini ayırır. İki taraf için de aynı: kartın kimin
// mesajına ait olduğunu daralan alt köşe zaten söylüyor.
//
// ESKİDEN yarı saydam koyu gri (rgba(28,28,28,0.72)) + blur vardı; koyu modda
// sayfa zemininin üstünde neredeyse siyaha düşüyordu (açık modda ise koyu kart
// olarak kalıyordu — tema hiç dönmüyordu). Fonksiyon, sabit DEĞİL: modül
// seviyesinde değerlenirse tema değişince bayat kalır.
const replyCardBg = () => colors.surface2;
// Kartın iki satırı (isim + içerik önizlemesi) AYNI punto.
const REPLY_CARD_FONT_SIZE = 14;
// Kartın DIŞINDAKİ dikey çizgi — gönderen tarafın kenarında (kendi mesajımda
// sağda, karşı tarafınkinde solda). Kart bu kadar (INSET) ortaya kaçar.
// Çizginin GÖRÜNEN kalınlığı min(W, INSET): INSET çizgiden genişse aradaki fark
// boşluk olarak kalır, darsa çizginin fazlası kartın arkasına girer.
// Renk sohbet zemininin üstünde durduğundan kart üstündeki eski tona göre bir
// tık daha opak (aynı silik his).
const REPLY_LINE_W = 5;
const REPLY_CARD_INSET = 15;
// Fonksiyon: modul seviyesinde sabitlenirse tema degisince bayat kalir.
const replyLineColor = () => colors.hairlineSoft;
// Çizgi kartın tam boyu değil: iki ucundan bu kadar kısalır (dikey ortalı kalır).
const REPLY_LINE_INSET_V = 5;

/**
 * 2 modda kullanılır:
 *  1) `mode="composing"` — input üstünde "yanıtla" preview'i + iptal X butonu
 *  2) `mode="bubble"` — mesajın ÜSTÜNDE duran, arkası blur'lu alıntı kartı.
 *     Kart balonun içinde DEĞİL: ana balon yanıtsız haliyle birebir aynı kalır
 *     (aynı padding, aynı ortalama, içeriği kadar genişlik), kart onun üstünde
 *     REPLY_CARD_GAP boşlukla ayrı bir kutu olarak durur.
 */
export default function ReplyPreview({
  reply,
  mode = "composing",
  onCancel,
  isOwn,
}: any) {
  const { t } = useTranslation();
  // Cam yolunda kapsülün köşesi ÖLÇÜLEN yükseklikten türüyor (bkz. aşağıdaki
  // composing dalı) — yalnız orada yazılır, bubble modunda hiç okunmaz.
  const [capsuleH, setCapsuleH] = useState(0);
  // Sesli mesajın süresi — önce yanıt nesnesinden, yoksa MESAJIN KENDİSİNDEN.
  // İkinci yol şart: yanıt bir ANLIK GÖRÜNTÜ (composing'de yerel taslak,
  // bubble'da sunucunun replyTo bloğu) ve ikisi de süreyi taşımayabiliyor.
  // Asıl mesaj zaten yüklü (yanıtladığın şeyi görüyorsun), oradan okumak
  // sözleşmeye bağımlı olmaktan çıkarıyor.
  const voiceMs = useReplyVoiceDuration(reply);
  if (!reply) return null;

  const senderName =
    reply.senderDisplayName ||
    (reply.isDeleted
      ? t("chat.replyPreview.deletedSender")
      : t("chat.defaultUserName"));
  // mediaLabel SADECE tanınan media tipinde etiket döner; text/bilinmeyen tipte
  // null → metin önizlemesi gösterilir. Eskiden "contentType !== 0" ile karar
  // veriliyordu; backend enum'u isim olarak ("Text") yollayınca metin mesajları
  // media sayılıp "..." görünüyordu.
  const mediaText = mediaLabel(reply.contentType, t, voiceMs);
  const preview = reply.isDeleted
    ? t("chat.replyPreview.deletedMessage")
    : (mediaText ??
      ((reply.contentPreview ?? reply.content ?? "").trim() || "..."));
  // Sesli mesaj önizlemesinin başındaki mikrofon — metnin içinde emoji değil,
  // yanında gerçek sembol.
  const showVoiceIcon = !reply.isDeleted && isVoiceMessage(reply.contentType);

  const isComposing = mode === "composing";
  // composing modunda kap TAM GENİŞLİK (composer çubuğu) → flex:1 doğru.
  // bubble modunda kap İÇERİĞE göre genişler; orada flex:1 (= flexBasis 0)
  // metin sütununu sıfır genişlikte ölçtürüp kartı içerik göstermeyen bir
  // şeride çeviriyordu. flexShrink: metin kendi genişliğinde ölçülür, kart
  // maxWidth'e dayanınca kısalıp "…" ile kesilir.
  const texts = (
    <View style={isComposing ? { flex: 1 } : { flexShrink: 1 }}>
      <Text
        style={{
          // bubble modunda isim, içerik önizlemesiyle AYNI punto (ayırt edici
          // olan kalınlık + tam beyaz renk). composing modunda başlık bir tık
          // büyük kalır — orada kapsül tek başına, hiyerarşiyi o taşıyor.
          fontSize: isComposing ? 15 : REPLY_CARD_FONT_SIZE,
          fontWeight: "600",
          color: colors.text,
        }}
        numberOfLines={1}
      >
        {senderName}
      </Text>
      <View style={{ flexDirection: "row", alignItems: "center", gap: 4 }}>
        {showVoiceIcon && (
          <SFIcon
            name="mic"
            fallback={Mic}
            size={REPLY_CARD_FONT_SIZE}
            strokeWidth={2}
            color={isComposing ? colors.text : ink(0.78)}
          />
        )}
        <Text
          style={{
            fontSize: REPLY_CARD_FONT_SIZE,
            color: isComposing ? colors.text : ink(0.78),
            // Satır kısalınca "…" ikonu değil METNİ kessin.
            flexShrink: 1,
          }}
          numberOfLines={1}
        >
          {preview}
        </Text>
      </View>
    </View>
  );
  // İkonlar input'un + / gönder butonlarıyla AYNI genişlikteki kutulara oturur:
  // dördü de aynı iki dikey eksende hizalanır (kutu genişliği ve aradaki boşluk
  // composerStyle'dan; ayrışırsa hizalama bozulur).
  const body = (
    <>
      {isComposing && (
        <View style={{ width: COMPOSER_ACTION_W, alignItems: "center" }}>
          <SFIcon
            name="arrowshape.turn.up.left.fill"
            fallback={MessageSquareReply}
            size={16}
            color={colors.text}
          />
        </View>
      )}
      {texts}
      {isComposing && (
        <TouchableOpacity
          onPress={onCancel}
          hitSlop={8}
          style={{ width: COMPOSER_ACTION_W, alignItems: "center" }}
        >
          <SFIcon
            name="xmark"
            fallback={X}
            size={18}
            strokeWidth={2}
            weight="semibold"
            color={colors.textSecondary}
          />
        </TouchableOpacity>
      )}
    </>
  );

  // bubble modu: BAĞIMSIZ kart — balonun içinde değil üstünde durur, kendi köşe
  // yarıçapı ve zemini vardır. Zemin OPAK balon grisi (blur YOK: opak zeminin
  // üstündeki blur sadece tint'iyle kartı yeniden koyulaştırıyordu).
  // Dikey çizgi kartın DIŞINDA: gönderen tarafın kenarında durur, kart ondan
  // REPLY_CARD_INSET kadar ortaya kaçar ve çizginin bir kısmını örter (çizgi
  // kartın ARKASINDA kalır). Çizgi de kart da AYNI sarmalayıcıda olduğu için
  // MessageBubble ve MessageActionSheet klonu ikisini de otomatik alır.
  if (!isComposing) {
    return (
      <View style={{ position: "relative" }}>
        <View
          pointerEvents="none"
          style={{
            position: "absolute",
            top: REPLY_LINE_INSET_V,
            bottom: REPLY_LINE_INSET_V,
            left: isOwn ? undefined : 0,
            right: isOwn ? 0 : undefined,
            width: REPLY_LINE_W,
            borderRadius: REPLY_LINE_W / 2,
            backgroundColor: replyLineColor(),
          }}
        />
        <View
          style={{
            marginLeft: isOwn ? 0 : REPLY_CARD_INSET,
            marginRight: isOwn ? REPLY_CARD_INSET : 0,
            ...replyCardCorners(isOwn),
            borderCurve: "continuous",
            overflow: "hidden",
            backgroundColor: replyCardBg(),
            flexDirection: "row",
            paddingHorizontal: BUBBLE_PAD_H,
            paddingVertical: BUBBLE_PAD_V,
          }}
        >
          {texts}
        </View>
      </View>
    );
  }

  // composing modu: mesaj yazma çubuğunun İKİZİ — aynı yüzey, aynı padding, tam
  // yuvarlak köşe (rounded-full). Tüm değerler composerStyle'dan; input ile
  // arasındaki boşluk (COMPOSER_GAP) inputun klavyeyle arasındaki boşlukla aynı.
  // Yatay inset YOK: input ile AYNI padding'li sarmalayıcının içinde durur
  // (MessageComposer), böylece iki kapsülün kenarları birebir hizalı.
  //
  // YÜZEY DE İKİZİ olmak zorunda: input cam olup bu blur kalsaydı alt alta duran
  // iki kapsül iki farklı malzeme gibi okunurdu (bkz. composerStyle dosya başı).
  const glass = hasLiquidGlassSurface();
  const capsule = {
    marginBottom: COMPOSER_GAP,
    paddingHorizontal: COMPOSER_BAR_PAD_H,
    paddingVertical: COMPOSER_BAR_PAD_V,
    borderCurve: "continuous" as const,
    flexDirection: "row" as const,
    alignItems: "center" as const,
    gap: COMPOSER_BAR_GAP,
  };

  if (glass) {
    return (
      // Cam yolunda 999 yarıçap ÇİZİLMEZ: GlassView yarıçapı UICornerRadius'a
      // birebir geçiriyor (node_modules/expo-glass-effect/ios/GlassView.swift),
      // kutudan büyük değer kapsül değil BOZUK köşe üretiyor (aynı tuzak:
      // MessageActionSheet > reactionsRadius). Bu yüzden köşe ölçülen
      // yükseklikten: kapsül içerikle uzasa da (uzun isim/önizleme tek satır
      // kalıyor ama font ölçeği yükseklikleri oynatıyor) pill kalır. İlk kare
      // için ölçüsüz tahmin — iki satır + dolgu.
      // Dolgu ve kenarlık YOK, `overflow: hidden` de yok (bkz. ComposerSurface).
      <GlassView
        glassEffectStyle="regular"
        tintColor={composerGlassTint()}
        colorScheme={glassColorScheme()}
        onLayout={(e) => setCapsuleH(e.nativeEvent.layout.height)}
        style={{
          ...capsule,
          borderRadius: Math.round((capsuleH || REPLY_CAPSULE_FALLBACK_H) / 2),
        }}
      >
        {body}
      </GlassView>
    );
  }

  return (
    <BlurView
      intensity={COMPOSER_BLUR_INTENSITY}
      tint={composerBlurTint()}
      style={{
        ...capsule,
        // Tam yuvarlak: kapsül yüksekliği içerikle değişse de pill kalsın.
        borderRadius: 999,
        // BlurView'da köşe yuvarlatma ancak overflow hidden ile çalışır
        // (MessageComposer'daki input kapsülüyle aynı kural).
        overflow: "hidden",
        backgroundColor: composerBarBg(),
      }}
    >
      {body}
    </BlurView>
  );
}

// Cam yolunda ölçüm gelene kadarki köşe: iki satır (15pt başlık + 14pt
// önizleme) + kapsülün dikey dolgusu. Yalnız İLK kare için — hemen ardından
// gerçek yükseklik yazılıyor.
const REPLY_CAPSULE_FALLBACK_H = 52;

/**
 * Yanıtlanan sesli mesajın süresi (ms). Kaynak sırası:
 *   1) yanıt nesnesinin kendi alanı (ChatScreen > buildReplyDraft kopyalıyor),
 *   2) store'daki GERÇEK mesaj — id ile.
 *
 * Hook KOŞULSUZ çağrılır (erken return'lerden önce); seçici, sesli mesaj
 * değilse ya da süre zaten biliniyorsa store'a hiç bakmaz.
 */
function useReplyVoiceDuration(reply: any): number {
  const known = Number(reply?.durationMs) || 0;
  const id = reply?.id;
  const needsLookup = !known && !!id && isVoiceMessage(reply?.contentType);
  return useAppSelector((s: any) => {
    if (!needsLookup) return known;
    const byConv = s?.chat?.messagesByConv;
    if (!byConv) return 0;
    // Sohbet biliniyorsa tek kova, değilse hepsi taranır — yanıt şeridi ekranda
    // nadiren duruyor, tarama görünür bir maliyet değil.
    const buckets = reply.conversationId
      ? [byConv[reply.conversationId]]
      : Object.values(byConv);
    for (const b of buckets as any[]) {
      const m = b?.messages?.find?.((x: any) => x?.id === id);
      if (m) return Number(m.durationMs) || 0;
    }
    return 0;
  });
}

// Eski (media'lı) mesajlara yanıt verilmiş olabilir — etiketler locale'den.
// Backend enum'u hem sayı (0/1/2/3) hem isim ("Text"/"Image"/…) olarak yollayabildiği
// için ikisi de kabul edilir; media DEĞİLSE null döner → çağıran metni gösterir.
function mediaLabel(
  contentType: any,
  t: (key: string) => string,
  durationMs?: number | null,
): string | null {
  // MessageContentType: 0 Text, 1 Image, 2 Voice, 3 Video, 99 System
  const key =
    typeof contentType === "string" ? contentType.toLowerCase() : contentType;
  switch (key) {
    case 1:
    case "1":
    case "image":
      return `📷 ${t("chat.messages.mediaPhoto")}`;
    // Sesli mesaj süresiyle: "🎙️ Sesli mesaj (1:21)" — Mesajlar listesindeki
    // önizlemeyle aynı biçim. Süre yoksa (eski kayıt, sunucunun yanıt
    // anlık görüntüsünde alan yok) sade etikete düşer.
    // Sesli mesajda emoji YOK: baştaki mikrofon SF sembolü olarak çiziliyor
    // (bkz. isVoicePreview) — composer'ın kayıt tuşuyla ve Mesajlar listesindeki
    // önizlemeyle aynı glif. Emoji o ikonun yanında yabancı duruyordu.
    case 2:
    case "2":
    case "voice":
      return durationMs && durationMs > 0
        ? `${t("chat.messages.mediaVoice")} (${formatVoiceDuration(durationMs)})`
        : t("chat.messages.mediaVoice");
    case 3:
    case "3":
    case "video":
      return `🎬 ${t("chat.messages.mediaVideo")}`;
    default:
      return null;
  }
}
