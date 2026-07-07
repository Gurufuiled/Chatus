import { useParams, useLocation, useSearch } from '@tanstack/react-router';
import { useWsLifecycle } from '@/ws/useWsLifecycle';
import { useWsUiStore } from '@/stores/wsUiStore';
import { isUiPreviewMode } from '@/dev/uiPreview';
import { MobileChatListScreen } from './screens/MobileChatListScreen';
import { MobileChatScreen } from './screens/MobileChatScreen';
import { MobileContactsScreen } from './screens/MobileContactsScreen';
import { MobileSettingsHomeScreen } from './screens/settings/MobileSettingsHomeScreen';
import { MobileMyProfileScreen } from './screens/settings/MobileMyProfileScreen';
import { MobileAppearanceSettingsScreen } from './screens/settings/MobileAppearanceSettingsScreen';
import { MobileChatSettingsScreen } from './screens/settings/MobileChatSettingsScreen';
import { MobileServicesScreen } from './screens/settings/MobileServicesScreen';
import { MobileFeedbackListScreen } from './screens/settings/MobileFeedbackListScreen';
import { MobileFeedbackComposeScreen } from './screens/settings/MobileFeedbackComposeScreen';
import { MobileComingSoonScreen } from './screens/settings/MobileComingSoonScreen';
import { MobileProfileEditScreen } from './screens/MobileProfileEditScreen';
import { MobileChatProfileScreen } from './screens/MobileChatProfileScreen';
import { MobileBottomTabs, shouldShowMobileTabs } from './components/MobileBottomTabs';

export function MobileAppLayout() {
  const params = useParams({ strict: false });
  const chatId = 'chatId' in params ? (params.chatId as string | undefined) : undefined;
  const { pathname } = useLocation();
  const feedbackComposeSearch = useSearch({ strict: false }) as { kind?: 'bug' | 'suggestion' };
  const comingSoonSearch = useSearch({ strict: false }) as { title?: string };

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
    if (pathname === '/settings/profile') {
      return <MobileMyProfileScreen />;
    }
    if (pathname === '/settings/appearance') {
      return <MobileAppearanceSettingsScreen />;
    }
    if (pathname === '/settings/chat') {
      return <MobileChatSettingsScreen />;
    }
    if (pathname === '/settings/services') {
      return <MobileServicesScreen />;
    }
    if (pathname === '/settings/feedback/bug') {
      return <MobileFeedbackListScreen kind="bug" />;
    }
    if (pathname === '/settings/feedback/suggestion') {
      return <MobileFeedbackListScreen kind="suggestion" />;
    }
    if (pathname === '/settings/feedback/compose') {
      return (
        <MobileFeedbackComposeScreen kind={feedbackComposeSearch.kind ?? 'bug'} />
      );
    }
    if (pathname === '/settings/coming-soon') {
      return <MobileComingSoonScreen title={comingSoonSearch.title ?? 'Скоро'} />;
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
