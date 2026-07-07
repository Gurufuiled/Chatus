import type { ReactNode } from 'react';
import type { SettingsGlyph } from '../../icons/settingsGlyphs';

interface SettingsIconRowProps {
  title: string;
  subtitle?: string;
  icon?: ReactNode;
  glyph?: SettingsGlyph;
  iconBgColor?: string;
  onPress?: () => void;
  placeholder?: boolean;
  destructive?: boolean;
  showChevron?: boolean;
}

function SettingsGlyphIcon({ glyph, bgColor }: { glyph: SettingsGlyph; bgColor?: string }) {
  return (
    <span
      className="mobile-settings-row__icon-bubble"
      style={bgColor ? { backgroundColor: bgColor } : undefined}
    >
      <svg viewBox="0 0 72 72" aria-hidden>
        <path d={glyph.d} fill="#fff" fillRule={glyph.fillRule ?? 'nonzero'} />
      </svg>
    </span>
  );
}

export function SettingsIconRow({
  title,
  subtitle,
  icon,
  glyph,
  iconBgColor,
  onPress,
  placeholder = false,
  destructive = false,
  showChevron = true,
}: SettingsIconRowProps) {
  const content = (
    <>
      {icon}
      {glyph ? <SettingsGlyphIcon glyph={glyph} bgColor={iconBgColor} /> : null}
      <span className="mobile-settings-row__text">
        <span
          className={`mobile-settings-row__title${destructive ? ' mobile-settings-row__title--destructive' : ''}`}
        >
          {title}
        </span>
        {subtitle ? <span className="mobile-settings-row__subtitle">{subtitle}</span> : null}
      </span>
      {placeholder ? <span className="mobile-settings-row__badge">Скоро</span> : null}
      {showChevron ? <span className="mobile-settings-row__chevron" aria-hidden>›</span> : null}
    </>
  );

  if (onPress) {
    return (
      <button type="button" className="mobile-settings-row" onClick={onPress}>
        {content}
      </button>
    );
  }

  return <div className="mobile-settings-row">{content}</div>;
}
