import { useCallback, useEffect, useMemo, useState } from "react";
import { ActivityIndicator, Text, TouchableOpacity, View } from "react-native";
import { useTranslation } from "react-i18next";
import { GraduationCap, Info as InfoIcon, Plus, X as XIcon } from "@/shared/icons";
// AppBottomSheet DEĞİL AppModal: header (blur + drag pill + scroll'a bağlı
// başlık) kardeş sheet'lerle tek yerden geliyor (bkz. ReferralSheet).
import AppModal from "@/shared/components/AppModal";
import AnimatedPressable from "@/shared/components/AnimatedPressable";
import SFIcon, { type SFSymbol } from "@/shared/components/SFIcon";
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
import { colors, isLight } from "@/shared/theme/colors";
// Header butonlarının ölçüsü — savingSlot, Kaydet/X ile AYNI yükseklikte
// dursun diye tek sabitten (bkz. AppModal > clearGlassHeader).
import { GLASS_ICON_CLEAR_SIZE } from "@/shared/theme/glass";
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


/**
 * İki liste satırının ikonu — FilterModal'daki üniversite satırıyla AYNI sembol
 * ("ben kimi göreyim" oradaki, "beni kim görsün" buradaki): satırın işi ikisinde
 * de ÜNİVERSİTE SEÇMEK, ikon da onu söylüyor.
 *
 * ⚠️ İKİ SATIR ARTIK AYNI İKONU TAŞIYOR. Eskiden `eye.fill` / `eye.slash.fill`
 * ayrımı taşıyordu; "izin ver" ile "gizlen" farkını şimdi yalnız satırın
 * üstündeki ListLabel söylüyor. Ayrımı ikona geri taşımak istersen tek yer
 * burası — o zaman iki ayrı sabit gerekir.
 *
 * SelectRow props'u `any`, sembol adı orada denetlenmiyor; SFSymbol olarak
 * burada sabitleyip yazım hatasını compile-time'da yakalıyoruz (FilterModal >
 * UNIVERSITY_ICON ile aynı gerekçe).
 */
const UNIVERSITY_ICON: SFSymbol = "graduationcap.fill";

/**
 * Satırdaki "temizle" X'inin grisi — FilterModal'daki `mutedInk`in aynısı,
 * oradaki üniversite satırıyla aynı tonu tutturmak için kopyalandı.
 *
 * Fonksiyon çünkü palet mutable (bkz. colors.ts): mod değişiminde render anında
 * okunmalı, modül yüklenirken değil. Açıkta bir kademe açık (`textMuted`),
 * koyuda token'ın kendisi — siyah zeminde grinin daha açığı kontrastı değil
 * okunabilirliği bozuyor.
 */
const mutedInk = () => (isLight() ? colors.textMuted : colors.textSecondary);

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

  // Kaydederken etiketin yerini tutan pill — ProfileEditModal'daki `savingSlot`
  // ile aynı kabuk (yükseklik/padding/yarıçap), içi shimmer yerine spinner.
  // Buton çerçevesi korunuyor ki header satırı kaydetme sırasında zıplamasın.
  const savingSlot = (
    <View
      pointerEvents="none"
      style={{
        height: GLASS_ICON_CLEAR_SIZE,
        paddingHorizontal: 18,
        borderRadius: 999,
        backgroundColor: colors.hairlineSoft,
        alignItems: "center",
        justifyContent: "center",
      }}
    >
      <ActivityIndicator size="small" color={colors.text} />
    </View>
  );

  return (
    <AppModal
      visible={visible}
      onClose={onClose}
      // Kardeş sheet'le (ReferralSheet) AYNI HEADER: progressive blur, drag
      // pill, scroll 55px'i geçince beliren küçük başlık.
      title={t("discover.filters.visibility.title")}
      // ── Butonlar ProfileEditModal'ın yapısında ──────────────────────────────
      // Kaydetme ARTIK footer'ın tam genişlikte butonu değil, header'ın sağ
      // ucundaki cam kapsül; solda da onunla aynı yükseklikte berrak cam X.
      // İkisinin ölçüsü tek sabitten (`clearGlassHeader` → GLASS_ICON_CLEAR_SIZE)
      // geliyor, yani profil düzenleme modal'ıyla birebir aynı satır.
      //
      // Etiket dirty'ye göre değişiyor: değişiklik varsa "Kaydet", yoksa
      // "Bitti" — ikisi de handleSave'e gidiyor (temizken o zaten yalnız
      // kapatıyor).
      actionLabel={saving ? undefined : t(dirty ? "common.save" : "common.done")}
      onAction={handleSave}
      rightSlot={saving ? savingSlot : undefined}
      clearGlassHeader
      // TEK DETENT. Davet şeridi/CTA eklendikten sonra 55% içerikte sürekli
      // kaydırma bırakıyordu; bir tık uzattık. İçerik yine taşarsa scroll
      // ediyor. `dynamicSizing` bilerek KAPALI (kardeş sheet'ten AYRILDIĞI
      // yer) — buradaki içerik seçim yapıldıkça uzayıp kısalıyor (davet
      // şeridi, erişim uyarısı, satır özetleri), ölçülen boy her dokunuşta
      // zıplardı.
      snapPoints={["57%"]}
      // paddingTop VERİLMİYOR: header'da artık buton var, üst pay AppModal'ın
      // kendi header yüksekliğinden (88) gelmeli — eski 40 butonların altına
      // girerdi. Yatay 24 bu sheet'in kendi ölçüsü (AppModal varsayılanı 20),
      // alt pay footer gittiği için bir tık büyüdü.
      contentContainerStyle={{
        paddingHorizontal: 24,
        paddingBottom: 32,
      }}
    >
      {/* Büyük başlık İÇERİKTE — header'ınki scroll'a bağlı beliriyor. Ölçü
          ReferralSheet ve doğrulama sheet'iyle AYNI: 26/700. */}
      <Text
        style={{
          color: colors.text,
          fontSize: 26,
          fontWeight: "700",
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
        {/* 🔴 `description` ("Keşfette seni kimlerin görebileceğini seç")
            DEĞİL `exclusiveNote`. Birincisi başlığın söylediğini tekrar
            ediyordu; ikisinden yalnız birinin aktif olabilmesi ise ekranın
            TEK gerçek kuralı ve kullanıcı onu ancak bir listede seçim yapıp
            diğerinin boşaldığını görünce öğreniyordu. Metin aşağıda,
            satırların ALTINDA ortalı gri bir not olarak duruyordu — orada
            kaldırıldı, kural artık en üstte. */}
        <Text
          style={{
            flex: 1,
            color: colors.textSecondary,
            fontSize: 13,
            lineHeight: 19,
            fontWeight: "500",
          }}
        >
          {t("discover.filters.visibility.exclusiveNote")}
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
          sfIcon={UNIVERSITY_ICON}
          lucideIcon={GraduationCap}
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
          sfIcon={UNIVERSITY_ICON}
          lucideIcon={GraduationCap}
          value={summarizeDomains(blockDomains)}
          placeholder={t("discover.filters.visibility.selectUniversities")}
          disabled={canUse && universityOptions.length === 0}
          onPress={() => openPicker("block")}
          onClear={() => clearList("block")}
        />

        {/* `exclusiveNote` BURADAN KALKTI: artık başlığın hemen altında,
            info glifinin yanında (bkz. yukarısı). Kuralı satırların altında
            ortalı gri bir notta söylemek, kullanıcı iki listeyi de doldurup
            birinin boşaldığını gördükten SONRA okunacağı anlamına
            geliyordu. */}

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
    </AppModal>
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

/**
 * FilterModal'daki `SelectRow`un BİREBİR aynısı — pill satır, X listeyi
 * temizler. İki ekranda da satırın işi aynı: çoklu üniversite seçimi açmak.
 *
 * ⚠️ ORADAN KOPYALANAN ÜÇ KARAR (hiçbiri kozmetik değil, bkz. FilterModal
 * içindeki gerekçeler):
 *   • Kenarlık TAM 1px — 0.5'te bu kapsül sınırı olmayan bir metin gibi
 *     görünüyordu. Ayar kalınlıkta değil tonda yapılıyor.
 *   • İkon ve metin TAM MÜRKEPTE, placeholder dahil: satırın tamamı tek bir
 *     dokunma hedefi, üç eleman da aynı ağırlıkta okunsun. Pasif gri yalnız
 *     "temizle" X'inde kaldı — o satırın kendisi değil, yıkıcı bir yan eylem.
 *   • Sağda chevron DEĞİL ARTI: chevron "burada bir liste açılır/kapanır"
 *     diyordu, oysa satır bir seçim ekranı açıyor ve seçim ÇOKLU — artı "buna
 *     bir şey ekle" işini doğrudan söylüyor.
 */
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
        borderWidth: 1,
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
          color={colors.text}
          strokeWidth={1.5}
        />
        <Text
          numberOfLines={1}
          style={{
            color: colors.text,
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
            color={mutedInk()}
            strokeWidth={2}
            weight="semibold"
          />
        </TouchableOpacity>
      ) : (
        <SFIcon
          name="plus"
          fallback={Plus}
          size={18}
          color={colors.text}
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
 * 🔴 BUTON DURUM BİLDİRİYOR, sadece kapı değil: kural varken rozet kaç
 * üniversitenin listede olduğunu söylüyor. Böylece kullanıcı sheet'i açmadan
 * "bir kısıtlamam var mı" sorusunu cevaplayabiliyor; gizlilik ayarlarında
 * sessiz kalmak en pahalı seçenek.
 *
 * ⚠️ İKON ARTIK MODA GÖRE DEĞİŞMİYOR. Eskiden `eye.fill` / `eye.slash.fill`
 * ayrımı vardı; artık her durumda sheet'in kendi satırlarıyla AYNI sembol
 * (UNIVERSITY_ICON, graduationcap.fill) — buton neyin kapısı olduğunu söylüyor,
 * "kural var mı"yı rozet taşıyor. `graduationcap`in slash'lı bir varyantı da
 * yok, ayrımı ikona geri taşımak isteyen önce ona bir karşılık bulmalı.
 *
 * ZEMİN: TERS YÜZEY — açık modda neredeyse siyah, koyuda beyaz daire
 * (`inverseSurface`), üstündeki sembol `onInverseSurface`. Çıplak ikon dönemi
 * bitti; çıplakken tek başına duran bir işaret gibi okunuyordu, oysa bu bir
 * BUTON ve yanındaki "Düzenle" de zeminli.
 *
 * Neden kartların `surface`ı değil: hero'nun zemini `bg` ve `surface` ondan
 * yalnız bir tık ayrışıyor (açıkta #FFFFFF → #EFEFF2) — kart yığınında işe
 * yarayan o yumuşaklık, tek başına duran 44pt'lik bir dairede butonu
 * görünmez kılıyordu. Ters dolgu sayfadaki en yüksek kontrast, dikkat de
 * bunu istiyor: bu buton gizlilik durumu bildiriyor.
 *
 * `text` DEĞİL `inverseSurface`: ikisi koyu modda aynı değere düşüyor, açık
 * modda ayrışıyorlar (bkz. colors.ts > Ters yüzey). Çerçeve yok — ters dolgu
 * zaten kendi kenarını çiziyor, üstüne hairline eklemek kirletirdi.
 *
 * ⚠️ ESKİ HATAYA DÖNÜLMEDİ: kaldırılan gradyan halka + buzlu cam daire 54pt
 * çapta 28pt ikon taşıyordu, yani ikonu kendi çapının yarısına sıkıştırıyordu.
 * Yeni kutu 44pt, ikon 26pt (oran ~%59) — zemin ikonu ezmiyor. 44pt ayrıca
 * dokunulabilir en küçük ölçü; `hitSlop` artık dokunma alanını KURAN değil ona
 * pay ekleyen şey.
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
  const ICON = 26;
  const BOX = 44;

  return (
    <AnimatedPressable onPress={onPress} pressScale={0.94} hitSlop={4}>
      {/* Ters dolgu (açıkta siyah / koyuda beyaz). Rozet bu kutunun köşesine
          yapışıyor (aşağıda -2/-2): daire kenarı köşegen üzerinde ~6pt içeride
          kaldığı için rozet kutunun değil dairenin omzunda duruyor. */}
      <View
        style={{
          width: BOX,
          height: BOX,
          borderRadius: 999,
          borderCurve: "continuous",
          backgroundColor: colors.inverseSurface,
          alignItems: "center",
          justifyContent: "center",
        }}
      >
        <SFIcon
          name={UNIVERSITY_ICON}
          fallback={GraduationCap}
          size={ICON}
          color={colors.onInverseSurface}
          strokeWidth={1.75}
          weight="semibold"
        />

        {/* Sayaç rozeti — yalnız kural varken, seçili moddaki üniversite
            sayısını gösteriyor (sheet'teki n/max sayacıyla AYNI sayı). */}
        {active && (
          <View
            style={{
              position: "absolute",
              right: -2,
              top: -2,
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
