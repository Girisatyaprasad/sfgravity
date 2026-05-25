'use strict';

const fs = require('fs');
const path = require('path');

const WEB_ROOT = path.join(__dirname, '..');
const OUT = path.join(WEB_ROOT, 'vendor', 'ffmpeg');
const WASM_MARKER = path.join(OUT, 'core', 'ffmpeg-core.wasm');

if (fs.existsSync(WASM_MARKER)) {
  console.log('FFmpeg vendor present — sync skipped.');
  process.exit(0);
}

const PACKAGES = [
  { name: 'core', from: '@ffmpeg/core/dist/esm' },
  { name: 'ffmpeg', from: '@ffmpeg/ffmpeg/dist/esm' },
  { name: 'util', from: '@ffmpeg/util/dist/esm' },
];

function copyDir(src, dest) {
  fs.mkdirSync(dest, { recursive: true });
  for (const entry of fs.readdirSync(src, { withFileTypes: true })) {
    const from = path.join(src, entry.name);
    const to = path.join(dest, entry.name);
    if (entry.isDirectory()) copyDir(from, to);
    else fs.copyFileSync(from, to);
  }
}

for (const pkg of PACKAGES) {
  const src = path.join(WEB_ROOT, 'node_modules', pkg.from);
  const dest = path.join(OUT, pkg.name);
  if (!fs.existsSync(src)) {
    console.error('Missing:', src);
    process.exit(1);
  }
  copyDir(src, dest);
}

console.log('FFmpeg vendor copied to vendor/ffmpeg/');
