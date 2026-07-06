import {
  createRootRoute,
  createRoute,
  createRouter,
  Outlet,
} from '@tanstack/react-router';
import { MobileAuthGate } from '@/app-mobile/MobileAuthGate';
import { MobileAppShell } from '@/app-mobile/MobileAppShell';
import { createMessengerChildRoutes } from './messengerRoutes';
import { MobileAppLayout } from '@/app-mobile/MobileAppLayout';

const rootRoute = createRootRoute({
  component: () => <Outlet />,
});

const appRoute = createRoute({
  getParentRoute: () => rootRoute,
  id: 'app',
  component: () => (
    <MobileAuthGate>
      <MobileAppShell>
        <Outlet />
      </MobileAppShell>
    </MobileAuthGate>
  ),
});

const routeTree = rootRoute.addChildren([
  appRoute.addChildren(createMessengerChildRoutes(appRoute, MobileAppLayout)),
]);

export const router = createRouter({
  routeTree,
  basepath: '/app',
});

export type AppRouter = typeof router;
