import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import {
  ActivityIndicator,
  StyleSheet,
  Text,
  TouchableOpacity,
  View,
  useWindowDimensions,
} from "react-native";
import { BottomSheetTextInput } from "@gorhom/bottom-sheet";
import { useTranslation } from "react-i18next";
import { useController, useForm, useFormState, type Control } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import AppModal from "@/shared/components/AppModal";
import SFIcon from "@/shared/components/SFIcon";
import { Pen } from "@/shared/icons";
import { useKeyboardAwareField } from "@/shared/hooks/useKeyboardAwareField";
import { colors as theme, ink, isLight } from "@/shared/theme/colors";
import { feedReplySchema } from "@/shared/schemas/formSchemas";
import FeedQuotaBadge from "./FeedQuotaBadge";
import { clampFeedText } from "../feedText";

/**
 * Akış yanıt composer'ı.
 *
 * YERLEŞİM `NoteComposerModal`İN PROMPT HEDEFİYLE BİREBİR (istek): iki ekran da
 * aynı işi yapıyor — birinin bir cümlesine karşılık bir cümle yazmak — ve iki
 * ayrı sheet dili konuşmaları için bir sebep yok. Kopyalanan şey yalnız görünüm
 * değil, oradaki her ölçünün gerekçesi de aynı:
 *
 *  • ALINTI, kutunun ÇOCUĞU DEĞİL KARDEŞİ ve sol üst köşesine biniyor. Yoga
 *    absolute çocuğu ebeveynin padding'ine göre konumlandırıyor; kutunun içine
 *    konsa `top: -overhang` taşma yerine kutunun içine düşerdi.
 *  • Alıntının kutuya giren kısmı SABİT (PREVIEW_INSET), değişen şey yukarı
 *    taşması: gövde iki satıra çıkınca chip yukarı büyüyor, yazının başladığı
 *    yer sabit kalıyor.
 *  • Chip'in yüksekliği ÖLÇÜLÜYOR, sabit verilmiyor — gövde bir ya da iki
 *    satır olabiliyor.
 *  • KARAKTER SAYACI YOK (not composer'ında da yok): sınır zaten
 *    `clampFeedText`te ve 150 karakterde sayaç baskı yaratıyor.
 *
 * NOT COMPOSER'INDAN AYRILAN TEK ŞEY ÜRÜN BİLGİSİ:
 *  • tavan 150 (notta sunucudan gelen `noteMaxLength`),
 *  • sol üstteki rozet akışın kendi işaretini taşıyor (not balonu DEĞİL —
 *    o glyph not ürününün işareti, bkz. NoteGlyph),
 *  • anonim anahtarı YOK: yanıt her zaman kimlikli gider (gönderi sahibi
 *    yanıtlayanı görüyor, sözleşme §7.2) ve bunu bir seçenekmiş gibi sunmak
 *    yanlış beklenti yaratırdı.
 *
 * İskeletin "neden" gerekçeleri FeedComposerSheet başlığında (üç modül
 * seviyesi alt bileşen, BottomSheetTextInput, ayna ölçüm, code-point kırpma).
 */

/**
 * Input'un ve ayna Text'lerin ORTAK punto'su + kalınlığı — ikisi ayrılırsa
 * ölçülen satır yüksekliği yalan olur.
 *
 * ⚠️ Değerler `FeedComposerSheet`in (gönderi paylaşma) input'uyla AYNI (18/500),
 * not composer'ının 20/600'ü DEĞİL: aynı özelliğin iki yazma alanı, biri
 * diğerinden büyük puntoda yazmasın. Değiştirirken ikisini birlikte değiştir.
 */
const INPUT_FONT_SIZE = 18;
const INPUT_FONT_WEIGHT = "500" as const;
const INPUT_MAX_LINES = 6;

const REPLY_CEILING = 150;

/**
 * Alıntının kutuya GİREN kısmı ve kutunun iç payları — not composer'ındaki
 * thumbnail geometrisinden geliyor (52 − 28 = 24) ve orada prompt chip'i de
 * aynı sayıyı kullanıyor: önizleme kaç satır olursa olsun kutunun içine hep bu
 * kadar girer, yazı da her hedefte AYNI yerden başlar.
 */
const PREVIEW_INSET = 24;
const QUOTE_LEFT = 6;
const INPUT_PAD_TOP = 14;
/** Alt pay üstten AYRI ve biraz büyük: son satır alt kenara yapışmasın. */
const INPUT_PAD_BOTTOM = 22;
const INPUT_PAD_TOP_WITH_QUOTE = PREVIEW_INSET + INPUT_PAD_TOP;

// Alıntı chip'i — yerleşim not composer'ındaki PromptTargetChip'ten, PUNTOLAR
// ONDAN KÜÇÜK (istek). Oradaki 16/22 bir prompt SORUSU ile CEVABI içindi ve
// chip kartın kendi kutusunun küçültülmüş haliydi; burada alıntılanan şey bir
// gönderi gövdesi — bağlamı hatırlatan bir etiket, okunduğu yer değil.
// ⚠️ Satır yükseklikleri puntolara BAĞLI: biri değişirse diğeri de değişmeli,
// yoksa chip'in ölçülen boyu (ve kutuya binme payı) kayar.
const CHIP_BORDER = 1;
// 26 → 16: puntolar küçüldükten sonra (16/13) 26'lık dikey pay chip'i içeriğine
// göre şişkin bırakıyordu — not composer'ındaki 26, oradaki 22/16'lık yazı
// içindi.
const CHIP_PAD_V = 16;
const CHIP_LABEL_SIZE = 13;
const CHIP_LABEL_LINE = 17;
/** Etiket ile gövde arası — gövde başlığa yapışmasın. */
const CHIP_GAP = 6;
const CHIP_BODY_SIZE = 16;
const CHIP_BODY_LINE = 22;
/** Tırnak glifi gövde puntosuyla birlikte küçülüyor, yoksa yazıyı bastırıyor. */
const CHIP_ICON_SIZE = 14;
const CHIP_BODY_MAX_LINES = 2;

/**
 * Tek satırlık gövdeyle oluşan yükseklik — chip ölçülüyor, bu yalnız ilk kare
 * için başlangıç tahmini. Yaygın hâl tek satır, o yüzden ikinci karede çoğu
 * zaman düzeltme bile gerekmiyor.
 */
const CHIP_HEIGHT_ESTIMATE =
  2 * CHIP_BORDER + 2 * CHIP_PAD_V + CHIP_LABEL_LINE + CHIP_GAP + CHIP_BODY_LINE;

type FeedReplyForm = { comment: string };

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

export interface FeedReplyComposerSheetProps {
  visible: boolean;
  onClose: () => void;
  onSend: (comment: string) => void;
  /** Yanıt verilen gönderinin gövdesi — alıntı için. */
  postExcerpt?: string | null;
  /** Anonim gönderiye yanıt veriliyorsa alıntı etiketi değişiyor. */
  postIsAnonymous?: boolean;
  maxLength?: number | null;
  /** Kalan yanıt hakkı. `null` = backend henüz söylemedi → sayı çizilmez. */
  remaining?: number | null;
  sending?: boolean;
  /** Doluyken sheet AÇIK KALIR ve metin korunur. */
  errorText?: string | null;
}

/**
 * Alıntı chip'i — kutunun sol üst köşesine binen mini kart.
 *
 * İçerik not composer'ındaki prompt chip'inin kalıbı: üstte soluk ETİKET
 * ("Gönderine yanıt veriyorsun"), altında tırnak ikonuyla GÖVDE. Vurgu
 * gövdede; etiket yalnız bağlam veriyor.
 */
function QuoteChip({
  label,
  excerpt,
  overhang,
  onHeight,
}: {
  label: string;
  excerpt: string;
  overhang: number;
  onHeight: (h: number) => void;
}) {
  return (
    <View
      pointerEvents="none"
      onLayout={(e) => onHeight(e.nativeEvent.layout.height)}
      style={{
        position: "absolute",
        top: -overhang,
        left: QUOTE_LEFT,
        // Genişlik içerik kadar; uzun gövdede kutuyu aşmasın diye tavan var
        // (gövde zaten iki satırda kırpılıyor).
        maxWidth: "92%",
        // Kart kutularıyla AYNI yuvarlaklık ve eğri — köşe dili ayrışmasın.
        borderRadius: 40,
        borderCurve: "continuous",
        paddingVertical: CHIP_PAD_V,
        paddingHorizontal: 16,
        // GÖRÜNÜR kontur — gölgenin yerine geçiyor. Chip'i zeminden ayıran ve
        // input kutusunun kenar çizgisini kestiği yeri tanımlayan şey bu:
        // dolgu opak olduğu için kutunun çizgisi chip'in altında kayboluyor,
        // kontur da kesiği temiz bitiriyor.
        borderWidth: CHIP_BORDER,
        borderColor: theme.border,
        // Dolgu OPAK ve MODA GÖRE ayrı. Açıkta BEYAZ (gri `surface` değil),
        // koyuda `surface` — yarı saydam bir dolgu ikisinde de sheet zemininin
        // üstünde neredeyse görünmez kalıyor.
        backgroundColor: isLight() ? theme.bg : theme.surface,
      }}
    >
      <Text
        numberOfLines={1}
        style={{
          color: theme.textMuted,
          fontSize: CHIP_LABEL_SIZE,
          fontWeight: "600",
          lineHeight: CHIP_LABEL_LINE,
        }}
      >
        {label}
      </Text>
      <View
        style={{
          flexDirection: "row",
          alignItems: "flex-start",
          gap: 6,
          marginTop: CHIP_GAP,
        }}
      >
        <SFIcon
          name="quote.opening"
          fallback={Pen}
          size={CHIP_ICON_SIZE}
          color={theme.text}
          // İkon satırın ortasına otursun: (satır boyu - ikon) / 2.
          style={{ marginTop: (CHIP_BODY_LINE - CHIP_ICON_SIZE) / 2 }}
        />
        <Text
          numberOfLines={CHIP_BODY_MAX_LINES}
          style={{
            color: theme.text,
            fontSize: CHIP_BODY_SIZE,
            fontWeight: "600",
            lineHeight: CHIP_BODY_LINE,
            flexShrink: 1,
          }}
        >
          {excerpt}
        </Text>
      </View>
    </View>
  );
}

export default function FeedReplyComposerSheet({
  visible,
  onClose,
  onSend,
  postExcerpt,
  postIsAnonymous = false,
  maxLength,
  remaining = null,
  sending = false,
  errorText = null,
}: FeedReplyComposerSheetProps) {
  const { t } = useTranslation();
  const { height: windowHeight } = useWindowDimensions();
  const { anchorRef, onFocus, onBlur } = useKeyboardAwareField();

  const limit = useMemo(() => {
    return typeof maxLength === "number" && maxLength > 0
      ? Math.min(maxLength, REPLY_CEILING)
      : REPLY_CEILING;
  }, [maxLength]);

  const resolver = useMemo(() => zodResolver(feedReplySchema(limit)), [limit]);
  const { control, handleSubmit, reset } = useForm<FeedReplyForm>({
    resolver,
    defaultValues: { comment: "" },
    // `isValid` gönder butonunu sürdüğü için onChange şart.
    mode: "onChange",
  });

  useEffect(() => {
    if (visible) reset({ comment: "" });
  }, [visible, reset]);

  const submit = handleSubmit(({ comment }) => {
    if (sending) return;
    onSend(comment.trim());
  });

  // Kapanış animasyonu boyunca alıntı boşalmasın: sheet inerken `postExcerpt`
  // null'a düşüyor ve chip kaybolunca kutunun üst payı değişip yüksekliği
  // zıplatıyordu (not composer'ındaki aynı dondurma).
  const lastExcerpt = useRef(postExcerpt);
  if (visible && postExcerpt) lastExcerpt.current = postExcerpt;
  const shownExcerpt = postExcerpt ?? lastExcerpt.current;
  const lastAnonymous = useRef(postIsAnonymous);
  if (visible && postExcerpt) lastAnonymous.current = postIsAnonymous;
  const shownAnonymous = postExcerpt ? postIsAnonymous : lastAnonymous.current;

  // Chip'in ölçülen boyu → taşması. Kutunun İÇİNE giren kısım sabit.
  const [chipHeight, setChipHeight] = useState(CHIP_HEIGHT_ESTIMATE);
  const chipOverhang = Math.max(0, chipHeight - PREVIEW_INSET);
  const showQuote = !!shownExcerpt;

  return (
    <AppModal
      visible={visible}
      onClose={onClose}
      title={t("feed.reply.title")}
      // Sabit yükseklik YOK: sheet ölçülen içerik kadar açılıyor.
      dynamicSizing
      // Tavan — uzun bir alıntıda ya da 6 satırlık yanıtta sheet ekranı
      // yutmasın; bu noktadan sonra içerik scroll'a düşer.
      maxDynamicContentSize={windowHeight * 0.82}
      // "interactive": sheet klavye kadar YUKARI ötelenir, yani kutu da gönder
      // butonu da klavyenin üstünde kalır. "extend"de buton klavyenin altına
      // gömülüyordu.
      keyboardBehavior="interactive"
      // X yok: swipe-down ve backdrop zaten kapatıyor.
      closeButton={false}
      contentContainerStyle={{ paddingTop: 28, paddingBottom: 28 }}
    >
      {/* Bakiye rozeti gönderi composer'ıyla ORTAK bileşen (bkz.
          FeedQuotaBadge): iki sheet'te aynı yerde, aynı ölçüde durması
          gerekiyor. */}
      <FeedQuotaBadge
        label={
          typeof remaining === "number"
            ? t("feed.reply.remaining", { count: remaining })
            : null
        }
      />

      {/* Anchor input'u DA gönder butonunu DA sarıyor: klavye açılınca kutunun
          altına inen buton da klavyenin üstünde kalsın (bkz.
          useKeyboardAwareField). */}
      <View
        ref={anchorRef as any}
        collapsable={false}
        // Yukarı taşan alıntının üstündeki bakiye rozetine değmemesi için pay —
        // taşma kadarı + nefes.
        style={{ marginTop: showQuote ? chipOverhang + 6 : 0 }}
      >
        <View
          style={{
            borderRadius: 30,
            borderCurve: "continuous",
            borderWidth: 0.5,
            borderColor: errorText ? theme.error : theme.hairline,
            paddingTop: showQuote ? INPUT_PAD_TOP_WITH_QUOTE : INPUT_PAD_TOP,
            paddingBottom: INPUT_PAD_BOTTOM,
            paddingHorizontal: 18,
          }}
        >
          <ReplyField
            control={control}
            limit={limit}
            editable={!sending}
            onFocus={onFocus}
            onBlur={onBlur}
          />
        </View>

        {showQuote && (
          <QuoteChip
            label={
              shownAnonymous
                ? t("feed.reply.quoteLabelAnonymous")
                : t("feed.reply.quoteLabel")
            }
            excerpt={shownExcerpt!}
            overhang={chipOverhang}
            onHeight={setChipHeight}
          />
        )}

        <SendButton control={control} sending={sending} onPress={submit} />
      </View>

      {!!errorText && (
        <Text
          style={{
            color: theme.error,
            fontSize: 13,
            lineHeight: 19,
            marginTop: 12,
            paddingHorizontal: 4,
          }}
        >
          {errorText}
        </Text>
      )}
    </AppModal>
  );
}

/**
 * Metin alanı AYRI bileşen ve MODÜL SEVİYESİNDE: render içinde tanımlansaydı
 * her yazışta tip ayrışır, input remount olur ve klavye kapanırdı. Kutunun
 * yüksekliğini besleyen ayna Text'ler de burada — ölçüm metinle aynı render'da
 * güncellenmeli.
 */
function ReplyField({
  control,
  limit,
  editable,
  onFocus,
  onBlur,
}: {
  control: Control<FeedReplyForm>;
  limit: number;
  editable: boolean;
  onFocus: () => void;
  onBlur: () => void;
}) {
  const { t } = useTranslation();
  const { field } = useController({ control, name: "comment" });
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
        placeholder={t("feed.reply.placeholder")}
        // Alıntı etiketiyle AYNI gri: ikisi de aynı anda ve aynı kutuda duran
        // ipucu metinleri.
        placeholderTextColor={theme.textMuted}
        multiline
        autoFocus
        editable={editable}
        style={{
          color: theme.text,
          fontSize: INPUT_FONT_SIZE,
          fontWeight: INPUT_FONT_WEIGHT,
          padding: 0,
          textAlignVertical: "top",
          height: inputHeight,
        }}
      />
    </View>
  );
}

/**
 * Gönder butonu da ayrı: `isValid`e abone olduğu için boş↔dolu geçişinde YALNIZ
 * kendisi yeniden çiziliyor, her tuşta değil.
 */
function SendButton({
  control,
  sending,
  onPress,
}: {
  control: Control<FeedReplyForm>;
  sending: boolean;
  onPress: () => void;
}) {
  const { t } = useTranslation();
  const { isValid } = useFormState({ control });

  return (
    // Dolu litPlus — not composer'ının butonuyla AYNI (istek). Metin boşken
    // nötr/soluk; gönderim uçuşta iken RENK KALIYOR (spinner beyaz, gri zeminde
    // kaybolurdu), yalnız basılamıyor.
    //
    // ⚠️ ÖLÇÜLER `FeedComposerSheet`in gönder butonuyla AYNI (istek): dikey pay
    // 14, punto 15.5, üst marj 20. Kutunun yüksekliğini bu ikisi (pay + punto)
    // belirliyor, o yüzden ikisi birlikte eşlendi — yalnız padding eşlense
    // butonlar hâlâ farklı boyda kalırdı. Değiştirirken ikisini de değiştir.
    <TouchableOpacity
      activeOpacity={0.9}
      onPress={onPress}
      disabled={!isValid || sending}
      style={{
        marginTop: 20,
        width: "100%",
        borderRadius: 999,
        borderCurve: "continuous",
        overflow: "hidden",
        backgroundColor: isValid ? theme.litPlus : ink(0.15),
        paddingVertical: 14,
        alignItems: "center",
        justifyContent: "center",
      }}
    >
      <Text
        style={{
          color: isValid ? theme.onMedia : ink(0.5),
          fontSize: 15.5,
          fontWeight: "700",
          opacity: sending ? 0 : 1,
        }}
      >
        {t("feed.reply.send")}
      </Text>
      {sending && (
        <ActivityIndicator
          size="small"
          color={theme.onMedia}
          style={{ position: "absolute" }}
        />
      )}
    </TouchableOpacity>
  );
}
