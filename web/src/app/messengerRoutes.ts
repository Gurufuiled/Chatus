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

  return [indexRoute, chatRoute, settingsProfileRoute, settingsProfileEditRoute];
}
