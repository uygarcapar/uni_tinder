import { useCallback, useEffect, useMemo, useState } from "react";
import { Text, TouchableOpacity, View } from "react-native";
import { useTranslation } from "react-i18next";
import AppModal, {
  SHEET_PICKER_SNAP_POINTS,
} from "@/shared/components/AppModal";
import SFIcon from "@/shared/components/SFIcon";
import SheetSearchInput from "@/shared/components/SheetSearchInput";
import { Check, Lock, SearchX } from "@/shared/icons";
import { colors } from "@/shared/theme/colors";
import {
  resolveLocalized,
  useUniversities,
} from "@/shared/queries/commonQueries";
import type { FilterGate } from "../feedPolicy";

/**
 * Akış kampüs seçici (Plus).
 *
 * ── PLUS KAPISI SHEET'İN İÇİNDE, GİRİŞİNDE DEĞİL (istek) ───────────────────
 *
 * Eskiden free kullanıcı pill'e dokununca sheet HİÇ açılmıyor, doğrudan Plus'a
 * gidiyordu. Şimdi sheet açılıyor: kullanıcı hangi kampüsleri açabileceğini
 * GÖRÜYOR, satırların sağında kutu yerine KİLİT var ve dokunuş sheet'i kapatıp
 * Plus'a götürüyor. Satılan şeyin ne olduğunu göstermeden satmak, kapalı bir
 * kapıyı kapalı tutmaktı.
 *
 * ⚠️ KİLİT KENDİ KAMPÜSÜNE UYGULANMIYOR. Kapı "BAŞKA kampüsü görebilir mi"
 * sorusu (`/me > canPickUniversity`); kendi akışı free kullanıcının zaten
 * gördüğü şey. İlk satır bu yüzden her zaman seçilebilir — listeden geri dönüş
 * yolu da o satır, kilitlenirse free kullanıcı seçtiği bir kampüste kilitli
 * kalırdı (pratikte olamaz ama kapı değişirse olabilir).
 *
 * YERLEŞİM ŞEHİR SEÇİCİNİN BİREBİR KALIBI (bkz. CityPickerModal): AppModal'ın
 * standart scrollable modu, üstte kapsül arama input'u, altında kapsül satırlar
 * — seçili satırın zemini dolu ve sağında tik. İkisi de "uzun bir listeden tek
 * bir şey seç" işi yapıyor, iki ayrı görünüm taşımaları için sebep yok.
 *
 * ESKİDEN `SearchableListSheet` KULLANIYORDU. O bileşen onaylı seçim için
 * yazılmış (seç → "Bitti"ye bas) ve seçimi `enumName` üzerinden taşıyor;
 * domain'i oraya map'lemek gerekiyordu. Buradaki seçim TEK DOKUNUŞLA bitiyor,
 * şehir seçicide olduğu gibi.
 *
 * ⚠️ `display` bir NESNE (`{tr, en}`). Doğrudan render etmek "Objects are not
 * valid as a React child" ile patlar; etiket `resolveLocalized`den geçmek
 * ZORUNDA. `name`e güvenilmez: sunucu onu DB'deki profil dilinden çözüyor,
 * istemcinin dilinin gerisinde kalabiliyor.
 */

/** Listenin başındaki "Kendi kampüsüm" satırının taşıyıcı değeri. */
export const OWN_CAMPUS_VALUE = "__own__";

/** Seçenek satırının sağındaki kutu — akış filtre sheet'indeki ile aynı ölçü. */
const CHECKBOX_SIZE = 22;

export interface FeedUniversitySheetProps {
  visible: boolean;
  onClose: () => void;
  /** null = kendi kampüsü. */
  value: string | null;
  onSelect: (domain: string | null) => void;
  /**
   * Kullanıcının KENDİ kampüsünün domain'i ve gösterim adı.
   *
   * İkisi birden lazım: ad "Kendi kampüsüm" yerine satıra yazılıyor, domain ise
   * o üniversiteyi LİSTEDEN DÜŞÜRMEK için. Düşürülmezse aynı üniversite iki
   * satırda görünürdü — biri `null` (kendi kampüsü) taşıyan, diğeri domain'i
   * açıkça gönderen. İkisi sunucuda aynı sonucu verse de kullanıcıya aynı adı
   * iki kez göstermek bozuk okunuyor.
   */
  ownDomain?: string | null;
  ownUniversityName?: string | null;
  /**
   * BAŞKA kampüs seçme kapısı — `feedPolicy.universityPickerGate`.
   *
   * `"unknown"` (/me gelmedi) KİLİT ÇİZMİYOR: kullanıcıya olmayan bir kısıt
   * uydurmaktansa açık varsaymak doğru taraf — gerçekten hakkı yoksa sunucu
   * UT-7310 ile reddeder, tersi ise ödemiş kullanıcıya kilit göstermek olurdu.
   */
  gate?: FilterGate;
  /** Kilitli satıra dokunuş → sheet KAPANIR, sonra Plus. */
  onPaywall?: () => void;
}

type Row = { key: string; label: string };

export default function FeedUniversitySheet({
  visible,
  onClose,
  value,
  onSelect,
  ownDomain = null,
  ownUniversityName = null,
  gate = "allowed",
  onPaywall,
}: FeedUniversitySheetProps) {
  const { t, i18n } = useTranslation();
  const { data: universities } = useUniversities();
  const [search, setSearch] = useState("");
  /**
   * SEÇİM ARTIK ONAYLI: satıra dokunmak yalnız taslağı değiştiriyor, listeyi
   * uygulayan şey header'daki tik.
   *
   * Şehir seçicide dokunuş doğrudan onaylıyor; burada header'a X + tik konduğu
   * için (istek, ProfileEditModal'ın yapısı) tek dokunuşla kapanmak o iki
   * butonu anlamsız bırakırdı — tik basılmadan hiçbir şey uygulanmıyor, X ise
   * taslağı atıyor.
   */
  const [draft, setDraft] = useState<string>(value ?? OWN_CAMPUS_VALUE);
  /**
   * LİSTENİN BAŞINA ALINAN anahtar — `draft` DEĞİL.
   *
   * Sıralama taslağa bakarsa satıra dokunan kullanıcı seçtiği üniversiteyi
   * parmağının altından kaybediyor: liste anında yeniden diziliyor ve seçilen
   * en tepeye uçuyor. Bu yüzden sabitlenen anahtar YALNIZ SHEET AÇILIRKEN
   * yazılıyor; açılışta önceki seçim yine en üstte duruyor, dokunuşla hiçbir
   * şey yer değiştirmiyor.
   */
  const [pinnedKey, setPinnedKey] = useState<string>(value ?? OWN_CAMPUS_VALUE);

  // Sheet kapanınca aramayı sıfırla — yoksa tekrar açıldığında input boş
  // görünüyor ama liste eski sorguyla süzülmüş kalıyor (CityPickerModal'daki
  // aynı tuzak). Açılışta taslak VE sabitlenen anahtar dışarıdaki gerçekle
  // hizalanıyor: kullanıcı önceki turda tike basmadan kapatmış olabilir.
  useEffect(() => {
    if (!visible) {
      setSearch("");
      return;
    }
    const current = value ?? OWN_CAMPUS_VALUE;
    setDraft(current);
    setPinnedKey(current);
  }, [visible, value]);

  const apply = useCallback(() => {
    onSelect(draft === OWN_CAMPUS_VALUE ? null : draft);
    onClose();
  }, [draft, onSelect, onClose]);

  /**
   * Kilitli satıra dokunuş.
   *
   * ⚠️ SIRA ÖNEMLİ — `onClose()` ÖNCE: Plus girişi kendi sayfasına yönlendiriyor
   * ve bu sheet `stackBehavior="push"` ile filtre sheet'inin ÜSTÜNDE açılmış
   * olabiliyor. Açık bırakılırsa kullanıcı Plus'tan dönünce iki sheet üst üste
   * duruyor (composer'daki anonim paywall'ında aynı gerekçe var).
   *
   * Taslağa DOKUNULMUYOR: kilitli satır seçim yapmıyor, yalnız satın almaya
   * götürüyor.
   */
  const handleLockedPress = useCallback(() => {
    onClose();
    onPaywall?.();
  }, [onClose, onPaywall]);

  const rows = useMemo<Row[]>(() => {
    const list = (universities ?? [])
      // Kendi kampüsü aşağıda TEKRAR görünmesin: ilk satır onu temsil ediyor.
      .filter((u) => !ownDomain || u.domain !== ownDomain)
      .map((u) => ({
        key: u.domain,
        label: resolveLocalized(u.display, i18n.language, u.name),
      }));
    // Kendi kampüsü listenin BAŞINDA: en sık seçilen ve geri dönüş yolu.
    // Etiketi ÜNİVERSİTENİN ADI (istek) — "Kendi kampüsüm" metnine yalnız ad
    // çözülemediğinde düşülüyor (liste gelmedi ya da /me yok).
    return [
      {
        key: OWN_CAMPUS_VALUE,
        label: ownUniversityName ?? t("feed.university.own"),
      },
      ...list,
    ];
  }, [universities, i18n.language, t, ownDomain, ownUniversityName]);

  // Süzme + sabitlenen satırı başa alma. Başa alınan anahtar `pinnedKey` —
  // dokunuşla DEĞİŞMEYEN, yalnız açılışta yazılan değer; `draft` kullanılsaydı
  // her dokunuş listeyi yeniden dizerdi.
  const ordered = useMemo(() => {
    const q = search.trim().toLocaleLowerCase("tr");
    const filtered = q
      ? rows.filter((r) => r.label.toLocaleLowerCase("tr").includes(q))
      : rows;
    const pinned = rows.find((r) => r.key === pinnedKey);
    if (!pinned) return filtered;
    if (q && !pinned.label.toLocaleLowerCase("tr").includes(q)) {
      return filtered;
    }
    return [pinned, ...filtered.filter((r) => r.key !== pinnedKey)];
  }, [rows, pinnedKey, search]);

  return (
    <AppModal
      visible={visible}
      onClose={onClose}
      title={t("feed.university.title")}
      // Detentler ortak sabitten: üst durak, seçiciyi açan sheet'lerle AYNI
      // tepe. `fullScreen` burada "tam ekran" değil "tepe, status bar'ın ALTI"
      // demek (topInset = safe area), yani başlık çentiğe girmiyor.
      // keyboardBehavior varsayılanı klavye açılınca üst durağa çıkarıyor →
      // input klavyenin üstünde dururken liste görünür kalıyor.
      snapPoints={SHEET_PICKER_SNAP_POINTS}
      fullScreen
      // Filtre sheet'inin ÜSTÜNDE açılabiliyor — "switch" alttakini küçültürdü.
      stackBehavior="push"
      // Header YAPISI profil düzenleme modalının aynısı (istek): sol üstte X,
      // sağ üstte tik, ikisi de uygulamanın yuvarlak BERRAK cam ikon ölçüsünde
      // (bkz. AppModal > clearGlassHeader). X'i `closeButton` çiziyor — bu
      // sheet'te `false` idi, çünkü seçim tek dokunuşla kapanıyordu.
      closeButton
      actionIcon="checkmark"
      actionIconLabel={t("common.done")}
      onAction={apply}
      clearGlassHeader
    >
      {/* Arama — listenin üstünde, içerikle birlikte kayıyor. Diğer
          seçicilerle ortak bileşen (bkz. SheetSearchInput). */}
      <SheetSearchInput value={search} onChangeText={setSearch} />

      {ordered.length === 0 ? (
        <View style={{ paddingVertical: 32, alignItems: "center" }}>
          <SFIcon
            name="magnifyingglass"
            fallback={SearchX}
            size={36}
            color={colors.text}
            strokeWidth={1.75}
            weight="medium"
          />
          {search.trim() !== "" && (
            <Text
              style={{
                color: colors.text,
                fontSize: 15,
                fontWeight: "500",
                marginTop: 12,
                textAlign: "center",
              }}
            >
              {t("common.notFound", { query: search.trim() })}
            </Text>
          )}
        </View>
      ) : (
        ordered.map((item, idx) => {
          // İşaret TASLAĞA bakıyor (sıralamanın baktığı `pinnedKey`e değil):
          // dokunulan satırın kutusu anında doluyor, yeri değişmeden.
          const isSelected = item.key === draft;
          // Kilit YALNIZ başka kampüslerde: ilk satır (kendi kampüsü) her
          // zaman açık — gerekçe dosyanın başındaki kapı notunda.
          const isLocked = gate === "paywall" && item.key !== OWN_CAMPUS_VALUE;
          return (
            <TouchableOpacity
              key={item.key}
              // activeOpacity 1 — basılı tutarken solma yok. Tek geri bildirim
              // seçimin kendisi (dolgu + tik).
              activeOpacity={1}
              // Dokunuş YALNIZ taslağı değiştiriyor; uygulayan şey header'daki
              // tik (bkz. `apply`). Kilitli satırda ise seçim HİÇ olmuyor —
              // sheet kapanıp Plus açılıyor.
              onPress={isLocked ? handleLockedPress : () => setDraft(item.key)}
              // ZEMİN HİÇ DEĞİŞMİYOR (istek): seçili satır eskiden `hairline`
              // dolguya bürünüyordu (şehir seçicinin kapsül dili). Seçimi
              // söyleyen tek şey artık sağdaki kutu — iki ayrı işaret aynı
              // bilgiyi iki kez veriyordu ve filtre sheet'indeki satırlarda da
              // dolgu yok.
              // ⚠️ Dolgu kalkınca `borderRadius`/`overflow` da işsiz kaldı:
              // yuvarlatacak bir yüzey yok.
              style={{
                marginTop: idx === 0 ? 0 : 6,
                // 20 → 18: filtre sheet'indeki seçenek satırıyla aynı dikey pay.
                paddingVertical: 18,
                flexDirection: "row",
                alignItems: "center",
              }}
            >
              <Text
                style={{
                  // Kilitli satır da `textSecondary`de kalıyor, EK BİR SOLMA
                  // YOK: kilidi söyleyen şey sağdaki glif. Satırı ayrıca
                  // soluklaştırmak "bu kampüs yok" gibi okunuyordu, oysa var —
                  // sadece Plus gerekiyor.
                  color: isSelected && !isLocked ? colors.text : colors.textSecondary,
                  fontSize: 16,
                  // 400 → 500: profil düzenlemedeki kutulu satırların
                  // (EditProfileForm > OptionListItem) ağırlığı. Aynı kutuyu
                  // taşıyan satırların yazısı da aynı ağırlıkta olmalı; 400
                  // yanlarında silik kalıyordu.
                  fontWeight: "500",
                  flex: 1,
                  // Kutu artık normal akışta — metni onun altından kurtaran
                  // mutlak konum payına (32) gerek kalmadı, aradaki nefes
                  // yeterli.
                  marginRight: 12,
                }}
              >
                {item.label}
              </Text>
              {/* Sağdaki işaret — İKİ HAL, aynı ölçüde.
                  • Kilitli: KUTU YOK, sade kilit glifi (istek). Kutu bir seçim
                    işareti; kilitli satırda seçilecek bir şey olmadığı için boş
                    bir kutu "seçebilirsin ama seçmedin" diyordu.
                  • Açık: akış FİLTRE sheet'indeki işaretin aynısı (22pt
                    yuvarlak kare, seçiliyken dolu + beyaz tik).
                  ⚠️ AÇIK DALDA KUTU HER ZAMAN ÇİZİLİYOR, koşullu olan yalnız
                  içindeki tik: yoksa seçim anında metin alanı genişleyip satır
                  yana kayıyor (bkz. FeedFilterSheet > OptionRow). Kilit dalı bu
                  sorunu doğurmuyor çünkü o satırda seçim HİÇ değişmiyor —
                  glifin boyu da kutuyla aynı (22), yani iki hal arasında da
                  satır kaymıyor. */}
              {isLocked ? (
                <View
                  style={{
                    width: CHECKBOX_SIZE,
                    height: CHECKBOX_SIZE,
                    alignItems: "center",
                    justifyContent: "center",
                  }}
                >
                  <SFIcon
                    name="lock.fill"
                    fallback={Lock}
                    size={16}
                    // Satırın yazısıyla AYNI gri: kilit bir uyarı değil, satırın
                    // durumu. `errorStrong`/`warning` yanlış ton olurdu.
                    color={colors.textMuted}
                    strokeWidth={2}
                    weight="semibold"
                  />
                </View>
              ) : (
                <View
                  style={{
                    width: CHECKBOX_SIZE,
                    height: CHECKBOX_SIZE,
                    borderRadius: 7,
                    borderCurve: "continuous",
                    borderWidth: isSelected ? 0 : 1.5,
                    borderColor: colors.hairlineStrong,
                    backgroundColor: isSelected
                      ? colors.inverseSurface
                      : "transparent",
                    alignItems: "center",
                    justifyContent: "center",
                  }}
                >
                  {isSelected && (
                    <SFIcon
                      name="checkmark"
                      fallback={Check}
                      size={14}
                      color={colors.onInverseSurface}
                      strokeWidth={3}
                      weight="bold"
                    />
                  )}
                </View>
              )}
            </TouchableOpacity>
          );
        })
      )}
    </AppModal>
  );
}
