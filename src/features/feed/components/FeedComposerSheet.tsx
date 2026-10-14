import { useCallback, useEffect, useMemo, useRef, useState } from "react";
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
import { useKeyboardAwareField } from "@/shared/hooks/useKeyboardAwareField";
import { colors } from "@/shared/theme/colors";
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
  onSend: (body: string, isAnonymous: boolean) => void;
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

  useEffect(() => {
    if (visible) {
      reset({ body: "" });
      setIsAnonymous(false);
    }
  }, [visible, reset]);

  const { anchorRef, onFocus, onBlur } = useKeyboardAwareField();

  const submit = handleSubmit(({ body }) => {
    if (sending) return;
    // İKİNCİ KAPI, butonun `disabled`ına ek: form gönderimi klavyedeki
    // "gönder"den de tetiklenebiliyor ve orası butonun pasifliğini görmüyor.
    if (quotaExhausted) return;
    onSend(body.trim(), isAnonymous);
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
            {/* Açıklama grisi `textSecondary` DEĞİL `textMuted`: hemen altındaki
                "bu gönderi X akışında görünecek" satırı da aynı gride ve ikisi
                aynı işi yapıyor (başlığın altındaki açıklama). İki ayrı gri üst
                üste gelince blok üç katmanlı bir metin yığınına dönüyordu. */}
            <Text
              style={{ fontSize: 12.5, color: colors.textMuted, marginTop: 2 }}
            >
              {anonymousGate.kind === "paywall"
                ? t("feed.composer.anonymousLocked")
                : anonymousGate.kind === "restricted"
                  ? t("feed.composer.anonymousRestricted")
                  : t("feed.composer.anonymousHint")}
            </Text>
          </View>

          {/* Paywall dalında anahtar YERİNE dokunulabilir bir sarmalayıcı:
              Switch'in kendisi tepkisiz (yanlışlıkla açılıp UT-7305 yenmesin),
              dokunuş paywall'a gidiyor (PremiumGate deseni). */}
          {anonymousGate.kind === "paywall" ? (
            <TouchableOpacity activeOpacity={0.7} onPress={openAnonymousPaywall}>
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
          locked={quotaExhausted}
          onPress={submit}
          university={shownUniversity ?? null}
        />
      </View>
    </AppModal>
  );
}

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
