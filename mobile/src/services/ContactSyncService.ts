import * as Contacts from 'expo-contacts';
import { tdlibClient } from './tdlib/TdlibClient';

export async function requestContactsAndSync(): Promise<void> {
  try {
    const { status } = await Contacts.requestPermissionsAsync();

    if (status !== 'granted') {
      console.log('[ContactSyncService] Contact permissions denied.');
      return;
    }

    const { data } = await Contacts.getContactsAsync({
      fields: [Contacts.Fields.PhoneNumbers],
    });

    if (data.length > 0) {
      // Collect valid phone numbers
      const contactsToImport = [];
      for (const contact of data) {
        if (contact.phoneNumbers && contact.phoneNumbers.length > 0) {
          for (const phone of contact.phoneNumbers) {
            // Keep digits and leading plus sign
            let num = phone.number?.replace(/[^\d+]/g, '') || '';
            if (num.length >= 7) {
              contactsToImport.push({
                '@type': 'contact',
                phone_number: num,
                first_name: contact.firstName || contact.name || 'Unknown',
                last_name: contact.lastName || '',
              });
            }
          }
        }
      }

      if (contactsToImport.length > 0) {
        // Feed numbers to TDLib so it resolves `chat_id` / `user_id` automatically
        // using searchUserByPhoneNumber / importContacts logic under the hood via standard API
        await tdlibClient.send({
          '@type': 'importContacts',
          contacts: contactsToImport
        });
        console.log(`[ContactSyncService] Imported ${contactsToImport.length} contacts to TDLib.`);
      }
    }
  } catch (error) {
    console.error('[ContactSyncService] Sync failed:', error);
  }
}
