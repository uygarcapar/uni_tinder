import {
  parsePasswordError,
  passwordErrorMessage,
} from "@/features/auth/passwordErrors";

/** Backend'in ResponseDto hata zarfı. */
const responseDto = (status: number, code: string | null, message = "sunucu metni") => ({
  response: { status, data: { result: null, isSuccess: false, message, code } },
});

describe("parsePasswordError", () => {
  it("UT-1003'ü mevcut şifre alanına bağlar ve kodu korur", () => {
    const failure = parsePasswordError(responseDto(400, "UT-1003"));
    expect(failure.field).toBe("currentPassword");
    expect(failure.keepCode).toBe(true);
    expect(failure.codeBurned).toBe(false);
  });

  // UT-1010/1011 ancak KOD DOĞRUYKEN dönebiliyor (backend önce kodu doğruluyor),
  // yani kod alanı temizlenirse kullanıcı çalışan bir kodu boşuna kaybeder.
  it.each(["UT-1010", "UT-1011"])("%s yeni şifreyi işaret eder, kod yanmaz", (code) => {
    const failure = parsePasswordError(responseDto(400, code));
    expect(failure.field).toBe("newPassword");
    expect(failure.keepCode).toBe(true);
    expect(failure.codeBurned).toBe(false);
    expect(failure.codeAttemptSpent).toBe(false);
  });

  it("UT-1006 bir deneme hakkı yakar ama kod hâlâ denenebilir", () => {
    const failure = parsePasswordError(responseDto(400, "UT-1006"));
    expect(failure.field).toBe("code");
    expect(failure.codeAttemptSpent).toBe(true);
    expect(failure.codeBurned).toBe(false);
    expect(failure.keepCode).toBe(false);
  });

  it("UT-1012'de kod tamamen yanar", () => {
    const failure = parsePasswordError(responseDto(400, "UT-1012"));
    expect(failure.codeBurned).toBe(true);
    expect(failure.codeAttemptSpent).toBe(false);
  });

  // 401 gövdesi BOŞ gelir (JWT middleware controller'a hiç girmez) — `code`
  // okumaya çalışmak undefined döner, ayrım yalnız HTTP status'ünden yapılabilir.
  it("401'i boş gövdeye rağmen oturum kaybı sayar", () => {
    const failure = parsePasswordError({ response: { status: 401, data: "" } });
    expect(failure.sessionLost).toBe(true);
    expect(failure.code).toBeNull();
  });

  // Yaptırım gövdesi ResponseDto DEĞİL: `code` yerine `errorCode` taşıyor.
  it("403 + errorCode'u yaptırım olarak ayırır", () => {
    const failure = parsePasswordError({
      response: {
        status: 403,
        data: { isSuccess: false, errorCode: "UT-1007", reason: "banned", message: "kapatıldı" },
      },
    });
    expect(failure.accountBlocked).toBe(true);
  });

  it("403 + code:null'u yaptırım saymaz (e-posta doğrulanmamış)", () => {
    const failure = parsePasswordError(responseDto(403, null, "önce e-postanı doğrula"));
    expect(failure.accountBlocked).toBe(false);
    expect(failure.serverMessage).toBe("önce e-postanı doğrula");
  });

  it("429 gövdesindeki retryAfterSeconds'ı okur", () => {
    const failure = parsePasswordError({
      response: {
        status: 429,
        data: { errorCode: "RATE_LIMIT_EXCEEDED", retryAfterSeconds: 42, message: "çok istek" },
      },
    });
    expect(failure.retryAfterSeconds).toBe(42);
  });

  it("429 gövdesi süre taşımıyorsa Retry-After header'ına düşer", () => {
    const failure = parsePasswordError({
      response: { status: 429, data: {}, headers: { "retry-after": "15" } },
    });
    expect(failure.retryAfterSeconds).toBe(15);
  });

  it("bilinmeyen kodda backend metnini taşır", () => {
    const failure = parsePasswordError(responseDto(400, "UT-9999", "beklenmedik"));
    expect(failure.field).toBeNull();
    expect(failure.serverMessage).toBe("beklenmedik");
  });
});

describe("passwordErrorMessage", () => {
  const t = ((key: string, options?: Record<string, unknown>) =>
    options ? `${key}:${JSON.stringify(options)}` : key) as any;

  it("bilinen kodu i18n anahtarına çevirir (backend yalnız Türkçe yazıyor)", () => {
    expect(passwordErrorMessage(parsePasswordError(responseDto(400, "UT-1003")), t)).toBe(
      "auth.password.errors.currentPasswordWrong",
    );
  });

  it("rate limit mesajına saniyeyi geçirir", () => {
    const failure = parsePasswordError({
      response: { status: 429, data: { retryAfterSeconds: 30 } },
    });
    expect(passwordErrorMessage(failure, t)).toBe(
      'auth.password.errors.rateLimited:{"seconds":30}',
    );
  });

  it("bilinmeyen kodda backend metnini gösterir", () => {
    const failure = parsePasswordError(responseDto(400, "UT-9999", "beklenmedik"));
    expect(passwordErrorMessage(failure, t)).toBe("beklenmedik");
  });

  it("metin de yoksa jenerik satıra düşer", () => {
    const failure = parsePasswordError({ response: { status: 400, data: {} } });
    expect(passwordErrorMessage(failure, t)).toBe("auth.password.errors.generic");
  });
});
