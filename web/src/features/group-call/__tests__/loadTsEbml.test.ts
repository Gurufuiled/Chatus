import { describe, expect, it } from 'vitest';
import { Buffer } from 'buffer';
import { loadTsEbml } from '../loadTsEbml';

describe('loadTsEbml', () => {
  it('exposes Buffer and a working ebml tools.readVint after load', async () => {
    const mod = await loadTsEbml();
    expect(globalThis.Buffer).toBe(Buffer);
    expect(typeof mod.Decoder).toBe('function');
    expect(typeof mod.Reader).toBe('function');
    expect(typeof mod.tools.makeMetadataSeekable).toBe('function');
    expect(typeof mod.tools.readVint).toBe('function');

    // Classic EBML header id starts with 0x1A — readVint must parse without throw.
    const sample = Buffer.from([0x1a, 0x45, 0xdf, 0xa3]);
    const vint = mod.tools.readVint(sample, 0);
    expect(vint).toBeTruthy();
    expect(vint!.length).toBeGreaterThan(0);
  });
});
