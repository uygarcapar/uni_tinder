import { View } from "react-native";
import { BottomSheetBackdrop } from "@gorhom/bottom-sheet";
import { BlurView } from "expo-blur";
import { plainBlurTint } from "@/shared/theme/blur";
import { scrimAt } from "@/shared/theme/colors";

/**
 * Sheet'lerin arkasındaki perde — TEK KAYNAK.
 *
 * Uygulamadaki BÜTÜN bottom sheet'ler bunu kullanıyor: arkayı düz siyah
 * opaklıkla karartmak yerine BULANIKLAŞTIRIYORUZ. Fark ürünsel: opaklık
 * arkadaki ekranı "söndürüyor", blur ise yerinde bırakıp geri itiyor —
 * kullanıcı nereden geldiğini görmeye devam ediyor ve sheet ekranın üstüne
 * konmuş bir cam gibi duruyor.
 *
 * 🔴 BLUR TEK BAŞINA YETMİYOR. Bulanık ama AYNI parlaklıktaki bir arka plan
 * sheet zemini (`colors.bg`) ile kontrast üretmiyor, sheet'in kenarı kayboluyor.
 * Blur'un üstüne ince bir perde çekiyoruz; `scrimAt` her iki modda da siyah
 * (açık temada da karartır) — bkz. colors.ts'teki scrim/veil ayrımı.
 *
 * Android'de expo-blur'un blurMethod varsayılanı 'none': orada yalnız bu perde
 * kalıyor, yani davranış eski opaklık perdesine düşüyor — kabul edilebilir
 * degradasyon, ayrı bir kod yolu tutmuyoruz.
 */
export default function SheetBlurBackdrop({
  pressBehavior = "close",
  intensity = 30,
  scrim = 0.28,
  ...props
}: any) {
  return (
    <BottomSheetBackdrop
      {...props}
      appearsOnIndex={0}
      disappearsOnIndex={-1}
      // opacity={1}: karartmayı BottomSheetBackdrop'ın kendi zemini değil
      // aşağıdaki katmanlar yapıyor, o yüzden zemini şeffaf bırakıyoruz.
      opacity={1}
      pressBehavior={pressBehavior}
      style={[props.style, { backgroundColor: "transparent" }]}
    >
      <BlurView
        intensity={intensity}
        tint={plainBlurTint()}
        style={{ position: "absolute", top: 0, left: 0, right: 0, bottom: 0 }}
      />
      <View
        pointerEvents="none"
        style={{
          position: "absolute",
          top: 0,
          left: 0,
          right: 0,
          bottom: 0,
          backgroundColor: scrimAt(scrim),
        }}
      />
    </BottomSheetBackdrop>
  );
}
