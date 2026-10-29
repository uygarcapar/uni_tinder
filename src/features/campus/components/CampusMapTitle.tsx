import { useEffect, useMemo, useState } from "react";
import { Text } from "react-native";
import { useTranslation } from "react-i18next";
import { colors } from "@/shared/theme/colors";
import { filterLiveMoments } from "../campusQueries";
import type { CampusMomentDto } from "../campusTypes";

/**
 * TAM EKRAN HARİTANIN BAŞLIĞI — iki yerde, iki biçimde.
 *
 *   `variant="count"` — "7 an · Kampüs Adı". ŞERİDİN TEPESİNDE, kutuların
 *                       hemen üstünde.
 *   `variant="short"` — yalnız "Anlar". ÜST CHROME'da, cam X'in yanında.
 *
 * ── Başlık YİNE aşağı indi ────────────────────────────────────────────────
 * Sıra şöyleydi: önce kutuların üstündeydi (eski sheet'ten kalma), sonra üst
 * banda taşındı (gerekçe: okunabilirliği zaten orada olan perdeden alsın,
 * şerit yalnız kutulardan oluşsun), şimdi tekrar kutuların üstünde. Farkı
 * perdeden: ALT PERDE ARTIK KUTULARIN ÜSTÜNE KADAR ÇIKIYOR
 * (`campusStripScrimHeight`), yani başlık yine hazır bir zemin buluyor —
 * eskiden çıplak haritanın üstünde kalan şey oydu. Üstte kalan "Anlar" sabit
 * bir etiket, yani orada sayı/kampüs adı yok ve iki başlık birbirini
 * tekrarlamıyor.
 *
 * ── Neden KENDİ bileşeni ──────────────────────────────────────────────────
 * Sayı, süresi dolanlar AYIKLANDIKTAN sonraki an sayısı: yani başlık dakikalık
 * bir tik ister. Şeridin kendi tiki zaten var; başlık oraya mount olduğunda
 * `nowMs` dışarıdan GELİYOR ve bileşen kendi zamanlayıcısını hiç kurmuyor
 * (iki `setInterval` aynı dakikada iki ayrı render dalgası demekti). Dışarıdan
 * verilmezse kendi tikini kuruyor — "short" dalında zaman zaten gereksiz.
 *
 * ⚠️ TÜRKÇEDE YER EKİ ÜRETİLMİYOR ("…Üniversitesi'nde"). Üniversite adlarının
 * neredeyse tamamı iyelik ekiyle bitiyor ("… Üniversitesi") ve doğru yer eki
 * araya kaynaştırma -n- istiyor: "Üniversitesi'NDE". Kısaltmalar başka
 * ("İTÜ'de"), ünlü uyumu da ayrı bir dal. Yanlış ek görünür bir hata olurdu;
 * nokta ayracı aynı bilgiyi dilbilgisi riski almadan veriyor. İngilizcede
 * sorun yok: "7 moments on <kampüs>".
 */

/** Dakikalık tik — süresi dolan anlar sayıdan düşsün diye. */
const TICK_MS = 60_000;

/**
 * Punto/satır Keşif şeridinin isim satırıyla AYNI (`CardStickyHeader` >
 * TITLE_FONT/TITLE_LINE): iki ekranın üst şeridi aynı dili konuşuyor.
 */
const TITLE_FONT = 21;
const TITLE_LINE = 27;

export interface CampusMapTitleProps {
  /** `short` dalında ikisi de okunmuyor — sabit etiket yazılıyor. */
  variant?: "count" | "short";
  moments: CampusMomentDto[];
  /** Kampüs adı; bilinmiyorsa yalnız sayı yazılıyor. */
  campusLabel: string | null;
  /**
   * Çağıranın dakikalık tiki. Verilirse bileşen KENDİ zamanlayıcısını
   * kurmuyor — şerit zaten bir tane çalıştırıyor (bkz. dosyanın başı).
   */
  nowMs?: number;
}

export default function CampusMapTitle({
  variant = "count",
  moments,
  campusLabel,
  nowMs: nowMsProp,
}: CampusMapTitleProps) {
  const { t } = useTranslation();

  const [ownNowMs, setOwnNowMs] = useState(() => Date.now());
  // ⚠️ Kanca KOŞULSUZ, gövdesi koşullu: zamanlayıcı yalnız sahipsiz ve
  // sayı yazan dalda kuruluyor.
  const ownsTicker = nowMsProp === undefined && variant === "count";
  useEffect(() => {
    if (!ownsTicker) return;
    const id = setInterval(() => setOwnNowMs(Date.now()), TICK_MS);
    return () => clearInterval(id);
  }, [ownsTicker]);

  const nowMs = nowMsProp ?? ownNowMs;

  const count = useMemo(
    () => filterLiveMoments(moments, nowMs).length,
    [moments, nowMs],
  );

  const text = useMemo(() => {
    if (variant === "short") return t("campus.headerTitleShort");
    if (!campusLabel) {
      return t(
        count === 1 ? "campus.momentCountOne" : "campus.momentCountOther",
        { count },
      );
    }
    return t(
      count === 1 ? "campus.headerTitleOne" : "campus.headerTitleOther",
      { count, campus: campusLabel },
    );
  }, [campusLabel, count, t, variant]);

  return (
    <Text
      numberOfLines={1}
      style={{
        /**
         * MÜREKKEP İKİ VARYANTTA DA TEMANIN — açık modda SİYAH.
         *
         * Bir tur `short` ("Anlar") medya mürekkebinde (açık modda da beyaz)
         * duruyordu, çünkü üst perde SABİT SİYAHTI. O perde akış sayfasının
         * header blur'uyla eşitlendi ve artık modla dönüyor, yani açık modda
         * BEYAZLIYOR (CampusMapScrim > tone="chrome"). Beyaz perde üstünde
         * beyaz yazı kaybolurdu — `veil()`in kendi uyarısı bu: perdeyi
         * çevirince üstündeki mürekkebi de çevir. Yanındaki cam X/artı da aynı
         * turda tema mürekkebine geçti (FeedScreen > `onSurface`).
         *
         * `count` ("7 an · Kampüs") başından beri tema mürekkebinde: o satır
         * ALT perdenin İÇ ucunda, maskenin şeffafa erittiği kuyrukta duruyor
         * (CampusMapScrim > SCRIM_TO + maskFor) ve açık temada orada harita
         * zaten açık kalıyordu.
         *
         * ⚠️ FOTOĞRAF ÜSTÜNDEKİ MÜREKKEP BUNDAN AYRI: kartın dibindeki ad/zaman
         * satırı medya mürekkebinde KALIYOR (CampusMomentCard) — orada altta
         * gerçekten bir fotoğraf var, harita değil.
         */
        color: colors.text,
        fontSize: TITLE_FONT,
        lineHeight: TITLE_LINE,
        fontWeight: "700",
      }}
    >
      {text}
    </Text>
  );
}
