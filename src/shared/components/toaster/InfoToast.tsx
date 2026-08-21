import { Text } from 'react-native';
import { BlurView } from 'expo-blur';
import { colors } from "../../theme/colors";
import { plainBlurTint } from "@/shared/theme/blur";
import ToastShell, { toastFill, TOAST_BLUR_INTENSITY } from "./ToastShell";

export type InfoToastProps = {
  title?: string;
  message: string;
  variant?: 'success' | 'error';
};

export default function InfoToast({ title, message }: InfoToastProps) {
  return (
    <ToastShell>
      <BlurView
        intensity={TOAST_BLUR_INTENSITY}
        tint={plainBlurTint()}
        style={{
          paddingVertical: 16,
          paddingHorizontal: 20,
          backgroundColor: toastFill(),
        }}
      >
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
      </BlurView>
    </ToastShell>
  );
}
