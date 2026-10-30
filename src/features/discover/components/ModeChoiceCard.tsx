import { useEffect, useRef, useState } from "react";
import { Animated, StyleSheet, Text, TouchableOpacity, View } from "react-native";
import { Image } from "expo-image";
import { LinearGradient } from "expo-linear-gradient";
import { useTranslation } from "react-i18next";
import SFIcon from "@/shared/components/SFIcon";
import SkeletonBox from "@/shared/components/SkeletonBox";
import { ChevronRight } from "@/shared/icons";
import { colors, isLight, scrimAt } from "@/shared/theme/colors";
// Görsel haritası kayıt tarafında doğdu ve ORADA KALIYOR (kayıt adımına
// dokunulmadı, istek) — bu kart onu okuyan ikinci tüketici.
import { MODE_CARD_ART } from "@/features/auth/modeCardArt";
import type { AppMode } from "../modeTheme";

/**
 * MOD SEÇİM KARTI — zemini fotoğraf olan 3:2 kart. Tek tüketicisi çalışma
 * anındaki mod seçici (`ModeSelectorSheet`; Keşif başlığı + Profil avatarı).
 *
 * ── Kayıt adımıyla ilişkisi ─────────────────────────────────────────────────
 * Kart ilk olarak kayıt adımında (RegisterStepModeScreen > ModeCard) doğdu ve
 * seçici ayrı bir satır listesiydi: kullanıcı modları kayıtta fotoğraflı
 * kartlar olarak öğreniyor, sonra onları iki gri satır olarak buluyordu. Bu
 * dosya o görünümü seçiciye taşıyor.
 *
 * ⚠️ KAYIT ADIMI BU BİLEŞENİ KULLANMIYOR, kendi `ModeCard`'ını koruyor (istek:
 * kayıt akışına dokunulmadı). Yani iki kart ayrı dosyada ve farklılaşmaları
 * BEKLENEN — ikisinin işi aynı değil:
 *   • kayıt  → iki seçenekten birini İŞARETLE (seçim kutusu + tik)
 *   • seçici → biri girilmiş, öteki geçilecek/açılacak İKİ KAPI (kutu YOK)
 * Ortak bir şeyi (renk, oran, perde) değiştirirken diğerine de bakmak gerekir;
 * paylaşılan tek kaynak `modeTheme` ve `modeCardArt`.
 *
 * KATMANLAR:
 *   1. NÖTR GRİ ZEMİN (`surface`) — foto yüklenirken kart bu, yüklendikten
 *      sonra da altta durup şeffaf kenarı kapatıyor.
 *
 *      ⚠️ MODUN GRADYANI DEĞİL (istek). Zemin bir süre `modeFireGradient`ti ve
 *      fotoğraf çözülene kadar kart turuncu/yeşil düz bir yüzey olarak
 *      çiziliyordu: kullanıcı onu yükleniyor diye değil KARTIN RENGİ diye
 *      okuyor, foto gelince de renk bir anda altından çekiliyordu. Yükleniyor
 *      hâlini söyleyen şey artık (2)'deki iskelet, yani bekleyişin dili
 *      uygulamanın geri kalanıyla aynı.
 *   2. İSKELET — yalnız foto GELMEDEN. Paketli asset'te pratikte tek kare
 *      görünüyor; yolu açık tutan şey soğuk başlangıç/ağır decode.
 *   3. Fotoğraf (bkz. modeCardArt — harita BOŞ olabilir).
 *   4. Okunabilirlik perdesi (kart fotolarındaki perdenin birebir aynısı).
 *
 * SEÇİMİ YALNIZ KARTIN KENDİSİ SÖYLÜYOR: seçili olmayan kartın GÖRSELİ bir
 * perdeyle sönüyor, seçilen tam renginde açılıyor. Ne kutu ne kenarlık var —
 * kenarlık `overflow: hidden` yüzünden kartın görünen kenarını iki hâlde iki
 * farklı eğriye çeviriyordu (gerekçenin tamamı CARD_RADIUS'ta), kutu ise bu
 * yüzeyde yanlış soruyu soruyordu (yukarıdaki iki-kapı notu).
 *
 * ⚠️ Perde İÇERİĞİN ALTINDA: seçilmeyen kartın yazısı sönmüyor — burası bir
 * seçim yüzeyi, okunmayan seçenek kararı zorlaştırır.
 */

/** Kart oranı (genişlik / yükseklik) — görseller de bu oranda üretiliyor. */
export const MODE_CARD_ASPECT = 3 / 2;
/**
 * Kartın iç payı: yazı ve chevron kenarlardan bu kadar içeride duruyor.
 *
 * 20 (kayıt kartındaki 16 DEĞİL): burada yazı bloğu kartın dibine oturuyor ve
 * 16'da hem alt kenara hem sol kenara yapışık okunuyordu — 3:2'lik bir
 * fotoğrafın üstünde o pay, satır kartındakinden daha dar görünüyor. 20 aynı
 * zamanda chevron'u sağ kenardan içeri alıyor.
 */
const CARD_PAD = 20;
/**
 * Kart yarıçapı — TEK SABİT, seçili/seçili değil AYIRIMI YOK. Yarıçap (ve onu
 * izleyen `borderWidth`) hâle göre değişirse kartın köşesi seçim anında
 * kıpırdıyor; seçimi söyleyen şey yalnız perde.
 *
 * 32 — kart 3:2'ye büyüyünce serbest kaldı. Eski satır kartında yarıçap 24'te
 * duruyordu çünkü kart ~76pt yüksekliğindeydi ve 30 neredeyse yüksekliğin
 * yarısına denk geliyordu: iOS o noktada tam kapsül çizip `borderCurve`i
 * yutuyor. Bu kart ~228pt, yani 32 o sınırın çok altında.
 */
const CARD_RADIUS = 32;
/**
 * Foto üstü okunabilirlik perdesi — kart fotolarındaki perdenin BİREBİR aynısı
 * (bkz. LikeCard > cardPhotoScrim): tepede neredeyse yok, dipte 0.45.
 *
 * Açık temada bir tık koyu: perde foto üstü olduğu için modla DÖNMÜYOR, dönen
 * şey polarite değil kalınlık — beyaz bir ekranda göz fotoğrafı daha parlak
 * okuyor ve aynı perde altındaki yazıyı taşımıyor.
 *
 * ⚠️ RENDER SIRASINDA çağır: `isLight()` modül seviyesinde sabitlenemez
 * (tema değişimi kökü remount ediyor, modül scope'unu etmiyor).
 */
const CARD_SCRIM_TOP = 0.1;
const CARD_SCRIM_BOTTOM = 0.45;
const CARD_SCRIM_LIGHT_BOOST = 0.08;
const cardScrim = (alpha: number): string =>
  scrimAt(alpha + (isLight() ? CARD_SCRIM_LIGHT_BOOST : 0));

/**
 * Seçili OLMAYAN kartın sönüklüğü. 0.42 — kart geri çekilecek kadar koyu, ama
 * fotoğrafı tanınmaz yapmayacak kadar: seçilmeyen seçenek de hâlâ bir teklif,
 * kapatılmış bir kapı değil.
 */
const CARD_DIM = 0.42;

export interface ModeChoiceCardProps {
  mode: AppMode;
  /** İçinde bulunulan mod — kartın perdesi açılır, diğeri söner. */
  active: boolean;
  /**
   * Kullanıcı bu modun profilini AÇMIŞ mı. `false` → kartın sağ altında
   * chevron çıkıyor ve alt satır "geç" yerine modun AÇIKLAMASINI yazıyor
   * (gerekçe o satırın yanında).
   */
  open?: boolean;
  onPress: (mode: AppMode) => void;
}

export default function ModeChoiceCard({
  mode,
  active,
  open = true,
  onPress,
}: ModeChoiceCardProps) {
  const { t } = useTranslation();
  const scale = useRef(new Animated.Value(1)).current;
  /**
   * SEÇİM PERDESİNİN giriş-çıkış değeri. Tek yetkili hareket bu: kullanıcı
   * diğer karta geçtiğinde biri sönüp öteki açılıyor, yani hareketin işi
   * "durum değişti" demek — dekor değil.
   *
   * Tik kalktıktan sonra tek tüketicisi perde kaldı; yay (bounciness 12)
   * yine de duruyor çünkü açılan kartın bir tık fazla açılıp yerine oturması
   * geçişi "bu seçildi" diye okutan şey.
   */
  const markIn = useRef(new Animated.Value(active ? 1 : 0)).current;
  const art = MODE_CARD_ART[mode];
  /**
   * Foto çözüldü mü — iskeletin tek anahtarı. Harita boşsa (`!art`) beklenen
   * bir şey yok, baştan `true`: boş haritada sonsuza kadar parlayan bir iskelet
   * "birazdan gelecek" diye yalan söylerdi, kart o yolda nötr zeminde kalıyor.
   *
   * `onError` da `true` yazıyor (aşağıda): asset çözülemediyse bekleyiş bitti,
   * yalnız sonucu yok.
   */
  const [artReady, setArtReady] = useState(!art);

  useEffect(() => {
    Animated.spring(markIn, {
      toValue: active ? 1 : 0,
      useNativeDriver: true,
      speed: 20,
      bounciness: active ? 12 : 0,
    }).start();
  }, [active, markIn]);

  return (
    <Animated.View style={{ transform: [{ scale }] }}>
      <TouchableOpacity
        activeOpacity={1}
        accessibilityRole="button"
        // Seçim durumu ekran okuyucuya da gidiyor: perde yalnız gözle okunan
        // bir işaret.
        accessibilityState={{ selected: active }}
        onPressIn={() =>
          Animated.spring(scale, {
            toValue: 0.97,
            useNativeDriver: true,
            speed: 20,
          }).start()
        }
        onPressOut={() =>
          Animated.spring(scale, {
            toValue: 1,
            useNativeDriver: true,
            bounciness: 8,
            speed: 20,
          }).start()
        }
        onPress={() => onPress(mode)}
        style={{
          aspectRatio: MODE_CARD_ASPECT,
          borderRadius: CARD_RADIUS,
          borderCurve: "continuous",
          // Fotoğraf ve perde kartın köşelerinden taşmasın.
          overflow: "hidden",
          justifyContent: "flex-end",
        }}
      >
        {/* 1. Nötr zemin — modun gradyanı DEĞİL (bkz. dosya başı katman notu). */}
        <View
          style={[StyleSheet.absoluteFill, { backgroundColor: colors.surface }]}
        />

        {/* 2. İskelet — foto gelene kadar. Yarıçap 0: kartın kendi
            `overflow: hidden`ı köşeleri çoktan kırpıyor, ikinci bir yarıçap
            kenarda bir piksellik iç çerçeve bırakıyor. */}
        {!artReady ? (
          <SkeletonBox
            borderRadius={0}
            style={StyleSheet.absoluteFill}
          />
        ) : null}

        {/* 3. Fotoğraf. Harita boşken hiç çizilmiyor (modeCardArt). */}
        {art ? (
          <Image
            source={art}
            style={StyleSheet.absoluteFill}
            contentFit="cover"
            // Paketli asset anında geliyor; geçiş yine de var — asset
            // önbellekten çözülürken tek karelik sıçramayı yumuşatıyor ve
            // iskeletten fotoğrafa devri de bu taşıyor.
            transition={200}
            onLoad={() => setArtReady(true)}
            // Çözülemeyen asset'te iskelet SONSUZA KADAR parlamasın.
            onError={() => setArtReady(true)}
            accessible={false}
          />
        ) : null}

        {/* 4. Okunabilirlik perdesi — yazı bunun üstünde. */}
        <LinearGradient
          colors={[cardScrim(CARD_SCRIM_TOP), cardScrim(CARD_SCRIM_BOTTOM)]}
          style={StyleSheet.absoluteFill}
        />

        {/* 5. SEÇİM PERDESİ — seçili olmayan kart geri çekiliyor.
            `markIn`den besleniyor — kartın tek durum hareketi.
            `clamp` şart: yay 1'i aşıyor ve interpolasyon varsayılanda uçları
            uzatıp negatif opaklık üretiyor.

            ⚠️ AÇILMAMIŞ MOD DA SÖNÜK: `active` olamayacağı için perde 1'de
            kalıyor ve bu doğru okunuş — kart bir teklif, henüz girilmiş bir
            yer değil. */}
        <Animated.View
          pointerEvents="none"
          style={{
            position: "absolute",
            top: 0,
            left: 0,
            right: 0,
            bottom: 0,
            backgroundColor: scrimAt(CARD_DIM),
            opacity: markIn.interpolate({
              inputRange: [0, 1],
              outputRange: [1, 0],
              extrapolate: "clamp",
            }),
          }}
        />

        {/* Yazı dipte. Renkler foto üstü sabitler (`onMedia`) — perde her
            temada aynı, metin de öyle.

            `gap` YOK, açıklama negatif marjla yukarı çekiliyor: Duckie'nin
            satır kutusu harflerin çevresinde kendi boşluğunu taşıyor, yani
            sıfır boşlukta bile gözle görülür bir aralık kalıyordu. */}
        <View
          style={{
            padding: CARD_PAD,
            // Metin kolonu + (açılmamış modda) chevron YAN YANA. `flex-end`:
            // chevron kartın SAĞ ALTINDA, açıklama satırının hizasında. Metin
            // bloğu `justifyContent: flex-end` ile zaten dibe oturuyor, yani
            // chevron'u absolute konumlamaya gerek yok — satırın akışında
            // kalması uzun bir başlıkla çarpışmayı da kendiliğinden çözüyor
            // (kolon `flex: 1`).
            flexDirection: "row",
            alignItems: "flex-end",
            gap: 12,
          }}
        >
          <View style={{ flex: 1 }}>
          {/* Mod adı MARKA YAZIMINDA: Duckie-regular, küçük harf — paywall'ın
              "plus+"ı ve MatchModal'ın "lit"i ile aynı dil. Küçük harf
              `textTransform` ile, i18n'deki değerle DEĞİL: aynı anahtarı keşif
              başlığı da okuyor, orada adlar büyük harfle başlıyor.

              ⚠️ `lineHeight` VERİLMİYOR (bkz. ProfileScreen'deki aynı not):
              Duckie'nin metriği harflerin üstünde kendi boşluğunu taşıyor ve
              elle bir satır yüksekliği "dating"in g'sini kırpıyor. `fontWeight`
              ve `letterSpacing` de yok — fontun tek kesimi var, sistem
              fontunun tracking'i buraya uymuyor. */}
          <Text
            style={{
              color: colors.onMedia,
              fontFamily: "Duckie-regular",
              fontSize: 40,
              textTransform: "lowercase",
              includeFontPadding: false,
            }}
          >
            {t(`discover.mode.title.${mode}`)}
          </Text>
          <Text
            style={{
              /**
               * AÇIK GRİ (istek), tam beyaz DEĞİL. Bir süre `onMedia`ydı ve
               * mod adıyla aynı mürekkebi paylaşıyordu: iki satır aynı sesle
               * konuşunca kartın hangi satırı başlık olduğu kayboluyordu.
               * `onMediaMuted` (beyaz %70) başlığın altında ikinci kademe
               * olarak okunuyor; aşağıdaki chevron da aynı mürekkepte —
               * ikisi birlikte "ikincil bilgi + buradan devam" satırı.
               */
              color: colors.onMediaMuted,
              fontSize: 14,
              lineHeight: 19,
              marginTop: -1,
            }}
          >
            {/* ── ALT SATIR ÜÇ HÂLLİ ───────────────────────────────────────
                • AÇILMAMIŞ mod → modun AÇIKLAMASI. Kullanıcı o modu hiç
                  görmemiş; "geç" demek bir yere geçmeden önce o yerin ne
                  olduğunu söylememek olurdu. Yanındaki chevron zaten
                  "buradan devam edilir"i taşıyor.
                • AÇIK ama seçili DEĞİL → "<mod> moduna geç". Açıklamaya
                  gerek yok, kullanıcı o profili kendisi doldurmuş; burada
                  eksik olan tek şey eylemin adı.
                • AÇIK ve SEÇİLİ → açıklama. Zaten içinde olduğu moda "geç"
                  demek anlamsız; kart da parlak olan, yani hangisinde
                  olduğunu perde söylüyor. */}
            {open && !active
              ? t(`discover.mode.switchTo.${mode}`)
              : t(`discover.mode.description.${mode}`)}
          </Text>
          </View>

          {/* "BURAYA DOKUNULUR" İŞARETİ — zeminsiz chevron, kartın SAĞ ALTINDA.
              Seçim kutusu bu karttan tamamen kalktı (kayıt adımının aksine):
              oradaki kutu "iki seçenekten birini işaretle" diyordu, burada ise
              iki kart iki ayrı KAPI — biri girilmiş, öteki ya geçilecek ya
              açılacak. Hangi modda olunduğunu perde (parlak/sönük) söylüyor,
              ikinci bir işarete gerek yok.

              ⚠️ KOŞUL `!active`, `!open` DEĞİL. Chevron'un işi "bu kart bir
              yere götürür" demek ve bu İKİ hâlde de doğru: açılmamış mod
              kuruluma, açık ama seçili olmayan mod o moda götürüyor. Tek
              istisna içinde bulunulan kart — orası bir kapı değil, varılan yer.
              Eskiden yalnız `!open` idi ve açık-ama-seçili-olmayan kart
              dokunulabilir olduğu hâlde hiçbir işaret taşımıyordu.

              Mürekkebi ALT SATIRIN mürekkebi (`onMediaMuted`, açık gri —
              istek): chevron o satırın hizasında duruyor ve onun devamı, mod
              adıyla aynı kademede bir işaret değil.

              `pointerEvents: none` — dokunuş kartın tamamına ait. */}
          {!active ? (
            <SFIcon
              name="chevron.right"
              fallback={ChevronRight}
              size={20}
              color={colors.onMediaMuted}
              strokeWidth={2.5}
              weight="semibold"
              style={{ pointerEvents: "none" }}
            />
          ) : null}
        </View>
      </TouchableOpacity>
    </Animated.View>
  );
}
