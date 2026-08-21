import { useCallback, useEffect } from "react";
import {
  View,
  Text,
  TouchableOpacity,
  ActivityIndicator,
  BackHandler,
  Linking,
  Platform,
} from "react-native";
import { useTranslation } from "react-i18next";
import { ArrowDownCircle, RefreshCw, Wrench } from "lucide-react-native";
import AppBottomSheet from "@/shared/components/AppBottomSheet";
import SFIcon, { type SFSymbol } from "@/shared/components/SFIcon";
import AnimatedPressable from "@/shared/components/AnimatedPressable";
import { colors, ink } from "@/shared/theme/colors";
import type { VersionCheckResult } from "./versionService";

/**
 * Zorunlu / önerilen güncelleme kapısı.
 *
 * Ayrı bir tam ekran RN Modal DEĞİL, uygulamanın standart `AppBottomSheet`
 * yapısı — kullanıcı bu görsel dile alışkın ve gorhom backdrop'u
 * `enablePanDownToClose={false}` iken tıklamayı da yutuyor, yani blokaj için
 * ek bir katmana gerek yok.
 *
 * Blokaj (`force` / `maintenance`) davranışı:
 *   • pan-down kapalı → aşağı sürükleyerek kapatılamaz
 *   • backdrop `pressBehavior="none"` (AppBottomSheet bunu enablePanDownToClose'dan
 *     türetiyor) → dışa tıklama kapatmaz
 *   • drag handle hiç render edilmez → kapatılabilir izlenimi vermez
 *   • "Sonra" butonu hiç render edilmez
 *   • Android donanım geri tuşu yutulur (aşağıdaki BackHandler)
 *
 * `soft`ta bunların hepsi serbest; kullanıcı "Sonra" der, uygulama normal açılır.
 */

interface Props {
  result: VersionCheckResult;
  /** Kapanış animasyonu oynasın diye görünürlük `result`tan ayrı taşınır. */
  visible: boolean;
  /** Yalnız `soft`ta çağrılır. */
  onDismiss: () => void;
  /** Bakım ekranındaki "tekrar dene". */
  onRetry: () => void;
  rechecking: boolean;
}

const ICON: Record<
  "update" | "maintenance",
  { sf: SFSymbol; fallback: typeof ArrowDownCircle }
> = {
  update: { sf: "arrow.down.circle.fill", fallback: ArrowDownCircle },
  maintenance: { sf: "wrench.and.screwdriver.fill", fallback: Wrench },
};

export default function UpdateGateSheet({
  result,
  visible,
  onDismiss,
  onRetry,
  rechecking,
}: Props) {
  const { t } = useTranslation();
  const blocking = result.isBlocking;
  const isMaintenance = result.action === "maintenance";
  const icon = isMaintenance ? ICON.maintenance : ICON.update;

  // gorhom'un kendi BackHandler'ı yok; geri tuşu sheet'i kapatmaz ama ALTTAKİ
  // navigator'da geri gider. Blokajda bunu da kesiyoruz — kullanıcı kapının
  // arkasındaki ekranlarda dolaşmasın.
  useEffect(() => {
    if (!visible || !blocking || Platform.OS !== "android") return;
    const sub = BackHandler.addEventListener("hardwareBackPress", () => true);
    return () => sub.remove();
  }, [visible, blocking]);

  const openStore = useCallback(() => {
    // Store URL'i backend'den geliyor — istemciye gömülü değil. Gelmediyse
    // butonu hiç göstermiyoruz (aşağıdaki `canOpenStore`).
    if (result.storeUrl) Linking.openURL(result.storeUrl).catch(() => {});
  }, [result.storeUrl]);

  const canOpenStore = !isMaintenance && !!result.storeUrl;

  return (
    <AppBottomSheet
      visible={visible}
      // Blokajda dismiss'in ulaşabileceği tek yol kalmasın; soft'ta swipe-down
      // "Sonra" ile aynı anlama gelir.
      onClose={blocking ? undefined : onDismiss}
      snapPoints={["52%"]}
      backdrop="blur"
      enablePanDownToClose={!blocking}
      handleComponent={blocking ? null : undefined}
      handleIndicatorStyle={{ backgroundColor: ink(0.25) }}
    >
      <View
        style={{
          flex: 1,
          paddingHorizontal: 24,
          paddingTop: blocking ? 40 : 24,
          paddingBottom: 32,
          alignItems: "center",
        }}
      >
        <View
          style={{
            width: 96,
            height: 96,
            borderRadius: 48,
            borderCurve: "continuous",
            alignItems: "center",
            justifyContent: "center",
            borderWidth: 3,
            borderColor: colors.text,
            marginBottom: 22,
          }}
        >
          <SFIcon
            name={icon.sf}
            fallback={icon.fallback}
            size={46}
            color={colors.text}
            strokeWidth={1.5}
            weight="semibold"
          />
        </View>

        <Text
          style={{
            color: colors.text,
            fontSize: 24,
            fontWeight: "700",
            textAlign: "center",
            marginBottom: 10,
          }}
        >
          {t(`appUpdate.title.${result.action}`)}
        </Text>

        {/* Gövde metni backend'den gelir (Accept-Language'e göre çözülmüş).
            Boş gelirse karar tipine göre yerel jenerik metin. */}
        <Text
          style={{
            color: colors.textSecondary,
            fontSize: 15,
            fontWeight: "400",
            textAlign: "center",
            lineHeight: 21,
            paddingHorizontal: 4,
          }}
        >
          {result.message || t(`appUpdate.fallback.${result.action}`)}
        </Text>

        <View style={{ flex: 1 }} />

        {/* Güncelleme butonu store linki YOKSA hiç render edilmez. Devre dışı
            bir buton göstermek, kullanıcıyı "bas ama hiçbir şey olmuyor"
            durumunda bırakırdı; backend linki göndermediyse yapılabilecek tek
            şey mesajı okutmak. */}
        {(isMaintenance || canOpenStore) && (
          <View style={{ width: "100%" }}>
            <AnimatedPressable
              onPress={isMaintenance ? onRetry : openStore}
              disabled={rechecking}
              style={{
                width: "100%",
                borderRadius: 999,
                borderCurve: "continuous",
                overflow: "hidden",
                backgroundColor: colors.inverseSurface,
                opacity: rechecking ? 0.5 : 1,
              }}
            >
              {rechecking ? (
                <View style={{ paddingVertical: 20 }}>
                  <ActivityIndicator color={colors.onInverseSurface} />
                </View>
              ) : (
                <View
                  style={{
                    flexDirection: "row",
                    alignItems: "center",
                    justifyContent: "center",
                    gap: 8,
                    paddingVertical: 20,
                    paddingHorizontal: 24,
                  }}
                >
                  <SFIcon
                    name={
                      isMaintenance
                        ? "arrow.triangle.2.circlepath"
                        : "arrow.down.circle.fill"
                    }
                    fallback={isMaintenance ? RefreshCw : ArrowDownCircle}
                    size={17}
                    color={colors.onInverseSurface}
                    strokeWidth={2}
                    weight="semibold"
                  />
                  <Text
                    style={{
                      color: colors.onInverseSurface,
                      fontSize: 15,
                      fontWeight: "700",
                      textAlign: "center",
                    }}
                  >
                    {isMaintenance
                      ? t("appUpdate.retry")
                      : t("appUpdate.update")}
                  </Text>
                </View>
              )}
            </AnimatedPressable>
          </View>
        )}

        {/* "Sonra" YALNIZ soft'ta. Blokajda hiç render edilmez. */}
        {!blocking && (
          <TouchableOpacity
            onPress={onDismiss}
            activeOpacity={0.8}
            style={{
              marginTop: 6,
              paddingVertical: 18,
              alignItems: "center",
              alignSelf: "stretch",
            }}
          >
            <Text
              style={{
                color: colors.textMuted,
                fontSize: 14,
                fontWeight: "600",
              }}
            >
              {t("appUpdate.later")}
            </Text>
          </TouchableOpacity>
        )}
      </View>
    </AppBottomSheet>
  );
}
