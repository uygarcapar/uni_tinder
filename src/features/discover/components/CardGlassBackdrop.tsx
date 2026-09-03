import { StyleSheet, View } from "react-native";
import { Image } from "expo-image";
import { colors as theme, isLight, withAlpha } from "@/shared/theme/colors";

/**
 * Açık kartın ZEMİNİ — ana fotoğrafın blur'lanmış hali.
 *
 * Eskiden panel düz gri bir yüzeydi (surface3) ve dibinde sayfa zeminine inen
 * bir rampa vardı; ikisi de kalktı. Zemin artık kartın kendi kapak fotoğrafı,
 * kırılmış hâliyle.
 *
 * SCROLL'UN DIŞINDA çiziliyor (kartın çerçevesine göre mutlak): içerik üstünden
 * akıp giderken zemin KIPIRDAMIYOR. Scroll'un içine konsaydı içerik yüksekliği
 * kadar uzaması ve içerikle birlikte kayması gerekirdi — istenen tam tersi:
 * ekranı kaplayan, sabit duran bir arka plan.
 *
 * Kapak fotoğrafı collapsed'ken bu katmanı zaten TAMAMEN örtüyor; görünür
 * olduğu tek yer kartın 50'lik köşesiyle fotoğrafın 40'lık köşesi arasındaki
 * hilaller ve panel açıldıktan sonrası. Bu yüzden ayrı bir görünürlük
 * animasyonu YOK.
 *
 * BLUR `BlurView` İLE DEĞİL, fotoğrafın kendi `blurRadius`'uyla — ŞART:
 * BlurView bir `UIVisualEffectView` ve bu zeminin ÜSTÜNDE cam bölüm kutuları
 * (CardSectionBox) duruyor. Bir efekt view'in arkasında başka bir efekt
 * view olması iOS'ta tanımsız: cam örneklemesi kimi karede boş dönüyordu, cam
 * kutular "bir görünüp bir kaybolan" katmanlara dönüşmüştü. Fotoğrafın kendi
 * blur'u (SDImageBlurTransformer) DÜZ bir bitmap üretiyor → camın örnekleyeceği
 * sağlam bir zemin. Buraya BlurView geri koyma.
 *
 * İki katman:
 *   1. Blur'lu fotoğraf — contentFit="cover", kart çerçevesini doldurur.
 *   2. Perde — yazının okunurluğu. Kontrast sorununu blur yarıçapıyla değil BU
 *      alfayla çöz; yarıçapı büyütmek yalnız şekli siler, parlaklığı değil.
 *
 * Perde MODLA DÖNER, foto üstündeki scrim'lerin "açık modda da koyu kal" kuralı
 * burada GEÇMEZ (bkz. theme/blur.ts): bu katman bir fotoğraf perdesi değil,
 * panelin zemini — üstünde duran isim, aksiyon ikonları ve cam kutular tema
 * renklerini (theme.text) kullanıyor.
 */

/**
 * Fotoğrafın blur yarıçapı — şekli okunmasın, rengi kalsın. Native tarafta
 * İKİYE BÖLÜNÜYOR (ImageModule.swift: `view.blurRadius = radius / 2.0`), yani
 * efektif yarıçap bunun yarısı.
 */
const BACKDROP_BLUR_RADIUS = 90;

/** Perdenin alfası — kontrast knob'u. Açık modda siyah yazı taşıdığı için daha kalın. */
function backdropScrim(): string {
  return withAlpha(theme.bg, isLight() ? 0.38 : 0.3);
}

/**
 * ALT UÇTA SÖNME YOK, bilerek: bir ara buraya "kart dibe doğru sayfaya
 * karışsın" diye rampa konmuştu, ama bounce'ta görünen sert bitiş bu katman
 * DEĞİL — üstündeki panelin yuvarlak alt kenarı (bkz. SwipeCard >
 * PANEL_FADE_HEIGHT). Zemin sabit ve kartı baştan sona kaplamalı; buraya rampa
 * koymak ekranın alt bandındaki cam kutuların kıracağı zemini de siliyordu.
 */

export default function CardGlassBackdrop({ uri }: { uri: string }) {
  return (
    <View
      pointerEvents="none"
      style={[
        StyleSheet.absoluteFill,
        // Opak taban — fotoğraf gelene kadarki pencere için. Blur'lu hâli ayrı
        // bir cache girdisi (transformer anahtarı), yani kapak fotoğrafı
        // cache'te olsa bile bir dönüşüm karesi gerekebiliyor. Sheet'lerde bu
        // taban olmazsa o karede kartın altındaki karartılmış ekran görünürdü:
        // orada kartın kendi zemini de şeffaf (bkz. SwipeCard kart kabuğu).
        { backgroundColor: theme.bg },
      ]}
    >
      <Image
        source={{ uri }}
        style={StyleSheet.absoluteFill}
        contentFit="cover"
        blurRadius={BACKDROP_BLUR_RADIUS}
        cachePolicy="memory-disk"
        // Kapak fotoğrafıyla AYNI kaynak: indirme cache'ten gelir. Blur'lu
        // hali ayrı bir cache girdisi (transformer anahtarı) — o dönüşüm kart
        // başına bir kez ödeniyor. Öncelik düşük: kapak önce çizilsin.
        priority="low"
        transition={200}
      />
      <View
        style={[StyleSheet.absoluteFill, { backgroundColor: backdropScrim() }]}
      />
    </View>
  );
}
