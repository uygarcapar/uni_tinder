import { useCallback } from "react";
import { useWindowDimensions, View } from "react-native";
import AppModal from "@/shared/components/AppModal";
import ModeChoiceCard from "./ModeChoiceCard";
import { APP_MODES, type AppMode } from "../modeTheme";

/**
 * Mod seçici — İKİ yerden açılıyor: Keşif başlığındaki mod adı, ve Profil'deki
 * avatara BASILI TUTMA (avatarın çevresindeki halka hangi modda olduğunu
 * söylüyor, basılı tutmak onu değiştiriyor).
 *
 * ── Kartlar, satır DEĞİL ────────────────────────────────────────────────────
 * Burada bir süre `sectionGroupStyle` içinde iki gri satır vardı. İki yüzey
 * aynı kararı sorduğu hâlde bambaşka görünüyordu: kullanıcı modları kayıtta
 * (RegisterStepModeScreen) zemini fotoğraf olan 3:2 kartlar olarak öğreniyor,
 * sonra onları iki renksiz satır olarak buluyordu. Artık ikisi de
 * `ModeChoiceCard` — katman/perde/punto gerekçeleri o dosyada.
 *
 * Satır hâlinin taşıdığı İKİ bilgi kartta da duruyor, yeri değişti:
 *   • seçili olan → kartın perdesi açılıyor + sağ üstteki kutuda tik
 *   • açılmamış mod → kutu HİÇ çizilmiyor, metnin sağında zeminsiz chevron ve
 *     alt satır "<mod> moduna geç"
 * Solda mod rengini taşıyan nokta KALKTI: kartın zemini zaten modun gradyanı,
 * nokta aynı şeyi ikinci kez söylüyordu. Üstteki başlık da kalktı — kart adı
 * zaten söylüyor (bkz. `title=""`).
 *
 * ⚠️ "Açık mı" kararı SUNUCUDAN (`/api/profile` → `modes`), diskten DEĞİL:
 * başka cihazda açılan profil burada bayat "kapalı" görünürdü. Bilgi henüz
 * gelmediyse (`openModes === undefined`) kartlar seçilebilir çiziliyor —
 * olmayan bir kısıt uydurmamak doğru taraf (premiumTier.resolved kuralının
 * aynısı); sunucu kapalıysa istek yapılandırılmış retle dönüyor ve ekran
 * CTA'ya düşüyor.
 */
/**
 * Kartların sheet kenarına ve birbirine olan payı — DÖRT YANDA ve aradaki
 * boşlukta AYNI sayı. 12: kart fotoğrafının olabildiğince geniş durması
 * isteniyor (modu anlatan şey fotoğraf), ama sıfır pay kartı sheet'in
 * yuvarlak köşelerine yapıştırıp iki yarıçapı çakıştırırdı.
 */
const MODE_SHEET_INSET = 12;

export interface ModeSelectorSheetProps {
  visible: boolean;
  onClose: () => void;
  mode: AppMode;
  /** Sunucudan gelen açık mod haritası; `undefined` = henüz bilinmiyor. */
  openModes?: Partial<Record<AppMode, boolean>>;
  onSelect: (mode: AppMode) => void;
  /** Kapalı modun kartına dokunuldu → mini kurulum akışını aç. */
  onOpenProfile: (mode: AppMode) => void;
}

export default function ModeSelectorSheet({
  visible,
  onClose,
  mode,
  openModes,
  onSelect,
  onOpenProfile,
}: ModeSelectorSheetProps) {
  const { height: windowHeight } = useWindowDimensions();

  const handlePress = useCallback(
    (next: AppMode) => {
      // Bilinmiyorsa AÇIK varsay (yukarıdaki not): kullanıcıyı olmayan bir
      // kurulum akışına sokmaktansa isteği sunucuya bırak.
      const isOpen = openModes?.[next] !== false;
      // Sheet ÖNCE kapanıyor, sonra üst akış tetikleniyor: iki sheet üst üste
      // açılırsa (kurulum akışı da modal) gorhom'un stack davranışı
      // beklenmedik sıraya düşüyor (FeedUniversitySheet'teki aynı kural).
      onClose();
      if (isOpen) {
        if (next !== mode) onSelect(next);
      } else {
        onOpenProfile(next);
      }
    },
    [mode, onClose, onSelect, onOpenProfile, openModes],
  );

  return (
    <AppModal
      visible={visible}
      onClose={onClose}
      // BAŞLIK YOK (istek). Kartlar modun adını kendi üstlerinde Duckie
      // puntosuyla zaten taşıyor — üstte ikinci bir "Modu değiştir" satırı aynı
      // şeyi küçük harflerle tekrar ediyor ve kartları aşağı itiyordu. `title`
      // prop'u zorunlu olduğu için boş geçiliyor; i18n anahtarı
      // (`discover.mode.pickerTitle`) yerinde duruyor, geri istenirse tek satır.
      title=""
      // Yükseklik içerikten: iki 3:2 kart sabit bir yüzdeye oturmuyor
      // (küçük ekranda taşar, büyük ekranda altı boş kalır).
      //
      // ⚠️ `scrollable={false}` VERİLMEZ — `dynamicSizing` ile birlikte sheet
      // hiç görünmüyor. AppModal'ın scrollable olmayan dalı içeriği düz bir
      // `View` + `flex: 1` içine koyuyor; gorhom dinamik yüksekliği
      // `BottomSheetScrollView`un ölçümünden okuduğu için içerik yüksekliği 0
      // kalıyor ve sheet açılıyor ama sıfır boyda duruyor (mod adına basınca
      // "hiçbir şey olmuyor"un sebebi tam buydu). O dal ayrıca
      // `paddingHorizontal`ı da uygulamıyor. Scroll'u kapatmak gerekirse doğru
      // kol `scrollEnabled={false}`.
      dynamicSizing
      // 0.9 — iki 3:2 kart küçük ekranda (SE) ekranın çoğunu istiyor.
      // ProfileOptionsSheet'in 0.6'sı iki SATIR için yeterliydi, kartlar için
      // değil: tavan aşılınca gorhom içeriği kırpıyor ve ikinci kart yarım
      // kalıyor. Tavanı aşan hâlde sheet kaydırılabilir kalıyor.
      maxDynamicContentSize={windowHeight * 0.9}
      closeButton
      /**
       * Kapat butonu SOLDA. Sağda duruyordu ve üstten pay kalkınca ilk kartın
       * SAĞ ÜST köşesindeki seçim kutusunun tam üstüne biniyordu (buton ~48pt,
       * kutu kartın 16'lık payında — ikisi aynı kareye düşüyor). Kartın sol üst
       * köşesi boş, cam buton oraya hiçbir şeyi örtmeden oturuyor.
       */
      closeSide="left"
      clearGlassHeader
      /**
       * X'İN GLİFİ BEYAZ (istek). Buton başlık bandının zemininde değil, ilk
       * mod kartının FOTOĞRAFININ üstünde yüzüyor (`clearGlassHeader` → kabuk
       * yok, berrak cam): açık temada tema mürekkebi koyu ve kartın gradyanında
       * kayboluyordu. Keşif başlığındaki mod adıyla aynı karar (bkz. ModeTitle).
       */
      onMediaHeaderIcons
      /**
       * DÖRT YANDAN EŞİT PAY (istek). AppModal'ın varsayılanı yatayda 20,
       * üstte `MODAL_HEADER_HEIGHT` (başlık şeridi kadar), altta 40 — yani
       * kartlar yanlardan dar, üstten çok geniş bir boşlukla duruyordu.
       * Hepsi MODE_SHEET_INSET'e indi ve kartlar arasındaki aralık da aynı
       * sayı: kart ızgarası her yönde tek bir ritimle okunuyor.
       *
       * Kapat butonu bu payın İÇİNE taşıyor ve ilk kartın üstünde YÜZÜYOR —
       * `clearGlassHeader` tam bunun için var (berrak cam, kendi zemini yok).
       */
      contentContainerStyle={{
        paddingTop: MODE_SHEET_INSET,
        paddingHorizontal: MODE_SHEET_INSET,
        paddingBottom: MODE_SHEET_INSET,
      }}
    >
      <View style={{ gap: MODE_SHEET_INSET }}>
        {APP_MODES.map((m) => (
          <ModeChoiceCard
            key={m}
            mode={m}
            active={m === mode}
            open={openModes?.[m] !== false}
            onPress={handlePress}
          />
        ))}
      </View>
    </AppModal>
  );
}
