import { useCallback, useState } from "react";
import { Text, TouchableOpacity, View } from "react-native";
import { useTranslation } from "react-i18next";
import AppModal, {
  SHEET_PICKER_SNAP_POINTS,
} from "@/shared/components/AppModal";
import AnimatedPressable from "@/shared/components/AnimatedPressable";
import SFIcon from "@/shared/components/SFIcon";
import { Check, Info, Lock } from "@/shared/icons";
import { colors, ink } from "@/shared/theme/colors";
// Çipin seçilmemiş hâli AKIŞ KARTINDAKİ hashtag kapsülünün ta kendisi —
// ölçüler oradan geliyor, burada yeniden yazılmıyor (gerekçe: Chip).
import {
  TOPIC_FILL_ALPHA,
  TOPIC_TEXT,
  topicPillInk,
} from "./feedTopicPill";
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
  /** Seçili konular — ÇOKLU, boş dizi = "tüm konular". */
  topics: string[];
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
  /** Anahtar → hashtag etiket ("#ders grubu"); biçim ekranın kararı. */
  topicLabelFor: (key: string) => string;
  /** "Tüm konular" çipinin etiketi — HASHTAG DEĞİL, bir konu değil çünkü. */
  topicAllLabel: string;
}

const SORTS: FeedSort[] = ["new", "popular", "top"];
const INTERESTS: FeedInterest[] = ["all", "mine"];
const KINDS: FeedKind[] = ["all", "anonymous", "normal"];

const DEFAULTS: FeedFilterValue = {
  sort: "new",
  interest: "all",
  kind: "all",
  topics: [],
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
        <TopicChips
          keys={topicKeys}
          selected={draft.topics}
          labelFor={topicLabelFor}
          allLabel={topicAllLabel}
          onToggle={(key) =>
            setDraft((d) => ({
              ...d,
              topics: d.topics.includes(key)
                ? d.topics.filter((k) => k !== key)
                : [...d.topics, key],
            }))
          }
          onClear={() => setDraft((d) => ({ ...d, topics: [] }))}
        />
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
 * BİR BÖLÜMÜN İÇERİĞİYLE SONRAKİ BAŞLIK ARASINDAKİ BOŞLUK.
 *
 * ⚠️ "İçeriğin altındaki boşluk" diye ayrı bir sayı YOK: `children` bölümün
 * kabının İÇİNDE duruyor ve kabın alt payı yok — o boşluğu SONRAKİ bölümün
 * `marginTop`u veriyor. Ayarlanacak sayı burası.
 *
 * 20 → 40 → 48 → 60, üç istek üst üste: önce "boşluklar profil düzenleme
 * modalındaki gibi olsun" (orada bölüm sarmalayıcısı 28 + başlık bloğu 12 =
 * 40), sonra "içeriklerin altına biraz daha boşluk ver", sonra "daha da artır".
 *
 * ⚠️ 20, GRUP KUTUSU KALKINCA 28'DEN DÜŞÜRÜLMÜŞTÜ: kutu iki bölümün arasına
 * kendi kenarlığını koyuyordu ve 28 o çizgiyle birlikte ölçülmüştü. Çizgi
 * gidince boşluğun tek başına ayırması gerekti — düşürmek değil, ARTIRMAK
 * gerekiyormuş; bu üç tur onu düzeltiyor.
 *
 * ⚠️ BU SAYI PROFİL DÜZENLEME RİTMİNDEN ARTIK KASITLI OLARAK AYRI (20px): o
 * eşitlik bir istekti ve sonraki iki istek onun üstüne geldi. Geri
 * eşitlenecekse EditProfileForm'un 13 bölümü de birlikte değişmeli; yalnız
 * burayı 40'a döndürmek üç turluk kararı sessizce siler.
 *
 * ⚠️ İLK BÖLÜM MUAF (`first` → 4): içerik kabı header'a zaten
 * MODAL_HEADER_HEIGHT ayırıyor, üstüne bölüm payı binince ilk başlık
 * butonlardan ~114 aşağıda kalıyor ve sheet boş açılmış gibi duruyordu.
 */
const SECTION_GAP = 60;

/**
 * Bölüm başlığı — PROFİL DÜZENLEME ekranındaki bölüm başlığının birebir kalıbı
 * (bkz. EditProfileForm: başlık 20/600 `text`, altında açıklama + nefes).
 * Eskiden 13/600 `textSecondary` küçük bir etiketti.
 *
 * GÖVDE KUTUSUZ — hepsi için. Bir ara seçenek listeleri `sectionGroupStyle()`
 * gri kutusuna giriyordu (çip akışı `bare` ile muaftı); 2026-10-27'de kutu
 * tümden kalktı ve `bare` propuyla birlikte gitti.
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
   * İlk bölüm — bölümler arası pay BURADA UYGULANMIYOR.
   *
   * İçerik kabı header'a zaten MODAL_HEADER_HEIGHT (74) ayırıyor; üstüne bölüm
   * payı binince ilk başlık header butonlarından ~114 aşağıda kalıyor ve sheet
   * boş açılmış gibi duruyordu. Bölümler arasındaki ritim bozulmadan yalnız
   * tepedeki fazlalık alınıyor — ama SIFIR da değil: başlık bulanık header'ın
   * alt kenarına yapışmasın.
   */
  first?: boolean;
  children: React.ReactNode;
}) {
  return (
    // ⚠️ İÇERİĞİN ALTINDAKİ BOŞLUK BURADA: bir bölümün içeriğiyle SONRAKİ
    // başlık arasındaki nefesi, sonraki bölümün `marginTop`u veriyor
    // (`children` bu kabın İÇİNDE — aşağıya bak). Tarihçe ve gerekçe
    // `SECTION_GAP`te.
    <View style={{ marginTop: first ? 4 : SECTION_GAP }}>
      {/* Başlık bloğu profil düzenlemedeki kalıbın aynısı: başlığın altında 6,
          açıklamanın altında 12 + blokun kendi 10'u = 22.

          ⚠️ BLOĞUN `marginBottom`U GERİ GELDİ (istek: boşluklar profil
          düzenleme modalındaki gibi olsun). Bir dönem YOKTU ve gerekçesi
          "açıklamanın 12'si zaten o işi yapıyor, ikisi üst üste binince gövde
          başlıktan 22 aşağıda kalıyor"du — ama EditProfileForm'un sayısı tam
          olarak O 22 (başlık bloğu `marginBottom: 10` + açıklama `mb-3`).
          Yani eski not 22'yi fazlalık sanıyordu; hedef ritmin kendisiymiş. */}
      <View style={{ marginBottom: 10 }}>
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
            uzun cümle glifin altına taşmak yerine sarsın diye.

            ⚠️ GLİF METNİN TAMAMINA GÖRE ORTADA (istek), İLK SATIRA GÖRE DEĞİL.
            Önceki yazım `alignItems: "flex-start"` + `marginTop: (20 - 18) / 2`
            ile glifi ilk satırın ortasına oturtuyordu; cümle iki satıra sarınca
            ikon bloğun tepesinde asılı kalıyor ve satırla hizasız okunuyordu.
            Keşif filtresindeki ikizi (FilterModal > FilterSection) zaten
            `center` — iki filtre yüzeyi artık aynı dili konuşuyor. */}
        <View
          style={{
            flexDirection: "row",
            alignItems: "center",
            gap: 8,
            marginBottom: 12,
            paddingRight: 16,
          }}
        >
          {/* ⚠️ `marginTop` NUDGE'I YOK: kap ortalıyor, üstüne eklenen her px
              glifi merkezden kaydırır. */}
          <SFIcon
            name="info.circle"
            fallback={Info}
            size={18}
            color={colors.textSecondary}
            strokeWidth={2}
            weight="semibold"
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
      {/* ⚠️ GRUP KUTUSU KALDIRILDI (istek, 2026-10-27) — seçenekler artık
          doğrudan sheet zemininin üstünde. Buraya `sectionGroupStyle()`'ı geri
          getirmeden önce: kutu Ayarlar'ın liste dili ve bu sheet ona
          benzetilmişti, ama Ayarlar'da kutunun içinde GİDİLEN satırlar var;
          burada içerik üç kısa radyo/onay listesi ve gri kutu onları sayfadan
          kopuk üç ada gibi gösteriyordu. Keşif filtresi (FilterModal) ve profil
          düzenleme de aynı gerekçeyle kutudan muaf (bkz. sectionGroup.ts) —
          "filtrede seçenek işaretle" dili artık üç ekranda tek.

          Bölüm ayrımını başlık + açıklama taşıyor; satırların yatay payı da
          kalktı (bkz. OptionRow), yani metin başlıkla aynı sol kenara
          hizalanıyor. */}
      {children}
    </View>
  );
}

/**
 * Konu çipleri — ÇOKLU seçim, "tüm konular" dahil.
 *
 * SATIR DEĞİL ÇİP (istek): konu artık bir hashtag ve yedi etiket iki satırda
 * aynı anda görünüyor — tik'li satır listesinde aynı yedi seçenek sheet'in
 * yarısını yiyor, sıralama/paylaşım tipi bölümleri kaydırmadan hiç
 * görünmüyordu.
 *
 * ⚠️ "TÜM KONULAR" BİR ÇİP AMA BİR KONU DEĞİL: seçimi TEMİZLİYOR ve yalnız
 * hiçbir konu seçili değilken dolu çiziliyor. Hashtag biçimi de almıyor — `#`
 * sunucunun kataloğundaki şeylerin işareti. Bu çipin varlığı bilinçli: tek tek
 * dokunarak seçimi boşaltmak (çoklu seçimin tek geri alma yolu) üç seçili
 * konuda üç dokunuş eder, "tümü" bir dokunuşta aynı yere götürüyor.
 *
 * Çip biçimi composer'ınkiyle (FeedComposerSheet > TopicChips) AYNI ölçülerde:
 * aynı kataloğu iki ayrı yazımla göstermek iki ayrı liste gibi okunur.
 */
function TopicChips({
  keys,
  selected,
  labelFor,
  allLabel,
  onToggle,
  onClear,
}: {
  keys: string[];
  selected: string[];
  labelFor: (key: string) => string;
  allLabel: string;
  onToggle: (key: string) => void;
  onClear: () => void;
}) {
  return (
    <View style={{ flexDirection: "row", flexWrap: "wrap", gap: 8 }}>
      <Chip label={allLabel} active={selected.length === 0} onPress={onClear} />
      {keys.map((key) => (
        <Chip
          key={key}
          label={labelFor(key)}
          active={selected.includes(key)}
          onPress={() => onToggle(key)}
        />
      ))}
    </View>
  );
}

/**
 * Tek çip — SEÇİLMEMİŞ hâli AKIŞ KARTINDAKİ hashtag kapsülü, SEÇİLİ hâli ters
 * yüzey (istek: "arkaplanını, text rengini ve size'ını aynı postlardaki gibi
 * yap").
 *
 * ⚠️ İSTEK SEÇİLMEMİŞ HÂLE UYGULANDI, İKİSİNE BİRDEN DEĞİL: kartın kapsülünün
 * durumu yok, çipin var. Seçili dal da `ink(0.08)` olsaydı seçim görünmez
 * olurdu — kullanıcının hangi konuları süzdüğünü okumasının tek yolu bu.
 * Ayrım hâlâ güçlü: ikisi de DOLGULU, biri silik gri biri ters yüzey.
 *
 * ⚠️ KENARLIK SİLİNDİ (iki dalda da). Kartın kapsülünde yok ve orada bir
 * dönem denenip kaldırılmıştı: yazıyla aynı tondaki bir çizgi 15pt'lik
 * etiketin etrafında yazıdan daha baskın okunuyor, kapsül etiketi taşımak
 * yerine ona rakip oluyordu. Dolgu aynı işi gürültüsüz yapıyor.
 * ⚠️ Kenarlığın ESKİ İŞİ (sabit kalınlıkla satır sarmasını kilitlemek) de
 * düştü: artık iki dalda da kenarlık YOK, yani seçim çipin ölçüsünü hiç
 * değiştirmiyor — komşu çipleri kaydıran yarış yapısal olarak kapandı.
 *
 * ⚠️ PAY VE YARIÇAP KARTTAN KOPYALANMADI (14/8 ve 999 duruyor): kartta kapsül
 * satır içi bir etiket, burada DOKUNMA HEDEFİ. Kartın 4/1.5'i buraya
 * konulsaydı çip ~24pt'ye inip basılamaz hâle gelirdi.
 */
function Chip({
  label,
  active,
  onPress,
}: {
  label: string;
  active: boolean;
  onPress: () => void;
}) {
  return (
    // ⚠️ DOKUNMA GERİ BİLDİRİMİ SÖNME DEĞİL ÖLÇEK (istek: "basınca hover
    // olmasın, scale olsun ufak"). `AnimatedPressable`in varsayılanı tam bu:
    // `activeOpacity: 1` (TouchableOpacity'nin 0.7'lik soluklaşması YOK) +
    // basılıyken 0.97 ölçek. Composer'daki ikiziyle (FeedComposerSheet >
    // TopicChips) AYNI bileşen — aynı çipin iki yüzeyde iki farklı basılma
    // hissi olmasın. Sayılar elle verilmiyor: varsayılan tek kaynak.
    <AnimatedPressable
      onPress={onPress}
      style={{
        // ⚠️ KUTU KARTTAN KOPYALANMADI (bir tur denendi, geri alındı — istek):
        // kartta kapsül satır içi bir etiket, burada DOKUNMA HEDEFİ. Kartın
        // 4/1.5'i buraya konulunca çip ~24pt'ye iniyor.
        paddingHorizontal: 14,
        paddingVertical: 8,
        borderRadius: 999,
        borderCurve: "continuous",
        backgroundColor: active
          ? colors.inverseSurface
          : ink(TOPIC_FILL_ALPHA),
      }}
    >
      <Text
        style={{
          ...TOPIC_TEXT,
          color: active ? colors.onInverseSurface : topicPillInk(),
        }}
      >
        {label}
      </Text>
    </AnimatedPressable>
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
      // ⚠️ YATAY PAY YOK. Eskiden grup kutusunun iç payı (20) buradaydı; kutu
      // kalkınca o pay satırları başlığın sol kenarından içeri kaydıran
      // sahipsiz bir girinti oluyordu. Yan nefesi artık modal'ın içerik kabı
      // veriyor — keşif filtresindeki CheckRow'un aynısı.
      style={{
        flexDirection: "row",
        alignItems: "center",
        justifyContent: "space-between",
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
