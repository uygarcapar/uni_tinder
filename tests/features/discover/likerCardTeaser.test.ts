import {
  relationshipIntentLabel,
  resolveTeaserHobby,
} from "@/features/discover/likerCardTeaser";

// Sahte t: kısa harita + ek. `defaultValue` verilen ve haritada olmayan
// anahtar boş döner (gerçek i18next davranışı).
const SHORT: Record<string, string> = {
  LongTerm: "Uzun süreli",
  ShortTerm: "Kısa süreli",
  StillFiguringOut: "Henüz karar vermedim",
};
const t = ((key: string, opts?: { defaultValue?: string }) => {
  if (key === "profile.card.intentSuffix") return "ilişki";
  const m = key.match(/^discover\.filters\.relationshipIntents\.short\.(.+)$/);
  if (m) return SHORT[m[1]] ?? opts?.defaultValue ?? key;
  return key;
}) as any;

describe("resolveTeaserHobby", () => {
  it("ilk dolu hobiyi enumName + etiketle döner", () => {
    expect(
      resolveTeaserHobby([
        { enumName: "Dogs", name: "Köpekler" },
        { enumName: "Gym", name: "Spor" },
      ]),
    ).toEqual({ enumName: "Dogs", label: "Köpekler" });
  });

  it("düz string hobiyi de kabul eder", () => {
    expect(resolveTeaserHobby(["Yoga"])).toEqual({
      enumName: undefined,
      label: "Yoga",
    });
  });

  it("boş girdileri atlar, hiç yoksa null", () => {
    expect(resolveTeaserHobby([{ name: "  " }, { enumName: "Cats" }])).toEqual({
      enumName: "Cats",
      label: "Cats",
    });
    expect(resolveTeaserHobby([])).toBeNull();
    expect(resolveTeaserHobby(null)).toBeNull();
    expect(resolveTeaserHobby(undefined)).toBeNull();
  });
});

describe("relationshipIntentLabel", () => {
  it("süre bildiren niyete ek takar", () => {
    expect(relationshipIntentLabel(t, "LongTerm", null)).toBe(
      "Uzun süreli ilişki",
    );
  });

  it("cümle niyetine ek takmaz", () => {
    expect(relationshipIntentLabel(t, "StillFiguringOut", null)).toBe(
      "Henüz karar vermedim",
    );
  });

  it("yerel harita yoksa display'e düşer, kelime içerideyse ek atlanır", () => {
    expect(
      relationshipIntentLabel(t, "LongTermOpenToShort", "Long term relationship"),
    ).toBe("Long term relationship");
    expect(
      relationshipIntentLabel(t, "LongTermOpenToShort", "Uzun süreli, kısaya açık"),
    ).toBe("Uzun süreli, kısaya açık ilişki");
  });

  it("bilinmeyen enum eksiz, hiçbir şey yoksa boş", () => {
    expect(relationshipIntentLabel(t, "Marriage", "Evlilik")).toBe("Evlilik");
    expect(relationshipIntentLabel(t, null, null)).toBe("");
    expect(relationshipIntentLabel(t, undefined, "")).toBe("");
  });
});
