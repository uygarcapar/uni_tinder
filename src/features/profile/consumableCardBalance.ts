import { useEffect, useMemo, useRef, useState } from "react";
import { useIsFocused } from "@react-navigation/native";
import { useSwipeStats } from "@/features/discover/swipeQueries";
import { useAppSelector } from "@/shared/hooks/redux";
import { selectIsPremium } from "@/features/profile/subscriptionSlice";

/**
 * ProfileScreen'deki mağaza kartlarının (SuperLike, Not) ortak bakiye çözümü.
 * İki kart aynı /Stats cevabından besleniyor, tek farkları hangi alanı
 * okudukları ve premium aktivasyonunun o alanı etkileyip etkilemediği.
 *
 * TASARIM SÖZLEŞMESİ — "veri varmış gibi görünüp çalışmayan sayı YOK":
 * bakiyeyi bilmediğimiz her durumda sayı hiç yazılmaz (`kind: "unknown"`),
 * çağıran onun yerine ürünün değer önerisini gösterir. Bilinmeyen durumlar:
 * stats henüz gelmedi/hata verdi, backend alanı null döndü, ya da premium
 * satın alındı ama /Stats hâlâ free tier cevabı veriyor.
 */

// Bakiye bilinmiyorken stats refetch aralıkları. İlk deneme 2sn: webhook
// genelde saniyeler içinde iniyor. Dizi bitince durur — sonsuz polling
// backend'in 60/dk paylaşımlı limitini yer; ekrana geri dönüldüğünde
// (isFocused) sayaç sıfırlanıp yeni bir tur açılır.
const RESOLVE_DELAYS_MS = [2000, 5000, 10000, 20000, 40000];

export type ConsumableBalance =
  | { kind: "unknown" }
  | { kind: "value"; remaining: number };

export type ConsumableBalanceField = "superLikesRemaining" | "notesRemaining";

export function useConsumableCardBalance(
  field: ConsumableBalanceField,
  options: {
    /**
     * Premium aboneliğin bu bakiyeye hak veriyor mu? SuperLike'ta EVET (tier
     * kotası var), notta HAYIR — not yalnızca satın alınan bir ürün. Sadece
     * "evet"te satın alma ile webhook arası pencere bakiyeyi şüpheli yapar.
     */
    premiumGranted: boolean;
  },
) {
  const statsQuery = useSwipeStats();
  const data = statsQuery.data as any;
  const isPremium = useAppSelector(selectIsPremium);
  const isFocused = useIsFocused();

  // Redux premium diyor ama /Stats hâlâ free tier cevabı veriyor: satın alma
  // alındı, webhook inmedi. Bu pencerede kota bakiyesi premium'a ait DEĞİL.
  const premiumPending =
    options.premiumGranted && !!data && isPremium && data.serverIsPremium === false;

  // ── Bakiyeyi backend'den oturtma (bounded retry) ────────────────────────────
  // Stats staleTime:Infinity + refetchOnMount:false → kendiliğinden hiç
  // tazelenmiyor. Premium satın alma sonrası cache'te bakiye null bırakılıyor;
  // sync başarısız olursa bunu tazeleyecek başka bir yol yok.
  const needsResolve = data ? premiumPending || data[field] == null : statsQuery.isError;
  const [resolveAttempt, setResolveAttempt] = useState(0);
  // refetch ref'te: deps'e konsa her render timer'ı sıfırlayabilir ve retry hiç
  // ateşlemezdi.
  const refetchStatsRef = useRef(statsQuery.refetch);
  refetchStatsRef.current = statsQuery.refetch;

  // Ekrana her dönüşte yeni bir tur hakkı: kullanıcı Discover'da dolaşıp
  // dönene kadar webhook inmiş olabilir.
  useEffect(() => {
    if (isFocused) setResolveAttempt(0);
  }, [isFocused]);

  // Merdivenin boyu SEBEBE bağlı: premium aktivasyonu gerçekten dakikalar
  // sürebilir (webhook), oysa alanı hiç göndermeyen bir backend sürümünde
  // ısrar etmenin faydası yok — tek deneme yapıp susuyoruz. Not bakiyesi
  // uzun süre bu ikinci daldaydı (uç canlı değildi), o yüzden tek deneme.
  const maxResolveAttempts = premiumPending ? RESOLVE_DELAYS_MS.length : 1;
  useEffect(() => {
    if (!needsResolve) {
      setResolveAttempt(0);
      return;
    }
    if (!isFocused) return;
    if (resolveAttempt >= maxResolveAttempts) return;
    const id = setTimeout(() => {
      refetchStatsRef.current?.();
      setResolveAttempt((a) => a + 1);
    }, RESOLVE_DELAYS_MS[resolveAttempt]);
    return () => clearTimeout(id);
  }, [needsResolve, isFocused, resolveAttempt, maxResolveAttempts]);

  const balance: ConsumableBalance = useMemo(() => {
    if (!data || premiumPending) return { kind: "unknown" };
    const remaining = data[field];
    if (typeof remaining !== "number") return { kind: "unknown" };
    // Bu ürünlerin "sınırsız" hâli YOK — premium'da bile sonlu kota.
    // Negatifi "∞" saymak bedava hak dağıtmak olurdu (backend refund'da
    // claw-back yapmıyor), 0'a clamp'liyoruz.
    return { kind: "value", remaining: Math.max(0, remaining) };
  }, [data, field, premiumPending]);

  return { balance, refetch: statsQuery.refetch };
}
