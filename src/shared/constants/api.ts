const envBaseUrl = process.env.EXPO_PUBLIC_API_BASE_URL;

if (!envBaseUrl) {
  throw new Error(
    "EXPO_PUBLIC_API_BASE_URL is not set. Add it to your .env file."
  );
}

export const API_BASE_URL = envBaseUrl.replace(/\/+$/, "");

export const HUB_URL = `${API_BASE_URL}/hubs/match`;

export const API_ENDPOINTS = {
  SEND_VERIFICATION: "/api/auth/send-verification",
  VERIFY_EMAIL_REGISTRATION: "/api/auth/verify-email",
  CHECK_REGISTRATION_TOKEN: "/api/auth/check-registration-token",
  REGISTER_AND_COMPLETE: "/api/auth/register-and-complete",

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

  COMPLETE_PROFILE: "/api/profile/CompleteProfile",
  UPDATE_PROFILE: "/api/profile/UpdateProfile",
  GET_MY_PROFILE: "/api/profile/GetMyProfile",
  GET_MY_PHOTOS: "/api/profile/GetMyPhotos",
  UPDATE_PREFERENCES: "/api/profile/update-preferences",

  GET_PHOTO: "/api/photo/GetPhoto",

  GET_POTENTIAL_MATCHES: "/api/swipe/GetPotentialMatches",
  SWIPE_LIKE: "/api/swipe/Like",
  SWIPE_PASS: "/api/swipe/Pass",
  SWIPE_SUPER_LIKE: "/api/swipe/SuperLike",
  SWIPE_STATS: "/api/swipe/Stats",
  SWIPE_MATCHES: "/api/swipe/GetMatches",
  WHO_LIKED_ME: "/api/swipe/wholikedme",
  LIKER_PROFILE: "/api/swipe/LikerProfile",
  SWIPE_UNDO: "/api/swipe/Undo",
  SWIPE_FILTERS: "/api/swipe/Filters",
  SWIPE_UPDATE_FILTERS: "/api/swipe/UpdateFilters",

  PRIVACY_DELETE_ACCOUNT: "/api/privacy/delete-account",
  PRIVACY_CANCEL_DELETION: "/api/privacy/cancel-deletion",
  PRIVACY_DELETION_STATUS: "/api/privacy/deletion-status",
  PRIVACY_MY_DATA: "/api/privacy/my-data",
  PRIVACY_ACCEPT_CONSENT: "/api/privacy/accept-consent",

  SUBSCRIPTION_STATUS: "/api/subscription/status",
  SUBSCRIPTION_SYNC: "/api/subscription/sync",
  SUBSCRIPTION_PLANS: "/api/subscription/plans",

  MESSAGES_CONVERSATIONS: "/api/messages/conversations",
  MESSAGES_HISTORY_CURSOR: (convId: string) => `/api/messages/conversations/${convId}/history-cursor`,
  MESSAGES_HISTORY: (convId: string) => `/api/messages/conversations/${convId}/history`,
  MESSAGES_SEND: "/api/messages/send",
  MESSAGES_MARK_READ: (convId: string) => `/api/messages/conversations/${convId}/mark-read`,
  MESSAGES_UNREAD_COUNT: "/api/messages/unread-count",
  MESSAGES_UNREAD_PER_CONV: "/api/messages/unread-per-conversation",
  MESSAGES_DEACTIVATE_CONV: (convId: string) => `/api/messages/conversations/${convId}`,
  MESSAGES_RESTORE_CONV: (convId: string) => `/api/messages/conversations/${convId}/restore`,
  MESSAGES_EDIT: (msgId: string) => `/api/messages/${msgId}`,
  MESSAGES_DELETE: (msgId: string) => `/api/messages/${msgId}`,
  MESSAGES_REACTIONS: (msgId: string) => `/api/messages/${msgId}/reactions`,
  MESSAGES_DELIVERED: (msgId: string) => `/api/messages/${msgId}/delivered`,
  MESSAGES_SEARCH: (convId: string) => `/api/messages/conversations/${convId}/search`,
  MESSAGES_UPLOAD_URL: "/api/messages/upload-url",
  MESSAGES_QUOTA: (convId: string) => `/api/messages/conversations/${convId}/quota`,
  MESSAGES_UNLOCK: (convId: string) => `/api/messages/conversations/${convId}/unlock`,

  MODERATION_BLOCK: (userId: string) => `/api/moderation/block/${userId}`,
  MODERATION_BLOCKS: "/api/moderation/blocks",
  MODERATION_REPORT: "/api/moderation/report",

  NOTIFICATIONS_PREFERENCES: "/api/notifications/preferences",
  NOTIFICATIONS_DEVICES: "/api/notifications/devices",
  NOTIFICATIONS_DEVICE_BY_TOKEN: (token: string) => `/api/notifications/devices/${encodeURIComponent(token)}`,
  NOTIFICATIONS_FEED: "/api/notifications",
  NOTIFICATIONS_UNREAD_COUNT: "/api/notifications/unread-count",
  NOTIFICATIONS_READ_ONE: (id: string) => `/api/notifications/${id}/read`,
  NOTIFICATIONS_READ_ALL: "/api/notifications/read-all",

  GET_GENDERS: "/api/common/genders",
  GET_CITIES: "/api/common/cities",
  GET_DISTRICTS: "/api/common/cities",
  GET_CLASSES: "/api/common/classes",
  GET_DEPARTMENTS: "/api/common/departments",
  GET_HOBBIES: "/api/common/hobbies",
  GET_SMOKING_STATUSES: "/api/common/smoking-statuses",
  GET_ZODIACS: "/api/common/zodiacs",
  GET_USAGE_PURPOSES: "/api/common/usage-purposes",
  GET_INTERESTED_IN: "/api/common/interested-in",
  GET_LANGUAGES: "/api/common/languages",
  GET_PETS: "/api/common/pets",
  GET_DISTRICTS_BY_CITY: (cityId: number | string) => `/api/common/cities/${cityId}/districts`,
};
