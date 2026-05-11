import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import {
  ActivityIndicator,
  Pressable,
  StyleSheet,
  Text,
  View,
} from 'react-native';
import { Image } from 'expo-image';
import { resolveMediaUrl } from '../config';
import {
  resolvePeerFirstMediaUri,
  type PeerFirstMediaResolveResult,
} from '../services/LineSyncMediaResolver';
import { FileBubble } from './FileBubble';
import { ImageBubble } from './ImageBubble';
import { VideoBubble } from './VideoBubble';
import { VideoNoteBubble } from './VideoNoteBubble';
import { VoiceBubble } from './VoiceBubble';

export function canPeerResolveMediaUri(uri: string | null | undefined): boolean {
  const trimmed = uri?.trim() ?? '';
  return (
    /^https?:\/\//i.test(trimmed) ||
    trimmed.startsWith('/uploads/') ||
    trimmed.startsWith('/api/uploads/') ||
    trimmed.startsWith('uploads/')
  );
}

/** Same chat/thread id as LineSync `line_id` (typically `Message.chat_id`). */
export function usePeerFirstResolvedUri(
  lineId: string | null | undefined,
  rawUri: string | null | undefined
): string {
  const rawKey = rawUri?.trim() ?? '';
  const effectiveLineId = lineId?.trim() ?? '';
  const fallbackUri = useMemo(
    () => resolveMediaUrl(rawKey || null) ?? rawKey,
    [rawKey]
  );
  const [resolvedUri, setResolvedUri] = useState(fallbackUri);

  useEffect(() => {
    let cancelled = false;
    setResolvedUri(fallbackUri);

    if (!effectiveLineId || !canPeerResolveMediaUri(rawKey)) {
      return () => {
        cancelled = true;
      };
    }

    void resolvePeerFirstMediaUri({
      lineId: effectiveLineId,
      serverUri: rawKey,
    }).then((result) => {
      if (!cancelled && result.uri) {
        setResolvedUri(result.uri);
      }
    });

    return () => {
      cancelled = true;
    };
  }, [fallbackUri, effectiveLineId, rawKey]);

  return resolvedUri;
}

export type PeerFirstFileResolveState = {
  uri: string;
  source: PeerFirstMediaResolveResult['source'];
  peerLoading: boolean;
  progress: { received: number; total: number } | null;
  cancel: () => void;
};

/** Cancel/progress + dedupe bypass (signal); use for large files only. */
export function usePeerFirstFileResolve(
  lineId: string | null | undefined,
  rawUri: string | null | undefined,
): PeerFirstFileResolveState {
  const rawKey = rawUri?.trim() ?? '';
  const effectiveLineId = lineId?.trim() ?? '';
  const fallbackUri = useMemo(
    () => resolveMediaUrl(rawKey || null) ?? rawKey,
    [rawKey],
  );

  const [uri, setUri] = useState(fallbackUri);
  const [source, setSource] = useState<PeerFirstMediaResolveResult['source']>('server');
  const [peerLoading, setPeerLoading] = useState(false);
  const [progress, setProgress] = useState<{ received: number; total: number } | null>(null);
  const abortRef = useRef<AbortController | null>(null);

  useEffect(() => {
    let cancelled = false;
    abortRef.current?.abort();
    const ac = new AbortController();
    abortRef.current = ac;

    setUri(fallbackUri);
    setProgress(null);

    if (!effectiveLineId || !canPeerResolveMediaUri(rawKey)) {
      setPeerLoading(false);
      setSource(rawKey ? 'server' : 'none');
      return () => {
        cancelled = true;
        ac.abort();
      };
    }

    setPeerLoading(true);
    setSource('server');

    void resolvePeerFirstMediaUri({
      lineId: effectiveLineId,
      serverUri: rawKey,
      signal: ac.signal,
      onProgress: (received, total) => {
        if (!cancelled) {
          setProgress({ received, total });
        }
      },
    }).then((result) => {
      if (cancelled) return;
      if (result.uri) {
        setUri(result.uri);
      }
      setSource(result.source);
      setPeerLoading(false);
      setProgress(null);
    });

    return () => {
      cancelled = true;
      ac.abort();
    };
  }, [fallbackUri, effectiveLineId, rawKey]);

  const cancel = useCallback(() => {
    abortRef.current?.abort();
  }, []);

  return { uri, source, peerLoading, progress, cancel };
}

export function PeerFirstImageBubble({
  lineId,
  serverUri,
  ...props
}: Omit<React.ComponentProps<typeof ImageBubble>, 'uri'> & { lineId: string; serverUri: string }) {
  const uri = usePeerFirstResolvedUri(lineId, serverUri);
  return <ImageBubble {...props} uri={uri} />;
}

export function PeerFirstVideoBubble({
  lineId,
  serverUri,
  ...props
}: Omit<React.ComponentProps<typeof VideoBubble>, 'uri'> & { lineId: string; serverUri: string }) {
  const uri = usePeerFirstResolvedUri(lineId, serverUri);
  return <VideoBubble {...props} uri={uri} />;
}

export function PeerFirstVideoNoteBubble({
  lineId,
  serverUri,
  ...props
}: Omit<React.ComponentProps<typeof VideoNoteBubble>, 'uri'> & { lineId: string; serverUri: string }) {
  const uri = usePeerFirstResolvedUri(lineId, serverUri);
  return <VideoNoteBubble {...props} uri={uri} />;
}

export function PeerFirstVoiceBubble({
  lineId,
  serverUri,
  ...props
}: Omit<React.ComponentProps<typeof VoiceBubble>, 'uri'> & { lineId: string; serverUri: string }) {
  const uri = usePeerFirstResolvedUri(lineId, serverUri);
  return <VoiceBubble {...props} uri={uri} />;
}

export function PeerFirstFileBubble({
  lineId,
  serverUri,
  ...props
}: Omit<React.ComponentProps<typeof FileBubble>, 'uri'> & { lineId: string; serverUri: string }) {
  const st = usePeerFirstFileResolve(lineId, serverUri);
  const sourceBadge =
    !st.peerLoading && st.source === 'peer' ? (
      <Text style={peerFirstBadgeStyles.text}>P2P</Text>
    ) : !st.peerLoading && st.source === 'cache' ? (
      <Text style={peerFirstBadgeStyles.text}>Кэш</Text>
    ) : null;

  const ratio =
    st.progress && st.progress.total > 0 ? st.progress.received / st.progress.total : 0;

  return (
    <View style={peerFirstBadgeStyles.wrap}>
      <FileBubble {...props} uri={st.uri} />
      {st.peerLoading ? (
        <View style={peerFirstBadgeStyles.overlay} pointerEvents="auto">
          <View style={peerFirstBadgeStyles.overlayInner} pointerEvents="auto">
            <ActivityIndicator color="#fff" />
            <View style={peerFirstBadgeStyles.track}>
              <View style={[peerFirstBadgeStyles.fill, { width: `${Math.round(ratio * 100)}%` }]} />
            </View>
            <Pressable
              onPress={st.cancel}
              hitSlop={8}
              style={peerFirstBadgeStyles.cancelBtn}
              accessibilityRole="button"
              accessibilityLabel="Отменить загрузку файла"
            >
              <Text style={peerFirstBadgeStyles.cancelText}>Отмена</Text>
            </Pressable>
          </View>
        </View>
      ) : null}
      {sourceBadge ? <View style={peerFirstBadgeStyles.badge}>{sourceBadge}</View> : null}
    </View>
  );
}

export function PeerFirstAlbumImage({
  lineId,
  rawUri,
  style,
}: {
  lineId: string;
  rawUri: string;
  style: object;
}) {
  const uri = usePeerFirstResolvedUri(lineId, rawUri);
  return <Image source={{ uri }} style={style} contentFit="cover" cachePolicy="disk" />;
}

const peerFirstBadgeStyles = StyleSheet.create({
  wrap: {
    position: 'relative',
    alignSelf: 'stretch',
  },
  overlay: {
    ...StyleSheet.absoluteFillObject,
    backgroundColor: 'rgba(0,0,0,0.38)',
    justifyContent: 'center',
    alignItems: 'center',
    zIndex: 4,
    borderRadius: 12,
  },
  overlayInner: {
    alignItems: 'center',
    paddingHorizontal: 16,
    width: '100%',
  },
  track: {
    height: 4,
    width: '72%',
    borderRadius: 2,
    backgroundColor: 'rgba(255,255,255,0.35)',
    overflow: 'hidden',
    marginTop: 10,
    marginBottom: 4,
  },
  fill: {
    height: '100%',
    backgroundColor: '#fff',
  },
  cancelBtn: {
    paddingVertical: 6,
    paddingHorizontal: 12,
  },
  cancelText: {
    color: '#fff',
    fontWeight: '600',
    fontSize: 14,
  },
  badge: {
    position: 'absolute',
    top: 8,
    right: 8,
    zIndex: 3,
    paddingHorizontal: 6,
    paddingVertical: 2,
    borderRadius: 6,
    backgroundColor: 'rgba(0,0,0,0.42)',
  },
  text: {
    color: '#fff',
    fontSize: 10,
    fontWeight: '700',
    letterSpacing: 0.4,
  },
});
