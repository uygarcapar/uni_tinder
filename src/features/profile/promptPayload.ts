import { MAX_PROFILE_PROMPTS, normalizePromptAnswer } from "@/shared/constants/limits";
import type { ProfilePromptAnswer } from "@/shared/types";

/**
 * Prompt listesini multipart gövdesine yazar.
 *
 * ŞEKİL — indeksli anahtar (backend K3 onayı, `PhotoOrders` ile aynı desen):
 *   Prompts[0].PromptKey = MostEnjoyInLife
 *   Prompts[0].Answer    = ...
 *
 * `Hobbies` gibi tekrar eden anahtar KULLANILAMAZ: hangi cevabın hangi soruya
 * ait olduğu kaybolur.
 *
 * ⚠️ İNDEKSLER 0'DAN BAŞLAR VE BOŞLUKSUZ OLMAK ZORUNDA. ASP.NET model binder
 * ilk boşlukta durur ve sunucu sessizce daha az eleman görür — kullanıcı üç
 * cevap yazdığını sanarken ikisi kaydedilir. Bu yüzden boş slotlar burada
 * eleniyor ve dizi yeniden indeksleniyor.
 *
 * ⚠️ SEMANTİK — bu alan gönderildiği anda TAM LİSTE demek: sunucu mevcut
 * satırları silip geleni yazıyor (replace). Kısmi güncelleme YOK. Dokunmak
 * istemiyorsan hiç çağırma.
 *
 * Boş liste multipart'ta temsil EDİLEMİYOR ("gönderilmedi"den ayırt edilemiyor),
 * yani hepsini silme isteği sunucuda sessizce no-op olur. Çağıran taraf son
 * prompt'un silinmesini engellemek zorunda — bkz. EditProfileForm.
 */
export const appendPrompts = (
  formData: FormData,
  prompts: readonly ProfilePromptAnswer[] | null | undefined,
): void => {
  const cleaned = sanitizePrompts(prompts);
  cleaned.forEach((prompt, index) => {
    formData.append(`Prompts[${index}].PromptKey`, prompt.promptKey);
    formData.append(`Prompts[${index}].Answer`, prompt.answer);
  });
};

/**
 * Gönderilebilir hâle getirir: boş slotlar elenir, cevaplar sunucudaki
 * `NormalizeWhitespace` ile aynı şekilde sadeleştirilir, tekrar eden anahtarın
 * İLKİ tutulur (backend `UT-2203` ile reddederdi) ve tavan uygulanır.
 */
export const sanitizePrompts = (
  prompts: readonly ProfilePromptAnswer[] | null | undefined,
): ProfilePromptAnswer[] => {
  const seen = new Set<string>();
  const out: ProfilePromptAnswer[] = [];

  for (const prompt of prompts ?? []) {
    const promptKey = prompt?.promptKey?.trim();
    const answer = normalizePromptAnswer(prompt?.answer ?? "");
    if (!promptKey || !answer) continue;
    if (seen.has(promptKey)) continue;
    seen.add(promptKey);
    out.push({ promptKey, answer });
    if (out.length === MAX_PROFILE_PROMPTS) break;
  }

  return out;
};
