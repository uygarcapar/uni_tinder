import { memo, useCallback, useEffect, useMemo, useRef, useState } from "react";
import {
  ActivityIndicator,
  Dimensions,
  Pressable,
  StyleSheet,
  Switch,
  Text,
  TouchableOpacity,
  View,
} from "react-native";
import { BottomSheetTextInput } from "@gorhom/bottom-sheet";
import { useTranslation } from "react-i18next";
import { useController, useForm, useFormState, type Control } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import AppModal from "@/shared/components/AppModal";
import AnimatedPressable from "@/shared/components/AnimatedPressable";
import SFIcon from "@/shared/components/SFIcon";
import { Info } from "@/shared/icons";
import { useKeyboardAwareField } from "@/shared/hooks/useKeyboardAwareField";
import { colors, ink } from "@/shared/theme/colors";
// Çipin seçilmemiş hâli AKIŞ KARTINDAKİ hashtag kapsülü — ölçüler oradan.
import {
  TOPIC_FILL_ALPHA,
  TOPIC_TEXT,
  topicPillInk,
} from "./feedTopicPill";
import { feedPostSchema } from "@/shared/schemas/formSchemas";
import FeedQuotaBadge from "./FeedQuotaBadge";
import {
  FEED_COUNTER_WARN_REMAINING,
  clampFeedText,
  feedTextLength,
} from "../feedText";
import type { AnonymousGate } from "../feedPolicy";

/**
 * Akış gönderi composer'ı.
 *
 * İskelet `NoteComposerModal`den kopya ve kopya olması ZORUNLU — oradaki her
 * kural somut bir kazanın ilacı:
 *  • Üç MODÜL SEVİYESİ alt bileşen (alan / anonim anahtarı / gönder): render'da
 *    tanımlansalardı her tuşta input remount olur ve klavye düşerdi.
 *  • `BottomSheetTextInput` şart: düz TextInput'ta gorhom klavye target'ını set
 *    etmiyor ve sheet klavye davranışını tamamen atlıyor.
 *  • Yükseklik iki görünmez AYNA Text'ten ölçülüyor: New Arch'ta
 *    `onContentSizeChange` auto-grow'u güvenilmez.
 *  • Kırpma `onChangeText`te, `maxLength`te DEĞİL: o prop UTF-16 birimi sayıyor
 *    ve emojili bir gönderiyi sunucunun kabul edeceği yerin yarısında keserdi.
 *
 * NOT COMPOSER'INDAN FARKLAR:
 *  1. KARAKTER SAYACI VAR. Notta 150 vardı ve kullanıcı sınıra nadiren
 *     dayanıyordu; 400 karakterlik bir gönderide sayaçsız yazmak körlemesine.
 *  2. ANONİM ANAHTARI var (kapısı `/api/feed/me`den, premium tier'dan DEĞİL).
 *  3. ⚠️ MODERASYON İPUCU YOK. 2026-09-30'da telefon/sosyal medya/küfür
 *     serbest bırakıldı; "numaranı paylaşma" gibi bir metin hem yanlış hem bir
 *     hafta içinde bayat. UT-7306'da sunucunun `message`'ı aynen gösteriliyor.
 */

const INPUT_FONT_SIZE = 18;
const INPUT_FONT_WEIGHT = "500" as const;
const INPUT_MAX_LINES = 9;

type FeedPostForm = { body: string };

const styles = StyleSheet.create({
  // Ayna Text'ler: TextInput ile AYNI font metriği, görünmez, dokunmaz.
  // ⚠️ lineHeight VERİLMİYOR — iOS TextInput onu Text gibi uygulamıyor, ölçüm kayar.
  mirror: {
    position: "absolute",
    left: 0,
    right: 0,
    opacity: 0,
    fontSize: INPUT_FONT_SIZE,
    fontWeight: INPUT_FONT_WEIGHT,
  },
});

export interface FeedComposerSheetProps {
  visible: boolean;
  onClose: () => void;
  /** ÇOKLU konu: dizi hep en az bir eleman taşır (gönder butonunun kapısı). */
  onSend: (body: string, isAnonymous: boolean, topics: string[]) => void;
  /** Konu kataloğu — `/api/feed/me`den çözülmüş anahtarlar (feedTopics.ts). */
  topicKeys: string[];
  /**
   * Anahtar → görünen etiket. Hashtag biçimi ("#ders grubu") BURADAN geliyor,
   * çip içinde `#` eklenmiyor: etiketin yazımına ekran karar veriyor
   * (bkz. feedTopics > topicHashtag).
   */
  topicLabelFor: (key: string) => string;
  /** `/api/feed/me`den; gelmemişse istemci tavanına düşülür. */
  maxLength?: number | null;
  anonymousGate: AnonymousGate;
  onAnonymousPaywall: () => void;
  /** Kalan gönderi hakkı. `null` = backend henüz söylemedi → sayı çizilmez. */
  remaining?: number | null;
  /**
   * Gönderi hakkı bitti → sheet AÇILIYOR ama gönderilemiyor (istek: kota
   * sheet'i yerine "aynı modal, hak 0, butona basılmıyor").
   *
   * ⚠️ `remaining <= 0` İLE AYNI ŞEY DEĞİL, o yüzden ayrı prop: `remaining`
   * `null` olabiliyor ("backend henüz söylemedi") ve bu "hak yok" demek değil.
   * Kota kuralının sahibi `feedPolicy.composeGate`; burada yeniden hesaplama.
   */
  quotaExhausted?: boolean;
  /** Kullanıcının kendi üniversite adı — "şu akışta görünecek" satırı için. */
  universityLabel?: string | null;
  sending?: boolean;
  /** Doluyken sheet AÇIK KALIR ve metin korunur (UT-7306/7303/7316). */
  errorText?: string | null;
}

export default function FeedComposerSheet({
  visible,
  onClose,
  onSend,
  topicKeys,
  topicLabelFor,
  maxLength,
  anonymousGate,
  onAnonymousPaywall,
  remaining = null,
  quotaExhausted = false,
  universityLabel,
  sending = false,
  errorText = null,
}: FeedComposerSheetProps) {
  const { t } = useTranslation();
  const windowHeight = Dimensions.get("window").height;

  const limit = useMemo(() => resolveLimit(maxLength), [maxLength]);
  // Şema FABRİKA: tavan sunucudan geliyor, sabit bir şema onu yakalayamaz.
  const resolver = useMemo(() => zodResolver(feedPostSchema(limit)), [limit]);
  const { control, handleSubmit, reset } = useForm<FeedPostForm>({
    resolver,
    defaultValues: { body: "" },
    // `isValid` gönder butonunu sürdüğü için onChange şart.
    mode: "onChange",
  });

  const [isAnonymous, setIsAnonymous] = useState(false);
  /**
   * Seçili konular — ÇOKLU, EN AZ BİRİ ZORUNLU, ÖN SEÇİM YOK.
   *
   * Varsayılan bir konu olsaydı kullanıcıların çoğu düşünmeden onu gönderir ve
   * alan hiçbir şey ayırt etmezdi; zorunlu bir alanın anlamı seçimin bir karar
   * olmasından geliyor (kayıttaki mod adımının aynı gerekçesi).
   *
   * ⚠️ ÜST SINIR YOK. Kataloğun tamamını seçmek anlamsız ama istemci kendi
   * kafasından bir tavan (3 gibi) koymuyor: o sayının sahibi sunucu ve henüz
   * söylemedi — uydurulmuş bir sınır, sunucu daha azını kabul ederse geç
   * kalmış bir hataya, daha fazlasını kabul ederse yok yere kısıta döner.
   */
  const [topics, setTopics] = useState<string[]>([]);

  useEffect(() => {
    if (visible) {
      reset({ body: "" });
      setIsAnonymous(false);
      setTopics([]);
    }
  }, [visible, reset]);

  /**
   * Çipe dokunma = AÇ/KAPA. Seçili çipe tekrar dokunmak onu bırakıyor — çoklu
   * seçimde tek yol bu (tek seçimdeki "başkasına dokun" kaçışı artık yok,
   * seçimi geri almanın başka bir yolu olmazsa kullanıcı sheet'i kapatıp
   * yazdığını kaybetmek zorunda kalırdı).
   */
  const toggleTopic = useCallback((key: string) => {
    setTopics((prev) =>
      prev.includes(key) ? prev.filter((k) => k !== key) : [...prev, key],
    );
  }, []);

  const { anchorRef, onFocus, onBlur } = useKeyboardAwareField();

  const submit = handleSubmit(({ body }) => {
    if (sending) return;
    // İKİNCİ KAPI, butonun `disabled`ına ek: form gönderimi klavyedeki
    // "gönder"den de tetiklenebiliyor ve orası butonun pasifliğini görmüyor.
    if (quotaExhausted) return;
    // ÜÇÜNCÜ KAPI (butonun `disabled`ı ve kota kapısına ek): klavyedeki
    // "gönder" butonun pasifliğini görmüyor.
    if (topics.length === 0) return;
    onSend(body.trim(), isAnonymous, topics);
  });

  // Kapanış animasyonu boyunca içerik boşalmasın diye son değerler ref'te
  // aynalanıyor (NoteComposerModal'daki aynı sorun: sheet inerken satırlar
  // kayboluyor ve yükseklik zıplıyor).
  const lastUniversity = useRef(universityLabel);
  if (visible && universityLabel) lastUniversity.current = universityLabel;
  const shownUniversity = universityLabel ?? lastUniversity.current;

  /**
   * Paywall dalında anahtara dokunma → SHEET KAPANIR, sonra Plus açılır.
   *
   * Önce yalnız `onAnonymousPaywall()` çağrılıyordu ve composer altta açık
   * kalıyordu: Plus sayfası onun ÜSTÜNE biniyor, kullanıcı Plus'ı kapattığında
   * yarım yazılmış bir gönderiyle baş başa kalıyordu.
   *
   * ⚠️ SIRA ÖNEMLİ — `onClose()` ÖNCE: Plus girişi kendi modalını açıyor ve
   * açılırken altta kapanan bir sheet varsa gorhom iki modalı üst üste bindirip
   * backdrop'u takıyor. Kapanmayı başlatıp Plus'ı hemen ardından çağırmak,
   * sheet'in iniş animasyonuyla Plus'ın çıkışını aynı kareye koyuyor.
   */
  const openAnonymousPaywall = useCallback(() => {
    onClose();
    onAnonymousPaywall();
  }, [onClose, onAnonymousPaywall]);

  const handleAnonymousToggle = useCallback(
    (next: boolean) => {
      if (anonymousGate.kind === "paywall") {
        openAnonymousPaywall();
        return;
      }
      // "restricted" / "unknown": sessizce yoksay. Kısıt geçici bir ceza,
      // satılabilir bir şey değil — paywall açmak yanlış kapıyı gösterirdi.
      if (anonymousGate.kind !== "allowed") return;
      setIsAnonymous(next);
    },
    [anonymousGate, openAnonymousPaywall],
  );

  return (
    <AppModal
      visible={visible}
      onClose={onClose}
      title={t("feed.composer.title")}
      dynamicSizing
      maxDynamicContentSize={windowHeight * 0.82}
      // "extend" gönder butonunu klavyenin altına gömüyordu.
      keyboardBehavior="interactive"
      // X yok: swipe-down ve backdrop zaten kapatıyor.
      closeButton={false}
      // ⚠️ `paddingTop` ELLE VERİLİYOR ve bu KASITLI — `contentContainerStyle`
      // AppModal'ın varsayılanının ÜSTÜNE yazıldığı için buradaki sayı
      // içeriğin header'a bırakılan payını (MODAL_HEADER_HEIGHT = 74) EZİYOR.
      //
      // Bir tur varsayılana (74) bırakıldı — "boşluklar filtre modalındaki gibi
      // olsun" isteğiyle — ve GERİ ALINDI (istek: "üstten çok boşluk kalmış").
      // Gerekçesi şu: filtre sheet'inin header'ında iki buton var (✓ / sıfırla)
      // ve 74 onların bandı; BU sheet'in header'ında hiçbir buton yok
      // (`closeButton={false}`), yani 74'ün koruduğu alanın çoğu boş kalıyor ve
      // bakiye rozeti bandın çok altından başlıyordu. Filtreyle eşlenen şey
      // bandın ölçüsü değil, konu bloğunun başlık kalıbı (bkz. TopicChips).
      contentContainerStyle={{ paddingTop: 20, paddingBottom: 28 }}
    >
      {/* Bakiye rozeti yanıt composer'ıyla ORTAK bileşen (bkz. FeedQuotaBadge):
          iki sheet'te aynı yerde, aynı ölçüde durması gerekiyor.
          ⚠️ Anchor'ın DIŞINDA: anchor yalnız klavyenin üstünde kalması gereken
          şeyi (input + gönder butonu) sarıyor, rozet onun konusu değil. */}
      <FeedQuotaBadge
        label={
          typeof remaining === "number"
            ? t("feed.composer.remaining", { count: remaining })
            : null
        }
      />

      <View ref={anchorRef as any} collapsable={false}>
        <PostField
          control={control}
          limit={limit}
          editable={!sending}
          onFocus={onFocus}
          onBlur={onBlur}
        />

        {/* Hata: sheet AÇIK kalıyor, metin korunuyor. Sunucunun mesajı aynen —
            kategoriye özel istemci metni YOK (kurallar değişiyor). */}
        {errorText ? (
          <Text
            style={{
              marginTop: 12,
              fontSize: 13.5,
              lineHeight: 18,
              color: colors.errorStrong,
            }}
          >
            {errorText}
          </Text>
        ) : null}

        {/* ── Anonim anahtarı ── */}
        {/* ── KONU ÇİPLERİ ───────────────────────────────────────────────────
            Zorunlu alan: seçilmeden gönder butonu aktifleşmiyor. Metin
            alanının ALTINDA, anonim anahtarının ÜSTÜNDE — yazma akışı
            bozulmasın (kullanıcı önce yazar, sonra etiketler).

            ⚠️ `TopicChips` MODÜL SEVİYESİNDE bir bileşen: render içinde
            tanımlansaydı her tuşta yeniden kurulur, input remount olur ve
            klavye düşerdi (bu dosyanın başlığındaki kural). */}
        <TopicChips
          keys={topicKeys}
          selected={topics}
          labelFor={topicLabelFor}
          onToggle={toggleTopic}
        />

        <View
          style={{
            flexDirection: "row",
            alignItems: "center",
            marginTop: 20,
            opacity: anonymousGate.kind === "unknown" ? 1 : 1,
          }}
        >
          <View style={{ flex: 1 }}>
            {/* KİLİT İKONU KALDIRILDI (istek). Kapıyı artık iki şey söylüyor:
                altındaki açıklama satırı ("Anonim paylaşmak Lit Plus özelliği")
                ve anahtarın soluk/tepkisiz hâli. Üçüncü bir işaret satırı
                kalabalıklaştırıyordu. */}
            <Text style={{ fontSize: 15.5, fontWeight: "600", color: colors.text }}>
              {t("feed.composer.anonymousLabel")}
            </Text>
            {/* ⚠️ AÇIKLAMA SATIRI YALNIZ KAPALI DALLARDA. Serbest dalda
                ("İsmin ve fotoğrafın görünmez…") KALDIRILDI (istek): anonim
                paylaşmanın ne yaptığını anahtarın adı zaten söylüyor, satır
                bloğu üç katmanlı bir metin yığınına çeviriyordu.

                Kilit/kısıt dallarında KALIYOR ve kalmak zorunda: orada satır
                açıklama değil, anahtarın neden tepkisiz olduğunu söyleyen tek
                şey (kilit ikonu bu bloktan daha önce kaldırıldı).

                Açıklama grisi `textSecondary` DEĞİL `textMuted` — blokun kendi
                tarihi, bkz. composer başlığı. */}
            {anonymousGate.kind === "paywall" ||
            anonymousGate.kind === "restricted" ? (
              <Text
                style={{ fontSize: 12.5, color: colors.textMuted, marginTop: 2 }}
              >
                {anonymousGate.kind === "paywall"
                  ? t("feed.composer.anonymousLocked")
                  : t("feed.composer.anonymousRestricted")}
              </Text>
            ) : null}
          </View>

          {/* Paywall dalında anahtar YERİNE dokunulabilir bir sarmalayıcı:
              Switch'in kendisi tepkisiz (yanlışlıkla açılıp UT-7305 yenmesin),
              dokunuş paywall'a gidiyor (PremiumGate deseni). */}
          {anonymousGate.kind === "paywall" ? (
            <TouchableOpacity
              // ⚠️ `testID` TEST İÇİN: sarmalayıcı görünmez bir katman ve metni
              // yok, yani testte yalnız "testID'siz ilk TouchableOpacity" diye
              // bulunabiliyordu. Konu çipleri eklenince (hepsi testID'siz
              // dokunulabilir) o varsayım kırıldı. Öğeyi adreslenebilir
              // yapmak, testin ağaç sırasına bağlı kalmasından iyi.
              testID="feed-composer-anonymous-gate"
              activeOpacity={0.7}
              onPress={openAnonymousPaywall}
            >
              <View style={{ opacity: 0.4 }} pointerEvents="none">
                <Switch value={false} />
              </View>
            </TouchableOpacity>
          ) : (
            <Switch
              value={isAnonymous}
              onValueChange={handleAnonymousToggle}
              disabled={anonymousGate.kind !== "allowed"}
            />
          )}
        </View>

        {/* "Bu gönderi X akışında görünecek" SATIRI KALDIRILDI (istek): aynı
            bilgi artık gönder butonunun KENDİSİNDE duruyor ("X akışında
            paylaş"), iki yerde yazmak gereksizdi. */}

        <SendButton
          control={control}
          sending={sending}
          // Hiç konu seçilmeden gönderim YOK — butonun kendisi de pasif.
          locked={quotaExhausted || topics.length === 0}
          onPress={submit}
          university={shownUniversity ?? null}
        />
      </View>
    </AppModal>
  );
}

/**
 * Konu çipleri — ÇOKLU seçim, en az biri ZORUNLU.
 *
 * MODÜL SEVİYESİNDE (render içinde değil): bu dosyanın üç alt bileşeni de
 * öyle ve sebebi somut — render'da tanımlanan bir bileşen her tuşta yeni bir
 * tip oluyor, React onu yeni bir ağaç sayıp input'u remount ediyor ve klavye
 * düşüyor.
 *
 * SATIR SARIYOR (`flexWrap`), yatay kaydırma DEĞİL: yedi çip iki satıra
 * sığıyor ve hepsinin aynı anda görünmesi seçimi hızlandırıyor. Kaydırmalı bir
 * şeritte sağdaki çipler keşfedilmeyi bekler, oysa alan zorunlu.
 *
 * Seçili çip DOLGULU (`inverseSurface`), seçilmemiş çip yalnız KENARLIKLI —
 * uygulamanın her yerindeki seçim dili (bkz. RegisterStep10 kartları,
 * FilterModal pill'leri). Çoklu seçimde TİK İKONU EKLENMEDİ: dolgunun kendisi
 * zaten "seçili" diyor ve etiketin yanına giren bir glif, satır sarması
 * hesabını da (iki satıra sığan yedi çip) bozardı.
 */
const TopicChips = memo(function TopicChips({
  keys,
  selected,
  labelFor,
  onToggle,
}: {
  keys: string[];
  /** Seçili anahtarlar — boş dizi = hiçbiri (gönder butonu pasif). */
  selected: string[];
  labelFor: (key: string) => string;
  onToggle: (key: string) => void;
}) {
  const { t } = useTranslation();
  return (
    // ⚠️ Üst pay 18 → 28 (istek: boşluklar filtre modalındaki gibi): başlık
    // artık 20 puntoluk bir BÖLÜM başlığı ve altında bir açıklama satırı var,
    // 18'lik nefes o bloğu metin alanına yapıştırıyordu. 28, filtre sheet'inin
    // türediği profil düzenleme ritminin bölüm payı (bkz. FeedFilterSheet >
    // SECTION_GAP'in tarihçesi); oradaki 60 BURAYA KONULAMAZ — composer'ın
    // içeriği 9 satıra kadar büyüyor ve gönder butonu tavana dayanıyor.
    <View style={{ marginTop: 28 }}>
      {/* Başlık bloğu FİLTRE SHEET'İNİN `Section`ının birebir kalıbı: başlığın
          altında 6, açıklamanın altında 12 + blokun kendi 10'u = 22.

          ⚠️ PUNTO 18 → 20 (istek: filtre modalıyla aynı olsun). Eski gerekçe
          "burası bir sheet BÖLÜMÜ değil, metin alanının altındaki bir blok"du
          ve 18'i bilerek bir tık altta tutuyordu; istek o ayrımı reddetti —
          konu seçimi iki yüzeyde de aynı şey ve iki ayrı puntoyla yazılması
          aynı kataloğu iki ayrı liste gibi gösteriyordu.

          "(birden fazla seçebilirsin)" metinden ÇIKTI — bkz. tr.ts. */}
      <View style={{ marginBottom: 10 }}>
        <Text
          style={{
            color: colors.text,
            fontSize: 20,
            fontWeight: "600",
            marginBottom: 6,
          }}
        >
          {t("feed.composer.topicLabel")}
        </Text>
        {/* Açıklama satırı — filtre sheet'indeki `info.circle` + 14/400
            `textSecondary` ikilisinin aynısı (o da profil düzenlemeden
            geliyor). `flex: 1` + `paddingRight` uzun cümle glifin altına
            taşmak yerine sarsın.

            ⚠️ GLİF METNİN TAMAMINA GÖRE ORTADA (`center`), İLK SATIRA GÖRE
            DEĞİL ve `marginTop` NUDGE'I YOK: kap ortalıyor, üstüne eklenen her
            px glifi merkezden kaydırır (filtre sheet'inde aynı not). */}
        <View
          style={{
            flexDirection: "row",
            alignItems: "center",
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
            {t("feed.composer.topicDesc")}
          </Text>
        </View>
      </View>
      <View style={{ flexDirection: "row", flexWrap: "wrap", gap: 8 }}>
        {keys.map((key) => {
          const active = selected.includes(key);
          return (
            /* ⚠️ DOKUNMA GERİ BİLDİRİMİ SÖNME DEĞİL ÖLÇEK (istek: "basınca
               hover olmasın, scale olsun ufak"). `AnimatedPressable`in
               varsayılanı tam bu: `activeOpacity: 1` (yani TouchableOpacity'nin
               0.7'lik soluklaşması YOK) + basılıyken 0.97 ölçek, bırakınca
               yaylanma. Filtre sheet'indeki ikiziyle (FeedFilterSheet > Chip)
               AYNI bileşen — iki yüzeyde aynı çipin iki farklı basılma hissi
               olmasın.

               ⚠️ `activeOpacity`/`pressScale` ELLE VERİLMİYOR: sayı uygulamanın
               geri kalanıyla tek yerden (AnimatedPressable'ın varsayılanı)
               gelsin. */
            <AnimatedPressable
              key={key}
              onPress={() => onToggle(key)}
              style={{
                // ⚠️ KUTU KARTTAN KOPYALANMADI (geri alındı — istek); gerekçe
                // filtre sheet'inin Chip'inde.
                paddingHorizontal: 14,
                paddingVertical: 8,
                borderRadius: 999,
                borderCurve: "continuous",
                // ⚠️ KENARLIK SİLİNDİ — çipin görünüşü akış kartındaki hashtag
                // kapsülüne bağlandı (istek) ve orada kenarlık YOK; gerekçesi
                // filtre sheet'inin Chip'inde uzun uzun yazılı.
                // Kenarlığın eski işi (sabit kalınlıkla satır sarmasını
                // kilitlemek) de düştü: iki dalda da kenarlık olmayınca seçim
                // çipin ölçüsünü hiç değiştirmiyor.
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
                {labelFor(key)}
              </Text>
            </AnimatedPressable>
          );
        })}
      </View>
    </View>
  );
});

/** Sunucu tavanı + istemci tavanı → yürürlükteki sınır (feedText ile aynı kural). */
function resolveLimit(serverValue?: number | null): number {
  const CEILING = 400;
  return typeof serverValue === "number" && serverValue > 0
    ? Math.min(serverValue, CEILING)
    : CEILING;
}

/**
 * Metin alanı + ayna ölçerler + KARAKTER SAYACI.
 *
 * Modül seviyesinde ve `useController`a abone: her tuşta yalnız BU alt ağaç
 * yeniden çiziliyor — anonim anahtarı, üniversite satırı ve başlık dokunulmuyor.
 */
function PostField({
  control,
  limit,
  editable,
  onFocus,
  onBlur,
}: {
  control: Control<FeedPostForm>;
  limit: number;
  editable: boolean;
  onFocus: () => void;
  onBlur: () => void;
}) {
  const { t } = useTranslation();
  const { field } = useController({ control, name: "body" });
  const [lineH, setLineH] = useState(0);
  const [contentH, setContentH] = useState(0);

  // Yükseklik = satır sayısı × ölçülen satır boyu → kutu hep TAM satıra oturur,
  // son satır ortadan kesilmez.
  const lineCount =
    lineH > 0
      ? Math.max(1, Math.min(INPUT_MAX_LINES, Math.round(contentH / lineH)))
      : 1;
  const inputHeight = lineH > 0 ? lineCount * lineH : INPUT_FONT_SIZE * 1.3;

  // ⚠️ Kırpma code point üzerinden; `maxLength` UTF-16 sayar ve emojiyi yarardı.
  const onChangeText = useCallback(
    (next: string) => field.onChange(clampFeedText(next, limit)),
    [field, limit],
  );

  const used = feedTextLength(field.value ?? "");
  const remaining = limit - used;
  // Sayaç BAŞTAN değil, SONA YAKLAŞINCA görünür: 400 karakterlik bir alanda
  // "3/400" sürekli durursa gereksiz baskı yaratıyor.
  //
  // ⚠️ Koşuldaki `|| used > 0` KALDIRILDI: yorumun söylediğinin tersini
  // yapıyordu — ilk harfte sayaç açılıyor ve yazı boyunca orada kalıyordu.
  // Artık yalnız son FEED_COUNTER_WARN_REMAINING karakterde çıkıyor.
  //
  // Tümden kaldırılmadı ve bu kasıtlı: kırpma SESSİZ (clampFeedText tavana
  // varınca yeni harfleri hiç kabul etmiyor). Hiç sayaç olmasa kullanıcı
  // klavyeye basıp hiçbir şey olmadığını görürdü — sınıra yaklaşırken bir
  // uyarı şart.
  const showCounter = remaining <= FEED_COUNTER_WARN_REMAINING;

  return (
    // Aynalar ve input AYNI sarmalayıcıda, sarmalayıcının padding'i YOK —
    // absolute aynalar input'la birebir aynı genişlikte ölçsün.
    <View>
      <Text
        style={styles.mirror}
        onLayout={(e) => setLineH(e.nativeEvent.layout.height)}
      >
        {" "}
      </Text>
      <Text
        style={styles.mirror}
        onLayout={(e) => setContentH(e.nativeEvent.layout.height)}
      >
        {/* ZWSP: sondaki \n'in de satır sayması için. */}
        {(field.value || " ") + "​"}
      </Text>
      <BottomSheetTextInput
        value={field.value}
        onChangeText={onChangeText}
        onFocus={onFocus}
        onBlur={() => {
          field.onBlur();
          onBlur();
        }}
        placeholder={t("feed.composer.placeholder")}
        placeholderTextColor={colors.textMuted}
        multiline
        autoFocus
        editable={editable}
        style={{
          color: colors.text,
          fontSize: INPUT_FONT_SIZE,
          fontWeight: INPUT_FONT_WEIGHT,
          padding: 0,
          textAlignVertical: "top",
          height: inputHeight,
        }}
      />
      {showCounter ? (
        <Text
          style={{
            alignSelf: "flex-end",
            marginTop: 8,
            fontSize: 12.5,
            fontVariant: ["tabular-nums"],
            color:
              remaining <= FEED_COUNTER_WARN_REMAINING
                ? colors.errorStrong
                : colors.textMuted,
          }}
        >
          {used}/{limit}
        </Text>
      ) : null}
    </View>
  );
}

/**
 * Gönder butonu ayrı: `isValid`e abone olduğu için boş↔dolu geçişinde YALNIZ
 * kendisi yeniden çiziliyor, her tuşta değil.
 */
function SendButton({
  control,
  sending,
  locked,
  onPress,
  university,
}: {
  control: Control<FeedPostForm>;
  sending: boolean;
  /**
   * Hak bitti → buton SADECE basılamaz (istek). Paywall AÇILMIYOR, kota sheet'i
   * de açılmıyor: gönderi hakkı satın alınabilen bir şey değil (consumable yok,
   * Plus yalnız günlük tavanı yükseltiyor), dolayısıyla dokunuşa bir yer
   * göstermek olmayan bir satın almayı ima ederdi. Kullanıcıya durumu söyleyen
   * şey rozetteki "0 hakkın kaldı".
   *
   * ⚠️ Sohbet composer'ının kuralıyla KARIŞTIRMA: orada kilitli composer'da
   * gönder butonu paywall'a çıkıyor, çünkü orada satılacak bir şey var.
   */
  locked: boolean;
  onPress: () => void;
  /** Kullanıcının kampüs ADI; `null` ise buton sade "Paylaş" yazıyor. */
  university: string | null;
}) {
  const { t } = useTranslation();
  const { isValid } = useFormState({ control });
  const disabled = !isValid || sending || locked;
  // Kampüs adı henüz çözülmediyse (liste gelmedi ya da /me yok) sade etiket —
  // "undefined akışında paylaş" yazmaktansa susmak.
  const label = university
    ? t("feed.composer.sendIn", { university })
    : t("feed.composer.send");

  return (
    <Pressable
      onPress={onPress}
      disabled={disabled}
      // ⚠️ Dikey pay (14), üst marj (20) ve aşağıdaki punto (15.5) yanıt
      // composer'ının gönder butonuyla EŞLENİK — iki sheet'in butonu aynı boyda
      // olmalı (bkz. FeedReplyComposerSheet > SendButton).
      style={{
        marginTop: 20,
        paddingVertical: 14,
        borderRadius: 999,
        borderCurve: "continuous",
        alignItems: "center",
        justifyContent: "center",
        backgroundColor: colors.inverseSurface,
        opacity: disabled ? 0.45 : 1,
      }}
    >
      {/* Etiket yerinde kalıyor (opacity 0) ve spinner üstüne biniyor —
          genişlik zıplamasın (EmptyState'in buttonBusy deseni). */}
      <Text
        // Uzun kampüs adı butonu iki satıra bölmesin — kırpılacak olan ad.
        numberOfLines={1}
        style={{
          fontSize: 15.5,
          fontWeight: "600",
          color: colors.onInverseSurface,
          opacity: sending ? 0 : 1,
          paddingHorizontal: 16,
        }}
      >
        {label}
      </Text>
      {sending ? (
        <View style={StyleSheet.absoluteFill as any}>
          <View style={{ flex: 1, alignItems: "center", justifyContent: "center" }}>
            <ActivityIndicator size="small" color={colors.onInverseSurface} />
          </View>
        </View>
      ) : null}
    </Pressable>
  );
}
