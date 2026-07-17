/**
 * Load `ts-ebml` only when remuxing a recording.
 *
 * The library (and its `ebml` dependency) expect Node's `Buffer` and a CJS
 * `require("ebml").tools.readVint` shape. Vite's default browser resolve picks
 * ebml's `browser`/`module` fields and leaves `tools` undefined → crash:
 * `Cannot read properties of undefined (reading 'readVint')`.
 *
 * Callers must import this helper (never a static `import 'ts-ebml'`) so the
 * polyfill runs first and the remux stays off the embed startup path.
 */

import * as bufferPolyfill from 'buffer';

type BufferCtor = typeof import('buffer').Buffer;

type BufferModuleShape = {
  Buffer?: BufferCtor;
  default?: BufferCtor | { Buffer?: BufferCtor };
};

/**
 * Vite optimizeDeps prebundles CJS `buffer` as default-only
 * (`export default require_buffer()`), so `import { Buffer }` throws in the
 * browser. Node/Vitest still expose a named `Buffer` — support both shapes.
 *
 * Exported for unit tests that mock Vite's default-only module shape.
 */
export function resolveBuffer(mod: BufferModuleShape = bufferPolyfill as BufferModuleShape): BufferCtor {
  if (typeof mod.Buffer === 'function') return mod.Buffer;
  const d = mod.default;
  if (d && typeof d === 'object' && typeof d.Buffer === 'function') return d.Buffer;
  if (typeof d === 'function') return d;
  throw new Error('buffer polyfill did not expose Buffer');
}

const Buffer = resolveBuffer();

type TsEbmlModule = typeof import('ts-ebml');

let cached: TsEbmlModule | null = null;

function ensureNodeShims(): void {
  const g = globalThis as typeof globalThis & {
    Buffer?: BufferCtor;
    global?: typeof globalThis;
    process?: { env?: Record<string, string | undefined> };
  };
  if (g.Buffer !== Buffer) {
    g.Buffer = Buffer;
  }
  if (!g.global) {
    g.global = globalThis;
  }
  if (!g.process) {
    g.process = { env: {} };
  }
}

export async function loadTsEbml(): Promise<TsEbmlModule> {
  if (cached) return cached;
  ensureNodeShims();
  cached = await import('ts-ebml');
  return cached;
}
