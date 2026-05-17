/**
 * Builds Android status-bar notification icon: white RGBA on transparency (Material).
 * Source: full-color app icon. Run after changing chatus_icon.png:
 *   node ./scripts/generate-notification-icon-small.mjs
 */
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import sharp from 'sharp';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const root = path.join(__dirname, '..');
const srcPath = path.join(root, 'assets', 'chatus_icon.png');
const outPath = path.join(root, 'assets', 'notification_icon_small.png');

async function main() {
  const { data, info } = await sharp(srcPath).ensureAlpha().raw().toBuffer({ resolveWithObject: true });
  const w = info.width;
  const h = info.height;
  const ch = info.channels;
  if (ch !== 4) {
    throw new Error(`Expected RGBA source, got ${ch} channels`);
  }
  const out = Buffer.alloc(w * h * 4);
  for (let i = 0; i < w * h; i++) {
    const o = i * 4;
    const a = data[o + 3] / 255;
    const r = data[o];
    const g = data[o + 1];
    const b = data[o + 2];
    const lum = (r + g + b) / (3 * 255);
    // Emphasize visible glass / edges; keep subtle areas slightly visible.
    const strength = Math.min(1, a * (0.35 + lum * 0.85));
    const oa = Math.round(strength * 255);
    out[o] = 255;
    out[o + 1] = 255;
    out[o + 2] = 255;
    out[o + 3] = oa;
  }
  await sharp(out, { raw: { width: w, height: h, channels: 4 } })
    .png()
    .toFile(outPath);
  // eslint-disable-next-line no-console
  console.log('Wrote', outPath);
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
