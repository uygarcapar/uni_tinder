import { useState, useCallback } from "react";
import { View, Text, TouchableOpacity, ActivityIndicator, Alert } from "react-native";
import {
  BottomSheetScrollView,
  BottomSheetBackdrop,
} from "@gorhom/bottom-sheet";
import { BlurView } from "expo-blur";
import { useAppDispatch } from "@/shared/hooks/redux";
import { ShieldCheck } from "lucide-react-native";
import api from "@/shared/services/api";
import { API_ENDPOINTS } from "@/shared/constants/api";
import { setKvkkAccepted } from "@/features/auth/authSlice";
import AppBottomSheet from "@/shared/components/AppBottomSheet";
import { colors } from "../../../shared/theme/colors";

export const CURRENT_KVKK_VERSION = "1.0";

export default function KVKKConsentScreen({ visible }) {
  const dispatch = useAppDispatch();
  const [loading, setLoading] = useState(false);
  const [agreed, setAgreed] = useState(false);

  const renderBackdrop = useCallback(
    (props) => (
      <BottomSheetBackdrop
        {...props}
        appearsOnIndex={0}
        disappearsOnIndex={-1}
        opacity={0.7}
        pressBehavior="none"
      />
    ),
    [],
  );

  const handleAccept = async () => {
    if (!agreed) {
      Alert.alert("Onay Gerekli", "Devam etmek için metni onaylamalısın.");
      return;
    }
    setLoading(true);
    try {
      await api.post(API_ENDPOINTS.PRIVACY_ACCEPT_CONSENT, {
        version: CURRENT_KVKK_VERSION,
      });
      dispatch(setKvkkAccepted(CURRENT_KVKK_VERSION));
    } catch (e) {
      Alert.alert("Hata", "Onay kaydedilemedi, tekrar dene.");
    } finally {
      setLoading(false);
    }
  };

  const footer = (
    <BlurView
      intensity={40}
      tint="dark"
          style={{
            paddingHorizontal: 20,
            paddingTop: 16,
            paddingBottom: 28,
            gap: 12,
            borderTopWidth: 0.5,
            borderTopColor: "rgba(255,255,255,0.08)",
          }}
        >
          <TouchableOpacity
            activeOpacity={0.8}
            onPress={() => setAgreed((v) => !v)}
            style={{
              flexDirection: "row",
              alignItems: "flex-start",
              gap: 12,
            }}
          >
            <View
              style={{
                width: 22,
                height: 22,
                borderRadius: 6,
                borderWidth: 1.5,
                borderColor: agreed ? colors.text : "rgba(255,255,255,0.3)",
                backgroundColor: agreed ? colors.text : "transparent",
                alignItems: "center",
                justifyContent: "center",
                marginTop: 1,
                flexShrink: 0,
              }}
            >
              {agreed && (
                <Text style={{ color: "#000", fontSize: 13, fontWeight: "700" }}>
                  ✓
                </Text>
              )}
            </View>
            <Text
              style={{
                color: colors.textSecondary,
                fontSize: 13,
                lineHeight: 20,
                flex: 1,
              }}
            >
              Gizlilik politikasını ve KVKK aydınlatma metnini okudum, anladım
              ve kabul ediyorum.
            </Text>
          </TouchableOpacity>

          <TouchableOpacity
            onPress={handleAccept}
            disabled={loading || !agreed}
            activeOpacity={0.85}
            style={{
              borderRadius: 999,
              borderCurve: "continuous",
              overflow: "hidden",
              backgroundColor: agreed ? colors.text : "rgba(255,255,255,0.15)",
              paddingVertical: 16,
              alignItems: "center",
            }}
          >
            {loading ? (
              <ActivityIndicator color={agreed ? "#000" : colors.text} />
            ) : (
              <Text
                style={{
                  color: agreed ? "#000" : "rgba(255,255,255,0.4)",
                  fontWeight: "700",
                  fontSize: 15,
                }}
              >
                Kabul Et ve Devam Et
              </Text>
            )}
          </TouchableOpacity>
        </BlurView>
  );

  return (
    <AppBottomSheet
      visible={visible}
      onClose={() => {}}
      snapPoints={["92%"]}
      enablePanDownToClose={false}
      enableContentPanningGesture={false}
      enableHandlePanningGesture={false}
      backdropComponent={renderBackdrop}
      footer={footer}
      backgroundStyle={{
        backgroundColor: colors.bg,
        borderTopLeftRadius: 36,
        borderTopRightRadius: 36,
      }}
      handleComponent={null}
    >
      <View
        style={{
          flex: 1,
          backgroundColor: colors.bg,
          borderTopLeftRadius: 36,
          borderTopRightRadius: 36,
          overflow: "hidden",
        }}
      >
        <View
          style={{
            paddingHorizontal: 24,
            paddingTop: 24,
            paddingBottom: 16,
            flexDirection: "row",
            alignItems: "center",
            gap: 12,
          }}
        >
          <ShieldCheck size={28} color={colors.text} strokeWidth={1.5} pointerEvents="none" />
          <Text style={{ color: colors.text, fontSize: 22, fontWeight: "700" }}>
            Gizlilik & KVKK
          </Text>
        </View>

        <Text
          style={{
            color: colors.textSecondary,
            fontSize: 13,
            paddingHorizontal: 24,
            marginBottom: 16,
            lineHeight: 20,
          }}
        >
          Uygulamayı kullanmaya devam etmeden önce aşağıdaki metni okumanı ve
          onaylamanı istiyoruz.
        </Text>

        <BottomSheetScrollView
          style={{ flex: 1, marginHorizontal: 16 }}
          contentContainerStyle={{ paddingBottom: 240 }}
          showsVerticalScrollIndicator={false}
        >
          <View
            style={{
              borderRadius: 24,
              borderCurve: "continuous",
              overflow: "hidden",
              borderWidth: 0.5,
              borderColor: "rgba(255,255,255,0.1)",
              padding: 20,
              gap: 16,
            }}
          >
            <Section title="Kişisel Verilerin Korunması (KVKK)">
              6698 sayılı Kişisel Verilerin Korunması Kanunu kapsamında kişisel
              verileriniz; hizmetlerimizi sunmak, geliştirmek ve güvenliğinizi
              sağlamak amacıyla işlenmektedir. Verileriniz üçüncü taraflarla
              yalnızca yasal zorunluluk veya açık rızanız dahilinde paylaşılır.
            </Section>

            <Section title="İşlenen Veriler">
              Ad, e-posta, doğum tarihi, fotoğraf, üniversite bilgisi ve
              uygulama kullanım verileri işlenmektedir. Bu veriler profil
              oluşturma, eşleştirme algoritması ve iletişim için
              kullanılmaktadır.
            </Section>

            <Section title="Haklarınız">
              KVKK'nın 11. maddesi kapsamında verilerinize erişme, düzeltme,
              silme ve işlemeyi kısıtlama haklarına sahipsiniz. Bu hakları
              kullanmak için uygulama içindeki "Verilerimi İndir" özelliğini
              ya da hesap silme seçeneğini kullanabilirsiniz.
            </Section>

            <Section title="Çerezler ve Analitik">
              Uygulama deneyimini iyileştirmek amacıyla anonim kullanım
              verileri toplanmaktadır. Bu veriler kişisel kimliğinizle
              ilişkilendirilmez.
            </Section>

            <Section title="Veri Saklama">
              Verileriniz hesabınız aktif olduğu sürece saklanır. Hesabınızı
              silerseniz verileriniz 30 gün içinde kalıcı olarak silinir.
            </Section>

            <Section title="İletişim">
              Gizlilik politikamız veya kişisel verileriniz hakkında
              sorularınız için uygulama üzerinden bizimle iletişime
              geçebilirsiniz.
            </Section>
          </View>
        </BottomSheetScrollView>
      </View>
    </AppBottomSheet>
  );
}

function Section({ title, children }) {
  return (
    <View style={{ gap: 6 }}>
      <Text style={{ color: colors.text, fontSize: 14, fontWeight: "600" }}>
        {title}
      </Text>
      <Text style={{ color: colors.textSecondary, fontSize: 13, lineHeight: 20 }}>
        {children}
      </Text>
    </View>
  );
}
