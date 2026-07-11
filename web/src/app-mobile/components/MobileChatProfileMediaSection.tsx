import { formatFileSize, formatVoiceDuration } from '@/utils/formatFileSize';

export type ProfileTabKey = 'media' | 'files' | 'voice' | 'links';

export type MediaTile = {
  id: string;
  kind: 'image' | 'video';
  url: string;
  thumb: string;
  durationMs?: number;
};

export type FileItem = {
  id: string;
  title: string;
  subtitle: string;
  uri: string | null;
  extension: string;
};

export type VoiceItem = {
  id: string;
  kind: 'voice' | 'video_note';
  title: string;
  durationMs: number;
  dateLabel: string;
  uri: string | null;
  thumbnailUri?: string;
};

export type LinkItem = {
  id: string;
  title: string;
  subtitle: string;
  uri: string;
};

const TAB_LABELS: Record<ProfileTabKey, string> = {
  media: 'Медиа',
  files: 'Файлы',
  voice: 'Голосовые',
  links: 'Ссылки',
};

type MobileChatProfileMediaSectionProps = {
  activeTab: ProfileTabKey;
  mediaItems: MediaTile[];
  fileItems: FileItem[];
  voiceItems: VoiceItem[];
  linkItems: LinkItem[];
  onChangeTab: (tab: ProfileTabKey) => void;
  onOpenMedia: (index: number) => void;
};

export function buildFileSubtitle(fileSize: number | null | undefined, createdAt: number): string {
  const sizePart = formatFileSize(fileSize);
  const datePart = new Date(createdAt).toLocaleDateString('ru-RU', {
    day: 'numeric',
    month: 'short',
  });
  return sizePart ? `${sizePart} • ${datePart}` : datePart;
}

export function getFileExtension(fileName: string): string {
  const ext = fileName.split('.').pop()?.trim() ?? '';
  if (!ext || ext === fileName) return 'FILE';
  return ext.slice(0, 4).toUpperCase();
}

export function MobileChatProfileMediaSection({
  activeTab,
  mediaItems,
  fileItems,
  voiceItems,
  linkItems,
  onChangeTab,
  onOpenMedia,
}: MobileChatProfileMediaSectionProps) {
  const counts: Record<ProfileTabKey, number> = {
    media: mediaItems.length,
    files: fileItems.length,
    voice: voiceItems.length,
    links: linkItems.length,
  };

  return (
    <section className="mobile-chat-profile__media-section">
      <div className="mobile-chat-profile__tabs" role="tablist">
        {(Object.keys(TAB_LABELS) as ProfileTabKey[]).map((tabKey) => {
          const isActive = activeTab === tabKey;
          return (
            <button
              key={tabKey}
              type="button"
              role="tab"
              aria-selected={isActive}
              className={`mobile-chat-profile__tab${isActive ? ' mobile-chat-profile__tab--active' : ''}`}
              onClick={() => onChangeTab(tabKey)}
            >
              <span className="mobile-chat-profile__tab-label">{TAB_LABELS[tabKey]}</span>
              <span className="mobile-chat-profile__tab-count">{counts[tabKey]}</span>
            </button>
          );
        })}
      </div>

      {activeTab === 'media' ? (
        mediaItems.length === 0 ? (
          <div className="mobile-chat-profile__empty-tab">
            <p className="mobile-chat-profile__empty-title">Пока нет медиа</p>
            <p className="mobile-chat-profile__empty-subtitle">
              Фото и видеосообщения из чата появятся здесь.
            </p>
          </div>
        ) : (
          <div className="mobile-chat-profile__media-grid">
            {mediaItems.map((item, index) => (
              <button
                key={item.id}
                type="button"
                className="mobile-chat-profile__media-tile mobile-chat-profile__media-tile--btn"
                onClick={() => onOpenMedia(index)}
              >
                <img src={item.thumb} alt="" loading="lazy" />
                {item.kind === 'video' ? (
                  <span className="mobile-chat-profile__media-badge" aria-hidden>
                    ▶
                  </span>
                ) : null}
                {item.durationMs ? (
                  <span className="mobile-chat-profile__media-duration">
                    {formatVoiceDuration(item.durationMs)}
                  </span>
                ) : null}
              </button>
            ))}
          </div>
        )
      ) : null}

      {activeTab === 'files' ? (
        fileItems.length === 0 ? (
          <div className="mobile-chat-profile__empty-tab">
            <p className="mobile-chat-profile__empty-title">Пока нет файлов</p>
            <p className="mobile-chat-profile__empty-subtitle">
              Документы и вложения из этого чата будут появляться здесь.
            </p>
          </div>
        ) : (
          <ul className="mobile-chat-profile__stack">
            {fileItems.map((item) => (
              <li key={item.id} className="mobile-chat-profile__file-row">
                <span className="mobile-chat-profile__file-badge">{item.extension}</span>
                <span className="mobile-chat-profile__stack-text">
                  <span className="mobile-chat-profile__stack-title">{item.title}</span>
                  <span className="mobile-chat-profile__stack-subtitle">{item.subtitle}</span>
                </span>
              </li>
            ))}
          </ul>
        )
      ) : null}

      {activeTab === 'voice' ? (
        voiceItems.length === 0 ? (
          <div className="mobile-chat-profile__empty-tab">
            <p className="mobile-chat-profile__empty-title">Пока нет голосовых</p>
            <p className="mobile-chat-profile__empty-subtitle">
              Здесь будут собраны все голосовые сообщения из этого диалога.
            </p>
          </div>
        ) : (
          <ul className="mobile-chat-profile__stack">
            {voiceItems.map((item) => (
              <li key={item.id} className="mobile-chat-profile__voice-row">
                {item.kind === 'video_note' && item.thumbnailUri ? (
                  <img
                    className="mobile-chat-profile__voice-thumb"
                    src={item.thumbnailUri}
                    alt=""
                  />
                ) : (
                  <span className="mobile-chat-profile__voice-play" aria-hidden>
                    ▶
                  </span>
                )}
                <span className="mobile-chat-profile__stack-text">
                  <span className="mobile-chat-profile__stack-title">{item.title}</span>
                  <span className="mobile-chat-profile__stack-subtitle">
                    {formatVoiceDuration(item.durationMs)} · {item.dateLabel}
                  </span>
                </span>
              </li>
            ))}
          </ul>
        )
      ) : null}

      {activeTab === 'links' ? (
        linkItems.length === 0 ? (
          <div className="mobile-chat-profile__empty-tab">
            <p className="mobile-chat-profile__empty-title">Пока нет ссылок</p>
            <p className="mobile-chat-profile__empty-subtitle">
              Ссылки из переписки появятся на этой вкладке автоматически.
            </p>
          </div>
        ) : (
          <ul className="mobile-chat-profile__stack">
            {linkItems.map((item) => (
              <li key={item.id}>
                <a
                  className="mobile-chat-profile__link-row"
                  href={item.uri}
                  target="_blank"
                  rel="noopener noreferrer"
                >
                  <span className="mobile-chat-profile__stack-text">
                    <span className="mobile-chat-profile__stack-title">{item.title}</span>
                    <span className="mobile-chat-profile__stack-subtitle">{item.subtitle}</span>
                  </span>
                </a>
              </li>
            ))}
          </ul>
        )
      ) : null}
    </section>
  );
}
