import { useCallback, useEffect, useState } from "react";
import { ActivityIndicator, ScrollView, Text, View } from "react-native";
import { useTranslation } from "react-i18next";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import AnimatedPressable from "@/shared/components/AnimatedPressable";
import PolicyMarkdown from "@/shared/components/PolicyMarkdown";
import { colors, ink } from "@/shared/theme/colors";
import { devLog } from "@/shared/utils/devLog";
import {
  acceptConsent,
  fetchConsentPolicy,
  SELFIE_CONSENT_TYPES,
  type ConsentPolicy,
  type SelfieConsentType,
} from "./selfieService";

/**
 * KVKK rıza adımı — İKİ AYRI ONAY.
 *
 * `/start` iki rıza arıyor, biri eksikse `UT-6501`:
 *   BiometricVerification → yüz verisi, KVKK m.6 özel nitelikli veri
 *   DataTransferAbroad    → Rekognition us-east-1'de, m.9 yurt dışı aktarım
 *
 * ⚠️ Tek bir "kabul ediyorum" kutusu YETMEZ: KVKK her biri için ayrı, bilinçli
 * onay istiyor. Bu yüzden iki kutu var ve ikisi işaretlenmeden CTA açılmıyor.
 *
 * ⚠️ `version` metinle GELEN değerdir. Sabit kodlanırsa metin güncellendiğinde
 * yeniden rıza tetiklenmez — sözleşmenin açıkça yasakladığı şey.
 */

type PolicyState = {
  policy: ConsentPolicy | null;
  /** Metin çekilemedi — akış kilitlenmesin diye i18n yedeğine düşülür. */
  failed: boolean;
};

export default function SelfieConsentStep({
  onAccepted,
  onCancel,
}: {
  onAccepted: () => void;
  onCancel: () => void;
}) {
  const { t } = useTranslation();
  const insets = useSafeAreaInsets();

  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [policies, setPolicies] = useState<Record<string, PolicyState>>({});
  const [checked, setChecked] = useState<Record<string, boolean>>({});

  useEffect(() => {
    let cancelled = false;
    (async () => {
      const results = await Promise.all(
        SELFIE_CONSENT_TYPES.map(async (type) => {
          try {
            return [type, { policy: await fetchConsentPolicy(type), failed: false }] as const;
          } catch (e) {
            devLog(`🪪 [selfie] ${type} metni çekilemedi`, e);
            return [type, { policy: null, failed: true }] as const;
          }
        }),
      );
      if (cancelled) return;
      setPolicies(Object.fromEntries(results));
      setLoading(false);
    })();
    return () => {
      cancelled = true;
    };
  }, []);

  const allChecked = SELFIE_CONSENT_TYPES.every((type) => checked[type]);

  const handleAccept = useCallback(async () => {
    if (!allChecked || saving) return;
    setSaving(true);
    setError(null);
    try {
      // Sırayla: ikisi de kaydedilmeden ilerlemek `UT-6501`'e geri düşerdi.
      for (const type of SELFIE_CONSENT_TYPES) {
        const version = policies[type]?.policy?.version;
        if (!version) {
          // Metin çekilemediyse hangi sürüme rıza verildiğini bilmiyoruz;
          // uydurulmuş bir sürümle kayıt atmak rızayı geçersiz kılar.
          throw new Error(`missing version for ${type}`);
        }
        await acceptConsent(type, version);
      }
      onAccepted();
    } catch (e) {
      devLog("🪪 [selfie] rıza kaydedilemedi", e);
      setError(t("profile.selfie.consent.saveError"));
      setSaving(false);
    }
  }, [allChecked, saving, policies, onAccepted, t]);

  return (
    <View style={{ flex: 1, backgroundColor: colors.bg }}>
      <View
        style={{
          paddingTop: insets.top + 12,
          paddingHorizontal: 24,
          paddingBottom: 12,
        }}
      >
        <Text style={{ color: colors.text, fontSize: 26, fontWeight: "700" }}>
          {t("profile.selfie.consent.title")}
        </Text>
        <Text
          style={{
            color: colors.textSecondary,
            fontSize: 14,
            lineHeight: 20,
            marginTop: 8,
          }}
        >
          {t("profile.selfie.consent.description")}
        </Text>
      </View>

      {loading ? (
        <View style={{ flex: 1, alignItems: "center", justifyContent: "center" }}>
          <ActivityIndicator color={colors.text} />
        </View>
      ) : (
        <ScrollView
          style={{ flex: 1 }}
          contentContainerStyle={{ paddingHorizontal: 24, paddingBottom: 24, gap: 28 }}
          showsVerticalScrollIndicator={false}
        >
          {SELFIE_CONSENT_TYPES.map((type) => (
            <ConsentSection
              key={type}
              consentType={type}
              state={policies[type]}
              checked={checked[type] === true}
              onToggle={() =>
                setChecked((prev) => ({ ...prev, [type]: !prev[type] }))
              }
            />
          ))}

          {/* Rehber §3: geri alınabilirlik rıza ekranında YAZILI olmalı. */}
          <Text
            style={{ color: colors.textMuted, fontSize: 13, lineHeight: 19 }}
          >
            {t("profile.selfie.consent.withdrawNote")}
          </Text>
        </ScrollView>
      )}

      <View
        style={{
          paddingHorizontal: 24,
          paddingTop: 16,
          paddingBottom: insets.bottom + 16,
          gap: 12,
          borderTopWidth: 0.5,
          borderTopColor: colors.hairlineSoft,
          backgroundColor: colors.bg,
        }}
      >
        {error && (
          <Text style={{ color: colors.error, fontSize: 13 }}>{error}</Text>
        )}

        <AnimatedPressable
          onPress={handleAccept}
          disabled={!allChecked || saving || loading}
          style={{
            borderRadius: 999,
            borderCurve: "continuous",
            overflow: "hidden",
            backgroundColor: allChecked
              ? colors.inverseSurface
              : colors.hairlineStrong,
          }}
        >
          {saving ? (
            <ActivityIndicator
              style={{ paddingVertical: 17.5 }}
              color={allChecked ? colors.onInverseSurface : colors.text}
            />
          ) : (
            <Text
              style={{
                paddingVertical: 20,
                textAlign: "center",
                fontSize: 15,
                fontWeight: "700",
                color: allChecked ? colors.onInverseSurface : ink(0.4),
              }}
            >
              {t("profile.selfie.consent.acceptButton")}
            </Text>
          )}
        </AnimatedPressable>

        <AnimatedPressable onPress={onCancel} disabled={saving} pressScale={1}>
          <Text
            style={{
              paddingVertical: 8,
              textAlign: "center",
              fontSize: 14,
              color: colors.textSecondary,
            }}
          >
            {t("common.cancel")}
          </Text>
        </AnimatedPressable>
      </View>
    </View>
  );
}

function ConsentSection({
  consentType,
  state,
  checked,
  onToggle,
}: {
  consentType: SelfieConsentType;
  state: PolicyState | undefined;
  checked: boolean;
  onToggle: () => void;
}) {
  const { t } = useTranslation();
  const markdown = state?.policy?.contentMarkdown;

  return (
    <View style={{ gap: 12 }}>
      <Text style={{ color: colors.text, fontSize: 18, fontWeight: "600" }}>
        {t(`profile.selfie.consent.${consentType}.title`)}
      </Text>

      {markdown ? (
        <PolicyMarkdown source={markdown} />
      ) : (
        // Ağ hatası akışı kilitlemesin: yedek metin gösteriliyor ama rıza
        // KAYDEDİLEMEZ (version bilinmiyor) — handleAccept orada duruyor.
        <Text
          style={{ color: colors.textSecondary, fontSize: 14, lineHeight: 20 }}
        >
          {t(`profile.selfie.consent.${consentType}.fallback`)}
        </Text>
      )}

      <AnimatedPressable
        onPress={onToggle}
        pressScale={1}
        accessibilityRole="checkbox"
        style={{ flexDirection: "row", alignItems: "flex-start", gap: 12 }}
      >
        <View
          style={{
            width: 22,
            height: 22,
            borderRadius: 6,
            borderWidth: 1.5,
            borderColor: checked ? colors.inverseSurface : colors.hairlineMuted,
            backgroundColor: checked ? colors.inverseSurface : "transparent",
            alignItems: "center",
            justifyContent: "center",
            marginTop: 1,
            flexShrink: 0,
          }}
        >
          {checked && (
            <Text
              style={{
                color: colors.onInverseSurface,
                fontSize: 13,
                fontWeight: "700",
              }}
            >
              ✓
            </Text>
          )}
        </View>
        <Text
          style={{
            flex: 1,
            color: colors.textSecondary,
            fontSize: 13,
            lineHeight: 20,
          }}
        >
          {t(`profile.selfie.consent.${consentType}.checkbox`)}
        </Text>
      </AnimatedPressable>
    </View>
  );
}
