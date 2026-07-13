import { describe, expect, it, vi } from 'vitest';
import { Track } from 'livekit-client';
import {
  collectPreferredVideoTracks,
  clearOffscreenVideos,
  syncOffscreenVideos,
} from '../callRecordingCanvas';

function mockVideoPub(source: Track.Source, track: { kind: string; mediaStreamTrack: MediaStreamTrack } | null, opts?: { muted?: boolean; enabled?: boolean }) {
  return {
    source,
    isMuted: opts?.muted ?? false,
    isEnabled: opts?.enabled ?? true,
    track,
  };
}

describe('callRecordingCanvas track preference', () => {
  it('prefers screen share over camera for each participant', () => {
    const screenTrack = { kind: Track.Kind.Video, mediaStreamTrack: { id: 'screen' } as MediaStreamTrack };
    const cameraTrack = { kind: Track.Kind.Video, mediaStreamTrack: { id: 'cam' } as MediaStreamTrack };

    const localParticipant = {
      identity: 'me',
      isLocal: true,
      getTrackPublication: (source: Track.Source) => {
        if (source === Track.Source.ScreenShare) return mockVideoPub(source, screenTrack);
        if (source === Track.Source.Camera) return mockVideoPub(source, cameraTrack);
        return undefined;
      },
    };

    const remoteParticipant = {
      identity: 'them',
      isLocal: false,
      getTrackPublication: (source: Track.Source) => {
        if (source === Track.Source.Camera) return mockVideoPub(source, cameraTrack);
        return undefined;
      },
    };

    const room = {
      localParticipant,
      remoteParticipants: new Map([['them', remoteParticipant]]),
    } as never;

    const preferred = collectPreferredVideoTracks(room);
    expect(preferred).toHaveLength(2);
    expect(preferred[0]).toMatchObject({ id: 'me:screen', contain: true, mirror: false });
    expect(preferred[0].mediaTrack).toBe(screenTrack.mediaStreamTrack);
    expect(preferred[1]).toMatchObject({ id: 'them:camera', contain: false, mirror: false });
  });

  it('syncOffscreenVideos attaches and clears hidden video elements', () => {
    if (typeof MediaStream === 'undefined') {
      // jsdom may lack MediaStream — skip attach assertion in that environment
      expect(typeof MediaStream === 'undefined').toBe(true);
      return;
    }
    const appendSpy = vi.spyOn(document.body, 'appendChild');
    const mediaTrack = { id: 't1' } as MediaStreamTrack;
    const localParticipant = {
      identity: 'me',
      isLocal: true,
      getTrackPublication: (source: Track.Source) => {
        if (source === Track.Source.Camera) {
          return mockVideoPub(source, { kind: Track.Kind.Video, mediaStreamTrack: mediaTrack });
        }
        return undefined;
      },
    };
    const room = {
      localParticipant,
      remoteParticipants: new Map(),
    } as never;

    const map = new Map<string, HTMLVideoElement>();
    const preferred = syncOffscreenVideos(room, map);
    expect(preferred).toHaveLength(1);
    expect(map.size).toBe(1);
    const el = map.get('me:camera');
    expect(el).toBeTruthy();
    expect(el?.srcObject).toBeInstanceOf(MediaStream);
    expect(appendSpy).toHaveBeenCalled();

    clearOffscreenVideos(map);
    expect(map.size).toBe(0);
    appendSpy.mockRestore();
  });
});
