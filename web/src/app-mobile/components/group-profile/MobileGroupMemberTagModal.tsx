import { getAvatarColor, resolveAvatarSrc } from '../../utils/avatar';
import type { MappedChatMember } from '@/types/chat';
import {
  getGroupMemberTagOption,
  GROUP_MEMBER_TAG_OPTIONS,
  type GroupMemberTagColor,
} from './groupProfile.constants';

function getMemberDisplayName(member: MappedChatMember) {
  return (
    member.user?.display_name?.trim() ||
    member.user?.username?.trim() ||
    member.user?.handle?.trim() ||
    'Участник'
  );
}

interface MobileGroupMemberTagModalProps {
  member: MappedChatMember;
  tagDraft: string;
  tagColorDraft: GroupMemberTagColor;
  saving: boolean;
  onChangeTag: (value: string) => void;
  onChangeColor: (value: GroupMemberTagColor) => void;
  onClose: () => void;
  onSave: () => void;
}

export function MobileGroupMemberTagModal({
  member,
  tagDraft,
  tagColorDraft,
  saving,
  onChangeTag,
  onChangeColor,
  onClose,
  onSave,
}: MobileGroupMemberTagModalProps) {
  const preview = getGroupMemberTagOption(tagColorDraft);
  const displayName = getMemberDisplayName(member);
  const avatarSrc = resolveAvatarSrc(member.user?.avatar_url);

  return (
    <div
      className="mobile-group-tag-modal"
      role="dialog"
      aria-modal="true"
      aria-labelledby="group-tag-modal-title"
    >
      <button
        type="button"
        className="mobile-group-tag-modal__backdrop"
        onClick={onClose}
        aria-label="Закрыть"
      />
      <div className="mobile-group-tag-modal__card">
        <header className="mobile-group-tag-modal__header">
          <button
            type="button"
            className="mobile-group-tag-modal__close"
            onClick={onClose}
            aria-label="Закрыть"
          >
            ✕
          </button>
          <h2 id="group-tag-modal-title" className="mobile-group-tag-modal__title">
            Тег участника
          </h2>
          <span className="mobile-group-tag-modal__header-spacer" aria-hidden />
        </header>

        <div className="mobile-group-tag-modal__preview">
          <span
            className="mobile-group-tag-modal__preview-accent"
            style={{ backgroundColor: preview.bubble }}
            aria-hidden
          />
          {avatarSrc ? (
            <img className="mobile-group-tag-modal__preview-avatar" src={avatarSrc} alt="" />
          ) : (
            <div
              className="mobile-group-tag-modal__preview-avatar-fallback"
              style={{ backgroundColor: getAvatarColor(displayName) }}
            >
              {(displayName.trim()[0] || '?').toUpperCase()}
            </div>
          )}
          <div className="mobile-group-tag-modal__preview-text">
            <div className="mobile-group-tag-modal__preview-top">
              <span
                className="mobile-group-tag-modal__badge"
                style={{ backgroundColor: preview.bubble, color: preview.text }}
              >
                {tagDraft.trim() || 'Тег'}
              </span>
              <span className="mobile-group-tag-modal__preview-name">{displayName}</span>
              <span className="mobile-group-tag-modal__preview-current">
                {member.tag?.trim() || 'Тег'}
              </span>
            </div>
            <span className="mobile-group-tag-modal__preview-line" aria-hidden />
            <span
              className="mobile-group-tag-modal__preview-line mobile-group-tag-modal__preview-line--short"
              aria-hidden
            />
          </div>
        </div>

        <label className="mobile-group-tag-modal__input-wrap">
          <span className="mobile-group-tag-modal__input-icon" aria-hidden>
            #
          </span>
          <input
            type="text"
            value={tagDraft}
            onChange={(e) => onChangeTag(e.target.value)}
            placeholder="Новый тег"
            maxLength={40}
            className="mobile-group-tag-modal__input"
            autoFocus
          />
          {tagDraft.trim().length > 0 ? (
            <button
              type="button"
              className="mobile-group-tag-modal__input-clear"
              onClick={() => onChangeTag('')}
              aria-label="Очистить"
            >
              ✕
            </button>
          ) : null}
        </label>

        <div className="mobile-group-tag-modal__colors" role="listbox" aria-label="Цвет тега">
          {GROUP_MEMBER_TAG_OPTIONS.map((option) => {
            const selected = tagColorDraft === option.key;
            return (
              <button
                key={option.key}
                type="button"
                role="option"
                aria-selected={selected}
                className={`mobile-group-tag-modal__color${selected ? ' mobile-group-tag-modal__color--selected' : ''}`}
                onClick={() => onChangeColor(option.key)}
              >
                <span
                  className="mobile-group-tag-modal__color-swatch"
                  style={{ backgroundColor: option.fill }}
                />
              </button>
            );
          })}
        </div>

        <p className="mobile-group-tag-modal__hint">
          Вы можете указать тег, который будет отображаться рядом с именем участника.
        </p>

        <button
          type="button"
          className="mobile-group-tag-modal__save"
          disabled={saving}
          onClick={onSave}
        >
          {saving ? '…' : 'Сохранить тег'}
        </button>
      </div>
    </div>
  );
}
