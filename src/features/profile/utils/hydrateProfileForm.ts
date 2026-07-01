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

export type HydrateProfileFormArgs = {
  myProfile: any;
  hobbyGroups: any[];
  smokingOptions: any[];
  zodiacOptions: any[];
  usagePurposeOptions: any[];
  interestedInOptions: any[];
  cityOptions: any[];
  languageOptions: any[];
  petOptions: any[];
};

export const hydrateProfileForm = ({
  myProfile,
  hobbyGroups,
  smokingOptions,
  zodiacOptions,
  usagePurposeOptions,
  interestedInOptions,
  cityOptions,
  languageOptions,
  petOptions,
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
    bio: myProfile?.bio || "",
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
    usagePurpose: matchOption(
      usagePurposeOptions,
      myProfile?.usagePurpose,
      myProfile?.usagePurposeDisplay,
    ),
    interestedIn: matchMulti(interestedInOptions, myProfile?.interestedIn),
    city: matchOption(cityOptions, myProfile?.city, myProfile?.cityDisplay),
    district: null,
    languages: matchMulti(languageOptions, myProfile?.spokenLanguages),
    pets: matchMulti(petOptions, myProfile?.pets),
    showMyUniversity: myProfile?.showMyUniversity !== false,
    showMeOnApp: myProfile?.showMeOnApp !== false,
    showAge: myProfile?.showAge !== false,
  };
};
