import { useParams, useLocation } from '@tanstack/react-router';
import { useWsLifecycle } from '@/ws/useWsLifecycle';
import { useWsUiStore } from '@/stores/wsUiStore';
import { isUiPreviewMode } from '@/dev/uiPreview';
import { MobileChatListScreen, MobileSettingsScreen } from './screens/MobileChatListScreen';
import { MobileChatScreen } from './screens/MobileChatScreen';

export function MobileAppLayout() {
  const params = useParams({ strict: false });
  const chatId = 'chatId' in params ? (params.chatId as string | undefined) : undefined;
  const { pathname } = useLocation();

  useWsLifecycle(chatId);

  const wsStatus = useWsUiStore((s) => s.status);
  const wsHasEverConnected = useWsUiStore((s) => s.hasEverConnected);
  const showWsDegraded =
    !isUiPreviewMode() && wsHasEverConnected && wsStatus === 'disconnected';

  if (pathname.includes('/settings/profile')) {
    return (
      <div className="mobile-app-layout">
        {showWsDegraded ? (
          <div className="mobile-ws-banner" role="status">
            Нет соединения — обновления могут задерживаться
          </div>
        ) : null}
        <MobileSettingsScreen />
      </div>
    );
  }

  if (chatId) {
    return (
      <div className="mobile-app-layout">
        {showWsDegraded ? (
          <div className="mobile-ws-banner" role="status">
            Нет соединения — обновления могут задерживаться
          </div>
        ) : null}
        <MobileChatScreen chatId={chatId} />
      </div>
    );
  }

  return (
    <div className="mobile-app-layout">
      {showWsDegraded ? (
        <div className="mobile-ws-banner" role="status">
          Нет соединения — обновления могут задерживаться
        </div>
      ) : null}
      <MobileChatListScreen />
    </div>
  );
}
