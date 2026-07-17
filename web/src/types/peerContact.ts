export interface PeerContactCustomization {
  peer_user_id: string;
  first_name: string | null;
  last_name: string | null;
  note: string | null;
  updated_at: number;
}

export type UpsertPeerContactPayload = {
  first_name?: string | null;
  last_name?: string | null;
  note?: string | null;
};
