import * as Contacts from 'expo-contacts';
import * as SecureStore from 'expo-secure-store';
import { create } from 'zustand';
import { listAddressBookContacts, createAddressBookContact } from '../services/contactService';
import { getUserProfile } from '../services/profileService';

export type PhoneBookContact = {
  /** Name as saved in phone contacts */
  deviceName: string;
  /** Phone number from device (digits only to match server normalization) */
  phoneNumber: string;
  /** Chatus user ID if the contact has a Chatus account */
  chatusUserId?: string;
  /** Chatus @handle if available */
  chatusHandle?: string;
  /** Chatus avatar URL if available */
  chatusAvatarUrl?: string;
  /** Whether this contact has a Chatus account */
  hasChatus: boolean;
};

type ContactsState = {
  phoneBookContacts: PhoneBookContact[];
  permissionStatus: Contacts.PermissionStatus | 'undetermined';
  isSyncing: boolean;
  lastSyncedAt: number | null;
};

type ContactsActions = {
  requestPermission: () => Promise<boolean>;
  checkPermission: () => Promise<void>;
  syncContacts: () => Promise<void>;
  clearContacts: () => void;
};

const CONTACTS_CACHE_KEY = 'contacts.phoneBook.v1';

/** Canonical phone normalization (digits-only) to match server side search/storage. */
function normalizePhoneNumber(phone: string): string {
  return phone.replace(/\D/g, '');
}

export const contactsStore = create<ContactsState & ContactsActions>((set, get) => ({
  phoneBookContacts: [],
  permissionStatus: 'undetermined',
  isSyncing: false,
  lastSyncedAt: null,

  requestPermission: async () => {
    try {
      const { status } = await Contacts.requestPermissionsAsync();
      set({ permissionStatus: status });
      if (status === 'granted') {
        // Auto-sync after permission granted
        void get().syncContacts();
      }
      return status === 'granted';
    } catch {
      return false;
    }
  },

  checkPermission: async () => {
    try {
      const { status } = await Contacts.getPermissionsAsync();
      set({ permissionStatus: status });
    } catch {
      // ignore
    }
  },

  syncContacts: async () => {
    const state = get();
    if (state.isSyncing) return;
    if (state.permissionStatus !== 'granted') return;

    set({ isSyncing: true });
    try {
      const { data } = await Contacts.getContactsAsync({
        fields: [Contacts.Fields.PhoneNumbers, Contacts.Fields.Name],
        sort: Contacts.SortTypes.LastName,
      });

      // Extract contacts with phone numbers
      const phoneContacts: PhoneBookContact[] = [];
      const seenPhones = new Set<string>();

      for (const contact of data) {
        if (!contact.phoneNumbers || contact.phoneNumbers.length === 0) continue;
        const name = contact.name || [contact.firstName, contact.lastName].filter(Boolean).join(' ');
        if (!name) continue;

        for (const phone of contact.phoneNumbers) {
          if (!phone.number) continue;
          const normalized = normalizePhoneNumber(phone.number);
          if (!normalized || normalized.length < 6 || seenPhones.has(normalized)) continue;
          seenPhones.add(normalized);

          phoneContacts.push({
            deviceName: name,
            phoneNumber: normalized,
            hasChatus: false,
          });
        }
      }

      // 1. Fetch server address book to see what's already uploaded
      let serverContacts = [];
      try {
        serverContacts = await listAddressBookContacts();
      } catch (err) {
        console.warn('[Contacts sync] Failed to fetch address book from server', err);
      }

      const serverContactsByPhone = new Map(serverContacts.map(c => [c.phone, c]));

      // 2. Identify device contacts that are missing on the server
      const toUpload = phoneContacts.filter(c => !serverContactsByPhone.has(c.phoneNumber));

      // 3. Upload new contacts in small parallel batches to prevent rate limits
      const maxUploadsPerSync = 50;
      const contactsToUpload = toUpload.slice(0, maxUploadsPerSync);
      const batchSize = 5;

      for (let i = 0; i < contactsToUpload.length; i += batchSize) {
        const batch = contactsToUpload.slice(i, i + batchSize);
        const results = await Promise.all(
          batch.map(async (c) => {
            try {
              return await createAddressBookContact({
                phone: c.phoneNumber,
                first_name: c.deviceName,
              });
            } catch (err) {
              console.warn(`[Contacts sync] Failed to upload contact ${c.phoneNumber}`, err);
              return null;
            }
          })
        );
        results.forEach(res => {
          if (res) serverContactsByPhone.set(res.phone, res);
        });
      }

      // 4. Load cache for existing profile info
      let cachedContactsByPhone = new Map<string, PhoneBookContact>();
      try {
        const cached = await SecureStore.getItemAsync(CONTACTS_CACHE_KEY);
        if (cached) {
          const cachedList = JSON.parse(cached) as PhoneBookContact[];
          cachedContactsByPhone = new Map(cachedList.map(c => [c.phoneNumber, c]));
        }
      } catch {
        // ignore cache errors
      }

      // 5. Connect user profile information for all linked contacts
      for (const contact of phoneContacts) {
        const serverContact = serverContactsByPhone.get(contact.phoneNumber);
        if (serverContact && serverContact.linked_user_id) {
          contact.hasChatus = true;
          contact.chatusUserId = serverContact.linked_user_id;

          const cachedContact = cachedContactsByPhone.get(contact.phoneNumber);
          if (
            cachedContact?.hasChatus &&
            cachedContact.chatusUserId === serverContact.linked_user_id &&
            cachedContact.chatusHandle
          ) {
            contact.chatusHandle = cachedContact.chatusHandle;
            contact.chatusAvatarUrl = cachedContact.chatusAvatarUrl;
          } else {
            // Retrieve profile detail from server
            try {
              const profile = await getUserProfile(serverContact.linked_user_id);
              contact.chatusHandle = profile.handle ?? undefined;
              contact.chatusAvatarUrl = profile.avatar_url ?? undefined;
            } catch (err) {
              console.warn(`[Contacts sync] Failed to fetch profile for user ${serverContact.linked_user_id}`, err);
            }
          }
        }
      }

      set({
        phoneBookContacts: phoneContacts,
        lastSyncedAt: Date.now(),
      });

      // Cache results
      const chatusContacts = phoneContacts.filter(c => c.hasChatus);
      if (chatusContacts.length > 0) {
        void SecureStore.setItemAsync(
          CONTACTS_CACHE_KEY,
          JSON.stringify(chatusContacts)
        ).catch(() => {});
      }
    } catch (error) {
      console.warn('[Contacts sync] Sync failed', error);
    } finally {
      set({ isSyncing: false });
    }
  },

  clearContacts: () => {
    set({
      phoneBookContacts: [],
      lastSyncedAt: null,
    });
    void SecureStore.deleteItemAsync(CONTACTS_CACHE_KEY).catch(() => {});
  },
}));
