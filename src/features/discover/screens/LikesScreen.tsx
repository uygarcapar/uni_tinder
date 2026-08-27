import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useTranslation } from 'react-i18next';
import {
  View,
  Text,
  Alert,
  Dimensions,
  TouchableOpacity,
  Platform,
  StyleSheet,
  AppState,
  ActivityIndicator,
} from "react-native";
import { Image } from "expo-image";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { LinearGradient } from "expo-linear-gradient";
import { BlurView } from "expo-blur";
import MaskedView from "@react-native-masked-view/masked-view";
import { easeGradient } from "react-native-easing-gradient";
import * as Haptics from "expo-haptics";
import {
  Ban,
  Check,
  Flag,
  Heart,
  HeartCrack,
  MessageCircle,
  RotateCcw,
  X,
} from "lucide-react-native";
import SFIcon from "@/shared/components/SFIcon";
import type { LikerNote } from "@/shared/types";
import { useNavigation } from "@react-navigation/native";
import Animated, {
  Easing,
  LinearTransition,
  useAnimatedStyle,
  useSharedValue,
  useAnimatedScrollHandler,
  withTiming,
} from "react-native-reanimated";
import { useAppDispatch, useAppSelector } from "@/shared/hooks/redux";
import { refreshEntitlementsForPaywall } from "@/features/profile/subscriptionSlice";
import { usePremiumTier } from "@/features/profile/premiumTier";
import profileService from "@/features/profile/profileService";
import AnimatedPressable from "@/shared/components/AnimatedPressable";
import EmptyState from "@/shared/components/EmptyState";
import LikerSwipeModal from "@/features/discover/components/LikerSwipeModal";
import PurchaseModal from "@/features/discover/components/PurchaseModal";
import RecoveryPurchaseModal from "@/features/discover/components/RecoveryPurchaseModal";
import ReportModal from "@/shared/components/ReportModal";
import moderationService from "@/shared/services/moderationService";
import ScreenHeader from "@/shared/components/ScreenHeader";
import SkeletonBox from "@/shared/components/SkeletonBox";
import PremiumFlame from "@/shared/components/PremiumFlame";
import FilterPills from "@/shared/components/FilterPills";
import SuperLikeHeart from "@/shared/components/SuperLikeHeart";
import NoteGlyph from "@/shared/components/NoteGlyph";
import swipeService from "@/features/discover/swipeService";
import { resolveCardAge } from "@/features/discover/cardPrivacy";
import {
  useSwipeMutation,
  useSwipeStats,
  useSyncRecoverySpend,
} from "@/features/discover/swipeQueries";
import {
  fetchMissedMatches,
  recoverMissedMatch,
} from "@/features/discover/missedMatchRecovery";
import { resolveRecoveryBalance } from "@/features/discover/recoveryQuota";
import { setWhoLikedMe, removeWhoLikedMe } from "@/features/discover/swipeSlice";
import { fetchConversations } from "@/features/chat/chatSlice";
import { showInfoToast, showMissedMatchToast } from "@/shared/services/toaster";

import uiBus from "@/shared/services/uiBus";
import { appPrefs } from "@/shared/utils/appPrefs";
import { colors, gradients, scrimAt, veil } from "../../../shared/theme/colors";
import { useRenderCount } from "@/shared/debug/useRenderCount";

const { width } = Dimensions.get("window");
// Tek sütun: kart soldaki tüm boşluğu kaplar, sağında aksiyon kolonu durur.
// Kolon genişliği HER SEKMEDE aynı (kaçırdıkların sekmesinde tek buton var ama
// yer ayrılır) — yoksa sekme değişiminde kart genişliği zıplardı.
const LIST_H_PADDING = 16;
const ACTION_BUTTON_SIZE = 56;
// Şikayet / engelle — geç ve beğenin uydusu. Kolon genişliğini BÜYÜTMEZ
// (ACTION_BUTTON_SIZE hâlâ kartın genişliğini belirleyen ölçü), sadece kendi
// çapı küçük: moderasyon burada ikincil bir çıkış, asıl aksiyon değil.
const MOD_BUTTON_SIZE = 38;
// Zeminsiz glifler — kabuk kalkınca aynı ölçü küçülmüş gibi okunuyor, ikonlar
// bir tık büyütüldü. Kutular (ACTION_BUTTON_SIZE / MOD_BUTTON_SIZE) artık
// yalnız dokunma alanı ve hizalama görevinde: 34 glif 56'lık kutuya sığar,
// dokunma hedefi daralmaz.
const MAIN_ICON_SIZE = 34;
const ACTION_GAP = 12;
const ACTION_STACK_GAP = 16;
// Uydular ana ikiliye daha yakın durur — eşit boşlukta kolon "dört buton"
// gibi okunuyordu.
const MOD_STACK_GAP = 10;
const CARD_ROW_GAP = 16;
const CARD_WIDTH =
  width - LIST_H_PADDING * 2 - ACTION_GAP - ACTION_BUTTON_SIZE;
const CARD_HEIGHT = Math.round(CARD_WIDTH * 1.1); // Aspect ratio
// Sağ üst rozet (not balonu / superlike kalbi) — tek sabit, ikisi de aynı
// köşede aynı ölçüde durmalı: ayrı sayılar girilseydi kart tipine göre rozet
// büyüyüp küçülüyormuş gibi okunurdu.
const BADGE_SIZE = 34;
// Not rozetinin ÇİZİLEN boyu — rozet kabından (BADGE_SIZE) küçük, kabın içinde
// ortalı. SwipeCard'daki not işaretiyle aynı karar: arkasındaki disk kabı
// dolduruyor, siluet onun içinde nefes alıyor (glyph'in kendi 2/24'lük optik
// payı da bunun içinde).
const NOTE_BADGE_GLYPH_SIZE = 21;
// Kart başlığı 18px — SwipeCard'ın 36px isim / 26px ateş oranını korur.
const LIKE_CARD_FLAME_SIZE = 16;

// ── Not kutusu ───────────────────────────────────────────────────────────────
// Notun metni + NEYE yazıldığı, kartın alt bloğunda isim/üniversitenin altında.
// Genişlik kartın %90'ı; alt bloğun kendi yan payları (16 + 12) zaten buna denk
// düşüyor, yani kutu bloğu doldurur ama kartın kenarına yapışmaz.
const NOTE_BOX_WIDTH = Math.round(CARD_WIDTH * 0.9);
// Hedef önizlemesi kutunun SOL ÜST köşesine biner — NoteComposerModal'daki
// yerleşimin karta göre küçültülmüş hali (orada 52/28): yarısı kutunun içinde,
// gerisi yukarı taşıyor. Kutunun İÇİNE giren pay iki hedefte de AYNI
// (NOTE_PREVIEW_INSET), değişen şey yukarı taşan kısım — yazı her iki durumda
// da aynı yerden başlasın.
const NOTE_THUMB_SIZE = 40;
const NOTE_PREVIEW_INSET = 16;
const NOTE_PREVIEW_LEFT = 8;
const NOTE_THUMB_OVERHANG = NOTE_THUMB_SIZE - NOTE_PREVIEW_INSET;
// Yazının kutu kenarlarına nefes payı. Önizleme varken üst pay onun içeri giren
// kısmı kadar büyüyor — ilk satır thumbnail'in/chip'in altında kalmasın.
const NOTE_BOX_PAD_V = 12;
const NOTE_BOX_PAD_H = 14;
// Prompt hedefinin mini kartı: soru üstte (tek satır), cevap altında tırnakla
// (tek satır). Kartın yüksekliği SABİT olduğu için ikisi de kırpılıyor — burası
// hedefi hatırlatan etiket, cevabın okunduğu yer değil.
const NOTE_CHIP_PAD_V = 10;
const NOTE_CHIP_QUESTION_LINE = 15;
const NOTE_CHIP_GAP = 2;
const NOTE_CHIP_ANSWER_LINE = 19;
const NOTE_CHIP_ICON_SIZE = 12;
// Chip ÖLÇÜLÜYOR (cevabı hiç olmayan hedefte tek satıra iniyor); bu yalnız ilk
// karenin tahmini — yaygın hâl soru + cevap.
const NOTE_CHIP_HEIGHT_ESTIMATE =
  2 + 2 * NOTE_CHIP_PAD_V + NOTE_CHIP_QUESTION_LINE + NOTE_CHIP_GAP + NOTE_CHIP_ANSWER_LINE;

// Kartın listeden düşerken oynattığı çıkış animasyonu. Süre TEK yerde duruyor:
// kart bu süre boyunca uçup sönerken ekran onu veride tutuyor, sonra çıkarıyor
// (bkz. runCardExit) — yoksa animasyonun oynayacağı bir görünüm kalmazdı.
const CARD_EXIT_MS = 260;
// Kart düştükten sonra boşluğun kapanması. Çıkıştan biraz daha yavaş ve
// yumuşak: kart önce uçar, alttakiler sonra sakince yukarı kayar. İkisi eşit
// hızda olsaydı tek bir sıçrama gibi okunurdu.
const LIST_SHIFT_MS = 320;

// Ekran görünür olduğunda listenin bu yaştan eskiyse tazelenmesi. Tab'lar arası
// gidip gelmeyi her seferinde isteğe çevirmeyecek kadar uzun, "bildirime basıp
// girdim, beğeni orada olsun" beklentisini karşılayacak kadar kısa.
const LIKES_STALE_MS = 30 * 1000;

// Kurtarma 200 döndükten sonra `MatchNotification` için beklenen süre. Backend
// eşleşmeyi asenkron yazıyor ve sinyali SignalR taşıyor; bağlantı kopmuşsa
// sohbet backend'de vardır ama uygulama görmez. Süre dolduğunda sohbet listesi
// BİR KEZ tazeleniyor (döngü değil). Backend önerisi: 10 sn.
const MATCH_SIGNAL_TIMEOUT_MS = 10 * 1000;

// Skeleton yalnız istek gerçekten "bekleniyor" hissi verecek kadar sürerse
// görünür. Boş liste cevabı tipik olarak 200ms'nin altında dönüyor ve grid'i
// gösterip hemen boş duruma atlamak ekranda yanıp sönme olarak okunuyordu:
// önce gecikme (bu süre içinde biterse shimmer hiç çizilmez), bir kez çizildiyse
// de minimum süre ekranda kalır (30ms'lik shimmer yerine kasıtlı bir bekleme).
const SKELETON_DELAY_MS = 220;
const SKELETON_MIN_VISIBLE_MS = 450;

// Kart fotoğrafının iskelet zemininde en fazla bekleyeceği süre — bkz. LikeCard
// içindeki emniyet freni. Yavaş bağlantıda gerçek yüklemeyi kesmeyecek kadar
// uzun, takılan bir kartı ekranda bırakmayacak kadar kısa.
const IMAGE_LOAD_TIMEOUT_MS = 6000;

// Açıklama kartının "kapatıldı" bayrağı — DiscoverScreen tutorial'ı gibi userId
// ile scope'lanır ve logout'ta silinmez (bkz. appPrefs): kart ilk açılıştan
// itibaren HER girişte durur, X'e basılana kadar; basıldıktan sonra bir daha
// hiç gelmez.
const LIKES_INFO_DISMISSED_KEY = "likesInfoDismissed";

// Kaçırdıkların sekmesinin AYRI bayrağı. Kart görsel olarak aynı kart ama iki
// farklı mekaniği anlatıyor (beğeni listesi ↔ pas → beğeni + hak harcama), ve
// bu sekmeye çoğu kullanıcı beğeni listesini gezdikten çok sonra giriyor. Ortak
// bayrakta beğeni sekmesindeki X, kullanıcı kurtarma anlatısını hiç görmeden
// onu da yutuyordu; artık her sekme kendi kartını bir kez gösterip kapatıyor.
const MISSED_INFO_DISMISSED_KEY = "likesMissedInfoDismissed";

/**
 * Liker kaydındaki not bloğu → kartın okuduğu şekil.
 *
 * Yorum boşsa (ya da alan hiç yoksa) `null` dönüyor: kart `!!item.note`'a
 * bakarak hem blur'u açıyor hem rozeti çiziyor, boş bir nesne o iki kararı da
 * yanlış tarafa çevirirdi — yorumsuz bir "not" ürün olarak da yok.
 *
 * Moderasyon bir notu reddederse sunucu `isNote: false` + `note: null` dönüyor
 * ama LIKE listede KALIYOR (sözleşme §3.6) — o kart burada notsuz bir beğeni
 * olarak normalleşiyor, kart düşmüyor. Ek iş gerekmiyor.
 *
 * ⚠️ Hedef alanları backend'in GÖNDERİM ANINDA aldığı kopyalar; bugünkü
 * profilden yeniden çözülmüyor (D4 = snapshot). TEK İSTİSNA `promptDisplay`:
 * o okuma anında İZLEYİCİNİN dilinde çözülüyor (§3.2), çünkü snapshot'a
 * yazılsaydı gönderenin dilinde donardı.
 */
function normalizeLikerNote(p: any): LikerNote | null {
  const raw = p?.note;
  const comment = typeof raw?.comment === "string" ? raw.comment.trim() : "";
  if (!comment) return null;
  return {
    noteId: raw?.noteId ?? null,
    comment,
    sentAt: raw?.sentAt ?? null,
    target: raw?.target
      ? {
          kind: raw.target.kind === "Prompt" ? "Prompt" : "Photo",
          photoUrl: raw.target.photoUrl ?? null,
          promptKey: raw.target.promptKey ?? null,
          promptDisplay: raw.target.promptDisplay ?? null,
          promptAnswer: raw.target.promptAnswer ?? null,
        }
      : null,
  };
}

// Yatay padding + üst boşluk YOK: bu liste FlatList'in ListEmptyComponent'i
// olarak contentContainer'ın içinde çiziliyor, hizayı oradan alır. Böylece
// skeleton satırları gerçek kartlarla birebir aynı yerde durur — aksiyon
// kolonu dahil (yoksa veri gelince kart genişliği zıplardı).
// Glif iskeleti: dış kutu gerçek butonun DOKUNMA ölçüsünde (hizayı o verir),
// içindeki daire glif ölçüsünde. İkisini ayırmasak ya kolon yanlış yerde
// dururdu ya da veri gelince ikonlar küçülmüş gibi görünürdü.
function SkeletonGlyph({ box, glyph }) {
  return (
    <View
      style={{
        width: box,
        height: box,
        alignItems: "center",
        justifyContent: "center",
      }}
    >
      <SkeletonBox width={glyph} height={glyph} borderRadius={999} />
    </View>
  );
}

// `showModeration`: uydu glifleri gerçek kartta premium'a bağlı (bkz.
// canModerate). İskelet koşulsuz dört daire çizseydi veri gelince free
// kullanıcının kolonu ikiye düşer, kolon "eksilmiş" gibi görünürdü.
function LikesSkeletonList({ showModeration = false }) {
  const placeholders = Array.from({ length: 3 });
  return (
    <View>
      {placeholders.map((_, i) => (
        <View
          key={i}
          style={{
            flexDirection: "row",
            alignItems: "center",
            marginBottom: CARD_ROW_GAP,
          }}
        >
          <SkeletonBox
            width={CARD_WIDTH}
            height={CARD_HEIGHT}
            borderRadius={40}
          />
          {/* Aksiyon kolonu — glif ÖLÇÜSÜNDE dört daire, buton kutusu
              ölçüsünde değil: kolon artık zeminsiz ikonlardan oluşuyor
              (bkz. LikeActionButton), 56'lık dolu pillerle beklemek veri
              gelince kolonun küçülmesi gibi görünüyordu. */}
          <View
            style={{
              width: ACTION_BUTTON_SIZE,
              marginLeft: ACTION_GAP,
              alignItems: "center",
              gap: MOD_STACK_GAP,
            }}
          >
            {showModeration && (
              <SkeletonGlyph box={MOD_BUTTON_SIZE} glyph={20} />
            )}
            <View style={{ gap: ACTION_STACK_GAP, alignItems: "center" }}>
              <SkeletonGlyph box={ACTION_BUTTON_SIZE} glyph={MAIN_ICON_SIZE} />
              <SkeletonGlyph box={ACTION_BUTTON_SIZE} glyph={MAIN_ICON_SIZE} />
            </View>
            {showModeration && (
              <SkeletonGlyph box={MOD_BUTTON_SIZE} glyph={20} />
            )}
          </View>
        </View>
      ))}
    </View>
  );
}

// Sayfa açıklaması — ProfileScreen'in CompletionAccordion'ıyla aynı kabuk
// (0.5px beyaz kenar, surface zemin) ama açılır/kapanır DEĞİL: başlık ve
// chevron yok, içerik hep görünür. Tek işi "bu sayfa ne" demek. Sağdaki X
// kalıcı kapatır (bkz. LIKES_INFO_DISMISSED_KEY).
function LikesInfoCard({ description, onDismiss }) {
  return (
    <View
      style={{
        backgroundColor: colors.surface,
        marginBottom: 16,
        paddingVertical: 16,
        paddingLeft: 16,
        paddingRight: 12,
        borderRadius: 24,
        borderCurve: "continuous",
        borderWidth: 0.5,
        borderColor: colors.hairline,
        overflow: "hidden",
        flexDirection: "row",
        alignItems: "center",
        gap: 8,
      }}
    >
      <Text
        style={{
          flex: 1,
          color: colors.textSecondary,
          fontSize: 14,
          lineHeight: 20,
        }}
      >
        {description}
      </Text>
      <TouchableOpacity
        onPress={onDismiss}
        activeOpacity={0.6}
        hitSlop={{ top: 12, bottom: 12, left: 12, right: 12 }}
      >
        <SFIcon
          name="xmark"
          fallback={X}
          size={16}
          color={colors.textSecondary}
          strokeWidth={2}
          weight="semibold"
        />
      </TouchableOpacity>
    </View>
  );
}

// Daha önce yüklenmiş foto URI'leri — tab değişip remount olunca skeleton'a tekrar düşmesin
const loadedPhotoUris = new Set();

/**
 * Kartın sağındaki aksiyon glifi — kaydırma jestinin dokunmatik karşılığı.
 * Zemin ve kenar YOK: aksiyonlar birbirinden RENKLE ayrışıyor (geç nötr
 * mürekkep, beğen SuperLike kırmızısı, moderasyon errorStrong). Eskiden
 * yuvarlak dolgulu kabuklar vardı; kolonda dört kutu üst üste gelince kart
 * yerine butonlar bakılan şey oluyordu.
 *
 * `size` görünen ölçü değil DOKUNMA alanı: glif `iconSize` kadar, kutu onu
 * saran hedef (üstüne hitSlop de var).
 */
function LikeActionButton({
  sf,
  fallback,
  busy = false,
  onPress,
  accessibilityLabel,
  tint,
  // Moderasyon uyduları küçük gelir: geç/beğen ile aynı ağırlıkta çizilseler
  // kolon dört eşit glife dönüşür ve asıl aksiyonlar kaybolurdu.
  size = ACTION_BUTTON_SIZE,
  iconSize = MAIN_ICON_SIZE,
  // Küçük glifte 2.4 kalınlık lekeye dönüşüyor (lucide fallback'i; SF tarafında
  // `weight` zaten ölçeğe göre iniyor).
  iconStrokeWidth = 2.4,
  // iOS'ta kalınlığı belirleyen tek şey bu (strokeWidth yalnız lucide'a gider);
  // ana ikiliyi uydulardan ayırmak için ayrı ayarlanabilir.
  iconWeight = "semibold" as "semibold" | "bold",
}) {
  return (
    <AnimatedPressable
      pressScale={0.9}
      onPress={onPress}
      disabled={busy}
      accessibilityLabel={accessibilityLabel}
      accessibilityRole="button"
      // Kutu dar kaldığında bile parmak hedefi büyük kalsın; kolonun kendisi
      // genişleyemez (kart genişliğini yerdi).
      hitSlop={8}
      style={{
        width: size,
        height: size,
        alignItems: "center",
        justifyContent: "center",
        opacity: busy ? 0.6 : 1,
      }}
    >
      {busy ? (
        <ActivityIndicator size="small" color={tint} />
      ) : (
        <SFIcon
          name={sf}
          fallback={fallback}
          size={iconSize}
          color={tint}
          strokeWidth={iconStrokeWidth}
          weight={iconWeight}
        />
      )}
    </AnimatedPressable>
  );
}

/**
 * Kartın alt bloğundaki not kutusu — notun METNİ ve NEYE yazıldığı.
 *
 * ZEMİN `veil`: açık modda BEYAZ, koyu modda SİYAH; yazı `colors.text` ile tam
 * tersi. Kutu bir FOTOĞRAFIN üstünde duruyor, o yüzden tema yüzeyleri
 * (`surface`) değil perde kullanılıyor — fotoğrafın parlaklığı ne olursa olsun
 * kutu okunur kalıyor (SwipeCard'daki not diskiyle aynı karar). Tam opak değil:
 * altındaki fotoğraf bir tık sızsın, kutu yapıştırılmış bir pul gibi durmasın.
 *
 * HEDEF ÖNİZLEMESİ NoteComposerModal'daki yerleşimin küçültülmüşü: kutunun sol
 * üst köşesine binen fotoğraf thumbnail'i ya da prompt chip'i. Gönderen "neye
 * yazıyorum"u orada görüyordu, alan da "neye yazılmış"ı burada görüyor — aynı
 * dil, aynı köşe.
 *
 * ⚠️ Hedef alanları GÖNDERİM ANINDAKİ kopyalar (snapshot): fotoğraf profilden
 * silinmiş olsa bile `photoUrl` notun yanında durur. Hedefi hiç olmayan not
 * (eski kayıt / realtime önizleme) sadece kutu olarak çizilir, önizlemesiz.
 */
function LikeNoteBox({ note }) {
  const { t } = useTranslation();
  const target = note?.target ?? null;
  const photoUri = target?.kind === "Photo" ? target.photoUrl || null : null;
  const promptAnswer = target?.kind === "Prompt" ? target.promptAnswer : null;
  // Soru metni izleyicinin dilinde çözülmüş gelir (`promptDisplay`, sözleşme
  // §3.2). Gelmediyse jenerik etiket: chip'in ilk satırı boş kalırsa cevap
  // başlıksız asılı durur.
  const promptLabel =
    target?.kind === "Prompt"
      ? target.promptDisplay || t("note.targetPrompt")
      : null;
  const showChip = !!promptLabel;
  const [chipHeight, setChipHeight] = useState(NOTE_CHIP_HEIGHT_ESTIMATE);
  // Kutunun İÇİNE giren pay sabit; değişen, yukarı taşan kısım.
  const chipOverhang = Math.max(0, chipHeight - NOTE_PREVIEW_INSET);
  const overhang = photoUri
    ? NOTE_THUMB_OVERHANG
    : showChip
      ? chipOverhang
      : 0;
  const hasPreview = !!photoUri || showChip;

  return (
    // Sarmalayıcının padding'i YOK: önizleme kutunun çocuğu değil KARDEŞİ
    // (Yoga absolute çocuğu ebeveynin padding'ine göre konumlandırır, `top: -x`
    // taşma yerine kutunun içine düşerdi). Üst marj = taşma + nefes, yoksa
    // önizleme üniversite satırının üstüne biner.
    <View
      style={{
        marginTop: 8 + overhang,
        width: NOTE_BOX_WIDTH,
        maxWidth: "100%",
      }}
    >
      <View
        style={{
          backgroundColor: veil(0.92),
          borderRadius: 22,
          borderCurve: "continuous",
          paddingTop: hasPreview
            ? NOTE_PREVIEW_INSET + NOTE_BOX_PAD_V
            : NOTE_BOX_PAD_V,
          paddingBottom: NOTE_BOX_PAD_V,
          paddingHorizontal: NOTE_BOX_PAD_H,
        }}
      >
        <Text
          numberOfLines={2}
          style={{
            color: colors.text,
            fontSize: 13,
            lineHeight: 18,
            fontWeight: "500",
          }}
        >
          {note.comment}
        </Text>
      </View>

      {/* Prompt chip'i — soru üstte soluk, cevap altında tırnakla. Kontur
          gölgenin yerine geçiyor: dolgu kutuyla aynı renk olduğu için chip'in
          kutunun üst çizgisini kestiği yeri tanımlayan tek şey o. */}
      {showChip && (
        <View
          pointerEvents="none"
          onLayout={(e) => setChipHeight(e.nativeEvent.layout.height)}
          style={{
            position: "absolute",
            top: -chipOverhang,
            left: NOTE_PREVIEW_LEFT,
            maxWidth: "92%",
            borderRadius: 18,
            borderCurve: "continuous",
            borderWidth: 1,
            borderColor: colors.border,
            backgroundColor: veil(0.92),
            paddingVertical: NOTE_CHIP_PAD_V,
            paddingHorizontal: 12,
          }}
        >
          <Text
            numberOfLines={1}
            style={{
              color: colors.textMuted,
              fontSize: 11,
              fontWeight: "600",
              lineHeight: NOTE_CHIP_QUESTION_LINE,
            }}
          >
            {promptLabel}
          </Text>
          {!!promptAnswer && (
            <View
              style={{
                flexDirection: "row",
                alignItems: "flex-start",
                gap: 5,
                marginTop: NOTE_CHIP_GAP,
              }}
            >
              <SFIcon
                name="quote.opening"
                fallback={MessageCircle}
                size={NOTE_CHIP_ICON_SIZE}
                color={colors.text}
                // İkon satırın ortasına otursun: (satır boyu - ikon) / 2.
                style={{
                  marginTop: (NOTE_CHIP_ANSWER_LINE - NOTE_CHIP_ICON_SIZE) / 2,
                }}
              />
              <Text
                numberOfLines={1}
                style={{
                  color: colors.text,
                  fontSize: 14,
                  fontWeight: "600",
                  lineHeight: NOTE_CHIP_ANSWER_LINE,
                  flexShrink: 1,
                }}
              >
                {promptAnswer}
              </Text>
            </View>
          )}
        </View>
      )}

      {/* Foto hedefi — chip'le AYNI köşede, aynı sebeple kutunun kardeşi. İkisi
          bir arada olmaz: hedef ya foto ya prompt. Kontur kutu renginde, kesiği
          temiz bitirsin diye. */}
      {!!photoUri && (
        <Image
          source={{ uri: photoUri }}
          pointerEvents="none"
          style={{
            position: "absolute",
            top: -NOTE_THUMB_OVERHANG,
            left: NOTE_PREVIEW_LEFT,
            width: NOTE_THUMB_SIZE,
            height: NOTE_THUMB_SIZE,
            // borderCurve YOK: expo-image'ın ImageStyle'ı kabul etmiyor.
            borderRadius: 14,
            borderWidth: 3,
            borderColor: veil(0.92),
            backgroundColor: colors.surfaceTranslucent,
          }}
          contentFit="cover"
          cachePolicy="memory-disk"
          recyclingKey={photoUri}
          transition={150}
        />
      )}
    </View>
  );
}

function LikeCard({
  item,
  isPremium,
  onPress,
  // Kaçırılan eşleşme kartları — bkz. `alwaysClear`.
  onRecover,
  recovering,
  // Kaydırmanın dokunmatik karşılığı: sağdaki kolondan geç/beğen.
  onPass,
  onLike,
  acting,
  // Moderasyon — kolonun altında/üstünde küçük uydular. Premium'a kapalı:
  // ekran ikisini de YALNIZ premium'a veriyor (bkz. canModerate), free
  // kullanıcıda `undefined` gelir ve uydular hiç çizilmez.
  onReport,
  onBlock,
  passLabel,
  likeLabel,
  recoverLabel,
  reportLabel,
  blockLabel,
  // Kaçırdıkların sekmesi blur UYGULAMAZ: liste backend'de premium gating'e
  // tabi değil ve kullanıcı bu kişileri destede zaten görmüş. Blur burada
  // upsell değil, "kurtarmak için önce kimi kaçırdığını gör" akışını kırardı.
  alwaysClear,
  // Çıkış animasyonu: "left" / "right" jestin yönüne uçurur, "out" yerinde
  // söndürür (engelleme gibi yönü olmayan düşüşler). null → kart duruyor.
  exitDirection = null,
}) {
  const [imgLoading, setImgLoading] = useState(
    !!item.mainPhoto && !loadedPhotoUris.has(item.mainPhoto),
  );
  // Emniyet freni: geçersiz/expired bir URI'de expo-image ne `onLoadEnd` ne
  // `onError` verebiliyor — o durumda shimmer sonsuza kadar kalıyor ve kart
  // "yükleniyorda takıldı" gibi okunuyordu. Kart en fazla bu kadar bekler,
  // sonra fotoğrafın gelmediğini kabul edip zemine düşer.
  useEffect(() => {
    if (!imgLoading) return;
    const id = setTimeout(() => setImgLoading(false), IMAGE_LOAD_TIMEOUT_MS);
    return () => clearTimeout(id);
  }, [imgLoading]);
  // SuperLike'lar premium olmasa da blur'suz görünür — NOT da öyle.
  //
  // Notun ürün değerinin tamamı bu satırda: kullanıcı "kim yazdı"yı görebilsin
  // diye para ödüyor. Blur'u premium'a bağlarsak satın alınan şey teslim
  // edilmemiş olur.
  //
  // ✅ Sunucu maskeleme YAPMIYOR (sözleşme §3.3 teyidi): `displayName`/`photos`
  // free kullanıcıya da gerçek değerleriyle geliyor, blur tamamen bu görsel
  // katman. ⚠️ AMA "blursuz" ≠ "tüm alanlar dolu" (§3.4): gönderenin KENDİ
  // gizlilik tercihleri (yaş/konum/mesafe) sert kural, notu alan da bypass
  // edemez — `age: 0` / `city: null` gelen bir not kartı bug DEĞİL.
  const showClear =
    alwaysClear || isPremium || item.isSuperLike || !!item.note || !!item.isNote;

  // Çıkış — kart yalnız GÖRSEL olarak gider; veriden düşürmeyi ekran yapıyor
  // (bkz. runCardExit), o yüzden burada bitişte çağrılacak bir callback yok.
  // Hepsi transform/opacity: layout'a dokunmadığı için kare başına Fabric
  // commit'i doğurmaz, boşluğun kapanması ayrı iş (itemLayoutAnimation).
  const exitProgress = useSharedValue(0);
  useEffect(() => {
    if (!exitDirection) {
      // Emniyet: çıkış başlayıp kart bir şekilde listede kalırsa (ör. tazeleme
      // onu geri getirdi) görünmez bir hayalet bırakmasın, yerine otursun.
      exitProgress.value = 0;
      return;
    }
    exitProgress.value = withTiming(1, {
      duration: CARD_EXIT_MS,
      easing: Easing.out(Easing.cubic),
    });
  }, [exitDirection, exitProgress]);
  const exitAxis =
    exitDirection === "left" ? -1 : exitDirection === "right" ? 1 : 0;
  const exitStyle = useAnimatedStyle(() => {
    const p = exitProgress.value;
    return {
      opacity: 1 - p,
      // `as const`: RN'in transform tipi her elemanın TEK anahtarlı olmasını
      // istiyor, TS ise heterojen diziyi `{translateX; rotate?: undefined}`
      // birleşimi olarak çıkarıyor (bkz. SwipeCard'daki aynı kaçış).
      transform: [
        { translateX: exitAxis * width * 0.7 * p },
        // Hafif eğim — kaydırma jestinde kartın yaptığının aynısı; butonla
        // yapılan aksiyon da aynı hareketin karşılığı olarak okunsun.
        { rotate: `${exitAxis * 7 * p}deg` },
        { scale: 1 - 0.08 * p },
      ] as const,
    };
  }, [exitAxis]);

  return (
    <Animated.View
      // Uçarken dokunuş almasın: kart hâlâ ekranda ve basılırsa profil açılır
      // ya da ikinci bir aksiyon gider.
      pointerEvents={exitDirection ? "none" : "auto"}
      style={[
        {
          flexDirection: "row",
          alignItems: "center",
          marginBottom: CARD_ROW_GAP,
        },
        exitStyle,
      ]}
    >
      {/* Basılı tutunca YALNIZ ölçü değişir, opaklık değil (activeOpacity 1):
          kart bir fotoğraf taşıyor, soldurmak onu "pasif" gösteriyordu.
          Ölçü düşüşü kasten çok küçük (0.98) — büyük bir yüzeyde 0.97'lik
          varsayılan bile kartı yerinden oynatıyormuş gibi okunuyor. Yaylanma
          kapalı: bırakışta 1'i geçen taşma, tam genişlikteki kartta liste
          zıplıyormuş hissi veriyor (bkz. AnimatedPressable'daki not). */}
      <AnimatedPressable
        activeOpacity={1}
        pressScale={0.98}
        pressBounciness={0}
        onPress={onPress}
        style={{
          width: CARD_WIDTH,
        }}
      >
        <View
          style={{
            width: CARD_WIDTH,
            height: CARD_HEIGHT,
            borderRadius: 40,
            borderWidth:0.3,
            borderColor: colors.hairline,
            borderCurve: "continuous",
            overflow: "hidden",
            backgroundColor: colors.surface,
          }}
        >
          {/* İskelet ZEMİNDE, fotoğrafın ALTINDA duruyor: görsel yüklenince
              üstüne biner (expo-image `transition`) ve shimmer kendiliğinden
              görünmez olur. Eskiden fotoğrafın ÜSTÜNDE mutlak bir katmandı —
              `imgLoading` bir şekilde false'a dönmezse (aşağıdaki onError /
              emniyet freni bunun içindir) kart sonsuza kadar yüklenir gibi
              duruyordu; blur da o shimmer'ın üstüne binince kart "takıldı"
              gibi okunuyordu.
              Fotoğrafı HİÇ olmayan kartta shimmer yok: gelecek bir şey yokken
              parlatmak yükleniyor yanılsaması yaratır, düz yüzey doğru cevap
              (kartın kendi `backgroundColor`'ı zaten o). */}
          {imgLoading && !!item.mainPhoto && (
            <View
              style={{
                position: "absolute",
                top: 0,
                left: 0,
                right: 0,
                bottom: 0,
              }}
              pointerEvents="none"
            >
              <SkeletonBox
                width={CARD_WIDTH}
                height={CARD_HEIGHT}
                borderRadius={40}
              />
            </View>
          )}

          {item.mainPhoto ? (
            <Image
              source={{ uri: item.mainPhoto }}
              style={{ width: "100%", height: "100%" }}
              contentFit="cover"
              cachePolicy="memory-disk"
              transition={200}
              onLoadStart={() => {
                if (!loadedPhotoUris.has(item.mainPhoto)) setImgLoading(true);
              }}
              onLoadEnd={() => {
                loadedPhotoUris.add(item.mainPhoto);
                setImgLoading(false);
              }}
              // `onLoadEnd` hata dalında da tetiklenmeli ama expo-image bunu her
              // hata türünde garanti etmiyor; ölü bir link iskeleti ekranda
              // bırakmasın.
              onError={() => setImgLoading(false)}
            />
          ) : null}

          {!showClear && (
            <BlurView
              intensity={70}
              tint="light"
              style={{
                position: "absolute",
                top: 0,
                left: 0,
                right: 0,
                bottom: 0,
              }}
            />
          )}

          {/* Sağ üst rozet — superlike'ta LitPlus tonlu gradient kalp, notta
              konuşma balonu. İkisi aynı köşeyi paylaşıyor; birlikte gelemezler
              (öneri dokümanı D8: not ve superlike ayrı ürünler), yine de not
              öncelikli çiziliyor — yorum, kartın taşıdığı daha zengin bilgi.
              Rozet `note` İÇERİĞİNE değil `isNote` BAYRAĞINA da bakıyor:
              önizleme boş gelen bir notta (realtime payload'ında `notePreview`
              yok, ya da liste yorumu kırpmış) kart notluğunu kaybediyordu —
              blur zaten bayrakla açılıyordu, rozet açılmıyordu. */}
          {item.note || item.isNote ? (
            <View
              style={{
                position: "absolute",
                top: 12,
                right: 12,
                width: BADGE_SIZE,
                height: BADGE_SIZE,
                alignItems: "center",
                justifyContent: "center",
              }}
              pointerEvents="none"
            >
              {/* Disk — işaretin ARKASINDA, mutlak ve ortalı. Rengi `veil`:
                  açık modda beyaz, koyu modda siyah, yani işaretin (`text`) tam
                  tersi — fotoğrafın altında ne varsa siluetin kenarı her
                  zeminde tutuyor (SwipeCard'daki not diskiyle aynı karar). */}
              <View
                style={{
                  position: "absolute",
                  width: BADGE_SIZE,
                  height: BADGE_SIZE,
                  borderRadius: 999,
                  backgroundColor: veil(0.92),
                }}
              />
              {/* SF `bubble.left.fill` DEĞİL: ürünün kendi işareti — uygulama
                  ikonundan sökülen konuşma balonu (NoteGlyph), super-like
                  kalbinin kardeşi. Not nerede görünürse aynı şekli kullanıyor
                  (SwipeCard'daki not kutusu, paket modalı, toast).
                  Balonun içindeki kalp DELİK: altındaki disk oradan görünür. */}
              <NoteGlyph
                size={NOTE_BADGE_GLYPH_SIZE}
                color={colors.text}
                stroke={colors.swipeHeartBorder}
                strokeWidth={0.1}
              />
            </View>
          ) : (
            item.isSuperLike && (
              <View
                style={{
                  position: "absolute",
                  top: 12,
                  right: 12,
                }}
                pointerEvents="none"
              >
                <SuperLikeHeart size={BADGE_SIZE} />
              </View>
            )
          )}

          {/* İsim & yaş — kartın sol altında, beyaz. Okunabilirlik için alt gradient scrim. */}
          {showClear && (
            <>
              {/* Alt progressive blur — SwipeCard'ın collapsed bottom blur'u gibi.
                  Karartma yerine maskeli hafif blur (üstten transparan → alta doğru). */}
              <View
                pointerEvents="none"
                style={{
                  position: "absolute",
                  left: 0,
                  right: 0,
                  bottom: 0,
                  height: CARD_HEIGHT * 0.33,
                }}
              >
                <MaskedView
                  style={{ flex: 1 }}
                  maskElement={
                    <LinearGradient
                      {...(easeGradient({
                        colorStops: {
                          0: { color: "transparent" },
                          0.5: { color: "black" },
                          1: { color: "rgba(0,0,0,0.99)" },
                        },
                      }) as any)}
                      style={StyleSheet.absoluteFill}
                    />
                  }
                >
                  <LinearGradient
                    colors={[scrimAt(0.1), colors.mediaScrimSoft]}
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
              <View
                style={{
                  position: "absolute",
                  left: 16,
                  right: 12,
                  bottom: 24,
                }}
              >
                <View
                  style={{
                    flexDirection: "row",
                    alignItems: "baseline",
                    maxWidth: "90%",
                  }}
                >
                  <Text
                    numberOfLines={1}
                    style={{
                      flexShrink: 1,
                      color: colors.onMedia,
                      fontSize: 18,
                      fontWeight: "700",
                    }}
                  >
                    {item.name}
                  </Text>
                  {item.age != null && (
                    <Text
                      style={{
                        flexShrink: 0,
                        color: colors.onMedia,
                        fontSize: 18,
                        fontWeight: "700",
                      }}
                    >
                      {`, ${item.age}`}
                    </Text>
                  )}
                  {/* Premium rozeti — SwipeCard'daki ateşin aynısı, yaşın sağında.
                      Satır baseline hizalı olduğu için ikon kendi ekseninde
                      ortalanır (View'ın baseline'ı alt kenarıdır). */}
                  {item.isPremium && (
                    <PremiumFlame
                      size={LIKE_CARD_FLAME_SIZE}
                      style={{ flexShrink: 0, marginLeft: 4, alignSelf: "center" }}
                    />
                  )}
                </View>
                {!!item.universityName && (
                  <Text
                    numberOfLines={1}
                    style={{
                      marginTop: 2,
                      maxWidth: "90%",
                      color: colors.onMedia,
                      fontSize: 14,
                      fontWeight: "600",
                    }}
                  >
                    {item.universityName}
                  </Text>
                )}
                {/* Not — ismin ve üniversitenin ALTINDA, kendi kutusunda.
                    Kartın en değerli satırı: kişi bir şey YAZMIŞ. Hedef bilgisi
                    (hangi fotoğraf / hangi prompt) artık kutunun köşesine binen
                    önizlemede duruyor — notun anlamı neye yazıldığından
                    ayrılamıyor (bkz. LikeNoteBox). */}
                {!!item.note?.comment && <LikeNoteBox note={item.note} />}
              </View>
            </>
          )}

          {/* Blurlu (kilitli) kartlar — isim/yaş/üni yerine kutu placeholder.
              Blur BEYAZ (tint="light") olduğu için kutular koyu: beyaz kutu
              beyaz camın üstünde kaybolurdu.
              Genişlikler gerçek metin uzunluğuna göre dinamik (karakter ≈ px). */}
          {!showClear && (() => {
            const maxW = CARD_WIDTH - 32;
            const nameText =
              item.age != null ? `${item.name || ""}, ${item.age}` : item.name || "";
            const nameW = Math.min(
              maxW,
              Math.max(28, Math.round(nameText.length * 9.5)),
            );
            return (
              <View
                style={{
                  position: "absolute",
                  left: 16,
                  right: 16,
                  bottom: 20,
                }}
                pointerEvents="none"
              >
                <View
                  style={{
                    width: nameW,
                    height: 16,
                    borderRadius: 6,
                    backgroundColor: scrimAt(0.6),
                  }}
                />
                <View
                  style={{
                    marginTop: 8,
                    width: "80%",
                    height: 12,
                    borderRadius: 5,
                    backgroundColor: scrimAt(0.35),
                  }}
                />
              </View>
            );
          })()}
        </View>
      </AnimatedPressable>

      {/* Aksiyon kolonu — kartın sağında, dikeyde ortalanmış. Kaçırdıkların
          sekmesinde geç/beğen yerine TEK "kurtar" butonu var (pas zaten
          verilmiş, geri alınacak tek şey kaldı) ama kolon genişliği aynı
          kalır: sekme değişiminde kart genişliği zıplamasın. */}
      <View
        style={{
          width: ACTION_BUTTON_SIZE,
          marginLeft: ACTION_GAP,
          alignItems: "center",
          gap: MOD_STACK_GAP,
        }}
      >
        {/* Şikayet — ana ikilinin ÜSTÜNDE. Zeminsiz ve kırmızı: yıkıcı
            aksiyonun rengi (SwipeCard'ın moderasyon satırıyla aynı token). */}
        {onReport && (
          <LikeActionButton
            sf="flag"
            fallback={Flag}
            tint={colors.errorStrong}
            size={MOD_BUTTON_SIZE}
            iconSize={20}
            iconStrokeWidth={2}
            onPress={onReport}
            accessibilityLabel={reportLabel}
          />
        )}

        {/* Ana aksiyonlar kendi (daha geniş) boşluklarında durur — uydularla
            aynı aralığa alsak dört buton tek bir dizi gibi okunurdu. */}
        <View style={{ gap: ACTION_STACK_GAP, alignItems: "center" }}>
          {onRecover ? (
            <LikeActionButton
              sf="arrow.counterclockwise"
              fallback={RotateCcw}
              tint={colors.litPlus}
              busy={recovering}
              onPress={onRecover}
              accessibilityLabel={recoverLabel}
            />
          ) : (
            <>
              {/* Geç → moda uyan mürekkep: `text` açıkta siyah, koyuda beyaz.
                  Sabit siyah yazsak koyu temada kaybolurdu. */}
              <LikeActionButton
                sf="xmark"
                fallback={X}
                tint={colors.text}
                busy={acting}
                onPress={onPass}
                accessibilityLabel={passLabel}
                // Geç/beğen uydulardan da kurtar butonundan da kalın çizilir:
                // zeminsiz kolonda ana ikiliyi ayıran tek ipucu ağırlık.
                iconStrokeWidth={2.9}
                iconWeight="bold"
              />
              {/* Beğen → SuperLike kalbinin kırmızısı. Tek renk: glif gradyanla
                  maskelenseydi iOS'ta SF sembolü maske olarak çizilemezdi;
                  gradyanın ilk durağı kalbin okunan rengi. */}
              <LikeActionButton
                sf="checkmark"
                fallback={Check}
                tint={gradients.swipeHeart[0]}
                busy={acting}
                onPress={onLike}
                accessibilityLabel={likeLabel}
                iconStrokeWidth={2.9}
                iconWeight="bold"
              />
            </>
          )}
        </View>

        {/* Engelle — ana ikilinin ALTINDA. */}
        {onBlock && (
          <LikeActionButton
            sf="nosign"
            fallback={Ban}
            tint={colors.errorStrong}
            size={MOD_BUTTON_SIZE}
            iconSize={20}
            iconStrokeWidth={2}
            onPress={onBlock}
            accessibilityLabel={blockLabel}
          />
        )}
      </View>
    </Animated.View>
  );
}

export default function LikesScreen() {
  useRenderCount("LikesScreen");
  const { t } = useTranslation();
  const [likes, setLikes] = useState([]);
  // Event handler'larda güncel listeye erişmek için — setLikes updater'ının
  // içinde dispatch etmek render sırasında TabNavigator'ı güncelliyordu.
  const likesRef = useRef([]);
  const whoLikedMeInFlightRef = useRef(false);
  // İlk çekim tamamlandı mı — skeleton'ın tek yetkisi bu. Sonraki hiçbir çekim
  // (premium geçişi, 404 sonrası reload, görünürlük tazelemesi) ekranı skeleton'a
  // geri döndüremez; oturmuş bir ekranı shimmer'a çevirmek yanıp sönme demekti.
  const hasLoadedOnceRef = useRef(false);
  // Son BAŞARILI çekimin damgası + AppState geçişini ayırt etmek için önceki durum.
  const lastLikesFetchRef = useRef(0);
  const appStateRef = useRef(AppState.currentState);
  likesRef.current = likes;
  const [loading, setLoading] = useState(true);
  const [_currentPage, setCurrentPage] = useState(1);
  const [_hasNextPage, setHasNextPage] = useState(false);
  const [profilePremium, setProfilePremium] = useState(false);
  // Tier'ın kaynağı abonelik slice'ı (bkz. features/profile/premiumTier) —
  // satın almada anında true, hub `SubscriptionChanged`/`admin_revoke` ile
  // anında false. `profilePremium` YALNIZ backend henüz konuşmamışken vekil:
  // ÖNCESİ ikisi OR'lanıyordu ve OR tek yönlü çalıştığı için (profil bayrağı
  // true kaldığı sürece redux'ın false'ı geçmiyordu) düşüş yönü ayrı bir
  // effect'le elle yamanmak zorundaydı.
  const { isPremium: reduxPremium, resolved: premiumResolved } =
    usePremiumTier();
  const isPremium = premiumResolved ? reduxPremium : profilePremium || reduxPremium;
  // Premium durumu HENÜZ bilinmiyor mu — sticky satın alma butonunun tek kapısı.
  // `profilePremium` ve redux'ın ikisi de false'tan başlıyor, dolayısıyla ilk
  // karelerde premium kullanıcıya da "beğenenleri gör" butonu çiziliyor ve
  // profil cevabı gelince kayboluyordu (yanıp sönme + yanlış upsell). Bayrak
  // yalnız getMyProfile GERÇEKTEN cevap verince kalkar; hata dönerse bilmiyoruz
  // sayılır ve buton çizilmez (premium'a satış göstermektense hiç göstermemek).
  const premiumCheckedRef = useRef(false);
  const [premiumChecked, setPremiumChecked] = useState(false);
  const [activeTab, setActiveTab] = useState("all");
  // Açıklama kartı — MMKV senkron okunur, dolayısıyla kapatılmış kart bir kare
  // bile çizilmez. userId henüz yoksa (preload mount) kartı göstermiyoruz:
  // hangi hesaba yazılacağı belli olmadan X'e basılırsa bayrak boşluğa giderdi.
  const currentUserId = useAppSelector((s) => s.auth.user?.id);
  // Kaçırdıkların kendi bayrağını taşıyor (bkz. MISSED_INFO_DISMISSED_KEY):
  // hangi kartın çizileceği ve X'in neyi kapatacağı aktif sekmeye bakıyor.
  const isMissedInfo = activeTab === "missed";
  const infoDismissKey = isMissedInfo
    ? MISSED_INFO_DISMISSED_KEY
    : LIKES_INFO_DISMISSED_KEY;
  const infoSeen = useMemo(
    () =>
      currentUserId
        ? !!appPrefs.getBoolean(`${infoDismissKey}:${currentUserId}`)
        : true,
    [currentUserId, infoDismissKey],
  );
  const [infoClosed, setInfoClosed] = useState(false);
  const [missedInfoClosed, setMissedInfoClosed] = useState(false);
  const showInfoCard =
    !infoSeen && !(isMissedInfo ? missedInfoClosed : infoClosed);
  const dismissInfoCard = useCallback(() => {
    if (isMissedInfo) setMissedInfoClosed(true);
    else setInfoClosed(true);
    if (currentUserId) {
      appPrefs.set(`${infoDismissKey}:${currentUserId}`, true);
    }
  }, [currentUserId, infoDismissKey, isMissedInfo]);
  const insets = useSafeAreaInsets();
  const dispatch = useAppDispatch();
  const navigation = useNavigation();
  const statsQuery = useSwipeStats();
  // Kurtarma harcandıktan sonraki hizalama: iyimser düşüş + kanonik tazeleme.
  // Referansı stabil (useCallback), bağımlılık listesini kirletmiyor.
  const syncRecoverySpend = useSyncRecoverySpend();
  // /Stats'ı ekranın kendi tazelik damgasından tetikleyebilmek için ref'te:
  // deps'e konsa `loadMissed` her render'da yeniden yaratılırdı.
  const refetchStatsRef = useRef(statsQuery.refetch);
  refetchStatsRef.current = statsQuery.refetch;
  // `mutate` TanStack Query'de referans olarak stabil — mutation nesnesinin
  // kendisi her render'da değişiyor, onu bağımlılığa koymak handleQuickSwipe'ı
  // her karede tazelerdi (bu ekran uygulama ömrü boyunca mount kalıyor).
  const { mutate: swipeMutate } = useSwipeMutation();
  const [purchaseVisible, setPurchaseVisible] = useState(false);
  // Kurtarma paketi sheet'i — premium paywall'ından AYRI. Kurtarma hakkı
  // bitince backend artık premium'a da `showPaywall:true` dönüyor (satılacak
  // bir ürün var), yani bu sheet iki tier'da da açılıyor.
  const [recoveryPurchaseVisible, setRecoveryPurchaseVisible] = useState(false);
  // Şikayet edilen kullanıcı — ReportModal'ın hem görünürlüğü hem hedefi.
  const [reportTarget, setReportTarget] = useState(null);
  // Karttaki X / ✓ butonunun beklediği liker — yalnız premium doğrulaması
  // sürerken dolu kalır (istek fire-and-forget, kart aynı karede düşüyor).
  // Aynı anda iki karta basılmasını da bu engelliyor.
  const [actingId, setActingId] = useState(null);

  // ── Kart çıkışı ───────────────────────────────────────────────────────────
  // Aksiyon alınan kart veriden ANINDA düşmüyor: önce `exitingIds`e giriyor
  // (kart uçup söner, bkz. LikeCard), CARD_EXIT_MS sonra gerçek düşüş oluyor.
  // Ağdan bağımsız — istek zaten yola çıkmış durumda, bu yalnız görsel sıra.
  //
  // Boşluğun kapanması BURADA değil: kart veriden çıkınca FlatList'in
  // `itemLayoutAnimation`ı alttaki hücreleri yukarı kaydırıyor.
  const [exitingIds, setExitingIds] = useState({});
  const exitTimersRef = useRef(new Map());
  const runCardExit = useCallback((userId, direction, remove) => {
    if (!userId) {
      remove();
      return;
    }
    // Aynı kart için ikinci bir çıkış başlatma — animasyon baştan oynar ve
    // `remove` iki kez çağrılırdı.
    if (exitTimersRef.current.has(userId)) return;
    setExitingIds((prev) => ({ ...prev, [userId]: direction }));
    const timer = setTimeout(() => {
      exitTimersRef.current.delete(userId);
      setExitingIds((prev) => {
        if (!(userId in prev)) return prev;
        const next = { ...prev };
        delete next[userId];
        return next;
      });
      remove();
    }, CARD_EXIT_MS);
    exitTimersRef.current.set(userId, timer);
  }, []);
  // Ekran uygulama ömrü boyunca mount kalıyor ama yine de: bekleyen çıkışlar
  // unmount'ta iptal edilir (timer, kapanmış bir ekranın state'ine yazmasın).
  useEffect(() => {
    const timers = exitTimersRef.current;
    return () => {
      timers.forEach((id) => clearTimeout(id));
      timers.clear();
    };
  }, []);

  // ── Kaçırılan eşleşmeler ("Kaçırdıkların" sekmesi) ────────────────────────
  // Beğeni listesinden tamamen ayrı: farklı uç (`/MissedMatches`), farklı kota
  // ve sekme açılana kadar HİÇ istenmiyor. Bu ekran boot'ta preload edildiği
  // için koşulsuz çekmek her açılışa bir istek eklerdi.
  const [missed, setMissed] = useState([]);
  const missedRef = useRef([]);
  missedRef.current = missed;
  const [missedLoading, setMissedLoading] = useState(false);
  const [recoveringId, setRecoveringId] = useState(null);
  const lastMissedFetchRef = useRef(0);
  const missedInFlightRef = useRef(false);
  // Kurtarma sonrası SignalR emniyeti (bkz. handleRecover). Unmount'ta iptal
  // ediliyor: ekran kapandıktan sonra istek atmak boşuna.
  const matchSignalTimerRef = useRef(null);
  useEffect(
    () => () => {
      if (matchSignalTimerRef.current) clearTimeout(matchSignalTimerRef.current);
    },
    [],
  );

  const loadMissed = useCallback(async ({ force = false } = {}) => {
    if (missedInFlightRef.current) return;
    if (!force && Date.now() - lastMissedFetchRef.current < LIKES_STALE_MS) {
      return;
    }
    missedInFlightRef.current = true;
    // Liste tazelenirken BAKİYE de tazelensin. /Stats `staleTime: Infinity` ile
    // oturumda bir kez çekiliyor; bu ekranın kota satırı onun dışında hiçbir
    // yerden yenilenmiyordu, yani başka bir cihazdan (ya da bu oturumdan önce)
    // harcanmış hak ekranda hep eski değeriyle duruyordu — kullanıcının
    // "5/5 yazıyor ve hiç azalmıyor" dediği durumun ikinci yarısı bu.
    //
    // Ayrı bir damga tutmuyoruz: yukarıdaki `LIKES_STALE_MS` guard'ının arkasında
    // olduğu için sekmeye her girişte değil, en fazla 30 sn'de bir istek çıkar.
    refetchStatsRef.current?.()?.catch?.(() => {});
    // Dolu listeyi skeleton'a çevirme — beğeni listesindeki `silent` kuralının
    // aynısı.
    if (missedRef.current.length === 0) setMissedLoading(true);
    try {
      const page = await fetchMissedMatches();
      setMissed(page.profiles);
      // Damga YALNIZ başarıda: hatada 0'da kalır, bir sonraki girişte koşulsuz
      // yeniden denenir.
      lastMissedFetchRef.current = Date.now();
    } catch {
      // yut
    } finally {
      setMissedLoading(false);
      missedInFlightRef.current = false;
    }
  }, []);

  useEffect(() => {
    if (activeTab !== "missed") return;
    loadMissed();
  }, [activeTab, loadMissed]);

  // Sekme açıkken ekrana geri dönüldüğünde tazele. Beğeni listesindeki
  // görünürlük kuralının aynısı ama KENDİ damgasıyla: iki liste ayrı uçlardan
  // geliyor, birinin tazeliği diğerininkini söylemiyor.
  useEffect(() => {
    if (activeTab !== "missed") return;
    const unsub = navigation.addListener("focus", () => loadMissed());
    return unsub;
  }, [activeTab, navigation, loadMissed]);

  const scrollY = useSharedValue(0);
  const scrollHandler = useAnimatedScrollHandler({
    onScroll: (e) => {
      scrollY.value = e.contentOffset.y;
    },
  });

  // Detay preview state — karta tıklayınca LikerProfile detayını çekip
  // PreviewModal'da SwipeCard layout'unu reuse ederek gösteriyoruz.
  const [previewVisible, setPreviewVisible] = useState(false);
  const [previewProfile, setPreviewProfile] = useState(null);
  const [_previewLoading, setPreviewLoading] = useState(false);

  // DiscoverScreen ile aynı fill oranı: (limit - kalan) / limit.
  // Premium / -1 / limit bilinmiyor → 0.
  const swipeFillRatio = useMemo(() => {
    if (statsQuery.data?.isPremium) return 0;
    const rem = statsQuery.data?.remainingSwipes;
    const limit = statsQuery.data?.dailySwipeLimit;
    if (rem == null || rem < 0) return 0;
    if (limit == null || limit <= 0) return 0;
    const used = Math.max(0, limit - rem);
    return Math.min(1, used / limit);
  }, [
    statsQuery.data?.remainingSwipes,
    statsQuery.data?.dailySwipeLimit,
    statsQuery.data?.isPremium,
  ]);

  // Sekmeler AYRIK kümeler: bir kart tek bir sekmeye ait. Not bir beğeninin
  // üstüne binen ayrı ürün olduğu için "Beğeni" sekmesinden de çıkarılıyor —
  // yoksa aynı kart hem orada hem "Notlar"da görünürdü. Önceliği not alıyor,
  // kartın rozetindeki sırayla aynı (bkz. LikeCard'ın sağ üst rozeti).
  //
  // Bayrak İÇERİĞE değil `isNote`e DE bakıyor: realtime gelen kartta önizleme
  // boş olabiliyor (`notePreview` yok) — o kart notluğunu kaybetmemeli.
  const filteredLikes =
    activeTab === "like"
      ? likes.filter((l) => !l.isSuperLike && !l.note && !l.isNote)
      : activeTab === "superlike"
        ? likes.filter((l) => l.isSuperLike && !l.note && !l.isNote)
        : activeTab === "note"
          ? likes.filter((l) => !!l.note || !!l.isNote)
          : likes;

  // Kaçırdıkların sekmesi AYRI bir veri kaynağı (beğeni listesinin filtresi
  // değil): farklı uç, farklı sayfalama, farklı boş durum.
  const isMissedTab = activeTab === "missed";
  const listData = isMissedTab ? missed : filteredLikes;

  // Şikayet / engelle uyduları YALNIZ premium'da. Kolon free kullanıcıda
  // geç/beğen ikilisine iniyor — kart genişliği değişmez (ACTION_BUTTON_SIZE
  // sabit), yalnız uydular çizilmez.
  // Tier henüz bilinmiyorken (premiumResolved/premiumChecked ikisi de false)
  // `isPremium` zaten false: butonu önce gösterip sonra geri almaktansa hiç
  // göstermemek doğru — sticky satın alma butonundaki kuralın aynısı.
  const canModerate = isPremium;

  // Bakiye — GÜNLÜK KOTA DEĞİL (2026-08-22): free'de hak yalnız satın alınan
  // krediden gelir, premium'da tier kotası abonelik döngüsüyle yenilenir. Metin
  // bu yüzden "bugün kalan" değil bakiye semantiğinde.
  //
  // Payda tek yerden (recoveryQuota.ts): `tavan + satın alınan kredi`.
  // `exceedsTotal` — tier düşüşünden kalan kota paydayı aşmış demek; "5/2"
  // yazmak yerine oransız gösterime düşüyoruz, sayının kendisi doğru.
  const recoveryBalance = useMemo(
    () => resolveRecoveryBalance(statsQuery.data),
    [statsQuery.data],
  );
  // Sayı bilinmiyorsa (eski backend / henüz çekilmedi) hiç yazmıyoruz;
  // uydurma bir rakam göstermek yanlış vaat olurdu.
  const recoveryQuotaText = useMemo(() => {
    if (recoveryBalance.unknown) return null;
    if (!recoveryBalance.hasBalance) return t("likes.recoverBalanceEmpty");
    return recoveryBalance.total != null &&
      recoveryBalance.total > 0 &&
      !recoveryBalance.exceedsTotal
      ? t("likes.recoverBalanceWithTotal", {
          count: recoveryBalance.remaining,
          total: recoveryBalance.total,
        })
      : t("likes.recoverBalance", { count: recoveryBalance.remaining });
  }, [recoveryBalance, t]);

  // Boş durum alt metni: pencere uzunluğu backend'den geldiyse sayıyla, yoksa
  // sayısız varyantla. Sabit "30 gün" yazmak, config değiştiği gün yalan olurdu.
  const missedEmptySubtitle = useMemo(() => {
    const days = statsQuery.data?.missedMatchLookbackDays;
    return typeof days === "number" && days > 0
      ? t("likes.emptyMissedSubtitleDays", { days })
      : t("likes.emptyMissedSubtitle");
  }, [statsQuery.data?.missedMatchLookbackDays, t]);

  // Açıklama kartının metni sekmeye göre: kaçırdıkların listesi beğeni
  // listesinden başka bir şey anlatıyor (pas → beğeni çevirme, hak harcama),
  // genel metin orada hiçbir şey açıklamıyordu. Kart ve kapatma bayrağı AYNI —
  // ayrı bayrak açılmadı: kullanıcı kartı bir kez kapattıysa bir daha
  // görmek istemiyor demektir, sekme değiştirince geri gelmesi kapatmayı
  // anlamsızlaştırırdı.
  const infoDescription = useMemo(() => {
    if (!isMissedTab) return t("likes.infoDescription");
    const days = statsQuery.data?.missedMatchLookbackDays;
    return typeof days === "number" && days > 0
      ? t("likes.infoMissedDescriptionDays", { days })
      : t("likes.infoMissedDescription");
  }, [isMissedTab, statsQuery.data?.missedMatchLookbackDays, t]);

  // `silent`: listeyi ekranda tutarak tazele. Görünürlük tazelemesinde (focus /
  // foreground) setLoading(true) tüm grid'i skeleton'a çeviriyordu — kullanıcı
  // zaten dolu bir listeye bakarken ekranın yanıp sönmesi anlamsız.
  const fetchWhoLikedMe = useCallback(async (page = 1, { silent = false } = {}) => {
    // In-flight dedupe: preload mount'u + kullanıcı navigasyonu/premium-transition
    // aynı anda tetikleyince istek çiftleniyordu (Sentry trace kanıtlı). State
    // (loading) async güncellendiği için guard ref ile senkron tutulur.
    if (whoLikedMeInFlightRef.current) return;
    whoLikedMeInFlightRef.current = true;
    try {
      // `hasLoadedOnceRef` ikinci bir kilit: çağıran `silent` demeyi unutsa bile
      // ilk yüklemeden sonrası asla skeleton'a düşmez.
      if (!silent && !hasLoadedOnceRef.current) setLoading(true);
      // Yeni API: superLikes ve likes ayrı paginated bölümler.
      // Şimdilik ikisini de tek sayfa olarak çekiyoruz, ileride ayrı paginate edebiliriz.
      // getMyProfile YALNIZ ilk yüklemede: tek işi `profilePremium`'u kurmak ve
      // sonraki değişimler redux'tan geliyor (satın alma + hub
      // `SubscriptionChanged`). Sessiz tazeleme her focus/foreground'da bunu da
      // çekseydi görünürlük tazelemesinin istek maliyeti iki katına çıkardı.
      // Premium daha hiç doğrulanamadıysa (ilk çekim hata aldı) sessiz tazeleme
      // de profili dener — yoksa buton, ekran remount olana kadar gizli kalırdı.
      const [data, profile] = await Promise.all([
        swipeService.getWhoLikedMe(page),
        silent && premiumCheckedRef.current
          ? Promise.resolve(null)
          : profileService.getMyProfile().catch(() => null),
      ]);

      if (profile) {
        premiumCheckedRef.current = true;
        setPremiumChecked(true);
        // İKİ YÖNLÜ yazılıyor: eskiden yalnız true'ya çekiliyordu ve bayrak bir
        // kez kalktıktan sonra hiçbir şey onu indiremiyordu.
        setProfilePremium(!!profile.isPremium);
      }

      if (data.isSuccess && data.result) {
        const superLikeProfiles = (data.result.superLikes?.profiles || []).map(
          (p) => ({
            id: `sl_${p.profileId}`,
            userId: p.userId, // LikerProfile detay endpoint'i için lazım
            name: p.displayName,
            // Gizli yaş `null` değil `0` geliyor (DTO'da non-nullable int) —
            // normalize burada, kart `age != null` kontrolüne güvenebilsin.
            age: resolveCardAge(p),
            universityName: p.universityName || "",
            mainPhoto: p.photos?.[0] || "",
            likedAt: p.likedMeAt,
            isSuperLike: true,
            isPremium: p.isPremium ?? false,
            // `isNote` sunucunun bayrağı, `note` içeriği. İkisi ayrı: bayrak
            // true iken içerik boş gelirse (beklenmiyor ama) blur yine açılır.
            isNote: !!p.isNote,
            note: normalizeLikerNote(p),
          }),
        );
        const likeProfiles = (data.result.likes?.profiles || []).map((p) => ({
          id: `l_${p.profileId}`,
          userId: p.userId,
          name: p.displayName,
          age: resolveCardAge(p),
          universityName: p.universityName || "",
          mainPhoto: p.photos?.[0] || "",
          likedAt: p.likedMeAt,
          isSuperLike: false,
          isPremium: p.isPremium ?? false,
          isNote: !!p.isNote,
          note: normalizeLikerNote(p),
        }));

        // SuperLike'lar her zaman üstte (vurgulu bölüm).
        const merged = [...superLikeProfiles, ...likeProfiles];
        setLikes(merged);
        const slTotal = data.result.superLikes?.totalProfiles || 0;
        const lTotal = data.result.likes?.totalProfiles || 0;
        // Sayaç TOPLAM'dan, id kümesi yüklenen sayfadan — ikisi kasten ayrı
        // (bkz. SwipeState.whoLikedMeIds).
        dispatch(
          setWhoLikedMe({
            count: slTotal + lTotal,
            ids: merged.map((it) => it.userId),
          }),
        );
        setHasNextPage(data.result.likes?.hasNextPage || false);
        setCurrentPage(data.result.likes?.currentPage || 1);
        // Tazelik damgası YALNIZ başarıda. Hata yutulduğu için (aşağıdaki boş
        // catch) başarısız bir çekim ekranı "hiç beğenin yok" boş durumuna
        // düşürüyordu; damga 0'da kaldığı sürece bir sonraki görünürlükte
        // koşulsuz yeniden denenir.
        lastLikesFetchRef.current = Date.now();
      }
    } catch {
      // yut
    } finally {
      // Hata da olsa "ilk yükleme bitti": başarısız çekim ekranı boş duruma
      // düşürür, bir sonraki tazeleme onu sessizce doldurur (bkz.
      // lastLikesFetchRef damgası — hatada 0'da kalır, koşulsuz yeniden denenir).
      hasLoadedOnceRef.current = true;
      setLoading(false);
      whoLikedMeInFlightRef.current = false;
    }
  }, [dispatch]);

  // Skeleton görünürlüğü — `loading`'in kendisi değil, geciktirilmiş/asgari
  // süreli türevi. Hızlı cevapta hiç açılmaz, açıldıysa da yanıp sönmeyecek
  // kadar kalır.
  const [showSkeleton, setShowSkeleton] = useState(false);
  const skeletonShownAtRef = useRef(0);
  useEffect(() => {
    if (loading) {
      const id = setTimeout(() => {
        skeletonShownAtRef.current = Date.now();
        setShowSkeleton(true);
      }, SKELETON_DELAY_MS);
      return () => clearTimeout(id);
    }
    if (!showSkeleton) return;
    const rest =
      SKELETON_MIN_VISIBLE_MS - (Date.now() - skeletonShownAtRef.current);
    if (rest <= 0) {
      setShowSkeleton(false);
      return;
    }
    const id = setTimeout(() => setShowSkeleton(false), rest);
    return () => clearTimeout(id);
  }, [loading, showSkeleton]);

  useEffect(() => {
    fetchWhoLikedMe();
  }, [fetchWhoLikedMe]);

  // ============ Görünürlük tazelemesi ============
  // Bu ekran DiscoverScreen'in `navigation.preload("Likes")` çağrısıyla boot'ta
  // mount olup uygulama ömrü boyunca mount kalıyor → mount effect'i bir kez
  // çalışıyor ve liste `useState`'te donuyor. Sonuç: arka planda gelen beğeniyi
  // bildirimden açtığında rozet (redux, AppNavigator foreground turundan) artıyor
  // ama grid bayat/boş kalıyordu — ekranın local state'ine kimse dokunmuyor.
  // İki tetikleyici birlikte tüm vakaları kapsıyor:
  //   focus     → başka bir tab'dan (veya bildirim tap'iyle) Likes'a girildi
  //   foreground→ Likes ZATEN odaktayken arka plana atılıp geri dönüldü; bu
  //               durumda ekran hiç blur olmadığı için 'focus' event'i çıkmıyor
  const refreshLikesIfStale = useCallback(() => {
    if (Date.now() - lastLikesFetchRef.current < LIKES_STALE_MS) return;
    fetchWhoLikedMe(1, { silent: true });
  }, [fetchWhoLikedMe]);

  // Beğeni bildirimine basılarak girildi → eşiğe bakma, koşulsuz tazele
  // (bkz. AppNavigator routeFromNotification 'Like'/'SuperLike').
  useEffect(() => {
    return uiBus.on("likesDirty", () => {
      lastLikesFetchRef.current = 0;
      fetchWhoLikedMe(1, { silent: true });
    });
  }, [fetchWhoLikedMe]);

  useEffect(() => {
    const unsubFocus = navigation.addListener("focus", refreshLikesIfStale);
    const sub = AppState.addEventListener("change", (next) => {
      const prev = appStateRef.current;
      appStateRef.current = next;
      if (!prev.match(/inactive|background/) || next !== "active") return;
      // Odakta değilsek boşuna istek atma — Likes'a geçildiğinde 'focus' zaten
      // aynı kontrolü yapacak.
      if (!navigation.isFocused()) return;
      refreshLikesIfStale();
    });
    return () => {
      unsubFocus();
      sub.remove();
    };
  }, [navigation, refreshLikesIfStale]);

  // NOT: burada `profilePremium`'u elle indiren bir effect vardı. Tek işi
  // tek yönlü OR'u telafi etmekti (redux false'a düşse bile profil bayrağı
  // ekranı premium tutuyordu). Tier artık kanonik kaynaktan okunduğu için o
  // telafiye gerek yok — bir bayrağı iki yerden yönetmek de bu ekranın asıl
  // sorunuydu.

  // Premium geçişinde listeyi tazele — İKİ YÖNDE de. Bu ekran react-query
  // kullanmadığı için PurchaseModal'ın refetchPremiumScoped'u buraya dokunmuyor.
  //
  //   false→true: liste free scope'ta çekilmiş olabiliyor (backend free
  //               kullanıcıya kısıtlı alan dönerse foto/isim eksik kalırdı).
  //               PurchaseModal'ın onSuccess callback'inin yerini tutar ve
  //               premium'un başka bir ekrandan (Discover/Profile) veya restore
  //               ile alındığı durumu da kapsar.
  //   true→false: TERSİ — bellekteki liste premium scope'ta çekilmiş net
  //               fotoğrafları taşıyor. Yalnız `isPremium`i false yapmak blur'u
  //               geri getirir ama veriyi free scope'a döndürmez; kart açıldığında
  //               premium-scoped alanlar hâlâ elimizde olurdu.
  const prevIsPremiumRef = useRef(isPremium);
  useEffect(() => {
    if (prevIsPremiumRef.current === isPremium) return;
    prevIsPremiumRef.current = isPremium;
    fetchWhoLikedMe();
  }, [isPremium, fetchWhoLikedMe]);

  // Karta tıklayınca:
  //   - Premium DEĞİL ve normal like → PurchaseModal aç (upsell).
  //   - Premium ise VEYA gelen bir SuperLike ise → LikerProfile detayını çek +
  //     interactive SwipeWrapper'lı LikerSwipeModal'ı aç. Kullanıcı sağa/sola
  //     kaydırıp like/pass yapabilir; mutual like ise backend match yaratır,
  //     global MatchModal açılır.
  // SuperLike istisnası kartın görselindekiyle aynı kural (bkz. LikeCard
  // `showClear`): SuperLike zaten blur'suz gösteriliyor, dolayısıyla ona
  // dokununca paywall açmak görsel sözleşmeyi bozuyordu — SuperLike'ın
  // karşılığı, free kullanıcının da o kişiyi görüp yanıtlayabilmesi.
  // 404 → liker silinmiş/banlanmış/like'ını geri çekmiş → modal'ı kapat ve
  // listeyi yenile.
  const openLikerProfile = async (item) => {
    if (!isPremium && !item?.isSuperLike) {
      // §11: paywall'dan önce canonical tazeleme — başka cihazda premium
      // olunmuşsa kullanıcıyı satış ekranına düşürmek yerine doğrudan profili
      // açıyoruz (bu ekranın premium transition effect'i listeyi de tazeler).
      const premium = await dispatch(refreshEntitlementsForPaywall())
        .unwrap()
        .catch(() => false);
      if (!premium) {
        setPurchaseVisible(true);
        return;
      }
    }
    const likerUserId = item?.userId || item?.likerUserId;
    if (!likerUserId) return;
    setPreviewProfile(null);
    setPreviewLoading(true);
    try {
      const res = await swipeService.getLikerProfileDetail(likerUserId);
      if (res?.isSuccess && res?.result) {
        setPreviewProfile(res.result);
        setPreviewVisible(true);
      } else {
        fetchWhoLikedMe();
      }
    } catch (e) {
      const status = e?.response?.status ?? e?.status;
      if (status === 404) {
        fetchWhoLikedMe();
      } else if (status === 401 || status === 403) {
        // Backend LikerProfile'ı premium'a kilitliyorsa free kullanıcının
        // SuperLike dokunuşu sessizce ölmesin: paywall'a düş. Bu dal ancak
        // backend SuperLike istisnasını tanımıyorsa çalışır — kalıcı çözüm
        // orada, burası sadece ölü dokunuşa karşı emniyet.
        setPurchaseVisible(true);
      }
    } finally {
      setPreviewLoading(false);
    }
  };

  const handleClosePreview = () => {
    setPreviewVisible(false);
    setPreviewProfile(null);
  };

  /**
   * "Kurtar" — pass'i like'a çevirir, karşı taraf zaten beğendiği için sonuç
   * gerçek bir eşleşmedir.
   *
   * Yanıt `matchId` TAŞIMIYOR: backend `Match` ve `Conversation` satırlarını
   * asenkron yazıyor, sohbete yönlendirme SignalR `MatchNotification`ından
   * geliyor (AppNavigator global MatchModal'ı açıyor, bu ekran da `uiBus`
   * "match" ile kartı zaten düşürüyor). Burada yalnız anında geri bildirim
   * veriyoruz — SignalR gecikirse kullanıcı boşluğa bakmasın.
   */
  const handleRecover = useCallback(
    async (item) => {
      if (!item?.userId || recoveringId) return;
      setRecoveringId(item.userId);
      try {
        const outcome = await recoverMissedMatch(item.userId);

        if (outcome.kind === "recovered") {
          // Kurtarma = geri alınmış bir "geç", yani sonuçta bir beğeni:
          // kart beğen yönüne uçar.
          runCardExit(item.userId, "right", () =>
            setMissed((prev) => prev.filter((it) => it.userId !== item.userId)),
          );
          // Bakiye yanıtta GELMİYOR (`SwipeResultDto.remaining*` bu akışta
          // null): önce iyimser düşüş (butona basınca sayı hareket etsin),
          // arkasından KANONİK tazeleme.
          //
          // Tazeleme şart — /Stats `staleTime: Infinity` ile oturumda bir kez
          // çekiliyor, yani "bir sonraki tazeleme doğrusunu getirir" diye bir
          // şey yok; sadece setQueryData yazmak sayıyı oturum başındaki değerin
          // yerel türevinde bırakıyordu (2026-08-24: kota satırı kurtarmaya
          // rağmen 5/5'te takılı kalıyordu). Bkz. useSyncRecoverySpend.
          syncRecoverySpend();
          showInfoToast({
            title: t("likes.recoverSuccessTitle"),
            message: t("likes.recoverSuccessMessage"),
            icon: "recovery",
          });
          // SignalR kopmuş olabilir: `MatchNotification` gelmezse sohbet
          // backend'de VARDIR ama uygulama haberdar olmaz. Tek seferlik emniyet
          // — sinyal geldiyse zaten AppNavigator tazeliyor, bu istek fazladan
          // ama zararsız. (Backend'in "eşleşme yok" durumu artık buraya HİÇ
          // düşmüyor: engelli/uygunsuz çift 400 ile ayrı dalda dönüyor.)
          if (matchSignalTimerRef.current) {
            clearTimeout(matchSignalTimerRef.current);
          }
          matchSignalTimerRef.current = setTimeout(() => {
            dispatch(fetchConversations({ force: true }));
          }, MATCH_SIGNAL_TIMEOUT_MS);
          return;
        }

        if (outcome.kind === "paywall") {
          // 403 = hak bitti. Sözleşme §3: bu paywall artık PREMIUM'a da
          // dönüyor, çünkü kurtarma satın alınabilir bir ürün oldu.
          //
          // §11: paywall'dan ÖNCE canonical tazeleme — kullanıcı başka cihazda
          // ABONE OLMUŞSA tier kotası açılmıştır ve doğru cevap satış ekranı
          // değil, kotayı tazelemek. Ama bu yalnız free→premium GEÇİŞİNDE
          // geçerli: zaten premium olan kullanıcının 403'ü "kotan bitti"
          // demektir, tazeleme onu değiştirmez ve sheet açılmadan kalırsa
          // dokunuş sessizce ölürdü.
          const wasPremium = !!statsQuery.data?.isPremium;
          const premium = await dispatch(refreshEntitlementsForPaywall())
            .unwrap()
            .catch(() => false);
          if (premium && !wasPremium) {
            statsQuery.refetch?.();
            return;
          }
          // Free'de sheet'te abonelik bağlantısı da çizilir (paket VEYA
          // abonelik); premium'da yalnız paket satılır.
          setRecoveryPurchaseVisible(true);
          return;
        }

        // 400 — hak HARCANMADAN reddedildi: zaten kurtarılmış, pas penceresi
        // geçmiş, kullanıcı yok, ya da çift artık uygun değil (engelleme/
        // şikayet — backend bunu hak tüketiminden ÖNCE kontrol ediyor,
        // `showPaywall:false` ile geliyor, PAYWALL AÇILMAMALI). Premium'un
        // kotası dolduğunda gelen 400 bu listeden ÇIKTI; o durum artık 403 +
        // paywall (yukarıdaki dal). Hiçbirinde kart aksiyon alınabilir değil:
        // önce yerelde düşür, sonra listeyi doğrulat.
        showInfoToast({
          title: t("likes.recoverFailed"),
          message: outcome.message ?? "",
          icon: "recovery",
        });
        if (outcome.kind === "rejected") {
          // Doğrulama çekimi kartın düşmesinden SONRA: animasyon oynarken
          // gelen taze liste kartı yerinde tutar, hareket yarıda kalırdı.
          runCardExit(item.userId, "out", () => {
            setMissed((prev) => prev.filter((it) => it.userId !== item.userId));
            loadMissed({ force: true });
          });
        }
      } finally {
        setRecoveringId(null);
      }
    },
    [
      dispatch,
      loadMissed,
      recoveringId,
      runCardExit,
      statsQuery,
      syncRecoverySpend,
      t,
    ],
  );

  // LikerSwipeModal'dan dönen swipe sonrası — like/pass/superlike/block fark
  // etmez,
  // kullanıcı bu liker'ı handle etti → listeden anında çıkar (backend
  // MatchNotification gelene kadar bekleme). Rozet de aynı karede düşer:
  // sayacı `next.length`e eşitlemiyoruz, o yalnızca YÜKLENEN sayfanın boyutu —
  // toplam daha büyükse rozeti sessizce yanlışa çekerdi.
  const handleLikerSwiped = (likerUserId, direction) => {
    if (!likerUserId) return;
    const passed = likesRef.current.find(
      (it) => it.userId === likerUserId || it.likerUserId === likerUserId,
    );
    const next = likesRef.current.filter(
      (it) => it.userId !== likerUserId && it.likerUserId !== likerUserId,
    );
    likesRef.current = next;
    setLikes(next);
    dispatch(removeWhoLikedMe(likerUserId));
    // Pass = kesin kaçırılmış eşleşme; bu kişi zaten seni beğenmişti.
    if (direction === "left") {
      showMissedMatchToast({
        name: passed?.name,
        photoUrl: passed?.mainPhoto,
      });
    }
  };

  /**
   * Karttaki yuvarlak X / ✓ butonları — LikerSwipeModal'ı açmadan doğrudan
   * pas/beğeni. Sonuç tarafı modal'daki jestle BİREBİR aynı yolu kullanıyor
   * (`useSwipeMutation` + `handleLikerSwiped`): liste/rozet düşmesi, kaçırılan
   * eşleşme toast'ı ve mutual like'ta MatchNotification akışı tek yerden gelir.
   *
   * Kilit, kart dokunuşundakiyle AYNI (bkz. openLikerProfile): free kullanıcı
   * blur'lu bir kartı butonla da "harcayamaz" — kim olduğunu görmeden pas
   * geçmek de beğenmek de premium'un sattığı bilgiyi bedava tüketirdi.
   * SuperLike'lar burada da istisna: zaten blur'suz gösteriliyorlar.
   */
  const handleQuickSwipe = useCallback(
    async (item, direction) => {
      const likerUserId = item?.userId || item?.likerUserId;
      // Uçmakta olan kart hâlâ veride duruyor: ikinci bir basış aynı kişiye
      // ikinci bir swipe göndermesin.
      if (!likerUserId || actingId || exitTimersRef.current.has(likerUserId)) {
        return;
      }

      if (!isPremium && !item?.isSuperLike) {
        // §11: paywall'dan önce canonical tazeleme — başka cihazda premium
        // olunmuşsa kullanıcıyı satış ekranına düşürmek yanlış olur.
        setActingId(likerUserId);
        const premium = await dispatch(refreshEntitlementsForPaywall())
          .unwrap()
          .catch(() => false);
        setActingId(null);
        if (!premium) {
          setPurchaseVisible(true);
          return;
        }
      }

      Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
      // İstek ANINDA gidiyor, kartın veriden düşmesi animasyon kadar gecikiyor:
      // görsel yumuşama ağı bekletmesin.
      swipeMutate({ direction, userId: likerUserId });
      runCardExit(likerUserId, direction === "right" ? "right" : "left", () =>
        handleLikerSwiped(likerUserId, direction),
      );
    },
    // handleLikerSwiped her render'da yeniden yaratılıyor ama yalnızca ref +
    // dispatch okuyor; bağımlılığa eklemek callback'i her render'da tazelerdi.
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [actingId, dispatch, isPremium, runCardExit, swipeMutate],
  );

  /**
   * Karttaki küçük bayrak / engelle butonları.
   *
   * Premium'a kapalı (bkz. canModerate): free kullanıcıda butonlar hiç
   * çizilmiyor, dolayısıyla bu iki fonksiyon da yalnız premium'dan çağrılır.
   *
   * Her iki akışın sonu da aynı: kişi listeden düşer. `handleLikerSwiped`
   * "block" yönüyle çağrılıyor — LikerSwipeModal'ın engelleme yolu da aynı
   * yönü kullanıyor, yani rozet düşmesi ve "kaçırdın" toast'ının ATILMAMASI
   * tek yerden geliyor.
   */
  const dropFromLists = useCallback(
    (userId) => {
      // Yönsüz çıkış: engelleme/şikayet bir "geç" ya da "beğen" değil, kart
      // yana uçmak yerine yerinde söner.
      runCardExit(userId, "out", () => {
        handleLikerSwiped(userId, "block");
        // Kaçırdıkların listesi ayrı bir dizi — `handleLikerSwiped` ona dokunmaz.
        setMissed((prev) => prev.filter((it) => it.userId !== userId));
      });
    },
    // handleLikerSwiped ref + dispatch okuyor (bkz. handleQuickSwipe notu).
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [runCardExit],
  );

  const handleReport = useCallback((item) => {
    const userId = item?.userId || item?.likerUserId;
    if (!userId) return;
    // Not varsa şikayete `noteId` de takılıyor — moderatör paneli yorumun
    // metnini ancak o zaman görüyor (sözleşme §7). Canlı IncomingLike kartında
    // id yok (event yalnız önizleme taşıyor), o durumda düz profil şikayeti.
    setReportTarget({ userId, noteId: item?.note?.noteId ?? null });
  }, []);

  const handleBlock = useCallback(
    (item) => {
      const userId = item?.userId || item?.likerUserId;
      if (!userId) return;
      Alert.alert(
        t("moderation.block.confirmTitle"),
        t("moderation.block.confirmMessage"),
        [
          { text: t("common.cancel"), style: "cancel" },
          {
            text: t("moderation.block.confirmButton"),
            style: "destructive",
            onPress: async () => {
              try {
                await moderationService.blockUser(userId);
                dropFromLists(userId);
                showInfoToast({
                  title: t("moderation.block.successTitle"),
                  message: t("moderation.block.successMessage"),
                });
              } catch {
                showInfoToast({
                  title: t("common.error"),
                  message: t("moderation.block.error"),
                });
              }
            },
          },
        ],
      );
    },
    [dropFromLists, t],
  );

  // Bu ekran dışında handle edilen liker'lar (match, ya da Discover destesinde
  // pass'lenmiş bir liker) listeden düşsün. Ekran lazy mount olup açık kaldığı
  // için kendi kendine tazelenmiyor; bu olmadan liste bayat kalıyordu.
  // Rozet sayacı iki olayda da kaynağında düşürülüyor (AppNavigator /
  // DiscoverScreen) — burada TEKRAR dispatch etmiyoruz, çift düşerdi.
  // Fetch'ten gelen item'lar `userId`, realtime eklenenler `likerUserId`
  // alanı taşıyor; iki ihtimali de kontrol et.
  useEffect(() => {
    const prune = (userId) => {
      if (!userId) return;
      const prev = likesRef.current;
      const next = prev.filter(
        (it) => it.userId !== userId && it.likerUserId !== userId,
      );
      if (next.length === prev.length) return;
      likesRef.current = next;
      setLikes(next);
    };
    // Kaçırdıkların listesi de aynı olaylardan etkileniyor: bir kişiyle
    // eşleştiysen (kurtarma ya da başka yoldan) artık "kaçırılmış" değil.
    const pruneMissed = (userId) => {
      if (!userId) return;
      const prev = missedRef.current;
      const next = prev.filter((it) => it.userId !== userId);
      if (next.length === prev.length) return;
      setMissed(next);
    };
    const pruneBoth = (userId) => {
      prune(userId);
      pruneMissed(userId);
    };
    const unsubMatch = uiBus.on("match", (m) => pruneBoth(m?.matchedUserId));
    const unsubHandled = uiBus.on("likerHandled", (p) => pruneBoth(p?.userId));
    return () => {
      unsubMatch();
      unsubHandled();
    };
  }, []);

  // Realtime: socket'ten yeni IncomingLike geldiğinde listeyi reload etmeden prepend et.
  // AppNavigator IncomingLike SignalR event'ini yakalayıp uiBus.emit('incomingLike', payload)
  // çağırır; payload backend IncomingLikeDto = { likerUserId, likerDisplayName,
  // likerPhotoUrl, isSuperLike, isNote, notePreview, likedAt }. Mutual like'ta
  // backend bu event'i göndermez (MatchNotification akışı çalışır) — burada
  // dedup gerekmiyor.
  //
  // ⚠️ Not için AYRI bir event YOK (sözleşme §6): aynı olaya `isNote` +
  // `notePreview` eklendi. Önizleme ~60 karakter, yani KIRPIK — canlı kart
  // `noteId` de taşımıyor. İkisi de reconcile'da (scheduleLikesReconcile) tam
  // kayıtla değişiyor; o yüzden bu kartta şikayet not id'siz gider.
  useEffect(() => {
    const unsub = uiBus.on("incomingLike", (payload) => {
      if (!payload?.likerUserId) return;
      setLikes((prev) => {
        // Aynı liker zaten listedeyse (ör. reconnect race) ekleme.
        const isSuper = !!payload.isSuperLike;
        const dupId = `${isSuper ? "sl" : "l"}_live_${payload.likerUserId}`;
        const existingByUser = prev.some(
          (it) => it.id === dupId || it.likerUserId === payload.likerUserId,
        );
        if (existingByUser) return prev;

        const notePreview =
          typeof payload.notePreview === "string"
            ? payload.notePreview.trim()
            : "";
        const card = {
          // profileId yok (DTO sadece userId döner) — live kart için sentetik id.
          id: dupId,
          likerUserId: payload.likerUserId,
          name: payload.likerDisplayName || "",
          age: null, // backend payload'da age yok; kart "İsim, " olarak görünür — kabul
          mainPhoto: payload.likerPhotoUrl || "",
          likedAt: payload.likedAt,
          isSuperLike: isSuper,
          isNote: !!payload.isNote,
          // Önizleme boşsa `note` hiç kurulmuyor: kart `!!item.note`a bakıp
          // yorum bloğunu çiziyor, boş bir yorum kutusu çizmenin anlamı yok.
          // Blur yine açık kalır — onu `isNote` taşıyor.
          note: notePreview ? { comment: notePreview } : null,
        };

        // Yeni SuperLike → listenin en başına (en yeni en üstte).
        if (isSuper) return [card, ...prev];

        // Yeni normal Like → SuperLike bloğunun hemen altına, normal like'ların başına.
        const firstNonSuper = prev.findIndex((it) => !it.isSuperLike);
        if (firstNonSuper === -1) return [...prev, card];
        return [
          ...prev.slice(0, firstNonSuper),
          card,
          ...prev.slice(firstNonSuper),
        ];
      });
    });
    return unsub;
  }, []);

  const listHeader = (
    <>
      <FilterPills
        style={{ marginBottom: 12 }}
        // Satır listenin yan padding'inden ETKİLENMEZ: kutu tam genişliğe
        // açılıp aynı payı içeriden veriyor (bkz. FilterPills `bleed`).
        // Duruşta pill'ler kartlarla aynı hattan başlar, sürüklerken ekranın
        // kenarına kadar gider — 16px içeride kesilmez.
        bleed={LIST_H_PADDING}
        activeTab={activeTab}
        onChange={setActiveTab}
        tabs={[
          { key: "all", label: t('likes.tabAll') },
          { key: "like", label: t('likes.tabLike') },
          { key: "superlike", label: t('likes.tabSuperLike') },
          { key: "note", label: t('likes.tabNote') },
          { key: "missed", label: t('likes.tabMissed') },
        ]}
      />
      {/* Bakiye göstergesi — yalnız kaçırdıkların sekmesinde. Sayıyı ve tavanı
          /Stats veriyor; tier tavanları (free 0, premium 1/2/5) backend
          config'inden geldiği için burada YAZILMIYOR (değişirse FE'nin haberi
          olmaz). */}
      {isMissedTab && recoveryQuotaText && (
        <View style={{ marginBottom: 12, marginLeft: 4 }}>
          {/* Ana metin `colors.text` — açık modda siyah (#0B0B0C), koyu modda
              beyaz. textSecondary açık modda gri kalıyordu ve bu satır sayfanın
              tek bakiye göstergesi, ikincil bir dipnot değil. */}
          <Text
            style={{
              color: colors.text,
              fontSize: 25,
              fontWeight: "700",
            }}
          >
            {recoveryQuotaText}
          </Text>
        </View>
      )}
      {showInfoCard && (
        <LikesInfoCard
          description={infoDescription}
          onDismiss={dismissInfoCard}
        />
      )}
    </>
  );

  // Liste HER ZAMAN mount — yükleme/boş/dolu üç durumu da aynı FlatList'in
  // içinde geçiyor. Önce ayrı bir `loading ?` dalı vardı: skeleton kendi
  // container'ında, boş durum listenin içinde çiziliyordu; aradaki geçiş
  // ağaç değişimi olduğu için sekmeler bile yeniden mount oluyordu.
  const listEmpty = isMissedTab ? (
    // Kaçırdıkların kendi yükleme durumunu taşıyor (ayrı uç, ayrı istek).
    // Skeleton gecikme/asgari-süre makinesine bağlanmıyor: bu liste yalnız
    // sekmeye basınca çekiliyor, yani kullanıcı zaten bir bekleme bekliyor.
    missedLoading ? (
      <LikesSkeletonList showModeration={canModerate} />
    ) : (
      <View className="flex-1 items-center justify-center pb-[50%]">
        <EmptyState
          Icon={HeartCrack}
          sf="heart.slash"
          iconStrokeWidth={1}
          topOffset={0}
          text={t('likes.emptyMissed')}
          subtitle={missedEmptySubtitle}
          buttonLabel={t('likes.startSwipingButton')}
          onButtonPress={() => navigation.navigate("Discover")}
        />
      </View>
    )
  ) : showSkeleton ? (
    <LikesSkeletonList showModeration={canModerate} />
  ) : loading ? (
    // Skeleton gecikmesi penceresi: boş durumu ERKEN göstermek de bir flash —
    // istek daha sürüyorken "hiç beğenin yok" yazıp sonra geri almak yerine
    // sadece sekmeler dursun.
    null
  ) : (
    <View className="flex-1 items-center justify-center pb-[50%]">
      <EmptyState
        Icon={HeartCrack}
        sf="heart.slash"
        iconStrokeWidth={1}
        topOffset={0}
        text={
          activeTab === "superlike"
            ? t('likes.emptySuperLike')
            : activeTab === "note"
              ? t('likes.emptyNote')
              : activeTab === "like"
                ? t('likes.emptyLike')
                : t('likes.emptyAll')
        }
        subtitle={
          activeTab === "superlike"
            ? t('likes.emptySuperLikeSubtitle')
            : activeTab === "note"
              ? t('likes.emptyNoteSubtitle')
              : activeTab === "like"
                ? t('likes.emptyLikeSubtitle')
                : t('likes.emptyAllSubtitle')
        }
        // Üç filtrenin boş durumu da aynı yere çıkar: beğeni beklemek yerine
        // kaydırmaya dön. Sekmeye göre değişen etiketler (süper beğeni gönder /
        // profilimi geliştir) tek bir "kaydırmaya başla" aksiyonuna indi.
        buttonLabel={t('likes.startSwipingButton')}
        onButtonPress={() => navigation.navigate("Discover")}
      />
    </View>
  );

  return (
    <View className="flex-1" style={{ backgroundColor: colors.bg }}>
      {/* Likes List — tek sütun; her kartın sağında geç/beğen kolonu */}
      <Animated.FlatList
        data={listData}
        onScroll={scrollHandler}
        scrollEventThrottle={16}
        // Bir kart veriden düştüğünde altındaki hücreler boşluğa YAVAŞÇA kayar
        // (yerlerine zıplamak yerine). Kartın kendi çıkışı ayrı iş: o
        // transform/opacity ile LikeCard içinde oynuyor.
        itemLayoutAnimation={LinearTransition.duration(LIST_SHIFT_MS).easing(
          Easing.out(Easing.cubic),
        )}
        renderItem={({ item }) => (
          <LikeCard
            item={item}
            isPremium={isPremium}
            onPress={() => openLikerProfile(item)}
            onRecover={isMissedTab ? () => handleRecover(item) : undefined}
            recovering={recoveringId === item.userId}
            onPass={() => handleQuickSwipe(item, "left")}
            onLike={() => handleQuickSwipe(item, "right")}
            acting={actingId === (item.userId || item.likerUserId)}
            onReport={canModerate ? () => handleReport(item) : undefined}
            onBlock={canModerate ? () => handleBlock(item) : undefined}
            passLabel={t('likes.passButton')}
            likeLabel={t('likes.likeButton')}
            recoverLabel={t('likes.recoverButton')}
            reportLabel={t('profile.card.reportAccount')}
            blockLabel={t('profile.card.blockAccount')}
            alwaysClear={isMissedTab}
            exitDirection={exitingIds[item.userId || item.likerUserId] ?? null}
          />
        )}
        keyExtractor={(item) => item.id}
        ListHeaderComponent={listHeader}
        ListEmptyComponent={listEmpty}
        contentContainerStyle={{
          flexGrow: 1,
          paddingHorizontal: LIST_H_PADDING,
          paddingTop: insets.top + 50 + 16,
          // Skeleton da 3 kart yüksekliğinde — boş durum gibi 0 padding
          // verirsek son satır tab bar'ın altında kalıyor.
          paddingBottom:
            listData.length === 0 && !showSkeleton && !missedLoading ? 0 : 200,
        }}
        showsVerticalScrollIndicator={false}
      />

      <ScreenHeader
        scrollY={scrollY}
        title={t('likes.title')}
        fillRatio={swipeFillRatio}
      />

      {/* Sticky Bottom Button — premium DEĞİLSE ve ekranda gerçekten kart varsa
          göster, basınca purchase modal aç. Üç kapı da şart:
            tierBilindi      → premium durumu bilinmeden çizme (bkz. yukarısı).
                               Abonelik slice'ı cevap verdiyse zaten biliyoruz;
                               `premiumChecked` yalnız o cevap gelmemişken
                               getMyProfile'ın verdiği bilgiyi temsil ediyor.
            !isPremium       → premium'a satış yapma
            filteredLikes>0  → boş durumda EmptyState'in kendi CTA'sı var;
                               ikisini üst üste bindirmek anlamsız, ayrıca
                               kilitlenecek bir kart yokken upsell de yok
          Aktif sekmeye göre değerlendiriliyor: "SuperLike" sekmesi boşken de
          buton çıkmasın, orada blur'lanacak kart zaten yok.
          Kaçırdıkların sekmesinde de GİZLİ: o liste premium gating'e tabi değil
          (kota yalnız kurtarma aksiyonunda), kartlar blur'suz — "seni
          beğenenleri gör" orada karşılığı olmayan bir vaat olurdu. */}
      {(premiumResolved || premiumChecked) && !isPremium && !isMissedTab && filteredLikes.length > 0 && (
        <View
          className="absolute bottom-[90px] left-0 right-0 px-6"
          style={{
            backgroundColor: "transparent",
            paddingBottom: 10,
            paddingTop: 16,
          }}
        >
          <AnimatedPressable
            pressScale={0.97}
            onPress={() => setPurchaseVisible(true)}
            style={{
              borderRadius: 999,
              borderCurve: "continuous",
              overflow: "hidden",
            }}
          >
            <LinearGradient
              colors={[colors.litPlus, colors.litPlus]}
              start={{ x: 0, y: 0 }}
              end={{ x: 1, y: 1 }}
              style={{
                paddingVertical: 18,
                flexDirection: "row",
                alignItems: "center",
                justifyContent: "center",
                gap: 6,
              }}
            >
              <SFIcon name="heart" fallback={Heart} size={16} color={colors.text} strokeWidth={2.2} weight="semibold" />
              <Text
                style={{
                  color: colors.text,
                  fontWeight: "700",
                  fontSize: 14,
                }}
              >
                {t('likes.viewButton')}
              </Text>
            </LinearGradient>
          </AnimatedPressable>
        </View>
      )}

      {/* Satın alma sonrası liste tazelemesi onSuccess'te değil, isPremium
          false→true transition effect'inde (yukarıda) yapılıyor. */}
      <PurchaseModal
        visible={purchaseVisible}
        onClose={() => setPurchaseVisible(false)}
      />

      {/* Kurtarma hakkı bitti → premium paywall DEĞİL, consumable paket sheet'i.
          SuperLike paketiyle aynı gerekçe: satılacak bir ürün var ve backend iki
          tier'da da showPaywall:true dönüyor. Abonelik bağlantısı YALNIZ
          free'de çiziliyor (§3) — premium'a abonelik teklif etmek, zaten aldığı
          şeyi tekrar satmak olurdu. */}
      <RecoveryPurchaseModal
        visible={recoveryPurchaseVisible}
        onClose={() => setRecoveryPurchaseVisible(false)}
        onPurchased={() => {
          setRecoveryPurchaseVisible(false);
          // Redeem yanıtı bakiyeyi cache'e yazıyor; bu refetch server-truth'u
          // (kota/kredi ayrışması dahil) teyit eder.
          statsQuery.refetch?.();
        }}
        onUpsellPremium={
          isPremium
            ? null
            : () => {
                setRecoveryPurchaseVisible(false);
                setPurchaseVisible(true);
              }
        }
      />

      <LikerSwipeModal
        visible={previewVisible}
        profile={previewProfile}
        onClose={handleClosePreview}
        onSwipe={handleLikerSwiped}
      />

      {/* Şikayet — kişi listeden YALNIZ engelleme de seçildiyse düşer
          (`alsoBlock` kutusu işaretli gelir ama kaldırılabilir: "bildirmek
          istiyorum ama iletişimi kesmek istemiyorum"). Sadece şikayet edildiyse
          kart yerinde kalır; kullanıcı hâlâ geçebilir ya da beğenebilir. */}
      <ReportModal
        visible={!!reportTarget}
        onClose={() => setReportTarget(null)}
        reportedUserId={reportTarget?.userId}
        noteId={reportTarget?.noteId}
        onSuccess={(result) => {
          if (result?.blocked && reportTarget?.userId)
            dropFromLists(reportTarget.userId);
        }}
      />
    </View>
  );
}
