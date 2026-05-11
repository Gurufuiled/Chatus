import assert from 'node:assert/strict';
import {
  resolvePeerFirstMediaUriWithDeps,
  type MediaResolverDeps,
} from './LineSyncMediaResolver.logic';

function passthroughResolveMediaUrl(path: string | null | undefined): string | null {
  const t = path?.trim();
  return t && t.length > 0 ? t : null;
}

async function main(): Promise<void> {
  const cacheDeps: MediaResolverDeps = {
    findBlobRefByServerUrls: async () => ({ blob_id: 'b1' }),
    requestBlobFromKnownMirror: async () => ({
      ok: true,
      localUri: 'file:///cache/x',
      fromCache: true,
    }),
  };

  const r1 = await resolvePeerFirstMediaUriWithDeps(
    { lineId: 'L1', serverUri: 'https://example.invalid/u' },
    cacheDeps,
    passthroughResolveMediaUrl,
  );
  assert.equal(r1.source, 'cache');
  assert.equal(r1.uri, 'file:///cache/x');

  const peerDeps: MediaResolverDeps = {
    findBlobRefByServerUrls: async () => ({ blob_id: 'b1' }),
    requestBlobFromKnownMirror: async () => ({
      ok: true,
      localUri: 'file:///peer/y',
      fromCache: false,
    }),
  };
  const r2 = await resolvePeerFirstMediaUriWithDeps(
    { lineId: 'L1', serverUri: 'https://example.invalid/u' },
    peerDeps,
    passthroughResolveMediaUrl,
  );
  assert.equal(r2.source, 'peer');

  const failDeps: MediaResolverDeps = {
    findBlobRefByServerUrls: async () => ({ blob_id: 'b1' }),
    requestBlobFromKnownMirror: async () => ({ ok: false, reason: 'timeout' }),
  };
  const r3 = await resolvePeerFirstMediaUriWithDeps(
    { lineId: 'L1', serverUri: 'https://cdn.example/file.bin' },
    failDeps,
    passthroughResolveMediaUrl,
  );
  assert.equal(r3.source, 'server');
  assert.ok(r3.uri?.startsWith('http'));

  const orderDeps: MediaResolverDeps = {
    findBlobRefByServerUrls: async (_lineId, urls) => {
      assert.ok(urls.some((u) => u.includes('uploads')));
      return { blob_id: 'blob-mirror' };
    },
    requestBlobFromKnownMirror: async (_lineId, blobId) => {
      assert.equal(blobId, 'blob-mirror');
      return { ok: true, localUri: 'file:///mirror/z', fromCache: false };
    },
  };
  const r4 = await resolvePeerFirstMediaUriWithDeps(
    { lineId: 'chat1', serverUri: '/uploads/a.bin' },
    orderDeps,
    passthroughResolveMediaUrl,
  );
  assert.equal(r4.source, 'peer');
}

void main();
