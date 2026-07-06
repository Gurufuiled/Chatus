import {
  createRootRoute,
  createRoute,
  createRouter,
  Outlet,
} from '@tanstack/react-router';
import { AuthGate } from '@/features/shell/AuthGate';
import { EmbedShell } from '@/features/shell/EmbedShell';
import { MessengerLayout } from '@/features/shell/MessengerLayout';
import { createMessengerChildRoutes } from './messengerRoutes';

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

const routeTree = rootRoute.addChildren([
  embedRoute.addChildren(createMessengerChildRoutes(embedRoute, MessengerLayout)),
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
