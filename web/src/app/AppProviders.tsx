import { QueryClientProvider } from '@tanstack/react-query';
import { RouterProvider } from '@tanstack/react-router';
import { GroupCallProvider } from '@/contexts/GroupCallContext';
import { queryClient } from './queryClient';
import { router } from './router';
import '@/styles/globals.css';

export function AppProviders() {
  return (
    <QueryClientProvider client={queryClient}>
      <GroupCallProvider>
        <RouterProvider router={router} />
      </GroupCallProvider>
    </QueryClientProvider>
  );
}
