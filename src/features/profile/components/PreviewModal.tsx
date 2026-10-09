import { useCallback } from "react";
import SheetBlurBackdrop from "@/shared/components/SheetBlurBackdrop";
import { View, ActivityIndicator } from "react-native";

import { useSafeAreaInsets } from "react-native-safe-area-context";
import { useSharedValue } from "react-native-reanimated";
import SwipeCard from "@/features/discover/components/SwipeCard";
import CardGlassBackdrop from "@/features/discover/components/CardGlassBackdrop";
import CardSheetScrollView from "@/features/discover/components/CardSheetScrollView";
import CardStickyHeader, {
  CARD_CHROME_TOP_DROP,
  CARD_EXPANDED_CORNER_RADIUS,
} from "@/features/discover/components/CardStickyHeader";
import AppBottomSheet from "@/shared/components/AppBottomSheet";
import { colors } from "../../../shared/theme/colors";

// onReport/onBlock: kartın altındaki kırmızı moderasyon satırları. VERİLMEZSE
// çizilmez — ProfileScreen kendi profilini önizlediği için oradan geçilmiyor.
//
// onMenu: şeridin sağ üstündeki cam "üç nokta". Sohbetten açılan önizleme
// geçiyor — kart tam ekranı kapladığı için sohbetin kendi başlığındaki menü
// butonu erişilemez oluyor, aynı buton aynı yerde şeride taşınıyor. Açtığı
// sheet ÖNİZLEMENİN ÜSTÜNE binmeli (çağıran taraf `stackBehavior="push"`
// vermek zorunda), yoksa gorhom bu sheet'i minimize eder.
//
// onEdit: AYNI KÖŞENİN öteki hali — cam "kalem". Yalnız kendi profilini
// önizleyen ProfileScreen geçiyor; orada menü yok, tek aksiyon düzenlemeye
// geçmek. `onMenu` ile birlikte VERİLMEZ (bkz. CardStickyHeader > onEdit).
export default function PreviewModal({
  visible,
  onClose,
  profile,
  onReport,
  onBlock,
  onMenu,
  onEdit,
}: any) {
  const insets = useSafeAreaInsets();
  // Top'a çarpma zoom'u — scroll CardSheetScrollView'da, foto katmanı SwipeCard'da.
  const photoZoom = useSharedValue(0);
  // Ham scroll konumu — sticky şerit "bugün aktif"i buna göre söndürüp ismi
  // ortalıyor (bkz. CardStickyHeader).
  const scrollY = useSharedValue(0);

  /*
   * ŞERİDİN KAPANIŞTA SÖNMESİ KALDIRILDI (istek: "kapatırken header yok
   * olmasın").
   *
   * Burada `sheetY` + `sheetIndex` shared value'ları ve
   * `useCardSheetHeaderReveal` vardı: sheet'i kapatmak için aşağı çekmeye
   * başlandığı an şerit kendi süresiyle 0'a iniyor, çekiş kapanışa yetmezse
   * geri geliyordu. O oran `CardStickyHeader`ın `progress` prop'una gidiyordu.
   *
   * Prop artık HİÇ VERİLMİYOR → bant, başlık satırı ve iki köşe butonu opaklık
   * 1'de sabit; kart aşağı kayarken şerit onunla birlikte gidiyor. Hook'un tek
   * kullanıcısı bu iki sheet'ti, dosyası da silindi.
   *
   * `animatedPosition` / `animatedIndex` de bu yüzden artık geçilmiyor:
   * AppBottomSheet ikisini de kendi içinde üretiyor (`animatedIndexProp ??
   * internalAnimatedIndex`), yani watchdog'u etkilenmiyor.
   */

  /**
   * Kartın zemini: ana fotoğrafın blur'lu hali (bkz. CardGlassBackdrop).
   *
   * SHEET ÇİZİYOR, KART DEĞİL — burada scroll kartın DIŞINDA ve kayan şey
   * kartın kendisi; zemin kartın içinde olsaydı içerikle birlikte kayardı.
   * Scroll'un KARDEŞİ olarak çizmek onu sabitliyor. Sticky şeridin buraya
   * konması da aynı gerekçeye dayanıyor (bkz. CardStickyHeader).
   *
   * Kapı fotoğraf: fotoğrafsız profilde SwipeCard da eski gri paneline düşüyor
   * (`glassPanel`), zemin çizmek onun altında görünmez bir katman olurdu.
   */
  const backdropUri: string | undefined = profile?.photos?.[0];

  const renderBackdrop = useCallback(
    (props: any) => <SheetBlurBackdrop {...props} />,
    [],
  );

  return (
    <AppBottomSheet
      visible={visible}
      onClose={onClose}
      snapPoints={["100%"]}
      // SAFE-AREA ÇİZGİSİNE: kart Keşif'te expand edilince tam buraya oturuyor
      // (bkz. SwipeWrapper > HEADER_COVER / DISCOVER_CARD_EXPAND_LIFT) ve
      // uygulamanın tam ekran sheet'leri de (profil düzenleme / filtreler —
      // AppModal `fullScreen`) aynı tepeden açılıyor. Buradaki kart onlardan
      // ayrı bir yerden açılmamalı.
      //
      // TARİHÇE: 0 idi (sheet telefonun en tepesine dayanıyor, durum çubuğu
      // kapak fotoğrafının üstünde duruyordu); şeridin başlık satırını
      // gliflerden kurtarmak için CARD_CHROME_TOP_DROP gerekiyordu — o pay da
      // bu değişiklikle 0'a indi.
      topInset={insets.top}
      handleComponent={null}
      backdropComponent={renderBackdrop}
      // Kartın ve sticky şeridin köşesiyle AYNI — üçü de Keşif kartının yüzünü
      // okuyor (bkz. CARD_EXPANDED_CORNER_RADIUS). Sheet safe-area çizgisinde
      // açıldığı için donanım köşe maskesiyle çakışma yok.
      cornerRadius={CARD_EXPANDED_CORNER_RADIUS}
      // Squircle: kartın kabuğu da şeridin kırpması da `continuous` çiziyor,
      // circular bir clip aynı yarıçapta bile kenar boyunca onları kesiyor.
      cornerCurve="continuous"
      // Sheet zemini şeffaf: kartın kendi zemini zaten opak, ikinci bir katman
      // yalnızca köşelerde sızardı. (Clip artık kartla aynı yarıçapta olduğu
      // için hilal kalmıyor; şeffaflık yine de en güvenli hâli.)
      backgroundStyle={{ backgroundColor: "transparent" }}
      // Sheet'in kendi pan'i eşiksiz çalışıyordu: iki parmak fotoğrafın üstünde
      // birbirinden uzaklaşırken en ufak dikey kayma bile "aşağı çekip kapat"
      // olarak yakalanıp pinch'i (PinchZoomable) kesebiliyordu. 10px pay
      // büyütme jestinin önce aktive olmasına yetiyor; kapatma jesti o eşikten
      // sonra aynen çalışıyor (LikerSwipeModal ile aynı ayar).
      activeOffsetY={[-10, 10]}
    >
      <View style={{ flex: 1 }}>
        {/* Sabit zemin — scroll'un ÖNÜNDE, yani her şeyin altında. */}
        {backdropUri && <CardGlassBackdrop uri={backdropUri} />}

        <CardSheetScrollView
          style={{ flex: 1, backgroundColor: "transparent" }}
          contentContainerStyle={{ paddingBottom: 0 }}
          zoomImpact={photoZoom}
          scrollY={scrollY}
          // Profil yüklenene kadar içerik sadece bir spinner — ekrandan kısa,
          // yani doldurulacak bir esneme boşluğu da yok.
          // Zemin varken de KAPALI: alt uçtaki bounce boşluğunu artık zemin
          // dolduruyor, kuyruk onun üstüne opak bir şerit çizerdi.
          fillOverscroll={!!profile && !backdropUri}
        >
          {profile ? (
            // expanded={false}: scroll'u saran CardSheetScrollView yapar, kartın
            // kendi scroll'u kapalı (bkz. CardSheetScrollView).
            //
            // `hideExpandHint` BURADAYDI — kapaktaki "yukarı kaydır" ipucunu
            // kapatıyordu; ipucunun kendisi kaldırıldı (bkz. SwipeCard).
            <SwipeCard
              profile={profile}
              hideActions
              previewMode
              expanded={false}
              zoomImpact={photoZoom}
              onReport={onReport}
              onBlock={onBlock}
            />
          ) : (
            <View
              style={{
                flex: 1,
                alignItems: "center",
                justifyContent: "center",
                minHeight: 400,
              }}
            >
              <ActivityIndicator color={colors.text} />
            </View>
          )}
        </CardSheetScrollView>

        {/* Kartın sabit başlığı: isim/yaş YALNIZ burada — kartın içinde
            ayrıca çizilmiyor, o yüzden scroll beklemeden açık duruyor. */}
        {profile && (
          <CardStickyHeader
            profile={profile}
            alwaysOpen
            // Keşif'teki köşe butonlarıyla AYNI pay. Sheet artık safe-area'nın
            // altında başladığı için sıfır — sabit yine de okunuyor ki iki
            // bağlam ayrışmasın (bkz. CARD_CHROME_TOP_DROP).
            topInset={CARD_CHROME_TOP_DROP}
            radius={CARD_EXPANDED_CORNER_RADIUS}
            onMenu={onMenu}
            onEdit={onEdit}
            // Şeridin SOL ucundaki cam "kapat" — sheet'i aşağı çekme jestinin
            // görünür karşılığı. Kart tam ekranı kapladığı için altındaki
            // ekranın kendi kapat/geri kontrolü erişilemez durumda; jest de
            // aynen duruyor, bu onun yerine geçmiyor (bkz. CardStickyHeader >
            // onClose). Sheet'in kendi kapanış yolundan geçiyor: `onClose`
            // parent'ın `visible`ını düşürüyor, animasyon gorhom'un.
            onClose={onClose}
            // Şerit açık doğuyor (`alwaysOpen`), yani scroll'u başlığı AÇMAK
            // için okumuyor: "bugün aktif" bununla sönüyor.
            scrollY={scrollY}
            // `progress` VERİLMİYOR → şerit hiç sönmüyor; gerekçe yukarıda,
            // kaldırılan hook'un yerinde.
          />
        )}
      </View>
    </AppBottomSheet>
  );
}
