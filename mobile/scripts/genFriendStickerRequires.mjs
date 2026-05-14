import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const dir = path.join(__dirname, '../assets/stickers/friend');
const stems = fs
  .readdirSync(dir)
  .filter((f) => f.toLowerCase().endsWith('.webp'))
  .map((f) => f.slice(0, -5))
  .sort();

const legacy = {
  wave: '1f44b',
  hi: '1f600',
  heart: '2764-fe0f',
  laugh: '1f602',
  coffee: '1f914',
  moon: '1f634',
  star: '1f929',
  gift: '1f973',
  cat: '1f923',
  plane: '270c-fe0f',
  donut: '1f60b',
  plant: '263a-fe0f',
};

const req = stems.map((s) => `    '${s}': require('../../assets/stickers/friend/${s}.webp'),`).join('\n');
const leg = Object.entries(legacy)
  .map(([k, s]) => `    '${k}': require('../../assets/stickers/friend/${s}.webp'),`)
  .join('\n');

const out = path.join(__dirname, '../src/stickers/_generatedFriendStickerRequires.txt');
fs.writeFileSync(out, `${req}\n${leg}\n`);
console.log('stems', stems.length, 'legacy', Object.keys(legacy).length);
