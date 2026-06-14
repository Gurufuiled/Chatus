import {
  createRootRoute,
  createRoute,
  createRouter,
  Outlet,
} from '@tanstack/react-router';
import { AuthGate } from '@/features/shell/AuthGate';
import { EmbedShell } from '@/features/shell/EmbedShell';
import { MessengerLayout } from '@/features/shell/MessengerLayout';

const rootRoute = createRootRoute({
  component: () => <Outlet />,
});

const embedRoute = createRoute({
  getParentRoute: () => rootRoute,
  id: 'embed',
  component: () => (
    <AuthGate>
      <EmbedShell>
        <Outlet />
      </EmbedShell>
    </AuthGate>
  ),
});

const embedIndexRoute = createRoute({
  getParentRoute: () => embedRoute,
  path: '/',
  component: MessengerLayout,
});

const embedChatRoute = createRoute({
  getParentRoute: () => embedRoute,
  path: '/chat/$chatId',
  component: MessengerLayout,
});

const embedSettingsProfileRoute = createRoute({
  getParentRoute: () => embedRoute,
  path: '/settings/profile',
  component: MessengerLayout,
});

const embedSettingsProfileEditRoute = createRoute({
  getParentRoute: () => embedRoute,
  path: '/settings/profile/edit',
  component: MessengerLayout,
});

const routeTree = rootRoute.addChildren([
  embedRoute.addChildren([
    embedIndexRoute,
    embedChatRoute,
    embedSettingsProfileRoute,
    embedSettingsProfileEditRoute,
  ]),
]);

export const router = createRouter({
  routeTree,
  basepath: '/embed',
});

declare module '@tanstack/react-router' {
  interface Register {
    router: typeof router;
  }
}
