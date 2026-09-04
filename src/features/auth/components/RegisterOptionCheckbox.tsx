import { memo } from "react";
import { View } from "react-native";
import { Check } from "@/shared/icons";
import SFIcon from "@/shared/components/SFIcon";
import { colors } from "@/shared/theme/colors";

// Kayıt akışındaki seçenek satırlarının sağındaki işaret. ÇIPLAK TİK DEĞİL,
// yuvarlak kare bir kutu: keşif filtresi (bkz. FilterModal → CheckRow) ve profil
// düzenleme (bkz. EditProfileForm → OptionListItem, `checkbox` dalı) aynı
// soruları aynı biçimde soruyor; kayıt akışı tek başına çıplak tikte kalmıştı.
//
// Kutu, yerini aldığı tikten (20) bir tık büyük: içine 14px'lik tik girdiği için
// aynı ölçüde kalsaydı işaret kutuya sıkışmış görünürdü. 22, satır metninin
// lineHeight'ini (22) AŞMIYOR — satır yüksekliğini yine metin belirliyor, kutu
// dolup boşalınca satır uzayıp kısalmıyor.
export const REGISTER_CHECKBOX_SIZE = 22;

// Kenarlık ölçüsü/rengi kardeşleriyle birebir: `hairlineStrong` (%14 siyah /
// %15 beyaz) 1.5px ile boş kutuyu bir kontrol gibi okutuyor — paletin en zayıf
// çizgisinde (`hairline`) açık modda kutu kayboluyor.
const CHECKBOX_BORDER_WIDTH = 1.5;

type Props = {
  selected: boolean;
};

// Kutu HER ZAMAN çiziliyor (koşullu olan yalnız içindeki tik): tik gibi görünüp
// kaybolsaydı seçim anında metin alanı genişleyip satır kayardı.
function RegisterOptionCheckbox({ selected }: Props) {
  return (
    <View
      style={{
        width: REGISTER_CHECKBOX_SIZE,
        height: REGISTER_CHECKBOX_SIZE,
        borderRadius: 7,
        borderCurve: "continuous",
        borderWidth: selected ? 0 : CHECKBOX_BORDER_WIDTH,
        borderColor: colors.hairlineStrong,
        backgroundColor: selected ? colors.inverseSurface : "transparent",
        alignItems: "center",
        justifyContent: "center",
      }}
    >
      {selected && (
        <SFIcon
          name="checkmark"
          fallback={Check}
          size={14}
          color={colors.onInverseSurface}
          strokeWidth={3}
          weight="bold"
        />
      )}
    </View>
  );
}

export default memo(RegisterOptionCheckbox);
