import { useCallback, useState } from "react";
import { Pressable, Text, TouchableOpacity, View } from "react-native";
import { useTranslation } from "react-i18next";
import AppModal from "@/shared/components/AppModal";
import SFIcon from "@/shared/components/SFIcon";
import { Check, Lock } from "@/shared/icons";
import { colors } from "@/shared/theme/colors";
import type { FeedInterest, FeedKind, FeedSort } from "../feedTypes";

/**
 * Akış filtre sheet'i — sıralama · ilgi alanı · paylaşım tipi.
 *
 * Kilit kararı `/api/feed/me`'den (`canUseKindFilter`), `usePremiumTier()`den
 * DEĞİL: sunucu bu kapının tek sahibi ve ileride tier dışı bir kurala
 * bağlayabilir. Kilitliyken seçenekler yine ÇİZİLİYOR ama tepkisiz — kullanıcı
 * ne kaçırdığını görsün ve yanlışlıkla seçip UT-7311 yemesin (FilterModal'daki
 * PremiumGate'in aynı davranışı).
 */

export interface FeedFilterValue {
  sort: FeedSort;
  interest: FeedInterest;
  kind: FeedKind;
}

export interface FeedFilterSheetProps {
  visible: boolean;
  onClose: () => void;
  value: FeedFilterValue;
  onApply: (next: FeedFilterValue) => void;
  /** `kindFilterGate(me)` sonucu — "unknown" iken kilit ÇİZİLMEZ. */
  kindGate: "unknown" | "allowed" | "paywall";
  onKindPaywall: () => void;
}

const SORTS: FeedSort[] = ["new", "popular", "top"];
const INTERESTS: FeedInterest[] = ["all", "mine"];
const KINDS: FeedKind[] = ["all", "anonymous", "normal"];

const DEFAULTS: FeedFilterValue = {
  sort: "new",
  interest: "all",
  kind: "all",
};

export default function FeedFilterSheet({
  visible,
  onClose,
  value,
  onApply,
  kindGate,
  onKindPaywall,
}: FeedFilterSheetProps) {
  const { t } = useTranslation();
  // Yerel taslak: sheet kapanana kadar listeyi yeniden çekme. Her dokunuşta
  // `onApply` çağrılsaydı kullanıcı üç seçenek denerken üç ayrı sorgu doğardı.
  const [draft, setDraft] = useState<FeedFilterValue>(value);

  // Sheet her açıldığında dışarıdaki gerçekle hizalan (kullanıcı önceki
  // turda "Bitti"ye basmadan kapatmış olabilir).
  const handlePresented = useCallback(() => setDraft(value), [value]);

  const apply = useCallback(() => {
    onApply(draft);
    onClose();
  }, [draft, onApply, onClose]);

  const reset = useCallback(() => setDraft(DEFAULTS), []);

  const kindLocked = kindGate === "paywall";

  return (
    <AppModal
      visible={visible}
      onClose={onClose}
      onPresented={handlePresented}
      title={t("feed.filter.title")}
      dynamicSizing
      // Bitti/Sıfırla YAZISI yerine glif — FilterModal ile birebir aynı dil.
      actionIcon="checkmark"
      actionIconLabel={t("common.done")}
      onAction={apply}
      leftIcon="arrow.counterclockwise"
      leftIconLabel={t("feed.filter.reset")}
      onLeftPress={reset}
      contentContainerStyle={{ paddingTop: 8, paddingBottom: 28 }}
    >
      <Section title={t("feed.filter.sort")}>
        {SORTS.map((key) => (
          <OptionRow
            key={key}
            label={t(`feed.sort.${key}`)}
            selected={draft.sort === key}
            onPress={() => setDraft((d) => ({ ...d, sort: key }))}
          />
        ))}
      </Section>

      <Section title={t("feed.filter.interest")}>
        {INTERESTS.map((key) => (
          <OptionRow
            key={key}
            label={t(`feed.interest.${key}`)}
            selected={draft.interest === key}
            onPress={() => setDraft((d) => ({ ...d, interest: key }))}
          />
        ))}
      </Section>

      <Section
        title={t("feed.filter.kind")}
        // Kilit rozeti yalnız "paywall" dalında — "unknown" (/me henüz gelmedi)
        // iken kilit çizmek kullanıcıya olmayan bir kısıt uydururdu
        // (premiumTier.resolved kuralının aynısı).
        locked={kindLocked}
      >
        {/* PremiumGate deseni: dokunuş YUTULMUYOR, paywall'a gidiyor; içerik
            tepkisiz ki yanlışlıkla seçim yapılıp 403 yenmesin. */}
        {kindLocked ? (
          <TouchableOpacity activeOpacity={0.7} onPress={onKindPaywall}>
            <View style={{ opacity: 0.4 }} pointerEvents="none">
              {KINDS.map((key) => (
                <OptionRow
                  key={key}
                  label={t(`feed.kind.${key}`)}
                  selected={draft.kind === key}
                  onPress={() => {}}
                />
              ))}
            </View>
          </TouchableOpacity>
        ) : (
          KINDS.map((key) => (
            <OptionRow
              key={key}
              label={t(`feed.kind.${key}`)}
              selected={draft.kind === key}
              onPress={() => setDraft((d) => ({ ...d, kind: key }))}
            />
          ))
        )}
      </Section>
    </AppModal>
  );
}

function Section({
  title,
  locked,
  children,
}: {
  title: string;
  locked?: boolean;
  children: React.ReactNode;
}) {
  return (
    <View style={{ marginTop: 18 }}>
      <View style={{ flexDirection: "row", alignItems: "center", marginBottom: 6 }}>
        <Text
          style={{
            fontSize: 13,
            fontWeight: "600",
            color: colors.textSecondary,
            letterSpacing: 0.2,
          }}
        >
          {title}
        </Text>
        {locked ? (
          <View style={{ marginLeft: 6 }}>
            <SFIcon
              name="lock.fill"
              fallback={Lock}
              size={12}
              color={colors.textMuted}
              strokeWidth={2}
            />
          </View>
        ) : null}
      </View>
      <View
        style={{
          backgroundColor: colors.surface,
          borderRadius: 18,
          borderCurve: "continuous",
          overflow: "hidden",
        }}
      >
        {children}
      </View>
    </View>
  );
}

function OptionRow({
  label,
  selected,
  onPress,
}: {
  label: string;
  selected: boolean;
  onPress: () => void;
}) {
  return (
    <Pressable
      onPress={onPress}
      style={{
        flexDirection: "row",
        alignItems: "center",
        paddingHorizontal: 16,
        paddingVertical: 13,
      }}
    >
      <Text style={{ flex: 1, fontSize: 15.5, color: colors.text }}>{label}</Text>
      {selected ? (
        <SFIcon
          name="checkmark"
          fallback={Check}
          size={16}
          color={colors.text}
          strokeWidth={2.4}
        />
      ) : null}
    </Pressable>
  );
}
