import { Badge } from '@/components/ui/Badge';

interface ChatUnreadBadgeProps {
  count: number;
  muted?: boolean;
}

export function ChatUnreadBadge({ count, muted = false }: ChatUnreadBadgeProps) {
  return <Badge count={count} variant={muted ? 'muted' : 'accent'} />;
}
