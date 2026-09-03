import type { LikerNote } from "@/shared/types";

/**
 * Liker kaydındaki not bloğu → kartın okuduğu şekil.
 *
 * Yorum boşsa (ya da alan hiç yoksa) `null` dönüyor: kart `!!item.note`'a
 * bakarak hem blur'u açıyor hem rozeti çiziyor, boş bir nesne o iki kararı da
 * yanlış tarafa çevirirdi — yorumsuz bir "not" ürün olarak da yok.
 *
 * Moderasyon bir notu reddederse sunucu `isNote: false` + `note: null` dönüyor
 * ama LIKE listede KALIYOR (sözleşme §3.6) — o kart burada notsuz bir beğeni
 * olarak normalleşiyor, kart düşmüyor. Ek iş gerekmiyor.
 *
 * ⚠️ Hedef alanları backend'in GÖNDERİM ANINDA aldığı kopyalar; bugünkü
 * profilden yeniden çözülmüyor (D4 = snapshot). TEK İSTİSNA `promptDisplay`:
 * o okuma anında İZLEYİCİNİN dilinde çözülüyor (§3.2), çünkü snapshot'a
 * yazılsaydı gönderenin dilinde donardı.
 *
 * ⚠️ Ekranda DEĞİL ayrı modülde durmasının sebebi: "Kaçırdıkların" listesi de
 * (missedMatchRecovery.ts) aynı normalizasyondan geçmek zorunda. Not, kartın
 * kilidini açan iki üründen biri (bkz. LikesScreen'deki `isUnlockedLike`);
 * ikinci bir kopya yazılsaydı iki ekran aynı kişiyi farklı kilitle çizerdi.
 */
export function normalizeLikerNote(p: any): LikerNote | null {
  const raw = p?.note;
  const comment = typeof raw?.comment === "string" ? raw.comment.trim() : "";
  if (!comment) return null;
  return {
    noteId: raw?.noteId ?? null,
    comment,
    sentAt: raw?.sentAt ?? null,
    target: raw?.target
      ? {
          kind: raw.target.kind === "Prompt" ? "Prompt" : "Photo",
          photoUrl: raw.target.photoUrl ?? null,
          promptKey: raw.target.promptKey ?? null,
          promptDisplay: raw.target.promptDisplay ?? null,
          promptAnswer: raw.target.promptAnswer ?? null,
        }
      : null,
  };
}
