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
