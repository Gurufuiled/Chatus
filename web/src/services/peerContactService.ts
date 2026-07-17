import { apiRequest } from './apiClient';
import type { PeerContactCustomization, UpsertPeerContactPayload } from '@/types/peerContact';

export function listPeerContacts(): Promise<PeerContactCustomization[]> {
  return apiRequest<PeerContactCustomization[]>('/users/me/peer-contacts');
}

export function getPeerContact(peerUserId: string): Promise<PeerContactCustomization> {
  return apiRequest<PeerContactCustomization>(
    `/users/me/peer-contacts/${encodeURIComponent(peerUserId)}`,
  );
}

export function upsertPeerContact(
  peerUserId: string,
  payload: UpsertPeerContactPayload,
): Promise<PeerContactCustomization> {
  return apiRequest<PeerContactCustomization>(
    `/users/me/peer-contacts/${encodeURIComponent(peerUserId)}`,
    {
      method: 'PUT',
      body: JSON.stringify(payload),
    },
  );
}

export function deletePeerContact(peerUserId: string): Promise<{ ok: boolean }> {
  return apiRequest<{ ok: boolean }>(
    `/users/me/peer-contacts/${encodeURIComponent(peerUserId)}`,
    { method: 'DELETE' },
  );
}
