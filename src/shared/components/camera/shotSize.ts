import { Image } from "react-native";

import { devLog } from "@/shared/utils/devLog";
import type { CameraShot } from "./cameraBridge";

/**
 * Karenin GERÇEK piksel ölçüsü — kırpma kipine girmeden önce kesin olmalı.
 *
 * NEDEN: kipin giriş ölçeği (`cropStageScales` > `startScale`) ve taban ölçeği
 * kaynağın ölçüsüne bağlı; yanlış bir ölçü fotoğrafın kipe girerken SIÇRAMASI
 * demek ("fotoğraf yerinden oynamasın" kararını bozar). `CameraShot`
 * sözleşmesinde ölçü `0` gelebiliyor (native vermediyse); o durumda dosyadan
 * okunuyor.
 *
 * RN'in `Image.getSize`ı — expo-image'in `loadAsync`i DEĞİL: o tam decode
 * edilmiş bitmap'i bellekte canlı tutuyor (photoPicker > `measure` ile aynı
 * gerekçe).
 *
 * >0 ise kendi ölçüsü; değilse Image.getSize; okunamazsa null.
 */
export async function resolveShotSize(
  shot: CameraShot,
): Promise<{ width: number; height: number } | null> {
  if (shot.width > 0 && shot.height > 0) {
    return { width: shot.width, height: shot.height };
  }
  try {
    const size = await new Promise<{ width: number; height: number }>(
      (resolve, reject) => {
        Image.getSize(
          shot.uri,
          (width, height) => resolve({ width, height }),
          reject,
        );
      },
    );
    // Sıfır ölçü kırpma geometrisinde sıfıra bölme demek — okunamamış say.
    if (!(size.width > 0 && size.height > 0)) return null;
    return size;
  } catch (e) {
    devLog("📸 [camera] kare ölçüsü okunamadı", e);
    return null;
  }
}
