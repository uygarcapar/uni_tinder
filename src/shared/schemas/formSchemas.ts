import { z } from "zod";
import {
  DISPLAY_NAME_MAX_LENGTH,
  MAX_PROFILE_PROMPTS,
  MIN_PROFILE_PROMPTS,
  PROMPT_ANSWER_MAX_LENGTH,
  YEAR_OF_STUDY_RANGE,
  countPromptAnswer,
  normalizePromptAnswer,
} from "@/shared/constants/limits";
import { noteLength } from "@/features/discover/noteTarget";

const calculateAge = (day: number, month: number, year: number) => {
  const today = new Date();
  const birth = new Date(year, month - 1, day);
  let age = today.getFullYear() - birth.getFullYear();
  const m = today.getMonth() - birth.getMonth();
  if (m < 0 || (m === 0 && today.getDate() < birth.getDate())) age--;
  return age;
};

export const loginSchema = z.object({
  email: z.string().min(1, "Lütfen tüm alanları doldurun"),
  password: z.string().min(1, "Lütfen tüm alanları doldurun"),
});

export const emailSchema = z.object({
  email: z.string().min(1, "Lütfen üniversite email adresinizi girin"),
});

/**
 * Şifre politikası — TEK KAYNAK.
 *
 * Hem `passwordSchema` hem de şifre ekranlarındaki canlı kural listesi buradan
 * besleniyor; ayrı tanımlanırlarsa checklist yeşilken form hata verir.
 *
 * Backend (ASP.NET Identity) minimum 6 karakter istiyor, uygulama 8'de kalıyor —
 * kayıt akışının mevcut kuralı, backend'den katı olması sorun değil. Küçük harf
 * şartı ise BACKEND'den geliyor (RequireLowercase): burada denenmezse "ABC123!"
 * gibi bir şifre client'ı geçip sunucudan UT-1010 ile geri döner.
 */
export const PASSWORD_RULES = [
  {
    key: "length",
    test: (p: string) => p.length >= 8,
    message: "Şifreniz en az 8 karakter olmalıdır.",
  },
  {
    key: "uppercase",
    test: (p: string) => /[A-Z]/.test(p),
    message: "Şifreniz en az 1 büyük harf içermelidir.",
  },
  {
    key: "lowercase",
    test: (p: string) => /[a-z]/.test(p),
    message: "Şifreniz en az 1 küçük harf içermelidir.",
  },
  {
    key: "digit",
    test: (p: string) => /[0-9]/.test(p),
    message: "Şifreniz en az 1 rakam (0-9) içermelidir.",
  },
  {
    key: "special",
    test: (p: string) => /[!@#$%^&*(),.?":{}|<>]/.test(p),
    message: "Şifreniz en az 1 özel karakter içermelidir.",
  },
] as const;

export type PasswordRuleKey = (typeof PASSWORD_RULES)[number]["key"];

/** Sağlanmayan kuralların anahtarları — canlı checklist için. */
export const unmetPasswordRules = (password: string): PasswordRuleKey[] =>
  PASSWORD_RULES.filter((rule) => !rule.test(password)).map((rule) => rule.key);

export const passwordSchema = z
  .object({
    password: z.string().superRefine((value, ctx) => {
      for (const rule of PASSWORD_RULES) {
        if (!rule.test(value)) {
          ctx.addIssue({ code: "custom", message: rule.message });
        }
      }
    }),
    confirmPassword: z.string().min(1, "Lütfen tüm şifre alanlarını doldurun."),
  })
  .refine((d) => d.password === d.confirmPassword, {
    message: "Girdiğiniz şifreler birbiriyle eşleşmiyor.",
    path: ["confirmPassword"],
  });

/**
 * Ayarlardaki şifre/e-posta değiştirme akışlarının doğrulama metinleri i18n'den
 * geliyor, dosyanın geri kalanındaki sabit Türkçe metinlerin aksine — bu iki
 * ekranın mesajları zaten `auth.*` altında çevrili ve İngilizce arayüzde de
 * doğru görünmeleri gerekiyor. Bu yüzden şema değil ŞEMA FABRİKASI (noteSchema
 * ile aynı gerekçe: kural sabit, metin çağrı anında belli).
 */
type Translate = (key: string, options?: Record<string, unknown>) => string;

/** Mevcut şifre — kimlik kanıtı olarak istendiği her yerde aynı kural. */
export const currentPasswordSchema = (t: Translate) =>
  z.object({
    currentPassword: z
      .string()
      .min(1, t("auth.password.change.validation.currentRequired")),
  });

/**
 * E-posta değiştirme 1. adımı. `currentEmail` verilirse aynı adresi baştan
 * eler: backend de UT-1018 ile reddediyor ama uç dakikada 5 istek kabul
 * ediyor, boşuna kota harcamayalım.
 */
export const changeEmailSchema = (t: Translate, currentEmail?: string) =>
  z.object({
    currentPassword: z
      .string()
      .min(1, t("auth.password.change.validation.currentRequired")),
    // trim + toLowerCase BURADA: gönderilen değer şemadan çıkan değer olsun,
    // ekran ayrıca normalize etmesin. Form state'i kullanıcının yazdığı gibi
    // kalır, `handleSubmit` normalize edilmişini verir.
    newEmail: z
      .string()
      .trim()
      .toLowerCase()
      .min(1, t("auth.email.change.validation.emailRequired"))
      // Şekil kontrolü yalnızca "@ var mı" seviyesinde: domain'in DESTEKLENEN
      // bir üniversiteye ait olup olmadığına backend karar veriyor (UT-1019) ve
      // kayıt defteri orada. Burada tahmin yürütmek, listeye yeni üniversite
      // eklendiğinde istemciyi yanlış yere reddeden konuma sokardı.
      .regex(
        /^[^\s@]+@[^\s@]+\.[^\s@]+$/,
        t("auth.email.change.validation.emailInvalid"),
      )
      .refine(
        (v) => !currentEmail || v !== currentEmail.trim().toLowerCase(),
        t("auth.email.errors.sameAsCurrent"),
      ),
  });

export type CurrentPasswordForm = z.infer<ReturnType<typeof currentPasswordSchema>>;
export type ChangeEmailForm = z.infer<ReturnType<typeof changeEmailSchema>>;

export const firstNameSchema = z.object({
  firstName: z.string().min(1, "Lütfen işaretli tüm alanları doldur."),
});

export const dobSchema = z
  .object({
    day: z.string().min(1),
    month: z.string().min(1),
    year: z.string().min(1),
  })
  .superRefine((data, ctx) => {
    const d = parseInt(data.day);
    const mo = parseInt(data.month);
    const y = parseInt(data.year);

    const dayInvalid =
      !data.day || data.day.length < 2 || isNaN(d) || d < 1 || d > 31;
    const monthInvalid =
      !data.month || data.month.length < 2 || isNaN(mo) || mo < 1 || mo > 12;
    const yearInvalid =
      !data.year ||
      data.year.length < 4 ||
      isNaN(y) ||
      y < 1900 ||
      y > new Date().getFullYear();

    if (dayInvalid)
      ctx.addIssue({ code: "custom", message: "Geçerli bir doğum tarihi gir.", path: ["day"] });
    if (monthInvalid)
      ctx.addIssue({ code: "custom", message: "Geçerli bir doğum tarihi gir.", path: ["month"] });
    if (yearInvalid)
      ctx.addIssue({ code: "custom", message: "Geçerli bir doğum tarihi gir.", path: ["year"] });

    if (!dayInvalid && !monthInvalid && !yearInvalid) {
      const age = calculateAge(d, mo, y);
      if (age < 18) {
        const msg = "Uygulamayı kullanabilmek için 18 yaşından büyük olmalısın.";
        ctx.addIssue({ code: "custom", message: msg, path: ["day"] });
        ctx.addIssue({ code: "custom", message: msg, path: ["month"] });
        ctx.addIssue({ code: "custom", message: msg, path: ["year"] });
      }
    }
  });

export const genderSchema = z.object({
  gender: z.string().min(1, "Lütfen bir seçenek seç."),
});

export const educationSchema = z.object({
  department: z.string().min(1, "Lütfen sınıf ve bölüm alanlarını doldurun"),
  yearOfStudy: z.string().min(1, "Lütfen sınıf ve bölüm alanlarını doldurun"),
});

export const interestedInSchema = z.object({
  interestedIn: z
    .array(z.string())
    .min(1, "En az bir seçenek seçmelisin."),
});

export const heightSchema = z.object({
  height: z
    .number()
    .min(140, "Boy 140-220 cm arasında olmalıdır")
    .max(220, "Boy 140-220 cm arasında olmalıdır"),
});

export const hobbiesSchema = z.object({
  hobbies: z
    .array(z.string())
    .min(1, "Lütfen en az bir hobi seçin")
    .max(10),
});

/**
 * Tek bir prompt slotu. Boş slot form state'inde `promptKey: ""` olarak duruyor
 * (kullanıcı henüz soru seçmedi) — gönderimden önce eleniyor, bu yüzden şema
 * yalnızca DOLU slotları görüyor.
 */
const promptAnswerSchema = z.object({
  promptKey: z.string().min(1),
  // ⚠️ `.transform()` KULLANILMIYOR (normalize edip öyle doğrulamak cazip ama):
  // transform ZodEffects üretiyor ve giriş/çıkış tipleri ayrıştığı için
  // react-hook-form alanı `answer?: string` olarak görüyor — form state'i o
  // noktadan sonra ProfilePromptAnswer'a atanamıyor. Normalizasyon gönderim
  // anında (`sanitizePrompts`) yapılıyor, doğrulama burada aynı metni HESAPLAYIP
  // bakıyor. İkisi de `normalizePromptAnswer` üzerinden geçtiği için sonuç aynı.
  answer: z
    .string()
    .refine((v) => normalizePromptAnswer(v).length > 0, "Cevabını yazmayı unutma")
    // Uzunluk CODE POINT ile sayılıyor (backend `EnumerateRunes`). `.max()`
    // kullanılamaz: zod UTF-16 sayar ve emojili cevapta sunucudan farklı sonuç
    // verir. Sınır katalogda prompt başına geliyor; buradaki tavan yalnızca
    // varsayılan — daha uzun maxLength'li bir prompt eklenirse burası da açılmalı.
    .refine(
      (v) => countPromptAnswer(normalizePromptAnswer(v)) <= PROMPT_ANSWER_MAX_LENGTH,
      `Cevabın en fazla ${PROMPT_ANSWER_MAX_LENGTH} karakter olabilir`,
    ),
});

/**
 * Prompt listesi — hem kayıt adımı hem profil düzenleme aynı kuralları kullanıyor.
 * Aynı prompt iki kez seçilemez (backend `UT-2203`); tekrar kontrolü burada da
 * var ki kullanıcı isteği göndermeden uyarılsın.
 */
const promptListSchema = z
  .array(promptAnswerSchema)
  .max(MAX_PROFILE_PROMPTS)
  .superRefine((list, ctx) => {
    const seen = new Set<string>();
    list.forEach((item, index) => {
      if (seen.has(item.promptKey)) {
        ctx.addIssue({
          code: z.ZodIssueCode.custom,
          // Çakışmada SONRAKİ index işaretleniyor — kullanıcının önce yazdığı
          // cevap dursun. Backend'den de aynı kural istendi.
          path: [index, "promptKey"],
          message: "Bu soruyu zaten seçtin",
        });
      }
      seen.add(item.promptKey);
    });
  });

/** Kayıt adımı: en az 1 zorunlu. */
export const promptsSchema = z.object({
  prompts: promptListSchema.refine(
    (list) => list.length >= MIN_PROFILE_PROMPTS,
    `En az ${MIN_PROFILE_PROMPTS} soru cevaplamalısın`,
  ),
});

// RegisterStep14 — YALNIZ ilişki niyeti. Sigara ve burç bu adımdan çıkıp
// step16'ya taşındı (adım tek soruya indi, diğer üçü "alışkanlıklar/inanç"
// ekranında toplandı).
//
// Alan ZORUNLU: adım artık atlanamıyor. Ekran doğrulamayı "Devam"da imperative
// koşuyor (resolver submit yolunda kullanılmıyor), kural burada da yazılı dursun.
export const lifestyleSchema = z.object({
  relationshipIntent: z.string().min(1),
});

// RegisterStep16 (sigara + alkol + burç + dini görüş). lifestyleSchema'dan
// ayrı: alanların hepsi tamamen opsiyonel ve adım atlanabilir, Step14'ün
// alanıyla birlikte doğrulanmalarını gerektiren bir kural yok.
export const beliefsSchema = z.object({
  smokingStatus: z.string().optional(),
  alcoholUsage: z.string().optional(),
  zodiacSign: z.string().optional(),
  religiousView: z.string().optional(),
});

export const photosSchema = z.object({
  photos: z
    .array(z.string())
    .min(2, "Lütfen en az 2 fotoğraf yükleyin")
    .max(6),
});

export const reportSchema = z.object({
  reason: z.string().min(1, "Lütfen bir şikayet sebebi seçin"),
  description: z.string().max(1000).optional(),
});

/**
 * Not composer'ı (yorumlu beğeni). Tavan SUNUCUDAN geldiği için sabit değil
 * fabrika: `Stats.noteMaxLength` değişince şema da değişmeli.
 *
 * `.max()` KULLANILMIYOR — o UTF-16 birimi sayar, sunucu code point sayar;
 * emoji'li bir not sınırın yarısında reddedilirdi (bkz. noteLength).
 * Composer zaten yazarken `clampNoteText` ile kırpıyor, buradaki tavan kontrolü
 * o kırpma atlanırsa diye ikinci hat.
 */
export const noteSchema = (limit: number) =>
  z.object({
    comment: z
      .string()
      .refine((v) => v.trim().length > 0, "Notun boş olamaz")
      .refine((v) => noteLength(v) <= limit, `En fazla ${limit} karakter`),
  });

export type LoginForm = z.infer<typeof loginSchema>;
export type EmailForm = z.infer<typeof emailSchema>;
export type PasswordForm = z.infer<typeof passwordSchema>;
export type FirstNameForm = z.infer<typeof firstNameSchema>;
export type DobForm = z.infer<typeof dobSchema>;
export type GenderForm = z.infer<typeof genderSchema>;
export type EducationForm = z.infer<typeof educationSchema>;
export type InterestedInForm = z.infer<typeof interestedInSchema>;
export type HeightForm = z.infer<typeof heightSchema>;
export type HobbiesForm = z.infer<typeof hobbiesSchema>;
export type LifestyleForm = z.infer<typeof lifestyleSchema>;
export type BeliefsForm = z.infer<typeof beliefsSchema>;
export type PhotosForm = z.infer<typeof photosSchema>;
export type ReportForm = z.infer<typeof reportSchema>;
export type PromptsForm = z.infer<typeof promptsSchema>;

export const editProfileFormSchema = z.object({
  /**
   * Prompt cevapları — bio'nun yerini aldı.
   *
   * Burada MIN YOK, kayıt adımından farkı bu: migration'dan gelen kullanıcıların
   * 0 prompt'u var ve yalnızca boyunu değiştirmek için formu açtıklarında hata
   * almamalılar (backend de aynı sebeple global invariant kurmuyor).
   *
   * "Son prompt'u silme" engeli formda: `Prompts` boş gönderilemediği için
   * (multipart'ta boş liste "gönderilmedi"den ayırt edilemiyor) hepsini silen
   * istek sunucuda sessizce no-op olur — kullanıcı sildiğini sanır.
   */
  prompts: promptListSchema,
  // İsim — backend `DisplayName`. Tavan neden 100 değil 50: bkz.
  // DISPLAY_NAME_MAX_LENGTH (gönderilen değer Identity'deki FirstName'e de
  // yazılıyor ve o kolon nvarchar(50)).
  //
  // Boş/whitespace backend'de "değiştirme" demek, "temizle" DEĞİL — yani boş
  // gönderilen isim sessizce yutulur ve kullanıcı adını sildiğini sanır.
  // O yüzden burada boş isim geçersiz.
  displayName: z
    .string()
    .trim()
    .min(1, "Lütfen ismini gir")
    .max(
      DISPLAY_NAME_MAX_LENGTH,
      `İsim en fazla ${DISPLAY_NAME_MAX_LENGTH} karakter olabilir`,
    ),
  // Sınıf — ClassYearType ordinali (0 = Hazırlık ... 6). null = "seçilmedi";
  // 0 ile karıştırılmamalı. Backend'in "temizle" yolu YOK (ClearYearOfStudy
  // diye bir alan tanımlı değil), bu yüzden bir kez seçildikten sonra yalnızca
  // başka bir değere çekilebilir.
  yearOfStudy: z
    .number()
    .int()
    .min(YEAR_OF_STUDY_RANGE.min)
    .max(YEAR_OF_STUDY_RANGE.max)
    .nullable(),
  hobbies: z.array(z.number()),
  smoking: z.any().nullable(),
  zodiac: z.any().nullable(),
  relationshipIntent: z.any().nullable(),
  // Alkol ve dini görüş — diğer tek-seçim enum alanlarıyla aynı sınıf:
  // null = seçim yok, submit'te ClearXxx=true gider (değer null göndermek
  // backend'de "değiştirme" demek, temizlemez).
  alcohol: z.any().nullable(),
  religiousView: z.any().nullable(),
  // city/district YOK: konum artık düzenlenebilir bir alan değil, backend
  // koordinattan türetiyor (bkz. POST /api/profile/location).
  languages: z.array(z.any()),
  pets: z.array(z.any()),
  showMyUniversity: z.boolean(),
  showMeOnApp: z.boolean(),
  showAge: z.boolean(),
  // Şehir/ilçe görünürlüğü — opt-out: backend varsayılanı true. Kapalıyken
  // KARTTA şehir/ilçe (ve harita) gizlenir; keşifte çıkmaya, mesafe ve şehir
  // filtrelerine takılmaya, konum heartbeat'i göndermeye devam eder.
  // Mesafe ayrı bir bayrak (`showDistance`) — ikisi bağımsız.
  showLocation: z.boolean(),
  // Premium rozeti — opt-out: backend varsayılanı true, kapatınca yalnızca
  // ROZET gizlenir (kotalar/filtreler/sıralama avantajı aynen sürer).
  showPremiumBadge: z.boolean(),
});
export type EditProfileFormData = z.infer<typeof editProfileFormSchema>;
