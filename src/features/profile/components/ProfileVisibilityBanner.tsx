import { View, Text, TouchableOpacity } from "react-native";
import type { StyleProp, ViewStyle } from "react-native";
import { useTranslation } from "react-i18next";
import { AlertTriangle, Clock } from "@/shared/icons";
import SFIcon from "@/shared/components/SFIcon";
import { colors, ink, isLight } from "@/shared/theme/colors";
import {
  resolveRequiredPhotoCount,
  type ProfileVisibility,
} from "@/features/profile/photoModeration";

/**
 * Görünürlük şeridi — profil DÜZENLEME modalında, Fotoğraflar bölümünün
 * açıklamasının hemen altında duruyor.
 *
 * KONUM GEREKÇESİ: şerit "keşifte görünmüyorum" diyor ve çözümü fotoğraf
 * eklemek/değiştirmek. Profil ekranının tepesindeyken bilgi ile eylem iki ayrı
 * ekrandaydı; grid'in başında duruyorken sebep ve çözüm yan yana.
 *
 * İŞ BÖLÜMÜ (üçü ayrı soruya cevap veriyor, hiçbiri diğerinin yerini almıyor):
 *
 *   `ProfileHiddenGate` (sheet) — BİR AN. Durumu ilk öğrenme momenti.
 *   Kapatılabildiği için kalıcı bir durum göstergesi olamaz.
 *
 *   Bu banner — DURUM. "Keşifte değilim" cümlesini ve sunucudan gelen sayıları
 *   (`visiblePhotoCount`/`requiredPhotoCount`, rehber §10) taşıyan tek yer.
 *   ⚠️ Metin ETKİLEŞİM ENGELİ İMA ETMEZ: beğeni/kaydırma/mesaj açık, kapalı
 *   olan sadece başkalarının destesinde görünmek.
 *
 *   Foto rozetleri — HANGİ FOTOĞRAF, NEDEN. Tek tek fotoğrafın sebebi.
 *
 * ÜÇ SATIR VAR, EN ÇOK İKİSİ AYNI ANDA: üstte red uyarısı (varsa), altında ya
 * inceleme ya da "fotoğraf eksik" satırı. Son ikisi birbirini dışlıyor —
 * beklerken fotoğraf eklemek çözüm değil.
 *
 * SATIRLARIN KAPILARI FARKLI KAYNAKTAN:
 *   red      → `rejectedCount` (görünürlükten bağımsız; profil keşifteyken de
 *              bir fotoğraf reddedilmiş olabilir)
 *   inceleme → `awaitingReview`/`reviewCount` (yine görünürlükten bağımsız:
 *              grid'de saat ikonu çizilen her durumda burada karşılığı olmalı,
 *              yoksa ikon açıklamasız kalıyor). Profil keşifteyken gövde metni
 *              değişiyor — bkz. `reviewBodyVisible`.
 *   eksik    → `state` (gerçekten fotoğraf gerekiyor) → uyarı tonu +
 *              "Fotoğraf ekle".
 *
 * "Bekliyor mu" ayrımı STATE ADINDAN DEĞİL foto verisinden geliyor: backend
 * `HiddenUnderReview` üretmiyor (rehber §4), iki fotoğraf da incelemedeyken
 * state `HiddenInsufficientPhotos` geliyor.
 *
 * `Suspended` BURADA DEĞİL: ban akışı (`AccountBlockedScreen`) ekranın üstünde
 * ve her şeyi kapatıyor, altında şerit göstermenin anlamı yok.
 */
/** Tek uyarı satırı: dolgulu ikon dairesi + tek renkli düz metin (+ ops. CTA). */
function BannerRow({
  icon,
  fallback,
  text,
  action,
  tone = "error",
}: {
  icon: "clock" | "exclamationmark.triangle";
  fallback: any;
  text: string;
  action?: { label: string; onPress: () => void };
  /**
   * `error` = kırmızı dolgu (yapılacak iş var). `neutral` = koyu dolgu:
   * inceleme bir alarm değil, kullanıcının yapabileceği bir şey yok.
   *
   * Açık modda `onMediaInverse` (neredeyse siyah) — beyaz zeminde tam kontrast.
   * KOYU modda tam siyah bir daire zeminde delik gibi duruyordu; `surface4` ile
   * bir tık gri, altındaki küçük gölge de daireyi zeminden ayırıyor. Üstündeki
   * ikon her iki dolguda da `onMedia` beyazı.
   */
  tone?: "error" | "neutral";
}) {
  const neutral = tone === "neutral";
  return (
    <View style={{ flexDirection: "row", alignItems: "center", gap: 10 }}>
      {/* Rozet DOLU: desen SuperLikeCard'ın kalbiyle aynı, rengi Ayarlar'daki
          "Hesabı Sil" satırının kırmızısı (`errorStrong`) — marka kırmızısı
          (`primary`) değil, o beğeni/eşleşme aksanı.
          Sembol `onMedia`: sabit renkli yüzeyin üstündeki mürekkep açık modda da
          beyaz kalmalı; `text` olsaydı kırmızı zemine siyah ikon düşerdi. */}
      <View
        style={{
          width: 38,
          height: 38,
          borderRadius: 19,
          borderCurve: "continuous",
          alignItems: "center",
          justifyContent: "center",
          backgroundColor: neutral
            ? isLight()
              ? colors.onMediaInverse
              : colors.surface4
            : colors.errorStrong,
          ...(neutral && !isLight()
            ? {
                shadowColor: colors.shadow,
                shadowOpacity: 0.35,
                shadowRadius: 6,
                shadowOffset: { width: 0, height: 2 },
                elevation: 2,
              }
            : null),
        }}
      >
        <SFIcon
          name={icon}
          fallback={fallback}
          size={18}
          color={colors.onMedia}
          strokeWidth={1.8}
          style={{ pointerEvents: "none" }}
        />
      </View>

      {/* DÜZ TEK SATIR: başlık + açıklama tek akışta, tek ağırlık, tek renk.
          Nötr gri — kabuk ve kenarlık kalktığı için tek aksan ikonun
          dairesinde; kırmızı yazı satırı form içinde alarma çeviriyordu. */}
      <Text
        style={{
          flex: 1,
          color: colors.textSecondary,
          fontSize: 13,
          lineHeight: 18,
        }}
      >
        {text}
      </Text>

      {action && (
        <TouchableOpacity
          onPress={action.onPress}
          activeOpacity={0.8}
          style={{
            borderRadius: 999,
            borderWidth: 0.5,
            borderColor: ink(0.2),
            paddingHorizontal: 14,
            paddingVertical: 8,
          }}
        >
          <Text style={{ color: colors.text, fontSize: 13, fontWeight: "600" }}>
            {action.label}
          </Text>
        </TouchableOpacity>
      )}
    </View>
  );
}

export default function ProfileVisibilityBanner({
  visibility,
  awaitingReview,
  reviewCount,
  rejectedCount,
  onAddPhoto,
  style,
}: {
  visibility: ProfileVisibility | null;
  awaitingReview: boolean | null;
  /** İncelemedeki foto sayısı (`countPhotosAwaitingReview`). `null` = bilinmiyor. */
  reviewCount?: number | null;
  /** Reddedilmiş foto sayısı (`countRejectedPhotos`). `null` = bilinmiyor. */
  rejectedCount?: number | null;
  onAddPhoto: () => void;
  /** Kabuk dışı yerleşim (ör. zaten yatay padding'i olan bir form gövdesi). */
  style?: StyleProp<ViewStyle>;
}) {
  const { t } = useTranslation();

  const state = visibility?.state;
  // Askıya alınmışta HİÇBİR satır yok: ban akışı ekranın üstünde ve her şeyi
  // kapatıyor, altında uyarı sıralamanın anlamı yok.
  if (state === "Suspended") return null;

  const rejected = rejectedCount ?? 0;
  const reviewing = reviewCount ?? 0;
  // İNCELEME SATIRI GÖRÜNÜRLÜKTEN BAĞIMSIZ (red satırıyla aynı desen): profil
  // keşifte dururken de bir fotoğraf incelemede olabiliyor — o durumda grid'de
  // saat ikonu çiziliyor ama ikonun ne anlattığını söyleyen tek yer bu satır.
  // Kapı eskiden `state !== 'Visible'` idi; profil görünürken ikon açıklamasız
  // kalıyordu.
  const waiting =
    state === "HiddenUnderReview" || awaitingReview === true || reviewing > 0;
  // Profil keşiften düştü mü. `state` null iken (bilinmiyor) ve `Visible` iken
  // YOK — deploy öncesi herkese uyarı basmayalım.
  const hidden = !!state && state !== "Visible";
  // "Fotoğraf eksik" satırı yalnız BEKLEYEN foto yokken: inceleme sürerken
  // yapılacak iş yok, eklenen yeni foto da incelemeye girer (rehber §5.2).
  const showPhotosNeeded = hidden && !waiting;
  if (!waiting && !showPhotosNeeded && rejected === 0) return null;

  const visible = visibility?.visiblePhotoCount ?? 0;
  // Sunucu sayıyı vermediğinde 0 yazmak yanlış olurdu ("0 fotoğraf gerekiyor");
  // kural kaynağı zaten resolveRequiredPhotoCount.
  const required = resolveRequiredPhotoCount(visibility);

  return (
    <View
      // KABUK YOK: zemin ve kenarlık kaldırıldı, şerit artık formun içinde
      // duran çıplak satır(lar). Yatay padding de gitti — kutu olmayınca 10px
      // inset ikonu üstündeki başlık/açıklama sütunundan kaydırıyordu.
      style={[
        {
          marginHorizontal: 16,
          marginBottom: 16,
          paddingVertical: 10,
          gap: 12,
        },
        style,
      ]}
    >
      {/* RED SATIRI ÜSTTE: durum satırından farklı olarak yapılacak bir iş VAR
          (fotoğrafı değiştir) ve görünürlükten BAĞIMSIZ — profil keşifte
          görünürken de reddedilmiş bir fotoğraf durabiliyor, o yüzden `state`
          `Visible` olsa bile çiziliyor. Hangi fotoğrafın neden reddedildiği
          grid'deki rozetlerde. */}
      {rejected > 0 && (
        <BannerRow
          icon="exclamationmark.triangle"
          fallback={AlertTriangle}
          text={`${t("profile.visibilityBanner.rejectedTitle", { count: rejected })} · ${t("profile.visibilityBanner.rejectedBody", { count: rejected })}`}
        />
      )}

      {/* İNCELEME SATIRI: nötr ton, CTA YOK — eklenen yeni fotoğraf da
          incelemeye girer, buton çözüm sunmuyordu (rehber §5.2). Gövde metni
          profilin keşifte olup olmamasına göre değişiyor: profil görünürken
          "keşifte görünmüyorsun" demek düpedüz yanlış olurdu, gizli olan sadece
          o fotoğraf. */}
      {waiting && (
        <BannerRow
          icon="clock"
          fallback={Clock}
          tone="neutral"
          text={
            // Sayı bilinmiyorsa (foto listesi hiç gelmemiş ama state
            // `HiddenUnderReview`) sayısız kalıba düşülür — "0 fotoğrafın
            // inceleniyor" yazmaktansa.
            `${
              reviewing > 0
                ? t("profile.visibilityBanner.reviewTitle", { count: reviewing })
                : t("profile.visibilityBanner.reviewTitleAny")
            } · ${t(
              hidden
                ? "profile.visibilityBanner.reviewBody"
                : "profile.visibilityBanner.reviewBodyVisible",
            )}`
          }
        />
      )}

      {showPhotosNeeded && (
        <BannerRow
          icon="exclamationmark.triangle"
          fallback={AlertTriangle}
          text={`${t("profile.visibilityBanner.photosTitle", { visible, required })} · ${t("profile.visibilityBanner.photosBody")}`}
          action={{
            label: t("profile.visibilityBanner.addPhoto"),
            onPress: onAddPhoto,
          }}
        />
      )}
    </View>
  );
}
