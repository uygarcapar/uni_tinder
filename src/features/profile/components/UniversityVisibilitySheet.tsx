import { useCallback, useEffect, useMemo, useState } from "react";
import { ActivityIndicator, Text, TouchableOpacity, View } from "react-native";
import { useTranslation } from "react-i18next";
import { BottomSheetScrollView } from "@gorhom/bottom-sheet";
import { ChevronDown, Eye, EyeOff, Info as InfoIcon, X as XIcon } from "@/shared/icons";
import AppBottomSheet from "@/shared/components/AppBottomSheet";
import AnimatedPressable from "@/shared/components/AnimatedPressable";
import SFIcon from "@/shared/components/SFIcon";
import UniversityPickerModal from "@/features/discover/components/UniversityPickerModal";
import { useUniversities, resolveLocalized } from "@/shared/queries/commonQueries";
import {
  buildVisibilityUpdates,
  isDirty as isVisibilityDirty,
  maxDomainsFor,
  resolveVisibilityDraft,
  toDomainList,
  type VisibilityMode,
} from "@/features/profile/universityVisibility";
import { grantDaysRemaining } from "@/features/profile/referralView";

/** Satırı olan iki mod; "everyone" satır değil, iki satırın da boş hâli. */
type ListMode = Exclude<VisibilityMode, "everyone">;
import { colors } from "@/shared/theme/colors";
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
 * temizleme TEK BOŞ STRING ile gidiyor (`CLEAR_SENTINEL`).
 *
 * 🔴 TEK MOD (2026-09-10, backend `f61d4c0`): iki liste birbirini dışlıyor,
 * ikisi birden dolu gelirse backend 400 dönüyor. Ekran yine de ESKİ İKİ SATIRLI
 * görünümde (ürün kararı): "sadece şunlar görsün" ve "şunlar görmesin" ayrı
 * satırlar, ama birinde seçim yapınca diğeri kendiliğinden boşalıyor. İkisi de
 * boşsa herkes görebiliyor — ayrı bir "herkes" şıkkı yok. Taslak içeride tek
 * mod olarak tutuluyor (bkz. universityVisibility.ts); satırlar o modun iki
 * görünümü. Kaydetmede karşı mod açıkça temizleniyor (buildVisibilityUpdates).
 *
 * Örtüşme uyarısı bu yüzden yok: aynı domain'in iki listede olması artık
 * mümkün değil.
 */


export default function UniversityVisibilitySheet({
  visible,
  onClose,
  profile,
  canUse,
  grantExpiresAt,
  onSaved,
}: {
  visible: boolean;
  onClose: () => void;
  profile: any;
  /**
   * 🔴 `isPremium` DEĞİL. Görünürlük filtresi 2026-09-10'dan beri premium'a
   * ÖZEL değil: 3 davetle kazanılan 30 günlük bir hak da açıyor (davet programı
   * planı §1.5). Kaynak `GET /api/profile/me`nin `canUseUniversityVisibility`
   * alanı — kapıyı premium'a bağlamak, hakkı olan kullanıcıyı kendi ayarından
   * kilitler ve üstelik kaydetmeyi denerse backend 200 dönerdi (sunucu tarafı
   * zaten hakkı tanıyor), yani kilit sadece istemcide bir yalan olurdu.
   */
  canUse: boolean;
  /**
   * Davet ödülünün bitişi (`universityVisibilityGrantExpiresAt`). Doluysa
   * üstte kalan gün şeridi çiziliyor. Premium aktifken hak DONDURULUYOR ve
   * backend bu alanı `null` gönderiyor — o hâlde premium notları geçerli.
   */
  grantExpiresAt?: string | null;
  onSaved?: () => void;
}) {
  const { t } = useTranslation();
  const universitiesQuery = useUniversities();
  const universityOptions = useMemo(
    () => universitiesQuery.data ?? [],
    [universitiesQuery.data],
  );

  // Sunucudaki hâl — "değişti mi" kararının tabanı. Değişiklik yoksa hiçbir alan
  // gönderilmiyor: dokunulmamış bir listeyi yeniden yazmaya çalışmak premium'u
  // biten kullanıcıda gereksiz 403 riski üretir.
  //
  // İki listeden TEK MODA burada iniliyor; ikisi birden dolu gelen (XOR
  // kuralından eski) profillerde Allow kazanıyor — backend migration'ıyla aynı
  // yön.
  const initial = useMemo(
    () => resolveVisibilityDraft(profile),
    [profile?.visibleOnlyToUniversityDomains, profile?.hiddenFromUniversityDomains],
  );

  const [draft, setDraft] = useState(initial);
  const [saving, setSaving] = useState(false);
  const [pickerVisible, setPickerVisible] = useState(false);
  // Seçici hangi satır için açıldı. Taslak tek modlu; satırlar onun görünümü.
  const [picker, setPicker] = useState<ListMode>("allow");

  const allowDomains = draft.mode === "allow" ? draft.domains : [];
  const blockDomains = draft.mode === "block" ? draft.domains : [];

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

  const dirty = isVisibilityDirty(initial, draft);

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

  /**
   * Kilitli hâlin İKİNCİ kapısı: para değil davet.
   *
   * Paywall'ın yanında duruyor çünkü artık iki farklı yol var ve yalnız birini
   * göstermek, ödemek istemeyen kullanıcıya "bu ayar sana kapalı" demek olurdu.
   * Sheet ÖNCE kapanıyor (paywall ile aynı gerekçe: kart başka bir sekmede ve
   * portal'a çizilen sheet onun önünde kalırdı).
   */
  const openReferral = useCallback(() => {
    onClose();
    uiBus.emit("openReferral");
  }, [onClose]);

  // Davet ödülünün kalan günü. `null` = hak yok ya da premium yüzünden
  // dondurulmuş (backend o hâlde `expiresAt`i null gönderiyor).
  const grantDays = grantDaysRemaining(grantExpiresAt);

  const openPicker = (target: ListMode) => {
    if (!canUse) {
      openPaywall();
      return;
    }
    setPicker(target);
    setPickerVisible(true);
  };

  /** Satırdaki X: o liste seçili modsa taslak "herkes"e döner. */
  const clearList = (target: ListMode) => {
    if (draft.mode === target) setDraft({ mode: "everyone", domains: [] });
  };

  /**
   * Seçici onayı. Dolu liste → o satır mod olur, KARŞI SATIR KENDİLİĞİNDEN
   * BOŞALIR (tek mod). Boş onay → yalnız o satır seçiliyse temizlenir; öbür
   * satıra dokunulmaz.
   */
  const confirmPicker = (domains: string[]) => {
    setPickerVisible(false);
    const list = toDomainList(domains, picker);
    if (list.length === 0) {
      clearList(picker);
      return;
    }
    setDraft({ mode: picker, domains: list });
  };

  const handleSave = useCallback(async () => {
    if (saving) return;
    if (!dirty) {
      onClose();
      return;
    }
    // 🔴 Hakkı OLMAYAN kullanıcıda bu alanlar payload'a HİÇ girmemeli: girerse
    // isteğin TAMAMI 403'e düşer ve kullanıcı bio'sunu bile kaydedemez
    // (sözleşme §2.1).
    if (!canUse) {
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
      const status = error?.response?.status;
      const result = error?.response?.data?.result;
      if (status === 403 && result?.showPaywall) {
        openPaywall();
        return;
      }
      // 400 = doğrulama. Bu ekranda iki sebebi var ve ikisinde de sunucunun
      // mesajı bizim jenerik metnimizden iyi: tavan aşımı ("en fazla N
      // üniversite") ya da XOR ihlali. İkincisi bize bakan bir bug — ekran
      // radio olduğu sürece üretilemez — ama sessiz kalmak yerine görünür olsun.
      const message =
        status === 400 && typeof error?.response?.data?.message === "string"
          ? error.response.data.message
          : t("errors.generic");
      showInfoToast({ message, variant: "error" });
    } finally {
      setSaving(false);
    }
  }, [saving, dirty, canUse, draft, initial, onClose, onSaved, openPaywall, t]);

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
      // TEK DETENT. Davet şeridi/CTA eklendikten sonra 55% içerikte sürekli
      // kaydırma bırakıyordu; bir tık uzattık. İçerik yine taşarsa
      // BottomSheetScrollView kaydırıyor. `enableDynamicSizing` bilerek
      // KAPALI (AppBottomSheet varsayılanı) — not belirip kaybolunca boy zıplamasın.
      snapPoints={["57%"]}
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

        {/* Davet ödülü şeridi — hak SÜRELİ, süresi de kullanıcının kendi
            kurduğu kuralın ömrü. Bitince backend kuralları SİLİYOR (plan §1.7),
            yani sessiz kalmak "ayarım duruyor" sanan bir kullanıcı üretirdi. */}
        {grantDays !== null ? (
          <View
            style={{
              borderRadius: 999,
              borderCurve: "continuous",
              alignSelf: "flex-start",
              paddingHorizontal: 14,
              paddingVertical: 8,
              marginBottom: 18,
              backgroundColor: colors.hairlineSoft,
            }}
          >
            <Text style={{ color: colors.text, fontSize: 13, fontWeight: "600" }}>
              {t("discover.filters.visibility.grantNote", { days: grantDays })}
            </Text>
          </View>
        ) : null}

        <View style={{ opacity: canUse ? 1 : 0.4 }}>
          {/* İki satır, tek aktif liste. Birinde seçim yapınca diğeri boşalır
              (confirmPicker) — backend aynı anda ikisini kabul etmiyor. */}
          <ListLabel
            label={t("discover.filters.visibility.visibleOnlyLabel")}
            count={allowDomains.length}
            max={maxDomainsFor("allow")}
          />
          <SelectRow
            testID="visibility-row-allow"
            sfIcon="eye.fill"
            lucideIcon={Eye}
            value={summarizeDomains(allowDomains)}
            placeholder={t("discover.filters.visibility.selectUniversities")}
            disabled={canUse && universityOptions.length === 0}
            onPress={() => openPicker("allow")}
            onClear={() => clearList("allow")}
          />

          <ListLabel
            label={t("discover.filters.visibility.hiddenFromLabel")}
            count={blockDomains.length}
            max={maxDomainsFor("block")}
            marginTop={18}
          />
          <SelectRow
            testID="visibility-row-block"
            sfIcon="eye.slash.fill"
            lucideIcon={EyeOff}
            value={summarizeDomains(blockDomains)}
            placeholder={t("discover.filters.visibility.selectUniversities")}
            disabled={canUse && universityOptions.length === 0}
            onPress={() => openPicker("block")}
            onClear={() => clearList("block")}
          />

          <Text
            style={{
              color: colors.textMuted,
              fontSize: 13,
              lineHeight: 19,
              fontWeight: "500",
              marginTop: 10,
              textAlign: "center",
            }}
          >
            {t("discover.filters.visibility.exclusiveNote")}
          </Text>

          {/* 🔴 Bu bir nezaket metni değil, gerçek bir etki: kural bir HARD
              FILTER, kullanıcı engellenen okulların destesinden tamamen
              çıkıyor. Daha az gösterim → daha az beğeni → sıralama modelinin
              sinyali zayıflıyor. Ayarın bedelini söylemeden kurdurmak
              dürüst olmazdı. Yalnız bir liste doluyken. */}
          {draft.mode !== "everyone" && draft.domains.length > 0 ? (
            <Text
              style={{
                color: colors.textSecondary,
                fontSize: 13,
                lineHeight: 19,
                fontWeight: "500",
                marginTop: 10,
              }}
            >
              {t("discover.filters.visibility.reachWarning")}
            </Text>
          ) : null}

          {/* Backend kuralları premium bitince BİLİNÇLİ olarak devre dışı
              bırakıyor: engellenen üniversite kullanıcıyı tekrar görmeye başlar.
              Gizlilik beklentisi yaratan bir ayar, sessiz kalmıyoruz.
              🔴 İKİ AYRI METİN: premium'u OLAN kullanıcı için bu gelecek zamanlı
              bir uyarı ("bittiğinde duracak"), premium'u BİTMİŞ kullanıcı için
              ise mevcut durumun tarifi ("şu an uygulanmıyor"). İkincisine aynı
              gelecek zamanlı metni göstermek, kuralın hâlâ yürürlükte olduğunu
              sandırırdı. Kayıt duruyor ve premium yenilenince kendiliğinden geri
              devreye giriyor — o yüzden listeyi silmiyoruz, sadece söylüyoruz. */}
          {/* 🔴 ÜÇÜNCÜ DAL (davet ödülü): hak premium'dan DEĞİL davetten
              geliyorsa "Premium'un bittiğinde" cümlesi olgusal olarak yanlış —
              kullanıcının premium'u yok, kuralı durduracak olan hakkın kendi
              süresi. O yüzden bu dalda premium notları hiç çizilmiyor, üstteki
              gün şeridi (grantNote) zaten kuralın ne zaman duracağını söylüyor. */}
          {draft.mode !== "everyone" && draft.domains.length > 0 && grantDays === null ? (
            <Text
              style={{
                color: colors.textMuted,
                fontSize: 13,
                lineHeight: 19,
                fontWeight: "500",
                marginTop: 10,
              }}
            >
              {t(
                canUse
                  ? "discover.filters.visibility.premiumExpiryNote"
                  : "discover.filters.visibility.premiumInactiveNote",
              )}
            </Text>
          ) : null}
        </View>

        {/* ── Kilitli hâlin ikinci kapısı ── Paywall satırlara dokununca zaten
            açılıyor; bu, PARA İSTEMEYEN yolu görünür kılıyor. Yalnız kilitliyken
            çiziliyor: hakkı olan kullanıcıya davet reklamı yapmak, ayarı
            kullanmaya gelmiş kişiyi başka bir ekrana çağırmak olurdu. */}
        {!canUse ? (
          <AnimatedPressable
            onPress={openReferral}
            testID="visibility-invite-cta"
            // Buton kabuğu YOK: alttaki kaydet butonuyla yarışıyordu. Düz
            // metin bağlantı, dokunma alanı paddingVertical ile korunuyor.
            style={{ marginTop: 20 }}
          >
            <Text
              style={{
                paddingVertical: 16,
                textAlign: "center",
                fontSize: 15,
                fontWeight: "600",
                color: colors.text,
              }}
            >
              {t("discover.filters.visibility.inviteCta")}
            </Text>
          </AnimatedPressable>
        ) : null}
      </BottomSheetScrollView>

      <UniversityPickerModal
        visible={pickerVisible}
        onClose={() => setPickerVisible(false)}
        title={
          picker === "block"
            ? t("discover.universityPicker.hiddenFromTitle")
            : t("discover.universityPicker.visibleOnlyTitle")
        }
        items={universityOptions}
        // Karşı satır için açıldıysa boş başlar: listeler taşınmaz.
        initialSelectedValues={draft.mode === picker ? draft.domains : []}
        // Tavan SATIRA GÖRE: Block 5, Allow 3 (backend'de de ayrı).
        maxLimit={maxDomainsFor(picker)}
        limitMsg={t("discover.universityPicker.limitMsg", {
          // `count` DEĞİL: i18next'te count çoğul çözümlemesini tetikler.
          max: maxDomainsFor(picker),
        })}
        onConfirm={confirmPicker}
      />
    </AppBottomSheet>
  );
}

/**
 * FilterModal'daki `VisibilityListLabel`in aynısı — etiket + n/max sayacı.
 * `max` artık PARAMETRE: tavan moda göre değişiyor (Allow 3, Block 5).
 */
function ListLabel({
  label,
  count,
  max,
  marginTop = 0,
}: {
  label: string;
  count: number;
  max: number;
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
            color: count >= max ? colors.text : colors.textMuted,
            fontSize: 13,
            fontWeight: "500",
            fontVariant: ["tabular-nums"],
          }}
        >
          {count}/{max}
        </Text>
      ) : null}
    </View>
  );
}

/** FilterModal'daki `SelectRow`un aynısı — pill satır, X listeyi temizler. */
function SelectRow({
  testID,
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
      testID={testID}
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
 *   • ikon `eye.slash.fill`e geçiyor — bir kural yüzünden birileri seni GÖRMÜYOR
 *   • rozet kaç üniversitenin listede olduğunu söylüyor
 * Böylece kullanıcı sheet'i açmadan "bir kısıtlamam var mı" sorusunu
 * cevaplayabiliyor; gizlilik ayarlarında sessiz kalmak en pahalı seçenek.
 *
 * ⚠️ ZEMİN VE HALKA KALDIRILDI (eskiden gradyan halka + buzlu cam daire).
 * O yüzey ikonu kendi çapının yarısına sıkıştırıyordu; çıplak ikon hem
 * büyüyebiliyor hem de hero'daki fotoğrafla yarışmıyor. Durum bilgisi
 * kaybolmuyor: ikonun kendisi ve rozet söylüyor. Dokunma alanı artık ikonun
 * boyutundan değil `hitSlop`tan geliyor (28 + 2×8 = 44pt, dokunulabilir en
 * küçük ölçü).
 *
 * ⚠️ ROZETTEKİ SAYI DEĞİŞTİ: eskiden "kaç liste aktif" (1 ya da 2) sayılıyordu.
 * Tek mod kuralından sonra o sayı her zaman 1 olacaktı, yani hiçbir şey
 * söylemiyordu. Artık seçili moddaki ÜNİVERSİTE SAYISI yazıyor — sheet'teki
 * n/max sayacıyla aynı sayı, iki yerde iki farklı rakam görmenin kafa
 * karışıklığı da böylece ortadan kalkıyor.
 */
export function VisibilityHeroButton({
  mode,
  domainCount,
  onPress,
}: {
  mode: VisibilityMode;
  domainCount: number;
  onPress: () => void;
}) {
  const active = mode !== "everyone" && domainCount > 0;
  const SIZE = 28;

  return (
    <AnimatedPressable onPress={onPress} pressScale={0.94} hitSlop={8}>
      {/* Kutu ikon kadar: rozetin ikona yapışması için (eski 54'lük dairede
          rozet ikondan kopuk duruyordu). */}
      <View style={{ width: SIZE, height: SIZE, alignItems: "center", justifyContent: "center" }}>
        <SFIcon
          name={active && mode === "block" ? "eye.slash.fill" : "eye.fill"}
          fallback={active && mode === "block" ? EyeOff : Eye}
          size={SIZE}
          color={colors.text}
          strokeWidth={1.75}
          weight="semibold"
        />

        {/* Sayaç rozeti — yalnız kural varken, seçili moddaki üniversite
            sayısını gösteriyor (sheet'teki n/max sayacıyla AYNI sayı). */}
        {active && (
          <View
            style={{
              position: "absolute",
              right: -6,
              top: -6,
              minWidth: 18,
              height: 18,
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
                fontSize: 10,
                fontWeight: "700",
                fontVariant: ["tabular-nums"],
              }}
            >
              {domainCount}
            </Text>
          </View>
        )}
      </View>
    </AnimatedPressable>
  );
}
