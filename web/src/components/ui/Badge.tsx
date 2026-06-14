interface BadgeProps {
  count: number;
  variant?: 'accent' | 'muted';
}

export function Badge({ count, variant = 'accent' }: BadgeProps) {
  if (count <= 0) return null;
  const label = count > 99 ? '99+' : String(count);
  return (
    <span className={`badge badge--${variant}`} aria-label={`${count} unread`}>
      {label}
    </span>
  );
}
