import { useEffect, useState, type ReactNode } from "react";
import { View, type StyleProp, type ViewStyle } from "react-native";
import { GlassView } from "expo-glass-effect";
import { colors as theme, isLight, withAlpha } from "@/shared/theme/colors";
import { glassColorScheme, hasLiquidGlassSurface } from "@/shared/theme/glass";

/**
 * Kartın CAM YÜZEY ilkeli. İki yerde kullanılıyor:
 *   • Açık paneldeki bölüm kutuları — üniversite · niyet · ilgi alanları ·
 *     yaşam tarzı · prompt · bio · konum. (Fotoğraf blokları HARİÇ, onların
 *     kabı SectionPhoto.)
 *   • Kapaktaki ortak nokta pilleri (radius 999).
 *
 * Tek yerde durmasının sebebi süsleme değil: aşağıdaki üç `GlassView` tuzağı
 * her cam yüzeyde geçerli ve her çağıran tarafında ayrı ayrı çözülemez.
 *
 * Kutunun KENDİSİ, arkasına konan bir katman değil: dolgu/marj/yarıçap buraya
 * `style` ile geliyor ve yükseklik çocuklardan çıkıyor.
 *
 * BU ÖNEMLİ, kozmetik bir tercih değil. Önce cam, kutunun içine mutlak konumlu
 * ve İÇİ BOŞ bir overlay olarak konmuştu; cam "bazen" hiç render olmuyordu.
 * Sebebi kütüphanenin kendi kısıtı: `GlassView` efekti YALNIZ ilk
 * `layoutSubviews`te kuruyor (`isMounted` bayrağı) ve o ana kadar `updateEffect`
 * no-op — yani ölçüsünü kendi içeriğinden almayan, geç/boş ölçüyle doğan bir
 * cam sessizce efektsiz kalıyor (expo#41024, expo#43732; native kaynakta bu
 * notlar duruyor). Akış içindeki bir kap ilk layout'ta gerçek ölçüsüyle
 * doğuyor. Camı tekrar mutlak bir overlay'e çevirme.
 *
 * ── STİL MOUNT ANINDA SABİT: doğrudan "clear" ────────────────────────────
 * `UIGlassEffect` nesnesi yalnızca `glassEffectStyle` DEĞİŞİNCE yaratılıyor ve
 * efekt view'ın İLK `layoutSubviews`inde kurulmak zorunda (native yorum:
 * "UIGlassEffect must be created during layoutSubviews", expo#43732).
 *
 * Bu yüzden stil mount anında sabit veriliyor: `applyGlassStyle` daha ilk
 * `updateProps`ta nesneyi yaratıyor, hemen ardından gelen `layoutSubviews` de
 * (isMounted false iken) bayat efekti söküp onu uyguluyor. Kurulum baştan sona
 * native'in kendi yolunda.
 *
 * BURADA BİR DÖNEM `useState` + rAF ile "clear" → "none" → "regular" ZİNCİRİ
 * VARDI, KALDIRILDI. Zincir stili ilk layout turunun DIŞINA taşıyordu ve belirti
 * "rastgele bazı bölümler camsız" oluyordu. Faz/gecikme geri ekleme.
 *
 * Fabric geri dönüşüm havuzundan gelen bayat efekti JS değil,
 * `patches/expo-glass-effect+56.0.4` içindeki `prepareForRecycle` temizliyor.
 * Aynı yama `layoutSubviews`e "istenen cam gerçekten kurulu mu" kontrolünü de
 * ekliyor — Fabric havuzdan dönen view'a `glassEffectStyle`i YENİDEN
 * GÖNDERMİYOR (cihaz loguyla doğrulandı), o yüzden orası tek kurtarma noktası.
 *
 * ── ATA ZİNCİRİNDE OPACITY < 1 OLAMAZ (EN SERT KURAL) ─────────────────────
 * Kütüphanenin kendi belgesinden: "Setting opacity to 0 on GlassView or any of
 * its parent views causes the glass effect to not render at all." Sadece 0
 * değil, 1'in ALTINDAKİ her değer riskli — RN o katmanı offscreen gruba alıyor
 * ve camın örnekleyeceği backdrop kalmıyor.
 *
 * Bu KALICI bir engel, geçici bir yarış değil: efekti kaç kez yeniden kurarsan
 * kur, ata soluk olduğu sürece render edilmiyor. (Bir dönem buraya zamana
 * yayılmış ve scroll'a bağlı "tekrar tur" makinesi kondu; hiçbiri işe yaramadı,
 * çünkü sorun kurulum ANI değil ata opacity'siydi. Tekrar makinesi eklemeye
 * kalkma — önce ata zincirinde opacity ara.)
 *
 * Bir yüzeyi söndürmen gerekiyorsa opacity DEĞİL şu iki yoldan biri:
 *   • Camın kendi geçişi: `glassEffectStyle`i "none"a animate ederek.
 *   • Opacity'yi camın ÇOCUĞUNA ver (çocuklarda serbest), kabın kendisine değil.
 * Bunu yapamayacağın bir katman varsa (yerleşimi zaten bir fade ile tanımlı
 * olan katmanlar) orası cam OLMAMALI — `glass={false}` ile eski yüzeyinde
 * kalsın. Kartta iki yer böyle: kapak pilleri ve kapak fotoğrafındaki not
 * diski (bkz. SwipeCard, oradaki gerekçeler).
 *
 * İki yol:
 *   • iOS 26+ → native liquid glass (`GlassView`).
 *   • Diğer her yerde (ve `glass={false}`) → DEĞİŞİKLİK ÖNCESİNDEKİ yüzey:
 *     düz `surfaceTranslucent`. ToastShell'deki gibi bir `BlurView` taklidi
 *     BİLEREK yok — 26 altında kart zemini yine blur'lu fotoğraf olduğu için
 *     üstüne ikinci bir canlı blur koymak hem pahalı hem gereksiz; yarı saydam
 *     yüzey zaten zemini bir tık geçiriyor. (Android'de de bu yola düşüyor,
 *     orada `expo-blur` özellikle pahalı.)
 *
 * CAM YOLUNDA DOLGU/KENARLIK/KIRPMA YOK, bilerek: opak bir katman kırılmayı
 * öldürüyor, `overflow: hidden` ise camın üstüne bir maske koyuyor — köşeyi
 * zaten native `cornerConfiguration` çiziyor (radius prop olarak gidiyor).
 * Kontrast knob'u `tintColor`.
 */

/**
 * Kutunun cam katmanını bir kez YENİDEN MOUNT etmeden önce beklenen süre (ms).
 *
 * SwipeWrapper'ın giriş yayı (damping 20 / stiffness 100) ~400ms'de duruyor;
 * pay bırakıldı. Gerekçenin tamamı GLASS_REMOUNT notunda.
 */
const GLASS_SETTLE_MS = 700;

/**
 * ── CAMIN KURULUMUNU GECİKTİREN HİÇBİR KAPI YOK, BİLEREK ──────────────────
 *
 * Burada bir dönem `CardGlassReadyContext` vardı: SwipeCard'ın "giriş
 * animasyonum oturdu" sinyalini (700ms) bekleyen ortak bir kapı. Yanına
 * "destenin kabı duruyor mu" (`cardStackMotion`) ve "kutu ekranda mı"
 * (`expandAnim === 1`) koşulları da eklendi. ÜÇÜ DE KALDIRILDI — gecikmenin
 * KENDİSİ hataydı.
 *
 * Kanıt deneyi: aynı bileşen, Likes/Chat/Profil önizleme kartlarında HİÇ
 * bozulmuyor, yalnız Keşif'te bozuluyordu. Tek yapısal fark, önizlemede bu
 * kapıların `previewMode` ile anında açılması — yani faz zincirinin kutu mount
 * olur olmaz koşması. Keşif'te 700ms bekliyordu.
 *
 * Sebebi native kural (GlassView.swift, expo#43732):
 *
 *   // UIGlassEffect must be created during layoutSubviews
 *   // creating it in didMoveToWindow does not render correctly.
 *
 * Efekt view'ın İLK layout turunda kurulmak zorunda. Zincir mount'la aynı
 * karede koşarsa son stil o tura YETİŞİYOR. Beklersek ilk `layoutSubviews`
 * çoktan geçmiş oluyor ve stil ataması layout turunun DIŞINDA kalıyor —
 * kutu başına tutup tutmuyor, yani "rastgele bazı bölümler camsız".
 *
 * BURAYA YENİ BİR BEKLEME KOŞULU EKLEME. Camı geciktiren her kapı onu ilk
 * layout turunun dışına iter ve hatayı geri getirir. Tek kalan bekleme
 * `laidOut` ve o da gecikme değil: gerçek bir ölçünün ta kendisi.
 */

/**
 * Native camın tint'i — dolgu DEĞİL, camın kendi rengine hafif eğim.
 *
 * TINT'İ OYNATARAK EFEKTİ KURTARMAYA ÇALIŞMA. Denendi, işe YARAMIYOR ve
 * gerekçesi native'de yazılı: `setTintColor` → `updateEffect()` yolu efekt
 * NESNESİNİ değiştirmeden `glassEffectView.effect`e aynı nesneyi yeniden
 * atıyor, kütüphanenin kendi notuysa bunun yetmediğini söylüyor —
 * "Clear the stale effect before re-applying so UIKit fully tears down the old
 * UIGlassEffect, otherwise re-assigning does not render GlassView correctly"
 * (expo#43732). Ölü bir efekti diriltmenin tek yolu önce `UIVisualEffect()`e
 * düşürmek; JS'ten oraya BU prop'la ulaşılmıyor.
 */
function sectionGlassTint(): string {
  return withAlpha(theme.bg, isLight() ? 0.24 : 0.2);
}

export default function CardSectionBox({
  glass,
  radius = 40,
  style,
  fallbackStyle,
  children,
}: {
  /**
   * Kartın zemini blur'lu fotoğraf mı (bkz. SwipeCard `glassPanel`). `false`
   * iken kutu eski düz yüzeyinde kalıyor — önizleme kartlarının (Likes / Chat /
   * Profil) yolu bu.
   */
  glass: boolean;
  radius?: number;
  /** Marj + dolgu; kutunun ölçüsünü bu ve çocuklar belirliyor. */
  style?: StyleProp<ViewStyle>;
  /**
   * YALNIZ cam olmayan yolda uygulanan ek stil — camda yasak olan şeyler için
   * (kenarlık, dolgu). Kapak pilleri fallback'te 0.5'lik hairline'ıyla
   * çiziliyor; camda o çerçeve kırılmayı öldürüyor.
   */
  fallbackStyle?: StyleProp<ViewStyle>;
  children: ReactNode;
}) {
  const shape = {
    borderRadius: radius,
    borderCurve: "continuous" as const,
  };

  /**
   * ── GLASS_REMOUNT: cam katmanı bir KEZ yeniden mount ediliyor ─────────────
   *
   * İki kural aynı anda sağlanmak zorunda ve ikisi de cihaz logundan çıktı:
   *
   *  1. Efekt view'ın İLK `layoutSubviews`inde kurulmalı (native kural,
   *     expo#43732). Yani stil mount anında sabit olmalı — sonradan stil
   *     oynatmak kurulumu layout turunun dışına atıyor.
   *  2. O anda ATA ZİNCİRİ DİNGİN olmalı. Değilse efekt sorunsuz kuruluyor
   *     ama hiç render edilmiyor.
   *
   * Kural 2'yi ihlal eden şey `SwipeWrapper`ın giriş yayı: üstteki kartın
   * `scale`i uygulama açılışında 0→1, sonraki kartlarda 0.92→1 koşuyor ve
   * kutular tam o sırada kuruluyor. Log bunu birebir gösterdi — bütün kutular
   * `updateEffect APPLIED ... effect=UIGlassEffect` ile bitiyor, yani kurulum
   * başarılı, ama ekranda cam yok.
   *
   * İkisini birden sağlamanın yolu stili oynatmak DEĞİL, view'ı yenilemek:
   * yay durduktan sonra `key` değişiyor, Fabric taze bir `GlassView` mount
   * ediyor ve ONUN ilk layout turu dingin bir anda koşuyor. Kural 1 de kural 2
   * de sağlanmış oluyor.
   *
   * TAM OLARAK BİR KEZ — `installGen` 0'dan 1'e gidiyor ve orada kalıyor. Bu
   * bir tekrar makinesi değil; sonsuza kadar deneyen turlar bu dosyada bir
   * dönem denendi ve işe yaramadı.
   *
   * Önizleme kartlarında zaten yay yok, yani ilk kurulum tutuyor; oradaki
   * yeniden mount da zararsız (aynı yoldan aynı sonucu veriyor).
   */
  const [installGen, setInstallGen] = useState(0);
  useEffect(() => {
    const id = setTimeout(() => setInstallGen(1), GLASS_SETTLE_MS);
    return () => clearTimeout(id);
  }, []);

  if (glass && hasLiquidGlassSurface()) {
    return (
      <GlassView
        // Ata dingin hâle gelince tek seferlik tazeleme — bkz. GLASS_REMOUNT.
        key={installGen}
        // DOĞRUDAN "clear" — JS tarafında faz zinciri YOK, bilerek.
        //
        // Burada bir dönem `useState` ile "clear" → "none" → "regular" zinciri
        // vardı (rAF ile kare kare ilerleyen). KALDIRILDI: native kural
        // (GlassView.swift) efektin view'ın İLK layout turunda kurulmasını
        // istiyor —
        //
        //   // UIGlassEffect must be created during layoutSubviews
        //   // creating it in didMoveToWindow does not render correctly.
        //
        // Stil mount anında sabitse `applyGlassStyle` daha ilk `updateProps`ta
        // `UIGlassEffect`i yaratıyor, ardından gelen `layoutSubviews` de
        // (isMounted false iken) bayat efekti söküp onu uyguluyor. Yani kurulum
        // tamamen native'in kendi blessed yolunda oluyor ve JS'in zamanlamayla
        // hiç işi kalmıyor. Zincir ne yapıyorsa stili layout turunun DIŞINA
        // taşıyordu; "rastgele bazı bölümler camsız" belirtisinin kaynağı buydu.
        //
        // Geri dönüşümden gelen bayat efekti `patches/expo-glass-effect+56.0.4`
        // içindeki `prepareForRecycle` temizliyor — JS'in "none" adımıyla
        // taklit etmesine gerek yok.
        //
        // BURAYA FAZ/GECİKME GERİ EKLEME.
        glassEffectStyle="clear"
        tintColor={sectionGlassTint()}
        colorScheme={glassColorScheme()}
        style={[shape, style]}
      >
        {children}
      </GlassView>
    );
  }

  // Cam yoksa değişiklik öncesindeki yüzey — iki durumda da AYNI (blur'lu foto
  // zemininin üstünde de, düz gri panelin üstünde de). `surfaceTranslucent`
  // yarı saydam olduğu için zemin bir tık geçiyor, kutu yine de opak okunuyor.
  return (
    <View
      style={[
        shape,
        { overflow: "hidden", backgroundColor: theme.surfaceTranslucent },
        style,
        fallbackStyle,
      ]}
    >
      {children}
    </View>
  );
}
