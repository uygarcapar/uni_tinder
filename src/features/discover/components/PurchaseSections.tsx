import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import {
  View,
  Text,
  TouchableOpacity,
  ActivityIndicator,
  Animated,
  Easing,
} from "react-native";
import * as Haptics from "expo-haptics";
import { X, Check, Info, ShoppingBag } from "@/shared/icons";
import { LinearGradient } from "expo-linear-gradient";
import SFIcon from "@/shared/components/SFIcon";
import SkeletonBox from "@/shared/components/SkeletonBox";
import PremiumFlame from "@/shared/components/PremiumFlame";
import AnimatedPressable from "@/shared/components/AnimatedPressable";
import PremiumBenefitInfoSheet from "@/features/discover/components/PremiumBenefitInfoSheet";
import {
  computeSavings,
  PLAN_CARD_WIDTH,
  type PurchaseFlow,
} from "@/features/discover/usePurchaseFlow";
import {
  formatSubscriptionDate,
  openStoreSubscriptions,
  subscriptionManageLabel,
  useSubscriptionView,
} from "@/features/profile/subscriptionView";
import { colors, gradients, ink, isLight, onMediaAt } from "@/shared/theme/colors";

/**
 * Plan kartının yarıçapı — iskelet de aynı sayıyı kullanıyor. 40, çünkü
 * ProfileScreen'deki upsell kartı da 40: gradyanı paylaşan iki yüzey köşesini de
 * paylaşsın.
 */
const PLAN_CARD_RADIUS = 40;
/**
 * Kart için AYRILAN boy. Aynı sayı iki yere birden gidiyor: iskeletin yüksekliği
 * ve gerçek kartın `minHeight`i. Katalog gelince kart, iskeletin bıraktığı
 * boşluğa birebir oturuyor — sayfa zıplamıyor.
 *
 * Sayı, kartın OLAĞAN hâline göre: paylar + "plus" satırı + fiyat + iki satır
 * açıklama + alt şerit. Deneme uyarısı için pay AYRILMIYOR — ayrılınca kart
 * boş boş uzuyordu. Bedeli: `checkIntroEligibility` cevabı deneme satırını
 * getirirse kart bir kez uzar.
 *
 * İçerik daha kısa olduğunda fark alta düşüyor, dağılmıyor: alt şerit
 * `marginTop: "auto"` ile kartın dibine çivili (bkz. renderItem).
 */
const PLAN_CARD_HEIGHT = 208;
// Ad satırındaki alev: "plus"ın 55pt'lik gövdesiyle aynı ağırlıkta dursun diye
// büyük, ama ondan bir tık KÜÇÜK — eşit boyda ikisi de başlık gibi okunuyordu.
// ProfileScreen'in upsell kartındaki 68'in kart genişliğine göre küçülmüş hâli.
const PLAN_CARD_FLAME_SIZE = 46;

/**
 * lit plus paywall'ının görsel parçaları. Tek kabı var: ProfileScreen'in "plus"
 * sayfası (features/profile/components/PlusPage). Parçalar yine de ayrı bir
 * dosyada — sayfa yalnız düzeni (scroll + paylar) kuruyor, satın alma mantığı
 * `usePurchaseFlow`ta; burada state yok.
 *
 * (Bir zamanlar aynı parçaları bir bottom sheet — PurchaseModal — de
 * kullanıyordu; o kap kaldırıldı, tüm girişler sayfaya bakıyor. Bkz.
 * features/profile/litPlusEntry.)
 */

/**
 * Seçili kartın dibindeki eylem rozeti.
 *
 * Ayrı bir "abone ol" butonu YOK: satın alma kartın kendisine dokununca
 * başlıyor, bu rozet de o dokunuşun ne yapacağını söylüyor.
 *
 * YALNIZ SATIN ALINABİLİR HÂLDE: kullanıcı zaten aboneyse kartın alt şeridini
 * bu rozet değil üyelik kartındakinin aynısı olan "Aboneliği Yönet" butonu
 * alıyor (bkz. renderItem).
 *
 * BEKLEME GÖSTERGESİ = İSKELET, spinner değil: basınca rozetin yerinde tam onun
 * boyunda bir shimmer pill dönüyor. Dönen çember denenmişti, mağaza sayfası bir
 * kare sonra üstüne açıldığı için yalnız titriyordu. Basılan kart o sırada
 * `disabled` (bkz. renderItem), yani mükerrer dokunuş da imkânsız.
 *
 * İskelet rozetin YERİNİ ALMIYOR, ÜSTÜNE biniyor (absolute): rozet düzende
 * kalıyor, sadece görünmez oluyor. Böylece kartın alt şeridi — dolayısıyla
 * kartın boyu — yükleme başlarken hiç oynamıyor. Boyu ölçümden geliyor, sabit
 * bir tahminden değil: etiket ("Abone ol" / "Zaten üyesin") dile ve duruma göre
 * değişiyor.
 *
 * Mürekkep `onMedia`: rozet kartın kendi medya dolgusunun üstünde duruyor —
 * iskeletin dolgusu/parlaması da o yüzden beyaz-alfa, `surface` DEĞİL.
 */
function SelectedBadge({ active, label, loading }: any) {
  const progress = useRef(new Animated.Value(active ? 1 : 0)).current;
  const [box, setBox] = useState<{ width: number; height: number } | null>(null);

  useEffect(() => {
    Animated.timing(progress, {
      toValue: active ? 1 : 0,
      duration: 320,
      easing: Easing.bezier(0.4, 0, 0.2, 1),
      useNativeDriver: true,
    }).start();
  }, [active]);

  // Ölçüm bir kez oturuyor; aynı sayı tekrar gelirse state'e YAZMIYORUZ, yoksa
  // her layout turu kartı yeniden çizerdi.
  const handleLayout = useCallback((e: any) => {
    const { width, height } = e.nativeEvent.layout;
    setBox((prev) =>
      prev &&
      Math.abs(prev.width - width) < 0.5 &&
      Math.abs(prev.height - height) < 0.5
        ? prev
        : { width, height },
    );
  }, []);

  // Ölçüm gelmeden iskelet çizilmiyor: ilk karede boyu bilinmiyor ve "%100"lük
  // bir kutu rozetin doğal genişliğini bozardı.
  const showSkeleton = Boolean(loading) && box !== null;

  return (
    <Animated.View onLayout={handleLayout} style={{ opacity: progress }}>
      <View
        style={{
          // Dibe oturtma ve hizalama artık kartın alt ŞERİDİNDE (bkz. renderItem):
          // rozet o şeridin sağ ucu, indirim pill'i sol ucu.
          flexDirection: "row",
          alignItems: "center",
          gap: 5,
          paddingHorizontal: 4,
          // Gizleme opaklıkla: `display: none` rozeti düzenden düşürür ve
          // ölçtüğümüz kutu sıfırlanırdı.
          opacity: showSkeleton ? 0 : 1,
        }}
      >
        <SFIcon
          name="bag.fill"
          fallback={ShoppingBag}
          size={15}
          color={colors.onMedia}
          strokeWidth={2}
          weight="semibold"
        />
        <Text
          style={{
            color: colors.onMedia,
            fontSize: 15,
            fontWeight: "600",
          }}
        >
          {label}
        </Text>
      </View>
      {showSkeleton && (
        <SkeletonBox
          width={box!.width}
          height={box!.height}
          borderRadius={999}
          // Kart medya → iskelet de onMedia ailesinden. Varsayılan
          // `surface`/`shimmer` modla döner ve kırmızı kartın üstünde açık modda
          // koyu bir kutuya dönerdi.
          color={onMediaAt(0.22)}
          shimmerColor={onMediaAt(0.45)}
          style={{ position: "absolute", top: 0, left: 0 }}
        />
      )}
    </Animated.View>
  );
}

/**
 * Kartın periyoda göre değişen bilgisinin (fiyat + açıklama) tazelenmesi.
 *
 * KAPSAM DAR ve öyle kalmalı: kartın tamamı — marka kelimesi, alev, alt şerit —
 * bir süre tüm içeriği birlikte animasyona sokuyordu ve şeritte periyot
 * değiştirmek kartı baştan çiziliyormuş gibi gösteriyordu. Oysa değişen şey
 * yalnız fiyat ve açıklama; kabuk yerinde durunca göz de yalnız değişene
 * bakıyor.
 *
 * Yalnız OPAKLIK (kayma yok) ve yalnız GİRİŞ: çıkış için içeriğin bir süre eski
 * planda tutulması gerekirdi, o da kartın yazdığı fiyatla basınca satın alınan
 * planın birbirinden ayrılabildiği bir pencere açardı.
 */
function PlanFactsFade({ swapKey, children }: any) {
  const anim = useRef(new Animated.Value(1)).current;
  // İlk turda çalışmıyor: blok iskeletin yerine zaten yeni geliyor, bir de
  // açılarak girmesi girişi iki animasyonlu yapıyordu.
  const firstRun = useRef(true);

  useEffect(() => {
    if (firstRun.current) {
      firstRun.current = false;
      return;
    }
    anim.setValue(0);
    Animated.timing(anim, {
      toValue: 1,
      duration: 220,
      easing: Easing.out(Easing.quad),
      useNativeDriver: true,
    }).start();
  }, [swapKey]);

  return <Animated.View style={{ opacity: anim }}>{children}</Animated.View>;
}

/**
 * Kartın periyoda göre DEĞİŞEN bilgisi: fiyat + açıklama + (hak kazanılmışsa)
 * deneme uyarısı.
 *
 * Ayrı bir bileşen, çünkü kart bunu bir kez değil HER PERİYOT İÇİN çiziyor:
 * görünen kopya seçili planınki, diğerleri görünmez ölçü kopyası
 * (bkz. PlanFactsBlock).
 */
function PlanFacts({ plan, t, isTrialEligible }: any) {
  const planIntro = plan.introPrice;
  const planTrialUnits = planIntro?.periodNumberOfUnits;
  const planTrialDays =
    typeof planTrialUnits === "number" && planTrialUnits > 0
      ? planTrialUnits
      : null;
  const planShowTrial =
    Boolean(planIntro) &&
    planTrialDays !== null &&
    isTrialEligible(plan.productId);
  // Fiyatın birimi ("hafta" / "ay" / "yıl") — hem fiyat satırında hem deneme
  // uyarısında. Tanımadığımız bir periyotta ham `period` düşüyor: anahtarın
  // kendisini ("purchase.periods.lifetimePer") basmaktan iyi.
  const planPeriodLabel = t(`purchase.periods.${plan.period}Per`, {
    defaultValue: plan.period ?? "",
  });
  // Plana özel açıklama. Katalogda tanımadığımız bir periyot gelirse
  // (ör. lifetime) defaultValue boş → ham anahtar basılmaz, satır hiç
  // çizilmez.
  //
  // Tasarruf CÜMLESİ artık burada değil: yüzde kartın alt şeridindeki
  // indirim pill'ine taşındı, ikisi birden yazılınca aynı sayı tek
  // kartta iki kez geçiyordu.
  const planDesc = t(`purchase.planDesc.${plan.period}`, {
    defaultValue: "",
  });

  return (
    <>
      {/* Periyot fiyatın SAĞINDA ("₺49,99 / ay"): marka kelimesinin
          yanındaki çerçeveli pill kaldırıldı, periyodu söyleyen tek yer
          burası. Fiyatın kendisiyle aynı satırda ve ondan soluk —
          okunan şey fiyat, periyot onun birimi.
          `baseline`: iki farklı punto aynı taban çizgisine otursun. */}
      <View style={{ flexDirection: "row", alignItems: "baseline" }}>
        <Text
          style={{
            color: colors.onMedia,
            fontSize: 18,
            fontWeight: "400",
          }}
        >
          {plan.priceString ?? "—"}
        </Text>
        {planPeriodLabel ? (
          <Text
            style={{
              color: colors.onMediaMuted,
              fontSize: 15,
              fontWeight: "400",
              marginLeft: 5,
            }}
          >
            {`/ ${planPeriodLabel}`}
          </Text>
        ) : null}
      </View>
      {planDesc ? (
        <Text
          style={{
            color: colors.onMediaMuted,
            fontSize: 13,
            fontWeight: "400",
            marginTop: 6,
            lineHeight: 17,
          }}
        >
          {planDesc}
        </Text>
      ) : null}
      {planShowTrial && (
        <Text
          style={{
            color: colors.onMediaMuted,
            fontSize: 13,
            fontWeight: "400",
            marginTop: 4,
            lineHeight: 16,
          }}
        >
          {t('purchase.cta.trialDisclaimer', { days: planTrialDays, price: plan.priceString ?? "—", period: planPeriodLabel })}
        </Text>
      )}
    </>
  );
}

/**
 * Fiyat bloğunun kabı — kartın BOYUNU PERİYOTTAN BAĞIMSIZ kılan yer.
 *
 * Blok tek başına bırakılınca boyu seçili plana göre değişiyordu: açıklama bir
 * periyotta tek, diğerinde iki satır sarıyor ve deneme uyarısı fiyat metnine
 * göre bir satır uzayıp kısalıyor. Kartın `minHeight`i (PLAN_CARD_HEIGHT) bunu
 * yalnız içerik ondan KISAYKEN gizliyor; deneme satırı geldiğinde içerik tabanı
 * aşıyor ve periyot değiştikçe kart (ve altındaki tablo) bir satır boyu
 * oynuyordu.
 *
 * Çözüm ÖLÇÜM DEĞİL DÜZEN: blok bütün periyotların bilgisini birden çiziyor,
 * yalnız seçili olan görünür. `row` kabında kutunun boyu en uzun çocuğunkidir →
 * blok her zaman EN UZUN periyodun boyunda, seçim değişince oynamıyor. Görünmez
 * kopyalar da kabın tam genişliğinde: satır sarmaları gerçek kartla birebir
 * olsun diye. Sağa taşan bu kopyaları `overflow: hidden` kırpıyor.
 *
 * (Alternatifi — her varyantı `onLayout` ile ölçüp en büyüğünü state'e yazmak —
 * ilk turda yine bir kare oynardı; burada ilk düzen turunda boy zaten doğru.)
 */
function PlanFactsBlock({ plans, plan, t, isTrialEligible }: any) {
  return (
    <View
      style={{
        flexDirection: "row",
        alignItems: "flex-start",
        overflow: "hidden",
      }}
    >
      <View style={{ width: "100%", flexShrink: 0 }}>
        {/* Şeritten periyot değişince yalnız bu blok yeniden beliriyor;
            marka kelimesi, alev ve alt şerit hiç oynamıyor. */}
        <PlanFactsFade swapKey={plan.period}>
          <PlanFacts plan={plan} t={t} isTrialEligible={isTrialEligible} />
        </PlanFactsFade>
      </View>
      {plans
        .filter((p: any) => p.period !== plan.period)
        .map((p: any) => (
          <View
            key={p.productId ?? p.period}
            pointerEvents="none"
            accessibilityElementsHidden
            importantForAccessibility="no-hide-descendants"
            style={{ width: "100%", flexShrink: 0, opacity: 0 }}
          >
            <PlanFacts plan={p} t={t} isTrialEligible={isTrialEligible} />
          </View>
        ))}
    </View>
  );
}

/**
 * Kartın marka kelimesi: Duckie-regular "plus+".
 *
 * Yanındaki çerçeveli PERİYOT PILL'İ KALDIRILDI — periyodu artık fiyatın
 * sağındaki "/ hafta" söylüyor. Pill oradayken aynı bilgi kartın iki ayrı
 * yerinde duruyordu ve marka kelimesinin hemen bitişiğindeki rozet başlığı
 * ikiye bölüyordu.
 *
 * Backend `displayName`i KULLANILMIYOR (ör. "Aylık Premium"): tek dilli geliyor
 * ve kartın kimliği periyoda göre değişmiyor. Bu yüzden ondan periyot
 * ayrıştıran eski `renderPlanName` de gitti.
 *
 * "+" da Duckie'nin kendi glifi: marka kelimesi tek bir `Text`, ayrı fontta bir
 * artı işareti iki farklı yazı gibi okunuyordu.
 */
function PlanBrandWord({
  size = 44,
  color = colors.text,
}: {
  size?: number;
  color?: string;
}) {
  return (
    <Text
      style={{
        color,
        fontFamily: "Duckie-regular",
        fontSize: size,
        includeFontPadding: false,
      }}
    >
      plus+
    </Text>
  );
}

/**
 * Sayfanın tepesindeki başlık + giriş cümlesi.
 *
 * Başlık ABONELİĞE GÖRE: abone değilse eylem ("Lit Plus'a Geç"), aboneyse
 * yalnız sayfanın adı ("Lit Plus") — aboneye satış cümlesiyle sesleniyor
 * olmak sayfanın geri kalanıyla (yönetim kartı) çelişiyordu.
 *
 * SOLA YASLI ve kabın kendi gutter'ında — başlık, plan kartı, özellik tablosu
 * ve bu cümle aynı sol hattan başlıyor.
 */
export function PurchaseHeading({ flow }: { flow: PurchaseFlow }) {
  const { t, isPremium } = flow;
  return (
    // Beğeniler ekranının sekme başlıklarıyla AYNI blok (bkz.
    // LikesScreen/LikesListHeader): 33/700 başlık + hemen altında 16/22 gri alt
    // yazı, bloğun altında 26 pay. İki sayfa aynı yapıda okunsun diye ölçüler
    // birebir kopya — orada değişirse burası da değişmeli.
    <View style={{ marginBottom: 26 }}>
      {/* Başlık satırı orada bir SATIR kabı (metnin sağında satın alma pill'i
          olabiliyor); burada pill yok ama kalıp aynı kalsın diye kap duruyor —
          `flexShrink: 1` de oradaki gerekçeyle: kırpılacak olan başlıktır. */}
      <View style={{ flexDirection: "row", alignItems: "center", gap: 10 }}>
        <Text
          style={{
            flexShrink: 1,
            color: colors.text,
            fontSize: 33,
            fontWeight: "700",
          }}
        >
          {t(
            isPremium
              ? 'discover.premium.pageTitlePremium'
              : 'discover.premium.pageTitle',
          )}
        </Text>
      </View>
      <Text
        style={{
          // 33 punto başlığın kendi satır boşluğu zaten aşağı doğru bir pay
          // bırakıyor — alt yazı başlığın devamı, ayrı bir paragraf değil.
          marginTop: 2,
          color: colors.textSecondary,
          fontSize: 16,
          lineHeight: 22,
          paddingRight: 8,
        }}
      >
        {t('discover.premium.description')}
      </Text>
    </View>
  );
}

/**
 * Periyot şeridi — tek bir kapsül pill'in içinde plan başına birer pill.
 *
 * Seçili pill KAYIYOR: dolgu her sekmede ayrı bir view değil, tek bir kapsül;
 * `translateX` ile seçilen bölmeye gidiyor (transform → UI thread, layout
 * commit'i yok). Bölmeler eşit genişlikte (flex: 1), o yüzden hedef konum tek
 * çarpma: index × (şerit / bölme sayısı).
 *
 * Etiketler YERELLEŞTİRİLMİŞ (`purchase.periods.*Short`): bir süre İngilizce
 * sabitti ("Weekly/Monthly/Yearly") — marka dili gerekçesiyle — ama sayfadaki
 * tek İngilizce metin oydu ve kartın içinde de aynı kelime geçtiği için Türkçe
 * bir sayfada iki kez yabancı duruyordu. Marka dili yalnız "plus".
 *
 * Katalogda tanımadığımız bir periyot gelirse (ör. yeni bir "lifetime" türevi)
 * ham `period` basılıyor — anahtarı güzelleştirmeye çalışmıyoruz.
 */
const planPeriodShortLabel = (
  period: string,
  t: (key: string, opts?: any) => string,
) => t(`purchase.periods.${period}Short`, { defaultValue: period });

function PlanPeriodPills({
  plans,
  selectedPeriod,
  onSelect,
  disabled,
  t,
}: {
  plans: any[];
  selectedPeriod: string | null;
  onSelect: (period: string, index: number) => void;
  disabled?: boolean;
  t: (key: string, opts?: any) => string;
}) {
  const [stripWidth, setStripWidth] = useState(0);
  // Rozet TEK plana takılıyor: en çok tasarruf ettiren. Eskiden tabana göre
  // tasarrufu olan HER planda bir "%NN" duruyordu (yani hem aylıkta hem
  // yıllıkta) — iki yüzde yan yana karşılaştırma yaptırıyordu, oysa şeridin işi
  // seçmek. Yüzdeler kartların kendi indirim pill'lerinde duruyor.
  const bestPeriod = useMemo(() => {
    let best: string | null = null;
    let bestSavings = 0;
    for (const plan of plans) {
      const savings = computeSavings(plan, plans);
      if (savings != null && savings > bestSavings) {
        bestSavings = savings;
        best = plan.period;
      }
    }
    return best;
  }, [plans]);
  const slide = useRef(new Animated.Value(0)).current;
  const activeIndex = Math.max(
    0,
    plans.findIndex((p) => p.period === selectedPeriod),
  );
  const slotWidth = stripWidth > 0 ? stripWidth / plans.length : 0;

  // ŞERİDİN KENDİ DOLGUSU YOK — kapsülü yalnız hairline çiziyor. Bir zamanlar
  // gri bir zemini vardı (açıkta ink(0.08), koyuda surface2) ve şerit sayfada
  // ikinci bir yüzey gibi duruyordu; tablo da zeminsiz (bkz.
  // PurchaseFeatureTable), ikisi aynı sayfada farklı şey söylüyordu.
  //
  // Seçimi taşıyan tek şey KAYAN DOLGU, o yüzden o dolgu sayfa zemininden
  // yeterince ayrışmak zorunda:
  //  - açık modda TAM SİYAH (inverseSurface). ink(0.16) beyaz zeminde açık gri
  //    kalıyordu ve seçili sekme "seçili" görünmüyordu. Dolgu polarite
  //    çevirdiği için etiketi de `onInverseSurface` taşıyor — uygulamadaki her
  //    seçili pill'in ikilisi (bkz. theme/colors.ts).
  //  - koyu modda surface4: oradaki dolgu beyaza yaklaşamaz (açık modun tersi
  //    olurdu), sayfa zemininin (#121212) bir üst kademesi olarak duruyor.
  //    Opak palet tonu, ink() değil: alfa bir dolgu şeffaf şeritte doğrudan
  //    sayfa zeminine binince fark tonun kendisinden değil yığından gelirdi.
  // Palet mutable + tema değişiminde kök remount olduğu için render'da okumak
  // güvenli (bkz. shared/theme/colors.ts).
  const light = isLight();
  const slotBg = light ? colors.inverseSurface : colors.surface4;
  const activeLabelColor = light ? colors.onInverseSurface : colors.text;

  useEffect(() => {
    Animated.spring(slide, {
      toValue: activeIndex * slotWidth,
      useNativeDriver: true,
      speed: 18,
      bounciness: 6,
    }).start();
  }, [activeIndex, slotWidth, slide]);

  if (plans.length < 2) return null;

  return (
    <View
      onLayout={(e) => {
        // Kapsülün İÇ genişliği: dolgu 4px'lik payın içinde kayıyor.
        const w = e.nativeEvent.layout.width - 8;
        setStripWidth((prev) => (Math.abs(prev - w) > 0.5 ? w : prev));
      }}
      style={{
        flexDirection: "row",
        padding: 4,
        marginBottom: 14,
        borderRadius: 999,
        borderCurve: "continuous",
        borderWidth: 0.5,
        borderColor: ink(0.12),
        // `overflow: hidden` DURUYOR: zemin gitti ama kayan dolguyu kapsül
        // şekline kırpan şey bu — kırpma olmadan dolgu köşelerden taşar.
        overflow: "hidden",
      }}
    >
      {slotWidth > 0 && (
        <Animated.View
          pointerEvents="none"
          style={{
            position: "absolute",
            top: 4,
            bottom: 4,
            left: 4,
            width: slotWidth,
            borderRadius: 999,
            borderCurve: "continuous",
            backgroundColor: slotBg,
            transform: [{ translateX: slide }],
          }}
        />
      )}
      {plans.map((plan, index) => {
        const isActive = plan.period === selectedPeriod;
        return (
          <TouchableOpacity
            key={plan.period}
            testID={`plan-pill-${plan.period}`}
            activeOpacity={0.7}
            disabled={disabled}
            onPress={() => onSelect(plan.period, index)}
            style={{
              flex: 1,
              flexDirection: "row",
              paddingVertical: 9,
              alignItems: "center",
              justifyContent: "center",
              gap: 4,
            }}
          >
            <Text
              // Bölme genişliğinin üçte biri dar: etiket + rozet sığmazsa
              // etiket sarmasın, kısalsın.
              numberOfLines={1}
              style={{
                color: isActive ? activeLabelColor : colors.textSecondary,
                fontSize: 14,
                // Ağırlık SABİT: seçilince kalınlaşan etiket genişler ve altındaki
                // kapsül hedefini ıskalardı (PagerTabBar'daki aynı gerekçe).
                fontWeight: "600",
              }}
            >
              {planPeriodShortLabel(plan.period, t)}
            </Text>
            {plan.period === bestPeriod && (
              // Rozetin kırmızısı Beğeniler kartındaki köşe tikinin rengi
              // (gradients.swipeHeart[0]) — dolgu MEDYA, yazısı bu yüzden
              // `onMedia`, seçili/seçili değil ayrımından etkilenmiyor.
              //
              // Cam bir sürümü denendi: şeridin kendi zemini de yarı saydam
              // olduğu için rozet ondan ayrışmıyordu.
              <View
                testID={`plan-pill-best-${plan.period}`}
                style={{
                  paddingHorizontal: 5,
                  paddingVertical: 2,
                  borderRadius: 999,
                  borderCurve: "continuous",
                  overflow: "hidden",
                  backgroundColor: gradients.swipeHeart[0],
                }}
              >
                <Text
                  style={{
                    color: colors.onMedia,
                    fontSize: 10,
                    fontWeight: "700",
                  }}
                >
                  {t("purchase.bestValue")}
                </Text>
              </View>
            )}
          </TouchableOpacity>
        );
      })}
    </View>
  );
}

/**
 * Katalog gelene kadar plan seçicinin yerini tutan iskelet: periyot şeridi + tek
 * kart. Spinner'ın yerini aldı — dönen çember yüklenen şeyin NE olduğunu
 * söylemiyordu ve katalog gelince sayfa bir anda uzayıp altındaki özellik
 * tablosunu aşağı itiyordu.
 *
 * Kart kutusu gerçek kartla AYNI boyda: ikisi de PLAN_CARD_HEIGHT. Periyot
 * şeridininki ise tahmin — 4+4 pay, 9+9 dokunma payı ve 14pt'lik etiketin satır
 * kutusu. Şerit iskeletin üstünde durduğu için birkaç piksellik sapması altındaki
 * her şeyi kaydırır; oynatmak gerekirse gerçek şeridi ölçüp buraya yazın.
 */
const PLAN_PILLS_SKELETON_HEIGHT = 44;

function PlanCarouselSkeleton() {
  return (
    <View style={{ marginBottom: 20 }}>
      <SkeletonBox
        height={PLAN_PILLS_SKELETON_HEIGHT}
        borderRadius={999}
        style={{ marginBottom: 14 }}
      />
      {/* Gerçek kart kabın tam genişliğinde (yatay liste ve onun gutter'dan
          taşan kabı kalktı) — iskelet de aynı hatta. */}
      <SkeletonBox
        width={PLAN_CARD_WIDTH}
        height={PLAN_CARD_HEIGHT}
        borderRadius={PLAN_CARD_RADIUS}
      />
    </View>
  );
}

/** Plan Selector — üstte periyot pill'leri, altında seçili plana oturan kart. */
export function PurchasePlanCarousel({ flow }: { flow: PurchaseFlow }) {
  const {
    t,
    plans,
    loadingOffering,
    selectedPlan,
    selectedPeriod,
    setSelectedPeriod,
    isPremium,
    purchasing,
    restoring,
    handlePurchase,
    isTrialEligible,
  } = flow;

  // Abone için kart artık satın alma teklifi değil bir YÖNETİM girişi. Alt
  // şeridine üyelik kartındakinin AYNISI olan buton geliyor: aynı kalıp (tam
  // genişlik, 0.5px `onMedia` çerçeve, kapsül), aynı metin — kalın eylem +
  // soluk "· Yenileme <tarih>". Durum makinesi de aynı kaynaktan
  // (features/profile/subscriptionView), iki yüzey ayrışmasın diye.
  const subscriptionView = useSubscriptionView();
  const manageLabel = subscriptionManageLabel(subscriptionView.kind, t);
  // Tarih yalnız "olağan" hâllerde: ödeme sorunu / iptal durumunda buton
  // tarihi değil yapılacak işi yazıyor (üyelik kartındaki ayrımın aynısı).
  const manageDateSuffix =
    subscriptionView.kind === "billingIssue" ||
    subscriptionView.kind === "cancelled" ||
    !subscriptionView.expiresAt
      ? ""
      : ` · ${t(
          subscriptionView.kind === "trial"
            ? "profile.subscription.trialEndsLabel"
            : "profile.subscription.renewalLabel",
        )} ${formatSubscriptionDate(
          subscriptionView.kind === "trial" && subscriptionView.trialEndsAt
            ? subscriptionView.trialEndsAt
            : subscriptionView.expiresAt,
        )}`;

  // Periyodun TEK kumandası bu şerit. (Eskiden kartlar yatay bir listeydi ve
  // seçim iki yerden birden yazılıyordu: pill + serbest sürükleme. Sürükleme
  // kaldırıldı — kart kaymıyor, yalnız içeriği değişiyor; bu da programatik
  // kayma bayrağı / momentum doğrulaması gibi bütün yarış düzeneğini
  // gereksiz kıldı.)
  const handlePillSelect = useCallback(
    (period: string) => {
      if (period === selectedPeriod) return;
      Haptics.selectionAsync().catch(() => {});
      setSelectedPeriod(period);
    },
    [selectedPeriod, setSelectedPeriod],
  );

  if (loadingOffering) return <PlanCarouselSkeleton />;
  if (plans.length === 0 || !selectedPlan) return null;

  // TEK kart: şeritte hangi periyot seçiliyse o. Yatay liste kaldırıldı, deste
  // sürüklenmiyor.
  const plan = selectedPlan;
  // Kartın alt şeridindeki indirim yüzdesi. Fiyat/açıklama/deneme satırları
  // burada DEĞİL: onları PlanFacts hesaplıyor, çünkü kart onları her periyot
  // için çiziyor (bkz. PlanFactsBlock).
  const planSavings = computeSavings(plan, plans);

  return (
    <View style={{ marginBottom: 20 }}>
      <PlanPeriodPills
        plans={plans}
        selectedPeriod={selectedPlan.period}
        onSelect={handlePillSelect}
        // ABONEDE DE AÇIK: şerit satın alma adımı değil, kartın hangi planı
        // yazdığını seçen kumanda — abonenin planları gezmesini engellemek için
        // sebep yok (kartın eylemi zaten "Aboneliği Yönet"). Yalnız satın
        // alma/geri yükleme uçarken kilitli: o sırada seçimi değiştirmek
        // basılan planla dönen sonucu ayrıştırırdı.
        disabled={purchasing || restoring}
        t={t}
      />
      <AnimatedPressable
        testID={`plan-card-${plan.period}`}
        pressScale={0.97}
        onPress={() => {
          // Abonede kart ÖLÜ DEĞİL: dokunuş mağazanın abonelik
          // ekranına gidiyor (iptal/plan değişikliği yalnız orada
          // yapılabiliyor).
          if (isPremium) {
            openStoreSubscriptions();
            return;
          }
          handlePurchase(plan);
        }}
        disabled={purchasing || restoring || loadingOffering}
        // Boyun TABANI `minHeight` (kart artık tek; yatay listenin
        // "kardeşe gerilme" zinciri kalktı). Tabanın üstünde kalan boy
        // ise periyottan BAĞIMSIZ: içeriğin plana göre değişen iki yeri
        // de kendi içinde sabitlendi — fiyat bloğu en uzun periyodun
        // boyunda (PlanFactsBlock), alt şeritteki indirim pill'i yokken
        // de görünmez olarak çiziliyor. Yani şeritten periyot değişince
        // kart oynamıyor; yalnız `checkIntroEligibility` cevabı deneme
        // satırını getirdiğinde bir kez uzuyor (bkz. PLAN_CARD_HEIGHT).
        style={{
          // Kart kabın tam genişliği: sayfanın 20px gutter'ı zaten
          // dışarıda (bkz. PlusPage), burada ikinci bir pay yok.
          alignSelf: "stretch",
          // Zemin: iskeletin ayırdığı boy (bkz. PLAN_CARD_HEIGHT).
          minHeight: PLAN_CARD_HEIGHT,
          borderRadius: PLAN_CARD_RADIUS,
          borderCurve: "continuous",
          // Çerçeve: `hairline` DEĞİL `mediaHairline`. İkisi de %10'luk
          // bir çizgi ama hairline modla dönüyor — açık modda siyaha
          // dönüp kırmızı kartın üstünde koyu bir kontur bırakırdı.
          borderWidth: 0.5,
          borderColor: colors.mediaHairline,
          overflow: "hidden",
        }}
      >
        {/* Dolgu ProfileScreen'deki upsell kartının gradyanının TA
            KENDİSİ (litPlusCard) — iki yüzey aynı kart ailesinden
            okunsun diye.

            Dolgu MEDYA sayıldığı için içindeki bütün mürekkep `onMedia`
            ailesinden, yani her iki modda da BEYAZ: `text` açık modda
            siyaha döner ve kırmızı gradyanda okunmazdı (palet
            sözleşmesi, colors.ts). */}
        <LinearGradient
          colors={gradients.litPlusCard}
          start={{ x: 0, y: 0 }}
          end={{ x: 1, y: 1 }}
          style={{
            // Dolgu kartın `minHeight`ini doldurmalı, yoksa kısa
            // içerikte altta zeminsiz bir şerit kalırdı.
            flex: 1,
            paddingHorizontal: 20,
            // Üst pay alttan KÜÇÜK ve öyle kalmalı: "plus" 55pt ve
            // Duckie'nin satır kutusu harflerin üstünde kendi boşluğunu
            // taşıyor, iki sayı eşitlenince kart tepeden fazla açılıyor.
            paddingTop: 18,
            paddingBottom: 30,
          }}
        >
          {/* Marka alevi "plus+"ın sağında, kartın sağ kenarına yaslı ve
              onunla aynı hizada. Absolute DEĞİL, ad satırının ikinci
              çocuğu: satır onu itsin.

              Dolgu DÜZ (kartın mürekkebi) — ProfileScreen'in upsell
              kartındaki gibi. Rozetin kendi swipeHeart gradyanı, kartın
              kırmızı-turuncu dolgusunun üstünde ayrı bir öğe gibi
              durmuyordu. */}
          <View
            style={{
              marginBottom: 6,
              flexDirection: "row",
              alignItems: "center",
              justifyContent: "space-between",
            }}
          >
            <PlanBrandWord size={55} color={colors.onMedia} />
            <PremiumFlame
              size={PLAN_CARD_FLAME_SIZE}
              color={colors.onMedia}
            />
          </View>
          {/* Kartın periyoda göre DEĞİŞEN bilgisi — fiyat + açıklama (ve
              varsa deneme uyarısı). Boyu bütün periyotların en uzunu kadar
              sabit: seçim değişince kart oynamıyor (bkz. PlanFactsBlock). */}
          <PlanFactsBlock
            plans={plans}
            plan={plan}
            t={t}
            isTrialEligible={isTrialEligible}
          />
          {/* Kartın alt şeridi: solda indirim, sağda eylem rozeti.
              `marginTop: "auto"` şeridi kartın dibine iter — kartlar
              eşit boya gerildiği için kısa kartlarda üstte kalan boşluk
              buraya düşüyor ve üç kartın şeridi aynı hizada oluyor.

              ABONEDE şeridin yerini yönetim butonu alıyor: indirim
              yüzdesi satın alma bilgisi, satın alacak bir şey kalmayan
              kartta yeri yok. */}
          {isPremium ? (
            // Üyelik kartındaki butonun AYNISI (bkz. ProfileScreen
            // "PREMIUM ACTIVE CARD"): iki yüzey aynı işi aynı kalıpla
            // sunsun. Kendi TouchableOpacity'si YOK — kartın kendisi
            // zaten mağazanın abonelik ekranına götürüyor, içine ikinci
            // bir dokunma hedefi koymak aynı eylemi iki kez tanımlardı.
            <View
              testID={`plan-card-manage-${plan.period}`}
              style={{
                marginTop: "auto",
                paddingTop: 20,
              }}
            >
              <View
                style={{
                  borderWidth: 0.5,
                  borderColor: onMediaAt(0.5),
                  borderRadius: 999,
                  borderCurve: "continuous",
                  overflow: "hidden",
                  paddingVertical: 17,
                  alignItems: "center",
                  justifyContent: "center",
                }}
              >
                <Text
                  style={{
                    color: colors.onMedia,
                    fontSize: 14,
                    fontWeight: "500",
                  }}
                >
                  <Text style={{ fontWeight: "700" }}>{manageLabel}</Text>
                  {manageDateSuffix ? (
                    <Text style={{ color: onMediaAt(0.55) }}>
                      {manageDateSuffix}
                    </Text>
                  ) : null}
                </Text>
              </View>
            </View>
          ) : (
            <View
              style={{
                marginTop: "auto",
                paddingTop: 20,
                flexDirection: "row",
                // `flex-end`, `center` DEĞİL: indirim pill'i (dolgu + çerçeve)
                // rozetten birkaç px yüksek ve şerit dibe çivili olduğu için
                // fazlalık YUKARI doğru büyüyor. Ortalamada rozet, pill'in
                // olduğu planlarda o farkın yarısı kadar yukarı kayıyordu —
                // periyot değiştikçe "Abone Ol" yerinde durmuyordu. Dibe
                // hizalanınca rozetin alt kenarı sabit.
                alignItems: "flex-end",
                justifyContent: "space-between",
              }}
            >
              {/* Haftalıkta yok: tasarruf hesabının tabanı o plan
                  (bkz. computeSavings), kendine göre indirimi olmuyor.
                  YİNE DE ÇİZİLİYOR, yalnız görünmez: pill sağdaki rozetten
                  birkaç piksel yüksek ve şerit kartın dibine çivili olduğu
                  için, çizilmediği periyotta şerit — dolayısıyla kart — o
                  kadar kısalıyordu. Görünmez kopya boyu sabitliyor,
                  `space-between` de rozeti sağda tutuyor. */}
              {
                // Şeritteki "Best" rozetiyle AYNI kırmızı ve AYNI beyaz
                // yazı — ikisi de aynı bilgiyi taşıyor.
                //
                // Dolgu kartın kendi kırmızısından koyu ama yakın: ince
                // beyaz çizgi pill'i zeminden koparıyor. (Cam bir sürümü
                // denendi, kartın gradyanını sadece karartıyordu.)
                <View
                  testID={
                    planSavings != null
                      ? `plan-card-discount-${plan.period}`
                      : undefined
                  }
                  pointerEvents="none"
                  accessibilityElementsHidden={planSavings == null}
                  importantForAccessibility={
                    planSavings == null ? "no-hide-descendants" : "auto"
                  }
                  style={{
                    opacity: planSavings != null ? 1 : 0,
                    paddingHorizontal: 9,
                    paddingVertical: 4,
                    borderRadius: 999,
                    borderCurve: "continuous",
                    overflow: "hidden",
                    backgroundColor: gradients.swipeHeart[0],
                    borderWidth: 0.5,
                    borderColor: onMediaAt(0.4),
                  }}
                >
                  <Text
                    style={{
                      color: colors.onMedia,
                      fontSize: 12,
                      fontWeight: "700",
                    }}
                  >
                    {t("purchase.discount", { percent: planSavings ?? 0 })}
                  </Text>
                </View>
              }
              <SelectedBadge
                active
                loading={purchasing}
                label={t("purchase.cta.subscribe")}
              />
            </View>
          )}
        </LinearGradient>
      </AnimatedPressable>
      {/* Sayfa noktaları KALDIRILDI: hangi periyotta olunduğunu artık üstteki
          pill şeridi söylüyor, iki gösterge aynı şeyi anlatıyordu. */}
    </View>
  );
}

/**
 * Features — KENDİ ZEMİNİ YOK: blur kartı zeminin üzerinde ayrı bir yüzey gibi
 * duruyordu ve kart + `px-4` birlikte satırları ekran kenarından 36px içeri
 * itiyordu. Tablo artık doğrudan sayfa/sheet zemininde ve kabın 20px
 * gutter'ında — plan kartlarıyla aynı hizada.
 */
export function PurchaseFeatureTable({ flow }: { flow: PurchaseFlow }) {
  const { t, features, infoBenefit, openBenefitInfo, closeBenefitInfo } = flow;

  // Özellik satırının tonu — info ikonu ve başlık TEK dokunma hedefi, ikisi de
  // bunu kullanır. Açık modda siyah %45 beyaz sheet zemininde fazla soluk
  // kalıyordu; koyu modda beyaz %45 zaten okunuyor, oraya dokunulmuyor.
  // Palet mutable + tema değişiminde kök remount olduğu için render'da okumak
  // güvenli (bkz. shared/theme/colors.ts).
  const featureInk = isLight() ? ink(0.62) : ink(0.45);

  return (
    <View style={{ marginBottom: 24, paddingVertical: 4 }}>
      {/* Header row */}
      <View className="flex-row items-center justify-between mb-2">
        <Text className="font-bold text-[12px] uppercase tracking-wider flex-1" style={{ color: colors.textMuted }}>
          {t('discover.premium.featuresLabel')}
        </Text>
        <View className="flex-row items-center gap-4">
          <Text className="font-bold text-[12px] uppercase w-16 text-center" style={{ color: colors.textMuted }}>
            {t('discover.premium.standardPlan')}
          </Text>
          <Text
            // "plus+" 64px'lik sütuna "plus"tan geniş: sarmak yerine küçülsün
            // (Free sütunundaki kalıbın aynısı).
            numberOfLines={1}
            adjustsFontSizeToFit
            className="w-16 text-center mb-2"
            style={{
              color: colors.text,
              fontSize: 25,
              fontFamily: "Duckie-regular",
            }}
          >
            plus+
          </Text>
        </View>
      </View>

      {/* Feature rows — başlık üç kelime, "bu ne demek" cevabı info
          ikonunun açtığı sheet'te. Dokunma hedefi ikon + başlık; ✗/✓
          sütunları dışarıda kalıyor ki tablo hâlâ tablo gibi dursun. */}
      {features.map(({ key, label }, index) => (
        <View
          key={key}
          className={`flex-row items-center justify-between ${
            index !== features.length - 1 ? "mb-6" : ""
          }`}
        >
          {/* `flex: 1` DIŞ View'da: AnimatedPressable içeride bir
              Animated.View'a sarıyor ve o sarmalayıcı style almıyor —
              pressable'a flex vermek satırı genişletmiyor, başlık sıfır
              genişliğe iniyordu (isim hiç görünmüyordu). */}
          <View style={{ flex: 1 }}>
            <AnimatedPressable
              onPress={() => openBenefitInfo(key)}
              pressScale={0.98}
              pressBounciness={0}
              activeOpacity={0.6}
              accessibilityRole="button"
              accessibilityLabel={label}
              hitSlop={{ top: 8, bottom: 8 }}
              style={{
                flexDirection: "row",
                alignItems: "center",
                gap: 6,
                paddingRight: 8,
              }}
            >
              <SFIcon
                name="info.circle"
                fallback={Info}
                size={15}
                color={featureInk}
                strokeWidth={2}
                weight="semibold"
              />
              <Text
                className="font-normal text-[15px] flex-1"
                // İkonla AYNI ton: tam kontrastlı başlık, yanındaki soluk
                // info ikonunu ayrı bir öge gibi gösteriyordu — ikisi tek
                // dokunma hedefi, tek tonda okunmalı.
                style={{ color: featureInk }}
              >
                {label}
              </Text>
            </AnimatedPressable>
          </View>
          <View className="flex-row items-center gap-4">
            <View className="w-16 items-center">
              <SFIcon
                name="xmark"
                fallback={X}
                size={18}
                color={ink(0.4)}
                strokeWidth={2}
                weight="semibold"
              />
            </View>
            <View className="w-16 items-center">
              <SFIcon
                name="checkmark"
                fallback={Check}
                size={18}
                color={colors.text}
                strokeWidth={2}
                weight="semibold"
              />
            </View>
          </View>
        </View>
      ))}

      {/* Özellik açıklaması — `stackBehavior="push"` ile paywall sheet'inin
          üstüne biner, paywall geride açık kalır. Portal'a render olduğu için
          buradaki konumu scroll içeriğinin yüksekliğine karışmıyor. */}
      <PremiumBenefitInfoSheet
        benefitKey={infoBenefit}
        onClose={closeBenefitInfo}
      />
    </View>
  );
}

/**
 * "Satın alımları geri yükle" + mağaza uyarısı — İÇERİĞİN SONUNDA, sayfanın
 * dibinde. Sticky bir şerit değil.
 *
 * Büyük "abone ol" CTA'sı kaldırıldı: satın alma doğrudan plan kartına
 * dokununca başlıyor (bkz. PurchasePlanCarousel), alttaki buton aynı işi ikinci
 * kez yapıyordu. Deneme/fiyat cümlesi de kartın kendi metinlerinde zaten var.
 *
 * Geri yükleme burada KALIYOR: mağaza sözleşmesi gereği erişilebilir bir yerde
 * durması gerekiyor ve satın almanın aksine kartla tetiklenebilecek bir eylem
 * değil.
 */
export function PurchaseFinePrint({ flow }: { flow: PurchaseFlow }) {
  const { t, purchasing, restoring, handleRestore } = flow;

  return (
    <View style={{ paddingTop: 4 }}>
      <TouchableOpacity
        onPress={handleRestore}
        disabled={purchasing || restoring}
        activeOpacity={0.8}
        // Yükseklik SABİT: basınca yazının yerine spinner geçiyor ve ikisinin
        // doğal boyu farklı — kutu esnek bırakılınca altındaki mağaza uyarısı
        // aşağı kayıyordu. 32 = 13pt yazının satır kutusu + eski 8'lik paylar.
        style={{ alignItems: "center", justifyContent: "center", height: 32 }}
      >
        {restoring ? (
          <ActivityIndicator size="small" color={colors.textSecondary} />
        ) : (
          <Text style={{ color: colors.textMuted, fontSize: 13 }}>
            {t('purchase.cta.restore')}
          </Text>
        )}
      </TouchableOpacity>

      <Text
        style={{
          marginHorizontal: 10,
          // SuperLikePurchaseModal disclaimer'ı ile aynı ton
          color: colors.textMuted,
          fontSize: 11,
          textAlign: "center",
          marginTop: 8,
          lineHeight: 16,
        }}
      >
        {t('purchase.cta.appStoreDisclaimer')}
      </Text>
    </View>
  );
}
