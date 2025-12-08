// API Base URL
export const API_BASE_URL = "https://969c3af9bf66.ngrok-free.app";

// API Endpoints
export const API_ENDPOINTS = {
  // User endpoints
  REGISTER: "/api/user/Register",
  LOGIN: "/api/user/Login",
  VERIFY_EMAIL: "/api/user/verify-email",
  VERIFY_EMAIL_CODE: "/api/user/verifyemailwithcode",
  RESEND_VERIFICATION: "/api/user/resend-verification",
  GET_USER: "/api/user/GetUser",
  UPDATE_USER: "/api/user/UpdateUser",
  CHANGE_PASSWORD: "/api/user/ChangePassword",
  FORGOT_PASSWORD: "/api/user/ForgotPassword",
  RESET_PASSWORD: "/api/user/ResetPasswordWithCode",
  DELETE_USER: "/api/user/DeleteUser",

  // Profile endpoints
  COMPLETE_PROFILE: "/api/profile/CompleteProfile",
  UPDATE_PROFILE: "/api/profile/UpdateProfile",
  GET_MY_PHOTOS: "/api/profile/GetMyPhotos",

  // Photo endpoints
  GET_PHOTO: "/api/photo/GetPhoto",
};
