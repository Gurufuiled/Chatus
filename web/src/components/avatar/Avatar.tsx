import { useState } from 'react';
import './avatar.css';

interface AvatarProps {
  name: string;
  imageUrl?: string | null;
  size?: number;
}

function getInitials(name: string): string {
  const parts = name.trim().split(/\s+/).filter(Boolean);
  if (parts.length === 0) return '?';
  if (parts.length === 1) return parts[0].slice(0, 2).toUpperCase();
  return `${parts[0][0] ?? ''}${parts[1][0] ?? ''}`.toUpperCase();
}

export function Avatar({ name, imageUrl, size = 48 }: AvatarProps) {
  const [failedUrl, setFailedUrl] = useState<string | null>(null);
  const showImage = Boolean(imageUrl) && failedUrl !== imageUrl;
  const style = {
    width: size,
    height: size,
    fontSize: Math.max(12, Math.round(size * 0.34)),
  };

  if (showImage && imageUrl) {
    return (
      <img
        className="avatar avatar--image"
        src={imageUrl}
        alt=""
        style={style}
        onError={() => setFailedUrl(imageUrl)}
      />
    );
  }

  return (
    <div className="avatar avatar--fallback" style={style} aria-hidden>
      {getInitials(name)}
    </div>
  );
}
