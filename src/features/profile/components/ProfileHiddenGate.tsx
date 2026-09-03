import { useCallback, useEffect, useRef, useState } from "react";
import { View, Text, TouchableOpacity } from "react-native";
import { BottomSheetBackdrop } from "@gorhom/bottom-sheet";
import { EyeOff, ShieldAlert, Camera } from "@/shared/icons";
import { useTranslation } from "react-i18next";
import AppBottomSheet from "@/shared/components/AppBottomSheet";
import { useSwipeTutorialBlocking } from "@/features/discover/swipeTutorialGate";
import SFIcon, { type SFSymbol } from "@/shared/components/SFIcon";
import { colors, ink } from "@/shared/theme/colors";
import type { ProfileVisibility } from "@/features/profile/photoModeration";

/**
 * Profil keşif havuzundan düştüğünde açılan BİLGİLENDİRME kapısı.
 *
 * ⚠️ ADI "kapı" ama hiçbir şeyi KAPATMIYOR — her kipte kapatılabilir. Foto onayı
 * bir kapı değil rozet: backend like/süper beğeni/pass/not/mesajın hiçbirini
 * foto durumuna bakarak reddetmiyor (rehber §3), dolayısıyla istemci de
 * etkileşimleri kilitlemiyor. Bu sheet yalnız "profilin şu an keşifte
 * görünmüyor" cümlesini bir kez söylüyor; kalıcı gösterge profil ekranındaki
 * `ProfileVisibilityBanner`.
 *
 * CTA iki kipe ayrılıyor — ayrım STATE ADINDAN DEĞİL `awaitingReview`'dan:
 *
 *   BEKLEME — fotoğraflar incelemede. Yapılacak iş yok (bitince görünürlük
 *   kendiliğinden dönüyor), sadece "Tamam".
 *
 *   AKSİYON — bekleyen foto YOKKEN yetersiz görünür fotoğraf (red/silme
 *   sonrası). "Fotoğraf ekle" çözüm sunuyor, yanında kapatma seçeneğiyle.
 *
 * `Suspended` foto eksikliğinin ÖNÜNDE gelir ve buraya hiç düşmüyor: ban akışı
 * (`AccountBlockedScreen`) navigator ağacının dışında ve her şeyin üstünde.
 *
 * ⚠️ `backend_photo_moderation_proposal.md` §4.5 "Visible olmayan HER durumda
 * kapatılamaz akış" diyor; kapatılabilirlik o satırdan BİLİNÇLİ bir sapma —
 * rehberin §4'ü de bunun bir ürün kararı olduğunu söylüyor.
 */
export default function ProfileHiddenGate({
  visibility,
  awaitingReview,
  onAddPhoto,
  onOpenChange,
}: {
  visibility: ProfileVisibility | null;
  /**
   * Kullanıcının incelemeyi bekleyen fotoğrafı var mı (`null` = bilinmiyor).
   * Hangi CTA'nın gösterileceğini STATE ADI değil bu belirliyor —
   * bkz. hasPhotosAwaitingReview.
   */
  awaitingReview: boolean | null;
  onAddPhoto: () => void;
  /**
   * Kapı açıldı/kapandı. Aynı seviyedeki diğer sheet'ler (konum izni kapısı)
   * sıraya girebilsin diye: gorhom'un `stackBehavior` varsayılanı "replace",
   * yani ikinci bir sheet present edilirse bu kapı sessizce dismiss edilir ve
   * kullanıcı mesajı hiç görmez. `dismissed` bu component'in İÇİNDE tutulduğu
   * için açıklık dışarıdan türetilemiyor — bu yüzden bildiriliyor.
   */
  onOpenChange?: (open: boolean) => void;
}) {
  const { t } = useTranslation();

  const state = visibility?.state;
  /**
   * Yaptırım kapısı BURASI DEĞİL: `Suspended` geldiğinde ban akışı
   * (`AccountBlockedScreen`) zaten navigator ağacının dışında ve her şeyin
   * üstünde açılıyor. İkisini birden çizmek aynı bilgiyi iki kez veriyordu;
   * rehber §10 da "Suspended → ban akışı, fotoğraf ekle deme" diyor.
   */
  const suspended = state === "Suspended";
  /**
   * BEKLEME durumu — kullanıcının yapabileceği hiçbir şey yok: fotoğraflar
   * sunucuda inceleniyor, bitince `PhotoModerationChanged` ile görünürlük
   * kendiliğinden dönüyor.
   *
   * Ayrım STATE ADINA GÜVENMİYOR: yeni kullanıcının iki fotoğrafı da
   * incelemedeyken görünür foto sayısı 0 olduğu için sunucu
   * `HiddenInsufficientPhotos` da gönderebiliyor. Ölçüt, bekleyen fotoğrafın
   * VARLIĞI (`awaitingReview`) — o durumda "fotoğraf ekle" CTA'sı çözüm
   * sunmuyor, eklenen yeni fotoğraf da incelemeye giriyor.
   */
  const waiting =
    !suspended && (state === "HiddenUnderReview" || awaitingReview === true);

  // Kapı kapatılabildiği için "kapattı mı" bilgisi burada tutuluyor. Durum
  // değişince (inceleme bitti / başka sebebe geçti) sıfırlanıyor, yoksa bir kez
  // kapatan kullanıcı sonraki DEĞİŞİKLİĞİ hiç duymazdı.
  const [dismissed, setDismissed] = useState(false);
  useEffect(() => {
    setDismissed(false);
  }, [state, awaitingReview]);

  /**
   * SIRA: Discover'ın ilk giriş swipe demosu oynarken (ya da oynamak üzereyken)
   * kapı açılmıyor. Kapı kartın üstünde duruyor; yeni kullanıcının fotoğrafları
   * incelemede olduğu için ikisi AYNI ANDA çıkıyor ve demo kapının arkasında
   * oynayıp "görüldü" işaretleniyordu — jest hiç görülmeden kayboluyordu.
   * Demo bitince bayrak düşüyor ve kapı normal şekilde açılıyor.
   */
  const tutorialBlocking = useSwipeTutorialBlocking();
  /**
   * Demo yüzünden kapanış PROGRAMATİK: AppBottomSheet `visible=false` görünce
   * dismiss ediyor, gorhom da onDismiss → `onClose` çağırıyor. Bunu "kullanıcı
   * kapattı" saymak, bekleme kipindeki kapıyı bir daha AÇILMAMAK üzere gömerdi
   * (dismissed yalnız state değişiminde sıfırlanıyor). Kapanış anında bayrağı
   * okuyabilmek için ref: onDismiss kapanma animasyonundan sonra geliyor.
   */
  const blockingRef = useRef(false);
  useEffect(() => {
    blockingRef.current = tutorialBlocking;
  }, [tutorialBlocking]);

  const open =
    !!state && state !== "Visible" && !suspended && !dismissed && !tutorialBlocking;

  useEffect(() => {
    onOpenChange?.(open);
  }, [open, onOpenChange]);

  const renderBackdrop = useCallback(
    (props: any) => (
      <BottomSheetBackdrop
        {...props}
        appearsOnIndex={0}
        disappearsOnIndex={-1}
        opacity={0.7}
        pressBehavior="close"
      />
    ),
    [],
  );

  const icon: { sf: SFSymbol; fallback: any } = suspended
    ? { sf: "exclamationmark.shield.fill", fallback: ShieldAlert }
    : { sf: "eye.slash.fill", fallback: EyeOff };

  // Metin anahtarı state'e bağlı; bilinmeyen bir state gelirse (backend yeni
  // bir sebep eklerse) nötr "profilin şu an görünmüyor" metnine düşüyoruz.
  const key =
    state === "HiddenInsufficientPhotos" ||
    state === "HiddenUnderReview" ||
    state === "Suspended"
      ? state
      : "fallback";

  const visible = visibility?.visiblePhotoCount ?? 0;
  const required = visibility?.requiredPhotoCount ?? 0;

  return (
    <AppBottomSheet
      visible={open}
      snapPoints={["58%"]}
      onClose={() => {
        if (blockingRef.current) return;
        setDismissed(true);
      }}
      backdropComponent={renderBackdrop}
      // Her durumda aşağı çekilerek kapanır — bilgilendirme, kapı değil.
      enablePanDownToClose
      enableContentPanningGesture
      enableHandlePanningGesture
      enableOverDrag
    >
      <View
        style={{
          flex: 1,
          backgroundColor: colors.bg,
          paddingHorizontal: 24,
          paddingTop: 36,
          paddingBottom: 28,
          alignItems: "center",
        }}
      >
        {/* İkon alanı kayıttaki konum izni sheet'iyle aynı dilde: büyük daire +
            büyük sembol. Farkı, çerçeve yerine GRİ dolgu (ink: açık modda
            siyah-üstü, koyuda beyaz-üstü şeffaf) ve hairline çerçevenin
            olmaması. Sembol rengi `errorStrong` DEĞİL `text`: kapı zaten kırmızı
            bir uyarı değil, durum bildirimi — açık modda siyah duruyor. */}
        <View
          style={{
            width: 116,
            height: 116,
            borderRadius: 999,
            borderCurve: "continuous",
            alignItems: "center",
            justifyContent: "center",
            backgroundColor: ink(0.07),
            marginBottom: 20,
          }}
        >
          <SFIcon
            name={icon.sf}
            fallback={icon.fallback}
            size={52}
            color={colors.text}
            strokeWidth={1.6}
            weight="semibold"
          />
        </View>

        <Text
          style={{
            color: colors.text,
            fontSize: 24,
            fontWeight: "700",
            textAlign: "center",
            marginBottom: 12,
          }}
        >
          {t(`profile.visibilityGate.${key}.title`)}
        </Text>

        <Text
          style={{
            color: colors.textSecondary,
            fontSize: 15,
            lineHeight: 22,
            textAlign: "center",
          }}
        >
          {t(`profile.visibilityGate.${key}.message`, { visible, required })}
        </Text>

        <View style={{ flex: 1 }} />

        {/* İncelemede: "Fotoğraf ekle" YERİNE tek bir kapatma butonu — eklenen
            yeni fotoğraf da incelemeye gider, yani CTA çözüm sunmuyor.
            Aksiyon kipinde CTA'nın ALTINDA ikincil bir kapatma var: sheet zaten
            aşağı çekilerek/arka plana basılarak kapanıyor ama tek görünür buton
            "Fotoğraf ekle" olsaydı kapı hâlâ mecburi okunurdu. */}
        {waiting ? (
          <TouchableOpacity
            activeOpacity={0.85}
            onPress={() => setDismissed(true)}
            style={{
              width: "100%",
              height: 54,
              borderRadius: 999,
              borderCurve: "continuous",
              backgroundColor: colors.text,
              alignItems: "center",
              justifyContent: "center",
            }}
          >
            <Text style={{ color: colors.bg, fontSize: 16, fontWeight: "700" }}>
              {t("common.ok")}
            </Text>
          </TouchableOpacity>
        ) : (
          <>
            <TouchableOpacity
              activeOpacity={0.85}
              onPress={onAddPhoto}
              style={{
                width: "100%",
                height: 54,
                borderRadius: 999,
                borderCurve: "continuous",
                backgroundColor: colors.text,
                flexDirection: "row",
                alignItems: "center",
                justifyContent: "center",
                gap: 8,
              }}
            >
              <SFIcon
                name="camera.fill"
                fallback={Camera}
                size={18}
                color={colors.bg}
                strokeWidth={2}
                weight="semibold"
              />
              <Text
                style={{ color: colors.bg, fontSize: 16, fontWeight: "700" }}
              >
                {t("profile.visibilityGate.addPhoto")}
              </Text>
            </TouchableOpacity>
            <TouchableOpacity
              activeOpacity={0.7}
              onPress={() => setDismissed(true)}
              style={{
                height: 44,
                alignItems: "center",
                justifyContent: "center",
              }}
            >
              <Text
                style={{
                  color: colors.textSecondary,
                  fontSize: 15,
                  fontWeight: "600",
                }}
              >
                {t("common.close")}
              </Text>
            </TouchableOpacity>
          </>
        )}
      </View>
    </AppBottomSheet>
  );
}
