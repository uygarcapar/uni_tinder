/**
 * Selfie akışının uiBus olay adları.
 *
 * NEDEN AYRI DOSYA: bu iki sabiti overlay'in içinde tutmak, yalnızca bir string
 * isteyen her çağıranı (profil satırı, AppNavigator'ın push dalı) `expo-camera`
 * + `expo-image-manipulator` + `expo-file-system` zincirinin tamamını import
 * etmeye zorluyordu. Ağır native modüller jest'te ve soğuk açılışta bedava
 * değil — sabitler bağımsız kalsın.
 */

/** Doğrulama akışını aç (intro adımından). `openSettings` deseninin aynısı. */
export const SELFIE_OPEN_EVENT = 'openSelfieVerification';

/** Giriş noktasının görünürlüğü değişti (ör. UT-6505 alındı). */
export const SELFIE_AVAILABILITY_EVENT = 'selfieAvailabilityChanged';
