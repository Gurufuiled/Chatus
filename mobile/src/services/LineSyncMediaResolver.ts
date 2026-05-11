/**
 * Peer-first media URI resolver.
 *
 * UI can keep using normal media URLs, but this resolver tries to replace a server
 * URL with a locally cached peer-downloaded blob before falling back to HTTP.
 */

import { resolveMediaUrl } from '../config';
import { LineSyncBlobService } from './LineSyncBlobService';
import { LineSyncService } from './LineSyncService';
import {
  peerFirstDedupeKey,
  resolvePeerFirstMediaUriWithDeps as resolvePeerFirstMediaUriWithDepsLogic,
  type MediaResolverDeps,
  type PeerFirstMediaResolveInput,
  type PeerFirstMediaResolveResult,
} from './LineSyncMediaResolver.logic';

export type {
  MediaResolverDeps,
  PeerFirstMediaResolveInput,
  PeerFirstMediaResolveResult,
} from './LineSyncMediaResolver.logic';

export { peerFirstDedupeKey } from './LineSyncMediaResolver.logic';

const inFlightPeerFirst = new Map<string, Promise<PeerFirstMediaResolveResult>>();

export async function resolvePeerFirstMediaUriWithDeps(
  input: PeerFirstMediaResolveInput,
  deps: MediaResolverDeps,
): Promise<PeerFirstMediaResolveResult> {
  return resolvePeerFirstMediaUriWithDepsLogic(input, deps, resolveMediaUrl);
}

const defaultDeps: MediaResolverDeps = {
  findBlobRefByServerUrls: (lineId, urls) => LineSyncService.findBlobRefByServerUrls(lineId, urls),
  requestBlobFromKnownMirror: (lineId, blobId, timeoutMs, options) =>
    LineSyncBlobService.requestBlobFromKnownMirror(lineId, blobId, timeoutMs, options),
};

export async function resolvePeerFirstMediaUri(
  input: PeerFirstMediaResolveInput,
): Promise<PeerFirstMediaResolveResult> {
  const skipDedupe = Boolean(input.signal || input.onProgress);
  if (skipDedupe) {
    return resolvePeerFirstMediaUriWithDepsLogic(input, defaultDeps, resolveMediaUrl);
  }

  const key = peerFirstDedupeKey(input);
  const existing = inFlightPeerFirst.get(key);
  if (existing) {
    return existing;
  }

  const pending = resolvePeerFirstMediaUriWithDepsLogic(input, defaultDeps, resolveMediaUrl).finally(() => {
    inFlightPeerFirst.delete(key);
  });
  inFlightPeerFirst.set(key, pending);
  return pending;
}
