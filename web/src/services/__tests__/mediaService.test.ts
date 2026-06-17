import { describe, expect, it, vi, beforeEach } from 'vitest';
import {
  MAX_UPLOAD_BYTES,
  buildMediaPayload,
  inferMsgTypeFromUpload,
  resolveMediaUrl,
  uploadFile,
  uploadVoiceBlob,
  type UploadResult,
} from '@/services/mediaService';
import { setAccessToken } from '@/services/apiClient';

const uploadResult: UploadResult = {
  url: '/uploads/test.jpg',
  file_name: 'test.jpg',
  mime_type: 'image/jpeg',
  file_size: 1234,
  sha256: 'abc',
  media_kind: 'image',
  width: 100,
  height: 100,
  duration_ms: null,
  thumbnail_path: null,
  waveform: [],
};

describe('mediaService', () => {
  beforeEach(() => {
    setAccessToken(null);
    vi.stubGlobal('fetch', vi.fn());
  });

  describe('resolveMediaUrl', () => {
    it('returns absolute urls unchanged', () => {
      expect(resolveMediaUrl('https://cdn.example.com/a.jpg')).toBe(
        'https://cdn.example.com/a.jpg',
      );
    });

    it('prefixes relative paths with window origin', () => {
      expect(resolveMediaUrl('/uploads/a.jpg')).toBe(
        `${window.location.origin}/uploads/a.jpg`,
      );
    });
  });

  describe('buildMediaPayload', () => {
    it('maps upload result to message media input', () => {
      const payload = buildMediaPayload({
        ...uploadResult,
        thumbnail_path: '/uploads/thumb.jpg',
        duration_ms: 5000,
        waveform: [1, 2, 3],
      });
      expect(payload).toEqual({
        url: '/uploads/test.jpg',
        mime_type: 'image/jpeg',
        file_name: 'test.jpg',
        file_size: 1234,
        sha256: 'abc',
        width: 100,
        height: 100,
        duration_ms: 5000,
        thumbnail_url: '/uploads/thumb.jpg',
        waveform: [1, 2, 3],
      });
    });

    it('omits empty waveform array', () => {
      const payload = buildMediaPayload(uploadResult);
      expect(payload.waveform).toBeUndefined();
    });
  });

  describe('inferMsgTypeFromUpload', () => {
    it('prefers server media_kind', () => {
      const file = new File(['x'], 'a.webm', { type: 'audio/webm' });
      expect(inferMsgTypeFromUpload(file, { ...uploadResult, media_kind: 'voice' })).toBe(
        'voice',
      );
    });

    it('falls back to file mime type', () => {
      const image = new File(['x'], 'a.png', { type: 'image/png' });
      expect(inferMsgTypeFromUpload(image, { ...uploadResult, media_kind: '' })).toBe('image');
    });
  });

  describe('uploadFile', () => {
    it('rejects files over size limit', async () => {
      const huge = new Blob(['x'], { type: 'image/jpeg' });
      Object.defineProperty(huge, 'size', { value: MAX_UPLOAD_BYTES + 1 });
      await expect(uploadFile(huge)).rejects.toThrow(/100MB/);
    });

    it('maps server save failure to Russian message', async () => {
      vi.mocked(fetch).mockResolvedValue(
        new Response(JSON.stringify({ message: 'Failed to save file' }), { status: 500 }),
      );
      const file = new File(['x'], 'a.jpg', { type: 'image/jpeg' });
      await expect(uploadFile(file)).rejects.toThrow('Не удалось сохранить файл на сервере');
    });

    it('sends auth header when token is set', async () => {
      setAccessToken('token-123');
      vi.mocked(fetch).mockResolvedValue(new Response(JSON.stringify(uploadResult), { status: 200 }));
      const file = new File(['x'], 'a.jpg', { type: 'image/jpeg' });
      await uploadFile(file);
      const [, init] = vi.mocked(fetch).mock.calls[0];
      expect((init?.headers as Headers).get('Authorization')).toBe('Bearer token-123');
    });
  });

  describe('uploadVoiceBlob', () => {
    it('retries mime candidates until one succeeds', async () => {
      vi.mocked(fetch)
        .mockResolvedValueOnce(new Response('fail', { status: 400 }))
        .mockResolvedValueOnce(new Response(JSON.stringify(uploadResult), { status: 200 }));

      const blob = new Blob(['audio'], { type: 'audio/webm' });
      const result = await uploadVoiceBlob(blob);
      expect(result.url).toBe('/uploads/test.jpg');
      expect(fetch).toHaveBeenCalledTimes(2);
    });
  });
});
