import type { ReactNode } from 'react';
import { useNavigate } from '@tanstack/react-router';

interface SettingsSubpageLayoutProps {
  title: string;
  backTo?: string;
  headerRight?: ReactNode;
  children: ReactNode;
}

export function SettingsSubpageLayout({
  title,
  backTo = '/settings',
  headerRight,
  children,
}: SettingsSubpageLayoutProps) {
  const navigate = useNavigate();

  return (
    <div className="mobile-settings mobile-settings--subpage">
      <header className="mobile-settings__subheader">
        <button
          type="button"
          className="mobile-settings__back"
          aria-label="Назад"
          onClick={() => navigate({ to: backTo })}
        >
          <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
            <path d="M19 12H5M12 19l-7-7 7-7" strokeLinecap="round" />
          </svg>
        </button>
        <h1 className="mobile-settings__subheader-title">{title}</h1>
        <div className="mobile-settings__subheader-right">{headerRight ?? <span />}</div>
      </header>
      <div className="mobile-settings__scroll mobile-settings__scroll--subpage">{children}</div>
    </div>
  );
}

interface SettingsOption {
  value: string;
  label: string;
  hint: string;
}

interface SettingsOptionListProps {
  caption?: string;
  options: SettingsOption[];
  value: string;
  onChange: (value: string) => void;
}

export function SettingsOptionList({ caption, options, value, onChange }: SettingsOptionListProps) {
  return (
    <div className="mobile-settings-options">
      {caption ? <p className="mobile-settings-options__caption">{caption}</p> : null}
      <div className="mobile-settings-card">
        {options.map((opt, index) => {
          const active = value === opt.value;
          return (
            <button
              key={opt.value}
              type="button"
              className={`mobile-settings-option${active ? ' mobile-settings-option--active' : ''}${index > 0 ? ' mobile-settings-option--bordered' : ''}`}
              onClick={() => onChange(opt.value)}
            >
              <span className="mobile-settings-option__text">
                <span className="mobile-settings-option__label">{opt.label}</span>
                <span className="mobile-settings-option__hint">{opt.hint}</span>
              </span>
              {active ? <span className="mobile-settings-option__check">✓</span> : null}
            </button>
          );
        })}
      </div>
    </div>
  );
}
