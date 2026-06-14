import { useEffect } from 'react';
import { useLocation, useParams } from '@tanstack/react-router';
import { ChatListColumn } from '@/features/chat-list/ChatListColumn';
import { ConversationPane } from '@/features/conversation/ConversationPane';
import { ProfileEditPage } from '@/features/profile/ProfileEditPage';
import { ProfileSettingsPage } from '@/features/profile/ProfileSettingsPage';
import { SettingsDrawer } from '@/features/profile/SettingsDrawer';
import { EmptyState } from '@/components/ui/EmptyState';
import { useChatUiStore } from '@/stores/chatUiStore';
import { useWsUiStore } from '@/stores/wsUiStore';
import { useWsLifecycle } from '@/ws/useWsLifecycle';
import { useGlobalEscape } from '@/hooks/useGlobalEscape';
import { isUiPreviewMode } from '@/dev/uiPreview';
import '@/styles/layout.css';

function LeftPanel({ activeChatId }: { activeChatId?: string }) {
  const { pathname } = useLocation();

  if (pathname.endsWith('/settings/profile/edit')) {
    return <ProfileEditPage />;
  }
  if (pathname.endsWith('/settings/profile')) {
    return <ProfileSettingsPage />;
  }
  return <ChatListColumn activeChatId={activeChatId} />;
}

export function MessengerLayout() {
  const params = useParams({ strict: false });
  const chatId = 'chatId' in params ? (params.chatId as string | undefined) : undefined;

  useWsLifecycle(chatId);
  const { pathname } = useLocation();
  const setSettingsDrawerOpen = useChatUiStore((s) => s.setSettingsDrawerOpen);
  const wsStatus = useWsUiStore((s) => s.status);
  const wsHasEverConnected = useWsUiStore((s) => s.hasEverConnected);
  const showWsDegraded =
    !isUiPreviewMode() && wsHasEverConnected && wsStatus === 'disconnected';

  useEffect(() => {
    if (pathname.includes('/settings/profile')) {
      setSettingsDrawerOpen(false);
    }
  }, [pathname, setSettingsDrawerOpen]);

  // Overlays in chat list / settings — conversation overlays handled in ConversationPane
  useGlobalEscape(chatId ? null : {});

  return (
    <div className={`messenger-layout${chatId ? ' messenger-layout--chat-open' : ''}`}>
      {isUiPreviewMode() ? (
        <div className="ui-preview-banner" role="status">
          UI Preview — демо-данные, без сервера. Для реальных чатов: Docker + API + токен.
        </div>
      ) : null}
      {showWsDegraded ? (
        <div className="ws-degraded-banner" role="status">
          Нет соединения — обновления могут задерживаться
        </div>
      ) : null}
      <div className="messenger-layout__chat-list">
        <LeftPanel activeChatId={chatId} />
      </div>
      <div className="messenger-layout__conversation">
        {chatId ? (
          <ConversationPane chatId={chatId} />
        ) : (
          <EmptyState
            title="Выберите чат"
            description="Выберите диалог слева, чтобы открыть переписку"
          />
        )}
      </div>
      <SettingsDrawer />
    </div>
  );
}

export function MessengerLayoutRoute() {
  return <MessengerLayout />;
}
