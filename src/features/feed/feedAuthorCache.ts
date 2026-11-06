import type { QueryClient } from "@tanstack/react-query";
import { feedKeys } from "./feedKeys";
import type { FeedPostDto, FeedPostPageDto } from "./feedTypes";

/**
 * Akışın KİŞİ BAZLI cache yamaları — bir karar (beğeni/Fire/not) bir kişiye
 * gidiyor, o kişinin akıştaki İKİ ayrı temsilini birden bayatlatıyor:
 *   • yazar KARTI (`authorProfileRoot`) → patchAuthorProfilesInCaches
 *   • akış SATIRLARI (`postsRoot` + `mine`) → patchAuthorPostsInCaches
 *
 * ⚠️ AYRI DOSYADA, feedQueries'te DEĞİL ve bu kasıtlı: çağıran swipeQueries ve
 * feedQueries'in import ağacı toaster → react-native-notifier → gesture-handler
 * çekiyor — o zincir discover test ortamını çökertti (suite'ler "failed to
 * run"). Bu modül yalnız anahtar fabrikasını, RQ tipini ve (silinen) tipleri
 * görüyor; feedKeys'in kendi "hook zinciri import etmeden okunabilmeli"
 * gerekçesinin aynısı.
 */

type PostPatch = (post: FeedPostDto) => FeedPostDto;

/**
 * Yazar profili KARTLARINI kişi bazlı yamala — Fire/not başarısının iyimser
 * kolu (çağıran: swipeQueries > useSwipeMutation/useNoteMutation onSuccess).
 *
 * Kartın cache anahtarı POST bazlı ([...authorProfile(postId), mode]) ama
 * Fire/not KİŞİYE gidiyor: aynı yazarın başka bir gönderisinden açılan kart da
 * `myLikeDate`i dolu görmeli, yoksa 5 dk'lık staleTime penceresinde Fire/not
 * yeniden çizilir ve ikinci gönderim UT-6404 yer. Eşleştirme bu yüzden
 * anahtarla değil verinin `userId`siyle.
 *
 * Server-truth AYRICA geliyor (aynı mutation'ların onSettled'ı root'u
 * invalidate ediyor) — bu yama yalnız refetch dönene kadarki pencereyi
 * kapatıyor. İsabet yoksa referans korunuyor (feedQueries >
 * patchPostInCaches'teki gerekçe).
 */
export function patchAuthorProfilesInCaches(
  qc: QueryClient,
  authorUserId: string,
  patch: (profile: any) => any,
): void {
  qc.setQueriesData({ queryKey: feedKeys.authorProfileRoot }, (data: any) => {
    if (!data?.userId || data.userId !== authorUserId) return data;
    return patch(data);
  });
}

/**
 * Bir YAZARIN tüm gönderilerini yamalar — `patchPostInCaches`in kardeşi, tek
 * farkı eşleşmenin id ile değil `author.userId` ile kurulması.
 *
 * ⚠️ VAR OLMA SEBEBİ: not KİŞİ BAŞINA tek gidiyor (sunucuda `Note` tablosunda
 * modsuz `UNIQUE(ActorId, TargetId)`; backend tasarımı K1). Bir not gittiğinde
 * o yazarın yalnız dokunulan gönderisi değil, listede duran DİĞER gönderileri
 * de kapanıyor. Tek satır yamasaydık aynı yazarın bir alttaki gönderisinde
 * buton durmaya devam eder, basınca sunucudan UT-6404 yerdi — kaçındığımız
 * ölü butonun ta kendisi.
 *
 * ⚠️ Yazarsız satır (ANONİM gönderi: sunucu `author: null` yolluyor) hiç
 * eşleşmiyor. Anonim gönderiye zaten not atılamıyor ve kimliği açığa çıkaracak
 * bir yan etki üretmemesi için eşleştirme yalnız dolu `userId` üzerinden.
 *
 * İsabet yoksa referans korunuyor — gerekçe `patchPostInCaches`te.
 */
export function patchAuthorPostsInCaches(
  qc: QueryClient,
  authorUserId: string,
  patch: PostPatch,
): void {
  const apply = (data: any) => {
    if (!data?.pages) return data;
    let hit = false;
    const pages = data.pages.map((page: FeedPostPageDto) => {
      const items = page?.items;
      if (!Array.isArray(items)) return page;
      let pageHit = false;
      const nextItems = items.map((item) => {
        if (!item?.author?.userId || item.author.userId !== authorUserId) {
          return item;
        }
        pageHit = true;
        return patch(item);
      });
      if (!pageHit) return page;
      hit = true;
      return { ...page, items: nextItems };
    });
    return hit ? { ...data, pages } : data;
  };
  qc.setQueriesData({ queryKey: feedKeys.postsRoot }, apply);
  qc.setQueriesData({ queryKey: feedKeys.mine }, apply);
}

/**
 * "Bu kişiye karar verildi" → o yazarın AKIŞ SATIRLARINDAKİ not butonunu kapat.
 *
 * ⚠️ KURALIN TEK YERİ. `AlreadySwiped` değerini elle yazan her nokta bir drift
 * adayı: satırdaki kapı sunucunun `state`inden okunuyor ve istemcinin yazdığı
 * kelime sunucunun bir sonraki çekimde göndereceğiyle AYNI olmak zorunda
 * (sözleşme: backend_feed_post_note_2026-10-30 §3.1). Çağıranlar: Keşif'ten
 * verilen kararlar (swipeQueries > useSwipeMutation/useNoteMutation) ve akışın
 * kendi not gönderimi (FeedScreen).
 *
 * ⚠️ Kapı `postNoteButtonVisible` beyaz liste olduğu için (`=== "Ok"`),
 * `AlreadySwiped` yazmak butonu kapatmaya yetiyor; `availableModes` olduğu gibi
 * kalıyor — alanı silmek sunucunun bir sonraki cevabıyla çelişirdi.
 *
 * ⚠️ Satır HİÇ `note` taşımıyorsa (özellik kapalıyken sunucu alanı göndermiyor)
 * uydurulmuyor: `{ state: "Ok" }` tabanı yalnız yamanın şeklini koruyor, zaten
 * kapalı olan bir satırı açmıyor.
 */
export function closeAuthorNoteGate(qc: QueryClient, authorUserId: string): void {
  patchAuthorPostsInCaches(qc, authorUserId, (p) => ({
    ...p,
    note: { ...(p.note ?? { state: "Ok" }), state: "AlreadySwiped" },
  }));
}
