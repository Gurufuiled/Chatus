/**
 * WebRTC DataChannel transport for LineSync payloads.
 *
 * Signaling still goes through SignalingService, but blob frames can move over a direct
 * peer channel once negotiation succeeds.
 */

import {
  RTCIceCandidate,
  RTCPeerConnection,
  RTCSessionDescription,
} from '@livekit/react-native-webrtc';
import { getWebRtcIceServers } from '../config';
import { SignalingService } from './SignalingService';
import { recordLineSyncDcEnsureOpen, recordLineSyncDcIncomingOpen } from './LineSyncTelemetry';
import { getSecureRandomString } from '../utils/secureRandom';

const DATA_CHANNEL_LABEL = 'linesync-blobs';
const DEFAULT_OPEN_TIMEOUT_MS = 8000;

type DataChannelLike = {
  readyState?: string;
  send: (data: string) => void;
  close?: () => void;
  onopen?: (() => void) | null;
  onclose?: (() => void) | null;
  onerror?: (() => void) | null;
  onmessage?: ((event: { data?: unknown }) => void) | null;
};

type PeerConnectionLike = RTCPeerConnection & {
  createDataChannel?: (label: string, options?: Record<string, unknown>) => DataChannelLike;
  ondatachannel?: ((event: { channel?: DataChannelLike }) => void) | null;
  onicecandidate?: ((event: { candidate?: RTCIceCandidate | null }) => void) | null;
  onconnectionstatechange?: (() => void) | null;
  oniceconnectionstatechange?: (() => void) | null;
  connectionState?: string;
  iceConnectionState?: string;
};

type DataChannelSignal = {
  type: 'line_sync_dc_offer' | 'line_sync_dc_answer' | 'line_sync_dc_ice';
  from_user_id?: string;
  session_id?: string;
  offer?: RTCSessionDescriptionInit;
  answer?: RTCSessionDescriptionInit;
  candidate?: RTCIceCandidateInit | null;
};

type Session = {
  userId: string;
  sessionId: string;
  pc: PeerConnectionLike;
  channel: DataChannelLike | null;
  openPromise: Promise<boolean> | null;
  resolveOpen?: (ok: boolean) => void;
  /** Callee: start time for inbound DC negotiation telemetry. */
  calleeNegotiationStartMs?: number;
};

function makeSessionId(targetUserId: string): string {
  return `lsdc-${Date.now()}-${targetUserId}-${getSecureRandomString(8)}`;
}

function normalizeSessionDescription(
  value: RTCSessionDescriptionInit
): { type: 'offer' | 'answer' | 'pranswer' | 'rollback'; sdp: string } {
  return {
    type: value.type,
    sdp: value.sdp ?? '',
  };
}

class LineSyncDataChannelServiceClass {
  private readonly sessions = new Map<string, Session>();
  private readonly messageListeners = new Set<(raw: string, fromUserId: string) => void>();

  constructor() {
    SignalingService.addLineSyncDataChannelRawListener((raw) => {
      void this.handleRawSignal(raw);
    });
    SignalingService.addSocketCloseListener(() => {
      this.closeAllSessions();
    });
  }

  /** Tear down all peer connections (next `ensureOpen` negotiates fresh ICE / DC). */
  closeAllSessions(): void {
    for (const userId of [...this.sessions.keys()]) {
      this.closeSession(userId);
    }
  }

  onMessage(listener: (raw: string, fromUserId: string) => void): () => void {
    this.messageListeners.add(listener);
    return () => this.messageListeners.delete(listener);
  }

  isOpen(userId: string): boolean {
    return this.sessions.get(userId)?.channel?.readyState === 'open';
  }

  sendToPeer(userId: string, message: unknown): boolean {
    const channel = this.sessions.get(userId)?.channel;
    if (channel?.readyState !== 'open') return false;
    channel.send(JSON.stringify(message));
    return true;
  }

  async ensureOpen(userId: string, timeoutMs = DEFAULT_OPEN_TIMEOUT_MS): Promise<boolean> {
    const started = Date.now();
    const done = (ok: boolean): boolean => {
      recordLineSyncDcEnsureOpen({ ok, durationMs: Date.now() - started });
      return ok;
    };

    const existing = this.sessions.get(userId);
    if (existing?.channel?.readyState === 'open') return true;
    if (existing?.openPromise) return existing.openPromise;

    try {
      await SignalingService.whenConnected(timeoutMs);
    } catch {
      return done(false);
    }

    const session = this.createSession(userId, makeSessionId(userId));
    const channel = session.pc.createDataChannel?.(DATA_CHANNEL_LABEL, { ordered: true }) ?? null;
    if (!channel) {
      this.closeSession(userId);
      return done(false);
    }
    this.attachChannel(session, channel);

    const openPromise = this.waitForOpen(session, timeoutMs);
    session.openPromise = openPromise;

    try {
      const offer = await session.pc.createOffer();
      await session.pc.setLocalDescription(offer);
      const localDescription = session.pc.localDescription;
      if (!localDescription) {
        this.closeSession(userId);
        return done(false);
      }
      SignalingService.sendLineSyncDataChannelOffer(userId, session.sessionId, {
        type: 'offer',
        sdp: localDescription.sdp ?? '',
      });
    } catch {
      this.closeSession(userId);
      return done(false);
    }

    return done(await openPromise);
  }

  private createSession(userId: string, sessionId: string): Session {
    this.closeSession(userId);
    const pc = new RTCPeerConnection({ iceServers: getWebRtcIceServers() }) as PeerConnectionLike;
    const session: Session = {
      userId,
      sessionId,
      pc,
      channel: null,
      openPromise: null,
    };

    pc.onicecandidate = (event) => {
      SignalingService.sendLineSyncDataChannelIce(
        userId,
        sessionId,
        event.candidate ? event.candidate.toJSON() : null,
      );
    };

    pc.ondatachannel = (event) => {
      if (event.channel) {
        this.attachChannel(session, event.channel);
      }
    };

    const closeOnFailed = () => {
      const state = pc.connectionState;
      const iceState = pc.iceConnectionState;
      if (
        state === 'failed' ||
        state === 'closed' ||
        iceState === 'failed' ||
        iceState === 'closed'
      ) {
        this.closeSession(userId);
      }
    };
    pc.onconnectionstatechange = closeOnFailed;
    pc.oniceconnectionstatechange = closeOnFailed;

    this.sessions.set(userId, session);
    return session;
  }

  private attachChannel(session: Session, channel: DataChannelLike): void {
    session.channel = channel;
    channel.onopen = () => {
      session.resolveOpen?.(true);
      session.resolveOpen = undefined;
      session.openPromise = null;
    };
    channel.onclose = () => this.closeSession(session.userId);
    channel.onerror = () => {
      session.resolveOpen?.(false);
      session.resolveOpen = undefined;
    };
    channel.onmessage = (event) => {
      if (typeof event.data !== 'string') return;
      this.messageListeners.forEach((listener) => listener(event.data as string, session.userId));
    };
  }

  private waitForOpen(session: Session, timeoutMs: number): Promise<boolean> {
    return new Promise((resolve) => {
      if (session.channel?.readyState === 'open') {
        resolve(true);
        return;
      }
      const timer = setTimeout(() => {
        session.resolveOpen = undefined;
        this.closeSession(session.userId);
        resolve(false);
      }, timeoutMs);
      session.resolveOpen = (ok) => {
        clearTimeout(timer);
        resolve(ok);
      };
    });
  }

  private async handleRawSignal(raw: string): Promise<void> {
    let signal: DataChannelSignal;
    try {
      signal = JSON.parse(raw) as DataChannelSignal;
    } catch {
      return;
    }

    const fromUserId = signal.from_user_id;
    const sessionId = signal.session_id;
    if (!fromUserId || !sessionId) return;

    if (signal.type === 'line_sync_dc_offer' && signal.offer) {
      await this.handleOffer(fromUserId, sessionId, signal.offer);
      return;
    }

    const session = this.sessions.get(fromUserId);
    if (!session || session.sessionId !== sessionId) return;

    if (signal.type === 'line_sync_dc_answer' && signal.answer) {
      try {
        await session.pc.setRemoteDescription(
          new RTCSessionDescription(normalizeSessionDescription(signal.answer))
        );
      } catch {
        this.closeSession(fromUserId);
      }
      return;
    }

    if (signal.type === 'line_sync_dc_ice') {
      try {
        await session.pc.addIceCandidate(
          signal.candidate ? new RTCIceCandidate(signal.candidate) : null,
        );
      } catch {
        // Ignore malformed ICE candidates; the connection may still succeed with others.
      }
    }
  }

  private async handleOffer(
    fromUserId: string,
    sessionId: string,
    offer: RTCSessionDescriptionInit,
  ): Promise<void> {
    const session = this.createSession(fromUserId, sessionId);
    const started = Date.now();
    session.calleeNegotiationStartMs = started;
    session.openPromise = this.waitForOpen(session, DEFAULT_OPEN_TIMEOUT_MS);
    void session.openPromise.then((ok) => {
      const t0 = session.calleeNegotiationStartMs;
      if (t0 == null) return;
      session.calleeNegotiationStartMs = undefined;
      recordLineSyncDcIncomingOpen({ ok, durationMs: Date.now() - t0 });
    });
    try {
      await session.pc.setRemoteDescription(
        new RTCSessionDescription(normalizeSessionDescription(offer))
      );
      const answer = await session.pc.createAnswer();
      await session.pc.setLocalDescription(answer);
      const localDescription = session.pc.localDescription;
      if (!localDescription) {
        this.closeSession(fromUserId);
        return;
      }
      SignalingService.sendLineSyncDataChannelAnswer(fromUserId, sessionId, {
        type: 'answer',
        sdp: localDescription.sdp ?? '',
      });
    } catch {
      this.closeSession(fromUserId);
    }
  }

  private closeSession(userId: string): void {
    const session = this.sessions.get(userId);
    if (!session) return;
    session.resolveOpen?.(false);
    try {
      session.channel?.close?.();
    } catch {
      // Ignore close errors.
    }
    try {
      session.pc.close();
    } catch {
      // Ignore close errors.
    }
    this.sessions.delete(userId);
  }
}

export const LineSyncDataChannelService = new LineSyncDataChannelServiceClass();
