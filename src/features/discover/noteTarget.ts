import type { LikerNote, NoteTarget, ProfilePromptCard } from "@/shared/types";

/**
 * Not (yorumlu beğeni) hedefinin tek kaynağı.
 *
 * Not, kartın BÜTÜNÜNE değil belirli bir içeriğine yazılıyor: ana fotoğraf,
 * N. fotoğraf ya da bir prompt cevabı. Hedef hem gönderim gövdesinde
 * (`POST /api/swipe/Note`) hem de composer başlığında kullanıldığı için burada
 * duruyor — SwipeCard'ın içinde kalsaydı DiscoverScreen ve LikesScreen aynı
 * eşlemeyi ikinci kez yazmak zorunda kalırdı.
 *
 * ⚠️ `photoIndex` GÖNDERİM anahtarı, KALICI kimlik değil. Backend hedefi
 * gönderim anında çözüp anlık görüntü olarak saklamalı
 * (backend_note_consumable_proposal §9-D4): foto silinir ya da moderasyon bir
 * fotoğrafı gizlerse index kayar ve alıcı hiç bahsi geçmeyen bir fotoğrafın
 * altında yorum görür.
 */

/**
 * Yorum karakter tavanı. İKİ İŞİ birden görüyor: `Stats.noteMaxLength`
 * gelmediğindeki varsayılan VE sunucu daha büyük bir sayı gönderse bile
 * aşılmayan istemci tavanı (bkz. resolveNoteMaxLength).
 *
 * 150 ürün kararı, sözleşmenin önerdiği 240'ın BİLEREK altında: aynı işi yapan
 * uçlar da orada duruyor (Bumble Compliment 150, Hinge prompt cevabı 150). Not
 * sohbeti başlatmak için değil, başlatmaya sebep olmak için — 240 mini mesaja
 * davet ediyordu.
 *
 * ⚠️ Tavanı AŞAĞI çekmek güvenli: sunucu 240 kabul ederken 150 göndermek 400
 * üretmez, yalnız kullanıcı erken kesilir. YUKARI çıkarmak sunucuyla BİRLİKTE
 * ve yeni istemci sürümüyle yapılmalı (bkz. weeklySuperLikeLimit tarihçesi).
 */
export const NOTE_MAX_LENGTH = 150;

/**
 * Sunucudan gelen tavan + istemci tavanı → yürürlükteki sınır. Sunucu daha
 * büyük bir sayı gönderirse kazanan KÜÇÜK olan; değer hiç gelmediyse ya da
 * anlamsızsa (0 / negatif) istemci tavanı geçerli.
 */
export const resolveNoteMaxLength = (serverValue?: number | null): number =>
  typeof serverValue === "number" && serverValue > 0
    ? Math.min(serverValue, NOTE_MAX_LENGTH)
    : NOTE_MAX_LENGTH;

/**
 * Yorumun UZUNLUĞU — **code point** cinsinden, `str.length` DEĞİL.
 *
 * Sunucu `string.Length` değil rune sayıyor (sözleşme §4). JS'in `.length`i
 * UTF-16 birimi sayar: astral bir emoji (😀) orada 2, sunucuda 1. İki taraf
 * farklı saydığında sayaç ya kullanıcıyı erken kesiyor ya da sunucunun
 * saymadığı bir taşma gösteriyor.
 */
export const noteLength = (text: string): number => [...text].length;

/** Metni code point sınırına kırp — TextInput'un UTF-16 `maxLength`i yerine. */
export const clampNoteText = (text: string, limit: number): string =>
  noteLength(text) <= limit ? text : [...text].slice(0, limit).join("");

export function photoNoteTarget(photoIndex: number): NoteTarget {
  return { kind: "Photo", photoIndex, promptKey: null, postId: null };
}

export function promptNoteTarget(promptKey: string): NoteTarget {
  return { kind: "Prompt", photoIndex: null, promptKey, postId: null };
}

/**
 * Akış gönderisi hedefi. Fotoğraf/prompt hedeflerinden farkı yalnız anahtarın
 * nereden geldiği: not semantiği (kota, tavan, beğeni sayılması) birebir aynı.
 */
export function postNoteTarget(postId: string): NoteTarget {
  return { kind: "FeedPost", photoIndex: null, promptKey: null, postId };
}

/** İki hedef aynı içeriği mi gösteriyor — composer'ın açık olduğu kutuyu işaretlemek için. */
export function isSameNoteTarget(
  a: NoteTarget | null | undefined,
  b: NoteTarget | null | undefined,
): boolean {
  if (!a || !b) return false;
  if (a.kind !== b.kind) return false;
  if (a.kind === "Photo") return a.photoIndex === b.photoIndex;
  if (a.kind === "FeedPost") return a.postId === b.postId;
  return a.promptKey === b.promptKey;
}

/**
 * Composer başlığındaki "neye yazıyorsun" satırı.
 *
 * Prompt hedefinde sorunun kendisi gösteriliyor (`promptDisplay` sunucuda
 * izleyicinin diline çözülmüş geliyor); katalogdan çözülemezse jenerik prompt
 * etiketine düşülür — başlıksız bir composer "neye yazdığımı bilmiyorum"
 * hissi verirdi.
 */
export function noteTargetLabel(
  target: NoteTarget,
  prompts: ProfilePromptCard[] | null | undefined,
  t: (key: string, opts?: Record<string, unknown>) => string,
): string {
  // Gönderi hedefinde başlık JENERİK: gönderinin metni composer'da hedefin
  // kendi önizlemesi olarak zaten duruyor (bkz. NoteComposerModal >
  // PostTargetChip), başlıkta ikinci kez tekrarlanması gerekmiyor.
  if (target.kind === "FeedPost") return t("note.targetPost");
  if (target.kind === "Prompt") {
    const found = (prompts ?? []).find((p) => p.promptKey === target.promptKey);
    return found?.promptDisplay || t("note.targetPrompt");
  }
  return target.photoIndex === 0
    ? t("note.targetMainPhoto")
    : t("note.targetPhoto", { index: (target.photoIndex ?? 0) + 1 });
}

/**
 * ALICININ gördüğü notun hedef bloğu — Beğeniler kartındaki kutunun üç sorusu
 * tek yerde: başlıkta ne yazıyor, alıntı bloğunda ne duruyor, solda fotoğraf
 * var mı.
 *
 * Karar `LikeCard`ın içinde değil BURADA çünkü o dosya (2200+ satır, FlatList
 * hücresi) testte render edilmiyor; kural orada gömülü kalsaydı "gönderine not
 * bıraktı" satırının hiç çizilmediği hâl sessizce geçerdi.
 *
 * ⚠️ Hedefi olmayan notta (eski kayıt / realtime önizleme) HİÇBİR ŞEY
 * uydurulmuyor: neye yanıt verildiğini bilmiyorken "bu fotoğrafına" demek
 * yanlış bilgi olurdu.
 *
 * ⚠️ Gönderi dalında `label` (sunucunun hazır metni) i18n yedeğini EZİYOR.
 * Akış-yanıtı döneminden kalan yol: kart o zaman etiketi prop'la alıyordu ve
 * kayıtlar hâlâ öyle gelebilir.
 */
export function likerNoteTargetView(
  target: LikerNote["target"],
  t: (key: string) => string,
): {
  label: string | null;
  quote: string | null;
  photoUrl: string | null;
  removedNotice: string | null;
} {
  const empty = {
    label: null,
    quote: null,
    photoUrl: null,
    removedNotice: null,
  };
  if (!target) return empty;

  if (target.kind === "Photo") {
    return {
      ...empty,
      label: t("note.leftNoteOnPhoto"),
      photoUrl: target.photoUrl || null,
    };
  }

  if (target.kind === "Prompt") {
    // Sorunun kendisi (`promptDisplay`) BİLEREK çizilmiyor — gerekçe
    // LikeCard'daki NOTE_CHIP_* sabitlerinin başında.
    return {
      ...empty,
      label: t("note.leftNoteOnPrompt"),
      quote: target.promptAnswer || null,
    };
  }

  if (target.kind === "FeedPost") {
    return {
      ...empty,
      label: target.label || t("note.leftNoteOnPost"),
      quote: target.excerpt || null,
      // Gönderi gitse de NOT OKUNABİLİR kalıyor: kullanıcının ödediği şey o.
      removedNotice: target.postDeleted ? t("note.postRemoved") : null,
    };
  }

  return empty;
}

/** Gönderim gövdesindeki `target` alanı — null'lar da AÇIKÇA yazılıyor (§2.1). */
export function noteTargetPayload(target: NoteTarget) {
  return {
    kind: target.kind,
    photoIndex: target.kind === "Photo" ? target.photoIndex : null,
    promptKey: target.kind === "Prompt" ? target.promptKey : null,
    postId: target.kind === "FeedPost" ? target.postId : null,
  };
}
