import { memo } from "react";
import { Text, View } from "react-native";
import { Image } from "expo-image";
import { LinearGradient } from "expo-linear-gradient";
import { useTranslation } from "react-i18next";
import AnimatedPressable from "@/shared/components/AnimatedPressable";
import CardActionGlassButton from "@/features/discover/components/CardActionGlassButton";
import { modeFireTint, type AppMode } from "@/features/discover/modeTheme";
import { Check, X } from "@/shared/icons";
import { colors, withAlpha } from "@/shared/theme/colors";
import type { CampusMomentDto } from "../campusTypes";
import { campusCountdownText } from "../campusCountdown";

/**
 * Kampüs anı KUTUSU — yana kayan listenin bir elemanı.
 *
 * KARE kutu (istek), içinde fotoğraf `cover` ile oturuyor; altında isim + yaş,
 * sağ altında karar çifti, sol üstünde geri sayım.
 *
 * ── Karar jesti YOK, buton VAR ─────────────────────────────────────────────
 * Keşif'te kaydırma jesti kaldırıldı ve karar kapaktaki cam butonlara taşındı;
 * bu yüzey o kararın devamı. Burada ayrıca sert bir gerekçesi var: free
 * kullanıcının GÜNDE TEK beğenisi geri alınamıyor (sunucuda Rewind yalnız
 * Keşif satırlarını seçiyor), yani yanlışlıkla savrulan bir parmak 24 saatlik
 * tek hakkı yakardı.
 *
 * ── Kendi anım farklı çiziliyor ────────────────────────────────────────────
 * Karar çifti yok (kendine karar veremezsin — UT-7422), yerine "Kaldır".
 * Geri sayım ikisinde de var ama kendi anımda asıl bilgi o: kullanıcı
 * yayında olup olmadığını ve ne kadar kaldığını buradan görüyor.
 */

/**
 * Alt yazıların okunması için fotoğrafın dibindeki rampa.
 *
 * ⚠️ Fotoğrafın kendi oranı 3:4 (kırpıcının çıktısı — `CropperOverlay`
 * 900×1200) ama kutu KARE, yani `cover` görüntünün üstünü/altını kırpıyor.
 * Kare olmasının sebebi şeridin yüksekliği: 3:4 bir kutu aynı genişlikte %33
 * daha uzun ve şerit sekme şeridinin üstüne çıkamadığı için (bkz.
 * NATIVE_TAB_BAR_HEIGHT) küçük telefonlarda ekranın yarısını yiyordu. Rampa
 * oranı kutunun kendi boyundan türediği için kare kutuda da aynı iş görüyor.
 */
const SCRIM_HEIGHT_RATIO = 0.38;

export interface CampusMomentCardProps {
  moment: CampusMomentDto;
  /** Kutu genişliği — liste veriyor (yandaki kutunun kenarı görünsün diye). */
  width: number;
  /**
   * Kutu yüksekliği — liste veriyor.
   *
   * ⚠️ GENİŞLİKTEN TÜRETİLMİYOR: kutu artık KARE ve ölçü şeridin kendi
   * hesabından geliyor (`campusCardHeight`). Burada bir oran yazılsaydı
   * dolgu kutularıyla (CampusInfoBox) yan yana iki farklı yükseklik olurdu.
   */
  height: number;
  mode: AppMode;
  /** Şu anın zamanı; geri sayım dakikada bir TEK yerden tazeleniyor. */
  nowMs: number;
  onLike: (moment: CampusMomentDto) => void;
  onPass: (moment: CampusMomentDto) => void;
  onRemove: (moment: CampusMomentDto) => void;
  /** Karar gönderimi sürüyor — butonlar spinner'a dönüyor. */
  busy?: boolean;
  /**
   * CAM BUTONLAR MOUNT EDİLEBİLİR Mİ.
   *
   * ⚠️ BU BİR GÖRÜNÜRLÜK BAYRAĞI DEĞİL, BİR MOUNT KAPISI. Karar çifti SwiftUI
   * cam butonu ve camın kuralı sert: ata zincirinde kimliksel olmayan bir
   * transform (ya da opacity<1) gören cam SESSİZCE hiç render edilmiyor ve
   * sonradan düzelmiyor (proje notu: "tekrar denemek çare değil").
   *
   * Kutuların şeridi aşağıdan `translateY` ile geliyor, yani animasyon
   * boyunca ata zinciri kimliksel DEĞİL. Şerit yerine oturduktan sonra
   * (translateY = 0) mount edilsinler diye kapı çağırana bırakıldı
   * (bkz. CampusMomentsStrip > `actionsReady`).
   *
   * Varsayılan `true`: animasyonlu bir atası olmayan çağıranlar bilmek zorunda
   * değil.
   */
  actionsReady?: boolean;
  /** Kota bitti: beğeni butonu yine çiziliyor ama paywall'a götürüyor. */
  decisionsExhausted?: boolean;
}

const CampusMomentCard = memo(function CampusMomentCard({
  moment,
  width,
  height,
  mode,
  nowMs,
  onLike,
  onPass,
  onRemove,
  busy = false,
  actionsReady = true,
}: CampusMomentCardProps) {
  const { t } = useTranslation();
  const countdown = campusCountdownText(moment.expiresAt, nowMs, t);

  return (
    <View
      style={{
        width,
        height,
        borderRadius: 28,
        borderCurve: "continuous",
        overflow: "hidden",
        backgroundColor: colors.surface2,
      }}
    >
      <Image
        source={{ uri: moment.photoUrl }}
        style={{ width: "100%", height: "100%" }}
        contentFit="cover"
        // `photoUrl` 24 saat SABİT (imzasız, opak anahtar) → cache anahtarı
        // olarak güvenilir. İmzalı bir URL olsaydı her yenilemede değişir ve
        // disk cache'i işe yaramazdı.
        cachePolicy="memory-disk"
        recyclingKey={moment.photoUrl}
        transition={160}
      />

      {/* Dipteki rampa — isim/yaş her fotoğrafın üstünde okunmak zorunda. */}
      <LinearGradient
        pointerEvents="none"
        colors={[
          withAlpha("#000000", 0),
          withAlpha("#000000", 0.55),
          withAlpha("#000000", 0.78),
        ]}
        locations={[0, 0.55, 1]}
        style={{
          position: "absolute",
          left: 0,
          right: 0,
          bottom: 0,
          height: Math.round(height * SCRIM_HEIGHT_RATIO),
        }}
      />

      {/* Geri sayım — sol üstte, medya kapsülü diliyle. */}
      {countdown ? (
        <View
          pointerEvents="none"
          style={{
            position: "absolute",
            top: 12,
            left: 12,
            paddingHorizontal: 10,
            paddingVertical: 5,
            borderRadius: 999,
            backgroundColor: colors.mediaChipBg,
          }}
        >
          <Text
            style={{ color: colors.onMedia, fontSize: 12.5, fontWeight: "600" }}
          >
            {countdown}
          </Text>
        </View>
      ) : null}

      {/* Kendi anım rozeti — karar çiftinin yerini alan şey.
          ⚠️ MODERASYON DURUMU BURADA GÖRÜNÜR OLMALI: sağlayıcı cevap
          vermediğinde an YAZILIYOR ama kimseye görünmüyor (`Pending` +
          `isVisibleToOthers: false`) ve kota da harcanmış sayılıyor. Kullanıcı
          "yayında" sanmasın diye rozet "inceleniyor" diyor.
          ⚠️ `isVisibleToOthers` SUNUCUDAN; `status === "Approved"` kontrolü
          silinmiş/kaldırılmış/süresi dolmuş hâlleri kaçırıyor. */}
      {moment.isMine ? (
        <View
          pointerEvents="none"
          style={{
            position: "absolute",
            top: 12,
            right: 12,
            paddingHorizontal: 10,
            paddingVertical: 5,
            borderRadius: 999,
            backgroundColor: colors.mediaChipBg,
          }}
        >
          <Text
            style={{ color: colors.onMedia, fontSize: 12.5, fontWeight: "600" }}
          >
            {moment.moderation && moment.moderation.isVisibleToOthers === false
              ? t("campus.underReview")
              : t("campus.mine")}
          </Text>
        </View>
      ) : null}

      {/* İsim + yaş. Yaş `null` ise HİÇ yazılmıyor (kullanıcı gizlemiş) —
          "0" ya da tire yazmak gizliliği bozulmuş gibi okunurdu. */}
      <View
        pointerEvents="none"
        style={{ position: "absolute", left: 16, right: 100, bottom: 18 }}
      >
        <Text
          numberOfLines={1}
          style={{ color: colors.onMedia, fontSize: 22, fontWeight: "700" }}
        >
          {moment.displayName}
          {typeof moment.age === "number" ? (
            <Text style={{ fontWeight: "500" }}>{`  ${moment.age}`}</Text>
          ) : null}
        </Text>
      </View>

      {/* Karar çifti — kendi anımda yok.
          ⚠️ Cam ikili yalnız `actionsReady` ile mount ediliyor (gerekçe
          prop'ta): animasyonlu bir atanın altında doğan cam hiç çizilmiyor.
          "Kaldır" pill'i o kuraldan muaf — düz bir RN yüzeyi. */}
      {moment.isMine ? (
        <View style={{ position: "absolute", right: 16, bottom: 16 }}>
          <AnimatedPressable
            pressScale={0.96}
            onPress={() => onRemove(moment)}
            accessibilityRole="button"
            accessibilityLabel={t("campus.remove")}
            style={{
              paddingHorizontal: 14,
              paddingVertical: 9,
              borderRadius: 999,
              borderCurve: "continuous",
              backgroundColor: colors.mediaChipBg,
            }}
          >
            <Text
              style={{ color: colors.onMedia, fontSize: 14, fontWeight: "600" }}
            >
              {t("campus.remove")}
            </Text>
          </AnimatedPressable>
        </View>
      ) : actionsReady ? (
        <View
          style={{
            position: "absolute",
            right: 14,
            bottom: 14,
            flexDirection: "row",
            alignItems: "center",
            gap: 10,
          }}
        >
          <CardActionGlassButton
            variant="clear"
            name="xmark"
            fallback={X}
            tintColor={colors.onMedia}
            glyphColor={colors.onMedia}
            label={t("campus.pass")}
            onPress={() => onPass(moment)}
            busy={busy}
          />
          <CardActionGlassButton
            variant="prominent"
            name="checkmark"
            fallback={Check}
            // Vurgu SEÇİLİ MODUN rengi — Arkadaş modunda kırmızı bir onay
            // butonu yüzeyi yanlış ürüne bağlardı.
            tintColor={modeFireTint(mode)}
            glyphColor={colors.onMedia}
            label={t("campus.like")}
            onPress={() => onLike(moment)}
            busy={busy}
          />
        </View>
      ) : null}
    </View>
  );
});

export default CampusMomentCard;
