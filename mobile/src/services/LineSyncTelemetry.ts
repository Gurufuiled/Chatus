/**
 * Lightweight LineSync / peer-first metrics for debugging and future analytics.
 * No PII: durations and coarse counters only.
 *
 * `dcEnsureOpen*` counts completed negotiations started by an `ensureOpen` that
 * created the session (callers that only await an in-flight `openPromise` are not
 * double-counted).
 */

export type PeerFirstSource = 'peer' | 'cache' | 'server' | 'none';

type Snapshot = {
  peerFirst: Record<PeerFirstSource, number>;
  peerFirstMsTotal: number;
  dcEnsureOpenOk: number;
  dcEnsureOpenFail: number;
  dcEnsureOpenMsTotal: number;
  /** Incoming side: answer to peer's LineSync DC offer until channel open / fail. */
  dcIncomingOk: number;
  dcIncomingFail: number;
  dcIncomingMsTotal: number;
};

const snapshot: Snapshot = {
  peerFirst: { peer: 0, cache: 0, server: 0, none: 0 },
  peerFirstMsTotal: 0,
  dcEnsureOpenOk: 0,
  dcEnsureOpenFail: 0,
  dcEnsureOpenMsTotal: 0,
  dcIncomingOk: 0,
  dcIncomingFail: 0,
  dcIncomingMsTotal: 0,
};

function devLog(...args: unknown[]): void {
  if (typeof __DEV__ !== 'undefined' && __DEV__) {
    console.log('[LineSync]', ...args);
  }
}

export function recordPeerFirstResolve(input: { source: PeerFirstSource; durationMs: number }): void {
  snapshot.peerFirst[input.source] += 1;
  snapshot.peerFirstMsTotal += Math.max(0, input.durationMs);
  devLog('peer_first', input.source, `${input.durationMs}ms`);
}

export function recordLineSyncDcEnsureOpen(input: { ok: boolean; durationMs: number }): void {
  if (input.ok) {
    snapshot.dcEnsureOpenOk += 1;
  } else {
    snapshot.dcEnsureOpenFail += 1;
  }
  snapshot.dcEnsureOpenMsTotal += Math.max(0, input.durationMs);
  devLog('dc_ensure_open', input.ok ? 'ok' : 'fail', `${input.durationMs}ms`);
}

/** Callee path: we received `line_sync_dc_offer` and negotiated until DC open or failure. */
export function recordLineSyncDcIncomingOpen(input: { ok: boolean; durationMs: number }): void {
  if (input.ok) {
    snapshot.dcIncomingOk += 1;
  } else {
    snapshot.dcIncomingFail += 1;
  }
  snapshot.dcIncomingMsTotal += Math.max(0, input.durationMs);
  devLog('dc_incoming_open', input.ok ? 'ok' : 'fail', `${input.durationMs}ms`);
}

/** For devtools / optional future export. */
export function getLineSyncTelemetrySnapshot(): Readonly<Snapshot> & {
  peerFirstAvgMs: number;
  dcEnsureOpenAvgMs: number;
  dcIncomingAvgMs: number;
} {
  const nPeer =
    snapshot.peerFirst.peer +
    snapshot.peerFirst.cache +
    snapshot.peerFirst.server +
    snapshot.peerFirst.none;
  const nDc = snapshot.dcEnsureOpenOk + snapshot.dcEnsureOpenFail;
  const nIn = snapshot.dcIncomingOk + snapshot.dcIncomingFail;
  return {
    ...snapshot,
    peerFirstAvgMs: nPeer > 0 ? snapshot.peerFirstMsTotal / nPeer : 0,
    dcEnsureOpenAvgMs: nDc > 0 ? snapshot.dcEnsureOpenMsTotal / nDc : 0,
    dcIncomingAvgMs: nIn > 0 ? snapshot.dcIncomingMsTotal / nIn : 0,
  };
}

export function resetLineSyncTelemetry(): void {
  snapshot.peerFirst = { peer: 0, cache: 0, server: 0, none: 0 };
  snapshot.peerFirstMsTotal = 0;
  snapshot.dcEnsureOpenOk = 0;
  snapshot.dcEnsureOpenFail = 0;
  snapshot.dcEnsureOpenMsTotal = 0;
  snapshot.dcIncomingOk = 0;
  snapshot.dcIncomingFail = 0;
  snapshot.dcIncomingMsTotal = 0;
}
