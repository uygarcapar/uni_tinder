import { useCallback, useState } from "react";
import { ActivityIndicator, Text, useWindowDimensions } from "react-native";
import { Image } from "expo-image";
import { useTranslation } from "react-i18next";
import { BottomSheetView } from "@gorhom/bottom-sheet";
import AppBottomSheet from "@/shared/components/AppBottomSheet";
import AnimatedPressable from "@/shared/components/AnimatedPressable";
import { modeAccent, type AppMode } from "@/features/discover/modeTheme";
import { colors } from "@/shared/theme/colors";

/**
 * Paylaşım onayı — kırpılmış fotoğrafın önizlemesi ve "paylaş".
 *
 * ── Neden ayrı bir onay adımı var ──────────────────────────────────────────
 * Kural sert: GÜNDE 1 FOTO ve DEĞİŞTİRİLEMEZ. Kırpıcıdan çıkan fotoğraf
 * doğrudan yayına gitseydi kullanıcı yanlış kareyi 24 saat taşırdı. Buradaki
 * tek cümle (`composer.hint`) o kuralı paylaşmadan ÖNCE söylüyor.
 *
 * ── Hata burada kalıyor ────────────────────────────────────────────────────
 * Konum reddi (UT-7410/7411/7412/7413/7415) ya da kota/moderasyon hatasında
 * sheet AÇIK kalıyor ve hata satır içinde gösteriliyor — kullanıcı bir
 * sheet'in içinde bekliyor, kart uçmuş değil (`useNoteMutation`'daki aynı
 * gerekçe). Metin önce SUNUCUDAN: `message` kullanıcının dilinde ve gösterime
 * hazır geliyor, i18n anahtarları yedek.
 */
export interface CampusMomentComposerProps {
  visible: boolean;
  onClose: () => void;
  /** Kırpıcıdan çıkan yerel dosya (3:4, 900×1200). */
  photoUri: string | null;
  mode: AppMode;
  sharing: boolean;
  /** Satır içi hata — sunucu mesajı ya da i18n yedeği. */
  errorText: string | null;
  onShare: () => void;
}

export default function CampusMomentComposer({
  visible,
  onClose,
  photoUri,
  mode,
  sharing,
  errorText,
  onShare,
}: CampusMomentComposerProps) {
  const { t } = useTranslation();
  const { width } = useWindowDimensions();
  const [previewWidth] = useState(() => Math.round(width * 0.56));

  const handleShare = useCallback(() => {
    if (sharing) return;
    onShare();
  }, [onShare, sharing]);

  return (
    <AppBottomSheet
      visible={visible}
      onClose={sharing ? () => {} : onClose}
      enableDynamicSizing
      // Yükleme sürerken kapanmasın: S3 PUT ortasında sheet'i kaldırmak
      // kullanıcıya "oldu mu olmadı mı" sorusunu bırakırdı.
      enablePanDownToClose={!sharing}
    >
      {/* ⚠️ `BottomSheetView` ZORUNLU, düz `View` DEĞİL: `enableDynamicSizing`in
          tek detenti ÖLÇÜLEN içerik yüksekliği ve o ölçümü yalnız bu bileşen
          bildiriyor. Düz bir View ile yükseklik hiç gelmiyor, sheet görünür bir
          detente oturmuyor → kullanıcı fotoğrafı kırpıp kaydediyor, onay adımı
          hiç açılmıyor ve paylaşım isteği atılmıyor (sessiz kayıp; watchdog
          1.5sn sonra kapanmış sayıp fotoğrafı da unutuyor). Aynı kural
          PhotoSourceSheet ve LocationPermissionSheet'te de yazılı. */}
      <BottomSheetView
        style={{
          paddingHorizontal: 24,
          paddingTop: 4,
          paddingBottom: 28,
          alignItems: "center",
        }}
      >
        <Text
          style={{
            color: colors.text,
            fontSize: 20,
            fontWeight: "700",
            alignSelf: "flex-start",
          }}
        >
          {t("campus.composer.title")}
        </Text>

        {photoUri ? (
          <Image
            source={{ uri: photoUri }}
            style={{
              marginTop: 16,
              width: previewWidth,
              // Kırpıcının çıktı oranı — 3:4.
              height: Math.round(previewWidth / (3 / 4)),
              borderRadius: 20,
              backgroundColor: colors.surface2,
            }}
            contentFit="cover"
          />
        ) : null}

        <Text
          style={{
            marginTop: 16,
            color: colors.textSecondary,
            fontSize: 14.5,
            lineHeight: 20,
            textAlign: "center",
          }}
        >
          {t("campus.composer.hint")}
        </Text>

        {errorText ? (
          <Text
            style={{
              marginTop: 12,
              color: colors.error,
              fontSize: 14,
              lineHeight: 19,
              textAlign: "center",
            }}
          >
            {errorText}
          </Text>
        ) : null}

        <AnimatedPressable
          pressScale={0.98}
          onPress={handleShare}
          accessibilityRole="button"
          style={{
            marginTop: 20,
            alignSelf: "stretch",
            paddingVertical: 15,
            borderRadius: 999,
            borderCurve: "continuous",
            alignItems: "center",
            justifyContent: "center",
            // Vurgu SEÇİLİ MODUN rengi: Arkadaş modunda kırmızı bir paylaş
            // butonu yüzeyi yanlış ürüne bağlardı.
            backgroundColor: modeAccent(mode),
          }}
        >
          {sharing ? (
            <ActivityIndicator color={colors.onMedia} />
          ) : (
            <Text
              style={{ color: colors.onMedia, fontSize: 16, fontWeight: "700" }}
            >
              {t("campus.composer.share")}
            </Text>
          )}
        </AnimatedPressable>
      </BottomSheetView>
    </AppBottomSheet>
  );
}
