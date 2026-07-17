import type { ReactNode } from 'react';
import './group-settings.css';

interface SettingsToggleRowProps {
  id: string;
  title: string;
  subtitle?: string;
  icon?: ReactNode;
  checked: boolean;
  disabled?: boolean;
  onChange: (next: boolean) => void;
}

/** Telegram-like settings row: title + gray subtitle + switch. */
export function SettingsToggleRow({
  id,
  title,
  subtitle,
  icon,
  checked,
  disabled,
  onChange,
}: SettingsToggleRowProps) {
  return (
    <div className={`group-settings__toggle-row${disabled ? ' group-settings__toggle-row--disabled' : ''}`}>
      {icon ? (
        <span className="group-settings__row-icon" aria-hidden>
          {icon}
        </span>
      ) : null}
      <div className="group-settings__toggle-text">
        <span id={id} className="group-settings__toggle-title">
          {title}
        </span>
        {subtitle ? <span className="group-settings__toggle-subtitle">{subtitle}</span> : null}
      </div>
      <label className="chat-info-sidebar__switch">
        <input
          type="checkbox"
          role="switch"
          aria-labelledby={id}
          checked={checked}
          disabled={disabled}
          onChange={(e) => onChange(e.target.checked)}
        />
        <span className="chat-info-sidebar__slider" />
      </label>
    </div>
  );
}

interface SettingsNavRowProps {
  title: string;
  subtitle?: string;
  value?: string;
  icon?: ReactNode;
  danger?: boolean;
  disabled?: boolean;
  onClick?: () => void;
}

export function SettingsNavRow({
  title,
  subtitle,
  value,
  icon,
  danger,
  disabled,
  onClick,
}: SettingsNavRowProps) {
  const className = [
    'group-settings__nav-row',
    danger ? 'group-settings__nav-row--danger' : '',
    disabled ? 'group-settings__nav-row--disabled' : '',
  ]
    .filter(Boolean)
    .join(' ');

  const body = (
    <>
      {icon ? (
        <span className="group-settings__row-icon" aria-hidden>
          {icon}
        </span>
      ) : null}
      <span className="group-settings__nav-text">
        <span className="group-settings__nav-title">{title}</span>
        {subtitle ? <span className="group-settings__nav-subtitle">{subtitle}</span> : null}
      </span>
      {value ? <span className="group-settings__nav-value">{value}</span> : null}
      {onClick && !disabled ? (
        <span className="group-settings__nav-chevron" aria-hidden>
          ›
        </span>
      ) : null}
    </>
  );

  if (onClick && !disabled) {
    return (
      <button type="button" className={className} onClick={onClick}>
        {body}
      </button>
    );
  }

  return <div className={className}>{body}</div>;
}
