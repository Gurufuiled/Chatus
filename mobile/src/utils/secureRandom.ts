import * as crypto from 'expo-crypto';

/**
 * Returns a secure random hexadecimal string of the specified length.
 *
 * @param length The length of the resulting hex string. Must be an even number,
 * because each byte is represented by 2 hex characters.
 */
export function getSecureRandomString(length: number): string {
  // getRandomBytes takes the number of bytes.
  // Each byte will be 2 hex characters, so we need length / 2 bytes.
  const numBytes = Math.ceil(length / 2);
  const bytes = crypto.getRandomBytes(numBytes);

  // Convert bytes to hex string
  let hexStr = '';
  for (let i = 0; i < bytes.length; i++) {
    hexStr += bytes[i].toString(16).padStart(2, '0');
  }

  return hexStr.slice(0, length);
}
