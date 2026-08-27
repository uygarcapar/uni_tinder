import React, { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useTranslation } from "react-i18next";
import {
  Pressable,
  StyleSheet,
  Text,
  TextInput,
  TouchableOpacity,
  View,
} from "react-native";
import { Plus, Trash2, ChevronDown } from "lucide-react-native";
import SFIcon from "@/shared/components/SFIcon";
import PromptPickerModal from "@/shared/components/PromptPickerModal";
import {
  findPrompt,
  resolveLocalized,
  usePrompts,
  type PromptGroupOption,
} from "@/shared/queries/commonQueries";
import { MAX_PROFILE_PROMPTS } from "@/shared/constants/limits";
import type { ProfilePromptAnswer } from "@/shared/types";
import type { PromptFieldError } from "@/features/profile/promptErrors";
import { colors } from "../theme/colors";

type Props = {
  value: ProfilePromptAnswer[];
  onChange: (next: ProfilePromptAnswer[]) => void;
  /** Sunucudan dönen slot bazlı retler (`UT-22xx`) — ilgili cevabın altına yazılır. */
  serverErrors?: readonly PromptFieldError[];
  /** İstemci tarafı doğrulama hataları: index → mesaj. */
  fieldErrors?: Record<number, string>;
  /**
   * Son cevabın silinmesine izin var mı?
   *
   * Profil düzenlemede FALSE olmalı: `Prompts` boş gönderilemediği için
   * (multipart'ta boş liste "gönderilmedi"den ayırt edilemiyor) hepsini silen
   * istek sunucuda sessizce no-op olur — kullanıcı sildiğini sanır. Hiç
   * prompt'u olmayan kullanıcı zaten 0'da; ona kural uygulanmıyor.
   *
   * Kayıtta da FALSE: orada zaten en az 1 zorunlu.
   */
  allowRemoveLast?: boolean;
  /**
   * Metin girişi bileşeni. Bottom sheet içinde `BottomSheetTextInput` ŞART:
   * düz TextInput'ta gorhom klavye target'ını set etmiyor ve sheet klavye
   * davranışını atlıyor. Sheet dışında (kayıt ekranı) varsayılan yeterli.
   */
  InputComponent?: React.ComponentType<any>;
  onInputFocus?: () => void;
  onInputBlur?: () => void;
};

/**
 * Prompt cevaplarını düzenleyen ortak bölüm — profil düzenleme ve kayıt adımı
 * aynı bileşeni kullanıyor.
 *
 * Sıra ÖNEMLİ: dizideki index kartta çizilme sırası ve backend `DisplayOrder`
 * değeri. Slot ekleme sona yapılıyor, silme diziyi kaydırıyor.
 */
export default function PromptsEditor({
  value,
  onChange,
  serverErrors,
  fieldErrors,
  allowRemoveLast = false,
  InputComponent = TextInput,
  onInputFocus,
  onInputBlur,
}: Props) {
  const { t, i18n } = useTranslation();
  const { data: groups } = usePrompts();
  // null = kapalı, sayı = o slotun sorusu değiştiriliyor, -1 = yeni slot.
  const [pickerFor, setPickerFor] = useState<number | null>(null);
  const [lastOneWarning, setLastOneWarning] = useState(false);
  // Cevap düzenleme: hangi slot açık ve o slotun TASLAK metni. Yazarken üst
  // state'e YAZILMIYOR — taslak yalnız "Bitir"e basınca (ya da alan odaktan
  // çıkınca) commit ediliyor. Odak kaybında da commit etmenin sebebi: kullanıcı
  // "Bitir" yerine doğrudan "Devam"/"Kaydet"e basarsa yazdığı sessizce
  // kaybolurdu.
  const [editingIndex, setEditingIndex] = useState<number | null>(null);
  const [draft, setDraft] = useState("");
  // Alan artık hep mount: `autoFocus` çalışmıyor, odak elle veriliyor.
  const inputRefs = useRef<Record<number, any>>({});
  useEffect(() => {
    if (editingIndex === null) return;
    // `editable` bu render'da true oldu — focus() ondan sonra iş görüyor.
    inputRefs.current[editingIndex]?.focus?.();
  }, [editingIndex]);

  const usedKeys = useMemo(() => value.map((p) => p.promptKey), [value]);

  const promptLabel = useCallback(
    (promptKey: string): string => {
      const option = findPrompt(groups as PromptGroupOption[] | undefined, promptKey);
      // Katalogda bulunamayan anahtar: pasife alınmış VE katalogdan da düşmüş
      // olurdu — backend soft-delete garantisi verdiği için beklenmiyor.
      // Yine de anahtarı ham göstermek boş başlıktan iyi.
      return option
        ? resolveLocalized(option.display, i18n.language, option.name)
        : promptKey;
    },
    [groups, i18n.language],
  );

  const serverErrorFor = useCallback(
    (index: number): string | null => {
      const hit = (serverErrors ?? []).find((e) => e.index === index);
      return hit ? hit.code : null;
    },
    [serverErrors],
  );

  const setAnswer = (index: number, answer: string) => {
    const next = value.slice();
    next[index] = { ...next[index], answer };
    onChange(next);
  };

  const beginEdit = (index: number) => {
    setDraft(value[index]?.answer ?? "");
    setEditingIndex(index);
  };

  // "Bitir" basışı ile odak kaybı aynı karede iki kez çağırabilir (butona
  // dokunmak önce input'u blur eder): ikinci çağrı aynı taslağı aynı slota
  // yazdığı için etkisiz — üst state'e giden değer birebir aynı.
  const commitEdit = () => {
    if (editingIndex === null) return;
    setAnswer(editingIndex, draft);
    setEditingIndex(null);
  };

  const setPromptKey = (index: number, promptKey: string) => {
    const next = value.slice();
    const isNewSlot = index < 0 || index >= next.length;
    if (isNewSlot) {
      next.push({ promptKey, answer: "" });
    } else {
      next[index] = { ...next[index], promptKey };
    }
    onChange(next);
    // Yeni slotta soru seçilir seçilmez cevaba geçiliyor — kullanıcı ayrıca
    // "Düzenle"ye basmak zorunda kalmasın. Mevcut slotun sorusu değişiyorsa
    // cevap duruyor, düzenleme moduna girmiyoruz.
    if (isNewSlot) {
      setDraft("");
      setEditingIndex(next.length - 1);
    }
  };

  const removeAt = (index: number) => {
    if (value.length <= 1 && !allowRemoveLast) {
      setLastOneWarning(true);
      return;
    }
    setLastOneWarning(false);
    // Silme diziyi kaydırdığı için açık düzenleme kapatılıyor: editingIndex
    // artık başka bir slotu gösterirdi.
    setEditingIndex(null);
    onChange(value.filter((_, i) => i !== index));
  };

  const canAdd = value.length < MAX_PROFILE_PROMPTS;

  return (
    <View>
      {value.map((prompt, index) => {
        const serverCode = serverErrorFor(index);
        const clientError = fieldErrors?.[index];
        const isEditing = editingIndex === index;

        return (
          <View key={`${prompt.promptKey}-${index}`} style={{ marginBottom: 32 }}>
            {/* Başlık satırı: soruya basınca seçici açılır. Çöp kutusu YALNIZ
                düzenleme modunda görünüyor, chevron ise yalnız okuma modunda —
                düzenlerken satırda tek eylem silme olsun. */}
            <View
              style={{
                flexDirection: "row",
                alignItems: "center",
                marginBottom: 8,
                gap: 8,
              }}
            >
              <TouchableOpacity
                activeOpacity={0.7}
                onPress={() => setPickerFor(index)}
                style={{
                  flex: 1,
                  flexDirection: "row",
                  alignItems: "center",
                  gap: 6,
                }}
              >
                <Text
                  numberOfLines={2}
                  style={{
                    // Açık gri: altındaki cevap (25px, `text`) baskın kalsın
                    // diye soru bilinçli olarak sönük.
                    color: colors.textMuted,
                    fontSize: 18,
                    fontWeight: "600",
                    flexShrink: 1,
                  }}
                >
                  {promptLabel(prompt.promptKey)}
                </Text>
                {!isEditing && (
                  <SFIcon
                    name="chevron.down"
                    fallback={ChevronDown}
                    size={16}
                    color={colors.textSecondary}
                    strokeWidth={2}
                    weight="semibold"
                  />
                )}
              </TouchableOpacity>
              {isEditing && (
                <TouchableOpacity
                  activeOpacity={0.7}
                  onPress={() => removeAt(index)}
                  hitSlop={8}
                  accessibilityLabel={t('profile.prompts.remove')}
                >
                  <SFIcon
                    name="trash"
                    fallback={Trash2}
                    size={18}
                    color={colors.textSecondary}
                    strokeWidth={2}
                    weight="regular"
                  />
                </TouchableOpacity>
              )}
            </View>

            {/* Cevap + Düzenle/Bitir pili aynı satırda; pil metnin SAĞINDA ve
                üst hizada duruyor (cevap uzayınca aşağı kaymasın). */}
            <View style={{ flexDirection: "row", alignItems: "flex-start", gap: 8 }}>
            {/* Okuma ve düzenleme AYNI bileşen: sadece `editable` değişiyor.
                Önce okuma modunda <Text>, düzenlemede <TextInput> vardı ve iki
                bileşenin metin kutusu metrikleri (iOS text container inset'i)
                birebir aynı olmadığı için "Düzenle"ye basınca yazı bir tık
                kayıyordu. Tek bileşende kayma yok. */}
            <View style={{ flex: 1 }}>
            <InputComponent
              ref={(node: any) => {
                inputRefs.current[index] = node;
              }}
              value={isEditing ? draft : prompt.answer ?? ""}
              editable={isEditing}
              onChangeText={setDraft}
              onFocus={onInputFocus}
              // Odak kaybında da commit: kullanıcı "Bitir" yerine doğrudan
              // başka bir yere basarsa taslak kaybolmasın.
              onBlur={() => {
                onInputBlur?.();
                commitEdit();
              }}
              // İmleç ve seçim rengi: iOS'ta varsayılan sistem mavisi kalıyordu,
              // açık modda cevabın mürekkebiyle uyumsuzdu.
              selectionColor={colors.text}
              cursorColor={colors.text}
              multiline
              // ⚠️ RN `maxLength` KULLANILMIYOR: UTF-16 birimi sayıyor, backend
              // ise code point (K5). Emoji'li cevapta RN sınırı erken keserdi ve
              // kullanıcı hakkının bir kısmını kullanamazdı. Sınır kaydederken
              // `countPromptAnswer` ile doğrulanıyor (uzun cevap UT-2205 ile
              // işaretleniyor); metin sessizce kırpılmıyor. Canlı sayaç YOK —
              // kaldırıldı, alanın altında yalnız hata satırı var.
              placeholder={t('profile.prompts.answerPlaceholder')}
              placeholderTextColor={colors.textSecondary}
              // ÇERÇEVESİZ ve KUTUSUZ (bilinçli): cevap bir form alanı gibi
              // değil, kartta göründüğü gibi — büyük, yarı kalın bir cümle
              // olarak yazılıyor. Bu yüzden border/radius/dolgu yok; yalnız
              // sorunun altında duran bir metin bloğu.
              // Hata artık kenarlıkla DEĞİL, altındaki kırmızı mesajla
              // anlatılıyor (kenarlık da sayaç da kalmadı).
              //
              // `minHeight` YOK (bilinçli): alan yazılan satır kadar yer
              // kaplasın — boşken tek satır, cevap uzadıkça büyüyor. Sabit
              // yükseklik verilirse kısa cevaplarda altta boş bant kalıyor.
              style={{
                color: colors.text,
                fontSize: 25,
                fontWeight: "600",
                lineHeight: 32,
                textAlignVertical: "top",
                paddingHorizontal: 4,
                paddingTop: 10,
                paddingBottom: 10,
              }}
            />
            {/* Okuma modunda input dokunuşa cevap vermiyor (editable=false);
                metne basınca da düzenleme açılsın diye üstte şeffaf katman. */}
            {!isEditing && (
              <Pressable
                onPress={() => beginEdit(index)}
                style={StyleSheet.absoluteFill}
                accessibilityLabel={t('profile.prompts.editAnswer')}
              />
            )}
            </View>

              <TouchableOpacity
                activeOpacity={1}
                onPress={() => (isEditing ? commitEdit() : beginEdit(index))}
                style={{
                  marginTop: 10,
                  paddingHorizontal: 14,
                  paddingVertical: 8,
                  borderRadius: 999,
                  borderCurve: "continuous",
                  borderWidth: 0.5,
                  borderColor: colors.hairline,
                  backgroundColor: isEditing ? colors.inverseSurfaceSoft : "transparent",
                }}
              >
                <Text
                  style={{
                    color: isEditing ? colors.onInverseSurface : colors.text,
                    fontSize: 13,
                    fontWeight: "600",
                  }}
                >
                  {isEditing
                    ? t('profile.prompts.finishAnswer')
                    : t('profile.prompts.editAnswer')}
                </Text>
              </TouchableOpacity>
            </View>

            {/* Hata satırı: yalnız hata varken çiziliyor. Sayaç kaldırıldığı
                için sürekli duran bir alt satır kalmadı — boşken slot da
                kısalıyor. */}
            {serverCode || clientError ? (
              <Text
                style={{
                  color: colors.error,
                  fontSize: 12,
                  marginTop: 4,
                  paddingHorizontal: 4,
                }}
                numberOfLines={2}
              >
                {serverCode
                  ? t(`profile.prompts.errors.${serverCode}`, {
                      defaultValue: t('profile.prompts.errors.generic'),
                    })
                  : clientError}
              </Text>
            ) : null}
          </View>
        );
      })}

      {lastOneWarning && (
        <Text style={{ color: colors.error, fontSize: 15, marginBottom: 10 }}>
          {t('profile.prompts.lastOneKept')}
        </Text>
      )}

      {canAdd && (
        <TouchableOpacity
          activeOpacity={1}
          onPress={() => setPickerFor(-1)}
          style={{
            flexDirection: "row",
            alignItems: "center",
            gap: 8,
            paddingVertical: 18,
            paddingHorizontal: 24,
            borderRadius: 999,
            borderCurve: "continuous",
            borderWidth: 0.5,
            borderColor: colors.hairline,
            alignSelf: "flex-start",
          }}
        >
          <SFIcon name="plus" fallback={Plus} size={16} color={colors.text} strokeWidth={2} weight="semibold" />
          <Text style={{ color: colors.text, fontSize: 14, fontWeight: "500" }}>
            {t('profile.prompts.addSlot')}
          </Text>
        </TouchableOpacity>
      )}

      <PromptPickerModal
        visible={pickerFor !== null}
        onClose={() => setPickerFor(null)}
        groups={groups}
        // Düzenlenen slotun KENDİ anahtarı elenmiyor — aksi hâlde kullanıcı
        // seçili sorusunu listede göremezdi.
        usedKeys={
          pickerFor !== null && pickerFor >= 0
            ? usedKeys.filter((_, i) => i !== pickerFor)
            : usedKeys
        }
        selectedKey={
          pickerFor !== null && pickerFor >= 0 ? value[pickerFor]?.promptKey : null
        }
        onSelect={(enumName) => {
          if (pickerFor === null) return;
          setPromptKey(pickerFor, enumName);
          setLastOneWarning(false);
        }}
      />
    </View>
  );
}
