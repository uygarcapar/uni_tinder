import { useCallback, useEffect, useMemo, useState } from "react";
import { ActivityIndicator, Text, TouchableOpacity, View } from "react-native";
import { useTranslation } from "react-i18next";
import { BottomSheetScrollView } from "@gorhom/bottom-sheet";
import { BlurView } from "expo-blur";
import { LinearGradient } from "expo-linear-gradient";
import { ChevronDown, Eye, EyeOff, Info as InfoIcon, X as XIcon } from "@/shared/icons";
import AppBottomSheet from "@/shared/components/AppBottomSheet";
import AnimatedPressable from "@/shared/components/AnimatedPressable";
import SFIcon from "@/shared/components/SFIcon";
import UniversityPickerModal from "@/features/discover/components/UniversityPickerModal";
import { useUniversities, resolveLocalized } from "@/shared/queries/commonQueries";
import { MAX_UNIVERSITY_DOMAINS } from "@/shared/constants/limits";
import {
  buildVisibilityUpdates,
  toDomainList,
  sameList,
  type Target,
} from "@/features/profile/universityVisibility";
import { colors, gradients } from "@/shared/theme/colors";
import { plainBlurTint } from "@/shared/theme/blur";
import { devLog } from "@/shared/utils/devLog";
import uiBus from "@/shared/services/uiBus";
import { showInfoToast } from "@/shared/services/toaster";
import profileService from "@/features/profile/profileService";
import i18n from "@/shared/i18n";

/**
 * "Beni kimler görsün / görmesin" — FİLTRE EKRANINDAN TAŞINDI.
 *
 * 🔴 NEDEN BURADA: üniversite ile ilgili üç liste var ve üçü aynı görünüyordu.
 * `universityDomains` ("ben kimleri göreyim") bir KEŞİF FİLTRESİ — kendi desteni
 * daraltır, filtre ekranında KALDI. Bu ikisi ise `showLocation` /
 * `showOnlineStatus` ailesinden: BAŞKALARININ destesini etkiliyor, yani senin
 * görünürlük ayarın. Backend de bunları artık `UpdateProfile` altında yazıyor
 * (bkz. docs/frontend_university_visibility_guide.md, commit 99d2834).
 *
 * ⚠️ ARAYÜZ TAŞINIRKEN DEĞİŞMEDİ: satırlar, sayaç, örtüşme uyarısı ve premium
 * bitiş notu FilterModal'daki görünürlük bölümünün birebir aynısı — metinler de
 * aynı i18n anahtarlarından (`discover.filters.visibility.*`) geliyor. Kullanıcı
 * ayarı yeni bir yerde buluyor ama tanıdık bir yüzeyle karşılaşıyor.
 *
 * 🔴 KAYDETME SEMANTİĞİ (backend sözleşmesi):
 *   • alanı hiç gönderme  → DEĞİŞTİRME
 *   • boş liste           → TEMİZLE (kısıtlama kalkar)
 * `null` ile `[]` aynı şey DEĞİL. FormData boş diziyi ifade edemediği için
 * temizleme TEK BOŞ STRING ile gidiyor (aşağıda `CLEAR_SENTINEL`).
 */


export default function UniversityVisibilitySheet({
  visible,
  onClose,
  profile,
  isPremium,
  onSaved,
}: {
  visible: boolean;
  onClose: () => void;
  profile: any;
  isPremium: boolean;
  onSaved?: () => void;
}) {
  const { t } = useTranslation();
  const universitiesQuery = useUniversities();
  const universityOptions = useMemo(
    () => universitiesQuery.data ?? [],
    [universitiesQuery.data],
  );

  // Sunucudaki hâl — "değişti mi" kararının tabanı. Kaydetmede yalnız GERÇEKTEN
  // değişen alan gidiyor (sözleşme §5.2): değişmeyeni göndermek premium'u biten
  // kullanıcıda gereksiz 403 riski üretir.
  const initial = useMemo(
    () => ({
      visibleOnly: toDomainList(profile?.visibleOnlyToUniversityDomains),
      hiddenFrom: toDomainList(profile?.hiddenFromUniversityDomains),
    }),
    [profile?.visibleOnlyToUniversityDomains, profile?.hiddenFromUniversityDomains],
  );

  const [draft, setDraft] = useState(initial);
  const [saving, setSaving] = useState(false);
  const [picker, setPicker] = useState<Target | null>(null);
  const [pickerVisible, setPickerVisible] = useState(false);

  // Sheet her açılışta sunucudaki hâlden başlasın: yarım kalmış bir taslak
  // ikinci açılışta "kaydedilmiş" gibi görünürdü.
  useEffect(() => {
    if (visible) setDraft(initial);
  }, [visible, initial]);

  const universityNameByDomain = useMemo(() => {
    const map = new Map<string, string>();
    for (const u of universityOptions) {
      map.set(u.domain, resolveLocalized(u.display, i18n.language, u.name));
    }
    return map;
  }, [universityOptions]);

  const summarizeDomains = (domains: string[]) => {
    if (!domains || domains.length === 0) return null;
    const first = universityNameByDomain.get(domains[0]) ?? domains[0];
    return domains.length > 1 ? `${first} +${domains.length - 1}` : first;
  };

  // Aynı üniversite iki listede olabilir — çakışmada BLOCK kazanır (kullanıcı
  // görünmez). Backend izin veriyor ama neredeyse her zaman kullanıcı hatası.
  const overlap = useMemo(() => {
    if (draft.visibleOnly.length === 0 || draft.hiddenFrom.length === 0) return false;
    const blocked = new Set(draft.hiddenFrom);
    return draft.visibleOnly.some((d) => blocked.has(d));
  }, [draft]);

  const dirty =
    !sameList(draft.visibleOnly, initial.visibleOnly) ||
    !sameList(draft.hiddenFrom, initial.hiddenFrom);

  // Free kullanıcı kilitli satıra dokununca paywall. FilterModal'daki yolun
  // aynısı: sheet ÖNCE kapanıyor, çünkü paywall başka bir sekmedeki sayfa ve
  // portal'a çizilen sheet onun önünde kalırdı.
  const openPaywall = useCallback(() => {
    onClose();
    uiBus.emit("swipePaywall", {
      paywallType: "PREMIUM_FILTERS",
      showPaywall: true,
      message: null,
    });
  }, [onClose]);

  const openPicker = (target: Target) => {
    if (!isPremium) {
      openPaywall();
      return;
    }
    setPicker(target);
    setPickerVisible(true);
  };

  const handleSave = useCallback(async () => {
    if (saving) return;
    if (!dirty) {
      onClose();
      return;
    }
    // 🔴 Free kullanıcıda bu alanlar payload'a HİÇ girmemeli: girerse isteğin
    // TAMAMI 403'e düşer ve kullanıcı bio'sunu bile kaydedemez (sözleşme §2.1).
    if (!isPremium) {
      openPaywall();
      return;
    }

    setSaving(true);
    try {
      await profileService.updateProfile(
        buildVisibilityUpdates(initial, draft) as any,
      );
      onSaved?.();
      onClose();
    } catch (error: any) {
      devLog("👁 [visibility] kaydedilemedi", error);
      const result = error?.response?.data?.result;
      if (error?.response?.status === 403 && result?.showPaywall) {
        openPaywall();
        return;
      }
      showInfoToast({ message: t("errors.generic"), variant: "error" });
    } finally {
      setSaving(false);
    }
  }, [saving, dirty, isPremium, draft, initial, onClose, onSaved, openPaywall, t]);

  const footer = (
    <View style={{ paddingHorizontal: 24, paddingTop: 12, paddingBottom: 28 }}>
      <AnimatedPressable
        onPress={handleSave}
        disabled={saving}
        style={{
          borderRadius: 999,
          borderCurve: "continuous",
          overflow: "hidden",
          backgroundColor: colors.inverseSurface,
        }}
      >
        {saving ? (
          <ActivityIndicator
            style={{ paddingVertical: 17.5 }}
            color={colors.onInverseSurface}
          />
        ) : (
          <Text
            style={{
              paddingVertical: 20,
              textAlign: "center",
              fontSize: 15,
              fontWeight: "700",
              color: colors.onInverseSurface,
            }}
          >
            {t(dirty ? "common.save" : "common.done")}
          </Text>
        )}
      </AnimatedPressable>
    </View>
  );

  return (
    <AppBottomSheet
      visible={visible}
      onClose={onClose}
      // TEK DETENT ve kısa: içerik iki satır + iki not, uzayacak bir şey yok.
      // `enableDynamicSizing` bilerek KAPALI (AppBottomSheet varsayılanı) —
      // örtüşme uyarısı belirip kaybolduğunda sheet'in boyu zıplardı.
      snapPoints={["52%"]}
      footer={footer}
      backgroundStyle={{ backgroundColor: colors.bg }}
    >
      <BottomSheetScrollView
        style={{ flex: 1 }}
        contentContainerStyle={{ paddingHorizontal: 24, paddingBottom: 24 }}
        showsVerticalScrollIndicator={false}
      >
        <Text
          style={{
            color: colors.text,
            fontSize: 20,
            fontWeight: "600",
            marginBottom: 9,
          }}
        >
          {t("discover.filters.visibility.title")}
        </Text>
        <View
          style={{
            flexDirection: "row",
            alignItems: "center",
            gap: 8,
            marginBottom: 20,
          }}
        >
          <SFIcon
            name="info.circle"
            fallback={InfoIcon}
            size={16}
            color={colors.textSecondary}
            strokeWidth={2}
            weight="semibold"
          />
          <Text
            style={{
              flex: 1,
              color: colors.textSecondary,
              fontSize: 13,
              lineHeight: 19,
              fontWeight: "500",
            }}
          >
            {t("discover.filters.visibility.description")}
          </Text>
        </View>

        <View style={{ opacity: isPremium ? 1 : 0.4 }}>
          <ListLabel
            label={t("discover.filters.visibility.visibleOnlyLabel")}
            count={draft.visibleOnly.length}
          />
          <SelectRow
            sfIcon="eye.fill"
            lucideIcon={Eye}
            value={summarizeDomains(draft.visibleOnly)}
            placeholder={t("discover.filters.visibility.selectUniversities")}
            disabled={isPremium && universityOptions.length === 0}
            onPress={() => openPicker("visibleOnly")}
            onClear={() => setDraft((d) => ({ ...d, visibleOnly: [] }))}
          />

          <ListLabel
            label={t("discover.filters.visibility.hiddenFromLabel")}
            count={draft.hiddenFrom.length}
            marginTop={18}
          />
          <SelectRow
            sfIcon="eye.slash.fill"
            lucideIcon={EyeOff}
            value={summarizeDomains(draft.hiddenFrom)}
            placeholder={t("discover.filters.visibility.selectUniversities")}
            disabled={isPremium && universityOptions.length === 0}
            onPress={() => openPicker("hiddenFrom")}
            onClear={() => setDraft((d) => ({ ...d, hiddenFrom: [] }))}
          />

          {overlap ? (
            <Text
              style={{
                color: colors.textSecondary,
                fontSize: 13,
                fontWeight: "500",
                marginTop: 10,
              }}
            >
              {t("discover.filters.visibility.overlapWarning")}
            </Text>
          ) : null}

          {/* Backend kuralları premium bitince BİLİNÇLİ olarak devre dışı
              bırakıyor: engellenen üniversite kullanıcıyı tekrar görmeye başlar.
              Gizlilik beklentisi yaratan bir ayar, sessiz kalmıyoruz. Yalnız
              kural kurulmuşken gösteriliyor — boş listede uyarının konusu yok. */}
          {draft.visibleOnly.length > 0 || draft.hiddenFrom.length > 0 ? (
            <Text
              style={{
                color: colors.textMuted,
                fontSize: 13,
                fontWeight: "500",
                marginTop: 10,
              }}
            >
              {t("discover.filters.visibility.premiumExpiryNote")}
            </Text>
          ) : null}
        </View>
      </BottomSheetScrollView>

      <UniversityPickerModal
        visible={pickerVisible}
        onClose={() => setPickerVisible(false)}
        title={
          picker === "hiddenFrom"
            ? t("discover.universityPicker.hiddenFromTitle")
            : t("discover.universityPicker.visibleOnlyTitle")
        }
        items={universityOptions}
        initialSelectedValues={
          picker === "hiddenFrom" ? draft.hiddenFrom : draft.visibleOnly
        }
        maxLimit={MAX_UNIVERSITY_DOMAINS}
        limitMsg={t("discover.universityPicker.limitMsg", {
          // `count` DEĞİL: i18next'te count çoğul çözümlemesini tetikler.
          max: MAX_UNIVERSITY_DOMAINS,
        })}
        onConfirm={(domains: string[]) => {
          setPickerVisible(false);
          const key = picker === "hiddenFrom" ? "hiddenFrom" : "visibleOnly";
          setDraft((d) => ({ ...d, [key]: toDomainList(domains) }));
        }}
      />
    </AppBottomSheet>
  );
}

/** FilterModal'daki `VisibilityListLabel`in aynısı — etiket + n/3 sayacı. */
function ListLabel({
  label,
  count,
  marginTop = 0,
}: {
  label: string;
  count: number;
  marginTop?: number;
}) {
  return (
    <View
      style={{
        flexDirection: "row",
        alignItems: "center",
        justifyContent: "space-between",
        gap: 12,
        marginTop,
        marginBottom: 8,
      }}
    >
      <Text style={{ color: colors.textSecondary, fontSize: 14, fontWeight: "500" }}>
        {label}
      </Text>
      {count > 0 ? (
        <Text
          style={{
            color:
              count >= MAX_UNIVERSITY_DOMAINS ? colors.text : colors.textMuted,
            fontSize: 13,
            fontWeight: "500",
            fontVariant: ["tabular-nums"],
          }}
        >
          {count}/{MAX_UNIVERSITY_DOMAINS}
        </Text>
      ) : null}
    </View>
  );
}

/** FilterModal'daki `SelectRow`un aynısı — pill satır, X listeyi temizler. */
function SelectRow({
  sfIcon,
  lucideIcon,
  value,
  placeholder,
  onPress,
  onClear,
  disabled,
}: any) {
  return (
    <TouchableOpacity
      activeOpacity={0.7}
      onPress={onPress}
      disabled={disabled}
      style={{
        borderRadius: 999,
        borderCurve: "continuous",
        overflow: "hidden",
        borderWidth: 0.5,
        borderColor: colors.hairline,
        paddingHorizontal: 16,
        paddingVertical: 18,
        flexDirection: "row",
        alignItems: "center",
        justifyContent: "space-between",
        opacity: disabled ? 0.6 : 1,
      }}
    >
      <View style={{ flexDirection: "row", alignItems: "center", gap: 8, flex: 1 }}>
        <SFIcon
          name={sfIcon}
          fallback={lucideIcon}
          size={18}
          color={colors.textSecondary}
          strokeWidth={1.5}
        />
        <Text
          numberOfLines={1}
          style={{
            color: value ? colors.text : colors.textSecondary,
            fontSize: 15,
            fontWeight: "500",
            flex: 1,
          }}
        >
          {value || placeholder}
        </Text>
      </View>
      {value ? (
        <TouchableOpacity onPress={onClear} hitSlop={12} activeOpacity={0.7}>
          <SFIcon
            name="xmark"
            fallback={XIcon}
            size={18}
            color={colors.textSecondary}
            strokeWidth={2}
            weight="semibold"
          />
        </TouchableOpacity>
      ) : (
        <SFIcon
          name="chevron.down"
          fallback={ChevronDown}
          size={18}
          color={colors.textSecondary}
          strokeWidth={2}
          weight="semibold"
        />
      )}
    </TouchableOpacity>
  );
}

/**
 * Hero'daki giriş noktası — profil ekranında ismin ve "Düzenle"nin sağ ucunda.
 *
 * Neden ayrı bir buton: bu ayar bir profil ALANI değil, profilin nasıl
 * DAĞITILDIĞI. "Düzenle" formunun içine gömülse orada onlarca alanın arasında
 * kaybolurdu; ayrı bir yüzey ona hak ettiği ağırlığı veriyor.
 *
 * 🔴 BUTON DURUM BİLDİRİYOR, sadece kapı değil. Kural varken:
 *   • halka premium gradyanına dönüyor (nötr camdan ayrışıyor)
 *   • ikon `eye.slash.fill`e geçiyor — bir liste yüzünden birileri seni GÖRMÜYOR
 *   • sayaç rozeti kaç listenin aktif olduğunu söylüyor (1 ya da 2)
 * Böylece kullanıcı sheet'i açmadan "bir kısıtlamam var mı" sorusunu
 * cevaplayabiliyor; gizlilik ayarlarında sessiz kalmak en pahalı seçenek.
 */
export function VisibilityHeroButton({
  visibleOnlyCount,
  hiddenFromCount,
  onPress,
}: {
  visibleOnlyCount: number;
  hiddenFromCount: number;
  onPress: () => void;
}) {
  const activeLists =
    (visibleOnlyCount > 0 ? 1 : 0) + (hiddenFromCount > 0 ? 1 : 0);
  const active = activeLists > 0;
  const SIZE = 54;
  const RING = 1.5;

  return (
    <AnimatedPressable onPress={onPress} pressScale={0.94} hitSlop={8}>
      <View style={{ width: SIZE, height: SIZE }}>
        {/* Halka: kural varken gradyan, yokken saç teli. Dolgu İÇERİDE ayrı bir
            daire — gradyanın yalnız kenarda görünmesi için. */}
        <LinearGradient
          colors={active ? gradients.premium : [colors.hairline, colors.hairline]}
          start={{ x: 0, y: 0 }}
          end={{ x: 1, y: 1 }}
          style={{
            width: SIZE,
            height: SIZE,
            borderRadius: SIZE / 2,
            padding: active ? RING + 0.5 : RING,
          }}
        >
          <BlurView
            tint={plainBlurTint()}
            intensity={100}
            style={{
              flex: 1,
              borderRadius: SIZE / 2,
              overflow: "hidden",
              alignItems: "center",
              justifyContent: "center",
              backgroundColor: colors.surfaceTranslucent,
            }}
          >
            <SFIcon
              name={hiddenFromCount > 0 ? "eye.slash.fill" : "eye.fill"}
              fallback={hiddenFromCount > 0 ? EyeOff : Eye}
              size={22}
              color={colors.text}
              strokeWidth={1.75}
              weight="semibold"
            />
          </BlurView>
        </LinearGradient>

        {/* Sayaç rozeti — yalnız kural varken. İki listeden kaçının dolu
            olduğunu söylüyor, domain sayısını DEĞİL: sheet'teki n/3 sayacı
            zaten onu veriyor ve rozette iki farklı sayı kafa karıştırır. */}
        {active && (
          <View
            style={{
              position: "absolute",
              right: -2,
              top: -2,
              minWidth: 20,
              height: 20,
              borderRadius: 999,
              paddingHorizontal: 5,
              alignItems: "center",
              justifyContent: "center",
              backgroundColor: colors.litPlus,
              borderWidth: 2,
              borderColor: colors.bg,
            }}
          >
            <Text
              style={{
                color: colors.onMedia,
                fontSize: 11,
                fontWeight: "700",
                fontVariant: ["tabular-nums"],
              }}
            >
              {activeLists}
            </Text>
          </View>
        )}
      </View>
    </AnimatedPressable>
  );
}
