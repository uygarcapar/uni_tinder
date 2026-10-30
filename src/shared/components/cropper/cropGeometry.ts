/**
 * Kırpma matematiği — SAF fonksiyonlar, RN import'u yok.
 *
 * Buradaki her şey hem UI thread'inde (worklet, jest sırasında pan sınırları)
 * hem de JS thread'inde (onay anında kaynak dikdörtgeni) çalışıyor. Bu yüzden
 * dosya tamamen bağımsız: React yok, reanimated yok, sadece sayı.
 *
 * KOORDİNAT MODELİ
 *   Ekran büyüklükleri POINT cinsinden ve kırpma penceresinin MERKEZİNE göre.
 *   `tx`/`ty` = görüntü merkezinin pencere merkezinden ofseti.
 *   `scale` = kullanıcı ölçeği; 1 "görüntü pencereyi tam kaplıyor" demek
 *   (bkz. coverScale).
 */

export type SourceRect = {
  originX: number;
  originY: number;
  width: number;
  height: number;
};

/**
 * YÜKLEME ÇIKTISININ ÖLÇÜSÜ VE KALİTESİ — tek kaynak.
 *
 * Uygulamada artık fotoğrafı çıktıya çeviren İKİ yol var:
 *   • kırpma ekranı (kullanıcı kadrajı seçiyor — CropperOverlay),
 *   • kırpıcısız yol (kamera karesi doğrudan yükleniyor — kampüs anları,
 *     bkz. photoPicker > `fitPhotoForUpload`).
 * İkisi AYNI sayıları kullanmak zorunda: ayrışırlarsa aynı üründe iki farklı
 * çözünürlük/kalite dolaşır ve `photoMaxBytes` kapısı yalnız birinde tutar.
 */
export const OUTPUT_W = 900;
export const OUTPUT_H = 1200;
export const OUTPUT_QUALITY = 0.85;

/**
 * Kaynağın ORTASINDAN istenen orana en büyük dikdörtgen.
 *
 * Kırpıcısız yolun geometrisi: kullanıcı kadraj seçmiyor, kare kameranın 3:4
 * önizleme penceresinde ne görüyorsa o. Kaynak zaten 3:4 ise dikdörtgen
 * fotoğrafın TAMAMI oluyor (tek bir piksel atılmıyor); 4:3 ya da 16:9 bir
 * yedek yoldan (sistem kamerası) gelirse orta bant alınıyor.
 *
 * ⚠️ SIRA `toSourceRect`TEKİYLE AYNI — yuvarla, oranı yeniden dayat, sonra
 * kırp: iOS'ta `CGImage.cropping(to:)` taşan dikdörtgeni HATA VERMEDEN
 * küçültüyor ve çıktı orandan sapıyor. O yüzden w → h → (gerekirse) w.
 */
export function centerCropRect(a: {
  srcW: number;
  srcH: number;
  aspectW: number;
  aspectH: number;
}): SourceRect {
  const { srcW, srcH, aspectW, aspectH } = a;
  if (!(srcW > 0) || !(srcH > 0)) {
    return { originX: 0, originY: 0, width: Math.max(1, srcW), height: Math.max(1, srcH) };
  }

  let w = srcW;
  let h = Math.round((w * aspectH) / aspectW);
  if (h > srcH) {
    h = srcH;
    w = Math.round((h * aspectW) / aspectH);
    if (w > srcW) w = srcW;
  }
  if (w < 1) w = 1;
  if (h < 1) h = 1;

  return {
    originX: Math.round((srcW - w) / 2),
    originY: Math.round((srcH - h) / 2),
    width: w,
    height: h,
  };
}

export function clamp(v: number, lo: number, hi: number): number {
  "worklet";
  return v < lo ? lo : v > hi ? hi : v;
}

/**
 * 3:4 PENCERE — kırpma ekranı ile kamera ekranının ORTAK kadrajı.
 *
 * İkisinde de aynı olmak zorunda: kamera bu pencerenin içinde önizleme
 * gösteriyor, çekilen kare de doğrudan kırpıcıya gidiyor. Formül ayrı yazılsaydı
 * çekimden kırpmaya geçişte kadraj kayardı.
 *
 * Pencere TAM GENİŞLİK ve ekranın tam ortasında; dikey pay iki chrome bandının
 * BÜYÜĞÜNDEN hesaplanıyor (merkez ekranın merkezi olduğu için sığma sınırı
 * büyük olan banda göre). 3:4 tam genişlikte sığmıyorsa — küçük cihazlarda —
 * genişlik o paya göre küçülüyor.
 */
export function frameWindow(a: {
  screenW: number;
  screenH: number;
  headerH: number;
  footerH: number;
  aspectW: number;
  aspectH: number;
}): { winW: number; winH: number } {
  const { screenW, screenH, headerH, footerH, aspectW, aspectH } = a;
  const chrome = Math.max(headerH, footerH);
  const availH = Math.max(120, screenH - chrome * 2);
  const winW = Math.min(screenW, (availH * aspectW) / aspectH);
  return { winW, winH: (winW * aspectH) / aspectW };
}

/**
 * Görüntüyü pencereye TAM KAPLATAN taban ölçek.
 *
 * `max()` bağlayıcı ekseni seçtiği için `scale = 1`'de hem `dispW >= winW` hem
 * `dispH >= winH` yapı gereği sağlanır — yani MIN_SCALE tam olarak 1 ve
 * "görüntü pencereden küçük" diye ayrı bir dal gerekmiyor. Küçük bir kaynak
 * (400x600) ekranda büyütülür, geri eşleme yine doğru çalışır.
 */
export function coverScale(srcW: number, srcH: number, winW: number, winH: number): number {
  "worklet";
  if (srcW <= 0 || srcH <= 0) return 1;
  const sx = winW / srcW;
  const sy = winH / srcH;
  return sx > sy ? sx : sy;
}

/**
 * Bir eksende izin verilen maksimum öteleme. `scale >= 1` iken görünen boyut
 * pencereden asla küçük olamadığı için sonuç negatif çıkmaz; yine de lastik
 * bölgesinde (scale < 1) 0'a kırpıyoruz.
 */
export function maxOffset(dispSize: number, winSize: number): number {
  "worklet";
  const half = (dispSize - winSize) / 2;
  return half > 0 ? half : 0;
}

/**
 * Yakınlaştırma tavanı — çıktının BÜYÜTÜLMESİNİ önler.
 *
 * Çıktı `outW` piksel geniş. Kırpılan alan `winW / (baseScale * s)` kaynak
 * pikseli geniş; bu `outW`'nin altına inerse manipülatör upscale yapar.
 * Eşitliği `s` için çözünce tavan çıkıyor.
 *
 * 2.0 TABANI: küçük kaynaklarda (400x600) tavan 1'in altına düşerdi ve
 * kullanıcı çerçeveyi hiç ayarlayamazdı. Hafif bir upscale, kullanılamaz bir
 * kırpma ekranından iyi.
 */
export function maxZoom(baseScale: number, winW: number, outW: number): number {
  if (baseScale <= 0 || outW <= 0) return 2;
  return clamp(winW / (outW * baseScale), 2, 8);
}

/**
 * Ekrandaki dönüşümü (scale + öteleme) KAYNAK PİKSEL dikdörtgenine çevirir.
 *
 * Türetim: görüntünün sol-üstü pencere-merkezi koordinatında
 * `(tx - dispW/2, ty - dispH/2)`, pencerenin sol-üstü `(-winW/2, -winH/2)`.
 * Aradaki fark `pps` (nokta/kaynak-pikseli) ile bölününce kaynak ofseti çıkar.
 *
 * SIRA ÖNEMLİ — yuvarla, oranı yeniden dayat, sonra kırp:
 * iOS'ta CGImage.cropping(to:) taşan dikdörtgeni HATA VERMEDEN küçültüyor;
 * sonuç orandan sapmış bir JPEG oluyor. w -> h -> (gerekirse) w zinciri dönen
 * dikdörtgenin tam sayılarda tam `aspectW:aspectH` olmasını garanti eder,
 * böylece sonraki resize saf ölçekleme olur, asla esnetme değil.
 */
export function toSourceRect(a: {
  srcW: number;
  srcH: number;
  winW: number;
  winH: number;
  baseScale: number;
  scale: number;
  tx: number;
  ty: number;
  aspectW: number;
  aspectH: number;
}): SourceRect {
  const { srcW, srcH, winW, winH, baseScale, scale, tx, ty, aspectW, aspectH } = a;

  const pps = baseScale * scale; // nokta / kaynak pikseli
  if (!(pps > 0) || !(srcW > 0) || !(srcH > 0)) {
    return { originX: 0, originY: 0, width: Math.max(1, srcW), height: Math.max(1, srcH) };
  }

  const dispW = srcW * pps;
  const dispH = srcH * pps;

  const rawOriginX = (-winW / 2 - tx + dispW / 2) / pps;
  const rawOriginY = (-winH / 2 - ty + dispH / 2) / pps;
  const rawWidth = winW / pps;

  let w = Math.min(Math.round(rawWidth), srcW);
  if (w < 1) w = 1;
  let h = Math.round((w * aspectH) / aspectW);
  if (h > srcH) {
    h = srcH;
    w = Math.round((h * aspectW) / aspectH);
    if (w > srcW) w = srcW;
  }
  if (h < 1) h = 1;

  const originX = clamp(Math.round(rawOriginX), 0, srcW - w);
  const originY = clamp(Math.round(rawOriginY), 0, srcH - h);

  return { originX, originY, width: w, height: h };
}
