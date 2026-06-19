import { z } from "zod";

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

export const passwordSchema = z
  .object({
    password: z
      .string()
      .min(8, "Şifreniz en az 8 karakter olmalıdır.")
      .regex(/[A-Z]/, "Şifreniz en az 1 büyük harf içermelidir.")
      .regex(/[0-9]/, "Şifreniz en az 1 rakam (0-9) içermelidir.")
      .regex(
        /[!@#$%^&*(),.?":{}|<>]/,
        'Şifreniz en az 1 özel karakter içermelidir.',
      ),
    confirmPassword: z.string().min(1, "Lütfen tüm şifre alanlarını doldurun."),
  })
  .refine((d) => d.password === d.confirmPassword, {
    message: "Girdiğiniz şifreler birbiriyle eşleşmiyor.",
    path: ["confirmPassword"],
  });

export const phoneSchema = z.object({
  phone: z.string().length(10, "Lütfen geçerli bir telefon numarası gir."),
});

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

export const locationSchema = z.object({
  city: z.string().optional(),
  district: z.string().optional(),
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

export const lifestyleSchema = z.object({
  smokingStatus: z.string().optional(),
  zodiacSign: z.string().optional(),
  usagePurpose: z.string().optional(),
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

export type LoginForm = z.infer<typeof loginSchema>;
export type EmailForm = z.infer<typeof emailSchema>;
export type PasswordForm = z.infer<typeof passwordSchema>;
export type PhoneForm = z.infer<typeof phoneSchema>;
export type FirstNameForm = z.infer<typeof firstNameSchema>;
export type DobForm = z.infer<typeof dobSchema>;
export type GenderForm = z.infer<typeof genderSchema>;
export type EducationForm = z.infer<typeof educationSchema>;
export type LocationForm = z.infer<typeof locationSchema>;
export type InterestedInForm = z.infer<typeof interestedInSchema>;
export type HeightForm = z.infer<typeof heightSchema>;
export type HobbiesForm = z.infer<typeof hobbiesSchema>;
export type LifestyleForm = z.infer<typeof lifestyleSchema>;
export type PhotosForm = z.infer<typeof photosSchema>;
export type ReportForm = z.infer<typeof reportSchema>;

export const editProfileFormSchema = z.object({
  bio: z.string().max(500, "Biyografi en fazla 500 karakter olabilir"),
  hobbies: z.array(z.number()),
  smoking: z.any().nullable(),
  zodiac: z.any().nullable(),
  usagePurpose: z.any().nullable(),
  interestedIn: z.array(z.any()).min(1, "En az bir ilgi alanı seçmelisin."),
  city: z.any().nullable(),
  district: z.any().nullable(),
  languages: z.array(z.any()),
  pets: z.array(z.any()),
  showMyUniversity: z.boolean(),
  showMeOnApp: z.boolean(),
  showAge: z.boolean(),
});
export type EditProfileFormData = z.infer<typeof editProfileFormSchema>;
