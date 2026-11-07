/**
 * Automated Extension Builder & Packager
 * Copies all required Chrome extension files into dist/extension and creates a distributable ZIP.
 */

const fs = require('fs');
const path = require('path');
const { execSync } = require('child_process');

const ROOT_DIR = __dirname;
const DIST_DIR = path.join(ROOT_DIR, 'dist');
const EXTENSION_DIST_DIR = path.join(DIST_DIR, 'extension');
const ZIP_FILE_PATH = path.join(DIST_DIR, 'submission-checker-extension.zip');

// Extension items to include
const EXTENSION_FILES = [
  'manifest.json',
  'background',
  'content',
  'popup',
  'options',
  'icons'
];

function copyRecursive(src, dest) {
  const stat = fs.statSync(src);
  if (stat.isDirectory()) {
    if (!fs.existsSync(dest)) {
      fs.mkdirSync(dest, { recursive: true });
    }
    const entries = fs.readdirSync(src);
    for (const entry of entries) {
      copyRecursive(path.join(src, entry), path.join(dest, entry));
    }
  } else {
    const parent = path.dirname(dest);
    if (!fs.existsSync(parent)) {
      fs.mkdirSync(parent, { recursive: true });
    }
    fs.copyFileSync(src, dest);
  }
}

console.log('🚀 Building Submission Quality Checker Extension...');

// 1. Clean dist directory
if (fs.existsSync(DIST_DIR)) {
  fs.rmSync(DIST_DIR, { recursive: true, force: true });
}
fs.mkdirSync(EXTENSION_DIST_DIR, { recursive: true });

// 2. Copy extension files
for (const item of EXTENSION_FILES) {
  const srcPath = path.join(ROOT_DIR, item);
  const destPath = path.join(EXTENSION_DIST_DIR, item);

  if (fs.existsSync(srcPath)) {
    copyRecursive(srcPath, destPath);
    console.log(`  ✓ Copied ${item}`);
  } else {
    console.warn(`  ⚠️ Warning: ${item} not found at ${srcPath}`);
  }
}

// 2.5 Optional: Auto-inject profiles.json into DEFAULT_PROFILES if present
const profilesJsonPath = path.join(ROOT_DIR, 'profiles.json');
if (fs.existsSync(profilesJsonPath)) {
  try {
    const rawProfiles = fs.readFileSync(profilesJsonPath, 'utf8');
    const parsed = JSON.parse(rawProfiles);
    if (Array.isArray(parsed) && parsed.length > 0) {
      const swDistPath = path.join(EXTENSION_DIST_DIR, 'background', 'service-worker.js');
      const swSrcPath = path.join(ROOT_DIR, 'background', 'service-worker.js');
      
      const newConstCode = `// Default Initial Profiles (Synced from profiles.json)\nconst DEFAULT_PROFILES = ${JSON.stringify(parsed, null, 2)};`;
      
      [swDistPath, swSrcPath].forEach(targetSw => {
        if (fs.existsSync(targetSw)) {
          let content = fs.readFileSync(targetSw, 'utf8');
          content = content.replace(/\/\/ Default Initial Profiles[\s\S]*?const DEFAULT_PROFILES\s*=\s*\[[\s\S]*?\];/, newConstCode);
          fs.writeFileSync(targetSw, content, 'utf8');
        }
      });
      console.log(`  ✓ Automatically bundled ${parsed.length} profile(s) from profiles.json into DEFAULT_PROFILES!`);
    }
  } catch (err) {
    console.warn(`  ⚠️ Could not parse profiles.json: ${err.message}`);
  }
}

// 2.6 Optional: Auto-inject default-settings.json into DEFAULT_SETTINGS & DEFAULT_WEBHOOKS
const defaultSettingsJsonPath = path.join(ROOT_DIR, 'default-settings.json');
if (fs.existsSync(defaultSettingsJsonPath)) {
  try {
    const rawSettings = fs.readFileSync(defaultSettingsJsonPath, 'utf8');
    const parsedSettings = JSON.parse(rawSettings);
    if (parsedSettings && typeof parsedSettings === 'object') {
      const swDistPath = path.join(EXTENSION_DIST_DIR, 'background', 'service-worker.js');
      const swSrcPath = path.join(ROOT_DIR, 'background', 'service-worker.js');
      
      const webhooksCode = parsedSettings.webhooks
        ? `// Default Multi-Webhook Configuration\nconst DEFAULT_WEBHOOKS = ${JSON.stringify(parsedSettings.webhooks, null, 2)};`
        : null;
      
      const settingsCopy = { ...parsedSettings };
      delete settingsCopy.webhooks;
      const settingsCode = `// Default Settings\nconst DEFAULT_SETTINGS = ${JSON.stringify({ ...settingsCopy, webhooks: parsedSettings.webhooks || [] }, null, 2)};`;

      [swDistPath, swSrcPath].forEach(targetSw => {
        if (fs.existsSync(targetSw)) {
          let content = fs.readFileSync(targetSw, 'utf8');
          if (webhooksCode) {
            content = content.replace(/\/\/ Default Multi-Webhook Configuration[\s\S]*?const DEFAULT_WEBHOOKS\s*=\s*\[[\s\S]*?\];/, webhooksCode);
          }
          content = content.replace(/\/\/ Default Settings[\s\S]*?const DEFAULT_SETTINGS\s*=\s*\{[\s\S]*?\};/, settingsCode);
          fs.writeFileSync(targetSw, content, 'utf8');
        }
      });
      console.log(`  ✓ Automatically bundled default settings & webhooks (API: ${parsedSettings.backendWebhookUrl})!`);
    }
  } catch (err) {
    console.warn(`  ⚠️ Could not parse default-settings.json: ${err.message}`);
  }
}

// 3. Create ZIP archive
try {
  if (process.platform === 'win32') {
    // Use PowerShell Compress-Archive on Windows
    execSync(`powershell -Command "Compress-Archive -Path '${EXTENSION_DIST_DIR}\\*' -DestinationPath '${ZIP_FILE_PATH}' -Force"`, { stdio: 'inherit' });
  } else {
    // Use zip on Unix / Linux / macOS
    execSync(`cd "${EXTENSION_DIST_DIR}" && zip -r "${ZIP_FILE_PATH}" ./*`, { stdio: 'inherit' });
  }
  console.log(`\n📦 Successfully created ZIP archive: ${ZIP_FILE_PATH}`);
} catch (err) {
  console.log(`\n💡 Unpacked folder created at: ${EXTENSION_DIST_DIR}`);
}

console.log(`\n✅ Build Complete!`);
console.log(`📁 Unpacked Folder for Chrome:  dist/extension`);
console.log(`🎁 Distributable ZIP file:      dist/submission-checker-extension.zip\n`);
