import { useMutation, useQueryClient } from '@tanstack/react-query';
import { meQueryKey, useMeQuery } from '@/queries/auth.queries';
import { updateProfile } from '@/services/profileService';
import type { UpdateProfilePayload } from '@/types/profile';

export { useMeQuery };

export function useUpdateProfileMutation() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: (payload: UpdateProfilePayload) => updateProfile(payload),
    onSuccess: (user) => {
      queryClient.setQueryData(meQueryKey, user);
    },
  });
}
