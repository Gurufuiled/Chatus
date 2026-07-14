/**
 * Convert a MediaRecorder WebM (or other) blob to a progressive MP4 that
 * Windows Movies & TV can seek and trim.
 *
 * Why not trust MediaRecorder's native `video/mp4`?
 * Chrome/Edge often emit fragmented MP4 (or files with broken timescale /
 * duration). Movies & TV then shows absurd trim times (tens of thousands of
 * hours) and the scrubber snaps back to 0.
 *
 * Why not only ts-ebml WebM remux?
 * That fixes Chrome/VLC seeking, but Media Foundation (Movies & TV) still
 * mishandles many WebM files. Progressive H.264/AAC MP4 with `fastStart:
 * 'in-memory'` (moov at the front) is the reliable desktop-player format.
 *
 * Mediabunny is loaded lazily so the embed startup path stays light.
 */

export async function convertRecordingToMp4(blob: Blob): Promise<Blob | null> {
  if (blob.size === 0) return null;

  try {
    const {
      Input,
      Output,
      Conversion,
      ALL_FORMATS,
      BlobSource,
      BufferTarget,
      Mp4OutputFormat,
      canEncodeVideo,
      canEncodeAudio,
    } = await import('mediabunny');

    const input = new Input({
      source: new BlobSource(blob),
      formats: ALL_FORMATS,
    });
    const target = new BufferTarget();
    const output = new Output({
      // Progressive MP4: moov atom first so Movies & TV gets real duration/seek.
      // Never use fastStart: 'fragmented' — that recreates the MediaRecorder problem.
      format: new Mp4OutputFormat({ fastStart: 'in-memory' }),
      target,
    });

    const preferAvc = await canEncodeVideo('avc');
    const preferAac = await canEncodeAudio('aac');

    const conversion = await Conversion.init({
      input,
      output,
      ...(preferAvc ? { video: { codec: 'avc' as const } } : {}),
      ...(preferAac ? { audio: { codec: 'aac' as const } } : {}),
    });

    if (!conversion.isValid) {
      console.warn(
        '[Recording] MP4 conversion invalid',
        conversion.discardedTracks?.map((t) => t.reason),
      );
      return null;
    }

    await conversion.execute();
    const buffer = target.buffer;
    if (!buffer || buffer.byteLength === 0) {
      console.warn('[Recording] MP4 conversion produced empty buffer');
      return null;
    }
    return new Blob([buffer], { type: 'video/mp4' });
  } catch (err) {
    console.warn('[Recording] MP4 conversion failed, will fall back', err);
    return null;
  }
}
