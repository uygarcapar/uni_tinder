import { useCallback } from "react";
import { View, ActivityIndicator } from "react-native";
import { BottomSheetBackdrop } from "@gorhom/bottom-sheet";
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
export default function PreviewModal({
  visible,
  onClose,
  profile,
  onReport,
  onBlock,
  onMenu,
}: any) {
  // Top'a çarpma zoom'u — scroll CardSheetScrollView'da, foto katmanı SwipeCard'da.
  const photoZoom = useSharedValue(0);
  // Ham scroll konumu — sticky şerit "bugün aktif"i buna göre söndürüp ismi
  // ortalıyor (bkz. CardStickyHeader).
  const scrollY = useSharedValue(0);

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
    (props: any) => (
      <BottomSheetBackdrop
        {...props}
        appearsOnIndex={0}
        disappearsOnIndex={-1}
        opacity={0.5}
      />
    ),
    [],
  );

  return (
    <AppBottomSheet
      visible={visible}
      onClose={onClose}
      snapPoints={["100%"]}
      // TELEFONUN EN TEPESİNE: kart Keşif'te expand edilince ekranın 0'ına
      // oturuyor (bkz. SwipeWrapper > HEADER_COVER), buradaki kart da aynı
      // yere gitmeli — safe-area kadar aşağıda başlamak sheet'i "yarım açılmış"
      // gösteriyordu. Durum çubuğunun altında kalan tek şey şeridin başlık
      // satırı değil: onu CARD_CHROME_TOP_DROP aşağı itiyor (aşağıda).
      topInset={0}
      handleComponent={null}
      backdropComponent={renderBackdrop}
      // Kartın ve sticky şeridin köşesiyle AYNI. Sheet artık ekranın tepesine
      // dayandığı için AÇIK değer: 50 telefonun köşe maskesinden yuvarlak
      // kalıp üst iki köşede hilal bırakıyordu (bkz.
      // CARD_EXPANDED_CORNER_RADIUS).
      cornerRadius={CARD_EXPANDED_CORNER_RADIUS}
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
            // hideChevron: kart zaten `expanded` açılıyor ve `onExpandPress`
            // yok — ok sadece dekoratif kalıyordu. LikerSwipeModal ile aynı.
            // expanded={false}: scroll'u saran CardSheetScrollView yapar, kartın
            // kendi scroll'u kapalı (bkz. CardSheetScrollView).
            <SwipeCard
              profile={profile}
              hideActions
              previewMode
              expanded={false}
              hideChevron
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
            // Sheet ekranın 0'ına dayanıyor → şeridin İÇERİĞİ durum çubuğunun
            // altına insin (bandın kendisi tepede kalır, o kadar uzar).
            // Keşif'teki köşe butonlarıyla aynı pay.
            topInset={CARD_CHROME_TOP_DROP}
            radius={CARD_EXPANDED_CORNER_RADIUS}
            onMenu={onMenu}
            // Şerit açık doğuyor (`alwaysOpen`), yani scroll'u başlığı AÇMAK
            // için okumuyor: "bugün aktif" bununla sönüyor ve isim ortalanıyor.
            scrollY={scrollY}
          />
        )}
      </View>
    </AppBottomSheet>
  );
}
