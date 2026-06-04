/** Нормализация номера для TDLib (`searchUserByPhoneNumber` ожидает международный формат). */
export function normalizePhoneForTdlib(phone: string): string {
  const trimmed = phone.trim();
  if (!trimmed) return '';
  const digits = trimmed.replace(/\D/g, '');
  if (!digits) return '';
  if (trimmed.startsWith('+')) {
    return `+${digits}`;
  }
  if (digits.length === 11 && digits.startsWith('8')) {
    return `+7${digits.slice(1)}`;
  }
  if (digits.length === 11 && digits.startsWith('7')) {
    return `+${digits}`;
  }
  if (digits.length === 10) {
    return `+7${digits}`;
  }
  return `+${digits}`;
}
