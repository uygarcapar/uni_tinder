import { ImageManipulator, SaveFormat } from "expo-image-manipulator";

import type { SourceRect } from "@/shared/components/cropper/cropGeometry";

/**
 * Ara kırpmaların JPEG kalitesi — final kaydın QUALITY'sinden YÜKSEK.
 *
 * Kullanıcı üst üste kırpabiliyor ve her kırpma yeniden JPEG kodluyor, yani
 * nesil kaybı birikiyor. Ara adımlarda 0.95: dosya biraz büyük ama o dosya
 * yalnız bu ekranda yaşıyor, upload'a giden sürüm son adımda bir kez
 * QUALITY ile kodlanıyor. Ara adımlar ayrıca OUT_W/OUT_H'ye KÜÇÜLTÜLMÜYOR —
 * her kırpmada ölçeklemek çözünürlüğü basamak basamak düşürürdü.
 */
export const STEP_QUALITY = 0.95;

/**
 * Kaynaktan `rect`i keser, YENİDEN ÖLÇEKLEMEDEN STEP_QUALITY JPEG kaydeder.
 * Ölçü SONUÇTAN okunur. Hata fırlatır; ImageRef/context her durumda release.
 *
 * Ölçü sonuçtan okunuyor (rect'ten değil): manipülatör taşan dikdörtgeni
 * sessizce küçültebiliyor ve geometri bayat boyutla çalışırsa kadraj
 * fotoğraftan kayıyor.
 *
 * Release `finally`'de: render ya da kaydetme patlasa bile native bellekteki
 * bitmap'ler serbest kalıyor. Aksi halde her başarısız denemede bir bitmap
 * sızardı.
 */
export async function applyCrop(
  uri: string,
  rect: SourceRect,
): Promise<{ uri: string; width: number; height: number }> {
  const context = ImageManipulator.manipulate(uri);
  let ref: Awaited<ReturnType<typeof context.renderAsync>> | null = null;
  try {
    context.crop(rect);
    ref = await context.renderAsync();
    const result = await ref.saveAsync({ compress: STEP_QUALITY, format: SaveFormat.JPEG });
    return { uri: result.uri, width: result.width, height: result.height };
  } finally {
    ref?.release?.();
    context.release?.();
  }
}
