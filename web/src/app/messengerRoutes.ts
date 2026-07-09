import { createRoute, type AnyRoute, type RouteComponent } from '@tanstack/react-router';

export function createMessengerChildRoutes(parentRoute: AnyRoute, Layout: RouteComponent) {
  const indexRoute = createRoute({
    getParentRoute: () => parentRoute,
    path: '/',
    component: Layout,
  });

  const chatRoute = createRoute({
    getParentRoute: () => parentRoute,
    path: '/chat/$chatId',
    component: Layout,
  });

  const chatProfileRoute = createRoute({
    getParentRoute: () => parentRoute,
    path: '/chat/$chatId/profile',
    component: Layout,
  });

  const contactsRoute = createRoute({
    getParentRoute: () => parentRoute,
    path: '/contacts',
    component: Layout,
  });

  const settingsRoute = createRoute({
    getParentRoute: () => parentRoute,
    path: '/settings',
    component: Layout,
  });

  const settingsProfileRoute = createRoute({
    getParentRoute: () => parentRoute,
    path: '/settings/profile',
    component: Layout,
  });

  const settingsProfileEditRoute = createRoute({
    getParentRoute: () => parentRoute,
    path: '/settings/profile/edit',
    component: Layout,
  });

  const settingsAppearanceRoute = createRoute({
    getParentRoute: () => parentRoute,
    path: '/settings/appearance',
    component: Layout,
  });

  const settingsChatRoute = createRoute({
    getParentRoute: () => parentRoute,
    path: '/settings/chat',
    component: Layout,
  });

  const settingsServicesRoute = createRoute({
    getParentRoute: () => parentRoute,
    path: '/settings/services',
    component: Layout,
  });

  const settingsFeedbackBugRoute = createRoute({
    getParentRoute: () => parentRoute,
    path: '/settings/feedback/bug',
    component: Layout,
  });

  const settingsFeedbackSuggestionRoute = createRoute({
    getParentRoute: () => parentRoute,
    path: '/settings/feedback/suggestion',
    component: Layout,
  });

  const settingsFeedbackComposeRoute = createRoute({
    getParentRoute: () => parentRoute,
    path: '/settings/feedback/compose',
    component: Layout,
    validateSearch: (search: Record<string, unknown>) => ({
      kind: search.kind === 'suggestion' ? 'suggestion' : 'bug',
    }),
  });

  const settingsComingSoonRoute = createRoute({
    getParentRoute: () => parentRoute,
    path: '/settings/coming-soon',
    component: Layout,
    validateSearch: (search: Record<string, unknown>) => ({
      title:
        typeof search.title === 'string'
          ? search.title.trim().slice(0, 80) || 'Скоро'
          : 'Скоро',
    }),
  });

  const miniAppRoute = createRoute({
    getParentRoute: () => parentRoute,
    path: '/miniapp/$appId',
    component: Layout,
    validateSearch: (search: Record<string, unknown>) => ({
      title:
        typeof search.title === 'string'
          ? search.title.trim().slice(0, 80) || undefined
          : undefined,
    }),
  });

  const composeRoute = createRoute({
    getParentRoute: () => parentRoute,
    path: '/compose',
    component: Layout,
  });

  const createGroupRoute = createRoute({
    getParentRoute: () => parentRoute,
    path: '/create-group',
    component: Layout,
  });

  const createChannelRoute = createRoute({
    getParentRoute: () => parentRoute,
    path: '/create-channel',
    component: Layout,
  });

  const groupProfileRoute = createRoute({
    getParentRoute: () => parentRoute,
    path: '/chat/$chatId/group-profile',
    component: Layout,
  });

  const channelFeedRoute = createRoute({
    getParentRoute: () => parentRoute,
    path: '/channel/$channelId',
    component: Layout,
  });

  const channelProfileRoute = createRoute({
    getParentRoute: () => parentRoute,
    path: '/channel/$channelId/profile',
    component: Layout,
  });

  const channelDiscussionRoute = createRoute({
    getParentRoute: () => parentRoute,
    path: '/channel/$channelId/discussion/$postId',
    component: Layout,
  });

  return [
    indexRoute,
    chatRoute,
    chatProfileRoute,
    groupProfileRoute,
    channelFeedRoute,
    channelProfileRoute,
    channelDiscussionRoute,
    contactsRoute,
    settingsRoute,
    settingsProfileRoute,
    settingsProfileEditRoute,
    settingsAppearanceRoute,
    settingsChatRoute,
    settingsServicesRoute,
    settingsFeedbackBugRoute,
    settingsFeedbackSuggestionRoute,
    settingsFeedbackComposeRoute,
    settingsComingSoonRoute,
    miniAppRoute,
    composeRoute,
    createGroupRoute,
    createChannelRoute,
  ];
}
