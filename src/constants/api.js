// API Base URL
export const API_BASE_URL =
  "https://universitytinder-production.up.railway.app";

// API Endpoints
export const API_ENDPOINTS = {
  // New auth endpoints (email-first registration flow)
  SEND_VERIFICATION: "/api/auth/send-verification",
  VERIFY_EMAIL_REGISTRATION: "/api/auth/verify-email",
  CHECK_REGISTRATION_TOKEN: "/api/auth/check-registration-token",
  REGISTER_AND_COMPLETE: "/api/auth/register-and-complete",

  // User endpoints
  REGISTER: "/api/user/Register",
  LOGIN: "/api/user/Login",
  VERIFY_EMAIL: "/api/user/verifyemailwithcode",
  VERIFY_EMAIL_CODE: "/api/user/verifyemailwithcode",
  RESEND_VERIFICATION: "/api/user/resendverificationcode",
  GET_USER: "/api/user/GetUser",
  UPDATE_USER: "/api/user/UpdateUser",
  CHANGE_PASSWORD: "/api/user/ChangePassword",
  FORGOT_PASSWORD: "/api/user/ForgotPassword",
  RESET_PASSWORD: "/api/user/ResetPasswordWithCode",
  DELETE_USER: "/api/user/DeleteUser",
  DELETE_ACCOUNT: "/api/user/DeleteUser",
  VALIDATE_TOKEN: "/api/user/validate-token",
  REFRESH_TOKEN: "/api/user/refresh-token",
  REVOKE_TOKEN: "/api/user/revoke-token",

  // Profile endpoints
  COMPLETE_PROFILE: "/api/profile/CompleteProfile",
  UPDATE_PROFILE: "/api/profile/UpdateProfile",
  GET_MY_PROFILE: "/api/profile/GetMyProfile",
  GET_MY_PHOTOS: "/api/profile/GetMyPhotos",
  UPDATE_PREFERENCES: "/api/profile/update-preferences",

  // Photo endpoints
  GET_PHOTO: "/api/photo/GetPhoto",

  // Swipe endpoints
  GET_POTENTIAL_MATCHES: "/api/swipe/GetPotentialMatches",
  SWIPE_LIKE: "/api/swipe/Like",
  SWIPE_PASS: "/api/swipe/Pass",
  SWIPE_SUPER_LIKE: "/api/swipe/SuperLike",
  SWIPE_STATS: "/api/swipe/Stats",
  SWIPE_MATCHES: "/api/swipe/GetMatches",
  WHO_LIKED_ME: "/api/swipe/wholikedme",
  SWIPE_UNDO: "/api/swipe/Undo",
  SWIPE_FILTERS: "/api/swipe/Filters",
  SWIPE_UPDATE_FILTERS: "/api/swipe/UpdateFilters",

  // Privacy / KVKK endpoints
  PRIVACY_DELETE_ACCOUNT: "/api/privacy/delete-account",
  PRIVACY_CANCEL_DELETION: "/api/privacy/cancel-deletion",
  PRIVACY_DELETION_STATUS: "/api/privacy/deletion-status",
  PRIVACY_MY_DATA: "/api/privacy/my-data",
  PRIVACY_ACCEPT_CONSENT: "/api/privacy/accept-consent",

  // Subscription
  SUBSCRIPTION_STATUS: "/api/subscription/status",

  // Common endpoints (Enums)
  GET_GENDERS: "/api/common/genders",
  GET_CITIES: "/api/common/cities",
  GET_DISTRICTS: "/api/common/cities", // Base path, cityId will be appended
  GET_CLASSES: "/api/common/classes",
  GET_DEPARTMENTS: "/api/common/departments",
  GET_HOBBIES: "/api/common/hobbies",
  GET_SMOKING_STATUSES: "/api/common/smoking-statuses",
  GET_ZODIACS: "/api/common/zodiacs",
  GET_USAGE_PURPOSES: "/api/common/usage-purposes",
};
