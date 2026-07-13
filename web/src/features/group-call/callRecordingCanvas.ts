/**
 * Canvas compositor for local call recording.
 * - Prefer LiveKit camera/screen tracks (screen share wins per participant)
 * - Fall back to DOM `.group-call-tile` videos / avatars / names
 * - Re-synced every frame so mid-call screen share is picked up
 */

import type { Participant, Room } from 'livekit-client';
import { Track } from 'livekit-client';

export const STAGE_SELECTOR = '.group-call-stage';
export const TILE_SELECTOR = '.group-call-stage .group-call-tile';
export const VIDEO_SELECTOR = 'video.group-call-tile__video';

const MAX_CANVAS_WIDTH = 1280;

export type OffscreenVideoMap = Map<string, HTMLVideoElement>;

type PreferredVideo = {
  id: string;
  mediaTrack: MediaStreamTrack;
  mirror: boolean;
  contain: boolean;
};

function readPreferredVideoTrack(participant: Participant): PreferredVideo | null {
  const screenPub = participant.getTrackPublication(Track.Source.ScreenShare);
  const screenTrack = screenPub?.track;
  if (
    screenTrack?.kind === Track.Kind.Video &&
    screenPub &&
    !screenPub.isMuted &&
    screenPub.isEnabled &&
    screenTrack.mediaStreamTrack
  ) {
    return {
      id: `${participant.identity}:screen`,
      mediaTrack: screenTrack.mediaStreamTrack,
      mirror: false,
      contain: true,
    };
  }

  const camPub = participant.getTrackPublication(Track.Source.Camera);
  const camTrack = camPub?.track;
  if (
    camTrack?.kind === Track.Kind.Video &&
    camPub &&
    !camPub.isMuted &&
    camPub.isEnabled &&
    camTrack.mediaStreamTrack
  ) {
    return {
      id: `${participant.identity}:camera`,
      mediaTrack: camTrack.mediaStreamTrack,
      mirror: participant.isLocal,
      contain: false,
    };
  }

  return null;
}

export function collectPreferredVideoTracks(room: Room): PreferredVideo[] {
  const out: PreferredVideo[] = [];
  const local = readPreferredVideoTrack(room.localParticipant);
  if (local) out.push(local);
  for (const participant of room.remoteParticipants.values()) {
    const preferred = readPreferredVideoTrack(participant);
    if (preferred) out.push(preferred);
  }
  return out;
}

/** Keep hidden <video> elements attached to current LiveKit video tracks. */
export function syncOffscreenVideos(room: Room, map: OffscreenVideoMap): PreferredVideo[] {
  const preferred = collectPreferredVideoTracks(room);
  const wanted = new Set(preferred.map((p) => p.id));

  for (const [id, el] of map) {
    if (wanted.has(id)) continue;
    try {
      el.srcObject = null;
      el.remove();
    } catch {
      // ignore
    }
    map.delete(id);
  }

  for (const item of preferred) {
    let el = map.get(item.id);
    if (!el) {
      el = document.createElement('video');
      el.muted = true;
      el.playsInline = true;
      el.autoplay = true;
      el.setAttribute('aria-hidden', 'true');
      // Keep in DOM for some browsers to decode frames, but invisible.
      el.style.cssText =
        'position:fixed;left:-9999px;top:0;width:2px;height:2px;opacity:0;pointer-events:none';
      document.body.appendChild(el);
      map.set(item.id, el);
    }

    const current = el.srcObject;
    const currentTrack =
      typeof MediaStream !== 'undefined' && current instanceof MediaStream
        ? current.getVideoTracks()[0]
        : undefined;
    if (currentTrack !== item.mediaTrack) {
      if (typeof MediaStream === 'undefined') {
        continue;
      }
      el.srcObject = new MediaStream([item.mediaTrack]);
      void el.play().catch(() => undefined);
    }
  }

  return preferred;
}

export function clearOffscreenVideos(map: OffscreenVideoMap): void {
  for (const [, el] of map) {
    try {
      el.srcObject = null;
      el.remove();
    } catch {
      // ignore
    }
  }
  map.clear();
}

function roundRectPath(
  ctx: CanvasRenderingContext2D,
  x: number,
  y: number,
  w: number,
  h: number,
  r: number,
): void {
  const radius = Math.max(0, Math.min(r, w / 2, h / 2));
  ctx.beginPath();
  ctx.moveTo(x + radius, y);
  ctx.arcTo(x + w, y, x + w, y + h, radius);
  ctx.arcTo(x + w, y + h, x, y + h, radius);
  ctx.arcTo(x, y + h, x, y, radius);
  ctx.arcTo(x, y, x + w, y, radius);
  ctx.closePath();
}

function canDrawVideo(video: HTMLVideoElement): boolean {
  return video.readyState >= 2 && video.videoWidth > 0 && video.videoHeight > 0;
}

function drawVideoCover(
  ctx: CanvasRenderingContext2D,
  video: HTMLVideoElement,
  x: number,
  y: number,
  w: number,
  h: number,
  mirror: boolean,
  contain: boolean,
): void {
  const vw = video.videoWidth;
  const vh = video.videoHeight;
  if (vw <= 0 || vh <= 0) return;

  let sx = 0;
  let sy = 0;
  let sw = vw;
  let sh = vh;

  if (contain) {
    const scale = Math.min(w / vw, h / vh);
    const dw = vw * scale;
    const dh = vh * scale;
    const dx = x + (w - dw) / 2;
    const dy = y + (h - dh) / 2;
    ctx.save();
    roundRectPath(ctx, x, y, w, h, Math.min(16, w / 4, h / 4));
    ctx.clip();
    ctx.fillStyle = '#0a0d12';
    ctx.fillRect(x, y, w, h);
    if (mirror) {
      ctx.translate(dx + dw, dy);
      ctx.scale(-1, 1);
      ctx.drawImage(video, 0, 0, dw, dh);
    } else {
      ctx.drawImage(video, dx, dy, dw, dh);
    }
    ctx.restore();
    return;
  }

  // cover
  const scale = Math.max(w / vw, h / vh);
  const dw = vw * scale;
  const dh = vh * scale;
  sx = (dw - w) / 2 / scale;
  sy = (dh - h) / 2 / scale;
  sw = w / scale;
  sh = h / scale;

  ctx.save();
  roundRectPath(ctx, x, y, w, h, Math.min(16, w / 4, h / 4));
  ctx.clip();
  if (mirror) {
    ctx.translate(x + w, y);
    ctx.scale(-1, 1);
    ctx.drawImage(video, sx, sy, sw, sh, 0, 0, w, h);
  } else {
    ctx.drawImage(video, sx, sy, sw, sh, x, y, w, h);
  }
  ctx.restore();
}

function drawAvatarTileFallback(
  ctx: CanvasRenderingContext2D,
  tile: Element,
  x: number,
  y: number,
  w: number,
  h: number,
  scale: number,
): void {
  ctx.save();
  roundRectPath(ctx, x, y, w, h, Math.min(16 * scale, w / 4, h / 4));
  ctx.clip();
  ctx.fillStyle = '#1a1f26';
  ctx.fillRect(x, y, w, h);

  const avatarImg = tile.querySelector('.group-call-tile__avatar') as HTMLImageElement | null;
  const initialEl = tile.querySelector('.group-call-tile__initial') as HTMLElement | null;
  const nameEl = tile.querySelector('.group-call-tile__name') as HTMLElement | null;

  if (avatarImg && avatarImg.complete && avatarImg.naturalWidth > 0) {
    try {
      ctx.drawImage(avatarImg, x, y, w, h);
    } catch {
      // ignore tainted / broken image
    }
  } else {
    const initial = (initialEl?.textContent || nameEl?.textContent || '?').trim().charAt(0).toUpperCase() || '?';
    ctx.fillStyle = 'rgba(91, 141, 239, 0.35)';
    ctx.fillRect(x, y, w, h);
    ctx.fillStyle = 'rgba(255,255,255,0.92)';
    ctx.font = `700 ${Math.max(18, Math.round(h * 0.28))}px sans-serif`;
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.fillText(initial, x + w / 2, y + h / 2 - h * 0.06);
  }

  const name = nameEl?.textContent?.trim();
  if (name) {
    const gradH = h * 0.42;
    const grad = ctx.createLinearGradient(0, y + h - gradH, 0, y + h);
    grad.addColorStop(0, 'rgba(0,0,0,0)');
    grad.addColorStop(1, 'rgba(0,0,0,0.72)');
    ctx.fillStyle = grad;
    ctx.fillRect(x, y + h - gradH, w, gradH);
    ctx.fillStyle = '#fff';
    ctx.font = `600 ${Math.max(11, Math.round(14 * scale))}px sans-serif`;
    ctx.textAlign = 'left';
    ctx.textBaseline = 'alphabetic';
    ctx.fillText(name, x + 10 * scale, y + h - 10 * scale, w - 20 * scale);
  }

  ctx.restore();
}

function findOffscreenForDomVideo(
  video: HTMLVideoElement,
  offscreen: OffscreenVideoMap,
  preferred: PreferredVideo[],
): { el: HTMLVideoElement; mirror: boolean; contain: boolean } | null {
  const stream = video.srcObject;
  const domTrack =
    typeof MediaStream !== 'undefined' && stream instanceof MediaStream
      ? stream.getVideoTracks()[0]
      : undefined;
  if (!domTrack) return null;
  for (const item of preferred) {
    if (item.mediaTrack !== domTrack) continue;
    const el = offscreen.get(item.id);
    if (el && canDrawVideo(el)) {
      return { el, mirror: item.mirror, contain: item.contain };
    }
  }
  return null;
}

export type CanvasLayoutLock = {
  /** When true, do not resize the capture canvas (avoids black frames mid-recording). */
  locked: boolean;
  width: number;
  height: number;
  /** Scale used to map stage CSS pixels → canvas pixels at lock time (or current). */
  scale: number;
};

function ensureCanvasLayout(
  canvas: HTMLCanvasElement,
  stage: HTMLElement | null,
  layout: CanvasLayoutLock | null,
): { layout: CanvasLayoutLock; stageW: number; stageH: number } {
  const stageW = Math.max(1, stage?.clientWidth ?? layout?.width ?? canvas.width);
  const stageH = Math.max(1, stage?.clientHeight ?? layout?.height ?? canvas.height);

  if (layout?.locked && layout.width > 0 && layout.height > 0) {
    if (canvas.width !== layout.width || canvas.height !== layout.height) {
      canvas.width = layout.width;
      canvas.height = layout.height;
    }
    // Letterbox current stage into the locked canvas size.
    const fit = Math.min(layout.width / stageW, layout.height / stageH);
    return {
      layout: { ...layout, scale: fit },
      stageW,
      stageH,
    };
  }

  const scale = Math.min(1, MAX_CANVAS_WIDTH / stageW);
  const targetW = Math.max(2, Math.round(stageW * scale));
  const targetH = Math.max(2, Math.round(stageH * scale));
  if (canvas.width !== targetW || canvas.height !== targetH) {
    canvas.width = targetW;
    canvas.height = targetH;
  }
  const next: CanvasLayoutLock = {
    locked: false,
    width: targetW,
    height: targetH,
    scale,
  };
  return { layout: next, stageW, stageH };
}

function preferredForParticipant(
  preferred: PreferredVideo[],
  participantId: string | null,
): PreferredVideo | undefined {
  if (!participantId) return undefined;
  return (
    preferred.find((p) => p.id === `${participantId}:screen`) ??
    preferred.find((p) => p.id === `${participantId}:camera`)
  );
}

/**
 * Composite the call stage onto the recording canvas.
 * Pass `layout` with `locked: true` after captureStream starts to keep canvas size stable.
 * @returns whether at least one tile/video was drawn, plus the layout used this frame
 */
export function drawStageToCanvas(
  canvas: HTMLCanvasElement,
  ctx: CanvasRenderingContext2D,
  room: Room | null,
  offscreen: OffscreenVideoMap,
  layout: CanvasLayoutLock | null = null,
): { drewSomething: boolean; layout: CanvasLayoutLock } {
  const stage = document.querySelector(STAGE_SELECTOR) as HTMLElement | null;
  const tiles = Array.from(document.querySelectorAll(TILE_SELECTOR)) as HTMLElement[];

  const preferred = room ? syncOffscreenVideos(room, offscreen) : [];
  const ensured = ensureCanvasLayout(canvas, stage, layout);
  const activeLayout = ensured.layout;
  const scale = activeLayout.scale;

  ctx.fillStyle = '#0e1116';
  ctx.fillRect(0, 0, canvas.width, canvas.height);

  // When letterboxing into a locked canvas, center the stage content.
  const contentW = ensured.stageW * scale;
  const contentH = ensured.stageH * scale;
  const offsetX = (canvas.width - contentW) / 2;
  const offsetY = (canvas.height - contentH) / 2;

  const stageRect = stage?.getBoundingClientRect();
  let drewSomething = false;

  if (tiles.length > 0 && stageRect) {
    for (const tile of tiles) {
      const rect = tile.getBoundingClientRect();
      const x = offsetX + (rect.left - stageRect.left) * scale;
      const y = offsetY + (rect.top - stageRect.top) * scale;
      const w = Math.max(1, rect.width * scale);
      const h = Math.max(1, rect.height * scale);
      const participantId = tile.getAttribute('data-participant-id');

      const domVideo = tile.querySelector(VIDEO_SELECTOR) as HTMLVideoElement | null;
      let drawnVideo = false;

      if (domVideo && canDrawVideo(domVideo)) {
        const mirror = domVideo.classList.contains('group-call-tile__video--mirror');
        const contain = domVideo.classList.contains('group-call-tile__video--contain');
        try {
          drawVideoCover(ctx, domVideo, x, y, w, h, mirror, contain);
          drawnVideo = true;
          drewSomething = true;
        } catch {
          // skip
        }
      }

      if (!drawnVideo && domVideo) {
        const fallback = findOffscreenForDomVideo(domVideo, offscreen, preferred);
        if (fallback) {
          try {
            drawVideoCover(ctx, fallback.el, x, y, w, h, fallback.mirror, fallback.contain);
            drawnVideo = true;
            drewSomething = true;
          } catch {
            // skip
          }
        }
      }

      if (!drawnVideo) {
        const item = preferredForParticipant(preferred, participantId);
        const el = item ? offscreen.get(item.id) : undefined;
        if (item && el && canDrawVideo(el)) {
          try {
            drawVideoCover(ctx, el, x, y, w, h, item.mirror, item.contain);
            drawnVideo = true;
            drewSomething = true;
          } catch {
            // skip
          }
        }
      }

      if (!drawnVideo) {
        drawAvatarTileFallback(ctx, tile, x, y, w, h, scale);
        drewSomething = true;
      }
    }
  }

  // If stage tiles missing but LiveKit has video (e.g. screen share before layout), draw a grid.
  if (!drewSomething && preferred.length > 0) {
    const count = preferred.length;
    const cols = count >= 3 ? 2 : 1;
    const rows = Math.ceil(count / cols);
    const gap = 10 * scale;
    const cellW = (canvas.width - gap * (cols + 1)) / cols;
    const cellH = (canvas.height - gap * (rows + 1)) / rows;

    preferred.forEach((item, index) => {
      const el = offscreen.get(item.id);
      if (!el || !canDrawVideo(el)) return;
      const col = index % cols;
      const row = Math.floor(index / cols);
      const x = gap + col * (cellW + gap);
      const y = gap + row * (cellH + gap);
      try {
        drawVideoCover(ctx, el, x, y, cellW, cellH, item.mirror, item.contain);
        drewSomething = true;
      } catch {
        // skip
      }
    });
  }

  if (!drewSomething) {
    ctx.fillStyle = 'rgba(255,255,255,0.55)';
    ctx.font = `${Math.max(14, Math.round(canvas.width * 0.035))}px sans-serif`;
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.fillText('Голосовой чат', canvas.width / 2, canvas.height / 2);
  }

  return { drewSomething, layout: activeLayout };
}
