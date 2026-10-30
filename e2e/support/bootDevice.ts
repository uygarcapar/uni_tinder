/**
 * Simülatörü e2e için hazırlar. `npm run e2e:boot`.
 *
 * `wdio.conf.ts`in `onPrepare`ı aynı zinciri koşuyor; bu betik CI'da ayrı bir
 * adım olarak ve yerelde elle teşhis için var.
 *
 * SIRA KRİTİK: boot → bootstatus → privacy → location → addmedia.
 * `privacy` ve `location`, SpringBoard ayakta değilken SESSİZCE etkisiz kalıyor.
 */
import {
  DEVICE_NAME,
  DEVICE_UDID,
  E2E_LAT,
  E2E_LON,
  PLATFORM_VERSION,
  ensureArtifactDirs,
} from './env';
import {
  bootDevice,
  deviceState,
  preparePrivacy,
  seedPhotoLibrary,
  setLocation,
  type PermissionProfile,
} from './simctl';

const profile = (process.argv[2] as PermissionProfile | undefined) ?? 'granted';
if (!['virgin', 'granted', 'denied'].includes(profile)) {
  throw new Error(`Bilinmeyen izin profili: ${profile} (virgin | granted | denied)`);
}

ensureArtifactDirs();

console.log(`[boot] ${DEVICE_NAME} ${PLATFORM_VERSION} (${DEVICE_UDID}) — ${deviceState()}`);
bootDevice();
console.log('[boot] açık ve hazır');

preparePrivacy(profile);
console.log(`[boot] izin profili: ${profile}`);

setLocation();
console.log(`[boot] konum: ${E2E_LAT},${E2E_LON}`);

const photos = seedPhotoLibrary();
console.log(
  photos > 0
    ? `[boot] galeri: ${photos} fotoğraf eklendi`
    : '[boot] ⚠️ e2e/fixtures/photo-*.jpg yok — kayıt Step15 (min 2 foto) koşamaz'
);
