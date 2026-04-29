/**
 * Address book contacts — GET/POST/DELETE /users/me/contacts
 */

import { apiDelete, apiGet, apiPost } from './apiClient';

export type AddressBookContact = {
  id: string;
  owner_user_id: string;
  phone: string;
  first_name: string | null;
  last_name: string | null;
  linked_user_id: string | null;
  created_at: number;
  updated_at: number;
};

export async function listAddressBookContacts(): Promise<AddressBookContact[]> {
  const res = await apiGet('/users/me/contacts');
  if (!res.ok) {
    const text = await res.text();
    throw new Error(text || `Failed to load contacts: ${res.status}`);
  }
  return res.json() as Promise<AddressBookContact[]>;
}

export async function createAddressBookContact(input: {
  phone: string;
  first_name?: string;
  last_name?: string;
}): Promise<AddressBookContact> {
  const res = await apiPost('/users/me/contacts', input);
  if (!res.ok) {
    const text = await res.text();
    throw new Error(text || `Failed to create contact: ${res.status}`);
  }
  return res.json() as Promise<AddressBookContact>;
}

export async function deleteAddressBookContact(contactId: string): Promise<void> {
  const res = await apiDelete(`/users/me/contacts/${encodeURIComponent(contactId)}`);
  if (!res.ok) {
    const text = await res.text();
    throw new Error(text || `Failed to delete contact: ${res.status}`);
  }
}
