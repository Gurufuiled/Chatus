import * as Contacts from 'expo-contacts';
import { tdlibClient } from './tdlib/TdlibClient';

type TdlibContact = {
  '@type': 'contact';
  phone_number: string;
  first_name: string;
  last_name: string;
};

/** Чанк импорта: большой `importContacts` целиком провоцирует шторм updateChat*-апдейтов → лаги UI. */
const IMPORT_CHUNK_SIZE = 200;
/** Пауза между чанками — освобождаем мост/JS-поток между батчами. */
const IMPORT_CHUNK_DELAY_MS = 800;
/**
 * Отложенный старт: сразу после авторизации идёт загрузка списка диалогов и регистрация push.
 * Не конкурируем с ними за нативный мост TDLib в первые секунды.
 */
const IMPORT_START_DELAY_MS = 4000;

function delay(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

function collectUniqueContacts(data: Contacts.Contact[]): TdlibContact[] {
  const byPhone = new Map<string, TdlibContact>();
  for (const contact of data) {
    if (!contact.phoneNumbers?.length) continue;
    for (const phone of contact.phoneNumbers) {
      const num = phone.number?.replace(/[^\d+]/g, '') || '';
      if (num.length < 7 || byPhone.has(num)) continue;
      byPhone.set(num, {
        '@type': 'contact',
        phone_number: num,
        first_name: contact.firstName || contact.name || 'Unknown',
        last_name: contact.lastName || '',
      });
    }
  }
  return [...byPhone.values()];
}

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

    const contactsToImport = collectUniqueContacts(data);
    if (contactsToImport.length === 0) return;

    // Даём первичной загрузке диалогов/push отработать, затем импортируем чанками.
    await delay(IMPORT_START_DELAY_MS);

    for (let i = 0; i < contactsToImport.length; i += IMPORT_CHUNK_SIZE) {
      const chunk = contactsToImport.slice(i, i + IMPORT_CHUNK_SIZE);
      try {
        await tdlibClient.send({ '@type': 'importContacts', contacts: chunk });
      } catch (chunkErr) {
        console.warn('[ContactSyncService] importContacts chunk failed:', chunkErr);
      }
      if (i + IMPORT_CHUNK_SIZE < contactsToImport.length) {
        await delay(IMPORT_CHUNK_DELAY_MS);
      }
    }
    console.log(`[ContactSyncService] Imported ${contactsToImport.length} contacts to TDLib.`);
  } catch (error) {
    console.error('[ContactSyncService] Sync failed:', error);
  }
}
