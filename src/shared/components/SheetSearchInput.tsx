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
 * ⚠️ 🔴 KAPSÜL BİR `TouchableOpacity` DEĞİL — KLAVYE O YÜZDEN AÇILMIYORDU.
 *
 * Eski yazımda kapsül bir `TouchableOpacity`ydi ve `onPress` input'un ref'i
 * üzerinden `focus()` çağırıyordu. Input'a basınca HİÇBİR ŞEY olmuyordu:
 * `BottomSheetTextInput` gövdesinde `react-native-gesture-handler`'ın
 * `TextInput`i (native `NativeViewGestureHandler` sarmalı) ve bir RN
 * Touchable'ın İÇİNDE o dokunuş iki tarafın arasında kalıyor — RN responder'ı
 * press'i tamamlamıyor, native handler da input'u odaklamıyor. Bu, toast
 * içindeki yutulan dokunuşla aynı aile (RNGH ↔ RN touch iç içe).
 *
 * Çözüm: ARADAN RN TOUCHABLE'I KALDIRMAK. Kapsül düz bir `View`; dokunuşu
 * input'un KENDİSİ alıyor (gorhom'un bu bileşeni tam olarak bunun için var) ve
 * odak için ref'e hiç ihtiyaç kalmıyor.
 *
 * ⚠️ BÜYÜTEÇ MUTLAK ve `pointerEvents="none"`, input ise KAPSÜLÜ DOLDURUYOR
 * (`alignSelf: "stretch"`). İkisi birlikte olmak ZORUNDA:
 *   • İkon akışta kalsaydı dokunulabilir bir komşu olurdu ve kapsülün solunda
 *     odaklamayan ölü bir şerit bırakırdı.
 *   • Bir tur ikon mutlak yapıldı ama input GERİLMEDİ: o zaman ikon KAPSÜLÜN
 *     merkezine, yazı input'un kendi ölçtüğü satır kutusuna oturdu ve yazı
 *     ikonun altında kaldı. Input kapsülü doldurduğunda iki merkez aynı kutu.
 * Input'a dikey DOLGU/YÜKSEKLİK verme (`padding: 0` kalmalı) — hizayı yine
 * bozar; dikey ortalama tek satırlık alanın kendi davranışı
 * (+ Android için `textAlignVertical`).
 *
 * ⚠️ PLACEHOLDER YOK ve `placeholder` PROP'U DA YOK — kasıtlı, Mesajlar'daki
 * çubukta da yok. Boş kapsülde yalnız büyüteç duruyor; "Üniversite ara" gibi bir
 * ipucu metni geri eklenecekse MessagesScreen'deki çubuğa da eklenmeli, yoksa
 * iki çubuk yine ayrışır.
 *
 * `BottomSheetTextInput` kullanılıyor (düz `TextInput` değil): beş çağıranın
 * hepsi bir bottom sheet'in içinde ve klavye açılınken sheet'in üst durağa
 * çıkması buna bağlı.
 *
 * ⚠️ Ref YALNIZ `clear()` için duruyor, odak için DEĞİL (yukarıdaki kural).
 * gorhom'un `useImperativeHandle`ı boş bağımlılıkla kurulu ve RNGH'nin kendi
 * sarmalından `null` dönebiliyor; odağı ona bağlamak sessizce çalışmayan bir
 * input demek.
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
  /** e2e seçicisi; verilmezse `sheet-search-input`. */
  testID?: string;
}

export default function SheetSearchInput({
  value,
  onChangeText,
  style,
  testID = "sheet-search-input",
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
    <View
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
          // Üstte başlık/header ile arasında nefes, altta listeyle.
          marginTop: 10,
          marginBottom: 12,
        },
        style,
      ]}
    >
      {/* Büyüteç DOKUNUŞ ALMIYOR: kapsülün tamamı input'un dokunma alanı
          olmalı, yoksa solda odaklamayan bir şerit kalır (gerekçe dosya
          başında). Mutlak konum da bu yüzden — akışta kalsa input'un yerini
          daraltırdı. */}
      <View
        pointerEvents="none"
        style={{
          position: "absolute",
          left: 16,
          top: 0,
          bottom: 0,
          justifyContent: "center",
        }}
      >
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
        testID={testID}
        ref={inputRef as never}
        {...(value === undefined ? { defaultValue: "" } : { value })}
        onChangeText={handleChangeText}
        selectionColor={colors.text}
        cursorColor={colors.text}
        autoCorrect={false}
        autoCapitalize="none"
        style={{
          flex: 1,
          // ⚠️ Kapsülü DOLDURUYOR: dokunuşu input'un kendisi alsın ve yazı
          // ikonla aynı kutuda ortalansın (gerekçe dosya başında).
          alignSelf: "stretch",
          // İkonun 18'i + eski satırın 8'lik aralığı — yazı tam eskisi gibi
          // 42. pikselden başlıyor.
          marginLeft: 26,
          color: colors.text,
          fontSize: 18,
          padding: 0,
          // iOS tek satırlık alanı kendi ortalıyor; Android'de EditText üstten
          // hizalıyor ve gerilmiş alanda yazı tepeye kaçıyor.
          textAlignVertical: "center",
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
    </View>
  );
}
