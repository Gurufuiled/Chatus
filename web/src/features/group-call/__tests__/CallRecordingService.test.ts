import { describe, expect, it } from 'vitest';
import {
  buildCallRecordingFilename,
  isCallRecordingSupported,
  pickRecordingMimeType,
} from '../CallRecordingService';

describe('CallRecordingService helpers', () => {
  it('builds Telemost-style filename', () => {
    const date = new Date(2026, 6, 13, 15, 4); // Jul 13, 2026 15:04 local
    expect(buildCallRecordingFilename(date)).toBe('Запись звонка 2026-07-13 15-04.webm');
  });

  it('reports MediaRecorder support without throwing', () => {
    expect(typeof isCallRecordingSupported()).toBe('boolean');
    const mime = pickRecordingMimeType();
    expect(mime === undefined || mime.startsWith('video/webm')).toBe(true);
  });
});
