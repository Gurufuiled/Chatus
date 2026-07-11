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
import { MobileMiniAppScreen } from './screens/MobileMiniAppScreen';
import { MobileComposeScreen } from './screens/MobileComposeScreen';
import { MobileCreateGroupScreen } from './screens/MobileCreateGroupScreen';
import { MobileCreateChannelScreen } from './screens/MobileCreateChannelScreen';
import { MobileGroupProfileScreen } from './screens/MobileGroupProfileScreen';
import { MobileChannelFeedScreen } from './screens/MobileChannelFeedScreen';
import { MobileChannelProfileScreen } from './screens/MobileChannelProfileScreen';
import { MobileChannelSettingsScreen } from './screens/MobileChannelSettingsScreen';
import { MobileChannelTypeScreen } from './screens/MobileChannelTypeScreen';
import { MobileChannelInviteLinksScreen } from './screens/MobileChannelInviteLinksScreen';
import { MobileChannelDiscussionSettingsScreen } from './screens/MobileChannelDiscussionSettingsScreen';
import { MobileChannelDiscussionScreen } from './screens/MobileChannelDiscussionScreen';
import { MobileChannelMembersScreen } from './screens/MobileChannelMembersScreen';
import { MobileChannelEditScreen } from './screens/MobileChannelEditScreen';
import { MobileBottomTabs, shouldShowMobileTabs } from './components/MobileBottomTabs';
import { useChatsQuery } from '@/queries/chats.queries';

export function MobileAppLayout() {
  const params = useParams({ strict: false });
  const chatId = 'chatId' in params ? (params.chatId as string | undefined) : undefined;
  const channelId = 'channelId' in params ? (params.channelId as string | undefined) : undefined;
  const postId = 'postId' in params ? (params.postId as string | undefined) : undefined;
  const miniAppId = 'appId' in params ? (params.appId as string | undefined) : undefined;
  const { pathname } = useLocation();
  const feedbackComposeSearch = useSearch({ strict: false }) as { kind?: 'bug' | 'suggestion' };
  const miniAppSearch = useSearch({ strict: false }) as { title?: string };
  const comingSoonSearch = useSearch({ strict: false }) as { title?: string };
  const { data: chats } = useChatsQuery();
  const chatForRoute = chatId ? chats?.find((c) => c.id === chatId) : undefined;

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
    if (miniAppId && pathname.startsWith('/miniapp/')) {
      return <MobileMiniAppScreen appId={miniAppId} title={miniAppSearch.title} />;
    }
    if (pathname === '/compose') {
      return <MobileComposeScreen />;
    }
    if (pathname === '/create-group') {
      return <MobileCreateGroupScreen />;
    }
    if (pathname === '/create-channel') {
      return <MobileCreateChannelScreen />;
    }
    if (pathname === '/contacts') {
      return <MobileContactsScreen />;
    }
    if (pathname === '/settings') {
      return <MobileSettingsHomeScreen />;
    }
    if (chatId && pathname.endsWith('/group-profile')) {
      return <MobileGroupProfileScreen chatId={chatId} />;
    }
    if (chatId && pathname.endsWith('/profile')) {
      if (chatForRoute?.chat_type === 'group') {
        return <MobileGroupProfileScreen chatId={chatId} />;
      }
      return <MobileChatProfileScreen chatId={chatId} />;
    }
    if (channelId && postId && pathname.includes('/discussion/')) {
      return <MobileChannelDiscussionScreen channelId={channelId} postId={postId} />;
    }
    if (channelId && pathname.endsWith('/admins')) {
      return <MobileChannelMembersScreen channelId={channelId} mode="admins" />;
    }
    if (channelId && pathname.endsWith('/subscribers')) {
      return <MobileChannelMembersScreen channelId={channelId} mode="subscribers" />;
    }
    if (channelId && pathname.endsWith('/banned')) {
      return <MobileChannelMembersScreen channelId={channelId} mode="banned" />;
    }
    if (channelId && pathname.endsWith('/edit')) {
      return <MobileChannelEditScreen channelId={channelId} />;
    }
    if (channelId && pathname.endsWith('/invite-links')) {
      return <MobileChannelInviteLinksScreen channelId={channelId} />;
    }
    if (channelId && pathname.endsWith('/discussion-settings')) {
      return <MobileChannelDiscussionSettingsScreen channelId={channelId} />;
    }
    if (channelId && pathname.endsWith('/type')) {
      return <MobileChannelTypeScreen channelId={channelId} />;
    }
    if (channelId && pathname.endsWith('/settings')) {
      return <MobileChannelSettingsScreen channelId={channelId} />;
    }
    if (channelId && pathname.endsWith('/profile')) {
      return <MobileChannelProfileScreen channelId={channelId} />;
    }
    if (channelId) {
      return <MobileChannelFeedScreen channelId={channelId} />;
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
