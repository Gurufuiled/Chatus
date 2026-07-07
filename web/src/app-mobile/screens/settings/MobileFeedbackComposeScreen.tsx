import { useEffect, useRef, useState } from 'react';
import { useNavigate } from '@tanstack/react-router';
import { createFeedback } from '@/services/feedbackService';
import { uploadFile } from '@/services/mediaService';
import { SettingsSubpageLayout } from '../../components/settings/SettingsSubpageLayout';

interface MobileFeedbackComposeScreenProps {
  kind: 'bug' | 'suggestion';
}

export function MobileFeedbackComposeScreen({ kind }: MobileFeedbackComposeScreenProps) {
  const navigate = useNavigate();
  const title = kind === 'bug' ? 'Сообщить о баге' : 'Предложение';
  const [subject, setSubject] = useState('');
  const [body, setBody] = useState('');
  const [attachmentUrl, setAttachmentUrl] = useState<string | null>(null);
  const [attachmentPreview, setAttachmentPreview] = useState<string | null>(null);
  const [uploadingAttachment, setUploadingAttachment] = useState(false);
  const previewUrlRef = useRef<string | null>(null);
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    return () => {
      if (previewUrlRef.current) URL.revokeObjectURL(previewUrlRef.current);
    };
  }, []);

  const handleSubmit = async () => {
    if (uploadingAttachment) return;
    const trimmedTitle = subject.trim();
    const trimmedBody = body.trim();
    if (!trimmedTitle || !trimmedBody) {
      setError('Заполните тему и описание');
      return;
    }

    setSubmitting(true);
    setError(null);
    try {
      const entry = await createFeedback({
        type: kind,
        title: trimmedTitle,
        body: trimmedBody,
        attachment_url: attachmentUrl ?? undefined,
      });
      void navigate({
        to: kind === 'bug' ? '/settings/feedback/bug' : '/settings/feedback/suggestion',
      });
      return entry;
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Не удалось отправить');
    } finally {
      setSubmitting(false);
    }
  };

  const handleAttachment = async (file: File) => {
    setUploadingAttachment(true);
    setError(null);
    try {
      const uploaded = await uploadFile(file);
      setAttachmentUrl(uploaded.url);
      if (previewUrlRef.current) URL.revokeObjectURL(previewUrlRef.current);
      const nextPreview = URL.createObjectURL(file);
      previewUrlRef.current = nextPreview;
      setAttachmentPreview(nextPreview);
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Не удалось загрузить вложение');
    } finally {
      setUploadingAttachment(false);
    }
  };

  return (
    <SettingsSubpageLayout
      title={title}
      headerRight={
        <button
          type="button"
          className="mobile-settings__header-action"
          disabled={submitting || uploadingAttachment}
          onClick={() => void handleSubmit()}
        >
          {submitting ? '…' : 'Отправить'}
        </button>
      }
    >
      {error ? <div className="mobile-settings__error">{error}</div> : null}
      <div className="mobile-settings-compose">
        <label className="mobile-settings-compose__field">
          <span>Тема</span>
          <input
            type="text"
            value={subject}
            onChange={(e) => setSubject(e.target.value)}
            placeholder="Кратко опишите проблему"
          />
        </label>
        <label className="mobile-settings-compose__field">
          <span>Описание</span>
          <textarea
            value={body}
            onChange={(e) => setBody(e.target.value)}
            rows={6}
            placeholder="Подробности, шаги воспроизведения, ожидаемое поведение"
          />
        </label>
        <label className="mobile-settings-compose__attach">
          <input
            type="file"
            accept="image/*"
            hidden
            onChange={(e) => {
              const file = e.target.files?.[0];
              e.target.value = '';
              if (file) void handleAttachment(file);
            }}
          />
          <span>Прикрепить скриншот</span>
        </label>
        {attachmentPreview ? (
          <img src={attachmentPreview} alt="" className="mobile-settings-compose__preview" />
        ) : null}
      </div>
    </SettingsSubpageLayout>
  );
}
