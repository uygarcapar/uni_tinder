import { useCallback, useState } from "react";
import { Text, TouchableOpacity, View } from "react-native";
import { useTranslation } from "react-i18next";
import AppModal, {
  SHEET_PICKER_SNAP_POINTS,
} from "@/shared/components/AppModal";
import SFIcon from "@/shared/components/SFIcon";
import { Check, Info, Lock } from "@/shared/icons";
import { colors } from "@/shared/theme/colors";
import {
  sectionGroupStyle,
  SECTION_GROUP_PAD_H,
} from "@/shared/theme/sectionGroup";
import type {
  FeedInterest,
  FeedKind,
  FeedSort,
  FeedTopicFilter,
} from "../feedTypes";

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
  topic: FeedTopicFilter;
}

export interface FeedFilterSheetProps {
  visible: boolean;
  onClose: () => void;
  value: FeedFilterValue;
  onApply: (next: FeedFilterValue) => void;
  /** `kindFilterGate(me)` sonucu — "unknown" iken kilit ÇİZİLMEZ. */
  kindGate: "unknown" | "allowed" | "paywall";
  onKindPaywall: () => void;
  /**
   * Konu kataloğu — `/api/feed/me`den çözülmüş anahtarlar + etiketleri
   * (bkz. feedTopics). Sunucu yeni bir konu eklediğinde uygulama sürümü
   * çıkmadan filtrede görünmesi için liste İÇERİDE SABİT YAZILMIYOR.
   */
  topicKeys: string[];
  topicLabelFor: (key: string) => string;
  /** "Tüm konular" satırının etiketi. */
  topicAllLabel: string;
}

const SORTS: FeedSort[] = ["new", "popular", "top"];
const INTERESTS: FeedInterest[] = ["all", "mine"];
const KINDS: FeedKind[] = ["all", "anonymous", "normal"];

const DEFAULTS: FeedFilterValue = {
  sort: "new",
  interest: "all",
  kind: "all",
  topic: "all",
};

export default function FeedFilterSheet({
  visible,
  onClose,
  value,
  onApply,
  kindGate,
  onKindPaywall,
  topicKeys,
  topicLabelFor,
  topicAllLabel,
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
      // `dynamicSizing` DEĞİL ve TEK BAŞINA `fullScreen` DE DEĞİL. Üç bölüm
      // başlık+açıklama+satırlarla uzadıktan sonra içerikten ölçülen sheet
      // neredeyse tepeye dayanıyor, yani her açılışta tam ekran gibi
      // davranıyordu. Detentler ortak sabitten: alt durak 75%, ÜST DURAK
      // FilterModal'ın tepesiyle AYNI — `fullScreen` burada "tam ekran" değil
      // "tepe, status bar/dynamic island'ın ALTI" demek (topInset = safe area),
      // yani başlık çentiğe girmiyor. Şehir seçicinin kurulumunun aynısı
      // (bkz. CityPickerModal > SHEET_PICKER_SNAP_POINTS).
      snapPoints={SHEET_PICKER_SNAP_POINTS}
      fullScreen
      // Bitti/Sıfırla YAZISI yerine glif — FilterModal ile birebir aynı dil.
      actionIcon="checkmark"
      actionIconLabel={t("common.done")}
      onAction={apply}
      leftIcon="arrow.counterclockwise"
      leftIconLabel={t("feed.filter.reset")}
      onLeftPress={reset}
      // Header'ın iki butonu da profil düzenleme modalındaki kabukla AYNI:
      // uygulamanın yuvarlak BERRAK cam ikon ölçüsü (GLASS_ICON_CLEAR_SIZE) ve
      // dolgulu `.regular` cam yerine berrak cam glif — yani ProfileScreen
      // başlığındaki çan/ayarlar butonunun aynısı (bkz. AppModal >
      // clearGlassHeader). Opt-in bir knob; bu sheet çevrilmemişti, o yüzden
      // butonları komşularından bir tık küçük ve dolgulu duruyordu.
      clearGlassHeader
      // ⚠️ `paddingTop` VERİLMİYOR ve bu kasıtlı: `contentContainerStyle`
      // AppModal'ın varsayılanının ÜSTÜNE yazılıyor, yani buradaki bir sayı
      // içeriğin header'a bırakılan payını (MODAL_HEADER_HEIGHT = 74) EZİYOR.
      // Eskiden 8 yazıyordu ve ilk bölümün başlığı bulanık header'ın altında
      // kalıyordu. Üst nefes artık bölümlerin kendi `marginTop`undan geliyor.
      contentContainerStyle={{ paddingBottom: 28 }}
    >
      {/* KONU EN ÜSTTE: akışın birincil ayrımı artık konu (sıralama ikincil
          bir tercih). Premium KAPISI YOK — konu ürünün kendisi, upsell değil. */}
      <Section
        title={t("feed.filter.topic")}
        description={t("feed.filter.topicDesc")}
        first
      >
        {/* "Tümü" + katalog. Tek seçim: çoklu seçim satır bileşeni bu
            sheet'te yok ve sunucu da tek konu filtreliyor. */}
        <OptionRow
          label={topicAllLabel}
          selected={draft.topic === "all"}
          onPress={() => setDraft((d) => ({ ...d, topic: "all" }))}
        />
        {topicKeys.map((key) => (
          <OptionRow
            key={key}
            label={topicLabelFor(key)}
            selected={draft.topic === key}
            onPress={() =>
              setDraft((d) => ({ ...d, topic: key as FeedTopicFilter }))
            }
          />
        ))}
      </Section>

      <Section
        title={t("feed.filter.sort")}
        description={t("feed.filter.sortDesc")}
      >
        {SORTS.map((key) => (
          <OptionRow
            key={key}
            label={t(`feed.sort.${key}`)}
            selected={draft.sort === key}
            onPress={() => setDraft((d) => ({ ...d, sort: key }))}
          />
        ))}
      </Section>

      <Section
        title={t("feed.filter.interest")}
        description={t("feed.filter.interestDesc")}
      >
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
        description={t("feed.filter.kindDesc")}
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

/**
 * Bölüm başlığı — PROFİL DÜZENLEME ekranındaki bölüm başlığının birebir kalıbı
 * (bkz. EditProfileForm: `marginTop: 28`, başlık 20/600 `text`, altında 16
 * nefes). Eskiden 13/600 `textSecondary` küçük bir etiketti ve seçenekleri
 * dolgulu bir kutuya alıyordu — iki ekran aynı soruyu iki ayrı dille soruyordu.
 */
function Section({
  title,
  description,
  locked,
  first,
  children,
}: {
  title: string;
  /** Başlığın altındaki tek cümle — profil düzenlemedeki `*Desc` satırları. */
  description: string;
  locked?: boolean;
  /**
   * İlk bölüm — bölümler arası 28'lik pay BURADA UYGULANMIYOR.
   *
   * İçerik kabı header'a zaten MODAL_HEADER_HEIGHT (74) ayırıyor; üstüne 28 + 12
   * binince ilk başlık header butonlarından ~114 aşağıda kalıyor ve sheet boş
   * açılmış gibi duruyordu. Bölümler arasındaki ritim bozulmadan yalnız tepedeki
   * fazlalık alınıyor.
   */
  first?: boolean;
  children: React.ReactNode;
}) {
  return (
    <View style={{ marginTop: first ? 0 : 28 }}>
      {/* Başlık bloğu profil düzenlemedeki kalıbın aynısı: dikey yığın, üst pay
          12, başlığın altında 6, açıklamanın altında 12 (orada `mb-3`). */}
      <View style={{ marginTop: 12, marginBottom: 10 }}>
        <View
          style={{
            flexDirection: "row",
            alignItems: "center",
            gap: 6,
            marginBottom: 6,
          }}
        >
          <Text style={{ color: colors.text, fontSize: 20, fontWeight: "600" }}>
            {title}
          </Text>
          {locked ? (
            // Glif başlıkla birlikte büyüdü: 20 puntonun yanında 12'lik kilit
            // kayboluyordu.
            <SFIcon
              name="lock.fill"
              fallback={Lock}
              size={16}
              color={colors.textMuted}
              strokeWidth={2}
            />
          ) : null}
        </View>
        {/* Açıklama satırı — profil düzenlemedeki `info.circle` + 14/400
            `textSecondary` ikilisinin birebir aynısı. `flex: 1` + `paddingRight`
            uzun cümle glifin altına taşmak yerine sarsın diye. */}
        <View
          style={{
            flexDirection: "row",
            alignItems: "flex-start",
            gap: 8,
            marginBottom: 12,
            paddingRight: 16,
          }}
        >
          <SFIcon
            name="info.circle"
            fallback={Info}
            size={18}
            color={colors.textSecondary}
            strokeWidth={2}
            weight="semibold"
            // Glif ilk satırın ortasına otursun: (satır boyu - glif) / 2.
            style={{ marginTop: (20 - 18) / 2 }}
          />
          <Text
            style={{
              color: colors.textSecondary,
              fontSize: 14,
              lineHeight: 20,
              fontWeight: "400",
              flex: 1,
            }}
          >
            {description}
          </Text>
        </View>
      </View>
      {/* Seçenekler GRUP KUTUSUNDA — Ayarlar'daki liste kutusunun aynısı
          (bkz. sectionGroupStyle). Eskiden satırlar doğrudan sayfa zemini
          üstünde duruyordu ve yan payını modal'ın içerik kabından alıyordu;
          Ayarlar'ın listeleri kutuya girdikten sonra aynı soruyu soran iki
          sheet iki ayrı dille soruyor oldu.

          Satırların yatay payı KUTUDA DEĞİL satırın kendisinde (bkz.
          OptionRow) — Ayarlar'daki kuralın aynısı: dokunulabilir alan ve
          ileride gelebilecek bir basılı zemin kutunun kenarından kenarına
          uzasın, metin yine kenarlıktan içeri çekilsin. */}
      <View style={sectionGroupStyle()}>{children}</View>
    </View>
  );
}

/**
 * Seçenek satırı — `EditProfileForm > OptionListItem`in `checkbox` varyantının
 * birebir kalıbı: dikey pay 18, metin 16/22/500, seçili olmayan satır
 * `textSecondary`, sağda sabit yuvarlak kare kutu.
 *
 * ⚠️ İŞARET YUVASI HER ZAMAN ÇİZİLİYOR (koşullu olan yalnız içindeki tik):
 * yoksa seçim anında metin alanı genişleyip satır yana kayıyor.
 *
 * Kutu biçimi (çıplak tik değil) keşif filtresindeki aynı listeyle ortak
 * (bkz. FilterModal > CheckRow) — uygulamada "filtrede seçenek işaretle" dili
 * tek.
 */
const CHECKBOX_SIZE = 22;

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
    <TouchableOpacity
      activeOpacity={1}
      onPress={onPress}
      style={{
        flexDirection: "row",
        alignItems: "center",
        justifyContent: "space-between",
        // Grup kutusunun iç payı (bkz. SECTION_GROUP_PAD_H): metin kutunun
        // kenarlığına yapışmasın. Kutuda değil burada — gerekçe Section'da.
        paddingHorizontal: SECTION_GROUP_PAD_H,
      }}
    >
      {/* flex:1 + paddingRight — uzun etiket tik kutusunun altına taşmak
          yerine sarsın. */}
      <View
        style={{
          flex: 1,
          flexDirection: "row",
          alignItems: "center",
          paddingVertical: 18,
          paddingRight: 12,
        }}
      >
        <Text
          style={{
            color: selected ? colors.text : colors.textSecondary,
            fontSize: 16,
            lineHeight: 22,
            fontWeight: "500",
            flex: 1,
          }}
        >
          {label}
        </Text>
      </View>
      <View
        style={{
          width: CHECKBOX_SIZE,
          height: CHECKBOX_SIZE,
          borderRadius: 7,
          borderCurve: "continuous",
          borderWidth: selected ? 0 : 1.5,
          borderColor: colors.hairlineStrong,
          backgroundColor: selected ? colors.inverseSurface : "transparent",
          alignItems: "center",
          justifyContent: "center",
        }}
      >
        {selected && (
          <SFIcon
            name="checkmark"
            fallback={Check}
            size={14}
            color={colors.onInverseSurface}
            strokeWidth={3}
            weight="bold"
          />
        )}
      </View>
    </TouchableOpacity>
  );
}
