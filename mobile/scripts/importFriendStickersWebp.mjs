/**
 * PNG → lossless WebP in `assets/stickers/friend/` (same stems as filenames).
 * Usage: node scripts/importFriendStickersWebp.mjs <path-to-folder-with-pngs>
 */
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import sharp from 'sharp';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const srcArg = process.argv[2];
if (!srcArg) {
  console.error('Usage: node scripts/importFriendStickersWebp.mjs <path-to-folder-with-pngs>');
  process.exit(1);
}
const srcDir = path.resolve(srcArg);
const dstDir = path.join(__dirname, '../assets/stickers/friend');

const files = fs.readdirSync(srcDir).filter((f) => f.toLowerCase().endsWith('.png'));
if (files.length === 0) {
  console.error('No PNG files in', srcDir);
  process.exit(1);
}

fs.mkdirSync(dstDir, { recursive: true });

for (const f of files) {
  const stem = f.slice(0, -4);
  const inPath = path.join(srcDir, f);
  const outPath = path.join(dstDir, `${stem}.webp`);
  await sharp(inPath).webp({ lossless: true, effort: 6 }).toFile(outPath);
}

console.log('Wrote', files.length, 'WebP →', dstDir);
