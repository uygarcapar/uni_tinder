import type { TFunction } from "i18next";
import type { ProfileHobby } from "@/shared/types";

/**
 * Kilitli (blurlu) beğeni kartının "ipucu" katmanı.
 *
 * Free kullanıcı "Seni Beğenenler"de kişiyi göremiyor ama kart tamamen boş
 * bir bulanıklık olunca iki şey oluyordu: (1) kart yükleme iskeleti gibi
 * okunuyordu, (2) paywall'a giden merak sıfırdı — ne beğenmiş, ne arıyor,
 * doğrulanmış mı, hiçbiri yok. Bumble'ın yaptığı gibi kimliği AÇMADAN bir-iki
 * sinyal veriyoruz: foto doğrulama rozeti, TEK hobi, ilişki niyeti.
 *
 * ⚠️ Kimlik burada sızmaz: hobi/niyet/rozet tek başına kişiyi tanımlamıyor,
 * isim/yaş/üniversite/fotoğraf hâlâ perdenin altında. İpucuya bunlardan
 * birini EKLEME — ipucu ne kadar özgülse blur o kadar anlamsızlaşır.
 *
 * Sunucu tarafında ek iş YOK: `WhoLikedMe` / `MissedMatches` zaten
 * ProfileCardDto'nun tamamını (hobbies, relationshipIntent, isSelfieVerified)
 * taşıyor — blur gibi ipucu da istemci tarafı bir seçim.
 */

export interface TeaserHobby {
  /** İkon eşlemesi için — `HobbyIcon` enumName ile arıyor. */
  enumName: string | undefined;
  /** Kullanıcının dilinde çözülmüş etiket. */
  label: string;
}

/**
 * Listeden gösterilecek TEK hobi: ilk dolu olan. Sıra sunucudan geldiği gibi
 * (kullanıcının profilde seçtiği sıra) — rastgele seçmek her yenilemede
 * kartı değiştirirdi, o da "yükleniyor" hissini geri getirir.
 */
export function resolveTeaserHobby(
  hobbies: ProfileHobby[] | null | undefined,
): TeaserHobby | null {
  if (!Array.isArray(hobbies)) return null;
  for (const hobby of hobbies) {
    if (typeof hobby === "string") {
      const label = hobby.trim();
      if (label) return { enumName: undefined, label };
      continue;
    }
    const label = (hobby?.name ?? hobby?.enumName ?? "").trim();
    if (label) return { enumName: hobby?.enumName, label };
  }
  return null;
}

// "ilişki" ekini alan ilişki niyetleri (bkz. relationshipIntentLabel).
// Anahtar DAİMA enumName: `display` Accept-Language'e göre değişiyor.
const RELATIONSHIP_INTENTS_WITH_SUFFIX = new Set([
  "LongTerm",
  "ShortTerm",
  "LongTermOpenToShort",
  "ShortTermOpenToLong",
]);

// Ek takmadan önce "kelime etikette zaten var mı" kontrolü İKİ dilde birden
// yapılıyor: fallback'e düşen backend display'i hangi dilde geldiyse o dilin
// kelimesini taşıyor ("Uzun süreli ilişki" / "Long term relationship"). Tek
// dile bakmak "Long term relationship ilişki" gibi çift kelime üretiyordu.
const INTENT_SUFFIX_WORDS = ["ilişki", "relationship"];

function normalizeForWordMatch(text: string | null | undefined): string {
  return (text || "").replace(/[İIı]/g, "i").toLowerCase();
}

function containsWord(text: string, word: string): boolean {
  if (!word) return false;
  return normalizeForWordMatch(text).includes(normalizeForWordMatch(word));
}

/**
 * İlişki niyetinin karttaki KISA etiketi ("Uzun süreli ilişki").
 *
 * Kaynak sırası: yerel kısa harita (`discover.filters.relationshipIntents.
 * short.<enumName>`) → backend display. Yerel harita yalnız KISA sıfat
 * taşıyor, ek ("ilişki") burada takılıyor — ama yalnız eki taşıyan niyetlerde
 * ve etiket kelimeyi zaten içermiyorsa (display fallback'i içerebiliyor).
 * "StillFiguringOut" gibi niyetlerde ek YOK: "Henüz karar vermedim ilişki"
 * bozuk çıkar. Listede olmayan (backend'in sonradan ekleyeceği) enum'lar da
 * eksiz basılır — bilmediğimiz bir etikete kör ek takmaktansa düz göstermek
 * güvenli taraf.
 *
 * Keşif kartı (SwipeCard) ve kilitli beğeni kartı AYNI fonksiyonu okuyor;
 * ikisi ayrışırsa aynı kişi iki ekranda iki farklı niyetle görünür.
 */
export function relationshipIntentLabel(
  t: TFunction,
  enumName: string | null | undefined,
  display: string | null | undefined,
): string {
  const shortLabel = enumName
    ? String(
        t(`discover.filters.relationshipIntents.short.${enumName}`, {
          defaultValue: "",
        }),
      )
    : "";
  const label = shortLabel || display || "";
  if (!label) return "";
  const suffix = String(t("profile.card.intentSuffix"));
  const needsSuffix =
    !!enumName &&
    RELATIONSHIP_INTENTS_WITH_SUFFIX.has(enumName) &&
    !INTENT_SUFFIX_WORDS.some((word) => containsWord(label, word));
  return needsSuffix ? `${label} ${suffix}` : label;
}
