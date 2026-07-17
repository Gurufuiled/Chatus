import { describe, expect, it } from 'vitest';
import { loadTsEbml, resolveBuffer } from '../loadTsEbml';

describe('resolveBuffer', () => {
  const FakeBuffer = function FakeBuffer() {
    /* constructor stub for interop shape tests */
  } as unknown as typeof import('buffer').Buffer;

  it('prefers named Buffer (Node / Vitest shape)', () => {
    expect(resolveBuffer({ Buffer: FakeBuffer, default: { Buffer: FakeBuffer } })).toBe(FakeBuffer);
  });

  it('reads default.Buffer (Vite optimizeDeps CJS interop)', () => {
    expect(resolveBuffer({ default: { Buffer: FakeBuffer } })).toBe(FakeBuffer);
  });

  it('accepts default as the Buffer constructor', () => {
    expect(resolveBuffer({ default: FakeBuffer })).toBe(FakeBuffer);
  });

  it('throws when Buffer is missing', () => {
    expect(() => resolveBuffer({})).toThrow(/buffer polyfill did not expose Buffer/);
  });
});

describe('loadTsEbml', () => {
  it('exposes Buffer and a working ebml tools.readVint after load', async () => {
    const mod = await loadTsEbml();
    expect(typeof globalThis.Buffer).toBe('function');
    expect(typeof globalThis.Buffer?.from).toBe('function');
    expect(typeof mod.Decoder).toBe('function');
    expect(typeof mod.Reader).toBe('function');
    expect(typeof mod.tools.makeMetadataSeekable).toBe('function');
    expect(typeof mod.tools.readVint).toBe('function');

    // Classic EBML header id starts with 0x1A — readVint must parse without throw.
    const sample = globalThis.Buffer!.from([0x1a, 0x45, 0xdf, 0xa3]);
    const vint = mod.tools.readVint(sample, 0);
    expect(vint).toBeTruthy();
    expect(vint!.length).toBeGreaterThan(0);
  });
});
