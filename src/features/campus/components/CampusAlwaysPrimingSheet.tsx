import { useCallback, useEffect, useRef, useState } from "react";
import { AppState, BackHandler, Linking, Platform, Text, View } from "react-native";
import * as Location from "expo-location";
import { useTranslation } from "react-i18next";
import { BottomSheetView } from "@gorhom/bottom-sheet";
import AppBottomSheet from "@/shared/components/AppBottomSheet";
import AnimatedPressable from "@/shared/components/AnimatedPressable";
import SFIcon from "@/shared/components/SFIcon";
import { Navigation } from "@/shared/icons";
import { colors } from "@/shared/theme/colors";

/**
 * "HER ZAMAN" KONUM İZNİ — priming sheet'i.
 *
 * `LocationPermissionSheet`in KARDEŞİ, kopyası değil. Ortak olan: priming
 * zorunlu (sistem dialogu doğrudan açılmıyor), `idle|requesting|denied`
 * makinesi, Ayarlar'dan dönüşü AppState ile yakalama, Android geri tuşunu
 * yutma.
 *
 * 🔴 TEK BÜYÜK FARK: BU SHEET KAPATILABİLİR. Foreground izni uygulamanın
 * çalışması için şart (o kapı kapatılamaz); "Her zaman" ise YALNIZ bildirimi
 * açıyor. Özellik izinsiz de tam çalışıyor — kullanıcı kampüsteyken paylaşıyor,
 * sadece "kampüse vardın" bildirimi gelmiyor. Zorunlu bir kapı burada hem
 * yalan söylerdi hem App Store'da savunulamazdı.
 *
 * ⚠️ ANDROID 10+ : `ACCESS_BACKGROUND_LOCATION` sistem dialogunda İSTENEMEZ,
 * sistem doğrudan ayarlar sayfasına yönlendiriyor. `denied` dalı bu yüzden
 * Android'de normal yol, hata değil.
 *
 * ⚠️ İZİN AÇILIŞTA SORULMUYOR. Çağıran bu sheet'i kullanıcı tam ekran haritayı
 * ilk açtığında ya da "+"ya ilk bastığında gösteriyor — yani niyet anında.
 * Metin de özelliğin adını söylüyor ("kampüsüne vardığında haber ver"),
 * jenerik bir "konum lazım" değil (App Store 5.1.1 gereği).
 */

type PermState = "idle" | "requesting" | "denied";

export interface CampusAlwaysPrimingSheetProps {
  visible: boolean;
  onClose: () => void;
  /** İzin verildi — çağıran geofence'i kuruyor. */
  onGranted: () => void;
}

export default function CampusAlwaysPrimingSheet({
  visible,
  onClose,
  onGranted,
}: CampusAlwaysPrimingSheetProps) {
  const { t } = useTranslation();
  const [state, setState] = useState<PermState>("idle");
  const mounted = useRef(true);

  useEffect(() => {
    mounted.current = true;
    return () => {
      mounted.current = false;
    };
  }, []);

  /** Sheet her açılışta temiz başlasın (önceki `denied` kalmasın). */
  useEffect(() => {
    if (visible) setState("idle");
  }, [visible]);

  const check = useCallback(async () => {
    try {
      const perm = await Location.getBackgroundPermissionsAsync();
      if (!mounted.current) return;
      if (perm.status === "granted") {
        onGranted();
        onClose();
      }
    } catch {
      /* no-op — izin okunamadıysa kullanıcı tekrar deneyebilir. */
    }
  }, [onClose, onGranted]);

  /**
   * Ayarlar'dan dönüşü yakala.
   *
   * ⚠️ `navigation` focus olayı YETMİYOR: kullanıcı uygulamadan ÇIKIP Ayarlar'a
   * gidiyor, dönüşte ekran zaten odakta olduğu için o olay hiç fire etmiyor.
   * Tek güvenilir sinyal AppState.
   */
  useEffect(() => {
    if (!visible) return;
    const sub = AppState.addEventListener("change", (next) => {
      if (next === "active") check();
    });
    return () => sub.remove();
  }, [visible, check]);

  /** Kapatılamaz kipte değiliz ama Android geri tuşu sheet'i atlamasın. */
  useEffect(() => {
    if (!visible || Platform.OS !== "android") return;
    const sub = BackHandler.addEventListener("hardwareBackPress", () => {
      onClose();
      return true;
    });
    return () => sub.remove();
  }, [visible, onClose]);

  const request = useCallback(async () => {
    setState("requesting");
    try {
      const perm = await Location.requestBackgroundPermissionsAsync();
      if (!mounted.current) return;
      if (perm.status === "granted") {
        onGranted();
        onClose();
        return;
      }
      setState("denied");
    } catch {
      if (mounted.current) setState("denied");
    }
  }, [onClose, onGranted]);

  const openSettings = useCallback(() => {
    Linking.openSettings().catch(() => {
      /* no-op */
    });
  }, []);

  return (
    <AppBottomSheet
      visible={visible}
      onClose={onClose}
      enableDynamicSizing
      enablePanDownToClose
    >
      {/* ⚠️ `BottomSheetView` ZORUNLU (gerekçe CampusMomentComposer'da):
          `enableDynamicSizing`in detentini ölçen tek şey bu bileşen. */}
      <BottomSheetView
        style={{ paddingHorizontal: 24, paddingTop: 8, paddingBottom: 28 }}
      >
        <View
          style={{
            width: 56,
            height: 56,
            borderRadius: 28,
            alignItems: "center",
            justifyContent: "center",
            backgroundColor: colors.surface3,
            marginBottom: 16,
          }}
        >
          <SFIcon
            name="location.fill"
            fallback={Navigation}
            size={26}
            color={colors.text}
          />
        </View>

        <Text style={{ color: colors.text, fontSize: 22, fontWeight: "700" }}>
          {t("campus.permission.title")}
        </Text>
        <Text
          style={{
            marginTop: 10,
            color: colors.textSecondary,
            fontSize: 15,
            lineHeight: 21,
          }}
        >
          {state === "denied"
            ? t("campus.permission.deniedBody")
            : t("campus.permission.body")}
        </Text>

        <View style={{ marginTop: 22, gap: 10 }}>
          <AnimatedPressable
            pressScale={0.98}
            onPress={state === "denied" ? openSettings : request}
            accessibilityRole="button"
            style={{
              paddingVertical: 15,
              borderRadius: 999,
              borderCurve: "continuous",
              alignItems: "center",
              backgroundColor: colors.inverseSurface,
            }}
          >
            <Text
              style={{
                color: colors.onInverseSurface,
                fontSize: 16,
                fontWeight: "700",
              }}
            >
              {state === "denied"
                ? t("campus.permission.openSettings")
                : t("campus.permission.allow")}
            </Text>
          </AnimatedPressable>

          <AnimatedPressable
            pressScale={0.98}
            onPress={onClose}
            accessibilityRole="button"
            style={{ paddingVertical: 13, alignItems: "center" }}
          >
            <Text
              style={{
                color: colors.textSecondary,
                fontSize: 15,
                fontWeight: "600",
              }}
            >
              {t("campus.permission.later")}
            </Text>
          </AnimatedPressable>
        </View>
      </BottomSheetView>
    </AppBottomSheet>
  );
}
