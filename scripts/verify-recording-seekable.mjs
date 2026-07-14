/**
 * Playwright verification: canvas MediaRecorder → progressive MP4 via mediabunny.
 * Asserts video.duration ≈ wall clock and that seeking does not throw.
 *
 * Usage (from web/): node ../scripts/verify-recording-seekable.mjs
 */
import { createServer } from 'node:http';
import { readFile } from 'node:fs/promises';
import { createRequire } from 'node:module';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = dirname(fileURLToPath(import.meta.url));
const webRoot = join(__dirname, '..', 'web');
const require = createRequire(join(webRoot, 'package.json'));
const { chromium } = require('playwright');
const RECORD_MS = 2500;
const DURATION_TOLERANCE_S = 1.5;

const html = `<!doctype html>
<html><body>
<script type="module">
import {
  Input, Output, Conversion, ALL_FORMATS, BlobSource, BufferTarget, Mp4OutputFormat,
  canEncodeVideo,
} from '/node_modules/mediabunny/dist/bundles/mediabunny.mjs';

async function recordWebm(ms) {
  const canvas = document.createElement('canvas');
  canvas.width = 320; canvas.height = 180;
  const ctx = canvas.getContext('2d');
  // Video-only: avoids AudioContext autoplay policy in headless Chromium.
  const stream = canvas.captureStream(15);

  const mime = ['video/webm;codecs=vp8', 'video/webm;codecs=vp9', 'video/webm']
    .find((t) => MediaRecorder.isTypeSupported(t));
  if (!mime) throw new Error('no webm MediaRecorder mime');

  const chunks = [];
  const rec = new MediaRecorder(stream, { mimeType: mime });
  rec.ondataavailable = (e) => { if (e.data.size) chunks.push(e.data); };
  const stopped = new Promise((r) => { rec.onstop = () => r(); });
  const t0 = performance.now();
  let frame = 0;
  const draw = () => {
    ctx.fillStyle = \`hsl(\${frame % 360} 70% 40%)\`;
    ctx.fillRect(0, 0, canvas.width, canvas.height);
    ctx.fillStyle = '#fff';
    ctx.font = '24px sans-serif';
    ctx.fillText(String(frame++), 20, 40);
  };
  draw();
  const timer = setInterval(draw, 1000 / 15);
  rec.start(200);
  await new Promise((r) => setTimeout(r, ms));
  clearInterval(timer);
  try { rec.requestData(); } catch {}
  rec.stop();
  await stopped;
  const wallMs = performance.now() - t0;
  const blob = new Blob(chunks, { type: mime });
  if (blob.size < 500) throw new Error('webm too small: ' + blob.size + ' chunks=' + chunks.length);
  return { blob, wallMs };
}

async function toMp4(blob) {
  const input = new Input({ source: new BlobSource(blob), formats: ALL_FORMATS });
  const target = new BufferTarget();
  const output = new Output({
    format: new Mp4OutputFormat({ fastStart: 'in-memory' }),
    target,
  });
  const preferAvc = await canEncodeVideo('avc');
  const conversion = await Conversion.init({
    input,
    output,
    ...(preferAvc ? { video: { codec: 'avc' } } : {}),
    // Video-only source — do not require AAC.
    audio: { discard: true },
  });
  if (!conversion.isValid) throw new Error('conversion invalid: ' + JSON.stringify(conversion.discardedTracks));
  await conversion.execute();
  return new Blob([target.buffer], { type: 'video/mp4' });
}

async function probe(blob) {
  const url = URL.createObjectURL(blob);
  const video = document.createElement('video');
  video.preload = 'auto';
  video.src = url;
  await new Promise((resolve, reject) => {
    video.onloadedmetadata = () => resolve();
    video.onerror = () => reject(new Error('video error'));
  });
  const duration = video.duration;
  video.currentTime = Math.min(0.5, Math.max(0, duration / 2));
  await new Promise((resolve) => {
    const done = () => { video.onseeked = null; resolve(); };
    video.onseeked = done;
    setTimeout(done, 2000);
  });
  const seekOk = Number.isFinite(video.currentTime) && video.currentTime > 0.05;
  URL.revokeObjectURL(url);
  return { duration, seekOk, size: blob.size, type: blob.type };
}

try {
  const { blob, wallMs } = await recordWebm(${RECORD_MS});
  const mp4 = await toMp4(blob);
  const probeResult = await probe(mp4);
  window.__RESULT__ = {
    ok: true,
    wallSec: wallMs / 1000,
    duration: probeResult.duration,
    seekOk: probeResult.seekOk,
    size: probeResult.size,
    type: probeResult.type,
  };
} catch (e) {
  window.__RESULT__ = { ok: false, error: String(e && e.stack || e) };
}
</script>
</body></html>`;

function contentType(path) {
  if (path.endsWith('.js') || path.endsWith('.mjs')) return 'text/javascript';
  if (path.endsWith('.css')) return 'text/css';
  if (path.endsWith('.wasm')) return 'application/wasm';
  if (path.endsWith('.json')) return 'application/json';
  return 'application/octet-stream';
}

const server = createServer(async (req, res) => {
  try {
    if (req.url === '/' || req.url === '/index.html') {
      res.writeHead(200, { 'content-type': 'text/html; charset=utf-8' });
      res.end(html);
      return;
    }
    const rel = decodeURIComponent((req.url || '/').split('?')[0]);
    const filePath = join(webRoot, rel.replace(/^\//, ''));
    if (!filePath.startsWith(webRoot)) {
      res.writeHead(403);
      res.end('forbidden');
      return;
    }
    const data = await readFile(filePath);
    res.writeHead(200, { 'content-type': contentType(filePath) });
    res.end(data);
  } catch {
    res.writeHead(404);
    res.end('not found');
  }
});

await new Promise((r) => server.listen(0, '127.0.0.1', r));
const { port } = server.address();
const url = `http://127.0.0.1:${port}/`;

const browser = await chromium.launch();
const page = await browser.newPage();
page.on('console', (msg) => console.log('[browser]', msg.type(), msg.text()));
page.on('pageerror', (err) => console.error('[pageerror]', err));

await page.goto(url, { waitUntil: 'domcontentloaded', timeout: 60_000 });
const result = await page.waitForFunction(() => window.__RESULT__, null, {
  timeout: 120_000,
}).then((h) => h.jsonValue());

await browser.close();
server.close();

console.log(JSON.stringify(result, null, 2));
if (!result.ok) {
  console.error('FAIL:', result.error);
  process.exit(1);
}
const delta = Math.abs(result.duration - result.wallSec);
if (!(result.duration > 1) || delta > DURATION_TOLERANCE_S) {
  console.error(`FAIL: duration ${result.duration} vs wall ${result.wallSec}`);
  process.exit(1);
}
if (!result.seekOk) {
  console.error('FAIL: seek did not advance currentTime');
  process.exit(1);
}
console.log('PASS: MP4 duration≈wall clock and seek works');
