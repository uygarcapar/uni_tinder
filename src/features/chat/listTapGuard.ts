/**
 * "Liste dokunuşunu bir kontrol sahiplendi" bayrağı.
 *
 * NEDEN VAR: sohbet listesinin ÜSTÜNDE blanket bir RNGH tap jesti duruyor
 * (useRevealGesture > dismissTap) ve dokununca klavyeyi kapatıyor. Bu kasıtlı —
 * kullanıcı balona dokununca da klavye kapansın istiyoruz, oysa balonun kendi
 * `Pressable`'ı (uzun basış) RN responder'ını sahiplendiği için `ScrollView`'un
 * `keyboardShouldPersistTaps="handled"` yolu orada hiç tetiklenmezdi.
 *
 * BEDELİ: RNGH jesti ile RN responder'ı AYRI sistemler — ata jest, dokunuşu
 * içerideki bir butonun aldığını BİLMİYOR. Sesli mesajın oynat düğmesine basınca
 * ses çalıyor ama klavye de kapanıyordu (kullanıcı yazarken dinleyemiyordu).
 *
 * SÖZLEŞME: liste içindeki gerçek bir kontrol, `onPressIn`de `claimChatListTap`
 * çağırır; dismissTap da bırakışta `chatListTapClaimed()` derse klavyeye
 * dokunmaz. Sıra garantili: `onPressIn` dokunuş İNİŞİNDE, tap `onEnd` KALKIŞINDA.
 *
 * Zaman penceresi (bayrak yerine damga): parmak kontrolün üstünden kayıp tap hiç
 * gelmezse bayrak asılı kalır ve bir SONRAKİ boş-alan dokunuşu klavyeyi
 * kapatmazdı. Damga kendi kendine bayatlıyor. TTL, tap'in `maxDuration(250)`
 * sınırının rahat üstünde.
 */
const CLAIM_TTL_MS = 700;

let claimedAt = 0;

/** Liste içindeki bir kontrol dokunuşu aldı (oynat, hız kapsülü, …). */
export function claimChatListTap(): void {
  claimedAt = Date.now();
}

/** Bırakıştaki liste-tap'i bu dokunuş sahiplenmiş mi? Okuma TÜKETİR. */
export function chatListTapClaimed(): boolean {
  const claimed = claimedAt > 0 && Date.now() - claimedAt <= CLAIM_TTL_MS;
  claimedAt = 0;
  return claimed;
}
