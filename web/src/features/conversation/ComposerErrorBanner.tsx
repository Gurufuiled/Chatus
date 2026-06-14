import { useComposerStore } from '@/stores/composerStore';

interface ComposerErrorBannerProps {
  chatId: string;
}

export function ComposerErrorBanner({ chatId }: ComposerErrorBannerProps) {
  const error = useComposerStore((s) => s.composerErrors[chatId]);
  const setError = useComposerStore((s) => s.setComposerError);

  if (!error) return null;

  return (
    <div className="composer-error" role="alert">
      <span className="composer-error__text">{error}</span>
      <button
        type="button"
        className="composer-error__dismiss"
        aria-label="Dismiss"
        onClick={() => setError(chatId, null)}
      >
        ×
      </button>
    </div>
  );
}
