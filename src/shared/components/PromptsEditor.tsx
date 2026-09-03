import React, { memo, useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useTranslation } from "react-i18next";
import { useForm, Controller } from "react-hook-form";
import {
  Pressable,
  StyleSheet,
  Text,
  TextInput,
  TouchableOpacity,
  View,
} from "react-native";
import { Plus, Trash2, ChevronDown } from "@/shared/icons";
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

type RowProps = {
  index: number;
  answer: string;
  label: string;
  isEditing: boolean;
  errorText: string | null;
  InputComponent: React.ComponentType<any>;
  onPickPrompt: (index: number) => void;
  onBeginEdit: (index: number) => void;
  onCommit: (index: number, answer: string) => void;
  onRemove: (index: number) => void;
  onInputFocus?: () => void;
  onInputBlur?: () => void;
  registerRef: (index: number, node: any) => void;
};

/**
 * Tek prompt slotu.
 *
 * Cevap taslağı SLOT BAZINDA react-hook-form'da tutuluyor: eskiden editörün
 * gövdesinde tek bir `draft` state'i vardı ve her tuşta bütün slotlar + soru
 * seçici modal yeniden render oluyordu. Artık tuş başına render alan tek yer
 * bu satırın `Controller`'ı; `memo` sayesinde komşu slotlar hiç uyanmıyor.
 *
 * Üst state'e YAZILMIYOR: taslak yalnız "Bitir"e basınca (ya da alan odaktan
 * çıkınca) commit ediliyor — odak kaybında da commit etmenin sebebi, kullanıcı
 * "Bitir" yerine doğrudan "Devam"/"Kaydet"e basarsa yazdığının kaybolması.
 */
const PromptRow = memo(function PromptRow({
  index,
  answer,
  label,
  isEditing,
  errorText,
  InputComponent,
  onPickPrompt,
  onBeginEdit,
  onCommit,
  onRemove,
  onInputFocus,
  onInputBlur,
  registerRef,
}: RowProps) {
  const { t } = useTranslation();
  const { control, getValues, reset } = useForm<{ answer: string }>({
    defaultValues: { answer },
  });

  // Slot dışarıdan değişince (commit sonrası üst state, silme/kaydırma) alanın
  // değeri tazeleniyor. Düzenleme AÇIKKEN dokunulmuyor — kullanıcının yazmakta
  // olduğu taslak ezilirdi.
  const wasEditing = useRef(isEditing);
  useEffect(() => {
    const justClosed = wasEditing.current && !isEditing;
    wasEditing.current = isEditing;
    if (isEditing) return;
    // Zaten aynıysa reset ETME: commit sonrası üst state bu satırın yazdığı
    // metnin ta kendisi oluyor, gereksiz bir Controller render'ı doğururdu.
    const draft = getValues("answer");
    if (draft === answer) return;
    // Slot KAPANIRKEN taslak hâlâ üst state'ten farklıysa yazılmamış demektir:
    // kullanıcı "Bitir"e basmadan başka bir slota (ya da metnine) geçti.
    // `keyboardShouldPersistTaps="handled"` yüzünden o dokunuş input'u blur
    // ETMİYOR; blur ancak odak diğer slota devredildikten, yani bu slot çoktan
    // kapandıktan sonra geliyor. Reset burada çalışırsa kullanıcının yazdığı
    // cevap sessizce silinir (kart boş cevapla kalır, kayıt adımı "cevabını
    // yazmayı unutma" der). O yüzden silmek yerine commit ediyoruz.
    if (justClosed) {
      onCommit(index, draft);
      return;
    }
    reset({ answer });
  }, [answer, isEditing, index, onCommit, reset, getValues]);

  const setInputRef = useCallback(
    (node: any) => registerRef(index, node),
    [registerRef, index],
  );

  const commit = useCallback(
    () => onCommit(index, getValues("answer")),
    [onCommit, index, getValues],
  );

  return (
    <View style={{ marginBottom: 32 }}>
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
          onPress={() => onPickPrompt(index)}
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
            {label}
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
            onPress={() => onRemove(index)}
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
          <Controller
            control={control}
            name="answer"
            render={({ field: { onChange, value } }) => (
              <InputComponent
                ref={setInputRef}
                value={value}
                editable={isEditing}
                onChangeText={onChange}
                onFocus={onInputFocus}
                // Odak kaybında da commit: kullanıcı "Bitir" yerine doğrudan
                // başka bir yere basarsa taslak kaybolmasın.
                onBlur={() => {
                  onInputBlur?.();
                  commit();
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
            )}
          />
          {/* Okuma modunda input dokunuşa cevap vermiyor (editable=false);
              metne basınca da düzenleme açılsın diye üstte şeffaf katman. */}
          {!isEditing && (
            <Pressable
              onPress={() => onBeginEdit(index)}
              style={StyleSheet.absoluteFill}
              accessibilityLabel={t('profile.prompts.editAnswer')}
            />
          )}
        </View>

        <TouchableOpacity
          activeOpacity={1}
          onPress={() => (isEditing ? commit() : onBeginEdit(index))}
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
      {errorText ? (
        <Text
          style={{
            color: colors.error,
            fontSize: 12,
            marginTop: 4,
            paddingHorizontal: 4,
          }}
          numberOfLines={2}
        >
          {errorText}
        </Text>
      ) : null}
    </View>
  );
});

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
  // Hangi slotun açık olduğu BURADA, taslak metin ise slotun kendi formunda
  // (bkz. PromptRow) — yazarken bu bileşen ve komşu slotlar render almasın.
  const [editingIndex, setEditingIndex] = useState<number | null>(null);
  // "Bitir" basışı ile odak kaybı aynı karede iki kez commit çağırabilir
  // (butona dokunmak önce input'u blur eder); açık slot ref'ten de takip
  // ediliyor ki ikinci çağrı açık slotu kapatmasın.
  const editingRef = useRef<number | null>(null);
  // Üst state'in SON hâli. Mutasyonlar `value` prop'undan değil buradan
  // türetiliyor: aynı karede iki yazma olursa (blur + "Bitir", ya da bir slot
  // kapanırken commit ederken diğerinin açılması) ikincisi prop'un henüz
  // güncellenmemiş hâlini görür ve birincinin yazdığını geri alırdı.
  const latest = useRef(value);
  latest.current = value;
  const emit = useCallback(
    (next: ProfilePromptAnswer[]) => {
      latest.current = next;
      onChange(next);
    },
    [onChange],
  );
  // Alan artık hep mount: `autoFocus` çalışmıyor, odak elle veriliyor.
  const inputRefs = useRef<Record<number, any>>({});
  useEffect(() => {
    if (editingIndex === null) return;
    // `editable` bu render'da true oldu — focus() ondan sonra iş görüyor.
    inputRefs.current[editingIndex]?.focus?.();
  }, [editingIndex]);
  const registerRef = useCallback((index: number, node: any) => {
    inputRefs.current[index] = node;
  }, []);

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

  // Sunucu retleri (UT-22xx) ve istemci doğrulaması tek metne indirgeniyor —
  // slot bileşeni hazır string alsın, `memo` karşılaştırması nesneye takılmasın.
  const errorTextFor = useCallback(
    (index: number): string | null => {
      const serverCode = (serverErrors ?? []).find((e) => e.index === index)?.code;
      if (serverCode) {
        return t(`profile.prompts.errors.${serverCode}`, {
          defaultValue: t('profile.prompts.errors.generic'),
        });
      }
      return fieldErrors?.[index] ?? null;
    },
    [serverErrors, fieldErrors, t],
  );

  const beginEdit = useCallback((index: number) => {
    editingRef.current = index;
    setEditingIndex(index);
  }, []);

  const commitEdit = useCallback(
    (index: number, answer: string) => {
      // Düzenlemeyi YALNIZ commit eden slot açık olansa kapat. Geç gelen blur
      // (odak başka slota devredildikten sonra) burada `index`i açık slottan
      // farklı getirir: taslağı yine de yazmak gerekiyor — yoksa kullanıcının
      // cevabı kaybolur — ama kullanıcının yeni açtığı slotu kapatmamalı.
      if (editingRef.current === index) {
        editingRef.current = null;
        setEditingIndex(null);
      }
      // Metin değişmediyse üst state'e HİÇ dokunma: blur + "Bitir" ikilisinde
      // ve hiç yazılmadan kapanan slotta gereksiz dispatch/render olmasın.
      const current = latest.current;
      if ((current[index]?.answer ?? "") === answer) return;
      const next = current.slice();
      next[index] = { ...next[index], answer };
      emit(next);
    },
    [emit],
  );

  const setPromptKey = (index: number, promptKey: string) => {
    const next = latest.current.slice();
    const isNewSlot = index < 0 || index >= next.length;
    if (isNewSlot) {
      next.push({ promptKey, answer: "" });
    } else {
      next[index] = { ...next[index], promptKey };
    }
    emit(next);
    // Yeni slotta soru seçilir seçilmez cevaba geçiliyor — kullanıcı ayrıca
    // "Düzenle"ye basmak zorunda kalmasın. Mevcut slotun sorusu değişiyorsa
    // cevap duruyor, düzenleme moduna girmiyoruz.
    if (isNewSlot) {
      beginEdit(next.length - 1);
    }
  };

  const removeAt = useCallback((index: number) => {
    const current = latest.current;
    if (current.length <= 1 && !allowRemoveLast) {
      setLastOneWarning(true);
      return;
    }
    setLastOneWarning(false);
    // Silme diziyi kaydırdığı için açık düzenleme kapatılıyor: editingIndex
    // artık başka bir slotu gösterirdi.
    editingRef.current = null;
    setEditingIndex(null);
    emit(current.filter((_, i) => i !== index));
  }, [emit, allowRemoveLast]);

  const canAdd = value.length < MAX_PROFILE_PROMPTS;

  return (
    <View>
      {value.map((prompt, index) => (
        <PromptRow
          key={`${prompt.promptKey}-${index}`}
          index={index}
          answer={prompt.answer ?? ""}
          label={promptLabel(prompt.promptKey)}
          isEditing={editingIndex === index}
          errorText={errorTextFor(index)}
          InputComponent={InputComponent}
          onPickPrompt={setPickerFor}
          onBeginEdit={beginEdit}
          onCommit={commitEdit}
          onRemove={removeAt}
          onInputFocus={onInputFocus}
          onInputBlur={onInputBlur}
          registerRef={registerRef}
        />
      ))}

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
