import { describe, expect, it, vi, beforeEach, afterEach } from 'vitest';
import { renderHook, act, waitFor } from '@testing-library/react';
import { useVoiceRecorder } from '@/features/conversation/useVoiceRecorder';
import { useComposerStore } from '@/stores/composerStore';

const uploadMutate = vi.fn();

vi.mock('@/queries/media.queries', () => ({
  useUploadVoiceMutation: () => ({
    mutate: uploadMutate,
    isPending: false,
  }),
}));

vi.mock('@/utils/microphoneAccess', () => ({
  formatMicrophoneAccessError: () => 'Нет доступа к микрофону',
  notifyParentMicrophoneRequired: vi.fn(),
}));

class MockMediaRecorder {
  static isTypeSupported = vi.fn(() => true);
  state: RecordingState = 'inactive';
  mimeType = 'audio/webm';
  ondataavailable: ((e: { data: Blob }) => void) | null = null;
  onstop: (() => void) | null = null;
  onerror: (() => void) | null = null;

  constructor(_stream: MediaStream, _opts?: MediaRecorderOptions) {}

  start() {
    this.state = 'recording';
    queueMicrotask(() => this.ondataavailable?.({ data: new Blob(['audio'], { type: 'audio/webm' }) }));
  }

  requestData() {
    this.ondataavailable?.({ data: new Blob(['audio'], { type: 'audio/webm' }) });
  }

  stop() {
    this.state = 'inactive';
    queueMicrotask(() => this.onstop?.());
  }
}

describe('useVoiceRecorder', () => {
  const originalMediaDevices = navigator.mediaDevices;

  beforeEach(() => {
    uploadMutate.mockReset();
    useComposerStore.setState({
      voiceRecordingState: 'idle',
      voiceRecordingChatId: null,
      composerErrors: {},
      replyChatId: null,
      replyToMessageId: null,
    });

    vi.stubGlobal('MediaRecorder', MockMediaRecorder);
    Object.defineProperty(navigator, 'mediaDevices', {
      configurable: true,
      value: {
        getUserMedia: vi.fn().mockResolvedValue({
          getTracks: () => [{ stop: vi.fn() }],
        }),
      },
    });
  });

  afterEach(() => {
    Object.defineProperty(navigator, 'mediaDevices', {
      configurable: true,
      value: originalMediaDevices,
    });
  });

  it('starts recording and updates store state', async () => {
    const { result } = renderHook(() => useVoiceRecorder('chat-1'));

    await act(async () => {
      await result.current.startRecording();
    });

    expect(result.current.isRecording).toBe(true);
    expect(useComposerStore.getState().voiceRecordingChatId).toBe('chat-1');
  });

  it('uploads voice blob on finishRecording(true)', async () => {
    const { result } = renderHook(() => useVoiceRecorder('chat-1'));

    await act(async () => {
      await result.current.startRecording();
    });

    await act(async () => {
      result.current.finishRecording(true);
    });

    await waitFor(() => {
      expect(uploadMutate).toHaveBeenCalledWith(
        expect.objectContaining({
          chatId: 'chat-1',
          blob: expect.any(Blob),
        }),
        expect.objectContaining({ onSettled: expect.any(Function) }),
      );
    });
  });

  it('shows Russian error for too-short recording', async () => {
    class EmptyRecorder extends MockMediaRecorder {
      start() {
        this.state = 'recording';
      }
      requestData() {
        this.ondataavailable?.({ data: new Blob([], { type: 'audio/webm' }) });
      }
    }
    vi.stubGlobal('MediaRecorder', EmptyRecorder);

    const { result } = renderHook(() => useVoiceRecorder('chat-short'));

    await act(async () => {
      await result.current.startRecording();
    });
    await act(async () => {
      result.current.finishRecording(true);
    });

    expect(useComposerStore.getState().composerErrors['chat-short']).toBe('Запись слишком короткая');
    expect(uploadMutate).not.toHaveBeenCalled();
  });

  it('sets microphone error when getUserMedia fails', async () => {
    vi.mocked(navigator.mediaDevices.getUserMedia).mockRejectedValue(
      new DOMException('denied', 'NotAllowedError'),
    );

    const { result } = renderHook(() => useVoiceRecorder('chat-mic'));

    await act(async () => {
      await result.current.startRecording();
    });

    expect(useComposerStore.getState().composerErrors['chat-mic']).toBe('Нет доступа к микрофону');
    expect(result.current.isRecording).toBe(false);
  });

  it('cancels recording without upload', async () => {
    const { result } = renderHook(() => useVoiceRecorder('chat-cancel'));

    await act(async () => {
      await result.current.startRecording();
    });
    await act(async () => {
      result.current.cancelRecording();
    });

    expect(result.current.isRecording).toBe(false);
    expect(uploadMutate).not.toHaveBeenCalled();
  });
});
