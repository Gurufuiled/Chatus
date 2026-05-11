/**
 * Pure resolver orchestration (no `config` / native imports) — safe for Node tests.
 */

import { recordPeerFirstResolve } from './LineSyncTelemetry';

/** Mirrors successful/failed blob fetch without importing native-heavy blob module in Node tests. */
export type ResolverBlobResult =
  | { ok: true; localUri: string; fromCache?: boolean }
  | {
      ok: false;
      reason:
        | 'not_connected'
        | 'timeout'
        | 'hash_mismatch'
        | 'write_failed'
        | 'cancelled'
        | 'superseded';
    };

const PEER_MEDIA_TIMEOUT_MS = 12_000;

export type PeerFirstMediaResolveInput = {
  lineId: string;
  serverUri?: string | null;
  sha256?: string | null;
  blobId?: string | null;
  timeoutMs?: number;
  onProgress?: (received: number, total: number) => void;
  signal?: AbortSignal;
};

export type PeerFirstMediaResolveResult = {
  uri: string | null;
  source: 'peer' | 'cache' | 'server' | 'none';
};

export type MediaResolverDeps = {
  findBlobRefByServerUrls: (
    lineId: string,
    urls: string[],
  ) => Promise<{ blob_id: string } | null>;
  requestBlobFromKnownMirror: (
    lineId: string,
    blobId: string,
    timeoutMs: number,
    options?: {
      onProgress?: (received: number, total: number) => void;
      signal?: AbortSignal;
    },
  ) => Promise<ResolverBlobResult>;
};

/** Keep in sync with `MediaHashService.normalizeSha256` (no import: avoids `expo-file-system` in Node tests). */
function normalizeSha256(value: string | null | undefined): string | null {
  const normalized = value?.trim().toLowerCase();
  return normalized && /^[a-f0-9]{64}$/.test(normalized) ? normalized : null;
}

export function makeServerUrlCandidates(
  uri: string,
  resolveMediaUrlFn: (path: string | null | undefined) => string | null,
): string[] {
  const trimmed = uri.trim();
  const resolved = resolveMediaUrlFn(trimmed) ?? trimmed;
  const candidates = new Set([trimmed, resolved]);

  try {
    const url = new URL(resolved);
    candidates.add(`${url.pathname}${url.search}${url.hash}`);
  } catch {
    // Non-URL values are kept as-is.
  }

  return Array.from(candidates).filter(Boolean);
}

export function peerFirstDedupeKey(input: PeerFirstMediaResolveInput): string {
  const timeout = input.timeoutMs ?? PEER_MEDIA_TIMEOUT_MS;
  const sha = normalizeSha256(input.sha256) ?? '';
  return [
    input.lineId.trim(),
    input.serverUri?.trim() ?? '',
    input.blobId?.trim() ?? '',
    sha,
    String(timeout),
  ].join('\u0000');
}

export async function resolvePeerFirstMediaUriWithDeps(
  input: PeerFirstMediaResolveInput,
  deps: MediaResolverDeps,
  resolveMediaUrlFn: (path: string | null | undefined) => string | null,
): Promise<PeerFirstMediaResolveResult> {
  const t0 = Date.now();
  const finish = (result: PeerFirstMediaResolveResult): PeerFirstMediaResolveResult => {
    recordPeerFirstResolve({ source: result.source, durationMs: Date.now() - t0 });
    return result;
  };

  const lineId = input.lineId.trim();
  const fallbackUri = input.serverUri?.trim()
    ? resolveMediaUrlFn(input.serverUri) ?? input.serverUri.trim()
    : null;
  if (!lineId) {
    return finish(fallbackUri ? { uri: fallbackUri, source: 'server' } : { uri: null, source: 'none' });
  }

  const normalizedSha = normalizeSha256(input.sha256);
  let blobId = input.blobId?.trim() || (normalizedSha ? `sha256:${normalizedSha}` : null);

  if (!blobId && input.serverUri?.trim()) {
    const blobRef = await deps
      .findBlobRefByServerUrls(lineId, makeServerUrlCandidates(input.serverUri, resolveMediaUrlFn))
      .catch(() => null);
    blobId = blobRef?.blob_id ?? null;
  }

  if (blobId) {
    const peerResult = await deps
      .requestBlobFromKnownMirror(lineId, blobId, input.timeoutMs ?? PEER_MEDIA_TIMEOUT_MS, {
        onProgress: input.onProgress,
        signal: input.signal,
      })
      .catch(() => null);
    if (peerResult?.ok) {
      const source: PeerFirstMediaResolveResult['source'] = peerResult.fromCache ? 'cache' : 'peer';
      return finish({ uri: peerResult.localUri, source });
    }
  }

  return finish(fallbackUri ? { uri: fallbackUri, source: 'server' } : { uri: null, source: 'none' });
}
