import { useCallback, useEffect, useRef, useState } from "react";
import {
  ActivityIndicator,
  AppState,
  Linking,
  Text,
  useWindowDimensions,
  View,
} from "react-native";
import { useTranslation } from "react-i18next";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { CameraView, useCameraPermissions } from "expo-camera";
import AnimatedPressable from "@/shared/components/AnimatedPressable";
import { colors, onMediaAt, scrimAt } from "@/shared/theme/colors";
import { forgetPhoto } from "@/shared/utils/photoStore";
import { devLog } from "@/shared/utils/devLog";
import { captureSelfieFrame } from "./captureSelfieFrame";
import type { SelfieFrame } from "./selfieService";
import type { SelfieChallenge } from "./selfieVerification";

/**
 * Kamera adımı — challenge başına TEK kare.
 *
 * 🔴 SÜREKLİ AKIŞ YOK. Kamera önizlemesi elbette akıyor ama SUNUCUYA giden kare
 * sayısı challenge sayısını (2) geçmemeli: video akışını örneklemek gerçek bir
 * liveness ürününden ~3× pahalıya geliyor. Kullanıcı "Hazırım"a basar, tek kare
 * çekilir.
 *
 * 🔴 `mirror={false}`: önizleme AYNALANMIYOR. Ön kameranın aynalı önizlemesi
 * standart ama burada zararlı — kullanıcı "sağa çevir" deyip aynadaki kendini
 * takip ederse dosyada ters yöne dönmüş görünür. Aynalamayı kapatınca önizleme
 * ile dosya aynı yönde oluyor ve talimat ikisinde de aynı şeye karşılık geliyor.
 * Dosyaya ayrıca hiçbir flip uygulanmıyor (bkz. captureSelfieFrame).
 */

const OVAL_WIDTH_RATIO = 0.74;
const OVAL_ASPECT = 0.78; // genişlik / yükseklik

export default function SelfieCameraStep({
  challenges,
  submitting,
  onFrames,
  onCancel,
}: {
  challenges: SelfieChallenge[];
  submitting: boolean;
  onFrames: (frames: SelfieFrame[]) => void;
  onCancel: () => void;
}) {
  const { t } = useTranslation();
  const insets = useSafeAreaInsets();
  const { width } = useWindowDimensions();
  const [permission, requestPermission, getPermission] = useCameraPermissions();

  const cameraRef = useRef<CameraView>(null);
  const framesRef = useRef<SelfieFrame[]>([]);
  const [index, setIndex] = useState(0);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // Kullanıcı Ayarlar'dan izin verip döndüğünde ekran kendiliğinden açılsın —
  // LocationPermissionSheet'teki desenin aynısı. Yoksa sayfa "izin yok"ta
  // takılı kalıyor ve kullanıcı akışı yeniden başlatmak zorunda kalıyor.
  useEffect(() => {
    const sub = AppState.addEventListener("change", (state) => {
      if (state === "active") getPermission().catch(() => {});
    });
    return () => sub.remove();
  }, [getPermission]);

  // Adım yarıda bırakılırsa çekilen kareler diskte asılı kalmasın.
  useEffect(
    () => () => {
      framesRef.current.forEach((frame) => forgetPhoto(frame.uri));
      framesRef.current = [];
    },
    [],
  );

  const handleCapture = useCallback(async () => {
    const camera = cameraRef.current;
    if (!camera || busy || submitting) return;

    setBusy(true);
    setError(null);
    try {
      const frame = await captureSelfieFrame(camera, index);
      framesRef.current = [...framesRef.current, frame];

      if (framesRef.current.length >= challenges.length) {
        // Kareler challenge SIRASIYLA gidiyor — dizi zaten sırayla dolduruldu.
        const frames = framesRef.current;
        // Üst katman artık sahibi: unmount temizliği bunları silmemeli.
        framesRef.current = [];
        onFrames(frames);
        return;
      }
      setIndex((i) => i + 1);
    } catch (e) {
      devLog("🪪 [selfie] kare çekilemedi", e);
      setError(t("profile.selfie.camera.captureError"));
    } finally {
      setBusy(false);
    }
  }, [busy, submitting, index, challenges.length, onFrames, t]);

  if (!permission) {
    return (
      <Centered>
        <ActivityIndicator color={colors.text} />
      </Centered>
    );
  }

  if (!permission.granted) {
    const canAsk = permission.canAskAgain;
    return (
      <Centered>
        <Text
          style={{
            color: colors.text,
            fontSize: 18,
            fontWeight: "600",
            textAlign: "center",
          }}
        >
          {t("profile.permissions.title")}
        </Text>
        <Text
          style={{
            color: colors.textSecondary,
            fontSize: 14,
            lineHeight: 20,
            textAlign: "center",
          }}
        >
          {t("profile.selfie.camera.permissionMessage")}
        </Text>
        <AnimatedPressable
          onPress={() =>
            canAsk ? requestPermission() : Linking.openSettings().catch(() => {})
          }
          style={{
            borderRadius: 999,
            borderCurve: "continuous",
            overflow: "hidden",
            backgroundColor: colors.inverseSurface,
            paddingHorizontal: 32,
          }}
        >
          <Text
            style={{
              paddingVertical: 16,
              fontSize: 15,
              fontWeight: "700",
              color: colors.onInverseSurface,
            }}
          >
            {canAsk
              ? t("profile.selfie.camera.grantPermission")
              : t("profile.permissions.openSettings")}
          </Text>
        </AnimatedPressable>
        <AnimatedPressable onPress={onCancel} pressScale={1}>
          <Text style={{ padding: 8, fontSize: 14, color: colors.textSecondary }}>
            {t("common.cancel")}
          </Text>
        </AnimatedPressable>
      </Centered>
    );
  }

  const challenge = challenges[index];
  const ovalWidth = width * OVAL_WIDTH_RATIO;
  const disabled = busy || submitting;

  return (
    <View style={{ flex: 1, backgroundColor: "#000" }}>
      <CameraView
        ref={cameraRef}
        style={{ flex: 1 }}
        facing="front"
        // 🔴 Bkz. dosya başı: aynalama KAPALI, önizleme ile dosya aynı yönde.
        mirror={false}
        mode="picture"
        animateShutter={false}
      />

      {/* Yüz kılavuzu — çerçeveyi doldurması gerektiğini gösteriyor. Kesme
          (mask) YOK: hem pahalı hem gereksiz, kenarlık yeterince okunuyor. */}
      <View
        pointerEvents="none"
        style={{
          position: "absolute",
          top: 0,
          left: 0,
          right: 0,
          bottom: 0,
          alignItems: "center",
          justifyContent: "center",
        }}
      >
        <View
          style={{
            width: ovalWidth,
            height: ovalWidth / OVAL_ASPECT,
            borderRadius: 999,
            borderWidth: 3,
            borderColor: onMediaAt(0.85),
          }}
        />
      </View>

      <View
        pointerEvents="none"
        style={{
          position: "absolute",
          top: 0,
          left: 0,
          right: 0,
          paddingTop: insets.top + 20,
          paddingHorizontal: 28,
          paddingBottom: 28,
          backgroundColor: scrimAt(0.55),
          gap: 8,
        }}
      >
        <Text
          style={{
            color: onMediaAt(0.7),
            fontSize: 13,
            fontWeight: "600",
            textAlign: "center",
          }}
        >
          {t("profile.selfie.camera.stepCounter", {
            index: index + 1,
            total: challenges.length,
          })}
        </Text>
        {/* Talimat SUNUCUDAN geldiği gibi — kendi metin tablomuz YOK, hangi
            hareketin isteneceğine sunucu karar veriyor. */}
        <Text
          style={{
            color: colors.onMedia,
            fontSize: 24,
            fontWeight: "700",
            textAlign: "center",
          }}
        >
          {challenge?.instruction ?? ""}
        </Text>
        <Text
          style={{
            color: onMediaAt(0.7),
            fontSize: 13,
            lineHeight: 19,
            textAlign: "center",
          }}
        >
          {t("profile.selfie.camera.hint")}
        </Text>
      </View>

      <View
        style={{
          position: "absolute",
          left: 0,
          right: 0,
          bottom: 0,
          paddingTop: 24,
          paddingHorizontal: 28,
          paddingBottom: insets.bottom + 16,
          backgroundColor: scrimAt(0.55),
          gap: 10,
        }}
      >
        {error && (
          <Text
            style={{ color: colors.errorLight, fontSize: 13, textAlign: "center" }}
          >
            {error}
          </Text>
        )}

        <AnimatedPressable
          onPress={handleCapture}
          disabled={disabled}
          style={{
            borderRadius: 999,
            borderCurve: "continuous",
            overflow: "hidden",
            backgroundColor: disabled ? onMediaAt(0.35) : colors.onMedia,
          }}
        >
          {disabled ? (
            <ActivityIndicator
              style={{ paddingVertical: 17.5 }}
              color={colors.onMediaInverse}
            />
          ) : (
            <Text
              style={{
                paddingVertical: 20,
                textAlign: "center",
                fontSize: 15,
                fontWeight: "700",
                color: colors.onMediaInverse,
              }}
            >
              {t("profile.selfie.camera.ready")}
            </Text>
          )}
        </AnimatedPressable>

        <AnimatedPressable onPress={onCancel} disabled={submitting} pressScale={1}>
          <Text
            style={{
              paddingVertical: 8,
              textAlign: "center",
              fontSize: 14,
              color: onMediaAt(0.75),
            }}
          >
            {t("common.cancel")}
          </Text>
        </AnimatedPressable>
      </View>
    </View>
  );
}

function Centered({ children }: { children: React.ReactNode }) {
  return (
    <View
      style={{
        flex: 1,
        backgroundColor: colors.bg,
        alignItems: "center",
        justifyContent: "center",
        paddingHorizontal: 32,
        gap: 16,
      }}
    >
      {children}
    </View>
  );
}
