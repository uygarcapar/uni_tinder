#!/usr/bin/env node
/**
 * Feature-based file structure migration script.
 * Run: node migrate.js
 *
 * What it does:
 * 1. Reads every .ts/.tsx file from src/ (old locations)
 * 2. Resolves relative imports → @/ absolute paths using FILE_MAP
 * 3. Writes files to new locations, deletes old ones
 * 4. Updates App.tsx (root-level, uses ./src/ paths)
 * 5. Moves test and mock files to co-located positions
 */

const fs   = require('fs');
const path = require('path');

const ROOT = __dirname;
const SRC  = path.join(ROOT, 'src');

// ─── COMPLETE FILE MAP ────────────────────────────────────────────────────────
// Keys and values are src/-relative paths WITHOUT extensions.
// Files NOT in this map stay in place (navigation files).
const FILE_MAP = {
  // ── AUTH ──
  'screens/WelcomeScreen':        'features/auth/screens/WelcomeScreen',
  'screens/LoginScreen':          'features/auth/screens/LoginScreen',
  'screens/KVKKConsentScreen':    'features/auth/screens/KVKKConsentScreen',
  'screens/RegisterScreen':       'features/auth/screens/RegisterScreen',
  'screens/RegisterStep1Screen':  'features/auth/screens/RegisterStep1Screen',
  'screens/RegisterStep2Screen':  'features/auth/screens/RegisterStep2Screen',
  'screens/RegisterStep3Screen':  'features/auth/screens/RegisterStep3Screen',
  'screens/RegisterStep4Screen':  'features/auth/screens/RegisterStep4Screen',
  'screens/RegisterStep5Screen':  'features/auth/screens/RegisterStep5Screen',
  'screens/RegisterStep6Screen':  'features/auth/screens/RegisterStep6Screen',
  'screens/RegisterStep7Screen':  'features/auth/screens/RegisterStep7Screen',
  'screens/RegisterStep8Screen':  'features/auth/screens/RegisterStep8Screen',
  'screens/RegisterStep9Screen':  'features/auth/screens/RegisterStep9Screen',
  'screens/RegisterStep10Screen': 'features/auth/screens/RegisterStep10Screen',
  'screens/RegisterStep12Screen': 'features/auth/screens/RegisterStep12Screen',
  'screens/RegisterStep13Screen': 'features/auth/screens/RegisterStep13Screen',
  'screens/RegisterStep14Screen': 'features/auth/screens/RegisterStep14Screen',
  'screens/RegisterStep15Screen': 'features/auth/screens/RegisterStep15Screen',
  'services/authService':          'features/auth/authService',
  'store/slices/authSlice':        'features/auth/authSlice',
  'components/RegisterProgressBar':'features/auth/components/RegisterProgressBar',

  // ── CHAT ──
  'screens/ChatScreen':            'features/chat/screens/ChatScreen',
  'screens/MessagesScreen':        'features/chat/screens/MessagesScreen',
  'services/chatService':          'features/chat/chatService',
  'services/realtimeService':      'features/chat/realtimeService',
  'store/slices/chatSlice':        'features/chat/chatSlice',
  'components/ChatScrollComponent':'features/chat/components/ChatScrollComponent',
  'components/ChatUnlockSheet':    'features/chat/components/ChatUnlockSheet',
  'components/ConversationOptionsSheet':'features/chat/components/ConversationOptionsSheet',
  'components/DateSeparator':      'features/chat/components/DateSeparator',
  'components/MessageActionSheet': 'features/chat/components/MessageActionSheet',
  'components/MessageBubble':      'features/chat/components/MessageBubble',
  'components/MessageInput':       'features/chat/components/MessageInput',
  'components/ReactionPicker':     'features/chat/components/ReactionPicker',
  'components/ReplyPreview':       'features/chat/components/ReplyPreview',
  'components/TypingIndicator':    'features/chat/components/TypingIndicator',
  'components/VoicePlayer':        'features/chat/components/VoicePlayer',

  // ── DISCOVER ──
  'screens/DiscoverScreen':        'features/discover/screens/DiscoverScreen',
  'screens/LikesScreen':           'features/discover/screens/LikesScreen',
  'services/swipeService':         'features/discover/swipeService',
  'store/slices/swipeSlice':       'features/discover/swipeSlice',
  'queries/swipeQueries':          'features/discover/swipeQueries',
  'components/LikerSwipeModal':    'features/discover/components/LikerSwipeModal',
  'components/PurchaseModal':      'features/discover/components/PurchaseModal',
  'components/SuperLikePurchaseModal':'features/discover/components/SuperLikePurchaseModal',
  'components/SwipeCard':          'features/discover/components/SwipeCard',
  'components/SwipeOverlay':       'features/discover/components/SwipeOverlay',
  'components/SwipeWrapper':       'features/discover/components/SwipeWrapper',

  // ── NOTIFICATIONS ──
  'screens/NotificationsScreen':   'features/notifications/screens/NotificationsScreen',
  'services/notificationsService': 'features/notifications/notificationsService',
  'services/pushService':          'features/notifications/pushService',
  'components/ConnectionBanner':   'features/notifications/components/ConnectionBanner',
  'components/DeletionBanner':     'features/notifications/components/DeletionBanner',
  'components/MatchModal':         'features/notifications/components/MatchModal',

  // ── PROFILE ──
  'screens/ProfileScreen':         'features/profile/screens/ProfileScreen',
  'services/profileService':       'features/profile/profileService',
  'store/slices/profileSlice':     'features/profile/profileSlice',
  'services/subscriptionService':  'features/profile/subscriptionService',
  'store/slices/subscriptionSlice':'features/profile/subscriptionSlice',
  'components/EditModal':          'features/profile/components/EditModal',
  'components/EditProfileForm':    'features/profile/components/EditProfileForm',
  'components/ImageViewer':        'features/profile/components/ImageViewer',
  'components/PreviewModal':       'features/profile/components/PreviewModal',
  'components/SettingsModal':      'features/profile/components/SettingsModal',

  // ── SHARED ──
  'components/AnimatedPressable':  'shared/components/AnimatedPressable',
  'components/AppBottomSheet':     'shared/components/AppBottomSheet',
  'components/BlurBottomSheetBackdrop':'shared/components/BlurBottomSheetBackdrop',
  'components/EmptyState':         'shared/components/EmptyState',
  'components/ReportModal':        'shared/components/ReportModal',
  'components/ScreenHeader':       'shared/components/ScreenHeader',
  'components/SearchSheet':        'shared/components/SearchSheet',
  'components/SearchableListSheet':'shared/components/SearchableListSheet',
  'components/WaveFillLogo':       'shared/components/WaveFillLogo',
  'services/api':                  'shared/services/api',
  'services/moderationService':    'shared/services/moderationService',
  'services/uiBus':                'shared/services/uiBus',
  'hooks/redux':                   'shared/hooks/redux',
  'store/index':                   'shared/store/index',
  'constants/api':                 'shared/constants/api',
  'constants/mapbox':              'shared/constants/mapbox',
  'types/index':                   'shared/types/index',
  'types/navigation':              'shared/types/navigation',
  'utils/jwt':                     'shared/utils/jwt',
  'utils/tokenStorage':            'shared/utils/tokenStorage',
  'schemas/formSchemas':           'shared/schemas/formSchemas',
  'queries/queryClient':           'shared/queries/queryClient',
};

// ─── HELPERS ──────────────────────────────────────────────────────────────────

function stripExt(p) {
  return p.replace(/\.(ts|tsx|js|jsx)$/, '');
}

/** Resolve a relative import path from a source file to a src/-relative key. */
function resolveSrcRel(fromAbsolute, importPath) {
  const fromDir = path.dirname(fromAbsolute);
  const abs     = path.resolve(fromDir, importPath);
  return stripExt(path.relative(SRC, abs).replace(/\\/g, '/'));
}

/** Apply the FILE_MAP to a single relative import string. Returns new @/ path or null. */
function mapImport(fromAbsolute, importPath) {
  const srcRel = resolveSrcRel(fromAbsolute, importPath);
  return FILE_MAP[srcRel] ? `@/${FILE_MAP[srcRel]}` : null;
}

/** Rewrite all relative imports in file content using FILE_MAP. */
function rewriteImports(content, fromAbsolute) {
  // Match: from '...' or from "..."  (relative paths only)
  content = content.replace(
    /(\bfrom\s+)(['"])(\.\.?\/[^'"]+)(['"])/g,
    (match, keyword, q1, importPath, q2) => {
      const mapped = mapImport(fromAbsolute, importPath);
      return mapped ? `${keyword}${q1}${mapped}${q2}` : match;
    }
  );

  // Match: import '...' or import "..."  (side-effect imports)
  content = content.replace(
    /(\bimport\s+)(['"])(\.\.?\/[^'"]+)(['"])/g,
    (match, keyword, q1, importPath, q2) => {
      const mapped = mapImport(fromAbsolute, importPath);
      return mapped ? `${keyword}${q1}${mapped}${q2}` : match;
    }
  );

  // Match: jest.mock('...') or jest.mock("...")  (test files)
  content = content.replace(
    /(jest\.mock\s*\(\s*)(['"])(\.\.?\/[^'"]+)(['"])/g,
    (match, keyword, q1, importPath, q2) => {
      const mapped = mapImport(fromAbsolute, importPath);
      return mapped ? `${keyword}${q1}${mapped}${q2}` : match;
    }
  );

  return content;
}

/** Recursively collect all .ts/.tsx files under a directory. */
function collectFiles(dir, results = []) {
  if (!fs.existsSync(dir)) return results;
  for (const entry of fs.readdirSync(dir)) {
    const full = path.join(dir, entry);
    const stat = fs.statSync(full);
    if (stat.isDirectory()) {
      collectFiles(full, results);
    } else if (/\.(ts|tsx)$/.test(entry)) {
      results.push(full);
    }
  }
  return results;
}

function mkdirp(p) {
  fs.mkdirSync(p, { recursive: true });
}

function moveFile(src, dst) {
  mkdirp(path.dirname(dst));
  fs.copyFileSync(src, dst);
  fs.unlinkSync(src);
}

function writeFile(p, content) {
  mkdirp(path.dirname(p));
  fs.writeFileSync(p, content, 'utf8');
}

// ─── PHASE 1: Process all src/ files ─────────────────────────────────────────

const srcFiles = collectFiles(SRC);
let movedCount = 0;
let updatedCount = 0;

for (const absOldPath of srcFiles) {
  const srcRel    = path.relative(SRC, absOldPath).replace(/\\/g, '/');
  const srcRelKey = stripExt(srcRel);

  // Read original content
  let content = fs.readFileSync(absOldPath, 'utf8');

  // Rewrite imports based on old file location (old path resolves correctly)
  const updated = rewriteImports(content, absOldPath);
  const changed = updated !== content;

  // Determine new path
  const newKey = FILE_MAP[srcRelKey];
  const ext     = path.extname(absOldPath);
  const absNewPath = newKey
    ? path.join(SRC, newKey + ext)
    : absOldPath; // stays in place

  if (newKey) {
    // Write to new location with updated imports
    writeFile(absNewPath, updated);
    // Delete old file
    fs.unlinkSync(absOldPath);
    movedCount++;
    if (changed) updatedCount++;
    console.log(`  MOVE  ${srcRel}\n     -> ${newKey}${ext}`);
  } else if (changed) {
    // Not moving, but imports changed → overwrite in place
    fs.writeFileSync(absOldPath, updated, 'utf8');
    updatedCount++;
    console.log(`  UPDATE ${srcRel}`);
  }
}

// ─── PHASE 2: Update App.tsx (root-level, uses ./src/ paths) ─────────────────

const appPath = path.join(ROOT, 'App.tsx');
if (fs.existsSync(appPath)) {
  let content = fs.readFileSync(appPath, 'utf8');

  // App.tsx uses paths like './src/store', './src/queries/queryClient', etc.
  // These are src-relative from root/src/ perspective.
  content = content.replace(
    /(\bfrom\s+)(['"])(\.\/src\/([^'"]+))(['"])/g,
    (match, keyword, q1, fullPath, srcRelPart, q2) => {
      const srcRelKey = stripExt(srcRelPart);
      const newKey = FILE_MAP[srcRelKey];
      return newKey
        ? `${keyword}${q1}./src/${newKey}${q2}`
        : match;
    }
  );

  fs.writeFileSync(appPath, content, 'utf8');
  console.log(`  UPDATE App.tsx`);
}

// ─── PHASE 3: Move test file → co-located with EditModal ─────────────────────

const oldTestPath = path.join(SRC, '__tests__/components/EditModal.test.tsx');
const newTestPath = path.join(SRC, 'features/profile/components/EditModal.test.tsx');

if (fs.existsSync(oldTestPath)) {
  let content = fs.readFileSync(oldTestPath, 'utf8');
  // Update imports in the test file from its OLD location
  content = rewriteImports(content, oldTestPath);
  writeFile(newTestPath, content);
  fs.unlinkSync(oldTestPath);
  console.log(`  MOVE  src/__tests__/components/EditModal.test.tsx\n     -> src/features/profile/components/EditModal.test.tsx`);
}

// ─── PHASE 4: Move AppBottomSheet mock → shared/components/__mocks__/ ─────────

const oldMockPath = path.join(SRC, 'components/__mocks__/AppBottomSheet.tsx');
const newMockPath = path.join(SRC, 'shared/components/__mocks__/AppBottomSheet.tsx');

if (fs.existsSync(oldMockPath)) {
  let content = fs.readFileSync(oldMockPath, 'utf8');
  writeFile(newMockPath, content);
  fs.unlinkSync(oldMockPath);
  console.log(`  MOVE  src/components/__mocks__/AppBottomSheet.tsx\n     -> src/shared/components/__mocks__/AppBottomSheet.tsx`);
}

// ─── PHASE 5: Clean up empty directories ─────────────────────────────────────

function removeEmptyDirs(dir) {
  if (!fs.existsSync(dir)) return;
  for (const entry of fs.readdirSync(dir)) {
    const full = path.join(dir, entry);
    if (fs.statSync(full).isDirectory()) {
      removeEmptyDirs(full);
    }
  }
  const entries = fs.readdirSync(dir);
  if (entries.length === 0) {
    fs.rmdirSync(dir);
    console.log(`  RMDIR ${path.relative(ROOT, dir)}`);
  }
}

// Clean up stale files first
const staleFiles = [
  path.join(SRC, 'components/.SwipeCard.js.swp'),
  path.join(SRC, 'components/SwipeCard.js.backup'),
];
for (const f of staleFiles) {
  if (fs.existsSync(f)) {
    fs.unlinkSync(f);
    console.log(`  DELETE ${path.relative(ROOT, f)}`);
  }
}

// Remove now-empty old directories
const oldDirs = [
  path.join(SRC, '__tests__'),
  path.join(SRC, 'components'),
  path.join(SRC, 'screens'),
  path.join(SRC, 'services'),
  path.join(SRC, 'store'),
  path.join(SRC, 'hooks'),
  path.join(SRC, 'constants'),
  path.join(SRC, 'types'),
  path.join(SRC, 'utils'),
  path.join(SRC, 'queries'),
  path.join(SRC, 'schemas'),
];
for (const dir of oldDirs) {
  removeEmptyDirs(dir);
}

// ─── DONE ─────────────────────────────────────────────────────────────────────

console.log(`\nMigration complete!`);
console.log(`  Files moved:   ${movedCount}`);
console.log(`  Imports fixed: ${updatedCount}`);
console.log(`\nNext steps:`);
console.log(`  1. Update jest.config.js mock paths`);
console.log(`  2. Run: npm test`);
console.log(`  3. Run: npm run lint`);
console.log(`  4. Run: npm run type-check`);
