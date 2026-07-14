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

import { Buffer } from 'buffer';

type TsEbmlModule = typeof import('ts-ebml');

let cached: TsEbmlModule | null = null;

function ensureNodeShims(): void {
  const g = globalThis as typeof globalThis & {
    Buffer?: typeof Buffer;
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
