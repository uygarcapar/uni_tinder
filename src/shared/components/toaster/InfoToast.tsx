import { View, Text } from 'react-native';
import { colors } from "../../theme/colors";
import ToastShell from "./ToastShell";
import {
  ToastIconGlyph,
  toastIconBackground,
  type ToastIconKind,
} from "./toastIcons";

export type InfoToastProps = {
  title?: string;
  message: string;
  variant?: 'success' | 'error';
  /**
   * Ürüne bağlı toast'larda (SuperLike kotası, not gönderimi, paket satın alma)
   * solda o ürünün simgesi çizilir. Verilmezse toast düz metin kalır — jenerik
   * mesajlara (oturum, moderasyon) simge takılmamalı.
   */
  icon?: ToastIconKind;
};

export default function InfoToast({ title, message, icon }: InfoToastProps) {
  // Simge dairesi dolgulu: cam kartın üstünde soluk bir tint yeterince
  // okunmuyordu. Dolgu açık modda siyah, koyu modda ürünün rengi — mesaj
  // hakkında nötr gri (toastIconBackground); glif her durumda `onMedia` beyaz.
  const iconBg = icon ? toastIconBackground(icon) : null;

  const body = (
    <View style={{ flex: icon ? 1 : undefined }}>
      {title ? (
        <Text style={{ color: colors.text, fontSize: 14, fontWeight: 700 }} numberOfLines={1}>
          {title}
        </Text>
      ) : null}
      <Text
        style={{ color: colors.text, fontSize: 14, fontWeight: '500', marginTop: title ? 1 : 0 }}
        numberOfLines={3}
      >
        {message}
      </Text>
    </View>
  );

  return (
    <ToastShell paddingVertical={16} paddingHorizontal={20}>
      <View
        style={{
          flexDirection: icon ? 'row' : undefined,
          alignItems: icon ? 'center' : undefined,
        }}
      >
        {icon && iconBg ? (
          <View
            style={{
              width: 36,
              height: 36,
              borderRadius: 18,
              marginRight: 12,
              backgroundColor: iconBg,
              alignItems: 'center',
              justifyContent: 'center',
            }}
          >
            <ToastIconGlyph kind={icon} size={20} color={colors.onMedia} />
          </View>
        ) : null}
        {body}
      </View>
    </ToastShell>
  );
}
