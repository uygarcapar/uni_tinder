import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import {
  View,
  Text,
  TouchableOpacity,
  ActivityIndicator,
  StyleSheet,
  useWindowDimensions,
} from "react-native";
import { BottomSheetTextInput } from "@gorhom/bottom-sheet";
import { Image } from "expo-image";
import { useTranslation } from "react-i18next";
import {
  useForm,
  useController,
  useFormState,
  type Control,
} from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { noteSchema } from "@/shared/schemas/formSchemas";
import { Pen } from "lucide-react-native";
import AppModal from "@/shared/components/AppModal";
import SFIcon from "@/shared/components/SFIcon";
import NoteGlyph from "@/shared/components/NoteGlyph";
import { useKeyboardAwareField } from "@/shared/hooks/useKeyboardAwareField";
import { colors as theme, ink, isLight } from "@/shared/theme/colors";
import {
  NOTE_MAX_LENGTH_FALLBACK,
  noteTargetLabel,
  clampNoteText,
} from "@/features/discover/noteTarget";
import type { NoteTarget, ProfilePromptCard } from "@/shared/types";

/**
 * Not yazma sheet'i — kartta bir fotoğrafın ya da prompt cevabının altındaki
 * kutuya basınca açılır.
 *
 * Sheet'in taşıdığı tek durum METİN. Bakiye, gönderim ve hata yönetimi
 * çağıranda (DiscoverScreen) duruyor: aynı composer ileride Likes ekranından da
 * açılabilsin diye ekrana bağlı hiçbir şey bilmiyor.
 *
 * ⚠️ Hata gelince metin KORUNUYOR (sheet kapanmıyor). UT-6402/6406/6407
 * kullanıcının düzeltebileceği (ya da bekleyip tekrar deneyebileceği) hatalar;
 * yazdığını silmek en kötü davranış olurdu.
 *
 * YERLEŞİM: header'da buton YOK (ne X ne Gönder). Sheet swipe-down/backdrop ile
 * kapanır; gönderim input'un ALTINDAKİ dolu litPlus butonda — ürünün rengi
 * (kartın not balonuyla aynı) aksiyonun üstünde duruyor. Sol üstte not glyph'i
 * + kalan hak; karakter sayacı çizilmiyor (sınır zaten clampNoteText'te).
 */

/**
 * Input'un ve ayna Text'lerin ORTAK punto'su + kalınlığı — ikisi ayrılırsa
 * ölçülen satır yüksekliği yalan olur ve kutu yanlış boyda kalır. Kalınlık da
 * ortak olmak zorunda: semibold harfler daha geniş, aynada regular kalırsa
 * satır sayısı (dolayısıyla yükseklik) eksik ölçülür.
 */
const INPUT_FONT_SIZE = 20;
const INPUT_FONT_WEIGHT = "600" as const;
/** Kutunun tavanı; sonrası input'un içinde kayar. */
const INPUT_MAX_LINES = 6;

// Foto hedefinde kutunun SOL ÜST köşesine binen küçük önizleme. Kutunun
// içinde bir satır kaplamıyor: yarısı kutunun dışında, yarısı içinde duruyor
// (THUMB_OVERHANG kadarı yukarı taşar). Yazının ilk satırı bindiği yerin
// ALTINDAN başlasın diye foto varken kutunun üst padding'i büyüyor
// (INPUT_PAD_TOP_WITH_THUMB) — aksi halde ilk harfler thumbnail'in altında kalır.
const THUMB_SIZE = 52;
const THUMB_OVERHANG = 28;
const THUMB_LEFT = 6;
/**
 * Yazının kutunun kenarlarına nefes payı. Üst pay AYNI ZAMANDA önizleme
 * (thumbnail/chip) varyantlarının "taşmadan sonraki nefes" terimi — üçü birden
 * buradan büyüsün, kutu her hedefte aynı hissetsin.
 */
const INPUT_PAD_TOP = 14;
/** Alt pay üstten AYRI ve biraz büyük: son satır alt kenara yapışmasın. */
const INPUT_PAD_BOTTOM = 22;
/**
 * Önizleme kutunun İÇİNE bu kadar giriyor, gerisi yukarı taşıyor. Foto
 * thumbnail'inin oranından geliyor (52 − 28) ve prompt chip'i için de aynısı
 * kullanılıyor: chip kaç satır olursa olsun kutunun içine hep bu kadar girer,
 * yazı da her hedefte AYNI yerden başlar. Değişen şey chip'in üstteki taşması.
 */
const PREVIEW_INSET = THUMB_SIZE - THUMB_OVERHANG;
const INPUT_PAD_TOP_WITH_PREVIEW = PREVIEW_INSET + INPUT_PAD_TOP;
/** "…yanıt veriyorsun" etiketi kutunun üst çizgisine bu boyla ortalanıyor. */
const REPLY_LABEL_LINE_HEIGHT = 18;

// Prompt hedefinde kutunun sol üstüne binen mini prompt kartı — foto
// hedefindeki thumbnail'in muadili: aynı köşede, aynı biçimde taşarak duruyor.
// İçeriği SwipeCard'daki prompt kutusunun küçültülmüş hali (soru üstte, cevap
// altında tırnak ikonuyla) ama cevap EN FAZLA İKİ SATIR: burası hedefi
// hatırlatan bir etiket, cevabın okunduğu yer değil (kullanıcı zaten kartta
// okuyup bastı). Bu yüzden kutunun üstündeki ayrı önizleme bloğu kaldırıldı.
const CHIP_BORDER = 1;
const CHIP_PAD_V = 26;
const CHIP_QUESTION_LINE = 21;
/** Soru ile cevap arası — cevap başlığa yapışmasın. */
const CHIP_GAP = 8;
const CHIP_ANSWER_LINE = 30;
const CHIP_ICON_SIZE = 18;
const CHIP_ANSWER_MAX_LINES = 2;
/**
 * Tek satırlık cevapla oluşan yükseklik — chip ÖLÇÜLÜYOR (cevap iki satıra
 * çıkabildiği için sabit veremiyoruz), bu yalnızca ilk kare için başlangıç
 * tahmini: yaygın hâl tek satır, o yüzden ikinci karede çoğu zaman düzeltme
 * bile gerekmiyor.
 */
const CHIP_HEIGHT_ESTIMATE =
  2 * CHIP_BORDER +
  2 * CHIP_PAD_V +
  CHIP_QUESTION_LINE +
  CHIP_GAP +
  CHIP_ANSWER_LINE;

/** Formun tek alanı — şema `noteSchema(limit)` ile üretiliyor (tavan dinamik). */
type NoteForm = { comment: string };

const styles = StyleSheet.create({
  // Ayna Text'ler: TextInput ile aynı doğal font metriği, görünmez, dokunmaz
  // (bkz. MessageComposer — New Arch'ta onContentSizeChange/auto-grow güvenilmez).
  // lineHeight VERİLMİYOR: iOS TextInput onu Text gibi uygulamıyor, ölçüm kayar.
  mirror: {
    position: "absolute",
    left: 0,
    right: 0,
    opacity: 0,
    fontSize: INPUT_FONT_SIZE,
    fontWeight: INPUT_FONT_WEIGHT,
  },
});

/**
 * Prompt hedefinin bağlamı — input kutusunun SOL ÜST köşesine binen mini kart.
 *
 * Yerleşim foto hedefindeki thumbnail'le birebir aynı (kutunun çocuğu değil
 * kardeşi, alt kenarı kutunun PREVIEW_INSET kadar içinde, gerisi yukarı
 * taşıyor); içerik SwipeCard'ın prompt kutusunun küçültülmüşü: soru üstte,
 * cevap altında tırnak ikonuyla.
 *
 * Yükseklik SABİT DEĞİL (cevap iki satıra çıkabiliyor) → `onHeight` ile
 * ölçülüp çağırana veriliyor: kutunun üst payı ve chip'in taşması ondan
 * hesaplanıyor.
 *
 * FOTO hedefinde HİÇ çizilmiyor — kaçıncı fotoğraf olduğunu yazan etiket
 * kaldırıldı; fotoğrafın kendisi zaten aynı köşede duruyor.
 */
function PromptTargetChip({
  target,
  prompts,
  overhang,
  onHeight,
}: {
  target: NoteTarget;
  prompts: ProfilePromptCard[] | null | undefined;
  overhang: number;
  onHeight: (h: number) => void;
}) {
  const { t } = useTranslation();
  const question = noteTargetLabel(target, prompts, t);
  const answer = (prompts ?? []).find(
    (p) => p.promptKey === target.promptKey,
  )?.answer;

  return (
    <View
      pointerEvents="none"
      onLayout={(e) => onHeight(e.nativeEvent.layout.height)}
      style={{
        position: "absolute",
        top: -overhang,
        left: THUMB_LEFT,
        // Genişlik içerik kadar; uzun cevapta kutuyu aşmasın diye tavan var
        // (cevap zaten iki satırda kırpılıyor).
        maxWidth: "92%",
        // SwipeCard'daki prompt bölümüyle AYNI yuvarlaklık (40) ve aynı eğri —
        // chip o kutunun küçültülmüşü, köşe dili ayrışmasın.
        borderRadius: 40,
        borderCurve: "continuous",
        paddingVertical: CHIP_PAD_V,
        paddingHorizontal: 16,
        // GÖRÜNÜR kontur — gölgenin yerine geçiyor. Chip'i zeminden ayıran ve
        // input kutusunun kenar çizgisini kestiği yeri tanımlayan şey bu:
        // dolgu opak olduğu için kutunun çizgisi zaten chip'in altında
        // kayboluyor, kontur da kesiği temiz bitiriyor.
        borderWidth: CHIP_BORDER,
        borderColor: theme.border,
        // Dolgu OPAK ve MODA GÖRE ayrı. Açıkta BEYAZ (gri `surface` değil),
        // koyuda `surface` — SwipeCard'ın `surfaceTranslucent`ı ikisinde de
        // olmaz, sheet zemininin üstünde neredeyse görünmez.
        backgroundColor: isLight() ? theme.bg : theme.surface,
      }}
    >
      {/* Soru = başlık ama vurgu CEVAPTA: rengi `textMuted` (paletin en açık
          okunur grisi, açıkta #8E8E93) — soru bağlamı verir, göz cevaba gider. */}
      <Text
        numberOfLines={1}
        style={{
          color: theme.textMuted,
          fontSize: 16,
          fontWeight: "600",
          lineHeight: CHIP_QUESTION_LINE,
        }}
      >
        {question}
      </Text>
      {!!answer && (
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
            style={{ marginTop: (CHIP_ANSWER_LINE - CHIP_ICON_SIZE) / 2 }}
          />
          <Text
            numberOfLines={CHIP_ANSWER_MAX_LINES}
            style={{
              color: theme.text,
              fontSize: 22,
              fontWeight: "600",
              lineHeight: CHIP_ANSWER_LINE,
              flexShrink: 1,
            }}
          >
            {answer}
          </Text>
        </View>
      )}
    </View>
  );
}

/**
 * Metin alanı AYRI bir bileşen ve modül seviyesinde tanımlı (render içinde
 * tanımlansaydı her yazışta tip ayrışır, input remount olur ve klavye kapanırdı).
 *
 * Formun tamamı RHF'te: her tuşta yalnız BU alt ağaç yeniden çiziliyor —
 * modal'ın gövdesi, hedef önizlemesi, fotoğraf ve rozet dokunulmuyor. Kutunun
 * yüksekliğini besleyen ayna Text'ler de burada; ölçüm metinle aynı render'da
 * güncellenmeli.
 */
function NoteField({
  control,
  limit,
  editable,
  onFocus,
  onBlur,
}: {
  control: Control<NoteForm>;
  limit: number;
  editable: boolean;
  onFocus: () => void;
  onBlur: () => void;
}) {
  const { t } = useTranslation();
  const { field } = useController({ control, name: "comment" });
  // Kutu yüksekliği ayna Text'lerden ölçülüyor: ilki tek satırın gerçek boyunu
  // (lineH), ikincisi yazılanın kapladığı toplamı (contentH).
  const [lineH, setLineH] = useState(0);
  const [contentH, setContentH] = useState(0);

  // Yükseklik = satır sayısı × ölçülen satır boyu → kutu hep TAM satıra oturur,
  // son satır ortadan kesilmez. Boşken tek satır: sabit boş blok yerine
  // yazdıkça büyüyen bir alan.
  const lineCount =
    lineH > 0
      ? Math.max(1, Math.min(INPUT_MAX_LINES, Math.round(contentH / lineH)))
      : 1;
  const inputHeight = lineH > 0 ? lineCount * lineH : INPUT_FONT_SIZE * 1.3;

  // Sınır BURADA da uygulanıyor (şemaya ek olarak), TextInput'un `maxLength`inde
  // değil: o prop UTF-16 birimi sayar ve emoji'li bir notu sunucunun kabul
  // edeceği yerin yarısında keserdi (bkz. noteLength).
  const onChangeText = useCallback(
    (next: string) => field.onChange(clampNoteText(next, limit)),
    [field, limit],
  );

  return (
    // Ayna Text'ler ile input AYNI sarmalayıcıda ve o sarmalayıcının padding'i
    // yok — absolute aynalar input'la birebir aynı genişlikte ölçsün.
    // ZWSP: sondaki \n'in de satır sayması için.
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
        {(field.value || " ") + "​"}
      </Text>
      {/* BottomSheetTextInput şart: düz TextInput'ta gorhom klavye target'ını
          set etmiyor ve sheet klavye davranışını atlıyor (bkz. ReportModal). */}
      <BottomSheetTextInput
        value={field.value}
        onChangeText={onChangeText}
        onFocus={onFocus}
        // RHF'in `touched`ı da işaretlensin diye ikisi birden.
        onBlur={() => {
          field.onBlur();
          onBlur();
        }}
        placeholder={t("note.placeholder")}
        placeholderTextColor={theme.textSecondary}
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
 * Gönder butonu da ayrı: `isValid`e abone olduğu için boş↔dolu geçişinde
 * YALNIZ kendisi yeniden çiziliyor, her tuşta değil.
 */
function SendButton({
  control,
  sending,
  onPress,
}: {
  control: Control<NoteForm>;
  sending: boolean;
  onPress: () => void;
}) {
  const { t } = useTranslation();
  const { isValid } = useFormState({ control });

  return (
    // Dolu litPlus: kartta bastığı not balonuyla aynı renk. Metin boşken
    // nötr/soluk, gönderim uçuşta iken RENK KALIYOR (spinner beyaz; gri zeminde
    // kaybolurdu), yalnız basılamıyor.
    <TouchableOpacity
      activeOpacity={0.9}
      onPress={onPress}
      disabled={!isValid || sending}
      style={{
        marginTop: 16,
        width: "100%",
        borderRadius: 999,
        borderCurve: "continuous",
        overflow: "hidden",
        backgroundColor: isValid ? theme.litPlus : ink(0.15),
        paddingVertical: 18,
        alignItems: "center",
        justifyContent: "center",
      }}
    >
      <Text
        style={{
          color: isValid ? theme.onMedia : ink(0.5),
          fontSize: 15,
          fontWeight: "700",
          opacity: sending ? 0 : 1,
        }}
      >
        {t("note.send")}
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

export interface NoteComposerModalProps {
  visible: boolean;
  onClose: () => void;
  onSend: (comment: string) => void;
  target: NoteTarget | null;
  /** Hedef etiketini/önizlemesini çözmek için kartın prompt'ları. */
  prompts?: ProfilePromptCard[] | null;
  /** Foto hedefinde ilgili fotoğrafın uri'si — input kutusuna binen küçük önizleme. */
  photoUri?: string | null;
  targetName?: string | null;
  /** Kalan not bakiyesi (kota + kredi). `null` = backend henüz göndermiyor. */
  remaining?: number | null;
  /** Sunucudan gelen karakter tavanı; yoksa fallback. */
  maxLength?: number | null;
  sending?: boolean;
  /** Gönderim hatası — çözülmüş metin. Sheet AÇIK kalır, metin korunur. */
  errorText?: string | null;
}

export default function NoteComposerModal({
  visible,
  onClose,
  onSend,
  target,
  prompts,
  photoUri = null,
  targetName,
  remaining = null,
  maxLength,
  sending = false,
  errorText = null,
}: NoteComposerModalProps) {
  const { t } = useTranslation();
  const { height: windowHeight } = useWindowDimensions();
  const { anchorRef, onFocus, onBlur } = useKeyboardAwareField();
  // Sheet kapanırken `target` null'a düşüyor; başlık son karede boşalmasın diye
  // son geçerli hedef tutuluyor (kapanış animasyonu boyunca çiziliyor).
  const lastTarget = useRef<NoteTarget | null>(null);
  if (target) lastTarget.current = target;
  const shownTarget = target ?? lastTarget.current;
  // Aynı sebeple fotoğraf da: hedef düşünce `photoUri` de null'a gidiyor ve
  // thumbnail kapanış animasyonunun ortasında kaybolup kutuyu zıplatıyordu
  // (foto varken kutunun üst padding'i farklı).
  const lastPhotoUri = useRef<string | null>(null);
  if (target) lastPhotoUri.current = photoUri;
  const shownPhotoUri = target ? photoUri : lastPhotoUri.current;
  // Prompt chip'in soru/cevabı da `prompts`ten çözülüyor ve o da hedefle
  // birlikte null'a düşüyor → aynı dondurma.
  const lastPrompts = useRef<ProfilePromptCard[] | null>(null);
  if (target) lastPrompts.current = prompts ?? null;
  const shownPrompts = target ? prompts : lastPrompts.current;
  const showPromptChip = shownTarget?.kind === "Prompt";
  // Chip'in ölçülen boyu → taşması. Kutunun İÇİNE giren kısım sabit
  // (PREVIEW_INSET), değişen taşma: cevap iki satıra çıkınca chip yukarı doğru
  // büyüyor, yazının başladığı yer sabit kalıyor.
  const [chipHeight, setChipHeight] = useState(CHIP_HEIGHT_ESTIMATE);
  const chipOverhang = Math.max(0, chipHeight - PREVIEW_INSET);

  const limit = useMemo(
    () =>
      typeof maxLength === "number" && maxLength > 0
        ? maxLength
        : NOTE_MAX_LENGTH_FALLBACK,
    [maxLength],
  );

  // Tavan sunucudan geliyor → şema da ona bağlı; `limit` değişmedikçe yeniden
  // kurulmasın.
  const resolver = useMemo(() => zodResolver(noteSchema(limit)), [limit]);

  const { control, handleSubmit, reset } = useForm<NoteForm>({
    resolver,
    defaultValues: { comment: "" },
    // Gönder butonunun aktifliği `isValid`e bağlı; onChange olmadan boş nottan
    // dolu nota geçiş butona yansımaz.
    mode: "onChange",
  });

  // Yeni hedefe geçişte metin sıfırlanır — bir fotoğraf için yazılan cümle
  // başka bir prompt'un altında gönderilmemeli.
  useEffect(() => {
    if (visible) reset({ comment: "" });
  }, [visible, target?.kind, target?.photoIndex, target?.promptKey, reset]);

  const submit = handleSubmit(({ comment }) => {
    if (!sending) onSend(comment.trim());
  });

  return (
    <AppModal
      visible={visible}
      onClose={onClose}
      title={
        targetName
          ? t("note.composerTitleNamed", { name: targetName })
          : t("note.composerTitle")
      }
      // Sabit %70 YOK: sheet ölçülen içerik kadar açılıyor. İçerik burada dar
      // ve öngörülebilir (rozet + önizleme + kutu + buton), %70 çoğu hedefte
      // altta boş bant bırakıyordu.
      dynamicSizing
      // Tavan — çok uzun bir promptta ya da 6 satırlık notta sheet ekranı
      // yutmasın; bu noktadan sonra içerik scroll'a düşer.
      maxDynamicContentSize={windowHeight * 0.82}
      // "interactive": sheet klavye kadar YUKARI ötelenir, yani kutu da gönder
      // butonu da klavyenin üstünde kalır. Varsayılan "extend"de sheet yerinde
      // kalıp içerik alanı kısalıyor ve buton ancak scroll'la çıkıyordu —
      // içeriği klavyeyle birlikte tam sığmadığında altta kalabiliyordu.
      keyboardBehavior="interactive"
      closeButton={false}
      contentContainerStyle={{ paddingTop: 28, paddingBottom: 28 }}
    >
      {/* Bakiye — sol üstte, ürünün kendi işaretiyle. `null` iken YALNIZ glyph
          kalıyor: "0 not" yazmak backend alanı göndermediğinde yalan olurdu
          (bkz. SwipeStats.notesRemaining). */}
      <View
        style={{
          flexDirection: "row",
          alignItems: "center",
          gap: 8,
          marginBottom: 16,
        }}
      >
        {/* İkon da yazı da `text` (açık modda siyah, koyu modda beyaz) —
            sabit siyah verilirse koyu temada zeminde kaybolur. */}
        <NoteGlyph size={36} color={theme.text} />
        {typeof remaining === "number" && (
          <Text style={{ color: theme.text, fontSize: 17, fontWeight: "700" }}>
            {t("note.remaining", { count: remaining })}
          </Text>
        )}
      </View>

      {/* Anchor input'u DA gönder butonunu DA sarıyor: klavye açılınca kutunun
          altına inen buton da klavyenin üstünde kalsın (bkz.
          useKeyboardAwareField — alt kenar klavyeden `gap` kadar yukarı). */}
      <View
        ref={anchorRef}
        collapsable={false}
        // Yukarı taşan önizlemenin (thumbnail ya da prompt chip'i) üstündeki
        // bakiye rozetine değmemesi için pay — taşma kadarı + nefes.
        style={{
          marginTop: shownPhotoUri
            ? THUMB_OVERHANG + 6
            : showPromptChip
              ? chipOverhang + 6
              : 0,
        }}
      >
        <View
          style={{
            borderRadius: 30,
            borderCurve: "continuous",
            borderWidth: 0.5,
            borderColor: errorText ? theme.error : theme.hairline,
            // Üst pay iki önizlemede de AYNI: ikisi de kutunun içine
            // PREVIEW_INSET kadar giriyor (bkz. sabitin notu).
            paddingTop:
              shownPhotoUri || showPromptChip
                ? INPUT_PAD_TOP_WITH_PREVIEW
                : INPUT_PAD_TOP,
            paddingBottom: INPUT_PAD_BOTTOM,
            paddingHorizontal: 18,
          }}
        >
          <NoteField
            control={control}
            limit={limit}
            editable={!sending}
            onFocus={onFocus}
            onBlur={onBlur}
          />
        </View>

        {/* Kutunun SOL ÜST köşesine binen fotoğraf önizlemesi — "neye
            yazıyorum" metnin yanı başında dursun diye. Kutunun ÇOCUĞU DEĞİL,
            kardeşi: Yoga absolute çocuğu ebeveynin padding'ine göre
            konumlandırıyor, kutunun içinde `top: -34` taşma yerine kutunun
            içine düşerdi. Sarmalayıcının padding'i yok, üst kenarı da kutunun
            üst kenarı → ölçüler burada birebir tutuyor.
            Kutuya yer açan şey INPUT_PAD_TOP_WITH_THUMB: ilk satır fotonun
            altından başlıyor. Kontur zemin renginde — foto kutunun kenar
            çizgisini keserken kesik temiz görünsün. */}
        {/* Prompt hedefinin chip'i — thumbnail'le AYNI yerde ve aynı sebeple
            kutunun kardeşi (bkz. PromptTargetChip). İkisi bir arada olmuyor:
            hedef ya foto ya prompt. */}
        {showPromptChip && shownTarget && (
          <PromptTargetChip
            target={shownTarget}
            prompts={shownPrompts}
            overhang={chipOverhang}
            onHeight={setChipHeight}
          />
        )}

        {!!shownPhotoUri && (
          <Image
            source={{ uri: shownPhotoUri }}
            pointerEvents="none"
            style={{
              position: "absolute",
              top: -THUMB_OVERHANG,
              left: THUMB_LEFT,
              width: THUMB_SIZE,
              height: THUMB_SIZE,
              // borderCurve YOK: expo-image'ın ImageStyle'ı kabul etmiyor.
              borderRadius: 16,
              borderWidth: 3,
              borderColor: theme.bg,
              backgroundColor: theme.surfaceTranslucent,
            }}
            contentFit="cover"
            cachePolicy="memory-disk"
            recyclingKey={shownPhotoUri}
            transition={150}
          />
        )}

        {/* "Bu fotoğrafa yanıt veriyorsun" — fotoğrafın TAM SAĞINDA ve kutunun
            ÜST ÇİZGİSİNİN ÜSTÜNDE: dikeyde çizgiye ortalı (top = -lineHeight/2),
            solu karenin sağ kenarı.
            Zemini `bg` + yatay pay: kutunun konturu yazının arkasından GEÇMESİN
            diye çizgiyi orada kesiyor (fieldset legend'i gibi). Kutuda
            `overflow: hidden` yok, o yüzden bu kesme çalışıyor.
            Genişlik içeriği kadar; uzun çeviride taşmasın diye maxWidth + tek
            satır. Küçük ve `textSecondary` — bilgi notu, başlık değil. */}
        {!!shownPhotoUri && (
          <Text
            numberOfLines={1}
            pointerEvents="none"
            style={{
              position: "absolute",
              top: -REPLY_LABEL_LINE_HEIGHT / 2,
              left: THUMB_LEFT + THUMB_SIZE,
              maxWidth: "70%",
              // `textSecondary`den bir tık açık gri (açık modda #6B7280 →
              // #8E8E93); palet dışına çıkmadan yumuşuyor.
              color: theme.textMuted,
              fontSize: 14,
              // Medium: bilgi notu olduğu için kalın değil ama 12/regular
              // haliyle fazla siliktı.
              fontWeight: "500",
              lineHeight: REPLY_LABEL_LINE_HEIGHT,
              backgroundColor: theme.bg,
              paddingHorizontal: 6,
            }}
          >
            {t("note.replyingToPhoto")}
          </Text>
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
