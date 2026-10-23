import { useCallback, useEffect, useRef, useState } from "react";
import { ActivityIndicator, Text, TouchableOpacity, View } from "react-native";
import { BottomSheetTextInput } from "@gorhom/bottom-sheet";
import { useTranslation } from "react-i18next";
import AppModal, { SHEET_PICKER_SNAP_POINTS } from "@/shared/components/AppModal";
import PromptsEditor, {
  type PromptsEditorHandle,
} from "@/shared/components/PromptsEditor";
import RegisterOptionCheckbox from "@/features/auth/components/RegisterOptionCheckbox";
import { useKeyboardAwareField } from "@/shared/hooks/useKeyboardAwareField";
import {
  resolveLocalized,
  useFriendshipIntents,
  useRelationshipIntents,
} from "@/shared/queries/commonQueries";
import i18n from "@/shared/i18n";
import {
  PROMPT_ANSWER_MAX_LENGTH,
  countPromptAnswer,
  normalizePromptAnswer,
} from "@/shared/constants/limits";
import { sanitizePrompts } from "@/features/profile/promptPayload";
import type { ProfilePromptAnswer } from "@/shared/types";
import { colors } from "@/shared/theme/colors";
import type { AppMode } from "../modeTheme";

/**
 * MİNİ KURULUM — kapalı bir modun profilini açma akışı.
 *
 * Kayıt sihirbazının o moda ait iki adımının (niyet + prompt'lar) tek sheet'e
 * sıkıştırılmış hâli. Ortak alanlar (isim, yaş, boy, fotoğraflar) zaten var ve
 * SORULMUYOR — bu sheet'in tek işi modun KENDİ içeriğini toplamak.
 *
 * Neden ayrı bir sihirbaz değil: akış iki sorudan oluşuyor ve ikisi de kısa.
 * Ekran zincirine çevirmek, kullanıcıyı modunu denemek için dört dokunuş
 * uzağa iterdi; sheet aynı bağlamda kalıyor (arkada deste duruyor).
 *
 * ⚠️ `onSubmit` SUNUCU çağrısını yapan tarafta: bu bileşen yalnız veriyi
 * topluyor ve doğruluyor. Hata metni dışarıdan (`errorText`) geliyor ve sheet
 * AÇIK KALIYOR — kullanıcı yazdığını kaybetmesin (FeedComposerSheet'in aynı
 * kuralı).
 */
/**
 * "Kiminle ilgileniyorsun" seçenekleri — wire değerleri (PascalCase) ve kayıt
 * adımındaki i18n anahtarları. Liste SABİT: sunucunun `InterestedInType`
 * enum'u üç değerli ve bir uçtan gelmiyor (kayıt adımı da aynı sabiti
 * taşıyor, bkz. RegisterStep10Screen).
 */
const INTERESTED_IN_KEYS = ["Men", "Women", "NonBinary"] as const;
const INTERESTED_IN_LABEL_KEY: Record<string, string> = {
  Men: "male",
  Women: "female",
  NonBinary: "nonBinary",
};

export interface ModeSetupSheetProps {
  visible: boolean;
  onClose: () => void;
  mode: AppMode;
  onSubmit: (payload: {
    intents: string[];
    prompts: ProfilePromptAnswer[];
    /** YALNIZ Dating: "kiminle ilgileniyorsun" (en az 1 zorunlu, UT-2308). */
    interestedIn?: string[];
  }) => void;
  submitting?: boolean;
  /** Doluyken sheet açık kalır ve girilen veri korunur. */
  errorText?: string | null;
}

export default function ModeSetupSheet({
  visible,
  onClose,
  mode,
  onSubmit,
  submitting = false,
  errorText = null,
}: ModeSetupSheetProps) {
  const { t } = useTranslation();
  const isFriends = mode === "Friends";

  // Niyet listesi MODA GÖRE: Arkadaş çoklu seçim, Flört tek seçim. İki hook
  // da çağrılıyor ama yalnız biri `enabled` — `staleTime: Infinity` olduğu
  // için zaten oturum başına tek istek.
  const friendshipIntents = useFriendshipIntents();
  const relationshipIntents = useRelationshipIntents();
  const intentOptions = (isFriends ? friendshipIntents.data : relationshipIntents.data) ?? [];
  const intentsLoading = isFriends
    ? friendshipIntents.isLoading
    : relationshipIntents.isLoading;

  const [intents, setIntents] = useState<string[]>([]);
  /**
   * YALNIZ DATING: "kiminle ilgileniyorsun" (Men/Women/NonBinary, çoklu).
   *
   * Sunucu Dating açılışında bunu ZORUNLU tutuyor (UT-2308) çünkü deste
   * filtresinin tek kaynağı bu alan — boş bırakılsa kullanıcı boş desteyle
   * karşılaşırdı. Arkadaş modunda SORULMUYOR: orada eşleşme kuralı aynı
   * cinsiyet ve tercih sorusunun karşılığı yok.
   */
  const [interestedIn, setInterestedIn] = useState<string[]>([]);
  const [prompts, setPrompts] = useState<ProfilePromptAnswer[]>([]);
  const [promptIssues, setPromptIssues] = useState<Record<number, string>>({});
  const [localError, setLocalError] = useState<string | null>(null);

  // Cevaplar her tuşta değil, editörün commit'iyle geliyor — bu yüzden
  // submit anında `flush()` ile açık taslak zorla yazdırılıyor (kayıt
  // adımındaki ve profil düzenlemedeki aynı kural).
  const editorRef = useRef<PromptsEditorHandle>(null);
  const promptsRef = useRef<ProfilePromptAnswer[] | null>(null);

  // Her açılışta temiz başla: sheet kapanıp başka modla açılabiliyor.
  useEffect(() => {
    if (visible) {
      setIntents([]);
      setInterestedIn([]);
      setPrompts([]);
      setPromptIssues({});
      setLocalError(null);
      promptsRef.current = null;
    }
  }, [visible, mode]);

  const handlePromptsChange = useCallback((next: ProfilePromptAnswer[]) => {
    promptsRef.current = next;
    setPrompts(next);
    setPromptIssues((prev) => (Object.keys(prev).length > 0 ? {} : prev));
  }, []);

  const toggleIntent = useCallback(
    (enumName: string) => {
      setLocalError(null);
      setIntents((prev) => {
        if (!isFriends) {
          // Flört tek seçim: aynı satıra tekrar dokunmak temizliyor.
          return prev[0] === enumName ? [] : [enumName];
        }
        return prev.includes(enumName)
          ? prev.filter((v) => v !== enumName)
          : [...prev, enumName];
      });
    },
    [isFriends],
  );

  const handleSubmit = useCallback(() => {
    const flushed = editorRef.current?.flush() ?? promptsRef.current ?? prompts;

    if (intents.length === 0) {
      setLocalError(t("discover.mode.intentsRequired"));
      return;
    }

    // Dating'de tercih ZORUNLU (UT-2308). İstemcide durdurmak, sunucuya
    // gidip hata metnini çevirmekten iyi: alan ekranda duruyor.
    if (!isFriends && interestedIn.length === 0) {
      setLocalError(t("discover.mode.interestedInRequired"));
      return;
    }

    // Slot bazlı doğrulama: `sanitizePrompts` boş/uzun cevabı SESSİZCE elerdi
    // ve kullanıcı yazdığını sandığı cevabın kaybolduğunu görmezdi (kayıt
    // adımındaki aynı teşhis).
    const issues: Record<number, string> = {};
    (flushed ?? []).forEach((p, index) => {
      if (!p?.promptKey) return;
      const answer = normalizePromptAnswer(p.answer ?? "");
      if (!answer) issues[index] = t("profile.prompts.errors.UT-2204");
      else if (countPromptAnswer(answer) > PROMPT_ANSWER_MAX_LENGTH)
        issues[index] = t("profile.prompts.errors.UT-2205");
    });
    if (Object.keys(issues).length > 0) {
      setPromptIssues(issues);
      setLocalError(t("profile.prompts.errors.generic"));
      return;
    }

    const clean = sanitizePrompts(flushed ?? []);
    if (clean.length === 0) {
      setLocalError(t("discover.mode.promptsRequired"));
      return;
    }

    setLocalError(null);
    onSubmit({
      intents,
      prompts: clean,
      // Arkadaş modunda alan HİÇ gönderilmiyor (sunucu yok sayıyor ama ölü
      // yük göndermenin anlamı yok).
      ...(isFriends ? {} : { interestedIn }),
    });
  }, [intents, interestedIn, isFriends, onSubmit, prompts, t]);

  const shownError = errorText ?? localError;

  /**
   * Prompt cevapları sheet'in DİBİNDE (niyet listesinin altında) ve çok
   * satırlı: klavye açılınca yazdığın alan klavyenin altında kalıyordu.
   * Anchor View ölçülüp modal'ın scroll'u alanın alt kenarı klavyenin hemen
   * üstüne gelecek şekilde kaydırılıyor — profil düzenlemedeki prompt
   * alanlarıyla aynı mekanizma (bkz. useKeyboardAwareField).
   *
   * Bu sheet'te zaten gereken iki koşul var: input `BottomSheetTextInput`
   * (aşağıda) ve kap AppModal, yani hook scroll view'ı context'ten bulabiliyor.
   */
  const {
    anchorRef: promptsAnchorRef,
    onFocus: onPromptsFocus,
    onBlur: onPromptsBlur,
  } = useKeyboardAwareField();

  return (
    <AppModal
      visible={visible}
      onClose={onClose}
      title={t(`discover.mode.openTitle.${mode}`)}
      snapPoints={SHEET_PICKER_SNAP_POINTS}
      fullScreen
      closeButton
      clearGlassHeader
      contentContainerStyle={{ paddingBottom: 28 }}
    >
      <Text
        style={{
          color: colors.textSecondary,
          fontSize: 15,
          lineHeight: 21,
          marginTop: 4,
          marginBottom: 8,
        }}
      >
        {t(`discover.mode.openIntro.${mode}`)}
      </Text>

      {/* ── Niyet ── */}
      <Section
        title={t(`discover.mode.intentsTitle.${mode}`)}
        description={t(`discover.mode.intentsDescription.${mode}`)}
        first
      >
        {intentsLoading ? (
          <View style={{ paddingVertical: 24, alignItems: "center" }}>
            <ActivityIndicator color={colors.textSecondary} />
          </View>
        ) : (
          intentOptions.map((opt: any) => {
            const selected = intents.includes(opt.enumName);
            return (
              <TouchableOpacity
                key={opt.enumName}
                activeOpacity={1}
                onPress={() => toggleIntent(opt.enumName)}
                style={{
                  flexDirection: "row",
                  alignItems: "center",
                  justifyContent: "space-between",
                  paddingVertical: 16,
                }}
              >
                <Text
                  style={{
                    color: selected ? colors.text : colors.textSecondary,
                    fontSize: 16,
                    lineHeight: 22,
                    fontWeight: "500",
                    flex: 1,
                    marginRight: 12,
                  }}
                >
                  {/* Arkadaş: yerel birinci-ağız cümlesi, sunucu etiketi yedek.
                      Flört: kayıt adımıyla AYNI anahtar ailesi — iki ekran aynı
                      cümleyi söylemek zorunda. */}
                  {isFriends
                    ? t(`discover.friendshipIntents.${opt.enumName}`, {
                        defaultValue: resolveLocalized(
                          opt.display,
                          i18n.language,
                          opt.name,
                        ),
                      })
                    : t(`auth.step14.intents.${opt.enumName}`, {
                        defaultValue: opt.name,
                      })}
                </Text>
                <RegisterOptionCheckbox selected={selected} />
              </TouchableOpacity>
            );
          })
        )}
      </Section>

      {/* ── Kiminle ilgileniyorsun — YALNIZ DATING ── */}
      {!isFriends ? (
        <Section
          title={t("discover.mode.interestedInTitle")}
          description={t("discover.mode.interestedInDescription")}
        >
          {INTERESTED_IN_KEYS.map((key) => {
            const selected = interestedIn.includes(key);
            return (
              <TouchableOpacity
                key={key}
                activeOpacity={1}
                onPress={() => {
                  setLocalError(null);
                  setInterestedIn((prev) =>
                    prev.includes(key)
                      ? prev.filter((v) => v !== key)
                      : [...prev, key],
                  );
                }}
                style={{
                  flexDirection: "row",
                  alignItems: "center",
                  justifyContent: "space-between",
                  paddingVertical: 16,
                }}
              >
                <Text
                  style={{
                    color: selected ? colors.text : colors.textSecondary,
                    fontSize: 16,
                    lineHeight: 22,
                    fontWeight: "500",
                    flex: 1,
                    marginRight: 12,
                  }}
                >
                  {/* Kayıt adımıyla AYNI anahtar ailesi (auth.step10): aynı
                      soru iki ekranda iki farklı metinle görünmesin. */}
                  {t(`auth.step10.${INTERESTED_IN_LABEL_KEY[key]}`)}
                </Text>
                <RegisterOptionCheckbox selected={selected} />
              </TouchableOpacity>
            );
          })}
        </Section>
      ) : null}

      {/* ── Prompt'lar ── */}
      <Section
        title={t("discover.mode.promptsTitle")}
        description={t("discover.mode.promptsDescription")}
      >
        {/* ⚠️ `collapsable={false}`: RN bu View'ı optimize edip native ağaçtan
            düşürürse `measureInWindow` ölçemez, scroll hesabı çalışmaz. */}
        <View ref={promptsAnchorRef} collapsable={false}>
          <PromptsEditor
            ref={editorRef}
            // Katalog bu modun prompt'larıyla süzülüyor (bkz. promptAllowsMode).
            mode={mode}
            value={prompts}
            onChange={handlePromptsChange}
            fieldErrors={promptIssues}
            // Sheet içinde ŞART: düz TextInput'ta gorhom klavye target'ını set
            // etmiyor ve sheet klavye davranışını atlıyor.
            InputComponent={BottomSheetTextInput}
            // Burada en az 1 zorunlu (sunucu da öyle) — sonuncuyu silmek
            // kullanıcıyı gönderemediği bir durumda bırakırdı.
            allowRemoveLast={false}
            onInputFocus={onPromptsFocus}
            onInputBlur={onPromptsBlur}
          />
        </View>
      </Section>

      {shownError ? (
        <Text
          style={{
            color: colors.error,
            fontSize: 14,
            lineHeight: 20,
            marginTop: 16,
          }}
        >
          {shownError}
        </Text>
      ) : null}

      <TouchableOpacity
        activeOpacity={0.8}
        onPress={handleSubmit}
        disabled={submitting}
        style={{
          marginTop: 24,
          borderRadius: 999,
          borderCurve: "continuous",
          overflow: "hidden",
          backgroundColor: colors.inverseSurface,
          opacity: submitting ? 0.6 : 1,
        }}
      >
        <Text
          style={{
            color: colors.onInverseSurface,
            paddingVertical: 18,
            fontWeight: "700",
            fontSize: 15,
            textAlign: "center",
          }}
        >
          {submitting ? t("discover.mode.opening") : t("discover.mode.openSubmit")}
        </Text>
      </TouchableOpacity>
    </AppModal>
  );
}

/**
 * Bölüm başlığı — akış filtre sheet'indeki `Section`ın birebir kalıbı
 * (20/600 başlık + 14/20 açıklama + 28 üst pay). Oradaki bileşen o dosyaya
 * özel; buraya kopyalanmasının sebebi aynı görsel dil, farklı dosya.
 */
function Section({
  title,
  description,
  first,
  children,
}: {
  title: string;
  description: string;
  first?: boolean;
  children: React.ReactNode;
}) {
  return (
    <View style={{ marginTop: first ? 8 : 28 }}>
      <Text style={{ color: colors.text, fontSize: 20, fontWeight: "600" }}>
        {title}
      </Text>
      <Text
        style={{
          color: colors.textSecondary,
          fontSize: 14,
          lineHeight: 20,
          marginTop: 6,
          marginBottom: 12,
        }}
      >
        {description}
      </Text>
      {children}
    </View>
  );
}
