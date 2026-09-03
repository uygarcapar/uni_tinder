import { useState, useCallback } from "react";
import { View, Text, TouchableOpacity, ActivityIndicator, Alert } from "react-native";
import {
  BottomSheetScrollView,
  BottomSheetBackdrop,
} from "@gorhom/bottom-sheet";
import { BlurView } from "expo-blur";
import { useAppDispatch } from "@/shared/hooks/redux";
import { ShieldCheck } from "@/shared/icons";
import SFIcon from "@/shared/components/SFIcon";
import api from "@/shared/services/api";
import { API_ENDPOINTS } from "@/shared/constants/api";
import { setKvkkAccepted } from "@/features/auth/authSlice";
import AppBottomSheet from "@/shared/components/AppBottomSheet";
import PolicyMarkdown from "@/shared/components/PolicyMarkdown";
import { colors, ink } from "../../../shared/theme/colors";
import { useTranslation } from 'react-i18next';
import { plainBlurTint } from "@/shared/theme/blur";

/**
 * ⚠️ METİN DEĞİŞİRSE BU SABİT DE DEĞİŞMELİ. AppNavigator `kvkkVersion !==
 * CURRENT_KVKK_VERSION` ile onay ekranını açıyor; sabit sabit kalırsa eski
 * metni onaylamış kullanıcılar yeni metne sessizce bağlanmış sayılır.
 */
export const CURRENT_KVKK_VERSION = "2.0";

/** `auth.kvkkConsent.section{n}` blokları. LegalSheet'teki sayıyla eşit olmalı. */
const PRIVACY_SECTIONS = Array.from({ length: 13 }, (_, i) => i + 1);

export default function KVKKConsentScreen({ visible }) {
  const { t } = useTranslation();
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
      Alert.alert(t('auth.kvkkConsent.titleRequired'), t('auth.kvkkConsent.messageRequired'));
      return;
    }
    setLoading(true);
    try {
      await api.post(API_ENDPOINTS.PRIVACY_ACCEPT_CONSENT, {
        version: CURRENT_KVKK_VERSION,
      });
      dispatch(setKvkkAccepted(CURRENT_KVKK_VERSION));
    } catch {
      Alert.alert(t('errors.generic'), t('auth.kvkkConsent.errorSave'));
    } finally {
      setLoading(false);
    }
  };

  const footer = (
    <BlurView
      intensity={40}
      tint={plainBlurTint()}
          style={{
            paddingHorizontal: 20,
            paddingTop: 16,
            paddingBottom: 28,
            gap: 12,
            borderTopWidth: 0.5,
            borderTopColor: colors.hairlineSoft,
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
                borderColor: agreed ? colors.inverseSurface : colors.hairlineMuted,
                backgroundColor: agreed ? colors.inverseSurface : "transparent",
                alignItems: "center",
                justifyContent: "center",
                marginTop: 1,
                flexShrink: 0,
              }}
            >
              {agreed && (
                <Text style={{ color: colors.onInverseSurface, fontSize: 13, fontWeight: "700" }}>
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
              {t('auth.kvkkConsent.acceptText')}
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
              backgroundColor: agreed ? colors.inverseSurface : colors.hairlineStrong,
              paddingVertical: 16,
              alignItems: "center",
            }}
          >
            {loading ? (
              <ActivityIndicator color={agreed ? colors.onInverseSurface : colors.text} />
            ) : (
              <Text
                style={{
                  color: agreed ? colors.onInverseSurface : ink(0.4),
                  fontWeight: "700",
                  fontSize: 15,
                }}
              >
                {t('auth.kvkkConsent.acceptButton')}
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
          <SFIcon
            name="checkmark.shield.fill"
            fallback={ShieldCheck}
            size={28}
            color={colors.text}
            strokeWidth={1.5}
            style={{ pointerEvents: "none" }}
          />
          <Text style={{ color: colors.text, fontSize: 22, fontWeight: "700" }}>
            {t('auth.kvkkConsent.title')}
          </Text>
        </View>

        <Text
          style={{
            color: colors.textSecondary,
            fontSize: 14,
            paddingHorizontal: 24,
            marginBottom: 8,
            lineHeight: 20,
          }}
        >
          {t('auth.kvkkConsent.description')}
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
              padding: 8,
              gap: 16,
            }}
          >
            {PRIVACY_SECTIONS.map((n) => (
              <Section key={n} title={t(`auth.kvkkConsent.sectionTitle${n}`)}>
                {t(`auth.kvkkConsent.section${n}Content`)}
              </Section>
            ))}
          </View>
        </BottomSheetScrollView>
      </View>
    </AppBottomSheet>
  );
}

function Section({ title, children }) {
  return (
    <View style={{ gap: 6 }}>
      <Text style={{ color: colors.text, fontSize: 20, fontWeight: "600",marginBottom: 12 }}>
        {title}
      </Text>
      <PolicyMarkdown source={children} />
    </View>
  );
}
