/**
 * Simülatör için Debug .app üretir. `npm run e2e:build`.
 *
 * NEDEN DEBUG, Release değil — `__DEV__ = false` şu üçünü öldürüyor:
 *   • feedDevFlag.ts → Akış sekmesi hiç çizilmiyor (backend bayrağı kapalıysa)
 *   • campusDevLocation.ts → bütün girişler `__DEV__` kapılı, kampüs yüzeyi
 *     hiç açılmıyor
 *   • SettingsScreen'in gizli teşhis menüsündeki "Toast galerisi" ve
 *     "Kampüs simülasyonu" girişleri yok, ToastGallery route'u kayıtlı değil
 *
 * Maliyeti: JS bundle Metro'dan geliyor, yani `npm run e2e:metro` canlı olmak
 * zorunda.
 */
import { execFileSync } from 'node:child_process';
import { existsSync } from 'node:fs';
import { resolve } from 'node:path';
import { APP_PATH, DEVICE_UDID, REPO_ROOT, ensureArtifactDirs, artifact } from './env';

const WORKSPACE = resolve(REPO_ROOT, 'ios/Lit.xcworkspace');

if (!existsSync(WORKSPACE)) {
  throw new Error(
    `${WORKSPACE} yok.\n` +
      `  ios/ git-ignored — taze checkout'ta önce prebuild gerekiyor:\n` +
      `    npm run e2e:prebuild`
  );
}

ensureArtifactDirs();

const derivedData = artifact('build');

console.log('[build] xcodebuild — Debug / iphonesimulator');
execFileSync(
  'xcodebuild',
  [
    '-workspace',
    WORKSPACE,
    '-scheme',
    'Lit',
    '-configuration',
    'Debug',
    '-sdk',
    'iphonesimulator',
    '-destination',
    `id=${DEVICE_UDID}`,
    '-derivedDataPath',
    derivedData,
    // Simülatör build'inde imzalama gereksiz ve CI'da sertifika yok.
    'CODE_SIGNING_ALLOWED=NO',
    'CODE_SIGNING_REQUIRED=NO',
    'ONLY_ACTIVE_ARCH=YES',
    'build',
  ],
  { cwd: REPO_ROOT, stdio: 'inherit' }
);

if (!existsSync(APP_PATH)) {
  throw new Error(
    `Build bitti ama .app beklenen yerde yok:\n  ${APP_PATH}\n` +
      `Gerçek yolu bulup e2e/.env.e2e içindeki E2E_APP_PATH'e yaz.`
  );
}

console.log(`[build] hazır: ${APP_PATH}`);
