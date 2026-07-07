import { useParams, useLocation } from '@tanstack/react-router';
import { useWsLifecycle } from '@/ws/useWsLifecycle';
import { useWsUiStore } from '@/stores/wsUiStore';
import { isUiPreviewMode } from '@/dev/uiPreview';
import { MobileChatListScreen } from './screens/MobileChatListScreen';
import { MobileChatScreen } from './screens/MobileChatScreen';
import { MobileContactsScreen } from './screens/MobileContactsScreen';
import { MobileSettingsHomeScreen } from './screens/MobileSettingsHomeScreen';
import { MobileProfileScreen } from './screens/MobileProfileScreen';
import { MobileProfileEditScreen } from './screens/MobileProfileEditScreen';
import { MobileChatProfileScreen } from './screens/MobileChatProfileScreen';
import { MobileBottomTabs, shouldShowMobileTabs } from './components/MobileBottomTabs';

export function MobileAppLayout() {
  const params = useParams({ strict: false });
  const chatId = 'chatId' in params ? (params.chatId as string | undefined) : undefined;
  const { pathname } = useLocation();

  useWsLifecycle(chatId);

  const wsStatus = useWsUiStore((s) => s.status);
  const wsHasEverConnected = useWsUiStore((s) => s.hasEverConnected);
  const showWsDegraded =
    !isUiPreviewMode() && wsHasEverConnected && wsStatus === 'disconnected';
  const showTabs = shouldShowMobileTabs(pathname);

  const renderContent = () => {
    if (pathname.endsWith('/settings/profile/edit')) {
      return <MobileProfileEditScreen />;
    }
    if (pathname.includes('/settings/profile')) {
      return <MobileProfileScreen />;
    }
    if (pathname === '/contacts') {
      return <MobileContactsScreen />;
    }
    if (pathname === '/settings') {
      return <MobileSettingsHomeScreen />;
    }
    if (chatId && pathname.endsWith('/profile')) {
      return <MobileChatProfileScreen chatId={chatId} />;
    }
    if (chatId) {
      return <MobileChatScreen chatId={chatId} />;
    }
    return <MobileChatListScreen />;
  };

  return (
    <div className={`mobile-app-layout${showTabs ? ' mobile-app-layout--with-tabs' : ''}`}>
      {showWsDegraded ? (
        <div className="mobile-ws-banner" role="status">
          Нет соединения — обновления могут задерживаться
        </div>
      ) : null}
      <div className="mobile-app-layout__content">{renderContent()}</div>
      {showTabs ? <MobileBottomTabs /> : null}
    </div>
  );
}
