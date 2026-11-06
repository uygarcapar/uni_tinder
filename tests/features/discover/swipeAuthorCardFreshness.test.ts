/**
 * Akış yazar kartının Fire/not SONRASI tazeliği — yarışın geri gelmemesi.
 *
 * ⚠️ Bulgu (2026-11-04, kullanıcı raporu): "Fire atıyorum, banner geliyor,
 * profiline yeniden giriyorum, butonlar yine çizili; bir daha atınca 'zaten
 * attın' alert'i." Kök neden: FeedScreen > handleAuthorSwipe karar ANINDA
 * `authorProfileRoot`u invalidate ediyordu. Kart o an hâlâ açık olduğu için
 * sorgu AKTİF yakalanıyor ve RQ hemen refetch ediyordu — GET, swipe POST'uyla
 * YARIŞIYOR ve neredeyse her zaman swipe sunucuya yazılmadan dönüyordu. Cache
 * "taze" damgalı ama `myLikeDate: null`; 5 dk'lık staleTime penceresinde
 * yeniden açılan kart Fire/not'u yeniden çiziyordu.
 *
 * Fix iki katman, İKİSİ DE MUTATION'IN KENDİSİNDE (swipeQueries):
 *   • onSuccess → İYİMSER yama: cache'teki yazar profillerine `myLikeDate`
 *     yazılıyor (patchAuthorProfilesInCaches) — refetch dönene kadarki
 *     pencerede bile kart aksiyonsuz doğuyor. Pass ("left") hariç; reddedilen
 *     swipe bu dala hiç düşmüyor.
 *   • onSettled → SERVER-TRUTH: root invalidation, POST tamamlandıktan sonra.
 *
 * Bunlar KARAKTERİZASYON testleri (kaynak üzerinde): davranış RQ + ağ
 * zamanlamasına gömülü, birim seviyesinde ancak sıranın kendisi kilitlenebilir.
 */

import { readFileSync } from "fs";
import { resolve } from "path";

const read = (p: string) => readFileSync(resolve(__dirname, p), "utf8");

const swipeSrc = read("../../../src/features/discover/swipeQueries.ts");
const feedSrc = read("../../../src/features/feed/screens/FeedScreen.tsx");

describe("yazar kartı tazeliği mutation'da", () => {
  it("useSwipeMutation: onSuccess iyimser myLikeDate yaması atıyor (pass hariç)", () => {
    expect(swipeSrc).toMatch(
      /direction !== "left"[\s\S]{0,200}patchAuthorProfilesInCaches[\s\S]{0,200}myLikeDate/,
    );
  });

  it("useNoteMutation: onSuccess iyimser myLikeDate yaması atıyor", () => {
    // Not bölümü dosyada swipe'tan SONRA — ikinci isabeti arıyoruz.
    const noteSection = swipeSrc.slice(swipeSrc.indexOf("useNoteMutation"));
    expect(noteSection).toMatch(
      /patchAuthorProfilesInCaches[\s\S]{0,200}myLikeDate/,
    );
  });

  it("iki mutation da onSettled'da authorProfileRoot'u invalidate ediyor", () => {
    const hits = swipeSrc.match(
      /onSettled[\s\S]{0,300}?feedKeys\.authorProfileRoot/g,
    );
    expect(hits?.length).toBe(2);
  });

  /**
   * ⚠️ YARIŞIN GERİ GELMEMESİ: FeedScreen karar anında author-profile
   * invalidation'ı YAPMAMALI — kart açıkken atılan invalidate, POST'la yarışan
   * bir GET demek. Ekranda bu anahtara hiçbir referans kalmadı; geri eklenmek
   * istenirse önce swipeQueries'teki onSettled'ın gerekçesi okunmalı.
   */
  it("FeedScreen author-profile invalidation'ına hiç dokunmuyor", () => {
    expect(feedSrc).not.toMatch(/authorProfileRoot/);
    expect(feedSrc).not.toMatch(/feedKeys\.authorProfile\(/);
  });
});
