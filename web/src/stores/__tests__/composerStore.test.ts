import { beforeEach, describe, expect, it, vi, afterEach } from 'vitest';
import { useComposerStore } from '@/stores/composerStore';

describe('composerStore', () => {
  beforeEach(() => {
    vi.spyOn(URL, 'createObjectURL').mockReturnValue('blob:preview');
    vi.spyOn(URL, 'revokeObjectURL').mockImplementation(() => {});
    vi.spyOn(crypto, 'randomUUID').mockReturnValue('00000000-0000-4000-8000-000000000001');
    useComposerStore.setState({
      drafts: {},
      pendingAttachments: {},
      replyToMessageId: null,
      replyChatId: null,
      composerErrors: {},
      voiceRecordingState: 'idle',
      voiceRecordingChatId: null,
    });
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  it('stores and clears drafts per chat', () => {
    const { setDraft, clearDraft } = useComposerStore.getState();
    setDraft('chat-1', 'Привет');
    expect(useComposerStore.getState().drafts['chat-1']).toBe('Привет');
    clearDraft('chat-1');
    expect(useComposerStore.getState().drafts['chat-1']).toBeUndefined();
  });

  it('stages attachments with preview url', () => {
    const file = new File(['img'], 'photo.jpg', { type: 'image/jpeg' });
    useComposerStore.getState().addPendingAttachment('chat-1', file);
    const list = useComposerStore.getState().pendingAttachments['chat-1'];
    expect(list).toHaveLength(1);
    expect(list![0]).toMatchObject({
      id: '00000000-0000-4000-8000-000000000001',
      file,
      previewUrl: 'blob:preview',
      sendAsFile: false,
    });
  });

  it('enforces max 10 attachments with Russian error', () => {
    const file = new File(['x'], 'f.txt', { type: 'text/plain' });
    for (let i = 0; i < 10; i++) {
      useComposerStore.getState().addPendingAttachment('chat-1', file);
    }
    useComposerStore.getState().addPendingAttachment('chat-1', file);
    expect(useComposerStore.getState().pendingAttachments['chat-1']).toHaveLength(10);
    expect(useComposerStore.getState().composerErrors['chat-1']).toBe(
      'Можно прикрепить не больше 10 файлов',
    );
  });

  it('marks attachment uploaded and removes by id', () => {
    const file = new File(['x'], 'a.jpg', { type: 'image/jpeg' });
    useComposerStore.getState().addPendingAttachment('chat-1', file);
    const id = useComposerStore.getState().pendingAttachments['chat-1']![0].id;
    useComposerStore.getState().markPendingAttachmentUploaded(
      'chat-1',
      id,
      { url: '/uploads/a.jpg' },
      'image',
    );
    const updated = useComposerStore.getState().pendingAttachments['chat-1']![0];
    expect(updated.uploadedMedia?.url).toBe('/uploads/a.jpg');
    expect(updated.uploadedMsgType).toBe('image');

    useComposerStore.getState().removePendingAttachment('chat-1', id);
    expect(useComposerStore.getState().pendingAttachments['chat-1']).toBeUndefined();
    expect(URL.revokeObjectURL).toHaveBeenCalledWith('blob:preview');
  });

  it('tracks reply target per chat', () => {
    useComposerStore.getState().setReply('chat-1', 'msg-42');
    expect(useComposerStore.getState().replyChatId).toBe('chat-1');
    expect(useComposerStore.getState().replyToMessageId).toBe('msg-42');
    useComposerStore.getState().clearReply();
    expect(useComposerStore.getState().replyToMessageId).toBeNull();
  });

  it('auto-clears composer errors after timeout', () => {
    vi.useFakeTimers();
    useComposerStore.getState().setComposerError('chat-1', 'Ошибка отправки');
    expect(useComposerStore.getState().composerErrors['chat-1']).toBe('Ошибка отправки');
    vi.advanceTimersByTime(6000);
    expect(useComposerStore.getState().composerErrors['chat-1']).toBeUndefined();
  });

  it('tracks voice recording state per chat', () => {
    useComposerStore.getState().setVoiceRecording('recording', 'chat-1');
    expect(useComposerStore.getState().voiceRecordingState).toBe('recording');
    expect(useComposerStore.getState().voiceRecordingChatId).toBe('chat-1');
    useComposerStore.getState().setVoiceRecording('idle');
    expect(useComposerStore.getState().voiceRecordingChatId).toBeNull();
  });
});
