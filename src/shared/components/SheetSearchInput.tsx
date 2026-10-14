import { BottomSheetTextInput } from "@gorhom/bottom-sheet";
import { useRef, useState } from "react";
import {
  TouchableOpacity,
  View,
  type StyleProp,
  type TextInput,
  type ViewStyle,
} from "react-native";
import Animated, { ZoomIn, ZoomOut } from "react-native-reanimated";
import SFIcon from "@/shared/components/SFIcon";
import { Search, X } from "@/shared/icons";
import { colors, ink } from "@/shared/theme/colors";

/**
 * Seçici sheet'lerinin arama kapsülü — dil, kampüs, şehir, bölüm ve prompt
 * seçicilerinin HEPSİ bunu kullanıyor.
 *
 * TEK BİLEŞEN OLMASININ SEBEBİ: aynı 40 satır beş dosyada kopyalıydı ve her
 * görsel düzeltme (hiza, üst boşluk) beş yerde ayrı ayrı uygulanmak zorunda
 * kalıyordu — biri atlanınca seçiciler birbirinden görünür şekilde ayrılıyordu.
 *
 * ⚠️ GÖRÜNÜM MESAJLAR EKRANININ ARAMA ÇUBUĞUNUN KOPYASI (MessagesScreen'deki
 * çubuk kanonik): dolgulu kapsül (`colors.surface`) + KENARLIK YOK, yükseklik
 * `SEARCH_BAR_HEIGHT`, 16px yatay dolgu, 8px aralık, 18pt yazı, 18pt büyüteç ve
 * sağda yazı varken beliren temizle çipi. Eskiden burası kenarlıklı/50px/15pt
 * ayrı bir dildi; modalla sohbet arası geçişte çubuk görünür şekilde değişiyordu.
 * Bir sayıyı burada değiştirirken MessagesScreen'deki çubuğa da bak — ölçü
 * `SEARCH_BAR_HEIGHT` üzerinden ortak, renk/punto elle eşlenmiş durumda.
 *
 * ⚠️ BÜYÜTEÇ AKIŞTA, mutlak DEĞİL. Eski yazımda ikon `position: absolute` +
 * `top/bottom: 0` ile KAPSÜLÜN merkezine, metin ise input'un kendi ölçtüğü
 * satır kutusuna oturuyordu; iki merkez çakışmadığı için yazı ikonun altında
 * kalıyordu (sabit yükseklik + `paddingVertical: 0` da düzeltmedi). Tek satırda
 * `alignItems: "center"` ikisini aynı eksene bağlıyor. Bu yüzden kapsül input'ta
 * değil TAŞIYICIDA; input'a yükseklik/dikey dolgu vermek hizayı geri bozar.
 *
 * ⚠️ PLACEHOLDER YOK ve `placeholder` PROP'U DA YOK — kasıtlı, Mesajlar'daki
 * çubukta da yok. Boş kapsülde yalnız büyüteç duruyor; "Üniversite ara" gibi bir
 * ipucu metni geri eklenecekse MessagesScreen'deki çubuğa da eklenmeli, yoksa
 * iki çubuk yine ayrışır.
 *
 * `BottomSheetTextInput` kullanılıyor (düz `TextInput` değil): beş çağıranın
 * hepsi bir bottom sheet'in içinde ve klavye açılınken sheet'in üst durağa
 * çıkması buna bağlı.
 */

/**
 * Kapsül yüksekliği — MessagesScreen'in arama çubuğuyla TEK KAYNAK (o ekran bu
 * sabiti import ediyor), ikon ve yazı bunun merkezine hizalanıyor.
 */
export const SEARCH_BAR_HEIGHT = 40;

export interface SheetSearchInputProps {
  /**
   * Verilmezse input KONTROLSÜZ kalıyor (`defaultValue=""`): bölüm seçicisi
   * böyle çalışıyor — liste zaten arama state'iyle yeniden diziliyor, input'un
   * değerini bir de dışarıdan geri yazmak hızlı yazarken imleci oynatıyordu.
   */
  value?: string;
  onChangeText: (text: string) => void;
  /** Taşıyıcıya eklenen stil — boşluk ayarları (ör. `marginTop`) için. */
  style?: StyleProp<ViewStyle>;
}

export default function SheetSearchInput({
  value,
  onChangeText,
  style,
}: SheetSearchInputProps) {
  // Ref kendi yüzeyiyle tipleniyor ve prop'a cast ediliyor: `gorhom`'un
  // `BottomSheetTextInput` tipi ref olarak INSTANCE'ı değil gesture-handler'ın
  // BİLEŞEN tipini gösteriyor (üstteki yanlış yazım), yani doğrudan `TextInput`
  // ref'i atanamıyor ve o tip üzerinden `focus`/`clear` da görünmüyor.
  const inputRef = useRef<Pick<TextInput, "focus" | "clear"> | null>(null);
  /**
   * Temizle çipi kontrolsüz yazımda da görünmek zorunda (bölüm seçicisi) ve
   * orada dışarıdan okunacak bir değer yok — yalnız "yazı var mı" bilgisini
   * tutuyoruz. Kontrollü yazımda çağıranın değeri kazanıyor; burada tutulan
   * uzunluk input'a GERİ YAZILMIYOR, yani imleç kurgusu bozulmuyor.
   */
  const [typedLength, setTypedLength] = useState(0);
  const hasText = (value !== undefined ? value.length : typedLength) > 0;

  const handleChangeText = (text: string) => {
    if (value === undefined) setTypedLength(text.length);
    onChangeText(text);
  };

  const clear = () => {
    // İKİSİ DE ŞART: `clear()` kontrolsüz yazımdaki native metni siliyor,
    // `onChangeText("")` ise listeyi/kontrollü değeri sıfırlıyor.
    inputRef.current?.clear();
    setTypedLength(0);
    onChangeText("");
  };

  return (
    <TouchableOpacity
      activeOpacity={1}
      onPress={() => inputRef.current?.focus()}
      style={[
        {
          flexDirection: "row",
          alignItems: "center",
          height: SEARCH_BAR_HEIGHT,
          backgroundColor: colors.surface,
          borderRadius: 999,
          borderCurve: "continuous",
          overflow: "hidden",
          paddingHorizontal: 16,
          gap: 8,
          // Üstte başlık/header ile arasında nefes, altta listeyle.
          marginTop: 10,
          marginBottom: 12,
        },
        style,
      ]}
    >
      <View style={{ flexShrink: 0 }}>
        <SFIcon
          name="magnifyingglass"
          fallback={Search}
          size={18}
          color={colors.text}
          strokeWidth={2}
          weight="semibold"
        />
      </View>
      <BottomSheetTextInput
        ref={inputRef as never}
        {...(value === undefined ? { defaultValue: "" } : { value })}
        onChangeText={handleChangeText}
        selectionColor={colors.text}
        cursorColor={colors.text}
        autoCorrect={false}
        autoCapitalize="none"
        style={{
          flex: 1,
          color: colors.text,
          fontSize: 18,
          padding: 0,
        }}
      />
      {hasText && (
        <Animated.View
          entering={ZoomIn.duration(180)}
          exiting={ZoomOut.duration(150)}
          style={{
            position: "absolute",
            right: 12,
            top: 0,
            bottom: 0,
            justifyContent: "center",
          }}
        >
          <TouchableOpacity
            onPress={clear}
            hitSlop={10}
            activeOpacity={1}
            style={{
              width: 22,
              height: 22,
              borderRadius: 11,
              backgroundColor: ink(0.2),
              alignItems: "center",
              justifyContent: "center",
            }}
          >
            <View pointerEvents="none">
              <SFIcon
                name="xmark"
                fallback={X}
                size={14}
                color={colors.textSecondary}
                strokeWidth={2}
                weight="semibold"
              />
            </View>
          </TouchableOpacity>
        </Animated.View>
      )}
    </TouchableOpacity>
  );
}
