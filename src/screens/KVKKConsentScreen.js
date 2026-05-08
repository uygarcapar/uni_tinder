import { useState } from "react";
import {
  View,
  Text,
  TouchableOpacity,
  ScrollView,
  ActivityIndicator,
  Alert,
  Modal,
} from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import { useDispatch } from "react-redux";
import { ShieldCheck } from "lucide-react-native";
import api from "../services/api";
import { API_ENDPOINTS } from "../constants/api";
import { setKvkkAccepted } from "../store/slices/authSlice";

export const CURRENT_KVKK_VERSION = "1.0";

export default function KVKKConsentScreen({ visible }) {
  const dispatch = useDispatch();
  const [loading, setLoading] = useState(false);
  const [agreed, setAgreed] = useState(false);

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

  return (
    <Modal visible={visible} animationType="slide" statusBarTranslucent>
      <View style={{ flex: 1, backgroundColor: "#121212" }}>
        <SafeAreaView style={{ flex: 1 }}>
          {/* Header */}
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
            <ShieldCheck size={28} color="#fff" strokeWidth={1.5} pointerEvents="none" />
            <Text style={{ color: "#fff", fontSize: 22, fontWeight: "700" }}>
              Gizlilik & KVKK
            </Text>
          </View>

          <Text
            style={{
              color: "#9CA3AF",
              fontSize: 13,
              paddingHorizontal: 24,
              marginBottom: 16,
              lineHeight: 20,
            }}
          >
            Uygulamayı kullanmaya devam etmeden önce aşağıdaki metni okumanı ve onaylamanı istiyoruz.
          </Text>

          {/* Consent Text */}
          <ScrollView
            style={{ flex: 1, marginHorizontal: 16 }}
            contentContainerStyle={{ paddingBottom: 24 }}
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
                6698 sayılı Kişisel Verilerin Korunması Kanunu kapsamında kişisel verileriniz; hizmetlerimizi sunmak, geliştirmek ve güvenliğinizi sağlamak amacıyla işlenmektedir. Verileriniz üçüncü taraflarla yalnızca yasal zorunluluk veya açık rızanız dahilinde paylaşılır.
              </Section>

              <Section title="İşlenen Veriler">
                Ad-soyad, e-posta, doğum tarihi, fotoğraf, üniversite bilgisi ve uygulama kullanım verileri işlenmektedir. Bu veriler profil oluşturma, eşleştirme algoritması ve iletişim için kullanılmaktadır.
              </Section>

              <Section title="Haklarınız">
                KVKK'nın 11. maddesi kapsamında verilerinize erişme, düzeltme, silme ve işlemeyi kısıtlama haklarına sahipsiniz. Bu hakları kullanmak için uygulama içindeki "Verilerimi İndir" özelliğini ya da hesap silme seçeneğini kullanabilirsiniz.
              </Section>

              <Section title="Çerezler ve Analitik">
                Uygulama deneyimini iyileştirmek amacıyla anonim kullanım verileri toplanmaktadır. Bu veriler kişisel kimliğinizle ilişkilendirilmez.
              </Section>

              <Section title="Veri Saklama">
                Verileriniz hesabınız aktif olduğu sürece saklanır. Hesabınızı silerseniz verileriniz 30 gün içinde kalıcı olarak silinir.
              </Section>

              <Section title="İletişim">
                Gizlilik politikamız veya kişisel verileriniz hakkında sorularınız için uygulama üzerinden bizimle iletişime geçebilirsiniz.
              </Section>
            </View>
          </ScrollView>

          {/* Footer */}
          <View
            style={{
              paddingHorizontal: 20,
              paddingBottom: 24,
              paddingTop: 16,
              gap: 12,
            }}
          >
            {/* Checkbox */}
            <TouchableOpacity
              activeOpacity={0.8}
              onPress={() => setAgreed(!agreed)}
              style={{ flexDirection: "row", alignItems: "flex-start", gap: 12 }}
            >
              <View
                style={{
                  width: 22,
                  height: 22,
                  borderRadius: 6,
                  borderWidth: 1.5,
                  borderColor: agreed ? "#fff" : "rgba(255,255,255,0.3)",
                  backgroundColor: agreed ? "#fff" : "transparent",
                  alignItems: "center",
                  justifyContent: "center",
                  marginTop: 1,
                  flexShrink: 0,
                }}
              >
                {agreed && (
                  <Text style={{ color: "#000", fontSize: 13, fontWeight: "700" }}>✓</Text>
                )}
              </View>
              <Text style={{ color: "#9CA3AF", fontSize: 13, lineHeight: 20, flex: 1 }}>
                Gizlilik politikasını ve KVKK aydınlatma metnini okudum, anladım ve kabul ediyorum.
              </Text>
            </TouchableOpacity>

            {/* Accept button */}
            <TouchableOpacity
              onPress={handleAccept}
              disabled={loading || !agreed}
              activeOpacity={0.85}
              style={{
                borderRadius: 999,
                borderCurve: "continuous",
                overflow: "hidden",
                backgroundColor: agreed ? "#fff" : "rgba(255,255,255,0.15)",
                paddingVertical: 16,
                alignItems: "center",
              }}
            >
              {loading ? (
                <ActivityIndicator color={agreed ? "#000" : "#fff"} />
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
          </View>
        </SafeAreaView>
      </View>
    </Modal>
  );
}

function Section({ title, children }) {
  return (
    <View style={{ gap: 6 }}>
      <Text style={{ color: "#fff", fontSize: 14, fontWeight: "600" }}>{title}</Text>
      <Text style={{ color: "#9CA3AF", fontSize: 13, lineHeight: 20 }}>{children}</Text>
    </View>
  );
}
