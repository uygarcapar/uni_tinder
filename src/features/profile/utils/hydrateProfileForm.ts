import { isValidYearOfStudy } from "@/shared/constants/limits";

// EditProfileForm initial values'ını parent'ta sync üretmek için. Bunu mount
// öncesi useMemo'da çalıştırıyoruz → form post-mount setValue/reset yapmadan
// hidrate doğar. Hidrate cascade'i Fabric'in 1024 commit limitine baskı
// uyguluyordu; tek-shot defaultValues bu baskıyı sıfırlar.

export const matchOption = (options: any[], idValue: any, displayValue?: any) => {
  if (!options?.length) return null;
  const byId = options.find((o) => o?.id === idValue);
  if (byId) return byId;
  const n = Number(idValue);
  if (Number.isFinite(n)) {
    const byNumId = options.find((o) => Number(o?.id) === n);
    if (byNumId) return byNumId;
  }
  const tryStr = (v: any) =>
    v &&
    options.find(
      (o) =>
        o?.enumName === v ||
        o?.name === v ||
        o?.display === v ||
        o?.displayName === v ||
        o?.label === v,
    );
  return tryStr(idValue) || tryStr(displayValue) || null;
};

const matchMulti = (options: any[], raws: any) => {
  if (!Array.isArray(raws) || !options?.length) return [];
  return raws
    .map((raw) =>
      matchOption(
        options,
        typeof raw === "object" ? (raw?.id ?? raw?.enumName) : raw,
        typeof raw === "object" ? (raw?.name ?? raw?.displayName) : raw,
      ),
    )
    .filter(Boolean);
};

/**
 * Görünen isim — profil kaydındaki ad kanonik, `user.displayName`/`user.name`
 * yalnızca fallback. UpdateProfile ikisini birlikte güncellediği için normalde
 * aynılar; bu senkron YENİ olduğundan eski hesaplarda ayrışmış olabilirler.
 *
 * Form hidrasyonu ve submit'teki "değişti mi" karşılaştırması AYNI kaynağı
 * okumak zorunda: farklı okurlarsa isim hiç değişmemişken de her kaydetmede
 * `DisplayName` gönderilir (bu uç foto yüklemeyle ortak rate limit'te).
 */
export const resolveDisplayName = (myProfile: any): string =>
  myProfile?.displayName ??
  myProfile?.user?.displayName ??
  myProfile?.user?.name ??
  "";

export type HydrateProfileFormArgs = {
  myProfile: any;
  hobbyGroups: any[];
  smokingOptions: any[];
  zodiacOptions: any[];
  relationshipIntentOptions: any[];
  languageOptions: any[];
  petOptions: any[];
  alcoholOptions: any[];
  religiousViewOptions: any[];
};

export const hydrateProfileForm = ({
  myProfile,
  hobbyGroups,
  smokingOptions,
  zodiacOptions,
  relationshipIntentOptions,
  languageOptions,
  petOptions,
  alcoholOptions,
  religiousViewOptions,
}: HydrateProfileFormArgs) => {
  const lookupToId: Record<string, number> = {};
  hobbyGroups.forEach((g) => {
    (g?.hobbies || []).forEach((h: any) => {
      if (h?.id == null) return;
      if (h.enumName) lookupToId[h.enumName] = h.id;
      if (h.name) lookupToId[h.name] = h.id;
    });
  });

  const hobbies = (myProfile?.hobbies || [])
    .map((h: any) => {
      if (typeof h === "number") return h;
      if (h && typeof h === "object" && h.id != null) return Number(h.id);
      const n = Number(h);
      if (Number.isFinite(n)) return n;
      return lookupToId[h] ?? null;
    })
    .filter((id: any) => Number.isFinite(id));

  return {
    // Prompt'lar sunucudan gelen SIRAYLA hidrate ediliyor (backend
    // `OrderBy(DisplayOrder)` garantisi) — index kartta çizilme sırası demek,
    // yeniden sıralamak kullanıcının düzenini bozar.
    //
    // Kartın aksine burada `promptDisplay` DEĞİL `promptKey` tutuluyor: gönderim
    // anahtarla yapılıyor, başlık katalogdan çözülüyor.
    prompts: (myProfile?.prompts ?? [])
      .filter((p: any) => !!p?.promptKey)
      .map((p: any) => ({
        promptKey: String(p.promptKey),
        answer: typeof p?.answer === "string" ? p.answer : "",
      })),
    displayName: resolveDisplayName(myProfile),
    // Sınıf: aralık dışı değer (eski backend Range(0,8) ile yazılmış 7/8)
    // null'a düşürülüyor — o değerlerde backend zaten `yearOfStudyDisplay`
    // döndürmüyor, yani sınıf hiçbir yerde görünmüyor. Formda seçili
    // göstermek "kayıtlı ve çalışıyor" yalanı olurdu; boş bırakıp kullanıcıyı
    // geçerli bir değer seçmeye bırakıyoruz.
    yearOfStudy: isValidYearOfStudy(myProfile?.yearOfStudy)
      ? myProfile.yearOfStudy
      : null,
    hobbies,
    smoking: matchOption(
      smokingOptions,
      myProfile?.smokingStatus,
      myProfile?.smokingStatusDisplay,
    ),
    zodiac: matchOption(
      zodiacOptions,
      myProfile?.zodiacSign,
      myProfile?.zodiacSignDisplay,
    ),
    relationshipIntent: matchOption(
      relationshipIntentOptions,
      myProfile?.relationshipIntent,
      myProfile?.relationshipIntentDisplay,
    ),
    // GetMyProfile `alcoholUsage` + `alcoholUsageDisplay` döndürüyor; matchOption
    // ikisini de deniyor (liste henüz gelmemişse null kalır, form boş açılır).
    alcohol: matchOption(
      alcoholOptions,
      myProfile?.alcoholUsage,
      myProfile?.alcoholUsageDisplay,
    ),
    religiousView: matchOption(
      religiousViewOptions,
      myProfile?.religiousView,
      myProfile?.religiousViewDisplay,
    ),
    languages: matchMulti(languageOptions, myProfile?.spokenLanguages),
    pets: matchMulti(petOptions, myProfile?.pets),
    showMyUniversity: myProfile?.showMyUniversity !== false,
    showMeOnApp: myProfile?.showMeOnApp !== false,
    showAge: myProfile?.showAge !== false,
    showPremiumBadge: myProfile?.showPremiumBadge !== false,
    // `!== false` diğer görünürlük bayraklarıyla aynı gerekçe: alan henüz
    // dönmüyorsa (migration uygulanmamış eski backend) switch açık doğar,
    // backend varsayılanıyla (true) hizalı kalır.
    showLocation: myProfile?.showLocation !== false,
  };
};
